import { LocaleSwitcher } from '@/components/locale-switcher';
import { Show, SignInButton, UserButton } from '@clerk/nextjs';
import { getTranslations } from 'next-intl/server';

export async function Topbar() {
  const t = await getTranslations('nav');

  return (
    <header className="flex items-center justify-between px-6 py-4 sm:px-10">
      <span className="font-mono text-sm font-semibold tracking-tight">DocAI</span>
      <div className="flex items-center gap-3">
        <LocaleSwitcher />
        <Show
          when="signed-in"
          fallback={
            <SignInButton>
              <button
                type="button"
                className="rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background transition-opacity hover:opacity-90"
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
