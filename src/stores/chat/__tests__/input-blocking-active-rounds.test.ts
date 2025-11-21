/**
 * Input Blocking During Active Rounds Tests
 *
 * Tests documenting all conditions that should block user input during active
 * operations in the chat system. Input should be disabled when any operation
 * is in progress to prevent duplicate submissions and race conditions.
 *
 * BLOCKING CONDITIONS:
 * 1. isStreaming = true (AI actively responding)
 * 2. isCreatingThread = true (API call in progress)
 * 3. waitingToStartStreaming = true (between create and stream)
 * 4. pendingMessage !== null (message queued to send)
 * 5. isRegenerating = true (round being regenerated)
 * 6. isCreatingAnalysis = true (analysis creation in progress)
 * 7. analyses with STREAMING status (analysis actively streaming)
 * 8. preSearches with PENDING/STREAMING status (pre-search in progress)
 *
 * TESTING PHILOSOPHY:
 * These tests document the comprehensive input blocking logic required
 * to prevent race conditions and duplicate submissions.
 *
 * Location: /src/stores/chat/__tests__/input-blocking-active-rounds.test.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AnalysisStatuses, PreSearchStatuses, ScreenModes } from '@/api/core/enums';
import type { ChatStore } from '@/stores/chat/store';
import { createChatStore } from '@/stores/chat/store';

import {
  createMockAnalysis,
  createMockParticipants,
  createMockPreSearch,
  createMockThread,
  createMockUserMessage,
} from './test-factories';

// ============================================================================
// HELPER FUNCTION - Comprehensive Input Blocked State Check
// ============================================================================

/**
 * Calculate whether input should be blocked based on all relevant state flags.
 *
 * This is the CORRECT comprehensive check that should be used by all input
 * components. The current implementation may be missing some of these checks.
 */
const isInputBlocked = (state: ChatStore): boolean => {
  // Core streaming/creation flags
  const coreBlocking = state.isStreaming
    || state.isCreatingThread
    || state.waitingToStartStreaming
    || state.pendingMessage !== null
    || state.isRegenerating
    || state.isCreatingAnalysis;

  // Analysis streaming check
  const analysisStreaming = state.analyses.some(
    a => a.status === AnalysisStatuses.STREAMING,
  );

  // Pre-search pending/streaming check
  const preSearchActive = state.preSearches.some(
    ps => ps.status === PreSearchStatuses.STREAMING
      || ps.status === AnalysisStatuses.PENDING, // Backend uses AnalysisStatuses.PENDING
  );

  return coreBlocking || analysisStreaming || preSearchActive;
};

// ============================================================================
// INDIVIDUAL BLOCKING STATE TESTS
// ============================================================================

