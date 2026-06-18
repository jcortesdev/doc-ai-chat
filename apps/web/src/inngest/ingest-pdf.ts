import { embed } from '@/lib/embeddings';
import { getObjectBytes } from '@/lib/r2';
import { chunkText } from '@doc-ai-chat/db/chunker';
import { db } from '@doc-ai-chat/db/client';
import { chunks as chunksTable, documents } from '@doc-ai-chat/db/schema';
import { eq } from 'drizzle-orm';
import { extractText, getDocumentProxy } from 'unpdf';
import { inngest } from './client';

type PdfUploadedData = {
  documentId: string;
  r2Key: string;
  workspaceId: string;
  uploaderId: string;
  startedAt: number;
  maxPages: number;
};

export const ingestPdf = inngest.createFunction(
  {
    id: 'ingest-pdf',
    retries: 3,
    triggers: [{ event: 'pdf.uploaded' }],
    // On terminal failure (retries exhausted), mark the document failed so the
    // status page can surface it. Task 11 adds the specific error variant.
    onFailure: async ({ event }) => {
      const original = (event.data as { event?: { data?: PdfUploadedData } }).event?.data;
      if (original?.documentId) {
        await db
          .update(documents)
          .set({ status: 'failed', updatedAt: new Date() })
          .where(eq(documents.id, original.documentId));
      }
    },
  },
  async ({ event, step }) => {
    const { documentId, r2Key, workspaceId, startedAt, maxPages } = event.data as PdfUploadedData;

    // 1. Fetch the PDF from R2, verify it's really a PDF, and extract text.
    const parsed = await step.run('fetch-and-parse', async () => {
      const bytes = await getObjectBytes(r2Key);
      // Magic bytes: a real PDF starts with `%PDF`. Don't trust the client's
      // extension or MIME type (SECURITY.md #9).
      const header = new TextDecoder().decode(bytes.slice(0, 5));
      if (!header.startsWith('%PDF')) {
        return { ok: false as const };
      }
      const pdf = await getDocumentProxy(bytes);
      const { totalPages, text } = await extractText(pdf, { mergePages: false });
      return {
        ok: true as const,
        pageCount: totalPages,
        pages: Array.isArray(text) ? text : [text],
      };
    });

    // Reject non-PDFs (extension/MIME spoofing) without retrying.
    if (!parsed.ok) {
      await step.run('reject-not-pdf', async () => {
        await db
          .update(documents)
          .set({ status: 'failed', errorVariant: 'pdf_unparseable', updatedAt: new Date() })
          .where(eq(documents.id, documentId));
      });
      return { rejected: 'not_pdf' };
    }

    // Enforce the per-tier page-count limit before spending any embedding cost.
    if (parsed.pageCount > maxPages) {
      await step.run('reject-too-many-pages', async () => {
        await db
          .update(documents)
          .set({
            status: 'failed',
            errorVariant: 'file_too_large',
            pageCount: parsed.pageCount,
            updatedAt: new Date(),
          })
          .where(eq(documents.id, documentId));
      });
      return { rejected: 'too_many_pages', pageCount: parsed.pageCount, maxPages };
    }

    // 2. Chunk each page so every chunk keeps its source page number.
    const chunked = await step.run('chunk', () => {
      const result: Array<{ content: string; page: number; chunkIndex: number }> = [];
      let index = 0;
      parsed.pages.forEach((pageText, pageIndex) => {
        for (const content of chunkText(pageText)) {
          result.push({ content, page: pageIndex + 1, chunkIndex: index });
          index += 1;
        }
      });
      return result;
    });

    // 3. Embed + store. Vectors stay inside the step (never serialized between
    //    steps); only a summary is returned.
    const summary = await step.run('embed-and-store', async () => {
      if (chunked.length === 0) {
        throw new Error('No extractable text — the PDF may be scanned or image-only.');
      }

      const { embeddings, totalTokens, costUsd } = await embed(
        chunked.map((chunk) => chunk.content),
        { workspaceId, documentId },
      );

      await db.insert(chunksTable).values(
        chunked.map((chunk, i) => ({
          documentId,
          workspaceId,
          chunkIndex: chunk.chunkIndex,
          content: chunk.content,
          page: chunk.page,
          tokenCount: Math.ceil(chunk.content.length / 4),
          embedding: embeddings[i] ?? null,
        })),
      );

      const latencyMs = Date.now() - startedAt;
      await db
        .update(documents)
        .set({
          status: 'ready',
          chunkCount: chunked.length,
          totalTokens,
          costUsd: costUsd.toFixed(6),
          pageCount: parsed.pageCount,
          latencyMs,
          updatedAt: new Date(),
        })
        .where(eq(documents.id, documentId));

      return {
        chunkCount: chunked.length,
        pageCount: parsed.pageCount,
        totalTokens,
        costUsd,
        latencyMs,
      };
    });

    return summary;
  },
);
