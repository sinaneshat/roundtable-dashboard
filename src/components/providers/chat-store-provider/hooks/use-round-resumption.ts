'use client';

/**
 * Round Resumption Hook
 *
 * Handles continuing from a specific participant when a round is incomplete.
 * Triggered by useIncompleteRoundResumption hook on page load.
 *
 * ✅ RACE CONDITION FIX: Uses explicit chat.isReady dependency and retry mechanism
 * Problem: After page refresh, AI SDK hydration happens async, so chat.isReady
 * is false when the effect first runs. Even though chat changes when isReady
 * becomes true, the effect might miss the transition due to batched React updates.
 *
 * Solution: Extract isReady explicitly, add retry mechanism with small delay
 */

import type { UIMessage } from 'ai';
import { useEffect, useRef } from 'react';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

import { MessageRoles, ScreenModes } from '@/api/core/enums';
import type { ChatParticipant } from '@/api/routes/chat/schema';
import { getCurrentRoundNumber, getParticipantIndex as getParticipantIndexFromMetadata, getRoundNumber, isModeratorMessage } from '@/lib/utils';
import type { ChatStoreApi } from '@/stores/chat';
import { shouldWaitForPreSearch } from '@/stores/chat';

import type { ChatHook } from '../types';

type UseRoundResumptionParams = {
  store: ChatStoreApi;
  chat: ChatHook;
};

/**
 * Extract index from nextParticipantToTrigger which can be either:
 * - A number (when set before participants are loaded)
 * - An object { index, participantId } (when participants are available)
 */
function getParticipantIndex(value: { index: number; participantId: string } | number): number {
  return typeof value === 'number' ? value : value.index;
}

/**
 * ✅ CACHE MISMATCH FIX: Validate and correct nextParticipantToTrigger
 *
 * Problem: Server prefill queries live DB to calculate nextParticipantToTrigger,
 * but SSR messages may come from cache. This causes mismatch:
 * - Server says nextP=1 (p0 exists in live DB)
 * - Cached messages don't have p0
 * - Client starts from p1, then triggers p0 after p1 completes
 * - Result: Wrong streaming order (p1 → p0 → p2 instead of p0 → p1 → p2)
 *
 * Solution: Validate that all participants 0 to nextP-1 have messages.
 * If not, recalculate nextP as the first participant without a message.
 *
 * @param serverNextIndex - The server's suggested nextParticipantToTrigger
 * @param messages - The actual messages loaded (may be from cache)
 * @param participants - Enabled participants for the thread
 * @param currentRound - The current round number
 * @returns Corrected nextParticipantToTrigger
 */
function validateAndCorrectNextParticipant(
  serverNextIndex: number,
  messages: readonly UIMessage[],
  participants: readonly ChatParticipant[],
  currentRound: number,
): number {
  // Get participant indices that have messages in the current round
  const participantIndicesWithMessages = new Set<number>();
  for (const msg of messages) {
    if (msg.role !== MessageRoles.ASSISTANT)
      continue;
    if (isModeratorMessage(msg))
      continue;
    const msgRound = getRoundNumber(msg.metadata);
    if (msgRound !== currentRound)
      continue;
    const pIdx = getParticipantIndexFromMetadata(msg.metadata);
    if (pIdx !== null) {
      participantIndicesWithMessages.add(pIdx);
    }
  }

  // Check if all participants 0 to serverNextIndex-1 have messages
  const totalParticipants = participants.length;
  for (let i = 0; i < serverNextIndex && i < totalParticipants; i++) {
    if (!participantIndicesWithMessages.has(i)) {
      // Found a participant without a message that should have one
      // according to server. Return this as the corrected next participant.
      return i;
    }
  }

  // All prior participants have messages, server's nextP is valid
  return serverNextIndex;
}

/**
 * Handles incomplete round resumption from specific participant
 */
