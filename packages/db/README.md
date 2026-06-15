# @doc-ai-chat/db

Drizzle ORM schema and typed client for Neon Postgres with the `pgvector` extension.

**Status:** scaffolded in M1.

## Tables (planned)

| Table | Module | Purpose |
|---|---|---|
| `users` | M1 | Synced from Clerk webhook. |
| `workspaces` | M1 | 1-per-user for now. |
| `documents` | M1 | Uploaded PDF metadata + R2 key + retention expiry. |
| `chunks` | M1 | Text + page + embedding (`vector(...)`, dimension matches the configured embeddings model) + tsvector for BM25. |
| `usage_events` | M1 then enriched M4 | Per-LLM-call: model, in/out tokens, cost USD, latency ms, privileged-account flag. |
| `project_budget_usage` | M4 | Daily/monthly aggregate for ADR-015 kill switch. |
| `eval_runs` | M5 | Run metadata. |
| `eval_results` | M5 | Per-question scorecard. |
| `agent_runs` | M6 | Tool-use transcript + iteration count + cost. |

## Indexes (planned)

- `chunks` HNSW on `embedding` (cosine, m=16, ef_construction=64).
- `chunks` GIN on `tsv` for BM25.
- `documents` btree on `(workspace_id, expires_at)` for retention cron.
- `usage_events` btree on `(created_at, model)` for the `/usage` dashboard.
