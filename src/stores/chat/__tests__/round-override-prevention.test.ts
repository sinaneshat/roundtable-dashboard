/**
 * Round Override Prevention Tests
 *
 * Tests the critical fix for round override bug during overview to thread navigation.
 *
 * ROOT CAUSE: When navigating from overview screen to thread screen after round 0 completes:
 * 1. Overview screen has live messages from streaming session in store
 * 2. Thread screen receives SSR initialMessages (potentially stale)
 * 3. initializeThread() was unconditionally overwriting messages with stale SSR data
 * 4. Next submission calculated round 0 instead of round 1 (data loss)
 *
 * FIX:
 * 1. initializeThread() now compares store messages with initialMessages
 * 2. Preserves store messages if they're more complete (more rounds or messages)
 * 3. Backend protection rejects attempts to create user messages in completed rounds
 *
 * @see streaming.handler.ts - Backend STEP 3.1: Round Integrity Protection
 * @see store.ts - initializeThread message preservation logic
 */

import type { UIMessage } from 'ai';
import { beforeEach, describe, expect, it } from 'vitest';

import { ChatModes, MessageRoles, ScreenModes } from '@/api/core/enums';
import type { ChatParticipant, ChatThread } from '@/api/routes/chat/schema';

import { createChatStore } from '../store';

