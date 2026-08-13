import { anthropic, createAnthropic } from '@ai-sdk/anthropic';
import { createDeepSeek, deepseek } from '@ai-sdk/deepseek';
import { createOpenAI, openai } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';

// Chat model refs are `provider:model_id` (e.g. `anthropic:claude-sonnet-4-6`,
// `deepseek:deepseek-v4-flash`, `openai:gpt-5`), env-driven per ADR-016. The AI
// SDK is the chat generation + streaming layer only (ADR-005); embeddings and
// rerank keep their own native providers (hand-built fetch in apps/web).
//
// `openai` joined this union in M7 (ADR-020) — it was deliberately excluded
// through M3-M6 (see the old chat-model.test.ts comment this replaces) because
// there was no product reason for a user's live chat to reach OpenAI; the M7
// model selector adds exactly that reason (BYOK, tier-per-provider). This
// isn't a reversal of that boundary, just its planned extension — the
// `.env.example` model-selection header already listed all three providers.
export type ChatProviderId = 'anthropic' | 'openai' | 'deepseek';

export type ModelRef = {
  provider: ChatProviderId;
  modelId: string;
};

const CHAT_PROVIDERS: readonly ChatProviderId[] = ['anthropic', 'openai', 'deepseek'];

function isChatProvider(value: string): value is ChatProviderId {
  return (CHAT_PROVIDERS as readonly string[]).includes(value);
}

// Parses a `provider:model_id` ref into its parts. Pure — SDK resolution lives
// in `resolveChatModel`, so this stays unit-testable without the provider SDKs.
// Throws a clear error on a missing `:`, an empty model id, or an unknown
// provider. Splits on the first `:` so model ids containing one are preserved.
export function parseModelRef(value: string): ModelRef {
  const separator = value.indexOf(':');
  if (separator === -1) {
    throw new Error(
      `Invalid chat model "${value}" — expected "provider:model_id" (e.g. "anthropic:claude-sonnet-4-6").`,
    );
  }
  const provider = value.slice(0, separator);
  const modelId = value.slice(separator + 1);
  if (!modelId) {
    throw new Error(`Invalid chat model "${value}" — missing model id after "${provider}:".`);
  }
  if (!isChatProvider(provider)) {
    throw new Error(
      `Unsupported chat provider "${provider}" in "${value}" — supported: ${CHAT_PROVIDERS.join(', ')}.`,
    );
  }
  return { provider, modelId };
}

// Resolves a `provider:model_id` ref to an AI SDK LanguageModel. Each provider
// reads its own project API key from the environment by default (ANTHROPIC_API_KEY
// / OPENAI_API_KEY / DEEPSEEK_API_KEY). When `userApiKey` is given (BYOK), the
// matching provider runs on that key for this request only — never persisted,
// never logged (SECURITY.md BYOK lifecycle). Generalized in M7 (ADR-020) from
// the M4 Anthropic-only version: the model selector lets a user bring a key for
// any of the three providers, not just Anthropic, so all three branches now
// honor `userApiKey` the same way.
export function resolveChatModel(value: string, userApiKey?: string): LanguageModel {
  const { provider, modelId } = parseModelRef(value);
  switch (provider) {
    case 'anthropic':
      return userApiKey ? createAnthropic({ apiKey: userApiKey })(modelId) : anthropic(modelId);
    case 'openai':
      return userApiKey ? createOpenAI({ apiKey: userApiKey })(modelId) : openai(modelId);
    case 'deepseek':
      return userApiKey ? createDeepSeek({ apiKey: userApiKey })(modelId) : deepseek(modelId);
    default: {
      const exhaustive: never = provider;
      throw new Error(`Unhandled chat provider "${exhaustive}".`);
    }
  }
}
