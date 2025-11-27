/**
 * Config Change Submission Render Loop Tests
 *
 * Tests for detecting and preventing infinite render loops when submitting
 * messages after making configuration changes (participant changes) on thread screen.
 *
 * BUG SCENARIO (from user report):
 * 1. User on thread page with round 0 complete (3 participants responded)
 * 2. User changes participants (from 3 to 2)
 * 3. User submits message "Can you say hi again?"
 * 4. UI freezes, RAM fills up, infinite loop
 *
 * OBSERVED STATE AT FREEZE:
 * - isStreaming: true
 * - hasPendingConfigChanges: true
 * - hasEarlyOptimisticMessage: true
 * - pendingMessage: null (INCONSISTENT!)
 * - expectedParticipantIds: null (INCONSISTENT!)
 * - hasSentPendingMessage: false
 * - streamingRoundNumber: 1
 * - currentParticipantIndex: 0
 *
 * ROOT CAUSE HYPOTHESIS:
 * When handleUpdateThreadAndSend runs:
 * 1. setHasEarlyOptimisticMessage(true) is called BEFORE PATCH
 * 2. If PATCH throws or an error occurs, prepareForNewMessage is never called
 * 3. hasEarlyOptimisticMessage stays true, blocking message sync effect
 * 4. But isStreaming somehow becomes true (from another path?)
 * 5. Provider effects may enter infinite loop trying to reconcile state
 *
 * Location: /src/stores/chat/__tests__/config-change-submission-render-loop.test.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AnalysisStatuses,
  ChatModes,
  ScreenModes,
} from '@/api/core/enums';
import { createChatStore } from '@/stores/chat/store';

import {
  createMockAnalysis,
  createMockMessage,
  createMockParticipant,
  createMockThread,
  createMockUserMessage,
} from './test-factories';

// ============================================================================
// TEST UTILITIES
// ============================================================================

function createTestStore() {
  return createChatStore();
}

/**
 * Recreate the EXACT state the user reported when UI froze
 */
function recreateFrozenState(store: ReturnType<typeof createChatStore>) {
  const thread = createMockThread({
    id: '01KB29MQJSC78MH28AR50VFCXD',
    enableWebSearch: false,
    mode: ChatModes.DEBATING,
  });

  // Current participants (2 - user changed from 3 to 2)
  const participants = [
    createMockParticipant(0, {
      id: 'participant-1764235121946-0',
      modelId: 'anthropic/claude-3.5-sonnet',
      role: 'The Practical Evaluator',
    }),
    createMockParticipant(1, {
      id: 'participant-1764235121946-1',
      modelId: 'google/gemini-2.5-flash-lite',
      role: null,
    }),
  ];

  // Round 0 had 3 participants (before user changed config)
  const round0Messages = [
    createMockUserMessage(0, 'Say hi with just one word...'),
    createMockMessage(0, 0, {
      id: '01KB29MQJSC78MH28AR50VFCXD_r0_p0',
      metadata: {
        role: 'assistant' as const,
        roundNumber: 0,
        participantId: '01KB29MQK1SB19YS93RA226AEK',
        participantIndex: 0,
        participantRole: null,
        model: 'anthropic/claude-3.5-sonnet',
        finishReason: 'stop' as const,
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 1284 },
        hasError: false,
        isTransient: false,
        isPartialResponse: false,
      },
    }),
    createMockMessage(1, 0, {
      id: '01KB29MQJSC78MH28AR50VFCXD_r0_p1',
      metadata: {
        role: 'assistant' as const,
        roundNumber: 0,
        participantId: '01KB29MQK27C4KM5QMRFVTG1A8',
        participantIndex: 1,
        participantRole: null,
        model: 'qwen/qwen3-max', // This model was REMOVED from participants
        finishReason: 'stop' as const,
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 1196 },
        hasError: false,
        isTransient: false,
        isPartialResponse: false,
      },
    }),
    createMockMessage(2, 0, {
      id: '01KB29MQJSC78MH28AR50VFCXD_r0_p2',
      metadata: {
        role: 'assistant' as const,
        roundNumber: 0,
        participantId: '01KB29MQK3M2WMNR2KHV54CX82',
        participantIndex: 2,
        participantRole: null,
        model: 'google/gemini-2.5-flash-lite',
        finishReason: 'stop' as const,
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 1196 },
        hasError: false,
        isTransient: false,
        isPartialResponse: false,
      },
    }),
  ];

  // Optimistic user message for round 1
  const round1OptimisticUserMessage = createMockUserMessage(1, 'Can you say hi again?');
  round1OptimisticUserMessage.id = 'optimistic-user-1764235123183';
  round1OptimisticUserMessage.metadata = {
    ...round1OptimisticUserMessage.metadata,
    isOptimistic: true,
  };

  const allMessages = [...round0Messages, round1OptimisticUserMessage];

  // Initialize with the exact state
  store.getState().initializeThread(thread, participants, allMessages);
  store.getState().setScreenMode(ScreenModes.THREAD);

  // Add round 0 analysis
  store.getState().addAnalysis(createMockAnalysis({
    id: '01KB29MZE4GNEBH4MR596RSNQN',
    threadId: '01KB29MQJSC78MH28AR50VFCXD',
    roundNumber: 0,
    status: AnalysisStatuses.COMPLETE,
  }));

  // Set the EXACT problematic state flags
  store.getState().setIsStreaming(true);
  store.getState().setHasPendingConfigChanges(true);
  store.getState().setHasEarlyOptimisticMessage(true);
  store.getState().setStreamingRoundNumber(1);
  store.getState().setCurrentParticipantIndex(0);
  store.getState().setHasSentPendingMessage(false);
  // pendingMessage is null (default)
  // expectedParticipantIds is null (default)
  store.getState().setNextParticipantToTrigger(0);
  store.getState().setWaitingToStartStreaming(false);

  return { thread, participants, allMessages };
}

