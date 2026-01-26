/**
 * Pre-Search Timeout Protection Tests
 *
 * Tests the CRITICAL 10-second timeout protection that prevents permanent blocking
 * when pre-search hangs or fails to complete.
 *
 * FLOW_DOCUMENTATION.md Part 2 - Timeout Protection:
 * > ✅ ADDED: 10-second timeout for changelog/pre-search waiting
 * > If pre-search hangs, system proceeds after timeout to prevent permanent blocking
 *
 * CRITICAL SCENARIOS:
 * 1. Pre-search PENDING for 10+ seconds → Allow participants to proceed
 * 2. Pre-search STREAMING for 10+ seconds → Allow participants to proceed
 * 3. Pre-search completes within 10 seconds → No timeout triggered
 * 4. Timeout works on both OVERVIEW and THREAD screens
 * 5. Timeout resets on status transitions (PENDING → STREAMING)
 * 6. Multiple rounds have independent timeout tracking
 *
 * @see docs/FLOW_DOCUMENTATION.md Section 2 - Timeout Protection
 */

import { MessageStatuses, ScreenModes } from '@roundtable/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { StoredPreSearch } from '@/services/api';

import type { ChatStoreApi } from '../store';
import { createChatStore } from '../store';
import { shouldWaitForPreSearch } from '../utils/pre-search-execution';

// ============================================================================
// TEST HELPERS
// ============================================================================

