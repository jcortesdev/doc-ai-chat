import { hybridRetrieve } from '@/lib/hybrid-retrieve';
import { ensureWorkspace } from '@/lib/workspace';
import { auth, currentUser } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

// Temporary dev-only endpoint to smoke-test the hybrid retrieve orchestrator
// (M2 task 6). The whole funnel now lives in one reusable function; this route
// is just auth + workspace scoping around it. Removed later in M2 once
// /api/search exists.
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

    const { hits, embedCostUsd, rerankCostUsd, costUsd } = await hybridRetrieve(
      query,
      workspaceId,
      {
        topN,
      },
    );

    return NextResponse.json({
      ok: true,
      embedCostUsd,
      rerankCostUsd,
      costUsd,
      count: hits.length,
      hits: hits.map((hit) => ({
        chunkId: hit.chunkId,
        page: hit.page,
        rerankRelevance: hit.rerankRelevance,
        rrfScore: hit.rrfScore,
        cosineSimilarity: hit.cosineSimilarity,
        bm25Score: hit.bm25Score,
        snippet: hit.content.slice(0, 160),
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 503 },
    );
  }
}
