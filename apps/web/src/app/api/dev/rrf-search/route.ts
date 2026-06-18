import { bm25Search } from '@/lib/bm25-search';
import { cosineSearch } from '@/lib/cosine-search';
import { embedQuery } from '@/lib/embeddings';
import { ensureWorkspace } from '@/lib/workspace';
import { auth, currentUser } from '@clerk/nextjs/server';
import { reciprocalRankFusion } from '@doc-ai-chat/db/rrf';
import { NextResponse } from 'next/server';

// Temporary dev-only endpoint to smoke-test RRF (M2 task 4). Runs cosine + bm25
// (top-30 each), fuses by rank, and shows the combined order with each method's
// rank + raw score side by side — so the rank-vs-score point is visible on real
// data. Removed later in M2 once /api/search exists.
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
  const k = Number(url.searchParams.get('k') ?? '60');
  const limit = Number(url.searchParams.get('limit') ?? '10');

  try {
    const user = await currentUser();
    const email = user?.primaryEmailAddress?.emailAddress ?? '';
    const workspaceId = await ensureWorkspace(userId, email);

    const { embedding, costUsd } = await embedQuery(query, { workspaceId });
    const [cosineHits, bm25Hits] = await Promise.all([
      cosineSearch(embedding, workspaceId, 30),
      bm25Search(query, workspaceId, 30),
    ]);

    // Index by chunkId so we can attach each method's raw score + snippet back
    // onto the fused result.
    const cosineById = new Map(cosineHits.map((h) => [h.chunkId, h]));
    const bm25ById = new Map(bm25Hits.map((h) => [h.chunkId, h]));

    const fused = reciprocalRankFusion(
      [cosineHits.map((h) => h.chunkId), bm25Hits.map((h) => h.chunkId)],
      { k, limit },
    );

    return NextResponse.json({
      ok: true,
      embedCostUsd: costUsd,
      cosineCount: cosineHits.length,
      bm25Count: bm25Hits.length,
      fusedCount: fused.length,
      hits: fused.map((hit) => {
        const source = cosineById.get(hit.chunkId) ?? bm25ById.get(hit.chunkId);
        return {
          chunkId: hit.chunkId,
          rrfScore: hit.rrfScore,
          cosineRank: hit.ranks[0],
          bm25Rank: hit.ranks[1],
          cosineSimilarity: cosineById.get(hit.chunkId)?.cosineSimilarity ?? null,
          bm25Score: bm25ById.get(hit.chunkId)?.bm25Score ?? null,
          page: source?.page ?? null,
          snippet: source?.content.slice(0, 160) ?? '',
        };
      }),
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 503 },
    );
  }
}
