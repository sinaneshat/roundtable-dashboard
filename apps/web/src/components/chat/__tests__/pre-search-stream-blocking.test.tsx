/**
 * PreSearchStream Changelog Blocking Tests
 *
 * Tests the critical fix ensuring PreSearchStream component blocks pre-search
 * execution until changelog is fetched when config changes occur.
 *
 * CORRECT ORDER: PATCH → changelog → pre-search → participant streams
 *
 * BUG SCENARIO (before fix):
 * 1. User enables web search and submits message
 * 2. PATCH request sent with enableWebSearch: true
 * 3. configChangeRoundNumber set BEFORE PATCH
 * 4. PreSearchStream component renders with PENDING pre-search
 * 5. BUG: Pre-search executes immediately without checking blocking flags
 * 6. Network order: PATCH → pre-search → changelog (WRONG!)
 *
 * FIX:
 * PreSearchStream now checks isWaitingForChangelog and configChangeRoundNumber
 * at the START of its useEffect and blocks until both are cleared.
 *
 * @see src/components/chat/pre-search-stream.tsx - blocking logic at line 106-113
 * @see src/components/providers/chat-store-provider/hooks/use-changelog-sync.ts
 */

import { ChatModes, MessageStatuses, ThreadStatuses } from '@roundtable/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createChatStore } from '@/stores/chat';
import type { ChatParticipant, ChatThread, StoredPreSearch } from '@/types/api';

// ============================================================================
// TEST SETUP
// ============================================================================

function createMockThread(enableWebSearch = false): ChatThread {
  return {
    id: 'test-thread-123',
    slug: 'test-thread',
    title: 'Test Thread',
    mode: ChatModes.BRAINSTORMING,
    status: ThreadStatuses.ACTIVE,
    isFavorite: false,
    isPublic: false,
    enableWebSearch,
    isAiGeneratedTitle: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastMessageAt: new Date(),
  };
}

