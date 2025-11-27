/**
 * Incomplete Round Resumption Hook
 *
 * Zustand v5 Pattern: Store-specific action hook co-located with store
 * Detects and resumes incomplete rounds when user navigates to a thread page.
 *
 * USE CASE:
 * When a user leaves a page during participant streaming and returns later:
 * - Some participants may have responded
 * - Other participants may not have had a chance to respond
 * - This hook detects incomplete rounds and triggers remaining participants
 *
 * ORPHANED PRE-SEARCH USE CASE (NEW):
 * When a user refreshes during pre-search/changelog phase:
 * - Pre-search for round N is complete
 * - But NO user message for round N exists (lost on refresh)
 * - This hook detects this state and recovers the userQuery from pre-search
 * - Sets pendingMessage to resume the round normally
 *
 * FLOW:
 * 1. On page load, check if current round has all expected participants
 * 2. If incomplete, determine which participant is next
 * 3. Set nextParticipantToTrigger in store
 * 4. Provider effect will detect this and trigger the participant
 *
 * IMPORTANT:
 * - This hook does NOT check for active streams (that's handled by AI SDK resume: true)
 * - This hook handles the case where streams COMPLETED but more participants need to speak
 * - Works for ALL scenarios: analyze, search, and participant streams
 *
 * Location: /src/stores/chat/actions/incomplete-round-resumption.ts
 * Used by: useScreenInitialization (internal composition)
 */

'use client';

import { useEffect, useRef } from 'react';

import { AnalysisStatuses, MessageRoles } from '@/api/core/enums';
import { useChatStore } from '@/components/providers/chat-store-provider';
import { getAssistantMetadata, getParticipantIndex, getRoundNumber } from '@/lib/utils/metadata';
import { getCurrentRoundNumber } from '@/lib/utils/round-utils';

export type UseIncompleteRoundResumptionOptions = {
  /**
   * Thread ID to check for incomplete rounds
   */
  threadId: string;

  /**
   * Enable/disable the resumption check
   */
  enabled?: boolean;
};

export type UseIncompleteRoundResumptionReturn = {
  /**
   * Whether the current round is incomplete
   */
  isIncomplete: boolean;

  /**
   * Index of the next participant that needs to speak
   */
  nextParticipantIndex: number | null;

  /**
   * The round number being resumed (if any)
   */
  resumingRoundNumber: number | null;
};

/**
 * Hook for detecting and resuming incomplete rounds
 *
 * This hook runs on mount and checks if the current round has all expected
 * participant responses. If not, it sets up the store state to trigger
 * the remaining participants.
 *
 * @example
 * const { isIncomplete, nextParticipantIndex } = useIncompleteRoundResumption({
 *   threadId: thread.id,
 *   enabled: !isStreaming && !!thread
 * })
 */
