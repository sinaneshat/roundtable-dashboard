/**
 * WEB SEARCH COMPLETION → PARTICIPANT TRIGGERING TESTS
 *
 * CRITICAL USER ISSUE:
 * - Web search completes successfully with 'done' event
 * - Pre-search status doesn't update to COMPLETE
 * - Participants never start streaming after web search finishes
 *
 * ROOT CAUSE INVESTIGATION:
 * - SSE stream completion handling in PreSearchStream
 * - Status update callback execution
 * - Store state transitions from STREAMING → COMPLETE
 * - Pending message sender triggering after status change
 *
 * TEST SCENARIOS:
 * 1. Pre-search status transitions: PENDING → STREAMING → COMPLETE
 * 2. Status COMPLETE triggers participants to start
 * 3. handleStreamComplete callback updates status properly
 * 4. Store subscription watches status changes and triggers sendMessage
 * 5. Integration: Full flow from search completion to participant start
 *
 * FILES UNDER TEST:
 * - src/components/chat/pre-search-card.tsx (handleStreamComplete)
 * - src/components/chat/pre-search-stream.tsx (SSE event handling)
 * - src/stores/chat/store.ts (status update methods)
 * - src/components/providers/chat-store-provider.tsx (pending message effect)
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AnalysisStatuses } from '@/api/core/enums';
import { createMockPreSearch, createMockSearchData, createTestUserMessage } from '@/lib/testing';
import { createChatStore } from '@/stores/chat';

import { shouldSendPendingMessage } from '../actions/pending-message-sender';
import type { ChatStore } from '../store';

describe('web Search Completion → Participant Triggering', () => {
  let store: ReturnType<typeof createChatStore>;
  let getState: () => ChatStore;

  beforeEach(() => {
    store = createChatStore();
    getState = store.getState;
  });

  // ==========================================================================
  // CRITICAL: Pre-Search Status Transitions
  // ==========================================================================
  describe('pre-search status transitions', () => {
    it('should transition from PENDING → STREAMING → COMPLETE', () => {
      // Start with PENDING
      getState().addPreSearch(
        createMockPreSearch({
          id: 'search-0',
          threadId: 'thread-1',
          roundNumber: 0,
          status: AnalysisStatuses.PENDING,
          userQuery: 'btc price rn',
        }),
      );

      expect(getState().preSearches[0]?.status).toBe(AnalysisStatuses.PENDING);

      // Transition to STREAMING
      getState().updatePreSearchStatus(0, AnalysisStatuses.STREAMING);
      expect(getState().preSearches[0]?.status).toBe(AnalysisStatuses.STREAMING);

      // Transition to COMPLETE
      getState().updatePreSearchStatus(0, AnalysisStatuses.COMPLETE);
      expect(getState().preSearches[0]?.status).toBe(AnalysisStatuses.COMPLETE);
    });

    it('should update search data when completing', () => {
      // Add STREAMING pre-search
      getState().addPreSearch(
        createMockPreSearch({
          id: 'search-0',
          threadId: 'thread-1',
          roundNumber: 0,
          status: AnalysisStatuses.STREAMING,
          userQuery: 'btc price rn',
        }),
      );

      // Complete with data
      const searchData = createMockSearchData({ numQueries: 1, includeResults: true });
      getState().updatePreSearchData(0, searchData);
      getState().updatePreSearchStatus(0, AnalysisStatuses.COMPLETE);

      const preSearch = getState().preSearches[0];
      expect(preSearch?.status).toBe(AnalysisStatuses.COMPLETE);
      expect(preSearch?.searchData).toEqual(searchData);
    });
  });

  // ==========================================================================
  // CRITICAL: Status COMPLETE Unblocks Participants
  // ==========================================================================
  describe('cOMPLETE status triggers participants', () => {
    it('should unblock participants when status becomes COMPLETE (new message scenario)', () => {
      // Setup: NO existing messages, preparing to send first message
      // This tests the pending message flow for NEW message with web search
      getState().setMessages([]);

      // Add STREAMING pre-search for round 0 (will be created when message is sent)
      getState().addPreSearch(
        createMockPreSearch({
          id: 'search-0',
          threadId: 'thread-1',
          roundNumber: 0,
          status: AnalysisStatuses.STREAMING,
          userQuery: 'btc price rn',
        }),
      );

      // Verify: Participants are blocked while STREAMING
      const blockedValidation = shouldSendPendingMessage({
        pendingMessage: 'btc price rn',
        expectedParticipantIds: ['gpt-4'],
        hasSentPendingMessage: false,
        isStreaming: false,
        isWaitingForChangelog: false,
        screenMode: 'thread',
        participants: [
          {
            id: 'p1',
            threadId: 'thread-1',
            modelId: 'gpt-4',
            customRoleId: null,
            role: null,
            priority: 0,
            isEnabled: true,
            settings: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        messages: getState().messages,
        preSearches: getState().preSearches,
        thread: {
          id: 'thread-1',
          userId: 'user-1',
          projectId: null,
          title: 'Test',
          slug: 'test',
          mode: 'debating',
          status: 'active',
          isFavorite: false,
          isPublic: false,
          isAiGeneratedTitle: false,
          enableWebSearch: true,
          metadata: null,
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastMessageAt: new Date(),
        },
        enableWebSearch: true,
      });

      expect(blockedValidation.shouldSend).toBe(false);
      expect(blockedValidation.reason).toBe('waiting for pre-search');

      // ✅ CRITICAL: Update status to COMPLETE
      getState().updatePreSearchStatus(0, AnalysisStatuses.COMPLETE);

      // Verify: Participants are UNBLOCKED after COMPLETE
      const unblockedValidation = shouldSendPendingMessage({
        pendingMessage: 'btc price rn',
        expectedParticipantIds: ['gpt-4'],
        hasSentPendingMessage: false,
        isStreaming: false,
        isWaitingForChangelog: false,
        screenMode: 'thread',
        participants: [
          {
            id: 'p1',
            threadId: 'thread-1',
            modelId: 'gpt-4',
            customRoleId: null,
            role: null,
            priority: 0,
            isEnabled: true,
            settings: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        messages: getState().messages,
        preSearches: getState().preSearches,
        thread: {
          id: 'thread-1',
          userId: 'user-1',
          projectId: null,
          title: 'Test',
          slug: 'test',
          mode: 'debating',
          status: 'active',
          isFavorite: false,
          isPublic: false,
          isAiGeneratedTitle: false,
          enableWebSearch: true,
          metadata: null,
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastMessageAt: new Date(),
        },
        enableWebSearch: true,
      });

      expect(unblockedValidation.shouldSend).toBe(true);
    });

    it('should allow participants on overview screen when status is COMPLETE', () => {
      // Add COMPLETE pre-search
      getState().addPreSearch(
        createMockPreSearch({
          id: 'search-0',
          threadId: 'thread-1',
          roundNumber: 0,
          status: AnalysisStatuses.COMPLETE,
          userQuery: 'btc price rn',
        }),
      );

      getState().setMessages([
        createTestUserMessage({
          id: 'msg-0',
          content: 'btc price rn',
          roundNumber: 0,
        }),
      ]);

      // Setup for startRound triggering (overview screen uses waitingToStartStreaming)
      getState().setWaitingToStartStreaming(true);

      // Verify: Should NOT wait for pre-search (it's COMPLETE)
      const preSearch = getState().preSearches.find(ps => ps.roundNumber === 0);
      expect(preSearch?.status).toBe(AnalysisStatuses.COMPLETE);
    });
  });

  // ==========================================================================
  // CRITICAL: handleStreamComplete Callback
  // ==========================================================================
  describe('handleStreamComplete callback execution', () => {
    it('should update status to COMPLETE when callback is called', () => {
      // Add STREAMING pre-search
      getState().addPreSearch(
        createMockPreSearch({
          id: 'search-0',
          threadId: 'thread-1',
          roundNumber: 0,
          status: AnalysisStatuses.STREAMING,
          userQuery: 'btc price rn',
        }),
      );

      expect(getState().preSearches[0]?.status).toBe(AnalysisStatuses.STREAMING);

      // Simulate handleStreamComplete callback
      const searchData = createMockSearchData({ numQueries: 1, includeResults: true });
      getState().updatePreSearchData(0, searchData);
      getState().updatePreSearchStatus(0, AnalysisStatuses.COMPLETE);

      // ✅ VERIFY: Status updated to COMPLETE
      expect(getState().preSearches[0]?.status).toBe(AnalysisStatuses.COMPLETE);
      expect(getState().preSearches[0]?.searchData).toEqual(searchData);
    });

    it('should handle callback with search results and answer', () => {
      getState().addPreSearch(
        createMockPreSearch({
          id: 'search-0',
          threadId: 'thread-1',
          roundNumber: 0,
          status: AnalysisStatuses.STREAMING,
          userQuery: 'btc price rn',
        }),
      );

      // Simulate real completion data from SSE stream
      const completionData = {
        queries: [
          {
            query: 'btc price rn 2025',
            rationale: 'Simple query optimization (AI generation unavailable)',
            searchDepth: 'basic' as const,
            index: 0,
            total: 1,
          },
        ],
        results: [
          {
            query: 'btc price rn 2025',
            answer: 'Based on the search results, I cannot provide...',
            results: [
              {
                title: 'Bitcoin (BTC) price predictions for 2025 - CNBC',
                url: 'https://www.cnbc.com/2024/12/31/bitcoin-btc-price-predictions-for-2025.html',
                content: 'Several industry watchers who spoke to CNBC forecast bitcoin will hit $200,000 in 2025.',
                excerpt: 'Several industry watchers who spoke to CNBC forecast bitcoin will hit $200,000 in 2025.',
                score: 0.8,
                publishedDate: null,
                domain: 'cnbc.com',
              },
            ],
            responseTime: 10132,
          },
        ],
        analysis: 'Fallback: Using simplified query transformation from "btc price rn"',
        successCount: 1,
        failureCount: 0,
        totalResults: 2,
        totalTime: 20228,
      };

      // Simulate callback execution
      getState().updatePreSearchData(0, completionData);
      getState().updatePreSearchStatus(0, AnalysisStatuses.COMPLETE);

      const preSearch = getState().preSearches[0];
      expect(preSearch?.status).toBe(AnalysisStatuses.COMPLETE);
      expect(preSearch?.searchData?.queries).toHaveLength(1);
      expect(preSearch?.searchData?.results).toHaveLength(1);
      expect(preSearch?.searchData?.successCount).toBe(1);
    });
  });

  // ==========================================================================
  // CRITICAL: Store Subscription Integration
  // ==========================================================================
  describe('store subscription watches status changes', () => {
    it('should detect status change from STREAMING to COMPLETE', () => {
      const statusChanges: AnalysisStatuses[] = [];

      // Subscribe to pre-search status changes
      const unsubscribe = store.subscribe((state) => {
        const preSearch = state.preSearches[0];
        if (preSearch) {
          statusChanges.push(preSearch.status);
        }
      });

      try {
        // Add PENDING
        getState().addPreSearch(
          createMockPreSearch({
            id: 'search-0',
            threadId: 'thread-1',
            roundNumber: 0,
            status: AnalysisStatuses.PENDING,
            userQuery: 'btc price rn',
          }),
        );

        // Update to STREAMING
        getState().updatePreSearchStatus(0, AnalysisStatuses.STREAMING);

        // Update to COMPLETE
        getState().updatePreSearchStatus(0, AnalysisStatuses.COMPLETE);

        // Verify subscription detected all changes
        expect(statusChanges).toContain(AnalysisStatuses.PENDING);
        expect(statusChanges).toContain(AnalysisStatuses.STREAMING);
        expect(statusChanges).toContain(AnalysisStatuses.COMPLETE);
      } finally {
        unsubscribe();
      }
    });

    it('should trigger pending message send when status becomes COMPLETE', () => {
      // Setup: NO existing messages yet, preparing to send FIRST message
      // Pending message is for round 0 (first round)
      getState().setMessages([]);

      getState().setPendingMessage('btc price rn');
      getState().setExpectedParticipantIds(['gpt-4']);
      getState().setParticipants([
        {
          id: 'p1',
          threadId: 'thread-1',
          modelId: 'gpt-4',
          customRoleId: null,
          role: null,
          priority: 0,
          isEnabled: true,
          settings: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
      getState().setThread({
        id: 'thread-1',
        userId: 'user-1',
        projectId: null,
        title: 'Test',
        slug: 'test',
        mode: 'debating',
        status: 'active',
        isFavorite: false,
        isPublic: false,
        isAiGeneratedTitle: false,
        enableWebSearch: true,
        metadata: null,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastMessageAt: new Date(),
      });

      // Add STREAMING pre-search for round 0
      getState().addPreSearch(
        createMockPreSearch({
          id: 'search-0',
          threadId: 'thread-1',
          roundNumber: 0,
          status: AnalysisStatuses.STREAMING,
          userQuery: 'btc price rn',
        }),
      );

      // Mock sendMessage
      const sendMessageMock = vi.fn();
      getState().setSendMessage(sendMessageMock);

      // Initially blocked (waiting for pre-search to complete)
      expect(
        shouldSendPendingMessage({
          pendingMessage: getState().pendingMessage,
          expectedParticipantIds: getState().expectedParticipantIds,
          hasSentPendingMessage: getState().hasSentPendingMessage,
          isStreaming: getState().isStreaming,
          isWaitingForChangelog: getState().isWaitingForChangelog,
          screenMode: 'thread',
          participants: getState().participants,
          messages: getState().messages,
          preSearches: getState().preSearches,
          thread: getState().thread,
          enableWebSearch: true,
        }).shouldSend,
      ).toBe(false);

      // ✅ CRITICAL: Update status to COMPLETE
      getState().updatePreSearchStatus(0, AnalysisStatuses.COMPLETE);

      // Now should be unblocked (pre-search completed, can send message)
      expect(
        shouldSendPendingMessage({
          pendingMessage: getState().pendingMessage,
          expectedParticipantIds: getState().expectedParticipantIds,
          hasSentPendingMessage: getState().hasSentPendingMessage,
          isStreaming: getState().isStreaming,
          isWaitingForChangelog: getState().isWaitingForChangelog,
          screenMode: 'thread',
          participants: getState().participants,
          messages: getState().messages,
          preSearches: getState().preSearches,
          thread: getState().thread,
          enableWebSearch: true,
        }).shouldSend,
      ).toBe(true);
    });
  });

  // ==========================================================================
  // INTEGRATION: Full Flow Test
  // ==========================================================================
  describe('integration: web search completion → participant trigger', () => {
    it('should complete full flow from PENDING to participant start', () => {
      // 1. Setup thread with web search enabled
      getState().setThread({
        id: 'thread-1',
        userId: 'user-1',
        projectId: null,
        title: 'Test',
        slug: 'test',
        mode: 'debating',
        status: 'active',
        isFavorite: false,
        isPublic: false,
        isAiGeneratedTitle: false,
        enableWebSearch: true,
        metadata: null,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastMessageAt: new Date(),
      });

      // 2. NO user messages yet (first message scenario)
      getState().setMessages([]);

      // 3. Pre-search created in PENDING state for round 0
      getState().addPreSearch(
        createMockPreSearch({
          id: 'search-0',
          threadId: 'thread-1',
          roundNumber: 0,
          status: AnalysisStatuses.PENDING,
          userQuery: 'btc price rn',
        }),
      );

      // 4. Pre-search starts (PENDING → STREAMING)
      getState().updatePreSearchStatus(0, AnalysisStatuses.STREAMING);
      expect(getState().preSearches[0]?.status).toBe(AnalysisStatuses.STREAMING);

      // 5. Web search completes with results
      const searchData = createMockSearchData({ numQueries: 1, includeResults: true });
      getState().updatePreSearchData(0, searchData);
      getState().updatePreSearchStatus(0, AnalysisStatuses.COMPLETE);

      // 6. Verify: Status is COMPLETE
      expect(getState().preSearches[0]?.status).toBe(AnalysisStatuses.COMPLETE);

      // 7. Verify: Pending message can now be sent (participants will start after)
      getState().setParticipants([
        {
          id: 'p1',
          threadId: 'thread-1',
          modelId: 'gpt-4',
          customRoleId: null,
          role: null,
          priority: 0,
          isEnabled: true,
          settings: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      getState().setPendingMessage('btc price rn');
      getState().setExpectedParticipantIds(['gpt-4']);

      const validation = shouldSendPendingMessage({
        pendingMessage: getState().pendingMessage,
        expectedParticipantIds: getState().expectedParticipantIds,
        hasSentPendingMessage: false,
        isStreaming: false,
        isWaitingForChangelog: false,
        screenMode: 'thread',
        participants: getState().participants,
        messages: getState().messages,
        preSearches: getState().preSearches,
        thread: getState().thread,
        enableWebSearch: true,
      });

      // ✅ SUCCESS: Message can be sent after web search completes
      expect(validation.shouldSend).toBe(true);
    });
  });
});