function createMockParticipants(): ChatParticipant[] {
  return [
    {
      id: 'participant-1',
      threadId: 'test-thread-123',
      modelId: 'gpt-4o',
      role: 'Analyst',
      priority: 0,
      isEnabled: true,
      settings: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];
}

function createMockPreSearch(roundNumber: number, status: MessageStatuses = MessageStatuses.PENDING): StoredPreSearch {
  return {
    id: `presearch-${roundNumber}`,
    threadId: 'test-thread-123',
    roundNumber,
    userQuery: 'test query',
    status,
    searchData: null,
    createdAt: new Date(),
    completedAt: null,
    errorMessage: null,
  };
}

/**
 * Simulates the blocking logic from PreSearchStream component (lines 106-113)
 * This is the exact check that must happen BEFORE pre-search execution
 */
function shouldBlockPreSearchExecution(store: ReturnType<typeof createChatStore>): boolean {
  const state = store.getState();
  return state.isWaitingForChangelog || state.configChangeRoundNumber !== null;
}

/**
 * Simulates the condition for pre-search to execute (after blocking check passes)
 */
function canExecutePreSearch(
  store: ReturnType<typeof createChatStore>,
  preSearch: StoredPreSearch,
): boolean {
  // First check blocking condition
  if (shouldBlockPreSearchExecution(store)) {
    return false;
  }

  // Then check pre-search status
  if (preSearch.status !== MessageStatuses.PENDING && preSearch.status !== MessageStatuses.STREAMING) {
    return false;
  }

  // Finally check atomic trigger guard
  return store.getState().tryMarkPreSearchTriggered(preSearch.roundNumber);
}

// ============================================================================
// TESTS
// ============================================================================

describe('preSearchStream Changelog Blocking', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    vi.clearAllMocks();
    store = createChatStore();
  });

  describe('blocking Conditions', () => {
    it('should block when configChangeRoundNumber is set (BEFORE PATCH)', () => {
      const thread = createMockThread(true);
      store.getState().initializeThread(thread, createMockParticipants(), []);

      // Simulate: configChangeRoundNumber set BEFORE PATCH
      store.getState().setConfigChangeRoundNumber(1);

      expect(shouldBlockPreSearchExecution(store)).toBe(true);
    });

    it('should block when isWaitingForChangelog is true (AFTER PATCH)', () => {
      const thread = createMockThread(true);
      store.getState().initializeThread(thread, createMockParticipants(), []);

      // Simulate: isWaitingForChangelog set AFTER PATCH completes
      store.getState().setIsWaitingForChangelog(true);

      expect(shouldBlockPreSearchExecution(store)).toBe(true);
    });

    it('should block when BOTH flags are set (during PATCH → changelog transition)', () => {
      const thread = createMockThread(true);
      store.getState().initializeThread(thread, createMockParticipants(), []);

      // Simulate: Both flags set during transition
      store.getState().setConfigChangeRoundNumber(1);
      store.getState().setIsWaitingForChangelog(true);

      expect(shouldBlockPreSearchExecution(store)).toBe(true);
    });

    it('should NOT block when both flags are cleared (after changelog syncs)', () => {
      const thread = createMockThread(true);
      store.getState().initializeThread(thread, createMockParticipants(), []);

      // Both flags are null/false by default
      expect(shouldBlockPreSearchExecution(store)).toBe(false);
    });

    it('should still block if only configChangeRoundNumber is cleared', () => {
      const thread = createMockThread(true);
      store.getState().initializeThread(thread, createMockParticipants(), []);

      // Set both, then clear only configChangeRoundNumber
      store.getState().setConfigChangeRoundNumber(1);
      store.getState().setIsWaitingForChangelog(true);
      store.getState().setConfigChangeRoundNumber(null);

      expect(shouldBlockPreSearchExecution(store)).toBe(true);
    });

    it('should still block if only isWaitingForChangelog is cleared', () => {
      const thread = createMockThread(true);
      store.getState().initializeThread(thread, createMockParticipants(), []);

      // Set both, then clear only isWaitingForChangelog
      store.getState().setConfigChangeRoundNumber(1);
      store.getState().setIsWaitingForChangelog(true);
      store.getState().setIsWaitingForChangelog(false);

      expect(shouldBlockPreSearchExecution(store)).toBe(true);
    });
  });

  describe('pre-Search Execution Guard', () => {
    it('should prevent pre-search execution when blocked', () => {
      const thread = createMockThread(true);
      store.getState().initializeThread(thread, createMockParticipants(), []);

      const preSearch = createMockPreSearch(1);

      // Block with configChangeRoundNumber
      store.getState().setConfigChangeRoundNumber(1);

      expect(canExecutePreSearch(store, preSearch)).toBe(false);
    });

    it('should allow pre-search execution when unblocked', () => {
      const thread = createMockThread(true);
      store.getState().initializeThread(thread, createMockParticipants(), []);

      const preSearch = createMockPreSearch(1);

      // No blocking flags set
      expect(canExecutePreSearch(store, preSearch)).toBe(true);
    });

    it('should allow pre-search after both flags cleared (changelog sync complete)', () => {
      const thread = createMockThread(true);
      store.getState().initializeThread(thread, createMockParticipants(), []);

      const preSearch = createMockPreSearch(1);

      // Simulate full flow
      store.getState().setConfigChangeRoundNumber(1);
      store.getState().setIsWaitingForChangelog(true);

      // Initially blocked
      expect(canExecutePreSearch(store, preSearch)).toBe(false);

      // Clear both flags (changelog sync complete)
      store.getState().setConfigChangeRoundNumber(null);
      store.getState().setIsWaitingForChangelog(false);

      // Now allowed
      expect(canExecutePreSearch(store, preSearch)).toBe(true);
    });

    it('should prevent duplicate execution via tryMarkPreSearchTriggered', () => {
      const thread = createMockThread(true);
      store.getState().initializeThread(thread, createMockParticipants(), []);

      const preSearch = createMockPreSearch(1);

      // First attempt succeeds
      expect(canExecutePreSearch(store, preSearch)).toBe(true);

      // Second attempt fails (already triggered)
      const state = store.getState();
      expect(state.hasPreSearchBeenTriggered(1)).toBe(true);
      expect(state.tryMarkPreSearchTriggered(1)).toBe(false);
    });
  });

  describe('config Change Flow Simulation', () => {
    it('should block pre-search during entire PATCH → changelog flow', () => {
      const thread = createMockThread(false); // Initially no web search
      store.getState().initializeThread(thread, createMockParticipants(), []);

      const preSearch = createMockPreSearch(1);
      const executionLog: Array<{ phase: string; blocked: boolean }> = [];

      // Phase 1: User enables web search, before any flags set
      store.getState().setEnableWebSearch(true);
      executionLog.push({
        phase: 'before-config-change-flag',
        blocked: shouldBlockPreSearchExecution(store),
      });

      // Phase 2: configChangeRoundNumber set (BEFORE PATCH)
      store.getState().setConfigChangeRoundNumber(1);
      executionLog.push({
        phase: 'after-configChangeRoundNumber',
        blocked: shouldBlockPreSearchExecution(store),
      });

      // Phase 3: PATCH in-flight (simulated delay)
      executionLog.push({
        phase: 'during-patch',
        blocked: shouldBlockPreSearchExecution(store),
      });

      // Phase 4: PATCH completes, isWaitingForChangelog set
      store.getState().setIsWaitingForChangelog(true);
      executionLog.push({
        phase: 'after-patch-before-changelog',
        blocked: shouldBlockPreSearchExecution(store),
      });

      // Phase 5: Changelog fetch in-flight
      executionLog.push({
        phase: 'during-changelog-fetch',
        blocked: shouldBlockPreSearchExecution(store),
      });

      // Phase 6: Changelog sync complete, both flags cleared
      store.getState().setConfigChangeRoundNumber(null);
      store.getState().setIsWaitingForChangelog(false);
      executionLog.push({
        phase: 'after-changelog-sync',
        blocked: shouldBlockPreSearchExecution(store),
      });

      // Verify blocking at each phase
      expect(executionLog).toEqual([
        { phase: 'before-config-change-flag', blocked: false },
        { phase: 'after-configChangeRoundNumber', blocked: true },
        { phase: 'during-patch', blocked: true },
        { phase: 'after-patch-before-changelog', blocked: true },
        { phase: 'during-changelog-fetch', blocked: true },
        { phase: 'after-changelog-sync', blocked: false },
      ]);

      // Pre-search can now execute
      expect(canExecutePreSearch(store, preSearch)).toBe(true);
    });

    it('should maintain correct order: PATCH → changelog → pre-search', () => {
      const thread = createMockThread(false);
      store.getState().initializeThread(thread, createMockParticipants(), []);

      const executionOrder: string[] = [];
      const preSearch = createMockPreSearch(1);

      // Simulate full submission flow
      const simulateSubmission = () => {
        // Step 1: Config change
        store.getState().setEnableWebSearch(true);
        executionOrder.push('config-changed');

        // Step 2: Set blocking flag BEFORE PATCH
        store.getState().setConfigChangeRoundNumber(1);
        executionOrder.push('blocking-flag-set');

        // Step 3: PATCH sent
        executionOrder.push('PATCH-sent');

        // Check: Pre-search should be blocked
        if (shouldBlockPreSearchExecution(store)) {
          executionOrder.push('pre-search-blocked');
        }

        // Step 4: PATCH completes, set isWaitingForChangelog
        store.getState().setIsWaitingForChangelog(true);
        executionOrder.push('PATCH-complete');

        // Step 5: Changelog fetch
        executionOrder.push('changelog-fetch-start');

        // Check: Pre-search still blocked
        if (shouldBlockPreSearchExecution(store)) {
          executionOrder.push('pre-search-still-blocked');
        }

        // Step 6: Changelog sync complete
        store.getState().setConfigChangeRoundNumber(null);
        store.getState().setIsWaitingForChangelog(false);
        executionOrder.push('changelog-sync-complete');

        // Step 7: Pre-search can now execute
        if (canExecutePreSearch(store, preSearch)) {
          executionOrder.push('pre-search-executed');
        }
      };

      simulateSubmission();

      expect(executionOrder).toEqual([
        'config-changed',
        'blocking-flag-set',
        'PATCH-sent',
        'pre-search-blocked',
        'PATCH-complete',
        'changelog-fetch-start',
        'pre-search-still-blocked',
        'changelog-sync-complete',
        'pre-search-executed',
      ]);
    });
  });

  describe('edge Cases', () => {
    it('should handle round number 0 correctly', () => {
      const thread = createMockThread(true);
      store.getState().initializeThread(thread, createMockParticipants(), []);

      // Round 0 is valid for initial thread creation
      store.getState().setConfigChangeRoundNumber(0);

      // 0 !== null, so should still block
      expect(shouldBlockPreSearchExecution(store)).toBe(true);
    });

    it('should handle rapid flag changes correctly', () => {
      const thread = createMockThread(true);
      store.getState().initializeThread(thread, createMockParticipants(), []);

      // Simulate rapid toggling (race conditions)
      store.getState().setConfigChangeRoundNumber(1);
      store.getState().setConfigChangeRoundNumber(null);
      store.getState().setConfigChangeRoundNumber(2);
      store.getState().setIsWaitingForChangelog(true);
      store.getState().setIsWaitingForChangelog(false);
      store.getState().setIsWaitingForChangelog(true);

      // Final state: configChangeRoundNumber=2, isWaitingForChangelog=true
      expect(store.getState().configChangeRoundNumber).toBe(2);
      expect(store.getState().isWaitingForChangelog).toBe(true);
      expect(shouldBlockPreSearchExecution(store)).toBe(true);
    });

    it('should handle multiple rounds with config changes', () => {
      const thread = createMockThread(true);
      store.getState().initializeThread(thread, createMockParticipants(), []);

      // Round 1: Config change
      store.getState().setConfigChangeRoundNumber(1);
      store.getState().setIsWaitingForChangelog(true);
      expect(shouldBlockPreSearchExecution(store)).toBe(true);

      // Round 1: Changelog sync
      store.getState().setConfigChangeRoundNumber(null);
      store.getState().setIsWaitingForChangelog(false);
      expect(shouldBlockPreSearchExecution(store)).toBe(false);

      // Round 2: Another config change
      store.getState().setConfigChangeRoundNumber(2);
      store.getState().setIsWaitingForChangelog(true);
      expect(shouldBlockPreSearchExecution(store)).toBe(true);

      // Round 2: Changelog sync
      store.getState().setConfigChangeRoundNumber(null);
      store.getState().setIsWaitingForChangelog(false);
      expect(shouldBlockPreSearchExecution(store)).toBe(false);
    });

    it('should not block when no config changes (just message submission)', () => {
      const thread = createMockThread(true); // Web search already enabled
      store.getState().initializeThread(thread, createMockParticipants(), []);
      store.getState().setEnableWebSearch(true); // Matches thread

      const preSearch = createMockPreSearch(1);

      // No flags set because no config change
      expect(store.getState().configChangeRoundNumber).toBeNull();
      expect(store.getState().isWaitingForChangelog).toBe(false);

      // Pre-search should execute immediately
      expect(canExecutePreSearch(store, preSearch)).toBe(true);
    });
  });

  describe('regression Prevention', () => {
    it('should prevent bug: pre-search before PATCH completes', () => {
      const thread = createMockThread(false);
      store.getState().initializeThread(thread, createMockParticipants(), []);

      const preSearch = createMockPreSearch(1);
      const networkOrder: string[] = [];

      // Simulate the bug scenario
      store.getState().setEnableWebSearch(true);
      store.getState().setConfigChangeRoundNumber(1);

      // PATCH starts but hasn't completed
      networkOrder.push('PATCH-started');

      // BUG (before fix): Pre-search would execute here
      // FIX: Pre-search is blocked
      if (!shouldBlockPreSearchExecution(store)) {
        networkOrder.push('pre-search-executed-WRONG');
      } else {
        networkOrder.push('pre-search-blocked-CORRECT');
      }

      // PATCH completes
      store.getState().setIsWaitingForChangelog(true);
      networkOrder.push('PATCH-completed');

      // Changelog fetches
      networkOrder.push('changelog-started');

      // BUG (before fix): Pre-search might still be executing
      // FIX: Pre-search still blocked
      if (!shouldBlockPreSearchExecution(store)) {
        networkOrder.push('pre-search-executed-WRONG');
      } else {
        networkOrder.push('pre-search-still-blocked-CORRECT');
      }

      // Changelog completes
      store.getState().setConfigChangeRoundNumber(null);
      store.getState().setIsWaitingForChangelog(false);
      networkOrder.push('changelog-completed');

      // NOW pre-search can execute
      if (canExecutePreSearch(store, preSearch)) {
        networkOrder.push('pre-search-executed-CORRECT');
      }

      expect(networkOrder).toEqual([
        'PATCH-started',
        'pre-search-blocked-CORRECT',
        'PATCH-completed',
        'changelog-started',
        'pre-search-still-blocked-CORRECT',
        'changelog-completed',
        'pre-search-executed-CORRECT',
      ]);
    });

    it('should prevent bug: pre-search before changelog fetched', () => {
      const thread = createMockThread(false);
      store.getState().initializeThread(thread, createMockParticipants(), []);

      const preSearch = createMockPreSearch(1);

      // Full submission flow
      store.getState().setEnableWebSearch(true);
      store.getState().setConfigChangeRoundNumber(1);

      // PATCH completes but changelog not yet fetched
      store.getState().setIsWaitingForChangelog(true);

      // Pre-search MUST be blocked here
      expect(shouldBlockPreSearchExecution(store)).toBe(true);
      expect(canExecutePreSearch(store, preSearch)).toBe(false);
    });
  });
});

