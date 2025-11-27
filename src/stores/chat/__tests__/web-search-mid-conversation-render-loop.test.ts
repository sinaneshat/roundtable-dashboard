/**
 * Web Search Mid-Conversation Render Loop Tests
 *
 * Tests to identify and prevent infinite render loops when enabling
 * web search mid-conversation.
 *
 * BUG: When user enables web search on a thread that was created without it,
 * the system enters an infinite state update loop causing:
 * - RAM overflow
 * - UI freeze
 * - Browser crash
 *
 * ROOT CAUSE INVESTIGATION:
 * 1. User enables web search → setEnableWebSearch(true)
 * 2. User submits message → placeholder pre-search created
 * 3. preSearches array updates → effects re-run
 * 4. Effect creates/executes pre-search → addPreSearch called
 * 5. preSearches array updates AGAIN → effects re-run
 * 6. LOOP: If guards don't prevent re-execution, infinite loop occurs
 *
 * Location: /src/stores/chat/__tests__/web-search-mid-conversation-render-loop.test.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AnalysisStatuses,
  ChatModes,
  ScreenModes,
} from '@/api/core/enums';
import type { StoredPreSearch } from '@/api/routes/chat/schema';
import { getCurrentRoundNumber } from '@/lib/utils/round-utils';
import { shouldWaitForPreSearch } from '@/stores/chat/actions/pending-message-sender';
import { createChatStore } from '@/stores/chat/store';

import {
  createMockMessage,
  createMockParticipant,
  createMockPreSearchDataPayload,
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
 * Create a placeholder pre-search (frontend-only, not in DB)
 */
function createPlaceholderPreSearch(
  threadId: string,
  roundNumber: number,
  userQuery: string,
): StoredPreSearch {
  return {
    id: `placeholder-presearch-${threadId}-${roundNumber}`,
    threadId,
    roundNumber,
    userQuery,
    status: AnalysisStatuses.PENDING,
    searchData: null,
    createdAt: new Date(),
    completedAt: null,
    errorMessage: null,
  };
}

/**
 * Create a pre-search with real DB ID
 */
function createRealPreSearch(
  threadId: string,
  roundNumber: number,
  userQuery: string,
  status: typeof AnalysisStatuses[keyof typeof AnalysisStatuses],
): StoredPreSearch {
  return {
    id: `01KB18FA8YQ8ZVBT${roundNumber}SCAHQ0QD`, // ULID-like format
    threadId,
    roundNumber,
    userQuery,
    status,
    searchData: status === AnalysisStatuses.COMPLETE ? createMockPreSearchDataPayload() : null,
    createdAt: new Date(),
    completedAt: status === AnalysisStatuses.COMPLETE ? new Date() : null,
    errorMessage: null,
  };
}

// ============================================================================
// INFINITE LOOP DETECTION TESTS
// ============================================================================

