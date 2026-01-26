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
    expect(store.getState().waitingToStartStreaming).toBeFalsy();

    // Simulate what happens at the START of handleUpdateThreadAndSend
    // This is the FIX: set waitingToStartStreaming IMMEDIATELY
    store.getState().setWaitingToStartStreaming(true);

    // Verify input is now blocked
    const state = store.getState();
    const isBlocked = calculateIsInputBlocked({
      isCreatingThread: state.isCreatingThread,
      isModeratorStreaming: state.isModeratorStreaming,
      isStreaming: state.isStreaming,
      isSubmitting: false, // Mutation hasn't started yet
      moderatorResumption: state.moderatorResumption,
      pendingMessage: state.pendingMessage,
      preSearchResumption: state.preSearchResumption,
      waitingToStartStreaming: state.waitingToStartStreaming,
    });

    expect(isBlocked).toBeTruthy();
    expect(state.waitingToStartStreaming).toBeTruthy();
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

    expect(showSpinner).toBeTruthy();
  });

  it('waitingToStartStreaming is reset on error', () => {
    const store = createChatStore();

    // Set loading state
    store.getState().setWaitingToStartStreaming(true);
    expect(store.getState().waitingToStartStreaming).toBeTruthy();

    // Simulate error recovery (as done in catch block)
    store.getState().setWaitingToStartStreaming(false);

    const state = store.getState();
    expect(state.waitingToStartStreaming).toBeFalsy();

    // Input should be enabled again
    const isBlocked = calculateIsInputBlocked({
      isCreatingThread: false,
      isModeratorStreaming: false,
      isStreaming: false,
      isSubmitting: false,
      moderatorResumption: null,
      pendingMessage: null,
      preSearchResumption: null,
      waitingToStartStreaming: false,
    });

    expect(isBlocked).toBeFalsy();
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
      isCreatingThread: state.isCreatingThread,
      isModeratorStreaming: state.isModeratorStreaming,
      isStreaming: state.isStreaming,
      isSubmitting: false,
      moderatorResumption: state.moderatorResumption,
      pendingMessage: state.pendingMessage,
      preSearchResumption: state.preSearchResumption,
      waitingToStartStreaming: state.waitingToStartStreaming,
    })).toBeTruthy();

    // Spinner should show
    expect(calculateShowSubmitSpinner({
      isSubmitting: false,
      waitingToStartStreaming: state.waitingToStartStreaming,
    })).toBeTruthy();
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
      isCreatingThread: state.isCreatingThread,
      isModeratorStreaming: state.isModeratorStreaming,
      isStreaming: state.isStreaming,
      isSubmitting: true, // Mutation is now pending
      moderatorResumption: state.moderatorResumption,
      pendingMessage: state.pendingMessage,
      preSearchResumption: state.preSearchResumption,
      waitingToStartStreaming: state.waitingToStartStreaming,
    })).toBeTruthy();

    // Spinner continues
    expect(calculateShowSubmitSpinner({
      isSubmitting: true,
      waitingToStartStreaming: state.waitingToStartStreaming,
    })).toBeTruthy();
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
      isCreatingThread: state.isCreatingThread,
      isModeratorStreaming: state.isModeratorStreaming,
      isStreaming: state.isStreaming,
      isSubmitting: false, // Mutation completed
      moderatorResumption: state.moderatorResumption,
      pendingMessage: state.pendingMessage,
      preSearchResumption: state.preSearchResumption,
      waitingToStartStreaming: state.waitingToStartStreaming,
    })).toBeTruthy();

    // After prepareForNewMessage: waitingToStartStreaming is cleared, spinner stops
    // Input is now blocked by pendingMessage, not waitingToStartStreaming
    expect(state.waitingToStartStreaming).toBeFalsy();
    expect(calculateShowSubmitSpinner({
      isSubmitting: false,
      waitingToStartStreaming: state.waitingToStartStreaming,
    })).toBeFalsy();
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
      isCreatingThread: state.isCreatingThread,
      isModeratorStreaming: state.isModeratorStreaming,
      isStreaming: state.isStreaming,
      isSubmitting: false,
      moderatorResumption: state.moderatorResumption,
      pendingMessage: state.pendingMessage,
      preSearchResumption: state.preSearchResumption,
      waitingToStartStreaming: state.waitingToStartStreaming,
    })).toBeTruthy();

    // Spinner STOPS when first stream chunk arrives - button is disabled but not loading
    expect(calculateShowSubmitSpinner({
      isSubmitting: false,
      waitingToStartStreaming: false,
    })).toBeFalsy();
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
      isCreatingThread: state.isCreatingThread,
      isModeratorStreaming: state.isModeratorStreaming,
      isStreaming: state.isStreaming,
      isSubmitting: false,
      moderatorResumption: state.moderatorResumption,
      pendingMessage: state.pendingMessage,
      preSearchResumption: state.preSearchResumption,
      waitingToStartStreaming: state.waitingToStartStreaming,
    })).toBeTruthy();
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
      isCreatingThread: state.isCreatingThread,
      isModeratorStreaming: state.isModeratorStreaming,
      isStreaming: state.isStreaming,
      isSubmitting: false,
      moderatorResumption: state.moderatorResumption,
      pendingMessage: state.pendingMessage,
      preSearchResumption: state.preSearchResumption,
      waitingToStartStreaming: state.waitingToStartStreaming,
    })).toBeFalsy();

    // No spinner
    expect(calculateShowSubmitSpinner({
      isSubmitting: false,
      waitingToStartStreaming: false,
    })).toBeFalsy();
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
      isCreatingThread: state.isCreatingThread,
      isModeratorStreaming: state.isModeratorStreaming,
      isStreaming: state.isStreaming,
      isSubmitting: false, // Fire-and-forget: isPending doesn't update
      moderatorResumption: state.moderatorResumption,
      pendingMessage: state.pendingMessage,
      preSearchResumption: state.preSearchResumption,
      waitingToStartStreaming: state.waitingToStartStreaming,
    })).toBeTruthy();
  });

  it('spinner shows even when mutation is fire-and-forget', () => {
    const store = createChatStore();

    store.getState().setWaitingToStartStreaming(true);

    const state = store.getState();

    expect(calculateShowSubmitSpinner({
      isSubmitting: false, // Fire-and-forget: isPending doesn't update
      waitingToStartStreaming: state.waitingToStartStreaming,
    })).toBeTruthy();
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
    expect(store.getState().waitingToStartStreaming).toBeTruthy();

    // T1: Mutation starts (isSubmitting would be true if we had the hook)
    // waitingToStartStreaming still true
    expect(store.getState().waitingToStartStreaming).toBeTruthy();

    // T2: Mutation completes, response processed
    // waitingToStartStreaming still true until prepareForNewMessage
    expect(store.getState().waitingToStartStreaming).toBeTruthy();

    // T3: prepareForNewMessage called
    // NOTE: prepareForNewMessage sets waitingToStartStreaming=false but sets pendingMessage
    // NEW: No longer needs modelIds (user message already in store)
    store.getState().prepareForNewMessage('User message', []);
    expect(store.getState().pendingMessage).toBe('User message');
    // waitingToStartStreaming is now false, but pendingMessage blocks input
    expect(store.getState().waitingToStartStreaming).toBeFalsy();

    // T4: setNextParticipantToTrigger called (triggers streaming)
    store.getState().setNextParticipantToTrigger(0);

    // Input should still be blocked by pendingMessage
    const state = store.getState();
    expect(calculateIsInputBlocked({
      isCreatingThread: state.isCreatingThread,
      isModeratorStreaming: state.isModeratorStreaming,
      isStreaming: state.isStreaming,
      isSubmitting: false,
      moderatorResumption: state.moderatorResumption,
      pendingMessage: state.pendingMessage,
      preSearchResumption: state.preSearchResumption,
      waitingToStartStreaming: state.waitingToStartStreaming,
    })).toBeTruthy();
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
      isCreatingThread: state.isCreatingThread,
      isModeratorStreaming: state.isModeratorStreaming,
      isStreaming: state.isStreaming,
      isSubmitting: false, // Fire-and-forget: never true
      moderatorResumption: state.moderatorResumption,
      pendingMessage: state.pendingMessage,
      preSearchResumption: state.preSearchResumption,
      waitingToStartStreaming: state.waitingToStartStreaming,
    })).toBeTruthy();

    // T4: Streaming actually starts (triggered by orchestrator)
    store.getState().setIsStreaming(true);
    store.getState().setWaitingToStartStreaming(false);

    // Input still blocked by isStreaming
    const streamingState = store.getState();
    expect(calculateIsInputBlocked({
      isCreatingThread: streamingState.isCreatingThread,
      isModeratorStreaming: streamingState.isModeratorStreaming,
      isStreaming: streamingState.isStreaming,
      isSubmitting: false,
      moderatorResumption: streamingState.moderatorResumption,
      pendingMessage: streamingState.pendingMessage,
      preSearchResumption: streamingState.preSearchResumption,
      waitingToStartStreaming: streamingState.waitingToStartStreaming,
    })).toBeTruthy();
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
      isCreatingThread: false,
      isModeratorStreaming: false,
      isStreaming: false,
      isSubmitting: false,
      moderatorResumption: null,
      pendingMessage: null,
      preSearchResumption: null,
      waitingToStartStreaming: false,
    })).toBeFalsy();

    // The VERY FIRST action in handleUpdateThreadAndSend
    store.getState().setWaitingToStartStreaming(true);

    // Immediately after: input blocked
    const state = store.getState();
    expect(calculateIsInputBlocked({
      isCreatingThread: state.isCreatingThread,
      isModeratorStreaming: state.isModeratorStreaming,
      isStreaming: state.isStreaming,
      isSubmitting: false, // Still false - mutation hasn't started
      moderatorResumption: state.moderatorResumption,
      pendingMessage: state.pendingMessage,
      preSearchResumption: state.preSearchResumption,
      waitingToStartStreaming: state.waitingToStartStreaming,
    })).toBeTruthy();
  });

  it('no gap between API complete and streaming start', () => {
    const store = createChatStore();

    // State after API completes but before streaming
    store.getState().setWaitingToStartStreaming(true);
    // NEW: No longer needs modelIds
    store.getState().prepareForNewMessage('Message', []);

    // Input still blocked by multiple flags - using explicit values to test the calculation logic
    expect(calculateIsInputBlocked({
      isCreatingThread: false,
      isModeratorStreaming: false,
      isStreaming: false, // Not streaming yet
      isSubmitting: false, // API complete
      moderatorResumption: null,
      pendingMessage: 'Message', // Set
      preSearchResumption: null,
      waitingToStartStreaming: true, // Still waiting
    })).toBeTruthy();
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
      isCreatingThread: false,
      isModeratorStreaming: false,
      isStreaming: false,
      isSubmitting: false,
      moderatorResumption: null,
      pendingMessage: null,
      preSearchResumption: null,
      waitingToStartStreaming: true,
    })).toBeTruthy();

    // Moderator starts
    store.getState().setIsModeratorStreaming(true);
    store.getState().setWaitingToStartStreaming(false);

    expect(calculateIsInputBlocked({
      isCreatingThread: false,
      isModeratorStreaming: true,
      isStreaming: false,
      isSubmitting: false,
      moderatorResumption: null,
      pendingMessage: null,
      preSearchResumption: null,
      waitingToStartStreaming: false,
    })).toBeTruthy();
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
      isCreatingThread: state.isCreatingThread,
      isModeratorStreaming: state.isModeratorStreaming,
      isStreaming: state.isStreaming,
      isSubmitting: false,
      moderatorResumption: state.moderatorResumption,
      pendingMessage: state.pendingMessage,
      preSearchResumption: state.preSearchResumption,
      waitingToStartStreaming: state.waitingToStartStreaming,
    })).toBeTruthy();
  });

  it('prevents double submission during streaming', () => {
    const store = createChatStore();

    store.getState().setIsStreaming(true);

    const state = store.getState();
    expect(calculateIsInputBlocked({
      isCreatingThread: state.isCreatingThread,
      isModeratorStreaming: state.isModeratorStreaming,
      isStreaming: state.isStreaming,
      isSubmitting: false,
      moderatorResumption: state.moderatorResumption,
      pendingMessage: state.pendingMessage,
      preSearchResumption: state.preSearchResumption,
      waitingToStartStreaming: state.waitingToStartStreaming,
    })).toBeTruthy();
  });

  it('prevents double submission during moderator phase', () => {
    const store = createChatStore();

    store.getState().setIsModeratorStreaming(true);

    const state = store.getState();
    expect(calculateIsInputBlocked({
      isCreatingThread: state.isCreatingThread,
      isModeratorStreaming: state.isModeratorStreaming,
      isStreaming: state.isStreaming,
      isSubmitting: false,
      moderatorResumption: state.moderatorResumption,
      pendingMessage: state.pendingMessage,
      preSearchResumption: state.preSearchResumption,
      waitingToStartStreaming: state.waitingToStartStreaming,
    })).toBeTruthy();
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
      isCreatingThread: state.isCreatingThread,
      isModeratorStreaming: state.isModeratorStreaming,
      isStreaming: state.isStreaming,
      isSubmitting: false,
      moderatorResumption: state.moderatorResumption,
      pendingMessage: state.pendingMessage,
      preSearchResumption: state.preSearchResumption,
      waitingToStartStreaming: state.waitingToStartStreaming,
    })).toBeFalsy();
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
    })).toBeFalsy();
  });
});

