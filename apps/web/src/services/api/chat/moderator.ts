/**
 * Moderator Service - Council Moderator Streaming Operations
 *
 * 100% type-safe RPC service for moderator streaming
 * All types automatically inferred from backend Hono routes
 *
 * NOTE: Returns raw Response for SSE streaming - does NOT use parseResponse()
 */

import type { InferRequestType, InferResponseType } from 'hono/client';

import type { ApiClientType } from '@/lib/api/client';
import { createApiClient } from '@/lib/api/client';

// ============================================================================
// Type Inference
// ============================================================================

type StreamModeratorEndpoint = ApiClientType['chatFeature']['chat']['threads'][':threadId']['rounds'][':roundNumber']['moderator']['$post'];
export type StreamModeratorRequest = InferRequestType<StreamModeratorEndpoint>;
export type StreamModeratorResponse = InferResponseType<StreamModeratorEndpoint, 200>;

// ============================================================================
// Service Functions
// ============================================================================

/**
 * Stream council moderator summary response using SSE
 * Protected endpoint - requires authentication
 *
 * EXCEPTION: Does NOT use parseResponse() because streaming responses
 * must return raw Response object (not parsed JSON) for SSE to work.
 *
 * @param data - Request data with thread ID, round number, and optional participant message IDs
 * @param options - Optional configuration object
 * @param options.signal - Optional AbortSignal for cancellation
 */
export async function streamModeratorService(
  data: StreamModeratorRequest,
  options?: { signal?: AbortSignal },
) {
  // Use centralized client factory with abort signal support
  const client = createApiClient({ signal: options?.signal });
  return client.chatFeature.chat.threads[':threadId'].rounds[':roundNumber'].moderator.$post(data);
}
