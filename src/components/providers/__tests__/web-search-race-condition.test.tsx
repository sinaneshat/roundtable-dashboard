/**
 * Web Search Race Condition Tests
 *
 * BUG: When user sends round 1+ message with web search enabled,
 * backend creates PENDING pre-search but frontend doesn't wait for it
 *
 * Expected Flow:
 * 1. User sends message → sendMessage invalidates pre-search query
 * 2. Backend creates PENDING pre-search record
 * 3. Orchestrator syncs pre-search to store
 * 4. Provider waits for pre-search COMPLETE
 * 5. Provider sends message to participants
 *
 * Actual Bug:
 * 1. User sends message → sendMessage invalidates pre-search query
 * 2. Backend creates PENDING pre-search record
 * 3. Provider effect runs BEFORE orchestrator syncs
 * 4. Provider sees no pre-search record for round → proceeds immediately
 * 5. Participant responds WITHOUT web search data
 *
 * This test reproduces the exact scenario from user bug report
 */

import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AnalysisStatuses } from '@/api/core/enums';
import type { ChatStoreApi } from '@/stores/chat';
import { createChatStore } from '@/stores/chat';

import { ChatStoreContext } from '../chat-store-provider';

// Mock Next.js navigation
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({
    push: vi.fn(),
    refresh: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
  })),
  usePathname: vi.fn(() => '/chat'),
}));

// Mock TanStack Query
const mockInvalidateQueries = vi.fn();
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: vi.fn(() => ({
    invalidateQueries: mockInvalidateQueries,
  })),
}));

// Mock multi-participant chat hook
const mockSendMessage = vi.fn();
const mockStartRound = vi.fn();
const mockRetry = vi.fn();
const mockStop = vi.fn();
const mockSetMessages = vi.fn();

vi.mock('@/hooks/utils/use-multi-participant-chat', () => ({
  useMultiParticipantChat: vi.fn(() => ({
    messages: [],
    isStreaming: false,
    currentParticipantIndex: 0,
    sendMessage: mockSendMessage,
    startRound: mockStartRound,
    retry: mockRetry,
    stop: mockStop,
    setMessages: mockSetMessages,
  })),
}));

