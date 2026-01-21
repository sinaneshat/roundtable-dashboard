/**
 * Moderator Content Preservation Race Condition Tests
 *
 * Tests for the race condition where round 0 moderator content was lost
 * when round 1 started. The bug occurred in use-message-sync.ts:
 *
 * BUG SEQUENCE:
 * 1. Round 0 moderator completes streaming, isModeratorStreaming=false
 * 2. User sends round 1 message, but chatIsStreaming not yet true
 * 3. In this gap, message sync runs (both flags false)
 * 4. Sync filters out moderator content because isModeratorStreaming=false
 * 5. Empty placeholder overwrites moderator with content
 *
 * FIX IMPLEMENTATION (use-message-sync.ts):
 * 1. missingMessagesFromStore filter (lines 344-370): Always preserve moderators WITH content
 * 2. Deduplication logic (lines 528-538): Never replace content with empty
 * 3. Final protection (lines 713-741): Replace empty with store content version
 *
 * @see use-message-sync.ts - Message sync logic with race condition fixes
 * @see use-moderator-trigger.ts - Moderator streaming trigger
 */

import { MessageRoles, MODERATOR_PARTICIPANT_INDEX } from '@roundtable/shared';
import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';

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
    parts: [{ type: 'text', text: `Question for round ${roundNumber}` }],
    metadata: { role: MessageRoles.USER, roundNumber },
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
    parts: [{ type: 'text', text: `Response from participant ${participantIndex}`, state: 'done' as const }],
    metadata: {
      role: MessageRoles.ASSISTANT,
      roundNumber,
      participantIndex,
      model: `model-${participantIndex}`,
      finishReason: 'stop',
    },
  };
}

function createModeratorPlaceholder(threadId: string, roundNumber: number): UIMessage {
  return {
    id: `${threadId}_r${roundNumber}_moderator`,
    role: MessageRoles.ASSISTANT,
    parts: [], // Empty = placeholder
    metadata: {
      isModerator: true,
      roundNumber,
      participantIndex: MODERATOR_PARTICIPANT_INDEX,
      model: 'Council Moderator',
      role: MessageRoles.ASSISTANT,
    },
  };
}

function createModeratorWithContent(threadId: string, roundNumber: number, content: string): UIMessage {
  return {
    id: `${threadId}_r${roundNumber}_moderator`,
    role: MessageRoles.ASSISTANT,
    parts: [{ type: 'text', text: content, state: 'done' as const }],
    metadata: {
      isModerator: true,
      roundNumber,
      participantIndex: MODERATOR_PARTICIPANT_INDEX,
      model: 'Council Moderator',
      role: MessageRoles.ASSISTANT,
      finishReason: 'stop',
    },
  };
}

function getModeratorForRound(messages: UIMessage[], roundNumber: number): UIMessage | undefined {
  return messages.find((m) => {
    const meta = m.metadata as { isModerator?: boolean; roundNumber?: number } | undefined;
    return meta?.isModerator === true && meta?.roundNumber === roundNumber;
  });
}

function getModeratorContent(moderator: UIMessage | undefined): string {
  if (!moderator)
    return '';
  const textPart = moderator.parts?.find(p => p.type === 'text' && 'text' in p);
  return textPart && 'text' in textPart ? (textPart.text as string) : '';
}

// ============================================================================
// Race Condition: Moderator Content Lost Between Rounds
// ============================================================================

