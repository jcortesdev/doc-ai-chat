import { z } from 'zod';

// Mirrors golden-set.json (designed M0). Two item shapes coexist:
// single-doc items (`doc_id`) and the M6-flavored cross-doc items (`doc_ids`).
// `expected_chunk_match` and `expected_refusal_patterns` are each optional but
// exactly one of the two governs scoring, so validate-golden-set.ts checks the
// cross-field invariant that a raw discriminated union can't express cleanly.

export const CompositionType = z.enum([
  'factual_single_hop',
  'multi_hop',
  'summarization',
  'no_answer',
  'numeric',
  'contradiction_or_cross_doc',
]);
export type CompositionType = z.infer<typeof CompositionType>;

export const GoldenDocument = z.object({
  id: z.string(),
  file: z.string(),
  source_md: z.string(),
  lang: z.enum(['en', 'es']),
  type: z.string(),
  title: z.string(),
});
export type GoldenDocument = z.infer<typeof GoldenDocument>;

export const GoldenItem = z.object({
  id: z.string(),
  type: CompositionType,
  lang: z.enum(['en', 'es']),
  doc_id: z.string().optional(),
  doc_ids: z.array(z.string()).min(2).optional(),
  question: z.string(),
  expected_chunk_label: z.string(),
  expected_chunk_match: z.string().optional(),
  expected_refusal_patterns: z.array(z.string()).min(1).optional(),
  expected_answer_summary: z.string(),
  notes: z.string().optional(),
});
export type GoldenItem = z.infer<typeof GoldenItem>;

export const GoldenSet = z.object({
  $schema: z.string().optional(),
  version: z.string(),
  created_at: z.string(),
  description: z.string(),
  documents: z.array(GoldenDocument),
  composition: z.record(z.string(), z.number()),
  items: z.array(GoldenItem),
});
export type GoldenSet = z.infer<typeof GoldenSet>;

// Returns the doc ids an item retrieves against — `doc_ids` for cross-doc
// items, a single-element array otherwise. Centralizes the doc_id/doc_ids
// split so callers (runner, validator) never branch on item.type themselves.
export function itemDocIds(item: GoldenItem): string[] {
  if (item.doc_ids) return item.doc_ids;
  if (item.doc_id) return [item.doc_id];
  throw new Error(`Golden item "${item.id}" has neither doc_id nor doc_ids.`);
}

// One scored dimension in [1, 5], per judge.ts's rubric.
export const JudgeScore = z.object({
  score: z.number().min(1).max(5),
  rationale: z.string(),
});
export type JudgeScore = z.infer<typeof JudgeScore>;

export const ScorecardEntry = z.object({
  item_id: z.string(),
  type: CompositionType,
  lang: z.enum(['en', 'es']),
  question: z.string(),
  answer: z.string(),
  // Retrieval, no LLM (retrieval-metrics.ts). Null for no_answer items — there
  // is nothing to rank against when a refusal is the correct outcome.
  retrieval: z
    .object({
      hit_at_k: z.boolean(),
      rank: z.number().nullable(),
      mrr: z.number(),
    })
    .nullable(),
  // Judge rubric (judge.ts). Null for no_answer items — refusal correctness
  // replaces the rubric there.
  judge: z
    .object({
      faithfulness: JudgeScore,
      answer_relevance: JudgeScore,
      citation_accuracy: JudgeScore,
    })
    .nullable(),
  // Refusal correctness (refusal-correctness.ts). Non-null only for no_answer
  // items.
  refusal_correct: z.boolean().nullable(),
  cost_usd: z.number(),
  latency_ms: z.number(),
});
export type ScorecardEntry = z.infer<typeof ScorecardEntry>;

export const Scorecard = z.object({
  run_id: z.string(),
  created_at: z.string(),
  golden_set_version: z.string(),
  chat_model: z.string(),
  judge_model: z.string(),
  prompt_version: z.number(),
  entries: z.array(ScorecardEntry),
  summary: z.object({
    hit_at_k: z.number(),
    mrr: z.number(),
    faithfulness_avg: z.number(),
    answer_relevance_avg: z.number(),
    citation_accuracy_avg: z.number(),
    refusal_correctness_rate: z.number(),
    total_cost_usd: z.number(),
    latency_p50_ms: z.number(),
    latency_p95_ms: z.number(),
  }),
});
export type Scorecard = z.infer<typeof Scorecard>;
