import { neutralizeControlTags } from '@doc-ai-chat/prompts/rag-answer';
import { tool } from 'ai';
import { z } from 'zod';
import { getPassageAround } from './chunk-passage';
import { getDocumentFilenames } from './documents';
import { hybridRetrieve } from './hybrid-retrieve';

// M6 agent loop tools. Deliberately kept to two general-purpose tools instead of
// one per task (e.g. a dedicated "compare_documents" tool) — "compare these two
// PDFs" or "find contradictions" is the reasoner orchestrating multiple
// search_chunks/get_full_passage calls across documents, not a third tool. See
// ADR-019.
//
// `workspaceId` is captured in this closure, never taken as a tool input — the
// model cannot ask for another workspace's data (tenant isolation carries over
// from M2/M3 unchanged). Snippets/passages are defanged with the same
// `neutralizeControlTags` used for <retrieved_context> in M3: chunk content is
// untrusted PDF text whether it arrives via direct retrieval or via a tool
// result, so it gets the same prompt-injection guard either way.

export type AgentToolContext = {
  workspaceId: string;
  isPrivileged?: boolean;
};

// Cap the snippet AI SDK sends back to the model per hit — full passages are
// available via get_full_passage, so search results stay scannable and cheap.
const SNIPPET_CHARS = 800;

export function createAgentTools({ workspaceId, isPrivileged }: AgentToolContext) {
  const search_chunks = tool({
    description:
      "Search this workspace's ready documents for passages relevant to a query. Returns up to 5 ranked passages, each with documentId, documentLabel (filename, for citing), chunkIndex, page, a relevance score, and a snippet. Call it once per distinct question — e.g. once per document when comparing two PDFs, or once per topic when looking for contradictions across documents.",
    inputSchema: z.object({
      query: z.string().min(1).max(500).describe('A focused natural-language search query.'),
    }),
    execute: async ({ query }) => {
      const { hits } = await hybridRetrieve(query, workspaceId, { isPrivileged });
      // Filenames aren't in HybridHit (M2 stays document-metadata-free) — a small
      // lookup here gives the model (and the transcript UI) something citable
      // instead of a bare document UUID.
      const filenames = await getDocumentFilenames(
        Array.from(new Set(hits.map((hit) => hit.documentId))),
        workspaceId,
      );
      return hits.map((hit) => ({
        chunkId: hit.chunkId,
        documentId: hit.documentId,
        documentLabel: filenames.get(hit.documentId) ?? hit.documentId,
        chunkIndex: hit.chunkIndex,
        page: hit.page,
        relevance: hit.rerankRelevance,
        snippet: neutralizeControlTags(hit.content.slice(0, SNIPPET_CHARS)),
      }));
    },
  });

  const get_full_passage = tool({
    description:
      "Fetch a document's chunks surrounding a specific chunk index, when a search_chunks snippet was cut off and more context is needed to answer accurately. Returns up to (2*radius+1) chunks in original order, each with its full content.",
    inputSchema: z.object({
      documentId: z.string().uuid().describe('The documentId from a search_chunks result.'),
      chunkIndex: z.number().int().min(0).describe('The chunkIndex from a search_chunks result.'),
      radius: z
        .number()
        .int()
        .min(1)
        .max(5)
        .optional()
        .describe('How many neighboring chunks to include on each side. Default 2.'),
    }),
    execute: async ({ documentId, chunkIndex, radius }) => {
      const passage = await getPassageAround(documentId, workspaceId, chunkIndex, radius ?? 2);
      return passage.map((chunk) => ({
        chunkId: chunk.chunkId,
        chunkIndex: chunk.chunkIndex,
        page: chunk.page,
        content: neutralizeControlTags(chunk.content),
      }));
    },
  });

  return { search_chunks, get_full_passage };
}
