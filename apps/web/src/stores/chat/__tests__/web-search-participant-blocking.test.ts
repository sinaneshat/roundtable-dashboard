/**
 * Web Search Participant Blocking Tests
 *
 * Tests for the CRITICAL behavior that web search MUST complete
 * before ANY participant can start speaking.
 *
 * SINGLE SOURCE OF TRUTH:
 * - Pre-search status: PENDING or STREAMING → Block participants
 * - Pre-search status: COMPLETE or FAILED → Allow participants
 * - Web search disabled → No blocking
 *
 * This is a critical path - if participants start before web search completes,
 * they won't have access to the search context data.
 */

import { MessageStatuses } from '@roundtable/shared';
import { beforeEach, describe, expect, it } from 'vitest';

import type { StoredPreSearch } from '@/services/api';
import { shouldWaitForPreSearch } from '@/stores/chat';

import { createChatStore } from '../store';

// ============================================================================
// TEST HELPERS
// ============================================================================

function createPreSearch(
  roundNumber: number,
  status: 'pending' | 'streaming' | 'complete' | 'failed',
): StoredPreSearch {
  return {
    completedAt: status === 'complete' ? new Date() : null,
    createdAt: new Date(),
    errorMessage: status === 'failed' ? 'Search failed' : null,
    id: `presearch-round-${roundNumber}`,
    roundNumber,
    searchData: status === 'complete'
      ? {
          failureCount: 0,
          queries: [{ index: 0, query: 'test', rationale: 'test', searchDepth: 'basic' as const, total: 1 }],
          results: [],
          successCount: 1,
          summary: 'Search complete',
          totalResults: 0,
          totalTime: 100,
        }
      : null,
    status: status === 'pending'
      ? MessageStatuses.PENDING
      : status === 'streaming'
        ? MessageStatuses.STREAMING
        : status === 'complete'
          ? MessageStatuses.COMPLETE
          : MessageStatuses.FAILED,
    threadId: 'thread-123',
    userQuery: `Query for round ${roundNumber}`,
  } as StoredPreSearch;
}

// ============================================================================
// shouldWaitForPreSearch FUNCTION TESTS
// ============================================================================

describe('shouldWaitForPreSearch Function', () => {
  describe('web Search Disabled Cases', () => {
    it('returns false when web search is disabled and no pre-search exists', () => {
      expect(shouldWaitForPreSearch(false, undefined)).toBeFalsy();
    });

    it('returns false when web search is disabled even with PENDING pre-search', () => {
      const preSearch = createPreSearch(0, 'pending');
      expect(shouldWaitForPreSearch(false, preSearch)).toBeFalsy();
    });

    it('returns false when web search is disabled even with STREAMING pre-search', () => {
      const preSearch = createPreSearch(0, 'streaming');
      expect(shouldWaitForPreSearch(false, preSearch)).toBeFalsy();
    });

    it('returns false when web search is disabled with COMPLETE pre-search', () => {
      const preSearch = createPreSearch(0, 'complete');
      expect(shouldWaitForPreSearch(false, preSearch)).toBeFalsy();
    });
  });

  describe('web Search Enabled - Blocking Cases', () => {
    it('bLOCKS when web search enabled but no pre-search exists yet', () => {
      // This is the initial state - we need to create the pre-search first
      expect(shouldWaitForPreSearch(true, undefined)).toBeTruthy();
    });

    it('bLOCKS when pre-search is PENDING', () => {
      const preSearch = createPreSearch(0, 'pending');
      expect(shouldWaitForPreSearch(true, preSearch)).toBeTruthy();
    });

    it('bLOCKS when pre-search is STREAMING', () => {
      const preSearch = createPreSearch(0, 'streaming');
      expect(shouldWaitForPreSearch(true, preSearch)).toBeTruthy();
    });
  });

  describe('web Search Enabled - Non-Blocking Cases', () => {
    it('aLLOWS when pre-search is COMPLETE', () => {
      const preSearch = createPreSearch(0, 'complete');
      expect(shouldWaitForPreSearch(true, preSearch)).toBeFalsy();
    });

    it('aLLOWS when pre-search is FAILED (graceful degradation)', () => {
      const preSearch = createPreSearch(0, 'failed');
      expect(shouldWaitForPreSearch(true, preSearch)).toBeFalsy();
    });
  });
});

