'use client';

import { usePathname, useRouter } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { useLocale, useTranslations } from 'next-intl';

export function LocaleSwitcher() {
  const activeLocale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations('landing');

  return (
    <nav aria-label={t('localeLabel')} className="flex items-center gap-1">
      {routing.locales.map((locale) => {
        const isActive = locale === activeLocale;
        return (
          <button
            key={locale}
            type="button"
            aria-current={isActive ? 'true' : undefined}
            disabled={isActive}
            onClick={() => router.replace(pathname, { locale })}
            className={`rounded-md px-2.5 py-1 text-xs font-medium uppercase transition-colors ${
              isActive
                ? 'bg-foreground text-background'
                : 'text-foreground/60 hover:bg-foreground/10 hover:text-foreground'
            }`}
          >
            {locale}
          </button>
        );
      })}
    </nav>
  );
}
