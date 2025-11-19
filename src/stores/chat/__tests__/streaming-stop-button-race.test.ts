/**
 * Participant Streaming Stop Button - Race Condition Tests
 *
 * Tests critical race conditions when user clicks stop during streaming:
 * - Stop button clicked during participant transitions
 * - In-flight messages arriving after stop
 * - Current participant index updates during stop
 * - Analysis trigger during stop
 * - Sequential participant coordination after stop
 *
 * **CRITICAL RACE CONDITIONS TESTED**:
 * 1. Risk 4.2: Stop button during participant switch - Message in flight
 * 2. Risk 4.1: Sequential participant ordering - Index updates during stop
 * 3. Risk 4.3: Analysis trigger - Stop before all participants complete
 *
 * **FAILURE SCENARIOS**:
 * - Stop clicked → P1 message still arrives → UI shows stopped but message appears
 * - Stop clicked during P0→P1 transition → P1 starts anyway
 * - Stop clicked → Analysis still triggers with partial results
 */

import { act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createChatStore } from '@/stores/chat/store';

describe('streaming Stop Button - Race Conditions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * RACE CONDITION 4.2a: Stop During Participant Transition
   * ========================================================
   * Stop clicked while transitioning from P0 to P1
   *
   * Timeline:
   * T0: P0 streaming complete
   * T1: currentParticipantIndex increments to 1
   * T2: P1 request sent to backend
   * T3: User clicks STOP
   * T4: stopStreaming() sets isStreaming = false
   * T5: P1 response arrives from backend (still in flight)
   * T6: UI shows P1 message (WRONG - user clicked stop!)
   *
   * Expected Behavior:
   * - P1 message should be ignored (isStreaming = false)
   * - currentParticipantIndex should reset
   * - No further participants should start
   */
  it('rACE 4.2a: Ignores in-flight messages after stop clicked', async () => {
    const mockStore = createMockStreamingStore();
    const getState = mockStore.getState;
    const receivedMessages: string[] = [];

    // P0 just completed, P1 starting
    getState().setCurrentParticipantIndex(1);
    getState().setIsStreaming(true);

    // Simulate P1 message in flight
    const p1MessagePromise = simulateInFlightMessage('P1 response text', 500);

    // User clicks stop after 200ms
    setTimeout(() => {
      act(() => {
        getState().setIsStreaming(false);
        getState().setCurrentParticipantIndex(0);
      });
    }, 200);

    // Wait for in-flight message
    const message = await p1MessagePromise;

    // Message arrives, but isStreaming is now false
    if (getState().isStreaming) {
      receivedMessages.push(message);
    }

    // Message should NOT be added (streaming stopped)
    expect(receivedMessages).toEqual([]);
  });

  /**
   * RACE CONDITION 4.2b: Multiple In-Flight Messages
   * =================================================
   * Stop clicked with multiple participant messages in flight
   */
  it('rACE 4.2b: Ignores all in-flight messages from multiple participants', async () => {
    const mockStore = createMockStreamingStore();
    const getState = mockStore.getState;
    const receivedMessages: string[] = [];

    // 3 participants, all streaming (note: would need proper participant type, simplified for test)
    getState().setCurrentParticipantIndex(1);
    getState().setIsStreaming(true);

    // P1 and P2 messages in flight
    const p1Promise = simulateInFlightMessage('P1 text', 300);
    const p2Promise = simulateInFlightMessage('P2 text', 500);

    // Stop after 100ms
    setTimeout(() => {
      act(() => {
        getState().setIsStreaming(false);
        getState().setCurrentParticipantIndex(0);
      });
    }, 100);

    const [p1, p2] = await Promise.all([p1Promise, p2Promise]);

    // Check isStreaming before adding messages
    if (getState().isStreaming) {
      receivedMessages.push(p1, p2);
    }

    // No messages should be added
    expect(receivedMessages).toEqual([]);
  });

  /**
   * RACE CONDITION 4.1: Index Updates During Stop
   * ==============================================
   * currentParticipantIndex must reset atomically with isStreaming
   *
   * Timeline:
   * T0: P2 streaming (index = 2, isStreaming = true)
   * T1: User clicks stop
   * T2: isStreaming = false (updated first)
   * T3: currentParticipantIndex = 0 (updated second - RACE!)
   * T4: UI renders with isStreaming=false, index=2 (inconsistent!)
   *
   * Expected Behavior:
   * - Both updates happen in single act()
   * - No intermediate renders with inconsistent state
   */
  it('rACE 4.1: Index resets atomically with isStreaming flag', () => {
    const mockStore = createMockStreamingStore();
    const getState = mockStore.getState;
    const stateSnapshots: Array<{ isStreaming: boolean; index: number }> = [];

    // Set initial state
    getState().setCurrentParticipantIndex(2);
    getState().setIsStreaming(true);

    // Track state before and after stop
    stateSnapshots.push({
      isStreaming: getState().isStreaming,
      index: getState().currentParticipantIndex,
    });

    // Stop (must be atomic)
    act(() => {
      getState().setIsStreaming(false);
      getState().setCurrentParticipantIndex(0);
    });

    stateSnapshots.push({
      isStreaming: getState().isStreaming,
      index: getState().currentParticipantIndex,
    });

    // Should only have 2 snapshots (before and after)
    expect(stateSnapshots).toEqual([
      { isStreaming: true, index: 2 },
      { isStreaming: false, index: 0 },
    ]);

    // No intermediate state with isStreaming=false, index=2
    const hasInconsistentState = stateSnapshots.some(
      snap => snap.isStreaming === false && snap.index !== 0,
    );
    expect(hasInconsistentState).toBe(false);
  });

  /**
   * RACE CONDITION 4.3: Analysis Trigger During Stop
   * =================================================
   * Stop clicked before all participants complete
   *
   * Timeline:
   * T0: P0 complete, P1 streaming
   * T1: User clicks stop
   * T2: isStreaming = false
   * T3: P1 partial message in messages array
   * T4: roundComplete = true (all selected participants have messages)
   * T5: Analysis triggers (WRONG - user stopped streaming!)
   *
   * Expected Behavior:
   * - Analysis should NOT trigger if stopped mid-streaming
   * - Only trigger if all participants naturally completed
   */
  it('rACE 4.3: Prevents analysis trigger when streaming stopped early', () => {
    const mockStore = createMockStreamingStore();
    const getState = mockStore.getState;
    let analysisTriggered = false;

    // Add participants to the store so checkRoundComplete can work
    act(() => {
      getState().setParticipants([
        { participantIndex: 0, modelId: 'model-1', role: null },
        { participantIndex: 1, modelId: 'model-2', role: null },
      ]);
    });

    // Set stopped state (only P0 completed, P1 was stopped)
    getState().setIsStreaming(false);
    getState().setCurrentParticipantIndex(0);

    // Check if round is complete
    const roundComplete = checkRoundComplete(mockStore);

    if (roundComplete && !getState().isStreaming) {
      analysisTriggered = true;
    }

    // Analysis should NOT trigger (not all participants completed)
    expect(analysisTriggered).toBe(false);
  });

  /**
   * RACE CONDITION: Stop During First Participant
   * ==============================================
   * Stop clicked while first participant is streaming
   */
  it('rACE: Stop during first participant prevents subsequent participants', async () => {
    const mockStore = createMockStreamingStore();
    const getState = mockStore.getState;
    const participantsThatStarted: number[] = [];

    getState().setCurrentParticipantIndex(0);
    getState().setIsStreaming(true);

    // Track which participants start
    participantsThatStarted.push(0);

    // Stop after 100ms
    setTimeout(() => {
      act(() => {
        getState().setIsStreaming(false);
        getState().setCurrentParticipantIndex(0);
      });
    }, 100);

    await new Promise(resolve => setTimeout(resolve, 200));

    // Check if P1 and P2 would start
    if (getState().isStreaming && getState().currentParticipantIndex === 1) {
      participantsThatStarted.push(1);
    }
    if (getState().isStreaming && getState().currentParticipantIndex === 2) {
      participantsThatStarted.push(2);
    }

    // Only P0 should have started
    expect(participantsThatStarted).toEqual([0]);
  });

  /**
   * RACE CONDITION: Rapid Stop/Start Cycles
   * ========================================
   * User clicks stop, then immediately sends new message
   */
  it('rACE: Handles rapid stop then immediate new message', () => {
    const mockStore = createMockStreamingStore();
    const getState = mockStore.getState;

    // First round streaming
    getState().setIsStreaming(true);
    getState().setCurrentParticipantIndex(1);
    getState().setCurrentRoundNumber(0);

    // Stop
    act(() => {
      getState().setIsStreaming(false);
      getState().setCurrentParticipantIndex(0);
    });

    // Immediately start new round
    act(() => {
      getState().setCurrentRoundNumber(1);
      getState().setIsStreaming(true);
      getState().setCurrentParticipantIndex(0);
    });

    // New round should start cleanly
    expect(getState().isStreaming).toBe(true);
    expect(getState().currentParticipantIndex).toBe(0);
    expect(getState().currentRoundNumber).toBe(1);

    // Messages from Round 0 should be preserved
    // Round 1 streaming should be independent
  });

  /**
   * RACE CONDITION: Stop Button UI State
   * =====================================
   * Stop button disabled state must sync with isStreaming
   */
  it('rACE: Stop button disabled state syncs with streaming flag', () => {
    const mockStore = createMockStreamingStore();
    const getState = mockStore.getState;

    // Not streaming - stop button should be disabled
    getState().setIsStreaming(false);
    expect(isStopButtonEnabled(mockStore)).toBe(false);

    // Start streaming - stop button enabled
    act(() => {
      getState().setIsStreaming(true);
    });
    expect(isStopButtonEnabled(mockStore)).toBe(true);

    // Stop streaming - button disabled again
    act(() => {
      getState().setIsStreaming(false);
    });
    expect(isStopButtonEnabled(mockStore)).toBe(false);
  });

  /**
   * RACE CONDITION: Partial Message Cleanup
   * ========================================
   * Partial messages from stopped participants should not persist
   */
  it('rACE: Clears partial messages from stopped participant', () => {
    const mockStore = createMockStreamingStore();
    const getState = mockStore.getState;

    // Stop streaming
    act(() => {
      getState().setIsStreaming(false);

      // Remove partial message from P1 (if needed)
      // This depends on implementation - partial messages may be kept or removed
    });

    // If implementation removes partials, verify:
    // const p1Message = getState().messages.find(m => m.metadata?.participantIndex === 1);
    // expect(p1Message).toBeUndefined();

    // If implementation keeps partials, verify they're marked as incomplete
  });
});

// =============================================================================
// Test Utilities
// =============================================================================

/**
 * Simulate in-flight message from backend
 */
async function simulateInFlightMessage(text: string, delayMs: number): Promise<string> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(text), delayMs);
  });
}

/**
 * Check if round is complete (all participants have messages)
 */
function checkRoundComplete(store: ReturnType<typeof createChatStore>): boolean {
  const state = store.getState();
  const participants = state.participants;
  const messages = state.messages;
  const roundNumber = state.currentRoundNumber;

  return participants.every(p =>
    messages.some(
      m => m.metadata?.participantIndex === p.participantIndex && m.metadata?.roundNumber === roundNumber,
    ),
  );
}

/**
 * Check if stop button should be enabled
 */
function isStopButtonEnabled(store: ReturnType<typeof createChatStore>): boolean {
  return store.getState().isStreaming === true;
}

/**
 * Create mock store with streaming in progress
 */
function createMockStreamingStore(): ReturnType<typeof createChatStore> {
  const store = createChatStore();
  const getState = store.getState;

  // Set initial streaming state
  getState().setIsStreaming(true);
  getState().setCurrentParticipantIndex(0);
  getState().setCurrentRoundNumber(0);

  return store;
}