describe('Input Blocking: Individual State Conditions', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('isStreaming blocking', () => {
    it('should block input when isStreaming is true', () => {
      /**
       * SCENARIO: AI is actively generating a response
       * User should not be able to send new messages during this time
       */
      store.getState().setIsStreaming(true);

      const state = store.getState();
      expect(state.isStreaming).toBe(true);
      expect(isInputBlocked(state)).toBe(true);

      // Current implementation check (used in ChatInput)
      const currentCheck = state.isStreaming;
      expect(currentCheck).toBe(true); // This one is correctly implemented
    });

    it('should allow input when isStreaming is false and no other blocking states', () => {
      store.getState().setIsStreaming(false);

      const state = store.getState();
      expect(isInputBlocked(state)).toBe(false);
    });
  });

  describe('isCreatingThread blocking', () => {
    it('should block input when isCreatingThread is true', () => {
      /**
       * SCENARIO: Thread creation API call in progress
       * User should not be able to submit another message
       */
      store.getState().setIsCreatingThread(true);

      const state = store.getState();
      expect(state.isCreatingThread).toBe(true);
      expect(isInputBlocked(state)).toBe(true);
    });
  });

  describe('waitingToStartStreaming blocking', () => {
    it('should block input when waitingToStartStreaming is true', () => {
      /**
       * SCENARIO: Thread created, waiting for provider effect to start streaming
       *
       * BUG DOCUMENTED: This state is often NOT checked by input components,
       * creating a gap where user can submit duplicate messages.
       */
      store.getState().setWaitingToStartStreaming(true);

      const state = store.getState();
      expect(state.waitingToStartStreaming).toBe(true);
      expect(isInputBlocked(state)).toBe(true);

      // Current buggy implementation would show:
      const buggyCheck = state.isStreaming || state.isCreatingThread;
      expect(buggyCheck).toBe(false); // BUG: Shows as not blocked
    });
  });

  describe('pendingMessage blocking', () => {
    it('should block input when pendingMessage is not null', () => {
      /**
       * SCENARIO: Message is queued but not yet sent
       * User should wait for the current message to be processed
       */
      store.getState().setPendingMessage('Test message waiting to send');

      const state = store.getState();
      expect(state.pendingMessage).toBe('Test message waiting to send');
      expect(isInputBlocked(state)).toBe(true);
    });

    it('should allow input when pendingMessage is null', () => {
      store.getState().setPendingMessage(null);

      const state = store.getState();
      expect(state.pendingMessage).toBeNull();
      // Only pendingMessage being null doesn't mean input is allowed
      // All other blocking conditions must also be false
    });
  });

  describe('isRegenerating blocking', () => {
    it('should block input when isRegenerating is true', () => {
      /**
       * SCENARIO: User triggered round regeneration
       * Cannot send new messages while regenerating previous round
       */
      store.getState().setIsRegenerating(true);

      const state = store.getState();
      expect(state.isRegenerating).toBe(true);
      expect(isInputBlocked(state)).toBe(true);
    });
  });

  describe('isCreatingAnalysis blocking', () => {
    it('should block input when isCreatingAnalysis is true', () => {
      /**
       * SCENARIO: Moderator analysis creation in progress
       * Should wait for analysis to complete before new input
       */
      store.getState().setIsCreatingAnalysis(true);

      const state = store.getState();
      expect(state.isCreatingAnalysis).toBe(true);
      expect(isInputBlocked(state)).toBe(true);
    });
  });
});

// ============================================================================
// ANALYSIS STREAMING BLOCKING TESTS
// ============================================================================

describe('Input Blocking: Analysis Streaming State', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should block input when any analysis has STREAMING status', () => {
    /**
     * SCENARIO: Moderator analysis is actively streaming
     * User should wait for analysis to complete
     */
    const streamingAnalysis = createMockAnalysis({
      roundNumber: 0,
      status: AnalysisStatuses.STREAMING,
    });

    store.getState().setAnalyses([streamingAnalysis]);

    const state = store.getState();
    expect(state.analyses).toHaveLength(1);
    expect(state.analyses[0].status).toBe(AnalysisStatuses.STREAMING);
    expect(isInputBlocked(state)).toBe(true);
  });

  it('should allow input when all analyses are COMPLETE', () => {
    const completeAnalysis = createMockAnalysis({
      roundNumber: 0,
      status: AnalysisStatuses.COMPLETE,
    });

    store.getState().setAnalyses([completeAnalysis]);

    const state = store.getState();
    expect(state.analyses[0].status).toBe(AnalysisStatuses.COMPLETE);
    expect(isInputBlocked(state)).toBe(false);
  });

  it('should allow input when analyses are in PENDING status', () => {
    /**
     * PENDING analysis means it's waiting to start, not actively streaming.
     * Input should be allowed unless other blocking conditions exist.
     */
    const pendingAnalysis = createMockAnalysis({
      roundNumber: 0,
      status: AnalysisStatuses.PENDING,
    });

    store.getState().setAnalyses([pendingAnalysis]);

    const state = store.getState();
    expect(state.analyses[0].status).toBe(AnalysisStatuses.PENDING);
    expect(isInputBlocked(state)).toBe(false);
  });

  it('should block when multiple analyses exist and at least one is streaming', () => {
    const completeAnalysis = createMockAnalysis({
      id: 'analysis-1',
      roundNumber: 0,
      status: AnalysisStatuses.COMPLETE,
    });
    const streamingAnalysis = createMockAnalysis({
      id: 'analysis-2',
      roundNumber: 1,
      status: AnalysisStatuses.STREAMING,
    });

    store.getState().setAnalyses([completeAnalysis, streamingAnalysis]);

    const state = store.getState();
    expect(isInputBlocked(state)).toBe(true);
  });
});

