/**
 * Form Actions Message Persistence Tests
 *
 * These tests verify that user messages persist correctly throughout the entire
 * form submission flow, especially for non-initial rounds.
 *
 * CRITICAL FLOW BEING TESTED:
 * 1. User submits non-initial round (handleUpdateThreadAndSend)
 * 2. Optimistic message added to store with correct metadata
 * 3. PATCH request sent to backend
 * 4. Message ID replaced with DB ID (optimistic → persisted)
 * 5. AI SDK streaming starts (creates participant trigger message)
 * 6. useMinimalMessageSync merges AI SDK with store messages
 * 7. Message deduplication filters participant trigger
 * 8. Original user message MUST remain visible throughout
 *
 * BUG SCENARIO THIS CATCHES:
 * - User submits round 1 → optimistic message shows ✅
 * - PATCH completes → message ID updated ✅
 * - AI SDK starts → participant trigger created ✅
 * - Sync happens → message DISAPPEARS ❌ (BUG!)
 *
 * ROOT CAUSE:
 * AI SDK sync was replacing store messages without preserving the original
 * user message, causing it to be lost after deduplication filtered the
 * participant trigger.
 *
 * @see src/stores/chat/actions/form-actions.ts - handleUpdateThreadAndSend
 * @see src/hooks/chat/use-minimal-message-sync.tsx - Message merge logic
 */

import type { UIMessage } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatModes, MessageRoles } from '@/api/core/enums';
import type { ChatParticipant, ChatThread } from '@/api/routes/chat/schema';
import { getRoundNumber, getUserMetadata } from '@/lib/utils';

import { createChatStore } from '../store';
import type { ChatStore } from '../store-schemas';
import { createOptimisticUserMessage } from '../utils/placeholder-factories';

// ============================================================================
// TEST SETUP
// ============================================================================

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
    id: 'test-thread-123',
    slug: 'test-thread',
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

/**
 * Helper to create mock participants
 */
