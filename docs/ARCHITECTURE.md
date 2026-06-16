# Architecture

This document is the system-shape view of DocAI: what runs where, which model does which job, where money is spent, and how the pieces fit together as the modules ship.

For *why* each piece was chosen, see [DECISIONS.md](DECISIONS.md). For threat model and BYOK security, see [SECURITY.md](SECURITY.md).

---

## Topology

```
                       ┌─────────────┐
                       │  Cloudflare │
                       │     DNS     │
                       └──────┬──────┘
                              │
       ┌──────────────────────┼──────────────────────┐
       │                      │                      │
       ▼                      ▼                      ▼
┌──────────────┐       ┌──────────────┐       ┌──────────────┐
│   Vercel     │       │   Inngest    │       │  Cloudflare  │
│  (apps/web)  │       │   (cloud)    │       │      R2      │
│              │       │              │       │              │
│  Next.js 16  │       │  event bus + │       │  PDF blobs   │
│  Frontend +  │       │  cron + retry│       │  quota cap   │
│  Route Hdrs  │       │  → invokes   │       │  LRU evict   │
│  + /api/     │◄──────┤  /api/inngest│       │              │
│    inngest   │       │              │       │              │
└──────┬───────┘       └──────────────┘       └──────────────┘
       │
       ▼
        ┌─────────────────┐
        │      Neon       │
        │   Postgres +    │
        │   pgvector +    │
        │   tsvector +    │
        │     HNSW        │
        └────────┬────────┘
                 │
                 ▼
        ┌─────────────────┐         ┌─────────────────┐
        │  Upstash Redis  │         │     Clerk       │
        │  (from M4)      │         │  Auth + users   │
        │  Rate limit     │         │  webhook sync   │
        │  (atomic        │         │                 │
        │   counters)     │         │                 │
        └─────────────────┘         └─────────────────┘

        ┌─────────────────────────────────────────────┐
        │              External AI APIs                │
        │                                              │
        │  Anthropic   OpenAI   DeepSeek   Voyage   Cohere
        │   (chat,    (judge,   (dev      (embed)   (rerank)
        │    agent)    bench)    chat)                  │
        └─────────────────────────────────────────────┘
                                │
                                ▼
                        ┌───────────────┐
                        │   Langfuse    │
                        │  cloud trace  │
                        │  + custom UI  │
                        └───────────────┘
```

**Repository.** Single pnpm monorepo with one app (`web`) and four packages (`db`, `prompts`, `providers`, `evals`). Inngest functions live inside `apps/web/src/inngest/` and are exposed via the `/api/inngest` Route Handler — no separate worker process or host.

**Why no separate worker host.** ADR-001 originally provisioned a Node/BullMQ worker on Fly.io. Fly.io's 2024 policy change requiring a $25 prepay to activate accounts moved the choice to Inngest, which offers managed queue + retry + cron + observability on a free tier large enough to cover portfolio traffic indefinitely. The trade-off is event-driven rather than process-driven background work — well-suited to RAG ingest, which is naturally a per-document job.

---

## Pipeline — where each model lives

