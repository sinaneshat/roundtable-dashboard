/**
 * Race Conditions: Pre-Search Blocking Tests
 *
 * Tests race conditions where participant streaming might start before
 * web search (pre-search) is completed. This is critical for ensuring
 * AI models have the search context before they answer.
 *
 * Location: /src/stores/chat/__tests__/race-conditions-presearch-blocking.test.ts
 */

import type { UIMessage } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AnalysisStatuses, MessagePartTypes, MessageRoles } from '@/api/core/enums';
import { shouldWaitForPreSearch } from '@/stores/chat/actions/pending-message-sender';
import { createChatStore } from '@/stores/chat/store';

import {
  createMockParticipant,
  createMockPreSearch,
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
  // ✅ FIX: Use form state as sole source of truth for web search enabled
  function checkShouldWait(roundNumber: number) {
    const state = store.getState();
    const webSearchEnabled = state.enableWebSearch;

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

  // ==========================================================================
  // RACE 5: OVERVIEW SCREEN PRE-SEARCH COMPLETION SYNC
  // ==========================================================================

  describe('rACE 5: Overview Screen Pre-Search Completion Sync', () => {
    // Helper to create a user message
    function createUserMessage(content: string, roundNumber = 0): UIMessage {
      return {
        id: `msg-user-${roundNumber}`,
        role: MessageRoles.USER,
        parts: [{ type: MessagePartTypes.TEXT, text: content }],
        createdAt: new Date(),
        metadata: {
          role: MessageRoles.USER,
          roundNumber,
          createdAt: new Date().toISOString(),
        },
      };
    }

    it('should unblock streaming when pre-search status transitions from PENDING to COMPLETE', () => {
      // Setup: Exact state from user's bug report
      const thread = createMockThread({
        id: '01KAKMMZRY2E7R5V0WD6KFKPHN',
        enableWebSearch: true,
      });

      const participant = createMockParticipant(0, {
        id: '01KAKMMZSABQAZVET0P502M8CH',
        threadId: '01KAKMMZRY2E7R5V0WD6KFKPHN',
        modelId: 'google/gemini-2.5-flash-lite',
      });

      store.getState().initializeThread(thread, [participant]);

      // Set form state to enable web search (sole source of truth)
      store.getState().setEnableWebSearch(true);

      // Add user message
      const userMessage = createUserMessage('say hi, no analysis needed. 1 word. just say hi,. thats all', 0);
      store.getState().setMessages([userMessage]);

      // Set waitingToStartStreaming flag (as set by handleCreateThread)
      store.getState().setWaitingToStartStreaming(true);

      // Add pre-search in PENDING state (backend created it during thread creation)
      const preSearch = createPendingPreSearch(0);
      preSearch.threadId = '01KAKMMZRY2E7R5V0WD6KFKPHN';
      preSearch.userQuery = 'say hi, no analysis needed. 1 word. just say hi,. thats all';
      store.getState().addPreSearch(preSearch);

      // Verify initial state - should be waiting
      expect(store.getState().waitingToStartStreaming).toBe(true);
      expect(checkShouldWait(0)).toBe(true);
      expect(store.getState().preSearches[0]?.status).toBe(AnalysisStatuses.PENDING);

      // KEY TEST: When pre-search completes, store must be DIRECTLY updated
      // This simulates what the fix should do after reading the stream
      store.getState().updatePreSearchStatus(0, AnalysisStatuses.COMPLETE);

      // Now streaming should be unblocked
      expect(checkShouldWait(0)).toBe(false);
      expect(store.getState().preSearches[0]?.status).toBe(AnalysisStatuses.COMPLETE);
    });

    it('should remain blocked if pre-search status is stuck in PENDING', () => {
      // This test shows the BUG - if updatePreSearchStatus is never called,
      // the streaming trigger effect will keep returning early

      const thread = createMockThread({ enableWebSearch: true });
      store.getState().initializeThread(thread, [createMockParticipant(0)]);
      store.getState().setEnableWebSearch(true);

      const userMessage = createUserMessage('test query', 0);
      store.getState().setMessages([userMessage]);

      store.getState().setWaitingToStartStreaming(true);
      store.getState().addPreSearch(createPendingPreSearch(0));

      // BUG: Pre-search never gets updated from PENDING
      // This simulates the race condition where:
      // 1. Provider reads stream to completion
      // 2. Provider only invalidates query
      // 3. Orchestrator is disabled (hasActivePreSearch = true)
      // 4. Store never gets COMPLETE status

      // Streaming stays blocked forever
      expect(checkShouldWait(0)).toBe(true);
      expect(store.getState().waitingToStartStreaming).toBe(true);
    });

    it('should immediately unblock when updatePreSearchStatus is called directly', () => {
      // This test shows the FIX - calling updatePreSearchStatus directly
      // ensures the streaming trigger effect can proceed immediately

      const thread = createMockThread({ enableWebSearch: true });
      store.getState().initializeThread(thread, [createMockParticipant(0)]);
      store.getState().setEnableWebSearch(true);

      const userMessage = createUserMessage('test query', 0);
      store.getState().setMessages([userMessage]);

      store.getState().setWaitingToStartStreaming(true);
      store.getState().addPreSearch(createPendingPreSearch(0));

      // Initially blocked
      expect(checkShouldWait(0)).toBe(true);

      // STREAMING transition
      store.getState().updatePreSearchStatus(0, AnalysisStatuses.STREAMING);
      expect(checkShouldWait(0)).toBe(true); // Still blocked during streaming

      // COMPLETE transition - this is what the fix should do
      store.getState().updatePreSearchStatus(0, AnalysisStatuses.COMPLETE);

      // Immediately unblocked - no orchestrator sync needed!
      expect(checkShouldWait(0)).toBe(false);
    });

    it('should handle the exact state from bug report', () => {
      // Reproduce the exact state from the user's dump
      const thread = createMockThread({
        id: '01KAKMMZRY2E7R5V0WD6KFKPHN',
        userId: '5cc85ab9-afe9-4b29-9cf4-829143183272',
        title: 'Hi',
        slug: 'hi-ebz971',
        mode: 'analyzing' as const,
        enableWebSearch: true,
        isAiGeneratedTitle: true,
      });

      const participant = createMockParticipant(0, {
        id: '01KAKMMZSABQAZVET0P502M8CH',
        threadId: '01KAKMMZRY2E7R5V0WD6KFKPHN',
        modelId: 'google/gemini-2.5-flash-lite',
        priority: 0,
      });

      store.getState().initializeThread(thread, [participant]);
      store.getState().setEnableWebSearch(true);

      // Set the exact state flags from the dump
      store.getState().setWaitingToStartStreaming(true);
      store.getState().setScreenMode('overview');

      // Add user message
      const userMessage = createUserMessage(
        'say hi, no analysis needed. 1 word. just say hi,. thats all',
        0,
      );
      store.getState().setMessages([userMessage]);

      // Add completed pre-search (as shown in dump - status: 'complete')
      const completedPreSearch = createMockPreSearch({
        id: '01KAKMMZVPNVBS90ZFEDSSZY63',
        threadId: '01KAKMMZRY2E7R5V0WD6KFKPHN',
        roundNumber: 0,
        userQuery: 'say hi, no analysis needed. 1 word. just say hi,. thats all',
        status: AnalysisStatuses.COMPLETE,
      });
      store.getState().addPreSearch(completedPreSearch);

      // Verify state matches dump
      const state = store.getState();
      expect(state.waitingToStartStreaming).toBe(true);
      expect(state.isStreaming).toBe(false);
      expect(state.messages).toHaveLength(1);
      expect(state.participants).toHaveLength(1);
      expect(state.preSearches[0]?.status).toBe(AnalysisStatuses.COMPLETE);
      expect(state.screenMode).toBe('overview');

      // With COMPLETE status, streaming should NOT be blocked
      expect(checkShouldWait(0)).toBe(false);

      // The issue in the bug was that even with COMPLETE status,
      // the streaming trigger effect wasn't firing.
      // This suggests the effect dependency wasn't updating,
      // OR the startRound function wasn't available.
      // The fix ensures updatePreSearchStatus is called directly
      // so the effect re-runs with the updated preSearches array.
    });
  });
});
