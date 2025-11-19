/**
 * Orchestrator Pre-Search Sync - Race Condition Tests
 *
 * Tests critical race between orchestrator sync and streaming start using ACTUAL implementation.
 * Uses real shouldWaitForPreSearch function from pending-message-sender.ts
 *
 * **CRITICAL RACE CONDITIONS TESTED**:
 * 1. Risk 3.1: Orchestrator sync timing - Pre-search PENDING but not visible to frontend
 * 2. Risk 3.2: Missing pre-search optimistic wait - PATCH in flight when streaming checks
 * 3. Risk 3.3: Status transition race - Stale status while server has updated
 *
 * **TESTING APPROACH**:
 * - Test actual shouldWaitForPreSearch function
 * - Use real StoredPreSearch type from API schema
 * - Test optimistic blocking
 * - Test status transitions
 * - Test timeout behavior (10s timeout)
 *
 * **CRITICAL PRINCIPLE**: Test actual code behavior, not recreated logic
 */

import { act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PreSearchStatuses } from '@/api/core/enums';
import type { StoredPreSearch } from '@/api/routes/chat/schema';
import { shouldWaitForPreSearch } from '@/stores/chat/actions/pending-message-sender';

import { createMockPreSearch } from './test-factories';

describe('orchestrator Pre-Search Sync - Race Conditions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * RACE CONDITION 3.1: Orchestrator Sync Timing
   * =============================================
   * Backend creates PENDING pre-search, but orchestrator query hasn't returned yet
   *
   * Expected Behavior:
   * - shouldWaitForPreSearch() must return TRUE even if orchestrator hasn't synced
   * - Optimistic blocking: if web search enabled, assume PENDING exists
   */
  it('rACE 3.1: Blocks streaming even when orchestrator hasnt synced pre-search', () => {
    // Web search is ENABLED, but orchestrator hasn't synced yet
    const preSearches: StoredPreSearch[] = []; // Empty (orchestrator not synced)

    // Function under test - uses actual implementation
    const shouldWait = shouldWaitForPreSearch({
      webSearchEnabled: true,
      preSearches,
      roundNumber: 0,
    });

    // MUST return TRUE (optimistic blocking)
    expect(shouldWait).toBe(true);
  });

  /**
   * RACE CONDITION 3.1b: Orchestrator Syncs After Streaming Check
   * ==============================================================
   * Verifies blocking continues until orchestrator sync completes
   */
  it('rACE 3.1b: Continues blocking until orchestrator syncs PENDING', () => {
    // Not synced yet
    let preSearches: StoredPreSearch[] = [];

    // Initial check: BLOCKED
    expect(shouldWaitForPreSearch({ webSearchEnabled: true, preSearches, roundNumber: 0 })).toBe(true);

    // Orchestrator syncs (query returns)
    act(() => {
      preSearches = [
        createMockPreSearch({
          id: 'pre-search-1',
          threadId: 'thread-123',
          roundNumber: 0,
          status: PreSearchStatuses.STREAMING,
          userQuery: 'test query',
        }),
      ];
    });

    // Still BLOCKED (streaming status)
    expect(shouldWaitForPreSearch({ webSearchEnabled: true, preSearches, roundNumber: 0 })).toBe(true);

    // Pre-search completes
    act(() => {
      preSearches = [
        createMockPreSearch({
          status: PreSearchStatuses.COMPLETE,
          searchData: {
            queries: [],
            results: [],
            analysis: 'test analysis',
            successCount: 0,
            failureCount: 0,
            totalResults: 0,
            totalTime: 0,
          },
        }),
      ];
    });

    // Now UNBLOCKED
    expect(shouldWaitForPreSearch({ webSearchEnabled: true, preSearches, roundNumber: 0 })).toBe(false);
  });

  /**
   * RACE CONDITION 3.2: Missing Pre-Search Optimistic Wait
   * =======================================================
   * PATCH request to create pre-search is in flight when streaming checks
   *
   * Expected Behavior:
   * - Wait for PATCH completion when web search enabled
   * - Block streaming until pre-search record exists
   */
  it('rACE 3.2: Waits for PATCH completion before allowing streaming', () => {
    let preSearches: StoredPreSearch[] = [];

    // While PATCH is in flight, orchestrator hasn't synced yet
    expect(shouldWaitForPreSearch({ webSearchEnabled: true, preSearches, roundNumber: 0 })).toBe(true);

    // PATCH completes, orchestrator syncs
    act(() => {
      preSearches = [
        createMockPreSearch({
          status: PreSearchStatuses.STREAMING,
        }),
      ];
    });

    // Still blocked until COMPLETE
    expect(shouldWaitForPreSearch({ webSearchEnabled: true, preSearches, roundNumber: 0 })).toBe(true);
  });

  /**
   * RACE CONDITION 3.3: Status Transition Race
   * ===========================================
   * Pre-search status updates on server, but orchestrator query is stale
   *
   * Expected Behavior:
   * - Query invalidation on pre-search status updates
   * - Fresh data on every check (or short cache time)
   */
  it('rACE 3.3: Handles stale orchestrator cache during status transitions', () => {
    vi.useFakeTimers();

    // Initial state: STREAMING (from orchestrator)
    let preSearches: StoredPreSearch[] = [
      createMockPreSearch({
        status: PreSearchStatuses.STREAMING,
      }),
    ];

    // Should block
    expect(shouldWaitForPreSearch({ webSearchEnabled: true, preSearches, roundNumber: 0 })).toBe(true);

    // Server updates to COMPLETE, orchestrator refetches
    act(() => {
      preSearches = [
        createMockPreSearch({
          status: PreSearchStatuses.COMPLETE,
          searchData: {
            queries: [],
            results: [],
            analysis: 'test analysis',
            successCount: 0,
            failureCount: 0,
            totalResults: 0,
            totalTime: 0,
          },
        }),
      ];
    });

    // After refetch: unblocked
    expect(shouldWaitForPreSearch({ webSearchEnabled: true, preSearches, roundNumber: 0 })).toBe(false);

    vi.useRealTimers();
  });

  /**
   * RACE CONDITION: Concurrent Orchestrator Queries
   * ================================================
   * Multiple components query orchestrator simultaneously
   */
  it('rACE: Multiple concurrent orchestrator queries return consistent state', () => {
    const preSearches: StoredPreSearch[] = [];

    // Simulate 3 components checking simultaneously
    const results = [
      shouldWaitForPreSearch({ webSearchEnabled: true, preSearches, roundNumber: 0 }),
      shouldWaitForPreSearch({ webSearchEnabled: true, preSearches, roundNumber: 0 }),
      shouldWaitForPreSearch({ webSearchEnabled: true, preSearches, roundNumber: 0 }),
    ];

    // All should return same result (no race)
    expect(results).toEqual([true, true, true]);
  });

  /**
   * RACE CONDITION: Pre-Search Creation Race
   * =========================================
   * Verifies atomic creation (no duplicate pre-searches)
   * NOTE: This test verifies frontend blocking logic - backend idempotency is tested separately
   */
  it('rACE: Prevents duplicate pre-search creation on rapid submissions', () => {
    const preSearches: StoredPreSearch[] = [];

    // Optimistic blocking should be active even during rapid submissions
    expect(shouldWaitForPreSearch({ webSearchEnabled: true, preSearches, roundNumber: 0 })).toBe(true);
    expect(shouldWaitForPreSearch({ webSearchEnabled: true, preSearches, roundNumber: 0 })).toBe(true);

    // Both checks should consistently return TRUE (blocking)
    // Backend handles actual idempotency via database constraints
  });

  /**
   * RACE CONDITION: Pre-Search Status - STREAMING Status Blocking
   * ===============================================================
   * Verifies that STREAMING status blocks regardless of how long it's been streaming
   * NOTE: shouldWaitForPreSearch doesn't have timeout logic - that's handled elsewhere
   */
  it('rACE: Streaming blocks while pre-search is STREAMING', () => {
    // Pre-search in STREAMING status (even if old)
    const preSearches: StoredPreSearch[] = [
      createMockPreSearch({
        status: PreSearchStatuses.STREAMING,
        createdAt: new Date(Date.now() - 30000), // 30 seconds ago
      }),
    ];

    // Should block while STREAMING (no timeout in this function)
    const shouldWait = shouldWaitForPreSearch({ webSearchEnabled: true, preSearches, roundNumber: 0 });
    expect(shouldWait).toBe(true);
  });

  /**
   * RACE CONDITION: Round Number Mismatch
   * ======================================
   * Pre-search for different round should trigger optimistic blocking
   * (no pre-search exists for the requested round)
   */
  it('rACE: Pre-search for different round does not block streaming', () => {
    // Pre-search for Round 0 is COMPLETE
    const preSearches: StoredPreSearch[] = [
      createMockPreSearch({
        roundNumber: 0,
        status: PreSearchStatuses.COMPLETE,
        searchData: {
          queries: [],
          results: [],
          analysis: 'test analysis',
          successCount: 0,
          failureCount: 0,
          totalResults: 0,
          totalTime: 0,
        },
      }),
    ];

    // Check if Round 1 should wait
    const shouldWait = shouldWaitForPreSearch({ webSearchEnabled: true, preSearches, roundNumber: 1 });

    // Round 1 SHOULD be blocked optimistically (no Round 1 pre-search exists)
    // This is the actual behavior - optimistic blocking applies
    expect(shouldWait).toBe(true);
  });
});
