/**
 * Participant Completion Flash Tests
 *
 * Tests to catch the UI flash that occurs when all participants finish streaming
 * but before the moderator starts.
 *
 * The flash manifests as:
 * - All participant cards briefly disappear/flash
 * - All response content briefly flashes
 * - Moderator placeholder briefly flashes
 *
 * ROOT CAUSE HYPOTHESIS:
 * There's a timing gap between:
 * 1. isStreaming becomes false (participants done)
 * 2. isModeratorStreaming is set to true (moderator starting)
 *
 * During this gap, if streamingRoundNumber is null or doesn't match,
 * isAnyStreamingActive = false, causing shouldShowPendingCards = false → FLASH
 */

import { describe, expect, it } from 'vitest';

import { createChatStore } from '../store';

/**
 * Get store state without type issues
 */
function getStoreState(store: ReturnType<typeof createChatStore>) {
  return store.getState();
}

/**
 * Calculate isAnyStreamingActive exactly as chat-message-list.tsx does
 */
function calculateIsAnyStreamingActive(
  isStreaming: boolean,
  isModeratorStreaming: boolean,
  roundNumber: number,
  streamingRoundNumber: number | null,
): boolean {
  const isStreamingRound = roundNumber === streamingRoundNumber;
  return isStreaming || isModeratorStreaming || isStreamingRound;
}

/**
 * Calculate shouldShowPendingCards exactly as chat-message-list.tsx does
 * Simplified version - in real code there's also preSearch conditions
 */
function calculateShouldShowPendingCards(
  isRoundComplete: boolean,
  isStreaming: boolean,
  isModeratorStreaming: boolean,
  roundNumber: number,
  streamingRoundNumber: number | null,
  preSearchActive = false,
  preSearchComplete = false,
): boolean {
  const isAnyStreamingActive = calculateIsAnyStreamingActive(
    isStreaming,
    isModeratorStreaming,
    roundNumber,
    streamingRoundNumber,
  );
  return !isRoundComplete && (preSearchActive || preSearchComplete || isAnyStreamingActive);
}

