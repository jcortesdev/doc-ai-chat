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

// Friendly copy for the HTML error page below, keyed by error code. ES vs EN is
// chosen from Accept-Language since the proxy URL carries no locale (the citation
// link opens with rel="noreferrer", so there's no referrer to read either).
type ErrorCode = 'unauthorized' | 'rate_limit_exceeded' | 'not_found';

const ERROR_COPY: Record<ErrorCode, { en: [string, string]; es: [string, string] }> = {
  unauthorized: {
    en: ['Sign in required', 'Please sign in to view this document.'],
    es: ['Inicie sesión', 'Inicie sesión para ver este documento.'],
  },
  rate_limit_exceeded: {
    en: [
      'Too many requests',
      "You're opening documents too quickly. Please wait a moment and try again.",
    ],
    es: [
      'Demasiadas solicitudes',
      'Está abriendo documentos demasiado rápido. Espere un momento e intente de nuevo.',
    ],
  },
  not_found: {
    en: [
      'Document unavailable',
      "This document isn't available — it may have been deleted, have expired, or belong to another account.",
    ],
    es: [
      'Documento no disponible',
      'Este documento no está disponible — puede haber sido eliminado, haber expirado, o pertenecer a otra cuenta.',
    ],
  },
};

// The citation panel opens this proxy in a new tab, so an error would otherwise
// render as raw JSON. For a browser navigation (Accept: text/html) return a small
// friendly page instead; programmatic callers still get JSON.
function proxyError(
  request: Request,
  status: number,
  code: ErrorCode,
  headers?: Record<string, string>,
): Response {
  if (!(request.headers.get('accept') ?? '').includes('text/html')) {
    return NextResponse.json({ error: code }, { status, headers });
  }
  const es = (request.headers.get('accept-language') ?? '').toLowerCase().startsWith('es');
  const [title, message] = ERROR_COPY[code][es ? 'es' : 'en'];
  const html = `<!doctype html><html lang="${es ? 'es' : 'en'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title} · DocAI</title><style>:root{color-scheme:dark}body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0a0a0a;color:#ededed;font-family:system-ui,-apple-system,sans-serif;padding:24px}main{max-width:30rem;text-align:center}h1{margin:0 0 .5rem;font-size:1.25rem;font-weight:600}p{margin:0;color:#a3a3a3;font-size:.9rem;line-height:1.6}</style></head><body><main><h1>${title}</h1><p>${message}</p></main></body></html>`;
  return new Response(html, {
    status,
    headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' },
  });
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) {
    return proxyError(request, 401, 'unauthorized');
  }

  // Burst limiter on the R2 byte-streaming proxy (scrape protection). Applied to
  // all callers (no owner bypass): resolving the tier here would add a currentUser()
  // round-trip to the hot path, and the generous bucket never bothers a human
  // opening citations. Keyed by userId; fail-open if Redis is down.
  const rl = await enforceRateLimit('pdf', userId);
  if (!rl.ok) {
    return proxyError(request, 429, 'rate_limit_exceeded', rateLimitHeaders(rl));
  }

  const { id } = await params;
  const doc = await getOwnedDocumentForPdf(id, userId);
  if (!doc) {
    return proxyError(request, 404, 'not_found');
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
    return proxyError(request, 404, 'not_found');
  }
}
