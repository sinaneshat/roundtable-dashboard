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

export type CreatePreSearchRequest = InferRequestType<
  ApiClientType['chat']['threads'][':threadId']['rounds'][':roundNumber']['pre-search']['create']['$post']
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
 *
 * @param params - Request parameters
 * @param params.param - Route parameters
 * @param params.param.threadId - Thread ID
 * @param params.param.roundNumber - Round number
 * @param params.json - Request body
 * @param params.json.userQuery - User query for web search
 */
export async function createPreSearchService(params: {
  param: {
    threadId: string;
    roundNumber: string;
  };
  json: {
    userQuery: string;
  };
}) {
  const client = await createApiClient();

  const response = await client.chat.threads[':threadId'].rounds[':roundNumber']['pre-search'].create.$post({
    param: {
      threadId: params.param.threadId,
      roundNumber: params.param.roundNumber,
    },
    json: {
      userQuery: params.json.userQuery,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to create pre-search: ${response.statusText}`);
  }

  return response.json();
}

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
 * @param params - Request parameters inferred from RPC type
 */
export async function executePreSearchStreamService(params: PreSearchRequest) {
  const client = await createApiClient();
  return await client.chat.threads[':threadId'].rounds[':roundNumber']['pre-search'].$post(params);
}
