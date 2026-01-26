/**
 * Non-Initial Round Visibility Integration Tests
 *
 * These tests verify the FULL rendering pipeline for non-initial round submissions:
 * Store → useThreadTimeline → ChatMessageList → Rendered output
 *
 * KEY BUG: User message and placeholders don't show until streaming completes.
 * They should show IMMEDIATELY when submit is pressed.
 */

import { ChatModes, MessageRoles, MessageStatuses } from '@roundtable/shared';
import type { UIMessage } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useThreadTimeline } from '@/hooks/utils';
import { renderHook } from '@/lib/testing';
import { getRoundNumber } from '@/lib/utils';
import type { ChatParticipant, ChatThread } from '@/services/api';

import { createChatStore } from '../store';

// Mock i18n
vi.mock('@/lib/i18n/provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/i18n/provider')>();
  return {
    ...actual,
    useTranslations: () => (key: string) => key,
  };
});

// Mock model queries - use importOriginal to keep other exports
vi.mock('@/hooks/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/queries')>();
  return {
    ...actual,
    useModelsQuery: () => ({ data: null, isLoading: false }),
    useThreadPreSearchesQuery: () => ({ data: [], isLoading: false }),
    useThreadRoundChangelogQuery: () => ({ data: null, isLoading: false }),
  };
});