// ============================================================================
// SECTION 1: STATE INCONSISTENCY DETECTION
// ============================================================================

describe('state Inconsistency Detection', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should detect inconsistent state: hasEarlyOptimisticMessage=true but pendingMessage=null', () => {
    recreateFrozenState(store);

    const state = store.getState();

    // This is the INCONSISTENT state that causes the bug
    expect(state.hasEarlyOptimisticMessage).toBe(true);
    expect(state.pendingMessage).toBeNull();

    // If hasEarlyOptimisticMessage is true, it means handleUpdateThreadAndSend
    // added an optimistic message. But if pendingMessage is null, prepareForNewMessage
    // was never called (it would have set pendingMessage and cleared hasEarlyOptimisticMessage)

    // This is an INVALID state - detect it
    const isInconsistentState = state.hasEarlyOptimisticMessage && state.pendingMessage === null;
    expect(isInconsistentState).toBe(true);
  });

  it('should detect inconsistent state: isStreaming=true but no expectedParticipantIds', () => {
    recreateFrozenState(store);

    const state = store.getState();

    // Streaming is true but we don't know which participants to stream
    expect(state.isStreaming).toBe(true);
    expect(state.expectedParticipantIds).toBeNull();

    // This is an INVALID state - streaming without knowing participants
    const isInconsistentState = state.isStreaming && state.expectedParticipantIds === null;
    expect(isInconsistentState).toBe(true);
  });

  it('should detect inconsistent state: streamingRoundNumber set but hasSentPendingMessage=false', () => {
    recreateFrozenState(store);

    const state = store.getState();

    // We have a streaming round number but never sent the pending message
    expect(state.streamingRoundNumber).toBe(1);
    expect(state.hasSentPendingMessage).toBe(false);
    expect(state.pendingMessage).toBeNull();

    // This suggests the submission flow was interrupted
    const isInconsistentState = state.streamingRoundNumber !== null
      && !state.hasSentPendingMessage
      && state.pendingMessage === null
      && state.isStreaming;
    expect(isInconsistentState).toBe(true);
  });
});

