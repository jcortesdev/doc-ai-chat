import { describe, expect, it } from 'vitest';
import { findMetricWinners, tallyMetricWins } from './leaderboard';
import type { Scorecard } from './schema';

function fakeScorecard(chatModel: string, overrides: Partial<Scorecard['summary']>): Scorecard {
  return {
    run_id: `run-${chatModel}`,
    created_at: '2026-08-20T00:00:00.000Z',
    golden_set_version: '1.0.0',
    chat_model: chatModel,
    judge_model: 'openai:gpt-5',
    prompt_version: 2,
    entries: [],
    summary: {
      hit_at_k: 0.9,
      mrr: 0.8,
      faithfulness_avg: 5,
      answer_relevance_avg: 5,
      citation_accuracy_avg: 5,
      refusal_correctness_rate: 0.75,
      total_cost_usd: 0.05,
      latency_p50_ms: 3000,
      latency_p95_ms: 6000,
      ...overrides,
    },
  };
}

describe('findMetricWinners', () => {
  it('picks the lowest value for cost/latency and the highest for everything else', () => {
    const runs = [
      fakeScorecard('anthropic:claude-sonnet-4-6', {
        total_cost_usd: 0.22,
        latency_p50_ms: 4549,
        refusal_correctness_rate: 0.75,
      }),
      fakeScorecard('openai:gpt-5-mini', {
        total_cost_usd: 0.039,
        latency_p50_ms: 4737,
        refusal_correctness_rate: 0.75,
      }),
      fakeScorecard('deepseek:deepseek-v4-flash', {
        total_cost_usd: 0.007,
        latency_p50_ms: 2097,
        refusal_correctness_rate: 1,
      }),
    ];

    const winners = findMetricWinners(runs);
    const byKey = Object.fromEntries(winners.map((w) => [w.key, w]));

    expect(byKey.total_cost_usd?.chatModels).toEqual(['deepseek:deepseek-v4-flash']);
    expect(byKey.latency_p50_ms?.chatModels).toEqual(['deepseek:deepseek-v4-flash']);
    expect(byKey.refusal_correctness_rate?.chatModels).toEqual(['deepseek:deepseek-v4-flash']);
  });

  it('reports every model that ties for the best value, not just the first', () => {
    // Regression: found live on /benchmark — Anthropic and DeepSeek both
    // scored answer_relevance_avg 5.00, but the table starred only Anthropic
    // (it came first in the input array). Both should be reported.
    const runs = [
      fakeScorecard('anthropic:claude-sonnet-4-6', { answer_relevance_avg: 5 }),
      fakeScorecard('openai:gpt-5-mini', { answer_relevance_avg: 4.95 }),
      fakeScorecard('deepseek:deepseek-v4-flash', { answer_relevance_avg: 5 }),
    ];
    const winners = findMetricWinners(runs);
    const relevance = winners.find((w) => w.key === 'answer_relevance_avg');
    expect(relevance?.chatModels).toEqual([
      'anthropic:claude-sonnet-4-6',
      'deepseek:deepseek-v4-flash',
    ]);
  });

  it('reports every model when all of them tie', () => {
    const runs = [
      fakeScorecard('anthropic:claude-sonnet-4-6', { faithfulness_avg: 5 }),
      fakeScorecard('openai:gpt-5-mini', { faithfulness_avg: 5 }),
    ];
    const winners = findMetricWinners(runs);
    const faithfulness = winners.find((w) => w.key === 'faithfulness_avg');
    expect(faithfulness?.chatModels).toEqual(['anthropic:claude-sonnet-4-6', 'openai:gpt-5-mini']);
  });

  it('returns an empty array for no runs', () => {
    expect(findMetricWinners([])).toEqual([]);
  });
});

describe('tallyMetricWins', () => {
  it('counts wins per model, sorted most-wins-first', () => {
    const runs = [
      fakeScorecard('anthropic:claude-sonnet-4-6', {
        total_cost_usd: 0.22,
        latency_p50_ms: 4549,
        latency_p95_ms: 10796,
        faithfulness_avg: 4.9,
        refusal_correctness_rate: 0.75,
      }),
      fakeScorecard('deepseek:deepseek-v4-flash', {
        total_cost_usd: 0.007,
        latency_p50_ms: 2097,
        latency_p95_ms: 5454,
        faithfulness_avg: 5,
        refusal_correctness_rate: 1,
      }),
    ];
    const tally = tallyMetricWins(findMetricWinners(runs));
    expect(tally[0]?.chatModel).toBe('deepseek:deepseek-v4-flash');
    expect(tally[0]?.metricsWon).toBeGreaterThan(tally[1]?.metricsWon ?? 0);
  });

  it('gives both tied models credit for a shared win', () => {
    const runs = [
      fakeScorecard('anthropic:claude-sonnet-4-6', { faithfulness_avg: 5 }),
      fakeScorecard('openai:gpt-5-mini', { faithfulness_avg: 5 }),
    ];
    const tally = tallyMetricWins(findMetricWinners(runs));
    const byModel = Object.fromEntries(tally.map((t) => [t.chatModel, t.metricsWon]));
    // Every summary field ties here (identical fakeScorecard base values), so
    // both models should win every metric.
    expect(byModel['anthropic:claude-sonnet-4-6']).toBe(byModel['openai:gpt-5-mini']);
  });
});
