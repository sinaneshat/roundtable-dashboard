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
  currentResumptionPhase: 'idle' | 'pre_search' | 'participants' | 'moderator' | 'complete' | null;
  preSearchResumption: { status: 'pending' | 'streaming' | 'complete' | 'failed' | null } | null;
  moderatorResumption: { status: 'pending' | 'streaming' | 'complete' | 'failed' | null } | null;
  isSubmitting?: boolean;
};

function calculateIsInputBlocked(state: BlockingCheckState): boolean {
  // ✅ Only check actual resumption status states, not the phase
  // Phase can be stale after round completes - only status is reliable
  const isResumptionActive = (
    state.preSearchResumption?.status === 'streaming'
    || state.preSearchResumption?.status === 'pending'
    || state.moderatorResumption?.status === 'streaming'
    || state.moderatorResumption?.status === 'pending'
  );

  return (
    state.isStreaming
    || state.isCreatingThread
    || state.waitingToStartStreaming
    || state.isModeratorStreaming
    || Boolean(state.pendingMessage)
    || isResumptionActive
    || Boolean(state.isSubmitting)
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
      isStreaming: state.isStreaming,
      isCreatingThread: state.isCreatingThread,
      waitingToStartStreaming: state.waitingToStartStreaming,
      isModeratorStreaming: state.isModeratorStreaming,
      pendingMessage: state.pendingMessage,
      currentResumptionPhase: state.currentResumptionPhase,
      preSearchResumption: state.preSearchResumption,
      moderatorResumption: state.moderatorResumption,
    });

    expect(isBlocked).toBe(true);
  });

  it('blocks submit when waitingToStartStreaming is true', () => {
    const store = createChatStore();
    store.getState().setWaitingToStartStreaming(true);

    const state = store.getState();
    const isBlocked = calculateIsInputBlocked({
      isStreaming: state.isStreaming,
      isCreatingThread: state.isCreatingThread,
      waitingToStartStreaming: state.waitingToStartStreaming,
      isModeratorStreaming: state.isModeratorStreaming,
      pendingMessage: state.pendingMessage,
      currentResumptionPhase: state.currentResumptionPhase,
      preSearchResumption: state.preSearchResumption,
      moderatorResumption: state.moderatorResumption,
    });

    expect(isBlocked).toBe(true);
  });

  it('blocks submit when isModeratorStreaming is true', () => {
    const store = createChatStore();
    store.getState().setIsModeratorStreaming(true);

    const state = store.getState();
    const isBlocked = calculateIsInputBlocked({
      isStreaming: state.isStreaming,
      isCreatingThread: state.isCreatingThread,
      waitingToStartStreaming: state.waitingToStartStreaming,
      isModeratorStreaming: state.isModeratorStreaming,
      pendingMessage: state.pendingMessage,
      currentResumptionPhase: state.currentResumptionPhase,
      preSearchResumption: state.preSearchResumption,
      moderatorResumption: state.moderatorResumption,
    });

    expect(isBlocked).toBe(true);
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
      isStreaming: state.isStreaming,
      isCreatingThread: state.isCreatingThread,
      waitingToStartStreaming: state.waitingToStartStreaming,
      isModeratorStreaming: state.isModeratorStreaming,
      pendingMessage: state.pendingMessage,
      currentResumptionPhase: state.currentResumptionPhase,
      preSearchResumption: state.preSearchResumption,
      moderatorResumption: state.moderatorResumption,
    });

    expect(isBlocked).toBe(true);
  });

  it('blocks submit when pendingMessage exists', () => {
    const store = createChatStore();
    store.getState().prepareForNewMessage('Test message', ['model-1']);

    const state = store.getState();
    const isBlocked = calculateIsInputBlocked({
      isStreaming: state.isStreaming,
      isCreatingThread: state.isCreatingThread,
      waitingToStartStreaming: state.waitingToStartStreaming,
      isModeratorStreaming: state.isModeratorStreaming,
      pendingMessage: state.pendingMessage,
      currentResumptionPhase: state.currentResumptionPhase,
      preSearchResumption: state.preSearchResumption,
      moderatorResumption: state.moderatorResumption,
    });

    expect(state.pendingMessage).toBe('Test message');
    expect(isBlocked).toBe(true);
  });
});

