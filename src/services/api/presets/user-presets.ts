/**
 * User Presets Service - User Preset Management API
 *
 * 100% type-safe RPC service for user preset operations
 * All types automatically inferred from backend Hono routes
 */

import type { InferRequestType, InferResponseType } from 'hono/client';
import { parseResponse } from 'hono/client';

import type { ApiClientType } from '@/api/client';
import { createApiClient } from '@/api/client';

// ============================================================================
// Type Inference - Automatically derived from backend routes
// ============================================================================

export type ListUserPresetsRequest = InferRequestType<
  ApiClientType['chat']['user-presets']['$get']
>;

export type ListUserPresetsResponse = InferResponseType<
  ApiClientType['chat']['user-presets']['$get']
>;

export type CreateUserPresetRequest = InferRequestType<
  ApiClientType['chat']['user-presets']['$post']
>;

export type CreateUserPresetResponse = InferResponseType<
  ApiClientType['chat']['user-presets']['$post']
>;

export type GetUserPresetRequest = InferRequestType<
  ApiClientType['chat']['user-presets'][':id']['$get']
>;

export type GetUserPresetResponse = InferResponseType<
  ApiClientType['chat']['user-presets'][':id']['$get']
>;

export type UpdateUserPresetRequest = InferRequestType<
  ApiClientType['chat']['user-presets'][':id']['$patch']
>;

export type UpdateUserPresetResponse = InferResponseType<
  ApiClientType['chat']['user-presets'][':id']['$patch']
>;

export type DeleteUserPresetRequest = InferRequestType<
  ApiClientType['chat']['user-presets'][':id']['$delete']
>;

export type DeleteUserPresetResponse = InferResponseType<
  ApiClientType['chat']['user-presets'][':id']['$delete']
>;

// ============================================================================
// Service Functions
// ============================================================================

/**
 * List user presets with cursor pagination
 * Protected endpoint - requires authentication
 */
export async function listUserPresetsService(args?: ListUserPresetsRequest) {
  const client = await createApiClient();
  return parseResponse(client.chat['user-presets'].$get(args ?? { query: {} }));
}

/**
 * Create a new user preset
 * Protected endpoint - requires authentication
 */
export async function createUserPresetService(data: CreateUserPresetRequest) {
  const client = await createApiClient();
  return parseResponse(client.chat['user-presets'].$post(data));
}

/**
 * Get a specific user preset by ID
 * Protected endpoint - requires authentication
 */
export async function getUserPresetService(data: GetUserPresetRequest) {
  const client = await createApiClient();
  return parseResponse(client.chat['user-presets'][':id'].$get(data));
}

/**
 * Update user preset details
 * Protected endpoint - requires authentication
 */
export async function updateUserPresetService(data: UpdateUserPresetRequest) {
  const client = await createApiClient();
  return parseResponse(client.chat['user-presets'][':id'].$patch(data));
}

/**
 * Delete a user preset
 * Protected endpoint - requires authentication
 */
export async function deleteUserPresetService(data: DeleteUserPresetRequest) {
  const client = await createApiClient();
  return parseResponse(client.chat['user-presets'][':id'].$delete(data));
}
