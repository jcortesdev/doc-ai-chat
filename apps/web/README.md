# @doc-ai-chat/web

Next.js 16 App Router. Hosts the frontend UI and the public API route handlers (`/api/ingest`, `/api/chat`, `/api/evals`, `/api/byok`, `/api/usage`).

**Status:** scaffolded in M1.

## Routes (planned)

| Path | Module | Purpose |
|---|---|---|
| `/[locale]/` | M1 | Landing + upload affordance. |
| `/[locale]/ingest/[id]` | M1 | Ingest status: chunks, tokens, USD, latency. |
| `/[locale]/search` | M2 | Hybrid retrieval explorer (no LLM). |
| `/[locale]/chat` | M3 | RAG chat with streaming + citations. |
| `/[locale]/settings` | M4 | BYOK form, language, theme. |
| `/[locale]/usage` | M4 | Cost / latency dashboard. |
| `/[locale]/evals` | M5 | Golden set scorecard. |
| `/[locale]/agent` | M6 | Deep-reasoning UI. |
| `/[locale]/benchmark` | M7 | Tier-matched provider comparison. |
| `/[locale]/limits` | M0 doc, M3 visible | Demo limits + "hire me". |
| `/[locale]/privacy` | M4 | Retention + delete-my-data. |

`[locale]` = `en` or `es` (see `messages/`).

## API (planned)

All Route Handlers under `app/api/`, all reads/writes scoped by `workspaceId` server-side.