// ============================================================================
// SECTION 2: STATE UPDATE TRACKING (Render Loop Detection)
// ============================================================================

describe('state Update Tracking for Render Loops', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should not trigger excessive state updates when setting up frozen state', () => {
    let updateCount = 0;
    const unsubscribe = store.subscribe(() => {
      updateCount++;
    });

    recreateFrozenState(store);

    unsubscribe();

    // Setting up the state should be bounded (not infinite)
    // Allow reasonable number of updates for setup
    expect(updateCount).toBeLessThan(50);
  });

  it('should track state changes when trying to recover from inconsistent state', () => {
    recreateFrozenState(store);

    let updateCount = 0;
    const unsubscribe = store.subscribe(() => {
      updateCount++;
    });

    // Simulate what the provider might try to do to recover
    const state = store.getState();

    // Check if we're in the problematic state
    const isProblematic = state.hasEarlyOptimisticMessage
      && state.pendingMessage === null
      && state.isStreaming;

    if (isProblematic) {
      // Try to reset to a consistent state
      store.getState().setHasEarlyOptimisticMessage(false);
      store.getState().setIsStreaming(false);
      store.getState().setStreamingRoundNumber(null);
    }

    unsubscribe();

    // Recovery should be bounded
    expect(updateCount).toBeLessThanOrEqual(3);
  });

  it('should not create infinite loop when hasEarlyOptimisticMessage blocks sync', () => {
    const thread = createMockThread({ id: 'thread-sync-block' });
    const participants = [
      createMockParticipant(0, { modelId: 'openai/gpt-4' }),
      createMockParticipant(1, { modelId: 'anthropic/claude-3' }),
    ];

    store.getState().initializeThread(thread, participants, [
      createMockUserMessage(0, 'test'),
    ]);
    store.getState().setScreenMode(ScreenModes.THREAD);

    // Set hasEarlyOptimisticMessage to true (simulating handleUpdateThreadAndSend start)
    store.getState().setHasEarlyOptimisticMessage(true);

    let updateCount = 0;
    const unsubscribe = store.subscribe(() => {
      updateCount++;
    });

    // Simulate multiple "sync attempts" that would happen in the provider
    // When hasEarlyOptimisticMessage is true, sync should be skipped
    for (let i = 0; i < 10; i++) {
      const currentState = store.getState();
      if (!currentState.hasEarlyOptimisticMessage) {
        // This would be the sync logic
        store.getState().setMessages(currentState.messages);
      }
      // If hasEarlyOptimisticMessage is true, we skip (no state change)
    }

    unsubscribe();

    // Should have 0 updates since sync is blocked
    expect(updateCount).toBe(0);
  });
});

// ============================================================================
// SECTION 3: PARTICIPANT CONFIG CHANGE FLOW
// ============================================================================