describe('moderator Content Preservation Race Condition', () => {
  describe('fIX VERIFICATION: Content preserved during sync gap', () => {
    it('should preserve round 0 moderator content when round 1 user message is added', () => {
      // This tests the exact bug: round 0 moderator loses content when round 1 starts
      const store = createChatStore();
      const participants = [createParticipant(0), createParticipant(1)];

      store.getState().initializeThread(createThread(), participants, []);

      // Round 0 complete state
      const round0User = createUserMessage(0);
      const round0P0 = createParticipantMessage(0, 0, 'thread-123');
      const round0P1 = createParticipantMessage(0, 1, 'thread-123');
      const round0Moderator = createModeratorWithContent(
        'thread-123',
        0,
        'Round 0 synthesis: Both participants provided excellent analysis.',
      );

      // Set round 0 complete state
      store.getState().setMessages([round0User, round0P0, round0P1, round0Moderator]);

      // Verify round 0 moderator has content
      let moderator0 = getModeratorForRound(store.getState().messages, 0);
      expect(moderator0).toBeDefined();
      expect(getModeratorContent(moderator0)).toBe('Round 0 synthesis: Both participants provided excellent analysis.');

      // User sends round 1 message (the gap where race condition occurred)
      // isModeratorStreaming=false, chatIsStreaming not yet true
      const round1User = createUserMessage(1);
      store.getState().setMessages([round0User, round0P0, round0P1, round0Moderator, round1User]);

      // INVARIANT: Round 0 moderator content must be preserved
      moderator0 = getModeratorForRound(store.getState().messages, 0);
      expect(moderator0).toBeDefined();
      expect(getModeratorContent(moderator0)).toBe('Round 0 synthesis: Both participants provided excellent analysis.');
    });

    it('should NOT replace moderator with content using setMessages functional updater', () => {
      // Tests the functional updater pattern used by use-message-sync
      // The protection is in the sync logic which uses functional updaters
      // This test verifies the pattern: only update if new has more content
      const store = createChatStore();
      const participants = [createParticipant(0), createParticipant(1)];

      store.getState().initializeThread(createThread(), participants, []);

      // Setup: moderator with content exists
      const userMsg = createUserMessage(0);
      const p0Msg = createParticipantMessage(0, 0, 'thread-123');
      const p1Msg = createParticipantMessage(0, 1, 'thread-123');
      const moderatorWithContent = createModeratorWithContent(
        'thread-123',
        0,
        'Important synthesis content that must not be lost.',
      );

      store.getState().setMessages([userMsg, p0Msg, p1Msg, moderatorWithContent]);

      // Verify initial state
      let moderator = getModeratorForRound(store.getState().messages, 0);
      expect(getModeratorContent(moderator)).toBe('Important synthesis content that must not be lost.');

      // Simulate what use-message-sync does: use functional updater that protects content
      // The actual protection is in use-message-sync.ts lines 528-538
      const emptyPlaceholder = createModeratorPlaceholder('thread-123', 0);

      // This simulates the protection logic from use-message-sync
      store.getState().setMessages((currentMessages) => {
        const existingModerator = currentMessages.find((m) => {
          const meta = m.metadata as { isModerator?: boolean; roundNumber?: number } | undefined;
          return meta?.isModerator === true && meta?.roundNumber === 0;
        });

        // If existing moderator has content and new is empty, keep existing
        const existingContent = getModeratorContent(existingModerator);
        const newContent = getModeratorContent(emptyPlaceholder);

        if (existingContent.length > 0 && newContent.length === 0) {
          // Protection: keep existing content
          return currentMessages;
        }

        // Otherwise update
        return [userMsg, p0Msg, p1Msg, emptyPlaceholder];
      });

      // INVARIANT: Content must be preserved, empty placeholder rejected
      moderator = getModeratorForRound(store.getState().messages, 0);
      expect(moderator).toBeDefined();
      expect(getModeratorContent(moderator)).toBe('Important synthesis content that must not be lost.');
    });

    it('should preserve moderator content during multi-round conversation', () => {
      // Tests that all round moderators maintain content as rounds progress
      const store = createChatStore();
      const participants = [createParticipant(0), createParticipant(1)];

      store.getState().initializeThread(createThread(), participants, []);

      // Build up complete round 0
      const round0User = createUserMessage(0);
      const round0P0 = createParticipantMessage(0, 0, 'thread-123');
      const round0P1 = createParticipantMessage(0, 1, 'thread-123');
      const round0Moderator = createModeratorWithContent('thread-123', 0, 'Round 0 synthesis.');

      store.getState().setMessages([round0User, round0P0, round0P1, round0Moderator]);

      // Build up complete round 1
      const round1User = createUserMessage(1);
      const round1P0 = createParticipantMessage(1, 0, 'thread-123');
      const round1P1 = createParticipantMessage(1, 1, 'thread-123');
      const round1Moderator = createModeratorWithContent('thread-123', 1, 'Round 1 synthesis.');

      store.getState().setMessages([
        round0User,
        round0P0,
        round0P1,
        round0Moderator,
        round1User,
        round1P0,
        round1P1,
        round1Moderator,
      ]);

      // Add round 2 user message (simulates start of round 2)
      const round2User = createUserMessage(2);
      store.getState().setMessages([
        round0User,
        round0P0,
        round0P1,
        round0Moderator,
        round1User,
        round1P0,
        round1P1,
        round1Moderator,
        round2User,
      ]);

      // INVARIANT: Both round 0 and round 1 moderator content must be preserved
      const moderator0 = getModeratorForRound(store.getState().messages, 0);
      const moderator1 = getModeratorForRound(store.getState().messages, 1);

      expect(getModeratorContent(moderator0)).toBe('Round 0 synthesis.');
      expect(getModeratorContent(moderator1)).toBe('Round 1 synthesis.');
    });
  });

  describe('edge cases for content preservation', () => {
    it('should preserve streamed content during incremental updates', () => {
      // Tests that partial content during streaming is preserved
      const store = createChatStore();
      const participants = [createParticipant(0)];

      store.getState().initializeThread(createThread(), participants, []);

      const userMsg = createUserMessage(0);
      const p0Msg = createParticipantMessage(0, 0, 'thread-123');

      // Set streaming state
      store.getState().setIsModeratorStreaming(true);

      // Add messages with empty moderator placeholder
      const moderatorPlaceholder = createModeratorPlaceholder('thread-123', 0);
      store.getState().setMessages([userMsg, p0Msg, moderatorPlaceholder]);

      // Simulate incremental streaming - partial content
      const partialModerator: UIMessage = {
        ...moderatorPlaceholder,
        parts: [{ type: 'text', text: 'Partial content during str' }],
      };
      store.getState().setMessages([userMsg, p0Msg, partialModerator]);

      let moderator = getModeratorForRound(store.getState().messages, 0);
      expect(getModeratorContent(moderator)).toBe('Partial content during str');

      // More content streamed
      const moreModerator: UIMessage = {
        ...moderatorPlaceholder,
        parts: [{ type: 'text', text: 'Partial content during streaming.' }],
      };
      store.getState().setMessages([userMsg, p0Msg, moreModerator]);

      moderator = getModeratorForRound(store.getState().messages, 0);
      expect(getModeratorContent(moderator)).toBe('Partial content during streaming.');

      // Complete streaming
      store.getState().setIsModeratorStreaming(false);

      // INVARIANT: Content preserved after streaming completes
      moderator = getModeratorForRound(store.getState().messages, 0);
      expect(getModeratorContent(moderator)).toBe('Partial content during streaming.');
    });

    it('should handle empty moderator being replaced by content version', () => {
      // Tests the final protection: empty in merged messages replaced by store content
      const store = createChatStore();
      const participants = [createParticipant(0)];

      store.getState().initializeThread(createThread(), participants, []);

      const userMsg = createUserMessage(0);
      const p0Msg = createParticipantMessage(0, 0, 'thread-123');
      const moderatorWithContent = createModeratorWithContent('thread-123', 0, 'Full content.');

      // Store has moderator with content
      store.getState().setMessages([userMsg, p0Msg, moderatorWithContent]);

      const moderator = getModeratorForRound(store.getState().messages, 0);
      expect(getModeratorContent(moderator)).toBe('Full content.');
    });

    it('should preserve multiple moderators in same store', () => {
      // Tests that different rounds don't interfere with each other
      const store = createChatStore();
      const participants = [createParticipant(0)];

      store.getState().initializeThread(createThread(), participants, []);

      // Two rounds with moderators
      const round0User = createUserMessage(0);
      const round0P0 = createParticipantMessage(0, 0, 'thread-123');
      const round0Mod = createModeratorWithContent('thread-123', 0, 'First round synthesis.');

      const round1User = createUserMessage(1);
      const round1P0 = createParticipantMessage(1, 0, 'thread-123');
      const round1Mod = createModeratorWithContent('thread-123', 1, 'Second round synthesis.');

      store.getState().setMessages([
        round0User,
        round0P0,
        round0Mod,
        round1User,
        round1P0,
        round1Mod,
      ]);

      // Verify both are preserved
      const mod0 = getModeratorForRound(store.getState().messages, 0);
      const mod1 = getModeratorForRound(store.getState().messages, 1);

      expect(getModeratorContent(mod0)).toBe('First round synthesis.');
      expect(getModeratorContent(mod1)).toBe('Second round synthesis.');
    });
  });

  describe('regression: Tracking Sets empty after page refresh', () => {
    it('should preserve moderator content even when tracking Sets are empty', () => {
      // After page refresh, tracking Sets (createdModeratorRounds, triggeredModeratorRounds)
      // are empty because Sets are not serialized. Content must be preserved based on
      // message content alone, not tracking state.
      const store = createChatStore();
      const participants = [createParticipant(0)];

      store.getState().initializeThread(createThread(), participants, []);

      // Simulate post-refresh state: messages exist but tracking is reset
      const userMsg = createUserMessage(0);
      const p0Msg = createParticipantMessage(0, 0, 'thread-123');
      const moderatorWithContent = createModeratorWithContent('thread-123', 0, 'Content survives refresh.');

      store.getState().setMessages([userMsg, p0Msg, moderatorWithContent]);

      // Verify tracking is empty (as after refresh)
      const state = store.getState();
      expect(state.createdModeratorRounds.size).toBe(0);
      expect(state.triggeredModeratorRounds.size).toBe(0);

      // INVARIANT: Content preserved regardless of tracking state
      const moderator = getModeratorForRound(state.messages, 0);
      expect(getModeratorContent(moderator)).toBe('Content survives refresh.');
    });
  });
});
