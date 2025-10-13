/**
 * Models Service - Simplified OpenRouter Models API
 *
 * 100% type-safe RPC service for OpenRouter model operations
 * All types automatically inferred from backend Hono routes
 */

import type { InferResponseType } from 'hono/client';
import { parseResponse } from 'hono/client';

import type { ApiClientType } from '@/api/client';
import { createApiClient } from '@/api/client';

// ============================================================================
// Type Inference - Automatically derived from backend routes
// ============================================================================

export type ListModelsResponse = InferResponseType<
  ApiClientType['models']['$get']
>;

// ============================================================================
// Service Functions
// ============================================================================

/**
 * Get all OpenRouter models (no filtering, returns all models)
 *
 * Returns ALL models from OpenRouter API
 * Cached with infinite stale time (no refetches)
 */
export async function listModelsService() {
  const client = await createApiClient();
  return parseResponse(client.models.$get());
}
