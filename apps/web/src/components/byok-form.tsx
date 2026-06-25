'use client';

import { BYOK_STORAGE_KEY, isValidAnthropicKey, maskKey } from '@/lib/byok';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useState } from 'react';

// BYOK settings form (M4 task 4). The Anthropic key is held ONLY in sessionStorage
// — validated client-side without a network call, sent per-request as a header by
// the chat transport, and cleared when the tab closes. Never reaches our server
// except as the `X-User-API-Key` passthrough, which is never logged or persisted.
export function ByokForm() {
  const t = useTranslations('settings');
  const [input, setInput] = useState('');
  const [stored, setStored] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    setStored(window.sessionStorage.getItem(BYOK_STORAGE_KEY));
  }, []);

  function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const key = input.trim();
    if (!isValidAnthropicKey(key)) {
      setInvalid(true);
      return;
    }
    window.sessionStorage.setItem(BYOK_STORAGE_KEY, key);
    setStored(key);
    setInput('');
    setInvalid(false);
  }

  function handleClear() {
    window.sessionStorage.removeItem(BYOK_STORAGE_KEY);
    setStored(null);
  }

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-foreground/10 p-5">
      <div className="flex flex-col gap-1">
        <h2 className="font-semibold text-base">{t('byokTitle')}</h2>
        <p className="text-foreground/70 text-sm">{t('byokHint')}</p>
      </div>

      {stored ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm">
            {t('active')} <span className="font-mono text-foreground/80">{maskKey(stored)}</span>
          </p>
          <button
            type="button"
            onClick={handleClear}
            className="w-fit rounded-lg border border-foreground/20 px-4 py-2 font-medium text-sm transition-colors hover:bg-foreground/5"
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
            aria-label={t('byokTitle')}
            aria-invalid={invalid}
            className="flex-1 rounded-lg border border-foreground/20 bg-transparent px-4 py-2.5 font-mono text-sm outline-none focus:border-foreground/50"
          />
          <button
            type="submit"
            disabled={input.trim().length === 0}
            className="rounded-lg bg-foreground px-5 py-2.5 font-medium text-background text-sm transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {t('save')}
          </button>
        </form>
      )}

      {invalid && <p className="text-red-500 text-sm">{t('invalid')}</p>}
      <p className="text-foreground/60 text-xs">{t('securityNote')}</p>
    </section>
  );
}
