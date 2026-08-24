import type { Scorecard } from './schema';

export type SummaryKey = keyof Scorecard['summary'];

export type SummaryDelta = {
  key: SummaryKey;
  baseline: number;
  current: number;
  delta: number;
};

export type ScorecardDiff = {
  deltas: SummaryDelta[];
  regressions: SummaryDelta[];
};

// "Higher is worse" metrics get a max-increase tolerance; every other summary
// field is "higher is better" and gets a max-decrease tolerance. Both read as
// a positive number: the largest movement in the bad direction still allowed
// before diffScorecards flags it as a regression. This is the CI gate's
// tolerance policy (task 10) — loose enough to absorb judge-model noise
// between runs, tight enough to catch a real prompt/retrieval regression.
// Exported (M7) — the benchmark leaderboard (leaderboard.ts) reuses this exact
// list to decide which run "wins" a metric (lowest cost/latency, highest
// everything else). One list, two consumers: the CI regression gate and the
// public benchmark report should never disagree about which direction is good.
export const HIGHER_IS_WORSE: ReadonlySet<SummaryKey> = new Set([
  'total_cost_usd',
  'latency_p50_ms',
  'latency_p95_ms',
]);

const DEFAULT_TOLERANCE: Partial<Record<SummaryKey, number>> = {
  hit_at_k: 0.04,
  mrr: 0.04,
  faithfulness_avg: 0.2,
  answer_relevance_avg: 0.2,
  citation_accuracy_avg: 0.2,
  refusal_correctness_rate: 0.05,
  // Cost/latency swing more run-to-run (provider load, token variance) — a
  // looser relative-feeling absolute tolerance avoids flaky gate failures.
  total_cost_usd: 0.05,
  latency_p50_ms: 2000,
  latency_p95_ms: 4000,
};

export function diffScorecards(
  baseline: Scorecard,
  current: Scorecard,
  tolerance: Partial<Record<SummaryKey, number>> = {},
): ScorecardDiff {
  const merged = { ...DEFAULT_TOLERANCE, ...tolerance };
  const keys = Object.keys(baseline.summary) as SummaryKey[];

  const deltas: SummaryDelta[] = keys.map((key) => ({
    key,
    baseline: baseline.summary[key],
    current: current.summary[key],
    delta: current.summary[key] - baseline.summary[key],
  }));

  const regressions = deltas.filter((entry) => {
    const allowed = merged[entry.key] ?? 0;
    return HIGHER_IS_WORSE.has(entry.key) ? entry.delta > allowed : entry.delta < -allowed;
  });

  return { deltas, regressions };
}

export function formatDiff(diff: ScorecardDiff): string {
  const lines = diff.deltas.map((entry) => {
    const sign = entry.delta >= 0 ? '+' : '';
    const flag = diff.regressions.some((r) => r.key === entry.key) ? '  ⚠ regression' : '';
    return `  ${entry.key}: ${entry.baseline.toFixed(3)} -> ${entry.current.toFixed(3)} (${sign}${entry.delta.toFixed(3)})${flag}`;
  });
  return lines.join('\n');
}