describe('round Override Prevention', () => {
  let store: ReturnType<typeof createChatStore>;

  // Mock data factories
  const createMockThread = (overrides: Partial<ChatThread> = {}): ChatThread => ({
    id: 'thread-1',
    userId: 'user-1',
    projectId: null,
    title: 'Test Thread',
    slug: 'test-thread',
    mode: ChatModes.BRAINSTORMING,
    status: 'active',
    isFavorite: false,
    isPublic: false,
    isAiGeneratedTitle: true,
    enableWebSearch: false,
    metadata: null,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastMessageAt: new Date(),
    ...overrides,
  });

  const createMockParticipants = (threadId: string): ChatParticipant[] => [
    {
      id: `${threadId}_p0`,
      threadId,
      modelId: 'openai/gpt-4',
      customRoleId: null,
      role: 'Analyst',
      priority: 0,
      isEnabled: true,
      settings: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: `${threadId}_p1`,
      threadId,
      modelId: 'anthropic/claude-3-opus',
      customRoleId: null,
      role: 'Researcher',
      priority: 1,
      isEnabled: true,
      settings: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  const createUserMessage = (roundNumber: number, threadId: string, content = 'User question'): UIMessage => ({
    id: `${threadId}_r${roundNumber}_user`,
    role: MessageRoles.USER,
    parts: [{ type: 'text', text: content }],
    metadata: {
      role: MessageRoles.USER,
      roundNumber,
    },
  });

  const createAssistantMessage = (roundNumber: number, participantIndex: number, threadId: string): UIMessage => ({
    id: `${threadId}_r${roundNumber}_p${participantIndex}`,
    role: MessageRoles.ASSISTANT,
    parts: [{ type: 'text', text: `Response from participant ${participantIndex}` }],
    metadata: {
      role: MessageRoles.ASSISTANT,
      roundNumber,
      participantId: `${threadId}_p${participantIndex}`,
      participantIndex,
    },
  });

  beforeEach(() => {
    store = createChatStore();
  });

  describe('initializeThread Message Preservation', () => {
    it('should preserve store messages when same thread has more complete data', () => {
      const thread = createMockThread();
      const participants = createMockParticipants(thread.id);

      // Store has completed round 0 (user + 2 assistants)
      const storeMessages: UIMessage[] = [
        createUserMessage(0, thread.id),
        createAssistantMessage(0, 0, thread.id),
        createAssistantMessage(0, 1, thread.id),
      ];

      // Simulate overview screen having live messages
      store.getState().initializeThread(thread, participants, storeMessages);
      store.setState({ createdThreadId: thread.id });

      // SSR initialMessages are stale (empty or partial)
      const staleSSRMessages: UIMessage[] = [];

      // Re-initialize like thread screen would do
      store.getState().initializeThread(thread, participants, staleSSRMessages);

      // Store messages should be PRESERVED (not overwritten with empty)
      const state = store.getState();
      expect(state.messages).toHaveLength(3);
      expect(state.messages[0].id).toBe(`${thread.id}_r0_user`);
    });

    it('should preserve store messages when they have more rounds than SSR data', () => {
      const thread = createMockThread();
      const participants = createMockParticipants(thread.id);

      // Store has round 0 AND round 1 in progress
      const storeMessages: UIMessage[] = [
        createUserMessage(0, thread.id, 'First question'),
        createAssistantMessage(0, 0, thread.id),
        createAssistantMessage(0, 1, thread.id),
        createUserMessage(1, thread.id, 'Second question'),
        createAssistantMessage(1, 0, thread.id),
      ];

      // Initialize with live messages
      store.getState().initializeThread(thread, participants, storeMessages);
      store.setState({ createdThreadId: thread.id });

      // SSR data only has round 0 (stale from when page was first rendered)
      const staleSSRMessages: UIMessage[] = [
        createUserMessage(0, thread.id, 'First question'),
        createAssistantMessage(0, 0, thread.id),
        createAssistantMessage(0, 1, thread.id),
      ];

      // Re-initialize
      store.getState().initializeThread(thread, participants, staleSSRMessages);

      // Store should PRESERVE round 1 data
      const state = store.getState();
      expect(state.messages).toHaveLength(5);
      const maxRound = state.messages.reduce((max, m) => {
        const round = (m.metadata as { roundNumber?: number })?.roundNumber ?? 0;
        return Math.max(max, round);
      }, 0);
      expect(maxRound).toBe(1);
    });

    it('should use SSR messages when navigating to a DIFFERENT thread', () => {
      const oldThread = createMockThread({ id: 'old-thread', slug: 'old-thread' });
      const newThread = createMockThread({ id: 'new-thread', slug: 'new-thread' });
      const oldParticipants = createMockParticipants(oldThread.id);
      const newParticipants = createMockParticipants(newThread.id);

      // Store has old thread data
      const oldMessages: UIMessage[] = [
        createUserMessage(0, oldThread.id),
        createAssistantMessage(0, 0, oldThread.id),
      ];
      store.getState().initializeThread(oldThread, oldParticipants, oldMessages);

      // Navigate to new thread with fresh SSR data
      const newMessages: UIMessage[] = [
        createUserMessage(0, newThread.id, 'Different question'),
        createAssistantMessage(0, 0, newThread.id),
        createAssistantMessage(0, 1, newThread.id),
      ];
      store.getState().initializeThread(newThread, newParticipants, newMessages);

      // Should use NEW thread's messages
      const state = store.getState();
      expect(state.thread?.id).toBe(newThread.id);
      expect(state.messages).toHaveLength(3);
      expect(state.messages[0].id).toBe(`${newThread.id}_r0_user`);
    });

    it('should use SSR messages when store is empty', () => {
      const thread = createMockThread();
      const participants = createMockParticipants(thread.id);

      // SSR messages for fresh page load
      const ssrMessages: UIMessage[] = [
        createUserMessage(0, thread.id),
        createAssistantMessage(0, 0, thread.id),
        createAssistantMessage(0, 1, thread.id),
      ];

      // Initialize with SSR data (first time, store is empty)
      store.getState().initializeThread(thread, participants, ssrMessages);

      // Should use SSR messages
      const state = store.getState();
      expect(state.messages).toHaveLength(3);
    });

    it('should use SSR messages when they have MORE rounds than store', () => {
      const thread = createMockThread();
      const participants = createMockParticipants(thread.id);

      // Store has only partial data (maybe from an old session)
      const storeMessages: UIMessage[] = [
        createUserMessage(0, thread.id),
      ];
      store.getState().initializeThread(thread, participants, storeMessages);
      store.setState({ createdThreadId: thread.id });

      // SSR has more complete data (fresh from server)
      const ssrMessages: UIMessage[] = [
        createUserMessage(0, thread.id),
        createAssistantMessage(0, 0, thread.id),
        createAssistantMessage(0, 1, thread.id),
        createUserMessage(1, thread.id, 'Second question'),
      ];

      // Re-initialize
      store.getState().initializeThread(thread, participants, ssrMessages);

      // Should use SSR messages (they're more complete)
      const state = store.getState();
      expect(state.messages).toHaveLength(4);
      const hasRound1 = state.messages.some(m =>
        (m.metadata as { roundNumber?: number })?.roundNumber === 1,
      );
      expect(hasRound1).toBe(true);
    });

    it('should match thread by createdThreadId when thread object is different', () => {
      const thread = createMockThread();
      const participants = createMockParticipants(thread.id);

      // Simulate overview screen: has messages but thread might not be set yet
      const liveMessages: UIMessage[] = [
        createUserMessage(0, thread.id),
        createAssistantMessage(0, 0, thread.id),
        createAssistantMessage(0, 1, thread.id),
      ];

      // Set createdThreadId before full thread object
      store.setState({
        createdThreadId: thread.id,
        messages: liveMessages,
      });

      // Thread screen initializes with same thread ID
      store.getState().initializeThread(thread, participants, []);

      // Should preserve messages (matched by createdThreadId)
      const state = store.getState();
      expect(state.messages).toHaveLength(3);
    });
  });

  describe('round Number Calculation After Navigation', () => {
    it('should calculate next round as 1 when store has complete round 0', () => {
      const thread = createMockThread();
      const participants = createMockParticipants(thread.id);

      // Complete round 0 data
      const messages: UIMessage[] = [
        createUserMessage(0, thread.id),
        createAssistantMessage(0, 0, thread.id),
        createAssistantMessage(0, 1, thread.id),
      ];

      store.getState().initializeThread(thread, participants, messages);
      store.setState({
        screenMode: ScreenModes.THREAD,
        createdThreadId: thread.id,
      });

      // Verify round calculation would be correct
      const state = store.getState();
      const maxRound = state.messages.reduce((max, m) => {
        const round = (m.metadata as { roundNumber?: number })?.roundNumber ?? 0;
        return Math.max(max, round);
      }, 0);

      // Next round should be 1 (maxRound + 1)
      expect(maxRound).toBe(0);
      // This confirms the data is correct for calculateNextRoundNumber to return 1
    });

    it('should NOT reset messages when navigating from overview to thread for SAME thread', () => {
      const thread = createMockThread();
      const participants = createMockParticipants(thread.id);

      // Simulate overview flow: create thread, complete round 0
      store.setState({
        screenMode: ScreenModes.OVERVIEW,
        createdThreadId: thread.id,
      });

      const round0Messages: UIMessage[] = [
        createUserMessage(0, thread.id),
        createAssistantMessage(0, 0, thread.id),
        createAssistantMessage(0, 1, thread.id),
      ];

      // Overview screen has live data
      store.getState().initializeThread(thread, participants, round0Messages);

      // Simulate navigation to thread screen
      store.setState({ screenMode: ScreenModes.THREAD });

      // Thread screen would call initializeThread with SSR data (stale)
      // SSR data might be empty because thread was just created
      store.getState().initializeThread(thread, participants, []);

      // Messages should be PRESERVED
      const state = store.getState();
      expect(state.messages).toHaveLength(3);

      // Round calculation should still work correctly
      const maxRound = state.messages.reduce((max, m) => {
        const round = (m.metadata as { roundNumber?: number })?.roundNumber ?? 0;
        return Math.max(max, round);
      }, 0);
      expect(maxRound).toBe(0);
    });
  });

  describe('edge Cases', () => {
    it('should handle messages without roundNumber metadata gracefully', () => {
      const thread = createMockThread();
      const participants = createMockParticipants(thread.id);

      // Messages without roundNumber in metadata
      const messagesWithoutMetadata: UIMessage[] = [
        {
          id: 'msg-1',
          role: MessageRoles.USER,
          parts: [{ type: 'text', text: 'Question' }],
          metadata: {}, // No roundNumber
        },
      ];

      store.getState().initializeThread(thread, participants, messagesWithoutMetadata);
      store.setState({ createdThreadId: thread.id });

      // Re-initialize with empty SSR
      store.getState().initializeThread(thread, participants, []);

      // Should preserve messages (1 message > 0 messages)
      const state = store.getState();
      expect(state.messages).toHaveLength(1);
    });

    it('should prefer store when same round count but more messages', () => {
      const thread = createMockThread();
      const participants = createMockParticipants(thread.id);

      // Store has complete round (all participants)
      const storeMessages: UIMessage[] = [
        createUserMessage(0, thread.id),
        createAssistantMessage(0, 0, thread.id),
        createAssistantMessage(0, 1, thread.id),
      ];

      store.getState().initializeThread(thread, participants, storeMessages);
      store.setState({ createdThreadId: thread.id });

      // SSR has same round but fewer messages (partial)
      const ssrMessages: UIMessage[] = [
        createUserMessage(0, thread.id),
        createAssistantMessage(0, 0, thread.id),
      ];

      store.getState().initializeThread(thread, participants, ssrMessages);

      // Should preserve store messages (more complete)
      const state = store.getState();
      expect(state.messages).toHaveLength(3);
    });
  });
});
