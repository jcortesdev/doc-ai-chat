# @doc-ai-chat/evals

Golden set + eval runner + LLM-as-judge. The module that turns "does my chat feel good" into "did my last change improve faithfulness by 0.3 points without dropping citation accuracy."

**Status:** golden set designed in M0, runner scaffolded in M5.

## Layout (planned)

```
src/
├─ golden-set.json            # 25 Q&A, 20 EN + 5 ES, across 6 types
├─ schema.ts                  # types for golden set + scorecard
├─ runner.ts                  # M5 — runs golden set against a ChatProvider
├─ judge.ts                   # M5 — judge scoring with 3-dimension rubric
├─ retrieval-metrics.ts       # M5 — hit@k, MRR (no LLM)
├─ refusal-correctness.ts     # M5 — boolean check for no-answer items
├─ diff.ts                    # M5 — scorecard diff vs previous run
└─ validate-golden-set.ts     # M0 — schema validation runnable now
fixtures/
├─ README.md                  # explains how to source the 5 PDFs (not committed)
└─ *.pdf                      # ignored by .gitignore
```

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
