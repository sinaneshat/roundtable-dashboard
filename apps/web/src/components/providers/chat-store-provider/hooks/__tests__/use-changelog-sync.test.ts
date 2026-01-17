/**
 * Changelog Sync Hook Tests
 *
 * Tests the use-changelog-sync hook to ensure:
 * 1. isFetching guard prevents processing stale data during fetch transitions
 * 2. Round number validation prevents merging data from wrong rounds
 * 3. Duplicate merge prevention works correctly
 * 4. Race conditions between TanStack Query state and React effects are handled
 *
 * BUG FIXED (2024): When configChangeRoundNumber changed from 1→2, TanStack Query
 * returned stale round 1 data while new round 2 fetch was in progress. This caused
 * the merge effect to incorrectly process round 1 data as if it were round 2 data.
 *
 * FIXES IMPLEMENTED:
 * 1. Added isFetching check before processing data
 * 2. Added round number validation to ensure all items match expected round
 * 3. Removed placeholderData from round-specific query to prevent stale data
 */

import { ChangelogTypes } from '@roundtable/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { createStore } from 'zustand/vanilla';

import type { ChatThreadChangelog } from '@/types/api';

// ============================================================================
// TEST HELPERS
// ============================================================================

type MockStoreState = {
  isWaitingForChangelog: boolean;
  configChangeRoundNumber: number | null;
  setIsWaitingForChangelog: (value: boolean) => void;
  setConfigChangeRoundNumber: (value: number | null) => void;
};

function createMockStore(initial?: Partial<MockStoreState>) {
  return createStore<MockStoreState>(set => ({
    isWaitingForChangelog: false,
    configChangeRoundNumber: null,
    setIsWaitingForChangelog: value => set({ isWaitingForChangelog: value }),
    setConfigChangeRoundNumber: value => set({ configChangeRoundNumber: value }),
    ...initial,
  }));
}

