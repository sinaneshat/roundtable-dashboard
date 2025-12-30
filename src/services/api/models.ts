/**
 * Models Service - AI Models API Client
 *
 * ✅ 100% TYPE-SAFE: RPC service for model operations
 * ✅ AUTO-INFERRED TYPES: All types automatically derived from backend Hono routes
 * ✅ ZOD VALIDATION: Backend validates responses, frontend gets type safety
 *
 * All model data sourced from models-config.service.ts on backend
 */

import type { InferResponseType } from 'hono/client';
import { parseResponse } from 'hono/client';

import type { ApiClientType } from '@/api/client';
import { createApiClient, createPublicApiClient } from '@/api/client';

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
 * Get curated AI models with tier-based access control
 *
 * ✅ RETURNS: Top 20 models from models-config.service.ts
 * ✅ INCLUDES: Tier access info, flagship models, default model
 * ✅ CACHED: Client-side with infinite stale time (models are static)
 *
 * @param options - Service options
 * @param options.bypassCache - If true, bypasses HTTP cache to get fresh data
 * @returns {Promise<ListModelsResponse>} Fully typed model list with tier information
 */
export async function listModelsService(options?: { bypassCache?: boolean }) {
  const client = await createApiClient({ bypassCache: options?.bypassCache });
  return parseResponse(client.models.$get());
}

/**
 * Get models for public pages (no authentication required)
 *
 * IMPORTANT: Uses createPublicApiClient() instead of createApiClient()
 * to avoid accessing cookies, which would break ISR/SSG rendering.
 *
 * Returns models with FREE tier access defaults (unauthenticated user).
 */
export async function listModelsPublicService() {
  const client = createPublicApiClient();
  return parseResponse(client.models.$get());
}
