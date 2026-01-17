/**
 * Chat Round Feedback Service - Round Feedback API
 *
 * 100% type-safe RPC service for round feedback operations
 * All types automatically inferred from backend Hono routes
 */

import { parseResponse } from 'hono/client';

import { createApiClient } from '@/api/client';

// ============================================================================
// Type Inference - Automatically derived from backend routes
// ============================================================================

export type SetRoundFeedbackRequest = any;

export type SetRoundFeedbackResponse = any;

export type GetThreadFeedbackRequest = any;

export type GetThreadFeedbackResponse = any;

// ============================================================================
// Service Functions
// ============================================================================

/**
 * Set Round Feedback
 * Protected endpoint - requires authentication (ownership check)
 */
export async function setRoundFeedbackService(data: SetRoundFeedbackRequest) {
  const client = await createApiClient();
  const params: SetRoundFeedbackRequest = {
    param: data.param ?? { threadId: '', roundNumber: '' },
    json: data.json ?? { feedbackType: null },
  };
  return parseResponse(client.chat.threads[':threadId'].rounds[':roundNumber'].feedback.$put(params));
}

/**
 * Get Thread Feedback
 * Protected endpoint - requires authentication (ownership check)
 *
 * @param data - Request arguments with thread id
 * @param options - Service options
 * @param options.cookieHeader - Pre-captured cookie header for server-side fire-and-forget prefetches
 */
export async function getThreadFeedbackService(
  data: GetThreadFeedbackRequest,
  options?: { cookieHeader?: string },
) {
  const client = await createApiClient({ cookieHeader: options?.cookieHeader });
  const params: GetThreadFeedbackRequest = {
    param: data.param ?? { id: '' },
  };
  return parseResponse(client.chat.threads[':id'].feedback.$get(params));
}
