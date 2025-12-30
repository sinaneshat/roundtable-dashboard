/**
 * Route Utilities
 * Shared utilities for route detection and public route handling
 */

/**
 * Routes that don't require authentication (SSG pages)
 * These routes skip auth checks in layouts to allow static generation
 */
export const PUBLIC_ROUTES = ['/chat/pricing'] as const;

/**
 * Parse pathname from request headers
 * Used to detect current route in server components during SSG/SSR
 */
export function getPathnameFromHeaders(headersList: Headers): string {
  const referer = headersList.get('referer') || '';
  const nextUrl = headersList.get('next-url') || '';

  try {
    if (nextUrl) {
      return new URL(nextUrl, 'http://localhost').pathname;
    }
    if (referer) {
      return new URL(referer).pathname;
    }
  } catch {
    // Ignore URL parsing errors
  }

  return '';
}

/**
 * Check if pathname matches a public route
 */
export function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some(route => pathname.startsWith(route));
}

/**
 * Check if auth should be skipped for the given headers
 * Returns true during SSG build (no pathname) or for public routes
 */
export function shouldSkipAuth(headersList: Headers): boolean {
  const pathname = getPathnameFromHeaders(headersList);
  // Skip auth when pathname is unknown (SSG build) or for public routes
  return !pathname || isPublicRoute(pathname);
}