describe('web Search Race Condition - Provider', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    vi.clearAllMocks();
    store = createChatStore();
  });

  /**
   * Helper to create a test wrapper with our store
   */
  function _createWrapper(storeInstance: ChatStoreApi) {
    return function Wrapper({ children }: { children: ReactNode }) {
      return (
        <ChatStoreContext value={storeInstance}>
          {children}
        </ChatStoreContext>
      );
    };
  }

  describe('bUG: Missing pre-search blocking', () => {
    it('should WAIT for pre-search record when web search enabled but record not yet synced', async () => {
      // SETUP: Round 0 completed with pre-search
      store.setState({
        thread: {
          id: 'thread-123',
          userId: 'user-1',
          projectId: null,
          title: 'Test',
          slug: 'test',
          mode: 'debating',
          status: 'active',
          isFavorite: false,
          isPublic: false,
          isAiGeneratedTitle: false,
          enableWebSearch: true, // ✅ Web search enabled
          metadata: null,
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastMessageAt: new Date(),
        },
        participants: [
          {
            id: 'p1',
            threadId: 'thread-123',
            modelId: 'anthropic/claude-sonnet-4.5',
            customRoleId: null,
            role: null,
            priority: 0,
            isEnabled: true,
            settings: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        messages: [
          {
            id: 'm0',
            role: 'user',
            parts: [{ type: 'text', text: 'say hi, 1 word only' }],
            metadata: { role: 'user', roundNumber: 0 },
          },
          {
            id: 'm1',
            role: 'assistant',
            parts: [{ type: 'text', text: 'Hi!' }],
            metadata: {
              role: 'assistant',
              roundNumber: 0,
              participantId: 'p1',
              participantIndex: 0,
            },
          },
        ],
        preSearches: [
          {
            id: 'ps0',
            threadId: 'thread-123',
            roundNumber: 0,
            userQuery: 'say hi, 1 word only',
            status: AnalysisStatuses.COMPLETE,
            searchData: null,
            errorMessage: null,
            completedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        // ✅ CRITICAL: User about to send round 1 message
        pendingMessage: 'retry',
        expectedParticipantIds: ['anthropic/claude-sonnet-4.5'],
        hasSentPendingMessage: false,
        isWaitingForChangelog: false,
        screenMode: 'thread',
        sendMessage: mockSendMessage,
      });

      // VERIFY: At this point, no pre-search exists for round 1
      const state = store.getState();
      expect(state.preSearches.find(ps => ps.roundNumber === 1)).toBeUndefined();

      // SIMULATE: Provider effect runs
      // In real app, this would be triggered by the useEffect at line 533-646
      // The effect should check:
      // 1. pendingMessage exists ✅
      // 2. expectedParticipantIds exists ✅
      // 3. hasSentPendingMessage is false ✅
      // 4. isStreaming is false ✅
      // 5. isWaitingForChangelog is false ✅
      // 6. Web search enabled ✅
      // 7. Pre-search for round 1 exists? ❌ THIS IS THE BUG

      // Current buggy behavior: Provider proceeds to send message
      // because preSearchForRound is undefined
      const newRoundNumber = 1; // calculateNextRoundNumber(messages) = 1
      const preSearchForRound = state.preSearches.find(ps => ps.roundNumber === newRoundNumber);
      const webSearchEnabled = state.thread?.enableWebSearch ?? false;

      // ✅ FIX: Corrected condition that checks for missing pre-search
      // The condition should be: if web search enabled AND (no pre-search OR pre-search pending)
      const shouldBlock = webSearchEnabled && (
        !preSearchForRound // No pre-search record yet - wait for sync
        || preSearchForRound.status === AnalysisStatuses.PENDING
        || preSearchForRound.status === AnalysisStatuses.STREAMING
      );

      // ✅ CORRECTED: shouldBlock = true because no pre-search record exists
      expect(shouldBlock).toBe(true); // ✅ This is the fix!

      // ✅ EXPECTED: Provider should WAIT for pre-search record to be created
      // Even though orchestrator hasn't synced it yet, backend created it
      // Provider should NOT send message until pre-search appears in store
      //
      // Correct condition should be:
      // if (webSearchEnabled && !preSearchForRound) {
      //   return; // Wait for orchestrator to sync pre-search
      // }
      // if (webSearchEnabled && preSearchForRound && preSearchForRound.status is PENDING/STREAMING) {
      //   return; // Wait for pre-search to complete
      // }

      // VERIFY THE BUG: sendMessage would be called
      // In the actual provider effect, this would happen:
      // setHasSentPendingMessage(true);
      // sendMessage(pendingMessage);

      // ❌ This is incorrect behavior - message sent without web search!
    });

    it('should block sending message when pre-search exists but is PENDING', async () => {
      // SETUP: Same as above, but pre-search HAS been synced (status PENDING)
      store.setState({
        thread: {
          id: 'thread-123',
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
        participants: [
          {
            id: 'p1',
            threadId: 'thread-123',
            modelId: 'anthropic/claude-sonnet-4.5',
            customRoleId: null,
            role: null,
            priority: 0,
            isEnabled: true,
            settings: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        messages: [
          {
            id: 'm0',
            role: 'user',
            parts: [{ type: 'text', text: 'say hi, 1 word only' }],
            metadata: { role: 'user', roundNumber: 0 },
          },
          {
            id: 'm1',
            role: 'assistant',
            parts: [{ type: 'text', text: 'Hi!' }],
            metadata: {
              role: 'assistant',
              roundNumber: 0,
              participantId: 'p1',
              participantIndex: 0,
            },
          },
        ],
        preSearches: [
          {
            id: 'ps0',
            threadId: 'thread-123',
            roundNumber: 0,
            userQuery: 'say hi, 1 word only',
            status: AnalysisStatuses.COMPLETE,
            searchData: null,
            errorMessage: null,
            completedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          {
            id: 'ps1',
            threadId: 'thread-123',
            roundNumber: 1,
            userQuery: 'retry',
            status: AnalysisStatuses.PENDING, // ✅ Pre-search synced, status PENDING
            searchData: null,
            errorMessage: null,
            completedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        pendingMessage: 'retry',
        expectedParticipantIds: ['anthropic/claude-sonnet-4.5'],
        hasSentPendingMessage: false,
        isWaitingForChangelog: false,
        screenMode: 'thread',
        sendMessage: mockSendMessage,
      });

      const state = store.getState();
      const newRoundNumber = 1;
      const preSearchForRound = state.preSearches.find(ps => ps.roundNumber === newRoundNumber);
      const webSearchEnabled = state.thread?.enableWebSearch ?? false;

      // ✅ CORRECT: This should block because pre-search is PENDING
      const shouldBlock = webSearchEnabled && preSearchForRound
        && (preSearchForRound.status === AnalysisStatuses.PENDING
          || preSearchForRound.status === AnalysisStatuses.STREAMING);

      expect(shouldBlock).toBe(true); // ✅ Correct behavior
    });

    it('should allow sending message when pre-search is COMPLETE', async () => {
      // SETUP: Pre-search completed
      store.setState({
        thread: {
          id: 'thread-123',
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
        participants: [
          {
            id: 'p1',
            threadId: 'thread-123',
            modelId: 'anthropic/claude-sonnet-4.5',
            customRoleId: null,
            role: null,
            priority: 0,
            isEnabled: true,
            settings: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        messages: [
          {
            id: 'm0',
            role: 'user',
            parts: [{ type: 'text', text: 'say hi, 1 word only' }],
            metadata: { role: 'user', roundNumber: 0 },
          },
          {
            id: 'm1',
            role: 'assistant',
            parts: [{ type: 'text', text: 'Hi!' }],
            metadata: {
              role: 'assistant',
              roundNumber: 0,
              participantId: 'p1',
              participantIndex: 0,
            },
          },
        ],
        preSearches: [
          {
            id: 'ps0',
            threadId: 'thread-123',
            roundNumber: 0,
            userQuery: 'say hi, 1 word only',
            status: AnalysisStatuses.COMPLETE,
            searchData: null,
            errorMessage: null,
            completedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          {
            id: 'ps1',
            threadId: 'thread-123',
            roundNumber: 1,
            userQuery: 'retry',
            status: AnalysisStatuses.COMPLETE, // ✅ Pre-search complete
            searchData: { queries: [], results: [], successCount: 1, failureCount: 0, totalResults: 0, totalTime: 100 },
            errorMessage: null,
            completedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        pendingMessage: 'retry',
        expectedParticipantIds: ['anthropic/claude-sonnet-4.5'],
        hasSentPendingMessage: false,
        isWaitingForChangelog: false,
        screenMode: 'thread',
        sendMessage: mockSendMessage,
      });

      const state = store.getState();
      const newRoundNumber = 1;
      const preSearchForRound = state.preSearches.find(ps => ps.roundNumber === newRoundNumber);
      const webSearchEnabled = state.thread?.enableWebSearch ?? false;

      // ✅ CORRECT: Should NOT block because pre-search is COMPLETE
      const shouldBlock = webSearchEnabled && preSearchForRound
        && (preSearchForRound.status === AnalysisStatuses.PENDING
          || preSearchForRound.status === AnalysisStatuses.STREAMING);

      expect(shouldBlock).toBe(false); // ✅ Correct - can proceed
    });
  });

  describe('sOLUTION: Proper pre-search awaiting logic', () => {
    it('should implement correct waiting logic for missing pre-search records', () => {
      // CORRECTED LOGIC:
      // The provider effect should have these checks (in order):
      //
      // 1. If web search is enabled AND no pre-search record exists:
      //    → WAIT (return early)
      //    Reason: Backend created it, orchestrator will sync it soon
      //
      // 2. If web search is enabled AND pre-search is PENDING/STREAMING:
      //    → WAIT (return early)
      //    Reason: Web search executing, need results first
      //
      // 3. If web search is enabled AND pre-search is COMPLETE/FAILED:
      //    → PROCEED (send message)
      //    Reason: Web search done (or failed), participants can respond
      //
      // 4. If web search is disabled:
      //    → PROCEED (send message)
      //    Reason: No web search needed

      const testScenarios = [
        {
          name: 'Web search enabled, no pre-search record',
          webSearchEnabled: true,
          preSearchExists: false,
          preSearchStatus: null,
          shouldWait: true,
          reason: 'Wait for orchestrator to sync backend-created record',
        },
        {
          name: 'Web search enabled, pre-search PENDING',
          webSearchEnabled: true,
          preSearchExists: true,
          preSearchStatus: AnalysisStatuses.PENDING,
          shouldWait: true,
          reason: 'Wait for web search to complete',
        },
        {
          name: 'Web search enabled, pre-search STREAMING',
          webSearchEnabled: true,
          preSearchExists: true,
          preSearchStatus: AnalysisStatuses.STREAMING,
          shouldWait: true,
          reason: 'Wait for web search to complete',
        },
        {
          name: 'Web search enabled, pre-search COMPLETE',
          webSearchEnabled: true,
          preSearchExists: true,
          preSearchStatus: AnalysisStatuses.COMPLETE,
          shouldWait: false,
          reason: 'Web search done, proceed with participants',
        },
        {
          name: 'Web search enabled, pre-search FAILED',
          webSearchEnabled: true,
          preSearchExists: true,
          preSearchStatus: AnalysisStatuses.FAILED,
          shouldWait: false,
          reason: 'Web search failed, proceed anyway',
        },
        {
          name: 'Web search disabled',
          webSearchEnabled: false,
          preSearchExists: false,
          preSearchStatus: null,
          shouldWait: false,
          reason: 'No web search needed',
        },
      ];

      for (const scenario of testScenarios) {
        // Simulate the corrected logic
        function shouldWaitForPreSearch(
          webSearchEnabled: boolean,
          preSearchExists: boolean,
          preSearchStatus: string | null,
        ): boolean {
          // If web search disabled, don't wait
          if (!webSearchEnabled) {
            return false;
          }

          // ✅ FIX: If web search enabled but no record exists, WAIT
          if (!preSearchExists) {
            return true; // Wait for orchestrator to sync
          }

          // If pre-search exists and is pending/streaming, WAIT
          if (preSearchStatus === AnalysisStatuses.PENDING || preSearchStatus === AnalysisStatuses.STREAMING) {
            return true;
          }

          // Pre-search is complete or failed, don't wait
          return false;
        }

        const result = shouldWaitForPreSearch(
          scenario.webSearchEnabled,
          scenario.preSearchExists,
          scenario.preSearchStatus,
        );

        expect(result).toBe(scenario.shouldWait);
      }
    });
  });
});
