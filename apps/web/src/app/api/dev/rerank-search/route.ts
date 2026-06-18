import { bm25Search } from '@/lib/bm25-search';
import { cosineSearch } from '@/lib/cosine-search';
import { embedQuery } from '@/lib/embeddings';
import { rerank } from '@/lib/rerank';
import { ensureWorkspace } from '@/lib/workspace';
import { auth, currentUser } from '@clerk/nextjs/server';
import { reciprocalRankFusion } from '@doc-ai-chat/db/rrf';
import { NextResponse } from 'next/server';

// Temporary dev-only endpoint to smoke-test Cohere rerank (M2 task 5) inside the
// full pipeline: embed -> cosine + bm25 -> rrf top-30 -> rerank top-5. Shows all
// four scores side by side. Removed later in M2 once /api/search exists.
export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json(
      { ok: false, error: 'unauthorized', hint: 'sign in — search is scoped to your workspace' },
      { status: 401 },
    );
  }

  const url = new URL(request.url);
  const query = url.searchParams.get('q');
  if (!query) {
    return NextResponse.json(
      { ok: false, error: 'missing_query', hint: 'pass ?q=...' },
      { status: 400 },
    );
  }
  const topN = Number(url.searchParams.get('topN') ?? '5');

  try {
    const user = await currentUser();
    const email = user?.primaryEmailAddress?.emailAddress ?? '';
    const workspaceId = await ensureWorkspace(userId, email);

    const { embedding, costUsd: embedCostUsd } = await embedQuery(query, { workspaceId });
    const [cosineHits, bm25Hits] = await Promise.all([
      cosineSearch(embedding, workspaceId, 30),
      bm25Search(query, workspaceId, 30),
    ]);

    const cosineById = new Map(cosineHits.map((h) => [h.chunkId, h]));
    const bm25ById = new Map(bm25Hits.map((h) => [h.chunkId, h]));

    const fused = reciprocalRankFusion(
      [cosineHits.map((h) => h.chunkId), bm25Hits.map((h) => h.chunkId)],
      { limit: 30 },
    );

    // Build the rerank candidate list (fused order) carrying the content + scores.
    const candidates = fused.flatMap((hit) => {
      const source = cosineById.get(hit.chunkId) ?? bm25ById.get(hit.chunkId);
      if (!source) {
        return [];
      }
      return [{ chunkId: hit.chunkId, rrfScore: hit.rrfScore, source }];
    });

    const {
      results,
      searchUnits,
      costUsd: rerankCostUsd,
    } = await rerank(
      query,
      candidates.map((c) => c.source.content),
      topN,
      { workspaceId },
    );

    const hits = results.flatMap((item) => {
      const candidate = candidates[item.index];
      if (!candidate) {
        return [];
      }
      return [
        {
          chunkId: candidate.chunkId,
          rerankRelevance: item.relevanceScore,
          rrfScore: candidate.rrfScore,
          cosineSimilarity: cosineById.get(candidate.chunkId)?.cosineSimilarity ?? null,
          bm25Score: bm25ById.get(candidate.chunkId)?.bm25Score ?? null,
          page: candidate.source.page,
          snippet: candidate.source.content.slice(0, 160),
        },
      ];
    });

    return NextResponse.json({
      ok: true,
      embedCostUsd,
      rerankCostUsd,
      rerankSearchUnits: searchUnits,
      candidateCount: candidates.length,
      hits,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 503 },
    );
  }
}
