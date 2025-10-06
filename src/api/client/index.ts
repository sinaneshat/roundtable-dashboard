/**
 * Hono RPC Client for API
 *
 * This client provides type-safe access to the backend API using Hono's RPC functionality.
 * It serves as the single source of truth for API communication and enables end-to-end
 * type safety between the backend routes and frontend services.
 */

import { hc } from 'hono/client';

import type { AppType } from '@/api';

/**
 * Base API URL - Context7 consistent pattern for SSR/hydration
 * CRITICAL FIX: Ensures consistent base URL between server and client
 */
function getBaseUrl() {
  // Both server and client should use the same base URL for query consistency
  const baseUrl = process.env.NEXT_PUBLIC_API_URL;

  if (baseUrl) {
    return baseUrl;
  }

  // Fallback logic
  if (typeof window === 'undefined') {
    // Server-side: use environment-specific URL
    if (process.env.NEXT_PUBLIC_APP_URL) {
      return `${process.env.NEXT_PUBLIC_APP_URL}/api/v1`;
    }
    return process.env.NODE_ENV === 'development' ? 'http://localhost:3000/api/v1' : 'https://app.roundtable.now/api/v1';
  }

  // Client-side: use same origin
  return `${window.location.origin}/api/v1`;
}

/**
 * Create a type-safe Hono RPC client
 *
 * Factory function that creates a fresh client instance with proper cookie handling:
 * - Client-side: Uses credentials: 'include' for automatic cookie handling
 * - Server-side: Dynamically imports cookies() and manually forwards them to overcome
 *   the limitation where credentials: 'include' doesn't work in server contexts
 */
export async function createApiClient() {
  // Check if we're on server-side (Next.js server component or API route)
  if (typeof window === 'undefined') {
    // Server-side: Dynamically import cookies to avoid client-side bundling issues
    // credentials: 'include' doesn't work in server contexts with Hono client
    const { cookies } = await import('next/headers');
    const cookieStore = await cookies();
    const cookieHeader = cookieStore.toString();

    return hc<AppType>(getBaseUrl(), {
      headers: {
        Accept: 'application/json',
        ...(cookieHeader && { Cookie: cookieHeader }),
      },
    });
  }

  // Client-side: Use standard credentials approach
  return hc<AppType>(getBaseUrl(), {
    headers: {
      Accept: 'application/json',
    },
    init: {
      credentials: 'include',
    },
  });
}

/**
 * Create a public API client without authentication
 *
 * For public endpoints that don't require authentication.
 * This client DOES NOT access cookies, making it safe for ISR/SSG pages.
 * Use this for:
 * - Public thread endpoints
 * - Public profile endpoints
 * - Any other publicly accessible endpoints
 */
export function createPublicApiClient() {
  return hc<AppType>(getBaseUrl(), {
    headers: {
      Accept: 'application/json',
    },
  });
}

/**
 * Centralized type for awaited API client - used across all services
 * This eliminates the need to repeat this type definition in every service
 */
export type ApiClientType = Awaited<ReturnType<typeof createApiClient>>;

/**
 * Export AppType for use in services layer
 */
export type { AppType };
