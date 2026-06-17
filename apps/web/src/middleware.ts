import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { hasLocale } from 'next-intl';
import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

const handleI18nRouting = createMiddleware(routing);

// Everything is protected except the landing page, the auth pages, and the
// Clerk webhook endpoint. Routes are locale-prefixed (`/en/...`, `/es/...`),
// so the matchers account for the leading locale segment.
const isPublicRoute = createRouteMatcher([
  '/',
  '/:locale',
  '/:locale/sign-in(.*)',
  '/:locale/sign-up(.*)',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/webhooks(.*)',
  // Inngest calls this endpoint server-to-server (signed, no Clerk session).
  '/api/inngest(.*)',
  // Temporary dev trigger (removed after M1).
  '/api/dev(.*)',
]);

export default clerkMiddleware(async (auth, req) => {
  const { pathname } = req.nextUrl;

  if (!isPublicRoute(req)) {
    if (pathname.startsWith('/api')) {
      // API routes: 404/401 for unauthenticated callers, no redirect.
      await auth.protect();
    } else {
      // Page routes: send unauthenticated users to the locale-aware sign-in.
      const segment = pathname.split('/')[1];
      const locale = hasLocale(routing.locales, segment) ? segment : routing.defaultLocale;
      await auth.protect({
        unauthenticatedUrl: new URL(`/${locale}/sign-in`, req.url).toString(),
      });
    }
  }

  // next-intl handles page routing only; API routes pass through untouched.
  if (pathname.startsWith('/api')) {
    return;
  }

  return handleI18nRouting(req);
});

export const config = {
  matcher: [
    // Skip Next internals and files with an extension.
    '/((?!_next|_vercel|.*\\..*).*)',
    // Always run for API routes.
    '/(api|trpc)(.*)',
  ],
};
