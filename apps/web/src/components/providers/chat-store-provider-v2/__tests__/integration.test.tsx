/**
 * V2 Provider Integration Tests
 *
 * Integration tests for the ChatStoreProvider and its orchestration hooks.
 * Tests slug changes, full round flows, and stop functionality.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createRoundCompleteFlowState,
  createTestChatStoreV2,
  createV2AssistantMessage,
  createV2ModeratorMessage,
  createV2UserMessage,
} from '@/lib/testing';
import { reset } from '@/stores/chat-v2/reset';

import { ChatStoreContext } from '../context';
import { useChatStore } from '../use-chat-store';

// Mock the services
vi.mock('@/services/api', () => ({
  getThreadBySlugService: vi.fn().mockResolvedValue({ success: true, data: null }),
}));

// Mock toast
vi.mock('@/lib/toast', () => ({
  showApiErrorToast: vi.fn(),
}));

describe('v2 provider integration', () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  const originalFetch = globalThis.fetch;
  let queryClient: QueryClient;

  beforeEach(() => {
    mockFetch = vi.fn();
    globalThis.fetch = mockFetch;
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.clearAllMocks();
    queryClient.clear();
  });

  function createWrapper(store: ReturnType<typeof createTestChatStoreV2>) {
    return function Wrapper({ children }: { children: ReactNode }) {
      return (
        <QueryClientProvider client={queryClient}>
          <ChatStoreContext value={store}>
            {children}
          </ChatStoreContext>
        </QueryClientProvider>
      );
    };
  }

  describe('store context', () => {
    it('provides store to consumers via context', () => {
      const store = createTestChatStoreV2({
        inputValue: 'test input',
      });

      const { result } = renderHook(
        () => useChatStore(state => state.inputValue),
        { wrapper: createWrapper(store) },
      );

      expect(result.current).toBe('test input');
    });

    it('consumers receive state updates', () => {
      const store = createTestChatStoreV2();

      const { result } = renderHook(
        () => useChatStore(state => state.inputValue),
        { wrapper: createWrapper(store) },
      );

      expect(result.current).toBe('');

      act(() => {
        store.getState().setInputValue('updated value');
      });

      expect(result.current).toBe('updated value');
    });

    it('multiple selectors work independently', () => {
      const store = createTestChatStoreV2({
        inputValue: 'input',
        selectedMode: 'council',
      });

      const { result: inputResult } = renderHook(
        () => useChatStore(state => state.inputValue),
        { wrapper: createWrapper(store) },
      );

      const { result: modeResult } = renderHook(
        () => useChatStore(state => state.selectedMode),
        { wrapper: createWrapper(store) },
      );

      expect(inputResult.current).toBe('input');
      expect(modeResult.current).toBe('council');

      act(() => {
        store.getState().setInputValue('new input');
      });

      expect(inputResult.current).toBe('new input');
      expect(modeResult.current).toBe('council'); // Unchanged
    });
  });

  describe('slug change handling', () => {
    it('store can be reset on navigation', () => {
      const store = createTestChatStoreV2({
        thread: {
          id: 'thread-1',
          slug: 'old-thread',
          mode: 'council',
        } as never,
        messages: [createV2UserMessage({ roundNumber: 0 })],
        flow: createRoundCompleteFlowState({ threadId: 'thread-1', round: 0 }),
      });

      // Simulate reset (what provider does on slug change)
      act(() => {
        reset(store, 'navigation');
      });

      expect(store.getState().thread).toBeNull();
      expect(store.getState().messages).toEqual([]);
      expect(store.getState().flow.type).toBe('idle');
    });

    it('form preferences preserved after navigation reset', () => {
      const store = createTestChatStoreV2({
        thread: { id: 'thread-1' } as never,
        selectedMode: 'debate',
        enableWebSearch: true,
        selectedParticipants: [
          { modelId: 'gpt-4', role: 'analyst', priority: 1 },
        ],
        inputValue: 'some text',
      });

      act(() => {
        reset(store, 'navigation');
      });

      // Form preferences should be preserved
      expect(store.getState().selectedMode).toBe('debate');
      expect(store.getState().enableWebSearch).toBe(true);
      expect(store.getState().selectedParticipants).toHaveLength(1);
      expect(store.getState().inputValue).toBe('some text');
    });
  });

  describe('full round flow simulation', () => {
    it('submit -> create -> pre-search -> stream -> moderator -> complete', async () => {
      const store = createTestChatStoreV2({
        selectedMode: 'council',
        selectedParticipants: [
          { modelId: 'gpt-4', role: null, priority: 1 },
          { modelId: 'claude-3', role: null, priority: 2 },
        ],
        enableWebSearch: true,
      });

      // 1. Submit message (idle -> creating_thread)
      act(() => {
        store.getState().dispatch({
          type: 'SUBMIT_MESSAGE',
          message: 'Test message',
          mode: 'council',
          participants: store.getState().selectedParticipants,
          enableWebSearch: true,
        });
      });

      expect(store.getState().flow.type).toBe('creating_thread');

      // 2. Thread created (creating_thread -> pre_search because webSearch enabled)
      act(() => {
        store.getState().dispatch({
          type: 'THREAD_CREATED',
          threadId: 'new-thread',
          slug: 'new-slug',
        });
      });

      expect(store.getState().flow.type).toBe('pre_search');
      expect(store.getState().createdThreadId).toBe('new-thread');

      // 3. Pre-search complete (pre_search -> streaming)
      act(() => {
        store.getState().dispatch({
          type: 'PRE_SEARCH_COMPLETE',
          round: 0,
        });
      });

      expect(store.getState().flow.type).toBe('streaming');
      const flowAfterPreSearch = store.getState().flow;
      expect(flowAfterPreSearch.type).toBe('streaming');
      expect(flowAfterPreSearch.type === 'streaming' && flowAfterPreSearch.participantIndex).toBe(0);
      expect(flowAfterPreSearch.type === 'streaming' && flowAfterPreSearch.totalParticipants).toBe(2);

      // 4. First participant complete (streaming -> streaming with next index)
      act(() => {
        store.getState().dispatch({
          type: 'PARTICIPANT_COMPLETE',
          participantIndex: 0,
        });
      });

      const flowAfterP1 = store.getState().flow;
      expect(flowAfterP1.type).toBe('streaming');
      expect(flowAfterP1.type === 'streaming' && flowAfterP1.participantIndex).toBe(1);

      // 5. Last participant complete (streaming -> awaiting_moderator)
      act(() => {
        store.getState().dispatch({
          type: 'PARTICIPANT_COMPLETE',
          participantIndex: 1,
        });
      });

      expect(store.getState().flow.type).toBe('awaiting_moderator');

      // 6. Moderator started (awaiting_moderator -> moderator_streaming)
      act(() => {
        store.getState().dispatch({ type: 'MODERATOR_STARTED' });
      });

      expect(store.getState().flow.type).toBe('moderator_streaming');

      // 7. Moderator complete (moderator_streaming -> round_complete)
      act(() => {
        store.getState().dispatch({
          type: 'MODERATOR_COMPLETE',
          round: 0,
        });
      });

      expect(store.getState().flow.type).toBe('round_complete');
      const finalFlow = store.getState().flow;
      expect(finalFlow.type).toBe('round_complete');
      expect(finalFlow.type === 'round_complete' && finalFlow.round).toBe(0);
      expect(finalFlow.type === 'round_complete' && finalFlow.threadId).toBe('new-thread');
    });

    it('follow-up with config changes includes changelog step', () => {
      const store = createTestChatStoreV2({
        flow: createRoundCompleteFlowState({ threadId: 't1', round: 0 }),
        selectedMode: 'council',
        selectedParticipants: [
          { modelId: 'gpt-4', role: null, priority: 1 },
        ],
        enableWebSearch: false,
      });

      // Submit follow-up with config changes
      act(() => {
        store.getState().dispatch({
          type: 'SUBMIT_MESSAGE',
          message: 'Follow up',
          mode: 'council',
          participants: [],
          enableWebSearch: false,
          hasConfigChanges: true,
        });
      });

      expect(store.getState().flow.type).toBe('updating_thread');
      const updatingFlow = store.getState().flow;
      expect(updatingFlow.type).toBe('updating_thread');
      expect(updatingFlow.type === 'updating_thread' && updatingFlow.hasConfigChanges).toBe(true);
      expect(updatingFlow.type === 'updating_thread' && updatingFlow.round).toBe(1);

      // Update complete - should go to awaiting_changelog
      act(() => {
        store.getState().dispatch({ type: 'UPDATE_THREAD_COMPLETE' });
      });

      expect(store.getState().flow.type).toBe('awaiting_changelog');

      // Changelog received - should go to streaming
      act(() => {
        store.getState().dispatch({ type: 'CHANGELOG_RECEIVED' });
      });

      expect(store.getState().flow.type).toBe('streaming');
    });

    it('stop during streaming transitions to round_complete', () => {
      const store = createTestChatStoreV2({
        flow: {
          type: 'streaming',
          threadId: 't1',
          round: 0,
          participantIndex: 0,
          totalParticipants: 2,
        },
      });

      act(() => {
        store.getState().dispatch({ type: 'STOP' });
      });

      expect(store.getState().flow.type).toBe('round_complete');
    });

    it('stop during pre_search transitions to round_complete', () => {
      const store = createTestChatStoreV2({
        flow: {
          type: 'pre_search',
          threadId: 't1',
          round: 0,
        },
      });

      act(() => {
        store.getState().dispatch({ type: 'STOP' });
      });

      expect(store.getState().flow.type).toBe('round_complete');
    });

    it('stop during moderator_streaming transitions to round_complete', () => {
      const store = createTestChatStoreV2({
        flow: {
          type: 'moderator_streaming',
          threadId: 't1',
          round: 0,
        },
      });

      act(() => {
        store.getState().dispatch({ type: 'STOP' });
      });

      expect(store.getState().flow.type).toBe('round_complete');
    });
  });

  describe('message management', () => {
    it('addMessage adds to messages array', () => {
      const store = createTestChatStoreV2();
      const message = createV2UserMessage({ id: 'msg-1', roundNumber: 0 });

      act(() => {
        store.getState().addMessage(message);
      });

      expect(store.getState().messages).toHaveLength(1);
      expect(store.getState().messages[0].id).toBe('msg-1');
    });

    it('updateMessage updates existing message', () => {
      const store = createTestChatStoreV2({
        messages: [
          createV2AssistantMessage({
            id: 'msg-1',
            roundNumber: 0,
            content: 'Original',
          }),
        ],
      });

      act(() => {
        store.getState().updateMessage('msg-1', {
          parts: [{ type: 'text', text: 'Updated' }],
        });
      });

      expect(store.getState().messages[0].parts).toEqual([
        { type: 'text', text: 'Updated' },
      ]);
    });

    it('setMessages replaces all messages', () => {
      const store = createTestChatStoreV2({
        messages: [createV2UserMessage({ roundNumber: 0 })],
      });

      const newMessages = [
        createV2UserMessage({ id: 'new-1', roundNumber: 0 }),
        createV2AssistantMessage({ id: 'new-2', roundNumber: 0 }),
      ];

      act(() => {
        store.getState().setMessages(newMessages);
      });

      expect(store.getState().messages).toHaveLength(2);
      expect(store.getState().messages[0].id).toBe('new-1');
    });
  });

  describe('form state management', () => {
    it('setInputValue updates input', () => {
      const store = createTestChatStoreV2();

      act(() => {
        store.getState().setInputValue('new input');
      });

      expect(store.getState().inputValue).toBe('new input');
    });

    it('setSelectedMode updates mode', () => {
      const store = createTestChatStoreV2();

      act(() => {
        store.getState().setSelectedMode('debate');
      });

      expect(store.getState().selectedMode).toBe('debate');
    });

    it('addParticipant prevents duplicates', () => {
      const store = createTestChatStoreV2({
        selectedParticipants: [
          { modelId: 'gpt-4', role: null, priority: 1 },
        ],
      });

      act(() => {
        store.getState().addParticipant({
          modelId: 'gpt-4', // Duplicate
          role: null,
          priority: 2,
        });
      });

      expect(store.getState().selectedParticipants).toHaveLength(1);
    });

    it('removeParticipant removes by modelId', () => {
      const store = createTestChatStoreV2({
        selectedParticipants: [
          { modelId: 'gpt-4', role: null, priority: 1 },
          { modelId: 'claude-3', role: null, priority: 2 },
        ],
      });

      act(() => {
        store.getState().removeParticipant('gpt-4');
      });

      expect(store.getState().selectedParticipants).toHaveLength(1);
      expect(store.getState().selectedParticipants[0].modelId).toBe('claude-3');
    });

    it('resetForm clears input and pending message', () => {
      const store = createTestChatStoreV2({
        inputValue: 'some input',
        pendingMessage: 'pending',
      });

      act(() => {
        store.getState().resetForm();
      });

      expect(store.getState().inputValue).toBe('');
      expect(store.getState().pendingMessage).toBeNull();
    });
  });

  describe('pre-search state management', () => {
    it('setPreSearch adds pre-search for round', () => {
      const store = createTestChatStoreV2();

      act(() => {
        store.getState().setPreSearch(0, {
          roundNumber: 0,
          status: 'streaming',
          query: 'test query',
          results: null,
          startedAt: Date.now(),
          completedAt: null,
        });
      });

      const preSearch = store.getState().preSearches.get(0);
      expect(preSearch).toBeDefined();
      expect(preSearch?.query).toBe('test query');
    });

    it('getPreSearchForRound returns correct pre-search', () => {
      const store = createTestChatStoreV2({
        preSearches: new Map([
          [0, {
            roundNumber: 0,
            status: 'complete' as const,
            query: 'round 0 query',
            results: [],
            startedAt: 100,
            completedAt: 200,
          }],
          [1, {
            roundNumber: 1,
            status: 'complete' as const,
            query: 'round 1 query',
            results: [],
            startedAt: 300,
            completedAt: 400,
          }],
        ]),
      });

      expect(store.getState().getPreSearchForRound(0)?.query).toBe('round 0 query');
      expect(store.getState().getPreSearchForRound(1)?.query).toBe('round 1 query');
      expect(store.getState().getPreSearchForRound(2)).toBeUndefined();
    });

    it('isPreSearchComplete returns correct status', () => {
      const store = createTestChatStoreV2({
        preSearches: new Map([
          [0, {
            roundNumber: 0,
            status: 'complete' as const,
            query: 'done',
            results: [],
            startedAt: 100,
            completedAt: 200,
          }],
          [1, {
            roundNumber: 1,
            status: 'streaming' as const,
            query: 'in progress',
            results: null,
            startedAt: 300,
            completedAt: null,
          }],
        ]),
      });

      expect(store.getState().isPreSearchComplete(0)).toBe(true);
      expect(store.getState().isPreSearchComplete(1)).toBe(false);
      expect(store.getState().isPreSearchComplete(2)).toBe(false);
    });
  });

  describe('feedback state management', () => {
    it('setFeedback stores feedback for round', () => {
      const store = createTestChatStoreV2();

      act(() => {
        store.getState().setFeedback(0, 'like');
      });

      expect(store.getState().feedbackByRound.get(0)).toBe('like');
    });

    it('getFeedback retrieves feedback for round', () => {
      const store = createTestChatStoreV2({
        feedbackByRound: new Map([
          [0, 'like'],
          [1, 'dislike'],
        ]),
      });

      expect(store.getState().getFeedback(0)).toBe('like');
      expect(store.getState().getFeedback(1)).toBe('dislike');
      expect(store.getState().getFeedback(2)).toBeNull();
    });
  });

  describe('uI state management', () => {
    it('title animation state management', () => {
      const store = createTestChatStoreV2();

      // Start animation
      act(() => {
        store.getState().startTitleAnimation('New Title');
      });

      expect(store.getState().targetTitle).toBe('New Title');
      expect(store.getState().isTitleAnimating).toBe(true);
      expect(store.getState().displayedTitle).toBe('');

      // Update displayed
      act(() => {
        store.getState().updateDisplayedTitle('New T');
      });

      expect(store.getState().displayedTitle).toBe('New T');

      // Complete animation
      act(() => {
        store.getState().completeTitleAnimation();
      });

      expect(store.getState().displayedTitle).toBe('New Title');
      expect(store.getState().isTitleAnimating).toBe(false);
    });

    it('hasInitiallyLoaded state', () => {
      const store = createTestChatStoreV2();

      expect(store.getState().hasInitiallyLoaded).toBe(false);

      act(() => {
        store.getState().setHasInitiallyLoaded(true);
      });

      expect(store.getState().hasInitiallyLoaded).toBe(true);
    });
  });

  describe('thread initialization', () => {
    it('initializeThread sets all thread state', () => {
      const store = createTestChatStoreV2();

      const thread = {
        id: 't1',
        slug: 'test-thread',
        userId: 'u1',
        title: 'Test',
        mode: 'council' as const,
        status: 'active' as const,
        isPublic: false,
        enableWebSearch: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const participants = [
        {
          id: 'p1',
          threadId: 't1',
          modelId: 'gpt-4',
          role: 'analyst',
          priority: 1,
          isEnabled: true,
          customRoleId: null,
          settings: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      const messages = [
        createV2UserMessage({ roundNumber: 0 }),
        createV2ModeratorMessage({ roundNumber: 0 }),
      ];

      act(() => {
        store.getState().initializeThread(thread, participants as never, messages);
      });

      expect(store.getState().thread).toEqual(thread);
      expect(store.getState().participants).toHaveLength(1);
      expect(store.getState().messages).toHaveLength(2);
      expect(store.getState().hasInitiallyLoaded).toBe(true);
      expect(store.getState().screenMode).toBe('thread');
      expect(store.getState().selectedMode).toBe('council');
      expect(store.getState().enableWebSearch).toBe(true);
      expect(store.getState().flow.type).toBe('round_complete');
    });
  });
});
