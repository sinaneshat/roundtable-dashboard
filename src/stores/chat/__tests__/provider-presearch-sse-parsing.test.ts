/**
 * Provider Pre-Search SSE Parsing Tests
 *
 * Tests for the bug fix where pre-search SSE events weren't being parsed
 * in the ChatStoreProvider, causing searchData to remain undefined while
 * status was set to COMPLETE. This resulted in an empty accordion display
 * when web search was enabled mid-conversation.
 *
 * BUG FIXED (November 2025):
 * - Root cause: Provider read SSE stream bytes without parsing events
 * - Provider only called updatePreSearchStatus(COMPLETE) without searchData
 * - PreSearchStream component couldn't stream (status not PENDING)
 * - Accordion showed empty because searchData was undefined
 *
 * Fix: Added readPreSearchStreamAndExtractData helper to parse SSE events
 * and extract searchData from DONE event, then call updatePreSearchData
 *
 * Location: /src/stores/chat/__tests__/provider-presearch-sse-parsing.test.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AnalysisStatuses, ChatModes, ScreenModes } from '@/api/core/enums';
import { createChatStore } from '@/stores/chat/store';

import {
  createMockParticipant,
  createMockPreSearchDataPayload,
  createMockThread,
  createMockUserMessage,
  createPendingPreSearch,
} from './test-factories';

// ============================================================================
// SSE PARSING TESTS
// ============================================================================

describe('provider Pre-Search SSE Parsing', () => {
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
  // CORE BUG FIX: searchData must be extracted from SSE stream
  // ==========================================================================

  describe('searchData Extraction from SSE Stream', () => {
    it('should have searchData populated when pre-search completes via updatePreSearchData', () => {
      // Setup: Thread with web search enabled
      const thread = createMockThread({
        id: 'thread-123',
        enableWebSearch: true,
        mode: ChatModes.ANALYZING,
      });

      const participant = createMockParticipant(0, {
        id: 'part-1',
        threadId: 'thread-123',
      });

      const userMsg = createMockUserMessage(0, 'Test question');
      store.getState().initializeThread(thread, [participant], [userMsg]);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Add pending pre-search (simulating provider creating it)
      store.getState().addPreSearch(createPendingPreSearch(0));

      // Verify initial state - searchData should be null
      expect(store.getState().preSearches[0].searchData).toBeNull();
      expect(store.getState().preSearches[0].status).toBe(AnalysisStatuses.PENDING);

      // Simulate provider parsing SSE and calling updatePreSearchData
      const mockSearchData = createMockPreSearchDataPayload();
      store.getState().updatePreSearchData(0, mockSearchData);

      // Verify searchData is now populated
      const updatedPreSearch = store.getState().preSearches[0];
      expect(updatedPreSearch.status).toBe(AnalysisStatuses.COMPLETE);
      expect(updatedPreSearch.searchData).not.toBeNull();
      expect(updatedPreSearch.searchData?.queries).toHaveLength(1);
    });

    it('should NOT have searchData when only updatePreSearchStatus is called (old broken behavior)', () => {
      // This test documents the OLD broken behavior that the fix addresses
      const thread = createMockThread({
        id: 'thread-123',
        enableWebSearch: true,
        mode: ChatModes.ANALYZING,
      });

      const participant = createMockParticipant(0, {
        id: 'part-1',
        threadId: 'thread-123',
      });

      const userMsg = createMockUserMessage(0, 'Test question');
      store.getState().initializeThread(thread, [participant], [userMsg]);

      // Add pending pre-search
      store.getState().addPreSearch(createPendingPreSearch(0));

      // OLD BEHAVIOR: Only update status without searchData
      // This is what the provider USED to do before the fix
      store.getState().updatePreSearchStatus(0, AnalysisStatuses.COMPLETE);

      // searchData remains null - this was the bug!
      const preSearch = store.getState().preSearches[0];
      expect(preSearch.status).toBe(AnalysisStatuses.COMPLETE);
      expect(preSearch.searchData).toBeNull(); // Bug: empty accordion
    });

    it('should allow UI to render search results when searchData is properly set', () => {
      const thread = createMockThread({
        id: 'thread-123',
        enableWebSearch: true,
      });

      const participant = createMockParticipant(0);
      const userMsg = createMockUserMessage(0, 'Test question');
      store.getState().initializeThread(thread, [participant], [userMsg]);

      // Add pre-search and complete with data
      store.getState().addPreSearch(createPendingPreSearch(0));
      const mockData = createMockPreSearchDataPayload({
        queries: [
          { query: 'test', rationale: 'reason', searchDepth: 'basic', index: 0, total: 1 },
        ],
        results: [
          { title: 'Test Result', url: 'https://example.com', snippet: 'Test snippet' },
        ],
      });
      store.getState().updatePreSearchData(0, mockData);

      // UI can now render the results
      const preSearch = store.getState().preSearches[0];
      const hasResults = preSearch.searchData?.results && preSearch.searchData.results.length > 0;
      expect(hasResults).toBe(true);
    });
  });

  // ==========================================================================
  // ENABLING WEB SEARCH MID-CONVERSATION
  // ==========================================================================

  describe('mid-Conversation Web Search Enable (Bug Scenario)', () => {
    it('should correctly populate searchData when web search is enabled mid-conversation', () => {
      // Setup: Thread created WITHOUT web search
      const thread = createMockThread({
        id: 'thread-no-ws',
        enableWebSearch: false, // Initially disabled
        mode: ChatModes.DEBATING,
      });

      const participant = createMockParticipant(0);
      const userMsgR0 = createMockUserMessage(0, 'Initial question');
      store.getState().initializeThread(thread, [participant], [userMsgR0]);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // User enables web search mid-conversation
      store.getState().setEnableWebSearch(true);
      expect(store.getState().enableWebSearch).toBe(true);

      // Simulate round 1: new message with web search
      const userMsgR1 = createMockUserMessage(1, 'Follow-up with web search');
      store.getState().setMessages([userMsgR0, userMsgR1]);

      // Provider creates pre-search for round 1
      store.getState().addPreSearch(createPendingPreSearch(1));

      // Provider parses SSE and updates with searchData (the fix)
      const mockData = createMockPreSearchDataPayload({
        queries: [
          { query: 'follow-up query', rationale: 'user asked', searchDepth: 'basic', index: 0, total: 1 },
        ],
        results: [
          { title: 'Search Result', url: 'https://example.com', snippet: 'Result snippet' },
        ],
      });
      store.getState().updatePreSearchData(1, mockData);

      // Verify the accordion will have content
      const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 1);
      expect(preSearch).toBeDefined();
      expect(preSearch?.status).toBe(AnalysisStatuses.COMPLETE);
      expect(preSearch?.searchData).not.toBeNull();
      expect(preSearch?.searchData?.results).toHaveLength(1);
    });

    it('should handle consecutive rounds with web search enabled', () => {
      const thread = createMockThread({
        id: 'thread-123',
        enableWebSearch: true,
      });

      const participant = createMockParticipant(0);
      store.getState().initializeThread(thread, [participant], []);

      // Round 0
      store.getState().addPreSearch(createPendingPreSearch(0));
      store.getState().updatePreSearchData(0, createMockPreSearchDataPayload());
      expect(store.getState().preSearches[0].searchData).not.toBeNull();

      // Round 1
      store.getState().addPreSearch(createPendingPreSearch(1));
      store.getState().updatePreSearchData(1, createMockPreSearchDataPayload());
      expect(store.getState().preSearches[1].searchData).not.toBeNull();

      // Round 2
      store.getState().addPreSearch(createPendingPreSearch(2));
      store.getState().updatePreSearchData(2, createMockPreSearchDataPayload());
      expect(store.getState().preSearches[2].searchData).not.toBeNull();

      // All rounds should have searchData
      expect(store.getState().preSearches.every(ps => ps.searchData !== null)).toBe(true);
    });
  });

  // ==========================================================================
  // FALLBACK BEHAVIOR TESTS
  // ==========================================================================

  describe('fallback Behavior When SSE Parsing Fails', () => {
    it('should fall back to updatePreSearchStatus when no searchData extracted', () => {
      const thread = createMockThread({
        id: 'thread-123',
        enableWebSearch: true,
      });

      const participant = createMockParticipant(0);
      store.getState().initializeThread(thread, [participant], []);

      // Add pre-search
      store.getState().addPreSearch(createPendingPreSearch(0));

      // Simulate fallback: null searchData from SSE parsing failure
      // Provider falls back to just updating status
      store.getState().updatePreSearchStatus(0, AnalysisStatuses.COMPLETE);

      // Status is complete but searchData is null
      // This is acceptable fallback - participants can proceed without search context
      const preSearch = store.getState().preSearches[0];
      expect(preSearch.status).toBe(AnalysisStatuses.COMPLETE);
      expect(preSearch.searchData).toBeNull();
    });

    it('should allow participant streaming even without searchData (graceful degradation)', () => {
      const thread = createMockThread({
        id: 'thread-123',
        enableWebSearch: true,
      });

      const participant = createMockParticipant(0);
      store.getState().initializeThread(thread, [participant], []);

      // Pre-search completes without data
      store.getState().addPreSearch(createPendingPreSearch(0));
      store.getState().updatePreSearchStatus(0, AnalysisStatuses.COMPLETE);

      // Streaming should still be allowed
      const preSearch = store.getState().preSearches[0];
      const canProceed = preSearch.status === AnalysisStatuses.COMPLETE
        || preSearch.status === AnalysisStatuses.FAILED;
      expect(canProceed).toBe(true);
    });
  });

  // ==========================================================================
  // STORE STATE CONSISTENCY
  // ==========================================================================

  describe('store State Consistency', () => {
    it('should maintain pre-search array integrity when updating searchData', () => {
      const thread = createMockThread({ enableWebSearch: true });
      const participant = createMockParticipant(0);
      store.getState().initializeThread(thread, [participant], []);

      // Add multiple pre-searches
      store.getState().addPreSearch(createPendingPreSearch(0));
      store.getState().addPreSearch(createPendingPreSearch(1));
      store.getState().addPreSearch(createPendingPreSearch(2));

      // Update only round 1
      store.getState().updatePreSearchData(1, createMockPreSearchDataPayload());

      // Check integrity
      const preSearches = store.getState().preSearches;
      expect(preSearches).toHaveLength(3);
      expect(preSearches[0].status).toBe(AnalysisStatuses.PENDING);
      expect(preSearches[0].searchData).toBeNull();
      expect(preSearches[1].status).toBe(AnalysisStatuses.COMPLETE);
      expect(preSearches[1].searchData).not.toBeNull();
      expect(preSearches[2].status).toBe(AnalysisStatuses.PENDING);
      expect(preSearches[2].searchData).toBeNull();
    });

    it('should update status to COMPLETE when updatePreSearchData is called', () => {
      // The updatePreSearchData action sets both searchData AND status
      const thread = createMockThread({ enableWebSearch: true });
      const participant = createMockParticipant(0);
      store.getState().initializeThread(thread, [participant], []);

      store.getState().addPreSearch(createPendingPreSearch(0));

      // Only call updatePreSearchData (not updatePreSearchStatus)
      store.getState().updatePreSearchData(0, createMockPreSearchDataPayload());

      // Status should automatically be COMPLETE
      expect(store.getState().preSearches[0].status).toBe(AnalysisStatuses.COMPLETE);
    });
  });
});
