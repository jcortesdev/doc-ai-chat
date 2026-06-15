# @doc-ai-chat/worker

Node.js + BullMQ consumer. Deployed to Fly.io as a separate process under the same Fly app as `@doc-ai-chat/web` (or a sibling app — TBD at M4).

**Status:** scaffolded in M1 (queue + ingest job) and extended in M5 (eval runner).

## Jobs (planned)

| Job | Module | Trigger | Output |
|---|---|---|---|
| `ingest-pdf` | M1 | API `POST /api/ingest` enqueues after R2 upload | chunks + embeddings → Postgres; status events → Postgres for UI polling |
| `run-evals` | M5 | API `POST /api/evals/run` or CI | scorecard JSON + diff vs previous run |
| `cleanup-retention` | M4 | cron 03:00 UTC | delete expired PDFs from R2 + chunks from Postgres; LRU eviction if R2 > 90% cap |

## Why a separate process

- Ingest jobs are long (can take 10-30s for a 50-page PDF) and would block Vercel's request timeout.
- Eval runs spawn N LLM calls — needs to live outside the user-request critical path.
- Shared DB + Redis with `@doc-ai-chat/web`; no own state.

## Deployment

`fly.toml` lives at the repo root and configures BOTH the web app and the worker as separate processes. `auto_stop_machines = true` keeps idle cost near $0.