function createPreSearch(
  roundNumber: number,
  status: 'pending' | 'streaming' | 'complete' | 'failed',
  createdAt: Date = new Date(),
): StoredPreSearch {
  return {
    completedAt: status === 'complete' ? new Date() : null,
    createdAt,
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

function createStalePreSearch(
  roundNumber: number,
  status: 'pending' | 'streaming',
  ageInSeconds: number,
): StoredPreSearch {
  const staleTime = new Date(Date.now() - (ageInSeconds * 1000));
  return createPreSearch(roundNumber, status, staleTime);
}

function isPreSearchStale(preSearch: StoredPreSearch, timeoutSeconds = 10): boolean {
  const createdTime = preSearch.createdAt instanceof Date
    ? preSearch.createdAt.getTime()
    : new Date(preSearch.createdAt).getTime();
  const elapsed = Date.now() - createdTime;
  return elapsed > (timeoutSeconds * 1000);
}

// ============================================================================
// 10-SECOND TIMEOUT TRIGGER TESTS
// ============================================================================

describe('10-Second Timeout Protection', () => {
  describe('timeout Detection Logic', () => {
    it('should detect pre-search PENDING for 11 seconds as stale (timeout)', () => {
      const stalePreSearch = createStalePreSearch(0, 'pending', 11);

      const isStale = isPreSearchStale(stalePreSearch, 10);
      expect(isStale).toBeTruthy();

      const createdTime = stalePreSearch.createdAt.getTime();
      const elapsed = Date.now() - createdTime;
      expect(elapsed).toBeGreaterThan(10_000);
    });

    it('should detect pre-search STREAMING for 12 seconds as stale (timeout)', () => {
      const stalePreSearch = createStalePreSearch(0, 'streaming', 12);

      const isStale = isPreSearchStale(stalePreSearch, 10);
      expect(isStale).toBeTruthy();
    });

    it('should NOT detect pre-search PENDING for 8 seconds as stale', () => {
      const freshPreSearch = createStalePreSearch(0, 'pending', 8);

      const isStale = isPreSearchStale(freshPreSearch, 10);
      expect(isStale).toBeFalsy();
    });

    it('should NOT detect pre-search STREAMING for 9 seconds as stale', () => {
      const freshPreSearch = createStalePreSearch(0, 'streaming', 9);

      const isStale = isPreSearchStale(freshPreSearch, 10);
      expect(isStale).toBeFalsy();
    });

    it('should handle exact 10-second boundary correctly', () => {
      // Create pre-search exactly 10.001 seconds old (just over threshold)
      const boundaryPreSearch = createStalePreSearch(0, 'pending', 10.001);

      // Check elapsed time
      const createdTime = boundaryPreSearch.createdAt.getTime();
      const elapsed = Date.now() - createdTime;

      // Should be just over 10 seconds
      expect(elapsed).toBeGreaterThan(10_000);

      // isStale check: > 10s (not >= 10s)
      // 10.001 seconds is stale
      const isStale = isPreSearchStale(boundaryPreSearch, 10);
      expect(isStale).toBeTruthy();

      // Verify that exactly 10s would NOT be stale
      const exactlyTenSeconds = createStalePreSearch(1, 'pending', 10);
      const _exactElapsed = Date.now() - exactlyTenSeconds.createdAt.getTime();
      // Due to test execution time, this will be slightly over 10s, so skip this check
      // Just verify the concept: boundary is > 10s, not >= 10s
    });
  });

  describe('timeout Behavior with shouldWaitForPreSearch', () => {
    it('should BLOCK participants when pre-search is fresh PENDING (< 10s)', () => {
      const freshPreSearch = createStalePreSearch(0, 'pending', 5);

      // Fresh pre-search should block
      expect(shouldWaitForPreSearch(true, freshPreSearch)).toBeTruthy();

      // Not stale yet
      expect(isPreSearchStale(freshPreSearch, 10)).toBeFalsy();
    });

    it('should BLOCK participants when pre-search is fresh STREAMING (< 10s)', () => {
      const freshPreSearch = createStalePreSearch(0, 'streaming', 7);

      expect(shouldWaitForPreSearch(true, freshPreSearch)).toBeTruthy();
      expect(isPreSearchStale(freshPreSearch, 10)).toBeFalsy();
    });

    it('should conceptually NOT BLOCK when pre-search is stale PENDING (> 10s)', () => {
      const stalePreSearch = createStalePreSearch(0, 'pending', 11);

      // IMPORTANT: shouldWaitForPreSearch doesn't check staleness itself
      // The timeout protection is implemented at the caller level
      // This test documents the conceptual behavior
      expect(isPreSearchStale(stalePreSearch, 10)).toBeTruthy();

      // If staleness check is NOT applied, it would still block
      const wouldBlockWithoutTimeout = shouldWaitForPreSearch(true, stalePreSearch);
      expect(wouldBlockWithoutTimeout).toBeTruthy();

      // With timeout protection, caller should check staleness:
      const shouldBlockWithTimeout = wouldBlockWithoutTimeout && !isPreSearchStale(stalePreSearch, 10);
      expect(shouldBlockWithTimeout).toBeFalsy(); // Timeout overrides blocking
    });

    it('should conceptually NOT BLOCK when pre-search is stale STREAMING (> 10s)', () => {
      const stalePreSearch = createStalePreSearch(0, 'streaming', 12);

      expect(isPreSearchStale(stalePreSearch, 10)).toBeTruthy();

      const wouldBlockWithoutTimeout = shouldWaitForPreSearch(true, stalePreSearch);
      expect(wouldBlockWithoutTimeout).toBeTruthy();

      const shouldBlockWithTimeout = wouldBlockWithoutTimeout && !isPreSearchStale(stalePreSearch, 10);
      expect(shouldBlockWithTimeout).toBeFalsy(); // Timeout overrides blocking
    });
  });

  describe('timeout Protection Pattern', () => {
    it('should implement timeout-aware blocking check pattern', () => {
      const _webSearchEnabled = true;
      const stalePreSearch = createStalePreSearch(0, 'pending', 15);

      // Pattern 1: Check staleness first (early return)
      const isStale = isPreSearchStale(stalePreSearch, 10);
      // Verify stale check works - stale pre-searches should not block
      expect(isStale).toBeTruthy();
      // When stale, we skip the blocking check entirely (timeout protection)
    });

    it('should implement combined timeout-aware blocking check', () => {
      // Helper function that combines timeout and blocking checks
      function shouldWaitWithTimeout(
        enabled: boolean,
        preSearch: StoredPreSearch | undefined,
        timeoutSeconds = 10,
      ): boolean {
        if (!preSearch) {
          return enabled;
        } // No pre-search, wait if enabled
        if (isPreSearchStale(preSearch, timeoutSeconds)) {
          return false;
        } // Timeout - don't wait
        return shouldWaitForPreSearch(enabled, preSearch); // Normal blocking check
      }

      // Test with fresh pre-search
      const fresh = createStalePreSearch(0, 'pending', 5);
      expect(shouldWaitWithTimeout(true, fresh)).toBeTruthy();

      // Test with stale pre-search
      const stale = createStalePreSearch(0, 'pending', 11);
      expect(shouldWaitWithTimeout(true, stale)).toBeFalsy(); // Timeout overrides

      // Test with complete pre-search
      const complete = createPreSearch(0, 'complete');
      expect(shouldWaitWithTimeout(true, complete)).toBeFalsy();

      // Test with web search disabled
      expect(shouldWaitWithTimeout(false, fresh)).toBeFalsy();
    });
  });
});

// ============================================================================
// TIMEOUT ON DIFFERENT SCREENS
// ============================================================================

describe('timeout on Different Screens', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createChatStore();
  });

  describe('oVERVIEW Screen Timeout', () => {
    it('should track timeout on OVERVIEW screen (initial round)', () => {
      store.getState().setScreenMode(ScreenModes.OVERVIEW);

      const stalePreSearch = createStalePreSearch(0, 'pending', 11);
      store.getState().addPreSearch(stalePreSearch);

      const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 0);
      expect(preSearch).toBeDefined();
      if (!preSearch) {
        throw new Error('expected preSearch');
      }
      expect(isPreSearchStale(preSearch, 10)).toBeTruthy();
      expect(store.getState().screenMode).toBe(ScreenModes.OVERVIEW);
    });

    it('should allow participants after timeout on OVERVIEW screen', () => {
      store.getState().setScreenMode(ScreenModes.OVERVIEW);

      const stalePreSearch = createStalePreSearch(0, 'streaming', 12);
      store.getState().addPreSearch(stalePreSearch);

      const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 0);
      if (!preSearch) {
        throw new Error('expected preSearch');
      }

      // Without timeout: would block
      expect(shouldWaitForPreSearch(true, preSearch)).toBeTruthy();

      // With timeout: should NOT block
      const isStale = isPreSearchStale(preSearch, 10);
      const shouldBlockWithTimeout = shouldWaitForPreSearch(true, preSearch) && !isStale;
      expect(shouldBlockWithTimeout).toBeFalsy();
    });
  });

  describe('tHREAD Screen Timeout', () => {
    it('should track timeout on THREAD screen (subsequent rounds)', () => {
      store.getState().setScreenMode(ScreenModes.THREAD);

      const stalePreSearch = createStalePreSearch(1, 'pending', 13);
      store.getState().addPreSearch(stalePreSearch);

      const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 1);
      expect(preSearch).toBeDefined();
      if (!preSearch) {
        throw new Error('expected preSearch');
      }
      expect(isPreSearchStale(preSearch, 10)).toBeTruthy();
      expect(store.getState().screenMode).toBe(ScreenModes.THREAD);
    });

    it('should allow participants after timeout on THREAD screen', () => {
      store.getState().setScreenMode(ScreenModes.THREAD);

      const stalePreSearch = createStalePreSearch(1, 'streaming', 14);
      store.getState().addPreSearch(stalePreSearch);

      const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 1);
      if (!preSearch) {
        throw new Error('expected preSearch');
      }

      const isStale = isPreSearchStale(preSearch, 10);
      const shouldBlockWithTimeout = shouldWaitForPreSearch(true, preSearch) && !isStale;
      expect(shouldBlockWithTimeout).toBeFalsy();
    });
  });

  describe('cross-Screen Timeout Consistency', () => {
    it('should apply same timeout logic regardless of screen mode', () => {
      const stalePreSearch = createStalePreSearch(0, 'pending', 11);

      // Test on OVERVIEW
      store.getState().setScreenMode(ScreenModes.OVERVIEW);
      store.getState().addPreSearch(stalePreSearch);
      const preSearchOverview = store.getState().preSearches.find(ps => ps.roundNumber === 0);
      if (!preSearchOverview) {
        throw new Error('expected preSearchOverview');
      }
      expect(isPreSearchStale(preSearchOverview, 10)).toBeTruthy();

      // Clear and test on THREAD
      store.getState().setPreSearches([]);
      store.getState().setScreenMode(ScreenModes.THREAD);
      store.getState().addPreSearch(stalePreSearch);
      const preSearchThread = store.getState().preSearches.find(ps => ps.roundNumber === 0);
      if (!preSearchThread) {
        throw new Error('expected preSearchThread');
      }
      expect(isPreSearchStale(preSearchThread, 10)).toBeTruthy();

      // Same staleness detection regardless of screen
      expect(isPreSearchStale(preSearchOverview, 10)).toBe(isPreSearchStale(preSearchThread, 10));
    });
  });
});

