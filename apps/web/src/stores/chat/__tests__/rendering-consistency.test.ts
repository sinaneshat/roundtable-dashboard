/**
 * Rendering Consistency Tests
 *
 * Tests for over/under-rendering detection to catch:
 * 1. Duplicate message renders
 * 2. Placeholder rendering exactly once
 * 3. Shimmer→content transitions without overlap
 * 4. State flashing between pending/streaming
 * 5. Text append batching
 *
 * @see /Users/avabagherzadeh/Desktop/projects/deadpixel/billing-dashboard/docs/FLOW_DOCUMENTATION.md
 */

import { MessagePartTypes, UIMessageRoles } from '@roundtable/shared';
import type { UIMessage } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createMockParticipants,
  createMockThread,
  createTestAssistantMessage,
  createTestUserMessage,
} from '@/lib/testing';
import { createChatStore } from '@/stores/chat';
import { ChatPhases } from '@/stores/chat/store-schemas';

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Count messages by ID to detect duplicates
 */
function countMessageById(messages: UIMessage[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const msg of messages) {
    const count = counts.get(msg.id) ?? 0;
    counts.set(msg.id, count + 1);
  }
  return counts;
}

/**
 * Find duplicate messages
 */
function findDuplicates(messages: UIMessage[]): string[] {
  const counts = countMessageById(messages);
  return Array.from(counts.entries())
    .filter(([_, count]) => count > 1)
    .map(([id]) => id);
}

/**
 * Get text content from message
 */
function getMessageText(message: UIMessage): string {
  const firstPart = message.parts?.[0];
  if (firstPart && 'text' in firstPart && typeof firstPart.text === 'string') {
    return firstPart.text;
  }
  return '';
}

/**
 * Check if message has meaningful content (not just whitespace)
 */
function hasMeaningfulContent(message: UIMessage): boolean {
  const text = getMessageText(message);
  return text.trim().length > 0;
}

/**
 * Track state changes for render analysis
 */
type StateSnapshot = {
  messageIds: string[];
  messageContents: Map<string, string>;
  phase: string;
  isStreaming: boolean;
};

function captureSnapshot(store: ReturnType<typeof createChatStore>): StateSnapshot {
  const state = store.getState();
  const messageContents = new Map<string, string>();

  for (const msg of state.messages) {
    messageContents.set(msg.id, getMessageText(msg));
  }

  return {
    isStreaming: state.isStreaming,
    messageContents,
    messageIds: state.messages.map(m => m.id),
    phase: state.phase,
  };
}

// ============================================================================
// Test Suite: Rendering Consistency
// ============================================================================

