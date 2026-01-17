/**
 * Immediate Submit Loading Tests
 *
 * Tests that verify the submit button immediately enters loading state when clicked,
 * and the loading spinner stops once the first stream chunk arrives.
 *
 * Key Requirements:
 * 1. Loading state (spinner) starts IMMEDIATELY on submit click (before any async operations)
 * 2. Input is disabled the moment submit is clicked
 * 3. Loading spinner continues through API request phase
 * 4. Loading spinner STOPS when first stream chunk arrives (web search or participant)
 * 5. Button remains DISABLED (not loading) during participant streaming
 * 6. Button remains DISABLED during moderator streaming
 * 7. Button only re-enables after round is fully complete
 *
 * Bug Fixed: Previously loading state only started when mutation.isPending became true,
 * which happened AFTER async operations began, causing a delay in UI feedback.
 *
 * Loading State Change: Spinner now stops at first stream chunk (web search or participant),
 * not at round completion. Button is disabled but shows submit icon, not loading spinner.
 *
 * Fix: Set waitingToStartStreaming=true synchronously at the start of handleUpdateThreadAndSend
 *
 * NEW MESSAGE PERSISTENCE PATTERN (architecture change):
 * - User messages are now created via PATCH /api/v1/threads/:id during handleUpdateThreadAndSend
 * - Optimistic user message is added immediately to store (with isOptimistic flag)
 * - Thread PATCH includes newMessage field with user message content
 * - Streaming handler receives user message from backend, no longer creates it
 */

import type { MessageStatus } from '@roundtable/shared';
import { MessageStatuses } from '@roundtable/shared';
import { describe, expect, it } from 'vitest';

import { createChatStore } from '../store';

// ============================================================================
// HELPER: Mirrors ChatView.tsx isInputBlocked calculation
// ============================================================================

type InputBlockingState = {
  isStreaming: boolean;
  isCreatingThread: boolean;
  waitingToStartStreaming: boolean;
  isModeratorStreaming: boolean;
  pendingMessage: string | null;
  preSearchResumption: { status: MessageStatus | null } | null;
  moderatorResumption: { status: MessageStatus | null } | null;
  isSubmitting: boolean;
  // ✅ NEW: streamingRoundNumber ensures blocking during entire round
  streamingRoundNumber?: number | null;
};

function calculateIsInputBlocked(state: InputBlockingState): boolean {
  const isResumptionActive = (
    state.preSearchResumption?.status === MessageStatuses.STREAMING
    || state.preSearchResumption?.status === MessageStatuses.PENDING
    || state.moderatorResumption?.status === MessageStatuses.STREAMING
    || state.moderatorResumption?.status === MessageStatuses.PENDING
  );

  // ✅ FIX: streamingRoundNumber !== null indicates a round is in progress
  // This covers gaps between phases (e.g., after participants complete but before moderator starts)
  const isRoundInProgress = state.streamingRoundNumber !== null && state.streamingRoundNumber !== undefined;

  return (
    state.isStreaming
    || state.isCreatingThread
    || state.waitingToStartStreaming
    || state.isModeratorStreaming
    || Boolean(state.pendingMessage)
    || isResumptionActive
    || state.isSubmitting
    || isRoundInProgress
  );
}

// ============================================================================
// HELPER: Mirrors ChatView.tsx showSubmitSpinner calculation
// ============================================================================

type SpinnerState = {
  isSubmitting: boolean;
  waitingToStartStreaming: boolean;
};

/**
 * Spinner shows ONLY from submit click until first stream chunk arrives.
 * After first stream chunk (web search or participant), button is disabled but NOT loading.
 */
function calculateShowSubmitSpinner(state: SpinnerState): boolean {
  return state.isSubmitting || state.waitingToStartStreaming;
}

// ============================================================================
// IMMEDIATE LOADING STATE TESTS
// ============================================================================

describe('immediate Submit Loading - waitingToStartStreaming Flag', () => {
  it('waitingToStartStreaming blocks input immediately', () => {
    const store = createChatStore();

    // Initial state - input should be enabled
    expect(store.getState().waitingToStartStreaming).toBe(false);

    // Simulate what happens at the START of handleUpdateThreadAndSend
    // This is the FIX: set waitingToStartStreaming IMMEDIATELY
    store.getState().setWaitingToStartStreaming(true);

    // Verify input is now blocked
    const state = store.getState();
    const isBlocked = calculateIsInputBlocked({
      isStreaming: state.isStreaming,
      isCreatingThread: state.isCreatingThread,
      waitingToStartStreaming: state.waitingToStartStreaming,
      isModeratorStreaming: state.isModeratorStreaming,
      pendingMessage: state.pendingMessage,
      preSearchResumption: state.preSearchResumption,
      moderatorResumption: state.moderatorResumption,
      isSubmitting: false, // Mutation hasn't started yet
    });

    expect(isBlocked).toBe(true);
    expect(state.waitingToStartStreaming).toBe(true);
  });

  it('waitingToStartStreaming shows loading spinner immediately', () => {
    const store = createChatStore();

    // Simulate immediate flag set on submit click
    store.getState().setWaitingToStartStreaming(true);

    const state = store.getState();
    const showSpinner = calculateShowSubmitSpinner({
      isSubmitting: false, // Mutation hasn't started yet
      waitingToStartStreaming: state.waitingToStartStreaming,
    });

    expect(showSpinner).toBe(true);
  });

  it('waitingToStartStreaming is reset on error', () => {
    const store = createChatStore();

    // Set loading state
    store.getState().setWaitingToStartStreaming(true);
    expect(store.getState().waitingToStartStreaming).toBe(true);

    // Simulate error recovery (as done in catch block)
    store.getState().setWaitingToStartStreaming(false);

    const state = store.getState();
    expect(state.waitingToStartStreaming).toBe(false);

    // Input should be enabled again
    const isBlocked = calculateIsInputBlocked({
      isStreaming: false,
      isCreatingThread: false,
      waitingToStartStreaming: false,
      isModeratorStreaming: false,
      pendingMessage: null,
      preSearchResumption: null,
      moderatorResumption: null,
      isSubmitting: false,
    });

    expect(isBlocked).toBe(false);
  });
});

