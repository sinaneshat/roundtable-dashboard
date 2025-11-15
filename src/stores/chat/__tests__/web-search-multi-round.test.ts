/**
 * Web Search Multi-Round Integration Tests
 *
 * Tests web search across multiple conversation rounds:
 * 1. Round 0: Web search enabled from start, search executes before participants
 * 2. Round 1: Web search still enabled, search executes again for new question
 * 3. Round 2: Web search still enabled, search executes for third question
 * 4. Mid-conversation enable: Round 0 without search, Round 1 with search enabled
 * 5. Mid-conversation disable: Round 0 with search, Round 1 without search
 * 6. Search failure doesn't block participants from responding
 * 7. Multiple searches tracked independently per round
 * 8. Store correctly associates search results with round numbers
 *
 * Pattern follows: /src/stores/chat/__tests__/multi-round-flow.test.ts
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { AnalysisStatuses } from '@/api/core/enums';
import { createMockPreSearch, createMockSearchData } from '@/lib/testing';
import { createChatStore } from '@/stores/chat';

import type { ChatStore } from '../store';

describe('web Search Multi-Round Integration', () => {
  let store: ReturnType<typeof createChatStore>;
  let getState: () => ChatStore;

  beforeEach(() => {
    store = createChatStore();
    getState = store.getState;
  });

  describe('continuous web search flow', () => {
    it('should execute search for round 0 when enabled from start', () => {
      // Enable web search
      getState().setEnableWebSearch(true);
      expect(getState().enableWebSearch).toBe(true);

      // Add round 0 search
      const search0 = createMockPreSearch({
        id: 'search-0',
        threadId: 'thread-1',
        roundNumber: 0,
        status: AnalysisStatuses.PENDING,
        userQuery: 'First question',
      });

      getState().addPreSearch(search0);
      getState().markPreSearchTriggered(0);

      // Simulate stream complete
      const searchData = createMockSearchData();
      getState().updatePreSearchData(0, searchData);
      getState().updatePreSearchStatus(0, AnalysisStatuses.COMPLETE);

      const searches = getState().preSearches;
      expect(searches).toHaveLength(1);
      expect(searches[0]?.roundNumber).toBe(0);
      expect(searches[0]?.status).toBe(AnalysisStatuses.COMPLETE);
      expect(searches[0]?.searchData).toEqual(searchData);
      expect(getState().hasPreSearchBeenTriggered(0)).toBe(true);
    });

    it('should execute search for each round when enabled', () => {
      // Enable web search
      getState().setEnableWebSearch(true);

      // Round 0 - add search
      const search0 = createMockPreSearch({
        id: 'search-0',
        threadId: 'thread-1',
        roundNumber: 0,
        status: AnalysisStatuses.PENDING,
        userQuery: 'First question',
      });

      getState().addPreSearch(search0);
      getState().markPreSearchTriggered(0);

      // Complete round 0
      getState().updatePreSearchData(0, createMockSearchData());
      getState().updatePreSearchStatus(0, AnalysisStatuses.COMPLETE);

      // Round 1 - add search
      const search1 = createMockPreSearch({
        id: 'search-1',
        threadId: 'thread-1',
        roundNumber: 1,
        status: AnalysisStatuses.PENDING,
        userQuery: 'Second question',
      });

      getState().addPreSearch(search1);
      getState().markPreSearchTriggered(1);

      // Complete round 1
      getState().updatePreSearchData(1, createMockSearchData());
      getState().updatePreSearchStatus(1, AnalysisStatuses.COMPLETE);

      // Round 2 - add search
      const search2 = createMockPreSearch({
        id: 'search-2',
        threadId: 'thread-1',
        roundNumber: 2,
        status: AnalysisStatuses.PENDING,
        userQuery: 'Third question',
      });

      getState().addPreSearch(search2);
      getState().markPreSearchTriggered(2);

      // Complete round 2
      getState().updatePreSearchData(2, createMockSearchData());
      getState().updatePreSearchStatus(2, AnalysisStatuses.COMPLETE);

      // Verify all searches tracked
      const searches = getState().preSearches;
      expect(searches).toHaveLength(3);

      const round0 = searches.find(s => s.roundNumber === 0);
      const round1 = searches.find(s => s.roundNumber === 1);
      const round2 = searches.find(s => s.roundNumber === 2);

      expect(round0?.status).toBe(AnalysisStatuses.COMPLETE);
      expect(round1?.status).toBe(AnalysisStatuses.COMPLETE);
      expect(round2?.status).toBe(AnalysisStatuses.COMPLETE);

      expect(getState().hasPreSearchBeenTriggered(0)).toBe(true);
      expect(getState().hasPreSearchBeenTriggered(1)).toBe(true);
      expect(getState().hasPreSearchBeenTriggered(2)).toBe(true);
    });
  });

  describe('mid-conversation enable/disable', () => {
    it('should handle mid-conversation enable: Round 0 without search, Round 1 with search', () => {
      // Round 0 - web search disabled
      expect(getState().enableWebSearch).toBe(false);

      // No search for round 0
      expect(getState().preSearches).toHaveLength(0);
      expect(getState().hasPreSearchBeenTriggered(0)).toBe(false);

      // Mid-conversation: enable web search
      getState().setEnableWebSearch(true);

      // Round 1 - should have search
      const search1 = createMockPreSearch({
        id: 'search-1',
        threadId: 'thread-1',
        roundNumber: 1,
        status: AnalysisStatuses.PENDING,
        userQuery: 'Second question with search',
      });

      getState().addPreSearch(search1);
      getState().markPreSearchTriggered(1);
      getState().updatePreSearchStatus(1, AnalysisStatuses.COMPLETE);

      const searches = getState().preSearches;
      expect(searches).toHaveLength(1);
      expect(searches[0]?.roundNumber).toBe(1);
      expect(getState().hasPreSearchBeenTriggered(0)).toBe(false);
      expect(getState().hasPreSearchBeenTriggered(1)).toBe(true);
    });

    it('should handle mid-conversation disable: Round 0 with search, Round 1 without search', () => {
      // Round 0 - web search enabled
      getState().setEnableWebSearch(true);

      const search0 = createMockPreSearch({
        id: 'search-0',
        threadId: 'thread-1',
        roundNumber: 0,
        status: AnalysisStatuses.PENDING,
        userQuery: 'First question',
      });

      getState().addPreSearch(search0);
      getState().markPreSearchTriggered(0);
      getState().updatePreSearchStatus(0, AnalysisStatuses.COMPLETE);

      // Mid-conversation: disable web search
      getState().setEnableWebSearch(false);

      // Round 1 - should NOT add search
      // (This would be prevented by higher-level logic)
      expect(getState().enableWebSearch).toBe(false);

      // Round 0 search should still exist
      const searches = getState().preSearches;
      expect(searches).toHaveLength(1);
      expect(searches[0]?.roundNumber).toBe(0);
      expect(getState().hasPreSearchBeenTriggered(0)).toBe(true);
      expect(getState().hasPreSearchBeenTriggered(1)).toBe(false);
    });
  });

  describe('search failure scenarios', () => {
    it('should handle search failure without blocking participants', () => {
      getState().setEnableWebSearch(true);

      // Round 0 - search fails
      const search0 = createMockPreSearch({
        id: 'search-0',
        threadId: 'thread-1',
        roundNumber: 0,
        status: AnalysisStatuses.PENDING,
        userQuery: 'First question',
      });

      getState().addPreSearch(search0);
      getState().markPreSearchTriggered(0);

      // Simulate failure
      getState().updatePreSearchStatus(0, AnalysisStatuses.FAILED);

      const searches = getState().preSearches;
      expect(searches[0]?.status).toBe(AnalysisStatuses.FAILED);

      // Should still be marked as triggered (prevents retry without explicit clear)
      expect(getState().hasPreSearchBeenTriggered(0)).toBe(true);

      // Participants can still respond (managed by higher-level flow)
      // This test just verifies store doesn't break
    });

    it('should allow continuation to round 1 after round 0 failure', () => {
      getState().setEnableWebSearch(true);

      // Round 0 - search fails
      const search0 = createMockPreSearch({
        id: 'search-0',
        threadId: 'thread-1',
        roundNumber: 0,
        status: AnalysisStatuses.FAILED,
        userQuery: 'First question',
      });

      getState().addPreSearch(search0);
      getState().markPreSearchTriggered(0);

      // Round 1 - new search succeeds
      const search1 = createMockPreSearch({
        id: 'search-1',
        threadId: 'thread-1',
        roundNumber: 1,
        status: AnalysisStatuses.PENDING,
        userQuery: 'Second question',
      });

      getState().addPreSearch(search1);
      getState().markPreSearchTriggered(1);
      getState().updatePreSearchData(1, createMockSearchData());
      getState().updatePreSearchStatus(1, AnalysisStatuses.COMPLETE);

      const searches = getState().preSearches;
      expect(searches).toHaveLength(2);
      expect(searches[0]?.status).toBe(AnalysisStatuses.FAILED);
      expect(searches[1]?.status).toBe(AnalysisStatuses.COMPLETE);
    });
  });

  describe('search data isolation per round', () => {
    it('should correctly associate search results with round numbers', () => {
      getState().setEnableWebSearch(true);

      // Create distinct search data for each round
      const searchData0 = createMockSearchData({ numQueries: 2 });
      const searchData1 = createMockSearchData({ numQueries: 3 });
      const searchData2 = createMockSearchData({ numQueries: 1 });

      // Round 0
      const search0 = createMockPreSearch({
        id: 'search-0',
        threadId: 'thread-1',
        roundNumber: 0,
        status: AnalysisStatuses.PENDING,
        userQuery: 'Question for round 0',
      });
      getState().addPreSearch(search0);
      getState().updatePreSearchData(0, searchData0);
      getState().updatePreSearchStatus(0, AnalysisStatuses.COMPLETE);

      // Round 1
      const search1 = createMockPreSearch({
        id: 'search-1',
        threadId: 'thread-1',
        roundNumber: 1,
        status: AnalysisStatuses.PENDING,
        userQuery: 'Question for round 1',
      });
      getState().addPreSearch(search1);
      getState().updatePreSearchData(1, searchData1);
      getState().updatePreSearchStatus(1, AnalysisStatuses.COMPLETE);

      // Round 2
      const search2 = createMockPreSearch({
        id: 'search-2',
        threadId: 'thread-1',
        roundNumber: 2,
        status: AnalysisStatuses.PENDING,
        userQuery: 'Question for round 2',
      });
      getState().addPreSearch(search2);
      getState().updatePreSearchData(2, searchData2);
      getState().updatePreSearchStatus(2, AnalysisStatuses.COMPLETE);

      // Verify data isolation
      const searches = getState().preSearches;
      const round0 = searches.find(s => s.roundNumber === 0);
      const round1 = searches.find(s => s.roundNumber === 1);
      const round2 = searches.find(s => s.roundNumber === 2);

      expect(round0?.searchData?.queries).toHaveLength(2);
      expect(round1?.searchData?.queries).toHaveLength(3);
      expect(round2?.searchData?.queries).toHaveLength(1);

      // Ensure no cross-contamination
      expect(round0?.searchData).not.toEqual(round1?.searchData);
      expect(round1?.searchData).not.toEqual(round2?.searchData);
      expect(round0?.searchData).not.toEqual(round2?.searchData);
    });

    it('should independently track triggered status per round', () => {
      getState().setEnableWebSearch(true);

      // Mark various rounds as triggered
      getState().markPreSearchTriggered(0);
      getState().markPreSearchTriggered(2);
      getState().markPreSearchTriggered(5);

      expect(getState().hasPreSearchBeenTriggered(0)).toBe(true);
      expect(getState().hasPreSearchBeenTriggered(1)).toBe(false);
      expect(getState().hasPreSearchBeenTriggered(2)).toBe(true);
      expect(getState().hasPreSearchBeenTriggered(3)).toBe(false);
      expect(getState().hasPreSearchBeenTriggered(4)).toBe(false);
      expect(getState().hasPreSearchBeenTriggered(5)).toBe(true);

      // Clear round 2
      getState().clearPreSearchTracking(2);

      expect(getState().hasPreSearchBeenTriggered(0)).toBe(true);
      expect(getState().hasPreSearchBeenTriggered(2)).toBe(false);
      expect(getState().hasPreSearchBeenTriggered(5)).toBe(true);
    });
  });

  describe('concurrent round scenarios', () => {
    it('should handle rapid round transitions with different search states', () => {
      getState().setEnableWebSearch(true);

      // Simulate rapid user interactions across rounds
      // Round 0 - streaming
      const search0 = createMockPreSearch({
        id: 'search-0',
        threadId: 'thread-1',
        roundNumber: 0,
        status: AnalysisStatuses.STREAMING,
        userQuery: 'Question 0',
      });
      getState().addPreSearch(search0);
      getState().markPreSearchTriggered(0);

      // Round 1 - pending (started while 0 still streaming)
      const search1 = createMockPreSearch({
        id: 'search-1',
        threadId: 'thread-1',
        roundNumber: 1,
        status: AnalysisStatuses.PENDING,
        userQuery: 'Question 1',
      });
      getState().addPreSearch(search1);
      getState().markPreSearchTriggered(1);

      // Round 0 completes
      getState().updatePreSearchData(0, createMockSearchData());
      getState().updatePreSearchStatus(0, AnalysisStatuses.COMPLETE);

      // Round 1 starts streaming
      getState().updatePreSearchStatus(1, AnalysisStatuses.STREAMING);

      // Round 2 - pending
      const search2 = createMockPreSearch({
        id: 'search-2',
        threadId: 'thread-1',
        roundNumber: 2,
        status: AnalysisStatuses.PENDING,
        userQuery: 'Question 2',
      });
      getState().addPreSearch(search2);

      // Verify all states are independent
      const searches = getState().preSearches;
      expect(searches).toHaveLength(3);

      const round0 = searches.find(s => s.roundNumber === 0);
      const round1 = searches.find(s => s.roundNumber === 1);
      const round2 = searches.find(s => s.roundNumber === 2);

      expect(round0?.status).toBe(AnalysisStatuses.COMPLETE);
      expect(round1?.status).toBe(AnalysisStatuses.STREAMING);
      expect(round2?.status).toBe(AnalysisStatuses.PENDING);
    });
  });

  describe('search state persistence', () => {
    it('should persist completed searches when adding new rounds', () => {
      getState().setEnableWebSearch(true);

      // Complete 3 rounds
      for (let i = 0; i < 3; i++) {
        const search = createMockPreSearch({
          id: `search-${i}`,
          threadId: 'thread-1',
          roundNumber: i,
          status: AnalysisStatuses.PENDING,
          userQuery: `Question ${i}`,
        });

        getState().addPreSearch(search);
        getState().markPreSearchTriggered(i);
        getState().updatePreSearchData(i, createMockSearchData());
        getState().updatePreSearchStatus(i, AnalysisStatuses.COMPLETE);
      }

      // All should be complete and persisted
      const searches = getState().preSearches;
      expect(searches).toHaveLength(3);

      searches.forEach((search, index) => {
        expect(search.roundNumber).toBe(index);
        expect(search.status).toBe(AnalysisStatuses.COMPLETE);
        expect(search.searchData).toBeDefined();
      });

      // Triggered state should persist
      expect(getState().hasPreSearchBeenTriggered(0)).toBe(true);
      expect(getState().hasPreSearchBeenTriggered(1)).toBe(true);
      expect(getState().hasPreSearchBeenTriggered(2)).toBe(true);
    });

    it('should maintain search state after form reset', () => {
      getState().setEnableWebSearch(true);

      // Add and complete a search
      const search0 = createMockPreSearch({
        id: 'search-0',
        threadId: 'thread-1',
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
        userQuery: 'Question 0',
        searchData: createMockSearchData(),
      });

      getState().addPreSearch(search0);
      getState().markPreSearchTriggered(0);

      // Reset form (should not clear pre-searches unless explicitly cleared)
      getState().resetForm();

      // Pre-search should still exist
      const searches = getState().preSearches;
      expect(searches).toHaveLength(1);
      expect(searches[0]?.roundNumber).toBe(0);
      expect(searches[0]?.status).toBe(AnalysisStatuses.COMPLETE);

      // Note: enableWebSearch resets to false after resetForm
      expect(getState().enableWebSearch).toBe(false);
    });
  });
});
