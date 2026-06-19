import { retrieveChatContext } from '@/lib/chat-retrieve';
import { ensureWorkspace } from '@/lib/workspace';
import { auth, currentUser } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

// Temporary M3 dev route — removed in the M3 cleanup chore. Verifies the chat
// retrieve + refusal decision against real data: a real question returns relevant
// chunks (shouldRefuse=false); gibberish returns shouldRefuse=true. Uses Clerk
// auth so it scopes to the caller's workspace (tenant isolation, same as the real
// POST /api/chat in task 4).
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const query = new URL(request.url).searchParams.get('q');
  if (!query) {
    return NextResponse.json({ error: 'missing q param' }, { status: 400 });
  }

  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? '';
  const workspaceId = await ensureWorkspace(userId, email);

  const { hits, contextChunks, shouldRefuse, topRelevance, costUsd } = await retrieveChatContext(
    query,
    workspaceId,
  );

  return NextResponse.json({
    query,
    shouldRefuse,
    topRelevance,
    count: contextChunks.length,
    costUsd,
    chunks: hits.map((hit, i) => ({
      label: i + 1,
      page: hit.page,
      rerankRelevance: hit.rerankRelevance,
      preview: hit.content.slice(0, 120),
    })),
  });
}