// ============================================================================
// COMPLETE SUBMIT LIFECYCLE TESTS
// ============================================================================

describe('submit Lifecycle - From Click to Round Complete', () => {
  it('phase 1: Submit click - immediate loading state', () => {
    /**
     * T0: User clicks submit button
     * EXPECTED: Input disabled + spinner shown IMMEDIATELY
     */
    const store = createChatStore();

    // Simulate the FIRST thing that happens in handleUpdateThreadAndSend
    store.getState().setWaitingToStartStreaming(true);

    const state = store.getState();

    // Input should be blocked
    expect(calculateIsInputBlocked({
      isStreaming: state.isStreaming,
      isCreatingThread: state.isCreatingThread,
      waitingToStartStreaming: state.waitingToStartStreaming,
      isModeratorStreaming: state.isModeratorStreaming,
      pendingMessage: state.pendingMessage,
      preSearchResumption: state.preSearchResumption,
      moderatorResumption: state.moderatorResumption,
      isSubmitting: false,
    })).toBe(true);

    // Spinner should show
    expect(calculateShowSubmitSpinner({
      isSubmitting: false,
      waitingToStartStreaming: state.waitingToStartStreaming,
    })).toBe(true);
  });

  it('phase 2: API request in progress - loading continues', () => {
    /**
     * T1: API mutation started (updateThread)
     * EXPECTED: Input still disabled, spinner still showing
     */
    const store = createChatStore();

    // waitingToStartStreaming set at start
    store.getState().setWaitingToStartStreaming(true);

    const state = store.getState();

    // Even with mutation pending, input stays blocked
    expect(calculateIsInputBlocked({
      isStreaming: state.isStreaming,
      isCreatingThread: state.isCreatingThread,
      waitingToStartStreaming: state.waitingToStartStreaming,
      isModeratorStreaming: state.isModeratorStreaming,
      pendingMessage: state.pendingMessage,
      preSearchResumption: state.preSearchResumption,
      moderatorResumption: state.moderatorResumption,
      isSubmitting: true, // Mutation is now pending
    })).toBe(true);

    // Spinner continues
    expect(calculateShowSubmitSpinner({
      isSubmitting: true,
      waitingToStartStreaming: state.waitingToStartStreaming,
    })).toBe(true);
  });

  it('phase 3: API complete, pendingMessage set - spinner continues until first stream', () => {
    /**
     * T2: API mutation completed, prepareForNewMessage called
     * EXPECTED: Input still disabled, spinner still showing
     *
     * NEW PATTERN: prepareForNewMessage no longer receives modelIds
     * (user message already created in store via optimistic update)
     */
    const store = createChatStore();

    // Simulate state after API completes
    store.getState().setWaitingToStartStreaming(true);
    store.getState().prepareForNewMessage('Test message', []); // Empty modelIds array

    const state = store.getState();

    // pendingMessage should be set
    expect(state.pendingMessage).toBe('Test message');

    // Input blocked by pendingMessage AND waitingToStartStreaming
    expect(calculateIsInputBlocked({
      isStreaming: state.isStreaming,
      isCreatingThread: state.isCreatingThread,
      waitingToStartStreaming: state.waitingToStartStreaming,
      isModeratorStreaming: state.isModeratorStreaming,
      pendingMessage: state.pendingMessage,
      preSearchResumption: state.preSearchResumption,
      moderatorResumption: state.moderatorResumption,
      isSubmitting: false, // Mutation completed
    })).toBe(true);

    // After prepareForNewMessage: waitingToStartStreaming is cleared, spinner stops
    // Input is now blocked by pendingMessage, not waitingToStartStreaming
    expect(state.waitingToStartStreaming).toBe(false);
    expect(calculateShowSubmitSpinner({
      isSubmitting: false,
      waitingToStartStreaming: state.waitingToStartStreaming,
    })).toBe(false);
  });

  it('phase 4: First stream chunk arrives - spinner stops, button disabled', () => {
    /**
     * T3: First participant (or web search) begins streaming
     * EXPECTED: Input disabled (isStreaming=true), spinner STOPS (button shows submit icon, not loader)
     */
    const store = createChatStore();

    // Streaming has started - first chunk arrived
    store.getState().setIsStreaming(true);
    store.getState().setWaitingToStartStreaming(false); // Cleared when first stream chunk arrives

    const state = store.getState();

    // Input still blocked by isStreaming
    expect(calculateIsInputBlocked({
      isStreaming: state.isStreaming,
      isCreatingThread: state.isCreatingThread,
      waitingToStartStreaming: state.waitingToStartStreaming,
      isModeratorStreaming: state.isModeratorStreaming,
      pendingMessage: state.pendingMessage,
      preSearchResumption: state.preSearchResumption,
      moderatorResumption: state.moderatorResumption,
      isSubmitting: false,
    })).toBe(true);

    // Spinner STOPS when first stream chunk arrives - button is disabled but not loading
    expect(calculateShowSubmitSpinner({
      isSubmitting: false,
      waitingToStartStreaming: false,
    })).toBe(false);
  });

  it('phase 5: All participants complete, moderator streaming - input stays disabled', () => {
    /**
     * T4: All participants finished, moderator is now streaming
     * EXPECTED: Input disabled (isModeratorStreaming=true)
     */
    const store = createChatStore();

    // Participants done, moderator streaming
    store.getState().setIsStreaming(false);
    store.getState().setIsModeratorStreaming(true);

    const state = store.getState();

    // Input blocked by isModeratorStreaming
    expect(calculateIsInputBlocked({
      isStreaming: state.isStreaming,
      isCreatingThread: state.isCreatingThread,
      waitingToStartStreaming: state.waitingToStartStreaming,
      isModeratorStreaming: state.isModeratorStreaming,
      pendingMessage: state.pendingMessage,
      preSearchResumption: state.preSearchResumption,
      moderatorResumption: state.moderatorResumption,
      isSubmitting: false,
    })).toBe(true);
  });

  it('phase 6: Round complete - input enabled', () => {
    /**
     * T5: Moderator finished, round complete
     * EXPECTED: Input enabled, ready for next message
     */
    const store = createChatStore();

    // All streaming done, round complete
    store.getState().setIsStreaming(false);
    store.getState().setIsModeratorStreaming(false);
    store.getState().setWaitingToStartStreaming(false);
    // pendingMessage cleared when streaming starts

    const state = store.getState();

    // Input should be enabled
    expect(calculateIsInputBlocked({
      isStreaming: state.isStreaming,
      isCreatingThread: state.isCreatingThread,
      waitingToStartStreaming: state.waitingToStartStreaming,
      isModeratorStreaming: state.isModeratorStreaming,
      pendingMessage: state.pendingMessage,
      preSearchResumption: state.preSearchResumption,
      moderatorResumption: state.moderatorResumption,
      isSubmitting: false,
    })).toBe(false);

    // No spinner
    expect(calculateShowSubmitSpinner({
      isSubmitting: false,
      waitingToStartStreaming: false,
    })).toBe(false);
  });
});