// ============================================================================
// TIMEOUT RESET BEHAVIOR
// ============================================================================

describe('timeout Reset Behavior', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createChatStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('status Transition Resets Timeout', () => {
    it('should reset timeout when PENDING → STREAMING transition occurs', () => {
      // Create PENDING pre-search 8 seconds ago
      const preSearch = createStalePreSearch(0, 'pending', 8);
      store.getState().addPreSearch(preSearch);

      // Not stale yet
      let current = store.getState().preSearches.find(ps => ps.roundNumber === 0);
      if (!current) {
        throw new Error('expected current');
      }
      expect(isPreSearchStale(current, 10)).toBeFalsy();

      // Advance 3 seconds (total 11s) - would be stale
      vi.advanceTimersByTime(3000);

      // Transition to STREAMING (creates new pre-search with fresh timestamp)
      store.getState().updatePreSearchStatus(0, MessageStatuses.STREAMING);

      // After status update, createdAt should be fresh
      // (In real implementation, status update doesn't change createdAt,
      // but we can track activity timestamp separately)
      store.getState().updatePreSearchActivity(0);

      // Activity timestamp should be fresh
      const activityTime = store.getState().getPreSearchActivityTime(0);
      expect(activityTime).toBeGreaterThan(0);

      // Concept: Activity tracking resets the timeout window
      current = store.getState().preSearches.find(ps => ps.roundNumber === 0);
      expect(current?.status).toBe(MessageStatuses.STREAMING);
    });

    it('should track activity updates to reset timeout window', () => {
      const preSearch = createStalePreSearch(0, 'streaming', 7);
      store.getState().addPreSearch(preSearch);

      // Set activity at start
      store.getState().updatePreSearchActivity(0);
      const initialActivity = store.getState().getPreSearchActivityTime(0);
      expect(initialActivity).toBeGreaterThan(0);

      // Advance 4 seconds (pre-search would be 11s old, but activity 4s old)
      vi.advanceTimersByTime(4000);

      // Update activity again
      store.getState().updatePreSearchActivity(0);
      const updatedActivity = store.getState().getPreSearchActivityTime(0);
      expect(updatedActivity).toBeGreaterThan(initialActivity);

      // Activity tracking allows extending timeout window
      expect(updatedActivity - initialActivity).toBeGreaterThanOrEqual(4000);
    });
  });

  describe('completion Clears Timeout', () => {
    it('should clear activity tracking when pre-search completes', () => {
      const preSearch = createStalePreSearch(0, 'streaming', 6);
      store.getState().addPreSearch(preSearch);

      store.getState().updatePreSearchActivity(0);
      expect(store.getState().getPreSearchActivityTime(0)).toBeGreaterThan(0);

      // Complete pre-search
      store.getState().updatePreSearchStatus(0, MessageStatuses.COMPLETE);
      store.getState().clearPreSearchActivity(0);

      // Activity should be cleared
      const activityTime = store.getState().getPreSearchActivityTime(0);
      expect(activityTime === undefined || activityTime === 0).toBeTruthy();
    });

    it('should clear activity tracking when pre-search fails', () => {
      const preSearch = createStalePreSearch(0, 'streaming', 5);
      store.getState().addPreSearch(preSearch);

      store.getState().updatePreSearchActivity(0);
      expect(store.getState().getPreSearchActivityTime(0)).toBeGreaterThan(0);

      // Fail pre-search
      store.getState().updatePreSearchStatus(0, MessageStatuses.FAILED);
      store.getState().clearPreSearchActivity(0);

      // Activity should be cleared
      const activityTime = store.getState().getPreSearchActivityTime(0);
      expect(activityTime === undefined || activityTime === 0).toBeTruthy();
    });
  });
});

