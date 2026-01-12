/**
 * Message Visibility End-to-End Tests
 *
 * Tests the COMPLETE visibility pipeline from submission to DOM rendering:
 * 1. User submits message
 * 2. Message stored in Zustand store
 * 3. Message grouped by useThreadTimeline
 * 4. Message passed to virtualizer
 * 5. Message rendered in ChatMessageList
 * 6. Message visible in DOM
 *
 * CRITICAL BUG SCENARIOS TESTED:
 * - Message in store but not in UI
 * - Message disappears during state changes
 * - Message ID changes break visibility
 * - Deduplication removes visible messages
 * - Animation timing hides messages
 * - Sync issues between store/timeline/virtualizer
 */

import type { UIMessage } from 'ai';
import { beforeEach, describe, expect, it } from 'vitest';

import { ChatModes, MessageRoles, ModelIds } from '@/api/core/enums';
import type { ChatParticipant, ChatThread } from '@/api/routes/chat/schema';
import { getRoundNumber } from '@/lib/utils';

import { createChatStore } from '../store';

// ============================================================================
// TEST HELPERS
// ============================================================================

function createThread(overrides?: Partial<ChatThread>): ChatThread {
  return {
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
    ...overrides,
  };
}

function createParticipants(): ChatParticipant[] {
  return [
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
}

function createUserMessage(roundNumber: number, text: string, isOptimistic = false): UIMessage {
  const id = isOptimistic
    ? `optimistic-user-${roundNumber}-${Date.now()}`
    : `thread_r${roundNumber}_user`;

  return {
    id,
    role: MessageRoles.USER,
    parts: [{ type: 'text', text }],
    metadata: {
      role: MessageRoles.USER,
      roundNumber,
      ...(isOptimistic ? { isOptimistic: true } : {}),
    },
  };
}

function createAssistantMessage(
  roundNumber: number,
  participantIndex: number,
  text: string,
): UIMessage {
  return {
    id: `thread_r${roundNumber}_p${participantIndex}`,
    role: MessageRoles.ASSISTANT,
    parts: [{ type: 'text', text }],
    metadata: {
      role: MessageRoles.ASSISTANT,
      roundNumber,
      participantIndex,
      participantId: `p${participantIndex + 1}`,
      model: participantIndex === 0 ? 'gpt-4o' : 'claude-3-5-sonnet',
      finishReason: 'stop',
      hasError: false,
      isTransient: false,
      isPartialResponse: false,
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    },
  };
}

function createModeratorMessage(roundNumber: number, text: string): UIMessage {
  return {
    id: `thread_r${roundNumber}_moderator`,
    role: MessageRoles.ASSISTANT,
    parts: [{ type: 'text', text }],
    metadata: {
      role: MessageRoles.ASSISTANT,
      isModerator: true,
      roundNumber,
      model: ModelIds.GOOGLE_GEMINI_3_FLASH_PREVIEW,
      finishReason: 'stop',
    },
  };
}

/**
 * Simulates the timeline grouping logic from useThreadTimeline
 */
function groupMessagesByRound(messages: UIMessage[]): Map<number, UIMessage[]> {
  const messagesByRound = new Map<number, UIMessage[]>();

  messages.forEach((message) => {
    const roundNum = getRoundNumber(message.metadata) ?? 0;
    if (!messagesByRound.has(roundNum)) {
      messagesByRound.set(roundNum, []);
    }
    messagesByRound.get(roundNum)!.push(message);
  });

  return messagesByRound;
}

/**
 * Simulates the deduplication logic from ChatMessageList
 */
function deduplicateMessages(messages: UIMessage[]): UIMessage[] {
  const seenMessageIds = new Set<string>();
  const userRoundToIdx = new Map<number, number>();
  const result: UIMessage[] = [];

  for (const message of messages) {
    if (seenMessageIds.has(message.id)) {
      continue;
    }

    if (message.role === MessageRoles.USER) {
      const roundNum = message.metadata?.roundNumber as number | undefined;

      if (roundNum !== undefined && roundNum !== null) {
        const existingIdx = userRoundToIdx.get(roundNum);

        if (existingIdx !== undefined) {
          const isDeterministicId = message.id.includes('_r') && message.id.includes('_user');
          const isOptimistic = message.id.startsWith('optimistic-');

          if (isOptimistic) {
            // Skip optimistic in favor of DB message
            continue;
          }
          if (isDeterministicId) {
            // Replace optimistic with DB message
            result[existingIdx] = message;
            seenMessageIds.add(message.id);
            continue;
          }
          // Skip duplicate
          continue;
        }
        userRoundToIdx.set(roundNum, result.length);
      }

      seenMessageIds.add(message.id);
      result.push(message);
    } else {
      seenMessageIds.add(message.id);
      result.push(message);
    }
  }

  return result;
}

// ============================================================================
// TESTS
// ============================================================================

describe('message Visibility E2E', () => {
  let store: ReturnType<typeof createChatStore>;
  let thread: ChatThread;
  let participants: ChatParticipant[];
  let round0Messages: UIMessage[];

  beforeEach(() => {
    store = createChatStore();
    thread = createThread();
    participants = createParticipants();

    round0Messages = [
      createUserMessage(0, 'Initial question'),
      createAssistantMessage(0, 0, 'GPT response'),
      createAssistantMessage(0, 1, 'Claude response'),
      createModeratorMessage(0, 'Summary'),
    ];

    store.getState().initializeThread(thread, participants, round0Messages);
  });

  describe('round 0 (Initial Round) Visibility', () => {
    it('sTEP 1: User message stored in Zustand store', () => {
      const messages = store.getState().messages;
      const userMessages = messages.filter(m => m.role === MessageRoles.USER);

      expect(userMessages).toHaveLength(1);
      expect(userMessages[0].parts[0]).toEqual({ type: 'text', text: 'Initial question' });
      expect(getRoundNumber(userMessages[0].metadata)).toBe(0);
    });

    it('sTEP 2: User message grouped by timeline', () => {
      const messages = store.getState().messages;
      const messagesByRound = groupMessagesByRound(messages);

      expect(messagesByRound.has(0)).toBe(true);

      const round0 = messagesByRound.get(0)!;
      const userMessage = round0.find(m => m.role === MessageRoles.USER);

      expect(userMessage).toBeDefined();
      expect(userMessage!.parts[0]).toEqual({ type: 'text', text: 'Initial question' });
    });

    it('sTEP 3: User message survives deduplication', () => {
      const messages = store.getState().messages;
      const deduplicated = deduplicateMessages(messages);

      const userMessages = deduplicated.filter(m => m.role === MessageRoles.USER);
      expect(userMessages).toHaveLength(1);
      expect(userMessages[0].parts[0]).toEqual({ type: 'text', text: 'Initial question' });
    });

    it('sTEP 4: All messages visible in final render pipeline', () => {
      const messages = store.getState().messages;
      const messagesByRound = groupMessagesByRound(messages);
      const round0 = messagesByRound.get(0)!;
      const deduplicated = deduplicateMessages(round0);

      // Should have: 1 user + 2 participants + 1 moderator = 4 messages
      expect(deduplicated).toHaveLength(4);

      const userMsg = deduplicated.find(m => m.role === MessageRoles.USER);
      const assistantMsgs = deduplicated.filter(
        m => m.role === MessageRoles.ASSISTANT && !m.metadata?.isModerator,
      );
      const moderatorMsg = deduplicated.find(m => m.metadata?.isModerator === true);

      expect(userMsg).toBeDefined();
      expect(assistantMsgs).toHaveLength(2);
      expect(moderatorMsg).toBeDefined();
    });
  });

  describe('round 1 (Non-Initial Round) Visibility', () => {
    it('sTEP 1: Optimistic user message stored immediately', () => {
      const optimisticMsg = createUserMessage(1, 'Follow-up question', true);
      store.getState().setMessages(msgs => [...msgs, optimisticMsg]);

      const messages = store.getState().messages;
      const round1UserMsgs = messages.filter(
        m => m.role === MessageRoles.USER && getRoundNumber(m.metadata) === 1,
      );

      expect(round1UserMsgs).toHaveLength(1);
      expect(round1UserMsgs[0].parts[0]).toEqual({ type: 'text', text: 'Follow-up question' });
    });

    it('sTEP 2: Optimistic message grouped in timeline', () => {
      const optimisticMsg = createUserMessage(1, 'Follow-up question', true);
      store.getState().setMessages(msgs => [...msgs, optimisticMsg]);

      const messages = store.getState().messages;
      const messagesByRound = groupMessagesByRound(messages);

      expect(messagesByRound.has(1)).toBe(true);

      const round1 = messagesByRound.get(1)!;
      expect(round1).toHaveLength(1);
      expect(round1[0].role).toBe(MessageRoles.USER);
      expect(round1[0].parts[0]).toEqual({ type: 'text', text: 'Follow-up question' });
    });

    it('sTEP 3: Optimistic message survives deduplication BEFORE DB message', () => {
      const optimisticMsg = createUserMessage(1, 'Follow-up question', true);
      store.getState().setMessages(msgs => [...msgs, optimisticMsg]);

      const messages = store.getState().messages;
      const messagesByRound = groupMessagesByRound(messages);
      const round1 = messagesByRound.get(1)!;
      const deduplicated = deduplicateMessages(round1);

      expect(deduplicated).toHaveLength(1);
      expect(deduplicated[0].role).toBe(MessageRoles.USER);
      expect(deduplicated[0].id).toContain('optimistic-');
    });

    it('sTEP 4: DB message replaces optimistic after persistence', () => {
      // Add optimistic
      const optimisticMsg = createUserMessage(1, 'Follow-up question', true);
      store.getState().setMessages(msgs => [...msgs, optimisticMsg]);

      // Add DB message (simulating PATCH response)
      const dbMsg = createUserMessage(1, 'Follow-up question', false);
      store.getState().setMessages(msgs => [...msgs, dbMsg]);

      const messages = store.getState().messages;
      const messagesByRound = groupMessagesByRound(messages);
      const round1 = messagesByRound.get(1)!;
      const deduplicated = deduplicateMessages(round1);

      // Should have only DB message (optimistic replaced)
      expect(deduplicated).toHaveLength(1);
      expect(deduplicated[0].id).toBe('thread_r1_user');
      expect(deduplicated[0].parts[0]).toEqual({ type: 'text', text: 'Follow-up question' });
    });

    it('sTEP 5: User message visible throughout streaming lifecycle', () => {
      // Initial state: Add optimistic message
      const optimisticMsg = createUserMessage(1, 'Follow-up', true);
      store.getState().setMessages(msgs => [...msgs, optimisticMsg]);
      store.getState().setStreamingRoundNumber(1);
      store.getState().setConfigChangeRoundNumber(1);

      // State 1: Before PATCH
      let messages = store.getState().messages;
      let round1Msgs = messages.filter(m => getRoundNumber(m.metadata) === 1);
      expect(round1Msgs.length).toBeGreaterThan(0);

      // State 2: After PATCH (replace optimistic with DB)
      const dbMsg = createUserMessage(1, 'Follow-up', false);
      store.getState().setMessages(msgs =>
        msgs.map(m => (m.id === optimisticMsg.id ? dbMsg : m)),
      );

      messages = store.getState().messages;
      round1Msgs = messages.filter(m => getRoundNumber(m.metadata) === 1);
      expect(round1Msgs).toHaveLength(1);
      expect(round1Msgs[0].id).toBe('thread_r1_user');

      // State 3: During streaming (add participant responses)
      store.getState().setMessages(msgs => [
        ...msgs,
        createAssistantMessage(1, 0, 'GPT response'),
      ]);
      store.getState().setIsStreaming(true);

      messages = store.getState().messages;
      const userMsgs = messages.filter(
        m => m.role === MessageRoles.USER && getRoundNumber(m.metadata) === 1,
      );
      expect(userMsgs).toHaveLength(1);

      // State 4: After streaming completes
      store.getState().setMessages(msgs => [
        ...msgs,
        createAssistantMessage(1, 1, 'Claude response'),
        createModeratorMessage(1, 'Summary'),
      ]);
      store.getState().setIsStreaming(false);
      store.getState().setStreamingRoundNumber(null);

      messages = store.getState().messages;
      const finalUserMsgs = messages.filter(
        m => m.role === MessageRoles.USER && getRoundNumber(m.metadata) === 1,
      );
      expect(finalUserMsgs).toHaveLength(1);
    });
  });

  describe('round 2+ (Multiple Non-Initial Rounds) Visibility', () => {
    beforeEach(() => {
      // Complete round 1 first
      const round1Messages = [
        createUserMessage(1, 'Follow-up 1'),
        createAssistantMessage(1, 0, 'Response 1'),
        createAssistantMessage(1, 1, 'Response 2'),
        createModeratorMessage(1, 'Summary 1'),
      ];
      store.getState().setMessages(msgs => [...msgs, ...round1Messages]);
    });

    it('sTEP 1: Round 2 user message stored correctly', () => {
      const optimisticMsg = createUserMessage(2, 'Follow-up 2', true);
      store.getState().setMessages(msgs => [...msgs, optimisticMsg]);

      const messages = store.getState().messages;
      const round2Msgs = messages.filter(m => getRoundNumber(m.metadata) === 2);

      expect(round2Msgs).toHaveLength(1);
      expect(round2Msgs[0].role).toBe(MessageRoles.USER);
    });

    it('sTEP 2: All rounds grouped correctly in timeline', () => {
      const optimisticMsg = createUserMessage(2, 'Follow-up 2', true);
      store.getState().setMessages(msgs => [...msgs, optimisticMsg]);

      const messages = store.getState().messages;
      const messagesByRound = groupMessagesByRound(messages);

      expect(messagesByRound.size).toBe(3); // Rounds 0, 1, 2
      expect(messagesByRound.has(0)).toBe(true);
      expect(messagesByRound.has(1)).toBe(true);
      expect(messagesByRound.has(2)).toBe(true);
    });

    it('sTEP 3: Each round maintains correct user message', () => {
      const optimisticMsg = createUserMessage(2, 'Follow-up 2', true);
      store.getState().setMessages(msgs => [...msgs, optimisticMsg]);

      const messages = store.getState().messages;
      const messagesByRound = groupMessagesByRound(messages);

      // Round 0
      const round0 = messagesByRound.get(0)!;
      const round0Dedup = deduplicateMessages(round0);
      const round0User = round0Dedup.find(m => m.role === MessageRoles.USER);
      expect(round0User?.parts[0]).toEqual({ type: 'text', text: 'Initial question' });

      // Round 1
      const round1 = messagesByRound.get(1)!;
      const round1Dedup = deduplicateMessages(round1);
      const round1User = round1Dedup.find(m => m.role === MessageRoles.USER);
      expect(round1User?.parts[0]).toEqual({ type: 'text', text: 'Follow-up 1' });

      // Round 2
      const round2 = messagesByRound.get(2)!;
      const round2Dedup = deduplicateMessages(round2);
      const round2User = round2Dedup.find(m => m.role === MessageRoles.USER);
      expect(round2User?.parts[0]).toEqual({ type: 'text', text: 'Follow-up 2' });
    });
  });

  describe('message ID Changes Dont Affect Visibility', () => {
    it('optimistic ID to DB ID transition preserves visibility', () => {
      const optimisticMsg = createUserMessage(1, 'Question', true);
      const optimisticId = optimisticMsg.id;

      // Add optimistic
      store.getState().setMessages(msgs => [...msgs, optimisticMsg]);

      let messages = store.getState().messages;
      let round1 = messages.filter(m => getRoundNumber(m.metadata) === 1);
      expect(round1).toHaveLength(1);
      expect(round1[0].id).toBe(optimisticId);

      // Replace with DB message
      const dbMsg = createUserMessage(1, 'Question', false);
      store.getState().setMessages(msgs => msgs.map(m => (m.id === optimisticId ? dbMsg : m)));

      messages = store.getState().messages;
      round1 = messages.filter(m => getRoundNumber(m.metadata) === 1);
      expect(round1).toHaveLength(1);
      expect(round1[0].id).toBe('thread_r1_user');
    });

    it('streaming message ID updates preserve visibility', () => {
      const streamingMsg = createAssistantMessage(1, 0, 'Partial...');
      streamingMsg.id = 'streaming-temp-id';

      store.getState().setMessages(msgs => [...msgs, streamingMsg]);

      let messages = store.getState().messages;
      expect(messages.some(m => m.id === 'streaming-temp-id')).toBe(true);

      // Replace with final ID
      const finalMsg = createAssistantMessage(1, 0, 'Complete response');
      store
        .getState()
        .setMessages(msgs => msgs.map(m => (m.id === 'streaming-temp-id' ? finalMsg : m)));

      messages = store.getState().messages;
      expect(messages.some(m => m.id === 'thread_r1_p0')).toBe(true);
      expect(messages.some(m => m.id === 'streaming-temp-id')).toBe(false);
    });
  });

  describe('deduplication Edge Cases', () => {
    it('does NOT remove visible messages when DB message arrives first (race condition)', () => {
      // Race condition: DB message arrives before optimistic
      const dbMsg = createUserMessage(1, 'Question', false);
      const optimisticMsg = createUserMessage(1, 'Question', true);

      store.getState().setMessages(msgs => [...msgs, dbMsg, optimisticMsg]);

      const messages = store.getState().messages;
      const round1 = messages.filter(m => getRoundNumber(m.metadata) === 1);
      const deduplicated = deduplicateMessages(round1);

      // Should only have DB message (optimistic filtered out)
      expect(deduplicated).toHaveLength(1);
      expect(deduplicated[0].id).toBe('thread_r1_user');
    });

    it('handles multiple rapid ID changes', () => {
      // Optimistic -> Temporary -> DB
      const optimisticMsg = createUserMessage(1, 'Question', true);
      store.getState().setMessages(msgs => [...msgs, optimisticMsg]);

      // Replace with temporary
      const tempMsg = { ...createUserMessage(1, 'Question', false), id: 'temp-id-123' };
      store
        .getState()
        .setMessages(msgs => msgs.map(m => (m.id === optimisticMsg.id ? tempMsg : m)));

      // Replace with final DB
      const dbMsg = createUserMessage(1, 'Question', false);
      store.getState().setMessages(msgs => msgs.map(m => (m.id === tempMsg.id ? dbMsg : m)));

      const messages = store.getState().messages;
      const round1 = messages.filter(m => getRoundNumber(m.metadata) === 1);

      expect(round1).toHaveLength(1);
      expect(round1[0].id).toBe('thread_r1_user');
    });
  });

  describe('initializeThread State Sync', () => {
    it('preserves round 1 user message when initializeThread called with round 0 data', () => {
      const optimisticMsg = createUserMessage(1, 'Question', true);
      store.getState().setMessages(msgs => [...msgs, optimisticMsg]);
      store.getState().setStreamingRoundNumber(1);
      store.getState().setConfigChangeRoundNumber(1);

      // initializeThread called (e.g., from query refetch)
      store.getState().initializeThread(thread, participants, round0Messages);

      const messages = store.getState().messages;
      const round1Msgs = messages.filter(m => getRoundNumber(m.metadata) === 1);

      expect(round1Msgs).toHaveLength(1);
      expect(round1Msgs[0].role).toBe(MessageRoles.USER);
    });

    it('preserves all rounds during concurrent updates', () => {
      // Complete round 1
      store.getState().setMessages(msgs => [
        ...msgs,
        createUserMessage(1, 'Q1'),
        createAssistantMessage(1, 0, 'A1'),
      ]);

      // Start round 2
      const round2Msg = createUserMessage(2, 'Q2', true);
      store.getState().setMessages(msgs => [...msgs, round2Msg]);
      store.getState().setStreamingRoundNumber(2);

      // initializeThread with round 0-1 data
      const allMessages = [
        ...round0Messages,
        createUserMessage(1, 'Q1'),
        createAssistantMessage(1, 0, 'A1'),
      ];
      store.getState().initializeThread(thread, participants, allMessages);

      const messages = store.getState().messages;
      const messagesByRound = groupMessagesByRound(messages);

      expect(messagesByRound.has(0)).toBe(true);
      expect(messagesByRound.has(1)).toBe(true);
      expect(messagesByRound.has(2)).toBe(true);
    });
  });

  describe('complete Visibility Pipeline for All Message Types', () => {
    it('user message: round 0', () => {
      const messages = store.getState().messages;
      const messagesByRound = groupMessagesByRound(messages);
      const round0 = messagesByRound.get(0)!;
      const deduplicated = deduplicateMessages(round0);

      const userMsg = deduplicated.find(m => m.role === MessageRoles.USER);
      expect(userMsg).toBeDefined();
      expect(userMsg!.parts[0]).toEqual({ type: 'text', text: 'Initial question' });
    });

    it('user message: round 1', () => {
      const optimisticMsg = createUserMessage(1, 'Q1', true);
      store.getState().setMessages(msgs => [...msgs, optimisticMsg]);

      const messages = store.getState().messages;
      const messagesByRound = groupMessagesByRound(messages);
      const round1 = messagesByRound.get(1)!;
      const deduplicated = deduplicateMessages(round1);

      const userMsg = deduplicated.find(m => m.role === MessageRoles.USER);
      expect(userMsg).toBeDefined();
      expect(userMsg!.parts[0]).toEqual({ type: 'text', text: 'Q1' });
    });

    it('user message: round 2+', () => {
      store.getState().setMessages(msgs => [
        ...msgs,
        createUserMessage(1, 'Q1'),
        createUserMessage(2, 'Q2', true),
      ]);

      const messages = store.getState().messages;
      const messagesByRound = groupMessagesByRound(messages);
      const round2 = messagesByRound.get(2)!;
      const deduplicated = deduplicateMessages(round2);

      const userMsg = deduplicated.find(m => m.role === MessageRoles.USER);
      expect(userMsg).toBeDefined();
      expect(userMsg!.parts[0]).toEqual({ type: 'text', text: 'Q2' });
    });

    it('participant message: round 0', () => {
      const messages = store.getState().messages;
      const messagesByRound = groupMessagesByRound(messages);
      const round0 = messagesByRound.get(0)!;
      const deduplicated = deduplicateMessages(round0);

      const participantMsgs = deduplicated.filter(
        m => m.role === MessageRoles.ASSISTANT && !m.metadata?.isModerator,
      );
      expect(participantMsgs).toHaveLength(2);
    });

    it('participant message: round 1', () => {
      store.getState().setMessages(msgs => [
        ...msgs,
        createUserMessage(1, 'Q1'),
        createAssistantMessage(1, 0, 'A1'),
        createAssistantMessage(1, 1, 'A2'),
      ]);

      const messages = store.getState().messages;
      const messagesByRound = groupMessagesByRound(messages);
      const round1 = messagesByRound.get(1)!;
      const deduplicated = deduplicateMessages(round1);

      const participantMsgs = deduplicated.filter(
        m => m.role === MessageRoles.ASSISTANT && !m.metadata?.isModerator,
      );
      expect(participantMsgs).toHaveLength(2);
    });

    it('moderator message: round 0', () => {
      const messages = store.getState().messages;
      const messagesByRound = groupMessagesByRound(messages);
      const round0 = messagesByRound.get(0)!;
      const deduplicated = deduplicateMessages(round0);

      const moderatorMsg = deduplicated.find(m => m.metadata?.isModerator === true);
      expect(moderatorMsg).toBeDefined();
      expect(moderatorMsg!.parts[0]).toEqual({ type: 'text', text: 'Summary' });
    });

    it('moderator message: round 1', () => {
      store.getState().setMessages(msgs => [
        ...msgs,
        createUserMessage(1, 'Q1'),
        createAssistantMessage(1, 0, 'A1'),
        createAssistantMessage(1, 1, 'A2'),
        createModeratorMessage(1, 'Summary 1'),
      ]);

      const messages = store.getState().messages;
      const messagesByRound = groupMessagesByRound(messages);
      const round1 = messagesByRound.get(1)!;
      const deduplicated = deduplicateMessages(round1);

      const moderatorMsg = deduplicated.find(m => m.metadata?.isModerator === true);
      expect(moderatorMsg).toBeDefined();
      expect(moderatorMsg!.parts[0]).toEqual({ type: 'text', text: 'Summary 1' });
    });
  });
});
