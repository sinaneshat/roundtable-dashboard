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

type ListApiKeysEndpoint = ApiClientType['auth']['api-keys']['$get'];
export type ListApiKeysResponse = InferResponseType<ListApiKeysEndpoint>;
export type ListApiKeysRequest = InferRequestType<ListApiKeysEndpoint>;

type GetApiKeyEndpoint = ApiClientType['auth']['api-keys'][':keyId']['$get'];
export type GetApiKeyResponse = InferResponseType<GetApiKeyEndpoint>;
export type GetApiKeyRequest = InferRequestType<GetApiKeyEndpoint>;

type CreateApiKeyEndpoint = ApiClientType['auth']['api-keys']['$post'];
export type CreateApiKeyResponse = InferResponseType<CreateApiKeyEndpoint>;
export type CreateApiKeyRequest = InferRequestType<CreateApiKeyEndpoint>;

type UpdateApiKeyEndpoint = ApiClientType['auth']['api-keys'][':keyId']['$patch'];
export type UpdateApiKeyResponse = InferResponseType<UpdateApiKeyEndpoint>;
export type UpdateApiKeyRequest = InferRequestType<UpdateApiKeyEndpoint>;

type DeleteApiKeyEndpoint = ApiClientType['auth']['api-keys'][':keyId']['$delete'];
export type DeleteApiKeyResponse = InferResponseType<DeleteApiKeyEndpoint>;
export type DeleteApiKeyRequest = InferRequestType<DeleteApiKeyEndpoint>;

// ============================================================================
// Service Functions
// ============================================================================

/**
 * List all API keys for the authenticated user
 * Protected endpoint - requires authentication
 */
export async function listApiKeysService(args?: ListApiKeysRequest) {
  const client = createApiClient();
  return parseResponse(client.auth['api-keys'].$get(args ?? {}));
}

/**
 * Get a specific API key by ID
 * Protected endpoint - requires authentication (ownership check)
 */
export async function getApiKeyService(data: GetApiKeyRequest) {
  const client = createApiClient();
  const params: GetApiKeyRequest = {
    param: data.param ?? { keyId: '' },
  };
  return parseResponse(client.auth['api-keys'][':keyId'].$get(params));
}

/**
 * Create a new API key
 * Protected endpoint - requires authentication
 */
export async function createApiKeyService(data: CreateApiKeyRequest) {
  const client = createApiClient();
  const params: CreateApiKeyRequest = {
    json: data.json ?? {},
  };
  return parseResponse(client.auth['api-keys'].$post(params));
}

/**
 * Update an existing API key
 * Protected endpoint - requires authentication
 */
export async function updateApiKeyService(data: UpdateApiKeyRequest) {
  const client = createApiClient();
  const params: UpdateApiKeyRequest = {
    param: data.param ?? { keyId: '' },
    json: data.json ?? {},
  };
  return parseResponse(client.auth['api-keys'][':keyId'].$patch(params));
}

/**
 * Delete an API key
 * Protected endpoint - requires authentication
 */
export async function deleteApiKeyService(data: DeleteApiKeyRequest) {
  const client = createApiClient();
  const params: DeleteApiKeyRequest = {
    param: data.param ?? { keyId: '' },
  };
  return parseResponse(client.auth['api-keys'][':keyId'].$delete(params));
}
