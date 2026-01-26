/**
 * Models Service - AI Models API Client
 *
 * 100% type-safe RPC service for model operations
 * Types fully inferred from backend via Hono RPC - no hardcoded types
 *
 * Pattern: res.json() preserves type inference from Hono client
 */

import type { InferResponseType } from 'hono/client';

import type { ApiClientType } from '@/lib/api/client';
import { createApiClient, createPublicApiClient, ServiceFetchError } from '@/lib/api/client';
import type { ServiceOptions } from '@/services/api/types';

// ============================================================================
// Type Inference - Endpoint definitions
// ============================================================================

type ListModelsEndpoint = ApiClientType['utility']['models']['$get'];

// ============================================================================
// Type Exports - Response types inferred from backend
// ============================================================================

export type ListModelsResponse = InferResponseType<ListModelsEndpoint, 200>;

// ============================================================================
// Service Functions - List operations with auth/public variants
// Using res.json() pattern for proper type inference (Hono RPC docs)
// ============================================================================

/**
 * Get curated AI models with tier-based access control
 * Protected endpoint - requires authentication
 */
export async function listModelsService(options?: ServiceOptions) {
  const client = createApiClient({
    bypassCache: options?.bypassCache,
    cookieHeader: options?.cookieHeader,
  });
  const res = await client.utility.models.$get();
  if (!res.ok) {
    throw new ServiceFetchError(`Failed to fetch models: ${res.statusText}`, res.status, res.statusText);
  }
  return res.json();
}

/**
 * Get models for public pages (no authentication required)
 * Uses createPublicApiClient() for ISR/SSG compatibility
 */
export async function listModelsPublicService() {
  const client = createPublicApiClient();
  const res = await client.utility.models.$get();
  if (!res.ok) {
    throw new ServiceFetchError(`Failed to fetch models: ${res.statusText}`, res.status, res.statusText);
  }
  return res.json();
}

// ============================================================================
// Derived Types
// ============================================================================

/**
 * Extract model data type from response
 */
type SuccessResponse = Extract<ListModelsResponse, { success: true }>;
type ModelsData = SuccessResponse['data'];

/**
 * Model - Single model item derived from API response
 */
export type Model = ModelsData['items'][number];
