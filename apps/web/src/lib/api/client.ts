/**
 * Hono RPC Client for TanStack Start
 *
 * This client provides type-safe access to the backend API using Hono's RPC functionality.
 * It connects to the separate @roundtable/api worker.
 *
 * Type Safety:
 * - AppType is imported from @roundtable/api (dev dependency for types only)
 * - hc<AppType>() provides full end-to-end type safety
 * - Service functions use InferRequestType/InferResponseType from hono/client
 */

import type { AppType } from '@roundtable/api';
import { hc } from 'hono/client';

import { getApiBaseUrl } from '@/lib/config/base-urls';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * API client type - Fully typed Hono RPC client
 *
 * The AppType is imported from @roundtable/api which exports it from its index.ts.
 * This provides full type safety for all RPC calls.
 */
export type ApiClientType = ReturnType<typeof hc<AppType>>;

// ============================================================================
// Client Factory Functions
// ============================================================================

/**
 * Create a type-safe Hono RPC client
 *
 * For TanStack Start, all requests go to the external API worker.
 * Cookie handling is done via credentials: 'include'.
 *
 * @param options - Client options
 * @param options.bypassCache - If true, adds cache-busting headers
 * @param options.cookieHeader - Pre-captured cookie header for server-side fire-and-forget prefetches
 * @param options.signal - AbortSignal for request cancellation (streaming endpoints)
 */
export function createApiClient(options?: {
  bypassCache?: boolean;
  cookieHeader?: string;
  signal?: AbortSignal;
}): ApiClientType {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (options?.bypassCache) {
    headers['Cache-Control'] = 'no-cache';
    headers.Pragma = 'no-cache';
  }

  if (options?.cookieHeader) {
    headers.Cookie = options.cookieHeader;
  }

  // Custom fetch that guarantees credentials are sent with every request
  const fetchWithCredentials: typeof fetch = (input, init) => {
    return fetch(input, {
      ...init,
      credentials: 'include',
      ...(options?.bypassCache && { cache: 'no-cache' as RequestCache }),
      ...(options?.signal && { signal: options.signal }),
    });
  };

  return hc<AppType>(getApiBaseUrl(), {
    headers,
    fetch: fetchWithCredentials,
  });
}

/**
 * Create a public API client without authentication
 *
 * For public endpoints that don't require authentication.
 */

export function createPublicApiClient(): ApiClientType {
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
 * @param path - API path (e.g., '/uploads/ticket/upload')
 * @param init - Fetch init options (method, body, headers)
 * @returns Response object
 * @throws ServiceFetchError if response is not ok
 */
export async function authenticatedFetch(
  path: string,
  init: RequestInit & { searchParams?: Record<string, string> },
): Promise<Response> {
  const baseUrl = getApiBaseUrl();
  const url = new URL(`${baseUrl}${path}`);

  // Add search params if provided
  if (init.searchParams) {
    for (const [key, value] of Object.entries(init.searchParams)) {
      url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url.toString(), {
    ...init,
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

// ============================================================================
// Singleton Client Instance
// ============================================================================

/**
 * Default API client instance
 *
 * Use this for most API calls. Create a new client with createApiClient()
 * if you need custom options like cache bypassing.
 */
export const apiClient = createApiClient();
