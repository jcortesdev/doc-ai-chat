import { anthropic } from '@ai-sdk/anthropic';
import { deepseek } from '@ai-sdk/deepseek';
import { openai } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';

// Resolves `provider:model_id` refs for the M5 eval roles (GATE_PRIMARY_MODEL,
// GATE_SANITY_MODEL, EVAL_JUDGE_MODEL, ADR-016) — a separate type and resolver
// from chat-model.ts's ChatProviderId on purpose (see chat-model.test.ts:
// "openai is the eval judge via its own path — not a chat provider here").
// The chat route only ever talks to the two providers users actually chat
// with; judge/gate roles need OpenAI (GPT-5-mini is the configured judge per
// README) without widening what `resolveChatModel` accepts.
export type JudgeProviderId = 'anthropic' | 'openai' | 'deepseek';

export type JudgeModelRef = {
  provider: JudgeProviderId;
  modelId: string;
};

const JUDGE_PROVIDERS: readonly JudgeProviderId[] = ['anthropic', 'openai', 'deepseek'];

function isJudgeProvider(value: string): value is JudgeProviderId {
  return (JUDGE_PROVIDERS as readonly string[]).includes(value);
}

export function parseJudgeModelRef(value: string): JudgeModelRef {
  const separator = value.indexOf(':');
  if (separator === -1) {
    throw new Error(
      `Invalid judge model "${value}" — expected "provider:model_id" (e.g. "openai:gpt-5-mini").`,
    );
  }
  const provider = value.slice(0, separator);
  const modelId = value.slice(separator + 1);
  if (!modelId) {
    throw new Error(`Invalid judge model "${value}" — missing model id after "${provider}:".`);
  }
  if (!isJudgeProvider(provider)) {
    throw new Error(
      `Unsupported judge provider "${provider}" in "${value}" — supported: ${JUDGE_PROVIDERS.join(', ')}.`,
    );
  }
  return { provider, modelId };
}

// Each provider function reads its own API key from the environment
// (OPENAI_API_KEY, ANTHROPIC_API_KEY, DEEPSEEK_API_KEY) — judge/gate calls are
// never BYOK, they're project-paid infra cost (ADR-006), so there is no
// userApiKey parameter here.
export function resolveJudgeModel(value: string): LanguageModel {
  const { provider, modelId } = parseJudgeModelRef(value);
  switch (provider) {
    case 'openai':
      return openai(modelId);
    case 'anthropic':
      return anthropic(modelId);
    case 'deepseek':
      return deepseek(modelId);
    default: {
      const exhaustive: never = provider;
      throw new Error(`Unhandled judge provider "${exhaustive}".`);
    }
  }
}
