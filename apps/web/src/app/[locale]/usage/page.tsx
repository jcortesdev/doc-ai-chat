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

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-foreground/10 p-4">
      <div className="text-foreground/70 text-xs uppercase tracking-wide">{label}</div>
      <div className="mt-1 font-mono font-semibold text-lg tabular-nums">{value}</div>
    </div>
  );
}

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

export default async function UsagePage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { privileged } = await searchParams;
  const t = await getTranslations('usage');

  const { userId } = await auth();
  if (!userId) {
    redirect(`/${locale}/sign-in`);
  }
  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? '';
  const isOwner = resolveTier(email) === 'privileged';
  const includePrivileged = privileged !== 'exclude';

  let scope: UsageScope;
  if (isOwner) {
    scope = { kind: 'project', includePrivileged };
  } else {
    const { id: workspaceId } = await ensureWorkspace(userId, email);
    scope = { kind: 'workspace', workspaceId };
  }
  const summary = await getUsageSummary(scope);

  const toggleClass = (active: boolean) =>
    `rounded-lg border px-3 py-1.5 font-medium transition-colors ${
      active ? 'border-foreground/30 bg-foreground/5' : 'border-foreground/15 hover:bg-foreground/5'
    }`;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-10">
      <div className="flex flex-col gap-1">
        <h1 className="font-bold text-2xl tracking-tight">{t('title')}</h1>
        <p className="text-foreground/70 text-sm">{isOwner ? t('hintOwner') : t('hint')}</p>
      </div>

      {isOwner && (
        <div className="flex gap-2 text-xs">
          <Link href="/usage" className={toggleClass(includePrivileged)}>
            {t('includePrivileged')}
          </Link>
          <Link href="/usage?privileged=exclude" className={toggleClass(!includePrivileged)}>
            {t('excludePrivileged')}
          </Link>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Metric label={t('totalCost')} value={`$${summary.totalCostUsd.toFixed(6)}`} />
        <Metric label={t('calls')} value={summary.totalCalls.toLocaleString()} />
        <Metric
          label={t('tokens')}
          value={(summary.totalInputTokens + summary.totalOutputTokens).toLocaleString()}
        />
        <Metric label={t('p50')} value={seconds(summary.p50Ms)} />
        <Metric label={t('p95')} value={seconds(summary.p95Ms)} />
      </div>

      {summary.byModel.length === 0 ? (
        <p className="text-foreground/70 text-sm">{t('empty')}</p>
      ) : (
        <div className="flex flex-col gap-2">
          <h2 className="font-semibold text-sm">{t('perModel')}</h2>
          <div className="overflow-x-auto rounded-xl border border-foreground/10">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-foreground/10 border-b text-foreground/70 text-xs">
                  <th className="p-3 text-left font-medium">{t('model')}</th>
                  <th className="p-3 text-right font-medium">{t('calls')}</th>
                  <th className="p-3 text-right font-medium">{t('cost')}</th>
                  <th className="p-3 text-right font-medium">{t('tokens')}</th>
                  <th className="p-3 text-right font-medium">{t('p95')}</th>
                </tr>
              </thead>
              <tbody>
                {summary.byModel.map((row) => (
                  <tr key={row.model} className="border-foreground/5 border-b last:border-0">
                    <td className="p-3 font-mono text-xs">{row.model}</td>
                    <td className="p-3 text-right tabular-nums">{row.calls.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono tabular-nums">
                      ${row.costUsd.toFixed(6)}
                    </td>
                    <td className="p-3 text-right tabular-nums">
                      {(row.inputTokens + row.outputTokens).toLocaleString()}
                    </td>
                    <td className="p-3 text-right tabular-nums">{seconds(row.p95Ms)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </main>
  );
}
