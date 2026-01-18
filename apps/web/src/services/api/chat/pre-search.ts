/**
 * Chat Pre-Search Service - SSE Streaming Web Search Execution
 *
 * 100% type-safe service for pre-search SSE streaming
 * Handles Server-Sent Events for real-time search progress
 */

import type { InferRequestType, InferResponseType } from 'hono/client';
import { parseResponse } from 'hono/client';

import type { ApiClientType } from '@/lib/api/client';
import { createApiClient } from '@/lib/api/client';

// ============================================================================
// Type Inference
// ============================================================================

type PreSearchEndpoint = ApiClientType['chat']['threads'][':threadId']['rounds'][':roundNumber']['pre-search']['$post'];
export type PreSearchRequest = InferRequestType<PreSearchEndpoint>;
export type PreSearchResponse = InferResponseType<PreSearchEndpoint>;

type GetThreadPreSearchesEndpoint = ApiClientType['chat']['threads'][':id']['pre-searches']['$get'];
export type GetThreadPreSearchesRequest = InferRequestType<GetThreadPreSearchesEndpoint>;
export type GetThreadPreSearchesResponse = InferResponseType<GetThreadPreSearchesEndpoint>;

// ============================================================================
// Service Functions
// ============================================================================

/**
 * Get all pre-search results for a thread
 * Protected endpoint - requires authentication
 */
export async function getThreadPreSearchesService(
  data: GetThreadPreSearchesRequest,
  options?: { cookieHeader?: string },
) {
  const client = createApiClient({ cookieHeader: options?.cookieHeader });
  return parseResponse(client.chat.threads[':id']['pre-searches'].$get(data));
}

/**
 * Execute pre-search SSE stream
 * Protected endpoint - requires authentication
 *
 * EXCEPTION: Does NOT parse response because SSE streams must return raw Response
 * object for EventSource/ReadableStream processing.
 */
export async function executePreSearchStreamService(data: PreSearchRequest) {
  const client = createApiClient();
  return client.chat.threads[':threadId'].rounds[':roundNumber']['pre-search'].$post(data);
}
