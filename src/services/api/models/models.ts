/**
 * Models Service - AI Models API Client
 *
 * 100% type-safe RPC service for model operations
 * All types automatically inferred from backend Hono routes
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
 * Protected endpoint - requires authentication
 *
 * @param options - Service options
 * @param options.bypassCache - If true, bypasses HTTP cache to get fresh data
 * @param options.cookieHeader - Pre-captured cookie header for server-side fire-and-forget prefetches
 */
export async function listModelsService(options?: {
  bypassCache?: boolean;
  cookieHeader?: string;
}) {
  const client = await createApiClient({
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
  const client = await createPublicApiClient();
  return parseResponse(client.models.$get());
}
