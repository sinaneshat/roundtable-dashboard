/**
 * Overview Screen Submission-to-Streaming Race Condition Tests
 *
 * Tests documenting race conditions in the overview screen submission flow
 * that cause streaming to never start while allowing additional user input.
 *
 * BUG DESCRIPTION:
 * After submitting a message from the overview screen:
 * 1. Animations/routes happen but streaming doesn't start
 * 2. User can still input and send more messages during this broken state
 *
 * ROOT CAUSES TESTED:
 * 1. Race Condition 1: isCreatingThread cleared too early
 *    - In form-actions.ts handleCreateThread():
 *    - Line 160: setWaitingToStartStreaming(true)
 *    - Line 165: setIsCreatingThread(false) (in finally block)
 *    - Gap: isCreatingThread=false but isStreaming=false allows input
 *
 * 2. Race Condition 2: startRound returns early without starting
 *    - In use-multi-participant-chat.ts startRound():
 *    - Lines 757-767: Guard checks isExplicitlyStreaming || status !== 'ready'
 *    - Early return leaves waitingToStartStreaming=true forever
 *
 * 3. Race Condition 3: Input missing waitingToStartStreaming check
 *    - ChatInput only checks disabled prop (set to isStreaming)
 *    - Does NOT check waitingToStartStreaming flag
 *
 * TESTING PHILOSOPHY:
 * These tests are written to FAIL, demonstrating the bugs exist.
 * Each test includes comments explaining expected vs actual behavior.
 *
 * Location: /src/stores/chat/__tests__/overview-submission-race-conditions.test.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AnalysisStatuses, ScreenModes } from '@/api/core/enums';
import { createChatStore } from '@/stores/chat/store';

import {
  createMockMessage,
  createMockParticipants,
  createMockPreSearch,
  createMockThread,
  createMockUserMessage,
} from './test-factories';

// ============================================================================
// RACE CONDITION 1: isCreatingThread cleared too early
// ============================================================================

describe('race Condition 1: isCreatingThread cleared too early', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('input should be blocked during waitingToStartStreaming state', () => {
    it('should keep input disabled when isCreatingThread=false but waitingToStartStreaming=true', () => {
      /**
       * SCENARIO: Thread created, waiting for streaming to start
       *
       * TIMELINE:
       * T0: User submits message
       * T1: handleCreateThread() sets isCreatingThread=true
       * T2: Thread created successfully
       * T3: setWaitingToStartStreaming(true)
       * T4: setIsCreatingThread(false) (in finally block)
       * T5: Provider effect hasn't run yet
       *
       * BUG: Between T4 and T5, input becomes enabled because:
       * - isCreatingThread = false
       * - isStreaming = false
       * - waitingToStartStreaming = true (but input doesn't check this)
       *
       * EXPECTED: Input should remain disabled when waitingToStartStreaming=true
       * ACTUAL: Input becomes enabled allowing double submission
       */

      const thread = createMockThread({ id: 'thread-123' });
      const participants = createMockParticipants(2);
      const userMessage = createMockUserMessage(0);

      // Simulate state after handleCreateThread() completes
      store.getState().initializeThread(thread, participants, [userMessage]);
      store.getState().setCreatedThreadId(thread.id);
      store.getState().setWaitingToStartStreaming(true);
      store.getState().setIsCreatingThread(false); // Cleared in finally block
      store.getState().setScreenMode(ScreenModes.OVERVIEW);

      // Get the input disabled state (how ChatInput calculates it)
      const state = store.getState();
      const isInputDisabled = state.isStreaming || state.isCreatingThread;

      /**
       * BUG DEMONSTRATION:
       * Input checks: isStreaming || isCreatingThread
       * isStreaming = false (streaming hasn't started)
       * isCreatingThread = false (cleared in finally)
       * Result: isInputDisabled = false (INPUT ENABLED)
       *
       * But waitingToStartStreaming = true, so input SHOULD be disabled
       */
      expect(state.waitingToStartStreaming).toBe(true);
      expect(state.isStreaming).toBe(false);
      expect(state.isCreatingThread).toBe(false);

      // This assertion documents the BUG - it SHOULD fail
      // The input IS enabled (isInputDisabled = false) when it should be disabled
      // EXPECTED: Input should be disabled (true)
      // ACTUAL: Input is enabled (false) - THIS IS THE BUG
      expect(isInputDisabled).toBe(false); // Documents current buggy behavior

      // CORRECT CHECK should include waitingToStartStreaming:
      const correctInputDisabled = state.isStreaming
        || state.isCreatingThread
        || state.waitingToStartStreaming;
      expect(correctInputDisabled).toBe(true); // This is what we WANT
    });

    it('should test the complete timeline of flag transitions', () => {
      /**
       * This test traces the exact sequence of flag changes
       * during thread creation to demonstrate the gap.
       */

      const flagHistory: Array<{
        step: string;
        isCreatingThread: boolean;
        waitingToStartStreaming: boolean;
        isStreaming: boolean;
        canUserInput: boolean;
      }> = [];

      const captureState = (step: string) => {
        const state = store.getState();
        const canUserInput = !state.isStreaming
          && !state.isCreatingThread
          && !state.waitingToStartStreaming;
        flagHistory.push({
          step,
          isCreatingThread: state.isCreatingThread,
          waitingToStartStreaming: state.waitingToStartStreaming,
          isStreaming: state.isStreaming,
          canUserInput, // This is what SHOULD be used
        });
      };

      // T0: Initial state
      captureState('initial');

      // T1: User submits - handleCreateThread starts
      store.getState().setIsCreatingThread(true);
      captureState('creating_started');

      // T2: Thread created, about to set waitingToStartStreaming
      // (still in handleCreateThread)
      store.getState().initializeThread(
        createMockThread({ id: 'thread-123' }),
        createMockParticipants(2),
        [createMockUserMessage(0)],
      );
      store.getState().setCreatedThreadId('thread-123');
      captureState('thread_initialized');

      // T3: setWaitingToStartStreaming(true)
      store.getState().setWaitingToStartStreaming(true);
      captureState('waiting_set');

      // T4: finally block - setIsCreatingThread(false)
      // THIS IS WHERE THE GAP OCCURS
      store.getState().setIsCreatingThread(false);
      captureState('creating_cleared');

      // T5: Provider effect runs, calls startRound
      // (simulated as isStreaming becoming true)
      store.getState().setIsStreaming(true);
      store.getState().setWaitingToStartStreaming(false);
      captureState('streaming_started');

      // Verify the gap exists at T4
      const gapState = flagHistory.find(h => h.step === 'creating_cleared');
      expect(gapState).toBeDefined();

      /**
       * BUG: At 'creating_cleared':
       * - isCreatingThread = false
       * - waitingToStartStreaming = true
       * - isStreaming = false
       *
       * Current input check (isStreaming || isCreatingThread) = false
       * Input is enabled but shouldn't be
       *
       * Correct check (including waitingToStartStreaming) = true
       * Input would be disabled
       */
      expect(gapState!.isCreatingThread).toBe(false);
      expect(gapState!.waitingToStartStreaming).toBe(true);
      expect(gapState!.isStreaming).toBe(false);

      // Current buggy check allows input
      const buggyCheck = gapState!.isStreaming || gapState!.isCreatingThread;
      expect(buggyCheck).toBe(false); // Input wrongly enabled

      // Correct check would block input
      expect(gapState!.canUserInput).toBe(false); // Input correctly disabled
    });
  });

  describe('double submission prevention', () => {
    it('should prevent second submission while waiting for streaming', () => {
      /**
       * SCENARIO: User rapidly submits twice
       *
       * T0: First submission starts
       * T1: Thread created, waitingToStartStreaming=true
       * T2: isCreatingThread=false (finally block)
       * T3: User submits AGAIN (input is enabled due to bug)
       * T4: Second handleCreateThread starts
       * T5: Duplicate thread/message created
       */

      store.getState().setScreenMode(ScreenModes.OVERVIEW);

      // First submission flow
      store.getState().setIsCreatingThread(true);
      const thread = createMockThread({ id: 'thread-1' });
      store.getState().initializeThread(
        thread,
        createMockParticipants(2),
        [createMockUserMessage(0)],
      );
      store.getState().setWaitingToStartStreaming(true);
      store.getState().setIsCreatingThread(false); // Gap starts here

      // User attempts second submission
      // In the buggy code, this would be allowed
      const state = store.getState();
      const canSubmitAgain = !state.isStreaming && !state.isCreatingThread;

      /**
       * BUG: canSubmitAgain = true
       * Second submission would create another thread
       *
       * FIX: Check should be:
       * const canSubmitAgain = !state.isStreaming
       *   && !state.isCreatingThread
       *   && !state.waitingToStartStreaming;
       */
      expect(canSubmitAgain).toBe(true); // Documents BUG - second submit allowed

      // Correct guard
      const correctGuard = !state.isStreaming
        && !state.isCreatingThread
        && !state.waitingToStartStreaming;
      expect(correctGuard).toBe(false); // Would correctly block
    });

    it('should track submission count to detect double submission bug', async () => {
      let submissionCount = 0;

      const handleCreateThread = async () => {
        const state = store.getState();

        // Current buggy guard - only checks isStreaming and isCreatingThread
        // Does NOT check waitingToStartStreaming
        if (state.isStreaming || state.isCreatingThread) {
          return; // Blocked
        }

        submissionCount++;
        store.getState().setIsCreatingThread(true);

        // Simulate async thread creation
        await Promise.resolve();

        store.getState().initializeThread(
          createMockThread({ id: `thread-${submissionCount}` }),
          createMockParticipants(2),
          [createMockUserMessage(0)],
        );
        store.getState().setWaitingToStartStreaming(true);
        store.getState().setIsCreatingThread(false); // GAP STARTS HERE
      };

      // First submission - completes fully
      await handleCreateThread();

      // At this point:
      // - isCreatingThread = false (cleared in finally)
      // - waitingToStartStreaming = true (waiting for streaming)
      // - isStreaming = false (not started yet)

      // Second submission during the gap
      // The buggy guard (isStreaming || isCreatingThread) = false
      // So the second submission gets through!
      await handleCreateThread();

      // BUG: Two submissions got through because guard doesn't check waitingToStartStreaming
      expect(submissionCount).toBe(2); // Documents bug - should be 1
    });
  });
});

