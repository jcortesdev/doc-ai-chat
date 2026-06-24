import { db } from '@doc-ai-chat/db/client';
import { documents, workspaces } from '@doc-ai-chat/db/schema';
import { eq } from 'drizzle-orm';

export type DocumentStatus = {
  id: string;
  filename: string;
  status: string;
  chunkCount: number;
  totalTokens: number;
  costUsd: string;
  latencyMs: number | null;
  pageCount: number | null;
  errorVariant: string | null;
};

// One row in the "your files" list (pre-M5). Counters come straight from the
// ingest run; `expiresAt` is the per-tier retention deadline (ADR-012).
export type DocumentListItem = {
  id: string;
  filename: string;
  status: string;
  pageCount: number | null;
  chunkCount: number;
  costUsd: string;
  createdAt: Date;
  expiresAt: Date;
};

// Fetches a document only if it belongs to the caller's workspace (tenant
// isolation, SECURITY.md #4). Returns null when missing or not owned.
export async function getOwnedDocument(id: string, userId: string): Promise<DocumentStatus | null> {
  const doc = await db.query.documents.findFirst({
    where: eq(documents.id, id),
    columns: {
      id: true,
      filename: true,
      status: true,
      chunkCount: true,
      totalTokens: true,
      costUsd: true,
      latencyMs: true,
      pageCount: true,
      errorVariant: true,
      workspaceId: true,
    },
  });
  if (!doc) {
    return null;
  }

  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, doc.workspaceId),
    columns: { ownerId: true },
  });
  if (!workspace || workspace.ownerId !== userId) {
    return null;
  }

  return {
    id: doc.id,
    filename: doc.filename,
    status: doc.status,
    chunkCount: doc.chunkCount,
    totalTokens: doc.totalTokens,
    costUsd: doc.costUsd,
    latencyMs: doc.latencyMs,
    pageCount: doc.pageCount,
    errorVariant: doc.errorVariant,
  };
}

// Same tenant-isolation check as getOwnedDocument, but returns the R2 key needed
// to serve the original PDF. Kept separate so r2Key never leaks into the public
// status response (DocumentStatus). Returns null when missing or not owned.
export async function getOwnedDocumentForPdf(
  id: string,
  userId: string,
): Promise<{ r2Key: string; filename: string } | null> {
  const doc = await db.query.documents.findFirst({
    where: eq(documents.id, id),
    columns: { r2Key: true, filename: true, workspaceId: true },
  });
  if (!doc) {
    return null;
  }

  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, doc.workspaceId),
    columns: { ownerId: true },
  });
  if (!workspace || workspace.ownerId !== userId) {
    return null;
  }

  return { r2Key: doc.r2Key, filename: doc.filename };
}

// Lists a workspace's documents, newest first (tenant isolation: the caller
// resolves the workspace from the Clerk session, never from client input).
export async function listWorkspaceDocuments(workspaceId: string): Promise<DocumentListItem[]> {
  return db.query.documents.findMany({
    where: eq(documents.workspaceId, workspaceId),
    columns: {
      id: true,
      filename: true,
      status: true,
      pageCount: true,
      chunkCount: true,
      costUsd: true,
      createdAt: true,
      expiresAt: true,
    },
    orderBy: (doc, { desc }) => [desc(doc.createdAt)],
  });
}

// Deletes a document row; its chunks cascade (FK onDelete: 'cascade'). Ownership
// is checked by the caller via getOwnedDocumentForPdf before this runs, so this
// takes only the id. The R2 object is deleted separately (deleteObject).
export async function deleteDocumentRow(id: string): Promise<void> {
  await db.delete(documents).where(eq(documents.id, id));
}
