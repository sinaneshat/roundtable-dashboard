/**
 * User Presets Service - User Preset Management API
 *
 * 100% type-safe RPC service for user preset operations
 * All types automatically inferred from backend Hono routes via InferResponseType
 */

import type { InferRequestType, InferResponseType } from 'hono/client';
import { parseResponse } from 'hono/client';

import type { ApiClientType } from '@/lib/api/client';
import { createApiClient } from '@/lib/api/client';

// ============================================================================
// Type Inference - Automatically derived from backend routes
// ============================================================================

type ListUserPresetsEndpoint = ApiClientType['chat']['user-presets']['$get'];
export type ListUserPresetsResponse = InferResponseType<ListUserPresetsEndpoint>;
export type ListUserPresetsRequest = InferRequestType<ListUserPresetsEndpoint>;

type CreateUserPresetEndpoint = ApiClientType['chat']['user-presets']['$post'];
export type CreateUserPresetResponse = InferResponseType<CreateUserPresetEndpoint>;
export type CreateUserPresetRequest = InferRequestType<CreateUserPresetEndpoint>;

type GetUserPresetEndpoint = ApiClientType['chat']['user-presets'][':id']['$get'];
export type GetUserPresetResponse = InferResponseType<GetUserPresetEndpoint>;
export type GetUserPresetRequest = InferRequestType<GetUserPresetEndpoint>;

type UpdateUserPresetEndpoint = ApiClientType['chat']['user-presets'][':id']['$patch'];
export type UpdateUserPresetResponse = InferResponseType<UpdateUserPresetEndpoint>;
export type UpdateUserPresetRequest = InferRequestType<UpdateUserPresetEndpoint>;

type DeleteUserPresetEndpoint = ApiClientType['chat']['user-presets'][':id']['$delete'];
export type DeleteUserPresetResponse = InferResponseType<DeleteUserPresetEndpoint>;
export type DeleteUserPresetRequest = InferRequestType<DeleteUserPresetEndpoint>;

// ============================================================================
// Service Functions
// ============================================================================

/**
 * List user presets with cursor pagination
 * Protected endpoint - requires authentication
 */
export async function listUserPresetsService(args?: ListUserPresetsRequest) {
  const client = createApiClient();
  return parseResponse(client.chat['user-presets'].$get(args ?? { query: {} }));
}

/**
 * Create a new user preset
 * Protected endpoint - requires authentication
 */
export async function createUserPresetService(data: CreateUserPresetRequest) {
  const client = createApiClient();
  return parseResponse(client.chat['user-presets'].$post(data));
}

/**
 * Get a specific user preset by ID
 * Protected endpoint - requires authentication
 */
export async function getUserPresetService(data: GetUserPresetRequest) {
  const client = createApiClient();
  return parseResponse(client.chat['user-presets'][':id'].$get(data));
}

/**
 * Update user preset details
 * Protected endpoint - requires authentication
 */
export async function updateUserPresetService(data: UpdateUserPresetRequest) {
  const client = createApiClient();
  return parseResponse(client.chat['user-presets'][':id'].$patch(data));
}

/**
 * Delete a user preset
 * Protected endpoint - requires authentication
 */
export async function deleteUserPresetService(data: DeleteUserPresetRequest) {
  const client = createApiClient();
  return parseResponse(client.chat['user-presets'][':id'].$delete(data));
}
