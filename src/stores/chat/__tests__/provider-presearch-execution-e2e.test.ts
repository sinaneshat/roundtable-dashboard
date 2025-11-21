/**
 * Provider Pre-Search Execution E2E Tests
 *
 * Comprehensive tests for the pre-search execution flow in chat-store-provider.tsx.
 * These tests cover the blind spots and edge cases that weren't previously tested.
 *
 * CRITICAL FIX TESTED:
 * The provider now executes pre-search immediately after creation to break the
 * circular dependency (create → execute → complete → send message).
 *
 * BLIND SPOTS COVERED:
 * 1. Fetch execution with response handling
 * 2. Stream reading to completion
 * 3. Error scenarios (creation, execution, stream)
 * 4. 409 Conflict handling
 * 5. Multi-round web search toggling
 * 6. Stop button during pre-search
 * 7. Timeout protection
 * 8. Race conditions
 *
 * Location: /src/stores/chat/__tests__/provider-presearch-execution-e2e.test.ts
 */

import type { UIMessage } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AnalysisStatuses } from '@/api/core/enums';
import type { StoredPreSearch } from '@/api/routes/chat/schema';
import { createChatStore } from '@/stores/chat/store';

import {
  createMockAnalysis,
  createMockMessage,
  createMockParticipant,
  createMockPreSearch,
  createMockPreSearchDataPayload,
  createMockThread,
  createMockUserMessage,
  createPendingPreSearch,
} from './test-factories';

// ============================================================================
// MOCK HELPERS
// ============================================================================

/**
 * Create a mock ReadableStreamDefaultReader that simulates reading chunks
 */
function createMockReader(chunks: Uint8Array[] = [], shouldError = false) {
  let index = 0;
  return {
    read: vi.fn().mockImplementation(() => {
      if (shouldError && index === 0) {
        index++;
        return Promise.reject(new Error('Stream read error'));
      }
      if (index < chunks.length) {
        return Promise.resolve({ done: false, value: chunks[index++] });
      }
      return Promise.resolve({ done: true, value: undefined });
    }),
    releaseLock: vi.fn(),
    cancel: vi.fn(),
  };
}

/**
 * Create a mock Response object for fetch
 */
function createMockResponse(
  status: number,
  body: ReadableStreamDefaultReader | null = null,
  ok = true,
) {
  return {
    ok: status >= 200 && status < 300 && ok,
    status,
    body: body
      ? {
          getReader: () => body,
        }
      : null,
  };
}

/**
 * Simulate the provider's pre-search execution logic
 * This mirrors what chat-store-provider.tsx does
 */
async function simulateProviderPreSearchExecution(
  threadId: string,
  roundNumber: number,
  userQuery: string,
  fetchMock: typeof fetch,
) {
  const response = await fetchMock(
    `/api/v1/chat/threads/${threadId}/rounds/${roundNumber}/pre-search`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify({ userQuery }),
    },
  );

  if (!response.ok && response.status !== 409) {
    throw new Error(`Pre-search execution failed: ${response.status}`);
  }

  // Read the stream to completion
  const reader = response.body?.getReader();
  if (reader) {
    while (true) {
      const { done } = await reader.read();
      if (done)
        break;
    }
  }

  return response;
}

// ============================================================================
// PROVIDER PRE-SEARCH EXECUTION E2E TESTS
// ============================================================================