// ============================================================================
// STORE INTEGRATION TESTS
// ============================================================================

describe('store Pre-Search State Management', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
  });

  describe('pre-Search Lifecycle', () => {
    it('tracks pre-search through PENDING → STREAMING → COMPLETE lifecycle', () => {
      // Add pending pre-search
      store.getState().addPreSearch(createPreSearch(0, 'pending'));
      expect(store.getState().preSearches[0]?.status).toBe(MessageStatuses.PENDING);

      // Update to streaming
      store.getState().updatePreSearchStatus(0, MessageStatuses.STREAMING);
      expect(store.getState().preSearches[0]?.status).toBe(MessageStatuses.STREAMING);

      // Update with complete data
      store.getState().updatePreSearchData(0, {
        failureCount: 0,
        queries: [{ index: 0, query: 'test', rationale: 'test', searchDepth: 'basic', total: 1 }],
        results: [],
        successCount: 1,
        summary: 'Done',
        totalResults: 0,
        totalTime: 100,
      });
      expect(store.getState().preSearches[0]?.status).toBe(MessageStatuses.COMPLETE);
    });

    it('tracks pre-search through PENDING → FAILED lifecycle', () => {
      store.getState().addPreSearch(createPreSearch(0, 'pending'));
      expect(store.getState().preSearches[0]?.status).toBe(MessageStatuses.PENDING);

      // Update to failed
      store.getState().updatePreSearchStatus(0, MessageStatuses.FAILED);
      expect(store.getState().preSearches[0]?.status).toBe(MessageStatuses.FAILED);
    });
  });

  describe('pre-Search Trigger Idempotency', () => {
    it('tryMarkPreSearchTriggered returns true only once per round', () => {
      // First attempt - should succeed
      const firstAttempt = store.getState().tryMarkPreSearchTriggered(0);
      expect(firstAttempt).toBeTruthy();

      // Second attempt - should fail (already triggered)
      const secondAttempt = store.getState().tryMarkPreSearchTriggered(0);
      expect(secondAttempt).toBeFalsy();

      // Third attempt - still fails
      const thirdAttempt = store.getState().tryMarkPreSearchTriggered(0);
      expect(thirdAttempt).toBeFalsy();
    });

    it('different rounds can each be triggered once', () => {
      expect(store.getState().tryMarkPreSearchTriggered(0)).toBeTruthy();
      expect(store.getState().tryMarkPreSearchTriggered(1)).toBeTruthy();
      expect(store.getState().tryMarkPreSearchTriggered(2)).toBeTruthy();

      // Re-triggering any should fail
      expect(store.getState().tryMarkPreSearchTriggered(0)).toBeFalsy();
      expect(store.getState().tryMarkPreSearchTriggered(1)).toBeFalsy();
      expect(store.getState().tryMarkPreSearchTriggered(2)).toBeFalsy();
    });

    it('clearing tracking allows re-trigger', () => {
      // Trigger round 0
      expect(store.getState().tryMarkPreSearchTriggered(0)).toBeTruthy();
      expect(store.getState().tryMarkPreSearchTriggered(0)).toBeFalsy();

      // Clear tracking
      store.getState().clearPreSearchTracking(0);

      // Should allow re-trigger
      expect(store.getState().tryMarkPreSearchTriggered(0)).toBeTruthy();
    });
  });

  describe('pre-Search Deduplication', () => {
    it('addPreSearch deduplicates by round number', () => {
      store.getState().addPreSearch(createPreSearch(0, 'pending'));
      expect(store.getState().preSearches).toHaveLength(1);

      // Adding same round again should NOT create duplicate
      store.getState().addPreSearch(createPreSearch(0, 'streaming'));
      expect(store.getState().preSearches).toHaveLength(1);

      // But the status should NOT be updated by addPreSearch
      // (use updatePreSearchStatus for that)
      // This test documents current behavior
    });

    it('different rounds are added separately', () => {
      store.getState().addPreSearch(createPreSearch(0, 'complete'));
      store.getState().addPreSearch(createPreSearch(1, 'pending'));
      store.getState().addPreSearch(createPreSearch(2, 'streaming'));

      expect(store.getState().preSearches).toHaveLength(3);
      expect(store.getState().preSearches.map(ps => ps.roundNumber)).toEqual([0, 1, 2]);
    });
  });

  describe('hasPreSearchBeenTriggered Check', () => {
    it('returns false for untriggered round', () => {
      expect(store.getState().hasPreSearchBeenTriggered(0)).toBeFalsy();
      expect(store.getState().hasPreSearchBeenTriggered(1)).toBeFalsy();
    });

    it('returns true after markPreSearchTriggered', () => {
      store.getState().markPreSearchTriggered(0);
      expect(store.getState().hasPreSearchBeenTriggered(0)).toBeTruthy();
      expect(store.getState().hasPreSearchBeenTriggered(1)).toBeFalsy();
    });
  });
});