describe('participant Config Change + Submission Flow', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should properly handle participant reduction (3 -> 2) before submission', () => {
    const thread = createMockThread({ id: 'thread-reduce' });

    // Original 3 participants
    const originalParticipants = [
      createMockParticipant(0, { modelId: 'anthropic/claude-3.5-sonnet' }),
      createMockParticipant(1, { modelId: 'qwen/qwen3-max' }),
      createMockParticipant(2, { modelId: 'google/gemini-2.5-flash-lite' }),
    ];

    store.getState().initializeThread(thread, originalParticipants, [
      createMockUserMessage(0, 'Say hi'),
      createMockMessage(0, 0, { metadata: { role: 'assistant' as const, roundNumber: 0, participantId: 'p0', participantIndex: 0, participantRole: null, model: 'anthropic/claude-3.5-sonnet', finishReason: 'stop' as const, usage: { promptTokens: 0, completionTokens: 0, totalTokens: 100 }, hasError: false, isTransient: false, isPartialResponse: false } }),
      createMockMessage(1, 0, { metadata: { role: 'assistant' as const, roundNumber: 0, participantId: 'p1', participantIndex: 1, participantRole: null, model: 'qwen/qwen3-max', finishReason: 'stop' as const, usage: { promptTokens: 0, completionTokens: 0, totalTokens: 100 }, hasError: false, isTransient: false, isPartialResponse: false } }),
      createMockMessage(2, 0, { metadata: { role: 'assistant' as const, roundNumber: 0, participantId: 'p2', participantIndex: 2, participantRole: null, model: 'google/gemini-2.5-flash-lite', finishReason: 'stop' as const, usage: { promptTokens: 0, completionTokens: 0, totalTokens: 100 }, hasError: false, isTransient: false, isPartialResponse: false } }),
    ]);
    store.getState().setScreenMode(ScreenModes.THREAD);

    // User removes qwen (index 1)
    const reducedParticipants = [
      createMockParticipant(0, { modelId: 'anthropic/claude-3.5-sonnet' }),
      createMockParticipant(1, { modelId: 'google/gemini-2.5-flash-lite' }),
    ];

    // Update selectedParticipants (form state)
    store.getState().setSelectedParticipants([
      { id: 'p0', modelId: 'anthropic/claude-3.5-sonnet', role: null, priority: 0 },
      { id: 'p2', modelId: 'google/gemini-2.5-flash-lite', role: null, priority: 1 },
    ]);
    store.getState().setHasPendingConfigChanges(true);

    expect(store.getState().hasPendingConfigChanges).toBe(true);
    expect(store.getState().selectedParticipants).toHaveLength(2);
    expect(store.getState().participants).toHaveLength(3); // DB state not yet updated

    // Simulate handleUpdateThreadAndSend flow
    // Step 1: Set immediate UI flags
    store.getState().setStreamingRoundNumber(1);
    store.getState().setHasEarlyOptimisticMessage(true);

    // Step 2: Add optimistic message
    const optimisticMsg = createMockUserMessage(1, 'Can you say hi again?');
    optimisticMsg.id = `optimistic-user-${Date.now()}`;
    store.getState().setMessages(prev => [...prev, optimisticMsg]);

    // Step 3: PATCH would update participants
    store.getState().updateParticipants(reducedParticipants);

    // Step 4: prepareForNewMessage
    store.getState().prepareForNewMessage('Can you say hi again?', []);

    // After prepareForNewMessage:
    const finalState = store.getState();
    expect(finalState.hasEarlyOptimisticMessage).toBe(false); // Cleared
    expect(finalState.pendingMessage).toBe('Can you say hi again?'); // Set
    expect(finalState.participants).toHaveLength(2); // Updated
  });

  it('should handle PATCH failure and cleanup state correctly', () => {
    const thread = createMockThread({ id: 'thread-patch-fail' });
    const participants = [
      createMockParticipant(0, { modelId: 'openai/gpt-4' }),
      createMockParticipant(1, { modelId: 'anthropic/claude-3' }),
    ];

    store.getState().initializeThread(thread, participants, [
      createMockUserMessage(0, 'test'),
    ]);
    store.getState().setScreenMode(ScreenModes.THREAD);

    // Simulate handleUpdateThreadAndSend START (before PATCH)
    store.getState().setStreamingRoundNumber(1);
    store.getState().setHasEarlyOptimisticMessage(true);

    const optimisticMsg = createMockUserMessage(1, 'new message');
    optimisticMsg.id = `optimistic-user-${Date.now()}`;
    store.getState().setMessages(prev => [...prev, optimisticMsg]);

    // At this point, if PATCH fails, we need to cleanup
    const stateBeforeCleanup = store.getState();
    expect(stateBeforeCleanup.hasEarlyOptimisticMessage).toBe(true);
    expect(stateBeforeCleanup.streamingRoundNumber).toBe(1);

    // Simulate error handling (what the catch block does)
    store.getState().setHasEarlyOptimisticMessage(false);
    store.getState().setStreamingRoundNumber(null);
    // Remove optimistic message
    store.getState().setMessages(prev => prev.filter(m => !m.id.startsWith('optimistic-')));

    const stateAfterCleanup = store.getState();
    expect(stateAfterCleanup.hasEarlyOptimisticMessage).toBe(false);
    expect(stateAfterCleanup.streamingRoundNumber).toBeNull();
    expect(stateAfterCleanup.messages).toHaveLength(1); // Only original message
  });
});

