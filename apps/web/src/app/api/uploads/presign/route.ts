import { randomUUID } from 'node:crypto';
import { checkProjectBudget } from '@/lib/budget';
import { isValidAnthropicKey } from '@/lib/byok';
import { getSignedUploadUrl } from '@/lib/r2';
import { getTierLimits, isTrialExpired } from '@/lib/tiers';
import { ensureWorkspace } from '@/lib/workspace';
import { auth, currentUser } from '@clerk/nextjs/server';
import { db } from '@doc-ai-chat/db/client';
import { documents } from '@doc-ai-chat/db/schema';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const PRESIGN_TTL_SECONDS = 5 * 60;

const presignSchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.literal('application/pdf'),
  size: z.number().int().positive(),
});

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = presignSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_request', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? null;
  const limits = getTierLimits(email);

  // File-size limit per tier (ADR-009). Page count is enforced post-upload in
  // the ingest worker, which needs the parsed PDF.
  if (parsed.data.size > limits.maxBytes) {
    return NextResponse.json(
      { error: 'file_too_large', variant: 'file_too_large', maxBytes: limits.maxBytes },
      { status: 413 },
    );
  }

  const { id: workspaceId, userCreatedAt } = await ensureWorkspace(
    userId,
    email ?? `${userId}@users.noreply`,
  );

  // BYOK users keep going past the free trial (they bring their own key for chat,
  // and upload embeddings are cheap + still budget-capped below). Read from the
  // header only, never the body; a malformed value is ignored (treated as no key).
  const headerKey = request.headers.get('x-user-api-key')?.trim();
  const isByok = Boolean(headerKey && isValidAnthropicKey(headerKey));

  // Free-tier gates uploads too, not just chat. Owners bypass (ADR-010).
  if (limits.tier !== 'privileged') {
    if (!isByok && isTrialExpired(userCreatedAt)) {
      return NextResponse.json({ error: 'weekly_lock' }, { status: 403 });
    }
    // Voyage embeddings are project-paid even on BYOK uploads, so the kill switch
    // still applies to every non-owner upload.
    if ((await checkProjectBudget()).over) {
      return NextResponse.json({ error: 'project_over_capacity' }, { status: 403 });
    }
  }

  const documentId = randomUUID();
  const r2Key = `${workspaceId}/${documentId}.pdf`;
  const expiresAt = new Date(Date.now() + limits.retentionDays * 24 * 60 * 60 * 1000);

  await db.insert(documents).values({
    id: documentId,
    workspaceId,
    uploaderId: userId,
    filename: parsed.data.filename,
    r2Key,
    byteSize: parsed.data.size,
    status: 'uploading',
    expiresAt,
  });

  const uploadUrl = await getSignedUploadUrl({
    key: r2Key,
    contentType: 'application/pdf',
    expiresInSeconds: PRESIGN_TTL_SECONDS,
  });

  return NextResponse.json({ documentId, r2Key, uploadUrl });
}
