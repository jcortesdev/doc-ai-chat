import { checkProjectBudget } from '@/lib/budget';
import { isValidAnthropicKey } from '@/lib/byok';
import { hybridRetrieve } from '@/lib/hybrid-retrieve';
import { isTrialExpired, resolveTier } from '@/lib/tiers';
import { ensureWorkspace } from '@/lib/workspace';
import { auth, currentUser } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

// workspaceId is NEVER taken from the body — it's derived from the caller's JWT
// below (tenant isolation, SECURITY.md #4). The client only chooses the query.
const searchSchema = z.object({
  query: z.string().min(1).max(500),
  topN: z.number().int().min(1).max(20).optional(),
});

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = searchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }

  try {
    const user = await currentUser();
    const email = user?.primaryEmailAddress?.emailAddress ?? '';
    // Tenant isolation: scope retrieval to the caller's own workspace.
    const { id: workspaceId, userCreatedAt } = await ensureWorkspace(userId, email);

    // BYOK users keep going past the free trial (consistent with chat/upload).
    // Voyage + Cohere are project-paid even on BYOK, so the budget gate still
    // applies. Header only, never the body; a malformed value is ignored.
    const headerKey = request.headers.get('x-user-api-key')?.trim();
    const isByok = Boolean(headerKey && isValidAnthropicKey(headerKey));

    // Free-tier gates the whole free tier, not just chat. Owners bypass (ADR-010).
    if (resolveTier(email) !== 'privileged') {
      if (!isByok && isTrialExpired(userCreatedAt)) {
        return NextResponse.json({ error: 'weekly_lock' }, { status: 403 });
      }
      if ((await checkProjectBudget()).over) {
        return NextResponse.json({ error: 'project_over_capacity' }, { status: 403 });
      }
    }

    const { hits, costUsd } = await hybridRetrieve(parsed.data.query, workspaceId, {
      topN: parsed.data.topN,
    });

    return NextResponse.json({
      query: parsed.data.query,
      costUsd,
      results: hits.map((hit) => ({
        chunkId: hit.chunkId,
        documentId: hit.documentId,
        page: hit.page,
        content: hit.content,
        scores: {
          cosine: hit.cosineSimilarity,
          bm25: hit.bm25Score,
          rrf: hit.rrfScore,
          rerank: hit.rerankRelevance,
        },
      })),
    });
  } catch {
    // Don't leak provider/internal error detail from the production endpoint.
    return NextResponse.json({ error: 'search_failed' }, { status: 502 });
  }
}