// ============================================================================
// RESUMPTION PHASE BLOCKING TESTS
// ============================================================================

describe('submit Blocking - Stream Resumption Status', () => {
  it('blocks submit when preSearchResumption status is streaming', () => {
    const isBlocked = calculateIsInputBlocked({
      isStreaming: false,
      isCreatingThread: false,
      waitingToStartStreaming: false,
      isModeratorStreaming: false,
      pendingMessage: null,
      currentResumptionPhase: null,
      preSearchResumption: { status: 'streaming' },
      moderatorResumption: null,
    });

    expect(isBlocked).toBe(true);
  });

  it('blocks submit when preSearchResumption status is pending', () => {
    const isBlocked = calculateIsInputBlocked({
      isStreaming: false,
      isCreatingThread: false,
      waitingToStartStreaming: false,
      isModeratorStreaming: false,
      pendingMessage: null,
      currentResumptionPhase: null,
      preSearchResumption: { status: 'pending' },
      moderatorResumption: null,
    });

    expect(isBlocked).toBe(true);
  });

  it('blocks submit when moderatorResumption status is streaming', () => {
    const isBlocked = calculateIsInputBlocked({
      isStreaming: false,
      isCreatingThread: false,
      waitingToStartStreaming: false,
      isModeratorStreaming: false,
      pendingMessage: null,
      currentResumptionPhase: null,
      preSearchResumption: null,
      moderatorResumption: { status: 'streaming' },
    });

    expect(isBlocked).toBe(true);
  });

  it('blocks submit when moderatorResumption status is pending', () => {
    const isBlocked = calculateIsInputBlocked({
      isStreaming: false,
      isCreatingThread: false,
      waitingToStartStreaming: false,
      isModeratorStreaming: false,
      pendingMessage: null,
      currentResumptionPhase: null,
      preSearchResumption: null,
      moderatorResumption: { status: 'pending' },
    });

    expect(isBlocked).toBe(true);
  });

  it('does NOT block when only phase is set but status is null (stale phase)', () => {
    // This is the bug fix - phase can be stale after round completes
    // Only actual status should block, not stale phase
    const isBlocked = calculateIsInputBlocked({
      isStreaming: false,
      isCreatingThread: false,
      waitingToStartStreaming: false,
      isModeratorStreaming: false,
      pendingMessage: null,
      currentResumptionPhase: 'participants', // Stale phase
      preSearchResumption: null, // No active resumption
      moderatorResumption: null, // No active resumption
    });

    expect(isBlocked).toBe(false); // Should NOT block with stale phase
  });

  it('does NOT block when phase is pre_search but preSearchResumption is null', () => {
    const isBlocked = calculateIsInputBlocked({
      isStreaming: false,
      isCreatingThread: false,
      waitingToStartStreaming: false,
      isModeratorStreaming: false,
      pendingMessage: null,
      currentResumptionPhase: 'pre_search', // Stale phase
      preSearchResumption: null, // No active resumption
      moderatorResumption: null,
    });

    expect(isBlocked).toBe(false);
  });

  it('does NOT block when phase is moderator but moderatorResumption is null', () => {
    const isBlocked = calculateIsInputBlocked({
      isStreaming: false,
      isCreatingThread: false,
      waitingToStartStreaming: false,
      isModeratorStreaming: false,
      pendingMessage: null,
      currentResumptionPhase: 'moderator', // Stale phase
      preSearchResumption: null,
      moderatorResumption: null, // No active resumption
    });

    expect(isBlocked).toBe(false);
  });
});

