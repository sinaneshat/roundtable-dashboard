/**
 * Chat Messages Service - Streaming Chat Operations
 *
 * 100% type-safe RPC service for chat message operations
 * All types automatically inferred from backend Hono routes
 */

import type { InferRequestType, InferResponseType } from 'hono/client';

import type { ApiClientType } from '@/api/client';
import { createApiClient } from '@/api/client';

// ============================================================================
// Type Inference - Automatically derived from backend routes
// ============================================================================

export type StreamChatRequest = InferRequestType<
  ApiClientType['chat']['$post']
>;

export type StreamChatResponse = InferResponseType<
  ApiClientType['chat']['$post']
>;

// ============================================================================
// Service Functions
// ============================================================================

/**
 * Stream AI chat response using SSE
 * Protected endpoint - requires authentication
 *
 * This endpoint returns a streaming response for real-time AI chat:
 * 1. Saves user message immediately
 * 2. Streams AI response token-by-token using AI SDK v5
 * 3. Saves assistant message on completion
 * 4. Returns SSE stream (compatible with useChat hook)
 *
 * EXCEPTION: Does NOT use parseResponse() because streaming responses
 * must return raw Response object (not parsed JSON) for SSE to work.
 * All other services use parseResponse() for consistency.
 *
 * @param data - Message content for streaming (inferred from RPC type)
 */
export async function streamChatService(data: StreamChatRequest) {
  const client = await createApiClient();
  return await client.chat.$post(data);
}
