import type { ChatProviderId } from './chat-model';

// The two tiers each provider exposes in the M7 model selector + benchmark
// (`/account`'s selector, `/benchmark`'s 3x2 matrix). Matches the tier matrix
// sketched in docs/ARCHITECTURE.md's FASE 6 diagram at M0 planning time: "mid"
// is each provider's existing prod-grade default, "flagship" is their current
// top-of-line model.
//
// No `@ai-sdk/*` imports in this file on purpose — only `chat-model.ts`'s
// `resolveChatModel` (server-only call sites: the chat route, the benchmark
// script) needs the actual SDK provider factories. This file is plain string
// data, safe to import from a client component (`byok-form.tsx`) without
// pulling the provider SDKs into the browser bundle.
export type ProviderTier = 'mid' | 'flagship';

export const PROVIDER_TIERS: readonly ProviderTier[] = ['mid', 'flagship'];

export const CHAT_PROVIDERS_FOR_SELECTOR: readonly ChatProviderId[] = [
  'anthropic',
  'openai',
  'deepseek',
];

export type TierModelInfo = {
  modelId: string;
  label: string;
};

// Model ids here are real, public model names (providers publish them) —
// RUNTIME_CONFIG.md's own note applies: what stays private is the exact
// per-role default mapping for THIS deployment, not model names in a UI whose
// whole point is letting a user pick one. Verify against price-table.ts
// whenever a model id here changes — computeCostUsd throws on an unpriced id.
const TIER_MODELS: Record<ChatProviderId, Record<ProviderTier, TierModelInfo>> = {
  anthropic: {
    mid: { modelId: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
    flagship: { modelId: 'claude-opus-4-7', label: 'Claude Opus 4.7' },
  },
  openai: {
    mid: { modelId: 'gpt-5', label: 'GPT-5' },
    flagship: { modelId: 'gpt-5.5', label: 'GPT-5.5' },
  },
  deepseek: {
    mid: { modelId: 'deepseek-v4-flash', label: 'DeepSeek V4-Flash' },
    flagship: { modelId: 'deepseek-v4-pro', label: 'DeepSeek V4-Pro' },
  },
};

export function tierModelInfo(provider: ChatProviderId, tier: ProviderTier): TierModelInfo {
  return TIER_MODELS[provider][tier];
}

// `provider:model_id` ref (ADR-016), ready to hand to `resolveChatModel`.
export function tierModelRef(provider: ChatProviderId, tier: ProviderTier): string {
  return `${provider}:${tierModelInfo(provider, tier).modelId}`;
}

// All 6 refs, in a stable order — the exact list the M7 benchmark runs
// against (3 providers × 2 tiers) and a convenient source for tests/scripts
// that need "every combo" rather than one lookup.
export function allTierModelRefs(): string[] {
  return CHAT_PROVIDERS_FOR_SELECTOR.flatMap((provider) =>
    PROVIDER_TIERS.map((tier) => tierModelRef(provider, tier)),
  );
}
