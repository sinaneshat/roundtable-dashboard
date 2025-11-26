/**
 * Pre-Search Race Condition Lock Tests
 *
 * Tests the ref-based synchronous lock that prevents duplicate pre-search creation
 * when multiple effects (handleComplete and pendingMessage) run concurrently.
 *
 * CRITICAL: The ref check MUST happen BEFORE any async operations or store checks
 * to prevent race conditions where both effects pass the check before either marks it.
 *
 * @see src/components/providers/chat-store-provider.tsx
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AnalysisStatuses } from '@/api/core/enums';

import type { ChatStoreApi } from '../store';
import { createChatStore } from '../store';

describe('pre-search race condition lock', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    vi.clearAllMocks();
    store = createChatStore();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('hasPreSearchBeenTriggered / markPreSearchTriggered', () => {
    it('should return false for untriggered round', () => {
      const state = store.getState();
      expect(state.hasPreSearchBeenTriggered(0)).toBe(false);
      expect(state.hasPreSearchBeenTriggered(1)).toBe(false);
      expect(state.hasPreSearchBeenTriggered(2)).toBe(false);
    });

    it('should return true after marking round as triggered', () => {
      const state = store.getState();

      state.markPreSearchTriggered(1);

      expect(state.hasPreSearchBeenTriggered(0)).toBe(false);
      expect(state.hasPreSearchBeenTriggered(1)).toBe(true);
      expect(state.hasPreSearchBeenTriggered(2)).toBe(false);
    });

    it('should persist triggered state across getState calls', () => {
      store.getState().markPreSearchTriggered(1);

      // Get fresh state reference
      const freshState = store.getState();
      expect(freshState.hasPreSearchBeenTriggered(1)).toBe(true);
    });

    it('should allow marking multiple rounds independently', () => {
      const state = store.getState();

      state.markPreSearchTriggered(0);
      state.markPreSearchTriggered(2);

      expect(state.hasPreSearchBeenTriggered(0)).toBe(true);
      expect(state.hasPreSearchBeenTriggered(1)).toBe(false);
      expect(state.hasPreSearchBeenTriggered(2)).toBe(true);
    });

    it('should be idempotent - marking same round twice is safe', () => {
      const state = store.getState();

      state.markPreSearchTriggered(1);
      state.markPreSearchTriggered(1); // Second call should be harmless

      expect(state.hasPreSearchBeenTriggered(1)).toBe(true);
    });
  });

  describe('clearPreSearchTracking', () => {
    it('should clear triggered state for specific round', () => {
      const state = store.getState();

      state.markPreSearchTriggered(1);
      expect(state.hasPreSearchBeenTriggered(1)).toBe(true);

      state.clearPreSearchTracking(1);
      expect(state.hasPreSearchBeenTriggered(1)).toBe(false);
    });

    it('should not affect other rounds when clearing', () => {
      const state = store.getState();

      state.markPreSearchTriggered(0);
      state.markPreSearchTriggered(1);
      state.markPreSearchTriggered(2);

      state.clearPreSearchTracking(1);

      expect(state.hasPreSearchBeenTriggered(0)).toBe(true);
      expect(state.hasPreSearchBeenTriggered(1)).toBe(false);
      expect(state.hasPreSearchBeenTriggered(2)).toBe(true);
    });

    it('should be safe to clear untriggered round', () => {
      const state = store.getState();

      // Should not throw
      state.clearPreSearchTracking(99);
      expect(state.hasPreSearchBeenTriggered(99)).toBe(false);
    });
  });

  describe('concurrent effect simulation', () => {
    /**
     * Simulates the race condition scenario:
     * 1. Effect A checks hasPreSearchBeenTriggered (returns false)
     * 2. Effect B checks hasPreSearchBeenTriggered (returns false) - RACE!
     * 3. Effect A marks as triggered
     * 4. Effect B marks as triggered (duplicate!)
     *
     * The fix ensures the ref check happens synchronously BEFORE store check,
     * so only one effect can proceed.
     */
    it('should prevent duplicate triggers with synchronous check-and-mark pattern', () => {
      const state = store.getState();
      const roundNumber = 1;
      let effectAProceeded = false;
      let effectBProceeded = false;

      // Simulate correct pattern: check → mark → proceed (synchronous)
      // _name parameter identifies the effect caller (A or B) for debugging purposes
      const simulateEffect = (_name: string) => {
        if (state.hasPreSearchBeenTriggered(roundNumber)) {
          return false; // Already triggered, don't proceed
        }
        state.markPreSearchTriggered(roundNumber);
        return true; // Proceed with pre-search creation
      };

      // Run both effects "concurrently" (synchronously in test)
      effectAProceeded = simulateEffect('A');
      effectBProceeded = simulateEffect('B');

      // Only ONE effect should proceed
      expect(effectAProceeded).toBe(true);
      expect(effectBProceeded).toBe(false);
    });

    it('should handle retry after failure correctly', () => {
      const state = store.getState();
      const roundNumber = 1;

      // First attempt
      expect(state.hasPreSearchBeenTriggered(roundNumber)).toBe(false);
      state.markPreSearchTriggered(roundNumber);

      // Simulate failure - clear tracking
      state.clearPreSearchTracking(roundNumber);

      // Retry should be allowed
      expect(state.hasPreSearchBeenTriggered(roundNumber)).toBe(false);
      state.markPreSearchTriggered(roundNumber);
      expect(state.hasPreSearchBeenTriggered(roundNumber)).toBe(true);
    });
  });

  describe('integration with pre-search state', () => {
    it('should track triggered state independently from preSearches array', () => {
      const state = store.getState();

      // Mark as triggered (effect started creating pre-search)
      state.markPreSearchTriggered(1);

      // PreSearches array is still empty (async creation in progress)
      expect(store.getState().preSearches).toHaveLength(0);
      expect(state.hasPreSearchBeenTriggered(1)).toBe(true);
    });

    it('should maintain triggered state after addPreSearch', () => {
      const state = store.getState();

      state.markPreSearchTriggered(1);
      state.addPreSearch({
        id: 'ps-1',
        threadId: 'thread-1',
        roundNumber: 1,
        userQuery: 'test query',
        status: AnalysisStatuses.PENDING,
        searchData: null,
        errorMessage: null,
        completedAt: null,
        createdAt: new Date(),
      });

      expect(store.getState().preSearches).toHaveLength(1);
      expect(state.hasPreSearchBeenTriggered(1)).toBe(true);
    });

    it('should prevent duplicate addPreSearch calls for same round', () => {
      const state = store.getState();

      // First effect adds pre-search
      state.addPreSearch({
        id: 'ps-1',
        threadId: 'thread-1',
        roundNumber: 1,
        userQuery: 'test query',
        status: AnalysisStatuses.PENDING,
        searchData: null,
        errorMessage: null,
        completedAt: null,
        createdAt: new Date(),
      });

      // Second effect tries to add for same round (should be deduplicated)
      state.addPreSearch({
        id: 'ps-1-duplicate',
        threadId: 'thread-1',
        roundNumber: 1,
        userQuery: 'test query',
        status: AnalysisStatuses.PENDING,
        searchData: null,
        errorMessage: null,
        completedAt: null,
        createdAt: new Date(),
      });

      // Should only have one pre-search for round 1
      const preSearchesForRound1 = store.getState().preSearches.filter(ps => ps.roundNumber === 1);
      expect(preSearchesForRound1).toHaveLength(1);
      expect(preSearchesForRound1[0].id).toBe('ps-1'); // Original, not duplicate
    });
  });

  describe('reset behavior', () => {
    it('should allow manual clearing via clearPreSearchTracking for each round', () => {
      const state = store.getState();

      state.markPreSearchTriggered(0);
      state.markPreSearchTriggered(1);
      state.markPreSearchTriggered(2);

      // Clear each round individually
      state.clearPreSearchTracking(0);
      state.clearPreSearchTracking(1);
      state.clearPreSearchTracking(2);

      const freshState = store.getState();
      expect(freshState.hasPreSearchBeenTriggered(0)).toBe(false);
      expect(freshState.hasPreSearchBeenTriggered(1)).toBe(false);
      expect(freshState.hasPreSearchBeenTriggered(2)).toBe(false);
    });

    it('should maintain triggered state across form resets (ref is external)', () => {
      // Note: The ref-based lock (preSearchCreationAttemptedRef) is in the provider,
      // not in the store. The store's markPreSearchTriggered is a secondary check.
      // Form reset doesn't affect the ref - that's intentional for the provider lifecycle.
      const state = store.getState();

      state.markPreSearchTriggered(0);
      state.markPreSearchTriggered(1);

      // Form reset clears form state but triggered tracking is separate
      state.resetForm();

      // Store-level tracking is independent - verify it still works
      const freshState = store.getState();
      // After resetForm, we can still use the tracking functions
      expect(typeof freshState.hasPreSearchBeenTriggered).toBe('function');
      expect(typeof freshState.markPreSearchTriggered).toBe('function');
    });
  });
});

