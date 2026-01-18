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
// Type Inference - Endpoint definitions
// ============================================================================

type ListUserPresetsEndpoint = ApiClientType['chat']['user-presets']['$get'];
type CreateUserPresetEndpoint = ApiClientType['chat']['user-presets']['$post'];
type GetUserPresetEndpoint = ApiClientType['chat']['user-presets'][':id']['$get'];
type UpdateUserPresetEndpoint = ApiClientType['chat']['user-presets'][':id']['$patch'];
type DeleteUserPresetEndpoint = ApiClientType['chat']['user-presets'][':id']['$delete'];

// ============================================================================
// Type Exports - Request/Response types
// ============================================================================

export type ListUserPresetsRequest = InferRequestType<ListUserPresetsEndpoint>;
export type ListUserPresetsResponse = InferResponseType<ListUserPresetsEndpoint, 200>;

export type CreateUserPresetRequest = InferRequestType<CreateUserPresetEndpoint>;
export type CreateUserPresetResponse = InferResponseType<CreateUserPresetEndpoint, 200>;

export type GetUserPresetRequest = InferRequestType<GetUserPresetEndpoint>;
export type GetUserPresetResponse = InferResponseType<GetUserPresetEndpoint, 200>;

export type UpdateUserPresetRequest = InferRequestType<UpdateUserPresetEndpoint>;
export type UpdateUserPresetResponse = InferResponseType<UpdateUserPresetEndpoint, 200>;

export type DeleteUserPresetRequest = InferRequestType<DeleteUserPresetEndpoint>;
export type DeleteUserPresetResponse = InferResponseType<DeleteUserPresetEndpoint, 200>;

// ============================================================================
// Service Functions - CRUD operations
// ============================================================================

export async function listUserPresetsService(data?: ListUserPresetsRequest) {
  const client = createApiClient();
  return parseResponse(client.chat['user-presets'].$get(data ?? { query: {} }));
}

export async function createUserPresetService(data: CreateUserPresetRequest) {
  const client = createApiClient();
  return parseResponse(client.chat['user-presets'].$post(data));
}

export async function getUserPresetService(data: GetUserPresetRequest) {
  const client = createApiClient();
  return parseResponse(client.chat['user-presets'][':id'].$get(data));
}

export async function updateUserPresetService(data: UpdateUserPresetRequest) {
  const client = createApiClient();
  return parseResponse(client.chat['user-presets'][':id'].$patch(data));
}

export async function deleteUserPresetService(data: DeleteUserPresetRequest) {
  const client = createApiClient();
  return parseResponse(client.chat['user-presets'][':id'].$delete(data));
}

// ============================================================================
// Derived Types
// ============================================================================

/**
 * UserPreset - User preset item derived from API response
 */
export type UserPreset = Extract<
  ListUserPresetsResponse,
  { success: true }
> extends { data: { items: Array<infer R> } }
  ? R
  : never;