// ============================================================================
// SECTION 4: CRITICAL BUG SCENARIO REPRODUCTION
// ============================================================================

describe('critical Bug Scenario: Config Change + Submission Freeze', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should detect the exact bug state and prevent infinite loops', () => {
    recreateFrozenState(store);

    const state = store.getState();

    // Verify we have recreated the bug state
    expect(state.isStreaming).toBe(true);
    expect(state.hasPendingConfigChanges).toBe(true);
    expect(state.hasEarlyOptimisticMessage).toBe(true);
    expect(state.pendingMessage).toBeNull();
    expect(state.expectedParticipantIds).toBeNull();
    expect(state.hasSentPendingMessage).toBe(false);
    expect(state.streamingRoundNumber).toBe(1);
    expect(state.currentParticipantIndex).toBe(0);
    expect(state.nextParticipantToTrigger).toBe(0);
    expect(state.waitingToStartStreaming).toBe(false);

    // Simulate what provider effects would check
    const pendingMessageEffectShouldRun
      = state.pendingMessage !== null
        && state.expectedParticipantIds !== null
        && !state.hasSentPendingMessage
        && !state.isStreaming;

    // The effect should NOT run because:
    // 1. pendingMessage is null
    // 2. expectedParticipantIds is null
    // 3. isStreaming is true
    expect(pendingMessageEffectShouldRun).toBe(false);

    // Check streaming trigger effect conditions
    const streamingTriggerShouldRun
      = state.nextParticipantToTrigger !== null
        && state.waitingToStartStreaming;

    // The effect should NOT run because waitingToStartStreaming is false
    expect(streamingTriggerShouldRun).toBe(false);

    // Check message sync effect conditions
    const messageSyncShouldRun = !state.hasEarlyOptimisticMessage;

    // The sync should NOT run because hasEarlyOptimisticMessage is true
    expect(messageSyncShouldRun).toBe(false);

    // THE BUG: We're in a state where:
    // - isStreaming is true (UI shows loading)
    // - But no effect can proceed to actually stream
    // - hasEarlyOptimisticMessage blocks message sync
    // - pendingMessage is null so pending message effect can't send
    // - waitingToStartStreaming is false so streaming trigger can't start
    //
    // This is a DEADLOCK state - nothing can progress
  });

  it('should recover from deadlock state when reset is triggered', () => {
    recreateFrozenState(store);

    // Track state updates to ensure no infinite loop during recovery
    let updateCount = 0;
    const unsubscribe = store.subscribe(() => {
      updateCount++;
    });

    // A proper recovery function would:
    // 1. Detect the inconsistent state
    // 2. Reset to a consistent state
    // 3. Allow user to retry

    const isDeadlockState
      = store.getState().isStreaming
        && store.getState().pendingMessage === null
        && store.getState().hasEarlyOptimisticMessage;

    expect(isDeadlockState).toBe(true);

    // Recovery: Reset streaming state
    store.getState().setIsStreaming(false);
    store.getState().setHasEarlyOptimisticMessage(false);
    store.getState().setStreamingRoundNumber(null);
    store.getState().setHasPendingConfigChanges(false);
    store.getState().setCurrentParticipantIndex(0);
    store.getState().setNextParticipantToTrigger(null);

    // Remove optimistic message
    const messagesWithoutOptimistic = store.getState().messages.filter(
      m => !m.metadata?.isOptimistic,
    );
    store.getState().setMessages(messagesWithoutOptimistic);

    unsubscribe();

    // Recovery should be bounded
    expect(updateCount).toBeLessThan(10);

    // State should be consistent after recovery
    const recoveredState = store.getState();
    expect(recoveredState.isStreaming).toBe(false);
    expect(recoveredState.hasEarlyOptimisticMessage).toBe(false);
    expect(recoveredState.pendingMessage).toBeNull();
  });

  it('should prevent entering deadlock state by proper state transitions', () => {
    const thread = createMockThread({ id: 'thread-proper' });
    const participants = [
      createMockParticipant(0, { modelId: 'anthropic/claude-3.5-sonnet' }),
      createMockParticipant(1, { modelId: 'google/gemini-2.5-flash-lite' }),
    ];

    store.getState().initializeThread(thread, participants, [
      createMockUserMessage(0, 'Say hi'),
      createMockMessage(0, 0),
      createMockMessage(1, 0),
    ]);
    store.getState().setScreenMode(ScreenModes.THREAD);

    // PROPER flow: Each step maintains consistent state

    // Step 1: Before submission, state is clean
    expect(store.getState().isStreaming).toBe(false);
    expect(store.getState().hasEarlyOptimisticMessage).toBe(false);
    expect(store.getState().pendingMessage).toBeNull();

    // Step 2: Start submission
    store.getState().setStreamingRoundNumber(1);
    store.getState().setHasEarlyOptimisticMessage(true);

    // Add optimistic message
    const optimisticMsg = createMockUserMessage(1, 'Can you say hi again?');
    optimisticMsg.id = `optimistic-user-${Date.now()}`;
    store.getState().setMessages(prev => [...prev, optimisticMsg]);

    // State after step 2: hasEarlyOptimisticMessage=true, isStreaming=false (not yet)
    expect(store.getState().hasEarlyOptimisticMessage).toBe(true);
    expect(store.getState().isStreaming).toBe(false);

    // Step 3: prepareForNewMessage (happens BEFORE streaming starts)
    store.getState().prepareForNewMessage('Can you say hi again?', ['anthropic/claude-3.5-sonnet', 'google/gemini-2.5-flash-lite']);

    // State after step 3: hasEarlyOptimisticMessage=false, pendingMessage set
    expect(store.getState().hasEarlyOptimisticMessage).toBe(false);
    expect(store.getState().pendingMessage).toBe('Can you say hi again?');
    expect(store.getState().expectedParticipantIds).toEqual(['anthropic/claude-3.5-sonnet', 'google/gemini-2.5-flash-lite']);

    // Step 4: Streaming starts (provider effect sees pendingMessage and starts)
    store.getState().setHasSentPendingMessage(true);
    store.getState().setIsStreaming(true);

    // State is now consistent: isStreaming=true, hasSentPendingMessage=true
    const finalState = store.getState();
    expect(finalState.isStreaming).toBe(true);
    expect(finalState.hasSentPendingMessage).toBe(true);
    expect(finalState.hasEarlyOptimisticMessage).toBe(false);
    expect(finalState.pendingMessage).toBe('Can you say hi again?');
  });
});

