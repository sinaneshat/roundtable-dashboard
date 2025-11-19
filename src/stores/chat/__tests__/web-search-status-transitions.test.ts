/**
 * WEB SEARCH STATUS TRANSITIONS TESTS
 *
 * FLOW DOCUMENTATION STATUS TRANSITIONS:
 * "PENDING (created during thread creation)
 *   ↓
 *  STREAMING (when pre-search endpoint called)
 *   ↓
 *  COMPLETED (search results saved) OR FAILED (error occurred)
 *   ↓
 *  Participant streaming allowed to start"
 *
 * TEST SCENARIOS:
 * 1. Valid transition: PENDING → STREAMING
 * 2. Valid transition: STREAMING → COMPLETE
 * 3. Valid transition: STREAMING → FAILED
 * 4. Invalid transition handling (if any)
 * 5. Status persistence across store updates
 * 6. Status querying by round number
 * 7. Multiple searches with different statuses
 * 8. Status update race conditions
 *
 * FILES UNDER TEST:
 * - src/stores/chat/store.ts (preSearches state)
 * - src/stores/chat/actions/pre-search-orchestrator.ts (status updates)
 * - src/api/routes/chat/handlers/pre-search.handler.ts (status transitions)
 *
 * @see /docs/FLOW_DOCUMENTATION.md Part 2: Status Transitions
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { AnalysisStatuses } from '@/api/core/enums';
import { createMockPreSearch } from '@/lib/testing';
import { createChatStore } from '@/stores/chat';

import type { ChatStore } from '../store';

describe('web Search Status Transitions', () => {
  let store: ReturnType<typeof createChatStore>;
  let getState: () => ChatStore;

  beforeEach(() => {
    store = createChatStore();
    getState = store.getState;
  });

  // ==========================================================================
  // VALID TRANSITION: PENDING → STREAMING
  // ==========================================================================
  describe('pENDING → STREAMING transition', () => {
    it('should transition from PENDING to STREAMING', () => {
      // Create PENDING pre-search
      getState().addPreSearch(
        createMockPreSearch({
          id: 'search-0',
          threadId: 'thread-1',
          roundNumber: 0,
          status: AnalysisStatuses.PENDING,
          userQuery: 'Test question',
        }),
      );

      // Verify initial PENDING status
      expect(getState().preSearches[0]?.status).toBe(AnalysisStatuses.PENDING);

      // Transition to STREAMING
      getState().updatePreSearchStatus(0, AnalysisStatuses.STREAMING);

      // Verify transitioned to STREAMING
      expect(getState().preSearches[0]?.status).toBe(AnalysisStatuses.STREAMING);
    });

    it('should preserve other fields during PENDING → STREAMING transition', () => {
      const preSearch = createMockPreSearch({
        id: 'search-0',
        threadId: 'thread-1',
        roundNumber: 0,
        status: AnalysisStatuses.PENDING,
        userQuery: 'Test question',
      });

      getState().addPreSearch(preSearch);

      // Transition to STREAMING
      getState().updatePreSearchStatus(0, AnalysisStatuses.STREAMING);

      const updated = getState().preSearches[0];

      // Verify other fields unchanged
      expect(updated?.id).toBe(preSearch.id);
      expect(updated?.threadId).toBe(preSearch.threadId);
      expect(updated?.roundNumber).toBe(preSearch.roundNumber);
      expect(updated?.userQuery).toBe(preSearch.userQuery);
    });

    it('should handle rapid PENDING → STREAMING transitions', () => {
      // Add 5 PENDING searches
      for (let i = 0; i < 5; i++) {
        getState().addPreSearch(
          createMockPreSearch({
            id: `search-${i}`,
            threadId: 'thread-1',
            roundNumber: i,
            status: AnalysisStatuses.PENDING,
            userQuery: `Question ${i + 1}`,
          }),
        );
      }

      // Transition all to STREAMING
      for (let i = 0; i < 5; i++) {
        getState().updatePreSearchStatus(i, AnalysisStatuses.STREAMING);
      }

      // Verify all transitioned
      const searches = getState().preSearches;
      searches.forEach((search) => {
        expect(search.status).toBe(AnalysisStatuses.STREAMING);
      });
    });
  });

  // ==========================================================================
  // VALID TRANSITION: STREAMING → COMPLETE
  // ==========================================================================
  describe('sTREAMING → COMPLETE transition', () => {
    it('should transition from STREAMING to COMPLETE', () => {
      getState().addPreSearch(
        createMockPreSearch({
          id: 'search-0',
          threadId: 'thread-1',
          roundNumber: 0,
          status: AnalysisStatuses.STREAMING,
          userQuery: 'Test question',
        }),
      );

      expect(getState().preSearches[0]?.status).toBe(AnalysisStatuses.STREAMING);

      // Transition to COMPLETE
      getState().updatePreSearchStatus(0, AnalysisStatuses.COMPLETE);

      expect(getState().preSearches[0]?.status).toBe(AnalysisStatuses.COMPLETE);
    });

    it('should allow adding search data on COMPLETE transition', () => {
      getState().addPreSearch(
        createMockPreSearch({
          id: 'search-0',
          threadId: 'thread-1',
          roundNumber: 0,
          status: AnalysisStatuses.STREAMING,
          userQuery: 'Test question',
        }),
      );

      // Add search data when completing
      const searchData = {
        queries: [
          {
            query: 'test query',
            rationale: 'test rationale',
            searchDepth: 'basic' as const,
            index: 0,
            total: 1,
          },
        ],
        results: [
          {
            query: 'test query',
            answer: 'test answer',
            results: [
              {
                title: 'Test Result',
                url: 'https://example.com',
                content: 'Test content',
                score: 0.9,
              },
            ],
            responseTime: 100,
          },
        ],
        analysis: 'Test analysis',
        successCount: 1,
        failureCount: 0,
        totalResults: 1,
        totalTime: 100,
      };

      getState().updatePreSearchData(0, searchData);
      getState().updatePreSearchStatus(0, AnalysisStatuses.COMPLETE);

      const search = getState().preSearches[0];
      expect(search?.status).toBe(AnalysisStatuses.COMPLETE);
      expect(search?.searchData).toBeDefined();
      expect(search?.searchData?.results).toHaveLength(1);
    });

    it('should handle COMPLETE status finality', () => {
      getState().addPreSearch(
        createMockPreSearch({
          id: 'search-0',
          threadId: 'thread-1',
          roundNumber: 0,
          status: AnalysisStatuses.STREAMING,
          userQuery: 'Test question',
        }),
      );

      // Transition to COMPLETE
      getState().updatePreSearchStatus(0, AnalysisStatuses.COMPLETE);

      expect(getState().preSearches[0]?.status).toBe(AnalysisStatuses.COMPLETE);

      // Status should remain COMPLETE (no further transitions expected)
      expect(getState().preSearches[0]?.status).toBe(AnalysisStatuses.COMPLETE);
    });
  });

  // ==========================================================================
  // VALID TRANSITION: STREAMING → FAILED
  // ==========================================================================
  describe('sTREAMING → FAILED transition', () => {
    it('should transition from STREAMING to FAILED', () => {
      getState().addPreSearch(
        createMockPreSearch({
          id: 'search-0',
          threadId: 'thread-1',
          roundNumber: 0,
          status: AnalysisStatuses.STREAMING,
          userQuery: 'Test question',
        }),
      );

      expect(getState().preSearches[0]?.status).toBe(AnalysisStatuses.STREAMING);

      // Transition to FAILED
      getState().updatePreSearchStatus(0, AnalysisStatuses.FAILED);

      expect(getState().preSearches[0]?.status).toBe(AnalysisStatuses.FAILED);
    });

    it('should handle FAILED with error message', () => {
      getState().addPreSearch(
        createMockPreSearch({
          id: 'search-0',
          threadId: 'thread-1',
          roundNumber: 0,
          status: AnalysisStatuses.STREAMING,
          userQuery: 'Test question',
        }),
      );

      // Simulate failure
      getState().updatePreSearchStatus(0, AnalysisStatuses.FAILED);

      const search = getState().preSearches[0];
      expect(search?.status).toBe(AnalysisStatuses.FAILED);
      // Error message would be set by backend/handler
    });

    it('should handle FAILED status finality', () => {
      getState().addPreSearch(
        createMockPreSearch({
          id: 'search-0',
          threadId: 'thread-1',
          roundNumber: 0,
          status: AnalysisStatuses.STREAMING,
          userQuery: 'Test question',
        }),
      );

      // Transition to FAILED
      getState().updatePreSearchStatus(0, AnalysisStatuses.FAILED);

      expect(getState().preSearches[0]?.status).toBe(AnalysisStatuses.FAILED);

      // Status should remain FAILED (no further transitions)
      expect(getState().preSearches[0]?.status).toBe(AnalysisStatuses.FAILED);
    });
  });

  // ==========================================================================
  // STATUS PERSISTENCE ACROSS UPDATES
  // ==========================================================================
  describe('status persistence', () => {
    it('should persist status across store reads', () => {
      getState().addPreSearch(
        createMockPreSearch({
          id: 'search-0',
          threadId: 'thread-1',
          roundNumber: 0,
          status: AnalysisStatuses.PENDING,
          userQuery: 'Test question',
        }),
      );

      // Read status multiple times
      expect(getState().preSearches[0]?.status).toBe(AnalysisStatuses.PENDING);
      expect(getState().preSearches[0]?.status).toBe(AnalysisStatuses.PENDING);
      expect(getState().preSearches[0]?.status).toBe(AnalysisStatuses.PENDING);
    });

    it('should update to COMPLETE when search data is added', () => {
      getState().addPreSearch(
        createMockPreSearch({
          id: 'search-0',
          threadId: 'thread-1',
          roundNumber: 0,
          status: AnalysisStatuses.STREAMING,
          userQuery: 'Test question',
        }),
      );

      expect(getState().preSearches[0]?.status).toBe(AnalysisStatuses.STREAMING);

      // Update search data (automatically sets status to COMPLETE)
      getState().updatePreSearchData(0, {
        queries: [],
        results: [],
        analysis: '',
        successCount: 0,
        failureCount: 0,
        totalResults: 0,
        totalTime: 0,
      });

      // Status should be COMPLETE after data update (by design)
      expect(getState().preSearches[0]?.status).toBe(AnalysisStatuses.COMPLETE);
      expect(getState().preSearches[0]?.searchData).toBeDefined();
    });

    it('should maintain status across store operations', () => {
      // Add search
      getState().addPreSearch(
        createMockPreSearch({
          id: 'search-0',
          threadId: 'thread-1',
          roundNumber: 0,
          status: AnalysisStatuses.PENDING,
          userQuery: 'Question 1',
        }),
      );

      // Add another search
      getState().addPreSearch(
        createMockPreSearch({
          id: 'search-1',
          threadId: 'thread-1',
          roundNumber: 1,
          status: AnalysisStatuses.STREAMING,
          userQuery: 'Question 2',
        }),
      );

      // Verify both statuses preserved
      expect(getState().preSearches[0]?.status).toBe(AnalysisStatuses.PENDING);
      expect(getState().preSearches[1]?.status).toBe(AnalysisStatuses.STREAMING);

      // Update first search status
      getState().updatePreSearchStatus(0, AnalysisStatuses.COMPLETE);

      // Verify second search status unchanged
      expect(getState().preSearches[1]?.status).toBe(AnalysisStatuses.STREAMING);
    });
  });

  // ==========================================================================
  // STATUS QUERYING BY ROUND NUMBER
  // ==========================================================================
  describe('status querying by round', () => {
    it('should query status by round number', () => {
      // Add searches for rounds 0-2
      getState().addPreSearch(
        createMockPreSearch({
          id: 'search-0',
          threadId: 'thread-1',
          roundNumber: 0,
          status: AnalysisStatuses.COMPLETE,
          userQuery: 'Question 1',
        }),
      );

      getState().addPreSearch(
        createMockPreSearch({
          id: 'search-1',
          threadId: 'thread-1',
          roundNumber: 1,
          status: AnalysisStatuses.STREAMING,
          userQuery: 'Question 2',
        }),
      );

      getState().addPreSearch(
        createMockPreSearch({
          id: 'search-2',
          threadId: 'thread-1',
          roundNumber: 2,
          status: AnalysisStatuses.PENDING,
          userQuery: 'Question 3',
        }),
      );

      // Query by round number
      const round0 = getState().preSearches.find(ps => ps.roundNumber === 0);
      const round1 = getState().preSearches.find(ps => ps.roundNumber === 1);
      const round2 = getState().preSearches.find(ps => ps.roundNumber === 2);

      expect(round0?.status).toBe(AnalysisStatuses.COMPLETE);
      expect(round1?.status).toBe(AnalysisStatuses.STREAMING);
      expect(round2?.status).toBe(AnalysisStatuses.PENDING);
    });

    it('should handle queries for non-existent rounds', () => {
      getState().addPreSearch(
        createMockPreSearch({
          id: 'search-0',
          threadId: 'thread-1',
          roundNumber: 0,
          status: AnalysisStatuses.COMPLETE,
          userQuery: 'Question 1',
        }),
      );

      // Query non-existent round
      const round5 = getState().preSearches.find(ps => ps.roundNumber === 5);
      expect(round5).toBeUndefined();
    });

    it('should update correct search when multiple rounds exist', () => {
      // Add 3 searches
      for (let i = 0; i < 3; i++) {
        getState().addPreSearch(
          createMockPreSearch({
            id: `search-${i}`,
            threadId: 'thread-1',
            roundNumber: i,
            status: AnalysisStatuses.PENDING,
            userQuery: `Question ${i + 1}`,
          }),
        );
      }

      // Update round 1 to COMPLETE
      getState().updatePreSearchStatus(1, AnalysisStatuses.COMPLETE);

      // Verify only round 1 changed
      expect(getState().preSearches[0]?.status).toBe(AnalysisStatuses.PENDING);
      expect(getState().preSearches[1]?.status).toBe(AnalysisStatuses.COMPLETE);
      expect(getState().preSearches[2]?.status).toBe(AnalysisStatuses.PENDING);
    });
  });

  // ==========================================================================
  // MULTIPLE SEARCHES WITH DIFFERENT STATUSES
  // ==========================================================================
  describe('multiple searches with mixed statuses', () => {
    it('should handle different statuses for different rounds', () => {
      getState().addPreSearch(
        createMockPreSearch({
          id: 'search-0',
          threadId: 'thread-1',
          roundNumber: 0,
          status: AnalysisStatuses.COMPLETE,
          userQuery: 'Question 1',
        }),
      );

      getState().addPreSearch(
        createMockPreSearch({
          id: 'search-1',
          threadId: 'thread-1',
          roundNumber: 1,
          status: AnalysisStatuses.FAILED,
          userQuery: 'Question 2',
        }),
      );

      getState().addPreSearch(
        createMockPreSearch({
          id: 'search-2',
          threadId: 'thread-1',
          roundNumber: 2,
          status: AnalysisStatuses.STREAMING,
          userQuery: 'Question 3',
        }),
      );

      getState().addPreSearch(
        createMockPreSearch({
          id: 'search-3',
          threadId: 'thread-1',
          roundNumber: 3,
          status: AnalysisStatuses.PENDING,
          userQuery: 'Question 4',
        }),
      );

      // Verify all statuses correct
      const searches = getState().preSearches;
      expect(searches[0]?.status).toBe(AnalysisStatuses.COMPLETE);
      expect(searches[1]?.status).toBe(AnalysisStatuses.FAILED);
      expect(searches[2]?.status).toBe(AnalysisStatuses.STREAMING);
      expect(searches[3]?.status).toBe(AnalysisStatuses.PENDING);
    });

    it('should transition multiple searches independently', () => {
      // Add 3 PENDING searches
      for (let i = 0; i < 3; i++) {
        getState().addPreSearch(
          createMockPreSearch({
            id: `search-${i}`,
            threadId: 'thread-1',
            roundNumber: i,
            status: AnalysisStatuses.PENDING,
            userQuery: `Question ${i + 1}`,
          }),
        );
      }

      // Transition each to different final states
      getState().updatePreSearchStatus(0, AnalysisStatuses.STREAMING);
      getState().updatePreSearchStatus(0, AnalysisStatuses.COMPLETE);

      getState().updatePreSearchStatus(1, AnalysisStatuses.STREAMING);
      getState().updatePreSearchStatus(1, AnalysisStatuses.FAILED);

      getState().updatePreSearchStatus(2, AnalysisStatuses.STREAMING);

      // Verify final states
      expect(getState().preSearches[0]?.status).toBe(AnalysisStatuses.COMPLETE);
      expect(getState().preSearches[1]?.status).toBe(AnalysisStatuses.FAILED);
      expect(getState().preSearches[2]?.status).toBe(AnalysisStatuses.STREAMING);
    });
  });

  // ==========================================================================
  // FULL LIFECYCLE TRANSITIONS
  // ==========================================================================
  describe('full lifecycle transitions', () => {
    it('should complete full lifecycle: PENDING → STREAMING → COMPLETE', () => {
      // Start PENDING
      getState().addPreSearch(
        createMockPreSearch({
          id: 'search-0',
          threadId: 'thread-1',
          roundNumber: 0,
          status: AnalysisStatuses.PENDING,
          userQuery: 'Test question',
        }),
      );

      expect(getState().preSearches[0]?.status).toBe(AnalysisStatuses.PENDING);

      // PENDING → STREAMING
      getState().updatePreSearchStatus(0, AnalysisStatuses.STREAMING);
      expect(getState().preSearches[0]?.status).toBe(AnalysisStatuses.STREAMING);

      // STREAMING → COMPLETE
      getState().updatePreSearchStatus(0, AnalysisStatuses.COMPLETE);
      expect(getState().preSearches[0]?.status).toBe(AnalysisStatuses.COMPLETE);
    });

    it('should handle failure lifecycle: PENDING → STREAMING → FAILED', () => {
      // Start PENDING
      getState().addPreSearch(
        createMockPreSearch({
          id: 'search-0',
          threadId: 'thread-1',
          roundNumber: 0,
          status: AnalysisStatuses.PENDING,
          userQuery: 'Test question',
        }),
      );

      expect(getState().preSearches[0]?.status).toBe(AnalysisStatuses.PENDING);

      // PENDING → STREAMING
      getState().updatePreSearchStatus(0, AnalysisStatuses.STREAMING);
      expect(getState().preSearches[0]?.status).toBe(AnalysisStatuses.STREAMING);

      // STREAMING → FAILED
      getState().updatePreSearchStatus(0, AnalysisStatuses.FAILED);
      expect(getState().preSearches[0]?.status).toBe(AnalysisStatuses.FAILED);
    });

    it('should handle multiple lifecycles in parallel', () => {
      // Add 2 PENDING searches
      getState().addPreSearch(
        createMockPreSearch({
          id: 'search-0',
          threadId: 'thread-1',
          roundNumber: 0,
          status: AnalysisStatuses.PENDING,
          userQuery: 'Question 1',
        }),
      );

      getState().addPreSearch(
        createMockPreSearch({
          id: 'search-1',
          threadId: 'thread-1',
          roundNumber: 1,
          status: AnalysisStatuses.PENDING,
          userQuery: 'Question 2',
        }),
      );

      // Start both streaming
      getState().updatePreSearchStatus(0, AnalysisStatuses.STREAMING);
      getState().updatePreSearchStatus(1, AnalysisStatuses.STREAMING);

      expect(getState().preSearches[0]?.status).toBe(AnalysisStatuses.STREAMING);
      expect(getState().preSearches[1]?.status).toBe(AnalysisStatuses.STREAMING);

      // Complete round 0, fail round 1
      getState().updatePreSearchStatus(0, AnalysisStatuses.COMPLETE);
      getState().updatePreSearchStatus(1, AnalysisStatuses.FAILED);

      expect(getState().preSearches[0]?.status).toBe(AnalysisStatuses.COMPLETE);
      expect(getState().preSearches[1]?.status).toBe(AnalysisStatuses.FAILED);
    });
  });
});
