/**
 * Admin Clear User Cache Service
 *
 * 100% type-safe RPC service for admin cache clear operations
 * Types fully inferred from backend via Hono RPC - no hardcoded types
 */

import type { InferRequestType, InferResponseType } from 'hono/client';

import type { ApiClientType } from '@/lib/api/client';
import { createApiClient, ServiceFetchError } from '@/lib/api/client';

// ============================================================================
// Type Inference - Endpoint definitions
// ============================================================================

type AdminClearUserCacheEndpoint = ApiClientType['admin']['users']['clear-cache']['$post'];

// ============================================================================
// Type Exports - Request/Response types inferred from backend
// ============================================================================

export type AdminClearUserCacheParams = InferRequestType<AdminClearUserCacheEndpoint>;
export type AdminClearUserCacheResponse = InferResponseType<AdminClearUserCacheEndpoint, 200>;

// ============================================================================
// Service Functions
// ============================================================================

/**
 * Clear all server-side caches for a user (admin only)
 * Used during impersonation to ensure fresh data
 */
export async function adminClearUserCacheService(data: AdminClearUserCacheParams) {
  const client = createApiClient();
  const res = await client.admin.users['clear-cache'].$post(data);
  if (!res.ok) {
    throw new ServiceFetchError(`Failed to clear user cache: ${res.statusText}`, res.status, res.statusText);
  }
  return res.json();
}
