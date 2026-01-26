/**
 * Moderator Incremental Streaming Tests
 *
 * Tests for incremental store updates during moderator text streaming.
 * Verifies that the moderator message is updated progressively as text
 * chunks arrive, not all at once when streaming completes.
 *
 * Related fixes:
 * - use-moderator-trigger.ts: Update store on each text chunk
 * - useModeratorStream.ts: Already updates incrementally
 *
 * These tests verify:
 * 1. Store is updated incrementally during streaming
 * 2. Each text chunk appends to existing content
 * 3. Message parts are properly structured during streaming
 * 4. Final state has complete content with proper finish metadata
 */

import { MODERATOR_NAME, MODERATOR_PARTICIPANT_INDEX, UIMessageRoles } from '@roundtable/shared';
import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';

import { createChatStore } from '../store';

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create a moderator placeholder message (as added by use-streaming-trigger.ts)
 */
function createModeratorPlaceholder(threadId: string, roundNumber: number): UIMessage {
  return {
    id: `${threadId}_r${roundNumber}_moderator`,
    metadata: {
      isModerator: true,
      model: MODERATOR_NAME,
      participantIndex: MODERATOR_PARTICIPANT_INDEX,
      role: UIMessageRoles.ASSISTANT,
      roundNumber,
    },
    parts: [], // Empty parts = pending state
    role: UIMessageRoles.ASSISTANT,
  };
}

/**
 * Simulate incremental text updates (as done by use-moderator-trigger.ts)
 */
function simulateIncrementalUpdate(
  store: ReturnType<typeof createChatStore>,
  moderatorId: string,
  accumulatedText: string,
) {
  const currentMessages = store.getState().messages;
  const updatedMessages = currentMessages.map(msg =>
    msg.id === moderatorId
      ? {
          ...msg,
          parts: [{ text: accumulatedText, type: 'text' as const }],
        }
      : msg,
  );
  store.getState().setMessages(updatedMessages);
}

/**
 * Simulate final update with finish metadata
 */
function simulateFinalUpdate(
  store: ReturnType<typeof createChatStore>,
  moderatorId: string,
  finalText: string,
) {
  const currentMessages = store.getState().messages;
  const updatedMessages = currentMessages.map(msg =>
    msg.id === moderatorId
      ? {
          ...msg,
          metadata: {
            ...(msg.metadata && typeof msg.metadata === 'object' ? msg.metadata : {}),
            finishReason: 'stop',
          },
          parts: [{ state: 'done' as const, text: finalText, type: 'text' as const }],
        }
      : msg,
  );
  store.getState().setMessages(updatedMessages);
}

// ============================================================================
// Test Suites
// ============================================================================

