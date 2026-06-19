import { db } from '@doc-ai-chat/db/client';
import { toVectorLiteral } from '@doc-ai-chat/db/vector-literal';
import { sql } from 'drizzle-orm';

export type CosineHit = {
  chunkId: string;
  documentId: string;
  chunkIndex: number;
  content: string;
  page: number | null;
  cosineSimilarity: number;
};

type CosineRow = {
  id: string;
  document_id: string;
  chunk_index: number;
  content: string;
  page: number | null;
  cosine_similarity: number;
};

// Top-k chunks by cosine similarity, scoped to one workspace (tenant isolation,
// SECURITY.md #4). The `<=>` operator is pgvector cosine distance, backed by the
// HNSW index (vector_cosine_ops); similarity = 1 - distance. The workspaceId is
// the caller's (from the JWT), never user-supplied.
export async function cosineSearch(
  embedding: number[],
  workspaceId: string,
  limit: number,
): Promise<CosineHit[]> {
  const vec = toVectorLiteral(embedding);
  const result = await db.execute<CosineRow>(sql`
    select
      id,
      document_id,
      chunk_index,
      content,
      page,
      1 - (embedding <=> ${vec}::vector) as cosine_similarity
    from docai.chunks
    where workspace_id = ${workspaceId} and embedding is not null
    order by embedding <=> ${vec}::vector
    limit ${limit}
  `);

  return result.rows.map((row) => ({
    chunkId: row.id,
    documentId: row.document_id,
    chunkIndex: row.chunk_index,
    content: row.content,
    page: row.page,
    cosineSimilarity: Number(row.cosine_similarity),
  }));
}
