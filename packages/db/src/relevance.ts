// Filters reranked hits down to those that clear a relevance threshold. Pure and
// generic over anything carrying a `rerankRelevance` score (the M2 HybridHit).
//
// The chat layer (M3) uses this for its refusal decision: a vector ANN search
// always returns its k nearest neighbours however far, and the reranker scores a
// no-match query's results near zero (~0.03 in M2). When nothing clears the bar
// there is no grounded context, so the model is asked to refuse rather than
// answer from weak matches. The threshold itself is a tuning knob the M5 eval
// harness (refusal-correctness dimension) calibrates — it is not baked in here.
export function selectRelevantHits<T extends { rerankRelevance: number }>(
  hits: T[],
  threshold: number,
): T[] {
  return hits.filter((hit) => hit.rerankRelevance >= threshold);
}