// ============================================================================
// PRE-SEARCH BLOCKING TESTS
// ============================================================================

describe('Input Blocking: Pre-Search State', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should block input when pre-search has PENDING status', () => {
    /**
     * SCENARIO: Pre-search created but not yet started
     * Must wait for search to complete before streaming can begin
     */
    const pendingPreSearch = createMockPreSearch({
      roundNumber: 0,
      status: AnalysisStatuses.PENDING, // Backend uses AnalysisStatuses
    });

    store.getState().addPreSearch(pendingPreSearch);

    const state = store.getState();
    expect(state.preSearches).toHaveLength(1);
    expect(state.preSearches[0].status).toBe(AnalysisStatuses.PENDING);
    expect(isInputBlocked(state)).toBe(true);
  });

  it('should block input when pre-search has STREAMING status', () => {
    /**
     * SCENARIO: Pre-search actively fetching and processing results
     */
    const streamingPreSearch = createMockPreSearch({
      roundNumber: 0,
      status: PreSearchStatuses.STREAMING,
    });

    store.getState().addPreSearch(streamingPreSearch);

    const state = store.getState();
    expect(state.preSearches[0].status).toBe(PreSearchStatuses.STREAMING);
    expect(isInputBlocked(state)).toBe(true);
  });

  it('should allow input when pre-search is COMPLETE', () => {
    const completePreSearch = createMockPreSearch({
      roundNumber: 0,
      status: PreSearchStatuses.COMPLETE,
    });

    store.getState().addPreSearch(completePreSearch);

    const state = store.getState();
    expect(state.preSearches[0].status).toBe(PreSearchStatuses.COMPLETE);
    expect(isInputBlocked(state)).toBe(false);
  });

  it('should allow input when pre-search is FAILED', () => {
    /**
     * Failed pre-search should not block - user can retry or continue
     */
    const failedPreSearch = createMockPreSearch({
      roundNumber: 0,
      status: PreSearchStatuses.FAILED,
    });

    store.getState().addPreSearch(failedPreSearch);

    const state = store.getState();
    expect(state.preSearches[0].status).toBe(PreSearchStatuses.FAILED);
    expect(isInputBlocked(state)).toBe(false);
  });
});

// ============================================================================
// COMBINATION STATE TESTS
// ============================================================================

