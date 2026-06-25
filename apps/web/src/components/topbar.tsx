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
  href: '/chat' | '/search';
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
    <header className="flex items-center justify-between px-6 py-4 sm:px-10">
      <Link
        href="/"
        className="font-mono font-semibold text-sm tracking-tight transition-opacity hover:opacity-80"
      >
        DocAI
      </Link>
      <div className="flex items-center gap-3">
        <Show when="signed-in">
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
          <Link
            href="/account"
            className="font-medium text-foreground/70 text-xs transition-colors hover:text-foreground"
          >
            {t('account')}
          </Link>
        </Show>
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
    </header>
  );
}
