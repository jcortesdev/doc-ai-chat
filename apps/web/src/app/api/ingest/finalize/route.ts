import { inngest } from '@/inngest/client';
import { auth } from '@clerk/nextjs/server';
import { db } from '@doc-ai-chat/db/client';
import { documents, workspaces } from '@doc-ai-chat/db/schema';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const finalizeSchema = z.object({ documentId: z.string().uuid() });

// Called by the client after the direct PUT to R2 succeeds. Verifies ownership,
// flips the document to `processing`, and dispatches the ingest event.
export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = finalizeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }

  const doc = await db.query.documents.findFirst({
    where: eq(documents.id, parsed.data.documentId),
    columns: { id: true, r2Key: true, workspaceId: true, uploaderId: true },
  });
  if (!doc) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  // Tenant isolation: the document's workspace must be owned by the caller.
  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, doc.workspaceId),
    columns: { ownerId: true },
  });
  if (!workspace || workspace.ownerId !== userId) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  await db
    .update(documents)
    .set({ status: 'processing', updatedAt: new Date() })
    .where(eq(documents.id, doc.id));

  await inngest.send({
    name: 'pdf.uploaded',
    data: {
      documentId: doc.id,
      r2Key: doc.r2Key,
      workspaceId: doc.workspaceId,
      uploaderId: doc.uploaderId ?? userId,
      startedAt: Date.now(),
    },
  });

  return NextResponse.json({ ok: true, documentId: doc.id, status: 'processing' });
}
