# @doc-ai-chat/providers

Thin adapter over the three model providers used in the project. Designed so M3-M6 use only Anthropic without leaking the interface; M7 swaps providers behind the same interface and runs the tier-matched benchmark.

## Providers

| Provider | First module | Roles covered |
|---|---|---|
| Anthropic | M3 | Chat answer (prod tier), agent reasoning (privileged/BYOK tier) |
| OpenAI | M5 | Eval judging and module gates (cost-optimized tier) |
| DeepSeek | M1 | Dev iteration, free-tier agent reasoning, low-cost sub-tasks |

Specific model IDs per role are configured at runtime through environment variables (see ADR-016) and live in private operational docs — they are intentionally not enumerated in source so a public-repo reader cannot pre-target a specific model for prompt-injection optimization.

## Interface (planned)

```ts
// chat completion (streaming + non-streaming)
interface ChatProvider {
  name: string;
  complete(args: ChatArgs): Promise<ChatResult>;
  stream(args: ChatArgs): AsyncIterable<ChatChunk>;
}

// where ChatArgs unifies system / messages / tools / temperature / max_tokens
// and ChatResult includes usage (input/output tokens) + cost_usd computed from a price table
```

What leaks (deliberate):
- Tool-use schemas: Anthropic and OpenAI use different shapes. The interface forces the caller to declare tool schemas in a normalized form; the adapter translates.
- Streaming format: each provider streams differently; the adapter normalizes to a single async iterable of typed chunks.

What does not leak:
- Authentication: each provider has its own client; the user just picks `'anthropic'` / `'openai'` / `'deepseek'`.
- Pricing: the cost calculation happens inside the adapter using a per-provider price table.
- Retries / 429 handling: adapter does exponential backoff with jitter, surfacing only fatal errors.

## Why no LangChain

ADR-005 in `docs/DECISIONS.md`. Short version: leaky abstractions, slow-moving, recruiter signal trends negative in 2026. The Anthropic SDK + a couple of helpers cover everything we need with much less rope.
