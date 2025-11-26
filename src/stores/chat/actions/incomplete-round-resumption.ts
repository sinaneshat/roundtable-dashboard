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

import { MessageRoles } from '@/api/core/enums';
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
  const isStreaming = useChatStore(s => s.isStreaming);
  const setNextParticipantToTrigger = useChatStore(s => s.setNextParticipantToTrigger);
  const setStreamingRoundNumber = useChatStore(s => s.setStreamingRoundNumber);
  const setCurrentParticipantIndex = useChatStore(s => s.setCurrentParticipantIndex);
  const waitingToStartStreaming = useChatStore(s => s.waitingToStartStreaming);
  const setWaitingToStartStreaming = useChatStore(s => s.setWaitingToStartStreaming);

  // Track if we've already attempted resumption for this thread
  const resumptionAttemptedRef = useRef<string | null>(null);

  // Calculate incomplete round state
  const enabledParticipants = participants.filter(p => p.isEnabled);
  const currentRoundNumber = messages.length > 0 ? getCurrentRoundNumber(messages) : null;

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

  // Check if round is incomplete
  // ✅ FIX: Also check that participants haven't changed since round started
  const isIncomplete
    = enabled
      && !isStreaming
      && !waitingToStartStreaming
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

  // Effect to trigger resumption
  useEffect(() => {
    // Skip if not enabled or already streaming
    if (!enabled || isStreaming || waitingToStartStreaming) {
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

    // Check if there's at least one user message for the current round
    const hasUserMessageForRound = messages.some((msg) => {
      if (msg.role !== MessageRoles.USER) {
        return false;
      }
      const msgRound = getRoundNumber(msg.metadata);
      return msgRound === currentRoundNumber;
    });

    if (!hasUserMessageForRound) {
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
