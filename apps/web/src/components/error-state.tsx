'use client';

import { Link } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';

// Unified error UI (ADR-013). One component, ten variants, copy in messages/*.json
// (en/es). Each variant maps to a friendly title + body and zero or more CTAs:
// BYOK (→ /settings), Contact (mailto), or Retry (caller callback). Honest, not
// masked — the variant tells the user what actually happened.
export type ErrorVariant =
  | 'out_of_credit'
  | 'daily_limit'
  | 'project_over_capacity'
  | 'weekly_lock'
  | 'invalid_byok'
  | 'model_overload'
  | 'file_too_large'
  | 'pdf_unparseable'
  | 'network_error'
  | 'storage_full';

type CtaConfig = { byok?: boolean; contact?: boolean; retry?: boolean };

const CTA: Record<ErrorVariant, CtaConfig> = {
  out_of_credit: { byok: true },
  daily_limit: { contact: true },
  project_over_capacity: { byok: true, contact: true },
  weekly_lock: { byok: true, contact: true },
  invalid_byok: { byok: true },
  model_overload: { retry: true },
  file_too_large: {},
  pdf_unparseable: {},
  network_error: { retry: true },
  storage_full: {},
};

export function ErrorState({
  variant,
  onRetry,
}: {
  variant: ErrorVariant;
  onRetry?: () => void;
}) {
  const t = useTranslations('errors');
  const cta = CTA[variant];
  const contactEmail = process.env.NEXT_PUBLIC_CONTACT_EMAIL;
  const showContact = Boolean(cta.contact && contactEmail);
  const showRetry = Boolean(cta.retry && onRetry);
  const hasActions = Boolean(cta.byok) || showContact || showRetry;

  return (
    <div
      role="alert"
      className="flex flex-col gap-2 rounded-xl border border-foreground/15 bg-foreground/5 p-4"
    >
      <p className="font-semibold text-foreground text-sm">{t(`${variant}.title`)}</p>
      <p className="text-foreground/70 text-sm">{t(`${variant}.body`)}</p>
      {hasActions && (
        <div className="mt-1 flex flex-wrap gap-2">
          {cta.byok && (
            <Link
              href="/settings"
              className="rounded-lg border border-foreground/20 px-3 py-1.5 font-medium text-xs transition-colors hover:bg-foreground/10"
            >
              {t('cta.byok')}
            </Link>
          )}
          {showContact && (
            <a
              href={`mailto:${contactEmail}`}
              className="rounded-lg border border-foreground/20 px-3 py-1.5 font-medium text-xs transition-colors hover:bg-foreground/10"
            >
              {t('cta.contact')}
            </a>
          )}
          {showRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="rounded-lg border border-foreground/20 px-3 py-1.5 font-medium text-xs transition-colors hover:bg-foreground/10"
            >
              {t('cta.retry')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
