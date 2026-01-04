import { getSessionCookie } from 'better-auth/cookies';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

/**
 * Next.js Proxy for Auth Redirects (Next.js 16+ pattern)
 *
 * Uses cookie-based session check (no DB call) to redirect
 * authenticated users away from auth pages → enables SSG for auth pages.
 *
 * Home page redirect handled in page.tsx with full session validation.
 * Protected route checks handled in layouts with full session validation.
 *
 * @see https://www.better-auth.com/docs/integrations/next
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/proxy
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Check for session cookie (fast, no DB call)
  const sessionCookie = getSessionCookie(request);

  // Auth pages: redirect authenticated users to /chat
  // This enables SSG for auth pages since redirect happens here, not in layout
  if (sessionCookie && pathname.startsWith('/auth/sign-')) {
    return NextResponse.redirect(new URL('/chat', request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Auth pages that should redirect authenticated users
  // Home page (/) handled in page.tsx with full session validation
  // Protected routes (/chat/*) handled in layout with full session validation
  matcher: ['/auth/sign-in', '/auth/sign-up'],
};
