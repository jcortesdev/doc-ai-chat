'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

const BANNER_DISMISSED_KEY = 'docai:banner-dismissed';

// App-wide "demo in progress" notice (pre-M5). Thin and non-alarming — it tells a
// recruiter the project is still being built. The dismiss is remembered in
// localStorage; like byok-form, we read storage in an effect and render nothing
// until that check runs, to avoid a hydration flash of the banner.
export function UnderConstructionBanner() {
  const t = useTranslations('banner');
  const [dismissed, setDismissed] = useState<boolean | null>(null);

  useEffect(() => {
    setDismissed(window.localStorage.getItem(BANNER_DISMISSED_KEY) === 'true');
  }, []);

  function handleDismiss() {
    window.localStorage.setItem(BANNER_DISMISSED_KEY, 'true');
    setDismissed(true);
  }

  if (dismissed !== false) {
    return null;
  }

  return (
    <div className="flex items-center justify-between gap-3 border-foreground/10 border-b bg-foreground/[0.03] px-6 py-2 text-foreground/70 text-xs sm:px-10">
      <p className="flex items-center gap-2">
        <span aria-hidden="true">🚧</span>
        <span>{t('message')}</span>
      </p>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label={t('dismiss')}
        className="shrink-0 rounded-md px-2 py-0.5 text-foreground/60 transition-colors hover:bg-foreground/10 hover:text-foreground"
      >
        ✕
      </button>
    </div>
  );
}
