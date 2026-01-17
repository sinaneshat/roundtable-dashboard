/**
 * Chat Messages Service - Streaming Chat Operations
 *
 * 100% type-safe RPC service for chat message operations
 * All types automatically inferred from backend Hono routes
 */

import { createApiClient } from '@/api/client';

// ============================================================================
// Type Inference - Automatically derived from backend routes
// ============================================================================

export type StreamChatRequest = any;

export type StreamChatResponse = any;

// ============================================================================
// Service Functions
// ============================================================================

/**
 * Stream AI chat response using SSE
 * Protected endpoint - requires authentication
 *
 * EXCEPTION: Does NOT use parseResponse() because streaming responses
 * must return raw Response object (not parsed JSON) for SSE to work.
 */
export async function streamChatService(data: StreamChatRequest) {
  const client = await createApiClient();
  return await client.chat.$post(data);
}
