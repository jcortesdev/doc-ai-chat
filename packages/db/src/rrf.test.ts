import { describe, expect, it } from 'vitest';
import { reciprocalRankFusion } from './rrf';

describe('reciprocalRankFusion', () => {
  it('returns nothing for empty input', () => {
    expect(reciprocalRankFusion([])).toEqual([]);
    expect(reciprocalRankFusion([[], []])).toEqual([]);
  });

  it('preserves order for a single list and scores 1/(k+rank)', () => {
    const fused = reciprocalRankFusion([['a', 'b', 'c']], { k: 60 });
    expect(fused.map((h) => h.chunkId)).toEqual(['a', 'b', 'c']);
    expect(fused[0]?.rrfScore).toBeCloseTo(1 / 61, 10);
    expect(fused[1]?.rrfScore).toBeCloseTo(1 / 62, 10);
    expect(fused[2]?.rrfScore).toBeCloseTo(1 / 63, 10);
  });

  it('sums contributions for an id present in both lists', () => {
    // 'b' is rank 2 in list 0 and rank 1 in list 1.
    const fused = reciprocalRankFusion([
      ['a', 'b'],
      ['b', 'c'],
    ]);
    const b = fused.find((h) => h.chunkId === 'b');
    expect(b?.rrfScore).toBeCloseTo(1 / 62 + 1 / 61, 10);
    expect(b?.ranks).toEqual([2, 1]);
    // 'b' should win: it's the only id appearing in both lists.
    expect(fused[0]?.chunkId).toBe('b');
  });

  it('records null rank for a list the id is absent from', () => {
    const fused = reciprocalRankFusion([['a'], ['b']]);
    expect(fused.find((h) => h.chunkId === 'a')?.ranks).toEqual([1, null]);
    expect(fused.find((h) => h.chunkId === 'b')?.ranks).toEqual([null, 1]);
  });

  it('respects the limit', () => {
    const fused = reciprocalRankFusion([['a', 'b', 'c', 'd']], { limit: 2 });
    expect(fused).toHaveLength(2);
    expect(fused.map((h) => h.chunkId)).toEqual(['a', 'b']);
  });

  it('breaks score ties deterministically by chunkId', () => {
    // 'z' and 'a' both at rank 1 of their own list → equal score → 'a' first.
    const fused = reciprocalRankFusion([['z'], ['a']]);
    expect(fused.map((h) => h.chunkId)).toEqual(['a', 'z']);
  });

  it('uses k=60 by default', () => {
    const fused = reciprocalRankFusion([['a']]);
    expect(fused[0]?.rrfScore).toBeCloseTo(1 / 61, 10);
  });

  it('keeps the best rank when an id repeats within one list', () => {
    const fused = reciprocalRankFusion([['a', 'a']]);
    expect(fused).toHaveLength(1);
    expect(fused[0]?.ranks).toEqual([1]);
    expect(fused[0]?.rrfScore).toBeCloseTo(1 / 61, 10);
  });
});
