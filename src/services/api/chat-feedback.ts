/**
 * Chat Round Feedback Service - Round Feedback API
 *
 * 100% type-safe RPC service for round feedback operations
 * All types automatically inferred from backend Hono routes
 */

import type { InferRequestType, InferResponseType } from 'hono/client';
import { parseResponse } from 'hono/client';

import type { ApiClientType } from '@/api/client';
import { createApiClient } from '@/api/client';

// ============================================================================
// Type Inference - Automatically derived from backend routes
// ============================================================================

export type SetRoundFeedbackRequest = InferRequestType<
  ApiClientType['chat']['threads'][':threadId']['rounds'][':roundNumber']['feedback']['$put']
>;

export type SetRoundFeedbackResponse = InferResponseType<
  ApiClientType['chat']['threads'][':threadId']['rounds'][':roundNumber']['feedback']['$put']
>;

export type GetThreadFeedbackRequest = InferRequestType<
  ApiClientType['chat']['threads'][':id']['feedback']['$get']
>;

export type GetThreadFeedbackResponse = InferResponseType<
  ApiClientType['chat']['threads'][':id']['feedback']['$get']
>;

// ============================================================================
// Service Functions - RPC-style API calls
// ============================================================================

/**
 * Set Round Feedback
 * Protected endpoint - requires authentication (ownership check)
 *
 * Set or update user feedback for a conversation round.
 * Pass null to remove feedback.
 *
 * @param data - Request with param.threadId, param.roundNumber and json.feedbackType
 */
export async function setRoundFeedbackService(
  data: SetRoundFeedbackRequest,
): Promise<SetRoundFeedbackResponse> {
  const client = await createApiClient();

  // Internal fallback: ensure param and json exist
  const params: SetRoundFeedbackRequest = {
    param: data.param ?? { threadId: '', roundNumber: '' },
    json: data.json ?? { feedbackType: null },
  };

  const response = await client.chat.threads[':threadId'].rounds[':roundNumber'].feedback.$put(params);
  return parseResponse(response);
}

/**
 * Get Thread Feedback
 * Protected endpoint - requires authentication (ownership check)
 *
 * Get all round feedback for a thread for the current user.
 *
 * @param data - Request with param.id for thread ID
 */
export async function getThreadFeedbackService(
  data: GetThreadFeedbackRequest,
): Promise<GetThreadFeedbackResponse> {
  const client = await createApiClient();

  // Internal fallback: ensure param exists
  const params: GetThreadFeedbackRequest = {
    param: data.param ?? { id: '' },
  };

  const response = await client.chat.threads[':id'].feedback.$get(params);
  return parseResponse(response);
}