describe('Input Blocking: Combination States', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should block when multiple blocking conditions are active', () => {
    /**
     * SCENARIO: Complex state with multiple operations in progress
     * All blocking conditions are cumulative - any one should block
     */
    store.getState().setIsStreaming(true);
    store.getState().setWaitingToStartStreaming(true);
    store.getState().setPendingMessage('queued message');

    const state = store.getState();
    expect(isInputBlocked(state)).toBe(true);

    // Verify each individual flag
    expect(state.isStreaming).toBe(true);
    expect(state.waitingToStartStreaming).toBe(true);
    expect(state.pendingMessage).not.toBeNull();
  });

  it('should block during full thread creation to streaming transition', () => {
    /**
     * Tests the complete state through thread creation lifecycle
     */
    const thread = createMockThread({ id: 'thread-123' });
    const participants = createMockParticipants(2);
    const userMessage = createMockUserMessage(0);

    // Phase 1: Thread creation started
    store.getState().setIsCreatingThread(true);
    expect(isInputBlocked(store.getState())).toBe(true);

    // Phase 2: Thread initialized, waiting to stream
    store.getState().initializeThread(thread, participants, [userMessage]);
    store.getState().setWaitingToStartStreaming(true);
    store.getState().setIsCreatingThread(false);
    expect(isInputBlocked(store.getState())).toBe(true);

    // Phase 3: Streaming started
    store.getState().setIsStreaming(true);
    store.getState().setWaitingToStartStreaming(false);
    expect(isInputBlocked(store.getState())).toBe(true);

    // Phase 4: Streaming complete
    store.getState().setIsStreaming(false);
    expect(isInputBlocked(store.getState())).toBe(false);
  });

  it('should block during pre-search to streaming transition', () => {
    /**
     * When web search is enabled, pre-search must complete before streaming
     */
    const thread = createMockThread({ id: 'thread-123', enableWebSearch: true });

    store.getState().initializeThread(
      thread,
      createMockParticipants(2),
      [createMockUserMessage(0)],
    );
    store.getState().setScreenMode(ScreenModes.OVERVIEW);

    // Pre-search created
    store.getState().addPreSearch(createMockPreSearch({
      roundNumber: 0,
      status: AnalysisStatuses.PENDING,
    }));
    store.getState().setWaitingToStartStreaming(true);

    expect(isInputBlocked(store.getState())).toBe(true);

    // Pre-search streaming
    store.getState().updatePreSearchStatus(0, PreSearchStatuses.STREAMING);
    expect(isInputBlocked(store.getState())).toBe(true);

    // Pre-search complete, streaming starts
    store.getState().updatePreSearchStatus(0, PreSearchStatuses.COMPLETE);
    store.getState().setIsStreaming(true);
    store.getState().setWaitingToStartStreaming(false);
    expect(isInputBlocked(store.getState())).toBe(true);

    // Streaming complete
    store.getState().setIsStreaming(false);
    expect(isInputBlocked(store.getState())).toBe(false);
  });

  it('should handle analysis streaming during message input', () => {
    /**
     * Analysis can stream independently of message streaming
     * Both should block input
     */
    // Add complete streaming analysis
    store.getState().setAnalyses([
      createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.STREAMING,
      }),
    ]);

    expect(isInputBlocked(store.getState())).toBe(true);

    // User tries to send message while analysis is streaming
    store.getState().setPendingMessage('new question');

    // Both conditions block
    expect(store.getState().pendingMessage).not.toBeNull();
    expect(store.getState().analyses[0].status).toBe(AnalysisStatuses.STREAMING);
    expect(isInputBlocked(store.getState())).toBe(true);
  });
});

// ============================================================================
// RAPID INPUT ATTEMPTS TESTS
// ============================================================================