export function useIncompleteRoundResumption(
  options: UseIncompleteRoundResumptionOptions,
): UseIncompleteRoundResumptionReturn {
  const { threadId, enabled = true } = options;

  // Store subscriptions
  const messages = useChatStore(s => s.messages);
  const participants = useChatStore(s => s.participants);
  const preSearches = useChatStore(s => s.preSearches);
  const isStreaming = useChatStore(s => s.isStreaming);
  const setNextParticipantToTrigger = useChatStore(s => s.setNextParticipantToTrigger);
  const setStreamingRoundNumber = useChatStore(s => s.setStreamingRoundNumber);
  const setCurrentParticipantIndex = useChatStore(s => s.setCurrentParticipantIndex);
  const waitingToStartStreaming = useChatStore(s => s.waitingToStartStreaming);
  const setWaitingToStartStreaming = useChatStore(s => s.setWaitingToStartStreaming);

  // ✅ ORPHANED PRE-SEARCH FIX: Actions needed to recover from orphaned pre-search state
  const prepareForNewMessage = useChatStore(s => s.prepareForNewMessage);
  const setExpectedParticipantIds = useChatStore(s => s.setExpectedParticipantIds);

  // ✅ INFINITE LOOP FIX: Subscribe to submission state to avoid interfering with normal submissions
  // When user submits a message, pendingMessage is set. The resumption hook should NOT try to
  // "resume" the round that the user just started - that's handled by the pending message effect.
  const pendingMessage = useChatStore(s => s.pendingMessage);
  const hasSentPendingMessage = useChatStore(s => s.hasSentPendingMessage);
  const hasEarlyOptimisticMessage = useChatStore(s => s.hasEarlyOptimisticMessage);

  // Track if we've already attempted resumption for this thread
  const resumptionAttemptedRef = useRef<string | null>(null);
  // Track if we've already attempted orphaned pre-search recovery for this thread
  const orphanedPreSearchRecoveryAttemptedRef = useRef<string | null>(null);

  // Calculate incomplete round state
  const enabledParticipants = participants.filter(p => p.isEnabled);
  const currentRoundNumber = messages.length > 0 ? getCurrentRoundNumber(messages) : null;

  // ✅ ORPHANED PRE-SEARCH DETECTION
  // Check if there's a completed pre-search for a round that has no user message
  // This happens when user refreshes during pre-search/changelog phase
  const orphanedPreSearch = preSearches.find((ps) => {
    // Only check complete pre-searches
    if (ps.status !== AnalysisStatuses.COMPLETE) {
      return false;
    }

    // Check if there's a user message for this round
    const hasUserMessageForRound = messages.some((msg) => {
      if (msg.role !== MessageRoles.USER) {
        return false;
      }
      const msgRound = getRoundNumber(msg.metadata);
      return msgRound === ps.roundNumber;
    });

    // If no user message exists for this pre-search's round, it's orphaned
    return !hasUserMessageForRound;
  });

  // Find which participants have responded in the current round
  // Also track their model IDs to detect participant config changes
  const respondedParticipantIndices = new Set<number>();
  const respondedModelIds = new Set<string>();

  if (currentRoundNumber !== null) {
    messages.forEach((msg) => {
      if (msg.role === MessageRoles.ASSISTANT) {
        const msgRound = getRoundNumber(msg.metadata);
        const participantIndex = getParticipantIndex(msg.metadata);
        // ✅ TYPE-SAFE: Use extraction utility for model ID
        const assistantMetadata = getAssistantMetadata(msg.metadata);
        const modelId = assistantMetadata?.model;

        if (msgRound === currentRoundNumber && participantIndex !== null) {
          respondedParticipantIndices.add(participantIndex);
          if (modelId) {
            respondedModelIds.add(modelId);
          }
        }
      }
    });
  }

  // ✅ CRITICAL FIX: Detect participant configuration changes
  // If user changed participants since the round started, the round should be
  // considered "complete" (not resumable) because:
  // 1. The current enabled participants don't match who responded in the round
  // 2. Trying to resume would trigger wrong participant indices
  // 3. Backend would fail with "Participant at index X not found"
  //
  // Detection: Check if ANY responded model is NOT in current enabled participants
  // If there's a mismatch, participants have changed and round is not resumable
  const currentModelIds = new Set(enabledParticipants.map(p => p.modelId));
  const participantsChangedSinceRound = respondedModelIds.size > 0
    && [...respondedModelIds].some(modelId => !currentModelIds.has(modelId));

  // ✅ INFINITE LOOP FIX: Detect when a submission is in progress
  // When user submits, these flags indicate the submission flow is active:
  // 1. hasEarlyOptimisticMessage: Set before PATCH, cleared by prepareForNewMessage
  // 2. pendingMessage: Set by prepareForNewMessage, used by pending message effect
  // 3. hasSentPendingMessage: Set to true after message is sent
  // If any of these indicate a submission is active, we should NOT try to resume
  const isSubmissionInProgress = hasEarlyOptimisticMessage || (pendingMessage !== null && !hasSentPendingMessage);

  // Check if round is incomplete
  // ✅ FIX: Also check that participants haven't changed since round started
  // ✅ INFINITE LOOP FIX: Don't treat round as incomplete during active submission
  const isIncomplete
    = enabled
      && !isStreaming
      && !waitingToStartStreaming
      && !isSubmissionInProgress // ← NEW: Don't interfere with normal submissions
      && currentRoundNumber !== null
      && enabledParticipants.length > 0
      && respondedParticipantIndices.size < enabledParticipants.length
      && !participantsChangedSinceRound;

  // Find the first missing participant index
  let nextParticipantIndex: number | null = null;

  if (isIncomplete) {
    for (let i = 0; i < enabledParticipants.length; i++) {
      if (!respondedParticipantIndices.has(i)) {
        nextParticipantIndex = i;
        break;
      }
    }
  }

  // ✅ ORPHANED PRE-SEARCH RECOVERY EFFECT
  // When a user refreshes during pre-search/changelog phase, the pre-search completes
  // but the user message is never sent. This effect recovers the userQuery from the
  // pre-search and sets up the store state to resume sending the message normally.
  useEffect(() => {
    // Skip if not enabled or already streaming
    if (!enabled || isStreaming || waitingToStartStreaming) {
      return;
    }

    // Skip if a submission is already in progress
    if (hasEarlyOptimisticMessage || (pendingMessage !== null && !hasSentPendingMessage)) {
      return;
    }

    // Skip if no orphaned pre-search detected
    if (!orphanedPreSearch || !orphanedPreSearch.userQuery) {
      return;
    }

    // Skip if no enabled participants
    if (enabledParticipants.length === 0) {
      return;
    }

    // Skip if already attempted for this thread
    if (orphanedPreSearchRecoveryAttemptedRef.current === threadId) {
      return;
    }

    // Mark as attempted to prevent duplicate triggers
    orphanedPreSearchRecoveryAttemptedRef.current = threadId;

    // Recover the userQuery from the orphaned pre-search
    // This sets up the store state to resume the round normally via pendingMessage effect
    const recoveredQuery = orphanedPreSearch.userQuery;

    // Get enabled participant IDs for the expected participants
    const expectedIds = enabledParticipants.map(p => p.id);

    // Set expected participant IDs (required by pendingMessage effect)
    setExpectedParticipantIds(expectedIds);

    // Prepare for new message - this sets pendingMessage and adds optimistic user message
    // The prepareForNewMessage action will:
    // 1. Add optimistic user message for the next round (which should match orphanedPreSearch.roundNumber)
    // 2. Set pendingMessage to the recovered query
    // 3. Set hasSentPendingMessage to false
    // 4. Clear hasEarlyOptimisticMessage
    // This triggers the pendingMessage effect in ChatStoreProvider to send the message
    prepareForNewMessage(recoveredQuery, expectedIds);
  }, [
    enabled,
    isStreaming,
    waitingToStartStreaming,
    hasEarlyOptimisticMessage,
    pendingMessage,
    hasSentPendingMessage,
    orphanedPreSearch,
    enabledParticipants,
    threadId,
    prepareForNewMessage,
    setExpectedParticipantIds,
  ]);

  // Reset the orphaned pre-search recovery ref when threadId changes
  useEffect(() => {
    orphanedPreSearchRecoveryAttemptedRef.current = null;
  }, [threadId]);

  // Effect to trigger resumption
  useEffect(() => {
    // Skip if not enabled or already streaming
    if (!enabled || isStreaming || waitingToStartStreaming) {
      return;
    }

    // ✅ INFINITE LOOP FIX: Skip if a submission is in progress
    // This prevents the hook from interfering with normal message submissions.
    // When user submits, these states indicate submission is active:
    // - hasEarlyOptimisticMessage: Set before PATCH, cleared by prepareForNewMessage
    // - pendingMessage with !hasSentPendingMessage: Message ready to send
    if (hasEarlyOptimisticMessage || (pendingMessage !== null && !hasSentPendingMessage)) {
      return;
    }

    // Skip if already attempted for this thread
    if (resumptionAttemptedRef.current === threadId) {
      return;
    }

    // Skip if round is complete
    if (!isIncomplete || nextParticipantIndex === null || currentRoundNumber === null) {
      return;
    }

    // Skip if no messages yet (new thread)
    if (messages.length === 0) {
      return;
    }

    // ✅ INFINITE LOOP FIX: Skip if the user message for this round is optimistic
    // Optimistic messages are added by handleUpdateThreadAndSend before the actual submission.
    // We should NOT try to "resume" a round that was just started - that's handled by pendingMessage effect.
    const userMessageForRound = messages.find((msg) => {
      if (msg.role !== MessageRoles.USER) {
        return false;
      }
      const msgRound = getRoundNumber(msg.metadata);
      return msgRound === currentRoundNumber;
    });

    if (!userMessageForRound) {
      return;
    }

    // If the user message is optimistic, this is a new submission, not a resumption
    const metadata = userMessageForRound.metadata;
    if (metadata && typeof metadata === 'object' && 'isOptimistic' in metadata && metadata.isOptimistic === true) {
      return;
    }

    // Mark as attempted to prevent duplicate triggers
    resumptionAttemptedRef.current = threadId;

    // Set up store state for resumption
    // The provider's effect watching nextParticipantToTrigger will trigger the participant
    setStreamingRoundNumber(currentRoundNumber);
    setNextParticipantToTrigger(nextParticipantIndex);
    setCurrentParticipantIndex(nextParticipantIndex);

    // Set waiting flag so provider knows to start streaming
    setWaitingToStartStreaming(true);
  }, [
    enabled,
    isStreaming,
    waitingToStartStreaming,
    isIncomplete,
    nextParticipantIndex,
    currentRoundNumber,
    threadId,
    messages,
    // ✅ INFINITE LOOP FIX: Include submission state in dependencies
    hasEarlyOptimisticMessage,
    pendingMessage,
    hasSentPendingMessage,
    setNextParticipantToTrigger,
    setStreamingRoundNumber,
    setCurrentParticipantIndex,
    setWaitingToStartStreaming,
  ]);

  // Reset the ref when threadId changes
  useEffect(() => {
    resumptionAttemptedRef.current = null;
  }, [threadId]);

  return {
    isIncomplete,
    nextParticipantIndex,
    resumingRoundNumber: isIncomplete ? currentRoundNumber : null,
  };
}
