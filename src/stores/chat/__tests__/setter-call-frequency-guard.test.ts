/**
 * Setter Call Frequency Guard Tests
 *
 * These tests detect infinite loops by monitoring how many times
 * store setters are called. If a setter is called more than expected,
 * it indicates a potential infinite loop or render loop.
 *
 * PURPOSE:
 * - Catch infinite loops early by detecting excessive setter calls
 * - Prevent UI freezes and RAM fill-ups
 * - Provide clear error messages when loops are detected
 *
 * THRESHOLDS:
 * - Single operation: Max 5 calls to any setter
 * - Batch operation: Max 20 calls to all setters combined
 * - State transition: Max 10 state changes total
 *
 * Location: /src/stores/chat/__tests__/setter-call-frequency-guard.test.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatModes } from '@/api/core/enums';
import { createChatStore } from '@/stores/chat/store';

import {
  createMockMessage,
  createMockParticipant,
  createMockThread,
  createMockUserMessage,
} from './test-factories';

// ============================================================================
// TEST UTILITIES
// ============================================================================

/**
 * Create a tracker that monitors setter call frequency
 */
function createSetterCallTracker() {
  const calls = new Map<string, number>();
  const state = { totalCalls: 0 };

  const tracker = {
    calls,
    get totalCalls() {
      return state.totalCalls;
    },
    incrementTotal() {
      state.totalCalls++;
    },
    reset: () => {
      calls.clear();
      state.totalCalls = 0;
    },
    getCalls: (setterName: string) => calls.get(setterName) || 0,
    assertMaxCalls: (setterName: string, maxCalls: number) => {
      const callCount = calls.get(setterName) || 0;
      if (callCount > maxCalls) {
        throw new Error(
          `INFINITE LOOP DETECTED: ${setterName} was called ${callCount} times (max: ${maxCalls}). `
          + `This indicates a render loop or infinite state update cycle.`,
        );
      }
    },
    assertTotalMaxCalls: (maxCalls: number) => {
      if (state.totalCalls > maxCalls) {
        const breakdown = Array.from(calls.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([name, count]) => `  ${name}: ${count}`)
          .join('\n');
        throw new Error(
          `INFINITE LOOP DETECTED: Total setter calls (${state.totalCalls}) exceeded max (${maxCalls}).\n`
          + `Breakdown:\n${breakdown}`,
        );
      }
    },
  };

  return tracker;
}

/**
 * Create a store with setter call tracking
 */
function createTrackedStore() {
  const store = createChatStore();
  const tracker = createSetterCallTracker();

  // Wrap the store to track setter calls
  const originalGetState = store.getState.bind(store);

  // Critical setters to monitor for infinite loops
  const criticalSetters = [
    'setHasSentPendingMessage',
    'setIsStreaming',
    'setHasEarlyOptimisticMessage',
    'setHasPendingConfigChanges',
    'setPendingMessage',
    'setExpectedParticipantIds',
    'setStreamingRoundNumber',
    'setCurrentParticipantIndex',
    'setNextParticipantToTrigger',
    'setWaitingToStartStreaming',
  ];

  // Create a proxy that tracks setter calls
  const trackedStore = new Proxy(store, {
    get(target, prop) {
      if (prop === 'getState') {
        return () => {
          const state = originalGetState();

          // Create a proxy for the state that tracks setter calls
          return new Proxy(state, {
            get(stateTarget, stateProp) {
              const value = (stateTarget as Record<string, unknown>)[stateProp as string];

              // If it's a critical setter, wrap it to track calls
              if (typeof value === 'function' && criticalSetters.includes(stateProp as string)) {
                return (...args: unknown[]) => {
                  const count = tracker.calls.get(stateProp as string) || 0;
                  tracker.calls.set(stateProp as string, count + 1);
                  tracker.incrementTotal();
                  return (value as (...args: unknown[]) => unknown)(...args);
                };
              }

              return value;
            },
          });
        };
      }
      return (target as Record<string, unknown>)[prop as string];
    },
  });

  return { store: trackedStore as typeof store, tracker, originalStore: store };
}