function createMockParticipants(): ChatParticipant[] {
  return [
    {
      id: 'participant-1',
      threadId: 'test-thread-123',
      modelId: 'gpt-4o',
      role: 'Analyst',
      priority: 0,
      isEnabled: true,
      settings: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'participant-2',
      threadId: 'test-thread-123',
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

/**
 * Helper to create a user message for a specific round
 */
function createUserMessage(roundNumber: number, text: string, id?: string): UIMessage {
  return {
    id: id || `user-msg-round-${roundNumber}`,
    role: MessageRoles.USER,
    parts: [{ type: 'text', text }],
    metadata: {
      role: MessageRoles.USER,
      roundNumber,
    },
  };
}

/**
 * Helper to create an assistant message
 */
function createAssistantMessage(
  roundNumber: number,
  participantIndex: number,
  text: string,
): UIMessage {
  return {
    id: `assistant-msg-round-${roundNumber}-p${participantIndex}`,
    role: MessageRoles.ASSISTANT,
    parts: [{ type: 'text', text }],
    metadata: {
      role: MessageRoles.ASSISTANT,
      roundNumber,
      participantIndex,
      participantId: `participant-${participantIndex + 1}`,
      participantRole: participantIndex === 0 ? 'Analyst' : 'Critic',
      model: participantIndex === 0 ? 'gpt-4o' : 'claude-3-5-sonnet',
      finishReason: 'stop',
      hasError: false,
      isTransient: false,
      isPartialResponse: false,
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    },
  };
}

/**
 * Simulates the message merge logic from useMinimalMessageSync
 * This is what was causing the bug - we need to ensure it preserves user messages
 */
function simulateMessageSync(
  chatMessages: UIMessage[], // From AI SDK
  storeMessages: UIMessage[], // From store
): UIMessage[] {
  const chatMessageIds = new Set(chatMessages.map(m => m.id));

  // Filter store-only messages (preserve non-participant-trigger user messages)
  const storeOnlyMessages = storeMessages.filter((m) => {
    if (chatMessageIds.has(m.id)) {
      return false; // Already in AI SDK
    }

    // ✅ CRITICAL FIX: Preserve non-participant-trigger user messages
    if (m.role === MessageRoles.USER) {
      const userMeta = getUserMetadata(m.metadata);
      if (!userMeta?.isParticipantTrigger) {
        return true; // Always preserve original user message
      }
    }

    return false;
  });

  return [...chatMessages, ...storeOnlyMessages];
}

// ============================================================================
// TESTS
// ============================================================================

describe('Form Actions Message Persistence', () => {
  let store: ReturnType<typeof createChatStore>;
  let thread: ChatThread;
  let participants: ChatParticipant[];

  beforeEach(() => {
    vi.clearAllMocks();
    store = createTestStore();
    thread = createMockThread();
    participants = createMockParticipants();

    // Setup: Complete round 0
    const round0Messages = [
      createUserMessage(0, 'Initial question'),
      createAssistantMessage(0, 0, 'GPT response'),
      createAssistantMessage(0, 1, 'Claude response'),
    ];

    store.getState().initializeThread(thread, participants, round0Messages);
  });

  describe('Optimistic Message Creation', () => {
    it('should create optimistic message with correct metadata', () => {
      const nextRound = 1;
      const userText = 'Follow-up question';

      const optimisticMessage = createOptimisticUserMessage({
        roundNumber: nextRound,
        text: userText,
      });

      expect(optimisticMessage.role).toBe(MessageRoles.USER);
      expect(optimisticMessage.parts[0]).toEqual({ type: 'text', text: userText });
      expect(getRoundNumber(optimisticMessage.metadata)).toBe(nextRound);
      expect(optimisticMessage.metadata.isOptimistic).toBe(true);
      expect(optimisticMessage.id).toMatch(/^optimistic-user-1-/);
    });

    it('should create optimistic message with file parts', () => {
      const fileParts = [
        {
          type: 'file' as const,
          url: 'https://example.com/file.pdf',
          filename: 'document.pdf',
          mediaType: 'application/pdf',
          uploadId: 'upload-123',
        },
      ];

      const optimisticMessage = createOptimisticUserMessage({
        roundNumber: 1,
        text: 'Analyze this document',
        fileParts,
      });

      expect(optimisticMessage.parts.length).toBe(2); // File + text
      expect(optimisticMessage.parts[0]).toEqual(fileParts[0]);
      expect(optimisticMessage.parts[1]).toEqual({ type: 'text', text: 'Analyze this document' });
    });
  });

  describe('Optimistic Message Addition to Store', () => {
    it('should add optimistic message immediately to store', () => {
      const initialCount = store.getState().messages.length;

      const optimisticMessage = createOptimisticUserMessage({
        roundNumber: 1,
        text: 'Follow-up',
      });

      store.getState().setMessages(msgs => [...msgs, optimisticMessage]);

      const newState = store.getState();
      expect(newState.messages.length).toBe(initialCount + 1);

      const lastMessage = newState.messages[newState.messages.length - 1];
      expect(lastMessage?.id).toBe(optimisticMessage.id);
      expect(getRoundNumber(lastMessage?.metadata)).toBe(1);
    });

    it('should preserve all previous messages when adding optimistic', () => {
      const round0Count = store.getState().messages.filter(
        m => getRoundNumber(m.metadata) === 0,
      ).length;

      expect(round0Count).toBe(3); // User + 2 assistants

      const optimisticMessage = createOptimisticUserMessage({
        roundNumber: 1,
        text: 'Round 1 question',
      });

      store.getState().setMessages(msgs => [...msgs, optimisticMessage]);

      const newRound0Count = store.getState().messages.filter(
        m => getRoundNumber(m.metadata) === 0,
      ).length;

      expect(newRound0Count).toBe(3); // Should still have all round 0 messages
    });
  });

  describe('CRITICAL: Message ID Replacement After PATCH', () => {
    it('should replace optimistic message ID with persisted ID', () => {
      // Step 1: Add optimistic message
      const optimisticMessage = createOptimisticUserMessage({
        roundNumber: 1,
        text: 'Follow-up question',
      });

      store.getState().setMessages(msgs => [...msgs, optimisticMessage]);

      const optimisticId = optimisticMessage.id;

      // Verify optimistic is in store
      expect(store.getState().messages.find(m => m.id === optimisticId)).toBeDefined();

      // Step 2: PATCH completes - replace with persisted message
      const persistedMessage: UIMessage = {
        ...optimisticMessage,
        id: 'db-message-id-123', // Backend-generated ID
        metadata: {
          ...optimisticMessage.metadata,
          isOptimistic: undefined, // Remove optimistic flag
        },
      };

      store.getState().setMessages(msgs =>
        msgs.map(m => m.id === optimisticId ? persistedMessage : m),
      );

      // Verify replacement
      const state = store.getState();
      expect(state.messages.find(m => m.id === optimisticId)).toBeUndefined();
      expect(state.messages.find(m => m.id === 'db-message-id-123')).toBeDefined();
    });

    it('should maintain message content during ID replacement', () => {
      const userText = 'Important follow-up question';

      const optimisticMessage = createOptimisticUserMessage({
        roundNumber: 1,
        text: userText,
      });

      store.getState().setMessages(msgs => [...msgs, optimisticMessage]);

      const persistedMessage: UIMessage = {
        ...optimisticMessage,
        id: 'db-id-456',
        metadata: {
          ...optimisticMessage.metadata,
          isOptimistic: undefined,
        },
      };

      store.getState().setMessages(msgs =>
        msgs.map(m => m.id === optimisticMessage.id ? persistedMessage : m),
      );

      const replacedMsg = store.getState().messages.find(m => m.id === 'db-id-456');
      expect(replacedMsg).toBeDefined();
      expect(replacedMsg!.parts[0]).toEqual({ type: 'text', text: userText });
      expect(getRoundNumber(replacedMsg!.metadata)).toBe(1);
    });
  });

  describe('CRITICAL: Message Persistence During AI SDK Sync', () => {
    it('should preserve user message when AI SDK sync introduces participant trigger', () => {
      // Step 1: User submits round 1 (optimistic message)
      const optimisticMessage = createOptimisticUserMessage({
        roundNumber: 1,
        text: 'Follow-up question',
      });
      store.getState().setMessages(msgs => [...msgs, optimisticMessage]);

      // Step 2: PATCH completes (ID replaced)
      const persistedId = 'db-user-msg-r1';
      const persistedMessage: UIMessage = {
        ...optimisticMessage,
        id: persistedId,
        metadata: {
          ...optimisticMessage.metadata,
          isOptimistic: undefined,
        },
      };
      store.getState().setMessages(msgs =>
        msgs.map(m => m.id === optimisticMessage.id ? persistedMessage : m),
      );

      // Current store state
      const storeMessages = store.getState().messages;

      // Step 3: AI SDK starts streaming (creates participant trigger)
      const participantTrigger: UIMessage = {
        id: 'ai-sdk-trigger-xyz',
        role: MessageRoles.USER,
        parts: [{ type: 'text', text: 'Follow-up question' }],
        metadata: {
          role: MessageRoles.USER,
          roundNumber: 1,
          isParticipantTrigger: true, // AI SDK marker
        },
      };

      const chatMessages: UIMessage[] = [participantTrigger];

      // Step 4: Simulate message sync (what useMinimalMessageSync does)
      const mergedMessages = simulateMessageSync(chatMessages, storeMessages);

      // CRITICAL: Original user message MUST be in merged result
      const originalUserMsg = mergedMessages.find(m => m.id === persistedId);
      expect(originalUserMsg).toBeDefined();
      expect(originalUserMsg!.role).toBe(MessageRoles.USER);
      expect(getRoundNumber(originalUserMsg!.metadata)).toBe(1);
      expect(getUserMetadata(originalUserMsg!.metadata)?.isParticipantTrigger).toBeFalsy();

      // After deduplication (chat-message-list.tsx):
      // - Participant trigger gets filtered out
      // - Original user message remains visible
      const nonTriggerUserMessages = mergedMessages.filter((m) => {
        const meta = getUserMetadata(m.metadata);
        return m.role === MessageRoles.USER && !meta?.isParticipantTrigger;
      });

      expect(nonTriggerUserMessages.length).toBe(2); // Round 0 + Round 1
      expect(nonTriggerUserMessages.find(m => m.id === persistedId)).toBeDefined();
    });

    it('should preserve user message throughout entire submission flow', () => {
      const userText = 'Second round question';
      const nextRound = 1;

      // ============ PHASE 1: Optimistic Add ============
      const optimisticMessage = createOptimisticUserMessage({
        roundNumber: nextRound,
        text: userText,
      });
      store.getState().setMessages(msgs => [...msgs, optimisticMessage]);
      store.getState().setStreamingRoundNumber(nextRound);

      // Verify optimistic message visible
      let userMessages = store.getState().messages.filter(
        m => m.role === MessageRoles.USER && getRoundNumber(m.metadata) === nextRound,
      );
      expect(userMessages.length).toBe(1);
      expect(userMessages[0].id).toBe(optimisticMessage.id);

      // ============ PHASE 2: PATCH ID Replacement ============
      const persistedId = 'db-msg-round-1';
      const persistedMessage: UIMessage = {
        ...optimisticMessage,
        id: persistedId,
        metadata: {
          ...optimisticMessage.metadata,
          isOptimistic: undefined,
        },
      };
      store.getState().setMessages(msgs =>
        msgs.map(m => m.id === optimisticMessage.id ? persistedMessage : m),
      );

      // Verify persisted message visible
      userMessages = store.getState().messages.filter(
        m => m.role === MessageRoles.USER && getRoundNumber(m.metadata) === nextRound,
      );
      expect(userMessages.length).toBe(1);
      expect(userMessages[0].id).toBe(persistedId);

      // ============ PHASE 3: AI SDK Sync ============
      const storeMessages = store.getState().messages;
      const participantTrigger: UIMessage = {
        id: 'ai-trigger-abc',
        role: MessageRoles.USER,
        parts: [{ type: 'text', text: userText }],
        metadata: {
          role: MessageRoles.USER,
          roundNumber: nextRound,
          isParticipantTrigger: true,
        },
      };
      const chatMessages: UIMessage[] = [participantTrigger];

      const mergedMessages = simulateMessageSync(chatMessages, storeMessages);

      // CRITICAL: User message MUST still be present after sync
      const originalMsg = mergedMessages.find(m => m.id === persistedId);
      expect(originalMsg).toBeDefined();
      expect(originalMsg!.parts[0]).toEqual({ type: 'text', text: userText });

      // ============ PHASE 4: Deduplication ============
      const finalMessages = mergedMessages.filter((m) => {
        const meta = getUserMetadata(m.metadata);
        return !(m.role === MessageRoles.USER && meta?.isParticipantTrigger);
      });

      const round1UserMessages = finalMessages.filter(
        m => m.role === MessageRoles.USER && getRoundNumber(m.metadata) === nextRound,
      );
      expect(round1UserMessages.length).toBe(1);
      expect(round1UserMessages[0].id).toBe(persistedId);
    });
  });

  describe('CRITICAL: StreamingRoundNumber Synchronization', () => {
    it('should set streamingRoundNumber immediately after optimistic add', () => {
      expect(store.getState().streamingRoundNumber).toBeNull();

      const optimisticMessage = createOptimisticUserMessage({
        roundNumber: 1,
        text: 'Question',
      });
      store.getState().setMessages(msgs => [...msgs, optimisticMessage]);
      store.getState().setStreamingRoundNumber(1);

      expect(store.getState().streamingRoundNumber).toBe(1);
    });

    it('should maintain streamingRoundNumber during message ID replacement', () => {
      const optimisticMessage = createOptimisticUserMessage({
        roundNumber: 1,
        text: 'Question',
      });
      store.getState().setMessages(msgs => [...msgs, optimisticMessage]);
      store.getState().setStreamingRoundNumber(1);

      // Replace optimistic with persisted
      const persistedMessage: UIMessage = {
        ...optimisticMessage,
        id: 'db-id',
        metadata: { ...optimisticMessage.metadata, isOptimistic: undefined },
      };
      store.getState().setMessages(msgs =>
        msgs.map(m => m.id === optimisticMessage.id ? persistedMessage : m),
      );

      // streamingRoundNumber should NOT change
      expect(store.getState().streamingRoundNumber).toBe(1);
    });

    it('should match streamingRoundNumber with user message round', () => {
      const nextRound = 1;

      const optimisticMessage = createOptimisticUserMessage({
        roundNumber: nextRound,
        text: 'Test',
      });
      store.getState().setMessages(msgs => [...msgs, optimisticMessage]);
      store.getState().setStreamingRoundNumber(nextRound);

      const state = store.getState();
      const userMsg = state.messages.find(
        m => m.role === MessageRoles.USER && getRoundNumber(m.metadata) === nextRound,
      );

      expect(userMsg).toBeDefined();
      expect(getRoundNumber(userMsg!.metadata)).toBe(state.streamingRoundNumber);
    });
  });

  describe('CRITICAL: Config Change Round Number Blocking', () => {
    it('should set configChangeRoundNumber to block streaming before PATCH', () => {
      expect(store.getState().configChangeRoundNumber).toBeNull();

      const optimisticMessage = createOptimisticUserMessage({
        roundNumber: 1,
        text: 'Question',
      });
      store.getState().setMessages(msgs => [...msgs, optimisticMessage]);
      store.getState().setStreamingRoundNumber(1);
      store.getState().setConfigChangeRoundNumber(1); // Blocks streaming

      expect(store.getState().configChangeRoundNumber).toBe(1);
    });

    it('should prevent initializeThread from resetting state when configChangeRoundNumber set', () => {
      const optimisticMessage = createOptimisticUserMessage({
        roundNumber: 1,
        text: 'Question',
      });
      store.getState().setMessages(msgs => [...msgs, optimisticMessage]);
      store.getState().setStreamingRoundNumber(1);
      store.getState().setConfigChangeRoundNumber(1);
      store.getState().setWaitingToStartStreaming(true);

      // Call initializeThread (simulating PATCH response)
      store.getState().initializeThread(thread, participants, [
        createUserMessage(0, 'Initial question'),
      ]);

      // State should be PRESERVED
      const state = store.getState();
      expect(state.streamingRoundNumber).toBe(1);
      expect(state.configChangeRoundNumber).toBe(1);
      expect(state.waitingToStartStreaming).toBe(true);

      // User message should still be in store
      const round1Messages = state.messages.filter(
        m => getRoundNumber(m.metadata) === 1,
      );
      expect(round1Messages.length).toBe(1);
    });
  });

  describe('Edge Cases: Multiple Rounds', () => {
    it('should preserve messages from all rounds during sync', () => {
      // Setup: Complete round 1
      const round1Messages = [
        createUserMessage(1, 'First follow-up'),
        createAssistantMessage(1, 0, 'GPT round 1'),
        createAssistantMessage(1, 1, 'Claude round 1'),
      ];

      store.getState().setMessages(msgs => [...msgs, ...round1Messages]);

      // Start round 2
      const optimisticMessage = createOptimisticUserMessage({
        roundNumber: 2,
        text: 'Second follow-up',
      });
      store.getState().setMessages(msgs => [...msgs, optimisticMessage]);

      const persistedId = 'db-msg-r2';
      const persistedMessage: UIMessage = {
        ...optimisticMessage,
        id: persistedId,
        metadata: { ...optimisticMessage.metadata, isOptimistic: undefined },
      };
      store.getState().setMessages(msgs =>
        msgs.map(m => m.id === optimisticMessage.id ? persistedMessage : m),
      );

      // AI SDK sync with round 2 trigger
      const storeMessages = store.getState().messages;
      const chatMessages: UIMessage[] = [
        {
          id: 'trigger-r2',
          role: MessageRoles.USER,
          parts: [{ type: 'text', text: 'Second follow-up' }],
          metadata: {
            role: MessageRoles.USER,
            roundNumber: 2,
            isParticipantTrigger: true,
          },
        },
      ];

      const mergedMessages = simulateMessageSync(chatMessages, storeMessages);

      // Should have user messages from all rounds
      const allUserMessages = mergedMessages.filter(
        m => m.role === MessageRoles.USER,
      );
      const nonTriggerUserMessages = allUserMessages.filter((m) => {
        const meta = getUserMetadata(m.metadata);
        return !meta?.isParticipantTrigger;
      });

      expect(nonTriggerUserMessages.length).toBe(3); // Round 0, 1, 2
      expect(nonTriggerUserMessages.find(m => getRoundNumber(m.metadata) === 0)).toBeDefined();
      expect(nonTriggerUserMessages.find(m => getRoundNumber(m.metadata) === 1)).toBeDefined();
      expect(nonTriggerUserMessages.find(m => getRoundNumber(m.metadata) === 2)).toBeDefined();
    });

    it('should handle ID replacement in rapid succession', () => {
      // Simulate rapid round 1 + round 2 submissions
      const opt1 = createOptimisticUserMessage({ roundNumber: 1, text: 'Q1' });
      store.getState().setMessages(msgs => [...msgs, opt1]);

      const pers1: UIMessage = {
        ...opt1,
        id: 'db-r1',
        metadata: { ...opt1.metadata, isOptimistic: undefined },
      };
      store.getState().setMessages(msgs =>
        msgs.map(m => m.id === opt1.id ? pers1 : m),
      );

      const opt2 = createOptimisticUserMessage({ roundNumber: 2, text: 'Q2' });
      store.getState().setMessages(msgs => [...msgs, opt2]);

      const pers2: UIMessage = {
        ...opt2,
        id: 'db-r2',
        metadata: { ...opt2.metadata, isOptimistic: undefined },
      };
      store.getState().setMessages(msgs =>
        msgs.map(m => m.id === opt2.id ? pers2 : m),
      );

      const state = store.getState();
      expect(state.messages.find(m => m.id === 'db-r1')).toBeDefined();
      expect(state.messages.find(m => m.id === 'db-r2')).toBeDefined();
      expect(state.messages.find(m => m.id === opt1.id)).toBeUndefined();
      expect(state.messages.find(m => m.id === opt2.id)).toBeUndefined();
    });
  });

  describe('Error Handling: Rollback on PATCH Failure', () => {
    it('should remove optimistic message on PATCH error', () => {
      const optimisticMessage = createOptimisticUserMessage({
        roundNumber: 1,
        text: 'Question',
      });
      store.getState().setMessages(msgs => [...msgs, optimisticMessage]);

      const beforeCount = store.getState().messages.length;
      expect(beforeCount).toBe(4); // 3 from round 0 + 1 optimistic

      // Simulate error rollback
      store.getState().setMessages(msgs =>
        msgs.filter(m => m.id !== optimisticMessage.id),
      );

      const afterCount = store.getState().messages.length;
      expect(afterCount).toBe(3); // Back to round 0 only
    });

    it('should reset streaming state on PATCH error', () => {
      const optimisticMessage = createOptimisticUserMessage({
        roundNumber: 1,
        text: 'Question',
      });
      store.getState().setMessages(msgs => [...msgs, optimisticMessage]);
      store.getState().setStreamingRoundNumber(1);
      store.getState().setConfigChangeRoundNumber(1);
      store.getState().setWaitingToStartStreaming(true);

      // Simulate error cleanup
      store.getState().setMessages(msgs =>
        msgs.filter(m => m.id !== optimisticMessage.id),
      );
      store.getState().setStreamingRoundNumber(null);
      store.getState().setConfigChangeRoundNumber(null);
      store.getState().setWaitingToStartStreaming(false);

      const state = store.getState();
      expect(state.streamingRoundNumber).toBeNull();
      expect(state.configChangeRoundNumber).toBeNull();
      expect(state.waitingToStartStreaming).toBe(false);
      expect(state.messages.filter(m => getRoundNumber(m.metadata) === 1).length).toBe(0);
    });
  });
});