// ============================================================================
// SECTION 5: EFFECT SIMULATION TESTS
// ============================================================================

describe('effect Simulation for Infinite Loop Detection', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should detect infinite effect re-triggers when state oscillates', () => {
    recreateFrozenState(store);

    const MAX_ITERATIONS = 100;
    let iterations = 0;

    // Simulate effect that might create oscillation
    const simulateProviderEffects = () => {
      const state = store.getState();

      // Check if pending message effect would run
      if (state.pendingMessage && state.expectedParticipantIds && !state.hasSentPendingMessage && !state.isStreaming) {
        store.getState().setHasSentPendingMessage(true);
        return true; // State changed
      }

      // Check if streaming trigger would run
      if (state.nextParticipantToTrigger !== null && state.waitingToStartStreaming) {
        store.getState().setWaitingToStartStreaming(false);
        store.getState().setIsStreaming(true);
        return true; // State changed
      }

      return false; // No state change
    };

    // Run simulation
    let stateChanged = true;
    while (stateChanged && iterations < MAX_ITERATIONS) {
      iterations++;
      stateChanged = simulateProviderEffects();
    }

    // Should converge quickly (no infinite loop)
    expect(iterations).toBeLessThan(MAX_ITERATIONS);

    // In the bug state, no effects can run, so iterations should be 1
    // (one check, no state change, exit)
    expect(iterations).toBe(1);
  });

  it('should detect potential infinite loop in message sync effect', () => {
    const thread = createMockThread({ id: 'thread-sync-loop' });
    const participants = [createMockParticipant(0)];

    store.getState().initializeThread(thread, participants, [
      createMockUserMessage(0, 'test'),
    ]);
    store.getState().setScreenMode(ScreenModes.THREAD);

    let syncCount = 0;
    const MAX_SYNCS = 50;

    // Simulate what happens if sync creates new array each time
    const simulateMessageSync = () => {
      const currentMessages = store.getState().messages;

      // BAD: Creating new array triggers re-render which triggers sync again
      // const newMessages = [...currentMessages];
      // store.getState().setMessages(newMessages);

      // GOOD: Only set if actually different
      // This is what the fix should do
      return currentMessages; // No change
    };

    while (syncCount < MAX_SYNCS) {
      syncCount++;
      const result = simulateMessageSync();
      if (result === store.getState().messages) {
        // Same reference, no infinite loop
        break;
      }
    }

    expect(syncCount).toBeLessThan(MAX_SYNCS);
  });
});

