/**
 * Models Service - AI Models API Client
 *
 * 100% type-safe RPC service for model operations
 * Following Hono RPC docs: types inferred via parseResponse(), no explicit returns
 */

import type { InferResponseType } from 'hono/client';
import { parseResponse } from 'hono/client';

import type { ApiClientType } from '@/lib/api/client';
import { createApiClient, createPublicApiClient } from '@/lib/api/client';

// ============================================================================
// Type Inference - Automatically derived from backend routes
// ============================================================================

type ListModelsEndpoint = ApiClientType['models']['$get'];
export type ListModelsResponse = InferResponseType<ListModelsEndpoint>;

// ============================================================================
// Service Functions - Types inferred from RPC chain, no explicit return types
// ============================================================================

/**
 * Get curated AI models with tier-based access control
 * Protected endpoint - requires authentication
 */
export async function listModelsService(options?: {
  bypassCache?: boolean;
  cookieHeader?: string;
}) {
  const client = createApiClient({
    bypassCache: options?.bypassCache,
    cookieHeader: options?.cookieHeader,
  });
  return parseResponse(client.models.$get());
}

/**
 * Get models for public pages (no authentication required)
 * Uses createPublicApiClient() for ISR/SSG compatibility
 */
export async function listModelsPublicService() {
  const client = createPublicApiClient();
  return parseResponse(client.models.$get());
}