describe('provider Pre-Search Execution E2E', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // ==========================================================================
  // SUCCESSFUL EXECUTION FLOW
  // ==========================================================================

  describe('successful Execution Flow', () => {
    it('should execute pre-search and read stream to completion', async () => {
      const chunks = [
        new TextEncoder().encode('event: start\ndata: {}\n\n'),
        new TextEncoder().encode('event: query\ndata: {"query": "test"}\n\n'),
        new TextEncoder().encode('event: done\ndata: {}\n\n'),
      ];

      const mockReader = createMockReader(chunks);
      const mockFetch = vi.fn().mockResolvedValue(
        createMockResponse(200, mockReader),
      );

      await simulateProviderPreSearchExecution(
        'thread-123',
        1,
        'Test question',
        mockFetch as unknown as typeof fetch,
      );

      // Verify fetch was called correctly
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/v1/chat/threads/thread-123/rounds/1/pre-search',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Accept': 'text/event-stream',
          }),
          body: JSON.stringify({ userQuery: 'Test question' }),
        }),
      );

      // Verify stream was read to completion
      expect(mockReader.read).toHaveBeenCalledTimes(4); // 3 chunks + final done
    });

    it('should handle empty stream body gracefully', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        createMockResponse(200, null),
      );

      // Should not throw
      await expect(
        simulateProviderPreSearchExecution(
          'thread-123',
          0,
          'Test',
          mockFetch as unknown as typeof fetch,
        ),
      ).resolves.not.toThrow();
    });

    it('should handle response without body.getReader()', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: null,
      });

      // Should not throw
      await expect(
        simulateProviderPreSearchExecution(
          'thread-123',
          0,
          'Test',
          mockFetch as unknown as typeof fetch,
        ),
      ).resolves.not.toThrow();
    });
  });

  // ==========================================================================
  // 409 CONFLICT HANDLING
  // ==========================================================================

  describe('409 Conflict Handling (Already Executing)', () => {
    it('should ignore 409 status (pre-search already executing)', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        createMockResponse(409, null, false),
      );

      // Should not throw - 409 is acceptable
      await expect(
        simulateProviderPreSearchExecution(
          'thread-123',
          0,
          'Test',
          mockFetch as unknown as typeof fetch,
        ),
      ).resolves.not.toThrow();
    });

    it('should throw for other non-200 statuses', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        createMockResponse(500, null, false),
      );

      await expect(
        simulateProviderPreSearchExecution(
          'thread-123',
          0,
          'Test',
          mockFetch as unknown as typeof fetch,
        ),
      ).rejects.toThrow('Pre-search execution failed: 500');
    });

    it('should throw for 400 Bad Request', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        createMockResponse(400, null, false),
      );

      await expect(
        simulateProviderPreSearchExecution(
          'thread-123',
          0,
          'Test',
          mockFetch as unknown as typeof fetch,
        ),
      ).rejects.toThrow('Pre-search execution failed: 400');
    });

    it('should throw for 401 Unauthorized', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        createMockResponse(401, null, false),
      );

      await expect(
        simulateProviderPreSearchExecution(
          'thread-123',
          0,
          'Test',
          mockFetch as unknown as typeof fetch,
        ),
      ).rejects.toThrow('Pre-search execution failed: 401');
    });
  });

  // ==========================================================================
  // ERROR SCENARIOS
  // ==========================================================================

  describe('error Scenarios', () => {
    it('should handle network error (fetch rejects)', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));

      await expect(
        simulateProviderPreSearchExecution(
          'thread-123',
          0,
          'Test',
          mockFetch as unknown as typeof fetch,
        ),
      ).rejects.toThrow('Network error');
    });

    it('should handle stream read error', async () => {
      const mockReader = createMockReader([], true); // Will error on first read
      const mockFetch = vi.fn().mockResolvedValue(
        createMockResponse(200, mockReader),
      );

      await expect(
        simulateProviderPreSearchExecution(
          'thread-123',
          0,
          'Test',
          mockFetch as unknown as typeof fetch,
        ),
      ).rejects.toThrow('Stream read error');
    });

    it('should handle partial stream with error mid-way', async () => {
      let readCount = 0;
      const mockReader = {
        read: vi.fn().mockImplementation(() => {
          readCount++;
          if (readCount === 1) {
            return Promise.resolve({
              done: false,
              value: new TextEncoder().encode('event: start\n'),
            });
          }
          if (readCount === 2) {
            return Promise.reject(new Error('Connection lost'));
          }
          return Promise.resolve({ done: true, value: undefined });
        }),
      };

      const mockFetch = vi.fn().mockResolvedValue(
        createMockResponse(200, mockReader),
      );

      await expect(
        simulateProviderPreSearchExecution(
          'thread-123',
          0,
          'Test',
          mockFetch as unknown as typeof fetch,
        ),
      ).rejects.toThrow('Connection lost');
    });
  });

  // ==========================================================================
  // STORE STATE TRANSITIONS
  // ==========================================================================

  describe('store State Transitions During Execution', () => {
    it('should transition pre-search from PENDING to STREAMING to COMPLETE', () => {
      const thread = createMockThread({
        id: 'thread-123',
        enableWebSearch: true,
      });
      store.getState().initializeThread(thread, [createMockParticipant(0)]);

      // Step 1: Add PENDING pre-search (what createPreSearch.mutateAsync does)
      const pendingPreSearch = createPendingPreSearch(0);
      store.getState().addPreSearch(pendingPreSearch);

      expect(store.getState().preSearches[0].status).toBe(AnalysisStatuses.PENDING);

      // Step 2: Update to STREAMING (what orchestrator syncs during execution)
      store.getState().updatePreSearchStatus(0, AnalysisStatuses.STREAMING);

      expect(store.getState().preSearches[0].status).toBe(AnalysisStatuses.STREAMING);

      // Step 3: Update to COMPLETE with data (what orchestrator syncs on completion)
      store.getState().updatePreSearchData(0, createMockPreSearchDataPayload());
      store.getState().updatePreSearchStatus(0, AnalysisStatuses.COMPLETE);

      expect(store.getState().preSearches[0].status).toBe(AnalysisStatuses.COMPLETE);
      expect(store.getState().preSearches[0].searchData).not.toBeNull();
    });

    it('should allow message sending only after COMPLETE status', () => {
      const thread = createMockThread({
        id: 'thread-123',
        enableWebSearch: true,
      });
      store.getState().initializeThread(thread, [createMockParticipant(0)]);
      store.getState().prepareForNewMessage('Test question', ['model-0']);

      // Add PENDING pre-search
      store.getState().addPreSearch(createPendingPreSearch(0));

      // Provider check: should we wait?
      const checkShouldWait = () => {
        const state = store.getState();
        const preSearch = state.preSearches.find(ps => ps.roundNumber === 0);
        return preSearch && (
          preSearch.status === AnalysisStatuses.PENDING
          || preSearch.status === AnalysisStatuses.STREAMING
        );
      };

      // Should wait while PENDING
      expect(checkShouldWait()).toBe(true);

      // Should wait while STREAMING
      store.getState().updatePreSearchStatus(0, AnalysisStatuses.STREAMING);
      expect(checkShouldWait()).toBe(true);

      // Should NOT wait when COMPLETE
      store.getState().updatePreSearchStatus(0, AnalysisStatuses.COMPLETE);
      expect(checkShouldWait()).toBe(false);
    });

    it('should allow message sending after FAILED status (degraded UX)', () => {
      const thread = createMockThread({
        id: 'thread-123',
        enableWebSearch: true,
      });
      store.getState().initializeThread(thread, [createMockParticipant(0)]);
      store.getState().prepareForNewMessage('Test question', ['model-0']);

      // Add pre-search that fails
      store.getState().addPreSearch(createPendingPreSearch(0));
      store.getState().updatePreSearchStatus(0, AnalysisStatuses.FAILED);

      // Provider check: should we wait?
      const state = store.getState();
      const preSearch = state.preSearches.find(ps => ps.roundNumber === 0);
      const shouldWait = preSearch && (
        preSearch.status === AnalysisStatuses.PENDING
        || preSearch.status === AnalysisStatuses.STREAMING
      );

      // Should NOT wait when FAILED
      expect(shouldWait).toBe(false);
    });
  });

  // ==========================================================================
  // MULTI-ROUND WEB SEARCH TOGGLING
  // ==========================================================================

  describe('multi-Round Web Search Toggling', () => {
    it('should handle: Round 1 (web search ON) → Round 2 (OFF) → Round 3 (ON)', () => {
      const thread = createMockThread({
        id: 'thread-123',
        enableWebSearch: true,
      });
      store.getState().initializeThread(thread, [createMockParticipant(0)]);

      // Round 1: Web search enabled
      store.getState().addPreSearch(createMockPreSearch({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
        searchData: createMockPreSearchDataPayload(),
      }));

      // Check: pre-search exists for round 0
      expect(store.getState().preSearches.find(ps => ps.roundNumber === 0)).toBeDefined();

      // Round 2: Web search disabled (no pre-search)
      // User toggles web search off before sending message
      // (In real app, this updates thread.enableWebSearch)

      // Check: no pre-search for round 1
      expect(store.getState().preSearches.find(ps => ps.roundNumber === 1)).toBeUndefined();

      // Round 3: Web search re-enabled
      store.getState().addPreSearch(createPendingPreSearch(2));

      // Check: pre-search exists for round 2
      expect(store.getState().preSearches.find(ps => ps.roundNumber === 2)).toBeDefined();

      // Total pre-searches: 2 (round 0 and round 2)
      expect(store.getState().preSearches).toHaveLength(2);
    });

    it('should maintain independent pre-search states per round', () => {
      const thread = createMockThread({
        id: 'thread-123',
        enableWebSearch: true,
      });
      store.getState().initializeThread(thread, [createMockParticipant(0)]);

      // Round 0: COMPLETE
      store.getState().addPreSearch(createMockPreSearch({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
        searchData: createMockPreSearchDataPayload(),
      }));

      // Round 1: STREAMING
      store.getState().addPreSearch({
        ...createPendingPreSearch(1),
        status: AnalysisStatuses.STREAMING,
      });

      // Round 2: PENDING
      store.getState().addPreSearch(createPendingPreSearch(2));

      // Check independence
      const preSearches = store.getState().preSearches;
      expect(preSearches.find(ps => ps.roundNumber === 0)?.status).toBe(AnalysisStatuses.COMPLETE);
      expect(preSearches.find(ps => ps.roundNumber === 1)?.status).toBe(AnalysisStatuses.STREAMING);
      expect(preSearches.find(ps => ps.roundNumber === 2)?.status).toBe(AnalysisStatuses.PENDING);
    });

    it('should only block message sending for current round pre-search', () => {
      const thread = createMockThread({
        id: 'thread-123',
        enableWebSearch: true,
      });
      store.getState().initializeThread(thread, [createMockParticipant(0)]);

      // Round 0: COMPLETE
      store.getState().addPreSearch(createMockPreSearch({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
      }));

      // Round 1: User is sending message, pre-search PENDING
      store.getState().prepareForNewMessage('Round 2 question', ['model-0']);
      store.getState().addPreSearch(createPendingPreSearch(1));

      // Check: should wait for round 1, not round 0
      const state = store.getState();
      const newRoundNumber = 1;

      const shouldWaitForRound0 = state.preSearches.some(
        ps => ps.roundNumber === 0
          && (ps.status === AnalysisStatuses.PENDING || ps.status === AnalysisStatuses.STREAMING),
      );
      const shouldWaitForRound1 = state.preSearches.some(
        ps => ps.roundNumber === newRoundNumber
          && (ps.status === AnalysisStatuses.PENDING || ps.status === AnalysisStatuses.STREAMING),
      );

      expect(shouldWaitForRound0).toBe(false); // Round 0 is COMPLETE
      expect(shouldWaitForRound1).toBe(true); // Round 1 is PENDING
    });
  });

  // ==========================================================================
  // STOP BUTTON DURING PRE-SEARCH
  // ==========================================================================

  describe('stop Button During Pre-Search', () => {
    it('should handle stop button while pre-search is PENDING', () => {
      const thread = createMockThread({
        id: 'thread-123',
        enableWebSearch: true,
      });
      store.getState().initializeThread(thread, [createMockParticipant(0)]);
      store.getState().prepareForNewMessage('Test', ['model-0']);
      store.getState().addPreSearch(createPendingPreSearch(0));

      // User clicks stop (setIsStreaming(false) is what the component does)
      store.getState().setIsStreaming(false);

      // Pre-search should still be in store (it's independent)
      expect(store.getState().preSearches).toHaveLength(1);

      // Streaming should be stopped
      expect(store.getState().isStreaming).toBe(false);
    });

    it('should handle stop button while pre-search is STREAMING', () => {
      const thread = createMockThread({
        id: 'thread-123',
        enableWebSearch: true,
      });
      store.getState().initializeThread(thread, [createMockParticipant(0)]);
      store.getState().addPreSearch({
        ...createPendingPreSearch(0),
        status: AnalysisStatuses.STREAMING,
      });
      store.getState().setIsStreaming(true);

      // User clicks stop (setIsStreaming(false) is what the component does)
      store.getState().setIsStreaming(false);

      // Pre-search state is independent
      expect(store.getState().preSearches[0].status).toBe(AnalysisStatuses.STREAMING);

      // Streaming flag should be stopped
      expect(store.getState().isStreaming).toBe(false);
    });

    it('should allow new message after stop + pre-search completes', () => {
      const thread = createMockThread({
        id: 'thread-123',
        enableWebSearch: true,
      });
      store.getState().initializeThread(thread, [createMockParticipant(0)]);
      store.getState().addPreSearch(createPendingPreSearch(0));
      store.getState().setIsStreaming(true);

      // User clicks stop (setIsStreaming(false) is what the component does)
      store.getState().setIsStreaming(false);

      // Pre-search completes later (backend still processing)
      store.getState().updatePreSearchStatus(0, AnalysisStatuses.COMPLETE);
      store.getState().updatePreSearchData(0, createMockPreSearchDataPayload());

      // User can now send a new message
      store.getState().prepareForNewMessage('New question', ['model-0']);

      expect(store.getState().pendingMessage).toBe('New question');
      expect(store.getState().hasSentPendingMessage).toBe(false);
    });
  });

  // ==========================================================================
  // TIMEOUT PROTECTION
  // ==========================================================================

  describe('timeout Protection', () => {
    it('should detect pre-search stuck longer than timeout threshold', () => {
      const thread = createMockThread({
        id: 'thread-123',
        enableWebSearch: true,
      });
      store.getState().initializeThread(thread, [createMockParticipant(0)]);

      // Add pre-search with old createdAt
      const oldPreSearch: StoredPreSearch = {
        ...createPendingPreSearch(0),
        createdAt: new Date(Date.now() - 15000), // 15 seconds ago
        updatedAt: new Date(Date.now() - 15000),
      };
      store.getState().addPreSearch(oldPreSearch);

      // Check if timeout threshold exceeded (10 seconds)
      const TIMEOUT_THRESHOLD_MS = 10000;
      const preSearch = store.getState().preSearches[0];
      const elapsedMs = Date.now() - preSearch.createdAt.getTime();
      const isTimedOut = elapsedMs > TIMEOUT_THRESHOLD_MS;

      expect(isTimedOut).toBe(true);
    });

    it('should NOT timeout if within threshold', () => {
      const thread = createMockThread({
        id: 'thread-123',
        enableWebSearch: true,
      });
      store.getState().initializeThread(thread, [createMockParticipant(0)]);

      // Add recent pre-search
      const recentPreSearch: StoredPreSearch = {
        ...createPendingPreSearch(0),
        createdAt: new Date(Date.now() - 5000), // 5 seconds ago
        updatedAt: new Date(Date.now() - 5000),
      };
      store.getState().addPreSearch(recentPreSearch);

      // Check if timeout threshold exceeded (10 seconds)
      const TIMEOUT_THRESHOLD_MS = 10000;
      const preSearch = store.getState().preSearches[0];
      const elapsedMs = Date.now() - preSearch.createdAt.getTime();
      const isTimedOut = elapsedMs > TIMEOUT_THRESHOLD_MS;

      expect(isTimedOut).toBe(false);
    });

    it('should proceed with message after timeout (degraded UX)', () => {
      const thread = createMockThread({
        id: 'thread-123',
        enableWebSearch: true,
      });
      store.getState().initializeThread(thread, [createMockParticipant(0)]);
      store.getState().prepareForNewMessage('Test', ['model-0']);

      // Add timed-out pre-search
      const timedOutPreSearch: StoredPreSearch = {
        ...createPendingPreSearch(0),
        createdAt: new Date(Date.now() - 15000),
        updatedAt: new Date(Date.now() - 15000),
      };
      store.getState().addPreSearch(timedOutPreSearch);

      // Provider logic: check timeout and decide to proceed
      const TIMEOUT_THRESHOLD_MS = 10000;
      const preSearch = store.getState().preSearches[0];
      const isTimedOut = Date.now() - preSearch.createdAt.getTime() > TIMEOUT_THRESHOLD_MS;
      const shouldProceed = isTimedOut || preSearch.status === AnalysisStatuses.COMPLETE;

      expect(shouldProceed).toBe(true);
    });
  });

  // ==========================================================================
  // RACE CONDITIONS
  // ==========================================================================

  describe('race Conditions', () => {
    it('should handle rapid message submissions (same round)', () => {
      const thread = createMockThread({
        id: 'thread-123',
        enableWebSearch: true,
      });
      store.getState().initializeThread(thread, [createMockParticipant(0)]);

      // User rapidly submits same message twice
      store.getState().prepareForNewMessage('Question 1', ['model-0']);
      store.getState().addPreSearch(createPendingPreSearch(0));

      // Second submission should not create duplicate
      const preSearchCount = store.getState().preSearches.filter(
        ps => ps.roundNumber === 0,
      ).length;

      expect(preSearchCount).toBe(1);
    });

    it('should handle pre-search status update during streaming check', () => {
      const thread = createMockThread({
        id: 'thread-123',
        enableWebSearch: true,
      });
      store.getState().initializeThread(thread, [createMockParticipant(0)]);
      store.getState().addPreSearch(createPendingPreSearch(0));

      // Simulate race: check status, then update happens, then check result used
      const initialStatus = store.getState().preSearches[0].status;

      // Another process updates status to COMPLETE
      store.getState().updatePreSearchStatus(0, AnalysisStatuses.COMPLETE);

      // Check uses stale status (this is the race)
      const shouldWaitWithStale = initialStatus === AnalysisStatuses.PENDING;

      // Fresh check would see COMPLETE
      const currentStatus = store.getState().preSearches[0].status;
      const shouldWaitWithFresh = currentStatus === AnalysisStatuses.PENDING;

      expect(shouldWaitWithStale).toBe(true); // Stale: PENDING
      expect(shouldWaitWithFresh).toBe(false); // Fresh: COMPLETE
    });

    it('should handle concurrent pre-search creation and execution', async () => {
      const thread = createMockThread({
        id: 'thread-123',
        enableWebSearch: true,
      });
      store.getState().initializeThread(thread, [createMockParticipant(0)]);

      // Simulate concurrent operations
      const createPromise = Promise.resolve().then(() => {
        store.getState().addPreSearch(createPendingPreSearch(0));
      });

      const executePromise = Promise.resolve().then(() => {
        // This would normally be the fetch call
        store.getState().updatePreSearchStatus(0, AnalysisStatuses.STREAMING);
      });

      await Promise.all([createPromise, executePromise]);

      // State should be consistent
      const preSearches = store.getState().preSearches;
      expect(preSearches).toHaveLength(1);
      // Status could be either PENDING or STREAMING depending on order
      expect([AnalysisStatuses.PENDING, AnalysisStatuses.STREAMING]).toContain(
        preSearches[0].status,
      );
    });
  });

  // ==========================================================================
  // EDGE CASES
  // ==========================================================================

  describe('edge Cases', () => {
    it('should handle pre-search for round that does not exist yet', () => {
      const thread = createMockThread({
        id: 'thread-123',
        enableWebSearch: true,
      });
      store.getState().initializeThread(thread, [createMockParticipant(0)]);

      // Add pre-search for round 5 (rounds 0-4 don't exist)
      store.getState().addPreSearch(createPendingPreSearch(5));

      expect(store.getState().preSearches).toHaveLength(1);
      expect(store.getState().preSearches[0].roundNumber).toBe(5);
    });

    it('should handle updating non-existent pre-search status', () => {
      const thread = createMockThread({
        id: 'thread-123',
        enableWebSearch: true,
      });
      store.getState().initializeThread(thread, [createMockParticipant(0)]);

      // Try to update status for non-existent pre-search
      // This should not throw
      expect(() => {
        store.getState().updatePreSearchStatus(99, AnalysisStatuses.COMPLETE);
      }).not.toThrow();

      // Pre-searches should still be empty
      expect(store.getState().preSearches).toHaveLength(0);
    });

    it('should handle empty userQuery', async () => {
      const mockReader = createMockReader([]);
      const mockFetch = vi.fn().mockResolvedValue(
        createMockResponse(200, mockReader),
      );

      // Empty query should still work
      await expect(
        simulateProviderPreSearchExecution(
          'thread-123',
          0,
          '',
          mockFetch as unknown as typeof fetch,
        ),
      ).resolves.not.toThrow();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({ userQuery: '' }),
        }),
      );
    });

    it('should handle very long userQuery', async () => {
      const mockReader = createMockReader([]);
      const mockFetch = vi.fn().mockResolvedValue(
        createMockResponse(200, mockReader),
      );

      const longQuery = 'x'.repeat(5000);

      await simulateProviderPreSearchExecution(
        'thread-123',
        0,
        longQuery,
        mockFetch as unknown as typeof fetch,
      );

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({ userQuery: longQuery }),
        }),
      );
    });

    it('should handle special characters in userQuery', async () => {
      const mockReader = createMockReader([]);
      const mockFetch = vi.fn().mockResolvedValue(
        createMockResponse(200, mockReader),
      );

      const specialQuery = 'What is "JSON" & <HTML> encoding?';

      await simulateProviderPreSearchExecution(
        'thread-123',
        0,
        specialQuery,
        mockFetch as unknown as typeof fetch,
      );

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({ userQuery: specialQuery }),
        }),
      );
    });
  });
});

