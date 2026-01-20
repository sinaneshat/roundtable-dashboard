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

import { MessageRoles, ScreenModes } from '@roundtable/shared';
import type { UIMessage } from 'ai';
import { useEffect, useRef } from 'react';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

import { getCurrentRoundNumber, getEnabledParticipants, getParticipantIndex as getParticipantIndexFromMetadata, getRoundNumber, isModeratorMessage } from '@/lib/utils';
import { rlog } from '@/lib/utils/dev-logger';
import type { ChatParticipant } from '@/services/api';
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
  // ✅ STALE SELECTOR FIX: Read fresh state instead of using potentially stale selectors
  // React batching can cause selectors to have outdated values when effects run.
  useEffect(() => {
    const freshState = store.getState();
    if (freshState.nextParticipantToTrigger === null
      || freshState.waitingToStartStreaming
      || freshState.isStreaming) {
      return;
    }

    const timeoutId = setTimeout(() => {
      const latestState = store.getState();
      if (latestState.nextParticipantToTrigger !== null
        && !latestState.waitingToStartStreaming
        && !latestState.isStreaming
      ) {
        rlog.resume('round-resum', 'cleanup: clearing dangling nextParticipantToTrigger');
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

    // ✅ STALE SELECTOR FIX: Read fresh state from store instead of relying on selectors
    // React selectors can have stale values due to batching. The retry mechanism reads
    // fresh state, but a React re-render can cause the effect to run again with stale
    // selector values, causing early exit even when store has correct values.
    // Solution: Read fresh state at effect start and use those values.
    const freshState = store.getState();
    const freshWaitingToStart = freshState.waitingToStartStreaming;
    const freshNextParticipantToTrigger = freshState.nextParticipantToTrigger;
    const freshIsStreaming = freshState.isStreaming;
    const freshParticipants = freshState.participants;
    const freshMessages = freshState.messages;
    const freshPreSearches = freshState.preSearches;
    const freshThread = freshState.thread;
    const freshScreenMode = freshState.screenMode;
    const freshConfigChangeRoundNumber = freshState.configChangeRoundNumber;
    const freshIsWaitingForChangelog = freshState.isWaitingForChangelog;
    const freshIsPatchInProgress = freshState.isPatchInProgress;
    const freshEnableWebSearch = freshState.enableWebSearch;

    // ✅ DEBUG: Log effect entry for resumption debugging (using fresh state)
    const nextIdx = freshNextParticipantToTrigger !== null ? getParticipantIndex(freshNextParticipantToTrigger) : -1;
    rlog.resume('round-resum', `effect wait=${freshWaitingToStart ? 1 : 0} nextP=${nextIdx} ready=${chatIsReady ? 1 : 0} streaming=${freshIsStreaming ? 1 : 0} parts=${freshParticipants.length} msgs=${freshMessages.length}`);

    if (freshNextParticipantToTrigger === null || !freshWaitingToStart) {
      rlog.resume('round-resum', 'EXIT: nextP=null or not waiting');
      resumptionTriggeredRef.current = null; // Reset tracking when conditions not met
      return;
    }

    // Skip conditions (minimal logging) - use fresh state values
    if (freshIsStreaming) {
      // ✅ PREFILLED RESUMPTION FIX: Don't clear flags if this is a prefilled resumption
      // During prefilled resumption, AI SDK may resume a different participant's stream
      // than what we need to trigger. We shouldn't clear the flags yet.
      const freshStreamResumptionPrefilled = freshState.streamResumptionPrefilled;
      const freshCurrentResumptionPhase = freshState.currentResumptionPhase;
      if (freshStreamResumptionPrefilled && freshCurrentResumptionPhase === 'participants') {
        return;
      }

      rlog.resume('round-resum', 'EXIT: already streaming - clearing wait flags');
      store.getState().setWaitingToStartStreaming(false);
      store.getState().setNextParticipantToTrigger(null);
      resumptionTriggeredRef.current = null;
      return;
    }
    if (freshParticipants.length === 0 || freshMessages.length === 0) {
      rlog.resume('round-resum', `EXIT: no data parts=${freshParticipants.length} msgs=${freshMessages.length}`);
      return;
    }

    // useStreamingTrigger handles OVERVIEW screen via startRound()
    // This hook is for THREAD screen resumption via continueFromParticipant()
    if (freshScreenMode === ScreenModes.OVERVIEW) {
      rlog.resume('round-resum', 'EXIT: OVERVIEW screen - handled by streaming-trigger');
      return;
    }

    // ✅ CHANGELOG: Wait for changelog to be fetched before streaming when config changed
    // This allows the changelog accordion to show config changes before participants speak
    // configChangeRoundNumber is set BEFORE PATCH (signals pending changes)
    // isWaitingForChangelog is set AFTER PATCH (triggers changelog fetch)
    // Both must be null/false for streaming to proceed
    // ✅ PATCH BLOCKING: Also wait for PATCH to complete to ensure participants have real ULIDs
    if (freshConfigChangeRoundNumber !== null || freshIsWaitingForChangelog || freshIsPatchInProgress) {
      rlog.resume('round-resum', `EXIT: config/changelog configR=${freshConfigChangeRoundNumber} changelog=${freshIsWaitingForChangelog ? 1 : 0} patch=${freshIsPatchInProgress ? 1 : 0}`);
      return;
    }

    // Generate unique key for this resumption attempt
    const threadId = freshThread?.id || 'unknown';
    const resumptionKey = `${threadId}-r${getCurrentRoundNumber(freshMessages)}-p${getParticipantIndex(freshNextParticipantToTrigger)}`;

    // Prevent duplicate triggers for the same resumption
    if (resumptionTriggeredRef.current === resumptionKey) {
      rlog.resume('round-resum', `EXIT: already triggered key=${resumptionKey.slice(-20)}`);
      return;
    }

    // Wait for AI SDK to be ready
    if (!chatIsReady) {
      rlog.resume('round-resum', `AI SDK not ready - scheduling retry (wait=${freshWaitingToStart ? 1 : 0} nextP=${nextIdx})`);
      // ✅ RACE CONDITION FIX: Schedule retry with direct execution
      // AI SDK hydration is async - isReady will become true after setMessages completes
      // Schedule a retry that directly checks and executes continuation
      // NOTE: Setting same value in Zustand doesn't notify subscribers, so we can't
      // rely on re-triggering the effect - we must execute directly in the retry
      retryTimeoutRef.current = setTimeout(() => {
        rlog.resume('round-resum', 'retry timeout fired - checking conditions');
        const latestState = store.getState();
        const latestParticipants = latestState.participants;
        const latestMessages = latestState.messages;
        const latestThread = latestState.thread;
        const latestPreSearches = latestState.preSearches;
        const latestNextParticipant = latestState.nextParticipantToTrigger;

        // Verify conditions still hold
        const nextP = latestNextParticipant !== null ? (typeof latestNextParticipant === 'number' ? latestNextParticipant : latestNextParticipant.index) : -1;
        rlog.resume('round-resum', `retry conditions: wait=${latestState.waitingToStartStreaming ? 1 : 0} nextP=${nextP} streaming=${latestState.isStreaming ? 1 : 0} screen=${latestState.screenMode} modStream=${latestState.isModeratorStreaming ? 1 : 0}`);
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
          rlog.resume('round-resum', 'retry conditions FAILED - aborting');
          return;
        }

        // Check if AI SDK is now ready
        if (!chat.isReady) {
          // ✅ HYDRATION FIX: Call continueFromParticipant to trigger hydration FIRST
          // The AI SDK has 0 messages but latestMessages has messages from the store.
          // continueFromParticipant will hydrate the AI SDK, then return early.
          // We then poll until hydration completes and isReady becomes true.
          rlog.resume('round-resum', `initial: AI SDK not ready (msgs=${chat.messages?.length ?? 0}) - calling cfp to hydrate`);
          const enabledForHydration = getEnabledParticipants(latestParticipants);
          const nextIdx = typeof latestNextParticipant === 'number' ? latestNextParticipant : latestNextParticipant.index;
          chat.continueFromParticipant(
            { index: nextIdx, participantId: enabledForHydration[nextIdx]?.id ?? '' },
            enabledForHydration,
            latestMessages,
          );

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

            // ✅ HYDRATION FIX: If AI SDK not ready, call continueFromParticipant anyway
            // The hydration logic inside continueFromParticipant will:
            // 1. See AI SDK has 0 messages but pollMessages has messages
            // 2. Hydrate the AI SDK with setMessages(pollMessages)
            // 3. Return early (isTriggeringRef.current = false)
            // 4. On next poll, isReady will be true and streaming can start
            if (!chat.isReady) {
              rlog.resume('round-resum', `poll: AI SDK not ready (msgs=${chat.messages?.length ?? 0}) - calling cfp to hydrate`);
              // Call continueFromParticipant to trigger hydration
              const pollEnabledForHydration = getEnabledParticipants(pollParticipants);
              const pollNextIdx = typeof pollNextParticipant === 'number' ? pollNextParticipant : pollNextParticipant.index;
              chat.continueFromParticipant(
                { index: pollNextIdx, participantId: pollEnabledForHydration[pollNextIdx]?.id ?? '' },
                pollEnabledForHydration,
                pollMessages,
              );
              // Schedule next poll to check if hydration completed
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

            // ✅ PARTICIPANT MISMATCH FIX: Filter to enabled participants
            const pollEnabledParticipants = getEnabledParticipants(pollParticipants);

            // ✅ CACHE MISMATCH FIX: Validate server's nextParticipantToTrigger
            const pollServerNextIndex = getParticipantIndex(pollNextParticipant);
            const pollCorrectedNextIndex = validateAndCorrectNextParticipant(
              pollServerNextIndex,
              pollMessages,
              pollEnabledParticipants,
              pollRound,
            );
            const pollCorrectedParticipant = pollCorrectedNextIndex === pollServerNextIndex
              ? pollNextParticipant
              : typeof pollNextParticipant === 'number'
                ? pollCorrectedNextIndex
                : { index: pollCorrectedNextIndex, participantId: pollEnabledParticipants[pollCorrectedNextIndex]?.id ?? '' };

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
            // ✅ FIX: Pass pollEnabledParticipants (not full array)
            chat.continueFromParticipant(pollCorrectedParticipant, pollEnabledParticipants, pollMessages);
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

        // ✅ PARTICIPANT MISMATCH FIX: Filter to enabled participants
        const latestEnabledParticipants = getEnabledParticipants(latestParticipants);

        // ✅ CACHE MISMATCH FIX: Validate server's nextParticipantToTrigger
        const serverNextIndex = getParticipantIndex(latestNextParticipant);
        const correctedNextIndex = validateAndCorrectNextParticipant(
          serverNextIndex,
          latestMessages,
          latestEnabledParticipants,
          currentRound,
        );
        const correctedParticipant = correctedNextIndex === serverNextIndex
          ? latestNextParticipant
          : typeof latestNextParticipant === 'number'
            ? correctedNextIndex
            : { index: correctedNextIndex, participantId: latestEnabledParticipants[correctedNextIndex]?.id ?? '' };

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
        // ✅ FIX: Pass latestEnabledParticipants (not full array)
        chat.continueFromParticipant(correctedParticipant, latestEnabledParticipants, latestMessages);
      }, 100); // Small delay for AI SDK hydration to complete
      return;
    }

    // Wait for pre-search to complete
    // ✅ BUG FIX: Use form state (freshEnableWebSearch) NOT thread.enableWebSearch
    // When user enables web search mid-conversation, form state is true but thread is false
    const currentRound = getCurrentRoundNumber(freshMessages);
    const webSearchEnabled = freshEnableWebSearch;
    const preSearchForRound = freshPreSearches.find(ps => ps.roundNumber === currentRound);
    if (shouldWaitForPreSearch(webSearchEnabled, preSearchForRound)) {
      rlog.resume('round-resum', `EXIT: waiting pre-search r${currentRound}`);
      return;
    }

    // ✅ PARTICIPANT MISMATCH FIX: Filter to enabled participants BEFORE index calculations
    // validateAndCorrectNextParticipant and continueFromParticipant both expect indices
    // into the ENABLED participants array, not the full participants array.
    // Previously we passed freshParticipants (full array) which caused index mismatches
    // when some participants were disabled (e.g., index 2 in full array != index 2 in enabled array)
    const enabledParticipants = getEnabledParticipants(freshParticipants);

    // ✅ CACHE MISMATCH FIX: Validate server's nextParticipantToTrigger against actual messages
    // Server prefill uses live DB, but SSR messages may be cached. If mismatch detected,
    // correct the next participant to ensure proper streaming order (p0 → p1 → p2).
    const serverNextIndex = getParticipantIndex(freshNextParticipantToTrigger);
    const correctedNextIndex = validateAndCorrectNextParticipant(
      serverNextIndex,
      freshMessages,
      enabledParticipants,
      currentRound,
    );

    // Build corrected participant trigger value
    // ✅ FIX: Use enabledParticipants to get the correct participant ID at the corrected index
    const correctedParticipant = correctedNextIndex === serverNextIndex
      ? freshNextParticipantToTrigger
      : typeof freshNextParticipantToTrigger === 'number'
        ? correctedNextIndex
        : { index: correctedNextIndex, participantId: enabledParticipants[correctedNextIndex]?.id ?? '' };

    // Update resumption key to reflect corrected participant
    const correctedResumptionKey = `${freshThread?.id || 'unknown'}-r${currentRound}-p${correctedNextIndex}`;

    // ✅ Mark as triggered before calling to prevent race condition double-triggers
    resumptionTriggeredRef.current = correctedResumptionKey;

    // ✅ DEBUG: Log continuation trigger
    rlog.resume('round-resum', `CONTINUE r${currentRound} p${correctedNextIndex} serverP=${serverNextIndex} parts=${enabledParticipants.length} msgs=${freshMessages.length}`);

    // Resume from specific participant
    // ✅ TYPE-SAFE: Pass full object with participantId for validation against config changes
    // ✅ CRITICAL FIX: Pass freshMessages to ensure correct userMessageId for backend lookup
    // Without this, continueFromParticipant uses stale AI SDK messages instead of
    // the freshly-persisted messages from PATCH, causing "User message not found" errors
    // ✅ FIX: Pass enabledParticipants (not full array) to match the index calculations
    chat.continueFromParticipant(correctedParticipant, enabledParticipants, freshMessages);

    // Cleanup
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
    };
  }, [nextParticipantToTrigger, waitingToStart, chatIsStreaming, chatIsReady, storeParticipants, storeMessages, storePreSearches, storeThread, storeScreenMode, configChangeRoundNumber, isWaitingForChangelog, isPatchInProgress, storeEnableWebSearch, chat, store]);

  // Safety timeout for thread screen resumption
  // ✅ STALE SELECTOR FIX: Read fresh state instead of using potentially stale selectors
  useEffect(() => {
    const freshState = store.getState();
    const currentScreenMode = freshState.screenMode;
    const freshWaiting = freshState.waitingToStartStreaming;
    const freshNextP = freshState.nextParticipantToTrigger;
    const freshStreaming = freshState.isStreaming;

    if (currentScreenMode !== 'thread' || !freshWaiting || freshNextP === null) {
      if (resumptionTimeoutRef.current) {
        clearTimeout(resumptionTimeoutRef.current);
        resumptionTimeoutRef.current = null;
      }
      return;
    }

    if (freshStreaming) {
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
        rlog.resume('round-resum', 'safety timeout: clearing stuck resumption state');
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
