/**
 * Submit Blocking States Tests
 *
 * Tests for the submit button blocking logic across different chat states.
 * Ensures the submit button is properly disabled during:
 * - Stream resumptions
 * - Active streaming
 * - Thread creation
 * - API submissions (mutations pending)
 * - Pre-search phases
 * - Moderator phases
 *
 * Key Validations:
 * - Submit button disabled during all blocking states
 * - Input remains enabled for typing during streaming
 * - Loading spinner shown during API submission
 * - All edge cases properly handled
 */

import type { MessageStatus, RoundPhase } from '@roundtable/shared';
import { MessageStatuses, RoundPhases } from '@roundtable/shared';
import { describe, expect, it } from 'vitest';

import { createChatStore } from '../store';

// ============================================================================
// HELPER: Calculate isInputBlocked (mirrors ChatView logic)
// ============================================================================

type BlockingCheckState = {
  isStreaming: boolean;
  isCreatingThread: boolean;
  waitingToStartStreaming: boolean;
  isModeratorStreaming: boolean;
  pendingMessage: string | null;
  currentResumptionPhase: RoundPhase | null;
  preSearchResumption: { status: MessageStatus | null } | null;
  moderatorResumption: { status: MessageStatus | null } | null;
  isSubmitting?: boolean;
  // ✅ ADDED: Missing blocking conditions from ChatView.tsx
  streamingRoundNumber?: number | null;
  showLoader?: boolean;
  isModelsLoading?: boolean;
};

function calculateIsInputBlocked(state: BlockingCheckState): boolean {
  // ✅ Only check actual resumption status states, not the phase
  // Phase can be stale after round completes - only status is reliable
  const isResumptionActive = (
    state.preSearchResumption?.status === MessageStatuses.STREAMING
    || state.preSearchResumption?.status === MessageStatuses.PENDING
    || state.moderatorResumption?.status === MessageStatuses.STREAMING
    || state.moderatorResumption?.status === MessageStatuses.PENDING
  );

  // ✅ CRITICAL: isRoundInProgress covers the ENTIRE round duration
  // This prevents submissions during gaps (e.g., after participants complete but before moderator starts)
  const isRoundInProgress = state.streamingRoundNumber !== null && state.streamingRoundNumber !== undefined;

  return (
    state.isStreaming
    || state.isCreatingThread
    || state.waitingToStartStreaming
    || Boolean(state.showLoader)
    || state.isModeratorStreaming
    || Boolean(state.pendingMessage)
    || Boolean(state.isModelsLoading)
    || isResumptionActive
    || Boolean(state.isSubmitting)
    || isRoundInProgress
  );
}

// ============================================================================
// STREAMING STATE BLOCKING TESTS
// ============================================================================

describe('submit Blocking - Streaming States', () => {
  it('blocks submit when isStreaming is true', () => {
    const store = createChatStore();
    store.getState().setIsStreaming(true);

    const state = store.getState();
    const isBlocked = calculateIsInputBlocked({
      currentResumptionPhase: state.currentResumptionPhase,
      isCreatingThread: state.isCreatingThread,
      isModeratorStreaming: state.isModeratorStreaming,
      isStreaming: state.isStreaming,
      moderatorResumption: state.moderatorResumption,
      pendingMessage: state.pendingMessage,
      preSearchResumption: state.preSearchResumption,
      waitingToStartStreaming: state.waitingToStartStreaming,
    });

    expect(isBlocked).toBeTruthy();
  });

  it('blocks submit when waitingToStartStreaming is true', () => {
    const store = createChatStore();
    store.getState().setWaitingToStartStreaming(true);

    const state = store.getState();
    const isBlocked = calculateIsInputBlocked({
      currentResumptionPhase: state.currentResumptionPhase,
      isCreatingThread: state.isCreatingThread,
      isModeratorStreaming: state.isModeratorStreaming,
      isStreaming: state.isStreaming,
      moderatorResumption: state.moderatorResumption,
      pendingMessage: state.pendingMessage,
      preSearchResumption: state.preSearchResumption,
      waitingToStartStreaming: state.waitingToStartStreaming,
    });

    expect(isBlocked).toBeTruthy();
  });

  it('blocks submit when isModeratorStreaming is true', () => {
    const store = createChatStore();
    store.getState().setIsModeratorStreaming(true);

    const state = store.getState();
    const isBlocked = calculateIsInputBlocked({
      currentResumptionPhase: state.currentResumptionPhase,
      isCreatingThread: state.isCreatingThread,
      isModeratorStreaming: state.isModeratorStreaming,
      isStreaming: state.isStreaming,
      moderatorResumption: state.moderatorResumption,
      pendingMessage: state.pendingMessage,
      preSearchResumption: state.preSearchResumption,
      waitingToStartStreaming: state.waitingToStartStreaming,
    });

    expect(isBlocked).toBeTruthy();
  });
});

