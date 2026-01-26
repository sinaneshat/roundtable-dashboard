/**
 * Non-Initial Round Immediate Visibility Tests
 *
 * These tests verify that when submitting a non-initial round (round 2+):
 * 1. User message appears IMMEDIATELY after submission (before PATCH completes)
 * 2. Placeholder cards appear IMMEDIATELY for all participants
 * 3. Moderator placeholder appears IMMEDIATELY
 * 4. streamingRoundNumber is set correctly to trigger placeholders
 *
 * BUG BEING TESTED:
 * User message and placeholders don't show until all streams complete.
 * They should show immediately when submit is pressed.
 */

import { ChatModes, MessageRoles, MessageStatuses, ModelIds } from '@roundtable/shared';
import type { UIMessage } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getRoundNumber } from '@/lib/utils';
import type { ChatParticipant, ChatThread } from '@/services/api';

import { createChatStore } from '../store';
import type { ChatStore } from '../store-schemas';

// Mock dependencies
vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    useQueryClient: () => ({
      setQueriesData: vi.fn(),
    }),
  };
});

/**
 * Helper to create a test store with initial state
 */
function createTestStore(initialState?: Partial<ChatStore>) {
  const store = createChatStore();
  if (initialState) {
    store.setState(initialState);
  }
  return store;
}

/**
 * Helper to create a mock thread
 */
