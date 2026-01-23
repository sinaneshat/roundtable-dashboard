/**
 * Admin User Search Service
 *
 * 100% type-safe RPC service for admin user search operations
 * Types fully inferred from backend via Hono RPC - no hardcoded types
 */

import type { InferRequestType, InferResponseType } from 'hono/client';

import type { ApiClientType } from '@/lib/api/client';
import { createApiClient, ServiceFetchError } from '@/lib/api/client';

// ============================================================================
// Type Inference - Endpoint definitions
// ============================================================================

type AdminSearchUsersEndpoint = ApiClientType['admin']['users']['search']['$get'];

// ============================================================================
// Type Exports - Request/Response types inferred from backend
// ============================================================================

export type AdminSearchUsersParams = InferRequestType<AdminSearchUsersEndpoint>;
export type AdminSearchUsersResponse = InferResponseType<AdminSearchUsersEndpoint, 200>;

// Derive user result type from response
type SuccessResponse = Extract<AdminSearchUsersResponse, { success: true }>;
type SearchData = SuccessResponse['data'];
export type AdminSearchUserResult = SearchData['users'][number];

// ============================================================================
// Service Functions
// ============================================================================

/**
 * Search for users by name or email (admin only)
 * Protected endpoint - requires admin role
 */
export async function adminSearchUserService(data: AdminSearchUsersParams) {
  const client = createApiClient();
  const res = await client.admin.users.search.$get(data);
  if (!res.ok) {
    throw new ServiceFetchError(`Failed to search users: ${res.statusText}`, res.status, res.statusText);
  }
  return res.json();
}
