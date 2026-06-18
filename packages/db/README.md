# @doc-ai-chat/db

Drizzle ORM schema, migrations, and typed client for Neon Postgres with the
`pgvector` extension. Everything lives in the `docai` schema (ADR-002).

**Status:** M1 — initial migration applied (6 tables).

## Exports

No barrel file. Import the pieces directly:

```ts
import { db } from '@doc-ai-chat/db/client';
import { documents, chunks } from '@doc-ai-chat/db/schema';
```

## Tables

| Table | Module | Purpose |
|---|---|---|
| `users` | M1 ✅ | Synced from Clerk webhook (handler lands with the webhook secret). |
| `workspaces` | M1 ✅ | One per user for now (no orgs). |
| `documents` | M1 ✅ | Uploaded PDF metadata, R2 key, ingest counters, retention `expires_at`. |
| `chunks` | M1 ✅ | Text + page + `embedding vector(1024)` (cosine) + generated `tsv` (BM25). |
| `usage_events` | M1 ✅ | Per model call: model, tokens, `cost_usd`, latency, `is_privileged`. |
| `project_budget_usage` | M1 ✅ | Daily aggregate for the ADR-015 kill switch. |
| `eval_runs` / `eval_results` | M5 | Golden-set scorecards. |
| `agent_runs` | M6 | Tool-use transcript + iteration count + cost. |

### Indexes

- `chunks` HNSW on `embedding` (`vector_cosine_ops`, `m=16, ef_construction=64`).
- `chunks` GIN on the generated `tsv` (BM25).
- `chunks` btree on `document_id` and on `workspace_id` (joins + tenant isolation).
- `documents` btree on `(workspace_id, expires_at)` for the retention cron.
- `usage_events` btree on `(created_at, model)` for the `/usage` dashboard.

## One-time privileged bootstrap (run as the Neon owner)

The schema, the `vector` extension, the least-privilege app role, and its grants
are provisioned once by the database owner — they are **not** part of the app
migrations:

```sql
CREATE ROLE docai_app WITH LOGIN PASSWORD '<strong-password>';
CREATE SCHEMA IF NOT EXISTS docai;
GRANT USAGE, CREATE ON SCHEMA docai TO docai_app;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA docai TO docai_app;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA docai TO docai_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA docai GRANT ALL ON TABLES TO docai_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA docai GRANT ALL ON SEQUENCES TO docai_app;
CREATE EXTENSION IF NOT EXISTS vector;
```

`DATABASE_URL` (runtime) points at `docai_app`.

## Migrations

```bash
pnpm db:generate   # diff schema.ts → new SQL migration in ./migrations
pnpm db:migrate    # apply pending migrations
pnpm db:studio     # browse data
```

All three load the repo-root `.env.local` via `dotenv-cli`.

### Two roles — DDL vs DML (least privilege)

Drizzle's migrator runs `CREATE SCHEMA IF NOT EXISTS docai` on **every** invocation,
which requires CREATE-on-database — a privilege the runtime role `docai_app`
intentionally does not hold (SECURITY.md). So:

- **Migrations (DDL)** run as the Neon **owner** via `MIGRATE_DATABASE_URL`. Tables
  are created owned by the owner; `docai_app` automatically gets `ALL` on them through
  the `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES TO docai_app` from the bootstrap.
- **Runtime (DML)** uses `DATABASE_URL` → `docai_app`, which keeps no CREATE privilege.

`drizzle.config.ts` prefers `MIGRATE_DATABASE_URL` and falls back to `DATABASE_URL`.
Drizzle's bookkeeping table (`docai.__drizzle_migrations`) lives in `docai`.
