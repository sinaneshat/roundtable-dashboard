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
 * 2. ✅ FIX: Check backend for active streams BEFORE triggering new participants
 * 3. If incomplete and no active stream, determine which participant is next
 * 4. Set nextParticipantToTrigger in store
 * 5. Provider effect will detect this and trigger the participant
 *
 * IMPORTANT:
 * - ✅ FIX: This hook NOW checks for active streams via backend before triggering
 * - This prevents triggering new AI calls when a stream is being resumed by AI SDK
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

import { shouldWaitForPreSearch } from './pending-message-sender';

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
  const setMessages = useChatStore(s => s.setMessages);

  // ✅ INFINITE LOOP FIX: Subscribe to submission state to avoid interfering with normal submissions
  // When user submits a message, pendingMessage is set. The resumption hook should NOT try to
  // "resume" the round that the user just started - that's handled by the pending message effect.
  const pendingMessage = useChatStore(s => s.pendingMessage);
  const hasSentPendingMessage = useChatStore(s => s.hasSentPendingMessage);
  const hasEarlyOptimisticMessage = useChatStore(s => s.hasEarlyOptimisticMessage);

  // ✅ PRE-SEARCH BLOCKING FIX: Subscribe to web search state for pre-search blocking check
  // Resumption should NOT trigger participants if pre-search is still in progress
  const enableWebSearch = useChatStore(s => s.enableWebSearch);
  // ✅ RACE CONDITION FIX: Also subscribe to thread to check its enableWebSearch
  // Store's enableWebSearch defaults to false and takes time to sync from thread
  // We need to check the thread's value directly to avoid race conditions
  const thread = useChatStore(s => s.thread);

  // Track if we've already attempted resumption for this thread
  const resumptionAttemptedRef = useRef<string | null>(null);
  // Track if we've already attempted orphaned pre-search recovery for this thread
  const orphanedPreSearchRecoveryAttemptedRef = useRef<string | null>(null);

  // ✅ OPTIMIZED: Track check state using refs (no longer makes network calls)
  // - activeStreamCheckRef: Which thread we've checked (prevents duplicate checks)
  // - activeStreamCheckCompleteRef: Whether check is done (used by resumption effect)
  // AI SDK handles stream resumption via resume:true in useChat - we don't need separate fetch
  const activeStreamCheckRef = useRef<string | null>(null);
  const activeStreamCheckCompleteRef = useRef(false);

  // Calculate incomplete round state
  const enabledParticipants = participants.filter(p => p.isEnabled);
  const currentRoundNumber = messages.length > 0 ? getCurrentRoundNumber(messages) : null;

  // ✅ ORPHANED PRE-SEARCH DETECTION
  // Check if there's a pre-search for a round that has no user message
  // This happens when user refreshes during pre-search/changelog phase
  //
  // ✅ RESUMPTION FIX: Also detect STREAMING pre-searches as orphaned
  // If user refreshes during streaming, the pre-search will be in STREAMING status
  // but the user message hasn't been persisted yet, so we need to recover
  //
  // ✅ DEFENSIVE GUARD: Ensure preSearches is an array before calling .find()
  // During hydration or store initialization, preSearches might momentarily be undefined
  const orphanedPreSearch = Array.isArray(preSearches)
    ? preSearches.find((ps) => {
        // Check COMPLETE or STREAMING status - both can be orphaned
        // PENDING is skipped because it means streaming hasn't started
        // FAILED is skipped because recovery isn't possible
        if (ps.status !== AnalysisStatuses.COMPLETE && ps.status !== AnalysisStatuses.STREAMING) {
          return false;
        }

        // Check if there's a user message for this round
        // ✅ FIX: Ignore optimistic messages - they haven't been persisted to backend
        // When user refreshes during pre-search, the optimistic message exists in store
        // but wasn't persisted. We need to treat this as "no user message" so recovery triggers.
        const hasUserMessageForRound = messages.some((msg) => {
          if (msg.role !== MessageRoles.USER) {
            return false;
          }
          // Ignore optimistic messages - they haven't been persisted
          const metadata = msg.metadata;
          if (metadata && typeof metadata === 'object' && 'isOptimistic' in metadata && metadata.isOptimistic === true) {
            return false;
          }
          const msgRound = getRoundNumber(msg.metadata);
          return msgRound === ps.roundNumber;
        });

        // If no user message exists for this pre-search's round, it's orphaned
        return !hasUserMessageForRound;
      })
    : undefined;

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

  // ✅ OPTIMIZED: Set streamingRoundNumber immediately when incomplete round detected
  // This enables placeholder rendering WITHOUT waiting for backend check
  // Previously we made a duplicate /stream call just to get headers - now we use local calculation
  // AI SDK's resume:true already handles the stream resumption via prepareReconnectToStreamRequest
  useEffect(() => {
    if (!enabled || !threadId) {
      return;
    }

    // Skip if already checked for this thread
    if (activeStreamCheckRef.current === threadId) {
      return;
    }

    // ✅ TIMING FIX: Don't mark as checked until we have enough data to make a decision
    // If currentRoundNumber is null, data hasn't loaded yet - don't mark as checked
    // Otherwise we skip checking when data arrives and miss incomplete rounds
    if (currentRoundNumber === null) {
      return; // Wait for data to load
    }

    // ✅ IMMEDIATE PLACEHOLDER SUPPORT: Set store state from local calculation
    // When round is incomplete, set streamingRoundNumber immediately for placeholder rendering
    // This removes the need for a duplicate backend fetch just to read headers
    if (isIncomplete && nextParticipantIndex !== null) {
      setStreamingRoundNumber(currentRoundNumber);
      setCurrentParticipantIndex(nextParticipantIndex);
    }

    // Mark as checked - we've made a decision (either incomplete or complete)
    // AI SDK handles stream resumption via resume:true in useChat
    activeStreamCheckRef.current = threadId;
    activeStreamCheckCompleteRef.current = true;
  }, [enabled, threadId, isIncomplete, currentRoundNumber, nextParticipantIndex, setStreamingRoundNumber, setCurrentParticipantIndex]);

  // ✅ OPTIMIZED: Reset refs when threadId changes
  useEffect(() => {
    // Reset all refs on thread change (synchronous, no setState)
    activeStreamCheckRef.current = null;
    activeStreamCheckCompleteRef.current = false;
  }, [threadId]);

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
    const orphanedRoundNumber = orphanedPreSearch.roundNumber;

    // ✅ FIX: Remove existing optimistic messages for this round BEFORE prepareForNewMessage
    // On page refresh, the optimistic message might persist in store (via Zustand persist)
    // but wasn't actually sent to backend. If we don't remove it:
    // 1. calculateNextRoundNumber would return orphanedRoundNumber + 1 (wrong)
    // 2. prepareForNewMessage would add message for wrong round
    // 3. Participants would be triggered for wrong round
    const messagesWithoutOrphanedOptimistic = messages.filter((msg) => {
      if (msg.role !== MessageRoles.USER) {
        return true; // Keep all non-user messages
      }
      const metadata = msg.metadata;
      const isOptimistic = metadata && typeof metadata === 'object' && 'isOptimistic' in metadata && metadata.isOptimistic === true;
      if (!isOptimistic) {
        return true; // Keep non-optimistic user messages
      }
      // Remove optimistic messages for the orphaned round
      const msgRound = getRoundNumber(metadata);
      return msgRound !== orphanedRoundNumber;
    });
    setMessages(messagesWithoutOrphanedOptimistic);

    // Get enabled participant IDs for the expected participants
    const expectedIds = enabledParticipants.map(p => p.id);

    // Set expected participant IDs (required by pendingMessage effect)
    setExpectedParticipantIds(expectedIds);

    // Prepare for new message - this sets pendingMessage and adds optimistic user message
    // The prepareForNewMessage action will:
    // 1. Add optimistic user message for the orphanedRoundNumber (now correct after cleanup)
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
    messages,
    prepareForNewMessage,
    setExpectedParticipantIds,
    setMessages,
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

    // ✅ OPTIMIZED: Wait for initial check to complete (no longer makes network call)
    // The check effect sets activeStreamCheckCompleteRef.current = true synchronously
    if (!activeStreamCheckCompleteRef.current) {
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

    // Use local calculation for next participant (no longer depends on backend ref)
    const effectiveNextParticipant = nextParticipantIndex;

    // Skip if round is complete
    if (!isIncomplete || effectiveNextParticipant === null || currentRoundNumber === null) {
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

    // ✅ PRE-SEARCH BLOCKING FIX: Don't resume participants if pre-search is still in progress
    // When user refreshes during pre-search streaming, we must wait for pre-search to complete
    // before triggering participants. This reuses the same blocking logic as pendingMessage sender.
    // The effect will re-run when preSearches updates (status changes from STREAMING to COMPLETE).
    //
    // ✅ RACE CONDITION FIX: Use thread's enableWebSearch if available (more reliable)
    // Store's enableWebSearch defaults to false and may not be synced from thread yet on page load
    // The thread is loaded before the store form state is synced, so it's the source of truth
    const effectiveWebSearchEnabled = thread?.enableWebSearch ?? enableWebSearch;
    if (shouldWaitForPreSearch({
      webSearchEnabled: effectiveWebSearchEnabled,
      preSearches,
      roundNumber: currentRoundNumber,
    })) {
      return;
    }

    // Mark as attempted to prevent duplicate triggers
    resumptionAttemptedRef.current = threadId;

    // Set up store state for resumption
    // The provider's effect watching nextParticipantToTrigger will trigger the participant
    setStreamingRoundNumber(currentRoundNumber);
    setNextParticipantToTrigger(effectiveNextParticipant);
    setCurrentParticipantIndex(effectiveNextParticipant);

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
    // ✅ PRE-SEARCH BLOCKING FIX: Include pre-search state in dependencies
    // Effect re-runs when preSearches changes (e.g., STREAMING → COMPLETE)
    preSearches,
    enableWebSearch,
    // ✅ RACE CONDITION FIX: Include thread to detect when thread.enableWebSearch is loaded
    thread,
    // Note: refs (activeStreamCheckCompleteRef, backendNextParticipantRef) are not in deps
    // because they don't cause re-renders - the effect checks their values when it runs
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
