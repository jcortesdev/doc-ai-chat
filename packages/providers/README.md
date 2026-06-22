# @doc-ai-chat/providers

Chat model resolution + the per-provider price table. The Vercel AI SDK is the
chat generation + streaming layer (ADR-005): this package parses the env-driven
`provider:model_id` ref (ADR-016) into an AI SDK `LanguageModel`, and owns the
cost math. Prompt assembly, retrieval, citations, and `usage_events` logging live
in `apps/web`. M3 ships Anthropic + DeepSeek behind one resolver; M7 adds OpenAI
and runs the tier-matched benchmark — swapping a chat model is an env-var change,
same code path.

Embeddings (Voyage) and rerank (Cohere) do **not** go through this package or the
AI SDK — they are hand-written `fetch` clients in `apps/web` (M1/M2). See ADR-005
for why.

## Providers

| Provider | First module | Roles covered |
|---|---|---|
| Anthropic | M3 | Chat answer (prod tier), agent reasoning (privileged/BYOK tier) |
| OpenAI | M5 | Eval judging and module gates (cost-optimized tier) |
| DeepSeek | M1 | Dev iteration, free-tier agent reasoning, low-cost sub-tasks |

Specific model IDs per role are configured at runtime through environment variables (see ADR-016) and live in private operational docs — they are intentionally not enumerated in source so a public-repo reader cannot pre-target a specific model for prompt-injection optimization.

## Interface

```ts
// chat-model.ts — env ref → AI SDK model
parseModelRef('deepseek:deepseek-v4-flash'); // → { provider, modelId } (pure, unit-tested)
resolveChatModel('anthropic:claude-sonnet-4-6'); // → LanguageModel (anthropic() | deepseek())

// price-table.ts — cost math (ADR-016: cost math is code, model choice is config)
computeCostUsd('claude-sonnet-4-6', inputTokens, outputTokens); // → cost_usd
```

The caller (`apps/web/src/lib/chat.ts`) feeds the resolved model to the AI SDK's
`streamText` and, on finish, computes cost from the price table and writes one
`usage_events` row. The client consumes the stream with the AI SDK's `useChat`.

What this package owns:
- **Model resolution:** `provider:model_id` → the right AI SDK provider package.
- **Pricing:** per-model USD/1M-token table; the single source of truth for `cost_usd`.

What the AI SDK owns (so we don't hand-roll it):
- Per-provider auth (each provider reads its own `*_API_KEY` from the env).
- Streaming normalization + retries/backoff across Anthropic and DeepSeek.

## Why no LangChain (and why the AI SDK only for chat)

ADR-005 in `docs/DECISIONS.md`. Short version: no RAG framework. The AI SDK earns
its place only as the chat transport (`streamText` + `useChat`) and the
multi-provider abstraction the M7 benchmark needs. Embeddings, rerank, and the
whole retrieval pipeline stay hand-written `fetch` — there is no first-party
`@ai-sdk/voyage`, and that code is a deliberate interview artifact.
