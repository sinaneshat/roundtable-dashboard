/**
 * Models Service - Dynamic OpenRouter Models API
 *
 * 100% type-safe RPC service for OpenRouter model operations
 * All types automatically inferred from backend Hono routes
 */

import type { InferRequestType, InferResponseType } from 'hono/client';
import { parseResponse } from 'hono/client';

import type { ApiClientType } from '@/api/client';
import { createApiClient } from '@/api/client';

// ============================================================================
// Type Inference - Automatically derived from backend routes
// ============================================================================

export type ListModelsRequest = InferRequestType<
  ApiClientType['models']['$get']
>;

export type ListModelsResponse = InferResponseType<
  ApiClientType['models']['$get']
>;

export type GetModelRequest = InferRequestType<
  ApiClientType['models'][':modelId']['$get']
>;

export type GetModelResponse = InferResponseType<
  ApiClientType['models'][':modelId']['$get']
>;

export type ListProvidersRequest = InferRequestType<
  ApiClientType['models']['providers']['$get']
>;

export type ListProvidersResponse = InferResponseType<
  ApiClientType['models']['providers']['$get']
>;

// ============================================================================
// Service Functions
// ============================================================================

/**
 * Get all OpenRouter models with optional filtering
 *
 * ✅ SSG STRATEGY: Server-side prefetch with includeAll=true
 * - Prefetched in server components at page load time
 * - Returns ALL models with tier information
 * - Cached with infinite stale time (no refetches)
 * - Client components filter based on user's subscription tier
 *
 * Usage Patterns:
 * 1. Server-side prefetch (SSG):
 *    - Call with includeAll: 'true' in page.tsx
 *    - Models cached and available immediately on client
 *
 * 2. Client-side usage:
 *    - Use useModelsQuery({ includeAll: true }) hook
 *    - Consumes server-prefetched data from cache
 *    - No additional API calls needed
 *
 * @param args - Optional query parameters for filtering models
 * @param args.query.includeAll - Include all models regardless of tier (for prefetch)
 * @param args.query.provider - Filter by provider (e.g., "anthropic", "openai")
 * @param args.query.category - Filter by category (e.g., "reasoning", "general")
 * @param args.query.freeOnly - Show only free models
 * @param args.query.search - Search by name or description
 * @param args.query.supportsVision - Show only models with vision support
 */
export async function listModelsService(args?: ListModelsRequest) {
  const client = await createApiClient();
  return parseResponse(client.models.$get(args || { query: {} }));
}

/**
 * Get a specific model by ID
 * Public endpoint - no authentication required
 *
 * @param modelId - OpenRouter model ID (URL encoded, e.g., "anthropic%2Fclaude-4")
 */
export async function getModelService(modelId: string) {
  const client = await createApiClient();
  return parseResponse(
    client.models[':modelId'].$get({
      param: { modelId: encodeURIComponent(modelId) },
    }),
  );
}

/**
 * Get all model providers with their model counts
 * Public endpoint - no authentication required
 */
export async function listProvidersService() {
  const client = await createApiClient();
  return parseResponse(client.models.providers.$get({}));
}

/**
 * Clear the models cache
 * Public endpoint - no authentication required
 */
export async function clearModelsCacheService() {
  const client = await createApiClient();
  return parseResponse(client.models.cache.clear.$post({}));
}
