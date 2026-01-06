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

import { useEffect, useRef } from 'react';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

import { ScreenModes } from '@/api/core/enums';
import { getCurrentRoundNumber, rlog } from '@/lib/utils';
import type { ChatStoreApi } from '@/stores/chat';
import { shouldWaitForPreSearch } from '@/stores/chat';

import type { ChatHook } from '../types';

type UseRoundResumptionParams = {
  store: ChatStoreApi;
  chat: ChatHook;
};

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
    if (configChangeRoundNumber !== null || isWaitingForChangelog)
      return;

    // Generate unique key for this resumption attempt
    const threadId = storeThread?.id || 'unknown';
    const resumptionKey = `${threadId}-r${getCurrentRoundNumber(storeMessages)}-p${nextParticipantToTrigger.index}`;

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
        ) {
          return;
        }

        // Check if AI SDK is now ready
        if (!chat.isReady) {
          // Still not ready - schedule another retry with toggle pattern
          // Toggle waitingToStartStreaming to force effect re-run since setting same value doesn't notify
          retryTimeoutRef.current = setTimeout(() => {
            latestState.setWaitingToStartStreaming(false);
            // Use queueMicrotask to ensure the false is processed before setting true
            queueMicrotask(() => latestState.setWaitingToStartStreaming(true));
          }, 200);
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

        // Generate resumption key and check for duplicates
        const threadId = latestThread?.id || 'unknown';
        const retryResumptionKey = `${threadId}-r${currentRound}-p${latestNextParticipant.index}`;
        if (resumptionTriggeredRef.current === retryResumptionKey) {
          return;
        }

        // Mark as triggered and execute
        resumptionTriggeredRef.current = retryResumptionKey;
        // ✅ TYPE-SAFE: Pass full object with participantId for validation against config changes
        chat.continueFromParticipant(latestNextParticipant, latestParticipants);
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

    // ✅ Mark as triggered before calling to prevent race condition double-triggers
    resumptionTriggeredRef.current = resumptionKey;
    rlog.trigger('resume', `p${nextParticipantToTrigger.index} key=${resumptionKey}`);

    // Resume from specific participant
    // ✅ TYPE-SAFE: Pass full object with participantId for validation against config changes
    chat.continueFromParticipant(nextParticipantToTrigger, storeParticipants);

    // Cleanup
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
    };
  }, [nextParticipantToTrigger, waitingToStart, chatIsStreaming, chatIsReady, storeParticipants, storeMessages, storePreSearches, storeThread, storeScreenMode, configChangeRoundNumber, isWaitingForChangelog, storeEnableWebSearch, chat, store]);

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
