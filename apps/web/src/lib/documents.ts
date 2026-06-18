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