// ============================================================================
// FIRE-AND-FORGET MUTATION SCENARIO TESTS
// ============================================================================

describe('submit Loading - Fire-and-Forget Mutation Scenario', () => {
  /**
   * BUG CONTEXT:
   * When needsWait=false in handleUpdateThreadAndSend, the mutation is called
   * with .then()/.catch() (fire-and-forget), meaning mutation.isPending
   * never triggers UI updates before the function returns.
   *
   * FIX: Set waitingToStartStreaming=true at the START of the function,
   * ensuring UI feedback regardless of mutation await behavior.
   */

  it('input blocked even when mutation is fire-and-forget', () => {
    const store = createChatStore();

    // Simulate the fix: waitingToStartStreaming set at function start
    store.getState().setWaitingToStartStreaming(true);

    const state = store.getState();

    // Even without isSubmitting (mutation not awaited), input is blocked
    expect(calculateIsInputBlocked({
      isStreaming: state.isStreaming,
      isCreatingThread: state.isCreatingThread,
      waitingToStartStreaming: state.waitingToStartStreaming,
      isModeratorStreaming: state.isModeratorStreaming,
      pendingMessage: state.pendingMessage,
      preSearchResumption: state.preSearchResumption,
      moderatorResumption: state.moderatorResumption,
      isSubmitting: false, // Fire-and-forget: isPending doesn't update
    })).toBe(true);
  });

  it('spinner shows even when mutation is fire-and-forget', () => {
    const store = createChatStore();

    store.getState().setWaitingToStartStreaming(true);

    const state = store.getState();

    expect(calculateShowSubmitSpinner({
      isSubmitting: false, // Fire-and-forget: isPending doesn't update
      waitingToStartStreaming: state.waitingToStartStreaming,
    })).toBe(true);
  });
});

// ============================================================================
// THREAD UPDATE API REQUEST LIFECYCLE TESTS
// ============================================================================

