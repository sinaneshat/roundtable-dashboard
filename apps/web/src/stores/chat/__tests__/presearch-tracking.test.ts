/**
 * Pre-Search Tracking Unit Tests
 *
 * Comprehensive tests for pre-search tracking following TDD principles.
 * Tests the blocking behavior, trigger tracking, activity tracking, and deduplication
 * documented in FLOW_DOCUMENTATION.md.
 *
 * Coverage:
 * 1. Pre-search blocking behavior (Frame 10)
 *    - "Web Research Streaming (Blocks Participants)"
 *    - Pre-search must complete before participants can start
 *
 * 2. Pre-search trigger tracking
 *    - hasPreSearchBeenTriggered should check triggeredPreSearchRounds
 *    - markPreSearchTriggered should add round to triggeredPreSearchRounds
 *    - tryMarkPreSearchTriggered should return false if already triggered
 *    - clearPreSearchTracking should clear for specific round
 *
 * 3. Pre-search activity tracking
 *    - updatePreSearchActivity should update timestamp
 *    - clearPreSearchActivity should remove timestamp
 *    - preSearchActivityTimes Map should track last activity per round
 *
 * 4. Pre-search completion (Frame 11)
 *    - "Web Research Complete -> Participants Start"
 *    - updatePreSearchData should set status to 'complete'
 *    - Should set completedAt timestamp
 *    - Should store searchData
 *
 * 5. Thread navigation clears pre-search state
 *    - resetForThreadNavigation should clear preSearches
 *    - Should clear triggeredPreSearchRounds
 *    - Should clear preSearchActivityTimes
 *
 * 6. Deduplication
 *    - Same round should not trigger pre-search twice
 *    - Multiple calls to markPreSearchTriggered for same round
 *
 * References:
 * - store.ts: Pre-search state management actions
 * - FLOW_DOCUMENTATION.md Frames 10-11: Web Research flow
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createMockStoredPreSearch } from '@/lib/testing';
import type { StoredPreSearch } from '@/services/api';
import type { ChatStoreApi } from '@/stores/chat';
import { createChatStore } from '@/stores/chat';

describe('preSearch Tracking', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createChatStore();
    vi.clearAllMocks();
  });

  // ============================================================================
  // 1. PRE-SEARCH BLOCKING BEHAVIOR (Frame 10)
  // ============================================================================

  describe('1. Pre-search blocking behavior (Frame 10)', () => {
    describe('addPreSearch', () => {
      it('should add pre-search to preSearches array', () => {
        // ARRANGE
        const preSearch = createMockStoredPreSearch(1, 'pending');

        // ACT
        store.getState().addPreSearch(preSearch);

        // ASSERT
        const state = store.getState();
        expect(state.preSearches).toHaveLength(1);
        expect(state.preSearches[0]?.roundNumber).toBe(1);
      });

      it('should not add duplicate pre-search for same thread and round', () => {
        // ARRANGE
        const preSearch1 = createMockStoredPreSearch(1, 'pending', {
          id: 'ps-1',
          threadId: 'thread-123',
        });
        const preSearch2 = createMockStoredPreSearch(1, 'streaming', {
          id: 'ps-2',
          threadId: 'thread-123',
        });

        // ACT
        store.getState().addPreSearch(preSearch1);
        store.getState().addPreSearch(preSearch2);

        // ASSERT: Only first one added
        const state = store.getState();
        expect(state.preSearches).toHaveLength(1);
        expect(state.preSearches[0]?.id).toBe('ps-1');
      });

      it('should add multiple pre-searches for different rounds', () => {
        // ARRANGE
        const preSearch1 = createMockStoredPreSearch(1, 'pending');
        const preSearch2 = createMockStoredPreSearch(2, 'pending');

        // ACT
        store.getState().addPreSearch(preSearch1);
        store.getState().addPreSearch(preSearch2);

        // ASSERT
        const state = store.getState();
        expect(state.preSearches).toHaveLength(2);
        expect(state.preSearches[0]?.roundNumber).toBe(1);
        expect(state.preSearches[1]?.roundNumber).toBe(2);
      });
    });

    describe('updatePreSearchStatus', () => {
      it('should update status for existing pre-search', () => {
        // ARRANGE
        const preSearch = createMockStoredPreSearch(1, 'pending');
        store.getState().addPreSearch(preSearch);

        // ACT
        store.getState().updatePreSearchStatus(1, 'streaming');

        // ASSERT
        const state = store.getState();
        expect(state.preSearches[0]?.status).toBe('streaming');
      });

      it('should not fail when updating non-existent round', () => {
        // ACT & ASSERT: Should not throw
        expect(() => {
          store.getState().updatePreSearchStatus(999, 'complete');
        }).not.toThrow();
      });

      it('should update correct round when multiple exist', () => {
        // ARRANGE
        store.getState().addPreSearch(createMockStoredPreSearch(1, 'pending'));
        store.getState().addPreSearch(createMockStoredPreSearch(2, 'pending'));

        // ACT
        store.getState().updatePreSearchStatus(2, 'streaming');

        // ASSERT
        const state = store.getState();
        expect(state.preSearches[0]?.status).toBe('pending');
        expect(state.preSearches[1]?.status).toBe('streaming');
      });
    });

    describe('pre-search blocking semantics', () => {
      it('should block participants when pre-search is pending', () => {
        // ARRANGE
        store.getState().addPreSearch(createMockStoredPreSearch(1, 'pending'));

        // ACT: Check if streaming should wait
        const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 1);
        const shouldBlock = preSearch?.status === 'pending' || preSearch?.status === 'streaming';

        // ASSERT
        expect(shouldBlock).toBe(true);
      });

      it('should block participants when pre-search is streaming', () => {
        // ARRANGE
        store.getState().addPreSearch(createMockStoredPreSearch(1, 'streaming'));

        // ACT
        const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 1);
        const shouldBlock = preSearch?.status === 'pending' || preSearch?.status === 'streaming';

        // ASSERT
        expect(shouldBlock).toBe(true);
      });

      it('should not block participants when pre-search is complete', () => {
        // ARRANGE
        store.getState().addPreSearch(createMockStoredPreSearch(1, 'complete'));

        // ACT
        const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 1);
        const shouldBlock = preSearch?.status === 'pending' || preSearch?.status === 'streaming';

        // ASSERT
        expect(shouldBlock).toBe(false);
      });

      it('should not block participants when pre-search failed', () => {
        // ARRANGE
        store.getState().addPreSearch(createMockStoredPreSearch(1, 'failed'));

        // ACT
        const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 1);
        const shouldBlock = preSearch?.status === 'pending' || preSearch?.status === 'streaming';

        // ASSERT: Failed status allows streaming to proceed
        expect(shouldBlock).toBe(false);
      });
    });
  });

  // ============================================================================
  // 2. PRE-SEARCH TRIGGER TRACKING
  // ============================================================================

  describe('2. Pre-search trigger tracking', () => {
    describe('hasPreSearchBeenTriggered', () => {
      it('should return false for untriggered round', () => {
        // ACT
        const result = store.getState().hasPreSearchBeenTriggered(1);

        // ASSERT
        expect(result).toBe(false);
      });

      it('should return true for triggered round', () => {
        // ARRANGE
        store.getState().markPreSearchTriggered(1);

        // ACT
        const result = store.getState().hasPreSearchBeenTriggered(1);

        // ASSERT
        expect(result).toBe(true);
      });

      it('should track multiple rounds independently', () => {
        // ARRANGE
        store.getState().markPreSearchTriggered(1);
        store.getState().markPreSearchTriggered(3);

        // ACT & ASSERT
        expect(store.getState().hasPreSearchBeenTriggered(1)).toBe(true);
        expect(store.getState().hasPreSearchBeenTriggered(2)).toBe(false);
        expect(store.getState().hasPreSearchBeenTriggered(3)).toBe(true);
      });
    });

    describe('markPreSearchTriggered', () => {
      it('should add round to triggeredPreSearchRounds', () => {
        // ACT
        store.getState().markPreSearchTriggered(1);

        // ASSERT
        expect(store.getState().hasPreSearchBeenTriggered(1)).toBe(true);
      });

      it('should be idempotent for same round', () => {
        // ACT
        store.getState().markPreSearchTriggered(1);
        store.getState().markPreSearchTriggered(1);
        store.getState().markPreSearchTriggered(1);

        // ASSERT: Should still only be triggered once (Set behavior)
        expect(store.getState().hasPreSearchBeenTriggered(1)).toBe(true);
      });
    });

    describe('tryMarkPreSearchTriggered', () => {
      it('should return true and mark when not already triggered', () => {
        // ACT
        const result = store.getState().tryMarkPreSearchTriggered(1);

        // ASSERT
        expect(result).toBe(true);
        expect(store.getState().hasPreSearchBeenTriggered(1)).toBe(true);
      });

      it('should return false when already triggered', () => {
        // ARRANGE
        store.getState().markPreSearchTriggered(1);

        // ACT
        const result = store.getState().tryMarkPreSearchTriggered(1);

        // ASSERT
        expect(result).toBe(false);
      });

      it('should be atomic - first call wins in rapid succession', () => {
        // ACT: Simulate rapid calls
        const result1 = store.getState().tryMarkPreSearchTriggered(1);
        const result2 = store.getState().tryMarkPreSearchTriggered(1);
        const result3 = store.getState().tryMarkPreSearchTriggered(1);

        // ASSERT: Only first call succeeds
        expect(result1).toBe(true);
        expect(result2).toBe(false);
        expect(result3).toBe(false);
      });

      it('should work independently for different rounds', () => {
        // ACT
        const result1 = store.getState().tryMarkPreSearchTriggered(1);
        const result2 = store.getState().tryMarkPreSearchTriggered(2);
        const result1Again = store.getState().tryMarkPreSearchTriggered(1);

        // ASSERT
        expect(result1).toBe(true);
        expect(result2).toBe(true);
        expect(result1Again).toBe(false);
      });
    });

    describe('clearPreSearchTracking', () => {
      it('should clear triggered state for specific round', () => {
        // ARRANGE
        store.getState().markPreSearchTriggered(1);
        store.getState().markPreSearchTriggered(2);

        // ACT
        store.getState().clearPreSearchTracking(1);

        // ASSERT
        expect(store.getState().hasPreSearchBeenTriggered(1)).toBe(false);
        expect(store.getState().hasPreSearchBeenTriggered(2)).toBe(true);
      });

      it('should also clear activity time for that round', () => {
        // ARRANGE
        store.getState().markPreSearchTriggered(1);
        store.getState().updatePreSearchActivity(1);

        // ACT
        store.getState().clearPreSearchTracking(1);

        // ASSERT
        expect(store.getState().hasPreSearchBeenTriggered(1)).toBe(false);
        // Activity time should also be cleared
        const activityTime = store.getState().preSearchActivityTimes.get(1);
        expect(activityTime).toBeUndefined();
      });

      it('should not affect other rounds', () => {
        // ARRANGE
        store.getState().markPreSearchTriggered(1);
        store.getState().markPreSearchTriggered(2);
        store.getState().updatePreSearchActivity(1);
        store.getState().updatePreSearchActivity(2);

        // ACT
        store.getState().clearPreSearchTracking(1);

        // ASSERT
        expect(store.getState().hasPreSearchBeenTriggered(2)).toBe(true);
        expect(store.getState().preSearchActivityTimes.has(2)).toBe(true);
      });
    });

    describe('clearAllPreSearchTracking', () => {
      it('should clear all triggered rounds', () => {
        // ARRANGE
        store.getState().markPreSearchTriggered(1);
        store.getState().markPreSearchTriggered(2);
        store.getState().markPreSearchTriggered(3);

        // ACT
        store.getState().clearAllPreSearchTracking();

        // ASSERT
        expect(store.getState().hasPreSearchBeenTriggered(1)).toBe(false);
        expect(store.getState().hasPreSearchBeenTriggered(2)).toBe(false);
        expect(store.getState().hasPreSearchBeenTriggered(3)).toBe(false);
      });

      it('should clear all activity times', () => {
        // ARRANGE
        store.getState().updatePreSearchActivity(1);
        store.getState().updatePreSearchActivity(2);

        // ACT
        store.getState().clearAllPreSearchTracking();

        // ASSERT
        expect(store.getState().preSearchActivityTimes.size).toBe(0);
      });
    });
  });

  // ============================================================================
  // 3. PRE-SEARCH ACTIVITY TRACKING
  // ============================================================================

  describe('3. Pre-search activity tracking', () => {
    describe('updatePreSearchActivity', () => {
      it('should update timestamp for round', () => {
        // ARRANGE
        const beforeTime = Date.now();

        // ACT
        store.getState().updatePreSearchActivity(1);

        // ASSERT
        const activityTime = store.getState().preSearchActivityTimes.get(1);
        expect(activityTime).toBeDefined();
        expect(activityTime).toBeGreaterThanOrEqual(beforeTime);
      });

      it('should update timestamp on subsequent calls', async () => {
        // ARRANGE
        store.getState().updatePreSearchActivity(1);
        const firstTime = store.getState().preSearchActivityTimes.get(1);

        // Small delay to ensure different timestamp
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 10);
        });

        // ACT
        store.getState().updatePreSearchActivity(1);

        // ASSERT
        const secondTime = store.getState().preSearchActivityTimes.get(1);
        expect(secondTime).toBeGreaterThanOrEqual(firstTime ?? 0);
      });

      it('should track multiple rounds independently', () => {
        // ACT
        store.getState().updatePreSearchActivity(1);
        store.getState().updatePreSearchActivity(2);

        // ASSERT
        expect(store.getState().preSearchActivityTimes.has(1)).toBe(true);
        expect(store.getState().preSearchActivityTimes.has(2)).toBe(true);
        expect(store.getState().preSearchActivityTimes.has(3)).toBe(false);
      });
    });

    describe('clearPreSearchActivity', () => {
      it('should remove timestamp for specific round', () => {
        // ARRANGE
        store.getState().updatePreSearchActivity(1);
        store.getState().updatePreSearchActivity(2);

        // ACT
        store.getState().clearPreSearchActivity(1);

        // ASSERT
        expect(store.getState().preSearchActivityTimes.has(1)).toBe(false);
        expect(store.getState().preSearchActivityTimes.has(2)).toBe(true);
      });

      it('should not throw when clearing non-existent round', () => {
        // ACT & ASSERT
        expect(() => {
          store.getState().clearPreSearchActivity(999);
        }).not.toThrow();
      });
    });

    describe('preSearchActivityTimes Map behavior', () => {
      it('should start as empty Map', () => {
        // ASSERT
        expect(store.getState().preSearchActivityTimes.size).toBe(0);
      });

      it('should preserve existing entries when adding new ones', () => {
        // ARRANGE
        store.getState().updatePreSearchActivity(1);
        const time1 = store.getState().preSearchActivityTimes.get(1);

        // ACT
        store.getState().updatePreSearchActivity(2);

        // ASSERT
        expect(store.getState().preSearchActivityTimes.get(1)).toBe(time1);
        expect(store.getState().preSearchActivityTimes.has(2)).toBe(true);
      });
    });
  });

  // ============================================================================
  // 4. PRE-SEARCH COMPLETION (Frame 11)
  // ============================================================================

  describe('4. Pre-search completion (Frame 11)', () => {
    describe('updatePreSearchData', () => {
      it('should set status to complete', () => {
        // ARRANGE
        store.getState().addPreSearch(createMockStoredPreSearch(1, 'streaming'));

        // ACT
        store.getState().updatePreSearchData(1, { results: ['result1'] });

        // ASSERT
        const preSearch = store.getState().preSearches[0];
        expect(preSearch?.status).toBe('complete');
      });

      it('should set completedAt timestamp', () => {
        // ARRANGE
        store.getState().addPreSearch(createMockStoredPreSearch(1, 'streaming', {
          completedAt: null,
        }));
        const beforeTime = new Date().toISOString();

        // ACT
        store.getState().updatePreSearchData(1, { results: [] });

        // ASSERT
        const preSearch = store.getState().preSearches[0];
        expect(preSearch?.completedAt).toBeDefined();
        expect(preSearch?.completedAt ? new Date(preSearch.completedAt).getTime() : 0).toBeGreaterThanOrEqual(new Date(beforeTime).getTime() - 1000);
      });

      it('should store searchData', () => {
        // ARRANGE
        store.getState().addPreSearch(createMockStoredPreSearch(1, 'streaming'));
        const searchData = {
          failureCount: 0,
          queries: ['test query'],
          results: [{ title: 'Result 1', url: 'https://example.com' }],
          successCount: 1,
          summary: 'Test summary',
          totalResults: 1,
          totalTime: 500,
        };

        // ACT
        store.getState().updatePreSearchData(1, searchData);

        // ASSERT
        const preSearch = store.getState().preSearches[0];
        expect(preSearch?.searchData).toEqual(searchData);
      });

      it('should update correct round when multiple exist', () => {
        // ARRANGE
        store.getState().addPreSearch(createMockStoredPreSearch(1, 'complete'));
        store.getState().addPreSearch(createMockStoredPreSearch(2, 'streaming'));
        const newData = { results: ['new results'] };

        // ACT
        store.getState().updatePreSearchData(2, newData);

        // ASSERT
        expect(store.getState().preSearches[0]?.roundNumber).toBe(1);
        expect(store.getState().preSearches[1]?.status).toBe('complete');
        expect(store.getState().preSearches[1]?.searchData).toEqual(newData);
      });

      it('should not fail when updating non-existent round', () => {
        // ACT & ASSERT
        expect(() => {
          store.getState().updatePreSearchData(999, { results: [] });
        }).not.toThrow();
      });
    });

    describe('updatePartialPreSearchData', () => {
      it('should update searchData without changing status', () => {
        // ARRANGE
        store.getState().addPreSearch(createMockStoredPreSearch(1, 'streaming'));

        // ACT
        store.getState().updatePartialPreSearchData(1, { partialResults: ['partial'] });

        // ASSERT
        const preSearch = store.getState().preSearches[0];
        expect(preSearch?.status).toBe('streaming'); // Status unchanged
        expect(preSearch?.searchData).toEqual({ partialResults: ['partial'] });
      });

      it('should allow incremental updates during streaming', () => {
        // ARRANGE
        store.getState().addPreSearch(createMockStoredPreSearch(1, 'streaming'));

        // ACT
        store.getState().updatePartialPreSearchData(1, { partial: 'data1', step: 1 });
        store.getState().updatePartialPreSearchData(1, { partial: 'data2', step: 2 });

        // ASSERT
        const preSearch = store.getState().preSearches[0];
        expect(preSearch?.searchData).toEqual({ partial: 'data2', step: 2 });
      });
    });

    describe('pre-search complete unblocks participants', () => {
      it('should allow participants to start after pre-search complete', () => {
        // ARRANGE: Pre-search was blocking
        store.getState().addPreSearch(createMockStoredPreSearch(1, 'pending'));

        // Verify initially blocked
        let preSearch = store.getState().preSearches[0];
        let shouldBlock = preSearch?.status === 'pending' || preSearch?.status === 'streaming';
        expect(shouldBlock).toBe(true);

        // ACT: Complete pre-search
        store.getState().updatePreSearchData(1, { results: [] });

        // ASSERT: No longer blocked
        preSearch = store.getState().preSearches[0];
        shouldBlock = preSearch?.status === 'pending' || preSearch?.status === 'streaming';
        expect(shouldBlock).toBe(false);
        expect(preSearch?.status).toBe('complete');
      });
    });
  });

  // ============================================================================
  // 5. THREAD NAVIGATION CLEARS PRE-SEARCH STATE
  // ============================================================================

  describe('5. Thread navigation clears pre-search state', () => {
    describe('resetForThreadNavigation', () => {
      it('should clear preSearches array', () => {
        // ARRANGE
        store.getState().addPreSearch(createMockStoredPreSearch(1, 'complete'));
        store.getState().addPreSearch(createMockStoredPreSearch(2, 'streaming'));

        // ACT
        store.getState().resetForThreadNavigation();

        // ASSERT
        expect(store.getState().preSearches).toHaveLength(0);
      });

      it('should clear triggeredPreSearchRounds', () => {
        // ARRANGE
        store.getState().markPreSearchTriggered(1);
        store.getState().markPreSearchTriggered(2);
        store.getState().markPreSearchTriggered(3);

        // ACT
        store.getState().resetForThreadNavigation();

        // ASSERT
        expect(store.getState().hasPreSearchBeenTriggered(1)).toBe(false);
        expect(store.getState().hasPreSearchBeenTriggered(2)).toBe(false);
        expect(store.getState().hasPreSearchBeenTriggered(3)).toBe(false);
      });

      it('should clear preSearchActivityTimes', () => {
        // ARRANGE
        store.getState().updatePreSearchActivity(1);
        store.getState().updatePreSearchActivity(2);

        // ACT
        store.getState().resetForThreadNavigation();

        // ASSERT
        expect(store.getState().preSearchActivityTimes.size).toBe(0);
      });

      it('should clear all pre-search state atomically', () => {
        // ARRANGE: Set up complete pre-search state
        store.getState().addPreSearch(createMockStoredPreSearch(1, 'complete'));
        store.getState().markPreSearchTriggered(1);
        store.getState().updatePreSearchActivity(1);

        // ACT
        store.getState().resetForThreadNavigation();

        // ASSERT: All cleared
        expect(store.getState().preSearches).toHaveLength(0);
        expect(store.getState().hasPreSearchBeenTriggered(1)).toBe(false);
        expect(store.getState().preSearchActivityTimes.size).toBe(0);
      });
    });

    describe('resetToOverview', () => {
      it('should clear all pre-search related state', () => {
        // ARRANGE
        store.getState().addPreSearch(createMockStoredPreSearch(1, 'complete'));
        store.getState().markPreSearchTriggered(1);
        store.getState().updatePreSearchActivity(1);

        // ACT
        store.getState().resetToOverview();

        // ASSERT
        expect(store.getState().preSearches).toHaveLength(0);
        expect(store.getState().hasPreSearchBeenTriggered(1)).toBe(false);
        expect(store.getState().preSearchActivityTimes.size).toBe(0);
      });
    });

    describe('resetToNewChat', () => {
      it('should clear all pre-search related state', () => {
        // ARRANGE
        store.getState().addPreSearch(createMockStoredPreSearch(1, 'complete'));
        store.getState().markPreSearchTriggered(1);
        store.getState().updatePreSearchActivity(1);

        // ACT
        store.getState().resetToNewChat();

        // ASSERT
        expect(store.getState().preSearches).toHaveLength(0);
        expect(store.getState().hasPreSearchBeenTriggered(1)).toBe(false);
        expect(store.getState().preSearchActivityTimes.size).toBe(0);
      });
    });

    describe('clearAllPreSearches', () => {
      it('should clear only preSearches array', () => {
        // ARRANGE
        store.getState().addPreSearch(createMockStoredPreSearch(1, 'complete'));
        store.getState().markPreSearchTriggered(1);
        store.getState().updatePreSearchActivity(1);

        // ACT
        store.getState().clearAllPreSearches();

        // ASSERT: Only preSearches cleared, tracking state preserved
        expect(store.getState().preSearches).toHaveLength(0);
        expect(store.getState().hasPreSearchBeenTriggered(1)).toBe(true);
        expect(store.getState().preSearchActivityTimes.has(1)).toBe(true);
      });
    });
  });

  // ============================================================================
  // 6. DEDUPLICATION (Round 2+ scenarios)
  // ============================================================================

  describe('6. Deduplication for round 2+ scenarios', () => {
    describe('same round should not trigger pre-search twice', () => {
      it('tryMarkPreSearchTriggered prevents duplicate triggers', () => {
        // ARRANGE: Round 2 scenario
        const roundNumber = 2;

        // ACT: Multiple components try to trigger pre-search
        const trigger1 = store.getState().tryMarkPreSearchTriggered(roundNumber);
        const trigger2 = store.getState().tryMarkPreSearchTriggered(roundNumber);
        const trigger3 = store.getState().tryMarkPreSearchTriggered(roundNumber);

        // ASSERT: Only first trigger succeeds
        expect(trigger1).toBe(true);
        expect(trigger2).toBe(false);
        expect(trigger3).toBe(false);
      });

      it('hasPreSearchBeenTriggered allows checking without triggering', () => {
        // ACT: Check before triggering
        const beforeCheck = store.getState().hasPreSearchBeenTriggered(2);

        // Now trigger
        store.getState().markPreSearchTriggered(2);

        // Check after
        const afterCheck = store.getState().hasPreSearchBeenTriggered(2);

        // ASSERT
        expect(beforeCheck).toBe(false);
        expect(afterCheck).toBe(true);
      });

      it('multiple calls to markPreSearchTriggered are idempotent', () => {
        // ACT
        store.getState().markPreSearchTriggered(2);
        store.getState().markPreSearchTriggered(2);
        store.getState().markPreSearchTriggered(2);

        // ASSERT: Still properly marked, no side effects
        expect(store.getState().hasPreSearchBeenTriggered(2)).toBe(true);
      });
    });

    describe('round isolation', () => {
      it('round 2 trigger should not affect round 3', () => {
        // ACT
        store.getState().tryMarkPreSearchTriggered(2);

        // ASSERT
        expect(store.getState().hasPreSearchBeenTriggered(2)).toBe(true);
        expect(store.getState().hasPreSearchBeenTriggered(3)).toBe(false);
        expect(store.getState().tryMarkPreSearchTriggered(3)).toBe(true);
      });

      it('clearing round 2 should not affect round 3', () => {
        // ARRANGE
        store.getState().markPreSearchTriggered(2);
        store.getState().markPreSearchTriggered(3);

        // ACT
        store.getState().clearPreSearchTracking(2);

        // ASSERT
        expect(store.getState().hasPreSearchBeenTriggered(2)).toBe(false);
        expect(store.getState().hasPreSearchBeenTriggered(3)).toBe(true);
      });
    });

    describe('deduplication across component lifecycles', () => {
      it('should maintain deduplication state across rapid component updates', () => {
        // This simulates the scenario where components mount/unmount rapidly
        // but the tracking state should remain consistent

        const roundNumber = 2;

        // First component checks and triggers
        const firstComponentTrigger = store.getState().tryMarkPreSearchTriggered(roundNumber);

        // Simulate component unmount/remount - state persists in store
        // Second component checks
        const secondComponentCheck = store.getState().hasPreSearchBeenTriggered(roundNumber);
        const secondComponentTrigger = store.getState().tryMarkPreSearchTriggered(roundNumber);

        // ASSERT
        expect(firstComponentTrigger).toBe(true);
        expect(secondComponentCheck).toBe(true);
        expect(secondComponentTrigger).toBe(false);
      });
    });

    describe('pre-search deduplication with pre-search array', () => {
      it('addPreSearch deduplicates by thread + round', () => {
        // ARRANGE
        const preSearch1: StoredPreSearch = {
          ...createMockStoredPreSearch(2, 'pending'),
          id: 'ps-first',
          threadId: 'thread-123',
        };
        const preSearch2: StoredPreSearch = {
          ...createMockStoredPreSearch(2, 'streaming'),
          id: 'ps-duplicate',
          threadId: 'thread-123',
        };

        // ACT
        store.getState().addPreSearch(preSearch1);
        store.getState().addPreSearch(preSearch2);

        // ASSERT: Only first is kept
        expect(store.getState().preSearches).toHaveLength(1);
        expect(store.getState().preSearches[0]?.id).toBe('ps-first');
      });

      it('allows same round for different threads', () => {
        // ARRANGE
        const preSearch1: StoredPreSearch = {
          ...createMockStoredPreSearch(2, 'pending'),
          threadId: 'thread-123',
        };
        const preSearch2: StoredPreSearch = {
          ...createMockStoredPreSearch(2, 'pending'),
          threadId: 'thread-456',
        };

        // ACT
        store.getState().addPreSearch(preSearch1);
        store.getState().addPreSearch(preSearch2);

        // ASSERT: Both added (different threads)
        expect(store.getState().preSearches).toHaveLength(2);
      });
    });
  });

  // ============================================================================
  // 7. INTEGRATION SCENARIOS
  // ============================================================================

  describe('7. Integration scenarios', () => {
    describe('complete round 2 pre-search flow', () => {
      it('should handle full lifecycle: trigger -> add -> stream -> complete', () => {
        const roundNumber = 2;
        const threadId = 'thread-123';

        // STEP 1: Check if can trigger
        expect(store.getState().hasPreSearchBeenTriggered(roundNumber)).toBe(false);

        // STEP 2: Atomically mark as triggered
        const canTrigger = store.getState().tryMarkPreSearchTriggered(roundNumber);
        expect(canTrigger).toBe(true);

        // STEP 3: Add pre-search placeholder
        store.getState().addPreSearch({
          completedAt: null,
          createdAt: new Date(),
          errorMessage: null,
          id: `ps-r${roundNumber}`,
          roundNumber,
          searchData: null,
          status: 'pending',
          threadId,
          userQuery: 'test query',
        } as StoredPreSearch);

        // STEP 4: Verify blocking
        let preSearch = store.getState().preSearches.find(ps => ps.roundNumber === roundNumber);
        expect(preSearch?.status).toBe('pending');

        // STEP 5: Start streaming
        store.getState().updatePreSearchStatus(roundNumber, 'streaming');
        store.getState().updatePreSearchActivity(roundNumber);
        preSearch = store.getState().preSearches.find(ps => ps.roundNumber === roundNumber);
        expect(preSearch?.status).toBe('streaming');

        // STEP 6: Update partial data
        store.getState().updatePartialPreSearchData(roundNumber, { partial: true });
        preSearch = store.getState().preSearches.find(ps => ps.roundNumber === roundNumber);
        expect(preSearch?.searchData).toEqual({ partial: true });
        expect(preSearch?.status).toBe('streaming');

        // STEP 7: Complete
        store.getState().updatePreSearchData(roundNumber, {
          results: ['final result'],
          summary: 'Complete',
        });

        // VERIFY final state
        preSearch = store.getState().preSearches.find(ps => ps.roundNumber === roundNumber);
        expect(preSearch?.status).toBe('complete');
        expect(preSearch?.completedAt).toBeDefined();
        expect(preSearch?.searchData).toEqual({
          results: ['final result'],
          summary: 'Complete',
        });

        // VERIFY deduplication still works
        expect(store.getState().tryMarkPreSearchTriggered(roundNumber)).toBe(false);
      });
    });

    describe('error recovery scenario', () => {
      it('should allow retry after clearing tracking for failed round', () => {
        const roundNumber = 2;

        // First attempt
        store.getState().tryMarkPreSearchTriggered(roundNumber);
        store.getState().addPreSearch(createMockStoredPreSearch(roundNumber, 'pending', {
          threadId: 'thread-123',
        }));
        store.getState().updatePreSearchStatus(roundNumber, 'failed');

        // Verify deduplication blocks retry
        expect(store.getState().tryMarkPreSearchTriggered(roundNumber)).toBe(false);

        // Clear tracking for retry
        store.getState().clearPreSearchTracking(roundNumber);

        // Now can retry
        expect(store.getState().tryMarkPreSearchTriggered(roundNumber)).toBe(true);
      });
    });
  });
});
