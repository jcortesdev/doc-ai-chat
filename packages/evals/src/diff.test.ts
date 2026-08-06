import { describe, expect, it } from 'vitest';
import { diffScorecards, formatDiff } from './diff';
import type { Scorecard } from './schema';

function makeScorecard(summary: Partial<Scorecard['summary']> = {}): Scorecard {
  return {
    run_id: 'r1',
    created_at: '2026-06-11T00:00:00.000Z',
    golden_set_version: '1.0.0',
    chat_model: 'anthropic:claude-sonnet-4-6',
    judge_model: 'openai:gpt-5-mini',
    prompt_version: 2,
    entries: [],
    summary: {
      hit_at_k: 0.9,
      mrr: 0.85,
      faithfulness_avg: 4.5,
      answer_relevance_avg: 4.5,
      citation_accuracy_avg: 4.5,
      refusal_correctness_rate: 1,
      total_cost_usd: 0.1,
      latency_p50_ms: 1000,
      latency_p95_ms: 2000,
      ...summary,
    },
  };
}

describe('diffScorecards', () => {
  it('reports no regressions when scores hold steady', () => {
    const diff = diffScorecards(makeScorecard(), makeScorecard());
    expect(diff.regressions).toEqual([]);
  });

  it('reports no regression for a small drop within tolerance', () => {
    const diff = diffScorecards(
      makeScorecard({ hit_at_k: 0.9 }),
      makeScorecard({ hit_at_k: 0.88 }),
    );
    expect(diff.regressions).toEqual([]);
  });

  it('flags a hit_at_k drop beyond tolerance', () => {
    const diff = diffScorecards(makeScorecard({ hit_at_k: 0.9 }), makeScorecard({ hit_at_k: 0.7 }));
    expect(diff.regressions.map((r) => r.key)).toContain('hit_at_k');
  });

  it('flags a faithfulness drop beyond tolerance', () => {
    const diff = diffScorecards(
      makeScorecard({ faithfulness_avg: 4.5 }),
      makeScorecard({ faithfulness_avg: 3.5 }),
    );
    expect(diff.regressions.map((r) => r.key)).toContain('faithfulness_avg');
  });

  it('does not flag an improvement', () => {
    const diff = diffScorecards(
      makeScorecard({ hit_at_k: 0.7 }),
      makeScorecard({ hit_at_k: 0.95 }),
    );
    expect(diff.regressions).toEqual([]);
  });

  it('treats cost and latency increases as the "worse" direction', () => {
    const diff = diffScorecards(
      makeScorecard({ total_cost_usd: 0.1 }),
      makeScorecard({ total_cost_usd: 0.3 }),
    );
    expect(diff.regressions.map((r) => r.key)).toContain('total_cost_usd');
  });

  it('does not flag a cost decrease', () => {
    const diff = diffScorecards(
      makeScorecard({ total_cost_usd: 0.3 }),
      makeScorecard({ total_cost_usd: 0.1 }),
    );
    expect(diff.regressions).toEqual([]);
  });

  it('respects a custom tolerance override', () => {
    const diff = diffScorecards(
      makeScorecard({ hit_at_k: 0.9 }),
      makeScorecard({ hit_at_k: 0.88 }),
      { hit_at_k: 0.01 },
    );
    expect(diff.regressions.map((r) => r.key)).toContain('hit_at_k');
  });
});

describe('formatDiff', () => {
  it('marks regressed rows with a warning', () => {
    const diff = diffScorecards(makeScorecard({ hit_at_k: 0.9 }), makeScorecard({ hit_at_k: 0.7 }));
    const output = formatDiff(diff);
    expect(output).toContain('hit_at_k');
    expect(output).toContain('regression');
  });
});
