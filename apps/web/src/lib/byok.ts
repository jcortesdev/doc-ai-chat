import type { ProviderTier } from '@doc-ai-chat/providers/tier-models';

// BYOK (bring-your-own-key) helpers shared by the account form and the chat
// transport. Each provider's key lives ONLY in sessionStorage and is sent
// per-request in its own header — never persisted server-side, never logged,
// gone when the tab closes (SECURITY.md BYOK lifecycle).
//
// Generalized in M7 (ADR-020) from the M4 Anthropic-only version: the model
// selector in /account lets a user bring a key for any of the three chat
// providers, not just Anthropic.
export type ByokProvider = 'anthropic' | 'openai' | 'deepseek';

const STORAGE_KEY_PREFIX = 'docai-byok-';

export function byokStorageKey(provider: ByokProvider): string {
  return `${STORAGE_KEY_PREFIX}${provider}`;
}

// Kept as a named constant for the one provider that had a BYOK key before
// M7 — equivalent to `byokStorageKey('anthropic')`, same literal value the M4
// storage key already used, so a key saved before this change is still found
// under the same sessionStorage entry (moot in practice, since sessionStorage
// doesn't survive a tab close anyway, but it costs nothing to keep it exact).
export const BYOK_STORAGE_KEY = byokStorageKey('anthropic');

// Client-side sanity check with NO network call: real validation happens when
// the provider accepts/rejects the key (a 401 surfaces as the `invalid_byok`
// error). Anthropic's `sk-ant-` prefix is distinctive; OpenAI and DeepSeek
// both issue bare `sk-`-prefixed keys, so their check is a length floor
// rather than a stricter pattern — imprecise, but harmless, since the only
// thing a stricter client check buys is a slightly earlier error message.
const PROVIDER_KEY_PREFIXES: Record<ByokProvider, string> = {
  anthropic: 'sk-ant-',
  openai: 'sk-',
  deepseek: 'sk-',
};

export function isValidProviderKey(provider: ByokProvider, key: string): boolean {
  return key.startsWith(PROVIDER_KEY_PREFIXES[provider]) && key.length >= 20;
}

// Back-compat named export — some M4-era code path may still import this
// directly; equivalent to `isValidProviderKey('anthropic', key)`.
export function isValidAnthropicKey(key: string): boolean {
  return isValidProviderKey('anthropic', key);
}

// Masks a key for display so the full secret is never rendered back.
export function maskKey(key: string): string {
  if (key.length <= 14) {
    return `${key.slice(0, 4)}…`;
  }
  return `${key.slice(0, 10)}…${key.slice(-4)}`;
}

// The user's selected provider + tier preference (M7 model selector). Not a
// secret by itself — just which of the 3 providers / 2 tiers to chat with —
// but stored under the same sessionStorage lifecycle as the keys (clears on
// tab close and on user switch via `ByokSessionGuard`) so a stale preference
// never outlives the key that makes it usable.
export const BYOK_PREFERENCE_KEY = 'docai-byok-preference';

export type ByokPreference = {
  provider: ByokProvider;
  tier: ProviderTier;
};

export function readByokPreference(raw: string | null): ByokPreference | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<ByokPreference>;
    if (
      (parsed.provider === 'anthropic' ||
        parsed.provider === 'openai' ||
        parsed.provider === 'deepseek') &&
      (parsed.tier === 'mid' || parsed.tier === 'flagship')
    ) {
      return { provider: parsed.provider, tier: parsed.tier };
    }
  } catch {
    // Malformed/foreign sessionStorage value — treat as "no preference set"
    // rather than throwing, same fail-safe posture as tiers.ts's envIntCap.
  }
  return null;
}
