import { describe, expect, it } from 'vitest';
import { type RetrievalScore, scoreRetrieval, summarizeRetrieval } from './retrieval-metrics';

describe('scoreRetrieval', () => {
  it('scores a match at rank 1 as hit with mrr 1', () => {
    const hits = [
      { content: 'GSA uses a sigmoid gate trained jointly with the attention weights.' },
    ];
    expect(scoreRetrieval(hits, 'sigmoid gate trained jointly with the attention weights')).toEqual(
      {
        hit_at_k: true,
        rank: 1,
        mrr: 1,
      },
    );
  });

  it('scores a match at rank 3 with mrr 1/3', () => {
    const hits = [
      { content: 'unrelated passage one' },
      { content: 'unrelated passage two' },
      { content: 'the real passage with the needle in it' },
    ];
    const score = scoreRetrieval(hits, 'the needle');
    expect(score.hit_at_k).toBe(true);
    expect(score.rank).toBe(3);
    expect(score.mrr).toBeCloseTo(1 / 3);
  });

  it('is case- and whitespace-insensitive', () => {
    const hits = [{ content: 'The   NEEDLE\nspans lines' }];
    expect(scoreRetrieval(hits, 'the needle spans lines').hit_at_k).toBe(true);
  });

  it('returns no hit when nothing in top-k matches', () => {
    const hits = [{ content: 'nope' }, { content: 'still nope' }];
    expect(scoreRetrieval(hits, 'needle', 2)).toEqual({ hit_at_k: false, rank: null, mrr: 0 });
  });

  it('respects the k cutoff', () => {
    const hits = [{ content: 'nope' }, { content: 'has the needle' }];
    expect(scoreRetrieval(hits, 'needle', 1).hit_at_k).toBe(false);
  });
});

describe('summarizeRetrieval', () => {
  it('averages hit rate and mrr across scores', () => {
    const scores: RetrievalScore[] = [
      { hit_at_k: true, rank: 1, mrr: 1 },
      { hit_at_k: true, rank: 2, mrr: 0.5 },
      { hit_at_k: false, rank: null, mrr: 0 },
    ];
    const summary = summarizeRetrieval(scores);
    expect(summary.hit_at_k).toBeCloseTo(2 / 3);
    expect(summary.mrr).toBeCloseTo(0.5);
  });

  it('returns zeros for an empty list', () => {
    expect(summarizeRetrieval([])).toEqual({ hit_at_k: 0, mrr: 0 });
  });
});
