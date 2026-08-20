import { LocaleSwitcher } from '@/components/locale-switcher';
import { Link } from '@/i18n/navigation';
import { countReadyDocumentsForUser } from '@/lib/documents';
import { Show, SignInButton, UserButton } from '@clerk/nextjs';
import { auth } from '@clerk/nextjs/server';
import { getTranslations } from 'next-intl/server';

// A nav link that turns into a disabled, tooltip-bearing label when the action
// isn't available yet — Chat/Search need at least one ingested ('ready') document.
function GatedNavLink({
  href,
  label,
  disabled,
  disabledTitle,
}: {
  href: '/chat' | '/search' | '/agent';
  label: string;
  disabled: boolean;
  disabledTitle: string;
}) {
  if (disabled) {
    return (
      <span
        aria-disabled="true"
        title={disabledTitle}
        className="cursor-not-allowed font-medium text-foreground/40 text-xs"
      >
        {label}
      </span>
    );
  }
  return (
    <Link
      href={href}
      className="font-medium text-foreground/70 text-xs transition-colors hover:text-foreground"
    >
      {label}
    </Link>
  );
}

export async function Topbar() {
  const t = await getTranslations('nav');

  // Gate Chat/Search until the signed-in user has a document ready to query.
  // Signed-out visitors don't see these links (Clerk <Show>), so skip the query.
  const { userId } = await auth();
  const hasReadyDocs = userId ? (await countReadyDocumentsForUser(userId)) > 0 : false;

  return (
    // Two deliberate rows, always (not just as a mobile wrap fallback) — M7
    // follow-up. The earlier fix (flex-wrap on one row) just let the browser
    // reflow logo/links/controls wherever they happened to fit, which put
    // "DocAI" at an ambiguous mid-height between two unrelated nav rows on a
    // phone (reported live). Splitting on purpose into "identity controls"
    // (brand, locale, account) and "page navigation" is a real information
    // hierarchy, not a wrap accident — and it reads the same way at every
    // viewport size instead of only "fixing itself" once it's wide enough.
    <header className="flex flex-col gap-2 px-6 py-4 sm:px-10">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/"
          className="font-mono font-semibold text-sm tracking-tight transition-opacity hover:opacity-80"
        >
          DocAI
        </Link>
        <div className="flex items-center gap-3">
          <LocaleSwitcher />
          <Show
            when="signed-in"
            fallback={
              <SignInButton>
                <button
                  type="button"
                  className="rounded-md bg-foreground px-3 py-1.5 font-medium text-background text-xs transition-opacity hover:opacity-90"
                >
                  {t('signIn')}
                </button>
              </SignInButton>
            }
          >
            <UserButton />
          </Show>
        </div>
      </div>
      <Show when="signed-in">
        <nav className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <GatedNavLink
            href="/chat"
            label={t('chat')}
            disabled={!hasReadyDocs}
            disabledTitle={t('uploadFirst')}
          />
          <GatedNavLink
            href="/search"
            label={t('search')}
            disabled={!hasReadyDocs}
            disabledTitle={t('uploadFirst')}
          />
          <GatedNavLink
            href="/agent"
            label={t('agent')}
            disabled={!hasReadyDocs}
            disabledTitle={t('uploadFirst')}
          />
          {/* Not doc-gated like Chat/Search/Agent — the benchmark report
              doesn't depend on the visitor's own documents. */}
          <Link
            href="/benchmark"
            className="font-medium text-foreground/70 text-xs transition-colors hover:text-foreground"
          >
            {t('benchmark')}
          </Link>
          <Link
            href="/account"
            className="font-medium text-foreground/70 text-xs transition-colors hover:text-foreground"
          >
            {t('account')}
          </Link>
        </nav>
      </Show>
    </header>
  );
}
