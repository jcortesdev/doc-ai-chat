// BYOK (bring-your-own-key) helpers shared by the settings form and the chat
// transport (M4 task 4). The Anthropic key lives ONLY in sessionStorage and is
// sent per-request in the `X-User-API-Key` header — never persisted server-side,
// never logged, gone when the tab closes (SECURITY.md BYOK lifecycle).
export const BYOK_STORAGE_KEY = 'docai-byok-anthropic';

// Client-side sanity check with NO network call: real validation happens when
// Anthropic accepts/rejects the key (a 401 surfaces as the `invalid_byok` error).
export function isValidAnthropicKey(key: string): boolean {
  return key.startsWith('sk-ant-') && key.length >= 20;
}

// Masks a key for display so the full secret is never rendered back.
export function maskKey(key: string): string {
  if (key.length <= 14) {
    return `${key.slice(0, 4)}…`;
  }
  return `${key.slice(0, 10)}…${key.slice(-4)}`;
}
