/**
 * Chat Pre-Search Service - SSE Streaming Web Search Execution
 *
 * 100% type-safe service for pre-search SSE streaming
 * Handles Server-Sent Events for real-time search progress
 *
 * ✅ TYPE INFERENCE: All types inferred from Zod schemas
 * ✅ SINGLE SOURCE OF TRUTH: Imports from shared schemas and enums
 */

import type { InferRequestType } from 'hono/client';

import type { ApiClientType } from '@/api/client';
import { createApiClient } from '@/api/client';

// ============================================================================
// Type Inference - Automatically derived from backend routes
// ============================================================================

export type PreSearchRequest = InferRequestType<
  ApiClientType['chat']['threads'][':threadId']['rounds'][':roundNumber']['pre-search']['$post']
>;

// ============================================================================
// Service Functions
// ============================================================================

/**
 * Get all pre-search results for a thread
 *
 * ✅ FOLLOWS: getThreadAnalysesService pattern exactly
 * ✅ USED BY: useThreadPreSearchesQuery hook (orchestrator)
 *
 * @param params - Request parameters
 * @param params.param - Route parameters
 * @param params.param.id - Thread ID
 */
export async function getThreadPreSearchesService(params: {
  param: {
    id: string;
  };
}) {
  const client = await createApiClient();

  const response = await client.chat.threads[':id']['pre-searches'].$get({
    param: {
      id: params.param.id,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch thread pre-searches: ${response.statusText}`);
  }

  return response.json();
}