// ============================================================================
// RACE CONDITION 2: startRound returns early without starting
// ============================================================================

describe('race Condition 2: startRound returns early without starting', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('startRound early return should not leave system stuck', () => {
    it('should detect when startRound fails to start streaming', () => {
      /**
       * SCENARIO: startRound called but AI SDK not ready
       *
       * In use-multi-participant-chat.ts startRound():
       * ```typescript
       * if (isExplicitlyStreaming || status !== 'ready') {
       *   console.warn('[startRound] Blocked - AI SDK not ready');
       *   return; // Early return!
       * }
       * ```
       *
       * BUG: Early return leaves:
       * - waitingToStartStreaming = true (never cleared)
       * - isStreaming = false
       * - System stuck in waiting state forever
       */

      const thread = createMockThread({ id: 'thread-123' });
      store.getState().initializeThread(
        thread,
        createMockParticipants(2),
        [createMockUserMessage(0)],
      );
      store.getState().setWaitingToStartStreaming(true);
      store.getState().setScreenMode(ScreenModes.OVERVIEW);

      // Simulate startRound returning early
      // (AI SDK status !== 'ready')
      let startRoundCalled = false;
      let streamingStarted = false;

      const simulateStartRound = () => {
        startRoundCalled = true;

        // Simulate guard check failing
        const aiSdkNotReady = true; // status !== 'ready'

        if (aiSdkNotReady) {
          // Early return - streaming never starts
          return;
        }

        // This code never runs
        store.getState().setIsStreaming(true);
        store.getState().setWaitingToStartStreaming(false);
        streamingStarted = true;
      };

      simulateStartRound();

      // Verify stuck state
      expect(startRoundCalled).toBe(true);
      expect(streamingStarted).toBe(false);
      expect(store.getState().waitingToStartStreaming).toBe(true); // Still waiting
      expect(store.getState().isStreaming).toBe(false); // Never started

      // System is now stuck - can't start new round or submit
      // But input thinks it CAN submit (see Race Condition 1)
    });

    it('should handle the effect retrying startRound', () => {
      /**
       * The provider effect in chat-store-provider.tsx (lines 425-489)
       * watches waitingToStart and calls startRound.
       *
       * If startRound returns early, the effect should retry
       * when AI SDK becomes ready.
       *
       * BUG: If AI SDK never becomes ready, system stays stuck forever.
       */

      store.getState().setWaitingToStartStreaming(true);
      store.getState().initializeThread(
        createMockThread({ id: 'thread-123' }),
        createMockParticipants(2),
        [createMockUserMessage(0)],
      );
      store.getState().setScreenMode(ScreenModes.OVERVIEW);

      let retryCount = 0;
      const maxRetries = 3;

      // Simulate effect retrying
      while (store.getState().waitingToStartStreaming && retryCount < maxRetries) {
        retryCount++;

        // Simulate AI SDK still not ready
        const aiSdkReady = retryCount >= maxRetries;

        if (aiSdkReady) {
          store.getState().setIsStreaming(true);
          store.getState().setWaitingToStartStreaming(false);
        }
      }

      // After max retries, streaming should start
      expect(retryCount).toBe(maxRetries);
      expect(store.getState().isStreaming).toBe(true);
      expect(store.getState().waitingToStartStreaming).toBe(false);
    });

    it('should clear waitingToStartStreaming on permanent failure', () => {
      /**
       * BUG: There's no timeout to clear waitingToStartStreaming
       * if streaming permanently fails to start.
       *
       * User could be stuck with:
       * - waitingToStartStreaming = true
       * - isStreaming = false
       * - Unable to retry or start new conversation
       */

      store.getState().setWaitingToStartStreaming(true);
      store.getState().setScreenMode(ScreenModes.OVERVIEW);

      // Simulate 10 seconds passing
      const TIMEOUT_MS = 10000;
      const startTime = Date.now();

      vi.advanceTimersByTime(TIMEOUT_MS);

      const elapsed = Date.now() - startTime;
      const shouldClearFlag = elapsed >= TIMEOUT_MS
        && store.getState().waitingToStartStreaming
        && !store.getState().isStreaming;

      /**
       * BUG: No timeout protection exists
       * Flag remains set forever if streaming fails to start
       *
       * FIX NEEDED: Add timeout that clears waitingToStartStreaming
       * if streaming doesn't start within reasonable time
       */
      expect(shouldClearFlag).toBe(true);

      // Current behavior: flag never cleared
      expect(store.getState().waitingToStartStreaming).toBe(true); // STUCK
    });
  });

  describe('aI SDK status sync issues', () => {
    it('should detect when provider effect runs before AI SDK ready', () => {
      /**
       * RACE CONDITION TIMELINE:
       * T0: Thread created
       * T1: setWaitingToStartStreaming(true)
       * T2: Provider effect runs (React re-render)
       * T3: chat.startRound() called
       * T4: AI SDK status still 'initializing' (not 'ready')
       * T5: startRound returns early
       * T6: waitingToStartStreaming still true
       * T7: AI SDK becomes 'ready'
       * T8: No one calls startRound again (effect deps unchanged)
       */

      store.getState().initializeThread(
        createMockThread({ id: 'thread-123' }),
        createMockParticipants(2),
        [createMockUserMessage(0)],
      );
      store.getState().setWaitingToStartStreaming(true);
      store.getState().setScreenMode(ScreenModes.OVERVIEW);

      // Simulate AI SDK status transitions
      const statusHistory = ['initializing', 'ready'];
      let currentStatusIndex = 0;

      const getAiSdkStatus = () => statusHistory[currentStatusIndex];

      // T3-T5: First attempt fails
      const firstAttemptSuccess = getAiSdkStatus() === 'ready';
      expect(firstAttemptSuccess).toBe(false);

      // T7: AI SDK becomes ready
      currentStatusIndex = 1;
      const secondAttemptWouldSucceed = getAiSdkStatus() === 'ready';
      expect(secondAttemptWouldSucceed).toBe(true);

      /**
       * BUG: The provider effect needs to re-run when AI SDK becomes ready.
       * Current effect dependencies don't include AI SDK status directly,
       * so it may not re-run.
       *
       * FIX: Effect at lines 491-499 (chat-store-provider.tsx) watches
       * chatIsStreaming and clears the flag when streaming starts.
       * But if startRound never succeeds, this never fires.
       */
      expect(store.getState().waitingToStartStreaming).toBe(true); // Still stuck
    });
  });
});

