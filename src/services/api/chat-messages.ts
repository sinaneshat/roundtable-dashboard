/**
 * Chat Messages Service - Message Operations API
 *
 * 100% type-safe RPC service for chat message operations
 * All types automatically inferred from backend Hono routes
 *
 * NOTE: All chat messages use streaming for better UX
 * The old sendMessage endpoint has been removed in favor of streamChat
 */

import type { InferRequestType, InferResponseType } from 'hono/client';

import type { ApiClientType } from '@/api/client';
import { createApiClient } from '@/api/client';

// ============================================================================
// Type Inference - Automatically derived from backend routes
// ============================================================================

export type StreamChatRequest = InferRequestType<
  ApiClientType['chat']['threads'][':id']['stream']['$post']
>;

export type StreamChatResponse = InferResponseType<
  ApiClientType['chat']['threads'][':id']['stream']['$post']
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
 * NOTE: This returns a Response object with SSE stream, not JSON
 *
 * @param threadId - Thread ID
 * @param data - Message content for streaming
 */
export async function streamChatService(
  threadId: string,
  data: Omit<StreamChatRequest, 'param'>,
) {
  const client = await createApiClient();
  // Return the raw Response for streaming (don't parse as JSON)
  return client.chat.threads[':id'].stream.$post({
    param: { id: threadId },
    ...data,
  });
}