describe('preSearchStream E2E Flow', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    vi.clearAllMocks();
    store = createChatStore();
  });

  it('simulates complete web search enable flow with correct ordering', async () => {
    const thread = createMockThread(false); // Start without web search
    store.getState().initializeThread(thread, createMockParticipants(), []);

    const events: Array<{ event: string; timestamp: number; blocked?: boolean }> = [];
    let timestamp = 0;

    const log = (event: string, blocked?: boolean) => {
      events.push({ event, timestamp: timestamp++, blocked });
    };

    // Step 1: User enables web search in form
    store.getState().setEnableWebSearch(true);
    log('user-enables-web-search');

    // Step 2: User submits message
    log('form-submit');

    // Step 3: handleUpdateThreadAndSend sets configChangeRoundNumber BEFORE PATCH
    store.getState().setConfigChangeRoundNumber(1);
    log('config-change-round-set');

    // Step 4: Pre-search placeholder added
    store.getState().addPreSearch({
      id: 'presearch-1',
      threadId: 'test-thread-123',
      roundNumber: 1,
      userQuery: 'test query',
      status: MessageStatuses.PENDING,
      searchData: null,
      createdAt: new Date(),
      completedAt: null,
      errorMessage: null,
    });
    log('presearch-placeholder-added');

    // Step 5: PreSearchStream component renders, checks blocking
    log('presearch-component-check', shouldBlockPreSearchExecution(store));

    // Step 6: PATCH request sent
    log('PATCH-request-sent');

    // Simulate PATCH delay
    await Promise.resolve();

    // Step 7: PATCH completes, isWaitingForChangelog set
    store.getState().setIsWaitingForChangelog(true);
    log('PATCH-complete-waiting-changelog');

    // Step 8: PreSearchStream effect re-runs, still blocked
    log('presearch-recheck', shouldBlockPreSearchExecution(store));

    // Step 9: Changelog sync fetches data
    log('changelog-fetch-started');
    await Promise.resolve();

    // Step 10: Changelog sync completes, clears flags
    store.getState().setConfigChangeRoundNumber(null);
    store.getState().setIsWaitingForChangelog(false);
    log('changelog-sync-complete');

    // Step 11: PreSearchStream effect re-runs, now unblocked
    log('presearch-final-check', shouldBlockPreSearchExecution(store));

    // Step 12: Pre-search executes
    const didExecute = store.getState().tryMarkPreSearchTriggered(1);
    log(didExecute ? 'presearch-executed' : 'presearch-failed');

    // Verify order and blocking states
    expect(events).toEqual([
      { event: 'user-enables-web-search', timestamp: 0, blocked: undefined },
      { event: 'form-submit', timestamp: 1, blocked: undefined },
      { event: 'config-change-round-set', timestamp: 2, blocked: undefined },
      { event: 'presearch-placeholder-added', timestamp: 3, blocked: undefined },
      { event: 'presearch-component-check', timestamp: 4, blocked: true },
      { event: 'PATCH-request-sent', timestamp: 5, blocked: undefined },
      { event: 'PATCH-complete-waiting-changelog', timestamp: 6, blocked: undefined },
      { event: 'presearch-recheck', timestamp: 7, blocked: true },
      { event: 'changelog-fetch-started', timestamp: 8, blocked: undefined },
      { event: 'changelog-sync-complete', timestamp: 9, blocked: undefined },
      { event: 'presearch-final-check', timestamp: 10, blocked: false },
      { event: 'presearch-executed', timestamp: 11, blocked: undefined },
    ]);
  });

  it('simulates mode change + web search enable with correct ordering', async () => {
    const thread = createMockThread(false);
    store.getState().initializeThread(thread, createMockParticipants(), []);

    const order: string[] = [];

    // Multiple config changes at once
    store.getState().setEnableWebSearch(true);
    store.getState().setSelectedMode(ChatModes.ANALYZING);
    order.push('config-changes-applied');

    // Blocking flag set
    store.getState().setConfigChangeRoundNumber(1);
    order.push('blocking-flag-set');

    // Add pre-search placeholder
    store.getState().addPreSearch({
      id: 'presearch-1',
      threadId: 'test-thread-123',
      roundNumber: 1,
      userQuery: 'test query',
      status: MessageStatuses.PENDING,
      searchData: null,
      createdAt: new Date(),
      completedAt: null,
      errorMessage: null,
    });

    // Pre-search blocked
    if (shouldBlockPreSearchExecution(store)) {
      order.push('presearch-blocked');
    }

    // PATCH with both mode and web search
    order.push('PATCH-sent');
    await Promise.resolve();

    // PATCH completes
    store.getState().setIsWaitingForChangelog(true);
    order.push('PATCH-complete');

    // Still blocked
    if (shouldBlockPreSearchExecution(store)) {
      order.push('presearch-still-blocked');
    }

    // Changelog syncs
    store.getState().setConfigChangeRoundNumber(null);
    store.getState().setIsWaitingForChangelog(false);
    order.push('changelog-synced');

    // Pre-search can execute
    if (!shouldBlockPreSearchExecution(store)) {
      order.push('presearch-unblocked');
    }

    expect(order).toEqual([
      'config-changes-applied',
      'blocking-flag-set',
      'presearch-blocked',
      'PATCH-sent',
      'PATCH-complete',
      'presearch-still-blocked',
      'changelog-synced',
      'presearch-unblocked',
    ]);
  });

  it('simulates participant reorder + web search with correct ordering', async () => {
    const thread = createMockThread(false);
    store.getState().initializeThread(thread, createMockParticipants(), []);

    // Simulate participant + web search change
    store.getState().setEnableWebSearch(true);
    store.getState().setHasPendingConfigChanges(true);

    // Order must be maintained
    store.getState().setConfigChangeRoundNumber(1);
    expect(shouldBlockPreSearchExecution(store)).toBe(true);

    // PATCH
    await Promise.resolve();
    store.getState().setIsWaitingForChangelog(true);
    expect(shouldBlockPreSearchExecution(store)).toBe(true);

    // Changelog
    store.getState().setConfigChangeRoundNumber(null);
    store.getState().setIsWaitingForChangelog(false);
    expect(shouldBlockPreSearchExecution(store)).toBe(false);
  });
});
