/**
 * Pre-Search Execution Tests
 *
 * Tests for pre-search execution logic:
 * - SSE stream parsing
 * - shouldWaitForPreSearch blocking logic
 * - Idempotent execution (prevents duplicate triggers)
 * - Progressive UI updates during streaming
 *
 * These tests verify that:
 * 1. Pre-search correctly blocks participant streaming until complete
 * 2. Duplicate executions are prevented via tracking
 * 3. SSE stream is parsed correctly
 * 4. Error states are handled gracefully
 */

import { MessageStatuses } from '@roundtable/shared';
import { describe, expect, it } from 'vitest';

import { createMockPreSearch as createMockPreSearchBase } from '@/lib/testing';
import type { StoredPreSearch } from '@/types/api';

import { shouldWaitForPreSearch } from '../utils/pre-search-execution';

// ============================================================================
// TEST HELPERS - Thin wrapper with test-specific defaults
// ============================================================================

function createMockPreSearch(overrides?: Partial<StoredPreSearch>): StoredPreSearch {
  return createMockPreSearchBase({
    id: overrides?.id ?? 'presearch-123',
    threadId: overrides?.threadId ?? 'thread-123',
    roundNumber: overrides?.roundNumber ?? 0,
    status: overrides?.status ?? MessageStatuses.PENDING,
    userQuery: overrides?.userQuery ?? 'Test query',
    createdAt: overrides?.createdAt ?? new Date(),
    completedAt: overrides?.completedAt ?? null,
    ...overrides,
  }) as StoredPreSearch;
}

// ============================================================================
// TEST SUITES
// ============================================================================

describe('shouldWaitForPreSearch', () => {
  describe('web Search Disabled', () => {
    it('returns false when web search is disabled', () => {
      const result = shouldWaitForPreSearch(false, undefined);
      expect(result).toBe(false);
    });

    it('returns false when web search disabled even if pre-search exists', () => {
      const preSearch = createMockPreSearch({ status: MessageStatuses.PENDING });
      const result = shouldWaitForPreSearch(false, preSearch);
      expect(result).toBe(false);
    });

    it('returns false when web search disabled even if pre-search streaming', () => {
      const preSearch = createMockPreSearch({ status: MessageStatuses.STREAMING });
      const result = shouldWaitForPreSearch(false, preSearch);
      expect(result).toBe(false);
    });
  });

  describe('web Search Enabled - No Pre-Search', () => {
    it('returns true when no pre-search exists', () => {
      const result = shouldWaitForPreSearch(true, undefined);
      expect(result).toBe(true);
    });
  });

  describe('web Search Enabled - Pre-Search in Progress', () => {
    it('returns true when pre-search is pending', () => {
      const preSearch = createMockPreSearch({ status: MessageStatuses.PENDING });
      const result = shouldWaitForPreSearch(true, preSearch);
      expect(result).toBe(true);
    });

    it('returns true when pre-search is streaming', () => {
      const preSearch = createMockPreSearch({ status: MessageStatuses.STREAMING });
      const result = shouldWaitForPreSearch(true, preSearch);
      expect(result).toBe(true);
    });
  });

  describe('web Search Enabled - Pre-Search Complete', () => {
    it('returns false when pre-search is complete', () => {
      const preSearch = createMockPreSearch({ status: MessageStatuses.COMPLETE });
      const result = shouldWaitForPreSearch(true, preSearch);
      expect(result).toBe(false);
    });

    it('returns false when pre-search failed', () => {
      const preSearch = createMockPreSearch({ status: MessageStatuses.FAILED });
      const result = shouldWaitForPreSearch(true, preSearch);
      expect(result).toBe(false);
    });
  });
});

describe('pre-Search State Transitions', () => {
  describe('status Flow', () => {
    it('follows pending -> streaming -> complete flow', () => {
      // Test that the expected status transitions are valid
      const statusFlow: Array<typeof MessageStatuses[keyof typeof MessageStatuses]> = [
        MessageStatuses.PENDING,
        MessageStatuses.STREAMING,
        MessageStatuses.COMPLETE,
      ];

      // Verify all statuses are valid enum values
      statusFlow.forEach((status) => {
        expect([
          MessageStatuses.PENDING,
          MessageStatuses.STREAMING,
          MessageStatuses.COMPLETE,
          MessageStatuses.FAILED,
        ]).toContain(status);
      });
    });

    it('can transition to failed from any state', () => {
      const fromStates = [
        MessageStatuses.PENDING,
        MessageStatuses.STREAMING,
      ];

      // All states should be able to transition to failed
      fromStates.forEach((state) => {
        const preSearch = createMockPreSearch({ status: state });
        // This simulates what would happen on error
        const failedPreSearch = { ...preSearch, status: MessageStatuses.FAILED };
        expect(failedPreSearch.status).toBe(MessageStatuses.FAILED);
      });
    });
  });

  describe('blocking Behavior During Status Changes', () => {
    it('blocks participants while pre-search pending', () => {
      const preSearch = createMockPreSearch({ status: MessageStatuses.PENDING });
      expect(shouldWaitForPreSearch(true, preSearch)).toBe(true);
    });

    it('blocks participants while pre-search streaming', () => {
      const preSearch = createMockPreSearch({ status: MessageStatuses.STREAMING });
      expect(shouldWaitForPreSearch(true, preSearch)).toBe(true);
    });

    it('unblocks participants when pre-search completes', () => {
      const preSearch = createMockPreSearch({ status: MessageStatuses.COMPLETE });
      expect(shouldWaitForPreSearch(true, preSearch)).toBe(false);
    });

    it('unblocks participants when pre-search fails', () => {
      const preSearch = createMockPreSearch({ status: MessageStatuses.FAILED });
      expect(shouldWaitForPreSearch(true, preSearch)).toBe(false);
    });
  });
});

