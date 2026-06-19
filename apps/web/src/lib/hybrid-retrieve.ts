import { reciprocalRankFusion } from '@doc-ai-chat/db/rrf';
import { bm25Search } from './bm25-search';
import { cosineSearch } from './cosine-search';
import { embedQuery } from './embeddings';
import { rerank } from './rerank';

export type HybridHit = {
  chunkId: string;
  documentId: string;
  chunkIndex: number;
  content: string;
  page: number | null;
  // Per-method scores, kept for transparency in the UI (M2 recruiter signal).
  // cosine/bm25 are null when a hit reached the final set via the other method.
  cosineSimilarity: number | null;
  bm25Score: number | null;
  rrfScore: number;
  rerankRelevance: number;
};

export type HybridRetrieveResult = {
  hits: HybridHit[];
  embedCostUsd: number;
  rerankCostUsd: number;
  costUsd: number;
};

export type HybridRetrieveOptions = {
  // Per-method candidate depth for cosine and bm25 (each). Default 30.
  perMethodK?: number;
  // RRF damping constant. Default 60.
  rrfK?: number;
  // Final reranked result count. Default 5.
  topN?: number;
  isPrivileged?: boolean;
};

// The M2 retrieval funnel (ADR-002): embed the query, run cosine + bm25 in
// parallel, fuse their rankings with RRF (top-30), then rerank those candidates
// with Cohere down to the final top-N. Recall (cheap, index-backed) narrows the
// corpus; precision (the expensive cross-encoder) decides the order. Scoped to
// one workspace throughout — `workspaceId` is the caller's, from the JWT.
export async function hybridRetrieve(
  query: string,
  workspaceId: string,
  options: HybridRetrieveOptions = {},
): Promise<HybridRetrieveResult> {
  const perMethodK = options.perMethodK ?? 30;
  const rrfK = options.rrfK ?? 60;
  const topN = options.topN ?? 5;
  const context = { workspaceId, isPrivileged: options.isPrivileged };

  const { embedding, costUsd: embedCostUsd } = await embedQuery(query, context);
  const [cosineHits, bm25Hits] = await Promise.all([
    cosineSearch(embedding, workspaceId, perMethodK),
    bm25Search(query, workspaceId, perMethodK),
  ]);

  const cosineById = new Map(cosineHits.map((hit) => [hit.chunkId, hit]));
  const bm25ById = new Map(bm25Hits.map((hit) => [hit.chunkId, hit]));

  const fused = reciprocalRankFusion(
    [cosineHits.map((hit) => hit.chunkId), bm25Hits.map((hit) => hit.chunkId)],
    { k: rrfK, limit: perMethodK },
  );

  // Candidates in fused order, carrying content + the originating hit's data.
  const candidates = fused.flatMap((fusedHit) => {
    const source = cosineById.get(fusedHit.chunkId) ?? bm25ById.get(fusedHit.chunkId);
    if (!source) {
      return [];
    }
    return [{ fusedHit, source }];
  });

  if (candidates.length === 0) {
    return { hits: [], embedCostUsd, rerankCostUsd: 0, costUsd: embedCostUsd };
  }

  const { results, costUsd: rerankCostUsd } = await rerank(
    query,
    candidates.map((candidate) => candidate.source.content),
    topN,
    context,
  );

  const hits = results.flatMap((item) => {
    const candidate = candidates[item.index];
    if (!candidate) {
      return [];
    }
    const { fusedHit, source } = candidate;
    return [
      {
        chunkId: source.chunkId,
        documentId: source.documentId,
        chunkIndex: source.chunkIndex,
        content: source.content,
        page: source.page,
        cosineSimilarity: cosineById.get(source.chunkId)?.cosineSimilarity ?? null,
        bm25Score: bm25ById.get(source.chunkId)?.bm25Score ?? null,
        rrfScore: fusedHit.rrfScore,
        rerankRelevance: item.relevanceScore,
      },
    ];
  });

  return { hits, embedCostUsd, rerankCostUsd, costUsd: embedCostUsd + rerankCostUsd };
}
