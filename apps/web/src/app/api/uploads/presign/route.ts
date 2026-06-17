import { randomUUID } from 'node:crypto';
import { getSignedUploadUrl } from '@/lib/r2';
import { ensureWorkspace } from '@/lib/workspace';
import { auth, currentUser } from '@clerk/nextjs/server';
import { db } from '@doc-ai-chat/db/client';
import { documents } from '@doc-ai-chat/db/schema';
import { NextResponse } from 'next/server';
import { z } from 'zod';

// Logged-in tier defaults. Full per-tier enforcement (anon/logged/byok) lands in
// task 10; page-count is validated post-upload (needs the bytes) in task 10/11.
const MAX_BYTES = 10 * 1024 * 1024;
const RETENTION_DAYS = 7;
const PRESIGN_TTL_SECONDS = 5 * 60;

const presignSchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.literal('application/pdf'),
  size: z.number().int().positive().max(MAX_BYTES),
});

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = presignSchema.safeParse(body);
  if (!parsed.success) {
    const tooLarge = parsed.error.issues.some((issue) => issue.path[0] === 'size');
    return NextResponse.json(
      {
        error: tooLarge ? 'file_too_large' : 'invalid_request',
        issues: parsed.error.issues,
      },
      { status: tooLarge ? 413 : 400 },
    );
  }

  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? `${userId}@users.noreply`;
  const workspaceId = await ensureWorkspace(userId, email);

  const documentId = randomUUID();
  const r2Key = `${workspaceId}/${documentId}.pdf`;
  const expiresAt = new Date(Date.now() + RETENTION_DAYS * 24 * 60 * 60 * 1000);

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