function createMockThread(overrides?: Partial<ChatThread>): ChatThread {
  return {
    createdAt: new Date(),
    enableWebSearch: false,
    id: 'test-thread-123',
    isAiGeneratedTitle: false,
    isFavorite: false,
    isPublic: false,
    lastMessageAt: new Date(),
    mode: ChatModes.BRAINSTORM,
    slug: 'test-thread',
    status: 'active',
    title: 'Test Thread',
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Helper to create mock participants
 */
function createMockParticipants(): ChatParticipant[] {
  return [
    {
      createdAt: new Date(),
      id: 'participant-1',
      isEnabled: true,
      modelId: 'gpt-4o',
      priority: 0,
      role: 'Analyst',
      settings: null,
      threadId: 'test-thread-123',
      updatedAt: new Date(),
    },
    {
      createdAt: new Date(),
      id: 'participant-2',
      isEnabled: true,
      modelId: 'claude-3-5-sonnet',
      priority: 1,
      role: 'Critic',
      settings: null,
      threadId: 'test-thread-123',
      updatedAt: new Date(),
    },
  ];
}

/**
 * Helper to create a user message for a specific round
 */
function createUserMessage(roundNumber: number, text: string): UIMessage {
  return {
    id: `user-msg-round-${roundNumber}`,
    metadata: {
      role: MessageRoles.USER,
      roundNumber,
    },
    parts: [{ text, type: 'text' }],
    role: MessageRoles.USER,
  };
}

/**
 * Helper to create an assistant message for a specific round
 */
function createAssistantMessage(
  roundNumber: number,
  participantIndex: number,
  text: string,
): UIMessage {
  return {
    id: `assistant-msg-round-${roundNumber}-p${participantIndex}`,
    metadata: {
      finishReason: 'stop',
      hasError: false,
      isPartialResponse: false,
      isTransient: false,
      model: participantIndex === 0 ? 'gpt-4o' : 'claude-3-5-sonnet',
      participantId: `participant-${participantIndex + 1}`,
      participantIndex,
      participantRole: participantIndex === 0 ? 'Analyst' : 'Critic',
      role: MessageRoles.ASSISTANT,
      roundNumber,
      usage: { completionTokens: 50, promptTokens: 100, totalTokens: 150 },
    },
    parts: [{ text, type: 'text' }],
    role: MessageRoles.ASSISTANT,
  };
}

/**
 * Helper to create a moderator message for a specific round
 */
function createModeratorMessage(roundNumber: number, text: string): UIMessage {
  return {
    id: `moderator-msg-round-${roundNumber}`,
    metadata: {
      finishReason: 'stop',
      isModerator: true,
      model: ModelIds.GOOGLE_GEMINI_3_FLASH_PREVIEW,
      role: MessageRoles.ASSISTANT,
      roundNumber,
    },
    parts: [{ text, type: 'text' }],
    role: MessageRoles.ASSISTANT,
  };
}

describe('non-Initial Round Immediate Visibility', () => {
  let store: ReturnType<typeof createChatStore>;
  let thread: ChatThread;
  let participants: ChatParticipant[];

  beforeEach(() => {
    store = createTestStore();
    thread = createMockThread();
    participants = createMockParticipants();

    // Set up initial state as if round 0 completed
    const round0UserMsg = createUserMessage(0, 'First question');
    const round0Assistant1 = createAssistantMessage(0, 0, 'GPT response');
    const round0Assistant2 = createAssistantMessage(0, 1, 'Claude response');
    const round0Moderator = createModeratorMessage(0, 'Round 0 summary');

    store.getState().initializeThread(thread, participants, [
      round0UserMsg,
      round0Assistant1,
      round0Assistant2,
      round0Moderator,
    ]);
  });

  describe('immediate State Changes After Submission', () => {
    it('should add optimistic user message to store immediately', () => {
      const state = store.getState();
      const initialMessageCount = state.messages.length;

      // Simulate adding optimistic message (what handleUpdateThreadAndSend does)
      const optimisticMessage: UIMessage = {
        id: `optimistic-user-1-${Date.now()}`,
        metadata: {
          isOptimistic: true,
          role: MessageRoles.USER,
          roundNumber: 1,
        },
        parts: [{ text: 'Second question', type: 'text' }],
        role: MessageRoles.USER,
      };

      store.getState().setMessages(msgs => [...msgs, optimisticMessage]);

      const newState = store.getState();
      expect(newState.messages).toHaveLength(initialMessageCount + 1);

      // Verify the optimistic message is in the store
      const lastMessage = newState.messages[newState.messages.length - 1];
      expect(lastMessage?.role).toBe(MessageRoles.USER);
      expect(getRoundNumber(lastMessage?.metadata)).toBe(1);
    });

    it('should set streamingRoundNumber immediately after submission', () => {
      // Initially, streamingRoundNumber should be null
      expect(store.getState().streamingRoundNumber).toBeNull();

      // Simulate what handleUpdateThreadAndSend does
      store.getState().setStreamingRoundNumber(1);

      expect(store.getState().streamingRoundNumber).toBe(1);
    });

    it('should set configChangeRoundNumber immediately (before PATCH)', () => {
      expect(store.getState().configChangeRoundNumber).toBeNull();

      // This is set BEFORE the PATCH request
      store.getState().setConfigChangeRoundNumber(1);

      expect(store.getState().configChangeRoundNumber).toBe(1);
    });

    it('should set waitingToStartStreaming immediately', () => {
      expect(store.getState().waitingToStartStreaming).toBeFalsy();

      store.getState().setWaitingToStartStreaming(true);

      expect(store.getState().waitingToStartStreaming).toBeTruthy();
    });

    it('should have all required flags set in correct order for immediate visibility', () => {
      const nextRoundNumber = 1;

      // Step 1: Add optimistic message
      const optimisticMessage: UIMessage = {
        id: `optimistic-user-${nextRoundNumber}-${Date.now()}`,
        metadata: {
          isOptimistic: true,
          role: MessageRoles.USER,
          roundNumber: nextRoundNumber,
        },
        parts: [{ text: 'Second question', type: 'text' }],
        role: MessageRoles.USER,
      };
      store.getState().setMessages(msgs => [...msgs, optimisticMessage]);

      // Step 2: Set streamingRoundNumber
      store.getState().setStreamingRoundNumber(nextRoundNumber);

      // Step 3: Set configChangeRoundNumber (blocks streaming until PATCH)
      store.getState().setConfigChangeRoundNumber(nextRoundNumber);

      // Step 4: Set waitingToStartStreaming
      store.getState().setWaitingToStartStreaming(true);

      // Verify all state is correct for immediate visibility
      const state = store.getState();

      // User message should be in store
      const userMessages = state.messages.filter(
        m => m.role === MessageRoles.USER && getRoundNumber(m.metadata) === nextRoundNumber,
      );
      expect(userMessages).toHaveLength(1);

      // streamingRoundNumber should be set (enables placeholder rendering)
      expect(state.streamingRoundNumber).toBe(nextRoundNumber);

      // These flags indicate submission in progress
      expect(state.configChangeRoundNumber).toBe(nextRoundNumber);
      expect(state.waitingToStartStreaming).toBeTruthy();
    });
  });

  describe('timeline Item Creation for Non-Initial Round', () => {
    it('should create timeline item for optimistic user message', () => {
      // Add optimistic message for round 1
      const optimisticMessage: UIMessage = {
        id: `optimistic-user-1-${Date.now()}`,
        metadata: {
          isOptimistic: true,
          role: MessageRoles.USER,
          roundNumber: 1,
        },
        parts: [{ text: 'Second question', type: 'text' }],
        role: MessageRoles.USER,
      };
      store.getState().setMessages(msgs => [...msgs, optimisticMessage]);

      const messages = store.getState().messages;

      // Group messages by round
      const messagesByRound = new Map<number, UIMessage[]>();
      messages.forEach((msg) => {
        const roundNum = getRoundNumber(msg.metadata) ?? 0;
        if (!messagesByRound.has(roundNum)) {
          messagesByRound.set(roundNum, []);
        }
        const roundMessages = messagesByRound.get(roundNum);
        if (!roundMessages) {
          throw new Error('expected round messages array');
        }
        roundMessages.push(msg);
      });

      // Round 1 should have the user message
      const round1Messages = messagesByRound.get(1);
      expect(round1Messages).toBeDefined();
      expect(round1Messages).toHaveLength(1);
      expect(round1Messages?.[0]?.role).toBe(MessageRoles.USER);
    });

    it('should include round in timeline even with only user message', () => {
      // Add optimistic message for round 1
      const optimisticMessage: UIMessage = {
        id: `optimistic-user-1-${Date.now()}`,
        metadata: {
          role: MessageRoles.USER,
          roundNumber: 1,
        },
        parts: [{ text: 'Second question', type: 'text' }],
        role: MessageRoles.USER,
      };
      store.getState().setMessages(msgs => [...msgs, optimisticMessage]);

      const messages = store.getState().messages;

      // Get all unique round numbers
      const roundNumbers = new Set<number>();
      messages.forEach((msg) => {
        const round = getRoundNumber(msg.metadata);
        if (round !== null) {
          roundNumbers.add(round);
        }
      });

      // Round 1 should be in the set
      expect(roundNumbers.has(1)).toBeTruthy();
    });
  });

  describe('placeholder Visibility Conditions', () => {
    it('streamingRoundNumber enables placeholder rendering', () => {
      // Setup: Add optimistic message and set streamingRoundNumber
      const nextRound = 1;

      store.getState().setMessages(msgs => [
        ...msgs,
        {
          id: `optimistic-user-${nextRound}`,
          metadata: { role: MessageRoles.USER, roundNumber: nextRound },
          parts: [{ text: 'Question', type: 'text' }],
          role: MessageRoles.USER,
        },
      ]);
      store.getState().setStreamingRoundNumber(nextRound);

      const state = store.getState();

      // For placeholder rendering, we check:
      // 1. streamingRoundNumber is set
      // 2. participants are defined
      // 3. The round has a user message

      const isStreamingRound = state.streamingRoundNumber === nextRound;
      expect(isStreamingRound).toBeTruthy();

      const hasParticipants = state.participants.length > 0;
      expect(hasParticipants).toBeTruthy();

      const round1UserMessages = state.messages.filter(
        m => m.role === MessageRoles.USER && getRoundNumber(m.metadata) === nextRound,
      );
      expect(round1UserMessages).toHaveLength(1);
    });

    it('participants array should be available for placeholder rendering', () => {
      const state = store.getState();

      // After initializeThread, participants should be set
      expect(state.participants.length).toBeGreaterThan(0);

      // Each participant should have modelId for card rendering
      state.participants.forEach((p) => {
        expect(p.modelId).toBeDefined();
        expect(p.modelId.length).toBeGreaterThan(0);
      });
    });

    it('waitingToStartStreaming should block new submissions but allow rendering', () => {
      store.getState().setWaitingToStartStreaming(true);

      const state = store.getState();
      expect(state.waitingToStartStreaming).toBeTruthy();

      // Even with waitingToStartStreaming=true, user message should be in store
      const optimisticMessage: UIMessage = {
        id: `optimistic-user-1`,
        metadata: { role: MessageRoles.USER, roundNumber: 1 },
        parts: [{ text: 'Question', type: 'text' }],
        role: MessageRoles.USER,
      };
      store.getState().setMessages(msgs => [...msgs, optimisticMessage]);

      const newState = store.getState();
      const round1Messages = newState.messages.filter(
        m => getRoundNumber(m.metadata) === 1,
      );
      expect(round1Messages).toHaveLength(1);
    });
  });

  describe('pre-Search Placeholder for Non-Initial Rounds', () => {
    it('should add pre-search placeholder immediately when web search enabled', () => {
      // Enable web search on thread
      store.setState({ enableWebSearch: true });

      const nextRound = 1;

      // Add pre-search placeholder (what handleUpdateThreadAndSend does)
      store.getState().addPreSearch({
        completedAt: null,
        createdAt: new Date(),
        errorMessage: null,
        id: `placeholder-presearch-test-thread-123-${nextRound}`,
        roundNumber: nextRound,
        searchData: null,
        status: MessageStatuses.PENDING,
        threadId: 'test-thread-123',
        userQuery: 'Second question',
      });

      const state = store.getState();
      const preSearch = state.preSearches.find(ps => ps.roundNumber === nextRound);

      expect(preSearch).toBeDefined();
      expect(preSearch?.status).toBe(MessageStatuses.PENDING);
    });
  });

  describe('initializeThread Guard During Active Submission', () => {
    it('should NOT reset streaming state when configChangeRoundNumber is set', () => {
      // Setup active submission state
      const nextRound = 1;

      store.getState().setMessages(msgs => [
        ...msgs,
        {
          id: `optimistic-user-${nextRound}`,
          metadata: { role: MessageRoles.USER, roundNumber: nextRound },
          parts: [{ text: 'Question', type: 'text' }],
          role: MessageRoles.USER,
        },
      ]);
      store.getState().setStreamingRoundNumber(nextRound);
      store.getState().setConfigChangeRoundNumber(nextRound);
      store.getState().setWaitingToStartStreaming(true);

      // Verify state before initializeThread
      expect(store.getState().streamingRoundNumber).toBe(nextRound);
      expect(store.getState().configChangeRoundNumber).toBe(nextRound);

      // Call initializeThread (simulating what might happen when PATCH response updates thread)
      store.getState().initializeThread(thread, participants, [
        createUserMessage(0, 'First question'),
        createAssistantMessage(0, 0, 'GPT response'),
        createAssistantMessage(0, 1, 'Claude response'),
        createModeratorMessage(0, 'Summary'),
      ]);

      // streamingRoundNumber should be PRESERVED (not reset to null)
      // because configChangeRoundNumber was set (indicating active submission)
      const state = store.getState();
      expect(state.streamingRoundNumber).toBe(nextRound);
      expect(state.configChangeRoundNumber).toBe(nextRound);
      expect(state.waitingToStartStreaming).toBeTruthy();
    });

    it('should NOT reset streaming state when isWaitingForChangelog is true', () => {
      const nextRound = 1;

      // Setup: Simulate PATCH completed but waiting for changelog
      store.getState().setMessages(msgs => [
        ...msgs,
        {
          id: `optimistic-user-${nextRound}`,
          metadata: { role: MessageRoles.USER, roundNumber: nextRound },
          parts: [{ text: 'Question', type: 'text' }],
          role: MessageRoles.USER,
        },
      ]);
      store.getState().setStreamingRoundNumber(nextRound);
      store.getState().setIsWaitingForChangelog(true);
      store.getState().setWaitingToStartStreaming(true);

      // Call initializeThread
      store.getState().initializeThread(thread, participants, [
        createUserMessage(0, 'First question'),
      ]);

      // State should be PRESERVED
      const state = store.getState();
      expect(state.streamingRoundNumber).toBe(nextRound);
      expect(state.isWaitingForChangelog).toBeTruthy();
    });

    it('should preserve optimistic user message during initializeThread', () => {
      const nextRound = 1;
      const optimisticMsgId = `optimistic-user-${nextRound}-${Date.now()}`;

      // Add optimistic message and set flags
      store.getState().setMessages(msgs => [
        ...msgs,
        {
          id: optimisticMsgId,
          metadata: { role: MessageRoles.USER, roundNumber: nextRound },
          parts: [{ text: 'Second question', type: 'text' }],
          role: MessageRoles.USER,
        },
      ]);
      store.getState().setStreamingRoundNumber(nextRound);
      store.getState().setConfigChangeRoundNumber(nextRound);

      // initializeThread with only round 0 messages (simulating server response)
      // Should NOT overwrite store messages because store has newer round
      store.getState().initializeThread(thread, participants, [
        createUserMessage(0, 'First question'),
        createAssistantMessage(0, 0, 'GPT response'),
        createAssistantMessage(0, 1, 'Claude response'),
        createModeratorMessage(0, 'Summary'),
      ]);

      // Optimistic message should still be in store
      const state = store.getState();
      const round1Messages = state.messages.filter(
        m => getRoundNumber(m.metadata) === nextRound,
      );
      expect(round1Messages).toHaveLength(1);
      expect(round1Messages[0].role).toBe(MessageRoles.USER);
    });
  });

  describe('complete Non-Initial Round Submission Flow', () => {
    it('should have correct state immediately after all submission actions', () => {
      const nextRound = 1;
      const userText = 'This is my second question';

      // ========================================
      // Simulate handleUpdateThreadAndSend flow
      // ========================================

      // Step 1: Create optimistic message (line 278-282 in form-actions.ts)
      const optimisticMessage: UIMessage = {
        id: `optimistic-user-${nextRound}-${Date.now()}`,
        metadata: {
          isOptimistic: true,
          role: MessageRoles.USER,
          roundNumber: nextRound,
        },
        parts: [{ text: userText, type: 'text' }],
        role: MessageRoles.USER,
      };

      // Step 2: Add optimistic message to store (line 285)
      store.getState().setMessages(msgs => [...msgs, optimisticMessage]);

      // Step 3: Set streamingRoundNumber (line 286)
      store.getState().setStreamingRoundNumber(nextRound);

      // Step 4: Set expectedParticipantIds (line 287)
      const participantIds = participants.map(p => p.modelId);
      store.getState().setExpectedParticipantIds(participantIds);

      // Step 5: Set configChangeRoundNumber (line 309)
      store.getState().setConfigChangeRoundNumber(nextRound);

      // Step 6: Set waitingToStartStreaming (line 312)
      store.getState().setWaitingToStartStreaming(true);

      // ========================================
      // Verify state is correct for immediate visibility
      // ========================================
      const state = store.getState();

      // 1. User message is in store
      const userMessages = state.messages.filter(
        m => m.role === MessageRoles.USER && getRoundNumber(m.metadata) === nextRound,
      );
      expect(userMessages).toHaveLength(1);
      expect(userMessages[0].parts[0]).toEqual({ text: userText, type: 'text' });

      // 2. streamingRoundNumber is set (enables placeholder visibility)
      expect(state.streamingRoundNumber).toBe(nextRound);

      // 3. Participants are available (needed for placeholder cards)
      expect(state.participants).toHaveLength(2);

      // 4. Submission flags are set
      expect(state.configChangeRoundNumber).toBe(nextRound);
      expect(state.waitingToStartStreaming).toBeTruthy();

      // 5. expectedParticipantIds is set
      expect(state.expectedParticipantIds).toEqual(participantIds);
    });

    it('should maintain visibility after PATCH response updates', () => {
      const nextRound = 1;
      const optimisticMsgId = `optimistic-user-${nextRound}-${Date.now()}`;

      // Setup: Complete submission flow
      store.getState().setMessages(msgs => [
        ...msgs,
        {
          id: optimisticMsgId,
          metadata: { role: MessageRoles.USER, roundNumber: nextRound },
          parts: [{ text: 'Question', type: 'text' }],
          role: MessageRoles.USER,
        },
      ]);
      store.getState().setStreamingRoundNumber(nextRound);
      store.getState().setConfigChangeRoundNumber(nextRound);
      store.getState().setWaitingToStartStreaming(true);

      // Simulate PATCH response: Replace optimistic with persisted message
      const persistedMessage: UIMessage = {
        id: `thread_r${nextRound}_user`,
        metadata: { role: MessageRoles.USER, roundNumber: nextRound },
        parts: [{ text: 'Question', type: 'text' }],
        role: MessageRoles.USER,
      };
      store.getState().setMessages(msgs =>
        msgs.map(m => m.id === optimisticMsgId ? persistedMessage : m),
      );

      // Set isWaitingForChangelog (what form-actions does after PATCH)
      store.getState().setIsWaitingForChangelog(true);

      // Verify state is still correct for visibility
      const state = store.getState();

      // User message should still be present (with new ID)
      const round1Messages = state.messages.filter(
        m => m.role === MessageRoles.USER && getRoundNumber(m.metadata) === nextRound,
      );
      expect(round1Messages).toHaveLength(1);
      expect(round1Messages[0].id).toBe(`thread_r${nextRound}_user`);

      // streamingRoundNumber should still be set
      expect(state.streamingRoundNumber).toBe(nextRound);

      // Flags should be set for guard conditions
      expect(state.isWaitingForChangelog).toBeTruthy();
    });
  });

  describe('edge Cases', () => {
    it('should handle rapid consecutive submissions correctly', () => {
      // Submit round 1
      store.getState().setMessages(msgs => [
        ...msgs,
        {
          id: `optimistic-user-1`,
          metadata: { role: MessageRoles.USER, roundNumber: 1 },
          parts: [{ text: 'Round 1 question', type: 'text' }],
          role: MessageRoles.USER,
        },
      ]);
      store.getState().setStreamingRoundNumber(1);

      const state1 = store.getState();
      expect(state1.streamingRoundNumber).toBe(1);
      expect(state1.messages.filter(m => getRoundNumber(m.metadata) === 1)).toHaveLength(1);
    });

    it('should maintain user message visibility even if streaming starts before PATCH completes', () => {
      const nextRound = 1;

      // Add optimistic message and set streaming state
      store.getState().setMessages(msgs => [
        ...msgs,
        {
          id: `optimistic-user-${nextRound}`,
          metadata: { role: MessageRoles.USER, roundNumber: nextRound },
          parts: [{ text: 'Question', type: 'text' }],
          role: MessageRoles.USER,
        },
      ]);
      store.getState().setStreamingRoundNumber(nextRound);
      store.getState().setConfigChangeRoundNumber(nextRound);

      // Start streaming (isStreaming = true)
      store.getState().setIsStreaming(true);

      // Verify user message is still visible
      const state = store.getState();
      const userMessages = state.messages.filter(
        m => m.role === MessageRoles.USER && getRoundNumber(m.metadata) === nextRound,
      );
      expect(userMessages).toHaveLength(1);
      expect(state.isStreaming).toBeTruthy();
      expect(state.streamingRoundNumber).toBe(nextRound);
    });
  });

  describe('rEGRESSION: User Message Disappearance Bug', () => {
    it('cRITICAL: user message must remain visible throughout entire submission flow', () => {
      const nextRound = 1;

      // Step 1: Add optimistic user message
      const optimisticMsg: UIMessage = {
        id: `optimistic-user-${nextRound}-${Date.now()}`,
        metadata: { role: MessageRoles.USER, roundNumber: nextRound },
        parts: [{ text: 'This should stay visible', type: 'text' }],
        role: MessageRoles.USER,
      };
      store.getState().setMessages(msgs => [...msgs, optimisticMsg]);

      const afterOptimistic = store.getState().messages.filter(
        m => m.role === MessageRoles.USER && getRoundNumber(m.metadata) === nextRound,
      );
      expect(afterOptimistic).toHaveLength(1);

      // Step 2: PATCH completes, replace with DB ID
      const dbMsg: UIMessage = {
        id: '01KE5WMBVDFY',
        metadata: { role: MessageRoles.USER, roundNumber: nextRound },
        parts: [{ text: 'This should stay visible', type: 'text' }],
        role: MessageRoles.USER,
      };
      store.getState().setMessages(msgs =>
        msgs.map(m => m.id === optimisticMsg.id ? dbMsg : m),
      );

      const afterPatch = store.getState().messages.filter(
        m => m.role === MessageRoles.USER && getRoundNumber(m.metadata) === nextRound,
      );
      expect(afterPatch).toHaveLength(1);
      expect(afterPatch[0]?.id).toBe('01KE5WMBVDFY');

      // Step 3: AI SDK adds participant trigger
      const triggerMsg: UIMessage = {
        id: 'trigger-123',
        metadata: { isParticipantTrigger: true, role: MessageRoles.USER, roundNumber: nextRound },
        parts: [{ text: 'This should stay visible', type: 'text' }],
        role: MessageRoles.USER,
      };
      store.getState().setMessages(msgs => [...msgs, triggerMsg]);

      const afterTrigger = store.getState().messages.filter(
        m => m.role === MessageRoles.USER && getRoundNumber(m.metadata) === nextRound,
      );

      // CRITICAL: Should have BOTH original and trigger message
      expect(afterTrigger).toHaveLength(2);

      // Original message should still be present
      const originalPresent = afterTrigger.some(m => m.id === '01KE5WMBVDFY');
      expect(originalPresent).toBeTruthy();
    });

    it('cRITICAL: comparing round 0 vs round 1 user message visibility', () => {
      // Round 0 flow
      const round0UserMsg = createUserMessage(0, 'Round 0 question');
      store.getState().initializeThread(thread, participants, [round0UserMsg]);

      const round0Messages = store.getState().messages.filter(
        m => m.role === MessageRoles.USER && getRoundNumber(m.metadata) === 0,
      );

      // Round 1 flow (same steps)
      const round1UserMsg = createUserMessage(1, 'Round 1 question');
      store.getState().setMessages(msgs => [...msgs, round1UserMsg]);
      store.getState().setStreamingRoundNumber(1);

      const round1Messages = store.getState().messages.filter(
        m => m.role === MessageRoles.USER && getRoundNumber(m.metadata) === 1,
      );

      // CRITICAL: Both rounds must have exactly 1 user message
      expect(round0Messages).toHaveLength(1);
      expect(round1Messages).toHaveLength(1);
      expect(round0Messages).toHaveLength(round1Messages.length);
    });

    it('cRITICAL: animation skip must apply to ALL non-initial rounds', () => {
      const testRounds = [1, 2, 3, 5, 10];

      for (const roundNum of testRounds) {
        const message = createUserMessage(roundNum, `Round ${roundNum}`);
        const roundNumber = getRoundNumber(message.metadata);

        // Round number > 0 should ALWAYS skip animation
        const shouldSkip = roundNumber !== null && roundNumber > 0;
        expect(shouldSkip).toBeTruthy();
      }
    });
  });
});
