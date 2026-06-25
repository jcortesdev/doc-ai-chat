import { deleteDocumentRow, getOwnedDocumentForPdf } from '@/lib/documents';
import { deleteObject } from '@/lib/r2';
import { enforceRateLimit, rateLimitHeaders } from '@/lib/rate-limit';
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

// Delete one of the caller's uploaded documents (pre-M5). Tenant-isolated: the
// same ownership check the PDF proxy uses (getOwnedDocumentForPdf) gates this, so
// a user can only delete their own files (SECURITY.md #4). Removes the R2 object
// first, then the row (chunks cascade) — R2 delete is idempotent, so an
// interrupted call leaves no orphaned object, only an at-worst-retryable row.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // Same burst limiter scope as the PDF proxy; keyed by userId, fail-open.
  const rl = await enforceRateLimit('pdf', userId);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'rate_limit_exceeded' },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  const { id } = await params;
  const doc = await getOwnedDocumentForPdf(id, userId);
  if (!doc) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  try {
    await deleteObject(doc.r2Key);
    await deleteDocumentRow(id);
  } catch {
    return NextResponse.json({ error: 'delete_failed' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
