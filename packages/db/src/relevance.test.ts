import { describe, expect, it } from 'vitest';
import { selectRelevantHits } from './relevance';

describe('selectRelevantHits', () => {
  it('keeps hits at or above the threshold and drops the rest', () => {
    const hits = [
      { rerankRelevance: 0.9, id: 'a' },
      { rerankRelevance: 0.2, id: 'b' },
      { rerankRelevance: 0.03, id: 'c' },
    ];
    expect(selectRelevantHits(hits, 0.2).map((h) => h.id)).toEqual(['a', 'b']);
  });

  it('is inclusive at the boundary (>=)', () => {
    expect(selectRelevantHits([{ rerankRelevance: 0.2 }], 0.2)).toHaveLength(1);
  });

  it('returns empty when nothing clears the bar (the refusal case)', () => {
    expect(selectRelevantHits([{ rerankRelevance: 0.03 }], 0.2)).toEqual([]);
  });

  it('returns empty for empty input', () => {
    expect(selectRelevantHits([], 0.2)).toEqual([]);
  });
});
