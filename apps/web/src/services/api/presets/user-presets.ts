/**
 * User Presets Service - User Preset Management API
 *
 * 100% type-safe RPC service for user preset operations
 * All types automatically inferred from backend Hono routes
 */

import { parseResponse } from 'hono/client';

import { createApiClient } from '@/api/client';

// ============================================================================
// Type Inference - Automatically derived from backend routes
// ============================================================================

export type ListUserPresetsRequest = any;

export type ListUserPresetsResponse = any;

export type CreateUserPresetRequest = any;

export type CreateUserPresetResponse = any;

export type GetUserPresetRequest = any;

export type GetUserPresetResponse = any;

export type UpdateUserPresetRequest = any;

export type UpdateUserPresetResponse = any;

export type DeleteUserPresetRequest = any;

export type DeleteUserPresetResponse = any;

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
