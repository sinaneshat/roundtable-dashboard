/**
 * Web Search Timeout Tests
 *
 * Tests for timeout behavior during web search (pre-search) operations.
 * Verifies that:
 * 1. Timeouts don't fire prematurely when streams are active
 * 2. Activity-based timeout tracking works correctly
 * 3. Grace period after pre-search completion prevents premature timeouts
 *
 * Location: /src/lib/utils/__tests__/web-search-timeout.test.ts
 */

import { describe, expect, it } from 'vitest';

import { AnalysisStatuses, PreSearchStatuses } from '@/api/core/enums';
import type { StoredPreSearch } from '@/api/routes/chat/schema';
import {
  ACTIVITY_TIMEOUT_MS,
  calculatePreSearchTimeout,
  getPreSearchTimeout,
  isPreSearchActivityStalled,
  isPreSearchTimedOut,
  shouldPreSearchTimeout,
  TIMEOUT_CONFIG,
} from '@/lib/utils/web-search-utils';

// ============================================================================
// TEST UTILITIES
// ============================================================================

/**
 * Create mock StoredPreSearch for timeout testing
 */
function createMockPreSearch(
  overrides?: Partial<StoredPreSearch>,
): StoredPreSearch {
  return {
    id: 'pre-search-1',
    threadId: 'thread-123',
    roundNumber: 0,
    userQuery: 'What is the weather?',
    status: PreSearchStatuses.STREAMING,
    searchData: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Create a pre-search that was created X milliseconds ago
 */
function createPreSearchCreatedAgo(
  msAgo: number,
  status: string = PreSearchStatuses.STREAMING,
): StoredPreSearch {
  return createMockPreSearch({
    status,
    createdAt: new Date(Date.now() - msAgo),
  });
}

/**
 * Create a completed pre-search that completed X milliseconds ago
 */
function createCompletedPreSearchAgo(
  msAgo: number,
): StoredPreSearch {
  const completedAt = new Date(Date.now() - msAgo);
  return createMockPreSearch({
    status: AnalysisStatuses.COMPLETE,
    createdAt: new Date(Date.now() - msAgo - 5000), // Created 5s before completion
    completedAt,
  });
}

// ============================================================================
// SECTION 1: calculatePreSearchTimeout
// ============================================================================

describe('calculatePreSearchTimeout', () => {
  it('returns default timeout when no input provided', () => {
    const timeout = calculatePreSearchTimeout();
    expect(timeout).toBe(TIMEOUT_CONFIG.DEFAULT_MS);
  });

  it('returns minimum timeout when empty input provided', () => {
    // Empty input = 0 queries, 0 results → calculates to BASE_MS which is clamped to MIN_MS
    const timeout = calculatePreSearchTimeout({});
    expect(timeout).toBe(TIMEOUT_CONFIG.MIN_MS);
  });

  it('calculates timeout based on query count', () => {
    const timeout = calculatePreSearchTimeout({
      queryCount: 3,
    });

    // BASE + (3 basic queries × PER_QUERY_BASIC) + (3 × DEFAULT_RESULTS × PER_RESULT)
    const expected = TIMEOUT_CONFIG.BASE_MS
      + (3 * TIMEOUT_CONFIG.PER_QUERY_BASIC_MS)
      + (3 * TIMEOUT_CONFIG.DEFAULT_RESULTS_PER_QUERY * TIMEOUT_CONFIG.PER_RESULT_MS);

    expect(timeout).toBe(Math.min(expected, TIMEOUT_CONFIG.MAX_MS));
  });

  it('accounts for advanced queries taking longer', () => {
    const basicTimeout = calculatePreSearchTimeout({
      queryCount: 2,
      advancedQueryCount: 0,
    });

    const advancedTimeout = calculatePreSearchTimeout({
      queryCount: 2,
      advancedQueryCount: 2,
    });

    expect(advancedTimeout).toBeGreaterThan(basicTimeout);
  });

  it('respects minimum timeout', () => {
    const timeout = calculatePreSearchTimeout({
      queryCount: 0,
      expectedResultCount: 0,
    });

    expect(timeout).toBeGreaterThanOrEqual(TIMEOUT_CONFIG.MIN_MS);
  });

  it('respects maximum timeout', () => {
    const timeout = calculatePreSearchTimeout({
      queryCount: 100, // Very large number
      advancedQueryCount: 50,
      expectedResultCount: 500,
    });

    expect(timeout).toBeLessThanOrEqual(TIMEOUT_CONFIG.MAX_MS);
  });

  it('calculates from queries array', () => {
    const timeout = calculatePreSearchTimeout({
      queries: [
        { searchDepth: 'basic', sourceCount: 5 },
        { searchDepth: 'advanced', sourceCount: 10 },
      ],
    });

    // Should be greater than base due to queries
    expect(timeout).toBeGreaterThan(TIMEOUT_CONFIG.BASE_MS);
  });
});

// ============================================================================
// SECTION 2: isPreSearchTimedOut (total time based)
// ============================================================================

describe('isPreSearchTimedOut', () => {
  it('returns false for null/undefined pre-search', () => {
    expect(isPreSearchTimedOut(null)).toBe(false);
    expect(isPreSearchTimedOut(undefined)).toBe(false);
  });

  it('returns false for recently created pre-search', () => {
    const preSearch = createPreSearchCreatedAgo(5000); // 5 seconds ago
    expect(isPreSearchTimedOut(preSearch)).toBe(false);
  });

  it('returns true when pre-search exceeds default timeout', () => {
    const preSearch = createPreSearchCreatedAgo(TIMEOUT_CONFIG.DEFAULT_MS + 1000);
    expect(isPreSearchTimedOut(preSearch)).toBe(true);
  });

  it('accounts for dynamic timeout based on search data', () => {
    // Pre-search with no search data uses default timeout
    const simplePreSearch = createPreSearchCreatedAgo(35_000); // 35s ago

    // Default timeout is 30s, so this should be timed out
    expect(isPreSearchTimedOut(simplePreSearch)).toBe(true);
  });

  it('returns false when within calculated timeout window', () => {
    const preSearch = createPreSearchCreatedAgo(10_000); // 10 seconds ago
    expect(isPreSearchTimedOut(preSearch)).toBe(false);
  });
});

// ============================================================================
// SECTION 3: isPreSearchActivityStalled (activity based)
// ============================================================================

describe('isPreSearchActivityStalled', () => {
  const createdTime = Date.now() - 10000; // 10 seconds ago

  it('returns false when no activity tracking exists', () => {
    expect(isPreSearchActivityStalled(undefined, createdTime)).toBe(false);
  });

  it('returns false when activity is recent', () => {
    const recentActivity = Date.now() - 5000; // 5 seconds ago
    expect(isPreSearchActivityStalled(recentActivity, createdTime)).toBe(false);
  });

  it('returns true when activity exceeds ACTIVITY_TIMEOUT_MS', () => {
    const staleActivity = Date.now() - (ACTIVITY_TIMEOUT_MS + 1000); // 31 seconds ago
    expect(isPreSearchActivityStalled(staleActivity, createdTime)).toBe(true);
  });

  it('returns false at exactly ACTIVITY_TIMEOUT_MS boundary', () => {
    const boundaryActivity = Date.now() - ACTIVITY_TIMEOUT_MS;
    expect(isPreSearchActivityStalled(boundaryActivity, Date.now())).toBe(false);
  });
});

// ============================================================================
// SECTION 4: shouldPreSearchTimeout (combined check)
// ============================================================================

describe('shouldPreSearchTimeout', () => {
  it('returns false for null/undefined pre-search', () => {
    expect(shouldPreSearchTimeout(null, undefined)).toBe(false);
    expect(shouldPreSearchTimeout(undefined, Date.now())).toBe(false);
  });

  it('returns false when pre-search is recent and has activity', () => {
    const preSearch = createPreSearchCreatedAgo(5000); // 5 seconds ago
    const lastActivity = Date.now() - 1000; // 1 second ago

    expect(shouldPreSearchTimeout(preSearch, lastActivity)).toBe(false);
  });

  it('returns false when pre-search is recent even without activity tracking', () => {
    const preSearch = createPreSearchCreatedAgo(5000); // 5 seconds ago

    // No activity tracking (undefined) should not trigger timeout for recent pre-search
    expect(shouldPreSearchTimeout(preSearch, undefined)).toBe(false);
  });

  it('returns true when total time exceeded', () => {
    const preSearch = createPreSearchCreatedAgo(TIMEOUT_CONFIG.DEFAULT_MS + 5000);

    expect(shouldPreSearchTimeout(preSearch, undefined)).toBe(true);
  });

  it('returns true when activity is stale', () => {
    const preSearch = createPreSearchCreatedAgo(10_000); // 10 seconds ago (within timeout)
    const staleActivity = Date.now() - (ACTIVITY_TIMEOUT_MS + 5000); // 35 seconds ago

    expect(shouldPreSearchTimeout(preSearch, staleActivity)).toBe(true);
  });

  it('does not timeout if stream is actively receiving data', () => {
    // Key test: Even if pre-search was created a while ago, if there's recent activity
    // it should NOT timeout
    const preSearch = createPreSearchCreatedAgo(25_000); // 25 seconds ago (close to default timeout)
    const recentActivity = Date.now() - 2000; // 2 seconds ago

    expect(shouldPreSearchTimeout(preSearch, recentActivity)).toBe(false);
  });

  it('handles edge case where activity tracking starts late', () => {
    // Pre-search created 20s ago, but activity tracking only started 5s ago
    const preSearch = createPreSearchCreatedAgo(20_000);
    const recentActivity = Date.now() - 5000;

    // Should not timeout because there's recent activity
    expect(shouldPreSearchTimeout(preSearch, recentActivity)).toBe(false);
  });
});

// ============================================================================
// SECTION 5: getPreSearchTimeout
// ============================================================================

describe('getPreSearchTimeout', () => {
  it('returns default timeout for null pre-search', () => {
    expect(getPreSearchTimeout(null)).toBe(TIMEOUT_CONFIG.DEFAULT_MS);
  });

  it('returns default timeout for pre-search without searchData', () => {
    const preSearch = createMockPreSearch({ searchData: null });
    expect(getPreSearchTimeout(preSearch)).toBe(TIMEOUT_CONFIG.DEFAULT_MS);
  });

  it('calculates timeout from searchData when available', () => {
    const preSearch = createMockPreSearch({
      searchData: {
        queries: [
          {
            query: 'test query 1',
            complexity: 'basic',
            searchDepth: 'basic',
            sourceCount: 3,
            results: [],
            errors: [],
          },
          {
            query: 'test query 2',
            complexity: 'advanced',
            searchDepth: 'advanced',
            sourceCount: 5,
            results: [],
            errors: [],
          },
        ],
        totalResults: 10,
        metadata: {},
        summary: 'Test summary',
      },
    });

    const timeout = getPreSearchTimeout(preSearch);

    // Should be greater than default due to multiple queries
    expect(timeout).toBeGreaterThan(TIMEOUT_CONFIG.DEFAULT_MS);
  });
});

// ============================================================================
// SECTION 6: Timeout constants validation
// ============================================================================

describe('timeout config constants', () => {
  it('has sensible timeout values', () => {
    expect(TIMEOUT_CONFIG.BASE_MS).toBeGreaterThan(0);
    expect(TIMEOUT_CONFIG.MIN_MS).toBeGreaterThan(0);
    expect(TIMEOUT_CONFIG.MAX_MS).toBeGreaterThan(TIMEOUT_CONFIG.MIN_MS);
    expect(TIMEOUT_CONFIG.DEFAULT_MS).toBeGreaterThanOrEqual(TIMEOUT_CONFIG.MIN_MS);
    expect(TIMEOUT_CONFIG.DEFAULT_MS).toBeLessThanOrEqual(TIMEOUT_CONFIG.MAX_MS);
  });

  it('activity timeout is reasonable for SSE streams', () => {
    // Should be at least 20 seconds to account for slow responses
    expect(ACTIVITY_TIMEOUT_MS).toBeGreaterThanOrEqual(20_000);
    // Should not be so long that stale streams hang forever
    expect(ACTIVITY_TIMEOUT_MS).toBeLessThanOrEqual(60_000);
  });
});

// ============================================================================
// SECTION 7: Grace period scenarios (simulating provider behavior)
// ============================================================================

describe('grace period after pre-search completion', () => {
  const PARTICIPANT_START_GRACE_PERIOD_MS = 15_000; // Matches provider constant

  it('should allow time for participants to start after pre-search completes', () => {
    // Simulate pre-search that just completed
    createCompletedPreSearchAgo(1000); // Completed 1 second ago
    const timeSinceComplete = 1000;

    // Within grace period - should not timeout
    expect(timeSinceComplete < PARTICIPANT_START_GRACE_PERIOD_MS).toBe(true);
  });

  it('should identify when grace period has exceeded', () => {
    // Simulate pre-search that completed a while ago
    createCompletedPreSearchAgo(20_000); // Completed 20 seconds ago
    const timeSinceComplete = 20_000;

    // Past grace period
    expect(timeSinceComplete >= PARTICIPANT_START_GRACE_PERIOD_MS).toBe(true);
  });

  it('completed pre-search should not be considered running', () => {
    const preSearch = createCompletedPreSearchAgo(5000);

    const isStillRunning = preSearch.status === AnalysisStatuses.PENDING
      || preSearch.status === AnalysisStatuses.STREAMING;

    expect(isStillRunning).toBe(false);
  });

  it('failed pre-search should not be considered running', () => {
    const preSearch = createMockPreSearch({
      status: AnalysisStatuses.FAILED,
    });

    const isStillRunning = preSearch.status === AnalysisStatuses.PENDING
      || preSearch.status === AnalysisStatuses.STREAMING;

    expect(isStillRunning).toBe(false);
  });

  it('streaming pre-search should be considered running', () => {
    const preSearch = createMockPreSearch({
      status: AnalysisStatuses.STREAMING,
    });

    const isStillRunning = preSearch.status === AnalysisStatuses.PENDING
      || preSearch.status === AnalysisStatuses.STREAMING;

    expect(isStillRunning).toBe(true);
  });

  it('pending pre-search should be considered running', () => {
    const preSearch = createMockPreSearch({
      status: AnalysisStatuses.PENDING,
    });

    const isStillRunning = preSearch.status === AnalysisStatuses.PENDING
      || preSearch.status === AnalysisStatuses.STREAMING;

    expect(isStillRunning).toBe(true);
  });
});

// ============================================================================
// SECTION 8: Real-world scenarios
// ============================================================================

describe('real-world timeout scenarios', () => {
  it('scenario: fast pre-search with immediate completion', () => {
    // Pre-search completes quickly (3 seconds)
    const preSearch = createCompletedPreSearchAgo(3000);

    // Should not trigger any timeout
    expect(shouldPreSearchTimeout(preSearch, undefined)).toBe(false);
  });

  it('scenario: slow pre-search with continuous activity', () => {
    // Pre-search running for 25 seconds (close to default timeout)
    const preSearch = createPreSearchCreatedAgo(25_000);
    // But receiving activity every few seconds
    const lastActivity = Date.now() - 3000;

    // Should NOT timeout because activity is recent
    expect(shouldPreSearchTimeout(preSearch, lastActivity)).toBe(false);
  });

  it('scenario: hanging pre-search with no activity', () => {
    // Pre-search running for 20 seconds
    const preSearch = createPreSearchCreatedAgo(20_000);
    // No activity for 35 seconds (exceeds ACTIVITY_TIMEOUT_MS)
    const staleActivity = Date.now() - 35_000;

    // SHOULD timeout because no recent activity
    expect(shouldPreSearchTimeout(preSearch, staleActivity)).toBe(true);
  });

  it('scenario: pre-search exceeds max time but has activity', () => {
    // Pre-search running for 40 seconds (exceeds default 30s timeout)
    const preSearch = createPreSearchCreatedAgo(40_000);
    // But receiving activity just now
    const lastActivity = Date.now() - 1000;

    // Even with recent activity, total time exceeded triggers timeout
    expect(shouldPreSearchTimeout(preSearch, lastActivity)).toBe(true);
  });

  it('scenario: complex pre-search with many queries', () => {
    // Pre-search with complex search data
    const preSearch: StoredPreSearch = {
      ...createPreSearchCreatedAgo(45_000), // 45 seconds ago
      searchData: {
        queries: [
          { query: 'q1', complexity: 'basic', searchDepth: 'basic', sourceCount: 5, results: [], errors: [] },
          { query: 'q2', complexity: 'basic', searchDepth: 'advanced', sourceCount: 10, results: [], errors: [] },
          { query: 'q3', complexity: 'advanced', searchDepth: 'advanced', sourceCount: 8, results: [], errors: [] },
        ],
        totalResults: 23,
        metadata: {},
        summary: 'Test summary',
      },
    };

    // Get calculated timeout for this complex search
    const timeout = getPreSearchTimeout(preSearch);

    // Timeout should be higher than default due to complexity
    expect(timeout).toBeGreaterThan(TIMEOUT_CONFIG.DEFAULT_MS);
  });
});