// ============================================================================
// THRESHOLD CONSTANTS
// ============================================================================

const MAX_SINGLE_SETTER_CALLS = 5;
const MAX_TOTAL_SETTER_CALLS = 20;
const _MAX_STATE_TRANSITIONS = 10; // Prefixed with _ to indicate intentionally unused (reserved for future use)

// ============================================================================
// TESTS
// ============================================================================

describe('setter call frequency guard', () => {
  let trackedStore: ReturnType<typeof createTrackedStore>;

  beforeEach(() => {
    trackedStore = createTrackedStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    trackedStore.tracker.reset();
    vi.useRealTimers();
  });

  describe('setHasSentPendingMessage frequency', () => {
    it('should not call setHasSentPendingMessage more than threshold during normal submission', () => {
      const { store, tracker } = trackedStore;
      const thread = createMockThread({ id: 'thread-1' });
      const participants = [
        createMockParticipant(0, { modelId: 'anthropic/claude-3.5-sonnet' }),
      ];

      // Initialize thread
      store.getState().initializeThread(thread, participants, []);

      // Simulate message submission flow
      store.getState().setHasSentPendingMessage(false);
      store.getState().setHasSentPendingMessage(true);

      // Should not exceed threshold
      expect(tracker.getCalls('setHasSentPendingMessage')).toBeLessThanOrEqual(MAX_SINGLE_SETTER_CALLS);
      tracker.assertMaxCalls('setHasSentPendingMessage', MAX_SINGLE_SETTER_CALLS);
    });

    it('should FAIL if setHasSentPendingMessage is called excessively (simulated infinite loop)', () => {
      const { store, tracker } = trackedStore;

      // Simulate infinite loop by calling setter many times
      for (let i = 0; i < 10; i++) {
        store.getState().setHasSentPendingMessage(i % 2 === 0);
      }

      // This should throw an error indicating infinite loop
      expect(() => {
        tracker.assertMaxCalls('setHasSentPendingMessage', MAX_SINGLE_SETTER_CALLS);
      }).toThrow(/INFINITE LOOP DETECTED/);
    });
  });

  describe('setIsStreaming frequency', () => {
    it('should not call setIsStreaming more than threshold during normal streaming', () => {
      const { store, tracker } = trackedStore;

      // Normal streaming flow
      store.getState().setIsStreaming(true); // Start streaming
      store.getState().setIsStreaming(false); // End streaming

      expect(tracker.getCalls('setIsStreaming')).toBeLessThanOrEqual(MAX_SINGLE_SETTER_CALLS);
    });

    it('should FAIL if setIsStreaming oscillates (indicates render loop)', () => {
      const { store, tracker } = trackedStore;

      // Simulate oscillating streaming state (common in render loops)
      for (let i = 0; i < 8; i++) {
        store.getState().setIsStreaming(i % 2 === 0);
      }

      expect(() => {
        tracker.assertMaxCalls('setIsStreaming', MAX_SINGLE_SETTER_CALLS);
      }).toThrow(/INFINITE LOOP DETECTED/);
    });
  });

  describe('hasEarlyOptimisticMessage frequency', () => {
    it('should not call setHasEarlyOptimisticMessage more than threshold', () => {
      const { store, tracker } = trackedStore;

      // Normal optimistic update flow
      store.getState().setHasEarlyOptimisticMessage(true); // Before PATCH
      store.getState().setHasEarlyOptimisticMessage(false); // After message sync

      expect(tracker.getCalls('setHasEarlyOptimisticMessage')).toBeLessThanOrEqual(MAX_SINGLE_SETTER_CALLS);
    });

    it('should FAIL if hasEarlyOptimisticMessage toggles excessively', () => {
      const { store, tracker } = trackedStore;

      for (let i = 0; i < 10; i++) {
        store.getState().setHasEarlyOptimisticMessage(i % 2 === 0);
      }

      expect(() => {
        tracker.assertMaxCalls('setHasEarlyOptimisticMessage', MAX_SINGLE_SETTER_CALLS);
      }).toThrow(/INFINITE LOOP DETECTED/);
    });
  });

  describe('total setter calls during operations', () => {
    it('should not exceed total threshold during complete submission flow', () => {
      const { store, tracker } = trackedStore;
      const thread = createMockThread({ id: 'thread-1' });
      const participants = [
        createMockParticipant(0, { modelId: 'anthropic/claude-3.5-sonnet' }),
        createMockParticipant(1, { modelId: 'google/gemini-2.5-flash-lite' }),
      ];

      // Complete submission flow
      store.getState().initializeThread(thread, participants, []);
      store.getState().setHasEarlyOptimisticMessage(true);
      store.getState().setHasPendingConfigChanges(false);
      store.getState().setPendingMessage('Hello');
      store.getState().setExpectedParticipantIds(['p1', 'p2']);
      store.getState().setHasSentPendingMessage(false);
      store.getState().setHasSentPendingMessage(true);
      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(1);
      store.getState().setCurrentParticipantIndex(0);

      tracker.assertTotalMaxCalls(MAX_TOTAL_SETTER_CALLS);
    });

    it('should FAIL if total setter calls exceed threshold (indicates cascading updates)', () => {
      const { store, tracker } = trackedStore;

      // Simulate cascading updates (one setter triggers another in a loop)
      for (let i = 0; i < 25; i++) {
        store.getState().setHasSentPendingMessage(i % 2 === 0);
      }

      expect(() => {
        tracker.assertTotalMaxCalls(MAX_TOTAL_SETTER_CALLS);
      }).toThrow(/INFINITE LOOP DETECTED/);
    });
  });

  describe('config change + submission scenario', () => {
    it('should not exceed thresholds when changing participants and submitting', () => {
      const { store, tracker } = trackedStore;
      const thread = createMockThread({ id: 'thread-1', mode: ChatModes.DEBATING });

      // Initial participants (3)
      const initialParticipants = [
        createMockParticipant(0, { modelId: 'anthropic/claude-3.5-sonnet' }),
        createMockParticipant(1, { modelId: 'google/gemini-2.5-flash-lite' }),
        createMockParticipant(2, { modelId: 'openai/gpt-4o' }),
      ];

      // Initialize with round 0 complete
      const messages = [
        createMockUserMessage(0, 'Say hi'),
        createMockMessage(0, 0, { id: 'msg-1' }),
        createMockMessage(0, 1, { id: 'msg-2' }),
        createMockMessage(0, 2, { id: 'msg-3' }),
      ];

      store.getState().initializeThread(thread, initialParticipants, messages);

      // User changes participants (from 3 to 2)
      const newParticipants = [
        createMockParticipant(0, { modelId: 'anthropic/claude-3.5-sonnet' }),
        createMockParticipant(1, { modelId: 'google/gemini-2.5-flash-lite' }),
      ];

      store.getState().setHasPendingConfigChanges(true);

      // Simulate handleUpdateThreadAndSend flow
      store.getState().setHasEarlyOptimisticMessage(true);

      // After successful PATCH
      store.getState().updateParticipants(newParticipants);
      store.getState().setHasPendingConfigChanges(false);
      store.getState().setHasEarlyOptimisticMessage(false);

      // prepareForNewMessage
      store.getState().setPendingMessage('Can you say hi again?');
      store.getState().setExpectedParticipantIds(['p1', 'p2']);
      store.getState().setHasSentPendingMessage(false);

      // sendMessage
      store.getState().setHasSentPendingMessage(true);
      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(1);

      // All thresholds should pass
      tracker.assertMaxCalls('setHasSentPendingMessage', MAX_SINGLE_SETTER_CALLS);
      tracker.assertMaxCalls('setIsStreaming', MAX_SINGLE_SETTER_CALLS);
      tracker.assertMaxCalls('setHasEarlyOptimisticMessage', MAX_SINGLE_SETTER_CALLS);
      tracker.assertTotalMaxCalls(MAX_TOTAL_SETTER_CALLS);
    });

    it('should detect deadlock state entry and fail fast', () => {
      const { store, tracker } = trackedStore;
      const thread = createMockThread({ id: 'thread-1' });
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, []);

      // Enter the exact deadlock state from the bug report
      store.getState().setIsStreaming(true);
      store.getState().setHasPendingConfigChanges(true);
      store.getState().setHasEarlyOptimisticMessage(true);
      store.getState().setPendingMessage(null);
      store.getState().setExpectedParticipantIds(null);
      store.getState().setHasSentPendingMessage(false);
      store.getState().setStreamingRoundNumber(1);
      store.getState().setCurrentParticipantIndex(0);
      store.getState().setNextParticipantToTrigger(0);
      store.getState().setWaitingToStartStreaming(false);

      // Verify we're in deadlock state
      const state = store.getState();
      const isDeadlock
        = state.isStreaming
          && state.pendingMessage === null
          && state.hasEarlyOptimisticMessage
          && !state.waitingToStartStreaming;

      expect(isDeadlock).toBe(true);

      // Verify no excessive calls happened entering this state
      tracker.assertTotalMaxCalls(MAX_TOTAL_SETTER_CALLS);
    });
  });

  describe('state consistency validation', () => {
    it('should detect inconsistent state combinations', () => {
      const { store } = trackedStore;
      const thread = createMockThread({ id: 'thread-1' });
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, []);

      // Create inconsistent state
      store.getState().setIsStreaming(true);
      store.getState().setPendingMessage(null);
      store.getState().setHasEarlyOptimisticMessage(true);

      const state = store.getState();

      // Define invalid state combinations
      const invalidCombinations = [
        {
          name: 'Streaming with early optimistic but no pending message',
          check: state.isStreaming && state.hasEarlyOptimisticMessage && state.pendingMessage === null,
        },
        {
          name: 'Sent pending message but pending message is null',
          check: state.hasSentPendingMessage && state.pendingMessage === null && !state.isStreaming,
        },
      ];

      // First combination should be detected
      const detectedIssue = invalidCombinations.find(c => c.check);
      expect(detectedIssue).toBeDefined();
      expect(detectedIssue?.name).toBe('Streaming with early optimistic but no pending message');
    });
  });
});

