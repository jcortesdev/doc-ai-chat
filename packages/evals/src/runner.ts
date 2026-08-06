import type { JudgeFn } from './judge';
import { judgeAnswer } from './judge';
import { scoreRefusalCorrectness, summarizeRefusalCorrectness } from './refusal-correctness';
import type { RankedHit } from './retrieval-metrics';
import { scoreRetrieval, summarizeRetrieval } from './retrieval-metrics';
import type { GoldenItem, GoldenSet, Scorecard, ScorecardEntry } from './schema';
import { itemDocIds } from './schema';

// One retrieved+cited turn for a golden item. `hits` is the full reranked list
// (for hit@k / MRR); `citedChunks` is what the chat model actually saw in its
// <retrieved_context> block, in citation-label order (what the judge scores
// citation_accuracy against).
export type RetrievalTurn = {
  hits: RankedHit[];
  citedChunks: { label: number; content: string }[];
  costUsd: number;
};

export type ChatTurn = {
  answer: string;
  costUsd: number;
};

// Runner is deliberately decoupled from the real retrieval/chat pipeline
// (apps/web's hybridRetrieve + streamText call): packages/evals cannot depend
// on apps/web (apps depend on packages, not the reverse), and network calls
// don't belong in this package's unit tests. `retrieve`/`chat` are injected so
// the scoring logic is fully unit-testable with fakes; the live wiring lives
// in a small adapter script inside apps/web that calls `runGoldenSet` with
// real functions.
export type RunnerAdapters = {
  retrieve: (item: GoldenItem, docIds: string[]) => Promise<RetrievalTurn>;
  chat: (item: GoldenItem, citedChunks: { label: number; content: string }[]) => Promise<ChatTurn>;
  judge: JudgeFn;
};

export type RunnerConfig = {
  runId: string;
  chatModel: string;
  judgeModel: string;
  promptVersion: number;
  now?: () => number;
};

function percentile(sortedMs: number[], p: number): number {
  if (sortedMs.length === 0) return 0;
  const index = Math.min(sortedMs.length - 1, Math.ceil((p / 100) * sortedMs.length) - 1);
  return sortedMs[Math.max(0, index)] ?? 0;
}

async function scoreItem(
  item: GoldenItem,
  adapters: RunnerAdapters,
  now: () => number,
): Promise<ScorecardEntry> {
  const start = now();
  const docIds = itemDocIds(item);
  const retrieval = await adapters.retrieve(item, docIds);
  const chatResult = await adapters.chat(item, retrieval.citedChunks);
  const latencyMs = now() - start;
  const costUsd = retrieval.costUsd + chatResult.costUsd;

  if (item.type === 'no_answer') {
    return {
      item_id: item.id,
      type: item.type,
      lang: item.lang,
      question: item.question,
      answer: chatResult.answer,
      retrieval: null,
      judge: null,
      refusal_correct: scoreRefusalCorrectness(chatResult.answer),
      cost_usd: costUsd,
      latency_ms: latencyMs,
    };
  }

  const expectedChunkMatch = item.expected_chunk_match;
  if (!expectedChunkMatch) {
    throw new Error(`Golden item "${item.id}" (${item.type}) is missing expected_chunk_match.`);
  }

  const retrievalScore = scoreRetrieval(retrieval.hits, expectedChunkMatch);
  const judgeRubric = await judgeAnswer(adapters.judge, {
    question: item.question,
    citedChunks: retrieval.citedChunks,
    answer: chatResult.answer,
    expectedAnswerSummary: item.expected_answer_summary,
  });

  return {
    item_id: item.id,
    type: item.type,
    lang: item.lang,
    question: item.question,
    answer: chatResult.answer,
    retrieval: retrievalScore,
    judge: judgeRubric,
    refusal_correct: null,
    cost_usd: costUsd,
    latency_ms: latencyMs,
  };
}

// Runs every item in the golden set against the injected adapters and produces
// a scorecard. Items run sequentially (not Promise.all) — golden-set runs are
// infrequent (CI gate, manual calibration), and sequential keeps provider rate
// limits and cost logging simple; parallelism isn't worth the complexity here.
export async function runGoldenSet(
  goldenSet: GoldenSet,
  adapters: RunnerAdapters,
  config: RunnerConfig,
): Promise<Scorecard> {
  const now = config.now ?? Date.now;
  const entries: ScorecardEntry[] = [];
  for (const item of goldenSet.items) {
    entries.push(await scoreItem(item, adapters, now));
  }

  const retrievalScores = entries.map((entry) => entry.retrieval).filter((r) => r !== null);
  const judgeScores = entries.map((entry) => entry.judge).filter((j) => j !== null);
  const refusalResults = entries
    .map((entry) => entry.refusal_correct)
    .filter((r): r is boolean => r !== null);
  const retrievalSummary = summarizeRetrieval(retrievalScores);
  const latenciesSorted = entries.map((entry) => entry.latency_ms).sort((a, b) => a - b);

  const avg = (values: number[]): number =>
    values.length === 0 ? 0 : values.reduce((sum, v) => sum + v, 0) / values.length;

  return {
    run_id: config.runId,
    created_at: new Date(now()).toISOString(),
    golden_set_version: goldenSet.version,
    chat_model: config.chatModel,
    judge_model: config.judgeModel,
    prompt_version: config.promptVersion,
    entries,
    summary: {
      hit_at_k: retrievalSummary.hit_at_k,
      mrr: retrievalSummary.mrr,
      faithfulness_avg: avg(judgeScores.map((j) => j.faithfulness.score)),
      answer_relevance_avg: avg(judgeScores.map((j) => j.answer_relevance.score)),
      citation_accuracy_avg: avg(judgeScores.map((j) => j.citation_accuracy.score)),
      refusal_correctness_rate: summarizeRefusalCorrectness(refusalResults),
      total_cost_usd: entries.reduce((sum, entry) => sum + entry.cost_usd, 0),
      latency_p50_ms: percentile(latenciesSorted, 50),
      latency_p95_ms: percentile(latenciesSorted, 95),
    },
  };
}
