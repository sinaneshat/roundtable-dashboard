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
 * Get curated AI models with tier-based access control
 *
 * ✅ RETURNS: Top 20 models from models-config.service.ts
 * ✅ INCLUDES: Tier access info, flagship models, default model
 * ✅ CACHED: Client-side with infinite stale time (models are static)
 *
 * @returns {Promise<ListModelsResponse>} Fully typed model list with tier information
 */
export async function listModelsService() {
  const client = await createApiClient();
  return parseResponse(client.models.$get());
}
