import { describe, expect, it } from 'vitest';
import type { BenchmarkAdapters } from './benchmark';
import { runBenchmark } from './benchmark';
import type { GoldenSet } from './schema';

const goldenSet: GoldenSet = {
  version: '1.0.0-test',
  created_at: '2026-06-11',
  description: 'test set',
  documents: [
    {
      id: 'doc-a',
      file: 'doc-a.pdf',
      source_md: 'sources/doc-a.md',
      lang: 'en',
      type: 'manual',
      title: 'Doc A',
    },
  ],
  composition: { factual_single_hop: 1, total: 1, in_spanish: 0 },
  items: [
    {
      id: 'F1',
      type: 'factual_single_hop',
      lang: 'en',
      doc_id: 'doc-a',
      question: 'What is X?',
      expected_chunk_label: 'Section 1',
      expected_chunk_match: 'X is a thing',
      expected_answer_summary: 'X is a thing.',
    },
  ],
};

// Each model ref gets a distinct fake cost/answer so the test can tell the 3
// resulting scorecards apart — the point of chatFor is exactly that each
// combo's chat adapter is free to behave differently (a real model would).
function fakeAdapters(): BenchmarkAdapters {
  return {
    retrieve: async () => ({
      hits: [{ content: 'X is a thing, definitely.' }],
      citedChunks: [{ label: 1, content: 'X is a thing, definitely.' }],
      costUsd: 0.001,
    }),
    chatFor: (modelRef) => async () => ({
      answer: `X is a thing, per ${modelRef}. [1]`,
      costUsd: modelRef.includes('flagship') ? 0.05 : 0.005,
    }),
    judge: async () => ({
      faithfulness: { score: 5, rationale: 'grounded' },
      answer_relevance: { score: 5, rationale: 'on point' },
      citation_accuracy: { score: 5, rationale: 'correct citation' },
    }),
  };
}

describe('runBenchmark', () => {
  it('runs the golden set once per model ref, sequentially, sharing retrieve/judge', async () => {
    const modelRefs = [
      'anthropic:claude-sonnet-4-6',
      'anthropic:claude-opus-4-7-flagship',
      'openai:gpt-5',
    ];
    const scorecards = await runBenchmark(goldenSet, fakeAdapters(), {
      runId: 'bench',
      judgeModel: 'openai:gpt-5-mini',
      promptVersion: 2,
      modelRefs,
    });

    expect(scorecards).toHaveLength(3);
    expect(scorecards.map((s) => s.chat_model)).toEqual(modelRefs);
    // run_id namespaced per combo so writing all 6 to one report never collides.
    expect(scorecards.map((s) => s.run_id)).toEqual(modelRefs.map((ref) => `bench-${ref}`));

    const [sonnet, opus, gpt5] = scorecards;
    expect(sonnet?.entries[0]?.answer).toContain('anthropic:claude-sonnet-4-6');
    expect(sonnet?.summary.total_cost_usd).toBeCloseTo(0.006); // 0.001 retrieve + 0.005 chat
    expect(opus?.summary.total_cost_usd).toBeCloseTo(0.051); // flagship-priced fake
    expect(gpt5?.judge_model).toBe('openai:gpt-5-mini');
  });

  it('returns an empty array for an empty model ref list', async () => {
    const scorecards = await runBenchmark(goldenSet, fakeAdapters(), {
      runId: 'bench',
      judgeModel: 'openai:gpt-5-mini',
      promptVersion: 2,
      modelRefs: [],
    });
    expect(scorecards).toEqual([]);
  });
});
