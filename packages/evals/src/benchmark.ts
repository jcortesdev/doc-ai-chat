import type { JudgeFn } from './judge';
import { type RunnerAdapters, runGoldenSet } from './runner';
import type { GoldenSet, Scorecard } from './schema';

// M7's /benchmark report is "the same golden set, run against every configured
// model ref" — this is a thin orchestrator over runGoldenSet, not a second
// scoring pipeline. Same reason runGoldenSet itself is decoupled from
// apps/web's real retrieve/chat/judge calls (packages can't depend on apps,
// and the scoring logic should be unit-testable without a network call):
// retrieval and the judge are shared across every combo (the corpus and the
// grader don't change), only which chat model answers changes per run.
export type BenchmarkAdapters = {
  retrieve: RunnerAdapters['retrieve'];
  // Builds the chat adapter for one model ref — called once per combo, so
  // each resulting Scorecard reflects that specific provider/model's answers.
  chatFor: (modelRef: string) => RunnerAdapters['chat'];
  judge: JudgeFn;
};

export type BenchmarkConfig = {
  // Base id; each combo's Scorecard gets `${runId}-${modelRef}` so the 6
  // outputs don't collide when written to the same report file.
  runId: string;
  judgeModel: string;
  promptVersion: number;
  // The exact combos to run, in order — the M7 CLI script passes
  // `allTierModelRefs()` from `@doc-ai-chat/providers/tier-models` (6 refs: 3
  // providers x 2 tiers), but this stays generic over any list so it's
  // testable without that package as a dependency (packages/evals has no
  // @doc-ai-chat/providers dependency, same layering reason as above).
  modelRefs: string[];
  now?: () => number;
};

// Runs every model ref against the golden set, sequentially — same rationale
// as runGoldenSet's own sequential-not-parallel choice (infrequent runs, keep
// provider rate limits and cost logging simple), just one level up: 6 runs of
// 25 sequential items each, not 6 runs in parallel.
export async function runBenchmark(
  goldenSet: GoldenSet,
  adapters: BenchmarkAdapters,
  config: BenchmarkConfig,
): Promise<Scorecard[]> {
  const scorecards: Scorecard[] = [];
  for (const modelRef of config.modelRefs) {
    const scorecard = await runGoldenSet(
      goldenSet,
      { retrieve: adapters.retrieve, chat: adapters.chatFor(modelRef), judge: adapters.judge },
      {
        runId: `${config.runId}-${modelRef}`,
        chatModel: modelRef,
        judgeModel: config.judgeModel,
        promptVersion: config.promptVersion,
        now: config.now,
      },
    );
    scorecards.push(scorecard);
  }
  return scorecards;
}
