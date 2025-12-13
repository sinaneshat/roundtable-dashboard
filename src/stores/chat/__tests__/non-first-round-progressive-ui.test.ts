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

import { describe, expect, it } from 'vitest';

import { AnalysisStatuses } from '@/api/core/enums';
import type { PartialPreSearchData, StoredPreSearch } from '@/api/routes/chat/schema';

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
    id: `placeholder-presearch-${threadId}-${roundNumber}`,
    threadId,
    roundNumber,
    userQuery,
    status: AnalysisStatuses.PENDING,
    searchData: null,
    errorMessage: null,
    createdAt: new Date(),
    completedAt: null,
  } as StoredPreSearch;
}

/**
 * Creates partial pre-search data with queries
 */
function createPartialDataWithQueries(queryCount: number): PartialPreSearchData {
  return {
    queries: Array.from({ length: queryCount }, (_, i) => ({
      query: `Test query ${i}`,
      rationale: `Test rationale ${i}`,
      searchDepth: 'basic' as const,
      index: i,
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
      query: `Test query ${i}`,
      rationale: `Test rationale ${i}`,
      searchDepth: 'basic' as const,
      index: i,
      total: queryCount,
    })),
    results: Array.from({ length: resultCount }, (_, i) => ({
      query: `Test query ${i % queryCount}`,
      answer: null,
      results: [
        {
          title: `Result ${i}`,
          url: `https://example.com/${i}`,
          content: `Content ${i}`,
          excerpt: `Excerpt ${i}`,
          score: 0,
        },
      ],
      responseTime: 100,
      index: i,
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
      expect(updatedPreSearch?.status).toBe(AnalysisStatuses.PENDING);
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
        status: AnalysisStatuses.STREAMING,
      };
      store.getState().setPreSearches([streamingPreSearch]);

      // Update with partial data
      const partialData = createPartialDataWithQueries(2);
      store.getState().updatePartialPreSearchData(roundNumber, partialData);

      // Status should remain STREAMING
      expect(store.getState().preSearches[0]?.status).toBe(AnalysisStatuses.STREAMING);
    });

    it('should preserve existing analysis when partial data arrives', () => {
      const store = createChatStore();
      const threadId = 'thread-123';
      const roundNumber = 1;

      // Create pre-search with existing analysis
      const existingPreSearch = {
        ...createPlaceholderPreSearch(threadId, roundNumber, 'test query'),
        searchData: {
          queries: [],
          results: [],
          analysis: 'Existing analysis',
          successCount: 0,
          failureCount: 0,
          totalResults: 0,
          totalTime: 0,
        },
      };
      store.getState().setPreSearches([existingPreSearch]);

      // Update with partial data that has no analysis
      const partialData = createPartialDataWithQueries(2);
      store.getState().updatePartialPreSearchData(roundNumber, partialData);

      // Analysis should be preserved
      expect(store.getState().preSearches[0]?.searchData?.analysis).toBe('Existing analysis');
    });

    it('should update analysis when partial data includes new analysis', () => {
      const store = createChatStore();
      const threadId = 'thread-123';
      const roundNumber = 1;

      // Create pre-search with existing analysis
      const existingPreSearch = {
        ...createPlaceholderPreSearch(threadId, roundNumber, 'test query'),
        searchData: {
          queries: [],
          results: [],
          analysis: 'Existing analysis',
          successCount: 0,
          failureCount: 0,
          totalResults: 0,
          totalTime: 0,
        },
      };
      store.getState().setPreSearches([existingPreSearch]);

      // Update with partial data that includes analysis
      const partialData = {
        ...createPartialDataWithQueries(2),
        analysis: 'New analysis from stream',
      };
      store.getState().updatePartialPreSearchData(roundNumber, partialData);

      // Analysis should be updated
      expect(store.getState().preSearches[0]?.searchData?.analysis).toBe('New analysis from stream');
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
        id: 'real-presearch-id',
        threadId,
        roundNumber,
        userQuery: 'test query',
        status: AnalysisStatuses.STREAMING,
        searchData: null,
        errorMessage: null,
        createdAt: new Date(),
        completedAt: null,
      };
      store.getState().addPreSearch(realPreSearch);

      // Verify status was updated to STREAMING
      const updatedPreSearch = store.getState().preSearches.find(
        ps => ps.roundNumber === roundNumber,
      );
      expect(updatedPreSearch?.status).toBe(AnalysisStatuses.STREAMING);
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
        status: AnalysisStatuses.STREAMING,
      };
      store.getState().setPreSearches([streamingPreSearch]);

      // Try to add another pre-search for same round with STREAMING
      const anotherPreSearch: StoredPreSearch = {
        id: 'another-presearch-id',
        threadId,
        roundNumber,
        userQuery: 'test query',
        status: AnalysisStatuses.STREAMING,
        searchData: null,
        errorMessage: null,
        createdAt: new Date(),
        completedAt: null,
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

      expect(store.getState().hasPreSearchBeenTriggered(0)).toBe(false);
      expect(store.getState().hasPreSearchBeenTriggered(1)).toBe(false);
    });

    it('should return true after markPreSearchTriggered', () => {
      const store = createChatStore();

      store.getState().markPreSearchTriggered(1);

      expect(store.getState().hasPreSearchBeenTriggered(1)).toBe(true);
      // Other rounds should still be false
      expect(store.getState().hasPreSearchBeenTriggered(0)).toBe(false);
      expect(store.getState().hasPreSearchBeenTriggered(2)).toBe(false);
    });

    it('should return false after clearPreSearchTracking', () => {
      const store = createChatStore();

      store.getState().markPreSearchTriggered(1);
      expect(store.getState().hasPreSearchBeenTriggered(1)).toBe(true);

      store.getState().clearPreSearchTracking(1);
      expect(store.getState().hasPreSearchBeenTriggered(1)).toBe(false);
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
      expect(store.getState().preSearches[0]?.status).toBe(AnalysisStatuses.PENDING);
      expect(store.getState().preSearches[0]?.searchData).toBeNull();

      // Step 2: Mark as triggered (simulating effect marking)
      store.getState().markPreSearchTriggered(roundNumber);
      expect(store.getState().hasPreSearchBeenTriggered(roundNumber)).toBe(true);

      // Step 3: Update to STREAMING status (simulating addPreSearch)
      store.getState().updatePreSearchStatus(roundNumber, AnalysisStatuses.STREAMING);
      expect(store.getState().preSearches[0]?.status).toBe(AnalysisStatuses.STREAMING);

      // Step 4: First partial update - 1 query
      store.getState().updatePartialPreSearchData(roundNumber, {
        queries: [{
          query: 'AI machine learning basics',
          rationale: 'Understanding core concepts',
          searchDepth: 'basic',
          index: 0,
          total: 2,
        }],
        results: [],
      });

      // Verify progressive state
      let currentState = store.getState().preSearches[0];
      expect(currentState?.searchData?.queries).toHaveLength(1);
      expect(currentState?.searchData?.results).toHaveLength(0);
      expect(currentState?.status).toBe(AnalysisStatuses.STREAMING); // Still streaming

      // Step 5: Second partial update - 2 queries
      store.getState().updatePartialPreSearchData(roundNumber, {
        queries: [
          {
            query: 'AI machine learning basics',
            rationale: 'Understanding core concepts',
            searchDepth: 'basic',
            index: 0,
            total: 2,
          },
          {
            query: 'Neural network architecture',
            rationale: 'Deep dive into structure',
            searchDepth: 'advanced',
            index: 1,
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
            query: 'AI machine learning basics',
            rationale: 'Understanding core concepts',
            searchDepth: 'basic',
            index: 0,
            total: 2,
          },
          {
            query: 'Neural network architecture',
            rationale: 'Deep dive into structure',
            searchDepth: 'advanced',
            index: 1,
            total: 2,
          },
        ],
        results: [{
          query: 'AI machine learning basics',
          answer: null,
          results: [
            {
              title: 'Introduction to AI',
              url: 'https://example.com/ai-intro',
              content: 'AI content...',
              excerpt: 'Learn about AI...',
              score: 0.9,
            },
          ],
          responseTime: 250,
          index: 0,
        }],
      });

      currentState = store.getState().preSearches[0];
      expect(currentState?.searchData?.queries).toHaveLength(2);
      expect(currentState?.searchData?.results).toHaveLength(1);
      expect(currentState?.status).toBe(AnalysisStatuses.STREAMING); // Still streaming

      // Step 7: Final update via updatePreSearchData (marks complete)
      store.getState().updatePreSearchData(roundNumber, {
        queries: [
          {
            query: 'AI machine learning basics',
            rationale: 'Understanding core concepts',
            searchDepth: 'basic',
            index: 0,
            total: 2,
          },
          {
            query: 'Neural network architecture',
            rationale: 'Deep dive into structure',
            searchDepth: 'advanced',
            index: 1,
            total: 2,
          },
        ],
        results: [
          {
            query: 'AI machine learning basics',
            answer: 'AI is...',
            results: [
              {
                title: 'Introduction to AI',
                url: 'https://example.com/ai-intro',
                content: 'AI content...',
                excerpt: 'Learn about AI...',
                score: 0.9,
              },
            ],
            responseTime: 250,
            index: 0,
          },
          {
            query: 'Neural network architecture',
            answer: 'Neural networks...',
            results: [
              {
                title: 'Deep Learning Guide',
                url: 'https://example.com/dl-guide',
                content: 'DL content...',
                excerpt: 'Deep learning...',
                score: 0.85,
              },
            ],
            responseTime: 300,
            index: 1,
          },
        ],
        analysis: 'Search complete. Found relevant resources.',
        successCount: 2,
        failureCount: 0,
        totalResults: 2,
        totalTime: 550,
      });

      // Verify final state
      currentState = store.getState().preSearches[0];
      expect(currentState?.status).toBe(AnalysisStatuses.COMPLETE);
      expect(currentState?.searchData?.queries).toHaveLength(2);
      expect(currentState?.searchData?.results).toHaveLength(2);
      expect(currentState?.searchData?.analysis).toBe('Search complete. Found relevant resources.');
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
          queries: [],
          results: [],
          analysis: '',
          successCount: 0,
          failureCount: 0,
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
});