describe('Input Blocking: Rapid Input Prevention', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should only allow first submission when user rapidly tries to send', async () => {
    /**
     * SCENARIO: User rapidly clicks send button multiple times
     * Only the first submission should be processed
     */
    let submissionCount = 0;

    const simulateSubmission = async () => {
      const state = store.getState();

      // Comprehensive blocking check
      if (isInputBlocked(state)) {
        return false;
      }

      submissionCount++;
      store.getState().setIsCreatingThread(true);
      store.getState().setPendingMessage(`message-${submissionCount}`);

      // Simulate async operation
      await Promise.resolve();

      store.getState().initializeThread(
        createMockThread({ id: `thread-${submissionCount}` }),
        createMockParticipants(2),
        [createMockUserMessage(0)],
      );
      store.getState().setWaitingToStartStreaming(true);
      store.getState().setIsCreatingThread(false);

      return true;
    };

    // First submission - should succeed
    const first = await simulateSubmission();
    expect(first).toBe(true);
    expect(submissionCount).toBe(1);

    // Rapid second submission - should be blocked
    const second = await simulateSubmission();
    expect(second).toBe(false);
    expect(submissionCount).toBe(1);

    // Rapid third submission - should also be blocked
    const third = await simulateSubmission();
    expect(third).toBe(false);
    expect(submissionCount).toBe(1);
  });

  it('should track submission attempts to detect blocked duplicates', () => {
    const attempts: Array<{ time: number; blocked: boolean }> = [];

    const attemptSubmission = () => {
      const blocked = isInputBlocked(store.getState());
      attempts.push({ time: Date.now(), blocked });

      if (!blocked) {
        store.getState().setIsCreatingThread(true);
      }

      return !blocked;
    };

    // First attempt
    expect(attemptSubmission()).toBe(true);

    // Rapid follow-up attempts (within milliseconds)
    vi.advanceTimersByTime(10);
    expect(attemptSubmission()).toBe(false);

    vi.advanceTimersByTime(10);
    expect(attemptSubmission()).toBe(false);

    vi.advanceTimersByTime(10);
    expect(attemptSubmission()).toBe(false);

    // All but first should be blocked
    expect(attempts.filter(a => !a.blocked)).toHaveLength(1);
    expect(attempts.filter(a => a.blocked)).toHaveLength(3);
  });

  it('should allow new submission after previous completes', async () => {
    let submissionCount = 0;

    const simulateCompleteSubmission = async () => {
      if (isInputBlocked(store.getState())) {
        return false;
      }

      submissionCount++;
      store.getState().setIsCreatingThread(true);

      await Promise.resolve();

      store.getState().initializeThread(
        createMockThread({ id: `thread-${submissionCount}` }),
        createMockParticipants(2),
        [createMockUserMessage(0)],
      );
      store.getState().setWaitingToStartStreaming(true);
      store.getState().setIsCreatingThread(false);

      // Complete the streaming
      store.getState().setIsStreaming(true);
      store.getState().setWaitingToStartStreaming(false);

      await Promise.resolve();

      store.getState().setIsStreaming(false);

      // Reset for next submission
      store.getState().resetToNewChat();

      return true;
    };

    // First complete submission
    expect(await simulateCompleteSubmission()).toBe(true);
    expect(submissionCount).toBe(1);

    // Second submission after first completes
    expect(await simulateCompleteSubmission()).toBe(true);
    expect(submissionCount).toBe(2);
  });
});

// ============================================================================
// EDGE CASE TESTS
// ============================================================================

describe('Input Blocking: Edge Cases', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should handle simultaneous streaming and analysis', () => {
    /**
     * Both message streaming and analysis streaming can happen
     * Input should be blocked when either is active
     */
    store.getState().setIsStreaming(true);
    store.getState().setAnalyses([
      createMockAnalysis({ status: AnalysisStatuses.STREAMING }),
    ]);

    expect(isInputBlocked(store.getState())).toBe(true);

    // Streaming completes but analysis still going
    store.getState().setIsStreaming(false);
    expect(isInputBlocked(store.getState())).toBe(true);

    // Analysis completes
    store.getState().updateAnalysisStatus(0, AnalysisStatuses.COMPLETE);
    expect(isInputBlocked(store.getState())).toBe(false);
  });

  it('should handle empty pending message string', () => {
    /**
     * Empty string is still a truthy pending message
     * However, setPendingMessage typically uses null for "no message"
     */
    store.getState().setPendingMessage('');

    const state = store.getState();
    // Empty string is still !== null
    expect(state.pendingMessage).toBe('');
    expect(isInputBlocked(state)).toBe(true);
  });

  it('should handle multiple pre-searches across rounds', () => {
    /**
     * Multiple pre-searches for different rounds
     * Should only block if any are pending/streaming
     */
    const preSearch0 = createMockPreSearch({
      id: 'ps-0',
      roundNumber: 0,
      status: PreSearchStatuses.COMPLETE,
    });
    const preSearch1 = createMockPreSearch({
      id: 'ps-1',
      roundNumber: 1,
      status: PreSearchStatuses.STREAMING,
    });

    store.getState().addPreSearch(preSearch0);
    store.getState().addPreSearch(preSearch1);

    expect(store.getState().preSearches).toHaveLength(2);
    expect(isInputBlocked(store.getState())).toBe(true);
  });

  it('should not block when all arrays are empty', () => {
    /**
     * Initial store state - nothing in progress
     */
    const state = store.getState();

    expect(state.analyses).toHaveLength(0);
    expect(state.preSearches).toHaveLength(0);
    expect(state.isStreaming).toBe(false);
    expect(state.isCreatingThread).toBe(false);
    expect(state.waitingToStartStreaming).toBe(false);
    expect(state.pendingMessage).toBeNull();
    expect(state.isRegenerating).toBe(false);
    expect(state.isCreatingAnalysis).toBe(false);

    expect(isInputBlocked(state)).toBe(false);
  });

  it('should handle regeneration blocking correctly', () => {
    /**
     * During regeneration, user cannot send new messages
     */
    // Setup existing thread
    store.getState().initializeThread(
      createMockThread({ id: 'thread-123' }),
      createMockParticipants(2),
      [createMockUserMessage(0)],
    );

    // Start regeneration
    store.getState().setIsRegenerating(true);
    expect(isInputBlocked(store.getState())).toBe(true);

    // Regeneration completes, streaming starts
    store.getState().setIsStreaming(true);
    store.getState().setIsRegenerating(false);
    expect(isInputBlocked(store.getState())).toBe(true);

    // Streaming completes
    store.getState().setIsStreaming(false);
    expect(isInputBlocked(store.getState())).toBe(false);
  });
});

