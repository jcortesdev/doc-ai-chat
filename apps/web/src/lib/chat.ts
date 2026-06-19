import { db } from '@doc-ai-chat/db/client';
import { usageEvents } from '@doc-ai-chat/db/schema';
import { parseModelRef, resolveChatModel } from '@doc-ai-chat/providers/chat-model';
import { computeCostUsd } from '@doc-ai-chat/providers/price-table';
import { type ModelMessage, streamText } from 'ai';

type ChatContext = {
  workspaceId?: string;
  isPrivileged?: boolean;
};

// Dev iteration runs CHAT_DEV_MODEL; the prod demo runs CHAT_PROD_MODEL. Both are
// `provider:model_id` (ADR-016). Today both point at DeepSeek while we benchmark
// cost/quality before promoting Sonnet to prod. BYOK override lands in M4.
function chatModelRef(): string {
  const ref =
    process.env.NODE_ENV === 'production'
      ? process.env.CHAT_PROD_MODEL
      : process.env.CHAT_DEV_MODEL;
  if (!ref) {
    throw new Error(
      'CHAT_PROD_MODEL / CHAT_DEV_MODEL is not set — expected "provider:model_id" (ADR-016).',
    );
  }
  return ref;
}

export type StreamChatArgs = {
  system: string;
  messages: ModelMessage[];
  context?: ChatContext;
};

// Streams a chat completion through the env-selected model (AI SDK as transport,
// ADR-005) and logs one usage_events row with cost on finish. Returns the raw
// streamText result so the route handler (M3 task 4) pipes it to SSE.
export function streamChat({ system, messages, context = {} }: StreamChatArgs) {
  const ref = chatModelRef();
  const { modelId } = parseModelRef(ref);
  const startedAt = Date.now();

  return streamText({
    model: resolveChatModel(ref),
    system,
    messages,
    onFinish: async ({ totalUsage }) => {
      const inputTokens = totalUsage.inputTokens ?? 0;
      const outputTokens = totalUsage.outputTokens ?? 0;
      const costUsd = computeCostUsd(modelId, inputTokens, outputTokens);
      await db.insert(usageEvents).values({
        workspaceId: context.workspaceId ?? null,
        documentId: null,
        model: modelId,
        inputTokens,
        outputTokens,
        costUsd: costUsd.toFixed(6),
        latencyMs: Date.now() - startedAt,
        isPrivileged: context.isPrivileged ?? false,
      });
    },
  });
}
