'use client';

import {
  BYOK_PREFERENCE_KEY,
  type ByokPreference,
  type ByokProvider,
  byokStorageKey,
  isValidProviderKey,
  maskKey,
  readByokPreference,
} from '@/lib/byok';
import {
  CHAT_PROVIDERS_FOR_SELECTOR,
  PROVIDER_TIERS,
  type ProviderTier,
  tierModelInfo,
} from '@doc-ai-chat/providers/tier-models';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useState } from 'react';

const PROVIDER_LABELS: Record<ByokProvider, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  deepseek: 'DeepSeek',
};

type KeyState = Record<ByokProvider, string | null>;

// One provider's key card: masked/active view or a save form — same shape as
// the M4 single-Anthropic-key form, parameterized by provider (M7, ADR-020).
function ProviderKeyCard({
  provider,
  storedKey,
  onSave,
  onClear,
}: {
  provider: ByokProvider;
  storedKey: string | null;
  onSave: (key: string) => void;
  onClear: () => void;
}) {
  const t = useTranslations('settings');
  const [input, setInput] = useState('');
  const [invalid, setInvalid] = useState(false);
  const providerLabel = PROVIDER_LABELS[provider];

  function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const key = input.trim();
    if (!isValidProviderKey(provider, key)) {
      setInvalid(true);
      return;
    }
    onSave(key);
    setInput('');
    setInvalid(false);
  }

  return (
    <div className="flex flex-col gap-2 border-foreground/10 border-t pt-4 first:border-t-0 first:pt-0">
      <p className="font-medium text-sm">{providerLabel}</p>
      {storedKey ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-foreground/70 text-xs">
            {t('active')} <span className="font-mono text-foreground/80">{maskKey(storedKey)}</span>
          </p>
          <button
            type="button"
            onClick={onClear}
            className="w-fit rounded-lg border border-foreground/20 px-3 py-1 font-medium text-xs transition-colors hover:bg-foreground/5"
          >
            {t('clear')}
          </button>
        </div>
      ) : (
        <form onSubmit={handleSave} className="flex flex-col gap-2">
          <input
            type="password"
            value={input}
            onChange={(event) => {
              setInput(event.target.value);
              setInvalid(false);
            }}
            placeholder={t('placeholder')}
            aria-label={t('keyLabel', { provider: providerLabel })}
            aria-invalid={invalid}
            className="flex-1 rounded-lg border border-foreground/20 bg-transparent px-3 py-2 font-mono text-xs outline-none focus:border-foreground/50"
          />
          <button
            type="submit"
            disabled={input.trim().length === 0}
            className="w-fit rounded-lg bg-foreground px-4 py-1.5 font-medium text-background text-xs transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {t('save')}
          </button>
        </form>
      )}
      {invalid && (
        <p className="text-red-500 text-xs">{t('invalid', { provider: providerLabel })}</p>
      )}
    </div>
  );
}

// BYOK settings card (M4 task 4, generalized in M7/ADR-020). Each provider's
// key is held ONLY in sessionStorage — validated client-side without a network
// call, sent per-request as a header by the chat transport, and cleared when
// the tab closes or the signed-in user changes (ByokSessionGuard). Once at
// least one key is present, a tier picker lets the user choose which
// provider+tier /api/chat should use; that choice is stored the same way.
export function ByokForm() {
  const t = useTranslations('settings');
  const [keys, setKeys] = useState<KeyState>({ anthropic: null, openai: null, deepseek: null });
  const [preference, setPreference] = useState<ByokPreference | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setKeys({
      anthropic: window.sessionStorage.getItem(byokStorageKey('anthropic')),
      openai: window.sessionStorage.getItem(byokStorageKey('openai')),
      deepseek: window.sessionStorage.getItem(byokStorageKey('deepseek')),
    });
    setPreference(readByokPreference(window.sessionStorage.getItem(BYOK_PREFERENCE_KEY)));
    setHydrated(true);
  }, []);

  function handleSave(provider: ByokProvider, key: string) {
    window.sessionStorage.setItem(byokStorageKey(provider), key);
    setKeys((prev) => ({ ...prev, [provider]: key }));
  }

  function handleClear(provider: ByokProvider) {
    window.sessionStorage.removeItem(byokStorageKey(provider));
    setKeys((prev) => ({ ...prev, [provider]: null }));
    // Clearing the active provider's key invalidates whatever tier was chosen
    // for it — leaving it set would silently fall back to a 401 mid-chat.
    setPreference((prev) => {
      if (prev?.provider !== provider) {
        return prev;
      }
      window.sessionStorage.removeItem(BYOK_PREFERENCE_KEY);
      return null;
    });
  }

  function handleSelectTier(provider: ByokProvider, tier: ProviderTier) {
    const next: ByokPreference = { provider, tier };
    window.sessionStorage.setItem(BYOK_PREFERENCE_KEY, JSON.stringify(next));
    setPreference(next);
  }

  const hasAnyKey = CHAT_PROVIDERS_FOR_SELECTOR.some((provider) => keys[provider]);

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-foreground/10 p-5">
      <div className="flex flex-col gap-1">
        <h2 className="font-semibold text-base">{t('byokTitle')}</h2>
        <p className="text-foreground/70 text-sm">{t('byokHint')}</p>
      </div>

      <div className="flex flex-col gap-4">
        {CHAT_PROVIDERS_FOR_SELECTOR.map((provider) => (
          <ProviderKeyCard
            key={provider}
            provider={provider}
            storedKey={keys[provider]}
            onSave={(key) => handleSave(provider, key)}
            onClear={() => handleClear(provider)}
          />
        ))}
      </div>

      {hydrated && hasAnyKey && (
        <div className="flex flex-col gap-2 border-foreground/10 border-t pt-4">
          <p className="font-medium text-sm">{t('tierPicker')}</p>
          <div className="flex flex-wrap gap-2">
            {CHAT_PROVIDERS_FOR_SELECTOR.map((provider) =>
              PROVIDER_TIERS.map((tier) => {
                const enabled = Boolean(keys[provider]);
                const active = preference?.provider === provider && preference.tier === tier;
                const info = tierModelInfo(provider, tier);
                return (
                  <button
                    key={`${provider}-${tier}`}
                    type="button"
                    disabled={!enabled}
                    onClick={() => handleSelectTier(provider, tier)}
                    title={
                      enabled
                        ? info.label
                        : t('tierLocked', { provider: PROVIDER_LABELS[provider] })
                    }
                    className={`rounded-lg border px-3 py-1.5 text-left text-xs transition-colors ${
                      active
                        ? 'border-foreground/40 bg-foreground/10 font-medium'
                        : enabled
                          ? 'border-foreground/20 hover:bg-foreground/5'
                          : 'cursor-not-allowed border-foreground/10 text-foreground/30'
                    }`}
                  >
                    {info.label}
                  </button>
                );
              }),
            )}
          </div>
          <p className="text-foreground/60 text-xs">
            {preference
              ? t('currentlyUsing', {
                  model: tierModelInfo(preference.provider, preference.tier).label,
                })
              : t('noSelection')}
          </p>
        </div>
      )}

      <p className="text-foreground/60 text-xs">{t('securityNote')}</p>
    </section>
  );
}
