import { db } from '@doc-ai-chat/db/client';
import { sql } from 'drizzle-orm';

export type Bm25Hit = {
  chunkId: string;
  documentId: string;
  chunkIndex: number;
  content: string;
  page: number | null;
  bm25Score: number;
};

type Bm25Row = {
  id: string;
  document_id: string;
  chunk_index: number;
  content: string;
  page: number | null;
  bm25_score: number;
};

// Top-k chunks by lexical relevance, scoped to one workspace (tenant isolation,
// SECURITY.md #4). Matches the generated `tsv` column (to_tsvector('simple', ...))
// against the query via the GIN index, ranked by ts_rank. This approximates BM25
// — vanilla Postgres has no true BM25 (that needs ParadeDB/pg_search); ts_rank is
// honest about being a lexical-overlap score, not Okapi BM25. The 'simple' config
// matches the generated column: no stemming, no stopwords (works for en + es).
export async function bm25Search(
  query: string,
  workspaceId: string,
  limit: number,
): Promise<Bm25Hit[]> {
  const result = await db.execute<Bm25Row>(sql`
    select
      id,
      document_id,
      chunk_index,
      content,
      page,
      ts_rank(tsv, websearch_to_tsquery('simple', ${query})) as bm25_score
    from docai.chunks
    where workspace_id = ${workspaceId}
      and tsv @@ websearch_to_tsquery('simple', ${query})
    order by bm25_score desc
    limit ${limit}
  `);

  return result.rows.map((row) => ({
    chunkId: row.id,
    documentId: row.document_id,
    chunkIndex: row.chunk_index,
    content: row.content,
    page: row.page,
    bm25Score: Number(row.bm25_score),
  }));
}