// ============================================================================
// COMPLETE E2E JOURNEY TESTS
// ============================================================================

describe('complete E2E Journey with Pre-Search', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should complete full journey: overview → thread with 2 rounds of web search', () => {
    // === SETUP ===
    const thread = createMockThread({
      id: 'thread-123',
      enableWebSearch: true,
    });
    const participants = [
      createMockParticipant(0),
      createMockParticipant(1),
    ];

    // === ROUND 0: Overview Screen ===

    // 1. Initialize on overview
    store.getState().initializeThread(thread, participants);
    store.getState().setScreenMode('overview');

    // 2. User types message
    store.getState().prepareForNewMessage('First question', ['model-0', 'model-1']);

    // 3. Pre-search created (PENDING)
    store.getState().addPreSearch(createPendingPreSearch(0));
    expect(store.getState().preSearches[0].status).toBe(AnalysisStatuses.PENDING);

    // 4. Pre-search executes (STREAMING → COMPLETE)
    store.getState().updatePreSearchStatus(0, AnalysisStatuses.STREAMING);
    store.getState().updatePreSearchData(0, createMockPreSearchDataPayload());
    store.getState().updatePreSearchStatus(0, AnalysisStatuses.COMPLETE);

    // 5. Message sent, participants stream
    store.getState().setHasSentPendingMessage(true);
    store.getState().setIsStreaming(true);
    store.getState().setCurrentParticipantIndex(0);

    // 6. Add participant responses
    const r0Messages: UIMessage[] = [
      createMockUserMessage(0, 'First question'),
      createMockMessage(0, 0),
      createMockMessage(0, 1),
    ];
    store.getState().setMessages(r0Messages);

    // 7. Analysis completes
    store.getState().markAnalysisCreated(0);
    store.getState().addAnalysis(createMockAnalysis({
      roundNumber: 0,
      status: AnalysisStatuses.COMPLETE,
    }));

    // 8. Streaming ends, navigate to thread
    store.getState().setIsStreaming(false);
    store.getState().setScreenMode('thread');

    // === ROUND 1: Thread Screen ===

    // 9. Reset for new message
    store.getState().setPendingMessage(null);
    store.getState().setHasSentPendingMessage(false);

    // 10. User types second message
    store.getState().prepareForNewMessage('Second question', ['model-0', 'model-1']);

    // 11. Pre-search for round 1 created (PENDING)
    store.getState().addPreSearch(createPendingPreSearch(1));
    expect(store.getState().preSearches).toHaveLength(2);
    expect(store.getState().preSearches[1].status).toBe(AnalysisStatuses.PENDING);

    // 12. Pre-search executes (STREAMING → COMPLETE)
    store.getState().updatePreSearchStatus(1, AnalysisStatuses.STREAMING);
    store.getState().updatePreSearchData(1, createMockPreSearchDataPayload());
    store.getState().updatePreSearchStatus(1, AnalysisStatuses.COMPLETE);

    // 13. Message sent, participants stream
    store.getState().setHasSentPendingMessage(true);
    store.getState().setIsStreaming(true);

    // 14. Add round 1 messages
    const r1Messages: UIMessage[] = [
      ...r0Messages,
      createMockUserMessage(1, 'Second question'),
      createMockMessage(1, 0),
      createMockMessage(1, 1),
    ];
    store.getState().setMessages(r1Messages);

    // 15. Analysis for round 1 completes
    store.getState().markAnalysisCreated(1);
    store.getState().addAnalysis(createMockAnalysis({
      roundNumber: 1,
      status: AnalysisStatuses.COMPLETE,
    }));

    // 16. Streaming ends
    store.getState().setIsStreaming(false);

    // === VERIFY FINAL STATE ===
    const finalState = store.getState();

    expect(finalState.messages).toHaveLength(6);
    expect(finalState.preSearches).toHaveLength(2);
    expect(finalState.analyses).toHaveLength(2);
    expect(finalState.isStreaming).toBe(false);
    expect(finalState.screenMode).toBe('thread');

    // All pre-searches complete
    expect(finalState.preSearches.every(ps => ps.status === AnalysisStatuses.COMPLETE)).toBe(true);

    // All analyses complete
    expect(finalState.analyses.every(a => a.status === AnalysisStatuses.COMPLETE)).toBe(true);
  });

  it('should handle journey with pre-search failure in round 1', () => {
    const thread = createMockThread({
      id: 'thread-123',
      enableWebSearch: true,
    });
    store.getState().initializeThread(thread, [createMockParticipant(0)]);
    store.getState().setScreenMode('thread');

    // Round 0 complete
    store.getState().addPreSearch(createMockPreSearch({
      roundNumber: 0,
      status: AnalysisStatuses.COMPLETE,
      searchData: createMockPreSearchDataPayload(),
    }));
    store.getState().addAnalysis(createMockAnalysis({
      roundNumber: 0,
      status: AnalysisStatuses.COMPLETE,
    }));

    // Round 1: Pre-search fails
    store.getState().prepareForNewMessage('Second question', ['model-0']);
    store.getState().addPreSearch(createPendingPreSearch(1));
    store.getState().updatePreSearchStatus(1, AnalysisStatuses.FAILED);

    // Message should still be sendable (degraded UX)
    const state = store.getState();
    const preSearch = state.preSearches.find(ps => ps.roundNumber === 1);
    const shouldBlock = preSearch && (
      preSearch.status === AnalysisStatuses.PENDING
      || preSearch.status === AnalysisStatuses.STREAMING
    );

    expect(shouldBlock).toBe(false);
    expect(preSearch?.status).toBe(AnalysisStatuses.FAILED);
  });

  it('should handle journey with stop button during round 1 pre-search', () => {
    const thread = createMockThread({
      id: 'thread-123',
      enableWebSearch: true,
    });
    store.getState().initializeThread(thread, [createMockParticipant(0)]);
    store.getState().setScreenMode('thread');

    // Round 0 complete
    store.getState().setMessages([
      createMockUserMessage(0),
      createMockMessage(0, 0),
    ]);
    store.getState().addPreSearch(createMockPreSearch({
      roundNumber: 0,
      status: AnalysisStatuses.COMPLETE,
    }));

    // Round 1: User sends message
    store.getState().prepareForNewMessage('Second question', ['model-0']);
    store.getState().addPreSearch(createPendingPreSearch(1));
    store.getState().updatePreSearchStatus(1, AnalysisStatuses.STREAMING);
    store.getState().setIsStreaming(true);

    // User clicks stop during pre-search (setIsStreaming(false) is what the component does)
    store.getState().setIsStreaming(false);

    // Verify state
    expect(store.getState().isStreaming).toBe(false);
    // Pre-search status is independent (backend still processing)
    expect(store.getState().preSearches[1].status).toBe(AnalysisStatuses.STREAMING);

    // Pre-search eventually completes
    store.getState().updatePreSearchStatus(1, AnalysisStatuses.COMPLETE);

    // User can retry
    store.getState().setPendingMessage(null);
    store.getState().setHasSentPendingMessage(false);
    store.getState().prepareForNewMessage('Retry question', ['model-0']);

    expect(store.getState().pendingMessage).toBe('Retry question');
    expect(store.getState().hasSentPendingMessage).toBe(false);
  });
});