```
┌─────────────────────────────────────────────────────────────────────────┐
│ FASE 1: INGEST (M1)                                                     │
│  PDF upload ─► unpdf (parse) ─► recursive splitter ─► chunks            │
│                  (no model)        (no model)                           │
│  chunks ─► Voyage-3 ─► embeddings ─► Postgres+pgvector                  │
│  PDF original ─► Cloudflare R2 (with retention metadata)                │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ FASE 2: QUERY + RETRIEVAL (M2)                                          │
│  question ─► Voyage-3 embedding ──┐                                     │
│  question ─► tsvector BM25 (pg) ──┼─► RRF fusion ─► top-30 chunks       │
│              cosine pgvector ─────┘                                     │
│  top-30 ─► Cohere rerank-3 ─► top-5 chunks                              │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ FASE 3: ANSWER (M3) — model varies by context                           │
│  question + top-5 chunks (wrapped in <retrieved_context>)               │
│     ├─► [DEV LOCAL] ─► configured dev model ─► response                 │
│     ├─► [PROD DEMO]  ─► configured prod model ─► response                │
│     └─► [BYOK ACT.]  ─► user's key (Anthropic in M3, multi-prov in M7)  │
│  Response streams via SSE; citations rendered as clickable chips.       │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ FASE 4: EVAL (M5) — OFFLINE, once per module, NOT per chat              │
│  golden set (25 Q) ─► [subject model] ─► 25 responses                   │
│       ▼                                                                 │
│  rubric 3 dims ─► configured judge model ─► scorecard (75 calls)        │
│  + 1 sanity-check run with prod model at each module close              │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ FASE 5: AGENT LOOP (M6) — explicit invocation only                      │
│  complex Q ─► tier-configured planner model                             │
│       ├─► tool: search (vector + BM25)                                  │
│       ├─► tool: get_passage (R2 + chunk lookup)                         │
│       └─► tool: compare/extract (configured sub-task model)             │
│  Planner synthesis ─► answer + transcript visible to user               │
│  Caps: iteration / token / wall-clock limits per tier (ADR-014)         │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ FASE 6: M7 BENCHMARK — tier-matched, diplomatic reporting               │
│                                                                         │
│              Mid tier            Top tier                               │
│              ────────            ────────                               │
│  Anthropic:  Sonnet 4.6          Opus 4.7                               │
│  OpenAI:     GPT-5               GPT-5.5                                │
│  DeepSeek:   V4-Flash            V4-Pro                                 │
│                                                                         │
│  GPT-5-mini judges all 6 runs. Report surfaces:                         │
│   - cost-per-correct-answer (DeepSeek wins)                             │
│   - p95 latency (GPT-5 + Sonnet win)                                    │
│   - faithfulness (Sonnet wins slightly)                                 │
│   - Spanish quality (Sonnet wins clearly)                               │
│   - citation accuracy (technical tie)                                   │
│                                                                         │
│  Conclusion published: "Each provider wins on a different axis.         │
│  Pick by use case, not absolute score." (Senior take, evita sesgo.)    │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Models by role — environment-driven (ADR-016)

All model selection lives in environment variables, not source constants. Each role uses the format `provider:model_id`. The `packages/providers` adapter parses the value, routes the request to the matching SDK, and pulls cost figures from a per-provider price table. New model versions ship as an env-var change + redeploy — no PR, no code change.

| Role | Env var | Module |
|---|---|---|
| Chat — prod demo default | `CHAT_PROD_MODEL` | M3 |
| Chat — dev iteration | `CHAT_DEV_MODEL` | M1 |
| Agent reasoner — free tier | `AGENT_FREE_MODEL` | M6 |
| Agent reasoner — BYOK/privileged | `AGENT_PRO_MODEL` | M6 |
| Agent sub-task | `AGENT_SUBTASK_MODEL` | M6 |
| Module gate primary | `GATE_PRIMARY_MODEL` | M5 |
| Module gate sanity check (1/gate) | `GATE_SANITY_MODEL` | M5 |
| Eval judge | `EVAL_JUDGE_MODEL` | M5 |
| Embeddings | `EMBEDDINGS_MODEL` | M1 |
| Reranker | `RERANK_MODEL` | M2 |

Default values and the per-provider price table live in the `packages/providers` source plus operational docs — they are not published here so the public-repo audience cannot pre-target a specific model with prompt-injection optimization. The variable names and the role-to-env-var mapping are public so contributors can wire their own values.

Full env reference: `.env.example` at the repo root. M7 benchmark uses operational defaults plus exposes a selector UI for runtime provider switching.

### Non-configurable

- **Chunking** is deterministic, no model involved (ADR-004).
- **M7 benchmark** compares published frontier and mid tiers from each provider — the benchmark is the artifact, not configuration.

---

## Cost ceiling

Cost protection lives in two layers: account-level spend caps configured on each provider's dashboard (ADR-006), and code-level kill switches (ADR-015). Both layers are sized to keep worst-case simultaneous external exposure in low double-digit USD.

| Provider | Protection mechanism |
|---|---|
| Vercel | Hobby tier, no payment method attached |
| Fly.io | `auto_stop_machines = true` in `fly.toml` + bank alert above a low threshold |
| Neon | Free plan, no payment method |
| Upstash (from M4) | Free plan, no payment method |
| Clerk | Development mode until ship |
| Cloudflare R2 | No payment method |
| Langfuse cloud | No payment method |
| Voyage AI | Prepay balance, no auto-recharge |
| Anthropic | Monthly spend limit configured on dashboard |
| DeepSeek | Prepay balance, no auto-recharge |
| OpenAI (from M7) | Hard spending cap configured on dashboard |

Exact cap values live in private operational docs — publishing the precise threshold would tell an abuser the budget they need to exhaust to take the free tier offline.

**Code-level project kill switch (ADR-015).** A counter in `project_budget_usage` tracks all paid calls (excluding BYOK). When the daily or monthly cap is hit, free-tier features lock with a friendly `<ErrorState variant="project_over_capacity">`. BYOK and privileged accounts continue.

---

## Repository layout

```
doc-ai-chat/
├─ apps/
│  └─ web/                  Next.js 16 App Router — frontend, route handlers,
│     └─ src/inngest/       and Inngest functions (ingest, evals, retention cron)
├─ packages/
│  ├─ db/                   Drizzle schema + migrations + typed client (Postgres + pgvector)
│  ├─ prompts/              Versioned prompts per file (no inline strings)
│  ├─ providers/            ChatProvider adapter (Anthropic / OpenAI / DeepSeek)
│  └─ evals/                Golden set + runner + LLM-as-judge
├─ docs/
│  ├─ ARCHITECTURE.md       (this file)
│  ├─ DECISIONS.md          ADR-001..ADR-016
│  └─ SECURITY.md           Threat model + BYOK architecture + data handling
├─ messages/
│  ├─ en.json               UI strings (English)
│  └─ es.json               UI strings (Spanish)
├─ biome.json
├─ tsconfig.base.json
├─ pnpm-workspace.yaml
└─ README.md
```

---

## Data flow — single chat request (M3 prod)

```
1. User types question in /chat
2. Frontend sends POST /api/chat/stream { documentId, message, history }
3. Route Handler:
   a. Verify Clerk JWT
   b. Check workspace membership (tenant isolation)
   c. Check daily quota + weekly trial + project budget (ADR-015)
   d. Read BYOK from X-User-API-Key header if present