describe('moderator Incremental Streaming Updates', () => {
  describe('placeholder Initialization', () => {
    it('starts with empty parts array for pending state', () => {
      const store = createChatStore();
      const placeholder = createModeratorPlaceholder('thread-1', 0);

      store.getState().setMessages([placeholder]);

      const messages = store.getState().messages;
      expect(messages).toHaveLength(1);
      expect(messages[0]?.parts).toEqual([]);
      expect(messages[0]?.metadata?.isModerator).toBeTruthy();
    });

    it('placeholder has correct moderator metadata', () => {
      const placeholder = createModeratorPlaceholder('thread-1', 0);

      expect(placeholder.metadata?.isModerator).toBeTruthy();
      expect(placeholder.metadata?.roundNumber).toBe(0);
      expect(placeholder.metadata?.participantIndex).toBe(MODERATOR_PARTICIPANT_INDEX);
      expect(placeholder.metadata?.model).toBe(MODERATOR_NAME);
    });
  });

  describe('incremental Text Updates', () => {
    it('updates message with each text chunk', () => {
      const store = createChatStore();
      const moderatorId = 'thread-1_r0_moderator';
      const placeholder = createModeratorPlaceholder('thread-1', 0);

      store.getState().setMessages([placeholder]);

      // First chunk arrives
      simulateIncrementalUpdate(store, moderatorId, 'The discussion');
      let messages = store.getState().messages;
      expect(messages[0]?.parts[0]?.text).toBe('The discussion');

      // Second chunk arrives (accumulated)
      simulateIncrementalUpdate(store, moderatorId, 'The discussion covered key');
      messages = store.getState().messages;
      expect(messages[0]?.parts[0]?.text).toBe('The discussion covered key');

      // Third chunk arrives (accumulated)
      simulateIncrementalUpdate(store, moderatorId, 'The discussion covered key topics.');
      messages = store.getState().messages;
      expect(messages[0]?.parts[0]?.text).toBe('The discussion covered key topics.');
    });

    it('preserves message metadata during updates', () => {
      const store = createChatStore();
      const moderatorId = 'thread-1_r0_moderator';
      const placeholder = createModeratorPlaceholder('thread-1', 0);

      store.getState().setMessages([placeholder]);

      simulateIncrementalUpdate(store, moderatorId, 'Test content');

      const messages = store.getState().messages;
      expect(messages[0]?.id).toBe(moderatorId);
      expect(messages[0]?.role).toBe(UIMessageRoles.ASSISTANT);
      expect(messages[0]?.metadata?.isModerator).toBeTruthy();
      expect(messages[0]?.metadata?.roundNumber).toBe(0);
    });

    it('does not duplicate messages during updates', () => {
      const store = createChatStore();
      const moderatorId = 'thread-1_r0_moderator';
      const placeholder = createModeratorPlaceholder('thread-1', 0);

      store.getState().setMessages([placeholder]);

      // Multiple updates should not create multiple messages
      simulateIncrementalUpdate(store, moderatorId, 'First');
      simulateIncrementalUpdate(store, moderatorId, 'First Second');
      simulateIncrementalUpdate(store, moderatorId, 'First Second Third');

      const messages = store.getState().messages;
      expect(messages).toHaveLength(1);
    });
  });

  describe('final State Transition', () => {
    it('adds finish metadata on completion', () => {
      const store = createChatStore();
      const moderatorId = 'thread-1_r0_moderator';
      const placeholder = createModeratorPlaceholder('thread-1', 0);

      store.getState().setMessages([placeholder]);

      // Streaming completes
      simulateFinalUpdate(store, moderatorId, 'Complete moderator text.');

      const messages = store.getState().messages;
      expect(messages[0]?.parts[0]?.state).toBe('done');
      expect(messages[0]?.metadata?.finishReason).toBe('stop');
    });

    it('preserves content on completion', () => {
      const store = createChatStore();
      const moderatorId = 'thread-1_r0_moderator';
      const placeholder = createModeratorPlaceholder('thread-1', 0);

      store.getState().setMessages([placeholder]);

      const finalText = 'This is the complete moderator analysis.';
      simulateFinalUpdate(store, moderatorId, finalText);

      const messages = store.getState().messages;
      expect(messages[0]?.parts[0]?.text).toBe(finalText);
    });
  });

  describe('multi-Message Scenarios', () => {
    it('updates only moderator message, preserving others', () => {
      const store = createChatStore();
      const moderatorId = 'thread-1_r0_moderator';

      // Setup: user message, participant messages, moderator placeholder
      const initialMessages: UIMessage[] = [
        {
          id: 'user-1',
          parts: [{ text: 'User question', type: 'text' }],
          role: UIMessageRoles.USER,
        },
        {
          id: 'thread-1_r0_p0',
          metadata: { participantIndex: 0, roundNumber: 0 },
          parts: [{ text: 'Participant 1 response', type: 'text' }],
          role: UIMessageRoles.ASSISTANT,
        },
        {
          id: 'thread-1_r0_p1',
          metadata: { participantIndex: 1, roundNumber: 0 },
          parts: [{ text: 'Participant 2 response', type: 'text' }],
          role: UIMessageRoles.ASSISTANT,
        },
        createModeratorPlaceholder('thread-1', 0),
      ];

      store.getState().setMessages(initialMessages);

      // Update moderator
      simulateIncrementalUpdate(store, moderatorId, 'Moderator analysis');

      const messages = store.getState().messages;
      expect(messages).toHaveLength(4);

      // Verify other messages unchanged
      expect(messages[0]?.parts[0]?.text).toBe('User question');
      expect(messages[1]?.parts[0]?.text).toBe('Participant 1 response');
      expect(messages[2]?.parts[0]?.text).toBe('Participant 2 response');

      // Verify moderator updated
      expect(messages[3]?.parts[0]?.text).toBe('Moderator analysis');
    });

    it('handles multi-round scenarios correctly', () => {
      const store = createChatStore();

      // Round 0 and Round 1 moderators
      const initialMessages: UIMessage[] = [
        createModeratorPlaceholder('thread-1', 0),
        createModeratorPlaceholder('thread-1', 1),
      ];

      store.getState().setMessages(initialMessages);

      // Update only round 1 moderator
      const round1ModeratorId = 'thread-1_r1_moderator';
      simulateIncrementalUpdate(store, round1ModeratorId, 'Round 1 analysis');

      const messages = store.getState().messages;

      // Round 0 should still be empty placeholder
      expect(messages[0]?.parts).toEqual([]);

      // Round 1 should have content
      expect(messages[1]?.parts[0]?.text).toBe('Round 1 analysis');
    });
  });
});