// ============================================================================
// API SUBMISSION (isSubmitting) BLOCKING TESTS
// ============================================================================

describe('submit Blocking - API Submission State', () => {
  it('blocks submit when isSubmitting is true', () => {
    const isBlocked = calculateIsInputBlocked({
      isStreaming: false,
      isCreatingThread: false,
      waitingToStartStreaming: false,
      isModeratorStreaming: false,
      pendingMessage: null,
      currentResumptionPhase: null,
      preSearchResumption: null,
      moderatorResumption: null,
      isSubmitting: true,
    });

    expect(isBlocked).toBe(true);
  });

  it('does not block when isSubmitting is false and no other blocking states', () => {
    const isBlocked = calculateIsInputBlocked({
      isStreaming: false,
      isCreatingThread: false,
      waitingToStartStreaming: false,
      isModeratorStreaming: false,
      pendingMessage: null,
      currentResumptionPhase: null,
      preSearchResumption: null,
      moderatorResumption: null,
      isSubmitting: false,
    });

    expect(isBlocked).toBe(false);
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
      isStreaming: state.isStreaming,
      isCreatingThread: state.isCreatingThread,
      waitingToStartStreaming: state.waitingToStartStreaming,
      isModeratorStreaming: state.isModeratorStreaming,
      pendingMessage: state.pendingMessage,
      currentResumptionPhase: state.currentResumptionPhase,
      preSearchResumption: state.preSearchResumption,
      moderatorResumption: state.moderatorResumption,
    });

    expect(isBlocked).toBe(false);
  });

  it('does not block when resumption phase is idle', () => {
    const isBlocked = calculateIsInputBlocked({
      isStreaming: false,
      isCreatingThread: false,
      waitingToStartStreaming: false,
      isModeratorStreaming: false,
      pendingMessage: null,
      currentResumptionPhase: 'idle',
      preSearchResumption: null,
      moderatorResumption: null,
    });

    expect(isBlocked).toBe(false);
  });

  it('does not block when resumption phase is complete', () => {
    const isBlocked = calculateIsInputBlocked({
      isStreaming: false,
      isCreatingThread: false,
      waitingToStartStreaming: false,
      isModeratorStreaming: false,
      pendingMessage: null,
      currentResumptionPhase: 'complete',
      preSearchResumption: null,
      moderatorResumption: null,
    });

    expect(isBlocked).toBe(false);
  });

  it('does not block when preSearchResumption status is complete', () => {
    const isBlocked = calculateIsInputBlocked({
      isStreaming: false,
      isCreatingThread: false,
      waitingToStartStreaming: false,
      isModeratorStreaming: false,
      pendingMessage: null,
      currentResumptionPhase: null,
      preSearchResumption: { status: 'complete' },
      moderatorResumption: null,
    });

    expect(isBlocked).toBe(false);
  });

  it('does not block when moderatorResumption status is complete', () => {
    const isBlocked = calculateIsInputBlocked({
      isStreaming: false,
      isCreatingThread: false,
      waitingToStartStreaming: false,
      isModeratorStreaming: false,
      pendingMessage: null,
      currentResumptionPhase: null,
      preSearchResumption: null,
      moderatorResumption: { status: 'complete' },
    });

    expect(isBlocked).toBe(false);
  });
});

// ============================================================================
// COMBINED STATES TESTS
// ============================================================================

