/**
 * Chat Custom Roles Service - Custom Role Management API
 *
 * 100% type-safe RPC service for custom role template operations
 * All types automatically inferred from backend Hono routes
 */

import type { InferRequestType, InferResponseType } from 'hono/client';
import { parseResponse } from 'hono/client';

import type { ApiClientType } from '@/lib/api/client';
import { createApiClient } from '@/lib/api/client';

// ============================================================================
// Type Inference
// ============================================================================

type ListCustomRolesEndpoint = ApiClientType['chat']['custom-roles']['$get'];
export type ListCustomRolesRequest = InferRequestType<ListCustomRolesEndpoint>;
export type ListCustomRolesResponse = InferResponseType<ListCustomRolesEndpoint, 200>;

type CreateCustomRoleEndpoint = ApiClientType['chat']['custom-roles']['$post'];
export type CreateCustomRoleRequest = InferRequestType<CreateCustomRoleEndpoint>;
export type CreateCustomRoleResponse = InferResponseType<CreateCustomRoleEndpoint, 200>;

type GetCustomRoleEndpoint = ApiClientType['chat']['custom-roles'][':id']['$get'];
export type GetCustomRoleRequest = InferRequestType<GetCustomRoleEndpoint>;
export type GetCustomRoleResponse = InferResponseType<GetCustomRoleEndpoint, 200>;

type UpdateCustomRoleEndpoint = ApiClientType['chat']['custom-roles'][':id']['$patch'];
export type UpdateCustomRoleRequest = InferRequestType<UpdateCustomRoleEndpoint>;
export type UpdateCustomRoleResponse = InferResponseType<UpdateCustomRoleEndpoint, 200>;

type DeleteCustomRoleEndpoint = ApiClientType['chat']['custom-roles'][':id']['$delete'];
export type DeleteCustomRoleRequest = InferRequestType<DeleteCustomRoleEndpoint>;
export type DeleteCustomRoleResponse = InferResponseType<DeleteCustomRoleEndpoint, 200>;

// ============================================================================
// Service Functions
// ============================================================================

/**
 * List user custom role templates with cursor pagination
 * Protected endpoint - requires authentication
 */
export async function listCustomRolesService(args?: ListCustomRolesRequest) {
  const client = createApiClient();
  return parseResponse(client.chat['custom-roles'].$get(args ?? { query: {} }));
}

/**
 * Create a new custom role template
 * Protected endpoint - requires authentication
 */
export async function createCustomRoleService(data: CreateCustomRoleRequest) {
  const client = createApiClient();
  return parseResponse(client.chat['custom-roles'].$post(data));
}

/**
 * Get a specific custom role by ID
 * Protected endpoint - requires authentication
 */
export async function getCustomRoleService(data: GetCustomRoleRequest) {
  const client = createApiClient();
  return parseResponse(client.chat['custom-roles'][':id'].$get(data));
}

/**
 * Update custom role details
 * Protected endpoint - requires authentication
 */
export async function updateCustomRoleService(data: UpdateCustomRoleRequest) {
  const client = createApiClient();
  return parseResponse(client.chat['custom-roles'][':id'].$patch(data));
}

/**
 * Delete a custom role template
 * Protected endpoint - requires authentication
 */
export async function deleteCustomRoleService(data: DeleteCustomRoleRequest) {
  const client = createApiClient();
  return parseResponse(client.chat['custom-roles'][':id'].$delete(data));
}

// ============================================================================
// Derived Types
// ============================================================================

/**
 * CustomRole - Custom role item derived from API response
 */
export type CustomRole = Extract<
  ListCustomRolesResponse,
  { success: true }
> extends { data: { items: Array<infer R> } }
  ? R
  : never;
