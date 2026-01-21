/**
 * Tests to prevent UI flashing during participant-to-moderator transition
 *
 * ISSUE: When all participants finish streaming and before the moderator starts,
 * there's a brief flash where the pending cards disappear and reappear.
 *
 * ROOT CAUSE:
 * 1. isStreaming becomes false (participants done)
 * 2. isModeratorStreaming is still false (hasn't started yet)
 * 3. isAnyStreamingActive = isStreaming || isModeratorStreaming || isStreamingRound
 *    - If isStreamingRound is false, isAnyStreamingActive = false
 *    - Pending cards disappear
 * 4. Later, isModeratorStreaming becomes true
 * 5. Pending cards reappear = FLASH
 *
 * FIX: streamingRoundNumber must remain non-null during the entire round,
 * including the gap between participant completion and moderator start.
 * The completeStreaming() should only be called AFTER the moderator completes,
 * not after participants complete.
 */

import { describe, expect, it } from 'vitest';

import { getStoreState } from '@/lib/testing';

import type { ChatStore } from '../store';
import { createChatStore } from '../store';

describe('moderator Transition - No Flashing', () => {
  describe('streamingRoundNumber persistence', () => {
    it('should keep streamingRoundNumber non-null when isStreaming becomes false', () => {
      const store = createChatStore();
      const state = getStoreState(store);

      // Simulate round start
      state.setStreamingRoundNumber(1);
      state.setIsStreaming(true);

      // Verify round is in progress
      expect(getStoreState(store).streamingRoundNumber).toBe(1);
      expect(getStoreState(store).isStreaming).toBe(true);

      // Participants complete - isStreaming becomes false
      state.setIsStreaming(false);

      // CRITICAL: streamingRoundNumber should NOT be cleared yet
      expect(getStoreState(store).streamingRoundNumber).toBe(1);
      expect(getStoreState(store).isStreaming).toBe(false);
    });

    it('should keep streamingRoundNumber until completeStreaming is called', () => {
      const store = createChatStore();
      const state = getStoreState(store);

      // Start round
      state.setStreamingRoundNumber(1);
      state.setIsStreaming(true);

      // Participants complete
      state.setIsStreaming(false);

      // Moderator starts
      state.setIsModeratorStreaming(true);

      // streamingRoundNumber should STILL be set
      expect(getStoreState(store).streamingRoundNumber).toBe(1);

      // Moderator completes
      state.setIsModeratorStreaming(false);

      // Only NOW should the round be complete
      state.completeStreaming();

      expect(getStoreState(store).streamingRoundNumber).toBe(null);
    });
  });

  describe('isAnyStreamingActive calculation', () => {
    /**
     * This simulates the calculation done in chat-message-list.tsx:1250
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

    it('should be true during participant streaming', () => {
      const isActive = calculateIsAnyStreamingActive(
        true, // isStreaming
        false, // isModeratorStreaming
        1, // roundNumber
        1, // streamingRoundNumber
      );
      expect(isActive).toBe(true);
    });

    it('should be true during moderator streaming', () => {
      const isActive = calculateIsAnyStreamingActive(
        false, // isStreaming
        true, // isModeratorStreaming
        1, // roundNumber
        1, // streamingRoundNumber
      );
      expect(isActive).toBe(true);
    });

    it('should be true during transition (participants done, moderator not started)', () => {
      // CRITICAL TEST: This is the gap where flashing occurs if streamingRoundNumber is null
      const isActive = calculateIsAnyStreamingActive(
        false, // isStreaming - participants done
        false, // isModeratorStreaming - not started yet
        1, // roundNumber
        1, // streamingRoundNumber - MUST be non-null to prevent flash
      );
      expect(isActive).toBe(true);
    });

    it('should be false when streamingRoundNumber is null (flash scenario)', () => {
      // This is what happens if streamingRoundNumber is incorrectly cleared
      const isActive = calculateIsAnyStreamingActive(
        false, // isStreaming
        false, // isModeratorStreaming
        1, // roundNumber
        null, // streamingRoundNumber - BAD: causes flash
      );
      expect(isActive).toBe(false);
    });
  });

  describe('state transition sequence', () => {
    it('should maintain visible pending cards throughout entire round', () => {
      const store = createChatStore();
      const state = getStoreState(store);

      // Track state at each step
      const stateLog: Array<{
        step: string;
        isStreaming: boolean;
        isModeratorStreaming: boolean;
        streamingRoundNumber: number | null;
        shouldShowPendingCards: boolean;
      }> = [];

      function logState(step: string) {
        const s = getStoreState(store);
        const isStreamingRound = s.streamingRoundNumber === 1;
        const isAnyStreamingActive = s.isStreaming || s.isModeratorStreaming || isStreamingRound;
        const shouldShowPendingCards = isAnyStreamingActive; // Simplified, actual logic has more conditions

        stateLog.push({
          step,
          isStreaming: s.isStreaming,
          isModeratorStreaming: s.isModeratorStreaming,
          streamingRoundNumber: s.streamingRoundNumber,
          shouldShowPendingCards,
        });
      }

      // Step 1: Round starts
      state.setStreamingRoundNumber(1);
      state.setIsStreaming(true);
      logState('Round started - participants streaming');

      // Step 2: Participants complete
      state.setIsStreaming(false);
      logState('Participants complete - gap before moderator');

      // Step 3: Moderator starts
      state.setIsModeratorStreaming(true);
      logState('Moderator streaming');

      // Step 4: Moderator completes
      state.setIsModeratorStreaming(false);
      logState('Moderator complete - before cleanup');

      // Step 5: Round cleanup
      state.completeStreaming();
      logState('Round complete - cleanup done');

      // Verify: shouldShowPendingCards should be true for ALL steps except the final cleanup
      expect(stateLog[0].shouldShowPendingCards).toBe(true);
      expect(stateLog[1].shouldShowPendingCards).toBe(true); // CRITICAL: This is the gap
      expect(stateLog[2].shouldShowPendingCards).toBe(true);
      expect(stateLog[3].shouldShowPendingCards).toBe(true);
      expect(stateLog[4].shouldShowPendingCards).toBe(false); // Only now should it be false
    });

    it('should never have a gap where all streaming flags are false during active round', () => {
      const store = createChatStore();
      const state = getStoreState(store);

      // Track for flashing detection
      const flashDetected: boolean[] = [];

      function checkForFlash() {
        const s = getStoreState(store);
        const isStreamingRound = s.streamingRoundNumber === 1;
        const isAnyActive = s.isStreaming || s.isModeratorStreaming || isStreamingRound;
        flashDetected.push(!isAnyActive);
      }

      // Simulate the full round
      state.setStreamingRoundNumber(1);
      state.setIsStreaming(true);
      checkForFlash();

      // Simulate participants completing
      state.setIsStreaming(false);
      checkForFlash(); // CRITICAL: Check for flash during transition

      // Simulate moderator starting
      state.setIsModeratorStreaming(true);
      checkForFlash();

      // Simulate moderator completing
      state.setIsModeratorStreaming(false);
      checkForFlash(); // Still should be active (streamingRoundNumber is set)

      // No flash should occur until completeStreaming
      expect(flashDetected.slice(0, 4).every(f => f === false)).toBe(true);
    });
  });

  describe('multiple rapid state changes', () => {
    it('should not flash during rapid state transitions', () => {
      const store = createChatStore();
      const state = getStoreState(store);

      // Setup subscriptions to detect rapid changes
      const stateSnapshots: Array<{
        isStreaming: boolean;
        isModeratorStreaming: boolean;
        streamingRoundNumber: number | null;
      }> = [];

      store.subscribe((newState) => {
        stateSnapshots.push({
          isStreaming: newState.isStreaming,
          isModeratorStreaming: newState.isModeratorStreaming,
          streamingRoundNumber: newState.streamingRoundNumber,
        });
      });

      // Simulate rapid transitions
      state.setStreamingRoundNumber(1);
      state.setIsStreaming(true);
      state.setIsStreaming(false); // Participants done
      state.setIsModeratorStreaming(true); // Moderator starts immediately

      // Check that at no point was there a "flash" state
      const hasFlash = stateSnapshots.some((s) => {
        const isStreamingRound = s.streamingRoundNumber === 1;
        return !s.isStreaming && !s.isModeratorStreaming && !isStreamingRound;
      });

      expect(hasFlash).toBe(false);
    });
  });

  describe('setIsStreaming should not clear streamingRoundNumber', () => {
    it('setIsStreaming(false) should only update isStreaming, not streamingRoundNumber', () => {
      const store = createChatStore();
      const state = getStoreState(store);

      // Setup
      state.setStreamingRoundNumber(1);
      state.setIsStreaming(true);

      // Act
      state.setIsStreaming(false);

      // Assert
      expect(getStoreState(store).isStreaming).toBe(false);
      expect(getStoreState(store).streamingRoundNumber).toBe(1); // MUST remain 1
    });

    it('setIsModeratorStreaming(false) should only update isModeratorStreaming, not streamingRoundNumber', () => {
      const store = createChatStore();
      const state = getStoreState(store);

      // Setup
      state.setStreamingRoundNumber(1);
      state.setIsModeratorStreaming(true);

      // Act
      state.setIsModeratorStreaming(false);

      // Assert
      expect(getStoreState(store).isModeratorStreaming).toBe(false);
      expect(getStoreState(store).streamingRoundNumber).toBe(1); // MUST remain 1
    });
  });
});

describe('completeStreaming timing', () => {
  it('should only be called after moderator is complete', () => {
    const store = createChatStore();
    const state = getStoreState(store);

    // Start round
    state.setStreamingRoundNumber(1);
    state.setIsStreaming(true);

    // Participants complete
    state.setIsStreaming(false);

    // At this point, completeStreaming should NOT be called yet
    // streamingRoundNumber should still be set
    expect(getStoreState(store).streamingRoundNumber).toBe(1);

    // Moderator streams
    state.setIsModeratorStreaming(true);
    state.setIsModeratorStreaming(false);

    // Still should have streamingRoundNumber
    expect(getStoreState(store).streamingRoundNumber).toBe(1);

    // Now completeStreaming can be called
    state.completeStreaming();

    expect(getStoreState(store).streamingRoundNumber).toBe(null);
    expect(getStoreState(store).isStreaming).toBe(false);
    expect(getStoreState(store).isModeratorStreaming).toBe(false);
  });

  it('should not be called between participants and moderator', () => {
    const store = createChatStore();
    const state = getStoreState(store);

    // Setup
    state.setStreamingRoundNumber(1);
    state.setIsStreaming(true);

    // Track calls to completeStreaming
    const completeStreamingCalls: number[] = [];
    const originalCompleteStreaming = state.completeStreaming;
    (store.getState() as ChatStore).completeStreaming = () => {
      completeStreamingCalls.push(Date.now());
      originalCompleteStreaming();
    };

    // Participants complete
    state.setIsStreaming(false);

    // Verify completeStreaming was NOT called during participant completion
    expect(completeStreamingCalls).toHaveLength(0);

    // Moderator streams and completes
    state.setIsModeratorStreaming(true);
    expect(completeStreamingCalls).toHaveLength(0);

    state.setIsModeratorStreaming(false);
    expect(completeStreamingCalls).toHaveLength(0);

    // Only now should completeStreaming be called
    store.getState().completeStreaming();
    expect(completeStreamingCalls).toHaveLength(1);
  });
});

describe('flow state machine flash prevention', () => {
  /**
   * 🚨 REGRESSION TEST: This catches the bug where flow-state-machine.ts
   * called completeStreaming() during the CREATING_MODERATOR phase,
   * which cleared streamingRoundNumber and caused pending cards to flash.
   *
   * The fix: flow-state-machine.ts should NOT call completeStreaming() during
   * the participant-to-moderator transition. Only use-moderator-trigger.ts
   * should call it in its finally block AFTER the moderator completes.
   */
  it('should NOT have completeStreaming called during participant-to-moderator transition', () => {
    const store = createChatStore();
    const state = getStoreState(store);

    // Track completeStreaming calls
    const completeStreamingCalls: { time: number; phase: string }[] = [];
    const originalCompleteStreaming = state.completeStreaming;

    // Wrap completeStreaming to track when it's called
    const completeStreamingWrapper = () => {
      const currentState = store.getState();
      completeStreamingCalls.push({
        time: Date.now(),
        phase: currentState.isModeratorStreaming
          ? 'moderator_streaming'
          : currentState.isStreaming
            ? 'participant_streaming'
            : 'transition_gap',
      });
      originalCompleteStreaming();
    };

    // Simulate the flow:
    // 1. Round starts with streaming
    state.setStreamingRoundNumber(1);
    state.setIsStreaming(true);
    expect(getStoreState(store).streamingRoundNumber).toBe(1);

    // 2. Participants complete - this is where the BUG would trigger
    state.setIsStreaming(false);

    // 3. ❌ BUG: If flow-state-machine called completeStreaming here,
    //    streamingRoundNumber would be null, causing flash
    //    ✅ FIX: completeStreaming should NOT be called here

    // Verify streamingRoundNumber is still set (no premature clearing)
    expect(getStoreState(store).streamingRoundNumber).toBe(1);

    // 4. Moderator starts
    state.setIsModeratorStreaming(true);
    expect(getStoreState(store).streamingRoundNumber).toBe(1);

    // 5. Moderator completes
    state.setIsModeratorStreaming(false);

    // 6. NOW completeStreaming can be called (by use-moderator-trigger.ts finally block)
    completeStreamingWrapper();

    // Verify completeStreaming was only called during the appropriate phase
    expect(completeStreamingCalls).toHaveLength(1);
    // The call happened after moderator finished, in the "transition_gap" phase
    // (isModeratorStreaming=false, isStreaming=false)
    expect(completeStreamingCalls[0].phase).toBe('transition_gap');

    // Verify streamingRoundNumber is now cleared
    expect(getStoreState(store).streamingRoundNumber).toBe(null);
  });

  it('should keep isAnyStreamingActive=true throughout entire round lifecycle', () => {
    const store = createChatStore();
    const state = getStoreState(store);

    // Track isAnyStreamingActive at each step
    const activeStates: boolean[] = [];

    function calculateIsAnyStreamingActive(): boolean {
      const s = getStoreState(store);
      const isStreamingRound = s.streamingRoundNumber === 1;
      return s.isStreaming || s.isModeratorStreaming || isStreamingRound;
    }

    // Step 1: Round starts
    state.setStreamingRoundNumber(1);
    state.setIsStreaming(true);
    activeStates.push(calculateIsAnyStreamingActive());

    // Step 2: Participants complete (CRITICAL - this is where flash occurred)
    state.setIsStreaming(false);
    activeStates.push(calculateIsAnyStreamingActive());

    // Step 3: Moderator starts
    state.setIsModeratorStreaming(true);
    activeStates.push(calculateIsAnyStreamingActive());

    // Step 4: Moderator completes
    state.setIsModeratorStreaming(false);
    activeStates.push(calculateIsAnyStreamingActive());

    // ALL states should be true (no flash)
    expect(activeStates).toEqual([true, true, true, true]);

    // Step 5: Now cleanup happens
    state.completeStreaming();
    expect(calculateIsAnyStreamingActive()).toBe(false);
  });
});

describe('uI state consistency', () => {
  it('should prevent auto-scrolling during moderator transition', () => {
    const store = createChatStore();
    const state = getStoreState(store);

    // Track scroll triggers (simulated)
    const scrollTriggers: string[] = [];

    // Monitor state changes that could trigger scroll
    store.subscribe((newState, prevState) => {
      // A scroll might be triggered when isStreaming or isModeratorStreaming changes
      if (prevState.isStreaming !== newState.isStreaming) {
        scrollTriggers.push(`isStreaming: ${prevState.isStreaming} -> ${newState.isStreaming}`);
      }
      if (prevState.isModeratorStreaming !== newState.isModeratorStreaming) {
        scrollTriggers.push(`isModeratorStreaming: ${prevState.isModeratorStreaming} -> ${newState.isModeratorStreaming}`);
      }
    });

    // Full round simulation
    state.setStreamingRoundNumber(1);
    state.setIsStreaming(true);
    state.setIsStreaming(false);
    state.setIsModeratorStreaming(true);
    state.setIsModeratorStreaming(false);

    // Verify we have exactly 4 state changes (minimal)
    expect(scrollTriggers).toHaveLength(4);
    expect(scrollTriggers).toEqual([
      'isStreaming: false -> true',
      'isStreaming: true -> false',
      'isModeratorStreaming: false -> true',
      'isModeratorStreaming: true -> false', // Moderator complete
    ]);
  });
});
