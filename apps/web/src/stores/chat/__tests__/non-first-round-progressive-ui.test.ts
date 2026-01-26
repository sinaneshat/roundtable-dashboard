/**
 * Non-First Round Progressive UI Tests
 *
 * Tests for the bug where non-first rounds (round 1+) don't show progressive
 * UI updates during pre-search streaming.
 *
 * Bug Scenario:
 * 1. User submits message for round 1 on THREAD screen
 * 2. Placeholder pre-search is created with PENDING status
 * 3. SSE stream starts and sends QUERY/RESULT events
 * 4. UI shows "Searching..." but doesn't progressively update with queries/results
 * 5. Only after stream completes does UI show the full results
 *
 * Root Cause Investigation:
 * - PreSearchStream component handles stream with local state (setPartialSearchData)
 * - usePendingMessage hook handles stream by updating store (updatePartialPreSearchData)
 * - Race condition: whoever marks hasPreSearchBeenTriggered first handles the stream
 * - If PreSearchStream wins: uses local state, store stays null during streaming
 * - If usePendingMessage wins: updates store, but PreSearchStream might not re-render
 *
 * This test verifies the store's updatePartialPreSearchData works correctly.
 */

import { MessageStatuses } from '@roundtable/shared';
import { describe, expect, it } from 'vitest';

import type { PartialPreSearchData, StoredPreSearch } from '@/services/api';

import { createChatStore } from '../store';

// ============================================================================
// TEST HELPER FUNCTIONS
// ============================================================================

/**
 * Creates a placeholder pre-search for testing
 */
function createPlaceholderPreSearch(
  threadId: string,
  roundNumber: number,
  userQuery: string,
): StoredPreSearch {
  return {
    completedAt: null,
    createdAt: new Date(),
    errorMessage: null,
    id: `placeholder-presearch-${threadId}-${roundNumber}`,
    roundNumber,
    searchData: null,
    status: MessageStatuses.PENDING,
    threadId,
    userQuery,
  } as StoredPreSearch;
}

/**
 * Creates partial pre-search data with queries
 */
function createPartialDataWithQueries(queryCount: number): PartialPreSearchData {
  return {
    queries: Array.from({ length: queryCount }, (_, i) => ({
      index: i,
      query: `Test query ${i}`,
      rationale: `Test rationale ${i}`,
      searchDepth: 'basic' as const,
      total: queryCount,
    })),
    results: [],
  };
}

/**
 * Creates partial pre-search data with queries and results
 */
