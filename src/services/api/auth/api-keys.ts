/**
 * API Keys Service - API Key Management
 *
 * 100% type-safe RPC service for API key operations
 * All types automatically inferred from backend Hono routes
 */

import type { InferRequestType, InferResponseType } from 'hono/client';
import { parseResponse } from 'hono/client';

import type { ApiClientType } from '@/api/client';
import { createApiClient } from '@/api/client';

// ============================================================================
// Type Inference - Automatically derived from backend routes
// ============================================================================

export type ListApiKeysRequest = InferRequestType<
  ApiClientType['auth']['api-keys']['$get']
>;

export type ListApiKeysResponse = InferResponseType<
  ApiClientType['auth']['api-keys']['$get']
>;

export type GetApiKeyRequest = InferRequestType<
  ApiClientType['auth']['api-keys'][':keyId']['$get']
>;

export type GetApiKeyResponse = InferResponseType<
  ApiClientType['auth']['api-keys'][':keyId']['$get']
>;

export type CreateApiKeyRequest = InferRequestType<
  ApiClientType['auth']['api-keys']['$post']
>;

export type CreateApiKeyResponse = InferResponseType<
  ApiClientType['auth']['api-keys']['$post']
>;

export type UpdateApiKeyRequest = InferRequestType<
  ApiClientType['auth']['api-keys'][':keyId']['$patch']
>;

export type UpdateApiKeyResponse = InferResponseType<
  ApiClientType['auth']['api-keys'][':keyId']['$patch']
>;

export type DeleteApiKeyRequest = InferRequestType<
  ApiClientType['auth']['api-keys'][':keyId']['$delete']
>;

export type DeleteApiKeyResponse = InferResponseType<
  ApiClientType['auth']['api-keys'][':keyId']['$delete']
>;

// ============================================================================
// Service Functions
// ============================================================================

/**
 * List all API keys for the authenticated user
 * Protected endpoint - requires authentication
 */
export async function listApiKeysService(args?: ListApiKeysRequest) {
  const client = await createApiClient();
  return parseResponse(client.auth['api-keys'].$get(args ?? {}));
}

/**
 * Get a specific API key by ID
 * Protected endpoint - requires authentication (ownership check)
 */
export async function getApiKeyService(data: GetApiKeyRequest) {
  const client = await createApiClient();
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
  const client = await createApiClient();
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
  const client = await createApiClient();
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
  const client = await createApiClient();
  const params: DeleteApiKeyRequest = {
    param: data.param ?? { keyId: '' },
  };
  return parseResponse(client.auth['api-keys'][':keyId'].$delete(params));
}
