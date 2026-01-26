/**
 * SSR Message Verification - Transform messages for SSR
 *
 * SIMPLIFIED: No retry logic. Transform and return immediately.
 * Client-side will handle any stale data via TanStack Query refetch.
 *
 * Previous retry logic caused 17+ second delays on page load.
 * SSR should be fast - return what we have, let client sync if needed.
 */

import type { ApiMessage, ThreadStreamResumptionState } from '@/services/api';

import { transformChatMessage } from './date-transforms';

type VerifyMessagesParams = {
  threadId: string;
  currentMessages: ApiMessage[];
  streamResumptionState: ThreadStreamResumptionState | null;
};

type VerifyMessagesResult = {
  messages: ApiMessage[];
  wasStale: boolean;
  retryCount: number;
};

/**
 * Transform API messages to ApiMessage with Date objects
 */
function transformMessages(messages: ApiMessage[]): ApiMessage[] {
  return messages.map(m => transformChatMessage(m));
}

/**
 * Transform SSR messages - no retry, immediate return
 *
 * SSR must be fast. Any stale data will be synced client-side
 * via TanStack Query's staleTime and refetch mechanisms.
 *
 * @returns Messages with Date objects (transformed from API response)
 */
export async function verifyAndFetchFreshMessages({
  currentMessages,
}: VerifyMessagesParams): Promise<VerifyMessagesResult> {
  // Transform and return immediately - no retry logic
  // Client-side TanStack Query will handle any stale data
  return {
    messages: transformMessages(currentMessages),
    retryCount: 0,
    wasStale: false,
  };
}