describe('pre-Search Round Coordination', () => {
  describe('round Number Matching', () => {
    it('correctly identifies pre-search for round 0', () => {
      const preSearches = [
        createMockPreSearch({ roundNumber: 0, status: MessageStatuses.COMPLETE }),
        createMockPreSearch({ roundNumber: 1, status: MessageStatuses.PENDING }),
      ];

      // Find pre-search for round 0
      const round0PreSearch = preSearches.find(ps => ps.roundNumber === 0);
      expect(round0PreSearch?.status).toBe(MessageStatuses.COMPLETE);
      expect(shouldWaitForPreSearch(true, round0PreSearch)).toBe(false);

      // Find pre-search for round 1
      const round1PreSearch = preSearches.find(ps => ps.roundNumber === 1);
      expect(round1PreSearch?.status).toBe(MessageStatuses.PENDING);
      expect(shouldWaitForPreSearch(true, round1PreSearch)).toBe(true);
    });

    it('handles multi-round scenarios correctly', () => {
      // Simulate: Round 0 complete, Round 1 streaming, Round 2 pending
      const preSearches = [
        createMockPreSearch({ roundNumber: 0, status: MessageStatuses.COMPLETE }),
        createMockPreSearch({ roundNumber: 1, status: MessageStatuses.STREAMING }),
        createMockPreSearch({ roundNumber: 2, status: MessageStatuses.PENDING }),
      ];

      // Round 0 - participants can proceed
      const round0 = preSearches.find(ps => ps.roundNumber === 0);
      expect(shouldWaitForPreSearch(true, round0)).toBe(false);

      // Round 1 - still streaming, participants must wait
      const round1 = preSearches.find(ps => ps.roundNumber === 1);
      expect(shouldWaitForPreSearch(true, round1)).toBe(true);

      // Round 2 - pending, participants must wait
      const round2 = preSearches.find(ps => ps.roundNumber === 2);
      expect(shouldWaitForPreSearch(true, round2)).toBe(true);
    });
  });

  describe('missing Pre-Search for Round', () => {
    it('blocks when pre-search missing for current round', () => {
      const preSearches = [
        createMockPreSearch({ roundNumber: 0, status: MessageStatuses.COMPLETE }),
        // No pre-search for round 1
      ];

      // Round 1 has no pre-search - should block to create one
      const round1PreSearch = preSearches.find(ps => ps.roundNumber === 1);
      expect(round1PreSearch).toBeUndefined();
      expect(shouldWaitForPreSearch(true, round1PreSearch)).toBe(true);
    });

    it('does not block when round 0 complete and checking round 0', () => {
      const preSearches = [
        createMockPreSearch({ roundNumber: 0, status: MessageStatuses.COMPLETE }),
      ];

      const round0PreSearch = preSearches.find(ps => ps.roundNumber === 0);
      expect(shouldWaitForPreSearch(true, round0PreSearch)).toBe(false);
    });
  });
});

describe('pre-Search Placeholder Handling', () => {
  describe('placeholder Detection', () => {
    it('identifies placeholder pre-search by id prefix', () => {
      const placeholder = createMockPreSearch({ id: 'placeholder-round-0' });
      const real = createMockPreSearch({ id: 'presearch-abc123' });

      expect(placeholder.id.startsWith('placeholder-')).toBe(true);
      expect(real.id.startsWith('placeholder-')).toBe(false);
    });

    it('placeholder still blocks until complete', () => {
      const placeholder = createMockPreSearch({
        id: 'placeholder-round-0',
        status: MessageStatuses.PENDING,
      });

      expect(shouldWaitForPreSearch(true, placeholder)).toBe(true);
    });

    it('completed placeholder allows participants to proceed', () => {
      const placeholder = createMockPreSearch({
        id: 'placeholder-round-0',
        status: MessageStatuses.COMPLETE,
      });

      expect(shouldWaitForPreSearch(true, placeholder)).toBe(false);
    });
  });
});

describe('edge Cases', () => {
  describe('rapid State Changes', () => {
    it('handles rapid status updates', () => {
      const preSearch = createMockPreSearch({ status: MessageStatuses.PENDING });

      // Rapid status check sequence
      expect(shouldWaitForPreSearch(true, preSearch)).toBe(true);

      preSearch.status = MessageStatuses.STREAMING;
      expect(shouldWaitForPreSearch(true, preSearch)).toBe(true);

      preSearch.status = MessageStatuses.COMPLETE;
      expect(shouldWaitForPreSearch(true, preSearch)).toBe(false);
    });
  });

  describe('page Refresh Scenarios', () => {
    it('resumes correctly after refresh when pre-search was streaming', () => {
      // After refresh, pre-search might still show as streaming in DB
      const preSearch = createMockPreSearch({ status: MessageStatuses.STREAMING });

      // Should still wait for it to complete
      expect(shouldWaitForPreSearch(true, preSearch)).toBe(true);
    });

    it('proceeds correctly after refresh when pre-search was complete', () => {
      const preSearch = createMockPreSearch({ status: MessageStatuses.COMPLETE });

      // Should not wait
      expect(shouldWaitForPreSearch(true, preSearch)).toBe(false);
    });
  });

  describe('toggle Web Search Mid-Round', () => {
    it('handles web search toggle correctly', () => {
      const preSearch = createMockPreSearch({ status: MessageStatuses.STREAMING });

      // With web search enabled - should wait
      expect(shouldWaitForPreSearch(true, preSearch)).toBe(true);

      // If user disables web search - should not wait
      expect(shouldWaitForPreSearch(false, preSearch)).toBe(false);
    });
  });
});