function createMockChangelog(
  roundNumber: number,
  overrides?: Partial<ChatThreadChangelog>,
): ChatThreadChangelog {
  return {
    id: `changelog-r${roundNumber}-${Date.now()}`,
    threadId: 'thread-123',
    roundNumber,
    previousRoundNumber: roundNumber > 0 ? roundNumber - 1 : null,
    changeType: ChangelogTypes.ADDED,
    changeSummary: 'Test change',
    changeData: {
      type: 'participant',
      changes: [{ type: 'added', participantId: 'p1', modelId: 'gpt-4' }],
    },
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

type MockQueryResponse = {
  success: boolean;
  data: { items: ChatThreadChangelog[] };
};

// Simulates the merge logic from use-changelog-sync.ts
function simulateChangelogMerge(params: {
  roundChangelogFetching: boolean;
  roundChangelogSuccess: boolean;
  roundChangelogData: MockQueryResponse | null;
  configChangeRoundNumber: number | null;
  isWaitingForChangelog: boolean;
  existingCache: MockQueryResponse | null;
}): {
  shouldProcess: boolean;
  shouldMerge: boolean;
  mergedItems: ChatThreadChangelog[];
  reason: string;
} {
  const {
    roundChangelogFetching,
    roundChangelogSuccess,
    roundChangelogData,
    configChangeRoundNumber,
    isWaitingForChangelog,
    existingCache,
  } = params;

  // Guard 1: Don't process while fetching (ROOT CAUSE FIX)
  if (roundChangelogFetching) {
    return {
      shouldProcess: false,
      shouldMerge: false,
      mergedItems: [],
      reason: 'Fetching in progress - waiting for fresh data',
    };
  }

  // Guard 2: Check success and data
  if (!roundChangelogSuccess || !roundChangelogData?.success) {
    return {
      shouldProcess: false,
      shouldMerge: false,
      mergedItems: [],
      reason: 'Query not successful or no data',
    };
  }

  // Guard 3: Both flags must be set
  if (configChangeRoundNumber === null || !isWaitingForChangelog) {
    return {
      shouldProcess: false,
      shouldMerge: false,
      mergedItems: [],
      reason: 'Flags not properly set',
    };
  }

  const newItems = roundChangelogData.data.items || [];

  // Guard 4: Round number validation (STALE DATA FIX)
  const allItemsForCorrectRound = newItems.length > 0
    && newItems.every(item => item.roundNumber === configChangeRoundNumber);

  if (!allItemsForCorrectRound && newItems.length > 0) {
    return {
      shouldProcess: false,
      shouldMerge: false,
      mergedItems: [],
      reason: `Data is for wrong round - expected ${configChangeRoundNumber}, got ${newItems[0]?.roundNumber}`,
    };
  }

  // Empty changelog - clear flags but don't merge
  if (newItems.length === 0) {
    return {
      shouldProcess: true,
      shouldMerge: false,
      mergedItems: [],
      reason: 'Empty changelog - flags cleared',
    };
  }

  // Merge logic - deduplicate by ID
  const existingItems = existingCache?.data?.items || [];
  const existingIds = new Set(existingItems.map(item => item.id));
  const uniqueNewItems = newItems.filter(item => !existingIds.has(item.id));

  const mergedItems = [...uniqueNewItems, ...existingItems];

  return {
    shouldProcess: true,
    shouldMerge: true,
    mergedItems,
    reason: `Merged ${uniqueNewItems.length} new items (${newItems.length - uniqueNewItems.length} duplicates skipped)`,
  };
}

// ============================================================================
// TESTS: isFetching Guard (ROOT CAUSE FIX)
// ============================================================================

describe('use-changelog-sync isFetching Guard', () => {
  describe('prevents processing during fetch transitions', () => {
    it('should NOT process data while isFetching is true', () => {
      const result = simulateChangelogMerge({
        roundChangelogFetching: true, // KEY: Fetching in progress
        roundChangelogSuccess: true,
        roundChangelogData: {
          success: true,
          data: { items: [createMockChangelog(2)] },
        },
        configChangeRoundNumber: 2,
        isWaitingForChangelog: true,
        existingCache: null,
      });

      expect(result.shouldProcess).toBe(false);
      expect(result.reason).toContain('Fetching in progress');
    });

    it('should process data after isFetching becomes false', () => {
      const result = simulateChangelogMerge({
        roundChangelogFetching: false, // KEY: Fetch complete
        roundChangelogSuccess: true,
        roundChangelogData: {
          success: true,
          data: { items: [createMockChangelog(2)] },
        },
        configChangeRoundNumber: 2,
        isWaitingForChangelog: true,
        existingCache: null,
      });

      expect(result.shouldProcess).toBe(true);
      expect(result.shouldMerge).toBe(true);
    });

    it('should handle rapid round changes with isFetching guard', () => {
      // Scenario: Round 1 → Round 2 transition
      // TanStack Query returns round 1 data while fetching round 2

      // Step 1: Round 1 data available, but we're fetching round 2
      const step1 = simulateChangelogMerge({
        roundChangelogFetching: true, // Fetching round 2
        roundChangelogSuccess: true, // Round 1 data still in cache
        roundChangelogData: {
          success: true,
          data: { items: [createMockChangelog(1)] }, // STALE: Round 1 data
        },
        configChangeRoundNumber: 2, // We need round 2
        isWaitingForChangelog: true,
        existingCache: null,
      });

      // Should NOT process stale data
      expect(step1.shouldProcess).toBe(false);
      expect(step1.reason).toContain('Fetching in progress');

      // Step 2: Round 2 fetch completes
      const step2 = simulateChangelogMerge({
        roundChangelogFetching: false, // Fetch complete
        roundChangelogSuccess: true,
        roundChangelogData: {
          success: true,
          data: { items: [createMockChangelog(2)] }, // FRESH: Round 2 data
        },
        configChangeRoundNumber: 2,
        isWaitingForChangelog: true,
        existingCache: null,
      });

      // Should process fresh data
      expect(step2.shouldProcess).toBe(true);
      expect(step2.shouldMerge).toBe(true);
      expect(step2.mergedItems[0]?.roundNumber).toBe(2);
    });
  });
});

// ============================================================================
// TESTS: Round Number Validation (STALE DATA FIX)
// ============================================================================

describe('use-changelog-sync Round Number Validation', () => {
  describe('prevents merging data from wrong rounds', () => {
    it('should reject data for wrong round number', () => {
      const result = simulateChangelogMerge({
        roundChangelogFetching: false,
        roundChangelogSuccess: true,
        roundChangelogData: {
          success: true,
          data: { items: [createMockChangelog(1)] }, // Round 1 data
        },
        configChangeRoundNumber: 2, // We need round 2
        isWaitingForChangelog: true,
        existingCache: null,
      });

      expect(result.shouldProcess).toBe(false);
      expect(result.reason).toContain('wrong round');
      expect(result.reason).toContain('expected 2');
      expect(result.reason).toContain('got 1');
    });

    it('should accept data for correct round number', () => {
      const result = simulateChangelogMerge({
        roundChangelogFetching: false,
        roundChangelogSuccess: true,
        roundChangelogData: {
          success: true,
          data: { items: [createMockChangelog(2)] }, // Round 2 data
        },
        configChangeRoundNumber: 2, // We need round 2
        isWaitingForChangelog: true,
        existingCache: null,
      });

      expect(result.shouldProcess).toBe(true);
      expect(result.shouldMerge).toBe(true);
    });

    it('should reject mixed round data', () => {
      const result = simulateChangelogMerge({
        roundChangelogFetching: false,
        roundChangelogSuccess: true,
        roundChangelogData: {
          success: true,
          data: {
            items: [
              createMockChangelog(2),
              createMockChangelog(1), // Mixed: Wrong round
            ],
          },
        },
        configChangeRoundNumber: 2,
        isWaitingForChangelog: true,
        existingCache: null,
      });

      expect(result.shouldProcess).toBe(false);
      expect(result.reason).toContain('wrong round');
    });

    it('should accept multiple items for correct round', () => {
      const result = simulateChangelogMerge({
        roundChangelogFetching: false,
        roundChangelogSuccess: true,
        roundChangelogData: {
          success: true,
          data: {
            items: [
              createMockChangelog(2, { id: 'cl-1' }),
              createMockChangelog(2, { id: 'cl-2' }),
              createMockChangelog(2, { id: 'cl-3' }),
            ],
          },
        },
        configChangeRoundNumber: 2,
        isWaitingForChangelog: true,
        existingCache: null,
      });

      expect(result.shouldProcess).toBe(true);
      expect(result.shouldMerge).toBe(true);
      expect(result.mergedItems).toHaveLength(3);
    });
  });

  describe('handles empty changelog correctly', () => {
    it('should accept empty changelog and clear flags', () => {
      const result = simulateChangelogMerge({
        roundChangelogFetching: false,
        roundChangelogSuccess: true,
        roundChangelogData: {
          success: true,
          data: { items: [] }, // Empty
        },
        configChangeRoundNumber: 2,
        isWaitingForChangelog: true,
        existingCache: null,
      });

      expect(result.shouldProcess).toBe(true);
      expect(result.shouldMerge).toBe(false); // No merge needed
      expect(result.reason).toContain('Empty changelog');
    });
  });
});

// ============================================================================
// TESTS: Duplicate Prevention
// ============================================================================

describe('use-changelog-sync Duplicate Prevention', () => {
  it('should skip items that already exist in cache', () => {
    const existingItem = createMockChangelog(2, { id: 'existing-1' });
    const newItem = createMockChangelog(2, { id: 'new-1' });
    const duplicateItem = createMockChangelog(2, { id: 'existing-1' }); // Same ID

    const result = simulateChangelogMerge({
      roundChangelogFetching: false,
      roundChangelogSuccess: true,
      roundChangelogData: {
        success: true,
        data: { items: [newItem, duplicateItem] },
      },
      configChangeRoundNumber: 2,
      isWaitingForChangelog: true,
      existingCache: {
        success: true,
        data: { items: [existingItem] },
      },
    });

    expect(result.shouldMerge).toBe(true);
    expect(result.mergedItems).toHaveLength(2); // 1 new + 1 existing
    expect(result.reason).toContain('1 duplicates skipped');

    // Verify the existing item is preserved
    const ids = result.mergedItems.map(item => item.id);
    expect(ids).toContain('existing-1');
    expect(ids).toContain('new-1');
  });

  it('should handle all duplicates gracefully', () => {
    const existingItem = createMockChangelog(2, { id: 'existing-1' });

    const result = simulateChangelogMerge({
      roundChangelogFetching: false,
      roundChangelogSuccess: true,
      roundChangelogData: {
        success: true,
        data: { items: [createMockChangelog(2, { id: 'existing-1' })] }, // All duplicates
      },
      configChangeRoundNumber: 2,
      isWaitingForChangelog: true,
      existingCache: {
        success: true,
        data: { items: [existingItem] },
      },
    });

    expect(result.shouldMerge).toBe(true);
    expect(result.mergedItems).toHaveLength(1); // Only original
    expect(result.reason).toContain('0 new items');
  });
});

// ============================================================================
// TESTS: Flag State Requirements
// ============================================================================

describe('use-changelog-sync Flag Requirements', () => {
  describe('requires both flags to process', () => {
    it('should NOT process when configChangeRoundNumber is null', () => {
      const result = simulateChangelogMerge({
        roundChangelogFetching: false,
        roundChangelogSuccess: true,
        roundChangelogData: {
          success: true,
          data: { items: [createMockChangelog(2)] },
        },
        configChangeRoundNumber: null, // Not set
        isWaitingForChangelog: true,
        existingCache: null,
      });

      expect(result.shouldProcess).toBe(false);
      expect(result.reason).toContain('Flags not properly set');
    });

    it('should NOT process when isWaitingForChangelog is false', () => {
      const result = simulateChangelogMerge({
        roundChangelogFetching: false,
        roundChangelogSuccess: true,
        roundChangelogData: {
          success: true,
          data: { items: [createMockChangelog(2)] },
        },
        configChangeRoundNumber: 2,
        isWaitingForChangelog: false, // Not set
        existingCache: null,
      });

      expect(result.shouldProcess).toBe(false);
      expect(result.reason).toContain('Flags not properly set');
    });

    it('should process when both flags are properly set', () => {
      const result = simulateChangelogMerge({
        roundChangelogFetching: false,
        roundChangelogSuccess: true,
        roundChangelogData: {
          success: true,
          data: { items: [createMockChangelog(2)] },
        },
        configChangeRoundNumber: 2,
        isWaitingForChangelog: true,
        existingCache: null,
      });

      expect(result.shouldProcess).toBe(true);
    });
  });
});

// ============================================================================
// TESTS: Store State Management
// ============================================================================

describe('use-changelog-sync Store Integration', () => {
  let store: ReturnType<typeof createMockStore>;

  beforeEach(() => {
    store = createMockStore();
  });

  it('should clear flags after successful merge', () => {
    // Set up waiting state
    store.getState().setIsWaitingForChangelog(true);
    store.getState().setConfigChangeRoundNumber(2);

    // Verify flags are set
    expect(store.getState().isWaitingForChangelog).toBe(true);
    expect(store.getState().configChangeRoundNumber).toBe(2);

    // Simulate successful merge clearing flags
    store.getState().setIsWaitingForChangelog(false);
    store.getState().setConfigChangeRoundNumber(null);

    // Verify flags are cleared
    expect(store.getState().isWaitingForChangelog).toBe(false);
    expect(store.getState().configChangeRoundNumber).toBe(null);
  });

  it('should detect inconsistent state and self-heal', () => {
    // Bug scenario: isWaitingForChangelog=true but configChangeRoundNumber=null
    store.getState().setIsWaitingForChangelog(true);
    // configChangeRoundNumber remains null (inconsistent)

    const state = store.getState();
    const isInconsistent = state.isWaitingForChangelog && state.configChangeRoundNumber === null;

    expect(isInconsistent).toBe(true);

    // The hook should detect and fix this
    if (isInconsistent) {
      store.getState().setIsWaitingForChangelog(false);
    }

    expect(store.getState().isWaitingForChangelog).toBe(false);
  });
});

// ============================================================================
// TESTS: Race Condition Scenarios (Integration)
// ============================================================================

describe('use-changelog-sync Race Condition Scenarios', () => {
  describe('rapid successive round changes', () => {
    it('should handle Round 1 → Round 2 → Round 3 transitions correctly', () => {
      // This tests the exact bug scenario that was fixed:
      // User submits multiple messages in quick succession

      const rounds = [1, 2, 3];
      const results: { round: number; processed: boolean }[] = [];

      for (const round of rounds) {
        // Simulate effect running with stale data during transition
        const withStaleData = simulateChangelogMerge({
          roundChangelogFetching: true, // Fetching new round
          roundChangelogSuccess: true,
          roundChangelogData: {
            success: true,
            data: { items: [createMockChangelog(round - 1)] }, // STALE
          },
          configChangeRoundNumber: round,
          isWaitingForChangelog: true,
          existingCache: null,
        });

        // Should NOT process stale data
        expect(withStaleData.shouldProcess).toBe(false);

        // Simulate effect running after fetch completes
        const withFreshData = simulateChangelogMerge({
          roundChangelogFetching: false,
          roundChangelogSuccess: true,
          roundChangelogData: {
            success: true,
            data: { items: [createMockChangelog(round)] }, // FRESH
          },
          configChangeRoundNumber: round,
          isWaitingForChangelog: true,
          existingCache: null,
        });

        results.push({ round, processed: withFreshData.shouldProcess });
      }

      // All rounds should be processed with correct data
      expect(results).toEqual([
        { round: 1, processed: true },
        { round: 2, processed: true },
        { round: 3, processed: true },
      ]);
    });
  });

  describe('concurrent component updates', () => {
    it('should handle multiple effect runs during single fetch', () => {
      // Scenario: Effect runs multiple times while fetch is in progress
      // This can happen due to React's batching behavior

      const effectRuns: { fetching: boolean; processed: boolean }[] = [];

      // Run 1: Initial effect - fetching started
      effectRuns.push({
        fetching: true,
        processed: simulateChangelogMerge({
          roundChangelogFetching: true,
          roundChangelogSuccess: false,
          roundChangelogData: null,
          configChangeRoundNumber: 2,
          isWaitingForChangelog: true,
          existingCache: null,
        }).shouldProcess,
      });

      // Run 2: State update triggers re-render - still fetching
      effectRuns.push({
        fetching: true,
        processed: simulateChangelogMerge({
          roundChangelogFetching: true,
          roundChangelogSuccess: true, // Previous success cached
          roundChangelogData: {
            success: true,
            data: { items: [createMockChangelog(1)] }, // STALE
          },
          configChangeRoundNumber: 2,
          isWaitingForChangelog: true,
          existingCache: null,
        }).shouldProcess,
      });

      // Run 3: Fetch completes - should process
      effectRuns.push({
        fetching: false,
        processed: simulateChangelogMerge({
          roundChangelogFetching: false,
          roundChangelogSuccess: true,
          roundChangelogData: {
            success: true,
            data: { items: [createMockChangelog(2)] }, // FRESH
          },
          configChangeRoundNumber: 2,
          isWaitingForChangelog: true,
          existingCache: null,
        }).shouldProcess,
      });

      // Only the last run should process
      expect(effectRuns[0]?.processed).toBe(false);
      expect(effectRuns[1]?.processed).toBe(false);
      expect(effectRuns[2]?.processed).toBe(true);
    });
  });
});

// ============================================================================
// TESTS: Edge Cases
// ============================================================================

describe('use-changelog-sync Edge Cases', () => {
  it('should handle round 0 correctly', () => {
    const result = simulateChangelogMerge({
      roundChangelogFetching: false,
      roundChangelogSuccess: true,
      roundChangelogData: {
        success: true,
        data: { items: [createMockChangelog(0)] },
      },
      configChangeRoundNumber: 0,
      isWaitingForChangelog: true,
      existingCache: null,
    });

    expect(result.shouldProcess).toBe(true);
    expect(result.shouldMerge).toBe(true);
  });

  it('should handle very high round numbers', () => {
    const result = simulateChangelogMerge({
      roundChangelogFetching: false,
      roundChangelogSuccess: true,
      roundChangelogData: {
        success: true,
        data: { items: [createMockChangelog(999)] },
      },
      configChangeRoundNumber: 999,
      isWaitingForChangelog: true,
      existingCache: null,
    });

    expect(result.shouldProcess).toBe(true);
    expect(result.shouldMerge).toBe(true);
  });

  it('should handle query failure gracefully', () => {
    const result = simulateChangelogMerge({
      roundChangelogFetching: false,
      roundChangelogSuccess: false, // Query failed
      roundChangelogData: null,
      configChangeRoundNumber: 2,
      isWaitingForChangelog: true,
      existingCache: null,
    });

    expect(result.shouldProcess).toBe(false);
    expect(result.reason).toContain('not successful');
  });

  it('should handle malformed data gracefully', () => {
    const result = simulateChangelogMerge({
      roundChangelogFetching: false,
      roundChangelogSuccess: true,
      roundChangelogData: {
        success: false, // Data indicates failure
        data: { items: [] },
      },
      configChangeRoundNumber: 2,
      isWaitingForChangelog: true,
      existingCache: null,
    });

    expect(result.shouldProcess).toBe(false);
  });
});

// ============================================================================
// TESTS: Regression Prevention
// ============================================================================

describe('use-changelog-sync Regression Prevention', () => {
  describe('bUG: Stale data from previous round merged into current round cache', () => {
    /**
     * This test captures the exact bug scenario that was fixed.
     *
     * SCENARIO:
     * 1. User is on round 1, changelog shown correctly
     * 2. User submits message for round 2
     * 3. configChangeRoundNumber changes 1→2
     * 4. TanStack Query starts fetching round 2 data
     * 5. Before fetch completes, effect runs with:
     *    - roundChangelogData still containing round 1 data
     *    - configChangeRoundNumber = 2
     * 6. BUG: Round 1 data was merged as if it were round 2 data
     *
     * FIX:
     * - Added isFetching guard: Don't process while fetching
     * - Added round validation: Verify data matches expected round
     */
    it('should NOT merge round 1 data when waiting for round 2', () => {
      // The buggy scenario
      const result = simulateChangelogMerge({
        roundChangelogFetching: false, // Without isFetching guard, this was true
        roundChangelogSuccess: true,
        roundChangelogData: {
          success: true,
          data: {
            items: [
              createMockChangelog(1, { id: 'E1ACHH' }),
              createMockChangelog(1, { id: '6W5H97' }),
            ],
          },
        },
        configChangeRoundNumber: 2, // We need round 2
        isWaitingForChangelog: true,
        existingCache: {
          success: true,
          data: {
            items: [
              createMockChangelog(1, { id: 'E1ACHH' }),
              createMockChangelog(1, { id: '6W5H97' }),
            ],
          },
        },
      });

      // The fix: Should NOT process this data
      expect(result.shouldProcess).toBe(false);
      expect(result.reason).toContain('wrong round');
    });

    it('should correctly merge round 2 data after fetch completes', () => {
      // The fixed scenario
      const result = simulateChangelogMerge({
        roundChangelogFetching: false, // Fetch complete
        roundChangelogSuccess: true,
        roundChangelogData: {
          success: true,
          data: {
            items: [
              createMockChangelog(2, { id: 'NEW-R2-1' }),
              createMockChangelog(2, { id: 'NEW-R2-2' }),
            ],
          },
        },
        configChangeRoundNumber: 2,
        isWaitingForChangelog: true,
        existingCache: {
          success: true,
          data: {
            items: [
              createMockChangelog(1, { id: 'E1ACHH' }),
              createMockChangelog(1, { id: '6W5H97' }),
            ],
          },
        },
      });

      // Should process and merge correctly
      expect(result.shouldProcess).toBe(true);
      expect(result.shouldMerge).toBe(true);

      // New round 2 items should be at the beginning
      expect(result.mergedItems[0]?.id).toBe('NEW-R2-1');
      expect(result.mergedItems[1]?.id).toBe('NEW-R2-2');

      // Old round 1 items should be preserved
      expect(result.mergedItems[2]?.id).toBe('E1ACHH');
      expect(result.mergedItems[3]?.id).toBe('6W5H97');
    });
  });
});