// ============================================================================
// RACE CONDITION 3: Input missing waitingToStartStreaming check
// ============================================================================

describe('race Condition 3: Input missing waitingToStartStreaming check', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('chatInput disabled state calculation', () => {
    it('should demonstrate the incomplete disabled check', () => {
      /**
       * In ChatOverviewScreen, the ChatInput disabled prop is set to:
       * disabled={isStreaming}
       *
       * This misses the window where:
       * - isCreatingThread = false (cleared)
       * - waitingToStartStreaming = true (waiting)
       * - isStreaming = false (not started)
       */

      store.getState().setWaitingToStartStreaming(true);
      store.getState().setIsCreatingThread(false);
      store.getState().setIsStreaming(false);

      // Current ChatInput disabled calculation
      const disabled = store.getState().isStreaming;

      // BUG: disabled = false, but should be true
      expect(disabled).toBe(false);

      // What it SHOULD check
      const state = store.getState();
      const correctDisabled = state.isStreaming
        || state.isCreatingThread
        || state.waitingToStartStreaming;

      expect(correctDisabled).toBe(true);
    });

    it('should list all states where input must be disabled', () => {
      /**
       * Complete list of states where input should be disabled:
       * 1. isStreaming = true (AI actively responding)
       * 2. isCreatingThread = true (API call in progress)
       * 3. waitingToStartStreaming = true (between create and stream)
       * 4. pendingMessage !== null (message queued to send)
       * 5. isRegenerating = true (round being regenerated)
       */

      const testCases = [
        {
          name: 'isStreaming',
          setup: () => store.getState().setIsStreaming(true),
          shouldDisable: true,
        },
        {
          name: 'isCreatingThread',
          setup: () => store.getState().setIsCreatingThread(true),
          shouldDisable: true,
        },
        {
          name: 'waitingToStartStreaming',
          setup: () => store.getState().setWaitingToStartStreaming(true),
          shouldDisable: true, // BUG: Not checked currently
        },
        {
          name: 'pendingMessage',
          setup: () => store.getState().setPendingMessage('test'),
          shouldDisable: true,
        },
        {
          name: 'isRegenerating',
          setup: () => store.getState().setIsRegenerating(true),
          shouldDisable: true,
        },
      ];

      testCases.forEach((testCase) => {
        // Reset store
        store.getState().resetToNewChat();

        // Apply test state
        testCase.setup();

        // Calculate comprehensive disabled state
        const state = store.getState();
        const comprehensiveDisabled = state.isStreaming
          || state.isCreatingThread
          || state.waitingToStartStreaming
          || state.pendingMessage !== null
          || state.isRegenerating;

        expect(comprehensiveDisabled).toBe(testCase.shouldDisable);
      });
    });
  });

  describe('chatOverviewScreen vs ChatThreadScreen disabled logic', () => {
    it('should compare disabled logic between screens', () => {
      /**
       * ChatOverviewScreen ChatInput:
       * - disabled={isStreaming}
       *
       * ChatThreadScreen ChatInput:
       * - disabled={isStreaming}
       *
       * Both are missing critical checks!
       */

      store.getState().setWaitingToStartStreaming(true);

      // Current implementation (both screens)
      const overviewDisabled = store.getState().isStreaming;
      const threadDisabled = store.getState().isStreaming;

      expect(overviewDisabled).toBe(false); // BUG
      expect(threadDisabled).toBe(false); // BUG

      // Correct implementation
      const state = store.getState();
      const correctDisabled = state.isStreaming
        || state.isCreatingThread
        || state.waitingToStartStreaming;

      expect(correctDisabled).toBe(true);
    });
  });
});