export function useRoundResumption({ store, chat }: UseRoundResumptionParams) {
  // ✅ PERF: Batch selectors with useShallow to prevent unnecessary re-renders
  const {
    waitingToStart,
    chatIsStreaming,
    nextParticipantToTrigger,
    storeParticipants,
    storeMessages,
    storePreSearches,
    storeThread,
    storeScreenMode,
    isWaitingForChangelog,
    configChangeRoundNumber,
    isPatchInProgress,
    // ✅ BUG FIX: Use form state for web search, NOT thread.enableWebSearch
    // Form state is the source of truth for current round web search decision
    // Thread's enableWebSearch is just a default/preference synced on load
    storeEnableWebSearch,
  } = useStore(store, useShallow(s => ({
    waitingToStart: s.waitingToStartStreaming,
    chatIsStreaming: s.isStreaming,
    nextParticipantToTrigger: s.nextParticipantToTrigger,
    storeParticipants: s.participants,
    storeMessages: s.messages,
    storePreSearches: s.preSearches,
    storeThread: s.thread,
    storeScreenMode: s.screenMode,
    // Wait for changelog before streaming when config changed
    isWaitingForChangelog: s.isWaitingForChangelog,
    // configChangeRoundNumber signals pending config changes (set before PATCH)
    configChangeRoundNumber: s.configChangeRoundNumber,
    // ✅ PATCH BLOCKING: Wait for PATCH to complete before streaming
    isPatchInProgress: s.isPatchInProgress,
    // ✅ BUG FIX: Form state for web search toggle (user's current intent)
    storeEnableWebSearch: s.enableWebSearch,
  })));

  // ✅ RACE CONDITION FIX: Extract isReady explicitly for precise dependency tracking
  // chat object changes frequently (messages, streaming state), but we specifically
  // need to react when isReady transitions from false to true
  const chatIsReady = chat.isReady;

  const resumptionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // ✅ RACE CONDITION FIX: Track if resumption has been triggered to prevent double-triggers
  const resumptionTriggeredRef = useRef<string | null>(null);

  // Clean up dangling nextParticipantToTrigger state
  useEffect(() => {
    if (nextParticipantToTrigger === null || waitingToStart || chatIsStreaming) {
      return;
    }

    const timeoutId = setTimeout(() => {
      const latestState = store.getState();
      if (latestState.nextParticipantToTrigger !== null
        && !latestState.waitingToStartStreaming
        && !latestState.isStreaming
      ) {
        latestState.setNextParticipantToTrigger(null);
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [nextParticipantToTrigger, waitingToStart, chatIsStreaming, store]);

  // ============================================================================
  // ✅ RACE CONDITION FIX: Retry mechanism for delayed AI SDK readiness
  // ============================================================================
  // Problem: After page refresh, the effect runs before AI SDK finishes hydration.
  // setMessages() in hydration schedules a state update, but the current render
  // still sees stale chat.isReady=false. The effect re-runs when dependencies
  // change, but React may batch updates causing the isReady=true transition to
  // be missed.
  //
  // Solution: When conditions are met except isReady, schedule a retry.
  // This ensures resumption happens even if we miss the exact transition moment.
  // ============================================================================
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Main resumption effect
  useEffect(() => {
    // Clear any pending retry when effect re-runs
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }

    if (nextParticipantToTrigger === null || !waitingToStart) {
      resumptionTriggeredRef.current = null; // Reset tracking when conditions not met
      return;
    }

    // Skip conditions (minimal logging)
    if (chatIsStreaming) {
      store.getState().setWaitingToStartStreaming(false);
      store.getState().setNextParticipantToTrigger(null);
      resumptionTriggeredRef.current = null;
      return;
    }
    if (storeParticipants.length === 0 || storeMessages.length === 0)
      return;

    // useStreamingTrigger handles OVERVIEW screen via startRound()
    // This hook is for THREAD screen resumption via continueFromParticipant()
    if (storeScreenMode === ScreenModes.OVERVIEW)
      return;

    // ✅ CHANGELOG: Wait for changelog to be fetched before streaming when config changed
    // This allows the changelog accordion to show config changes before participants speak
    // configChangeRoundNumber is set BEFORE PATCH (signals pending changes)
    // isWaitingForChangelog is set AFTER PATCH (triggers changelog fetch)
    // Both must be null/false for streaming to proceed
    // ✅ PATCH BLOCKING: Also wait for PATCH to complete to ensure participants have real ULIDs
    if (configChangeRoundNumber !== null || isWaitingForChangelog || isPatchInProgress)
      return;

    // Generate unique key for this resumption attempt
    const threadId = storeThread?.id || 'unknown';
    const resumptionKey = `${threadId}-r${getCurrentRoundNumber(storeMessages)}-p${getParticipantIndex(nextParticipantToTrigger)}`;

    // Prevent duplicate triggers for the same resumption
    if (resumptionTriggeredRef.current === resumptionKey) {
      return;
    }

    // Wait for AI SDK to be ready
    if (!chatIsReady) {
      // ✅ RACE CONDITION FIX: Schedule retry with direct execution
      // AI SDK hydration is async - isReady will become true after setMessages completes
      // Schedule a retry that directly checks and executes continuation
      // NOTE: Setting same value in Zustand doesn't notify subscribers, so we can't
      // rely on re-triggering the effect - we must execute directly in the retry
      retryTimeoutRef.current = setTimeout(() => {
        const latestState = store.getState();
        const latestParticipants = latestState.participants;
        const latestMessages = latestState.messages;
        const latestThread = latestState.thread;
        const latestPreSearches = latestState.preSearches;
        const latestNextParticipant = latestState.nextParticipantToTrigger;

        // Verify conditions still hold
        if (!latestState.waitingToStartStreaming
          || latestNextParticipant === null
          || latestState.isStreaming
          || latestParticipants.length === 0
          || latestMessages.length === 0
          || latestState.screenMode === ScreenModes.OVERVIEW // ✅ RACE FIX: Let useStreamingTrigger handle overview
          || latestState.configChangeRoundNumber !== null // ✅ FIX: Wait for PATCH to complete
          || latestState.isWaitingForChangelog // ✅ CHANGELOG: Wait for changelog before streaming
          || latestState.isPatchInProgress // ✅ PATCH BLOCKING: Wait for PATCH to ensure real ULIDs
        ) {
          return;
        }

        // Check if AI SDK is now ready
        if (!chat.isReady) {
          // Still not ready - schedule recursive retry with direct execution
          // ✅ FIX: Don't rely on toggle pattern (fails with React 18 batching)
          // Instead, recursively poll until ready and execute directly
          const maxRetries = 20; // 2 seconds max (20 * 100ms)
          let retryCount = 0;

          const pollUntilReady = () => {
            retryCount++;
            if (retryCount > maxRetries) {
              return;
            }

            // Re-fetch latest state each poll
            const pollState = store.getState();
            const pollParticipants = pollState.participants;
            const pollMessages = pollState.messages;
            const pollThread = pollState.thread;
            const pollPreSearches = pollState.preSearches;
            const pollNextParticipant = pollState.nextParticipantToTrigger;

            // Verify conditions still hold
            if (!pollState.waitingToStartStreaming
              || pollNextParticipant === null
              || pollState.isStreaming
              || pollParticipants.length === 0
              || pollMessages.length === 0
              || pollState.screenMode === ScreenModes.OVERVIEW
              || pollState.configChangeRoundNumber !== null
              || pollState.isWaitingForChangelog
              || pollState.isPatchInProgress // ✅ PATCH BLOCKING: Wait for PATCH
            ) {
              return; // Conditions no longer valid, stop polling
            }

            // Check if AI SDK is now ready
            if (!chat.isReady) {
              retryTimeoutRef.current = setTimeout(pollUntilReady, 100);
              return;
            }

            // Check pre-search blocking
            const pollRound = getCurrentRoundNumber(pollMessages);
            const pollWebSearchEnabled = pollState.enableWebSearch;
            const pollPreSearchForRound = pollPreSearches.find(ps => ps.roundNumber === pollRound);
            if (shouldWaitForPreSearch(pollWebSearchEnabled, pollPreSearchForRound)) {
              retryTimeoutRef.current = setTimeout(pollUntilReady, 100);
              return;
            }

            // ✅ CACHE MISMATCH FIX: Validate server's nextParticipantToTrigger
            const pollServerNextIndex = getParticipantIndex(pollNextParticipant);
            const pollCorrectedNextIndex = validateAndCorrectNextParticipant(
              pollServerNextIndex,
              pollMessages,
              pollParticipants,
              pollRound,
            );
            const pollCorrectedParticipant = pollCorrectedNextIndex === pollServerNextIndex
              ? pollNextParticipant
              : typeof pollNextParticipant === 'number'
                ? pollCorrectedNextIndex
                : { index: pollCorrectedNextIndex, participantId: pollParticipants[pollCorrectedNextIndex]?.id ?? '' };

            // Generate resumption key and check for duplicates
            const pollThreadId = pollThread?.id || 'unknown';
            const pollResumptionKey = `${pollThreadId}-r${pollRound}-p${pollCorrectedNextIndex}`;
            if (resumptionTriggeredRef.current === pollResumptionKey) {
              return;
            }

            // Ready! Execute continuation
            resumptionTriggeredRef.current = pollResumptionKey;
            // ✅ CRITICAL FIX: Pass pollMessages to ensure correct userMessageId for backend lookup
            // Without this, continueFromParticipant uses stale AI SDK messages instead of
            // the freshly-persisted messages from PATCH, causing "User message not found" errors
            chat.continueFromParticipant(pollCorrectedParticipant, pollParticipants, pollMessages);
          };

          retryTimeoutRef.current = setTimeout(pollUntilReady, 100);
          return;
        }

        // Check pre-search blocking
        // ✅ BUG FIX: Use form state (enableWebSearch) NOT thread.enableWebSearch
        // When user enables web search mid-conversation, form state is true but thread is false
        const currentRound = getCurrentRoundNumber(latestMessages);
        const webSearchEnabled = latestState.enableWebSearch;
        const preSearchForRound = latestPreSearches.find(ps => ps.roundNumber === currentRound);
        if (shouldWaitForPreSearch(webSearchEnabled, preSearchForRound)) {
          return;
        }

        // ✅ CACHE MISMATCH FIX: Validate server's nextParticipantToTrigger
        const serverNextIndex = getParticipantIndex(latestNextParticipant);
        const correctedNextIndex = validateAndCorrectNextParticipant(
          serverNextIndex,
          latestMessages,
          latestParticipants,
          currentRound,
        );
        const correctedParticipant = correctedNextIndex === serverNextIndex
          ? latestNextParticipant
          : typeof latestNextParticipant === 'number'
            ? correctedNextIndex
            : { index: correctedNextIndex, participantId: latestParticipants[correctedNextIndex]?.id ?? '' };

        // Generate resumption key and check for duplicates
        const threadId = latestThread?.id || 'unknown';
        const retryResumptionKey = `${threadId}-r${currentRound}-p${correctedNextIndex}`;
        if (resumptionTriggeredRef.current === retryResumptionKey) {
          return;
        }

        // Mark as triggered and execute
        resumptionTriggeredRef.current = retryResumptionKey;
        // ✅ TYPE-SAFE: Pass full object with participantId for validation against config changes
        // ✅ CRITICAL FIX: Pass latestMessages to ensure correct userMessageId for backend lookup
        chat.continueFromParticipant(correctedParticipant, latestParticipants, latestMessages);
      }, 100); // Small delay for AI SDK hydration to complete
      return;
    }

    // Wait for pre-search to complete
    // ✅ BUG FIX: Use form state (storeEnableWebSearch) NOT thread.enableWebSearch
    // When user enables web search mid-conversation, form state is true but thread is false
    const currentRound = getCurrentRoundNumber(storeMessages);
    const webSearchEnabled = storeEnableWebSearch;
    const preSearchForRound = storePreSearches.find(ps => ps.roundNumber === currentRound);
    if (shouldWaitForPreSearch(webSearchEnabled, preSearchForRound)) {
      return;
    }

    // ✅ CACHE MISMATCH FIX: Validate server's nextParticipantToTrigger against actual messages
    // Server prefill uses live DB, but SSR messages may be cached. If mismatch detected,
    // correct the next participant to ensure proper streaming order (p0 → p1 → p2).
    const serverNextIndex = getParticipantIndex(nextParticipantToTrigger);
    const correctedNextIndex = validateAndCorrectNextParticipant(
      serverNextIndex,
      storeMessages,
      storeParticipants,
      currentRound,
    );

    // Build corrected participant trigger value
    const correctedParticipant = correctedNextIndex === serverNextIndex
      ? nextParticipantToTrigger
      : typeof nextParticipantToTrigger === 'number'
        ? correctedNextIndex
        : { index: correctedNextIndex, participantId: storeParticipants[correctedNextIndex]?.id ?? '' };

    // Update resumption key to reflect corrected participant
    const correctedResumptionKey = `${storeThread?.id || 'unknown'}-r${currentRound}-p${correctedNextIndex}`;

    // ✅ Mark as triggered before calling to prevent race condition double-triggers
    resumptionTriggeredRef.current = correctedResumptionKey;

    // Resume from specific participant
    // ✅ TYPE-SAFE: Pass full object with participantId for validation against config changes
    // ✅ CRITICAL FIX: Pass storeMessages to ensure correct userMessageId for backend lookup
    // Without this, continueFromParticipant uses stale AI SDK messages instead of
    // the freshly-persisted messages from PATCH, causing "User message not found" errors
    chat.continueFromParticipant(correctedParticipant, storeParticipants, storeMessages);

    // Cleanup
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
    };
  }, [nextParticipantToTrigger, waitingToStart, chatIsStreaming, chatIsReady, storeParticipants, storeMessages, storePreSearches, storeThread, storeScreenMode, configChangeRoundNumber, isWaitingForChangelog, isPatchInProgress, storeEnableWebSearch, chat, store]);

  // Safety timeout for thread screen resumption
  useEffect(() => {
    const currentScreenMode = store.getState().screenMode;
    if (currentScreenMode !== 'thread' || !waitingToStart || nextParticipantToTrigger === null) {
      if (resumptionTimeoutRef.current) {
        clearTimeout(resumptionTimeoutRef.current);
        resumptionTimeoutRef.current = null;
      }
      return;
    }

    if (chatIsStreaming) {
      if (resumptionTimeoutRef.current) {
        clearTimeout(resumptionTimeoutRef.current);
        resumptionTimeoutRef.current = null;
      }
      return;
    }

    // ✅ TIMEOUT FIX: Reduced from 10s to 5s for faster recovery from stuck states
    resumptionTimeoutRef.current = setTimeout(() => {
      const latestState = store.getState();
      if (latestState.waitingToStartStreaming && !latestState.isStreaming) {
        latestState.setWaitingToStartStreaming(false);
        latestState.setNextParticipantToTrigger(null);
      }
    }, 5000);

    return () => {
      if (resumptionTimeoutRef.current) {
        clearTimeout(resumptionTimeoutRef.current);
        resumptionTimeoutRef.current = null;
      }
    };
  }, [waitingToStart, chatIsStreaming, nextParticipantToTrigger, store]);
}