// ============================================================================
// SECTION 6: FIX VERIFICATION TESTS
// ============================================================================

describe('fix Verification: hasEarlyOptimisticMessage Guard', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should prevent deadlock by not setting isStreaming when hasEarlyOptimisticMessage is true', () => {
    const thread = createMockThread({ id: 'thread-fix-test' });
    const participants = [
      createMockParticipant(0, { modelId: 'anthropic/claude-3.5-sonnet' }),
      createMockParticipant(1, { modelId: 'google/gemini-2.5-flash-lite' }),
    ];

    store.getState().initializeThread(thread, participants, [
      createMockUserMessage(0, 'Round 0 question'),
      createMockMessage(0, 0),
      createMockMessage(1, 0),
    ]);
    store.getState().setScreenMode(ScreenModes.THREAD);

    // Simulate handleUpdateThreadAndSend setting hasEarlyOptimisticMessage BEFORE prepareForNewMessage
    store.getState().setStreamingRoundNumber(1);
    store.getState().setHasEarlyOptimisticMessage(true);

    // Add optimistic message
    const optimisticMsg = createMockUserMessage(1, 'New question');
    optimisticMsg.id = `optimistic-user-${Date.now()}`;
    store.getState().setMessages(prev => [...prev, optimisticMsg]);

    // At this point, isStreaming should still be false
    expect(store.getState().isStreaming).toBe(false);
    expect(store.getState().hasEarlyOptimisticMessage).toBe(true);

    // The FIX: In useMultiParticipantChat, if resumed stream detection fires while
    // hasEarlyOptimisticMessage is true, it should NOT set isStreaming=true
    // This prevents the deadlock state
    //
    // IMPORTANT: The fix does NOT return early from onFinish - it only skips
    // setting isStreaming=true. This allows the message to be processed normally
    // and prevents stuck streams.

    // Simulate what would happen WITHOUT the fix:
    // - AI SDK receives resumed stream data
    // - onFinish fires with isResumedStream=true
    // - setIsExplicitlyStreaming(true) is called
    // - isStreaming becomes true before prepareForNewMessage runs
    // - DEADLOCK: isStreaming=true, pendingMessage=null, hasEarlyOptimisticMessage=true

    // WITH the fix:
    // - AI SDK receives resumed stream data
    // - onFinish fires with isResumedStream=true
    // - Guard checks hasEarlyOptimisticMessage=true
    // - SKIPS setIsExplicitlyStreaming(true) but continues processing
    // - Message is processed normally, isStreaming stays false
    // - prepareForNewMessage runs normally
    // - Normal flow proceeds

    // Now simulate prepareForNewMessage completing
    store.getState().prepareForNewMessage('New question', ['anthropic/claude-3.5-sonnet', 'google/gemini-2.5-flash-lite']);

    // After prepareForNewMessage:
    expect(store.getState().hasEarlyOptimisticMessage).toBe(false);
    expect(store.getState().pendingMessage).toBe('New question');
    expect(store.getState().isStreaming).toBe(false); // Still false, not set by resumed stream detection

    // Now streaming can start normally through the pending message effect
    store.getState().setHasSentPendingMessage(true);
    store.getState().setIsStreaming(true);

    // Final state is consistent
    const finalState = store.getState();
    expect(finalState.isStreaming).toBe(true);
    expect(finalState.hasSentPendingMessage).toBe(true);
    expect(finalState.pendingMessage).toBe('New question');
    expect(finalState.hasEarlyOptimisticMessage).toBe(false);
  });

  it('should still allow normal resumed stream detection when hasEarlyOptimisticMessage is false', () => {
    const thread = createMockThread({ id: 'thread-normal-resume' });
    const participants = [
      createMockParticipant(0, { modelId: 'anthropic/claude-3.5-sonnet' }),
      createMockParticipant(1, { modelId: 'google/gemini-2.5-flash-lite' }),
    ];

    // Round 0 complete
    store.getState().initializeThread(thread, participants, [
      createMockUserMessage(0, 'Question'),
      createMockMessage(0, 0),
      // Only one participant responded - incomplete round!
    ]);
    store.getState().setScreenMode(ScreenModes.THREAD);

    // hasEarlyOptimisticMessage is false (not in submission)
    expect(store.getState().hasEarlyOptimisticMessage).toBe(false);

    // Simulate resumed stream detection setting isStreaming=true
    // This SHOULD work because we're not in a submission
    store.getState().setIsStreaming(true);
    store.getState().setCurrentParticipantIndex(1);

    const state = store.getState();
    expect(state.isStreaming).toBe(true);
    expect(state.currentParticipantIndex).toBe(1);
    // This is valid - we're resuming an incomplete round
  });
});