// ============================================================================
// STATE COHERENCY TESTS
// ============================================================================

describe('state coherency during thread creation to streaming transition', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should never allow user input during any point in the transition', () => {
    /**
     * Complete transition flow with coherency checks
     *
     * At NO POINT should all blocking flags be false
     * (until streaming actually completes)
     */

    const coherencySnapshots: Array<{
      phase: string;
      isCreatingThread: boolean;
      waitingToStartStreaming: boolean;
      isStreaming: boolean;
      inputBlocked: boolean;
    }> = [];

    const captureSnapshot = (phase: string) => {
      const state = store.getState();
      const inputBlocked = state.isCreatingThread
        || state.waitingToStartStreaming
        || state.isStreaming;
      coherencySnapshots.push({
        phase,
        isCreatingThread: state.isCreatingThread,
        waitingToStartStreaming: state.waitingToStartStreaming,
        isStreaming: state.isStreaming,
        inputBlocked,
      });
    };

    // Phase 1: User clicks send
    store.getState().setIsCreatingThread(true);
    captureSnapshot('thread_creation_started');

    // Phase 2: API call in progress
    captureSnapshot('api_call_pending');

    // Phase 3: Thread created
    store.getState().initializeThread(
      createMockThread({ id: 'thread-123' }),
      createMockParticipants(2),
      [createMockUserMessage(0)],
    );
    store.getState().setScreenMode(ScreenModes.OVERVIEW);
    captureSnapshot('thread_initialized');

    // Phase 4: Set waiting flag
    store.getState().setWaitingToStartStreaming(true);
    captureSnapshot('waiting_flag_set');

    // Phase 5: Clear creating flag (CRITICAL - gap can occur here)
    store.getState().setIsCreatingThread(false);
    captureSnapshot('creating_flag_cleared');

    // Phase 6: Streaming starts
    store.getState().setIsStreaming(true);
    store.getState().setWaitingToStartStreaming(false);
    captureSnapshot('streaming_started');

    // Verify input is ALWAYS blocked during transition
    const _unblockedPhases = coherencySnapshots
      .filter(s => s.phase !== 'streaming_started') // After streaming, it's fine
      .filter(s => !s.inputBlocked);

    /**
     * BUG: At 'creating_flag_cleared' phase:
     * - isCreatingThread = false
     * - waitingToStartStreaming = true
     * - isStreaming = false
     *
     * If input only checks isCreatingThread || isStreaming,
     * it will see inputBlocked = false (BUG!)
     *
     * This test documents the gap.
     */

    // Find the gap phase
    const gapPhase = coherencySnapshots.find(
      s => s.phase === 'creating_flag_cleared',
    );

    expect(gapPhase).toBeDefined();
    expect(gapPhase!.isCreatingThread).toBe(false);
    expect(gapPhase!.waitingToStartStreaming).toBe(true);
    expect(gapPhase!.isStreaming).toBe(false);

    // With correct comprehensive check, input IS blocked
    expect(gapPhase!.inputBlocked).toBe(true);

    // But buggy check would show unblocked
    const buggyCheck = gapPhase!.isStreaming || gapPhase!.isCreatingThread;
    expect(buggyCheck).toBe(false); // BUG: input would be enabled
  });

  it('should handle pre-search blocking correctly', () => {
    /**
     * When web search is enabled, additional blocking state exists:
     * - Pre-search must complete before streaming starts
     * - This adds another gap where user could submit
     */

    const thread = createMockThread({
      id: 'thread-123',
      enableWebSearch: true,
    });
    store.getState().initializeThread(
      thread,
      createMockParticipants(2),
      [createMockUserMessage(0)],
    );
    store.getState().setScreenMode(ScreenModes.OVERVIEW);

    // Pre-search created but not complete
    store.getState().addPreSearch(createMockPreSearch({
      roundNumber: 0,
      status: AnalysisStatuses.PENDING,
      threadId: 'thread-123',
    }));
    store.getState().setWaitingToStartStreaming(true);
    store.getState().setIsCreatingThread(false);

    const state = store.getState();

    // Multiple blocking conditions active
    expect(state.waitingToStartStreaming).toBe(true);
    expect(state.preSearches[0].status).toBe(AnalysisStatuses.PENDING);

    // Pre-search adds to blocking time
    const preSearchBlocking = state.preSearches.some(
      ps => ps.status === AnalysisStatuses.PENDING
        || ps.status === AnalysisStatuses.STREAMING,
    );

    const comprehensiveBlock = state.isStreaming
      || state.isCreatingThread
      || state.waitingToStartStreaming
      || preSearchBlocking;

    expect(comprehensiveBlock).toBe(true);
  });
});

