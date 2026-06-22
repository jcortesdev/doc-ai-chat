import { getOwnedDocumentForPdf } from '@/lib/documents';
import { getObjectBytes } from '@/lib/r2';
import { enforceRateLimit, rateLimitHeaders } from '@/lib/rate-limit';
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

// Same-origin authenticated proxy for the original PDF (M3 task 7). The citation
// panel opens `/api/documents/[id]/pdf#page=N&:~:text=...` in a new tab; being
// same-origin, the request carries the Clerk session cookie. Every request
// re-authenticates and re-checks ownership (tenant isolation, SECURITY.md #4) —
// there is no shareable presigned URL to leak. The `#...` fragment is client-side
// only (the native PDF viewer reads it; it never reaches the server).
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // Burst limiter on the R2 byte-streaming proxy (scrape protection). Applied to
  // all callers (no owner bypass): resolving the tier here would add a currentUser()
  // round-trip to the hot path, and the generous bucket never bothers a human
  // opening citations. Keyed by userId; fail-open if Redis is down.
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
    const bytes = await getObjectBytes(doc.r2Key);
    return new Response(bytes as BodyInit, {
      headers: {
        'Content-Type': 'application/pdf',
        // Render inline in the browser's native viewer, never force a download.
        'Content-Disposition': 'inline',
        // Private document — never cache in shared/proxy caches.
        'Cache-Control': 'private, no-store',
      },
    });
  } catch {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
}