4. Embed question via Voyage-3
5. Hybrid retrieve top-30 chunks from Postgres (BM25 + cosine via RRF)
6. Cohere rerank-3 → top-5 chunks
7. Assemble prompt from packages/prompts/rag-answer.ts (v1) with:
   - system rules (including prompt injection defense)
   - <retrieved_context>{top-5 chunks as plain text with chunk IDs}</retrieved_context>
   - history (last N turns)
   - <user_message>{question}</user_message>
8. Stream the configured prod model response token-by-token via SSE
9. Frontend renders streamed tokens + parses citation markers → chips
10. Citation chip click → opens PDF viewer at the chunk's page with passage highlighted
11. After response complete, log usage_event { model, input_tokens, output_tokens, cost_usd, latency_ms, is_privileged }
12. Update project_budget_usage counter (skipped if BYOK)
```

Streaming latency budget: p95 ≤ 3s from user submit to first token. Violations are bugs.

---

## Background jobs (Inngest functions in `apps/web/src/inngest/`)

| Function | Module | Trigger | What it does |
|---|---|---|---|
| `ingest-pdf` | M1 | Inngest event `pdf.uploaded` sent by `/api/ingest` after R2 upload | Parse PDF, chunk, embed, store; write status events to `documents` table for the `/ingest/[id]` UI to poll |
| `run-evals` | M5 | Inngest event `evals.run-requested` from API or CI | Run golden set against a `ChatProvider`; score with judge; write scorecard to `eval_runs` + `eval_results` |
| `cleanup-retention` | M4 | Inngest cron `0 3 * * *` (03:00 UTC daily) | Delete expired PDFs (R2) + chunks (Postgres) per retention windows + LRU eviction if R2 > soft cap |

Inngest functions are TypeScript modules colocated with the Next.js app. The `/api/inngest` endpoint exposes them; Inngest cloud calls in whenever an event fires. Retries, dead-letter handling, and observability are managed by Inngest. No queue admin code lives in our repo.

---

## What this architecture *deliberately doesn't have*

- **No microservices.** One web app, Inngest functions, that's it. Splitting earlier is premature.
- **No self-hosted job queue.** Inngest manages queue + retry + cron; we focus on the pipeline.
- **No GraphQL / tRPC.** Route handlers return JSON. The contract is the URL, the body, and a Zod schema next to it.
- **No managed vector DB.** Pgvector with hybrid search by hand (ADR-002).
- **No agent framework.** The agent loop in M6 is a hand-written `while` with explicit tools.
- **No streaming framework.** Vercel AI SDK as a thin SSE helper; no LangChain or LlamaIndex (ADR-005).
- **No multi-tenancy beyond workspaces.** One workspace per user; no orgs.
