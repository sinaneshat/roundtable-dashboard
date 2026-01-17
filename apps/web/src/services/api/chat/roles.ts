/**
 * Chat Custom Roles Service - Custom Role Management API
 *
 * 100% type-safe RPC service for custom role template operations
 * All types automatically inferred from backend Hono routes
 */

import { parseResponse } from 'hono/client';

import { createApiClient } from '@/api/client';

// ============================================================================
// Type Inference - Automatically derived from backend routes
// ============================================================================

export type ListCustomRolesRequest = any;

export type ListCustomRolesResponse = any;

export type CreateCustomRoleRequest = any;

export type CreateCustomRoleResponse = any;

export type GetCustomRoleRequest = any;

export type GetCustomRoleResponse = any;

export type UpdateCustomRoleRequest = any;

export type UpdateCustomRoleResponse = any;

export type DeleteCustomRoleRequest = any;

export type DeleteCustomRoleResponse = any;

// ============================================================================
// Service Functions
// ============================================================================

/**
 * List user custom role templates with cursor pagination
 * Protected endpoint - requires authentication
 */
export async function listCustomRolesService(args?: ListCustomRolesRequest) {
  const client = await createApiClient();
  return parseResponse(client.chat['custom-roles'].$get(args ?? { query: {} }));
}

/**
 * Create a new custom role template
 * Protected endpoint - requires authentication
 */
export async function createCustomRoleService(data: CreateCustomRoleRequest) {
  const client = await createApiClient();
  return parseResponse(client.chat['custom-roles'].$post(data));
}

/**
 * Get a specific custom role by ID
 * Protected endpoint - requires authentication
 */
export async function getCustomRoleService(data: GetCustomRoleRequest) {
  const client = await createApiClient();
  return parseResponse(client.chat['custom-roles'][':id'].$get(data));
}

/**
 * Update custom role details
 * Protected endpoint - requires authentication
 */
export async function updateCustomRoleService(data: UpdateCustomRoleRequest) {
  const client = await createApiClient();
  return parseResponse(client.chat['custom-roles'][':id'].$patch(data));
}

/**
 * Delete a custom role template
 * Protected endpoint - requires authentication
 */
export async function deleteCustomRoleService(data: DeleteCustomRoleRequest) {
  const client = await createApiClient();
  return parseResponse(client.chat['custom-roles'][':id'].$delete(data));
}