function createPartialDataWithResults(
  queryCount: number,
  resultCount: number,
): PartialPreSearchData {
  return {
    queries: Array.from({ length: queryCount }, (_, i) => ({
      index: i,
      query: `Test query ${i}`,
      rationale: `Test rationale ${i}`,
      searchDepth: 'basic' as const,
      total: queryCount,
    })),
    results: Array.from({ length: resultCount }, (_, i) => ({
      answer: null,
      index: i,
      query: `Test query ${i % queryCount}`,
      responseTime: 100,
      results: [
        {
          content: `Content ${i}`,
          excerpt: `Excerpt ${i}`,
          score: 0,
          title: `Result ${i}`,
          url: `https://example.com/${i}`,
        },
      ],
    })),
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('non-first round progressive UI', () => {
  describe('updatePartialPreSearchData', () => {
    it('should update searchData when partial queries arrive', () => {
      const store = createChatStore();
      const threadId = 'thread-123';
      const roundNumber = 1;

      // Create placeholder pre-search
      const placeholder = createPlaceholderPreSearch(threadId, roundNumber, 'test query');
      store.getState().setPreSearches([placeholder]);

      // Verify initial state
      expect(store.getState().preSearches[0]?.searchData).toBeNull();

      // Update with partial data (queries only)
      const partialData = createPartialDataWithQueries(2);
      store.getState().updatePartialPreSearchData(roundNumber, partialData);

      // Verify searchData is now populated
      const updatedPreSearch = store.getState().preSearches[0];
      expect(updatedPreSearch?.searchData).not.toBeNull();
      expect(updatedPreSearch?.searchData?.queries).toHaveLength(2);
      expect(updatedPreSearch?.searchData?.queries[0]?.query).toBe('Test query 0');
      expect(updatedPreSearch?.searchData?.queries[1]?.query).toBe('Test query 1');

      // Status should still be PENDING (not changed by partial update)
      expect(updatedPreSearch?.status).toBe(MessageStatuses.PENDING);
    });

    it('should update searchData when partial results arrive', () => {
      const store = createChatStore();
      const threadId = 'thread-123';
      const roundNumber = 1;

      // Create placeholder pre-search
      const placeholder = createPlaceholderPreSearch(threadId, roundNumber, 'test query');
      store.getState().setPreSearches([placeholder]);

      // Update with partial data (queries + results)
      const partialData = createPartialDataWithResults(2, 2);
      store.getState().updatePartialPreSearchData(roundNumber, partialData);

      // Verify searchData has results
      const updatedPreSearch = store.getState().preSearches[0];
      expect(updatedPreSearch?.searchData?.results).toHaveLength(2);
      expect(updatedPreSearch?.searchData?.results[0]?.results[0]?.title).toBe('Result 0');
    });

    it('should NOT update status when partial data arrives', () => {
      const store = createChatStore();
      const threadId = 'thread-123';
      const roundNumber = 1;

      // Create pre-search with STREAMING status
      const streamingPreSearch = {
        ...createPlaceholderPreSearch(threadId, roundNumber, 'test query'),
        status: MessageStatuses.STREAMING,
      };
      store.getState().setPreSearches([streamingPreSearch]);

      // Update with partial data
      const partialData = createPartialDataWithQueries(2);
      store.getState().updatePartialPreSearchData(roundNumber, partialData);

      // Status should remain STREAMING
      expect(store.getState().preSearches[0]?.status).toBe(MessageStatuses.STREAMING);
    });

    it('should preserve existing summary when partial data arrives', () => {
      const store = createChatStore();
      const threadId = 'thread-123';
      const roundNumber = 1;

      // Create pre-search with existing summary
      const existingPreSearch = {
        ...createPlaceholderPreSearch(threadId, roundNumber, 'test query'),
        searchData: {
          failureCount: 0,
          queries: [],
          results: [],
          successCount: 0,
          summary: 'Existing summary',
          totalResults: 0,
          totalTime: 0,
        },
      };
      store.getState().setPreSearches([existingPreSearch]);

      // Update with partial data that has no summary
      const partialData = createPartialDataWithQueries(2);
      store.getState().updatePartialPreSearchData(roundNumber, partialData);

      // Summary should be preserved
      expect(store.getState().preSearches[0]?.searchData?.summary).toBe('Existing summary');
    });

    it('should update summary when partial data includes new summary', () => {
      const store = createChatStore();
      const threadId = 'thread-123';
      const roundNumber = 1;

      // Create pre-search with existing summary
      const existingPreSearch = {
        ...createPlaceholderPreSearch(threadId, roundNumber, 'test query'),
        searchData: {
          failureCount: 0,
          queries: [],
          results: [],
          successCount: 0,
          summary: 'Existing summary',
          totalResults: 0,
          totalTime: 0,
        },
      };
      store.getState().setPreSearches([existingPreSearch]);

      // Update with partial data that includes summary
      const partialData = {
        ...createPartialDataWithQueries(2),
        summary: 'New summary from stream',
      };
      store.getState().updatePartialPreSearchData(roundNumber, partialData);

      // Summary should be updated
      expect(store.getState().preSearches[0]?.searchData?.summary).toBe('New summary from stream');
    });
  });

  describe('addPreSearch with STREAMING status', () => {
    it('should update placeholder from PENDING to STREAMING', () => {
      const store = createChatStore();
      const threadId = 'thread-123';
      const roundNumber = 1;

      // Create placeholder pre-search with PENDING status
      const placeholder = createPlaceholderPreSearch(threadId, roundNumber, 'test query');
      store.getState().setPreSearches([placeholder]);

      // Add "real" pre-search with STREAMING status
      const realPreSearch: StoredPreSearch = {
        completedAt: null,
        createdAt: new Date(),
        errorMessage: null,
        id: 'real-presearch-id',
        roundNumber,
        searchData: null,
        status: MessageStatuses.STREAMING,
        threadId,
        userQuery: 'test query',
      };
      store.getState().addPreSearch(realPreSearch);

      // Verify status was updated to STREAMING
      const updatedPreSearch = store.getState().preSearches.find(
        ps => ps.roundNumber === roundNumber,
      );
      expect(updatedPreSearch?.status).toBe(MessageStatuses.STREAMING);
      // ID should be updated to real ID
      expect(updatedPreSearch?.id).toBe('real-presearch-id');
    });

    it('should NOT update when existing is already STREAMING', () => {
      const store = createChatStore();
      const threadId = 'thread-123';
      const roundNumber = 1;

      // Create pre-search already in STREAMING status
      const streamingPreSearch = {
        ...createPlaceholderPreSearch(threadId, roundNumber, 'test query'),
        id: 'original-streaming-id',
        status: MessageStatuses.STREAMING,
      };
      store.getState().setPreSearches([streamingPreSearch]);

      // Try to add another pre-search for same round with STREAMING
      const anotherPreSearch: StoredPreSearch = {
        completedAt: null,
        createdAt: new Date(),
        errorMessage: null,
        id: 'another-presearch-id',
        roundNumber,
        searchData: null,
        status: MessageStatuses.STREAMING,
        threadId,
        userQuery: 'test query',
      };
      store.getState().addPreSearch(anotherPreSearch);

      // Original should be preserved (not overwritten)
      const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === roundNumber);
      expect(preSearch?.id).toBe('original-streaming-id');
    });
  });

  describe('hasPreSearchBeenTriggered', () => {
    it('should return false for untriggered rounds', () => {
      const store = createChatStore();

      expect(store.getState().hasPreSearchBeenTriggered(0)).toBeFalsy();
      expect(store.getState().hasPreSearchBeenTriggered(1)).toBeFalsy();
    });

    it('should return true after markPreSearchTriggered', () => {
      const store = createChatStore();

      store.getState().markPreSearchTriggered(1);

      expect(store.getState().hasPreSearchBeenTriggered(1)).toBeTruthy();
      // Other rounds should still be false
      expect(store.getState().hasPreSearchBeenTriggered(0)).toBeFalsy();
      expect(store.getState().hasPreSearchBeenTriggered(2)).toBeFalsy();
    });

    it('should return false after clearPreSearchTracking', () => {
      const store = createChatStore();

      store.getState().markPreSearchTriggered(1);
      expect(store.getState().hasPreSearchBeenTriggered(1)).toBeTruthy();

      store.getState().clearPreSearchTracking(1);
      expect(store.getState().hasPreSearchBeenTriggered(1)).toBeFalsy();
    });
  });

  describe('progressive UI flow simulation', () => {
    it('should handle complete progressive update flow for round 1', () => {
      const store = createChatStore();
      const threadId = 'thread-123';
      const roundNumber = 1;

      // Step 1: Create placeholder (simulating prepareForNewMessage)
      const placeholder = createPlaceholderPreSearch(threadId, roundNumber, 'How does AI work?');
      store.getState().setPreSearches([placeholder]);

      // Verify initial state
      expect(store.getState().preSearches).toHaveLength(1);
      expect(store.getState().preSearches[0]?.status).toBe(MessageStatuses.PENDING);
      expect(store.getState().preSearches[0]?.searchData).toBeNull();

      // Step 2: Mark as triggered (simulating effect marking)
      store.getState().markPreSearchTriggered(roundNumber);
      expect(store.getState().hasPreSearchBeenTriggered(roundNumber)).toBeTruthy();

      // Step 3: Update to STREAMING status (simulating addPreSearch)
      store.getState().updatePreSearchStatus(roundNumber, MessageStatuses.STREAMING);
      expect(store.getState().preSearches[0]?.status).toBe(MessageStatuses.STREAMING);

      // Step 4: First partial update - 1 query
      store.getState().updatePartialPreSearchData(roundNumber, {
        queries: [{
          index: 0,
          query: 'AI machine learning basics',
          rationale: 'Understanding core concepts',
          searchDepth: 'basic',
          total: 2,
        }],
        results: [],
      });

      // Verify progressive state
      let currentState = store.getState().preSearches[0];
      expect(currentState?.searchData?.queries).toHaveLength(1);
      expect(currentState?.searchData?.results).toHaveLength(0);
      expect(currentState?.status).toBe(MessageStatuses.STREAMING); // Still streaming

      // Step 5: Second partial update - 2 queries
      store.getState().updatePartialPreSearchData(roundNumber, {
        queries: [
          {
            index: 0,
            query: 'AI machine learning basics',
            rationale: 'Understanding core concepts',
            searchDepth: 'basic',
            total: 2,
          },
          {
            index: 1,
            query: 'Neural network architecture',
            rationale: 'Deep dive into structure',
            searchDepth: 'advanced',
            total: 2,
          },
        ],
        results: [],
      });

      currentState = store.getState().preSearches[0];
      expect(currentState?.searchData?.queries).toHaveLength(2);
      expect(currentState?.searchData?.results).toHaveLength(0);

      // Step 6: Third partial update - queries + 1 result
      store.getState().updatePartialPreSearchData(roundNumber, {
        queries: [
          {
            index: 0,
            query: 'AI machine learning basics',
            rationale: 'Understanding core concepts',
            searchDepth: 'basic',
            total: 2,
          },
          {
            index: 1,
            query: 'Neural network architecture',
            rationale: 'Deep dive into structure',
            searchDepth: 'advanced',
            total: 2,
          },
        ],
        results: [{
          answer: null,
          index: 0,
          query: 'AI machine learning basics',
          responseTime: 250,
          results: [
            {
              content: 'AI content...',
              excerpt: 'Learn about AI...',
              score: 0.9,
              title: 'Introduction to AI',
              url: 'https://example.com/ai-intro',
            },
          ],
        }],
      });

      currentState = store.getState().preSearches[0];
      expect(currentState?.searchData?.queries).toHaveLength(2);
      expect(currentState?.searchData?.results).toHaveLength(1);
      expect(currentState?.status).toBe(MessageStatuses.STREAMING); // Still streaming

      // Step 7: Final update via updatePreSearchData (marks complete)
      store.getState().updatePreSearchData(roundNumber, {
        failureCount: 0,
        queries: [
          {
            index: 0,
            query: 'AI machine learning basics',
            rationale: 'Understanding core concepts',
            searchDepth: 'basic',
            total: 2,
          },
          {
            index: 1,
            query: 'Neural network architecture',
            rationale: 'Deep dive into structure',
            searchDepth: 'advanced',
            total: 2,
          },
        ],
        results: [
          {
            answer: 'AI is...',
            index: 0,
            query: 'AI machine learning basics',
            responseTime: 250,
            results: [
              {
                content: 'AI content...',
                excerpt: 'Learn about AI...',
                score: 0.9,
                title: 'Introduction to AI',
                url: 'https://example.com/ai-intro',
              },
            ],
          },
          {
            answer: 'Neural networks...',
            index: 1,
            query: 'Neural network architecture',
            responseTime: 300,
            results: [
              {
                content: 'DL content...',
                excerpt: 'Deep learning...',
                score: 0.85,
                title: 'Deep Learning Guide',
                url: 'https://example.com/dl-guide',
              },
            ],
          },
        ],
        successCount: 2,
        summary: 'Search complete. Found relevant resources.',
        totalResults: 2,
        totalTime: 550,
      });

      // Verify final state
      currentState = store.getState().preSearches[0];
      expect(currentState?.status).toBe(MessageStatuses.COMPLETE);
      expect(currentState?.searchData?.queries).toHaveLength(2);
      expect(currentState?.searchData?.results).toHaveLength(2);
      expect(currentState?.searchData?.summary).toBe('Search complete. Found relevant resources.');
    });

    it('should handle multiple rounds with independent pre-searches', () => {
      const store = createChatStore();
      const threadId = 'thread-123';

      // Create placeholders for rounds 0 and 1
      store.getState().setPreSearches([
        createPlaceholderPreSearch(threadId, 0, 'query 0'),
        createPlaceholderPreSearch(threadId, 1, 'query 1'),
      ]);

      // Update round 0 only
      store.getState().updatePartialPreSearchData(0, createPartialDataWithQueries(2));

      // Verify only round 0 was updated
      expect(store.getState().preSearches.find(ps => ps.roundNumber === 0)?.searchData?.queries).toHaveLength(2);
      expect(store.getState().preSearches.find(ps => ps.roundNumber === 1)?.searchData).toBeNull();

      // Update round 1 only
      store.getState().updatePartialPreSearchData(1, createPartialDataWithQueries(3));

      // Verify both have correct data
      expect(store.getState().preSearches.find(ps => ps.roundNumber === 0)?.searchData?.queries).toHaveLength(2);
      expect(store.getState().preSearches.find(ps => ps.roundNumber === 1)?.searchData?.queries).toHaveLength(3);
    });
  });

  describe('reference equality for re-rendering', () => {
    it('should create new preSearches array reference when updating partial data', () => {
      const store = createChatStore();
      const threadId = 'thread-123';
      const roundNumber = 1;

      // Create placeholder
      const placeholder = createPlaceholderPreSearch(threadId, roundNumber, 'test query');
      store.getState().setPreSearches([placeholder]);

      // Get reference before update
      const beforeRef = store.getState().preSearches;

      // Update with partial data
      store.getState().updatePartialPreSearchData(roundNumber, createPartialDataWithQueries(2));

      // Get reference after update
      const afterRef = store.getState().preSearches;

      // References should be different (Immer creates new array)
      expect(beforeRef).not.toBe(afterRef);
    });

    it('should create new preSearch object reference when updating partial data', () => {
      const store = createChatStore();
      const threadId = 'thread-123';
      const roundNumber = 1;

      // Create placeholder
      const placeholder = createPlaceholderPreSearch(threadId, roundNumber, 'test query');
      store.getState().setPreSearches([placeholder]);

      // Get reference before update
      const beforeRef = store.getState().preSearches[0];

      // Update with partial data
      store.getState().updatePartialPreSearchData(roundNumber, createPartialDataWithQueries(2));

      // Get reference after update
      const afterRef = store.getState().preSearches[0];

      // References should be different (Immer creates new object)
      expect(beforeRef).not.toBe(afterRef);
    });

    it('should create new searchData object reference when updating partial data', () => {
      const store = createChatStore();
      const threadId = 'thread-123';
      const roundNumber = 1;

      // Create pre-search with initial searchData
      const preSearch = {
        ...createPlaceholderPreSearch(threadId, roundNumber, 'test query'),
        searchData: {
          failureCount: 0,
          queries: [],
          results: [],
          successCount: 0,
          summary: '',
          totalResults: 0,
          totalTime: 0,
        },
      };
      store.getState().setPreSearches([preSearch]);

      // Get reference before update
      const beforeRef = store.getState().preSearches[0]?.searchData;

      // Update with partial data
      store.getState().updatePartialPreSearchData(roundNumber, createPartialDataWithQueries(2));

      // Get reference after update
      const afterRef = store.getState().preSearches[0]?.searchData;

      // searchData reference should be different
      expect(beforeRef).not.toBe(afterRef);
    });
  });

  /**
   * ✅ BUG TEST: Second round + web search + pre-search completion rendering
   *
   * Bug scenario:
   * 1. User starts second round with config changes and web search enabled
   * 2. Pre-search placeholder created, streamingRoundNumber set
   * 3. Pre-search completes (status = COMPLETE)
   * 4. BUG: All participants disappeared until moderator finished
   *
   * Root cause investigation:
   * The rendering condition `shouldShowPendingCards` depends on:
   * - isStreamingRound = (roundNumber === streamingRoundNumber)
   * - preSearchComplete = (preSearch.status === COMPLETE)
   * - isAnyStreamingActive = (isStreaming || isModeratorStreaming || isStreamingRound)
   *
   * If streamingRoundNumber is null or wrong after pre-search completes,
   * isStreamingRound becomes false, and if isStreaming/isModeratorStreaming are also false,
   * shouldShowPendingCards becomes false = participants disappear!
   */
  describe('second round + pre-search completion rendering conditions', () => {
    it('should preserve streamingRoundNumber when pre-search completes', () => {
      const store = createChatStore();
      const threadId = 'thread-123';
      const roundNumber = 1;

      // Setup: Second round with web search enabled
      store.getState().setStreamingRoundNumber(roundNumber);
      store.getState().setWaitingToStartStreaming(true);
      store.getState().setEnableWebSearch(true);

      // Create pre-search placeholder
      const placeholder = createPlaceholderPreSearch(threadId, roundNumber, 'test query');
      store.getState().setPreSearches([placeholder]);

      // Verify streamingRoundNumber before pre-search completion
      expect(store.getState().streamingRoundNumber).toBe(roundNumber);

      // Pre-search completes (status changes to COMPLETE)
      store.getState().updatePreSearchStatus(roundNumber, MessageStatuses.COMPLETE);

      // ✅ CRITICAL: streamingRoundNumber should still be set!
      expect(store.getState().streamingRoundNumber).toBe(roundNumber);
      expect(store.getState().preSearches[0]?.status).toBe(MessageStatuses.COMPLETE);
    });

    it('should have correct rendering conditions when pre-search completes', () => {
      const store = createChatStore();
      const threadId = 'thread-123';
      const roundNumber = 1;

      // Setup: Second round state
      store.getState().setStreamingRoundNumber(roundNumber);
      store.getState().setWaitingToStartStreaming(true);
      store.getState().setEnableWebSearch(true);

      // Create COMPLETE pre-search
      const completePreSearch = {
        ...createPlaceholderPreSearch(threadId, roundNumber, 'test query'),
        searchData: {
          failureCount: 0,
          queries: [],
          results: [],
          successCount: 0,
          summary: 'Search complete',
          totalResults: 0,
          totalTime: 0,
        },
        status: MessageStatuses.COMPLETE,
      };
      store.getState().setPreSearches([completePreSearch]);

      // Get rendering conditions
      const state = store.getState();
      const _streamingRoundNumber = state.streamingRoundNumber;
      const isStreaming = state.isStreaming;
      const isModeratorStreaming = state.isModeratorStreaming;

      // Simulate rendering logic from chat-message-list.tsx
      const isStreamingRound = roundNumber === _streamingRoundNumber;
      const preSearch = state.preSearches.find(ps => ps.roundNumber === roundNumber);
      const preSearchActive = preSearch
        && (preSearch.status === MessageStatuses.PENDING || preSearch.status === MessageStatuses.STREAMING);
      const preSearchComplete = preSearch && preSearch.status === MessageStatuses.COMPLETE;

      // ✅ KEY ASSERTION: isStreamingRound should be true
      expect(isStreamingRound).toBeTruthy();
      expect(preSearchActive).toBeFalsy(); // Pre-search is COMPLETE, not active
      expect(preSearchComplete).toBeTruthy();

      // Calculate isAnyStreamingActive (from chat-message-list.tsx)
      const isAnyStreamingActive = isStreaming || isModeratorStreaming || isStreamingRound;

      // ✅ KEY ASSERTION: isAnyStreamingActive should be true because isStreamingRound is true
      expect(isAnyStreamingActive).toBeTruthy();

      // shouldShowPendingCards = !isRoundComplete && (preSearchActive || preSearchComplete || isAnyStreamingActive)
      // Since round is not complete (no moderator with finishReason), shouldShowPendingCards should be true
      const isRoundComplete = false; // No moderator message yet
      const shouldShowPendingCards = !isRoundComplete && (preSearchActive || preSearchComplete || isAnyStreamingActive);

      // ✅ KEY ASSERTION: shouldShowPendingCards should be true
      expect(shouldShowPendingCards).toBeTruthy();
    });

    it('should show pending cards even when isStreaming is false after pre-search completes', () => {
      const store = createChatStore();
      const threadId = 'thread-123';
      const roundNumber = 1;

      // Setup: Pre-search complete but streaming not started yet
      store.getState().setStreamingRoundNumber(roundNumber);
      store.getState().setIsStreaming(false); // AI SDK streaming not started yet
      store.getState().setEnableWebSearch(true);

      const completePreSearch = {
        ...createPlaceholderPreSearch(threadId, roundNumber, 'test query'),
        status: MessageStatuses.COMPLETE,
      };
      store.getState().setPreSearches([completePreSearch]);

      const state = store.getState();

      // Key conditions
      const isStreamingRound = roundNumber === state.streamingRoundNumber;
      const preSearchComplete = state.preSearches.find(ps => ps.roundNumber === roundNumber)?.status === MessageStatuses.COMPLETE;
      const isAnyStreamingActive = state.isStreaming || state.isModeratorStreaming || isStreamingRound;

      // Even though isStreaming=false, isStreamingRound keeps things visible
      expect(isStreamingRound).toBeTruthy();
      expect(preSearchComplete).toBeTruthy();
      expect(isAnyStreamingActive).toBeTruthy();

      const shouldShowPendingCards = true && (false || preSearchComplete || isAnyStreamingActive);
      expect(shouldShowPendingCards).toBeTruthy();
    });

    it('should NOT clear streamingRoundNumber when config change completes', () => {
      const store = createChatStore();
      const threadId = 'thread-123';
      const roundNumber = 1;

      // Simulate handleUpdateThreadAndSend flow
      store.getState().setStreamingRoundNumber(roundNumber);
      store.getState().setWaitingToStartStreaming(true);
      store.getState().setConfigChangeRoundNumber(roundNumber); // Config change pending

      // Pre-search created
      const placeholder = createPlaceholderPreSearch(threadId, roundNumber, 'test query');
      store.getState().setPreSearches([placeholder]);

      // Config change completes (changelog sync clears flags)
      store.getState().setIsWaitingForChangelog(false);
      store.getState().setConfigChangeRoundNumber(null);

      // ✅ streamingRoundNumber should NOT be cleared
      expect(store.getState().streamingRoundNumber).toBe(roundNumber);

      // Pre-search completes
      store.getState().updatePreSearchStatus(roundNumber, MessageStatuses.COMPLETE);

      // ✅ streamingRoundNumber should STILL not be cleared
      expect(store.getState().streamingRoundNumber).toBe(roundNumber);
    });
  });
});