// ============================================================================
// MULTI-ROUND PRE-SEARCH COORDINATION
// ============================================================================

describe('multi-Round Pre-Search Coordination', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
  });

  describe('independent Round Tracking', () => {
    it('each round has independent pre-search state', () => {
      // Round 0: Complete
      store.getState().addPreSearch(createPreSearch(0, 'complete'));

      // Round 1: Streaming
      store.getState().addPreSearch(createPreSearch(1, 'streaming'));

      // Round 2: Pending
      store.getState().addPreSearch(createPreSearch(2, 'pending'));

      // Verify each round independently
      const r0 = store.getState().preSearches.find(ps => ps.roundNumber === 0);
      const r1 = store.getState().preSearches.find(ps => ps.roundNumber === 1);
      const r2 = store.getState().preSearches.find(ps => ps.roundNumber === 2);

      expect(shouldWaitForPreSearch(true, r0)).toBeFalsy(); // Complete - don't wait
      expect(shouldWaitForPreSearch(true, r1)).toBeTruthy(); // Streaming - wait
      expect(shouldWaitForPreSearch(true, r2)).toBeTruthy(); // Pending - wait
    });

    it('completing one round does not affect others', () => {
      store.getState().addPreSearch(createPreSearch(0, 'pending'));
      store.getState().addPreSearch(createPreSearch(1, 'pending'));

      // Complete round 0
      store.getState().updatePreSearchStatus(0, MessageStatuses.COMPLETE);

      // Round 0 should not block
      const r0 = store.getState().preSearches.find(ps => ps.roundNumber === 0);
      expect(shouldWaitForPreSearch(true, r0)).toBeFalsy();

      // Round 1 should still block
      const r1 = store.getState().preSearches.find(ps => ps.roundNumber === 1);
      expect(shouldWaitForPreSearch(true, r1)).toBeTruthy();
    });
  });

  describe('round Lookup', () => {
    it('finds correct pre-search for specific round', () => {
      store.getState().addPreSearch(createPreSearch(0, 'complete'));
      store.getState().addPreSearch(createPreSearch(1, 'streaming'));
      store.getState().addPreSearch(createPreSearch(2, 'pending'));

      // Lookup function
      const getPreSearchForRound = (round: number) =>
        store.getState().preSearches.find(ps => ps.roundNumber === round);

      expect(getPreSearchForRound(0)?.status).toBe(MessageStatuses.COMPLETE);
      expect(getPreSearchForRound(1)?.status).toBe(MessageStatuses.STREAMING);
      expect(getPreSearchForRound(2)?.status).toBe(MessageStatuses.PENDING);
      expect(getPreSearchForRound(3)).toBeUndefined();
    });
  });
});

// ============================================================================
// EDGE CASES AND ERROR SCENARIOS
// ============================================================================

