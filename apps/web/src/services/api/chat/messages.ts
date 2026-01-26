/**
 * Chat Messages Service - Streaming Chat Operations
 *
 * 100% type-safe RPC service for chat message operations
 * All types automatically inferred from backend Hono routes
 */

import type { InferRequestType, InferResponseType } from 'hono/client';

import type { ApiClientType } from '@/lib/api/client';
import { createApiClient } from '@/lib/api/client';

// ============================================================================
// Type Inference
// ============================================================================

type StreamChatEndpoint = ApiClientType['chatMessage']['chat']['$post'];
export type StreamChatRequest = InferRequestType<StreamChatEndpoint>;
export type StreamChatResponse = InferResponseType<StreamChatEndpoint, 200>;

// ============================================================================
// Service Functions
// ============================================================================

/**
 * Stream AI chat response using SSE
 * Protected endpoint - requires authentication
 *
 * EXCEPTION: Does NOT parse response because SSE streams must return raw Response
 * object for EventSource/ReadableStream processing.
 */
export async function streamChatService(data: StreamChatRequest) {
  const client = createApiClient();
  return client.chatMessage.chat.$post(data);
}