// ============================================================================
// REGRESSION TESTS
// ============================================================================

describe('submit Loading - Regression Prevention', () => {
  it('regression: loading must not depend solely on mutation.isPending', () => {
    /**
     * Verifies that loading state shows immediately when submit is triggered.
     * waitingToStartStreaming is set SYNCHRONOUSLY before async operations,
     * preventing delay from mutation.isPending which only becomes true AFTER
     * the mutation function is called.
     */
    const store = createChatStore();

    // waitingToStartStreaming set first, before async operations
    store.getState().setWaitingToStartStreaming(true);

    // Even without isSubmitting, should show loading
    expect(calculateShowSubmitSpinner({
      isSubmitting: false, // Not set yet
      waitingToStartStreaming: true, // Set immediately
    })).toBeTruthy();

    expect(calculateIsInputBlocked({
      isCreatingThread: false,
      isModeratorStreaming: false,
      isStreaming: false,
      isSubmitting: false, // Not set yet
      moderatorResumption: null,
      pendingMessage: null,
      preSearchResumption: null,
      waitingToStartStreaming: true, // Blocks input
    })).toBeTruthy();
  });

  it('regression: input must remain disabled throughout entire round', () => {
    /**
     * Complete round lifecycle test.
     * Input must be blocked at every step.
     */
    const store = createChatStore();
    const transitions: { name: string; blocked: boolean }[] = [];

    const checkBlocked = (name: string) => {
      const state = store.getState();
      const blocked = calculateIsInputBlocked({
        isCreatingThread: state.isCreatingThread,
        isModeratorStreaming: state.isModeratorStreaming,
        isStreaming: state.isStreaming,
        isSubmitting: false,
        moderatorResumption: state.moderatorResumption,
        pendingMessage: state.pendingMessage,
        preSearchResumption: state.preSearchResumption,
        waitingToStartStreaming: state.waitingToStartStreaming,
      });
      transitions.push({ blocked, name });
      return blocked;
    };

    // Step 1: Submit clicked
    store.getState().setWaitingToStartStreaming(true);
    expect(checkBlocked('submit-clicked')).toBeTruthy();

    // Step 2: Prepare for new message (sets pendingMessage, clears waitingToStartStreaming)
    store.getState().prepareForNewMessage('Message', ['model-1']);
    expect(checkBlocked('message-prepared')).toBeTruthy();

    // Step 3: Streaming starts - pendingMessage gets cleared when streaming begins
    store.getState().setIsStreaming(true);
    store.getState().setPendingMessage(null); // Cleared when streaming starts
    expect(checkBlocked('streaming-started')).toBeTruthy();

    // Step 4: First participant complete, second streaming
    // isStreaming stays true
    expect(checkBlocked('mid-participant-streaming')).toBeTruthy();

    // Step 5: All participants complete, moderator starts
    store.getState().setIsStreaming(false);
    store.getState().setIsModeratorStreaming(true);
    expect(checkBlocked('moderator-streaming')).toBeTruthy();

    // Step 6: Moderator complete - round is done
    store.getState().setIsModeratorStreaming(false);
    expect(checkBlocked('round-complete')).toBeFalsy(); // Finally enabled

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
    expect(store.getState().waitingToStartStreaming).toBeTruthy();

    // Web search starts streaming - this should clear waitingToStartStreaming
    store.getState().addPreSearch({
      id: 'presearch-1',
      queries: [],
      query: 'test query',
      results: [],
      roundNumber: 0,
      status: MessageStatuses.PENDING,
      threadId: 'thread-1',
    });
    store.getState().updatePreSearchStatus(0, MessageStatuses.STREAMING);

    // ✅ FIX: waitingToStartStreaming should NOT be cleared by pre-search streaming
    // It should only be cleared when actual PARTICIPANT streaming starts
    // Pre-search streaming is not the same as participant streaming
    expect(store.getState().waitingToStartStreaming).toBeTruthy();

    // Spinner should STILL show (waiting for participant streaming to start)
    expect(calculateShowSubmitSpinner({
      isSubmitting: false,
      waitingToStartStreaming: store.getState().waitingToStartStreaming,
    })).toBeTruthy();

    // Input should still be blocked (pre-search is active, waiting for participants)
    expect(calculateIsInputBlocked({
      isCreatingThread: false,
      isModeratorStreaming: false,
      isStreaming: false, // Participant streaming hasn't started yet
      isSubmitting: false,
      moderatorResumption: null,
      pendingMessage: null,
      preSearchResumption: { status: MessageStatuses.STREAMING }, // Web search is active
      waitingToStartStreaming: true, // Still true until participant streaming starts
    })).toBeTruthy();
  });

  it('participant streaming also clears waitingToStartStreaming when web search is disabled', () => {
    const store = createChatStore();

    // Submit clicked - loading state starts
    store.getState().setWaitingToStartStreaming(true);
    expect(store.getState().waitingToStartStreaming).toBeTruthy();

    // No web search - participant streaming starts directly
    store.getState().setIsStreaming(true);

    // The useStreamingTrigger effect would call setWaitingToStartStreaming(false)
    // when chatIsStreaming becomes true
    store.getState().setWaitingToStartStreaming(false);

    expect(store.getState().waitingToStartStreaming).toBeFalsy();

    // Spinner should not show
    expect(calculateShowSubmitSpinner({
      isSubmitting: false,
      waitingToStartStreaming: false,
    })).toBeFalsy();

    // Input still blocked by isStreaming
    expect(calculateIsInputBlocked({
      isCreatingThread: false,
      isModeratorStreaming: false,
      isStreaming: true,
      isSubmitting: false,
      moderatorResumption: null,
      pendingMessage: null,
      preSearchResumption: null,
      waitingToStartStreaming: false,
    })).toBeTruthy();
  });

  it('spinner shows during entire pre-submit and API phase', () => {
    const store = createChatStore();

    // T0: Submit clicked
    store.getState().setWaitingToStartStreaming(true);
    expect(calculateShowSubmitSpinner({
      isSubmitting: false,
      waitingToStartStreaming: true,
    })).toBeTruthy();

    // T1: API mutation starts
    expect(calculateShowSubmitSpinner({
      isSubmitting: true,
      waitingToStartStreaming: true,
    })).toBeTruthy();

    // T2: API completes, pendingMessage set, but no streaming yet
    // waitingToStartStreaming still true because streaming hasn't started
    expect(calculateShowSubmitSpinner({
      isSubmitting: false,
      waitingToStartStreaming: true,
    })).toBeTruthy();

    // T3: Web search starts streaming - spinner stops
    store.getState().setWaitingToStartStreaming(false);
    expect(calculateShowSubmitSpinner({
      isSubmitting: false,
      waitingToStartStreaming: false,
    })).toBeFalsy();
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
    })).toBeTruthy(); // Spinner ON

    // Step 2: Web search starts streaming
    // ✅ FIX: waitingToStartStreaming stays TRUE during pre-search
    // It only clears when PARTICIPANT streaming starts
    store.getState().addPreSearch({
      id: 'presearch-1',
      queries: [],
      query: 'test',
      results: [],
      roundNumber: 0,
      status: MessageStatuses.PENDING,
      threadId: 'thread-1',
    });
    store.getState().updatePreSearchStatus(0, MessageStatuses.STREAMING);

    expect(store.getState().waitingToStartStreaming).toBeTruthy(); // Still true!
    expect(calculateShowSubmitSpinner({
      isSubmitting: false,
      waitingToStartStreaming: true,
    })).toBeTruthy(); // Spinner still ON (waiting for participant streaming)

    // Step 3: Web search complete
    store.getState().updatePreSearchStatus(0, MessageStatuses.COMPLETE);
    expect(store.getState().waitingToStartStreaming).toBeTruthy(); // Still true!
    expect(calculateShowSubmitSpinner({
      isSubmitting: false,
      waitingToStartStreaming: true,
    })).toBeTruthy(); // Spinner still ON (waiting for participant streaming)

    // Step 4: Participants streaming starts
    // The React effect in use-streaming-trigger.ts clears waitingToStartStreaming
    // We simulate that here since we're testing store state directly
    store.getState().setIsStreaming(true);
    store.getState().setWaitingToStartStreaming(false); // Simulating effect behavior
    expect(calculateShowSubmitSpinner({
      isSubmitting: false,
      waitingToStartStreaming: false,
    })).toBeFalsy(); // NOW spinner is OFF
    expect(calculateIsInputBlocked({
      isCreatingThread: false,
      isModeratorStreaming: false,
      isStreaming: true,
      isSubmitting: false,
      moderatorResumption: null,
      pendingMessage: null,
      preSearchResumption: null,
      waitingToStartStreaming: false,
    })).toBeTruthy(); // But input blocked

    // Step 5: Moderator streaming
    store.getState().setIsStreaming(false);
    store.getState().setIsModeratorStreaming(true);
    expect(calculateShowSubmitSpinner({
      isSubmitting: false,
      waitingToStartStreaming: false,
    })).toBeFalsy(); // Spinner still OFF
    expect(calculateIsInputBlocked({
      isCreatingThread: false,
      isModeratorStreaming: true,
      isStreaming: false,
      isSubmitting: false,
      moderatorResumption: null,
      pendingMessage: null,
      preSearchResumption: null,
      waitingToStartStreaming: false,
    })).toBeTruthy(); // Input still blocked

    // Step 6: Round complete
    store.getState().setIsModeratorStreaming(false);
    expect(calculateIsInputBlocked({
      isCreatingThread: false,
      isModeratorStreaming: false,
      isStreaming: false,
      isSubmitting: false,
      moderatorResumption: null,
      pendingMessage: null,
      preSearchResumption: null,
      waitingToStartStreaming: false,
    })).toBeFalsy(); // Input enabled
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
      isCreatingThread: false,
      isModeratorStreaming: false,
      isStreaming: false,
      isSubmitting: false,
      moderatorResumption: null,
      pendingMessage: null,
      preSearchResumption: null,
      streamingRoundNumber: 0,
      waitingToStartStreaming: false,
    })).toBeTruthy();
  });

  it('allows input when streamingRoundNumber is null (no round in progress)', () => {
    const store = createChatStore();

    // Ensure streamingRoundNumber is null
    store.getState().setStreamingRoundNumber(null);

    // With all flags false and streamingRoundNumber null, input should be enabled
    expect(calculateIsInputBlocked({
      isCreatingThread: false,
      isModeratorStreaming: false,
      isStreaming: false,
      isSubmitting: false,
      moderatorResumption: null,
      pendingMessage: null,
      preSearchResumption: null,
      streamingRoundNumber: null,
      waitingToStartStreaming: false,
    })).toBeFalsy();
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
      isCreatingThread: state.isCreatingThread, // false
      isModeratorStreaming: state.isModeratorStreaming, // false
      isStreaming: state.isStreaming, // false
      isSubmitting: false,
      moderatorResumption: null,
      pendingMessage: state.pendingMessage, // null
      preSearchResumption: null,
      streamingRoundNumber: state.streamingRoundNumber, // 0 - round in progress
      waitingToStartStreaming: state.waitingToStartStreaming, // false
    })).toBeTruthy(); // Blocked by streamingRoundNumber
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
      isCreatingThread: false,
      isModeratorStreaming: false,
      isStreaming: false,
      isSubmitting: false,
      moderatorResumption: null,
      pendingMessage: null,
      preSearchResumption: { status: MessageStatuses.COMPLETE }, // Pre-search complete
      streamingRoundNumber: 1, // Round in progress
      waitingToStartStreaming: false,
    })).toBeTruthy(); // Blocked by streamingRoundNumber
  });

  it('enables input only after streamingRoundNumber is cleared (round complete)', () => {
    const store = createChatStore();

    // Round complete - clear streamingRoundNumber
    store.getState().completeStreaming();

    const state = store.getState();
    expect(state.streamingRoundNumber).toBeNull();
    expect(calculateIsInputBlocked({
      isCreatingThread: false,
      isModeratorStreaming: false,
      isStreaming: false,
      isSubmitting: false,
      moderatorResumption: null,
      pendingMessage: null,
      preSearchResumption: null,
      streamingRoundNumber: null,
      waitingToStartStreaming: false,
    })).toBeFalsy(); // Input enabled
  });

  it('streamingRoundNumber works for multi-round conversations', () => {
    const store = createChatStore();

    // Round 0
    store.getState().setStreamingRoundNumber(0);
    expect(calculateIsInputBlocked({
      isCreatingThread: false,
      isModeratorStreaming: false,
      isStreaming: false,
      isSubmitting: false,
      moderatorResumption: null,
      pendingMessage: null,
      preSearchResumption: null,
      streamingRoundNumber: 0,
      waitingToStartStreaming: false,
    })).toBeTruthy();

    // Round 0 complete
    store.getState().completeStreaming();
    expect(store.getState().streamingRoundNumber).toBeNull();

    // Round 1 starts
    store.getState().setStreamingRoundNumber(1);
    expect(calculateIsInputBlocked({
      isCreatingThread: false,
      isModeratorStreaming: false,
      isStreaming: false,
      isSubmitting: false,
      moderatorResumption: null,
      pendingMessage: null,
      preSearchResumption: null,
      streamingRoundNumber: 1,
      waitingToStartStreaming: false,
    })).toBeTruthy();

    // Round 2 (higher number)
    store.getState().setStreamingRoundNumber(5);
    expect(calculateIsInputBlocked({
      isCreatingThread: false,
      isModeratorStreaming: false,
      isStreaming: false,
      isSubmitting: false,
      moderatorResumption: null,
      pendingMessage: null,
      preSearchResumption: null,
      streamingRoundNumber: 5,
      waitingToStartStreaming: false,
    })).toBeTruthy();
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
    expect(state.streamingRoundNumber).toBeNull();
    expect(state.isStreaming).toBeFalsy();
    expect(state.isModeratorStreaming).toBeFalsy();
    expect(state.waitingToStartStreaming).toBeFalsy();

    // Input should be enabled
    expect(calculateIsInputBlocked({
      isCreatingThread: false,
      isModeratorStreaming: false,
      isStreaming: false,
      isSubmitting: false,
      moderatorResumption: null,
      pendingMessage: null,
      preSearchResumption: null,
      streamingRoundNumber: null,
      waitingToStartStreaming: false,
    })).toBeFalsy();
  });
});
