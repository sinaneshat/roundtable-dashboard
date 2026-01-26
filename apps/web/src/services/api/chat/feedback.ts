/**
 * Chat Round Feedback Service - Round Feedback API
 *
 * 100% type-safe RPC service for round feedback operations
 * All types automatically inferred from backend Hono routes
 */

import type { InferRequestType, InferResponseType } from 'hono/client';
import { parseResponse } from 'hono/client';

import type { ApiClientType } from '@/lib/api/client';
import { createApiClient } from '@/lib/api/client';

// ============================================================================
// Type Inference
// ============================================================================

type SetRoundFeedbackEndpoint = ApiClientType['chatFeature']['chat']['threads'][':threadId']['rounds'][':roundNumber']['feedback']['$put'];
export type SetRoundFeedbackRequest = InferRequestType<SetRoundFeedbackEndpoint>;
export type SetRoundFeedbackResponse = InferResponseType<SetRoundFeedbackEndpoint, 200>;

type GetThreadFeedbackEndpoint = ApiClientType['chatFeature']['chat']['threads'][':id']['feedback']['$get'];
export type GetThreadFeedbackRequest = InferRequestType<GetThreadFeedbackEndpoint>;
export type GetThreadFeedbackResponse = InferResponseType<GetThreadFeedbackEndpoint, 200>;

// ============================================================================
// Derived Types - RPC Inference (SINGLE SOURCE OF TRUTH)
// ============================================================================

/**
 * Success response extracted from GetThreadFeedbackResponse
 */
type FeedbackSuccessResponse = Extract<GetThreadFeedbackResponse, { success: true }>;

/**
 * Full feedback item from API response
 * The response data is directly an array: { success: true, data: FeedbackItem[] }
 */
type FeedbackItem = FeedbackSuccessResponse['data'][number];

/**
 * RoundFeedbackData - Minimal feedback data (roundNumber + feedbackType)
 * Derived from RPC response for type consistency
 */
export type RoundFeedbackData = Pick<FeedbackItem, 'roundNumber' | 'feedbackType'>;

// ============================================================================
// Service Functions
// ============================================================================

/**
 * Set Round Feedback
 * Protected endpoint - requires authentication (ownership check)
 */
export async function setRoundFeedbackService(data: SetRoundFeedbackRequest) {
  const client = createApiClient();
  return parseResponse(client.chatFeature.chat.threads[':threadId'].rounds[':roundNumber'].feedback.$put(data));
}

/**
 * Get Thread Feedback
 * Protected endpoint - requires authentication (ownership check)
 */
export async function getThreadFeedbackService(
  data: GetThreadFeedbackRequest,
  options?: { cookieHeader?: string },
) {
  const client = createApiClient({ cookieHeader: options?.cookieHeader });
  return parseResponse(client.chatFeature.chat.threads[':id'].feedback.$get(data));
}