describe('participant Completion Flash Detection', () => {
  /**
   * Test simulates the exact sequence of state updates that happen when
   * participants finish streaming and moderator needs to start.
   */
  describe('state Transition Sequence', () => {
    it('should detect flash when streamingRoundNumber is prematurely cleared', () => {
      const store = createChatStore();
      const state = getStoreState(store);
      const roundNumber = 0;

      // Track shouldShowPendingCards at each step
      const pendingCardStates: { step: string; shouldShow: boolean }[] = [];

      function recordState(step: string) {
        const s = getStoreState(store);
        const shouldShow = calculateShouldShowPendingCards(
          false, // isRoundComplete - false during streaming
          s.isStreaming,
          s.isModeratorStreaming,
          roundNumber,
          s.streamingRoundNumber,
        );
        pendingCardStates.push({ shouldShow, step });
        return shouldShow;
      }

      // Step 1: Initial streaming state
      state.setStreamingRoundNumber(roundNumber);
      state.setIsStreaming(true);
      expect(recordState('1-streaming')).toBeTruthy();

      // Step 2: Streaming in progress
      expect(recordState('2-still-streaming')).toBeTruthy();

      // Step 3: isStreaming becomes false (participants done)
      state.setIsStreaming(false);
      const afterStreamingFalse = recordState('3-streaming-false');

      // Step 4: isModeratorStreaming becomes true
      state.setIsModeratorStreaming(true);
      expect(recordState('4-moderator-starting')).toBeTruthy();

      // ✅ CRITICAL: At step 3, shouldShowPendingCards should STILL be true
      // because streamingRoundNumber is still set
      expect(afterStreamingFalse).toBeTruthy();

      // Verify no flash occurred
      const hadFlash = pendingCardStates.some(s => !s.shouldShow);
      expect(hadFlash).toBeFalsy();
    });

    it('should detect flash when completeStreaming is called too early', () => {
      const store = createChatStore();
      const state = getStoreState(store);
      const roundNumber = 0;

      const pendingCardStates: { step: string; shouldShow: boolean }[] = [];

      function recordState(step: string) {
        const s = getStoreState(store);
        const shouldShow = calculateShouldShowPendingCards(
          false,
          s.isStreaming,
          s.isModeratorStreaming,
          roundNumber,
          s.streamingRoundNumber,
        );
        pendingCardStates.push({ shouldShow, step });
        return shouldShow;
      }

      // Setup: Streaming in progress
      state.setStreamingRoundNumber(roundNumber);
      state.setIsStreaming(true);
      expect(recordState('1-streaming')).toBeTruthy();

      // Participants done
      state.setIsStreaming(false);
      expect(recordState('2-streaming-false')).toBeTruthy();

      // ❌ BUG SCENARIO: completeStreaming is called BEFORE moderator starts
      // This clears streamingRoundNumber to null
      state.completeStreaming();
      const afterCompleteStreaming = recordState('3-after-complete-streaming');

      // At this point, all three flags are false:
      // - isStreaming = false
      // - isModeratorStreaming = false
      // - isStreamingRound = false (because streamingRoundNumber is null)
      // This causes shouldShowPendingCards = false → FLASH

      // Verify the flash scenario is detected
      expect(afterCompleteStreaming).toBeFalsy();

      // Now moderator starts (too late - flash already happened)
      state.setIsModeratorStreaming(true);
      expect(recordState('4-moderator-starting')).toBeTruthy();

      // Confirm flash was detected
      const hadFlash = pendingCardStates.some(s => !s.shouldShow);
      expect(hadFlash).toBeTruthy();
    });

    it('should NOT flash when streamingRoundNumber is preserved correctly', () => {
      const store = createChatStore();
      const state = getStoreState(store);
      const roundNumber = 0;

      const pendingCardStates: { step: string; shouldShow: boolean }[] = [];

      function recordState(step: string) {
        const s = getStoreState(store);
        const shouldShow = calculateShouldShowPendingCards(
          false,
          s.isStreaming,
          s.isModeratorStreaming,
          roundNumber,
          s.streamingRoundNumber,
        );
        pendingCardStates.push({ shouldShow, step });
        return shouldShow;
      }

      // Setup: Streaming in progress
      state.setStreamingRoundNumber(roundNumber);
      state.setIsStreaming(true);
      expect(recordState('1-streaming')).toBeTruthy();

      // Participants done
      state.setIsStreaming(false);
      expect(recordState('2-streaming-false')).toBeTruthy();

      // ✅ CORRECT: Moderator starts BEFORE streamingRoundNumber is cleared
      state.setIsModeratorStreaming(true);
      expect(recordState('3-moderator-starting')).toBeTruthy();

      // Moderator streams...
      expect(recordState('4-moderator-streaming')).toBeTruthy();

      // Moderator completes
      state.setIsModeratorStreaming(false);
      expect(recordState('5-moderator-done')).toBeTruthy(); // Still true due to streamingRoundNumber

      // Only NOW should completeStreaming be called
      state.completeStreaming();
      // After completeStreaming, the round is truly complete, so it's ok for pending cards to hide

      // Verify no flash during the transition
      // All states before step 6 should have shown pending cards
      const earlyFlash = pendingCardStates
        .slice(0, 5) // Steps 1-5 should all show pending cards
        .some(s => !s.shouldShow);
      expect(earlyFlash).toBeFalsy();
    });
  });

  describe('edge Cases for Flash Detection', () => {
    it('should handle rapid state transitions without flash', () => {
      const store = createChatStore();
      const state = getStoreState(store);
      const roundNumber = 0;

      // Simulate rapid state changes that might happen in React
      state.setStreamingRoundNumber(roundNumber);
      state.setIsStreaming(true);

      // Batch 1: Streaming ends
      state.setIsStreaming(false);

      // Check state between batches
      const s = getStoreState(store);
      const isAnyActive = calculateIsAnyStreamingActive(
        s.isStreaming,
        s.isModeratorStreaming,
        roundNumber,
        s.streamingRoundNumber,
      );
      expect(isAnyActive).toBeTruthy(); // Should be true due to streamingRoundNumber

      // Batch 2: Moderator starts
      state.setIsModeratorStreaming(true);

      const s2 = getStoreState(store);
      const isAnyActive2 = calculateIsAnyStreamingActive(
        s2.isStreaming,
        s2.isModeratorStreaming,
        roundNumber,
        s2.streamingRoundNumber,
      );
      expect(isAnyActive2).toBeTruthy();
    });

    it('should detect when isStreaming and streamingRoundNumber are cleared together', () => {
      const store = createChatStore();
      const state = getStoreState(store);
      const roundNumber = 0;

      // Setup
      state.setStreamingRoundNumber(roundNumber);
      state.setIsStreaming(true);

      // Participants done
      state.setIsStreaming(false);

      // Simulate a bug where both are cleared together
      // This would happen if STREAMING_STATE_RESET is applied prematurely
      const beforeClear = getStoreState(store);
      expect(beforeClear.streamingRoundNumber).toBe(roundNumber);

      // Apply STREAMING_STATE_RESET (via completeStreaming)
      state.completeStreaming();

      const afterClear = getStoreState(store);
      expect(afterClear.streamingRoundNumber).toBeNull();

      // At this point, isAnyStreamingActive should be false
      const isAnyActive = calculateIsAnyStreamingActive(
        afterClear.isStreaming,
        afterClear.isModeratorStreaming,
        roundNumber,
        afterClear.streamingRoundNumber,
      );
      expect(isAnyActive).toBeFalsy(); // This is the flash state!
    });

    it('should track state through full participant→moderator lifecycle', () => {
      const store = createChatStore();
      const state = getStoreState(store);
      const roundNumber = 1;

      type StateSnapshot = {
        step: string;
        isStreaming: boolean;
        isModeratorStreaming: boolean;
        streamingRoundNumber: number | null;
        isAnyStreamingActive: boolean;
      };

      const snapshots: StateSnapshot[] = [];

      function snapshot(step: string) {
        const s = getStoreState(store);
        const isAnyStreamingActive = calculateIsAnyStreamingActive(
          s.isStreaming,
          s.isModeratorStreaming,
          roundNumber,
          s.streamingRoundNumber,
        );
        snapshots.push({
          isAnyStreamingActive,
          isModeratorStreaming: s.isModeratorStreaming,
          isStreaming: s.isStreaming,
          step,
          streamingRoundNumber: s.streamingRoundNumber,
        });
      }

      // Full lifecycle
      snapshot('0-initial');

      state.setStreamingRoundNumber(roundNumber);
      snapshot('1-round-set');

      state.setIsStreaming(true);
      snapshot('2-streaming-true');

      state.setIsStreaming(false);
      snapshot('3-streaming-false');

      state.setIsModeratorStreaming(true);
      snapshot('4-mod-true');

      state.setIsModeratorStreaming(false);
      snapshot('5-mod-false');

      state.completeStreaming();
      snapshot('6-complete');

      // Analyze for flashes
      // Steps 1-5 should all have isAnyStreamingActive = true
      const activeSteps = snapshots.slice(1, 6); // steps 1-5
      const flashDuringLifecycle = activeSteps.some(s => !s.isAnyStreamingActive);

      expect(flashDuringLifecycle).toBeFalsy();
    });
  });

  describe('isLatestRound Gate (Critical for non-web-search chats)', () => {
    /**
     * For chats WITHOUT web search, the isLatestRound calculation is:
     *   isLatestRound = isActuallyLatestRound && isStreamingRound
     *
     * Where isStreamingRound = roundNumber === streamingRoundNumber
     *
     * If isStreamingRound becomes false, the pending cards section returns null
     * entirely, causing an UNMOUNT. When it becomes true again, it REMOUNTS,
     * causing animation replays (the visible flash).
     */
    it('should detect flash when isLatestRound becomes false during transition', () => {
      const store = createChatStore();
      const state = getStoreState(store);
      const roundNumber = 0;

      function calculateIsLatestRound(
        roundNumber: number,
        streamingRoundNumber: number | null,
        preSearchActive = false,
        preSearchComplete = false,
      ): boolean {
        const isStreamingRound = roundNumber === streamingRoundNumber;
        // For simplicity, assume isActuallyLatestRound is always true
        const isActuallyLatestRound = true;
        return isActuallyLatestRound && (isStreamingRound || preSearchActive || preSearchComplete);
      }

      const renderStates: { step: string; isLatestRound: boolean }[] = [];

      function recordRender(step: string) {
        const s = getStoreState(store);
        const isLatestRound = calculateIsLatestRound(
          roundNumber,
          s.streamingRoundNumber,
          false, // No web search
          false, // No web search
        );
        renderStates.push({ isLatestRound, step });
        return isLatestRound;
      }

      // Setup streaming
      state.setStreamingRoundNumber(roundNumber);
      state.setIsStreaming(true);
      expect(recordRender('1-streaming')).toBeTruthy();

      // Participants done
      state.setIsStreaming(false);
      expect(recordRender('2-streaming-false')).toBeTruthy(); // Still true due to streamingRoundNumber

      // BUG: If completeStreaming is called here, streamingRoundNumber becomes null
      state.completeStreaming();
      const afterCompleteStreaming = recordRender('3-after-complete');
      expect(afterCompleteStreaming).toBeFalsy(); // FLASH! Returns null, unmounts

      // Moderator starts (too late)
      state.setIsModeratorStreaming(true);
      // Note: setIsModeratorStreaming doesn't restore streamingRoundNumber!
      // So isLatestRound is STILL false
      expect(recordRender('4-moderator-start')).toBeFalsy(); // Still unmounted!

      // This proves: completeStreaming before moderator start causes persistent unmount
      const flashOccurred = renderStates.some(r => !r.isLatestRound);
      expect(flashOccurred).toBeTruthy();
    });

    it('should NOT flash when streamingRoundNumber is preserved through transition', () => {
      const store = createChatStore();
      const state = getStoreState(store);
      const roundNumber = 0;

      function calculateIsLatestRound(
        roundNumber: number,
        streamingRoundNumber: number | null,
      ): boolean {
        const isStreamingRound = roundNumber === streamingRoundNumber;
        return isStreamingRound;
      }

      const renderStates: { step: string; isLatestRound: boolean }[] = [];

      function recordRender(step: string) {
        const s = getStoreState(store);
        const isLatestRound = calculateIsLatestRound(roundNumber, s.streamingRoundNumber);
        renderStates.push({ isLatestRound, step });
        return isLatestRound;
      }

      // Setup streaming
      state.setStreamingRoundNumber(roundNumber);
      state.setIsStreaming(true);
      expect(recordRender('1-streaming')).toBeTruthy();

      // Participants done - streamingRoundNumber still set
      state.setIsStreaming(false);
      expect(recordRender('2-streaming-false')).toBeTruthy();

      // Moderator starts - streamingRoundNumber still set
      state.setIsModeratorStreaming(true);
      expect(recordRender('3-moderator-start')).toBeTruthy();

      // Moderator streaming
      expect(recordRender('4-moderator-streaming')).toBeTruthy();

      // Moderator done - streamingRoundNumber still set
      state.setIsModeratorStreaming(false);
      expect(recordRender('5-moderator-done')).toBeTruthy();

      // Only NOW complete the streaming (clears streamingRoundNumber)
      state.completeStreaming();
      expect(recordRender('6-complete')).toBeFalsy(); // OK to be false now - round is done

      // Verify no flash during active phase (steps 1-5)
      const activePhase = renderStates.slice(0, 5);
      const flashDuringActive = activePhase.some(r => !r.isLatestRound);
      expect(flashDuringActive).toBeFalsy();
    });
  });

  describe('real World Scenario Simulation', () => {
    it('should simulate the exact bug scenario from user report', () => {
      /**
       * User report: "once last participant is finished, all of the placeholder
       * and response and moderator flash once before making the moderator start"
       *
       * This suggests:
       * 1. Last participant finishes
       * 2. Brief flash (all content disappears)
       * 3. Moderator starts
       *
       * The flash means shouldShowPendingCards became false momentarily.
       */
      const store = createChatStore();
      const state = getStoreState(store);
      const roundNumber = 0;

      // Track all state changes
      const stateHistory: {
        event: string;
        shouldShowPendingCards: boolean;
      }[] = [];

      function recordEvent(event: string) {
        const s = getStoreState(store);
        const shouldShow = calculateShouldShowPendingCards(
          false, // Round not complete yet
          s.isStreaming,
          s.isModeratorStreaming,
          roundNumber,
          s.streamingRoundNumber,
        );
        stateHistory.push({ event, shouldShowPendingCards: shouldShow });
      }

      // === ROUND START ===
      state.setStreamingRoundNumber(roundNumber);
      state.setWaitingToStartStreaming(true);
      recordEvent('round-start');

      // === STREAMING STARTS ===
      state.setIsStreaming(true);
      state.setWaitingToStartStreaming(false);
      recordEvent('streaming-start');

      // === PARTICIPANT 0 STREAMING ===
      state.setCurrentParticipantIndex(0);
      recordEvent('p0-streaming');

      // === PARTICIPANT 1 STREAMING ===
      state.setCurrentParticipantIndex(1);
      recordEvent('p1-streaming');

      // === LAST PARTICIPANT FINISHES ===
      // At this point, AI SDK sets isStreaming to false
      state.setIsStreaming(false);
      recordEvent('all-participants-done');

      // === CHECK FOR FLASH ===
      // This is the critical moment - if completeStreaming() was called here,
      // or if streamingRoundNumber was somehow cleared, we'd see a flash

      // === MODERATOR PREPARATION ===
      // Various checks and preparations happen here
      // If there's any delay before setIsModeratorStreaming(true),
      // we need streamingRoundNumber to keep isAnyStreamingActive true
      recordEvent('moderator-prep');

      // === MODERATOR STARTS ===
      state.setIsModeratorStreaming(true);
      recordEvent('moderator-start');

      // === MODERATOR STREAMING ===
      recordEvent('moderator-streaming');

      // === MODERATOR COMPLETES ===
      state.setIsModeratorStreaming(false);
      recordEvent('moderator-done');

      // === ROUND TRULY COMPLETE ===
      state.completeStreaming();
      recordEvent('round-complete');

      // Find any flashes during the active phase (before round-complete)
      const activePhase = stateHistory.slice(0, -1); // Exclude final 'round-complete'
      const flashEvents = activePhase.filter(e => !e.shouldShowPendingCards);

      // Log for debugging
      if (flashEvents.length > 0) {
        console.error('FLASH DETECTED at events:', flashEvents);
        console.error('Full history:', stateHistory);
      }

      // Assertion: No flashes should occur during active round
      expect(flashEvents).toHaveLength(0);
    });

    it('should detect flash if completeStreaming is called between participant end and moderator start', () => {
      const store = createChatStore();
      const state = getStoreState(store);
      const roundNumber = 0;

      const stateHistory: {
        event: string;
        shouldShowPendingCards: boolean;
      }[] = [];

      function recordEvent(event: string) {
        const s = getStoreState(store);
        const shouldShow = calculateShouldShowPendingCards(
          false,
          s.isStreaming,
          s.isModeratorStreaming,
          roundNumber,
          s.streamingRoundNumber,
        );
        stateHistory.push({ event, shouldShowPendingCards: shouldShow });
      }

      // Setup
      state.setStreamingRoundNumber(roundNumber);
      state.setIsStreaming(true);
      recordEvent('streaming');

      // Participants done
      state.setIsStreaming(false);
      recordEvent('participants-done');

      // ❌ BUG: completeStreaming called too early
      state.completeStreaming();
      recordEvent('early-complete-streaming');

      // Moderator starts (too late)
      state.setIsModeratorStreaming(true);
      recordEvent('moderator-start');

      // Find the flash
      const flashEvent = stateHistory.find(e => e.event === 'early-complete-streaming');
      expect(flashEvent?.shouldShowPendingCards).toBeFalsy(); // This IS the flash

      // Total flashes
      const flashCount = stateHistory.filter(e => !e.shouldShowPendingCards).length;
      expect(flashCount).toBe(1);
    });
  });
});
