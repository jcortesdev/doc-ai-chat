export type RrfHit = {
  chunkId: string;
  rrfScore: number;
  // 1-based rank in each input list, positionally aligned; null if the id was
  // absent from that list.
  ranks: Array<number | null>;
};

// Reciprocal Rank Fusion: merge several ranked lists into one by summing
// 1/(k + rank) per list, where rank is the 1-based position. It fuses by RANK,
// not by raw score — that's the whole point: cosine similarity and ts_rank live
// on different scales and can't be compared, but their positions can. k (default
// 60, per Cormack et al. 2009) damps the head so no single list dominates.
// Input lists are ordered best-first (index 0 = rank 1).
export function reciprocalRankFusion(
  rankings: string[][],
  options: { k?: number; limit?: number } = {},
): RrfHit[] {
  const k = options.k ?? 60;
  const acc = new Map<string, RrfHit>();

  for (const [listIndex, ranking] of rankings.entries()) {
    const seen = new Set<string>();
    for (const [position, chunkId] of ranking.entries()) {
      // A well-formed ranking has unique ids; if one repeats, keep its best
      // (first) rank and ignore the rest.
      if (seen.has(chunkId)) {
        continue;
      }
      seen.add(chunkId);

      let hit = acc.get(chunkId);
      if (!hit) {
        hit = {
          chunkId,
          rrfScore: 0,
          ranks: Array.from({ length: rankings.length }, () => null),
        };
        acc.set(chunkId, hit);
      }

      const rank = position + 1;
      hit.rrfScore += 1 / (k + rank);
      hit.ranks[listIndex] = rank;
    }
  }

  // Sort by fused score desc; tie-break by chunkId for deterministic output.
  const fused = [...acc.values()].sort(
    (a, b) => b.rrfScore - a.rrfScore || a.chunkId.localeCompare(b.chunkId),
  );

  return options.limit === undefined ? fused : fused.slice(0, options.limit);
}
