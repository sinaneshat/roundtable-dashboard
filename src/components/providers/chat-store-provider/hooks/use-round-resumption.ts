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

import { ScreenModes } from '@/api/core/enums';
import { getCurrentRoundNumber } from '@/lib/utils';
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
  // Subscribe to necessary store state
  const waitingToStart = useStore(store, s => s.waitingToStartStreaming);
  const chatIsStreaming = useStore(store, s => s.isStreaming);
  const nextParticipantToTrigger = useStore(store, s => s.nextParticipantToTrigger);
  const storeParticipants = useStore(store, s => s.participants);
  const storeMessages = useStore(store, s => s.messages);
  const storePreSearches = useStore(store, s => s.preSearches);
  const storeThread = useStore(store, s => s.thread);
  const storeScreenMode = useStore(store, s => s.screenMode);

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

    if (chatIsStreaming) {
      store.getState().setWaitingToStartStreaming(false);
      store.getState().setNextParticipantToTrigger(null);
      resumptionTriggeredRef.current = null;
      return;
    }

    if (storeParticipants.length === 0) {
      return;
    }

    // ✅ FIX: Don't clear waitingToStartStreaming when messages are empty
    // During new thread creation, messages haven't populated yet.
    // Just return early - use-streaming-trigger.ts handles new thread initialization.
    // This hook is only for RESUMPTION (continuing from specific participant after refresh).
    if (storeMessages.length === 0) {
      return;
    }

    // ✅ RACE CONDITION FIX: Don't handle streaming on OVERVIEW screen
    // useStreamingTrigger handles OVERVIEW screen streaming via startRound()
    // This hook is for THREAD screen resumption via continueFromParticipant()
    // Without this check, both hooks race when waitingToStartStreaming becomes true
    // after thread creation, causing duplicate streaming attempts
    if (storeScreenMode === ScreenModes.OVERVIEW) {
      return;
    }

    // Generate unique key for this resumption attempt
    const threadId = storeThread?.id || 'unknown';
    const resumptionKey = `${threadId}-r${getCurrentRoundNumber(storeMessages)}-p${nextParticipantToTrigger}`;

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
        const currentRound = getCurrentRoundNumber(latestMessages);
        const webSearchEnabled = latestThread?.enableWebSearch ?? false;
        const preSearchForRound = latestPreSearches.find(ps => ps.roundNumber === currentRound);
        if (shouldWaitForPreSearch(webSearchEnabled, preSearchForRound)) {
          return;
        }

        // Generate resumption key and check for duplicates
        const threadId = latestThread?.id || 'unknown';
        const retryResumptionKey = `${threadId}-r${currentRound}-p${latestNextParticipant}`;
        if (resumptionTriggeredRef.current === retryResumptionKey) {
          return;
        }

        // Mark as triggered and execute
        resumptionTriggeredRef.current = retryResumptionKey;
        chat.continueFromParticipant(latestNextParticipant, latestParticipants);
      }, 100); // Small delay for AI SDK hydration to complete
      return;
    }

    // Wait for pre-search to complete
    const currentRound = getCurrentRoundNumber(storeMessages);
    const webSearchEnabled = storeThread?.enableWebSearch ?? false;
    const preSearchForRound = storePreSearches.find(ps => ps.roundNumber === currentRound);
    if (shouldWaitForPreSearch(webSearchEnabled, preSearchForRound)) {
      return;
    }

    // ✅ Mark as triggered before calling to prevent race condition double-triggers
    resumptionTriggeredRef.current = resumptionKey;

    // Resume from specific participant
    chat.continueFromParticipant(nextParticipantToTrigger, storeParticipants);

    // Cleanup
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
    };
  }, [nextParticipantToTrigger, waitingToStart, chatIsStreaming, chatIsReady, storeParticipants, storeMessages, storePreSearches, storeThread, storeScreenMode, chat, store]);

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
