import { checkProjectBudget } from '@/lib/budget';
import { isValidAnthropicKey } from '@/lib/byok';
import { streamChat } from '@/lib/chat';
import { retrieveChatContext } from '@/lib/chat-retrieve';
import { enforceDailyChatQuota, enforceRateLimit, rateLimitHeaders } from '@/lib/rate-limit';
import { isTrialExpired, resolveTier } from '@/lib/tiers';
import { ensureWorkspace } from '@/lib/workspace';
import { auth, currentUser } from '@clerk/nextjs/server';
import {
  type CitationSource,
  PROMPT_RAG_ANSWER_V1,
  buildRagUserTurn,
} from '@doc-ai-chat/prompts/rag-answer';
import type { ModelMessage } from 'ai';
import { NextResponse } from 'next/server';
import { z } from 'zod';

// Streaming RAG chat endpoint (M3). Auth + tenant isolation + zod, then retrieve
// grounded context (task 3), assemble the versioned prompt (task 2), and stream
// the answer through the env-selected model (task 1). History lives client-side
// (sessionStorage) and is sent with each request; retrieval keys off the latest
// message only. M4 adds free-tier gates (owner- and BYOK-exempt): burst token
// bucket (task 1), daily quota + weekly trial lock (task 2), project budget kill
// switch (task 3), and BYOK passthrough via X-User-API-Key (task 4).
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const chatSchema = z.object({
  message: z.string().min(1).max(4000),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(8000),
      }),
    )
    .max(20)
    .optional(),
});

// Maps a provider/API error to an ErrorState code (best-effort, M4 task 6). The
// AI SDK's APICallError carries the HTTP status from the provider.
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
    return isByok ? 'invalid_byok' : 'chat_failed';
  }
  return 'network_error';
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = chatSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }
  const { message, history = [] } = parsed.data;

  // BYOK (task 4): a user-supplied Anthropic key (sk-ant-…) pays for this request.
  // Read from the header only, never the body; never logged or persisted. A
  // malformed value is ignored (treated as no key, so the user falls to free tier).
  const headerKey = request.headers.get('x-user-api-key')?.trim();
  const userApiKey = headerKey && isValidAnthropicKey(headerKey) ? headerKey : undefined;
  const isByok = userApiKey !== undefined;

  try {
    const user = await currentUser();
    const email = user?.primaryEmailAddress?.emailAddress ?? '';
    // Tenant isolation: scope retrieval to the caller's own workspace (from the
    // session, never the body).
    const { id: workspaceId, userCreatedAt } = await ensureWorkspace(userId, email);
    const isPrivileged = resolveTier(email) === 'privileged';

    // Free-tier gates. Owners (ADR-010) AND BYOK users (ADR-009, their own key
    // pays) bypass all of them. Ordered most-terminal first so the user gets the
    // most informative error:
    //   1. weekly_lock          — the 7-day trial has ended (ADR-009, 403).
    //   2. daily_limit          — out of today's chat messages (ADR-009, 429).
    //   3. rate_limit           — burst token bucket on the hot path (task 1, 429).
    //   4. project_over_capacity — project budget kill switch hit (ADR-015, 403).
    if (!isPrivileged && !isByok) {
      if (isTrialExpired(userCreatedAt)) {
        return NextResponse.json({ error: 'weekly_lock' }, { status: 403 });
      }
      const daily = await enforceDailyChatQuota(userId);
      if (!daily.ok) {
        return NextResponse.json(
          { error: 'daily_limit' },
          { status: 429, headers: rateLimitHeaders(daily) },
        );
      }
      const burst = await enforceRateLimit('chat', userId);
      if (!burst.ok) {
        return NextResponse.json(
          { error: 'rate_limit_exceeded' },
          { status: 429, headers: rateLimitHeaders(burst) },
        );
      }
      if ((await checkProjectBudget()).over) {
        return NextResponse.json({ error: 'project_over_capacity' }, { status: 403 });
      }
    }

    const { contextChunks, hits } = await retrieveChatContext(message, workspaceId, {
      isPrivileged,
    });

    const messages: ModelMessage[] = [
      ...history,
      { role: 'user', content: buildRagUserTurn(message, contextChunks) },
    ];

    // Citation sources in label order — [N] in the answer resolves to sources[N-1].
    // Sent to the client as message metadata so a citation chip can open the cited
    // PDF page (task 7); the client parses the markers with resolveCitations.
    const sources: CitationSource[] = hits.map((hit) => ({
      chunkId: hit.chunkId,
      documentId: hit.documentId,
      page: hit.page,
      // Passage text for the citation panel; trimmed so the metadata stays small.
      content: hit.content.slice(0, 600),
    }));

    const result = streamChat({
      system: PROMPT_RAG_ANSWER_V1,
      messages,
      context: { workspaceId, isPrivileged, isByok },
      userApiKey,
    });

    return result.toUIMessageStreamResponse({
      messageMetadata: ({ part }) => (part.type === 'start' ? { sources } : undefined),
      // Map a mid-stream provider failure to an ErrorState code the client can
      // render. Returning a controlled string (not the raw error) avoids leaking
      // provider/internal detail.
      onError: (error) => providerErrorCode(error, isByok),
    });
  } catch {
    // Don't leak provider/internal error detail from the production endpoint.
    return NextResponse.json({ error: 'chat_failed' }, { status: 502 });
  }
}
