/**
 * Chat Custom Roles Service - Custom Role Management API
 *
 * 100% type-safe RPC service for custom role template operations
 * All types automatically inferred from backend Hono routes
 */

import type { InferRequestType, InferResponseType } from 'hono/client';
import { parseResponse } from 'hono/client';

import type { ApiClientType } from '@/api/client';
import { createApiClient } from '@/api/client';

// ============================================================================
// Type Inference - Automatically derived from backend routes
// ============================================================================

export type ListCustomRolesRequest = InferRequestType<
  ApiClientType['chat']['custom-roles']['$get']
>;

export type ListCustomRolesResponse = InferResponseType<
  ApiClientType['chat']['custom-roles']['$get']
>;

export type CreateCustomRoleRequest = InferRequestType<
  ApiClientType['chat']['custom-roles']['$post']
>;

export type CreateCustomRoleResponse = InferResponseType<
  ApiClientType['chat']['custom-roles']['$post']
>;

export type GetCustomRoleRequest = InferRequestType<
  ApiClientType['chat']['custom-roles'][':id']['$get']
>;

export type GetCustomRoleResponse = InferResponseType<
  ApiClientType['chat']['custom-roles'][':id']['$get']
>;

export type UpdateCustomRoleRequest = InferRequestType<
  ApiClientType['chat']['custom-roles'][':id']['$patch']
>;

export type UpdateCustomRoleResponse = InferResponseType<
  ApiClientType['chat']['custom-roles'][':id']['$patch']
>;

export type DeleteCustomRoleRequest = InferRequestType<
  ApiClientType['chat']['custom-roles'][':id']['$delete']
>;

export type DeleteCustomRoleResponse = InferResponseType<
  ApiClientType['chat']['custom-roles'][':id']['$delete']
>;

// ============================================================================
// Service Functions
// ============================================================================

/**
 * List user custom role templates with cursor pagination
 * Protected endpoint - requires authentication
 *
 * Following Hono RPC best practices: Always provide an object to $get()
 * even when all query parameters are optional. Use nullish coalescing
 * to ensure type safety.
 */
export async function listCustomRolesService(args?: ListCustomRolesRequest) {
  const client = await createApiClient();
  // Internal fallback: if args not provided, create proper empty query object
  const params: ListCustomRolesRequest = {
    query: args?.query ?? {},
  };
  return parseResponse(client.chat['custom-roles'].$get(params));
}

/**
 * Create a new custom role template
 * Protected endpoint - requires authentication
 *
 * @param data - Custom role data including name, description, systemPrompt, and defaultSettings
 */
export async function createCustomRoleService(data: CreateCustomRoleRequest) {
  const client = await createApiClient();
  // Internal fallback: ensure json property exists
  const params: CreateCustomRoleRequest = {
    json: data.json ?? {},
  };
  return parseResponse(client.chat['custom-roles'].$post(params));
}

/**
 * Get a specific custom role by ID
 * Protected endpoint - requires authentication
 *
 * @param data - Request with param.id for custom role ID
 */
export async function getCustomRoleService(data: GetCustomRoleRequest) {
  const client = await createApiClient();
  // Internal fallback: ensure param exists
  const params: GetCustomRoleRequest = {
    param: data.param ?? { id: '' },
  };
  return parseResponse(client.chat['custom-roles'][':id'].$get(params));
}

/**
 * Update custom role details
 * Protected endpoint - requires authentication
 *
 * @param data - Request with param.id and json body
 */
export async function updateCustomRoleService(data: UpdateCustomRoleRequest) {
  const client = await createApiClient();
  // Internal fallback: ensure param and json exist
  const params: UpdateCustomRoleRequest = {
    param: data.param ?? { id: '' },
    json: data.json ?? {},
  };
  return parseResponse(client.chat['custom-roles'][':id'].$patch(params));
}

/**
 * Delete a custom role template
 * Protected endpoint - requires authentication
 *
 * @param data - Request with param.id for custom role ID
 */
export async function deleteCustomRoleService(data: DeleteCustomRoleRequest) {
  const client = await createApiClient();
  // Internal fallback: ensure param exists
  const params: DeleteCustomRoleRequest = {
    param: data.param ?? { id: '' },
  };
  return parseResponse(client.chat['custom-roles'][':id'].$delete(params));
}