describe('non-Initial Round Visibility - Integration', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();

    // Initialize with round 0 complete
    const thread: ChatThread = {
      createdAt: new Date(),
      enableWebSearch: false,
      id: 'test-thread',
      isAiGeneratedTitle: false,
      isFavorite: false,
      isPublic: false,
      lastMessageAt: new Date(),
      mode: ChatModes.BRAINSTORM,
      slug: 'test-slug',
      status: 'active',
      title: 'Test Thread',
      updatedAt: new Date(),
    };

    const participants: ChatParticipant[] = [
      {
        createdAt: new Date(),
        id: 'p1',
        isEnabled: true,
        modelId: 'gpt-4o',
        priority: 0,
        role: 'Analyst',
        settings: null,
        threadId: 'test-thread',
        updatedAt: new Date(),
      },
      {
        createdAt: new Date(),
        id: 'p2',
        isEnabled: true,
        modelId: 'claude-3-5-sonnet',
        priority: 1,
        role: 'Critic',
        settings: null,
        threadId: 'test-thread',
        updatedAt: new Date(),
      },
    ];

    const round0Messages: UIMessage[] = [
      {
        id: 'user-r0',
        metadata: { role: MessageRoles.USER, roundNumber: 0 },
        parts: [{ text: 'Initial question', type: 'text' }],
        role: MessageRoles.USER,
      },
      {
        id: 'assistant-r0-p0',
        metadata: {
          finishReason: 'stop',
          hasError: false,
          isPartialResponse: false,
          isTransient: false,
          model: 'gpt-4o',
          participantId: 'p1',
          participantIndex: 0,
          role: MessageRoles.ASSISTANT,
          roundNumber: 0,
          usage: { completionTokens: 50, promptTokens: 100, totalTokens: 150 },
        },
        parts: [{ text: 'GPT response', type: 'text' }],
        role: MessageRoles.ASSISTANT,
      },
      {
        id: 'assistant-r0-p1',
        metadata: {
          finishReason: 'stop',
          hasError: false,
          isPartialResponse: false,
          isTransient: false,
          model: 'claude-3-5-sonnet',
          participantId: 'p2',
          participantIndex: 1,
          role: MessageRoles.ASSISTANT,
          roundNumber: 0,
          usage: { completionTokens: 50, promptTokens: 100, totalTokens: 150 },
        },
        parts: [{ text: 'Claude response', type: 'text' }],
        role: MessageRoles.ASSISTANT,
      },
    ];

    store.getState().initializeThread(thread, participants, round0Messages);
  });

  describe('useThreadTimeline Hook Integration', () => {
    it('should create timeline item for round 1 immediately after optimistic message added', () => {
      // Initial state - only round 0
      const initialMessages = store.getState().messages;
      expect(initialMessages).toHaveLength(3);

      // Use renderHook to test useThreadTimeline (no wrapper needed - pure hook)
      const { rerender, result } = renderHook(
        ({ messages }) => useThreadTimeline({
          changelog: [],
          messages,
          preSearches: [],
        }),
        { initialProps: { messages: initialMessages } },
      );

      // Should have 1 timeline item for round 0
      expect(result.current).toHaveLength(1);
      expect(result.current[0]?.roundNumber).toBe(0);

      // Add optimistic message for round 1
      const optimisticMessage: UIMessage = {
        id: `optimistic-user-1-${Date.now()}`,
        metadata: {
          isOptimistic: true,
          role: MessageRoles.USER,
          roundNumber: 1,
        },
        parts: [{ text: 'Follow-up question', type: 'text' }],
        role: MessageRoles.USER,
      };

      store.getState().setMessages(msgs => [...msgs, optimisticMessage]);

      // Get updated messages
      const updatedMessages = store.getState().messages;
      expect(updatedMessages).toHaveLength(4);

      // Re-render hook with new messages
      rerender({ messages: updatedMessages });

      // Should now have 2 timeline items
      expect(result.current).toHaveLength(2);
      expect(result.current[1]?.roundNumber).toBe(1);
      expect(result.current[1]?.type).toBe('messages');

      // Round 1 should have the user message
      const round1Data = result.current[1]?.data as UIMessage[];
      expect(round1Data).toHaveLength(1);
      expect(round1Data[0]?.role).toBe(MessageRoles.USER);
    });

    it('should include pre-search in timeline when added', () => {
      const messages = store.getState().messages;

      // Add pre-search for round 1
      store.getState().addPreSearch({
        completedAt: null,
        createdAt: new Date(),
        errorMessage: null,
        id: 'presearch-r1',
        roundNumber: 1,
        searchData: null,
        status: MessageStatuses.PENDING,
        threadId: 'test-thread',
        userQuery: 'Search query',
      });

      const preSearches = store.getState().preSearches;

      const { result } = renderHook(
        () => useThreadTimeline({
          changelog: [],
          messages,
          preSearches,
        }),
      );

      // Should have 2 timeline items: round 0 messages + round 1 pre-search
      expect(result.current).toHaveLength(2);
      expect(result.current[1]?.type).toBe('pre-search');
      expect(result.current[1]?.roundNumber).toBe(1);
    });

    it('should include user message in round when pre-search exists', () => {
      // Add optimistic message
      const optimisticMessage: UIMessage = {
        id: `optimistic-user-1`,
        metadata: { role: MessageRoles.USER, roundNumber: 1 },
        parts: [{ text: 'Question with search', type: 'text' }],
        role: MessageRoles.USER,
      };

      store.getState().setMessages(msgs => [...msgs, optimisticMessage]);

      // Add pre-search
      store.getState().addPreSearch({
        completedAt: null,
        createdAt: new Date(),
        errorMessage: null,
        id: 'presearch-r1',
        roundNumber: 1,
        searchData: null,
        status: MessageStatuses.PENDING,
        threadId: 'test-thread',
        userQuery: 'Search query',
      });

      const messages = store.getState().messages;
      const preSearches = store.getState().preSearches;

      const { result } = renderHook(
        () => useThreadTimeline({
          changelog: [],
          messages,
          preSearches,
        }),
      );

      // Should have 2 timeline items: round 0 messages, round 1 messages
      // (pre-search is NOT a separate item when messages exist - rendered by ChatMessageList)
      expect(result.current).toHaveLength(2);
      expect(result.current[1]?.type).toBe('messages');

      const round1Data = result.current[1]?.data as UIMessage[];
      expect(round1Data).toHaveLength(1);
      expect(round1Data[0]?.role).toBe(MessageRoles.USER);
    });
  });

  describe('store State After Submission', () => {
    it('should have correct state for immediate visibility', () => {
      const nextRound = 1;

      // Simulate handleUpdateThreadAndSend actions
      const optimisticMessage: UIMessage = {
        id: `optimistic-user-${nextRound}`,
        metadata: { role: MessageRoles.USER, roundNumber: nextRound },
        parts: [{ text: 'Follow-up', type: 'text' }],
        role: MessageRoles.USER,
      };

      // Step 1: Add optimistic message
      store.getState().setMessages(msgs => [...msgs, optimisticMessage]);

      // Step 2: Set streamingRoundNumber
      store.getState().setStreamingRoundNumber(nextRound);

      // Step 3: Set configChangeRoundNumber (blocks initializeThread)
      store.getState().setConfigChangeRoundNumber(nextRound);

      // Step 4: Set waitingToStartStreaming
      store.getState().setWaitingToStartStreaming(true);

      // Verify state
      const state = store.getState();

      // Messages should include optimistic user message
      const round1Messages = state.messages.filter(
        m => getRoundNumber(m.metadata) === nextRound,
      );
      expect(round1Messages).toHaveLength(1);

      // streamingRoundNumber should be set (enables placeholders)
      expect(state.streamingRoundNumber).toBe(nextRound);

      // Guard flags should be set
      expect(state.configChangeRoundNumber).toBe(nextRound);
      expect(state.waitingToStartStreaming).toBeTruthy();

      // hasInitiallyLoaded should still be true
      expect(state.hasInitiallyLoaded).toBeTruthy();
    });

    it('should preserve state when initializeThread is called during submission', () => {
      const nextRound = 1;

      // Setup submission state
      store.getState().setMessages(msgs => [
        ...msgs,
        {
          id: `optimistic-user-${nextRound}`,
          metadata: { role: MessageRoles.USER, roundNumber: nextRound },
          parts: [{ text: 'Follow-up', type: 'text' }],
          role: MessageRoles.USER,
        },
      ]);
      store.getState().setStreamingRoundNumber(nextRound);
      store.getState().setConfigChangeRoundNumber(nextRound);

      // Call initializeThread (simulating what useScreenInitialization might do)
      const thread = store.getState().thread;
      if (!thread) {
        throw new Error('expected thread to be set');
      }

      const participants = store.getState().participants;

      store.getState().initializeThread(thread, participants, [
        // Only round 0 messages from "server"
        {
          id: 'user-r0',
          metadata: { role: MessageRoles.USER, roundNumber: 0 },
          parts: [{ text: 'Initial', type: 'text' }],
          role: MessageRoles.USER,
        },
      ]);

      // Verify state is PRESERVED
      const state = store.getState();

      // streamingRoundNumber should be preserved
      expect(state.streamingRoundNumber).toBe(nextRound);

      // Messages should include round 1 (not overwritten)
      const round1Messages = state.messages.filter(
        m => getRoundNumber(m.metadata) === nextRound,
      );
      expect(round1Messages).toHaveLength(1);
    });
  });

  describe('timeline Visibility Conditions', () => {
    it('timeline should include round 1 when only user message exists', () => {
      // Add only user message for round 1
      store.getState().setMessages(msgs => [
        ...msgs,
        {
          id: 'user-r1',
          metadata: { role: MessageRoles.USER, roundNumber: 1 },
          parts: [{ text: 'Round 1 question', type: 'text' }],
          role: MessageRoles.USER,
        },
      ]);

      const messages = store.getState().messages;

      const { result } = renderHook(
        () => useThreadTimeline({
          changelog: [],
          messages,
          preSearches: [],
        }),
      );

      // Find round 1 in timeline
      const round1Item = result.current.find(item => item.roundNumber === 1);
      expect(round1Item).toBeDefined();
      expect(round1Item?.type).toBe('messages');
    });

    it('isDataReady calculation should be true after submission', () => {
      // Simulate submission
      store.getState().setMessages(msgs => [
        ...msgs,
        {
          id: 'user-r1',
          metadata: { role: MessageRoles.USER, roundNumber: 1 },
          parts: [{ text: 'Question', type: 'text' }],
          role: MessageRoles.USER,
        },
      ]);

      const state = store.getState();

      // isStoreReady = hasInitiallyLoaded && messages.length > 0
      const isStoreReady = state.hasInitiallyLoaded && state.messages.length > 0;
      expect(isStoreReady).toBeTruthy();
    });
  });
});
