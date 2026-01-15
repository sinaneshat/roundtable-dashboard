/**
 * SSR Message Verification - Server-side retry for D1 consistency
 *
 * Handles the race condition where:
 * 1. KV stream-status says participants are complete
 * 2. But D1 database hasn't propagated the messages yet (read replica lag)
 *
 * Solution: Retry message fetch on server-side until DB is consistent,
 * ensuring proper SSR paint without client-side fallback fetches.
 */

import { MessageRoles } from '@/api/core/enums';
import type { ThreadStreamResumptionState } from '@/api/routes/chat/schema';
import type { ChatMessage } from '@/db/validation/chat';
import { getThreadMessagesService } from '@/services/api';

import { transformChatMessage } from './date-transforms';
import type { ApiMessage } from './ssr-message-verification-schemas';

const SSR_RETRY_DELAYS = [50, 100, 150]; // ms delays between retries
const MAX_RETRIES = 3;

type VerifyMessagesParams = {
  threadId: string;
  currentMessages: ApiMessage[];
  streamResumptionState: ThreadStreamResumptionState | null;
};

type VerifyMessagesResult = {
  messages: ChatMessage[];
  wasStale: boolean;
  retryCount: number;
};

/**
 * Transform API messages to ChatMessage with Date objects
 */
function transformMessages(messages: ApiMessage[]): ChatMessage[] {
  return messages.map(m => transformChatMessage(m));
}

/**
 * Verify SSR messages are consistent with stream status
 * If KV says complete but DB is stale, retry until consistent
 *
 * @returns Fresh messages with Date objects (transformed from API response)
 */
export async function verifyAndFetchFreshMessages({
  threadId,
  currentMessages,
  streamResumptionState,
}: VerifyMessagesParams): Promise<VerifyMessagesResult> {
  // No stream status = nothing to verify, just transform dates
  if (!streamResumptionState) {
    return { messages: transformMessages(currentMessages), wasStale: false, retryCount: 0 };
  }

  // Check if KV says participants are complete
  const serverSaysComplete = streamResumptionState.participants?.allComplete === true;
  const expectedParticipants = streamResumptionState.participants?.totalParticipants ?? 0;

  // Count assistant messages in current data
  const currentAssistantCount = currentMessages.filter(m => m.role === MessageRoles.ASSISTANT).length;

  // Data is consistent - no retry needed, just transform dates
  if (!serverSaysComplete || expectedParticipants === 0 || currentAssistantCount >= expectedParticipants) {
    return { messages: transformMessages(currentMessages), wasStale: false, retryCount: 0 };
  }

  // D1 is stale - need to retry
  console.error(`[SSR] D1 stale: have ${currentAssistantCount} assistant msgs, expected ${expectedParticipants}`);

  for (let i = 0; i < MAX_RETRIES; i++) {
    // Wait before retry (D1 propagation typically takes 50-100ms)
    await new Promise(resolve => setTimeout(resolve, SSR_RETRY_DELAYS[i] ?? 100));

    try {
      const freshResult = await getThreadMessagesService({ param: { id: threadId } });

      if (freshResult.success && freshResult.data?.items) {
        const freshMessages = freshResult.data.items;
        const freshAssistantCount = freshMessages.filter(m => m.role === MessageRoles.ASSISTANT).length;

        if (freshAssistantCount >= expectedParticipants) {
          console.error(`[SSR] D1 consistent after ${i + 1} retries: ${freshAssistantCount} assistant msgs`);
          return {
            messages: transformMessages(freshMessages),
            wasStale: true,
            retryCount: i + 1,
          };
        }
      }
    } catch (error) {
      console.error(`[SSR] Retry ${i + 1} failed:`, error);
    }
  }

  // All retries exhausted - return what we have, transformed
  console.error(`[SSR] D1 still stale after ${MAX_RETRIES} retries, proceeding with incomplete data`);
  return {
    messages: transformMessages(currentMessages),
    wasStale: true,
    retryCount: MAX_RETRIES,
  };
}
