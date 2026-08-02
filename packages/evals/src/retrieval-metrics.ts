// No-LLM retrieval scoring (README "Scoring" layer 1). Deliberately generic
// over the caller's hit shape — this package must not depend on apps/web's
// HybridHit (packages don't depend on apps in this monorepo, ADR-001's
// layering), so runner.ts's live adapter maps HybridHit -> RankedHit at the
// boundary instead.
export type RankedHit = {
  content: string;
};

export type RetrievalScore = {
  // Did any hit in the top `k` contain the expected passage?
  hit_at_k: boolean;
  // 1-indexed rank of the first matching hit, or null if none matched.
  rank: number | null;
  // Reciprocal rank of the first match (1/rank), 0 if none matched.
  mrr: number;
};

// A hit "matches" when its content contains the golden item's
// `expected_chunk_match` substring, case- and whitespace-insensitive (chunk
// boundaries can land mid-sentence, so exact-string equality is too strict;
// a distinctive substring from the source document is robust to that).
function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function scoreRetrieval(
  hits: RankedHit[],
  expectedChunkMatch: string,
  k = 5,
): RetrievalScore {
  const needle = normalize(expectedChunkMatch);
  const topK = hits.slice(0, k);
  const matchIndex = topK.findIndex((hit) => normalize(hit.content).includes(needle));

  if (matchIndex === -1) {
    return { hit_at_k: false, rank: null, mrr: 0 };
  }

  const rank = matchIndex + 1;
  return { hit_at_k: true, rank, mrr: 1 / rank };
}

export type RetrievalSummary = {
  hit_at_k: number;
  mrr: number;
};

// Aggregates hit@k / MRR across every scored item (no_answer items are
// excluded upstream — they have no expected_chunk_match to rank against).
export function summarizeRetrieval(scores: RetrievalScore[]): RetrievalSummary {
  if (scores.length === 0) {
    return { hit_at_k: 0, mrr: 0 };
  }
  const hits = scores.filter((score) => score.hit_at_k).length;
  const mrrSum = scores.reduce((sum, score) => sum + score.mrr, 0);
  return { hit_at_k: hits / scores.length, mrr: mrrSum / scores.length };
}
