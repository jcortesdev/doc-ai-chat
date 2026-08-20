import { HIGHER_IS_WORSE, type SummaryKey } from './diff';
import type { Scorecard } from './schema';

export type MetricWinner = {
  key: SummaryKey;
  // Every chat_model that hit the best value for this metric — a genuine tie
  // (e.g. two providers both averaging a perfect 5.00 faithfulness score) is
  // NOT broken in favor of whichever run happened to come first. An earlier
  // version did exactly that (arbitrary-but-deterministic first-in-list
  // tie-break) and it reads as a bug on a rendered table: two cells showing
  // the identical number, only one carrying a star. Found live on the
  // /benchmark page's "Relevance" column (both Anthropic and DeepSeek at
  // 5.00) — fixed by reporting every model that ties for best, not one.
  chatModels: string[];
  value: number;
};

const TIE_EPSILON = 1e-9;

function approxEquals(a: number, b: number): boolean {
  return Math.abs(a - b) < TIE_EPSILON;
}

// For each summary metric, finds every run's chat_model at the best value —
// lowest for cost/latency (HIGHER_IS_WORSE, shared with the CI regression
// gate's tolerance policy), highest for everything else.
//
// Pure, unit-tested — this is the derivation the /benchmark page's "who wins
// what" table renders, so the report stays honest and reproducible: change
// the underlying data (a re-run, a new model), the winners recompute, nobody
// has to remember to update hardcoded prose (that was the whole point of
// keeping this out of the UI layer, ADR-021).
export function findMetricWinners(runs: Scorecard[]): MetricWinner[] {
  const [first, ...rest] = runs;
  if (!first) {
    return [];
  }
  const keys = Object.keys(first.summary) as SummaryKey[];
  return keys.map((key) => {
    const lowerIsBetter = HIGHER_IS_WORSE.has(key);
    let bestValue = first.summary[key];
    for (const run of rest) {
      const better = lowerIsBetter ? run.summary[key] < bestValue : run.summary[key] > bestValue;
      if (better) {
        bestValue = run.summary[key];
      }
    }
    const chatModels = runs
      .filter((run) => approxEquals(run.summary[key], bestValue))
      .map((run) => run.chat_model);
    return { key, chatModels, value: bestValue };
  });
}

export type LeaderboardTally = {
  chatModel: string;
  metricsWon: number;
};

// Tallies how many metrics each chat_model won (or tied for), sorted
// most-wins-first — the data behind a sentence like "X led on N of M
// measured metrics in this run." A tie counts as a win for every model that
// shares it, same as the table's stars. Deliberately does NOT try to declare
// an overall "winner" beyond that count; with judge-score ceiling effects
// already flagged (M5), a raw win-count isn't a rigorous ranking, just a
// transparent summary of the same table.
export function tallyMetricWins(winners: MetricWinner[]): LeaderboardTally[] {
  const counts = new Map<string, number>();
  for (const winner of winners) {
    for (const chatModel of winner.chatModels) {
      counts.set(chatModel, (counts.get(chatModel) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([chatModel, metricsWon]) => ({ chatModel, metricsWon }))
    .sort((a, b) => b.metricsWon - a.metricsWon);
}
