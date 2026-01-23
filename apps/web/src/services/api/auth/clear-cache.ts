/**
 * Auth Clear Own Cache Service
 *
 * 100% type-safe RPC service for clearing user's own server-side caches
 * Types fully inferred from backend via Hono RPC - no hardcoded types
 */

import type { InferResponseType } from 'hono/client';

import type { ApiClientType } from '@/lib/api/client';
import { createApiClient, ServiceFetchError } from '@/lib/api/client';

// ============================================================================
// Type Inference - Endpoint definitions
// ============================================================================

type ClearOwnCacheEndpoint = ApiClientType['auth']['clear-cache']['$post'];

// ============================================================================
// Type Exports - Request/Response types inferred from backend
// ============================================================================

export type ClearOwnCacheResponse = InferResponseType<ClearOwnCacheEndpoint, 200>;

// ============================================================================
// Service Functions
// ============================================================================

/**
 * Clear all server-side caches for current user
 * Use before logout to ensure clean state for next login
 */
export async function clearOwnCacheService() {
  const client = createApiClient();
  const res = await client.auth['clear-cache'].$post({});
  if (!res.ok) {
    throw new ServiceFetchError(`Failed to clear own cache: ${res.statusText}`, res.status, res.statusText);
  }
  return res.json();
}