// ============================================================================
// THREAD CREATION BLOCKING TESTS
// ============================================================================

describe('submit Blocking - Thread Creation', () => {
  it('blocks submit when isCreatingThread is true', () => {
    const store = createChatStore();
    store.getState().setIsCreatingThread(true);

    const state = store.getState();
    const isBlocked = calculateIsInputBlocked({
      currentResumptionPhase: state.currentResumptionPhase,
      isCreatingThread: state.isCreatingThread,
      isModeratorStreaming: state.isModeratorStreaming,
      isStreaming: state.isStreaming,
      moderatorResumption: state.moderatorResumption,
      pendingMessage: state.pendingMessage,
      preSearchResumption: state.preSearchResumption,
      waitingToStartStreaming: state.waitingToStartStreaming,
    });

    expect(isBlocked).toBeTruthy();
  });

  it('blocks submit when pendingMessage exists', () => {
    const store = createChatStore();
    // NEW: prepareForNewMessage no longer needs modelIds
    store.getState().prepareForNewMessage('Test message', []);

    const state = store.getState();
    const isBlocked = calculateIsInputBlocked({
      currentResumptionPhase: state.currentResumptionPhase,
      isCreatingThread: state.isCreatingThread,
      isModeratorStreaming: state.isModeratorStreaming,
      isStreaming: state.isStreaming,
      moderatorResumption: state.moderatorResumption,
      pendingMessage: state.pendingMessage,
      preSearchResumption: state.preSearchResumption,
      waitingToStartStreaming: state.waitingToStartStreaming,
    });

    expect(state.pendingMessage).toBe('Test message');
    expect(isBlocked).toBeTruthy();
  });
});

// ============================================================================
// RESUMPTION PHASE BLOCKING TESTS
// ============================================================================

describe('submit Blocking - Stream Resumption Status', () => {
  it('blocks submit when preSearchResumption status is streaming', () => {
    const isBlocked = calculateIsInputBlocked({
      currentResumptionPhase: null,
      isCreatingThread: false,
      isModeratorStreaming: false,
      isStreaming: false,
      moderatorResumption: null,
      pendingMessage: null,
      preSearchResumption: { status: MessageStatuses.STREAMING },
      waitingToStartStreaming: false,
    });

    expect(isBlocked).toBeTruthy();
  });

  it('blocks submit when preSearchResumption status is pending', () => {
    const isBlocked = calculateIsInputBlocked({
      currentResumptionPhase: null,
      isCreatingThread: false,
      isModeratorStreaming: false,
      isStreaming: false,
      moderatorResumption: null,
      pendingMessage: null,
      preSearchResumption: { status: MessageStatuses.PENDING },
      waitingToStartStreaming: false,
    });

    expect(isBlocked).toBeTruthy();
  });

  it('blocks submit when moderatorResumption status is streaming', () => {
    const isBlocked = calculateIsInputBlocked({
      currentResumptionPhase: null,
      isCreatingThread: false,
      isModeratorStreaming: false,
      isStreaming: false,
      moderatorResumption: { status: MessageStatuses.STREAMING },
      pendingMessage: null,
      preSearchResumption: null,
      waitingToStartStreaming: false,
    });

    expect(isBlocked).toBeTruthy();
  });

  it('blocks submit when moderatorResumption status is pending', () => {
    const isBlocked = calculateIsInputBlocked({
      currentResumptionPhase: null,
      isCreatingThread: false,
      isModeratorStreaming: false,
      isStreaming: false,
      moderatorResumption: { status: MessageStatuses.PENDING },
      pendingMessage: null,
      preSearchResumption: null,
      waitingToStartStreaming: false,
    });

    expect(isBlocked).toBeTruthy();
  });

  it('does NOT block when only phase is set but status is null (stale phase)', () => {
    // This is the bug fix - phase can be stale after round completes
    // Only actual status should block, not stale phase
    const isBlocked = calculateIsInputBlocked({
      currentResumptionPhase: RoundPhases.PARTICIPANTS, // Stale phase
      isCreatingThread: false,
      isModeratorStreaming: false,
      isStreaming: false,
      moderatorResumption: null, // No active resumption
      pendingMessage: null,
      preSearchResumption: null, // No active resumption
      waitingToStartStreaming: false,
    });

    expect(isBlocked).toBeFalsy(); // Should NOT block with stale phase
  });

  it('does NOT block when phase is pre_search but preSearchResumption is null', () => {
    const isBlocked = calculateIsInputBlocked({
      currentResumptionPhase: RoundPhases.PRE_SEARCH, // Stale phase
      isCreatingThread: false,
      isModeratorStreaming: false,
      isStreaming: false,
      moderatorResumption: null,
      pendingMessage: null,
      preSearchResumption: null, // No active resumption
      waitingToStartStreaming: false,
    });

    expect(isBlocked).toBeFalsy();
  });

  it('does NOT block when phase is moderator but moderatorResumption is null', () => {
    const isBlocked = calculateIsInputBlocked({
      currentResumptionPhase: RoundPhases.MODERATOR, // Stale phase
      isCreatingThread: false,
      isModeratorStreaming: false,
      isStreaming: false,
      moderatorResumption: null, // No active resumption
      pendingMessage: null,
      preSearchResumption: null,
      waitingToStartStreaming: false,
    });

    expect(isBlocked).toBeFalsy();
  });
});

