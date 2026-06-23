import { recordProjectSpend } from '@/lib/budget';
import { db } from '@doc-ai-chat/db/client';
import { usageEvents } from '@doc-ai-chat/db/schema';
import { parseModelRef, resolveChatModel } from '@doc-ai-chat/providers/chat-model';
import { computeCostUsd } from '@doc-ai-chat/providers/price-table';
import { type ModelMessage, streamText } from 'ai';

type ChatContext = {
  workspaceId?: string;
  isPrivileged?: boolean;
  // BYOK calls are paid by the user's own key, so they never count toward the
  // project budget (ADR-015). Set by the route when X-User-API-Key is present.
  isByok?: boolean;
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

// BYOK (M4 task 4): when the user supplies their own Anthropic key, run a
// dedicated Anthropic model on it instead of the env-selected project model
// (which may be DeepSeek). `provider:model_id`, ADR-016.
function byokModelRef(): string {
  return process.env.CHAT_BYOK_MODEL ?? 'anthropic:claude-sonnet-4-6';
}

export type StreamChatArgs = {
  system: string;
  messages: ModelMessage[];
  context?: ChatContext;
  // BYOK key (from X-User-API-Key); selects the BYOK model and pays for the call.
  userApiKey?: string;
};

// Streams a chat completion through the selected model (AI SDK as transport,
// ADR-005) and logs one usage_events row with cost on finish. Returns the stream
// result plus the resolved `modelId` + `startedAt` so the route can emit live
// cost/latency as message metadata (task 7).
export function streamChat({ system, messages, context = {}, userApiKey }: StreamChatArgs) {
  const ref = userApiKey ? byokModelRef() : chatModelRef();
  const { modelId } = parseModelRef(ref);
  const startedAt = Date.now();

  const result = streamText({
    model: resolveChatModel(ref, userApiKey),
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
      // Count toward the project budget kill switch, unless paid by a BYOK key.
      if (!context.isByok) {
        await recordProjectSpend(costUsd);
      }
    },
  });

  return { result, modelId, startedAt };
}
