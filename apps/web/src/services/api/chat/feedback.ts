/**
 * Chat Round Feedback Service - Round Feedback API
 *
 * 100% type-safe RPC service for round feedback operations
 * All types automatically inferred from backend Hono routes
 */

import type { FeedbackType } from '@roundtable/shared';
import type { InferRequestType, InferResponseType } from 'hono/client';
import { parseResponse } from 'hono/client';
import { z } from 'zod';

import type { ApiClientType } from '@/lib/api/client';
import { createApiClient } from '@/lib/api/client';

// ============================================================================
// Type Inference
// ============================================================================

type SetRoundFeedbackEndpoint = ApiClientType['chat']['threads'][':threadId']['rounds'][':roundNumber']['feedback']['$put'];
export type SetRoundFeedbackRequest = InferRequestType<SetRoundFeedbackEndpoint>;
export type SetRoundFeedbackResponse = InferResponseType<SetRoundFeedbackEndpoint, 200>;

type GetThreadFeedbackEndpoint = ApiClientType['chat']['threads'][':id']['feedback']['$get'];
export type GetThreadFeedbackRequest = InferRequestType<GetThreadFeedbackEndpoint>;
export type GetThreadFeedbackResponse = InferResponseType<GetThreadFeedbackEndpoint, 200>;

// Schema-based type for RoundFeedbackData (matches API response item structure)
export const RoundFeedbackDataSchema = z.object({
  roundNumber: z.number(),
  feedbackType: z.custom<FeedbackType>(),
});
export type RoundFeedbackData = z.infer<typeof RoundFeedbackDataSchema>;

// ============================================================================
// Service Functions
// ============================================================================

/**
 * Set Round Feedback
 * Protected endpoint - requires authentication (ownership check)
 */
export async function setRoundFeedbackService(data: SetRoundFeedbackRequest) {
  const client = createApiClient();
  return parseResponse(client.chat.threads[':threadId'].rounds[':roundNumber'].feedback.$put(data));
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
  return parseResponse(client.chat.threads[':id'].feedback.$get(data));
}
