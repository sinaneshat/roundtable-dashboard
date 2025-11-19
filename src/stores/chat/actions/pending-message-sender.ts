/**
 * Pending Message Sender - Consolidated logic for sending pending messages
 *
 * Extracted from chat-store-provider.tsx to eliminate duplication between
 * handleComplete callback and useEffect hook.
 */

import type { UIMessage } from 'ai';

import type { PendingMessageValidationReason, ScreenMode } from '@/api/core/enums';
import {
  AnalysisStatuses,
  PendingMessageValidationReasons,
  ScreenModes,
} from '@/api/core/enums';
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
  screenMode: ScreenMode;
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
  reason?: PendingMessageValidationReason;
};

/**
 * Validates whether a pending message should be sent
 *
 * Centralizes all validation logic to ensure consistency between
 * handleComplete and useEffect implementations.
 */
export function shouldSendPendingMessage(state: PendingMessageState): ValidationResult {
  // Early exits for invalid states
  if (state.screenMode === ScreenModes.PUBLIC) {
    return { shouldSend: false, roundNumber: null, reason: PendingMessageValidationReasons.PUBLIC_SCREEN_MODE };
  }

  if (!state.pendingMessage || !state.expectedParticipantIds) {
    return { shouldSend: false, roundNumber: null, reason: PendingMessageValidationReasons.NO_PENDING_MESSAGE };
  }

  if (state.hasSentPendingMessage) {
    return { shouldSend: false, roundNumber: null, reason: PendingMessageValidationReasons.ALREADY_SENT };
  }

  if (state.isStreaming) {
    return { shouldSend: false, roundNumber: null, reason: PendingMessageValidationReasons.CURRENTLY_STREAMING };
  }

  // Check participant model IDs match
  const currentModelIds = state.participants
    .filter(p => p.isEnabled)
    .map(p => p.modelId)
    .sort()
    .join(',');

  const expectedModelIds = state.expectedParticipantIds.sort().join(',');

  if (currentModelIds !== expectedModelIds) {
    return { shouldSend: false, roundNumber: null, reason: PendingMessageValidationReasons.PARTICIPANT_MISMATCH };
  }

  // Check changelog completion
  if (state.isWaitingForChangelog) {
    return { shouldSend: false, roundNumber: null, reason: PendingMessageValidationReasons.WAITING_FOR_CHANGELOG };
  }

  // Calculate next round number
  const newRoundNumber = calculateNextRoundNumber(state.messages);

  // ✅ CRITICAL FIX: Web search blocking logic for mid-conversation toggle
  //
  // FLOW:
  // 1. User toggles web search ON mid-conversation
  // 2. Backend creates PENDING pre-search immediately (streaming.handler.ts:162-169)
  // 3. PreSearchOrchestrator syncs it to store (polls every 2s)
  // 4. PreSearchStream component triggers execution (PENDING → STREAMING)
  // 5. Web search completes (STREAMING → COMPLETE)
  // 6. Participants can start responding
  //
  // BLOCKING LOGIC:
  // - No pre-search record + web search enabled? → Wait (backend creating it, orchestrator syncing)
  // - Pre-search PENDING? → Wait (hasn't started execution yet)
  // - Pre-search STREAMING? → Wait (search in progress)
  // - Pre-search COMPLETE? → Send (results available)
  // - Pre-search FAILED? → Send (don't block on failures)
  //
  // BUG FIXES:
  // 1. Added PENDING status check (was only checking STREAMING)
  // 2. Added optimistic wait when pre-search doesn't exist yet (race condition fix)
  const webSearchEnabled = state.thread?.enableWebSearch ?? state.enableWebSearch;

  if (webSearchEnabled) {
    const preSearchForRound = state.preSearches.find(ps => ps.roundNumber === newRoundNumber);

    // ✅ FIX #2: Optimistic wait when pre-search doesn't exist yet
    // Race condition: Backend creates PENDING pre-search, but orchestrator hasn't synced it yet
    // Polling interval is 2s, so there's a 0-2s window where preSearchForRound is undefined
    // If we send message during this window, participants start WITHOUT web search
    // Solution: Wait for orchestrator to sync the pre-search that backend created
    if (!preSearchForRound) {
      return { shouldSend: false, roundNumber: newRoundNumber, reason: PendingMessageValidationReasons.WAITING_FOR_PRE_SEARCH_CREATION };
    }

    // ✅ FIX #1: Block on PENDING status (not just STREAMING)
    // When backend creates PENDING pre-search and orchestrator syncs it before execution,
    // we need to wait for PreSearchStream to trigger execution (PENDING → STREAMING)
    // Previous bug: Only checked STREAMING, so messages sent when status was PENDING
    if (preSearchForRound.status === AnalysisStatuses.PENDING
      || preSearchForRound.status === AnalysisStatuses.STREAMING) {
      return { shouldSend: false, roundNumber: newRoundNumber, reason: PendingMessageValidationReasons.WAITING_FOR_PRE_SEARCH };
    }

    // Pre-search is COMPLETE or FAILED - allow message to send
    // COMPLETE: Participants can use search results
    // FAILED: Don't block conversation on search failures
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
 * ✅ UPDATED: Wait for pre-search in PENDING or STREAMING status
 * Also wait if pre-search doesn't exist yet (optimistic wait for backend creation)
 *
 * BLOCKING CONDITIONS:
 * - No pre-search + web search enabled: Wait (backend creating it)
 * - Pre-search PENDING: Wait (execution not started)
 * - Pre-search STREAMING: Wait (search in progress)
 * - Pre-search COMPLETE/FAILED: Don't wait (proceed with message)
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

  // ✅ FIX: Wait if pre-search doesn't exist yet (backend creating it, orchestrator syncing)
  if (!preSearch) {
    return true; // Optimistic wait
  }

  // ✅ FIX: Wait if pre-search is PENDING or STREAMING
  // PENDING: PreSearchStream hasn't triggered execution yet
  // STREAMING: Web search in progress
  return preSearch.status === AnalysisStatuses.PENDING
    || preSearch.status === AnalysisStatuses.STREAMING;
}