// ============================================================================
// COMPREHENSIVE STATE MATRIX TEST
// ============================================================================

describe('Input Blocking: Complete State Matrix', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
  });

  it('should test all blocking conditions systematically', () => {
    /**
     * Comprehensive matrix of all blocking conditions
     * Each condition should independently block input
     */
    const testCases: Array<{
      name: string;
      setup: () => void;
      shouldBlock: boolean;
    }> = [
      {
        name: 'isStreaming = true',
        setup: () => store.getState().setIsStreaming(true),
        shouldBlock: true,
      },
      {
        name: 'isCreatingThread = true',
        setup: () => store.getState().setIsCreatingThread(true),
        shouldBlock: true,
      },
      {
        name: 'waitingToStartStreaming = true',
        setup: () => store.getState().setWaitingToStartStreaming(true),
        shouldBlock: true,
      },
      {
        name: 'pendingMessage !== null',
        setup: () => store.getState().setPendingMessage('test'),
        shouldBlock: true,
      },
      {
        name: 'isRegenerating = true',
        setup: () => store.getState().setIsRegenerating(true),
        shouldBlock: true,
      },
      {
        name: 'isCreatingAnalysis = true',
        setup: () => store.getState().setIsCreatingAnalysis(true),
        shouldBlock: true,
      },
      {
        name: 'analysis with STREAMING status',
        setup: () => store.getState().setAnalyses([
          createMockAnalysis({ status: AnalysisStatuses.STREAMING }),
        ]),
        shouldBlock: true,
      },
      {
        name: 'pre-search with PENDING status',
        setup: () => store.getState().addPreSearch(
          createMockPreSearch({ status: AnalysisStatuses.PENDING }),
        ),
        shouldBlock: true,
      },
      {
        name: 'pre-search with STREAMING status',
        setup: () => store.getState().addPreSearch(
          createMockPreSearch({ status: PreSearchStatuses.STREAMING }),
        ),
        shouldBlock: true,
      },
      {
        name: 'all flags false and arrays empty',
        setup: () => {
          // Default state, nothing to set
        },
        shouldBlock: false,
      },
      {
        name: 'analysis with COMPLETE status (not blocking)',
        setup: () => store.getState().setAnalyses([
          createMockAnalysis({ status: AnalysisStatuses.COMPLETE }),
        ]),
        shouldBlock: false,
      },
      {
        name: 'pre-search with COMPLETE status (not blocking)',
        setup: () => store.getState().addPreSearch(
          createMockPreSearch({ status: PreSearchStatuses.COMPLETE }),
        ),
        shouldBlock: false,
      },
    ];

    testCases.forEach((testCase) => {
      // Reset store for each test
      store = createChatStore();

      // Apply test setup
      testCase.setup();

      // Check blocking state
      const actualBlocked = isInputBlocked(store.getState());

      expect(actualBlocked).toBe(testCase.shouldBlock);
    });
  });
});
