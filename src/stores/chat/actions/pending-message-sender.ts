/**
 * Pending Message Sender - Consolidated logic for sending pending messages
 *
 * Extracted from chat-store-provider.tsx to eliminate duplication between
 * handleComplete callback and useEffect hook.
 */

import type { UIMessage } from 'ai';

import { AnalysisStatuses } from '@/api/core/enums';
import type { ChatParticipant, ChatThread, StoredPreSearch } from '@/api/routes/chat/schema';
import { calculateNextRoundNumber } from '@/lib/utils/round-utils';

/**
 * State required for pending message validation and sending
 */
export type PendingMessageState = {
  pendingMessage: string | null;
  expectedParticipantIds: string[] | null;
  hasSentPendingMessage: boolean;
  isStreaming: boolean;
  isWaitingForChangelog: boolean;
  screenMode: 'overview' | 'thread' | 'public';
  participants: ChatParticipant[];
  messages: UIMessage[];
  preSearches: StoredPreSearch[];
  thread: ChatThread | null;
  enableWebSearch: boolean;
};

/**
 * Result of validation check
 */
export type ValidationResult = {
  shouldSend: boolean;
  roundNumber: number | null;
  reason?: string;
};

/**
 * Validates whether a pending message should be sent
 *
 * Centralizes all validation logic to ensure consistency between
 * handleComplete and useEffect implementations.
 */
export function shouldSendPendingMessage(state: PendingMessageState): ValidationResult {
  // Early exits for invalid states
  if (state.screenMode === 'public') {
    return { shouldSend: false, roundNumber: null, reason: 'public screen mode' };
  }

  if (!state.pendingMessage || !state.expectedParticipantIds) {
    return { shouldSend: false, roundNumber: null, reason: 'no pending message or expected participants' };
  }

  if (state.hasSentPendingMessage) {
    return { shouldSend: false, roundNumber: null, reason: 'already sent' };
  }

  if (state.isStreaming) {
    return { shouldSend: false, roundNumber: null, reason: 'currently streaming' };
  }

  // Check participant model IDs match
  const currentModelIds = state.participants
    .filter(p => p.isEnabled)
    .map(p => p.modelId)
    .sort()
    .join(',');

  const expectedModelIds = state.expectedParticipantIds.sort().join(',');

  if (currentModelIds !== expectedModelIds) {
    return { shouldSend: false, roundNumber: null, reason: 'participant mismatch' };
  }

  // Check changelog completion
  if (state.isWaitingForChangelog) {
    return { shouldSend: false, roundNumber: null, reason: 'waiting for changelog' };
  }

  // Calculate next round number
  const newRoundNumber = calculateNextRoundNumber(state.messages);

  // Check pre-search completion if web search enabled
  const webSearchEnabled = state.thread?.enableWebSearch ?? state.enableWebSearch;

  if (webSearchEnabled) {
    const preSearchForRound = state.preSearches.find(ps => ps.roundNumber === newRoundNumber);

    if (!preSearchForRound || preSearchForRound.status !== AnalysisStatuses.COMPLETE) {
      return { shouldSend: false, roundNumber: newRoundNumber, reason: 'waiting for pre-search' };
    }
  }

  // All validations passed
  return { shouldSend: true, roundNumber: newRoundNumber };
}

/**
 * Checks if participants match expected model IDs
 *
 * Extracted for reusability and testing.
 */
export function participantsMatch(
  participants: ChatParticipant[],
  expectedIds: string[],
): boolean {
  const currentIds = participants
    .filter(p => p.isEnabled)
    .map(p => p.modelId)
    .sort()
    .join(',');

  const expectedSorted = expectedIds.sort().join(',');

  return currentIds === expectedSorted;
}

/**
 * Checks if pre-search needs to complete before proceeding
 *
 * Extracted for reusability across multiple locations.
 */
export function shouldWaitForPreSearch(params: {
  webSearchEnabled: boolean;
  preSearches: StoredPreSearch[];
  roundNumber: number;
}): boolean {
  if (!params.webSearchEnabled) {
    return false;
  }

  const preSearch = params.preSearches.find(ps => ps.roundNumber === params.roundNumber);

  return !preSearch || preSearch.status !== AnalysisStatuses.COMPLETE;
}