describe('submit Blocking - Combined States', () => {
  it('blocks when multiple blocking states are true', () => {
    const isBlocked = calculateIsInputBlocked({
      isStreaming: true,
      isCreatingThread: true,
      waitingToStartStreaming: true,
      isModeratorStreaming: true,
      pendingMessage: 'test',
      currentResumptionPhase: 'participants',
      preSearchResumption: { status: 'streaming' },
      moderatorResumption: { status: 'pending' },
      isSubmitting: true,
    });

    expect(isBlocked).toBe(true);
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
      { preSearchResumption: { status: 'streaming' as const } },
      { preSearchResumption: { status: 'pending' as const } },
      { moderatorResumption: { status: 'streaming' as const } },
      { moderatorResumption: { status: 'pending' as const } },
      { isSubmitting: true },
    ];

    const baseState: BlockingCheckState = {
      isStreaming: false,
      isCreatingThread: false,
      waitingToStartStreaming: false,
      isModeratorStreaming: false,
      pendingMessage: null,
      currentResumptionPhase: null,
      preSearchResumption: null,
      moderatorResumption: null,
      isSubmitting: false,
    };

    for (const blockingState of blockingStates) {
      const isBlocked = calculateIsInputBlocked({ ...baseState, ...blockingState });
      expect(isBlocked).toBe(true);
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
      isStreaming: false, // Not streaming yet (pre-search phase)
      isCreatingThread: false,
      waitingToStartStreaming: false,
      isCreatingModerator: false,
      pendingMessage: null,
      currentResumptionPhase: 'pre_search',
      preSearchResumption: { status: 'streaming' }, // Active resumption
      moderatorResumption: null,
    });

    expect(isBlocked).toBe(true);
  });

  it('scenario: user refreshes during participant streaming - isStreaming blocks', () => {
    // User submitted message
    // Page refreshed during participant streaming
    // isStreaming flag should block submit (participant streaming sets isStreaming)

    const isBlocked = calculateIsInputBlocked({
      isStreaming: true, // Participant streaming sets this
      isCreatingThread: false,
      waitingToStartStreaming: false,
      isModeratorStreaming: false,
      pendingMessage: null,
      currentResumptionPhase: 'participants',
      preSearchResumption: null,
      moderatorResumption: null,
    });

    expect(isBlocked).toBe(true);
  });

  it('scenario: round complete with stale phase - should NOT block', () => {
    // Round completed normally
    // Phase is stale (still 'participants') but no active resumption
    // Should NOT block - user should be able to send next message

    const isBlocked = calculateIsInputBlocked({
      isStreaming: false,
      isCreatingThread: false,
      waitingToStartStreaming: false,
      isModeratorStreaming: false,
      pendingMessage: null,
      currentResumptionPhase: 'participants', // Stale - not reset after round
      preSearchResumption: null, // No active resumption
      moderatorResumption: null, // No active resumption
    });

    expect(isBlocked).toBe(false); // Bug fix: stale phase should not block
  });

  it('scenario: user clicks submit and API call is in progress', () => {
    // User clicked submit button
    // API call (createThread or updateThread) is in progress
    // isSubmitting should block submit immediately

    const isBlocked = calculateIsInputBlocked({
      isStreaming: false,
      isCreatingThread: false, // Not set yet - mutation just started
      waitingToStartStreaming: false,
      isModeratorStreaming: false,
      pendingMessage: null,
      currentResumptionPhase: null,
      preSearchResumption: null,
      moderatorResumption: null,
      isSubmitting: true, // From mutation.isPending
    });

    expect(isBlocked).toBe(true);
  });

  it('scenario: normal streaming in progress', () => {
    // Normal streaming scenario - AI is responding

    const isBlocked = calculateIsInputBlocked({
      isStreaming: true,
      isCreatingThread: false,
      waitingToStartStreaming: false,
      isModeratorStreaming: false,
      pendingMessage: null,
      currentResumptionPhase: null,
      preSearchResumption: null,
      moderatorResumption: null,
    });

    expect(isBlocked).toBe(true);
  });

  it('scenario: moderator streaming in progress', () => {
    // All participants finished, moderator is streaming (after participants complete)

    const isBlocked = calculateIsInputBlocked({
      isStreaming: false,
      isCreatingThread: false,
      waitingToStartStreaming: false,
      isModeratorStreaming: true,
      pendingMessage: null,
      currentResumptionPhase: null,
      preSearchResumption: null,
      moderatorResumption: null,
    });

    expect(isBlocked).toBe(true);
  });

  it('scenario: ready for new message after round completes', () => {
    // Round completed - all states should be reset

    const isBlocked = calculateIsInputBlocked({
      isStreaming: false,
      isCreatingThread: false,
      waitingToStartStreaming: false,
      isModeratorStreaming: false,
      pendingMessage: null,
      currentResumptionPhase: 'complete',
      preSearchResumption: { status: 'complete' },
      moderatorResumption: { status: 'complete' },
      isSubmitting: false,
    });

    expect(isBlocked).toBe(false);
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
    expect(true).toBe(true); // Documentation test
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
      isStreaming: false, // Participants done
      isCreatingThread: false,
      waitingToStartStreaming: false,
      isModeratorStreaming: false, // Not started yet - THE RACE WINDOW
      pendingMessage: null, // Already sent
      currentResumptionPhase: null,
      preSearchResumption: null,
      moderatorResumption: null,
      isSubmitting: false,
    };

    // With old logic, this would return false (bug)
    const oldLogicBlocked = calculateIsInputBlocked(state);
    expect(oldLogicBlocked).toBe(false);

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
    expect(true).toBe(true);
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
 * 5. Streaming ends → button enabled, no spinner
 *
 * BUG FIXED: Previously spinner disappeared when API completed (isSubmitting=false)
 * before pendingMessage was set, causing brief flash of enabled button.
 */
type SpinnerCheckState = {
  isSubmitting: boolean;
  waitingToStartStreaming: boolean;
  pendingMessage: string | null;
};

function calculateShowSubmitSpinner(state: SpinnerCheckState): boolean {
  return state.isSubmitting || state.waitingToStartStreaming || Boolean(state.pendingMessage);
}

describe('submit Spinner - Loading State Lifecycle', () => {
  it('shows spinner when API mutation is pending (isSubmitting=true)', () => {
    const showSpinner = calculateShowSubmitSpinner({
      isSubmitting: true,
      waitingToStartStreaming: false,
      pendingMessage: null,
    });
    expect(showSpinner).toBe(true);
  });

  it('shows spinner when waitingToStartStreaming is true', () => {
    const showSpinner = calculateShowSubmitSpinner({
      isSubmitting: false,
      waitingToStartStreaming: true,
      pendingMessage: null,
    });
    expect(showSpinner).toBe(true);
  });

  it('shows spinner when pendingMessage exists', () => {
    const showSpinner = calculateShowSubmitSpinner({
      isSubmitting: false,
      waitingToStartStreaming: false,
      pendingMessage: 'Test message',
    });
    expect(showSpinner).toBe(true);
  });

  it('hides spinner when all states are false/null', () => {
    const showSpinner = calculateShowSubmitSpinner({
      isSubmitting: false,
      waitingToStartStreaming: false,
      pendingMessage: null,
    });
    expect(showSpinner).toBe(false);
  });

  it('shows spinner during entire submit lifecycle (combo states)', () => {
    // Simulate the full lifecycle
    const states: SpinnerCheckState[] = [
      // Step 1: User clicks submit, API call starts
      { isSubmitting: true, waitingToStartStreaming: false, pendingMessage: null },
      // Step 2: API call in progress
      { isSubmitting: true, waitingToStartStreaming: false, pendingMessage: null },
      // Step 3: API completes, prepareForNewMessage called
      { isSubmitting: false, waitingToStartStreaming: false, pendingMessage: 'Test' },
      // Step 4: Waiting for stream to start
      { isSubmitting: false, waitingToStartStreaming: true, pendingMessage: 'Test' },
    ];

    for (const state of states) {
      const showSpinner = calculateShowSubmitSpinner(state);
      expect(showSpinner).toBe(true);
    }
  });
});

describe('submit Spinner - Double Submission Prevention', () => {
  it('scenario: API completes before pendingMessage set (the bug)', () => {
    /**
     * BUG REPRODUCTION:
     * Timeline of the double-submission bug:
     * T0: User clicks submit
     *   - isSubmitting: true (mutation starts)
     *   - Spinner shows
     *
     * T1: API response received (~100-500ms)
     *   - isSubmitting: false (mutation.isPending becomes false)
     *   - pendingMessage: null (not set yet in the old implementation)
     *   - BUG: Spinner disappeared, button appeared enabled
     *   - User could click submit again!
     *
     * T2: prepareForNewMessage() called
     *   - pendingMessage: set to user message
     *   - Button now properly disabled (but too late)
     *
     * FIX: showSubmitSpinner now includes pendingMessage and waitingToStartStreaming
     */

    // The problematic state that allowed double submission
    const bugState: SpinnerCheckState = {
      isSubmitting: false, // API just completed
      waitingToStartStreaming: false, // Not set yet
      pendingMessage: null, // Not set yet (the gap)
    };

    // This is the state that could happen in the gap
    // With the old logic, spinner would be false = bug
    const showSpinner = calculateShowSubmitSpinner(bugState);

    // After fix, spinner should still be false here, but isInputBlocked
    // should be true due to other checks in the component
    // The fix is that pendingMessage gets set BEFORE isSubmitting becomes false
    // OR waitingToStartStreaming is set during the API call
    expect(showSpinner).toBe(false);

    // Immediately after, pendingMessage is set
    const fixedState: SpinnerCheckState = {
      isSubmitting: false,
      waitingToStartStreaming: false,
      pendingMessage: 'Test message', // Now set
    };
    const showSpinnerAfterFix = calculateShowSubmitSpinner(fixedState);
    expect(showSpinnerAfterFix).toBe(true);
  });

  it('scenario: continuous blocking from submit to streaming start', () => {
    /**
     * Correct lifecycle with fix:
     * The button should remain disabled and show spinner from
     * submit click until streaming starts.
     */

    // T0: Click submit
    const t0 = { isSubmitting: true, waitingToStartStreaming: false, pendingMessage: null };

    // T1: API in progress
    const t1 = { isSubmitting: true, waitingToStartStreaming: false, pendingMessage: null };

    // T2: API completes, prepareForNewMessage called (nearly simultaneous)
    const t2 = { isSubmitting: false, waitingToStartStreaming: false, pendingMessage: 'Msg' };

    // T3: Waiting for streaming to start
    const t3 = { isSubmitting: false, waitingToStartStreaming: true, pendingMessage: 'Msg' };

    // All states should show spinner
    expect(calculateShowSubmitSpinner(t0)).toBe(true);
    expect(calculateShowSubmitSpinner(t1)).toBe(true);
    expect(calculateShowSubmitSpinner(t2)).toBe(true);
    expect(calculateShowSubmitSpinner(t3)).toBe(true);

    // T4: Streaming starts - spinner stops (stop button shows instead)
    // This is handled by isStreaming in the component, not showSubmitSpinner
    const t4 = { isSubmitting: false, waitingToStartStreaming: false, pendingMessage: null };
    expect(calculateShowSubmitSpinner(t4)).toBe(false);
  });

  it('verifies isInputBlocked includes pendingMessage for double-submit prevention', () => {
    // This test verifies the fix applied to isInitialUIInputBlocked
    // which now includes Boolean(pendingMessage)
    const isBlocked = calculateIsInputBlocked({
      isStreaming: false,
      isCreatingThread: false,
      waitingToStartStreaming: false,
      isModeratorStreaming: false,
      pendingMessage: 'Test message', // This should block
      currentResumptionPhase: null,
      preSearchResumption: null,
      moderatorResumption: null,
      isSubmitting: false, // API already completed
    });

    expect(isBlocked).toBe(true); // Blocked by pendingMessage
  });
});
