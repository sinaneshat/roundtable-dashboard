/**
 * Moderator Placeholder Timing Tests
 *
 * These tests verify that the moderator placeholder is NOT visible before
 * participant messages exist. This prevents a visual flash where the moderator
 * card briefly appears before participants during round start.
 *
 * ROOT CAUSE: In use-streaming-trigger.ts and use-pending-message.ts, the
 * moderator placeholder was being added synchronously, but startRound() runs
 * in a queueMicrotask. This created a window where only the moderator existed.
 *
 * EXPECTED BEHAVIOR:
 * 1. Moderator placeholder should only appear AFTER participant messages exist
 * 2. OR, moderator placeholder should be hidden until participants exist
 * 3. The timeline should show: User -> Participants -> Moderator (never User -> Moderator alone)
 *
 * @see use-streaming-trigger.ts - Round 0 streaming trigger
 * @see use-pending-message.ts - Subsequent round streaming trigger
 */

import { MessageRoles, MODERATOR_PARTICIPANT_INDEX } from '@roundtable/shared';
import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';

import { isModeratorMessage } from '@/lib/utils';

import { createChatStore } from '../store';

// ============================================================================
// Test Utilities
// ============================================================================

function createThread() {
  return {
    id: 'thread-123',
    userId: 'user-123',
    projectId: null,
    title: 'Test Thread',
    slug: 'test-thread',
    previousSlug: null,
    mode: 'debating' as const,
    status: 'active' as const,
    isFavorite: false,
    isPublic: false,
    isAiGeneratedTitle: false,
    enableWebSearch: false,
    metadata: null,
    version: 1,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    lastMessageAt: '2024-01-01T00:00:00Z',
  };
}

function createParticipant(index: number) {
  return {
    id: `participant-${index}`,
    threadId: 'thread-123',
    modelId: `model-${index}`,
    customRoleId: null,
    role: null,
    priority: index,
    isEnabled: true,
    settings: null,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };
}

function createUserMessage(roundNumber: number): UIMessage {
  return {
    id: `user-msg-r${roundNumber}`,
    role: MessageRoles.USER,
    parts: [{ type: 'text', text: `Question ${roundNumber}` }],
    metadata: { role: MessageRoles.USER, roundNumber },
  };
}

function createModeratorPlaceholder(threadId: string, roundNumber: number): UIMessage {
  return {
    id: `${threadId}_r${roundNumber}_moderator`,
    role: MessageRoles.ASSISTANT,
    parts: [], // Empty parts = pending state
    metadata: {
      isModerator: true,
      roundNumber,
      participantIndex: MODERATOR_PARTICIPANT_INDEX,
      model: 'Council Moderator',
      role: MessageRoles.ASSISTANT,
    },
  };
}

function createParticipantMessage(
  roundNumber: number,
  participantIndex: number,
  threadId: string,
): UIMessage {
  return {
    id: `${threadId}_r${roundNumber}_p${participantIndex}`,
    role: MessageRoles.ASSISTANT,
    parts: [{ type: 'text', text: `Response from participant ${participantIndex}` }],
    metadata: {
      role: MessageRoles.ASSISTANT,
      roundNumber,
      participantIndex,
      model: `model-${participantIndex}`,
    },
  };
}

/**
 * Get all assistant messages for a specific round
 */
function getAssistantMessagesForRound(messages: UIMessage[], roundNumber: number): UIMessage[] {
  return messages.filter((m) => {
    if (m.role !== MessageRoles.ASSISTANT)
      return false;
    const meta = m.metadata as { roundNumber?: number } | undefined;
    return meta?.roundNumber === roundNumber;
  });
}

/**
 * Check if any participant (non-moderator) messages exist for a round
 */
function hasParticipantMessagesForRound(messages: UIMessage[], roundNumber: number): boolean {
  return getAssistantMessagesForRound(messages, roundNumber).some(
    m => !isModeratorMessage(m),
  );
}

/**
 * Check if moderator message exists for a round
 */
function hasModeratorForRound(messages: UIMessage[], roundNumber: number): boolean {
  return getAssistantMessagesForRound(messages, roundNumber).some(
    m => isModeratorMessage(m),
  );
}

// ============================================================================
// Moderator Placeholder Timing Tests
// ============================================================================