describe('web Search Mid-Conversation Render Loop Prevention', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // ==========================================================================
  // SCENARIO: State Update Tracking
  // ==========================================================================

  describe('state Update Tracking', () => {
    it('should limit state updates when enabling web search mid-conversation', () => {
      // Setup: Thread created WITHOUT web search, rounds 0-1 complete
      const thread = createMockThread({
        id: 'thread-loop-test',
        enableWebSearch: false,
        mode: ChatModes.DEBATING,
      });

      const participants = [
        createMockParticipant(0, { modelId: 'openai/gpt-4' }),
        createMockParticipant(1, { modelId: 'anthropic/claude-3' }),
      ];

      const messages = [
        createMockUserMessage(0, 'Question 1'),
        createMockMessage(0, 0),
        createMockMessage(1, 0),
        createMockUserMessage(1, 'Question 2'),
        createMockMessage(0, 1),
        createMockMessage(1, 1),
      ];

      store.getState().initializeThread(thread, participants, messages);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Track state updates
      let preSearchUpdateCount = 0;
      const unsubscribe = store.subscribe((state, prevState) => {
        if (state.preSearches !== prevState.preSearches) {
          preSearchUpdateCount++;
        }
      });

      // ACT: Enable web search for round 2
      store.getState().setEnableWebSearch(true);

      // Simulate the flow: placeholder → streaming → complete
      // This is what the provider effects do

      // Step 1: Add placeholder (simulates form-actions.ts)
      const placeholder = createPlaceholderPreSearch('thread-loop-test', 2, 'Question 3');
      store.getState().addPreSearch(placeholder);

      // Step 2: Mark as triggered (prevents duplicate execution)
      store.getState().markPreSearchTriggered(2);

      // Step 3: Replace with STREAMING status (simulates provider creating DB record)
      store.getState().addPreSearch(createRealPreSearch(
        'thread-loop-test',
        2,
        'Question 3',
        AnalysisStatuses.STREAMING,
      ));

      // Step 4: Update to COMPLETE (simulates pre-search finishing)
      store.getState().updatePreSearchData(2, createMockPreSearchDataPayload());

      unsubscribe();

      // ASSERT: Should have limited number of updates
      // Expected: 3 updates (add placeholder, replace with streaming, update to complete)
      // If more than 10, likely infinite loop
      expect(preSearchUpdateCount).toBeLessThanOrEqual(5);
      expect(preSearchUpdateCount).toBeGreaterThanOrEqual(2);
    });

    it('should not enter infinite loop when addPreSearch is called multiple times for same round', () => {
      const thread = createMockThread({
        id: 'thread-multi-add',
        enableWebSearch: false,
      });

      store.getState().initializeThread(thread, [createMockParticipant(0)]);
      store.getState().setEnableWebSearch(true);

      let updateCount = 0;
      const unsubscribe = store.subscribe((state, prevState) => {
        if (state.preSearches !== prevState.preSearches) {
          updateCount++;
        }
      });

      // Simulate race condition: multiple effects calling addPreSearch
      const placeholder = createPlaceholderPreSearch('thread-multi-add', 1, 'Query');

      // First call - should add
      store.getState().addPreSearch(placeholder);
      expect(store.getState().preSearches).toHaveLength(1);

      // Second call with same round - should NOT add duplicate
      store.getState().addPreSearch(placeholder);
      expect(store.getState().preSearches).toHaveLength(1);

      // Third call with STREAMING status - should UPDATE existing
      const streamingPreSearch = createRealPreSearch(
        'thread-multi-add',
        1,
        'Query',
        AnalysisStatuses.STREAMING,
      );
      store.getState().addPreSearch(streamingPreSearch);
      expect(store.getState().preSearches).toHaveLength(1);
      expect(store.getState().preSearches[0].status).toBe(AnalysisStatuses.STREAMING);

      // Fourth call with same STREAMING status - should NOT update (same status)
      store.getState().addPreSearch(streamingPreSearch);

      unsubscribe();

      // Should have at most 3 actual updates (add, skip duplicate, update to streaming)
      // The fourth call should be a no-op
      expect(updateCount).toBeLessThanOrEqual(3);
    });
  });

  // ==========================================================================
  // SCENARIO: Guard Effectiveness Tests
  // ==========================================================================

  describe('guard Effectiveness', () => {
    it('should prevent pre-search execution when already triggered', () => {
      const thread = createMockThread({
        id: 'thread-guard',
        enableWebSearch: false,
      });

      store.getState().initializeThread(thread, [createMockParticipant(0)]);
      store.getState().setEnableWebSearch(true);

      // First trigger
      store.getState().markPreSearchTriggered(1);
      expect(store.getState().hasPreSearchBeenTriggered(1)).toBe(true);

      // Subsequent checks should return true (preventing re-trigger)
      expect(store.getState().hasPreSearchBeenTriggered(1)).toBe(true);
      expect(store.getState().hasPreSearchBeenTriggered(1)).toBe(true);
    });

    it('should allow retry after clearing tracking on failure', () => {
      const thread = createMockThread({
        id: 'thread-retry',
        enableWebSearch: false,
      });

      store.getState().initializeThread(thread, [createMockParticipant(0)]);

      // Mark as triggered
      store.getState().markPreSearchTriggered(1);
      expect(store.getState().hasPreSearchBeenTriggered(1)).toBe(true);

      // Clear tracking (simulates failure)
      store.getState().clearPreSearchTracking(1);
      expect(store.getState().hasPreSearchBeenTriggered(1)).toBe(false);

      // Can trigger again
      store.getState().markPreSearchTriggered(1);
      expect(store.getState().hasPreSearchBeenTriggered(1)).toBe(true);
    });

    it('should block participants while pre-search status is PENDING', () => {
      const pendingPreSearch: StoredPreSearch = {
        id: 'presearch-1',
        threadId: 'thread-1',
        roundNumber: 1,
        userQuery: 'Query',
        status: AnalysisStatuses.PENDING,
        searchData: null,
        createdAt: new Date(),
        completedAt: null,
        errorMessage: null,
      };

      expect(shouldWaitForPreSearch({
        webSearchEnabled: true,
        preSearches: [pendingPreSearch],
        roundNumber: 1,
      })).toBe(true);
    });

    it('should block participants while pre-search status is STREAMING', () => {
      const streamingPreSearch: StoredPreSearch = {
        id: 'presearch-1',
        threadId: 'thread-1',
        roundNumber: 1,
        userQuery: 'Query',
        status: AnalysisStatuses.STREAMING,
        searchData: null,
        createdAt: new Date(),
        completedAt: null,
        errorMessage: null,
      };

      expect(shouldWaitForPreSearch({
        webSearchEnabled: true,
        preSearches: [streamingPreSearch],
        roundNumber: 1,
      })).toBe(true);
    });

    it('should NOT block participants when pre-search status is COMPLETE', () => {
      const completePreSearch: StoredPreSearch = {
        id: 'presearch-1',
        threadId: 'thread-1',
        roundNumber: 1,
        userQuery: 'Query',
        status: AnalysisStatuses.COMPLETE,
        searchData: createMockPreSearchDataPayload(),
        createdAt: new Date(),
        completedAt: new Date(),
        errorMessage: null,
      };

      expect(shouldWaitForPreSearch({
        webSearchEnabled: true,
        preSearches: [completePreSearch],
        roundNumber: 1,
      })).toBe(false);
    });
  });

  // ==========================================================================
  // SCENARIO: Race Condition Tests
  // ==========================================================================

  describe('race Condition Prevention', () => {
    it('should handle concurrent addPreSearch calls for same round', async () => {
      const thread = createMockThread({
        id: 'thread-race',
        enableWebSearch: false,
      });

      store.getState().initializeThread(thread, [createMockParticipant(0)]);

      // Simulate race: two effects both try to add pre-search
      const placeholder1 = createPlaceholderPreSearch('thread-race', 1, 'Query');
      const placeholder2 = createPlaceholderPreSearch('thread-race', 1, 'Query');

      // Both calls happen "concurrently" (in same tick)
      store.getState().addPreSearch(placeholder1);
      store.getState().addPreSearch(placeholder2);

      // Should only have ONE pre-search (second one ignored)
      expect(store.getState().preSearches).toHaveLength(1);
    });

    it('should handle PENDING → STREAMING race correctly', () => {
      const thread = createMockThread({
        id: 'thread-status-race',
        enableWebSearch: false,
      });

      store.getState().initializeThread(thread, [createMockParticipant(0)]);

      // Add PENDING placeholder
      const pending = createPlaceholderPreSearch('thread-status-race', 1, 'Query');
      store.getState().addPreSearch(pending);
      expect(store.getState().preSearches[0].status).toBe(AnalysisStatuses.PENDING);

      // Provider creates DB record and adds with STREAMING status
      const streaming = createRealPreSearch(
        'thread-status-race',
        1,
        'Query',
        AnalysisStatuses.STREAMING,
      );
      store.getState().addPreSearch(streaming);

      // Should update existing to STREAMING (not add new)
      expect(store.getState().preSearches).toHaveLength(1);
      expect(store.getState().preSearches[0].status).toBe(AnalysisStatuses.STREAMING);
      expect(store.getState().preSearches[0].id).toBe(streaming.id); // Real ID
    });

    it('should not revert STREAMING to PENDING', () => {
      const thread = createMockThread({
        id: 'thread-revert',
        enableWebSearch: false,
      });

      store.getState().initializeThread(thread, [createMockParticipant(0)]);

      // Add STREAMING pre-search (provider already started)
      const streaming = createRealPreSearch(
        'thread-revert',
        1,
        'Query',
        AnalysisStatuses.STREAMING,
      );
      store.getState().addPreSearch(streaming);
      expect(store.getState().preSearches[0].status).toBe(AnalysisStatuses.STREAMING);

      // Late placeholder tries to add (should be ignored)
      const placeholder = createPlaceholderPreSearch('thread-revert', 1, 'Query');
      store.getState().addPreSearch(placeholder);

      // Should NOT revert to PENDING
      expect(store.getState().preSearches).toHaveLength(1);
      expect(store.getState().preSearches[0].status).toBe(AnalysisStatuses.STREAMING);
    });
  });

  // ==========================================================================
  // SCENARIO: Round Number Consistency
  // ==========================================================================

  describe('round Number Consistency', () => {
    it('should calculate consistent round number across state updates', () => {
      const thread = createMockThread({
        id: 'thread-round',
        enableWebSearch: false,
      });

      store.getState().initializeThread(thread, [createMockParticipant(0)]);
      store.getState().setEnableWebSearch(true);

      // Setup: Round 0 and 1 complete
      const messages = [
        createMockUserMessage(0, 'Q1'),
        createMockMessage(0, 0),
        createMockUserMessage(1, 'Q2'),
        createMockMessage(0, 1),
      ];
      store.getState().setMessages(messages);

      // Round should be 1 (last user message)
      expect(getCurrentRoundNumber(store.getState().messages)).toBe(1);

      // Add user message for round 2
      const round2UserMsg = createMockUserMessage(2, 'Q3');
      store.getState().setMessages([...messages, round2UserMsg]);

      // Round should now be 2
      expect(getCurrentRoundNumber(store.getState().messages)).toBe(2);

      // Add pre-search for round 2
      const preSearch = createPlaceholderPreSearch('thread-round', 2, 'Q3');
      store.getState().addPreSearch(preSearch);

      // Should block for round 2 (pre-search exists but PENDING)
      expect(shouldWaitForPreSearch({
        webSearchEnabled: true,
        preSearches: store.getState().preSearches,
        roundNumber: 2,
      })).toBe(true);

      // Add COMPLETE pre-search for round 1 to test non-blocking behavior
      const round1PreSearch = createRealPreSearch('thread-round', 1, 'Q2', AnalysisStatuses.COMPLETE);
      store.getState().addPreSearch(round1PreSearch);

      // Should NOT block for round 1 (pre-search is COMPLETE)
      expect(shouldWaitForPreSearch({
        webSearchEnabled: true,
        preSearches: store.getState().preSearches,
        roundNumber: 1,
      })).toBe(false);
    });
  });

  // ==========================================================================
  // SCENARIO: Web Search Toggle Mid-Conversation
  // ==========================================================================

  describe('web Search Toggle', () => {
    it('should handle web search OFF → ON transition', () => {
      const thread = createMockThread({
        id: 'thread-toggle-on',
        enableWebSearch: false,
      });

      store.getState().initializeThread(thread, [createMockParticipant(0)]);

      // Verify initial state
      expect(store.getState().enableWebSearch).toBe(false);
      expect(store.getState().thread?.enableWebSearch).toBe(false);

      // Toggle ON
      store.getState().setEnableWebSearch(true);

      // Form state updated
      expect(store.getState().enableWebSearch).toBe(true);
      // Thread state unchanged (will be updated by PATCH)
      expect(store.getState().thread?.enableWebSearch).toBe(false);

      // Pre-search check should use form state
      expect(shouldWaitForPreSearch({
        webSearchEnabled: store.getState().enableWebSearch,
        preSearches: [],
        roundNumber: 1,
      })).toBe(true); // Wait because no pre-search exists
    });

    it('should handle web search ON → OFF transition', () => {
      const thread = createMockThread({
        id: 'thread-toggle-off',
        enableWebSearch: true,
      });

      store.getState().initializeThread(thread, [createMockParticipant(0)]);

      // Verify initial state
      expect(store.getState().enableWebSearch).toBe(true);

      // Toggle OFF
      store.getState().setEnableWebSearch(false);

      // Form state updated
      expect(store.getState().enableWebSearch).toBe(false);

      // Pre-search check should NOT wait (web search disabled)
      expect(shouldWaitForPreSearch({
        webSearchEnabled: store.getState().enableWebSearch,
        preSearches: [],
        roundNumber: 1,
      })).toBe(false);
    });

    it('should not create pre-search when web search disabled', () => {
      const thread = createMockThread({
        id: 'thread-no-presearch',
        enableWebSearch: false,
      });

      store.getState().initializeThread(thread, [createMockParticipant(0)]);

      // Web search is OFF
      expect(store.getState().enableWebSearch).toBe(false);

      // Should NOT wait for pre-search
      expect(shouldWaitForPreSearch({
        webSearchEnabled: false,
        preSearches: [],
        roundNumber: 1,
      })).toBe(false);
    });
  });

  // ==========================================================================
  // SCENARIO: State Cleanup on Navigation
  // ==========================================================================

  describe('state Cleanup', () => {
    it('should clear pre-search tracking on thread navigation', () => {
      const thread = createMockThread({
        id: 'thread-cleanup',
        enableWebSearch: false,
      });

      store.getState().initializeThread(thread, [createMockParticipant(0)]);

      // Set up pre-search state
      store.getState().setEnableWebSearch(true);
      store.getState().addPreSearch(createPlaceholderPreSearch('thread-cleanup', 1, 'Q'));
      store.getState().markPreSearchTriggered(1);

      // Verify state
      expect(store.getState().preSearches).toHaveLength(1);
      expect(store.getState().hasPreSearchBeenTriggered(1)).toBe(true);

      // Navigate to new thread (reset)
      store.getState().resetForThreadNavigation();

      // All pre-search state cleared
      expect(store.getState().preSearches).toHaveLength(0);
      expect(store.getState().hasPreSearchBeenTriggered(1)).toBe(false);
    });

    it('should clear pre-search tracking on reset to overview', () => {
      const thread = createMockThread({
        id: 'thread-overview-reset',
        enableWebSearch: false,
      });

      store.getState().initializeThread(thread, [createMockParticipant(0)]);

      // Set up pre-search state
      store.getState().setEnableWebSearch(true);
      store.getState().addPreSearch(createPlaceholderPreSearch('thread-overview-reset', 1, 'Q'));
      store.getState().markPreSearchTriggered(1);

      // Reset to overview
      store.getState().resetToOverview();

      // All pre-search state cleared
      expect(store.getState().preSearches).toHaveLength(0);
      expect(store.getState().hasPreSearchBeenTriggered(1)).toBe(false);
      expect(store.getState().enableWebSearch).toBe(false);
    });
  });

  // ==========================================================================
  // SCENARIO: Effect Re-run Simulation
  // ==========================================================================

  describe('effect Re-run Simulation', () => {
    it('should converge to stable state after multiple effect cycles', () => {
      const thread = createMockThread({
        id: 'thread-converge',
        enableWebSearch: false,
      });

      store.getState().initializeThread(thread, [createMockParticipant(0)]);
      store.getState().setScreenMode(ScreenModes.THREAD);
      store.getState().setEnableWebSearch(true);

      // Simulate the effect flow manually
      // This is what happens in provider's pendingMessage effect

      // Effect run 1: No pre-search exists
      const round = 1;
      let preSearchForRound = store.getState().preSearches.find(ps => ps.roundNumber === round);
      expect(preSearchForRound).toBeUndefined();

      // Guard check 1: Not triggered yet
      expect(store.getState().hasPreSearchBeenTriggered(round)).toBe(false);

      // Action 1: Mark triggered and create placeholder
      store.getState().markPreSearchTriggered(round);
      store.getState().addPreSearch(createPlaceholderPreSearch('thread-converge', round, 'Query'));

      // Effect run 2: Pre-search exists with PENDING status
      preSearchForRound = store.getState().preSearches.find(ps => ps.roundNumber === round);
      expect(preSearchForRound).toBeDefined();
      expect(preSearchForRound?.status).toBe(AnalysisStatuses.PENDING);

      // Guard check 2: Already triggered
      expect(store.getState().hasPreSearchBeenTriggered(round)).toBe(true);

      // Action 2: Skip (already triggered) - effect returns early
      // No state change

      // Effect run 3: Status changes to STREAMING (provider executed)
      store.getState().addPreSearch(createRealPreSearch(
        'thread-converge',
        round,
        'Query',
        AnalysisStatuses.STREAMING,
      ));

      preSearchForRound = store.getState().preSearches.find(ps => ps.roundNumber === round);
      expect(preSearchForRound?.status).toBe(AnalysisStatuses.STREAMING);

      // Guard check 3: Effect should return early for STREAMING
      // (Effect checks: if status === STREAMING, return)

      // Effect run 4: Status changes to COMPLETE
      store.getState().updatePreSearchData(round, createMockPreSearchDataPayload());

      preSearchForRound = store.getState().preSearches.find(ps => ps.roundNumber === round);
      expect(preSearchForRound?.status).toBe(AnalysisStatuses.COMPLETE);

      // Guard check 4: Effect should proceed to send message
      expect(shouldWaitForPreSearch({
        webSearchEnabled: true,
        preSearches: store.getState().preSearches,
        roundNumber: round,
      })).toBe(false);

      // Final state is stable - no more state changes needed
      const finalPreSearches = store.getState().preSearches;
      expect(finalPreSearches).toHaveLength(1);
      expect(finalPreSearches[0].status).toBe(AnalysisStatuses.COMPLETE);
    });

    it('should handle effect re-run loop with bounded iterations', () => {
      const thread = createMockThread({
        id: 'thread-bounded',
        enableWebSearch: false,
      });

      store.getState().initializeThread(thread, [createMockParticipant(0)]);
      store.getState().setEnableWebSearch(true);

      // Simulate effect running in a loop (like React effect with deps)
      let iterations = 0;
      const MAX_ITERATIONS = 10;
      let prevPreSearches = store.getState().preSearches;

      const simulateEffectRun = () => {
        const currentState = store.getState();
        const round = 1;

        // Guard 1: Check if already triggered
        if (currentState.hasPreSearchBeenTriggered(round)) {
          // Check status
          const ps = currentState.preSearches.find(p => p.roundNumber === round);
          if (ps?.status === AnalysisStatuses.COMPLETE || ps?.status === AnalysisStatuses.FAILED) {
            return false; // Done - can proceed
          }
          return true; // Still waiting
        }

        // Not triggered - trigger now
        currentState.markPreSearchTriggered(round);
        currentState.addPreSearch(createPlaceholderPreSearch('thread-bounded', round, 'Q'));

        // Simulate async: after creation, status transitions
        currentState.addPreSearch(createRealPreSearch('thread-bounded', round, 'Q', AnalysisStatuses.STREAMING));

        return true; // Effect will re-run
      };

      // Run effect loop
      while (iterations < MAX_ITERATIONS) {
        iterations++;
        const shouldContinue = simulateEffectRun();

        if (!shouldContinue) {
          break;
        }

        // Simulate state change triggering re-run
        const newPreSearches = store.getState().preSearches;
        if (newPreSearches === prevPreSearches) {
          break; // No change - would not re-run
        }
        prevPreSearches = newPreSearches;
      }

      // Should converge in reasonable iterations
      expect(iterations).toBeLessThan(MAX_ITERATIONS);
    });
  });
});
