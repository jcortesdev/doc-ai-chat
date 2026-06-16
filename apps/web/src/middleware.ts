import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

export default createMiddleware(routing);

export const config = {
  // Match all pathnames except for API routes, Next internals, and files with
  // an extension (e.g. favicon.ico). Clerk route protection lands in task 2.
  matcher: '/((?!api|_next|_vercel|.*\\..*).*)',
};