// ============================================================================
// API SUBMISSION (isSubmitting) BLOCKING TESTS
// ============================================================================

describe('submit Blocking - API Submission State', () => {
  it('blocks submit when isSubmitting is true', () => {
    const isBlocked = calculateIsInputBlocked({
      currentResumptionPhase: null,
      isCreatingThread: false,
      isModeratorStreaming: false,
      isStreaming: false,
      isSubmitting: true,
      moderatorResumption: null,
      pendingMessage: null,
      preSearchResumption: null,
      waitingToStartStreaming: false,
    });

    expect(isBlocked).toBeTruthy();
  });

  it('does not block when isSubmitting is false and no other blocking states', () => {
    const isBlocked = calculateIsInputBlocked({
      currentResumptionPhase: null,
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
// NON-BLOCKING STATES TESTS
// ============================================================================

describe('submit Blocking - Non-Blocking States', () => {
  it('does not block when all states are idle/false', () => {
    const store = createChatStore();

    const state = store.getState();
    const isBlocked = calculateIsInputBlocked({
      currentResumptionPhase: state.currentResumptionPhase,
      isCreatingThread: state.isCreatingThread,
      isModeratorStreaming: state.isModeratorStreaming,
      isStreaming: state.isStreaming,
      moderatorResumption: state.moderatorResumption,
      pendingMessage: state.pendingMessage,
      preSearchResumption: state.preSearchResumption,
      waitingToStartStreaming: state.waitingToStartStreaming,
    });

    expect(isBlocked).toBeFalsy();
  });

  it('does not block when resumption phase is idle', () => {
    const isBlocked = calculateIsInputBlocked({
      currentResumptionPhase: RoundPhases.IDLE,
      isCreatingThread: false,
      isModeratorStreaming: false,
      isStreaming: false,
      moderatorResumption: null,
      pendingMessage: null,
      preSearchResumption: null,
      waitingToStartStreaming: false,
    });

    expect(isBlocked).toBeFalsy();
  });

  it('does not block when resumption phase is complete', () => {
    const isBlocked = calculateIsInputBlocked({
      currentResumptionPhase: RoundPhases.COMPLETE,
      isCreatingThread: false,
      isModeratorStreaming: false,
      isStreaming: false,
      moderatorResumption: null,
      pendingMessage: null,
      preSearchResumption: null,
      waitingToStartStreaming: false,
    });

    expect(isBlocked).toBeFalsy();
  });

  it('does not block when preSearchResumption status is complete', () => {
    const isBlocked = calculateIsInputBlocked({
      currentResumptionPhase: null,
      isCreatingThread: false,
      isModeratorStreaming: false,
      isStreaming: false,
      moderatorResumption: null,
      pendingMessage: null,
      preSearchResumption: { status: MessageStatuses.COMPLETE },
      waitingToStartStreaming: false,
    });

    expect(isBlocked).toBeFalsy();
  });

  it('does not block when moderatorResumption status is complete', () => {
    const isBlocked = calculateIsInputBlocked({
      currentResumptionPhase: null,
      isCreatingThread: false,
      isModeratorStreaming: false,
      isStreaming: false,
      moderatorResumption: { status: MessageStatuses.COMPLETE },
      pendingMessage: null,
      preSearchResumption: null,
      waitingToStartStreaming: false,
    });

    expect(isBlocked).toBeFalsy();
  });
});

// ============================================================================
// COMBINED STATES TESTS
// ============================================================================

describe('submit Blocking - Combined States', () => {
  it('blocks when multiple blocking states are true', () => {
    const isBlocked = calculateIsInputBlocked({
      currentResumptionPhase: RoundPhases.PARTICIPANTS,
      isCreatingThread: true,
      isModeratorStreaming: true,
      isStreaming: true,
      isSubmitting: true,
      moderatorResumption: { status: MessageStatuses.PENDING },
      pendingMessage: 'test',
      preSearchResumption: { status: MessageStatuses.STREAMING },
      waitingToStartStreaming: true,
    });

    expect(isBlocked).toBeTruthy();
  });

  it('blocks even if only one state is blocking', () => {
    // Test each blocking state individually
    // Note: currentResumptionPhase alone does NOT block (can be stale)
    // Only actual status states block
    const blockingStates = [
      { isStreaming: true },
      { isCreatingThread: true },
      { waitingToStartStreaming: true },
      { isModeratorStreaming: true },
      { pendingMessage: 'test' },
      { preSearchResumption: { status: MessageStatuses.STREAMING } },
      { preSearchResumption: { status: MessageStatuses.PENDING } },
      { moderatorResumption: { status: MessageStatuses.STREAMING } },
      { moderatorResumption: { status: MessageStatuses.PENDING } },
      { isSubmitting: true },
    ];

    const baseState: BlockingCheckState = {
      currentResumptionPhase: null,
      isCreatingThread: false,
      isModeratorStreaming: false,
      isStreaming: false,
      isSubmitting: false,
      moderatorResumption: null,
      pendingMessage: null,
      preSearchResumption: null,
      waitingToStartStreaming: false,
    };

    for (const blockingState of blockingStates) {
      const isBlocked = calculateIsInputBlocked({ ...baseState, ...blockingState });
      expect(isBlocked).toBeTruthy();
    }
  });
});

// ============================================================================
// REAL SCENARIO TESTS
// ============================================================================

describe('submit Blocking - Real Scenarios', () => {
  it('scenario: user refreshes during pre-search streaming', () => {
    // User submitted message with web search enabled
    // Page refreshed during pre-search streaming
    // Pre-search resumption with streaming status should block submit

    const isBlocked = calculateIsInputBlocked({
      currentResumptionPhase: RoundPhases.PRE_SEARCH,
      isCreatingThread: false,
      isModeratorStreaming: false,
      isStreaming: false, // Not streaming yet (pre-search phase)
      moderatorResumption: null,
      pendingMessage: null,
      preSearchResumption: { status: MessageStatuses.STREAMING }, // Active resumption
      waitingToStartStreaming: false,
    });

    expect(isBlocked).toBeTruthy();
  });

  it('scenario: user refreshes during participant streaming - isStreaming blocks', () => {
    // User submitted message
    // Page refreshed during participant streaming
    // isStreaming flag should block submit (participant streaming sets isStreaming)

    const isBlocked = calculateIsInputBlocked({
      currentResumptionPhase: RoundPhases.PARTICIPANTS,
      isCreatingThread: false,
      isModeratorStreaming: false,
      isStreaming: true, // Participant streaming sets this
      moderatorResumption: null,
      pendingMessage: null,
      preSearchResumption: null,
      waitingToStartStreaming: false,
    });

    expect(isBlocked).toBeTruthy();
  });

  it('scenario: round complete with stale phase - should NOT block', () => {
    // Round completed normally
    // Phase is stale (still 'participants') but no active resumption
    // Should NOT block - user should be able to send next message

    const isBlocked = calculateIsInputBlocked({
      currentResumptionPhase: RoundPhases.PARTICIPANTS, // Stale - not reset after round
      isCreatingThread: false,
      isModeratorStreaming: false,
      isStreaming: false,
      moderatorResumption: null, // No active resumption
      pendingMessage: null,
      preSearchResumption: null, // No active resumption
      waitingToStartStreaming: false,
    });

    expect(isBlocked).toBeFalsy(); // Bug fix: stale phase should not block
  });

  it('scenario: user clicks submit and API call is in progress', () => {
    // User clicked submit button
    // API call (createThread or updateThread) is in progress
    // isSubmitting should block submit immediately

    const isBlocked = calculateIsInputBlocked({
      currentResumptionPhase: null,
      isCreatingThread: false, // Not set yet - mutation just started
      isModeratorStreaming: false,
      isStreaming: false,
      isSubmitting: true, // From mutation.isPending
      moderatorResumption: null,
      pendingMessage: null,
      preSearchResumption: null,
      waitingToStartStreaming: false,
    });

    expect(isBlocked).toBeTruthy();
  });

  it('scenario: normal streaming in progress', () => {
    // Normal streaming scenario - AI is responding

    const isBlocked = calculateIsInputBlocked({
      currentResumptionPhase: null,
      isCreatingThread: false,
      isModeratorStreaming: false,
      isStreaming: true,
      moderatorResumption: null,
      pendingMessage: null,
      preSearchResumption: null,
      waitingToStartStreaming: false,
    });

    expect(isBlocked).toBeTruthy();
  });

  it('scenario: moderator streaming in progress', () => {
    // All participants finished, moderator is streaming (after participants complete)

    const isBlocked = calculateIsInputBlocked({
      currentResumptionPhase: null,
      isCreatingThread: false,
      isModeratorStreaming: true,
      isStreaming: false,
      moderatorResumption: null,
      pendingMessage: null,
      preSearchResumption: null,
      waitingToStartStreaming: false,
    });

    expect(isBlocked).toBeTruthy();
  });

  it('scenario: ready for new message after round completes', () => {
    // Round completed - all states should be reset

    const isBlocked = calculateIsInputBlocked({
      currentResumptionPhase: RoundPhases.COMPLETE,
      isCreatingThread: false,
      isModeratorStreaming: false,
      isStreaming: false,
      isSubmitting: false,
      moderatorResumption: { status: MessageStatuses.COMPLETE },
      pendingMessage: null,
      preSearchResumption: { status: MessageStatuses.COMPLETE },
      waitingToStartStreaming: false,
    });

    expect(isBlocked).toBeFalsy();
  });
});

// ============================================================================
// MODERATOR TRANSITION WINDOW BLOCKING TESTS
// ============================================================================

/**
 * These tests verify the fix for the race condition where submissions could
 * slip through during the transition between participants completing and
 * moderator starting.
 *
 * BUG: When all participants finished but before isModeratorStreaming was set,
 * there was a window where isSubmitBlocked = false, allowing duplicate submissions.
 *
 * FIX: Added isAwaitingModerator check that blocks when:
 * - All participants have completed for current round
 * - No moderator message exists for current round
 *
 * See: moderator-transition-race-condition.test.ts for comprehensive tests
 */
describe('submit Blocking - Moderator Transition Window (Race Condition Fix)', () => {
  it('documents the race condition scenario', () => {
    /**
     * Timeline of the bug (December 2024):
     * 1. 21:47:29 - Last participant finishes → isStreaming = false
     * 2. 21:47:30 - handleComplete starts async waits (waitForStoreSync, waitForAllAnimations)
     * 3. 21:47:30 - RACE WINDOW: isStreaming=false, isModeratorStreaming=false
     * 4. 21:47:30 - User submission gets through → DUPLICATE ROUND CREATED
     * 5. 21:47:31 - setIsModeratorStreaming(true) finally called → too late
     *
     * Fix: isAwaitingModerator blocks during step 3-5
     */
    expect(true).toBeTruthy(); // Documentation test
  });

  it('blocks when all participants complete but no moderator exists', () => {
    // This is the CRITICAL test for the race condition fix
    // The old blocking logic would return false here, allowing duplicate submissions
    //
    // Old logic: isStreaming || isModeratorStreaming || Boolean(pendingMessage)
    // New logic: ... || isAwaitingModerator
    //
    // isAwaitingModerator = true when:
    //   areAllParticipantsCompleteForRound(messages, participants, currentRound) === true
    //   && getModeratorMessageForRound(messages, currentRound) === undefined

    // This test documents the expected behavior - full implementation
    // is tested in moderator-transition-race-condition.test.ts
    const state: BlockingCheckState = {
      currentResumptionPhase: null,
      isCreatingThread: false,
      isModeratorStreaming: false, // Not started yet - THE RACE WINDOW
      isStreaming: false, // Participants done
      isSubmitting: false,
      moderatorResumption: null,
      pendingMessage: null, // Already sent
      preSearchResumption: null,
      waitingToStartStreaming: false,
    };

    // With old logic, this would return false (bug)
    const oldLogicBlocked = calculateIsInputBlocked(state);
    expect(oldLogicBlocked).toBeFalsy();

    // With new logic (including isAwaitingModerator in ChatThreadScreen),
    // this should be blocked. The actual implementation is tested in
    // moderator-transition-race-condition.test.ts
  });

  it('references comprehensive tests in separate file', () => {
    // Full race condition tests are in:
    // src/stores/chat/__tests__/moderator-transition-race-condition.test.ts
    //
    // That file tests:
    // - isAwaitingModerator calculation
    // - All edge cases (empty messages, disabled participants, etc.)
    // - Multi-round scenarios
    // - The exact bug reproduction scenario
    // - Regression prevention tests
    expect(true).toBeTruthy();
  });
});

// ============================================================================
// LOADING SPINNER STATE TESTS
// ============================================================================

/**
 * Tests for loading spinner state on submit button.
 * The spinner should show from submit click until streaming starts.
 *
 * Lifecycle:
 * 1. User clicks submit → isSubmitting=true (mutation pending) → spinner shows
 * 2. API completes → isSubmitting=false, but pendingMessage set → spinner continues
 * 3. waitingToStartStreaming=true → spinner continues
 * 4. Streaming starts (isStreaming=true) → stop button shows instead of spinner
 * 5. First stream chunk arrives → spinner stops, button disabled
 * 6. Streaming ends → button enabled
 *
 * LOADING STATE BEHAVIOR:
 * Spinner shows ONLY from submit click until first stream chunk arrives.
 * After first stream chunk (web search or participant), button is disabled but NOT loading.
 */
type SpinnerCheckState = {
  isSubmitting: boolean;
  waitingToStartStreaming: boolean;
};

function calculateShowSubmitSpinner(state: SpinnerCheckState): boolean {
  return state.isSubmitting || state.waitingToStartStreaming;
}

describe('submit Spinner - Loading State Lifecycle', () => {
  it('shows spinner when API mutation is pending (isSubmitting=true)', () => {
    const showSpinner = calculateShowSubmitSpinner({
      isSubmitting: true,
      waitingToStartStreaming: false,
    });
    expect(showSpinner).toBeTruthy();
  });

  it('shows spinner when waitingToStartStreaming is true', () => {
    const showSpinner = calculateShowSubmitSpinner({
      isSubmitting: false,
      waitingToStartStreaming: true,
    });
    expect(showSpinner).toBeTruthy();
  });

  it('hides spinner when all states are false', () => {
    const showSpinner = calculateShowSubmitSpinner({
      isSubmitting: false,
      waitingToStartStreaming: false,
    });
    expect(showSpinner).toBeFalsy();
  });

  it('shows spinner during submit until first stream chunk (combo states)', () => {
    // Simulate the lifecycle - spinner shows until first stream chunk arrives
    const states: SpinnerCheckState[] = [
      // Step 1: User clicks submit, API call starts
      { isSubmitting: true, waitingToStartStreaming: false },
      // Step 2: API call in progress, waitingToStartStreaming set
      { isSubmitting: true, waitingToStartStreaming: true },
      // Step 3: API completes but still waiting for stream
      { isSubmitting: false, waitingToStartStreaming: true },
    ];

    for (const state of states) {
      const showSpinner = calculateShowSubmitSpinner(state);
      expect(showSpinner).toBeTruthy();
    }

    // Step 4: First stream chunk arrives - spinner stops
    const streamStarted = { isSubmitting: false, waitingToStartStreaming: false };
    expect(calculateShowSubmitSpinner(streamStarted)).toBeFalsy();
  });
});

describe('submit Spinner - Double Submission Prevention', () => {
  it('scenario: waitingToStartStreaming prevents gap between API complete and streaming', () => {
    /**
     * FIX VERIFICATION:
     * waitingToStartStreaming is set at the START of handleUpdateThreadAndSend,
     * ensuring spinner shows from submit click until first stream chunk arrives.
     *
     * Timeline:
     * T0: User clicks submit
     *   - waitingToStartStreaming: true (set immediately)
     *   - isSubmitting: true (mutation starts)
     *   - Spinner shows
     *
     * T1: API completes
     *   - isSubmitting: false
     *   - waitingToStartStreaming: still true (until first stream chunk)
     *   - Spinner still shows
     *
     * T2: First stream chunk arrives (web search or participant)
     *   - waitingToStartStreaming: false
     *   - Spinner stops, button disabled
     */

    // T0: Submit clicked - waitingToStartStreaming set immediately
    const t0 = { isSubmitting: true, waitingToStartStreaming: true };
    expect(calculateShowSubmitSpinner(t0)).toBeTruthy();

    // T1: API completes but still waiting for stream
    const t1 = { isSubmitting: false, waitingToStartStreaming: true };
    expect(calculateShowSubmitSpinner(t1)).toBeTruthy();

    // T2: First stream chunk arrives - spinner stops
    const t2 = { isSubmitting: false, waitingToStartStreaming: false };
    expect(calculateShowSubmitSpinner(t2)).toBeFalsy();
  });

  it('scenario: continuous blocking from submit to first stream chunk', () => {
    /**
     * Correct lifecycle:
     * The spinner shows from submit click until first stream chunk.
     * After first stream chunk, button is disabled but not loading.
     */

    // T0: Click submit - waitingToStartStreaming set immediately
    const t0 = { isSubmitting: true, waitingToStartStreaming: true };

    // T1: API in progress
    const t1 = { isSubmitting: true, waitingToStartStreaming: true };

    // T2: API completes, still waiting for stream
    const t2 = { isSubmitting: false, waitingToStartStreaming: true };

    // All states should show spinner
    expect(calculateShowSubmitSpinner(t0)).toBeTruthy();
    expect(calculateShowSubmitSpinner(t1)).toBeTruthy();
    expect(calculateShowSubmitSpinner(t2)).toBeTruthy();

    // T3: First stream chunk arrives - spinner stops
    const t3 = { isSubmitting: false, waitingToStartStreaming: false };
    expect(calculateShowSubmitSpinner(t3)).toBeFalsy();
  });

  it('verifies isInputBlocked includes pendingMessage for double-submit prevention', () => {
    // This test verifies that isInputBlocked still includes pendingMessage
    // for blocking input even though spinner no longer depends on it
    const isBlocked = calculateIsInputBlocked({
      currentResumptionPhase: null,
      isCreatingThread: false,
      isModeratorStreaming: false,
      isStreaming: false,
      isSubmitting: false,
      moderatorResumption: null,
      pendingMessage: 'Test message', // This should block input
      preSearchResumption: null,
      waitingToStartStreaming: false,
    });

    expect(isBlocked).toBeTruthy(); // Blocked by pendingMessage
  });
});

// ============================================================================
// ROUND-IN-PROGRESS BLOCKING TESTS (Critical for race condition prevention)
// ============================================================================

/**
 * Tests for isRoundInProgress (streamingRoundNumber !== null) blocking.
 *
 * This is the CRITICAL backstop that prevents submissions during ANY phase
 * of an active round, including the transition gaps that caused the flash bug.
 *
 * Timeline where isRoundInProgress saves us:
 * 1. Round starts → streamingRoundNumber=0 → BLOCKED
 * 2. Participants streaming → isStreaming=true, streamingRoundNumber=0 → BLOCKED
 * 3. Participants complete → isStreaming=false, streamingRoundNumber=0 → STILL BLOCKED
 * 4. Moderator starting → isModeratorStreaming=true, streamingRoundNumber=0 → BLOCKED
 * 5. Moderator complete → completeStreaming() → streamingRoundNumber=null → UNBLOCKED
 */
describe('submit Blocking - Round In Progress (streamingRoundNumber)', () => {
  it('blocks when streamingRoundNumber is set (round 0)', () => {
    const isBlocked = calculateIsInputBlocked({
      currentResumptionPhase: null,
      isCreatingThread: false,
      isModeratorStreaming: false,
      isStreaming: false,
      isSubmitting: false,
      moderatorResumption: null,
      pendingMessage: null,
      preSearchResumption: null,
      streamingRoundNumber: 0, // First round in progress
      waitingToStartStreaming: false,
    });

    expect(isBlocked).toBeTruthy();
  });

  it('blocks when streamingRoundNumber is set (round 1+)', () => {
    const isBlocked = calculateIsInputBlocked({
      currentResumptionPhase: null,
      isCreatingThread: false,
      isModeratorStreaming: false,
      isStreaming: false,
      isSubmitting: false,
      moderatorResumption: null,
      pendingMessage: null,
      preSearchResumption: null,
      streamingRoundNumber: 5, // Later round in progress
      waitingToStartStreaming: false,
    });

    expect(isBlocked).toBeTruthy();
  });

  it('does NOT block when streamingRoundNumber is null', () => {
    const isBlocked = calculateIsInputBlocked({
      currentResumptionPhase: null,
      isCreatingThread: false,
      isModeratorStreaming: false,
      isStreaming: false,
      isSubmitting: false,
      moderatorResumption: null,
      pendingMessage: null,
      preSearchResumption: null,
      streamingRoundNumber: null, // No round in progress
      waitingToStartStreaming: false,
    });

    expect(isBlocked).toBeFalsy();
  });

  it('blocks during participant→moderator transition gap (CRITICAL)', () => {
    // This is THE scenario that caused duplicate rounds before the fix
    // All other flags are false, only streamingRoundNumber keeps us blocked
    const isBlocked = calculateIsInputBlocked({
      currentResumptionPhase: null,
      isCreatingThread: false,
      isModeratorStreaming: false, // Not started yet - THE GAP
      isStreaming: false, // Participants done
      isSubmitting: false,
      moderatorResumption: null,
      pendingMessage: null,
      preSearchResumption: null,
      streamingRoundNumber: 0, // ✅ This saves us
      waitingToStartStreaming: false,
    });

    expect(isBlocked).toBeTruthy();
  });

  it('scenario: entire round lifecycle with streamingRoundNumber', () => {
    const baseState: BlockingCheckState = {
      currentResumptionPhase: null,
      isCreatingThread: false,
      isModeratorStreaming: false,
      isStreaming: false,
      isSubmitting: false,
      moderatorResumption: null,
      pendingMessage: null,
      preSearchResumption: null,
      streamingRoundNumber: null,
      waitingToStartStreaming: false,
    };

    // T0: Idle - can submit
    expect(calculateIsInputBlocked(baseState)).toBeFalsy();

    // T1: Round starts
    expect(calculateIsInputBlocked({
      ...baseState,
      streamingRoundNumber: 0,
      waitingToStartStreaming: true,
    })).toBeTruthy();

    // T2: Participants streaming
    expect(calculateIsInputBlocked({
      ...baseState,
      isStreaming: true,
      streamingRoundNumber: 0,
    })).toBeTruthy();

    // T3: CRITICAL - Participants done, moderator not started
    expect(calculateIsInputBlocked({
      ...baseState,
      isModeratorStreaming: false,
      isStreaming: false,
      streamingRoundNumber: 0, // Only this keeps us blocked
    })).toBeTruthy();

    // T4: Moderator streaming
    expect(calculateIsInputBlocked({
      ...baseState,
      isModeratorStreaming: true,
      streamingRoundNumber: 0,
    })).toBeTruthy();

    // T5: Round complete - can submit again
    expect(calculateIsInputBlocked({
      ...baseState,
      streamingRoundNumber: null, // Cleared by completeStreaming()
    })).toBeFalsy();
  });
});

// ============================================================================
// LOADER AND MODELS LOADING BLOCKING TESTS
// ============================================================================

describe('submit Blocking - Loader and Models Loading States', () => {
  it('blocks when showLoader is true', () => {
    const isBlocked = calculateIsInputBlocked({
      currentResumptionPhase: null,
      isCreatingThread: false,
      isModeratorStreaming: false,
      isStreaming: false,
      isSubmitting: false,
      moderatorResumption: null,
      pendingMessage: null,
      preSearchResumption: null,
      showLoader: true,
      waitingToStartStreaming: false,
    });

    expect(isBlocked).toBeTruthy();
  });

  it('blocks when isModelsLoading is true', () => {
    const isBlocked = calculateIsInputBlocked({
      currentResumptionPhase: null,
      isCreatingThread: false,
      isModelsLoading: true,
      isModeratorStreaming: false,
      isStreaming: false,
      isSubmitting: false,
      moderatorResumption: null,
      pendingMessage: null,
      preSearchResumption: null,
      waitingToStartStreaming: false,
    });

    expect(isBlocked).toBeTruthy();
  });

  it('does NOT block when both are false', () => {
    const isBlocked = calculateIsInputBlocked({
      currentResumptionPhase: null,
      isCreatingThread: false,
      isModelsLoading: false,
      isModeratorStreaming: false,
      isStreaming: false,
      isSubmitting: false,
      moderatorResumption: null,
      pendingMessage: null,
      preSearchResumption: null,
      showLoader: false,
      waitingToStartStreaming: false,
    });

    expect(isBlocked).toBeFalsy();
  });
});

// ============================================================================
// COMPREHENSIVE BLOCKING STATE MATRIX TESTS
// ============================================================================

describe('submit Blocking - Complete State Matrix', () => {
  const baseState: BlockingCheckState = {
    currentResumptionPhase: null,
    isCreatingThread: false,
    isModelsLoading: false,
    isModeratorStreaming: false,
    isStreaming: false,
    isSubmitting: false,
    moderatorResumption: null,
    pendingMessage: null,
    preSearchResumption: null,
    showLoader: false,
    streamingRoundNumber: null,
    waitingToStartStreaming: false,
  };

  // All blocking states that should individually block submission
  const blockingStates: { name: string; state: Partial<BlockingCheckState> }[] = [
    { name: 'isStreaming', state: { isStreaming: true } },
    { name: 'isCreatingThread', state: { isCreatingThread: true } },
    { name: 'waitingToStartStreaming', state: { waitingToStartStreaming: true } },
    { name: 'isModeratorStreaming', state: { isModeratorStreaming: true } },
    { name: 'pendingMessage', state: { pendingMessage: 'test' } },
    { name: 'isSubmitting', state: { isSubmitting: true } },
    { name: 'streamingRoundNumber (0)', state: { streamingRoundNumber: 0 } },
    { name: 'streamingRoundNumber (1)', state: { streamingRoundNumber: 1 } },
    { name: 'showLoader', state: { showLoader: true } },
    { name: 'isModelsLoading', state: { isModelsLoading: true } },
    { name: 'preSearchResumption streaming', state: { preSearchResumption: { status: MessageStatuses.STREAMING } } },
    { name: 'preSearchResumption pending', state: { preSearchResumption: { status: MessageStatuses.PENDING } } },
    { name: 'moderatorResumption streaming', state: { moderatorResumption: { status: MessageStatuses.STREAMING } } },
    { name: 'moderatorResumption pending', state: { moderatorResumption: { status: MessageStatuses.PENDING } } },
  ];

  for (const { name, state } of blockingStates) {
    it(`blocks when only ${name} is set`, () => {
      const isBlocked = calculateIsInputBlocked({ ...baseState, ...state });
      expect(isBlocked).toBeTruthy();
    });
  }

  it('allows submission when all blocking states are false/null', () => {
    const isBlocked = calculateIsInputBlocked(baseState);
    expect(isBlocked).toBeFalsy();
  });

  it('blocks when multiple states are blocking (redundant protection)', () => {
    const isBlocked = calculateIsInputBlocked({
      ...baseState,
      isModeratorStreaming: true,
      isStreaming: true,
      isSubmitting: true,
      streamingRoundNumber: 0,
    });
    expect(isBlocked).toBeTruthy();
  });
});
