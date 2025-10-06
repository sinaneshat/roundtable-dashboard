/**
 * API Keys Service - API Key Management
 *
 * 100% type-safe RPC service for API key operations
 * All types automatically inferred from backend Hono routes
 * Following patterns from chat-threads.ts and subscriptions.ts
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
 *
 * CRITICAL: Consistent argument handling for SSR/hydration
 * Only pass args if defined to ensure server/client consistency
 */
export async function listApiKeysService(args?: ListApiKeysRequest) {
  const client = await createApiClient();
  return args
    ? parseResponse(client.auth['api-keys'].$get(args))
    : parseResponse(client.auth['api-keys'].$get());
}

/**
 * Get a specific API key by ID
 * Protected endpoint - requires authentication (ownership check)
 *
 * @param keyId - API key ID
 */
export async function getApiKeyService(keyId: string) {
  const client = await createApiClient();
  return parseResponse(
    client.auth['api-keys'][':keyId'].$get({
      param: { keyId },
    }),
  );
}

/**
 * Create a new API key
 * Protected endpoint - requires authentication
 *
 * @param data - API key creation data including name, expiresIn, remaining, metadata
 * @returns Promise with created API key (includes unhashed key - shown once)
 */
export async function createApiKeyService(data: CreateApiKeyRequest) {
  const client = await createApiClient();
  return parseResponse(client.auth['api-keys'].$post(data));
}

/**
 * Update an existing API key
 * Protected endpoint - requires authentication
 *
 * @param keyId - API key ID
 * @param data - API key update data
 */
export async function updateApiKeyService(
  keyId: string,
  data: Omit<UpdateApiKeyRequest, 'param'>,
) {
  const client = await createApiClient();
  return parseResponse(
    client.auth['api-keys'][':keyId'].$patch({
      param: { keyId },
      ...data,
    }),
  );
}

/**
 * Delete an API key
 * Protected endpoint - requires authentication
 *
 * @param keyId - API key ID
 */
export async function deleteApiKeyService(keyId: string) {
  const client = await createApiClient();
  return parseResponse(
    client.auth['api-keys'][':keyId'].$delete({
      param: { keyId },
    }),
  );
}
