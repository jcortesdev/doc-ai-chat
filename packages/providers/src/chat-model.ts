import { anthropic, createAnthropic } from '@ai-sdk/anthropic';
import { deepseek } from '@ai-sdk/deepseek';
import type { LanguageModel } from 'ai';

// Chat model refs are `provider:model_id` (e.g. `anthropic:claude-sonnet-4-6`,
// `deepseek:deepseek-v4-flash`), env-driven per ADR-016. The AI SDK is the chat
// generation + streaming layer only (ADR-005); embeddings and rerank keep their
// own native providers (hand-built fetch in apps/web).
export type ChatProviderId = 'anthropic' | 'deepseek';

export type ModelRef = {
  provider: ChatProviderId;
  modelId: string;
};

const CHAT_PROVIDERS: readonly ChatProviderId[] = ['anthropic', 'deepseek'];

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

// Resolves a `provider:model_id` ref to an AI SDK LanguageModel. Anthropic reads
// ANTHROPIC_API_KEY, DeepSeek reads DEEPSEEK_API_KEY from the environment. When
// `userApiKey` is given (BYOK, M4 task 4), the Anthropic provider runs on that
// key for this request only — never persisted, never logged.
export function resolveChatModel(value: string, userApiKey?: string): LanguageModel {
  const { provider, modelId } = parseModelRef(value);
  switch (provider) {
    case 'anthropic':
      return userApiKey ? createAnthropic({ apiKey: userApiKey })(modelId) : anthropic(modelId);
    case 'deepseek':
      return deepseek(modelId);
    default: {
      const exhaustive: never = provider;
      throw new Error(`Unhandled chat provider "${exhaustive}".`);
    }
  }
}