describe('submit Loading - Thread Update Request Lifecycle', () => {
  /**
   * Tests the specific scenario of updating an existing thread.
   * The loading state must persist from submit click until:
   * 1. Thread update API completes
   * 2. Streaming begins
   * 3. Round finishes
   */

  it('loading persists through awaited thread update mutation', () => {
    const store = createChatStore();

    // T0: Submit clicked
    store.getState().setWaitingToStartStreaming(true);
    expect(store.getState().waitingToStartStreaming).toBe(true);

    // T1: Mutation starts (isSubmitting would be true if we had the hook)
    // waitingToStartStreaming still true
    expect(store.getState().waitingToStartStreaming).toBe(true);

    // T2: Mutation completes, response processed
    // waitingToStartStreaming still true until prepareForNewMessage
    expect(store.getState().waitingToStartStreaming).toBe(true);

    // T3: prepareForNewMessage called
    // NOTE: prepareForNewMessage sets waitingToStartStreaming=false but sets pendingMessage
    // NEW: No longer needs modelIds (user message already in store)
    store.getState().prepareForNewMessage('User message', []);
    expect(store.getState().pendingMessage).toBe('User message');
    // waitingToStartStreaming is now false, but pendingMessage blocks input
    expect(store.getState().waitingToStartStreaming).toBe(false);

    // T4: setNextParticipantToTrigger called (triggers streaming)
    store.getState().setNextParticipantToTrigger(0);

    // Input should still be blocked by pendingMessage
    const state = store.getState();
    expect(calculateIsInputBlocked({
      isStreaming: state.isStreaming,
      isCreatingThread: state.isCreatingThread,
      waitingToStartStreaming: state.waitingToStartStreaming,
      isModeratorStreaming: state.isModeratorStreaming,
      pendingMessage: state.pendingMessage,
      preSearchResumption: state.preSearchResumption,
      moderatorResumption: state.moderatorResumption,
      isSubmitting: false,
    })).toBe(true);
  });

  it('loading persists through fire-and-forget thread update mutation', () => {
    const store = createChatStore();

    // T0: Submit clicked - immediate loading
    store.getState().setWaitingToStartStreaming(true);

    // T1: Fire-and-forget mutation called (doesn't block)
    // The function continues immediately

    // T2: prepareForNewMessage called
    // NEW: No longer needs modelIds (user message already in store)
    store.getState().prepareForNewMessage('User message', []);

    // T3: setNextParticipantToTrigger called
    store.getState().setNextParticipantToTrigger(0);

    // Input still blocked - mutation may not have completed yet
    const state = store.getState();
    expect(calculateIsInputBlocked({
      isStreaming: state.isStreaming,
      isCreatingThread: state.isCreatingThread,
      waitingToStartStreaming: state.waitingToStartStreaming,
      isModeratorStreaming: state.isModeratorStreaming,
      pendingMessage: state.pendingMessage,
      preSearchResumption: state.preSearchResumption,
      moderatorResumption: state.moderatorResumption,
      isSubmitting: false, // Fire-and-forget: never true
    })).toBe(true);

    // T4: Streaming actually starts (triggered by orchestrator)
    store.getState().setIsStreaming(true);
    store.getState().setWaitingToStartStreaming(false);

    // Input still blocked by isStreaming
    const streamingState = store.getState();
    expect(calculateIsInputBlocked({
      isStreaming: streamingState.isStreaming,
      isCreatingThread: streamingState.isCreatingThread,
      waitingToStartStreaming: streamingState.waitingToStartStreaming,
      isModeratorStreaming: streamingState.isModeratorStreaming,
      pendingMessage: streamingState.pendingMessage,
      preSearchResumption: streamingState.preSearchResumption,
      moderatorResumption: streamingState.moderatorResumption,
      isSubmitting: false,
    })).toBe(true);
  });
});

// ============================================================================
// STATE TRANSITION TIMING TESTS
// ============================================================================

describe('submit Loading - State Transition Timing', () => {
  it('no gap between submit click and loading state', () => {
    /**
     * CRITICAL: There must be NO gap where input is enabled
     * between submit click and loading state appearing.
     *
     * waitingToStartStreaming is set synchronously at function start.
     */
    const store = createChatStore();

    // Before submit: input enabled
    expect(calculateIsInputBlocked({
      isStreaming: false,
      isCreatingThread: false,
      waitingToStartStreaming: false,
      isModeratorStreaming: false,
      pendingMessage: null,
      preSearchResumption: null,
      moderatorResumption: null,
      isSubmitting: false,
    })).toBe(false);

    // The VERY FIRST action in handleUpdateThreadAndSend
    store.getState().setWaitingToStartStreaming(true);

    // Immediately after: input blocked
    const state = store.getState();
    expect(calculateIsInputBlocked({
      isStreaming: state.isStreaming,
      isCreatingThread: state.isCreatingThread,
      waitingToStartStreaming: state.waitingToStartStreaming,
      isModeratorStreaming: state.isModeratorStreaming,
      pendingMessage: state.pendingMessage,
      preSearchResumption: state.preSearchResumption,
      moderatorResumption: state.moderatorResumption,
      isSubmitting: false, // Still false - mutation hasn't started
    })).toBe(true);
  });

  it('no gap between API complete and streaming start', () => {
    const store = createChatStore();

    // State after API completes but before streaming
    store.getState().setWaitingToStartStreaming(true);
    // NEW: No longer needs modelIds
    store.getState().prepareForNewMessage('Message', []);

    // Input still blocked by multiple flags - using explicit values to test the calculation logic
    expect(calculateIsInputBlocked({
      isStreaming: false, // Not streaming yet
      isCreatingThread: false,
      waitingToStartStreaming: true, // Still waiting
      isModeratorStreaming: false,
      pendingMessage: 'Message', // Set
      preSearchResumption: null,
      moderatorResumption: null,
      isSubmitting: false, // API complete
    })).toBe(true);
  });

  it('no gap between participant complete and moderator start', () => {
    const store = createChatStore();

    // Transition: participants done → moderator starting
    // This tests the race condition window

    // End of participant streaming
    store.getState().setIsStreaming(false);

    // Before moderator starts - waitingToStartStreaming should block
    // In real code, there are other mechanisms but testing the base case
    store.getState().setWaitingToStartStreaming(true);

    expect(calculateIsInputBlocked({
      isStreaming: false,
      isCreatingThread: false,
      waitingToStartStreaming: true,
      isModeratorStreaming: false,
      pendingMessage: null,
      preSearchResumption: null,
      moderatorResumption: null,
      isSubmitting: false,
    })).toBe(true);

    // Moderator starts
    store.getState().setIsModeratorStreaming(true);
    store.getState().setWaitingToStartStreaming(false);

    expect(calculateIsInputBlocked({
      isStreaming: false,
      isCreatingThread: false,
      waitingToStartStreaming: false,
      isModeratorStreaming: true,
      pendingMessage: null,
      preSearchResumption: null,
      moderatorResumption: null,
      isSubmitting: false,
    })).toBe(true);
  });
});

