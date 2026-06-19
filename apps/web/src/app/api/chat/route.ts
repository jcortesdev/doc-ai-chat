import { streamChat } from '@/lib/chat';
import { retrieveChatContext } from '@/lib/chat-retrieve';
import { resolveTier } from '@/lib/tiers';
import { ensureWorkspace } from '@/lib/workspace';
import { auth, currentUser } from '@clerk/nextjs/server';
import { PROMPT_RAG_ANSWER_V1, buildRagUserTurn } from '@doc-ai-chat/prompts/rag-answer';
import type { ModelMessage } from 'ai';
import { NextResponse } from 'next/server';
import { z } from 'zod';

// Streaming RAG chat endpoint (M3). Auth + tenant isolation + zod, then retrieve
// grounded context (task 3), assemble the versioned prompt (task 2), and stream
// the answer through the env-selected model (task 1). History lives client-side
// (sessionStorage) and is sent with each request; retrieval keys off the latest
// message only. Rate limit, BYOK, and the budget kill switch land in M4.
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

  try {
    const user = await currentUser();
    const email = user?.primaryEmailAddress?.emailAddress ?? '';
    // Tenant isolation: scope retrieval to the caller's own workspace (from the
    // session, never the body).
    const workspaceId = await ensureWorkspace(userId, email);
    const isPrivileged = resolveTier(email) === 'privileged';

    const { contextChunks } = await retrieveChatContext(message, workspaceId, { isPrivileged });

    const messages: ModelMessage[] = [
      ...history,
      { role: 'user', content: buildRagUserTurn(message, contextChunks) },
    ];

    const result = streamChat({
      system: PROMPT_RAG_ANSWER_V1,
      messages,
      context: { workspaceId, isPrivileged },
    });

    return result.toUIMessageStreamResponse();
  } catch {
    // Don't leak provider/internal error detail from the production endpoint.
    return NextResponse.json({ error: 'chat_failed' }, { status: 502 });
  }
}
