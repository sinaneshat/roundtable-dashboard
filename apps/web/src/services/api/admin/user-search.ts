/**
 * Admin User Search Service
 *
 * 100% type-safe RPC service for admin user search operations
 * All types automatically inferred from backend Hono routes
 */

import type { InferRequestType, InferResponseType } from 'hono/client';

import type { ApiClientType } from '@/lib/api/client';
import { createApiClient, ServiceFetchError } from '@/lib/api/client';

// ============================================================================
// Type Inference - Automatically derived from backend routes
// ============================================================================

type AdminSearchUserEndpoint = ApiClientType['admin']['users']['search']['$get'];
export type AdminSearchUserRequest = InferRequestType<AdminSearchUserEndpoint>;
export type AdminSearchUserResponse = InferResponseType<AdminSearchUserEndpoint, 200>;

// ============================================================================
// Service Functions
// ============================================================================

/**
 * Search for a user by email (admin only)
 * Protected endpoint - requires admin role
 */
export async function adminSearchUserService(data: AdminSearchUserRequest): Promise<AdminSearchUserResponse> {
  const client = createApiClient();
  const res = await client.admin.users.search.$get(data);
  if (!res.ok) {
    throw new ServiceFetchError(`Failed to search user: ${res.statusText}`, res.status, res.statusText);
  }
  return res.json();
}