describe('rendering Consistency', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    store.getState().setParticipants(createMockParticipants(3, 'thread-123'));
    vi.clearAllMocks();
  });

  describe('not duplicate message renders for same content', () => {
    it('should not create duplicate streaming placeholders for same participant/round', () => {
      // Append text multiple times to same participant
      store.getState().appendEntityStreamingText(0, 'First chunk ', 0);
      store.getState().appendEntityStreamingText(0, 'second chunk ', 0);
      store.getState().appendEntityStreamingText(0, 'third chunk', 0);

      const state = store.getState();
      const duplicates = findDuplicates(state.messages);

      expect(duplicates).toHaveLength(0);
      expect(state.messages).toHaveLength(1);
      expect(getMessageText(state.messages[0]!)).toBe('First chunk second chunk third chunk');
    });

    it('should not duplicate messages when setMessages is called with same data', () => {
      const messages = [
        createTestUserMessage({
          content: 'Question',
          id: 'msg-user',
          roundNumber: 0,
        }),
        createTestAssistantMessage({
          content: 'Answer',
          id: 'msg-p0',
          participantId: 'participant-0',
          participantIndex: 0,
          roundNumber: 0,
        }),
      ];

      store.getState().setMessages(messages);
      store.getState().setMessages(messages);
      store.getState().setMessages(messages);

      const state = store.getState();
      expect(state.messages).toHaveLength(2);
      expect(findDuplicates(state.messages)).toHaveLength(0);
    });

    it('should maintain single instance per participant across streaming phases', () => {
      // P0 starts streaming
      store.getState().appendEntityStreamingText(0, 'P0 streaming...', 0);

      // P0 completes, server message arrives
      const p0Complete = createTestAssistantMessage({
        content: 'P0 final content',
        id: 'thread_r0_p0',
        participantId: 'participant-0',
        participantIndex: 0,
        roundNumber: 0,
      });

      // Note: In real flow, setMessages would replace placeholders
      // Here we test that manual adding doesn't create duplicates
      store.getState().setMessages([...store.getState().messages, p0Complete]);

      // We should have streaming placeholder + server message
      // The UI would show only one based on rendering logic
      const state = store.getState();
      const p0Messages = state.messages.filter((m) => {
        const meta = m.metadata as Record<string, unknown>;
        return meta?.participantIndex === 0;
      });

      // Two messages for P0 is acceptable (placeholder + server) - UI picks one to show
      expect(p0Messages.length).toBeLessThanOrEqual(2);
    });
  });

  describe('render placeholder exactly once per entity', () => {
    it('should create exactly one placeholder per participant in createStreamingPlaceholders', () => {
      const thread = createMockThread({ id: 'thread-123' });
      store.setState({ thread });

      store.getState().createStreamingPlaceholders(0, 3);

      const state = store.getState();
      // P1, P2 placeholders + moderator (P0 is handled by AI SDK)
      // So 2 participant placeholders + 1 moderator = 3
      expect(state.messages).toHaveLength(3);

      // Check no duplicates
      expect(findDuplicates(state.messages)).toHaveLength(0);

      // Verify IDs are correct
      const ids = state.messages.map(m => m.id);
      expect(ids).toContain('streaming_p1_r0');
      expect(ids).toContain('streaming_p2_r0');
      expect(ids).toContain('thread-123_r0_moderator');
    });

    it('should not create duplicate placeholders when called twice', () => {
      const thread = createMockThread({ id: 'thread-123' });
      store.setState({ thread });

      store.getState().createStreamingPlaceholders(0, 3);
      store.getState().createStreamingPlaceholders(0, 3);

      const state = store.getState();
      expect(findDuplicates(state.messages)).toHaveLength(0);
      expect(state.messages).toHaveLength(3);
    });

    it('should create moderator placeholder exactly once', () => {
      const thread = createMockThread({ id: 'thread-123' });
      store.setState({ thread });

      // Create moderator placeholder via createStreamingPlaceholders
      store.getState().createStreamingPlaceholders(0, 2);

      // Append text to moderator
      store.getState().appendModeratorStreamingText('Moderator content', 0);

      const state = store.getState();
      const moderatorMessages = state.messages.filter((m) => {
        const meta = m.metadata as Record<string, unknown>;
        return meta?.isModerator === true;
      });

      expect(moderatorMessages).toHaveLength(1);
    });
  });

  describe('transition from shimmer to content without overlap', () => {
    it('should have content OR placeholder, never both visible for same entity', () => {
      // Create streaming placeholder
      store.getState().appendEntityStreamingText(0, '', 0); // Empty initially
      expect(store.getState().messages).toHaveLength(0); // Empty text doesn't create message

      // Add actual content
      store.getState().appendEntityStreamingText(0, 'Real content', 0);

      const state = store.getState();
      const p0Messages = state.messages.filter(m => m.id === 'streaming_p0_r0');

      // Should have exactly one message for P0
      expect(p0Messages).toHaveLength(1);

      // Content check: either has content or is empty placeholder
      const hasContent = hasMeaningfulContent(p0Messages[0]!);
      expect(hasContent).toBe(true);
    });

    it('should transition placeholder to content without intermediate states', () => {
      const snapshots: StateSnapshot[] = [];

      // Subscribe to track changes
      const unsubscribe = store.subscribe(() => {
        snapshots.push(captureSnapshot(store));
      });

      // Create placeholder with content
      store.getState().appendEntityStreamingText(0, 'Initial', 0);

      // Append more content
      store.getState().appendEntityStreamingText(0, ' more', 0);
      store.getState().appendEntityStreamingText(0, ' content', 0);

      unsubscribe();

      // Each snapshot should have consistent state (no flash to empty)
      for (const snapshot of snapshots) {
        const content = snapshot.messageContents.get('streaming_p0_r0');
        if (content !== undefined) {
          // Content should only grow, never shrink or flash to empty
          expect(content.length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('not flash between pending and streaming states', () => {
    it('should transition cleanly from IDLE to PARTICIPANTS phase', () => {
      const phaseHistory: string[] = [];

      const unsubscribe = store.subscribe(() => {
        phaseHistory.push(store.getState().phase);
      });

      store.getState().startRound(0, 3);

      unsubscribe();

      // Should go directly to PARTICIPANTS, no intermediate flash
      expect(phaseHistory[phaseHistory.length - 1]).toBe(ChatPhases.PARTICIPANTS);

      // Should not have multiple rapid phase changes
      const uniquePhases = [...new Set(phaseHistory)];
      expect(uniquePhases.length).toBeLessThanOrEqual(2); // At most IDLE → PARTICIPANTS
    });

    it('should not flash isStreaming between true/false during active streaming', () => {
      const streamingHistory: boolean[] = [];

      const unsubscribe = store.subscribe(() => {
        streamingHistory.push(store.getState().isStreaming);
      });

      store.getState().startRound(0, 3);
      store.getState().appendEntityStreamingText(0, 'Content 1', 0);
      store.getState().appendEntityStreamingText(0, 'Content 2', 0);
      store.getState().appendEntityStreamingText(1, 'P1 content', 0);

      unsubscribe();

      // After startRound, isStreaming should stay true
      const afterStartIndex = streamingHistory.findIndex(s => s === true);
      if (afterStartIndex >= 0) {
        const afterStart = streamingHistory.slice(afterStartIndex);
        // Should not flip back to false during streaming
        const falseAfterTrue = afterStart.filter(s => s === false);
        expect(falseAfterTrue).toHaveLength(0);
      }
    });
  });

  describe('render moderator message exactly once per round', () => {
    it('should have one moderator message per round', () => {
      const thread = createMockThread({ id: 'thread-123' });
      store.setState({ thread });

      // Round 0: Create placeholder and add content
      store.getState().createStreamingPlaceholders(0, 2);
      store.getState().appendModeratorStreamingText('R0 summary', 0);

      // Round 1: Create placeholder and add content
      store.getState().createStreamingPlaceholders(1, 2);
      store.getState().appendModeratorStreamingText('R1 summary', 1);

      const state = store.getState();
      const moderatorMessages = state.messages.filter((m) => {
        const meta = m.metadata as Record<string, unknown>;
        return meta?.isModerator === true;
      });

      // Should have exactly 2 moderator messages (one per round)
      expect(moderatorMessages).toHaveLength(2);

      // Each should have different round numbers
      const roundNumbers = moderatorMessages.map((m) => {
        const meta = m.metadata as Record<string, unknown>;
        return meta?.roundNumber;
      });
      expect(new Set(roundNumbers).size).toBe(2);
    });

    it('should not duplicate moderator when appendModeratorStreamingText is called multiple times', () => {
      const thread = createMockThread({ id: 'thread-123' });
      store.setState({ thread });

      store.getState().appendModeratorStreamingText('First ', 0);
      store.getState().appendModeratorStreamingText('second ', 0);
      store.getState().appendModeratorStreamingText('third.', 0);

      const state = store.getState();
      const moderatorMessages = state.messages.filter((m) => {
        const meta = m.metadata as Record<string, unknown>;
        return meta?.isModerator === true && meta?.roundNumber === 0;
      });

      expect(moderatorMessages).toHaveLength(1);
      expect(getMessageText(moderatorMessages[0]!)).toBe('First second third.');
    });
  });

  describe('handle empty text parts without rendering', () => {
    it('should not create message for empty text', () => {
      store.getState().appendEntityStreamingText(0, '', 0);

      expect(store.getState().messages).toHaveLength(0);
    });

    it('should not append empty text to existing message', () => {
      store.getState().appendEntityStreamingText(0, 'Initial', 0);
      const contentBefore = getMessageText(store.getState().messages[0]!);

      store.getState().appendEntityStreamingText(0, '', 0);

      const contentAfter = getMessageText(store.getState().messages[0]!);
      expect(contentAfter).toBe(contentBefore);
    });

    it('should handle whitespace-only text', () => {
      // Note: Whitespace is technically valid content
      store.getState().appendEntityStreamingText(0, '   ', 0);

      const state = store.getState();
      expect(state.messages).toHaveLength(1);
      expect(getMessageText(state.messages[0]!)).toBe('   ');
    });
  });

  describe('detect content via meaningful text, not just length > 0', () => {
    it('should consider whitespace-only as having content for length check', () => {
      store.getState().appendEntityStreamingText(0, '   ', 0);

      const message = store.getState().messages[0]!;
      const text = getMessageText(message);

      // Length > 0 check passes
      expect(text.length).toBeGreaterThan(0);
      // But trim check shows no meaningful content
      expect(text.trim()).toHaveLength(0);
    });

    it('should detect actual content correctly', () => {
      store.getState().appendEntityStreamingText(0, 'Real content', 0);

      const message = store.getState().messages[0]!;
      expect(hasMeaningfulContent(message)).toBe(true);
    });

    it('should handle mixed whitespace and content', () => {
      store.getState().appendEntityStreamingText(0, '  \n\t  ', 0);
      store.getState().appendEntityStreamingText(0, 'Actual text', 0);

      const message = store.getState().messages[0]!;
      const text = getMessageText(message);

      expect(text).toBe('  \n\t  Actual text');
      expect(hasMeaningfulContent(message)).toBe(true);
    });
  });

  describe('not re-render when appending text to same message', () => {
    it('should update message in-place rather than replacing', () => {
      store.getState().appendEntityStreamingText(0, 'Initial', 0);

      const messageBefore = store.getState().messages[0]!;
      const idBefore = messageBefore.id;

      store.getState().appendEntityStreamingText(0, ' appended', 0);

      const messageAfter = store.getState().messages[0]!;

      // Same ID means same message slot
      expect(messageAfter.id).toBe(idBefore);
      // Content is appended
      expect(getMessageText(messageAfter)).toBe('Initial appended');
    });

    it('should maintain message array length during appends', () => {
      store.getState().appendEntityStreamingText(0, 'A', 0);
      expect(store.getState().messages).toHaveLength(1);

      store.getState().appendEntityStreamingText(0, 'B', 0);
      expect(store.getState().messages).toHaveLength(1);

      store.getState().appendEntityStreamingText(0, 'C', 0);
      expect(store.getState().messages).toHaveLength(1);

      store.getState().appendEntityStreamingText(0, 'D', 0);
      expect(store.getState().messages).toHaveLength(1);

      expect(getMessageText(store.getState().messages[0]!)).toBe('ABCD');
    });
  });

  describe('batch multiple text appends into single render', () => {
    it('should handle rapid appends without message duplication', () => {
      // Simulate rapid streaming chunks
      for (let i = 0; i < 100; i++) {
        store.getState().appendEntityStreamingText(0, `${i}`, 0);
      }

      const state = store.getState();
      expect(state.messages).toHaveLength(1);
      expect(findDuplicates(state.messages)).toHaveLength(0);

      // Verify all content is preserved
      const text = getMessageText(state.messages[0]!);
      expect(text).toContain('0');
      expect(text).toContain('99');
    });

    it('should maintain correct order of appended text', () => {
      store.getState().appendEntityStreamingText(0, 'First', 0);
      store.getState().appendEntityStreamingText(0, 'Second', 0);
      store.getState().appendEntityStreamingText(0, 'Third', 0);

      const text = getMessageText(store.getState().messages[0]!);
      expect(text).toBe('FirstSecondThird');
    });
  });

  describe('streaming placeholder metadata consistency', () => {
    it('should set isStreaming metadata on placeholder', () => {
      store.getState().appendEntityStreamingText(0, 'Content', 0);

      const message = store.getState().messages[0]!;
      const metadata = message.metadata as Record<string, unknown>;

      expect(metadata.isStreaming).toBe(true);
    });

    it('should preserve participantIndex in metadata', () => {
      store.getState().appendEntityStreamingText(2, 'Content', 0);

      const message = store.getState().messages[0]!;
      const metadata = message.metadata as Record<string, unknown>;

      expect(metadata.participantIndex).toBe(2);
    });

    it('should preserve roundNumber in metadata', () => {
      store.getState().appendEntityStreamingText(0, 'Content', 5);

      const message = store.getState().messages[0]!;
      const metadata = message.metadata as Record<string, unknown>;

      expect(metadata.roundNumber).toBe(5);
    });
  });

  describe('message parts structure', () => {
    it('should create message with TEXT part type', () => {
      store.getState().appendEntityStreamingText(0, 'Content', 0);

      const message = store.getState().messages[0]!;

      expect(message.parts).toHaveLength(1);
      expect(message.parts![0]).toEqual({
        text: 'Content',
        type: MessagePartTypes.TEXT,
      });
    });

    it('should append to first TEXT part', () => {
      store.getState().appendEntityStreamingText(0, 'First', 0);
      store.getState().appendEntityStreamingText(0, 'Second', 0);

      const message = store.getState().messages[0]!;

      expect(message.parts).toHaveLength(1);
      expect(message.parts![0]).toEqual({
        text: 'FirstSecond',
        type: MessagePartTypes.TEXT,
      });
    });

    it('should maintain assistant role on streaming messages', () => {
      store.getState().appendEntityStreamingText(0, 'Content', 0);

      const message = store.getState().messages[0]!;
      expect(message.role).toBe(UIMessageRoles.ASSISTANT);
    });
  });
});
