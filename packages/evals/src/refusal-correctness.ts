import { isRefusal } from '@doc-ai-chat/prompts/refusal-detector';

// Refusal correctness for `no_answer` golden items (README "Scoring" layer 3).
// Reuses `isRefusal` — the same pattern detector that gates the prod guardrail
// (SECURITY.md #10) — rather than a second pattern set, so this eval measures
// the actual production behavior instead of a parallel approximation of it.
// A `no_answer` item is correct iff the model's answer is detected as a refusal;
// the golden item's own `expected_refusal_patterns` are documentation/design
// intent for the item, not a second scoring path.
export function scoreRefusalCorrectness(answer: string): boolean {
  return isRefusal(answer);
}

export function summarizeRefusalCorrectness(results: boolean[]): number {
  if (results.length === 0) return 0;
  return results.filter(Boolean).length / results.length;
}
