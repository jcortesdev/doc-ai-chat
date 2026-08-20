// M7 benchmark: runs the golden set once per model ref (3 providers x 2 tiers,
// ADR-021) and writes a committed report artifact for the public /benchmark
// page. Mirrors run-golden-set.ts's live-wiring pattern (same reason it lives
// in apps/web, not packages/evals — needs DATABASE_URL/hybridRetrieve/the
// model resolvers; apps depend on packages, not the reverse, ADR-001).
//
// Unlike eval:run, this is NOT a CI gate — it's a report you regenerate by
// hand when a model changes, review, and commit (ADR-021: a live-triggered
// version would mean exposing a paid 6x-golden-set-run button to the public,
// which every other eval/gate path in this app deliberately avoids, ADR-006).
//
// Requires (see .env.example):
//   DATABASE_URL, VOYAGE_API_KEY, COHERE_API_KEY   — retrieval
//   ANTHROPIC_API_KEY, OPENAI_API_KEY, DEEPSEEK_API_KEY — the 3 chat providers
//   EVAL_JUDGE_MODEL                                — provider:model_id (ADR-016)
//   EVAL_WORKSPACE_ID                                — same pre-seeded eval
//     workspace M5's eval:run uses (5 packages/evals/fixtures/*.pdf ingested)
//   BENCHMARK_MODEL_REFS (optional)                  — CSV override of the 6
//     refs; defaults to tier-models.ts's allTierModelRefs()
//
// Run: pnpm --filter @doc-ai-chat/web bench:run [-- --out path.json]
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { hybridRetrieve } from '@/lib/hybrid-retrieve';
import type { BenchmarkAdapters } from '@doc-ai-chat/evals/benchmark';
import { runBenchmark } from '@doc-ai-chat/evals/benchmark';
import { createAiSdkJudge } from '@doc-ai-chat/evals/judge';
import type { RunnerAdapters } from '@doc-ai-chat/evals/runner';
import { GoldenSet, type Scorecard } from '@doc-ai-chat/evals/schema';
import { EVALS_ROOT, GOLDEN_SET_PATH } from '@doc-ai-chat/evals/validate-golden-set';
import {
  PROMPT_RAG_ANSWER_V2,
  RAG_ANSWER_VERSION,
  buildRagUserTurn,
  languageDirective,
} from '@doc-ai-chat/prompts/rag-answer';
import { resolveChatModel } from '@doc-ai-chat/providers/chat-model';
import { resolveJudgeModel } from '@doc-ai-chat/providers/judge-model';
import { computeCostUsd } from '@doc-ai-chat/providers/price-table';
import { allTierModelRefs } from '@doc-ai-chat/providers/tier-models';
import { generateText } from 'ai';

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required to run the benchmark (see .env.example).`);
  return value;
}

// The exact 6 combos to run. Defaults to every provider x tier tier-models.ts
// knows about; BENCHMARK_MODEL_REFS lets you run a subset while iterating
// (e.g. one provider) without waiting for all 6 real runs each time.
function modelRefsToRun(): string[] {
  const override = process.env.BENCHMARK_MODEL_REFS;
  if (!override) {
    return allTierModelRefs();
  }
  return override
    .split(',')
    .map((ref) => ref.trim())
    .filter(Boolean);
}

// Retrieval doesn't depend on which chat model is under test — the same
// question against the same corpus returns the same hits regardless. Without
// this cache, runBenchmark's 6 sequential runGoldenSet calls would each
// re-embed + re-rerank all 25 questions: 150 Voyage/Cohere calls to produce
// 25 *distinct* retrieval results, repeated 6 times over. Caching by item id
// cuts that to the real 25 — a cache hit returns costUsd: 0 since no network
// call actually happened for it.
function buildCachedRetrieve(workspaceId: string): RunnerAdapters['retrieve'] {
  const cache = new Map<string, Awaited<ReturnType<RunnerAdapters['retrieve']>>>();
  return async (item) => {
    const cached = cache.get(item.id);
    if (cached) {
      return { ...cached, costUsd: 0 };
    }
    const { hits, embedCostUsd, rerankCostUsd } = await hybridRetrieve(item.question, workspaceId, {
      topN: 5,
    });
    const turn = {
      hits: hits.map((hit) => ({ content: hit.content })),
      citedChunks: hits.map((hit, i) => ({ label: i + 1, content: hit.content })),
      costUsd: embedCostUsd + rerankCostUsd,
    };
    cache.set(item.id, turn);
    return turn;
  };
}

function buildAdapters(): BenchmarkAdapters {
  const workspaceId = requiredEnv('EVAL_WORKSPACE_ID');
  const judgeModelRef = requiredEnv('EVAL_JUDGE_MODEL');
  const judgeModel = resolveJudgeModel(judgeModelRef);

  return {
    retrieve: buildCachedRetrieve(workspaceId),
    chatFor(modelRef) {
      // Project-paid, never BYOK (same trust boundary as GATE_PRIMARY_MODEL —
      // the benchmark is infra cost the owner absorbs to publish the report,
      // ADR-006), so resolveChatModel is called with no userApiKey.
      const chatModel = resolveChatModel(modelRef);
      const chatModelId = modelRef.split(':').slice(1).join(':');
      // runGoldenSet (packages/evals) is deliberately silent per-item — it's a
      // pure function the M5 CI gate can call without caring about console
      // output. A 3-6x sequential run is long enough that "no output for
      // several minutes" reads as hung, so this script (not the shared
      // package) logs a `.` per completed question — visible progress without
      // touching the pure runner.
      let completed = 0;
      return async (item, citedChunks) => {
        const system = `${PROMPT_RAG_ANSWER_V2}\n\n${languageDirective(item.lang)}`;
        const userTurn = buildRagUserTurn(
          item.question,
          citedChunks.map((chunk) => ({ page: null, content: chunk.content })),
        );
        const { text, usage } = await generateText({ model: chatModel, system, prompt: userTurn });
        const costUsd = computeCostUsd(
          chatModelId,
          usage.inputTokens ?? 0,
          usage.outputTokens ?? 0,
        );
        completed += 1;
        process.stdout.write('.');
        if (completed % 25 === 0) {
          process.stdout.write(` ${modelRef}: ${completed} done\n`);
        }
        return { answer: text, costUsd };
      };
    },
    judge: createAiSdkJudge(judgeModel),
  };
}

const REPO_ROOT = path.resolve(EVALS_ROOT, '..', '..');
const DEFAULT_OUT_PATH = path.resolve(EVALS_ROOT, 'benchmark-results', 'latest.json');

export type BenchmarkReport = {
  generated_at: string;
  golden_set_version: string;
  judge_model: string;
  runs: Scorecard[];
};

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf('--out');
  const outPath =
    outIndex !== -1 ? path.resolve(REPO_ROOT, args[outIndex + 1] ?? '') : DEFAULT_OUT_PATH;

  const goldenSet = GoldenSet.parse(JSON.parse(await readFile(GOLDEN_SET_PATH, 'utf-8')));
  const judgeModelRef = requiredEnv('EVAL_JUDGE_MODEL');
  const modelRefs = modelRefsToRun();

  console.log(`Running the golden set against ${modelRefs.length} model(s):`);
  for (const ref of modelRefs) {
    console.log(`  - ${ref}`);
  }

  const runs = await runBenchmark(goldenSet, buildAdapters(), {
    runId: new Date().toISOString(),
    judgeModel: judgeModelRef,
    promptVersion: RAG_ANSWER_VERSION,
    modelRefs,
  });

  for (const run of runs) {
    console.log(`\n${run.chat_model}`);
    console.log(JSON.stringify(run.summary, null, 2));
  }

  const report: BenchmarkReport = {
    generated_at: new Date().toISOString(),
    golden_set_version: goldenSet.version,
    judge_model: judgeModelRef,
    runs,
  };

  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(report, null, 2));
  console.log(`\nWrote benchmark report to ${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