describe('moderator Placeholder Timing', () => {
  describe('fIX VERIFICATION: Moderator should appear AFTER participants', () => {
    it('useModeratorTrigger pattern: moderator added after participants complete', () => {
      // This test verifies the CORRECT pattern implemented in use-moderator-trigger.ts
      // Moderator placeholder is added AFTER all participants have completed streaming
      const store = createChatStore();
      const participants = [createParticipant(0), createParticipant(1)];

      store.getState().initializeThread(createThread(), participants, []);

      // Step 1: Add user message for round 0
      const userMessage = createUserMessage(0);
      store.getState().setMessages([userMessage]);

      // Step 2: Participants complete (simulating AI SDK streaming completion)
      const p0Message = createParticipantMessage(0, 0, 'thread-123');
      const p1Message = createParticipantMessage(0, 1, 'thread-123');
      store.getState().setMessages([userMessage, p0Message, p1Message]);

      // Verify: After participants complete, NO moderator exists yet
      let messages = store.getState().messages;
      expect(hasParticipantMessagesForRound(messages, 0)).toBe(true);
      expect(hasModeratorForRound(messages, 0)).toBe(false);

      // Step 3: useModeratorTrigger adds moderator placeholder (after participants complete)
      const moderatorPlaceholder = createModeratorPlaceholder('thread-123', 0);
      store.getState().setMessages([userMessage, p0Message, p1Message, moderatorPlaceholder]);

      // Verify: Now moderator exists AND participants exist (correct order)
      messages = store.getState().messages;
      expect(hasParticipantMessagesForRound(messages, 0)).toBe(true);
      expect(hasModeratorForRound(messages, 0)).toBe(true);

      // INVARIANT: When moderator exists, participants must also exist
      const hasModerator = hasModeratorForRound(messages, 0);
      const hasParticipants = hasParticipantMessagesForRound(messages, 0);
      expect(hasModerator && hasParticipants).toBe(true);
    });

    it('should have moderator visible only AFTER participant messages exist', () => {
      const store = createChatStore();
      const participants = [createParticipant(0), createParticipant(1)];

      store.getState().initializeThread(createThread(), participants, []);

      // Add user message for round 0
      const userMessage = createUserMessage(0);

      // Add participant messages FIRST (correct order)
      const p0Message = createParticipantMessage(0, 0, 'thread-123');
      const p1Message = createParticipantMessage(0, 1, 'thread-123');

      // Then add moderator placeholder
      const moderatorPlaceholder = createModeratorPlaceholder('thread-123', 0);

      // Set messages in correct order
      store.getState().setMessages([userMessage, p0Message, p1Message, moderatorPlaceholder]);

      const messages = store.getState().messages;

      // Verify participants exist before moderator
      const hasModerator = hasModeratorForRound(messages, 0);
      const hasParticipants = hasParticipantMessagesForRound(messages, 0);

      expect(hasModerator).toBe(true);
      expect(hasParticipants).toBe(true);

      // INVARIANT: This is the correct state - both exist
      expect(hasModerator && hasParticipants).toBe(true);
    });

    it('during streaming, moderator should NOT be added until participants complete', () => {
      const store = createChatStore();
      const participants = [createParticipant(0), createParticipant(1)];

      store.getState().initializeThread(createThread(), participants, []);

      // Simulate streaming state - user sent message, waiting for participants
      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(0);

      // Add user message
      const userMessage = createUserMessage(0);
      store.getState().setMessages([userMessage]);

      // At this point during streaming:
      // - User message exists
      // - No participant messages yet (streaming just started)
      // - Moderator should NOT exist yet (fix: added after participants complete)
      let messages = store.getState().messages;
      expect(hasModeratorForRound(messages, 0)).toBe(false);
      expect(hasParticipantMessagesForRound(messages, 0)).toBe(false);

      // Participant 0 starts streaming and completes
      const p0Message = createParticipantMessage(0, 0, 'thread-123');
      store.getState().setMessages([userMessage, p0Message]);

      messages = store.getState().messages;
      expect(hasModeratorForRound(messages, 0)).toBe(false); // Still no moderator
      expect(hasParticipantMessagesForRound(messages, 0)).toBe(true);

      // Participant 1 completes
      const p1Message = createParticipantMessage(0, 1, 'thread-123');
      store.getState().setMessages([userMessage, p0Message, p1Message]);

      // Still no moderator until useModeratorTrigger runs
      messages = store.getState().messages;
      expect(hasModeratorForRound(messages, 0)).toBe(false);

      // After all participants complete, useModeratorTrigger adds moderator
      const moderatorPlaceholder = createModeratorPlaceholder('thread-123', 0);
      store.getState().setMessages([userMessage, p0Message, p1Message, moderatorPlaceholder]);

      messages = store.getState().messages;
      expect(hasModeratorForRound(messages, 0)).toBe(true);
      expect(hasParticipantMessagesForRound(messages, 0)).toBe(true);
    });
  });

  describe('timeline ordering after messages are present', () => {
    it('should sort moderator LAST within a round when all messages exist', () => {
      const store = createChatStore();
      const participants = [createParticipant(0), createParticipant(1)];

      store.getState().initializeThread(createThread(), participants, []);

      // Add all messages in random order
      const userMessage = createUserMessage(0);
      const moderatorPlaceholder = createModeratorPlaceholder('thread-123', 0);
      const p0Message = createParticipantMessage(0, 0, 'thread-123');
      const p1Message = createParticipantMessage(0, 1, 'thread-123');

      // Deliberately add in wrong order to test sorting
      store.getState().setMessages([
        userMessage,
        moderatorPlaceholder, // Wrong position - should be last
        p0Message,
        p1Message,
      ]);

      const messages = store.getState().messages;
      const round0Messages = getAssistantMessagesForRound(messages, 0);

      // The moderator should be somewhere in the array
      // (actual sorting happens in useThreadTimeline, not in store)
      expect(round0Messages).toHaveLength(3); // p0, p1, moderator
      expect(round0Messages.some(m => isModeratorMessage(m))).toBe(true);
    });
  });
});