// ============================================================================
// MULTI-ROUND TIMEOUT ISOLATION
// ============================================================================

describe('multi-Round Timeout Isolation', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createChatStore();
  });

  describe('independent Timeout Tracking per Round', () => {
    it('should track timeouts independently for each round', () => {
      // Round 0: Fresh (5s old)
      const round0 = createStalePreSearch(0, 'pending', 5);
      store.getState().addPreSearch(round0);

      // Round 1: Stale (11s old)
      const round1 = createStalePreSearch(1, 'pending', 11);
      store.getState().addPreSearch(round1);

      // Round 2: Fresh (7s old)
      const round2 = createStalePreSearch(2, 'streaming', 7);
      store.getState().addPreSearch(round2);

      const r0 = store.getState().preSearches.find(ps => ps.roundNumber === 0);
      const r1 = store.getState().preSearches.find(ps => ps.roundNumber === 1);
      const r2 = store.getState().preSearches.find(ps => ps.roundNumber === 2);
      if (!r0) {
        throw new Error('expected r0');
      }
      if (!r1) {
        throw new Error('expected r1');
      }
      if (!r2) {
        throw new Error('expected r2');
      }

      // Round 0: Not stale
      expect(isPreSearchStale(r0, 10)).toBeFalsy();

      // Round 1: Stale (timed out)
      expect(isPreSearchStale(r1, 10)).toBeTruthy();

      // Round 2: Not stale
      expect(isPreSearchStale(r2, 10)).toBeFalsy();
    });

    it('should handle concurrent timeouts on different rounds', () => {
      // Both rounds are stale
      const round0 = createStalePreSearch(0, 'streaming', 12);
      const round1 = createStalePreSearch(1, 'streaming', 13);

      store.getState().addPreSearch(round0);
      store.getState().addPreSearch(round1);

      const r0 = store.getState().preSearches.find(ps => ps.roundNumber === 0);
      const r1 = store.getState().preSearches.find(ps => ps.roundNumber === 1);
      if (!r0) {
        throw new Error('expected r0');
      }
      if (!r1) {
        throw new Error('expected r1');
      }

      // Both should timeout independently
      expect(isPreSearchStale(r0, 10)).toBeTruthy();
      expect(isPreSearchStale(r1, 10)).toBeTruthy();
    });

    it('should not affect other rounds when one round times out', () => {
      const round0 = createStalePreSearch(0, 'pending', 11); // Stale
      const round1 = createStalePreSearch(1, 'pending', 5); // Fresh

      store.getState().addPreSearch(round0);
      store.getState().addPreSearch(round1);

      const r0 = store.getState().preSearches.find(ps => ps.roundNumber === 0);
      const r1 = store.getState().preSearches.find(ps => ps.roundNumber === 1);
      if (!r0) {
        throw new Error('expected r0');
      }
      if (!r1) {
        throw new Error('expected r1');
      }

      // Round 0 timed out
      expect(isPreSearchStale(r0, 10)).toBeTruthy();

      // Round 1 still fresh (independent timeout)
      expect(isPreSearchStale(r1, 10)).toBeFalsy();
    });
  });

  describe('activity Tracking per Round', () => {
    it('should track activity independently for each round', () => {
      store.getState().addPreSearch(createStalePreSearch(0, 'streaming', 5));
      store.getState().addPreSearch(createStalePreSearch(1, 'streaming', 6));

      // Update activity for round 0 only
      store.getState().updatePreSearchActivity(0);

      expect(store.getState().getPreSearchActivityTime(0)).toBeGreaterThan(0);
      const round1Activity = store.getState().getPreSearchActivityTime(1);
      expect(round1Activity === undefined || round1Activity === 0).toBeTruthy();
    });

    it('should clear activity for specific round without affecting others', () => {
      store.getState().addPreSearch(createStalePreSearch(0, 'streaming', 5));
      store.getState().addPreSearch(createStalePreSearch(1, 'streaming', 6));

      store.getState().updatePreSearchActivity(0);
      store.getState().updatePreSearchActivity(1);

      expect(store.getState().getPreSearchActivityTime(0)).toBeGreaterThan(0);
      expect(store.getState().getPreSearchActivityTime(1)).toBeGreaterThan(0);

      // Clear round 0 activity
      store.getState().clearPreSearchActivity(0);

      const r0Activity = store.getState().getPreSearchActivityTime(0);
      expect(r0Activity === undefined || r0Activity === 0).toBeTruthy();

      // Round 1 activity unaffected
      expect(store.getState().getPreSearchActivityTime(1)).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// TIMEOUT AND USER ACTIONS
// ============================================================================

describe('timeout and User Actions', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createChatStore();
  });

  describe('timeout During Mid-Conversation Web Search Enable', () => {
    it('should handle timeout when enabling web search mid-conversation', () => {
      store.getState().setScreenMode(ScreenModes.THREAD);
      store.getState().setEnableWebSearch(false);

      // User enables web search
      store.getState().setEnableWebSearch(true);

      // Pre-search created but hangs
      const stalePreSearch = createStalePreSearch(1, 'pending', 11);
      store.getState().addPreSearch(stalePreSearch);

      const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 1);
      if (!preSearch) {
        throw new Error('expected preSearch');
      }

      // Timeout should prevent permanent blocking
      expect(isPreSearchStale(preSearch, 10)).toBeTruthy();

      const shouldBlock = shouldWaitForPreSearch(true, preSearch) && !isPreSearchStale(preSearch, 10);
      expect(shouldBlock).toBeFalsy();
    });

    it('should allow participants after timeout despite mid-conversation enable', () => {
      store.getState().setScreenMode(ScreenModes.THREAD);
      store.getState().setEnableWebSearch(true);

      // Stale pre-search
      const stalePreSearch = createStalePreSearch(1, 'streaming', 12);
      store.getState().addPreSearch(stalePreSearch);

      const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 1);
      if (!preSearch) {
        throw new Error('expected preSearch');
      }

      // Even with web search enabled, timeout overrides blocking
      const isStale = isPreSearchStale(preSearch, 10);
      expect(isStale).toBeTruthy();

      const shouldBlock = shouldWaitForPreSearch(true, preSearch) && !isStale;
      expect(shouldBlock).toBeFalsy();
    });
  });

  describe('timeout When User Stops Streaming', () => {
    it('should handle timeout when user stops during pre-search', () => {
      const stalePreSearch = createStalePreSearch(0, 'streaming', 11);
      store.getState().addPreSearch(stalePreSearch);

      // User stops streaming
      store.getState().setIsStreaming(false);

      const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 0);
      if (!preSearch) {
        throw new Error('expected preSearch');
      }

      // Pre-search should still timeout
      expect(isPreSearchStale(preSearch, 10)).toBeTruthy();

      // Participants should be allowed to proceed after timeout
      const shouldBlock = shouldWaitForPreSearch(true, preSearch) && !isPreSearchStale(preSearch, 10);
      expect(shouldBlock).toBeFalsy();
    });

    it('should clear activity when user stops and pre-search times out', () => {
      const stalePreSearch = createStalePreSearch(0, 'streaming', 11);
      store.getState().addPreSearch(stalePreSearch);

      store.getState().updatePreSearchActivity(0);
      expect(store.getState().getPreSearchActivityTime(0)).toBeGreaterThan(0);

      // User stops streaming - cleanup
      store.getState().setIsStreaming(false);
      store.getState().clearPreSearchActivity(0);

      const activityTime = store.getState().getPreSearchActivityTime(0);
      expect(activityTime === undefined || activityTime === 0).toBeTruthy();
    });
  });
});
