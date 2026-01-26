/**
 * API Keys Service - API Key Management
 *
 * 100% type-safe RPC service for API key operations
 * All types automatically inferred from backend Hono routes via InferResponseType
 */

import type { InferRequestType, InferResponseType } from 'hono/client';
import { parseResponse } from 'hono/client';

import type { ApiClientType } from '@/lib/api/client';
import { createApiClient } from '@/lib/api/client';

// ============================================================================
// Type Inference - Automatically derived from backend routes
// ============================================================================

type ListApiKeysEndpoint = ApiClientType['healthAuth']['auth']['api-keys']['$get'];
export type ListApiKeysResponse = InferResponseType<ListApiKeysEndpoint, 200>;
export type ListApiKeysRequest = InferRequestType<ListApiKeysEndpoint>;

type GetApiKeyEndpoint = ApiClientType['healthAuth']['auth']['api-keys'][':keyId']['$get'];
export type GetApiKeyResponse = InferResponseType<GetApiKeyEndpoint, 200>;
export type GetApiKeyRequest = InferRequestType<GetApiKeyEndpoint>;

type CreateApiKeyEndpoint = ApiClientType['healthAuth']['auth']['api-keys']['$post'];
export type CreateApiKeyResponse = InferResponseType<CreateApiKeyEndpoint, 200>;
export type CreateApiKeyRequest = InferRequestType<CreateApiKeyEndpoint>;

type UpdateApiKeyEndpoint = ApiClientType['healthAuth']['auth']['api-keys'][':keyId']['$patch'];
export type UpdateApiKeyResponse = InferResponseType<UpdateApiKeyEndpoint, 200>;
export type UpdateApiKeyRequest = InferRequestType<UpdateApiKeyEndpoint>;

type DeleteApiKeyEndpoint = ApiClientType['healthAuth']['auth']['api-keys'][':keyId']['$delete'];
export type DeleteApiKeyResponse = InferResponseType<DeleteApiKeyEndpoint, 200>;
export type DeleteApiKeyRequest = InferRequestType<DeleteApiKeyEndpoint>;

// ============================================================================
// Service Functions
// ============================================================================

/**
 * List all API keys for the authenticated user
 * Protected endpoint - requires authentication
 */
export async function listApiKeysService(data?: ListApiKeysRequest) {
  const client = createApiClient();
  return parseResponse(client.healthAuth.auth['api-keys'].$get(data ?? {}));
}

/**
 * Get a specific API key by ID
 * Protected endpoint - requires authentication (ownership check)
 */
export async function getApiKeyService(data: GetApiKeyRequest) {
  const client = createApiClient();
  return parseResponse(client.healthAuth.auth['api-keys'][':keyId'].$get(data));
}

/**
 * Create a new API key
 * Protected endpoint - requires authentication
 */
export async function createApiKeyService(data: CreateApiKeyRequest) {
  const client = createApiClient();
  return parseResponse(client.healthAuth.auth['api-keys'].$post(data));
}

/**
 * Update an existing API key
 * Protected endpoint - requires authentication
 */
export async function updateApiKeyService(data: UpdateApiKeyRequest) {
  const client = createApiClient();
  return parseResponse(client.healthAuth.auth['api-keys'][':keyId'].$patch(data));
}

/**
 * Delete an API key
 * Protected endpoint - requires authentication
 */
export async function deleteApiKeyService(data: DeleteApiKeyRequest) {
  const client = createApiClient();
  return parseResponse(client.healthAuth.auth['api-keys'][':keyId'].$delete(data));
}
