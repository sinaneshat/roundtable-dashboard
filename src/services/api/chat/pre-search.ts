/**
 * Chat Pre-Search Service - SSE Streaming Web Search Execution
 *
 * 100% type-safe service for pre-search SSE streaming
 * Handles Server-Sent Events for real-time search progress
 */

import type { InferRequestType, InferResponseType } from 'hono/client';
import { parseResponse } from 'hono/client';

import type { ApiClientType } from '@/api/client';
import { createApiClient } from '@/api/client';

// ============================================================================
// Type Inference - Automatically derived from backend routes
// ============================================================================

export type PreSearchRequest = InferRequestType<
  ApiClientType['chat']['threads'][':threadId']['rounds'][':roundNumber']['pre-search']['$post']
>;

export type PreSearchResponse = InferResponseType<
  ApiClientType['chat']['threads'][':threadId']['rounds'][':roundNumber']['pre-search']['$post']
>;

export type GetThreadPreSearchesRequest = InferRequestType<
  ApiClientType['chat']['threads'][':id']['pre-searches']['$get']
>;

export type GetThreadPreSearchesResponse = InferResponseType<
  ApiClientType['chat']['threads'][':id']['pre-searches']['$get']
>;

// ============================================================================
// Service Functions
// ============================================================================

/**
 * Get all pre-search results for a thread
 * Protected endpoint - requires authentication
 */
export async function getThreadPreSearchesService(data: GetThreadPreSearchesRequest) {
  const client = await createApiClient();
  const params: GetThreadPreSearchesRequest = {
    param: data.param ?? { id: '' },
  };
  return parseResponse(client.chat.threads[':id']['pre-searches'].$get(params));
}

/**
 * Execute pre-search SSE stream
 * Protected endpoint - requires authentication
 *
 * EXCEPTION: Does NOT parse response because SSE streams must return raw Response
 * object for EventSource/ReadableStream processing.
 */
export async function executePreSearchStreamService(data: PreSearchRequest) {
  const client = await createApiClient();
  return client.chat.threads[':threadId'].rounds[':roundNumber']['pre-search'].$post(data);
}
