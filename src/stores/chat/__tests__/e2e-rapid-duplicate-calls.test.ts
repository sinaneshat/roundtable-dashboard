/**
 * E2E Tests: Rapid/Duplicate Calls Detection
 *
 * Tests verify protection against:
 * 1. Effects running multiple times (infinite loops)
 * 2. Duplicate API calls from multiple sources
 * 3. Event handlers firing rapidly
 * 4. Store subscriptions triggering cascades
 * 5. Timer/interval cleanup issues
 *
 * Focus: Detecting calls happening within the same tick, verifying debouncing/throttling,
 * and ensuring ref-based guards work correctly.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FinishReasons, MessageStatuses } from '@/api/core/enums';
import { createTestAssistantMessage, createTestModeratorMessage, createTestUserMessage } from '@/lib/testing';
import type { TestCallType } from '@/lib/testing/enums';
import { TestCallTypes } from '@/lib/testing/enums';

import { createChatStore } from '../store';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

type CallRecord = {
  type: TestCallType;
  timestamp: number;
  tick: number;
  args?: unknown;
};

type CallTracker = {
  calls: CallRecord[];
  currentTick: number;
  recordCall: (type: TestCallType, args?: unknown) => void;
  advanceTick: () => void;
  getCallsInTick: (tick: number) => CallRecord[];
  getDuplicatesInTick: (tick: number) => Map<TestCallType, CallRecord[]>;
  clear: () => void;
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function createCallTracker(): CallTracker {
  const calls: CallRecord[] = [];
  let currentTick = 0;

  return {
    calls,
    currentTick,
    recordCall: (type: TestCallType, args?: unknown) => {
      calls.push({
        type,
        timestamp: Date.now(),
        tick: currentTick,
        args,
      });
    },
    advanceTick: () => {
      currentTick++;
    },
    getCallsInTick: (tick: number) => {
      return calls.filter(c => c.tick === tick);
    },
    getDuplicatesInTick: (tick: number) => {
      const tickCalls = calls.filter(c => c.tick === tick);
      const grouped = new Map<TestCallType, CallRecord[]>();

      for (const call of tickCalls) {
        const existing = grouped.get(call.type) ?? [];
        existing.push(call);
        grouped.set(call.type, existing);
      }

      const duplicates = new Map<TestCallType, CallRecord[]>();
      for (const [type, records] of grouped) {
        if (records.length > 1) {
          duplicates.set(type, records);
        }
      }

      return duplicates;
    },
    clear: () => {
      calls.length = 0;
      currentTick = 0;
    },
  };
}

// ============================================================================
// TEST SUITE 1: Flow Controller Effects - hasUpdatedThreadRef Prevention
// ============================================================================

describe('flow Controller Effects: hasUpdatedThreadRef Re-entry Guard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should prevent slug polling effect from running multiple times in same tick', () => {
    const tracker = createCallTracker();
    const hasUpdatedThreadRef = { current: false };

    // Simulate effect running multiple times (React strict mode double-invoke)
    const runSlugPollingEffect = () => {
      if (hasUpdatedThreadRef.current) {
        return; // Guard prevents re-entry
      }

      tracker.recordCall(TestCallTypes.SLUG_POLLING_START);
      hasUpdatedThreadRef.current = true;
    };

    // First run
    runSlugPollingEffect();
    // Second run (same tick)
    runSlugPollingEffect();

    const duplicates = tracker.getDuplicatesInTick(0);
    expect(duplicates.size).toBe(0); // No duplicates
    expect(tracker.getCallsInTick(0)).toHaveLength(1); // Only ONE call
  });

  it('should allow slug polling to restart on thread change', () => {
    const tracker = createCallTracker();
    let hasUpdatedThreadRef = { current: false };
    let currentThreadId = 'thread-123';

    const runSlugPollingEffect = (threadId: string) => {
      // Reset ref when thread changes
      if (currentThreadId !== threadId) {
        hasUpdatedThreadRef = { current: false };
        currentThreadId = threadId;
      }

      if (hasUpdatedThreadRef.current) {
        return;
      }

      tracker.recordCall('slug-polling-start', { threadId });
      hasUpdatedThreadRef.current = true;
    };

    // Tick 0: First thread
    runSlugPollingEffect('thread-123');
    tracker.advanceTick();

    // Tick 1: Different thread - should allow restart
    runSlugPollingEffect('thread-456');

    expect(tracker.getCallsInTick(0)).toHaveLength(1);
    expect(tracker.getCallsInTick(1)).toHaveLength(1);
    expect(tracker.calls).toHaveLength(2); // Two separate calls for different threads
  });

  it('should prevent URL update effect from firing multiple times', () => {
    const tracker = createCallTracker();
    const hasUpdatedThreadRef = { current: false };

    const runUrlUpdateEffect = () => {
      if (hasUpdatedThreadRef.current) {
        return;
      }

      tracker.recordCall(TestCallTypes.URL_REPLACE);
      hasUpdatedThreadRef.current = true;
    };

    // Multiple rapid calls (e.g., from slug polling updates)
    runUrlUpdateEffect();
    runUrlUpdateEffect();
    runUrlUpdateEffect();

    expect(tracker.getCallsInTick(0)).toHaveLength(1);
  });

  it('should verify hasUpdatedThreadRef blocks until reset on navigation', () => {
    const tracker = createCallTracker();
    const hasUpdatedThreadRef = { current: false };
    const showInitialUI = true;

    const runSlugPollingEffect = () => {
      if (hasUpdatedThreadRef.current) {
        return;
      }
      tracker.recordCall(TestCallTypes.SLUG_POLLING);
      hasUpdatedThreadRef.current = true;
    };

    // Tick 0: Effect runs
    runSlugPollingEffect();
    tracker.advanceTick();

    // Tick 1: showInitialUI becomes false (navigated away)
    const resetOnShowInitialUIChange = () => {
      if (!showInitialUI) {
        hasUpdatedThreadRef.current = false;
      }
    };

    resetOnShowInitialUIChange();
    // Now can run again
    runSlugPollingEffect();

    expect(tracker.getCallsInTick(0)).toHaveLength(1);
    expect(tracker.getCallsInTick(1)).toHaveLength(0); // Blocked until reset
  });
});

// ============================================================================
// TEST SUITE 2: Flow State Machine Effects - hasNavigatedRef Prevention
// ============================================================================

describe('flow State Machine Effects: hasNavigatedRef Duplicate Navigation Guard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should prevent router.push from firing multiple times', () => {
    const tracker = createCallTracker();
    const hasNavigatedRef = { current: false };

    const runNavigationEffect = (slug: string) => {
      if (hasNavigatedRef.current) {
        return;
      }

      tracker.recordCall(TestCallTypes.ROUTER_PUSH, { slug });
      hasNavigatedRef.current = true;
    };

    // Multiple triggers (e.g., from moderator completion + council moderator status change)
    runNavigationEffect('test-slug');
    runNavigationEffect('test-slug');
    runNavigationEffect('test-slug');

    expect(tracker.getCallsInTick(0)).toHaveLength(1);
  });

  it('should reset hasNavigatedRef when returning to overview screen', () => {
    const tracker = createCallTracker();
    const hasNavigatedRef = { current: false };
    let showInitialUI = false;

    const runNavigationEffect = (slug: string) => {
      if (hasNavigatedRef.current) {
        return;
      }
      tracker.recordCall(TestCallTypes.ROUTER_PUSH, { slug });
      hasNavigatedRef.current = true;
    };

    // Tick 0: Navigate
    runNavigationEffect('slug-1');
    tracker.advanceTick();

    // Tick 1: Return to overview (showInitialUI becomes true)
    showInitialUI = true;
    if (showInitialUI) {
      hasNavigatedRef.current = false;
    }

    // Can navigate again
    runNavigationEffect('slug-2');

    expect(tracker.getCallsInTick(0)).toHaveLength(1);
    expect(tracker.getCallsInTick(1)).toHaveLength(1);
  });

  it('should use queueMicrotask correctly - no duplicate navigation', () => {
    const tracker = createCallTracker();
    const hasNavigatedRef = { current: false };

    const runNavigationWithMicrotask = (slug: string) => {
      if (hasNavigatedRef.current) {
        return;
      }

      queueMicrotask(() => {
        tracker.recordCall(TestCallTypes.ROUTER_PUSH, { slug });
      });

      hasNavigatedRef.current = true;
    };

    // Trigger multiple times synchronously
    runNavigationWithMicrotask('test-slug');
    runNavigationWithMicrotask('test-slug');

    // Microtasks execute after current tick
    return new Promise<void>((resolve) => {
      queueMicrotask(() => {
        expect(tracker.getCallsInTick(0)).toHaveLength(1);
        resolve();
      });
    });
  });
});

// ============================================================================
// TEST SUITE 3: Slug Polling - Interval Respect
// ============================================================================

describe('slug Polling: Interval Timing Verification', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should poll every 3 seconds, not rapid-fire', () => {
    const tracker = createCallTracker();
    const POLL_INTERVAL = 3000;

    const runSlugPoll = () => {
      tracker.recordCall(TestCallTypes.SLUG_POLL);
    };

    const intervalId = setInterval(runSlugPoll, POLL_INTERVAL);

    // Advance time
    vi.advanceTimersByTime(0); // 0s
    expect(tracker.calls).toHaveLength(0);

    vi.advanceTimersByTime(3000); // 3s
    expect(tracker.calls).toHaveLength(1);

    vi.advanceTimersByTime(3000); // 6s
    expect(tracker.calls).toHaveLength(2);

    vi.advanceTimersByTime(3000); // 9s
    expect(tracker.calls).toHaveLength(3);

    clearInterval(intervalId);
  });

  it('should stop polling when AI title detected', () => {
    const tracker = createCallTracker();
    const POLL_INTERVAL = 3000;
    let hasUpdatedThreadRef = { current: false };
    let intervalId: ReturnType<typeof setInterval>;

    const runSlugPoll = () => {
      if (hasUpdatedThreadRef.current) {
        clearInterval(intervalId);
        return;
      }
      tracker.recordCall(TestCallTypes.SLUG_POLL);
    };

    intervalId = setInterval(runSlugPoll, POLL_INTERVAL);

    vi.advanceTimersByTime(3000); // 3s - poll 1
    expect(tracker.calls).toHaveLength(1);

    // AI title ready - stop polling
    hasUpdatedThreadRef = { current: true };

    vi.advanceTimersByTime(3000); // 6s - should NOT poll
    vi.advanceTimersByTime(3000); // 9s - should NOT poll

    expect(tracker.calls).toHaveLength(1); // No more polls after detection
  });

  it('should clear interval on cleanup to prevent memory leaks', () => {
    const tracker = createCallTracker();
    const POLL_INTERVAL = 3000;

    const setupPolling = () => {
      const intervalId = setInterval(() => {
        tracker.recordCall(TestCallTypes.SLUG_POLL);
      }, POLL_INTERVAL);

      return () => clearInterval(intervalId);
    };

    const cleanup = setupPolling();

    vi.advanceTimersByTime(3000);
    expect(tracker.calls).toHaveLength(1);

    // Cleanup
    cleanup();

    vi.advanceTimersByTime(3000);
    expect(tracker.calls).toHaveLength(1); // No more calls after cleanup
  });
});

// ============================================================================
// TEST SUITE 4: Moderator Trigger - tryMarkModeratorCreated Prevention
// ============================================================================

describe('moderator Trigger: tryMarkModeratorCreated Atomic Guard', () => {
  it('should prevent duplicate moderator creation via atomic check-and-mark', () => {
    const store = createChatStore();
    const tracker = createCallTracker();

    const roundNumber = 0;

    // First attempt
    const didMark1 = store.getState().tryMarkModeratorCreated(roundNumber);
    if (didMark1) {
      tracker.recordCall(TestCallTypes.MODERATOR_CREATE, { roundNumber });
    }

    // Second attempt (duplicate)
    const didMark2 = store.getState().tryMarkModeratorCreated(roundNumber);
    if (didMark2) {
      tracker.recordCall(TestCallTypes.MODERATOR_CREATE, { roundNumber, duplicate: true });
    }

    expect(didMark1).toBe(true);
    expect(didMark2).toBe(false);
    expect(tracker.calls).toHaveLength(1); // Only ONE moderator creation
  });

  it('should allow moderator creation for different rounds', () => {
    const store = createChatStore();
    const tracker = createCallTracker();

    const didMarkR0 = store.getState().tryMarkModeratorCreated(0);
    if (didMarkR0) {
      tracker.recordCall('moderator-create', { roundNumber: 0 });
    }

    const didMarkR1 = store.getState().tryMarkModeratorCreated(1);
    if (didMarkR1) {
      tracker.recordCall('moderator-create', { roundNumber: 1 });
    }

    expect(didMarkR0).toBe(true);
    expect(didMarkR1).toBe(true);
    expect(tracker.calls).toHaveLength(2); // Two separate rounds
  });

  it('should verify tryMarkModeratorCreated returns false on second attempt', () => {
    const store = createChatStore();

    const firstAttempt = store.getState().tryMarkModeratorCreated(0);
    const secondAttempt = store.getState().tryMarkModeratorCreated(0);

    expect(firstAttempt).toBe(true);
    expect(secondAttempt).toBe(false);
  });
});

// ============================================================================
// TEST SUITE 5: Pre-Search Execution - tryMarkPreSearchTriggered Prevention
// ============================================================================

describe('pre-Search Execution: tryMarkPreSearchTriggered Atomic Guard', () => {
  it('should prevent duplicate pre-search execution via atomic check-and-mark', () => {
    const store = createChatStore();
    const tracker = createCallTracker();

    const roundNumber = 0;

    // Add pre-search placeholder
    store.getState().addPreSearch({
      id: `presearch_r${roundNumber}`,
      threadId: 'thread-123',
      roundNumber,
      userQuery: 'Test query',
      status: MessageStatuses.PENDING,
      data: null,
      createdAt: new Date(),
      completedAt: null,
    });

    // First attempt
    const didMark1 = store.getState().tryMarkPreSearchTriggered(roundNumber);
    if (didMark1) {
      tracker.recordCall(TestCallTypes.PRE_SEARCH_EXECUTE, { roundNumber });
    }

    // Second attempt (duplicate)
    const didMark2 = store.getState().tryMarkPreSearchTriggered(roundNumber);
    if (didMark2) {
      tracker.recordCall(TestCallTypes.PRE_SEARCH_EXECUTE, { roundNumber, duplicate: true });
    }

    expect(didMark1).toBe(true);
    expect(didMark2).toBe(false);
    expect(tracker.calls).toHaveLength(1); // Only ONE pre-search execution
  });

  it('should allow pre-search execution for different rounds', () => {
    const store = createChatStore();
    const tracker = createCallTracker();

    store.getState().addPreSearch({
      id: 'presearch_r0',
      threadId: 'thread-123',
      roundNumber: 0,
      userQuery: 'Query 1',
      status: MessageStatuses.PENDING,
      data: null,
      createdAt: new Date(),
      completedAt: null,
    });

    store.getState().addPreSearch({
      id: 'presearch_r1',
      threadId: 'thread-123',
      roundNumber: 1,
      userQuery: 'Query 2',
      status: MessageStatuses.PENDING,
      data: null,
      createdAt: new Date(),
      completedAt: null,
    });

    const didMarkR0 = store.getState().tryMarkPreSearchTriggered(0);
    if (didMarkR0) {
      tracker.recordCall('pre-search-execute', { roundNumber: 0 });
    }

    const didMarkR1 = store.getState().tryMarkPreSearchTriggered(1);
    if (didMarkR1) {
      tracker.recordCall('pre-search-execute', { roundNumber: 1 });
    }

    expect(didMarkR0).toBe(true);
    expect(didMarkR1).toBe(true);
    expect(tracker.calls).toHaveLength(2);
  });
});

// ============================================================================
// TEST SUITE 6: Stop Button - Single Action Per Click
// ============================================================================

describe('stop Button: Prevent Duplicate Stop Actions', () => {
  it('should fire stop action only once per click despite rapid re-renders', () => {
    const store = createChatStore();
    const tracker = createCallTracker();

    // Setup: Streaming in progress
    store.setState({
      isStreaming: true,
      streamingRoundNumber: 0,
    });

    const handleStopClick = () => {
      if (!store.getState().isStreaming) {
        return; // Already stopped
      }

      tracker.recordCall(TestCallTypes.STOP_STREAMING);
      // Use setIsStreaming instead of stopStreaming
      store.getState().setIsStreaming(false);
    };

    // First click
    handleStopClick();
    // Rapid second click (same tick)
    handleStopClick();

    expect(tracker.calls).toHaveLength(1);
    expect(store.getState().isStreaming).toBe(false);
  });

  it('should verify isStreaming flag prevents double-stop', () => {
    const store = createChatStore();

    store.setState({ isStreaming: true });

    store.getState().setIsStreaming(false);
    const isStreamingAfterFirstStop = store.getState().isStreaming;

    store.getState().setIsStreaming(false); // Second call
    const isStreamingAfterSecondStop = store.getState().isStreaming;

    expect(isStreamingAfterFirstStop).toBe(false);
    expect(isStreamingAfterSecondStop).toBe(false);
  });

  it('should allow stop button to work again after new streaming starts', () => {
    const store = createChatStore();
    const tracker = createCallTracker();

    const handleStopClick = () => {
      if (!store.getState().isStreaming) {
        return;
      }
      tracker.recordCall(TestCallTypes.STOP_STREAMING);
      store.getState().setIsStreaming(false);
    };

    // Tick 0: First streaming session
    store.setState({ isStreaming: true });
    handleStopClick();
    tracker.advanceTick();

    // Tick 1: Start new streaming session
    store.setState({ isStreaming: true, streamingRoundNumber: 1 });
    handleStopClick();

    expect(tracker.getCallsInTick(0)).toHaveLength(1);
    expect(tracker.getCallsInTick(1)).toHaveLength(1);
  });
});

// ============================================================================
// TEST SUITE 7: Message Submission - Rapid Click Prevention
// ============================================================================

describe('message Submission: Rapid Submit Prevention', () => {
  it('should prevent multiple submissions on rapid submit clicks', () => {
    const store = createChatStore();
    const tracker = createCallTracker();

    store.setState({
      inputValue: 'Test message',
      selectedParticipants: [{ modelId: 'gpt-4', priority: 0 }],
    });

    const handleSubmit = () => {
      const { pendingMessage, isStreaming, inputValue } = store.getState();

      // Guard: Block if already submitting or streaming
      if (pendingMessage !== null || isStreaming || !inputValue.trim()) {
        return;
      }

      tracker.recordCall(TestCallTypes.SUBMIT_MESSAGE, { content: inputValue });
      store.setState({ pendingMessage: inputValue });
    };

    // First click
    handleSubmit();
    // Rapid second click (same tick)
    handleSubmit();
    // Rapid third click
    handleSubmit();

    expect(tracker.calls).toHaveLength(1);
  });

  it('should verify pendingMessage guard blocks duplicate submissions', () => {
    const store = createChatStore();

    store.setState({ inputValue: 'Test' });

    const canSubmit1 = store.getState().pendingMessage === null
      && !store.getState().isStreaming
      && store.getState().inputValue.trim().length > 0;

    expect(canSubmit1).toBe(true);

    // Set pending
    store.setState({ pendingMessage: 'Test' });

    const canSubmit2 = store.getState().pendingMessage === null
      && !store.getState().isStreaming
      && store.getState().inputValue.trim().length > 0;

    expect(canSubmit2).toBe(false);
  });

  it('should allow re-submission after previous message sent', () => {
    const store = createChatStore();
    const tracker = createCallTracker();

    const handleSubmit = (content: string) => {
      if (store.getState().pendingMessage !== null || store.getState().isStreaming) {
        return;
      }
      tracker.recordCall(TestCallTypes.SUBMIT_MESSAGE, { content });
      store.setState({ pendingMessage: content });
    };

    // Tick 0: First submission
    store.setState({ inputValue: 'Message 1' });
    handleSubmit('Message 1');
    tracker.advanceTick();

    // Clear pending (message sent)
    store.setState({ pendingMessage: null, inputValue: '' });

    // Tick 1: Second submission
    store.setState({ inputValue: 'Message 2' });
    handleSubmit('Message 2');

    expect(tracker.getCallsInTick(0)).toHaveLength(1);
    expect(tracker.getCallsInTick(1)).toHaveLength(1);
  });
});

// ============================================================================
// TEST SUITE 8: Subscription Cascade Prevention
// ============================================================================

describe('subscription Cascade Prevention', () => {
  it('should prevent cascading store updates from subscription loops via guard', () => {
    const tracker = createCallTracker();
    let subscriptionRunCount = 0;
    const MAX_SUBSCRIPTION_RUNS = 10;

    const simulateSubscriptionCallback = () => {
      subscriptionRunCount++;

      // Guard: Prevent infinite loops
      if (subscriptionRunCount > MAX_SUBSCRIPTION_RUNS) {
        throw new Error('Subscription loop detected!');
      }

      // Don't trigger state updates inside subscription
      tracker.recordCall(TestCallTypes.SUBSCRIPTION_CALLBACK);
    };

    // Simulate multiple rapid state changes
    simulateSubscriptionCallback();
    simulateSubscriptionCallback();
    simulateSubscriptionCallback();

    // Should track all calls but guard prevents infinite loop
    expect(tracker.calls).toHaveLength(3);
    expect(subscriptionRunCount).toBe(3);
    expect(subscriptionRunCount).toBeLessThan(MAX_SUBSCRIPTION_RUNS);
  });

  it('should verify reference equality check prevents unnecessary re-renders', () => {
    const store = createChatStore();
    const tracker = createCallTracker();

    // Initial messages reference
    const initialMessages = store.getState().messages;

    // Update unrelated state - messages reference unchanged
    store.setState({ inputValue: 'New value' });
    const messagesAfterUnrelatedUpdate = store.getState().messages;

    // Update messages - new reference
    const newMessages = [
      createTestUserMessage({ id: 'user_r0', content: 'Test', roundNumber: 0 }),
    ];
    store.getState().setMessages(newMessages);
    const messagesAfterUpdate = store.getState().messages;

    // Track reference changes
    if (initialMessages !== messagesAfterUnrelatedUpdate) {
      tracker.recordCall(TestCallTypes.MESSAGES_REFERENCE_CHANGED_UNRELATED);
    }

    if (messagesAfterUnrelatedUpdate !== messagesAfterUpdate) {
      tracker.recordCall(TestCallTypes.MESSAGES_REFERENCE_CHANGED_UPDATE);
    }

    // Only the actual message update should change reference
    expect(tracker.calls).toHaveLength(1);
    expect(tracker.calls[0]?.type).toBe(TestCallTypes.MESSAGES_REFERENCE_CHANGED_UPDATE);
  });
});

// ============================================================================
// TEST SUITE 9: Effect Re-entry Detection
// ============================================================================

describe('effect Re-entry Detection', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should detect when effect runs multiple times in same tick', () => {
    const tracker = createCallTracker();

    const runEffect = () => {
      tracker.recordCall(TestCallTypes.EFFECT_RUN);
    };

    // Simulate React strict mode double-invoke
    runEffect();
    runEffect();

    const callsInTick = tracker.getCallsInTick(0);
    const duplicates = tracker.getDuplicatesInTick(0);

    expect(callsInTick).toHaveLength(2);
    expect(duplicates.has(TestCallTypes.EFFECT_RUN)).toBe(true);
  });

  it('should use ref to prevent effect re-entry', () => {
    const tracker = createCallTracker();
    const hasRunRef = { current: false };

    const runEffect = () => {
      if (hasRunRef.current) {
        return;
      }

      tracker.recordCall(TestCallTypes.EFFECT_RUN);
      hasRunRef.current = true;
    };

    // Multiple runs
    runEffect();
    runEffect();
    runEffect();

    const callsInTick = tracker.getCallsInTick(0);

    expect(callsInTick).toHaveLength(1);
  });

  it('should verify cleanup function prevents stale timers', () => {
    const tracker = createCallTracker();

    const setupEffect = () => {
      const timeoutId = setTimeout(() => {
        tracker.recordCall(TestCallTypes.TIMEOUT_CALLBACK);
      }, 1000);

      return () => clearTimeout(timeoutId);
    };

    // Setup
    const cleanup1 = setupEffect();
    tracker.advanceTick();

    // Cleanup before timeout fires
    cleanup1();

    vi.advanceTimersByTime(1000);

    // Should NOT have fired
    expect(tracker.calls).toHaveLength(0);
  });
});

// ============================================================================
// TEST SUITE 10: Comprehensive Rapid Call Detection
// ============================================================================

describe('comprehensive Rapid Call Detection', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should detect rapid calls happening within 100ms window', () => {
    const tracker = createCallTracker();

    const rapidFunction = () => {
      tracker.recordCall(TestCallTypes.RAPID_CALL);
    };

    // Rapid fire
    rapidFunction();
    vi.advanceTimersByTime(50);
    rapidFunction();
    vi.advanceTimersByTime(49); // 99ms total
    rapidFunction();

    // All should be in same tick (within 100ms window)
    const allCalls = tracker.calls.filter(c => c.type === TestCallTypes.RAPID_CALL);
    const timeRange = allCalls[allCalls.length - 1]!.timestamp - allCalls[0]!.timestamp;

    expect(allCalls).toHaveLength(3);
    expect(timeRange).toBeLessThan(100);
  });

  it('should use debounce pattern to prevent rapid-fire calls', () => {
    const tracker = createCallTracker();
    const DEBOUNCE_MS = 300;

    const createDebouncedFunction = (fn: () => void, delay: number) => {
      let timeoutId: ReturnType<typeof setTimeout> | null = null;

      return () => {
        if (timeoutId !== null) {
          clearTimeout(timeoutId);
        }

        timeoutId = setTimeout(() => {
          fn();
          timeoutId = null;
        }, delay);
      };
    };

    const debouncedCall = createDebouncedFunction(() => {
      tracker.recordCall(TestCallTypes.DEBOUNCED_CALL);
    }, DEBOUNCE_MS);

    // Rapid calls
    debouncedCall();
    vi.advanceTimersByTime(100);
    debouncedCall();
    vi.advanceTimersByTime(100);
    debouncedCall();

    // Should NOT have fired yet
    expect(tracker.calls).toHaveLength(0);

    // Wait for debounce delay
    vi.advanceTimersByTime(DEBOUNCE_MS);

    // Should fire ONCE
    expect(tracker.calls).toHaveLength(1);
  });

  it('should use throttle pattern to limit call frequency', () => {
    const tracker = createCallTracker();
    const THROTTLE_MS = 1000;

    const createThrottledFunction = (fn: () => void, delay: number) => {
      let lastCallTime = 0;

      return () => {
        const now = Date.now();
        if (now - lastCallTime >= delay) {
          fn();
          lastCallTime = now;
        }
      };
    };

    const throttledCall = createThrottledFunction(() => {
      tracker.recordCall(TestCallTypes.THROTTLED_CALL);
    }, THROTTLE_MS);

    // First call - should fire immediately
    throttledCall();
    expect(tracker.calls).toHaveLength(1);

    // Rapid calls within throttle window - should be ignored
    vi.advanceTimersByTime(500);
    throttledCall();
    vi.advanceTimersByTime(400);
    throttledCall();
    expect(tracker.calls).toHaveLength(1); // Still only 1

    // After throttle window - should fire
    vi.advanceTimersByTime(100);
    throttledCall();
    expect(tracker.calls).toHaveLength(2);
  });
});

// ============================================================================
// TEST SUITE 11: Store Action Call Frequency
// ============================================================================

describe('store Action Call Frequency', () => {
  it('should track how many times setMessages is called', () => {
    const store = createChatStore();
    const tracker = createCallTracker();

    const originalSetMessages = store.getState().setMessages;
    store.setState({
      setMessages: (messages) => {
        tracker.recordCall(TestCallTypes.SET_MESSAGES, { count: messages.length });
        originalSetMessages(messages);
      },
    });

    // Call multiple times
    store.getState().setMessages([]);
    store.getState().setMessages([
      createTestUserMessage({ id: 'u1', content: 'Test', roundNumber: 0 }),
    ]);
    store.getState().setMessages([
      createTestUserMessage({ id: 'u1', content: 'Test', roundNumber: 0 }),
      createTestAssistantMessage({
        id: 'a1',
        content: 'Response',
        roundNumber: 0,
        participantId: 'p1',
        participantIndex: 0,
      }),
    ]);

    expect(tracker.calls).toHaveLength(3);
  });

  it('should detect if same action called multiple times with same args', () => {
    const store = createChatStore();
    const tracker = createCallTracker();

    // Call with same round number multiple times
    store.getState().setStreamingRoundNumber(0);
    tracker.recordCall(TestCallTypes.SET_STREAMING_ROUND_NUMBER, { roundNumber: 0 });

    store.getState().setStreamingRoundNumber(0);
    tracker.recordCall(TestCallTypes.SET_STREAMING_ROUND_NUMBER, { roundNumber: 0 });

    const duplicates = tracker.getDuplicatesInTick(0);

    expect(duplicates.has(TestCallTypes.SET_STREAMING_ROUND_NUMBER)).toBe(true);
  });
});

// ============================================================================
// TEST SUITE 12: Complete E2E Rapid Call Scenario
// ============================================================================

describe('complete E2E: First Round with Rapid Call Detection', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should track all calls during first round and detect duplicates', () => {
    const store = createChatStore();
    const tracker = createCallTracker();

    // Setup
    store.setState({
      selectedParticipants: [
        { modelId: 'gpt-4', priority: 0 },
        { modelId: 'claude-3', priority: 1 },
      ],
      inputValue: 'Test question',
      enableWebSearch: false,
    });

    // Tick 0: Submit message
    const submitMessage = () => {
      if (store.getState().pendingMessage !== null) {
        return;
      }
      tracker.recordCall(TestCallTypes.SUBMIT_MESSAGE);
      store.setState({ pendingMessage: store.getState().inputValue });
    };

    submitMessage();
    submitMessage(); // Duplicate attempt
    tracker.advanceTick();

    // Tick 1: Start streaming
    const startStreaming = () => {
      if (store.getState().isStreaming) {
        return;
      }
      tracker.recordCall(TestCallTypes.START_STREAMING);
      store.setState({ isStreaming: true, streamingRoundNumber: 0 });
    };

    startStreaming();
    startStreaming(); // Duplicate attempt
    tracker.advanceTick();

    // Tick 2: First participant completes
    const userMsg = createTestUserMessage({
      id: 'thread-123_r0_user',
      content: 'Test question',
      roundNumber: 0,
    });
    const p0Msg = createTestAssistantMessage({
      id: 'thread-123_r0_p0',
      content: 'Response from GPT-4',
      roundNumber: 0,
      participantId: 'p0',
      participantIndex: 0,
      finishReason: FinishReasons.STOP,
    });

    store.getState().setMessages([userMsg, p0Msg]);
    tracker.recordCall(TestCallTypes.PARTICIPANT_0_COMPLETE);
    tracker.advanceTick();

    // Tick 3: Second participant completes
    const p1Msg = createTestAssistantMessage({
      id: 'thread-123_r0_p1',
      content: 'Response from Claude',
      roundNumber: 0,
      participantId: 'p1',
      participantIndex: 1,
      finishReason: FinishReasons.STOP,
    });

    store.getState().setMessages([userMsg, p0Msg, p1Msg]);
    tracker.recordCall(TestCallTypes.PARTICIPANT_1_COMPLETE);
    tracker.advanceTick();

    // Tick 4: Trigger moderator
    const triggerModerator = () => {
      const didMark = store.getState().tryMarkModeratorCreated(0);
      if (didMark) {
        tracker.recordCall(TestCallTypes.TRIGGER_MODERATOR, { roundNumber: 0 });
      }
    };

    triggerModerator();
    triggerModerator(); // Duplicate attempt
    tracker.advanceTick();

    // Tick 5: Moderator completes
    const modMsg = createTestModeratorMessage({
      id: 'thread-123_r0_moderator',
      content: 'Moderator summary',
      roundNumber: 0,
      finishReason: FinishReasons.STOP,
    });

    store.getState().setMessages([userMsg, p0Msg, p1Msg, modMsg]);
    tracker.recordCall(TestCallTypes.MODERATOR_COMPLETE);
    tracker.advanceTick();

    // Tick 6: Stop streaming
    const stopStreaming = () => {
      if (!store.getState().isStreaming) {
        return;
      }
      tracker.recordCall(TestCallTypes.STOP_STREAMING);
      store.setState({ isStreaming: false });
    };

    stopStreaming();
    stopStreaming(); // Duplicate attempt

    // Verify no duplicates in critical calls
    const tick0Duplicates = tracker.getDuplicatesInTick(0);
    const tick1Duplicates = tracker.getDuplicatesInTick(1);
    const tick4Duplicates = tracker.getDuplicatesInTick(4);
    const tick6Duplicates = tracker.getDuplicatesInTick(6);

    expect(tick0Duplicates.size).toBe(0); // No duplicate submissions
    expect(tick1Duplicates.size).toBe(0); // No duplicate streaming starts
    expect(tick4Duplicates.size).toBe(0); // No duplicate moderator triggers
    expect(tick6Duplicates.size).toBe(0); // No duplicate stops

    // Verify expected call counts
    expect(tracker.calls.filter(c => c.type === TestCallTypes.SUBMIT_MESSAGE)).toHaveLength(1);
    expect(tracker.calls.filter(c => c.type === TestCallTypes.START_STREAMING)).toHaveLength(1);
    expect(tracker.calls.filter(c => c.type === TestCallTypes.TRIGGER_MODERATOR)).toHaveLength(1);
    expect(tracker.calls.filter(c => c.type === TestCallTypes.STOP_STREAMING)).toHaveLength(1);
  });
});
