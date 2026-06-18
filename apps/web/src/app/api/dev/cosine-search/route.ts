import { cosineSearch } from '@/lib/cosine-search';
import { embedQuery } from '@/lib/embeddings';
import { ensureWorkspace } from '@/lib/workspace';
import { auth, currentUser } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

// Temporary dev-only endpoint to smoke-test cosine vector search (M2 task 2).
// Requires a session so it scopes to the caller's real workspace (where their
// ingested chunks live). Returns snippet + page + cosine score per hit. Removed
// later in M2 once /api/search exists.
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

    const { embedding, costUsd } = await embedQuery(query, { workspaceId });
    const hits = await cosineSearch(embedding, workspaceId, limit);

    return NextResponse.json({
      ok: true,
      embedCostUsd: costUsd,
      count: hits.length,
      hits: hits.map((hit) => ({
        chunkId: hit.chunkId,
        page: hit.page,
        cosineSimilarity: hit.cosineSimilarity,
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