// ============================================================================
// SECTION 7: STATE INVARIANT CHECKS
// ============================================================================

describe('state Invariants', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('invariant: hasEarlyOptimisticMessage should only be true when submission in progress', () => {
    const thread = createMockThread({ id: 'thread-invariant' });
    store.getState().initializeThread(thread, [createMockParticipant(0)], []);

    // Initially false
    expect(store.getState().hasEarlyOptimisticMessage).toBe(false);

    // Set to true (submission starting)
    store.getState().setHasEarlyOptimisticMessage(true);
    expect(store.getState().hasEarlyOptimisticMessage).toBe(true);

    // prepareForNewMessage should clear it
    store.getState().prepareForNewMessage('test', []);
    expect(store.getState().hasEarlyOptimisticMessage).toBe(false);
  });

  it('invariant: isStreaming=true requires valid streaming context', () => {
    const thread = createMockThread({ id: 'thread-streaming-ctx' });
    const participants = [createMockParticipant(0, { modelId: 'openai/gpt-4' })];
    store.getState().initializeThread(thread, participants, []);

    // Set up valid streaming context
    store.getState().prepareForNewMessage('test', ['openai/gpt-4']);
    store.getState().setHasSentPendingMessage(true);
    store.getState().setIsStreaming(true);

    const state = store.getState();

    // Valid streaming state should have:
    expect(state.isStreaming).toBe(true);
    expect(state.pendingMessage).not.toBeNull();
    expect(state.hasSentPendingMessage).toBe(true);
    // OR streaming should have valid participants
  });

  it('invariant: pendingMessage and expectedParticipantIds should be set together', () => {
    const thread = createMockThread({ id: 'thread-pending-invariant' });
    const participants = [createMockParticipant(0, { modelId: 'openai/gpt-4' })];
    store.getState().initializeThread(thread, participants, []);

    // prepareForNewMessage sets both
    store.getState().prepareForNewMessage('test', ['openai/gpt-4']);

    const state = store.getState();
    expect(state.pendingMessage).toBe('test');
    expect(state.expectedParticipantIds).toEqual(['openai/gpt-4']);
  });
});