describe('render count guard', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
  });

  it('should limit state updates during a single operation', () => {
    const MAX_UPDATES = 50;
    let updateCount = 0;

    const unsubscribe = store.subscribe(() => {
      updateCount++;
      if (updateCount > MAX_UPDATES) {
        throw new Error(
          `RENDER LOOP DETECTED: Store updated ${updateCount} times in rapid succession. `
          + `This exceeds the maximum of ${MAX_UPDATES} updates.`,
        );
      }
    });

    const thread = createMockThread({ id: 'thread-1' });
    const participants = [createMockParticipant(0)];

    // Normal initialization should not exceed threshold
    store.getState().initializeThread(thread, participants, []);

    expect(updateCount).toBeLessThan(MAX_UPDATES);

    unsubscribe();
  });

  it('should detect rapid consecutive updates', () => {
    let lastUpdateTime = 0;
    let rapidUpdateCount = 0;
    const RAPID_THRESHOLD_MS = 10;
    const MAX_RAPID_UPDATES = 10;

    const unsubscribe = store.subscribe(() => {
      const now = Date.now();
      if (now - lastUpdateTime < RAPID_THRESHOLD_MS) {
        rapidUpdateCount++;
      } else {
        rapidUpdateCount = 0;
      }
      lastUpdateTime = now;

      if (rapidUpdateCount > MAX_RAPID_UPDATES) {
        unsubscribe();
        throw new Error(
          `RENDER LOOP SUSPECTED: ${rapidUpdateCount} updates in rapid succession (< ${RAPID_THRESHOLD_MS}ms apart).`,
        );
      }
    });

    // Normal spaced updates should be fine
    store.getState().setIsStreaming(true);
    store.getState().setIsStreaming(false);

    expect(rapidUpdateCount).toBeLessThan(MAX_RAPID_UPDATES);

    unsubscribe();
  });
});
