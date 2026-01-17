/**
 * Chat Pre-Search Service - SSE Streaming Web Search Execution
 *
 * 100% type-safe service for pre-search SSE streaming
 * Handles Server-Sent Events for real-time search progress
 */

import { parseResponse } from 'hono/client';

import { createApiClient } from '@/api/client';

// ============================================================================
// Type Inference - Automatically derived from backend routes
// ============================================================================

export type PreSearchRequest = any;

export type PreSearchResponse = any;

export type GetThreadPreSearchesRequest = any;

export type GetThreadPreSearchesResponse = any;

// ============================================================================
// Service Functions
// ============================================================================

/**
 * Get all pre-search results for a thread
 * Protected endpoint - requires authentication
 *
 * @param data - Request arguments with thread id
 * @param options - Service options
 * @param options.cookieHeader - Pre-captured cookie header for server-side fire-and-forget prefetches
 */
export async function getThreadPreSearchesService(
  data: GetThreadPreSearchesRequest,
  options?: { cookieHeader?: string },
) {
  const client = await createApiClient({ cookieHeader: options?.cookieHeader });
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
