# @doc-ai-chat/evals

Golden set + eval runner + LLM-as-judge. The module that turns "does my chat feel good" into "did my last change improve faithfulness by 0.3 points without dropping citation accuracy."

**Status:** golden set designed in M0; runner, judge, retrieval metrics, refusal correctness, and scorecard diff shipped in M5. Not yet wired: a CI workflow (needs `EVAL_WORKSPACE_ID` + provider API keys as repo secrets) and a golden-set run against a live-seeded eval workspace.

## Layout

```
src/
├─ golden-set.json            # 25 Q&A, 20 EN + 5 ES, across 6 types (../golden-set.json)
├─ schema.ts                  # types for golden set + scorecard
├─ validate-golden-set.ts     # schema + referential-integrity validation (`pnpm eval:validate-golden-set`)
├─ retrieval-metrics.ts       # hit@k, MRR (no LLM)
├─ refusal-correctness.ts     # no-answer items — delegates to @doc-ai-chat/prompts' isRefusal
├─ judge.ts                   # LLM-as-judge, 3-dimension rubric, injectable JudgeFn for testing
├─ runner.ts                  # orchestrates a golden-set run given injected retrieve/chat/judge adapters
└─ diff.ts                    # scorecard diff vs a baseline, with regression tolerances (the CI gate policy)
fixtures/
├─ README.md                  # explains how to source the 5 PDFs (not committed)
└─ *.pdf                      # ignored by .gitignore
```

This package stays a pure, dependency-injected leaf (no DB, no network, no apps/web import — packages don't depend on apps here). The live wiring — real `hybridRetrieve`, the chat model, and `EVAL_JUDGE_MODEL` — lives in [apps/web/scripts/run-golden-set.ts](../../apps/web/scripts/run-golden-set.ts) and runs via `pnpm --filter @doc-ai-chat/web eval:run`. It requires `EVAL_WORKSPACE_ID` (a workspace pre-seeded with these 5 fixtures ingested) plus the usual retrieval/chat/judge API keys.

## Golden set composition

| Type | # | Why |
|---|---|---|
| Factual single-hop | 8 | Baseline retrieval. |
| Multi-hop (across 2+ chunks) | 5 | Non-trivial retrieval. |
| Summarization of a section | 3 | Synthesis. |
| **No-answer (refusal expected)** | 4 | Anti-hallucination — the most honest test. |
| Numeric / table extraction | 3 | Tests structure preservation in chunking. |
| Contradiction between docs (M6+ only) | 2 | Multi-doc reasoning. |

5 of the 25 Q&A are in Spanish (matching the Spanish PDF in the corpus).

## Scoring

Three layers, all automated:

1. **Retrieval** without LLM — `hit@k` and `MRR` against a hand-labeled `expected_chunk_label` per question.
2. **LLM-as-judge** with rubric — `faithfulness` (is the answer supported by the cited chunks?), `answer_relevance` (does it answer the question?), `citation_accuracy` (are the cited chunks the right ones?). Each 1-5, judged by the configured eval judge model.
3. **Refusal correctness** for no-answer items — boolean pattern match against the model's response.

Output: JSON scorecard + diff vs previous run + total cost + p50/p95 latency.
