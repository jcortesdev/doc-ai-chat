import { db } from '@doc-ai-chat/db/client';
import { chunks } from '@doc-ai-chat/db/schema';
import { and, asc, eq, gte, lte } from 'drizzle-orm';

export type PassageChunk = {
  chunkId: string;
  chunkIndex: number;
  content: string;
  page: number | null;
};

// Fetches the chunks surrounding `chunkIndex` in one document, scoped to the
// caller's workspace (tenant isolation, SECURITY.md #4) — used by the agent
// loop's get_full_passage tool (M6) when a search_chunks snippet was cut off
// and the model needs more context than a single ~1000-char chunk carries. A
// documentId from another workspace simply returns zero rows (the workspaceId
// filter is on the same denormalized column M2's search already relies on).
export async function getPassageAround(
  documentId: string,
  workspaceId: string,
  chunkIndex: number,
  radius: number,
): Promise<PassageChunk[]> {
  const rows = await db
    .select({
      chunkId: chunks.id,
      chunkIndex: chunks.chunkIndex,
      content: chunks.content,
      page: chunks.page,
    })
    .from(chunks)
    .where(
      and(
        eq(chunks.documentId, documentId),
        eq(chunks.workspaceId, workspaceId),
        gte(chunks.chunkIndex, chunkIndex - radius),
        lte(chunks.chunkIndex, chunkIndex + radius),
      ),
    )
    .orderBy(asc(chunks.chunkIndex));
  return rows;
}