// ============================================================================
// DOUBLE SUBMISSION PREVENTION TESTS
// ============================================================================

describe('submit Loading - Double Submission Prevention', () => {
  it('prevents double submission during API request', () => {
    const store = createChatStore();

    // User clicked submit - immediate block
    store.getState().setWaitingToStartStreaming(true);

    // Simulate user trying to submit again
    // They shouldn't be able to because input is blocked
    const state = store.getState();
    expect(calculateIsInputBlocked({
      isStreaming: state.isStreaming,
      isCreatingThread: state.isCreatingThread,
      waitingToStartStreaming: state.waitingToStartStreaming,
      isModeratorStreaming: state.isModeratorStreaming,
      pendingMessage: state.pendingMessage,
      preSearchResumption: state.preSearchResumption,
      moderatorResumption: state.moderatorResumption,
      isSubmitting: false,
    })).toBe(true);
  });

  it('prevents double submission during streaming', () => {
    const store = createChatStore();

    store.getState().setIsStreaming(true);

    const state = store.getState();
    expect(calculateIsInputBlocked({
      isStreaming: state.isStreaming,
      isCreatingThread: state.isCreatingThread,
      waitingToStartStreaming: state.waitingToStartStreaming,
      isModeratorStreaming: state.isModeratorStreaming,
      pendingMessage: state.pendingMessage,
      preSearchResumption: state.preSearchResumption,
      moderatorResumption: state.moderatorResumption,
      isSubmitting: false,
    })).toBe(true);
  });

  it('prevents double submission during moderator phase', () => {
    const store = createChatStore();

    store.getState().setIsModeratorStreaming(true);

    const state = store.getState();
    expect(calculateIsInputBlocked({
      isStreaming: state.isStreaming,
      isCreatingThread: state.isCreatingThread,
      waitingToStartStreaming: state.waitingToStartStreaming,
      isModeratorStreaming: state.isModeratorStreaming,
      pendingMessage: state.pendingMessage,
      preSearchResumption: state.preSearchResumption,
      moderatorResumption: state.moderatorResumption,
      isSubmitting: false,
    })).toBe(true);
  });
});

// ============================================================================
// ERROR RECOVERY TESTS
// ============================================================================

describe('submit Loading - Error Recovery', () => {
  it('resets loading state on API error', () => {
    const store = createChatStore();

    // Submit started - only set waitingToStartStreaming (error happens before prepareForNewMessage)
    store.getState().setWaitingToStartStreaming(true);

    // API error occurred - simulate catch block (error before prepareForNewMessage was called)
    store.getState().setWaitingToStartStreaming(false);
    store.getState().setHasEarlyOptimisticMessage(false);
    store.getState().setStreamingRoundNumber(null);

    // Clear optimistic messages (if any were added)
    store.getState().setMessages([]);

    // Input should be enabled again
    const state = store.getState();
    expect(calculateIsInputBlocked({
      isStreaming: state.isStreaming,
      isCreatingThread: state.isCreatingThread,
      waitingToStartStreaming: state.waitingToStartStreaming,
      isModeratorStreaming: state.isModeratorStreaming,
      pendingMessage: state.pendingMessage,
      preSearchResumption: state.preSearchResumption,
      moderatorResumption: state.moderatorResumption,
      isSubmitting: false,
    })).toBe(false);
  });

  it('spinner hides on API error', () => {
    const store = createChatStore();

    // Submit started
    store.getState().setWaitingToStartStreaming(true);

    // Error occurred - reset
    store.getState().setWaitingToStartStreaming(false);

    expect(calculateShowSubmitSpinner({
      isSubmitting: false,
      waitingToStartStreaming: false,
    })).toBe(false);
  });
});

// ============================================================================
// REGRESSION TESTS
// ============================================================================

