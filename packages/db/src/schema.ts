import { sql } from 'drizzle-orm';
import {
  boolean,
  customType,
  date,
  index,
  integer,
  numeric,
  pgSchema,
  text,
  timestamp,
  uuid,
  vector,
} from 'drizzle-orm/pg-core';

// Postgres `tsvector` has no first-class Drizzle column type; declare it so the
// generated BM25 column is typed and drizzle-kit emits the right DDL.
const tsvector = customType<{ data: string }>({
  dataType() {
    return 'tsvector';
  },
});

// Everything lives in the `docai` schema (ADR-002), never `public`.
export const docai = pgSchema('docai');

// Synced from Clerk via webhook (handler lands with the webhook secret later).
export const users = docai.table('users', {
  id: text('id').primaryKey(), // Clerk user id, e.g. "user_xxx"
  email: text('email').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// One workspace per user for now (ADR: no orgs).
export const workspaces = docai.table('workspaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: text('owner_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Uploaded PDF metadata + R2 key + ingest counters + retention expiry.
export const documents = docai.table(
  'documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    uploaderId: text('uploader_id').references(() => users.id, { onDelete: 'set null' }),
    filename: text('filename').notNull(),
    r2Key: text('r2_key').notNull(),
    // 'uploading' | 'processing' | 'ready' | 'failed'
    status: text('status').notNull().default('uploading'),
    pageCount: integer('page_count'),
    byteSize: integer('byte_size'),
    chunkCount: integer('chunk_count').notNull().default(0),
    totalTokens: integer('total_tokens').notNull().default(0),
    costUsd: numeric('cost_usd', { precision: 10, scale: 6 }).notNull().default('0'),
    latencyMs: integer('latency_ms'),
    // Maps to an <ErrorState> variant when status = 'failed' (e.g. 'pdf_unparseable').
    errorVariant: text('error_variant'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Retention cron sweeps by (workspace, expiry) (ADR-012 / SECURITY.md #5).
    index('documents_workspace_expires_idx').on(table.workspaceId, table.expiresAt),
  ],
);

// Text + page + embedding (cosine) + tsvector (BM25). Hybrid search in M2.
export const chunks = docai.table(
  'chunks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    // Denormalized for server-side tenant isolation on every query (SECURITY.md #4).
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    chunkIndex: integer('chunk_index').notNull(),
    content: text('content').notNull(),
    page: integer('page'),
    tokenCount: integer('token_count').notNull().default(0),
    // voyage-3 → 1024 dimensions (EMBEDDINGS_MODEL).
    embedding: vector('embedding', { dimensions: 1024 }),
    tsv: tsvector('tsv').generatedAlwaysAs(sql`to_tsvector('simple', "content")`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('chunks_document_idx').on(table.documentId),
    index('chunks_workspace_idx').on(table.workspaceId),
    // HNSW for cosine vector search (ADR-002).
    index('chunks_embedding_hnsw_idx')
      .using('hnsw', table.embedding.op('vector_cosine_ops'))
      .with({ m: 16, ef_construction: 64 }),
    // GIN for BM25 over the generated tsvector.
    index('chunks_tsv_gin_idx').using('gin', table.tsv),
  ],
);

// One row per paid model call: tokens, cost, latency (ADR-016 logging pattern).
export const usageEvents = docai.table(
  'usage_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'set null' }),
    documentId: uuid('document_id').references(() => documents.id, { onDelete: 'set null' }),
    model: text('model').notNull(),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    costUsd: numeric('cost_usd', { precision: 10, scale: 6 }).notNull().default('0'),
    latencyMs: integer('latency_ms'),
    // Privileged/owner activity is tagged so /usage can filter it out (ADR-010).
    isPrivileged: boolean('is_privileged').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('usage_events_created_model_idx').on(table.createdAt, table.model)],
);

// Daily aggregate for the project budget kill switch (ADR-015). Monthly cap is
// the sum over the month. BYOK calls are excluded by the caller.
export const projectBudgetUsage = docai.table('project_budget_usage', {
  day: date('day').primaryKey(),
  costUsd: numeric('cost_usd', { precision: 12, scale: 6 }).notNull().default('0'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
