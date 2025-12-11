/**
 * Chat Pre-Search Service - SSE Streaming Web Search Execution
 *
 * 100% type-safe service for pre-search SSE streaming
 * Handles Server-Sent Events for real-time search progress
 *
 * ✅ TYPE INFERENCE: All types inferred from Zod schemas
 * ✅ SINGLE SOURCE OF TRUTH: Imports from shared schemas and enums
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

export type CreatePreSearchRequest = InferRequestType<
  ApiClientType['chat']['threads'][':threadId']['rounds'][':roundNumber']['pre-search']['create']['$post']
>;

export type CreatePreSearchResponse = InferResponseType<
  ApiClientType['chat']['threads'][':threadId']['rounds'][':roundNumber']['pre-search']['create']['$post']
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
 * Create PENDING pre-search record
 *
 * ✅ NEW: Fixes web search ordering bug
 * ✅ IDEMPOTENT: Returns existing record if already exists
 * ✅ USED BY: useCreatePreSearch mutation hook
 * ✅ TYPE-SAFE: Uses CreatePreSearchRequest inferred from backend schema
 *
 * @param data - Request parameters inferred from backend route
 */
export async function createPreSearchService(data: CreatePreSearchRequest) {
  const client = await createApiClient();
  return parseResponse(client.chat.threads[':threadId'].rounds[':roundNumber']['pre-search'].create.$post(data));
}

/**
 * Get all pre-search results for a thread
 *
 * ✅ FOLLOWS: getThreadAnalysesService pattern exactly
 * ✅ USED BY: useThreadPreSearchesQuery hook (orchestrator)
 *
 * @param data - Request with param.id for thread ID
 */
export async function getThreadPreSearchesService(data: GetThreadPreSearchesRequest) {
  const client = await createApiClient();
  // Internal fallback: ensure param exists
  const params: GetThreadPreSearchesRequest = {
    param: data.param ?? { id: '' },
  };
  return parseResponse(client.chat.threads[':id']['pre-searches'].$get(params));
}

/**
 * Execute pre-search SSE stream
 *
 * ✅ PATTERN: Returns raw Response for SSE streaming (like streamChatService)
 * ✅ RPC-COMPLIANT: Uses Hono RPC client directly - no custom headers needed
 * ✅ USED BY: PreSearchStream component, executePreSearch utility
 *
 * EXCEPTION: Does NOT parse response because SSE streams must return raw Response
 * object for EventSource/ReadableStream processing.
 *
 * @param data - Request parameters inferred from RPC type
 */
export async function executePreSearchStreamService(data: PreSearchRequest) {
  const client = await createApiClient();
  return client.chat.threads[':threadId'].rounds[':roundNumber']['pre-search'].$post(data);
}