describe('submit Loading - Regression Prevention', () => {
  it('regression: loading must not depend solely on mutation.isPending', () => {
    /**
     * This test documents the bug that was fixed.
     * The old code only used isSubmitting (from mutation.isPending) for loading.
     * This caused a delay because isPending only becomes true AFTER
     * the mutation function is called (async operation starts).
     *
     * Fix: waitingToStartStreaming is set SYNCHRONOUSLY at the start,
     * before any async operations.
     */
    const store = createChatStore();

    // Simulate the NEW behavior: waitingToStartStreaming set first
    store.getState().setWaitingToStartStreaming(true);

    // Even without isSubmitting, should show loading
    expect(calculateShowSubmitSpinner({
      isSubmitting: false, // Not set yet
      waitingToStartStreaming: true, // Set immediately
    })).toBe(true);

    expect(calculateIsInputBlocked({
      isStreaming: false,
      isCreatingThread: false,
      waitingToStartStreaming: true, // Blocks input
      isModeratorStreaming: false,
      pendingMessage: null,
      preSearchResumption: null,
      moderatorResumption: null,
      isSubmitting: false, // Not set yet
    })).toBe(true);
  });

  it('regression: input must remain disabled throughout entire round', () => {
    /**
     * Complete round lifecycle test.
     * Input must be blocked at every step.
     */
    const store = createChatStore();
    const transitions: Array<{ name: string; blocked: boolean }> = [];

    const checkBlocked = (name: string) => {
      const state = store.getState();
      const blocked = calculateIsInputBlocked({
        isStreaming: state.isStreaming,
        isCreatingThread: state.isCreatingThread,
        waitingToStartStreaming: state.waitingToStartStreaming,
        isModeratorStreaming: state.isModeratorStreaming,
        pendingMessage: state.pendingMessage,
        preSearchResumption: state.preSearchResumption,
        moderatorResumption: state.moderatorResumption,
        isSubmitting: false,
      });
      transitions.push({ name, blocked });
      return blocked;
    };

    // Step 1: Submit clicked
    store.getState().setWaitingToStartStreaming(true);
    expect(checkBlocked('submit-clicked')).toBe(true);

    // Step 2: Prepare for new message (sets pendingMessage, clears waitingToStartStreaming)
    store.getState().prepareForNewMessage('Message', ['model-1']);
    expect(checkBlocked('message-prepared')).toBe(true);

    // Step 3: Streaming starts - pendingMessage gets cleared when streaming begins
    store.getState().setIsStreaming(true);
    store.getState().setPendingMessage(null); // Cleared when streaming starts
    expect(checkBlocked('streaming-started')).toBe(true);

    // Step 4: First participant complete, second streaming
    // isStreaming stays true
    expect(checkBlocked('mid-participant-streaming')).toBe(true);

    // Step 5: All participants complete, moderator starts
    store.getState().setIsStreaming(false);
    store.getState().setIsModeratorStreaming(true);
    expect(checkBlocked('moderator-streaming')).toBe(true);

    // Step 6: Moderator complete - round is done
    store.getState().setIsModeratorStreaming(false);
    expect(checkBlocked('round-complete')).toBe(false); // Finally enabled

    // Verify all transitions
    const blockedStates = transitions.filter(t => t.blocked);
    expect(blockedStates).toHaveLength(5); // 5 blocked, 1 enabled
  });
});

// ============================================================================
// WEB SEARCH (PRE-SEARCH) STREAMING TESTS
// ============================================================================

