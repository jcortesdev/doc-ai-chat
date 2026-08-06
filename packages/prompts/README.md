# @doc-ai-chat/prompts

Versioned prompts. Rule from the AI-Engineer ruleset:

> Every prompt at the model lives in `packages/prompts/<name>.ts` with a tagged version, never as an inline string in business logic. Every change runs the golden set before commit (CI gate from M5).

## Layout

```
src/
├─ rag-answer.ts          # M3 — system prompt for RAG chat + citation grounding helpers
├─ rag-answer.test.ts     # asserts the prompt's safety/citation invariants
├─ refusal-detector.ts    # M3 — patterns for "I don't know" detection (used by eval)
└─ agent.ts               # M6 — system prompt for the tool-using agent loop
```

Two files originally sketched here at M0 planning time didn't ship as planned,
each for its own reason:
- `agent-planner.ts` / `agent-synthesis.ts` — a planner/synthesis split assumed a
  multi-phase pipeline. M6's loop is one `streamText` call with tools + a
  `stopWhen` condition (ADR-019): the model interleaves tool calls and reasoning
  in one context, so there's no separate planning phase to prompt differently.
  One `agent.ts` covers it.
- `eval-judge.ts` — the M5 judge rubric lives in `packages/evals/judge.ts`
  instead (injectable, unit-tested with zero network calls per ADR-018), not
  here — this package holds prompts sent to a *user-facing* model, and the judge
  is an internal scoring tool, not a prompt in that sense.

Each prompt file is exposed through the package `exports` map (one subpath per
file, e.g. `@doc-ai-chat/prompts/rag-answer`) — no barrel `index.ts`, per the
repo's no-barrel rule.

Each prompt file exports:

- A frozen string constant `PROMPT_<NAME>_V<N>`
- The version number `<N>` that callers reference explicitly (e.g. `RAG_ANSWER_VERSION`)
- A short comment explaining the safety/grounding decisions baked into the text

Prompt changes get caught by the M5 CI gate: change the constant → golden set runs → scorecard diff posted to the PR.
