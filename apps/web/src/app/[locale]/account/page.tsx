import { ByokForm } from '@/components/byok-form';
import { PageHelp } from '@/components/page-help';
import { UsageSummary } from '@/components/usage-summary';
import { Link } from '@/i18n/navigation';
import { resolveTier } from '@/lib/tiers';
import { type UsageScope, getUsageSummary } from '@/lib/usage';
import { ensureWorkspace } from '@/lib/workspace';
import { auth, currentUser } from '@clerk/nextjs/server';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ privileged?: string }>;
};

// Unified account page (pre-M5): usage, BYOK key, and uploaded files in one place,
// replacing the separate /usage and /settings routes (both now redirect here).
export default async function AccountPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { privileged } = await searchParams;
  const t = await getTranslations('account');
  const tUsage = await getTranslations('usage');

  const { userId } = await auth();
  if (!userId) {
    redirect(`/${locale}/sign-in`);
  }
  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? '';
  const isOwner = resolveTier(email) === 'privileged';
  const includePrivileged = privileged !== 'exclude';

  // Non-owners scope usage to their workspace; owners see the whole project.
  const { id: workspaceId } = await ensureWorkspace(userId, email || `${userId}@users.noreply`);
  const scope: UsageScope = isOwner
    ? { kind: 'project', includePrivileged }
    : { kind: 'workspace', workspaceId };
  const summary = await getUsageSummary(scope);

  const toggleClass = (active: boolean) =>
    `rounded-lg border px-3 py-1.5 font-medium transition-colors ${
      active ? 'border-foreground/30 bg-foreground/5' : 'border-foreground/15 hover:bg-foreground/5'
    }`;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-10 xl:max-w-5xl">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h1 className="font-bold text-2xl tracking-tight">{t('title')}</h1>
          <PageHelp body={t('help')} />
        </div>
        <p className="text-foreground/70 text-sm">{isOwner ? t('hintOwner') : t('hint')}</p>
      </div>

      {/* Two-column on xl: the BYOK key in a side column, usage (with its wide
          per-model table) in the main column; stacked below xl. */}
      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[280px_minmax(0,1fr)] xl:items-start">
        <ByokForm />

        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-base">{t('usageTitle')}</h2>
            {isOwner && (
              <div className="flex gap-2 text-xs">
                <Link href="/account" className={toggleClass(includePrivileged)}>
                  {tUsage('includePrivileged')}
                </Link>
                <Link
                  href="/account?privileged=exclude"
                  className={toggleClass(!includePrivileged)}
                >
                  {tUsage('excludePrivileged')}
                </Link>
              </div>
            )}
          </div>
          <UsageSummary summary={summary} />
        </section>
      </div>
    </main>
  );
}
