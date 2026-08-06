import { createAgentTools } from '@/lib/agent-tools';
import { recordProjectSpend } from '@/lib/budget';
import type { AgentCaps } from '@/lib/tiers';
import { db } from '@doc-ai-chat/db/client';
import { usageEvents } from '@doc-ai-chat/db/schema';
import { AGENT_CAP_NOTICE, PROMPT_AGENT_V1 } from '@doc-ai-chat/prompts/agent';
import { languageDirective } from '@doc-ai-chat/prompts/rag-answer';
import { parseModelRef, resolveChatModel } from '@doc-ai-chat/providers/chat-model';
import { computeCostUsd } from '@doc-ai-chat/providers/price-table';
import { type ModelMessage, stepCountIs, streamText } from 'ai';

// M6 agent loop (ADR-014, ADR-019): a single multi-step streamText call with the
// two tools from agent-tools.ts. The tricky part is the *graceful* half of the
// cap contract — "if a cap fires before the agent declares done, return the
// partial answer with a visible badge" — rather than just truncating the stream.
//
// The mechanism is `prepareStep` (AI SDK v6): on the step that would blow a cap,
// it disables tools for that step (`activeTools: []`) and appends AGENT_CAP_NOTICE
// as one more user turn, so the model's *next* step is a forced, honest,
// text-only conclusion instead of an abandoned tool call. `stopWhen:
// stepCountIs(maxIterations)` is the hard ceiling in case that logic has a gap
// (defense in depth, same posture as the rest of the app's caps) — it assumes
// `caps.maxIterations >= 2` (both configured tiers are; see RUNTIME_CONFIG.md).

export type AgentCapReason = 'max_iterations' | 'max_tokens' | 'max_wall_clock';

export type AgentCapState = {
  capped: boolean;
  reason: AgentCapReason | null;
};

// Wall clock is enforced gracefully at each step boundary in `prepareStep`
// (below) so a capped run still gets to answer. This AbortSignal is only the
// last-resort safety net for a single step call that itself hangs (e.g. a
// stalled network read) — it should never fire on the normal capped path, hence
// the extra grace beyond the configured cap.
const HARD_ABORT_GRACE_MS = 15_000;

export type RunAgentArgs = {
  query: string;
  workspaceId: string;
  caps: AgentCaps;
  isPrivileged: boolean;
  // BYOK calls are paid by the user's own key (never counted toward the project
  // budget, ADR-015) and may run the pro-tier model on that key (ADR-014).
  isByok: boolean;
  userApiKey?: string;
  locale: string;
};

export function runAgent({
  query,
  workspaceId,
  caps,
  isPrivileged,
  isByok,
  userApiKey,
  locale,
}: RunAgentArgs) {
  const { modelId } = parseModelRef(caps.modelRef);
  const startedAt = Date.now();
  const capState: AgentCapState = { capped: false, reason: null };

  const tools = createAgentTools({ workspaceId, isPrivileged });
  const messages: ModelMessage[] = [{ role: 'user', content: query }];

  const result = streamText({
    model: resolveChatModel(caps.modelRef, isByok ? userApiKey : undefined),
    system: `${PROMPT_AGENT_V1}\n\n${languageDirective(locale)}`,
    messages,
    tools,
    stopWhen: stepCountIs(caps.maxIterations),
    abortSignal: AbortSignal.timeout(caps.maxWallClockMs + HARD_ABORT_GRACE_MS),
    prepareStep: ({ steps, messages: stepMessages }) => {
      // Always let the first step through untouched — capping before the agent
      // tries anything would be a broken experience, and every configured tier
      // (min 3 iterations / 30s) leaves room for at least one real attempt.
      if (steps.length === 0) {
        return {};
      }

      const cumulativeInputTokens = steps.reduce(
        (sum, step) => sum + (step.usage.inputTokens ?? 0),
        0,
      );
      const elapsedMs = Date.now() - startedAt;
      const isLastAllowedStep = steps.length + 1 >= caps.maxIterations;
      const tokensExceeded = cumulativeInputTokens >= caps.maxCumulativeInputTokens;
      const wallClockExceeded = elapsedMs >= caps.maxWallClockMs;

      if (!(isLastAllowedStep || tokensExceeded || wallClockExceeded)) {
        return {};
      }

      capState.capped = true;
      capState.reason = tokensExceeded
        ? 'max_tokens'
        : wallClockExceeded
          ? 'max_wall_clock'
          : 'max_iterations';
      return {
        activeTools: [],
        messages: [...stepMessages, { role: 'user' as const, content: AGENT_CAP_NOTICE }],
      };
    },
    onFinish: async ({ totalUsage }) => {
      const inputTokens = totalUsage.inputTokens ?? 0;
      const outputTokens = totalUsage.outputTokens ?? 0;
      const costUsd = computeCostUsd(modelId, inputTokens, outputTokens);
      await db.insert(usageEvents).values({
        workspaceId,
        documentId: null,
        model: modelId,
        inputTokens,
        outputTokens,
        costUsd: costUsd.toFixed(6),
        latencyMs: Date.now() - startedAt,
        isPrivileged,
      });
      // Count toward the project budget kill switch, unless paid by a BYOK key
      // (mirrors streamChat in lib/chat.ts).
      if (!isByok) {
        await recordProjectSpend(costUsd);
      }
    },
  });

  return { result, modelId, startedAt, capState };
}
