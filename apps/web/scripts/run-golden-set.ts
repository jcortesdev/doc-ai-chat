// Live wiring for the M5 eval runner: connects packages/evals' pure
// runGoldenSet orchestrator to the real retrieval + chat + judge pipeline.
// Lives in apps/web (not packages/evals) because it needs DATABASE_URL,
// hybridRetrieve, and the chat model resolvers — apps depend on packages here,
// not the reverse (ADR-001's layering).
//
// Requires (see .env.example):
//   DATABASE_URL, VOYAGE_API_KEY, COHERE_API_KEY  — retrieval
//   GATE_PRIMARY_MODEL, EVAL_JUDGE_MODEL           — provider:model_id (ADR-016)
//   EVAL_WORKSPACE_ID                              — a workspace pre-seeded
//     with the 5 packages/evals/fixtures/*.pdf ingested (see fixtures/README.md)
//
// Run: pnpm --filter @doc-ai-chat/web eval:run [-- --out path.json] [--baseline path.json]
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { hybridRetrieve } from '@/lib/hybrid-retrieve';
import { diffScorecards, formatDiff } from '@doc-ai-chat/evals/diff';
import { createAiSdkJudge } from '@doc-ai-chat/evals/judge';
import { type RunnerAdapters, runGoldenSet } from '@doc-ai-chat/evals/runner';
import { GoldenSet } from '@doc-ai-chat/evals/schema';
import { EVALS_ROOT, GOLDEN_SET_PATH } from '@doc-ai-chat/evals/validate-golden-set';
import {
  PROMPT_RAG_ANSWER_V2,
  RAG_ANSWER_VERSION,
  buildRagUserTurn,
  languageDirective,
} from '@doc-ai-chat/prompts/rag-answer';
import { resolveChatModel } from '@doc-ai-chat/providers/chat-model';
import { resolveJudgeModel } from '@doc-ai-chat/providers/judge-model';
import { computeCostUsd, computeRerankCostUsd } from '@doc-ai-chat/providers/price-table';
import { generateText } from 'ai';

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required to run the golden set (see .env.example).`);
  return value;
}

function buildAdapters(): RunnerAdapters {
  const workspaceId = requiredEnv('EVAL_WORKSPACE_ID');
  const chatModelRef = requiredEnv('GATE_PRIMARY_MODEL');
  const judgeModelRef = requiredEnv('EVAL_JUDGE_MODEL');
  const chatModel = resolveChatModel(chatModelRef);
  const judgeModel = resolveJudgeModel(judgeModelRef);
  const chatModelId = chatModelRef.split(':').slice(1).join(':');

  return {
    async retrieve(item) {
      const { hits, embedCostUsd, rerankCostUsd } = await hybridRetrieve(
        item.question,
        workspaceId,
        {
          topN: 5,
        },
      );
      return {
        hits: hits.map((hit) => ({ content: hit.content })),
        citedChunks: hits.map((hit, i) => ({ label: i + 1, content: hit.content })),
        costUsd: embedCostUsd + rerankCostUsd,
      };
    },
    async chat(item, citedChunks) {
      const system = `${PROMPT_RAG_ANSWER_V2}\n\n${languageDirective(item.lang)}`;
      const userTurn = buildRagUserTurn(
        item.question,
        citedChunks.map((chunk) => ({ page: null, content: chunk.content })),
      );
      const { text, usage } = await generateText({
        model: chatModel,
        system,
        prompt: userTurn,
      });
      const costUsd = computeCostUsd(chatModelId, usage.inputTokens ?? 0, usage.outputTokens ?? 0);
      return { answer: text, costUsd };
    },
    judge: createAiSdkJudge(judgeModel),
  };
}

// Rerank cost isn't tracked per-call by hybridRetrieve's return shape at the
// caller level beyond its own cost accounting; kept here as a single place to
// revisit if computeRerankCostUsd needs to be threaded through for a more
// precise per-item breakdown than hybridRetrieve's aggregate costUsd.
void computeRerankCostUsd;

// `pnpm --filter @doc-ai-chat/web eval:run` runs with cwd = apps/web, so a
// relative --out/--baseline path (e.g. "packages/evals/scorecards/x.json",
// written from the repo root's point of view) must resolve against the repo
// root, not apps/web — otherwise it silently lands under apps/web/packages/....
// path.resolve leaves an already-absolute path untouched, so this is safe
// either way.
const REPO_ROOT = path.resolve(EVALS_ROOT, '..', '..');

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf('--out');
  const baselineIndex = args.indexOf('--baseline');
  const outPath = outIndex !== -1 ? path.resolve(REPO_ROOT, args[outIndex + 1] ?? '') : undefined;
  const baselinePath =
    baselineIndex !== -1 ? path.resolve(REPO_ROOT, args[baselineIndex + 1] ?? '') : undefined;

  const goldenSet = GoldenSet.parse(JSON.parse(await readFile(GOLDEN_SET_PATH, 'utf-8')));
  const chatModelRef = requiredEnv('GATE_PRIMARY_MODEL');
  const judgeModelRef = requiredEnv('EVAL_JUDGE_MODEL');

  const scorecard = await runGoldenSet(goldenSet, buildAdapters(), {
    runId: new Date().toISOString(),
    chatModel: chatModelRef,
    judgeModel: judgeModelRef,
    promptVersion: RAG_ANSWER_VERSION,
  });

  console.log(JSON.stringify(scorecard.summary, null, 2));

  if (outPath) {
    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(outPath, JSON.stringify(scorecard, null, 2));
    console.log(`Wrote scorecard to ${outPath}`);
  }

  if (baselinePath) {
    const baseline = JSON.parse(await readFile(baselinePath, 'utf-8'));
    const diff = diffScorecards(baseline, scorecard);
    console.log('\nDiff vs baseline:');
    console.log(formatDiff(diff));
    if (diff.regressions.length > 0) {
      console.error(
        `\n${diff.regressions.length} regression(s) beyond tolerance — failing the gate.`,
      );
      process.exitCode = 1;
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
