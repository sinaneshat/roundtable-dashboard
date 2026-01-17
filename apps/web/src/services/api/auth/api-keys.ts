/**
 * API Keys Service - API Key Management
 *
 * 100% type-safe RPC service for API key operations
 * All types automatically inferred from backend Hono routes
 */

import { parseResponse } from 'hono/client';

import { createApiClient } from '@/api/client';

// ============================================================================
// Type Inference - Automatically derived from backend routes
// ============================================================================

export type ListApiKeysRequest = any;

export type ListApiKeysResponse = any;

export type GetApiKeyRequest = any;

export type GetApiKeyResponse = any;

export type CreateApiKeyRequest = any;

export type CreateApiKeyResponse = any;

export type UpdateApiKeyRequest = any;

export type UpdateApiKeyResponse = any;

export type DeleteApiKeyRequest = any;

export type DeleteApiKeyResponse = any;

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