describe('moderator Streaming Race Condition Prevention', () => {
  describe('concurrent Update Handling', () => {
    it('handles rapid sequential updates without data loss', async () => {
      const store = createChatStore();
      const moderatorId = 'thread-1_r0_moderator';
      const placeholder = createModeratorPlaceholder('thread-1', 0);

      store.getState().setMessages([placeholder]);

      // Simulate rapid updates (like SSE chunks arriving quickly)
      const chunks = ['A', 'AB', 'ABC', 'ABCD', 'ABCDE'];

      for (const chunk of chunks) {
        simulateIncrementalUpdate(store, moderatorId, chunk);
      }

      const messages = store.getState().messages;
      expect(messages[0]?.parts[0]?.text).toBe('ABCDE');
    });

    it('maintains message order stability during updates', () => {
      const store = createChatStore();

      const initialMessages: UIMessage[] = [
        { id: 'msg-1', parts: [{ text: '1', type: 'text' }], role: UIMessageRoles.USER },
        { id: 'msg-2', parts: [{ text: '2', type: 'text' }], role: UIMessageRoles.ASSISTANT },
        createModeratorPlaceholder('thread-1', 0),
        { id: 'msg-4', parts: [{ text: '4', type: 'text' }], role: UIMessageRoles.USER },
      ];

      store.getState().setMessages(initialMessages);

      // Update moderator multiple times
      simulateIncrementalUpdate(store, 'thread-1_r0_moderator', 'Update 1');
      simulateIncrementalUpdate(store, 'thread-1_r0_moderator', 'Update 2');

      const messages = store.getState().messages;

      // Verify order preserved
      expect(messages.map(m => m.id)).toEqual(['msg-1', 'msg-2', 'thread-1_r0_moderator', 'msg-4']);
    });
  });

  describe('store State Consistency', () => {
    it('maintains isModeratorStreaming flag during updates', () => {
      const store = createChatStore();
      const moderatorId = 'thread-1_r0_moderator';

      store.getState().setMessages([createModeratorPlaceholder('thread-1', 0)]);
      store.getState().setIsModeratorStreaming(true);

      // Update should not affect streaming flag
      simulateIncrementalUpdate(store, moderatorId, 'Content');

      expect(store.getState().isModeratorStreaming).toBeTruthy();
    });

    it('completeModeratorStream resets streaming flag', () => {
      const store = createChatStore();

      store.getState().setIsModeratorStreaming(true);
      expect(store.getState().isModeratorStreaming).toBeTruthy();

      store.getState().completeModeratorStream();
      expect(store.getState().isModeratorStreaming).toBeFalsy();
    });
  });
});