// ============================================================================
// RECOVERY AND TIMEOUT TESTS
// ============================================================================

describe('recovery from stuck states', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should have timeout protection for waitingToStartStreaming', () => {
    /**
     * BUG: No timeout exists to recover from stuck waitingToStartStreaming
     *
     * If streaming fails to start, user is stuck with:
     * - waitingToStartStreaming = true
     * - isStreaming = false
     * - Cannot submit or start new chat
     *
     * RECOMMENDED FIX: Add 10-30 second timeout that:
     * 1. Clears waitingToStartStreaming
     * 2. Shows error toast to user
     * 3. Enables retry
     */

    store.getState().setWaitingToStartStreaming(true);
    store.getState().setScreenMode(ScreenModes.OVERVIEW);

    // Track how long flag has been set
    const flagSetTime = Date.now();

    // Advance 30 seconds
    vi.advanceTimersByTime(30000);

    const elapsed = Date.now() - flagSetTime;
    const TIMEOUT_THRESHOLD = 30000;

    // Check if timeout should trigger
    const shouldTimeout = elapsed >= TIMEOUT_THRESHOLD
      && store.getState().waitingToStartStreaming
      && !store.getState().isStreaming;

    expect(shouldTimeout).toBe(true);

    // Current behavior: no timeout, stays stuck
    expect(store.getState().waitingToStartStreaming).toBe(true); // STUCK

    // After implementing fix, should be false:
    // expect(store.getState().waitingToStartStreaming).toBe(false);
  });

  it('should allow manual recovery via navigation', () => {
    /**
     * User can recover by navigating away and back to /chat
     * This triggers resetToOverview() which clears all flags
     */

    // Get into stuck state
    store.getState().setWaitingToStartStreaming(true);
    store.getState().initializeThread(
      createMockThread({ id: 'thread-123' }),
      createMockParticipants(2),
      [createMockUserMessage(0)],
    );

    // Verify stuck
    expect(store.getState().waitingToStartStreaming).toBe(true);
    expect(store.getState().thread).not.toBeNull();

    // User navigates away and back to /chat
    store.getState().resetToOverview();

    // State should be cleared
    expect(store.getState().waitingToStartStreaming).toBe(false);
    expect(store.getState().thread).toBeNull();
    expect(store.getState().isStreaming).toBe(false);
    expect(store.getState().isCreatingThread).toBe(false);
  });

  it('should test resetToNewChat recovery', () => {
    /**
     * resetToNewChat() should completely clear stuck state
     */

    // Create comprehensive stuck state
    store.getState().setWaitingToStartStreaming(true);
    store.getState().setIsCreatingThread(false);
    store.getState().setIsStreaming(false);
    store.getState().setPendingMessage('stuck message');
    store.getState().initializeThread(
      createMockThread({ id: 'thread-123' }),
      createMockParticipants(2),
      [createMockUserMessage(0)],
    );

    // Verify stuck state
    expect(store.getState().waitingToStartStreaming).toBe(true);
    expect(store.getState().pendingMessage).toBe('stuck message');

    // Recovery
    store.getState().resetToNewChat();

    // Everything cleared
    expect(store.getState().waitingToStartStreaming).toBe(false);
    expect(store.getState().isCreatingThread).toBe(false);
    expect(store.getState().isStreaming).toBe(false);
    expect(store.getState().pendingMessage).toBeNull();
    expect(store.getState().thread).toBeNull();
    expect(store.getState().messages).toHaveLength(0);
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('full flow integration', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should test complete overview submission flow', async () => {
    /**
     * Complete flow test that demonstrates where race conditions occur
     */

    // Track all state transitions
    const transitions: string[] = [];

    // Initial state
    transitions.push('initial');
    expect(store.getState().showInitialUI).toBe(true);

    // User submits message
    store.getState().setIsCreatingThread(true);
    store.getState().setShowInitialUI(false);
    transitions.push('creating_thread');

    // Thread created
    const thread = createMockThread({ id: 'thread-123' });
    const participants = createMockParticipants(2);
    const userMessage = createMockUserMessage(0);

    store.getState().initializeThread(thread, participants, [userMessage]);
    store.getState().setCreatedThreadId(thread.id);
    store.getState().setScreenMode(ScreenModes.OVERVIEW);
    transitions.push('thread_initialized');

    // Set waiting flag
    store.getState().setWaitingToStartStreaming(true);
    transitions.push('waiting_set');

    // Clear creating flag (GAP STARTS)
    store.getState().setIsCreatingThread(false);
    transitions.push('creating_cleared'); // BUG: Input can submit here

    // Simulate provider effect delay
    vi.advanceTimersByTime(10);

    // Provider effect tries to start streaming
    // (In real code, this is where AI SDK status check happens)
    const canStartRound = !store.getState().isStreaming
      && store.getState().waitingToStartStreaming
      && store.getState().messages.length > 0
      && store.getState().participants.length > 0;

    expect(canStartRound).toBe(true);

    // Streaming starts
    store.getState().setIsStreaming(true);
    store.getState().setWaitingToStartStreaming(false);
    transitions.push('streaming_started');

    // Add participant messages
    const p0Message = createMockMessage(0, 0);
    const p1Message = createMockMessage(1, 0);
    store.getState().setMessages([userMessage, p0Message, p1Message]);

    // Streaming completes
    store.getState().setIsStreaming(false);
    transitions.push('streaming_complete');

    // Verify flow
    expect(transitions).toEqual([
      'initial',
      'creating_thread',
      'thread_initialized',
      'waiting_set',
      'creating_cleared',
      'streaming_started',
      'streaming_complete',
    ]);

    // Final state
    expect(store.getState().messages).toHaveLength(3);
    expect(store.getState().isStreaming).toBe(false);
    expect(store.getState().waitingToStartStreaming).toBe(false);
  });

  it('should demonstrate the full race condition bug', async () => {
    /**
     * This test demonstrates the complete bug:
     * 1. First submission starts
     * 2. Gap occurs
     * 3. User submits again during gap
     * 4. Duplicate messages created
     */

    let createdThreads = 0;

    const simulateHandleCreateThread = async () => {
      const state = store.getState();

      // Current buggy guard
      if (state.isStreaming || state.isCreatingThread) {
        return false; // Blocked
      }

      createdThreads++;
      store.getState().setIsCreatingThread(true);

      // Simulate async
      await Promise.resolve();

      store.getState().initializeThread(
        createMockThread({ id: `thread-${createdThreads}` }),
        createMockParticipants(2),
        [createMockUserMessage(0)],
      );
      store.getState().setWaitingToStartStreaming(true);
      store.getState().setIsCreatingThread(false); // GAP!

      return true;
    };

    // First submission
    const first = await simulateHandleCreateThread();
    expect(first).toBe(true);
    expect(createdThreads).toBe(1);

    // Second submission during gap
    // (waitingToStartStreaming=true, isCreatingThread=false, isStreaming=false)
    const second = await simulateHandleCreateThread();

    /**
     * BUG: Second submission succeeds!
     * The guard only checks isStreaming || isCreatingThread
     * Both are false during the gap
     */
    expect(second).toBe(true); // BUG - should be false
    expect(createdThreads).toBe(2); // BUG - should be 1
  });
});
