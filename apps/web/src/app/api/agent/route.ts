import { runAgent } from '@/lib/agent';
import { checkProjectBudget } from '@/lib/budget';
import { isValidProviderKey, parseByokProvider } from '@/lib/byok';
import { enforceDailyQuota, rateLimitHeaders } from '@/lib/rate-limit';
import {
  getAgentCaps,
  isTrialExempt,
  isTrialExpired,
  resolveAgentTier,
  resolveTier,
} from '@/lib/tiers';
import { ensureWorkspace } from '@/lib/workspace';
import { auth, currentUser } from '@clerk/nextjs/server';
import { computeCostUsd } from '@doc-ai-chat/providers/price-table';
import { NextResponse } from 'next/server';
import { z } from 'zod';

// Agent loop endpoint (M6). Mirrors /api/chat's auth + tenant isolation + zod
// shape (ADR-014/019), with agent-specific gates instead of chat's: no burst
// token bucket (the 2/day free quota is already the binding constraint — a
// single agent run does several model calls, so it doesn't need a second,
// finer-grained limiter on top). One request = one self-contained run (query in,
// full tool-call transcript + answer out); there is no multi-turn agent
// conversation in v1 — a follow-up question starts a fresh run. Anonymous is
// disabled by construction: no Clerk session, no run.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const agentSchema = z.object({
  query: z.string().min(1).max(2000),
  // The UI locale (same contract as /api/chat) — sets the reply-language
  // default when the question doesn't make it obvious.
  locale: z.enum(['en', 'es']).optional(),
});

// Maps a provider/API error to an ErrorState code (best-effort, mirrors
// /api/chat's providerErrorCode).
function providerErrorCode(error: unknown, isByok: boolean): string {
  const status =
    typeof error === 'object' && error !== null && 'statusCode' in error
      ? (error as { statusCode?: number }).statusCode
      : undefined;
  if (status === 402) {
    return 'out_of_credit';
  }
  if (status === 529) {
    return 'model_overload';
  }
  if (status === 401) {
    return isByok ? 'invalid_byok' : 'agent_failed';
  }
  return 'network_error';
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = agentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }
  const { query, locale = 'en' } = parsed.data;

  // BYOK (same contract as chat): a user-supplied key pays for this run and
  // unlocks the pro-tier caps (ADR-014). Header only, never body, never
  // logged/persisted. M7: which model the pro tier actually runs is now
  // selectable too, but ONLY when a real BYOK key backs the choice — see the
  // caps override below and ADR-020's note. Privileged-without-BYOK and the
  // free tier are untouched: they always get the env-configured
  // AGENT_PRO_MODEL / AGENT_FREE_MODEL default, same as before M7.
  const headerKey = request.headers.get('x-user-api-key')?.trim();
  const headerModelRef = request.headers.get('x-user-model-ref')?.trim();
  const byokProvider = parseByokProvider(headerModelRef);
  const userApiKey =
    headerKey && byokProvider && isValidProviderKey(byokProvider, headerKey)
      ? headerKey
      : undefined;
  const userModelRef = userApiKey ? headerModelRef : undefined;
  const isByok = userApiKey !== undefined;

  try {
    const user = await currentUser();
    const email = user?.primaryEmailAddress?.emailAddress ?? '';
    const { id: workspaceId, userCreatedAt } = await ensureWorkspace(userId, email);
    const isPrivileged = resolveTier(email) === 'privileged';

    // Free-tier gates. Owners and BYOK bypass all of them (their own key pays,
    // or they're exempt by policy — ADR-010/ADR-015), same ordering rule as
    // chat: most-terminal first so the user gets the most informative error.
    //   1. weekly_lock            — the 7-day trial has ended (ADR-009, 403).
    //   2. agent_daily_limit      — out of today's agent runs (ADR-014, 429).
    //   3. project_over_capacity  — project budget kill switch hit (ADR-015, 403).
    if (!isPrivileged && !isByok) {
      if (!isTrialExempt(email) && isTrialExpired(userCreatedAt)) {
        return NextResponse.json({ error: 'weekly_lock' }, { status: 403 });
      }
      const daily = await enforceDailyQuota('agent', userId);
      if (!daily.ok) {
        return NextResponse.json(
          { error: 'agent_daily_limit' },
          { status: 429, headers: rateLimitHeaders(daily) },
        );
      }
      if ((await checkProjectBudget()).over) {
        return NextResponse.json({ error: 'project_over_capacity' }, { status: 403 });
      }
    }

    const tier = resolveAgentTier(isPrivileged, isByok);
    const baseCaps = getAgentCaps(tier);
    // M7: a BYOK-backed pro run uses the user's own provider+tier choice
    // instead of the env-configured AGENT_PRO_MODEL default — the iteration/
    // token/wall-clock caps stay exactly what the tier defines, only the
    // model changes. Privileged-without-BYOK (owner, no key) and the free
    // tier never hit this branch, so they keep today's env-defined model.
    const caps = isByok && userModelRef ? { ...baseCaps, modelRef: userModelRef } : baseCaps;

    const { result, modelId, startedAt, capState } = runAgent({
      query,
      workspaceId,
      caps,
      isPrivileged,
      isByok,
      userApiKey,
      locale,
    });

    return result.toUIMessageStreamResponse({
      // `start` tells the client which tier/caps this run is bound by (the
      // transcript UI can show "3 iterations max" up front); `finish` carries
      // the partial-answer flag + live usage, mirroring /api/chat's pattern.
      messageMetadata: ({ part }) => {
        if (part.type === 'start') {
          return {
            tier,
            // M7: the resolved model id — known before streaming starts
            // (caps.modelRef, possibly BYOK-overridden above), so it's
            // available from the first metadata part, not just on finish.
            model: modelId,
            maxIterations: caps.maxIterations,
            maxWallClockMs: caps.maxWallClockMs,
          };
        }
        if (part.type === 'finish') {
          const inputTokens = part.totalUsage.inputTokens ?? 0;
          const outputTokens = part.totalUsage.outputTokens ?? 0;
          return {
            // Repeated from `start` — message metadata merge-vs-replace across
            // stream events isn't a contract worth depending on (same reasoning
            // as /api/chat repeating `sources` on finish).
            tier,
            model: modelId,
            maxIterations: caps.maxIterations,
            capped: capState.capped,
            capReason: capState.reason,
            usage: {
              inputTokens,
              outputTokens,
              costUsd: computeCostUsd(modelId, inputTokens, outputTokens),
              latencyMs: Date.now() - startedAt,
            },
          };
        }
        return undefined;
      },
      onError: (error) => providerErrorCode(error, isByok),
    });
  } catch {
    // Don't leak provider/internal error detail from the production endpoint.
    return NextResponse.json({ error: 'agent_failed' }, { status: 502 });
  }
}