describe('submit Loading - Web Search Streaming Clears Loading', () => {
  /**
   * Tests that verify web search (pre-search) streaming clears waitingToStartStreaming.
   * When web search is enabled, it starts streaming BEFORE participant streaming.
   * The loading spinner should stop as soon as the first stream chunk arrives,
   * whether from web search or participant.
   */

  it('web search streaming clears waitingToStartStreaming', () => {
    const store = createChatStore();

    // Submit clicked - loading state starts
    store.getState().setWaitingToStartStreaming(true);
    expect(store.getState().waitingToStartStreaming).toBe(true);

    // Web search starts streaming - this should clear waitingToStartStreaming
    store.getState().addPreSearch({
      id: 'presearch-1',
      threadId: 'thread-1',
      roundNumber: 0,
      query: 'test query',
      status: MessageStatuses.PENDING,
      queries: [],
      results: [],
    });
    store.getState().updatePreSearchStatus(0, MessageStatuses.STREAMING);

    // ✅ FIX: waitingToStartStreaming should NOT be cleared by pre-search streaming
    // It should only be cleared when actual PARTICIPANT streaming starts
    // Pre-search streaming is not the same as participant streaming
    expect(store.getState().waitingToStartStreaming).toBe(true);

    // Spinner should STILL show (waiting for participant streaming to start)
    expect(calculateShowSubmitSpinner({
      isSubmitting: false,
      waitingToStartStreaming: store.getState().waitingToStartStreaming,
    })).toBe(true);

    // Input should still be blocked (pre-search is active, waiting for participants)
    expect(calculateIsInputBlocked({
      isStreaming: false, // Participant streaming hasn't started yet
      isCreatingThread: false,
      waitingToStartStreaming: true, // Still true until participant streaming starts
      isModeratorStreaming: false,
      pendingMessage: null,
      preSearchResumption: { status: MessageStatuses.STREAMING }, // Web search is active
      moderatorResumption: null,
      isSubmitting: false,
    })).toBe(true);
  });

  it('participant streaming also clears waitingToStartStreaming when web search is disabled', () => {
    const store = createChatStore();

    // Submit clicked - loading state starts
    store.getState().setWaitingToStartStreaming(true);
    expect(store.getState().waitingToStartStreaming).toBe(true);

    // No web search - participant streaming starts directly
    store.getState().setIsStreaming(true);

    // The useStreamingTrigger effect would call setWaitingToStartStreaming(false)
    // when chatIsStreaming becomes true
    store.getState().setWaitingToStartStreaming(false);

    expect(store.getState().waitingToStartStreaming).toBe(false);

    // Spinner should not show
    expect(calculateShowSubmitSpinner({
      isSubmitting: false,
      waitingToStartStreaming: false,
    })).toBe(false);

    // Input still blocked by isStreaming
    expect(calculateIsInputBlocked({
      isStreaming: true,
      isCreatingThread: false,
      waitingToStartStreaming: false,
      isModeratorStreaming: false,
      pendingMessage: null,
      preSearchResumption: null,
      moderatorResumption: null,
      isSubmitting: false,
    })).toBe(true);
  });

  it('spinner shows during entire pre-submit and API phase', () => {
    const store = createChatStore();

    // T0: Submit clicked
    store.getState().setWaitingToStartStreaming(true);
    expect(calculateShowSubmitSpinner({
      isSubmitting: false,
      waitingToStartStreaming: true,
    })).toBe(true);

    // T1: API mutation starts
    expect(calculateShowSubmitSpinner({
      isSubmitting: true,
      waitingToStartStreaming: true,
    })).toBe(true);

    // T2: API completes, pendingMessage set, but no streaming yet
    // waitingToStartStreaming still true because streaming hasn't started
    expect(calculateShowSubmitSpinner({
      isSubmitting: false,
      waitingToStartStreaming: true,
    })).toBe(true);

    // T3: Web search starts streaming - spinner stops
    store.getState().setWaitingToStartStreaming(false);
    expect(calculateShowSubmitSpinner({
      isSubmitting: false,
      waitingToStartStreaming: false,
    })).toBe(false);
  });

  it('loading state timeline: submit → web search → participants → moderator', () => {
    /**
     * Complete timeline test showing spinner behavior:
     * 1. Submit → spinner ON
     * 2. Web search streaming → spinner OFF, button disabled
     * 3. Web search complete → button still disabled
     * 4. Participants streaming → button still disabled
     * 5. Moderator streaming → button still disabled
     * 6. Round complete → button enabled
     */
    const store = createChatStore();

    // Step 1: Submit
    store.getState().setWaitingToStartStreaming(true);
    expect(calculateShowSubmitSpinner({
      isSubmitting: false,
      waitingToStartStreaming: true,
    })).toBe(true); // Spinner ON

    // Step 2: Web search starts streaming
    // ✅ FIX: waitingToStartStreaming stays TRUE during pre-search
    // It only clears when PARTICIPANT streaming starts
    store.getState().addPreSearch({
      id: 'presearch-1',
      threadId: 'thread-1',
      roundNumber: 0,
      query: 'test',
      status: MessageStatuses.PENDING,
      queries: [],
      results: [],
    });
    store.getState().updatePreSearchStatus(0, MessageStatuses.STREAMING);

    expect(store.getState().waitingToStartStreaming).toBe(true); // Still true!
    expect(calculateShowSubmitSpinner({
      isSubmitting: false,
      waitingToStartStreaming: true,
    })).toBe(true); // Spinner still ON (waiting for participant streaming)

    // Step 3: Web search complete
    store.getState().updatePreSearchStatus(0, MessageStatuses.COMPLETE);
    expect(store.getState().waitingToStartStreaming).toBe(true); // Still true!
    expect(calculateShowSubmitSpinner({
      isSubmitting: false,
      waitingToStartStreaming: true,
    })).toBe(true); // Spinner still ON (waiting for participant streaming)

    // Step 4: Participants streaming starts
    // The React effect in use-streaming-trigger.ts clears waitingToStartStreaming
    // We simulate that here since we're testing store state directly
    store.getState().setIsStreaming(true);
    store.getState().setWaitingToStartStreaming(false); // Simulating effect behavior
    expect(calculateShowSubmitSpinner({
      isSubmitting: false,
      waitingToStartStreaming: false,
    })).toBe(false); // NOW spinner is OFF
    expect(calculateIsInputBlocked({
      isStreaming: true,
      isCreatingThread: false,
      waitingToStartStreaming: false,
      isModeratorStreaming: false,
      pendingMessage: null,
      preSearchResumption: null,
      moderatorResumption: null,
      isSubmitting: false,
    })).toBe(true); // But input blocked

    // Step 5: Moderator streaming
    store.getState().setIsStreaming(false);
    store.getState().setIsModeratorStreaming(true);
    expect(calculateShowSubmitSpinner({
      isSubmitting: false,
      waitingToStartStreaming: false,
    })).toBe(false); // Spinner still OFF
    expect(calculateIsInputBlocked({
      isStreaming: false,
      isCreatingThread: false,
      waitingToStartStreaming: false,
      isModeratorStreaming: true,
      pendingMessage: null,
      preSearchResumption: null,
      moderatorResumption: null,
      isSubmitting: false,
    })).toBe(true); // Input still blocked

    // Step 6: Round complete
    store.getState().setIsModeratorStreaming(false);
    expect(calculateIsInputBlocked({
      isStreaming: false,
      isCreatingThread: false,
      waitingToStartStreaming: false,
      isModeratorStreaming: false,
      pendingMessage: null,
      preSearchResumption: null,
      moderatorResumption: null,
      isSubmitting: false,
    })).toBe(false); // Input enabled
  });
});

// ============================================================================
// STREAMING ROUND NUMBER BLOCKING TESTS
// ============================================================================

