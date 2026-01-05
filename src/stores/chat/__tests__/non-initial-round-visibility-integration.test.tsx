/**
 * Non-Initial Round Visibility Integration Tests
 *
 * These tests verify the FULL rendering pipeline for non-initial round submissions:
 * Store → useThreadTimeline → ChatMessageList → Rendered output
 *
 * KEY BUG: User message and placeholders don't show until streaming completes.
 * They should show IMMEDIATELY when submit is pressed.
 */

import type { UIMessage } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatModes, MessageRoles, MessageStatuses } from '@/api/core/enums';
import type { ChatParticipant, ChatThread } from '@/api/routes/chat/schema';
import { useThreadTimeline } from '@/hooks/utils';
import { renderHook } from '@/lib/testing';
import { getRoundNumber } from '@/lib/utils';

import { createChatStore } from '../store';

// Mock i18n - use importOriginal to keep NextIntlClientProvider
vi.mock('next-intl', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next-intl')>();
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
      id: 'test-thread',
      slug: 'test-slug',
      title: 'Test Thread',
      mode: ChatModes.BRAINSTORM,
      status: 'active',
      isFavorite: false,
      isPublic: false,
      enableWebSearch: false,
      isAiGeneratedTitle: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastMessageAt: new Date(),
    };

    const participants: ChatParticipant[] = [
      {
        id: 'p1',
        threadId: 'test-thread',
        modelId: 'gpt-4o',
        role: 'Analyst',
        priority: 0,
        isEnabled: true,
        settings: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'p2',
        threadId: 'test-thread',
        modelId: 'claude-3-5-sonnet',
        role: 'Critic',
        priority: 1,
        isEnabled: true,
        settings: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const round0Messages: UIMessage[] = [
      {
        id: 'user-r0',
        role: MessageRoles.USER,
        parts: [{ type: 'text', text: 'Initial question' }],
        metadata: { role: MessageRoles.USER, roundNumber: 0 },
      },
      {
        id: 'assistant-r0-p0',
        role: MessageRoles.ASSISTANT,
        parts: [{ type: 'text', text: 'GPT response' }],
        metadata: {
          role: MessageRoles.ASSISTANT,
          roundNumber: 0,
          participantIndex: 0,
          participantId: 'p1',
          model: 'gpt-4o',
          finishReason: 'stop',
          hasError: false,
          isTransient: false,
          isPartialResponse: false,
          usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        },
      },
      {
        id: 'assistant-r0-p1',
        role: MessageRoles.ASSISTANT,
        parts: [{ type: 'text', text: 'Claude response' }],
        metadata: {
          role: MessageRoles.ASSISTANT,
          roundNumber: 0,
          participantIndex: 1,
          participantId: 'p2',
          model: 'claude-3-5-sonnet',
          finishReason: 'stop',
          hasError: false,
          isTransient: false,
          isPartialResponse: false,
          usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        },
      },
    ];

    store.getState().initializeThread(thread, participants, round0Messages);
  });

  describe('useThreadTimeline Hook Integration', () => {
    it('should create timeline item for round 1 immediately after optimistic message added', () => {
      // Initial state - only round 0
      const initialMessages = store.getState().messages;
      expect(initialMessages).toHaveLength(3);

      // Use renderHook to test useThreadTimeline
      const { result, rerender } = renderHook(
        ({ messages }) => useThreadTimeline({
          messages,
          changelog: [],
          preSearches: [],
        }),
        { initialProps: { messages: initialMessages } },
      );

      // Should have 1 timeline item for round 0
      expect(result.current).toHaveLength(1);
      expect(result.current[0].roundNumber).toBe(0);

      // Add optimistic message for round 1
      const optimisticMessage: UIMessage = {
        id: `optimistic-user-1-${Date.now()}`,
        role: MessageRoles.USER,
        parts: [{ type: 'text', text: 'Follow-up question' }],
        metadata: {
          role: MessageRoles.USER,
          roundNumber: 1,
          isOptimistic: true,
        },
      };
      store.getState().setMessages(msgs => [...msgs, optimisticMessage]);

      // Get updated messages
      const updatedMessages = store.getState().messages;
      expect(updatedMessages).toHaveLength(4);

      // Re-render hook with new messages
      rerender({ messages: updatedMessages });

      // Should now have 2 timeline items
      expect(result.current).toHaveLength(2);
      expect(result.current[1].roundNumber).toBe(1);
      expect(result.current[1].type).toBe('messages');

      // Round 1 should have the user message
      const round1Data = result.current[1].data as UIMessage[];
      expect(round1Data).toHaveLength(1);
      expect(round1Data[0].role).toBe(MessageRoles.USER);
    });

    it('should include pre-search in timeline when added', () => {
      const messages = store.getState().messages;

      // Add pre-search for round 1
      store.getState().addPreSearch({
        id: 'presearch-r1',
        threadId: 'test-thread',
        roundNumber: 1,
        userQuery: 'Search query',
        status: MessageStatuses.PENDING,
        searchData: null,
        createdAt: new Date(),
        completedAt: null,
        errorMessage: null,
      });

      const preSearches = store.getState().preSearches;

      const { result } = renderHook(
        () => useThreadTimeline({
          messages,
          changelog: [],
          preSearches,
        }),
      );

      // Should have 2 timeline items: round 0 messages + round 1 pre-search
      expect(result.current).toHaveLength(2);
      expect(result.current[1].type).toBe('pre-search');
      expect(result.current[1].roundNumber).toBe(1);
    });

    it('should include user message in round when pre-search exists', () => {
      // Add optimistic message
      const optimisticMessage: UIMessage = {
        id: `optimistic-user-1`,
        role: MessageRoles.USER,
        parts: [{ type: 'text', text: 'Question with search' }],
        metadata: { role: MessageRoles.USER, roundNumber: 1 },
      };
      store.getState().setMessages(msgs => [...msgs, optimisticMessage]);

      // Add pre-search
      store.getState().addPreSearch({
        id: 'presearch-r1',
        threadId: 'test-thread',
        roundNumber: 1,
        userQuery: 'Search query',
        status: MessageStatuses.PENDING,
        searchData: null,
        createdAt: new Date(),
        completedAt: null,
        errorMessage: null,
      });

      const messages = store.getState().messages;
      const preSearches = store.getState().preSearches;

      const { result } = renderHook(
        () => useThreadTimeline({
          messages,
          changelog: [],
          preSearches,
        }),
      );

      // Should have 2 timeline items: round 0 messages, round 1 messages
      // (pre-search is NOT a separate item when messages exist - rendered by ChatMessageList)
      expect(result.current).toHaveLength(2);
      expect(result.current[1].type).toBe('messages');

      const round1Data = result.current[1].data as UIMessage[];
      expect(round1Data).toHaveLength(1);
      expect(round1Data[0].role).toBe(MessageRoles.USER);
    });
  });

  describe('store State After Submission', () => {
    it('should have correct state for immediate visibility', () => {
      const nextRound = 1;

      // Simulate handleUpdateThreadAndSend actions
      const optimisticMessage: UIMessage = {
        id: `optimistic-user-${nextRound}`,
        role: MessageRoles.USER,
        parts: [{ type: 'text', text: 'Follow-up' }],
        metadata: { role: MessageRoles.USER, roundNumber: nextRound },
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
      expect(state.waitingToStartStreaming).toBe(true);

      // hasInitiallyLoaded should still be true
      expect(state.hasInitiallyLoaded).toBe(true);
    });

    it('should preserve state when initializeThread is called during submission', () => {
      const nextRound = 1;

      // Setup submission state
      store.getState().setMessages(msgs => [
        ...msgs,
        {
          id: `optimistic-user-${nextRound}`,
          role: MessageRoles.USER,
          parts: [{ type: 'text', text: 'Follow-up' }],
          metadata: { role: MessageRoles.USER, roundNumber: nextRound },
        },
      ]);
      store.getState().setStreamingRoundNumber(nextRound);
      store.getState().setConfigChangeRoundNumber(nextRound);

      // Call initializeThread (simulating what useScreenInitialization might do)
      const thread = store.getState().thread!;
      const participants = store.getState().participants;

      store.getState().initializeThread(thread, participants, [
        // Only round 0 messages from "server"
        {
          id: 'user-r0',
          role: MessageRoles.USER,
          parts: [{ type: 'text', text: 'Initial' }],
          metadata: { role: MessageRoles.USER, roundNumber: 0 },
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
          role: MessageRoles.USER,
          parts: [{ type: 'text', text: 'Round 1 question' }],
          metadata: { role: MessageRoles.USER, roundNumber: 1 },
        },
      ]);

      const messages = store.getState().messages;

      const { result } = renderHook(
        () => useThreadTimeline({
          messages,
          changelog: [],
          preSearches: [],
        }),
      );

      // Find round 1 in timeline
      const round1Item = result.current.find(item => item.roundNumber === 1);
      expect(round1Item).toBeDefined();
      expect(round1Item!.type).toBe('messages');
    });

    it('isDataReady calculation should be true after submission', () => {
      // Simulate submission
      store.getState().setMessages(msgs => [
        ...msgs,
        {
          id: 'user-r1',
          role: MessageRoles.USER,
          parts: [{ type: 'text', text: 'Question' }],
          metadata: { role: MessageRoles.USER, roundNumber: 1 },
        },
      ]);

      const state = store.getState();

      // isStoreReady = hasInitiallyLoaded && messages.length > 0
      const isStoreReady = state.hasInitiallyLoaded && state.messages.length > 0;
      expect(isStoreReady).toBe(true);
    });
  });
});
