import type { UsageSummary as UsageSummaryData } from '@/lib/usage';
import { getTranslations } from 'next-intl/server';

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-foreground/10 p-4">
      <div className="text-foreground/70 text-xs uppercase tracking-wide">{label}</div>
      <div className="mt-1 font-mono font-semibold text-lg tabular-nums">{value}</div>
    </div>
  );
}

// Renders the usage aggregation (overall metrics + per-model breakdown). Extracted
// from the old /usage page so the unified /account page can share it (pre-M5). The
// owner project-wide toggle stays in the page — it's route-specific navigation.
export async function UsageSummary({ summary }: { summary: UsageSummaryData }) {
  const t = await getTranslations('usage');

  return (
    <div className="flex flex-col gap-4">
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
          <h3 className="font-semibold text-sm">{t('perModel')}</h3>
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
    </div>
  );
}