describe('moderator Placeholder Text Configuration', () => {
  describe('moderator Loading Text', () => {
    it('moderator uses MODERATOR_NAME constant', () => {
      // Verify the constant is defined for moderator display
      expect(MODERATOR_NAME).toBe('Council Moderator');
    });

    it('moderator uses MODERATOR_PARTICIPANT_INDEX constant', () => {
      // Verify the constant is -99 for moderator identification
      expect(MODERATOR_PARTICIPANT_INDEX).toBe(-99);
    });
  });

  describe('placeholder State Detection', () => {
    it('empty parts array indicates pending state', () => {
      const placeholder = createModeratorPlaceholder('thread-1', 0);

      // ModelMessageCard checks: parts.length === 0 for pending state
      const isPending = placeholder.parts.length === 0;
      expect(isPending).toBeTruthy();
    });

    it('non-empty parts array indicates streaming/complete state', () => {
      const store = createChatStore();
      const moderatorId = 'thread-1_r0_moderator';

      store.getState().setMessages([createModeratorPlaceholder('thread-1', 0)]);
      simulateIncrementalUpdate(store, moderatorId, 'Content');

      const messages = store.getState().messages;
      const hasContent = (messages[0]?.parts.length ?? 0) > 0;
      expect(hasContent).toBeTruthy();
    });
  });
});

describe('moderator Stream Edge Cases', () => {
  describe('empty Content Handling', () => {
    it('handles empty text chunks gracefully', () => {
      const store = createChatStore();
      const moderatorId = 'thread-1_r0_moderator';

      store.getState().setMessages([createModeratorPlaceholder('thread-1', 0)]);

      // Empty chunk should not break anything
      simulateIncrementalUpdate(store, moderatorId, '');

      const messages = store.getState().messages;
      expect(messages[0]?.parts[0]?.text).toBe('');
    });

    it('final update with empty text still sets finish metadata', () => {
      const store = createChatStore();
      const moderatorId = 'thread-1_r0_moderator';

      store.getState().setMessages([createModeratorPlaceholder('thread-1', 0)]);

      simulateFinalUpdate(store, moderatorId, '');

      const messages = store.getState().messages;
      expect(messages[0]?.metadata?.finishReason).toBe('stop');
    });
  });

  describe('non-Existent Moderator Handling', () => {
    it('does not create new message if moderator placeholder missing', () => {
      const store = createChatStore();

      // No placeholder set
      store.getState().setMessages([]);

      // Attempt to update non-existent moderator
      simulateIncrementalUpdate(store, 'non-existent', 'Content');

      const messages = store.getState().messages;
      expect(messages).toHaveLength(0);
    });
  });

  describe('unicode and Special Characters', () => {
    it('handles unicode content correctly', () => {
      const store = createChatStore();
      const moderatorId = 'thread-1_r0_moderator';

      store.getState().setMessages([createModeratorPlaceholder('thread-1', 0)]);

      const unicodeContent = 'Discussion included: 日本語, émojis 🎉, and special chars <>&';
      simulateIncrementalUpdate(store, moderatorId, unicodeContent);

      const messages = store.getState().messages;
      expect(messages[0]?.parts[0]?.text).toBe(unicodeContent);
    });

    it('handles long content correctly', () => {
      const store = createChatStore();
      const moderatorId = 'thread-1_r0_moderator';

      store.getState().setMessages([createModeratorPlaceholder('thread-1', 0)]);

      // Generate long content
      const longContent = 'A'.repeat(10000);
      simulateIncrementalUpdate(store, moderatorId, longContent);

      const messages = store.getState().messages;
      expect(messages[0]?.parts[0]?.text).toHaveLength(10000);
    });
  });
});
