import { bm25Search } from '@/lib/bm25-search';
import { ensureWorkspace } from '@/lib/workspace';
import { auth, currentUser } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

// Temporary dev-only endpoint to smoke-test lexical (ts_rank) search (M2 task 3).
// Requires a session so it scopes to the caller's real workspace. Returns
// snippet + page + ts_rank score per hit. Removed later in M2 once /api/search
// exists. No embedding/model call here — lexical search hits Postgres only.
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
  const limit = Number(url.searchParams.get('k') ?? '5');

  try {
    const user = await currentUser();
    const email = user?.primaryEmailAddress?.emailAddress ?? '';
    const workspaceId = await ensureWorkspace(userId, email);

    const hits = await bm25Search(query, workspaceId, limit);

    return NextResponse.json({
      ok: true,
      count: hits.length,
      hits: hits.map((hit) => ({
        chunkId: hit.chunkId,
        page: hit.page,
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
