/**
 * Race Conditions: Pre-Search Blocking Tests
 *
 * Tests race conditions where participant streaming might start before
 * web search (pre-search) is completed. This is critical for ensuring
 * AI models have the search context before they answer.
 *
 * Location: /src/stores/chat/__tests__/race-conditions-presearch-blocking.test.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AnalysisStatuses,
} from '@/api/core/enums';
import { shouldWaitForPreSearch } from '@/stores/chat/actions/pending-message-sender';
import { createChatStore } from '@/stores/chat/store';

import {
  createMockParticipant,
  createMockThread,
  createPendingPreSearch,
} from './test-factories';

function createTestStore() {
  return createChatStore();
}

describe('race Conditions: Pre-Search Blocking', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Helper to check blocking status using the actual logic function
  function checkShouldWait(roundNumber: number) {
    const state = store.getState();
    const webSearchEnabled = state.thread?.enableWebSearch ?? state.enableWebSearch;

    return shouldWaitForPreSearch({
      webSearchEnabled,
      preSearches: state.preSearches,
      roundNumber,
    });
  }

  // ==========================================================================
  // RACE 1: ORCHESTRATOR SYNC TIMING (OPTIMISTIC BLOCKING)
  // ==========================================================================

  describe('rACE 1: Orchestrator Sync Timing', () => {
    it('should identify blocking condition when web search is enabled but NO pre-search record exists yet', () => {
      // Setup: Web search enabled on thread
      const thread = createMockThread({ enableWebSearch: true });
      store.getState().initializeThread(thread, [createMockParticipant(0)]);

      // Current State: preSearches array is EMPTY (orchestrator hasn't synced yet)
      expect(store.getState().preSearches).toHaveLength(0);

      // Logic check: Should we wait?
      const shouldWait = checkShouldWait(0);

      // Expect TRUE because web search is enabled, even if record missing
      expect(shouldWait).toBe(true);
    });

    it('should NOT block if web search is disabled', () => {
      const thread = createMockThread({ enableWebSearch: false });
      store.getState().initializeThread(thread, [createMockParticipant(0)]);

      const shouldWait = checkShouldWait(0);
      expect(shouldWait).toBe(false);
    });
  });

  // ==========================================================================
  // RACE 2: STATUS TRANSITIONS
  // ==========================================================================

  describe('rACE 2: Status Transitions', () => {
    it('should block during PENDING and STREAMING states', () => {
      const thread = createMockThread({ enableWebSearch: true });
      store.getState().initializeThread(thread, [createMockParticipant(0)]);

      const preSearch = createPendingPreSearch(0);
      store.getState().addPreSearch(preSearch);

      // PENDING
      expect(checkShouldWait(0)).toBe(true);

      // STREAMING
      store.getState().updatePreSearchStatus(0, AnalysisStatuses.STREAMING);
      expect(checkShouldWait(0)).toBe(true);

      // COMPLETE
      store.getState().updatePreSearchStatus(0, AnalysisStatuses.COMPLETE);
      expect(checkShouldWait(0)).toBe(false);
    });

    it('should NOT block if pre-search FAILED (error recovery)', () => {
      const thread = createMockThread({ enableWebSearch: true });
      store.getState().initializeThread(thread, [createMockParticipant(0)]);

      const preSearch = createPendingPreSearch(0);
      store.getState().addPreSearch(preSearch);

      store.getState().updatePreSearchStatus(0, AnalysisStatuses.FAILED);

      // Should proceed despite failure to prevent hanging
      expect(checkShouldWait(0)).toBe(false);
    });
  });

  // ==========================================================================
  // RACE 3: TIMEOUT PROTECTION
  // ==========================================================================

  describe('rACE 3: Timeout Protection', () => {
    // Note: The store's shouldWaitForPreSearch doesn't internally track time,
    // but the consuming component sets a timeout.
    // However, we can test if there's a mechanism to bypass.

    it('should allow bypassing checks via manual intervention (simulation)', () => {
      // If a timeout happens, the component might force status to FAILED
      const thread = createMockThread({ enableWebSearch: true });
      store.getState().initializeThread(thread, [createMockParticipant(0)]);
      store.getState().addPreSearch(createPendingPreSearch(0));

      // Still waiting
      expect(checkShouldWait(0)).toBe(true);

      // Timeout handler triggers force fail
      store.getState().updatePreSearchStatus(0, AnalysisStatuses.FAILED);

      // Now unblocked
      expect(checkShouldWait(0)).toBe(false);
    });
  });

  // ==========================================================================
  // RACE 4: ROUND ISOLATION
  // ==========================================================================

  describe('rACE 4: Round Number Isolation', () => {
    it('should only wait for current round pre-search', () => {
      const thread = createMockThread({ enableWebSearch: true });
      store.getState().initializeThread(thread, [createMockParticipant(0)]);

      // Create pre-search for Round 1 (future), but we are in Round 0
      const futurePreSearch = createPendingPreSearch(1); // Round 1
      store.getState().addPreSearch(futurePreSearch);

      // We are in Round 0.
      // IMPORTANT: The test helper assumes we want to know if we should wait for ROUND X's search.
      // Since webSearchEnabled is true for the thread, it expects a search for Round 0 too.
      // So checkShouldWait(0) -> True (missing record)

      // But if we provide a COMPLETED record for Round 0:
      store.getState().addPreSearch({
        ...createPendingPreSearch(0),
        status: AnalysisStatuses.COMPLETE,
      });

      expect(checkShouldWait(0)).toBe(false); // R0 is done

      // Check for Round 1 (should wait)
      expect(checkShouldWait(1)).toBe(true); // R1 is pending/exists
    });
  });
});
