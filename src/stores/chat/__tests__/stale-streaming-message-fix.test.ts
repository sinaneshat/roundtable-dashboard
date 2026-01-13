/**
 * Stale Streaming Message Fix Tests
 *
 * Tests for the initializeThread fix that prefers DB messages over
 * stale store messages with streaming parts.
 *
 * Bug Context:
 * - After page refresh, Zustand persist may have stale messages with `state: 'streaming'` parts
 * - Fresh DB messages have complete data with `finishReason: 'stop'`
 * - The old logic would prefer store messages if round count was same/higher
 * - This caused useIncompleteRoundResumption to re-trigger completed rounds
 *
 * Fix:
 * - initializeThread now checks if store messages have stale streaming parts
 * - If stale streaming parts exist and DB has messages, prefer DB messages
 */

import { describe, expect, it } from 'vitest';

import { FinishReasons, MessagePartTypes, TextPartStates } from '@/api/core/enums';
import {
  createMockParticipant,
  createMockThread,
  createTestAssistantMessage,
  createTestModeratorMessage,
  createTestUserMessage,
} from '@/lib/testing';

import { createChatStore } from '../store';

describe('initializeThread - Stale Streaming Message Fix', () => {
  describe('when store has stale streaming parts', () => {
    it('prefers fresh DB messages over store messages with streaming parts', () => {
      const store = createChatStore();
      const thread = createMockThread();
      const participants = [
        createMockParticipant({ id: 'p1', priority: 0 }),
        createMockParticipant({ id: 'p2', priority: 1 }),
      ];

      // Setup: Store has messages with stale streaming parts (from interrupted session)
      const storeUserMessage = createTestUserMessage({
        id: 'user-msg-1',
        content: 'Hello',
        roundNumber: 0,
      });

      // Create assistant message with streaming parts (stale state)
      const staleAssistantMessage = {
        ...createTestAssistantMessage({
          id: 'assistant-msg-1',
          content: 'Partial response...',
          roundNumber: 0,
          participantId: 'p1',
          participantIndex: 0,
        }),
        // Override parts to have streaming state
        parts: [
          {
            type: MessagePartTypes.TEXT as const,
            text: 'Partial response...',
            state: TextPartStates.STREAMING, // Stale streaming state
          },
        ],
      };

      // Set store state with stale messages
      store.getState().setMessages([storeUserMessage, staleAssistantMessage]);
      store.getState().setThread(thread);

      // Fresh DB messages have complete data
      const dbUserMessage = createTestUserMessage({
        id: 'user-msg-1',
        content: 'Hello',
        roundNumber: 0,
      });

      const dbAssistantMessage = createTestAssistantMessage({
        id: 'assistant-msg-1',
        content: 'Complete response from participant 1',
        roundNumber: 0,
        participantId: 'p1',
        participantIndex: 0,
        finishReason: FinishReasons.STOP, // Complete
      });

      // Act: Initialize thread with fresh DB messages
      store.getState().initializeThread(thread, participants, [dbUserMessage, dbAssistantMessage]);

      // Assert: Store should use DB messages (no streaming parts)
      const messages = store.getState().messages;
      expect(messages).toHaveLength(2);

      // Verify assistant message has no streaming parts
      const assistantMsg = messages.find(m => m.id === 'assistant-msg-1');
      expect(assistantMsg).toBeDefined();

      const hasStreamingParts = assistantMsg?.parts?.some(
        p => 'state' in p && p.state === TextPartStates.STREAMING,
      );
      expect(hasStreamingParts).toBe(false);

      // Verify content is from DB (complete response)
      const textPart = assistantMsg?.parts?.find(p => p.type === MessagePartTypes.TEXT);
      expect(textPart).toBeDefined();
      expect(textPart).toHaveProperty('text', 'Complete response from participant 1');
    });

    it('handles multiple rounds with stale streaming in later round', () => {
      const store = createChatStore();
      const thread = createMockThread();
      const participants = [
        createMockParticipant({ id: 'p1', priority: 0 }),
      ];

      // Setup: Store has round 0 complete and round 1 with stale streaming
      const storeMessages = [
        createTestUserMessage({ id: 'user-0', content: 'Round 0', roundNumber: 0 }),
        createTestAssistantMessage({
          id: 'assistant-0',
          content: 'Complete round 0',
          roundNumber: 0,
          participantId: 'p1',
          participantIndex: 0,
        }),
        createTestModeratorMessage({
          id: 'moderator-0',
          content: 'Moderator round 0',
          roundNumber: 0,
        }),
        createTestUserMessage({ id: 'user-1', content: 'Round 1', roundNumber: 1 }),
        {
          ...createTestAssistantMessage({
            id: 'assistant-1',
            content: 'Partial...',
            roundNumber: 1,
            participantId: 'p1',
            participantIndex: 0,
          }),
          parts: [{ type: MessagePartTypes.TEXT as const, text: 'Partial...', state: TextPartStates.STREAMING }],
        },
      ];

      store.getState().setMessages(storeMessages);
      store.getState().setThread(thread);

      // Fresh DB has both rounds complete
      const dbMessages = [
        createTestUserMessage({ id: 'user-0', content: 'Round 0', roundNumber: 0 }),
        createTestAssistantMessage({
          id: 'assistant-0',
          content: 'Complete round 0',
          roundNumber: 0,
          participantId: 'p1',
          participantIndex: 0,
        }),
        createTestModeratorMessage({
          id: 'moderator-0',
          content: 'Moderator round 0',
          roundNumber: 0,
        }),
        createTestUserMessage({ id: 'user-1', content: 'Round 1', roundNumber: 1 }),
        createTestAssistantMessage({
          id: 'assistant-1',
          content: 'Complete round 1',
          roundNumber: 1,
          participantId: 'p1',
          participantIndex: 0,
          finishReason: FinishReasons.STOP,
        }),
        createTestModeratorMessage({
          id: 'moderator-1',
          content: 'Moderator round 1',
          roundNumber: 1,
        }),
      ];

      // Act
      store.getState().initializeThread(thread, participants, dbMessages);

      // Assert: Should use DB messages (6 messages including moderators)
      const messages = store.getState().messages;
      expect(messages).toHaveLength(6);

      // Verify round 1 assistant has no streaming parts
      const round1Assistant = messages.find(m => m.id === 'assistant-1');
      const hasStreaming = round1Assistant?.parts?.some(
        p => 'state' in p && p.state === TextPartStates.STREAMING,
      );
      expect(hasStreaming).toBe(false);
    });
  });

  describe('when store has no streaming parts', () => {
    it('uses original logic - prefers store when round count is higher', () => {
      const store = createChatStore();
      const thread = createMockThread();
      const participants = [createMockParticipant({ id: 'p1', priority: 0 })];

      // Store has round 0 and round 1 (no streaming parts)
      const storeMessages = [
        createTestUserMessage({ id: 'user-0', content: 'Round 0', roundNumber: 0 }),
        createTestAssistantMessage({
          id: 'assistant-0',
          content: 'Complete round 0',
          roundNumber: 0,
          participantId: 'p1',
          participantIndex: 0,
        }),
        createTestUserMessage({ id: 'user-1', content: 'Round 1', roundNumber: 1 }),
        createTestAssistantMessage({
          id: 'assistant-1',
          content: 'Complete round 1',
          roundNumber: 1,
          participantId: 'p1',
          participantIndex: 0,
        }),
      ];

      store.getState().setMessages(storeMessages);
      store.getState().setThread(thread);

      // DB only has round 0 (stale)
      const dbMessages = [
        createTestUserMessage({ id: 'user-0', content: 'Round 0', roundNumber: 0 }),
        createTestAssistantMessage({
          id: 'assistant-0',
          content: 'Complete round 0',
          roundNumber: 0,
          participantId: 'p1',
          participantIndex: 0,
        }),
      ];

      // Act
      store.getState().initializeThread(thread, participants, dbMessages);

      // Assert: Should use store messages (4 messages - has more recent data)
      expect(store.getState().messages).toHaveLength(4);
    });

    it('prefers DB messages when DB has more recent round', () => {
      const store = createChatStore();
      const thread = createMockThread();
      const participants = [createMockParticipant({ id: 'p1', priority: 0 })];

      // Store only has round 0
      const storeMessages = [
        createTestUserMessage({ id: 'user-0', content: 'Round 0', roundNumber: 0 }),
        createTestAssistantMessage({
          id: 'assistant-0',
          content: 'Store round 0',
          roundNumber: 0,
          participantId: 'p1',
          participantIndex: 0,
        }),
      ];

      store.getState().setMessages(storeMessages);
      store.getState().setThread(thread);

      // DB has round 0 and round 1
      const dbMessages = [
        createTestUserMessage({ id: 'user-0', content: 'Round 0', roundNumber: 0 }),
        createTestAssistantMessage({
          id: 'assistant-0',
          content: 'DB round 0',
          roundNumber: 0,
          participantId: 'p1',
          participantIndex: 0,
        }),
        createTestUserMessage({ id: 'user-1', content: 'Round 1', roundNumber: 1 }),
        createTestAssistantMessage({
          id: 'assistant-1',
          content: 'DB round 1',
          roundNumber: 1,
          participantId: 'p1',
          participantIndex: 0,
        }),
      ];

      // Act
      store.getState().initializeThread(thread, participants, dbMessages);

      // Assert: Should use DB messages (4 messages - higher round)
      expect(store.getState().messages).toHaveLength(4);
    });
  });

  describe('edge cases', () => {
    it('handles empty DB messages by keeping store messages', () => {
      const store = createChatStore();
      const thread = createMockThread();
      const participants = [createMockParticipant({ id: 'p1', priority: 0 })];

      // Store has messages (even with streaming)
      const storeMessages = [
        createTestUserMessage({ id: 'user-0', content: 'Hello', roundNumber: 0 }),
        {
          ...createTestAssistantMessage({
            id: 'assistant-0',
            content: 'Partial',
            roundNumber: 0,
            participantId: 'p1',
            participantIndex: 0,
          }),
          parts: [{ type: MessagePartTypes.TEXT as const, text: 'Partial', state: TextPartStates.STREAMING }],
        },
      ];

      store.getState().setMessages(storeMessages);
      store.getState().setThread(thread);

      // Act: Initialize with empty DB messages
      store.getState().initializeThread(thread, participants, []);

      // Assert: Should use store messages (can't prefer empty)
      expect(store.getState().messages).toHaveLength(2);
    });

    it('handles different thread - always uses DB messages', () => {
      const store = createChatStore();
      const oldThread = createMockThread({ id: 'old-thread' });
      const newThread = createMockThread({ id: 'new-thread' });
      const participants = [createMockParticipant({ id: 'p1', priority: 0 })];

      // Store has messages for old thread
      const storeMessages = [
        createTestUserMessage({ id: 'user-old', content: 'Old thread', roundNumber: 0 }),
      ];

      store.getState().setMessages(storeMessages);
      store.getState().setThread(oldThread);

      // DB has messages for new thread
      const dbMessages = [
        createTestUserMessage({ id: 'user-new', content: 'New thread', roundNumber: 0 }),
      ];

      // Act: Initialize with different thread
      store.getState().initializeThread(newThread, participants, dbMessages);

      // Assert: Should use DB messages (different thread)
      const messages = store.getState().messages;
      expect(messages).toHaveLength(1);
      expect(messages[0]?.id).toBe('user-new');
    });
  });
});
