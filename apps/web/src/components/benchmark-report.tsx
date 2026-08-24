import type { SummaryKey } from '@doc-ai-chat/evals/diff';
import { findMetricWinners, tallyMetricWins } from '@doc-ai-chat/evals/leaderboard';
import type { BenchmarkReport } from '@doc-ai-chat/evals/schema';
import { getTranslations } from 'next-intl/server';

const COLUMNS: SummaryKey[] = [
  'hit_at_k',
  'mrr',
  'faithfulness_avg',
  'answer_relevance_avg',
  'citation_accuracy_avg',
  'refusal_correctness_rate',
  'total_cost_usd',
  'latency_p50_ms',
  'latency_p95_ms',
];

function formatMetric(key: SummaryKey, value: number): string {
  if (key === 'total_cost_usd') {
    return `$${value.toFixed(4)}`;
  }
  if (key === 'latency_p50_ms' || key === 'latency_p95_ms') {
    return `${(value / 1000).toFixed(1)}s`;
  }
  return value.toFixed(2);
}

// Renders the committed benchmark report (M7, ADR-021): one row per model
// combo, one column per Scorecard summary metric, the per-column best value
// starred. The star placement comes from `findMetricWinners` (packages/evals,
// pure + unit-tested) — this component only formats and lays out numbers it's
// handed, it never decides who "wins" anything itself.
export async function BenchmarkReportView({ report }: { report: BenchmarkReport }) {
  const t = await getTranslations('benchmark');
  const winners = findMetricWinners(report.runs);
  const winnerByKey = new Map(winners.map((w) => [w.key, w.chatModels]));
  const tally = tallyMetricWins(winners);
  // Same tie-honesty fix as the table's stars: if two models share the top
  // win count, name both rather than whichever happened to sort first.
  const topCount = tally[0]?.metricsWon;
  const leaders = tally.filter((entry) => entry.metricsWon === topCount);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1 text-foreground/70 text-xs">
        <p>
          {t('meta', {
            date: new Date(report.generated_at).toLocaleDateString(),
            goldenSetVersion: report.golden_set_version,
            judgeModel: report.judge_model,
          })}
        </p>
        {leaders.length === 1 && leaders[0] && (
          <p>
            {t('leaderNote', {
              model: leaders[0].chatModel,
              count: leaders[0].metricsWon,
              total: COLUMNS.length,
            })}
          </p>
        )}
        {leaders.length > 1 && topCount !== undefined && (
          <p>
            {t('leaderNoteTied', {
              models: leaders.map((entry) => entry.chatModel).join(', '),
              count: topCount,
              total: COLUMNS.length,
            })}
          </p>
        )}
      </div>

      {/* overflow-x-auto: 10 columns don't fit a phone screen — the table
          scrolls horizontally inside its own container rather than squeezing
          the whole page (same pattern as usage-summary.tsx's per-model table). */}
      <div className="overflow-x-auto rounded-xl border border-foreground/10">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-foreground/10 border-b text-foreground/70 text-xs">
              <th className="p-3 text-left font-medium">{t('col.model')}</th>
              {COLUMNS.map((key) => (
                <th key={key} className="whitespace-nowrap p-3 text-right font-medium">
                  {t(`col.${key}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {report.runs.map((run) => (
              <tr key={run.chat_model} className="border-foreground/5 border-b last:border-0">
                <td className="whitespace-nowrap p-3 font-mono text-xs">{run.chat_model}</td>
                {COLUMNS.map((key) => {
                  const isWinner = (winnerByKey.get(key) ?? []).includes(run.chat_model);
                  return (
                    <td
                      key={key}
                      className={`p-3 text-right font-mono tabular-nums ${
                        isWinner ? 'font-semibold text-foreground' : 'text-foreground/70'
                      }`}
                    >
                      {formatMetric(key, run.summary[key])}
                      {isWinner && (
                        <>
                          <span aria-hidden="true"> ★</span>
                          <span className="sr-only"> ({t('best')})</span>
                        </>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-foreground/60 text-xs leading-relaxed">{t('methodologyNote')}</p>
    </div>
  );
}