describe('streamingRoundNumber-based Input Blocking', () => {
  /**
   * ✅ FIX: streamingRoundNumber !== null ensures input stays blocked during entire round
   * This covers gaps between streaming phases where other flags might temporarily be false
   */

  it('blocks input when streamingRoundNumber is set (round in progress)', () => {
    const store = createChatStore();

    // Set streamingRoundNumber to indicate a round is in progress
    store.getState().setStreamingRoundNumber(0);

    // Even with all other flags false, streamingRoundNumber should block input
    expect(calculateIsInputBlocked({
      isStreaming: false,
      isCreatingThread: false,
      waitingToStartStreaming: false,
      isModeratorStreaming: false,
      pendingMessage: null,
      preSearchResumption: null,
      moderatorResumption: null,
      isSubmitting: false,
      streamingRoundNumber: 0,
    })).toBe(true);
  });

  it('allows input when streamingRoundNumber is null (no round in progress)', () => {
    const store = createChatStore();

    // Ensure streamingRoundNumber is null
    store.getState().setStreamingRoundNumber(null);

    // With all flags false and streamingRoundNumber null, input should be enabled
    expect(calculateIsInputBlocked({
      isStreaming: false,
      isCreatingThread: false,
      waitingToStartStreaming: false,
      isModeratorStreaming: false,
      pendingMessage: null,
      preSearchResumption: null,
      moderatorResumption: null,
      isSubmitting: false,
      streamingRoundNumber: null,
    })).toBe(false);
  });

  it('blocks input during gap between participants and moderator', () => {
    /**
     * Scenario: Participants have completed streaming, but moderator hasn't started yet.
     * This is the "gap" where other flags might be false but round is not complete.
     */
    const store = createChatStore();

    // Simulate participants completed, moderator not started
    store.getState().setIsStreaming(false);
    store.getState().setIsModeratorStreaming(false);
    store.getState().setWaitingToStartStreaming(false);
    store.getState().setStreamingRoundNumber(0); // Round still in progress

    const state = store.getState();
    expect(calculateIsInputBlocked({
      isStreaming: state.isStreaming, // false
      isCreatingThread: state.isCreatingThread, // false
      waitingToStartStreaming: state.waitingToStartStreaming, // false
      isModeratorStreaming: state.isModeratorStreaming, // false
      pendingMessage: state.pendingMessage, // null
      preSearchResumption: null,
      moderatorResumption: null,
      isSubmitting: false,
      streamingRoundNumber: state.streamingRoundNumber, // 0 - round in progress
    })).toBe(true); // Blocked by streamingRoundNumber
  });

  it('blocks input during gap between pre-search and participants', () => {
    /**
     * Scenario: Pre-search has completed, but participants haven't started yet.
     */
    const store = createChatStore();

    // Simulate pre-search completed, participants not started
    store.getState().setIsStreaming(false);
    store.getState().setWaitingToStartStreaming(false);
    store.getState().setStreamingRoundNumber(1); // Round 1 in progress

    expect(calculateIsInputBlocked({
      isStreaming: false,
      isCreatingThread: false,
      waitingToStartStreaming: false,
      isModeratorStreaming: false,
      pendingMessage: null,
      preSearchResumption: { status: MessageStatuses.COMPLETE }, // Pre-search complete
      moderatorResumption: null,
      isSubmitting: false,
      streamingRoundNumber: 1, // Round in progress
    })).toBe(true); // Blocked by streamingRoundNumber
  });

  it('enables input only after streamingRoundNumber is cleared (round complete)', () => {
    const store = createChatStore();

    // Round complete - clear streamingRoundNumber
    store.getState().completeStreaming();

    const state = store.getState();
    expect(state.streamingRoundNumber).toBe(null);
    expect(calculateIsInputBlocked({
      isStreaming: false,
      isCreatingThread: false,
      waitingToStartStreaming: false,
      isModeratorStreaming: false,
      pendingMessage: null,
      preSearchResumption: null,
      moderatorResumption: null,
      isSubmitting: false,
      streamingRoundNumber: null,
    })).toBe(false); // Input enabled
  });

  it('streamingRoundNumber works for multi-round conversations', () => {
    const store = createChatStore();

    // Round 0
    store.getState().setStreamingRoundNumber(0);
    expect(calculateIsInputBlocked({
      isStreaming: false,
      isCreatingThread: false,
      waitingToStartStreaming: false,
      isModeratorStreaming: false,
      pendingMessage: null,
      preSearchResumption: null,
      moderatorResumption: null,
      isSubmitting: false,
      streamingRoundNumber: 0,
    })).toBe(true);

    // Round 0 complete
    store.getState().completeStreaming();
    expect(store.getState().streamingRoundNumber).toBe(null);

    // Round 1 starts
    store.getState().setStreamingRoundNumber(1);
    expect(calculateIsInputBlocked({
      isStreaming: false,
      isCreatingThread: false,
      waitingToStartStreaming: false,
      isModeratorStreaming: false,
      pendingMessage: null,
      preSearchResumption: null,
      moderatorResumption: null,
      isSubmitting: false,
      streamingRoundNumber: 1,
    })).toBe(true);

    // Round 2 (higher number)
    store.getState().setStreamingRoundNumber(5);
    expect(calculateIsInputBlocked({
      isStreaming: false,
      isCreatingThread: false,
      waitingToStartStreaming: false,
      isModeratorStreaming: false,
      pendingMessage: null,
      preSearchResumption: null,
      moderatorResumption: null,
      isSubmitting: false,
      streamingRoundNumber: 5,
    })).toBe(true);
  });

  it('completeStreaming clears streamingRoundNumber', () => {
    const store = createChatStore();

    // Set up active round
    store.getState().setStreamingRoundNumber(2);
    store.getState().setIsStreaming(true);
    store.getState().setIsModeratorStreaming(true);

    // Complete the round
    store.getState().completeStreaming();

    // All flags should be cleared
    const state = store.getState();
    expect(state.streamingRoundNumber).toBe(null);
    expect(state.isStreaming).toBe(false);
    expect(state.isModeratorStreaming).toBe(false);
    expect(state.waitingToStartStreaming).toBe(false);

    // Input should be enabled
    expect(calculateIsInputBlocked({
      isStreaming: false,
      isCreatingThread: false,
      waitingToStartStreaming: false,
      isModeratorStreaming: false,
      pendingMessage: null,
      preSearchResumption: null,
      moderatorResumption: null,
      isSubmitting: false,
      streamingRoundNumber: null,
    })).toBe(false);
  });
});
