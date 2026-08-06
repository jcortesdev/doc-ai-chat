import { describe, expect, it } from 'vitest';
import type { RunnerAdapters } from './runner';
import { runGoldenSet } from './runner';
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
  composition: { factual_single_hop: 1, no_answer: 1, total: 2, in_spanish: 0 },
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
    {
      id: 'NA1',
      type: 'no_answer',
      lang: 'en',
      doc_id: 'doc-a',
      question: 'Does it support Y?',
      expected_chunk_label: '(none — refusal expected)',
      expected_refusal_patterns: ["i don't", 'not mentioned'],
      expected_answer_summary: 'Refusal expected.',
    },
  ],
};

function fakeAdapters(): RunnerAdapters {
  return {
    retrieve: async (item) => {
      if (item.id === 'F1') {
        return {
          hits: [{ content: 'X is a thing, definitely.' }],
          citedChunks: [{ label: 1, content: 'X is a thing, definitely.' }],
          costUsd: 0.001,
        };
      }
      return { hits: [], citedChunks: [], costUsd: 0.0005 };
    },
    chat: async (item) => {
      if (item.id === 'F1') {
        return { answer: 'X is a thing. [1]', costUsd: 0.002 };
      }
      return { answer: "I couldn't find that in your documents.", costUsd: 0.001 };
    },
    judge: async () => ({
      faithfulness: { score: 5, rationale: 'grounded' },
      answer_relevance: { score: 5, rationale: 'on point' },
      citation_accuracy: { score: 5, rationale: 'correct citation' },
    }),
  };
}

describe('runGoldenSet', () => {
  it('scores a factual item via retrieval + judge, and a no_answer item via refusal', async () => {
    let clock = 1000;
    const now = () => {
      clock += 10;
      return clock;
    };
    const scorecard = await runGoldenSet(goldenSet, fakeAdapters(), {
      runId: 'test-run',
      chatModel: 'anthropic:claude-sonnet-4-6',
      judgeModel: 'openai:gpt-5-mini',
      promptVersion: 2,
      now,
    });

    expect(scorecard.entries).toHaveLength(2);

    const factual = scorecard.entries.find((e) => e.item_id === 'F1');
    expect(factual?.retrieval).toEqual({ hit_at_k: true, rank: 1, mrr: 1 });
    expect(factual?.judge?.faithfulness.score).toBe(5);
    expect(factual?.refusal_correct).toBeNull();
    expect(factual?.cost_usd).toBeCloseTo(0.003);

    const refusal = scorecard.entries.find((e) => e.item_id === 'NA1');
    expect(refusal?.refusal_correct).toBe(true);
    expect(refusal?.retrieval).toBeNull();
    expect(refusal?.judge).toBeNull();

    expect(scorecard.summary.hit_at_k).toBe(1);
    expect(scorecard.summary.mrr).toBe(1);
    expect(scorecard.summary.faithfulness_avg).toBe(5);
    expect(scorecard.summary.refusal_correctness_rate).toBe(1);
    expect(scorecard.summary.total_cost_usd).toBeCloseTo(0.0045);
    expect(scorecard.summary.latency_p50_ms).toBeGreaterThan(0);
    expect(scorecard.golden_set_version).toBe('1.0.0-test');
  });

  it('throws a clear error when a non-refusal item is missing expected_chunk_match', async () => {
    const brokenSet: GoldenSet = {
      ...goldenSet,
      items: [
        {
          id: 'F2',
          type: 'factual_single_hop',
          lang: 'en',
          doc_id: 'doc-a',
          question: 'What is Z?',
          expected_chunk_label: 'Section 1',
          expected_answer_summary: 'Z is a thing.',
        },
      ],
    };
    await expect(
      runGoldenSet(brokenSet, fakeAdapters(), {
        runId: 'test-run',
        chatModel: 'anthropic:claude-sonnet-4-6',
        judgeModel: 'openai:gpt-5-mini',
        promptVersion: 2,
      }),
    ).rejects.toThrow(/missing expected_chunk_match/);
  });
});