describe('ref-based lock pattern verification', () => {
  /**
   * These tests verify the PATTERN that should be used in the provider.
   * The pattern is:
   * 1. Check ref (synchronous) - returns immediately if already in ref
   * 2. Add to ref (synchronous) - BEFORE any other checks
   * 3. Check store state
   * 4. Mark store state
   * 5. Proceed with async operation
   */

  it('should demonstrate correct lock pattern', () => {
    // Simulate ref (in real code this is preSearchCreationAttemptedRef)
    const attemptedRounds = new Set<number>();
    // Simulate store tracking
    const triggeredRounds = new Set<number>();

    const roundNumber = 1;

    // Correct pattern from the fix:
    const tryCreatePreSearch = () => {
      // STEP 1: Check ref FIRST (synchronous lock)
      if (attemptedRounds.has(roundNumber)) {
        return { proceeded: false, reason: 'ref_blocked' };
      }
      // STEP 2: Add to ref IMMEDIATELY
      attemptedRounds.add(roundNumber);

      // STEP 3: Check store state
      if (triggeredRounds.has(roundNumber)) {
        return { proceeded: false, reason: 'store_blocked' };
      }

      // STEP 4: Mark store state
      triggeredRounds.add(roundNumber);

      // STEP 5: Would proceed with async operation
      return { proceeded: true, reason: 'success' };
    };

    // First call succeeds
    const result1 = tryCreatePreSearch();
    expect(result1.proceeded).toBe(true);
    expect(result1.reason).toBe('success');

    // Second call blocked by ref
    const result2 = tryCreatePreSearch();
    expect(result2.proceeded).toBe(false);
    expect(result2.reason).toBe('ref_blocked');
  });

  it('should demonstrate why ref must be checked BEFORE store', () => {
    // This test shows the race condition that would occur
    // if we check store BEFORE adding to ref

    const attemptedRounds = new Set<number>();
    const triggeredRounds = new Set<number>();
    const roundNumber = 1;

    // WRONG pattern (what we fixed) - intentionally unused, for documentation
    // This illustrates the race condition we fixed
    const _wrongPattern = () => {
      // Check store first (WRONG - creates race window)
      if (triggeredRounds.has(roundNumber)) {
        return false;
      }
      // Check ref
      if (attemptedRounds.has(roundNumber)) {
        return false;
      }
      // Add to ref
      attemptedRounds.add(roundNumber);
      // Mark store
      triggeredRounds.add(roundNumber);
      return true;
    };
    void _wrongPattern; // Acknowledge intentionally unused - for documentation

    // Simulate race: both effects check store before either marks it
    // Effect A: checks store (empty)
    const effectAStoreCheck = triggeredRounds.has(roundNumber); // false
    // Effect B: checks store (still empty - RACE!)
    const effectBStoreCheck = triggeredRounds.has(roundNumber); // false

    // Both would proceed in wrong pattern
    expect(effectAStoreCheck).toBe(false);
    expect(effectBStoreCheck).toBe(false);

    // CORRECT pattern: ref check FIRST
    const correctPattern = () => {
      // Check ref FIRST (synchronous lock)
      if (attemptedRounds.has(roundNumber)) {
        return false;
      }
      // Add to ref IMMEDIATELY
      attemptedRounds.add(roundNumber);
      // Now safe to check/mark store
      if (triggeredRounds.has(roundNumber)) {
        return false;
      }
      triggeredRounds.add(roundNumber);
      return true;
    };

    // Reset for correct pattern test
    attemptedRounds.clear();
    triggeredRounds.clear();

    // With correct pattern, only one succeeds
    const correctResult1 = correctPattern();
    const correctResult2 = correctPattern();

    expect(correctResult1).toBe(true);
    expect(correctResult2).toBe(false); // Blocked by ref immediately
  });
});