describe('edge Cases and Error Scenarios', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
  });

  describe('rapid Status Changes', () => {
    it('handles rapid PENDING → STREAMING → COMPLETE transitions', () => {
      store.getState().addPreSearch(createPreSearch(0, 'pending'));

      // Rapid transitions
      store.getState().updatePreSearchStatus(0, MessageStatuses.STREAMING);
      store.getState().updatePreSearchStatus(0, MessageStatuses.COMPLETE);

      expect(store.getState().preSearches[0]?.status).toBe(MessageStatuses.COMPLETE);

      const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 0);
      expect(shouldWaitForPreSearch(true, preSearch)).toBeFalsy();
    });
  });

  describe('page Refresh Scenarios', () => {
    it('handles resumption when pre-search was STREAMING before refresh', () => {
      // After page refresh, pre-search might be in STREAMING state in DB
      store.getState().addPreSearch(createPreSearch(0, 'streaming'));

      // Should still block until it completes
      const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 0);
      expect(shouldWaitForPreSearch(true, preSearch)).toBeTruthy();

      // Trigger tracking is reset after refresh (Set not persisted)
      expect(store.getState().hasPreSearchBeenTriggered(0)).toBeFalsy();

      // So we can re-trigger (attempt resumption)
      expect(store.getState().tryMarkPreSearchTriggered(0)).toBeTruthy();
    });

    it('handles resumption when pre-search was COMPLETE before refresh', () => {
      store.getState().addPreSearch(createPreSearch(0, 'complete'));

      // Should not block
      const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 0);
      expect(shouldWaitForPreSearch(true, preSearch)).toBeFalsy();
    });
  });

  describe('web Search Toggle Mid-Conversation', () => {
    it('toggling web search off unblocks participants immediately', () => {
      store.getState().addPreSearch(createPreSearch(0, 'streaming'));

      // With web search enabled - blocked
      const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 0);
      expect(shouldWaitForPreSearch(true, preSearch)).toBeTruthy();

      // User toggles web search off - should not block anymore
      expect(shouldWaitForPreSearch(false, preSearch)).toBeFalsy();
    });
  });

  describe('placeholder Pre-Search Handling', () => {
    it('placeholder pre-search still blocks correctly', () => {
      const placeholder: StoredPreSearch = {
        completedAt: null,
        createdAt: new Date(),
        errorMessage: null,
        id: 'placeholder-round-0',
        roundNumber: 0,
        searchData: null,
        status: MessageStatuses.PENDING,
        threadId: 'thread-123',
        userQuery: 'Query',
      } as StoredPreSearch;

      store.getState().addPreSearch(placeholder);

      // Placeholder should block just like regular pre-search
      const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 0);
      expect(preSearch?.id.startsWith('placeholder-')).toBeTruthy();
      expect(shouldWaitForPreSearch(true, preSearch)).toBeTruthy();
    });
  });

  describe('concurrent Component Trigger Attempts', () => {
    it('only first component successfully triggers pre-search', () => {
      const triggerResults: boolean[] = [];

      // Simulate multiple components trying to trigger simultaneously
      // (e.g., React Strict Mode double-mount, or multiple useEffect runs)
      for (let i = 0; i < 5; i++) {
        const didTrigger = store.getState().tryMarkPreSearchTriggered(0);
        triggerResults.push(didTrigger);
      }

      // Only first should succeed
      expect(triggerResults).toEqual([true, false, false, false, false]);
    });
  });
});

// ============================================================================
// ACTIVITY TRACKING TESTS
// ============================================================================

describe('pre-Search Activity Tracking', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
  });

  it('tracks activity time for timeout detection', () => {
    store.getState().addPreSearch(createPreSearch(0, 'streaming'));

    // Update activity
    store.getState().updatePreSearchActivity(0);

    // Activity time should be set
    const activityTime = store.getState().getPreSearchActivityTime(0);
    expect(activityTime).toBeGreaterThan(0);
  });

  it('clears activity when pre-search completes', () => {
    store.getState().addPreSearch(createPreSearch(0, 'streaming'));
    store.getState().updatePreSearchActivity(0);

    // Clear activity
    store.getState().clearPreSearchActivity(0);

    // Activity should be cleared (returns undefined or 0 when no activity)
    const activityTime = store.getState().getPreSearchActivityTime(0);
    expect(activityTime === undefined || activityTime === 0).toBeTruthy();
  });
});
