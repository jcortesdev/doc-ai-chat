# DocAI

> Ask questions of your PDFs. Get answers grounded in the documents, with clickable citations that open the exact passage.

**Status:** 🚧 **Live demo, still building in public.** Shipped & deployed: M1 ingest pipeline · M2 hybrid search · M3 RAG chat (streaming + citations + guardrails) · M4 BYOK + rate limiting + cost/latency dashboard + retention + error states. Plus a UX polish pass: unified account page, file management (list/delete), in-panel citation highlight, UI-locale-aware answers, local chat persistence, and per-page help. Next: M5 evals · M6 agent loop · M7 multi-provider benchmark.
**Demo:** [demo-docai.jcortes.dev](https://demo-docai.jcortes.dev)

## What this is

DocAI is a Retrieval-Augmented Generation (RAG) chat over your own PDFs. Upload a PDF, ask questions, get streamed responses that cite the source passages. The portfolio version is also a small public benchmark — the same golden set runs against Anthropic, OpenAI, and DeepSeek so you can see how providers actually compare on a real workload.

Designed deliberately as an AI-Engineer-shaped project: built without LangChain, hybrid retrieval written by hand, reproducible evaluations, observable cost and latency, and an agent loop with tool use.

## Stack

| Layer | Tech | Why |
|---|---|---|
| Frontend | Next.js 16 App Router · React 19 · TypeScript strict · Tailwind v4 · next-intl (en/es) | Recruiter-recognizable + i18n for LATAM + US markets. |
| API | Next.js Route Handlers (in `apps/web`) | Lean for ~10 endpoints; no NestJS overhead. |
| Background jobs | Inngest functions, served from `/api/inngest` | Managed queue + retry + cron; no separate worker host. |
| Database | Neon Postgres + pgvector with HNSW | Hybrid search (BM25 via tsvector + cosine via pgvector + RRF) hand-built — no vendor lock-in. |
| File storage | Cloudflare R2 (project-scoped quota, LRU eviction) | No egress fees; PDFs power the click-to-source UX. |
| Auth | Clerk (GitHub + Google + magic link) | Multi-provider, en/es email templates. |
| Embeddings | Voyage-3 | Anthropic-recommended; best quality/$. |
| Reranking | Cohere rerank-v3.5 | Dedicated cross-encoder beats LLM reranking; multilingual for en+es. |
| Chat (prod) | Claude Sonnet 4.6 | Quality + Spanish + tool use. |
| Chat (dev) | DeepSeek V4-Flash | 10× cheaper for iteration. |
| Eval judge | OpenAI GPT-5-mini | Capable for structured rubrics, 75% cheaper than Opus. |
| Observability | Langfuse cloud + custom `/usage` dashboard | Industry-standard plus a from-scratch view. |
| Rate limit | Upstash Redis | Sub-5ms atomic counters for the chat hot path. |
| Tests | Vitest + Playwright + @axe-core/playwright + Lighthouse | Same bar as the rest of the portfolio. |

## How it works

```
1. INGEST   ✅ upload PDF → parse → chunk → Voyage-3 embed → Postgres + R2
2. RETRIEVE ✅ question → hybrid search (BM25 + cosine + RRF) → Cohere rerank → top-5
3. ANSWER   ✅ LLM with retrieved context in <retrieved_context> tags → streamed → citations
4. EVAL        golden set (25 Q&A, en+es) → GPT-5-mini judge → scorecard, CI-gated
5. AGENT       "compare two PDFs" → tool-using loop → transcript with cost
6. BENCH       same golden set across 3 providers × 2 tiers → diplomatic report
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full pipeline diagram with model placement.

## Demo limits

This is a portfolio demo, so resources are capped. Sign-in is required to upload.

| | Logged in (free) | BYOK |
|---|---|---|
| Files | 3 (10 MB / 50 pages) | 3 (10 MB / 50 pages) |
| Chat | 10/day for a 7-day trial, then locked | Unlimited — your key pays for it |
| Search / upload | During the trial | Continues past the trial |
| Retention | 7 days | 7 days |

Owner accounts are unlimited. Anonymous access (1 file, 24 h) and the agent loop (M6) are designed but not enabled yet. BYOK's benefit today is unlimited chat and continued access past the trial — it shares the free-tier file and retention limits.

Need higher quotas, custom ingestion pipelines, or a tailored RAG build for your team? **I'm available for contract work.** → [Contact](mailto:jcortesdev@gmail.com)

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — system shape, pipeline diagram, model-by-role table
- [docs/DECISIONS.md](docs/DECISIONS.md) — 16 ADRs covering every non-obvious choice
- [docs/SECURITY.md](docs/SECURITY.md) — threat model, BYOK security architecture, data handling

## Local development

Requires pnpm 11 and Node 22+.

```bash
pnpm install
cp .env.example .env.local            # fill in the values

# Database (Neon): run the one-time privileged bootstrap, then migrate.
# See packages/db/README.md for the bootstrap SQL and the two-role setup.
pnpm --filter @doc-ai-chat/db db:migrate

# App + Inngest dev server (two terminals).
pnpm --filter @doc-ai-chat/web dev
npx inngest-cli@latest dev -u http://localhost:3000/api/inngest

# Checks.
pnpm lint && pnpm typecheck && pnpm test
pnpm test:e2e                          # Playwright + axe; needs both servers above
```

`/[locale]/` (en/es) is the upload entry point; `/[locale]/ingest/[id]` is the status page.

## License

MIT — see [LICENSE](LICENSE).
