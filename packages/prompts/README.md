# @doc-ai-chat/prompts

Versioned prompts. Rule from the AI-Engineer ruleset:

> Every prompt at the model lives in `packages/prompts/<name>.ts` with a tagged version, never as an inline string in business logic. Every change runs the golden set before commit (CI gate from M5).

## Layout (planned)

```
src/
├─ rag-answer.ts          # M3 — system prompt for RAG chat with citation grounding
├─ rag-answer.test.ts     # snapshot test for the assembled prompt
├─ refusal-detector.ts    # M3 — patterns for "I don't know" detection (used by eval)
├─ agent-planner.ts       # M6 — system prompt for the agent loop with tool schemas
├─ agent-synthesis.ts     # M6 — final synthesis prompt
├─ eval-judge.ts          # M5 — judge rubric (faithfulness, relevance, citations)
└─ index.ts               # named exports of all of the above
```

Each prompt file exports:

- A frozen string constant `PROMPT_<NAME>_V<N>`
- The version number `<N>` that callers reference explicitly
- A short comment explaining the safety/grounding decisions baked into the text

Prompt changes get caught by the M5 CI gate: change the constant → golden set runs → scorecard diff posted to the PR.
