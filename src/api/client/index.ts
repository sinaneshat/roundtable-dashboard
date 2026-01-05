/**
 * Hono RPC Client for API
 *
 * This client provides type-safe access to the backend API using Hono's RPC functionality.
 * It serves as the single source of truth for API communication and enables end-to-end
 * type safety between the backend routes and frontend services.
 */

import { hc } from 'hono/client';

import type { AppType } from '@/api';
import { getApiBaseUrl, getApiUrlAsync, getProductionApiUrl } from '@/lib/config/base-urls';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Centralized type for API client - used across all services
 * This eliminates the need to repeat this type definition in every service
 */
export type ApiClientType = ReturnType<typeof hc<AppType>>;

/**
 * Export AppType for use in services layer
 */
export type { AppType };

// ============================================================================
// URL Helpers
// ============================================================================

/**
 * Get API base URL for Hono RPC client
 * Server-side: uses production API URL for SSG builds
 * Client-side: uses same origin to ensure cookies work
 */
function getClientApiUrl() {
  if (typeof window === 'undefined') {
    return getProductionApiUrl();
  }
  return getApiBaseUrl();
}

// ============================================================================
// Client Factory Functions
// ============================================================================

/**
 * Create a type-safe Hono RPC client
 *
 * Factory function that creates a fresh client instance with proper cookie handling:
 * - Client-side: Uses credentials: 'include' for automatic cookie handling
 * - Server-side: Dynamically imports cookies() and manually forwards them to overcome
 *   the limitation where credentials: 'include' doesn't work in server contexts
 *
 * @param options - Client options
 * @param options.bypassCache - If true, adds cache-busting headers to bypass HTTP cache
 */
export async function createApiClient(options?: { bypassCache?: boolean }): Promise<ApiClientType> {
  // Check if we're on server-side (Next.js server component or API route)
  if (typeof window === 'undefined') {
    // Server-side: Dynamically import cookies to avoid client-side bundling issues
    // credentials: 'include' doesn't work in server contexts with Hono client
    const { cookies } = await import('next/headers');
    const cookieStore = await cookies();
    const cookieHeader = cookieStore.toString();

    const headers: Record<string, string> = {
      Accept: 'application/json',
    };

    if (options?.bypassCache) {
      headers['Cache-Control'] = 'no-cache';
      headers.Pragma = 'no-cache';
    }

    if (cookieHeader) {
      headers.Cookie = cookieHeader;
    }

    return hc<AppType>(getClientApiUrl(), { headers });
  }

  // Client-side: Use standard credentials approach
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (options?.bypassCache) {
    headers['Cache-Control'] = 'no-cache';
    headers.Pragma = 'no-cache';
  }

  return hc<AppType>(getClientApiUrl(), {
    headers,
    init: {
      credentials: 'include',
      ...(options?.bypassCache && { cache: 'no-cache' as RequestCache }),
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
 *
 * NOTE: Now async to properly detect Cloudflare runtime environment.
 * Uses getApiUrlAsync() to correctly resolve preview vs prod URLs.
 */
export async function createPublicApiClient(): Promise<ApiClientType> {
  // Server-side: use async env detection for proper Cloudflare context
  if (typeof window === 'undefined') {
    const apiUrl = await getApiUrlAsync();
    return hc<AppType>(apiUrl, {
      headers: {
        Accept: 'application/json',
      },
    });
  }

  // Client-side: use sync URL detection (hostname-based)
  return hc<AppType>(getApiBaseUrl(), {
    headers: {
      Accept: 'application/json',
    },
  });
}

// ============================================================================
// Authenticated Fetch Utility - For non-RPC requests (multipart, binary)
// ============================================================================

/**
 * Service fetch error with structured information
 */
export class ServiceFetchError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly statusText: string,
  ) {
    super(message);
    this.name = 'ServiceFetchError';
  }
}

/**
 * Authenticated fetch for non-RPC requests
 *
 * Use this for special cases where Hono RPC client doesn't work:
 * - multipart/form-data uploads
 * - application/octet-stream binary uploads
 *
 * Handles:
 * - Server-side cookie forwarding
 * - Client-side credentials
 * - Unified error handling
 *
 * @param path - API path (e.g., '/uploads/ticket/upload')
 * @param init - Fetch init options (method, body, headers)
 * @returns Response object
 * @throws ServiceFetchError if response is not ok
 */
export async function authenticatedFetch(
  path: string,
  init: RequestInit & { searchParams?: Record<string, string> },
): Promise<Response> {
  const baseUrl = getClientApiUrl();
  const url = new URL(`${baseUrl}${path}`);

  // Add search params if provided
  if (init.searchParams) {
    for (const [key, value] of Object.entries(init.searchParams)) {
      url.searchParams.set(key, value);
    }
  }

  const headers = new Headers(init.headers);

  // Server-side: manually forward cookies
  if (typeof window === 'undefined') {
    const { cookies } = await import('next/headers');
    const cookieStore = await cookies();
    const cookieHeader = cookieStore.toString();
    if (cookieHeader) {
      headers.set('Cookie', cookieHeader);
    }
  }

  const response = await fetch(url.toString(), {
    ...init,
    headers,
    credentials: 'include',
  });

  if (!response.ok) {
    throw new ServiceFetchError(
      `Request failed: ${response.statusText}`,
      response.status,
      response.statusText,
    );
  }

  return response;
}
