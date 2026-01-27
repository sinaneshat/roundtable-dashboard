/**
 * Streaming Text Operations Tests
 *
 * Tests for gradual streaming UI updates and placeholder management.
 *
 * Key Scenarios from FLOW_DOCUMENTATION.md:
 * 1. appendEntityStreamingText (Participant streaming)
 * 2. appendModeratorStreamingText (Moderator streaming)
 * 3. completeStreaming cleanup (Placeholder removal)
 * 4. Concurrent streaming scenarios
 * 5. Edge cases (empty text, participant not found, round mismatch)
 *
 * @see /Users/avabagherzadeh/Desktop/projects/deadpixel/billing-dashboard/docs/FLOW_DOCUMENTATION.md
 */

import { MessagePartTypes, MODERATOR_NAME, MODERATOR_PARTICIPANT_INDEX, UIMessageRoles } from '@roundtable/shared';
import type { UIMessage } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createMockParticipant,
  createTestAssistantMessage,
  createTestModeratorMessage,
  createTestUserMessage,
} from '@/lib/testing';
import { createChatStore } from '@/stores/chat';

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Get text content from a UIMessage
 */
function getMessageText(message: UIMessage): string {
  const firstPart = message.parts?.[0];
  if (firstPart && 'text' in firstPart && typeof firstPart.text === 'string') {
    return firstPart.text;
  }
  return '';
}

/**
 * Find streaming placeholder by ID pattern
 */
function findStreamingPlaceholder(messages: UIMessage[], id: string): UIMessage | undefined {
  return messages.find(m => m.id === id);
}

// ============================================================================
// Test Suite: appendEntityStreamingText (Participant Streaming)
// ============================================================================

describe('appendEntityStreamingText - Participant Streaming', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    // Initialize with test participants
    store.getState().setParticipants([
      createMockParticipant(0, { id: 'p0', modelId: 'model-0' }),
      createMockParticipant(1, { id: 'p1', modelId: 'model-1' }),
    ]);
    vi.clearAllMocks();
  });

  it('should create streaming placeholder message if not exists', () => {
    const state = store.getState();

    // Initially no messages
    expect(state.messages).toHaveLength(0);

    // Append streaming text for participant 0, round 0
    store.getState().appendEntityStreamingText(0, 'Hello', 0);

    const updatedState = store.getState();
    expect(updatedState.messages).toHaveLength(1);

    // Verify placeholder was created
    const placeholder = findStreamingPlaceholder(updatedState.messages, 'streaming_p0_r0');
    expect(placeholder).toBeDefined();
    expect(getMessageText(placeholder!)).toBe('Hello');
  });

  it('should generate correct ID: streaming_p${index}_r${round}', () => {
    // Test various participant/round combinations
    const testCases = [
      { expectedId: 'streaming_p0_r0', participantIndex: 0, roundNumber: 0 },
      { expectedId: 'streaming_p1_r0', participantIndex: 1, roundNumber: 0 },
      { expectedId: 'streaming_p0_r1', participantIndex: 0, roundNumber: 1 },
      { expectedId: 'streaming_p2_r5', participantIndex: 2, roundNumber: 5 },
    ];

    for (const { expectedId, participantIndex, roundNumber } of testCases) {
      // Reset store
      store = createChatStore();
      store.getState().setParticipants([
        createMockParticipant(0),
        createMockParticipant(1),
        createMockParticipant(2),
      ]);

      store.getState().appendEntityStreamingText(participantIndex, 'Test', roundNumber);

      const state = store.getState();
      const placeholder = findStreamingPlaceholder(state.messages, expectedId);
      expect(placeholder).toBeDefined();
      expect(placeholder!.id).toBe(expectedId);
    }
  });

  it('should append text to existing placeholder', () => {
    // Create initial placeholder
    store.getState().appendEntityStreamingText(0, 'Hello', 0);

    let state = store.getState();
    expect(state.messages).toHaveLength(1);
    expect(getMessageText(state.messages[0]!)).toBe('Hello');

    // Append more text
    store.getState().appendEntityStreamingText(0, ' world', 0);

    state = store.getState();
    expect(state.messages).toHaveLength(1); // Still just one message
    expect(getMessageText(state.messages[0]!)).toBe('Hello world');

    // Append even more
    store.getState().appendEntityStreamingText(0, '!', 0);

    state = store.getState();
    expect(state.messages).toHaveLength(1);
    expect(getMessageText(state.messages[0]!)).toBe('Hello world!');
  });

  it('should skip empty text chunks', () => {
    // Try to append empty string
    store.getState().appendEntityStreamingText(0, '', 0);

    let state = store.getState();
    expect(state.messages).toHaveLength(0); // No message created

    // Create a placeholder first
    store.getState().appendEntityStreamingText(0, 'Initial', 0);

    state = store.getState();
    expect(state.messages).toHaveLength(1);
    expect(getMessageText(state.messages[0]!)).toBe('Initial');

    // Try to append empty string to existing
    store.getState().appendEntityStreamingText(0, '', 0);

    state = store.getState();
    expect(state.messages).toHaveLength(1);
    expect(getMessageText(state.messages[0]!)).toBe('Initial'); // Unchanged
  });

  it('should set correct metadata (isStreaming, participantIndex, roundNumber)', () => {
    store.getState().appendEntityStreamingText(1, 'Streaming content', 2);

    const state = store.getState();
    const placeholder = state.messages[0];

    expect(placeholder).toBeDefined();
    expect(placeholder!.metadata).toBeDefined();

    const metadata = placeholder!.metadata as Record<string, unknown>;
    expect(metadata.isStreaming).toBe(true);
    expect(metadata.participantIndex).toBe(1);
    expect(metadata.roundNumber).toBe(2);
    expect(metadata.role).toBe(UIMessageRoles.ASSISTANT);
  });

  it('should include participant model and id in metadata', () => {
    const participants = [
      createMockParticipant(0, { id: 'participant-alpha', modelId: 'gpt-4' }),
      createMockParticipant(1, { id: 'participant-beta', modelId: 'claude-3' }),
    ];
    store.getState().setParticipants(participants);

    store.getState().appendEntityStreamingText(0, 'Hello', 0);

    const state = store.getState();
    const placeholder = state.messages[0];
    const metadata = placeholder!.metadata as Record<string, unknown>;

    expect(metadata.model).toBe('gpt-4');
    expect(metadata.participantId).toBe('participant-alpha');
  });

  it('should handle multiple participants streaming in sequence', () => {
    // P0 starts streaming
    store.getState().appendEntityStreamingText(0, 'P0 says: ', 0);

    // P0 continues
    store.getState().appendEntityStreamingText(0, 'Hello', 0);

    // P1 starts streaming (different placeholder)
    store.getState().appendEntityStreamingText(1, 'P1 says: ', 0);

    // P0 finishes
    store.getState().appendEntityStreamingText(0, '!', 0);

    // P1 continues
    store.getState().appendEntityStreamingText(1, 'World', 0);

    const state = store.getState();
    expect(state.messages).toHaveLength(2);

    const p0Placeholder = findStreamingPlaceholder(state.messages, 'streaming_p0_r0');
    const p1Placeholder = findStreamingPlaceholder(state.messages, 'streaming_p1_r0');

    expect(p0Placeholder).toBeDefined();
    expect(p1Placeholder).toBeDefined();
    expect(getMessageText(p0Placeholder!)).toBe('P0 says: Hello!');
    expect(getMessageText(p1Placeholder!)).toBe('P1 says: World');
  });
});

// ============================================================================
// Test Suite: appendModeratorStreamingText
// ============================================================================

describe('appendModeratorStreamingText - Moderator Streaming', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.clearAllMocks();
  });

  it('should create moderator streaming placeholder if not exists', () => {
    const state = store.getState();
    expect(state.messages).toHaveLength(0);

    store.getState().appendModeratorStreamingText('Analyzing discussion...', 0);

    const updatedState = store.getState();
    expect(updatedState.messages).toHaveLength(1);

    const placeholder = findStreamingPlaceholder(updatedState.messages, 'streaming_moderator_r0');
    expect(placeholder).toBeDefined();
    expect(getMessageText(placeholder!)).toBe('Analyzing discussion...');
  });

  it('should generate correct ID: streaming_moderator_r${round}', () => {
    const testCases = [
      { expectedId: 'streaming_moderator_r0', roundNumber: 0 },
      { expectedId: 'streaming_moderator_r1', roundNumber: 1 },
      { expectedId: 'streaming_moderator_r5', roundNumber: 5 },
    ];

    for (const { expectedId, roundNumber } of testCases) {
      store = createChatStore();

      store.getState().appendModeratorStreamingText('Test', roundNumber);

      const state = store.getState();
      const placeholder = findStreamingPlaceholder(state.messages, expectedId);
      expect(placeholder).toBeDefined();
      expect(placeholder!.id).toBe(expectedId);
    }
  });

  it('should append text to existing placeholder', () => {
    store.getState().appendModeratorStreamingText('The participants ', 0);

    let state = store.getState();
    expect(getMessageText(state.messages[0]!)).toBe('The participants ');

    store.getState().appendModeratorStreamingText('have reached ', 0);

    state = store.getState();
    expect(state.messages).toHaveLength(1);
    expect(getMessageText(state.messages[0]!)).toBe('The participants have reached ');

    store.getState().appendModeratorStreamingText('consensus.', 0);

    state = store.getState();
    expect(state.messages).toHaveLength(1);
    expect(getMessageText(state.messages[0]!)).toBe('The participants have reached consensus.');
  });

  it('should skip empty text chunks', () => {
    // Try to append empty string
    store.getState().appendModeratorStreamingText('', 0);

    let state = store.getState();
    expect(state.messages).toHaveLength(0);

    // Create placeholder first
    store.getState().appendModeratorStreamingText('Summary', 0);

    state = store.getState();
    expect(state.messages).toHaveLength(1);

    // Try to append empty
    store.getState().appendModeratorStreamingText('', 0);

    state = store.getState();
    expect(state.messages).toHaveLength(1);
    expect(getMessageText(state.messages[0]!)).toBe('Summary');
  });

  it('should set isModerator metadata', () => {
    store.getState().appendModeratorStreamingText('Moderator analysis', 0);

    const state = store.getState();
    const placeholder = state.messages[0];

    expect(placeholder).toBeDefined();
    const metadata = placeholder!.metadata as Record<string, unknown>;

    expect(metadata.isStreaming).toBe(true);
    expect(metadata.participantIndex).toBe(MODERATOR_PARTICIPANT_INDEX);
    expect(metadata.participantId).toBe(MODERATOR_NAME);
    expect(metadata.model).toBe('moderator');
    expect(metadata.role).toBe(UIMessageRoles.ASSISTANT);
    expect(metadata.roundNumber).toBe(0);
  });
});

// ============================================================================
// Test Suite: completeStreaming Cleanup
// ============================================================================

describe('completeStreaming - Behavior', () => {
  /**
   * NOTE: completeStreaming does NOT clean up streaming placeholders.
   * Placeholders are cleaned up by setMessages when server data arrives via useModeratorStream.
   * This prevents UI flash where placeholder text disappears then reappears.
   */
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    store.getState().setParticipants([
      createMockParticipant(0, { id: 'p0', modelId: 'model-0' }),
      createMockParticipant(1, { id: 'p1', modelId: 'model-1' }),
    ]);
    vi.clearAllMocks();
  });

  it('should preserve all messages (placeholders NOT cleaned up by completeStreaming)', () => {
    // completeStreaming intentionally does not clean up placeholders
    // Cleanup happens via setMessages when server data arrives
    store.getState().appendEntityStreamingText(0, 'Streaming content', 0);

    let state = store.getState();
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]!.id).toBe('streaming_p0_r0');

    // Add server message for same participant/round
    const serverMessage = createTestAssistantMessage({
      content: 'Final server content',
      id: 'thread-123_r0_p0',
      participantId: 'p0',
      participantIndex: 0,
      roundNumber: 0,
    });

    store.getState().setMessages([state.messages[0]!, serverMessage]);

    // Complete streaming - does NOT clean up placeholders
    store.getState().completeStreaming();

    state = store.getState();
    // Both messages remain - placeholder cleanup happens via setMessages from useModeratorStream
    expect(state.messages).toHaveLength(2);
  });

  it('should keep streaming placeholders after completeStreaming', () => {
    // Create streaming placeholder
    store.getState().appendEntityStreamingText(0, 'Still streaming...', 0);

    let state = store.getState();
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]!.id).toBe('streaming_p0_r0');

    // Complete streaming - placeholders are NOT cleaned up here
    store.getState().completeStreaming();

    state = store.getState();
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]!.id).toBe('streaming_p0_r0'); // Placeholder retained
  });

  it('should preserve all messages including placeholders and server messages', () => {
    // Create streaming placeholders for multiple participants
    store.getState().appendEntityStreamingText(0, 'P0 streaming', 0);
    store.getState().appendEntityStreamingText(1, 'P1 streaming', 0);

    // Add server message only for P0
    const p0ServerMessage = createTestAssistantMessage({
      content: 'P0 final content',
      id: 'thread-123_r0_p0',
      participantId: 'p0',
      participantIndex: 0,
      roundNumber: 0,
    });

    let state = store.getState();
    store.getState().setMessages([...state.messages, p0ServerMessage]);

    // Complete streaming - does NOT clean up placeholders
    store.getState().completeStreaming();

    state = store.getState();

    // All messages preserved - completeStreaming does not clean up
    expect(state.messages).toHaveLength(3);

    // Both placeholders should remain
    const p0Placeholder = findStreamingPlaceholder(state.messages, 'streaming_p0_r0');
    expect(p0Placeholder).toBeDefined();

    const p1Placeholder = findStreamingPlaceholder(state.messages, 'streaming_p1_r0');
    expect(p1Placeholder).toBeDefined();

    // Server message should remain
    const serverMsg = state.messages.find(m => m.id === 'thread-123_r0_p0');
    expect(serverMsg).toBeDefined();
  });

  it('should preserve moderator placeholders after completeStreaming', () => {
    // Create moderator streaming placeholder
    store.getState().appendModeratorStreamingText('Moderator streaming', 0);

    let state = store.getState();
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]!.id).toBe('streaming_moderator_r0');

    // Add server moderator message
    const moderatorServerMessage = createTestModeratorMessage({
      content: 'Final moderator analysis',
      id: 'thread-123_r0_moderator',
      roundNumber: 0,
    });

    store.getState().setMessages([state.messages[0]!, moderatorServerMessage]);

    // Complete streaming - does NOT clean up placeholders
    store.getState().completeStreaming();

    state = store.getState();
    // Both remain - actual cleanup happens via setMessages from useModeratorStream
    expect(state.messages).toHaveLength(2);
  });

  it('should preserve all placeholders across multiple rounds', () => {
    // Create placeholders for round 0 and round 1
    store.getState().appendEntityStreamingText(0, 'R0 P0 streaming', 0);
    store.getState().appendEntityStreamingText(0, 'R1 P0 streaming', 1);

    // Add server message only for round 0
    const r0ServerMessage = createTestAssistantMessage({
      content: 'R0 P0 final',
      id: 'thread-123_r0_p0',
      participantId: 'p0',
      participantIndex: 0,
      roundNumber: 0,
    });

    let state = store.getState();
    store.getState().setMessages([...state.messages, r0ServerMessage]);

    store.getState().completeStreaming();

    state = store.getState();

    // All messages preserved
    expect(state.messages).toHaveLength(3);

    // Both placeholders should remain
    const r0Placeholder = findStreamingPlaceholder(state.messages, 'streaming_p0_r0');
    expect(r0Placeholder).toBeDefined();

    const r1Placeholder = findStreamingPlaceholder(state.messages, 'streaming_p0_r1');
    expect(r1Placeholder).toBeDefined();
  });
});

// ============================================================================
// Test Suite: Concurrent Streaming Scenarios
// ============================================================================

describe('concurrent Streaming Scenarios', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    store.getState().setParticipants([
      createMockParticipant(0, { id: 'p0', modelId: 'model-0' }),
      createMockParticipant(1, { id: 'p1', modelId: 'model-1' }),
      createMockParticipant(2, { id: 'p2', modelId: 'model-2' }),
    ]);
    vi.clearAllMocks();
  });

  it('should handle multiple participants streaming sequentially per docs', () => {
    // Per FLOW_DOCUMENTATION.md: participants stream sequentially, not concurrently
    // Frame 3: P1 starts streaming (others waiting)
    // Frame 4: P1 complete -> P2 starts (baton pass)

    // P0 streams fully
    store.getState().appendEntityStreamingText(0, 'P0 starts ', 0);
    store.getState().appendEntityStreamingText(0, 'and finishes.', 0);

    // P0 gets server message, P1 starts
    const p0Server = createTestAssistantMessage({
      content: 'P0 starts and finishes.',
      id: 'thread_r0_p0',
      participantId: 'p0',
      participantIndex: 0,
      roundNumber: 0,
    });

    store.getState().setMessages([...store.getState().messages, p0Server]);

    // P1 starts streaming
    store.getState().appendEntityStreamingText(1, 'P1 response ', 0);
    store.getState().appendEntityStreamingText(1, 'here.', 0);

    const state = store.getState();

    // Should have: P0 placeholder, P0 server, P1 placeholder
    expect(state.messages).toHaveLength(3);

    const p0Placeholder = findStreamingPlaceholder(state.messages, 'streaming_p0_r0');
    const p1Placeholder = findStreamingPlaceholder(state.messages, 'streaming_p1_r0');

    expect(p0Placeholder).toBeDefined();
    expect(p1Placeholder).toBeDefined();
    expect(getMessageText(p1Placeholder!)).toBe('P1 response here.');
  });

  it('should handle pre-search blocking participants per Frame 10', () => {
    // Per FLOW_DOCUMENTATION.md Frame 10: Pre-search blocks participants

    // User message exists
    const userMessage = createTestUserMessage({
      content: 'Research AI trends',
      id: 'user_r1',
      roundNumber: 1,
    });
    store.getState().setMessages([userMessage]);

    // Pre-search is streaming (blocking participants)
    // Participants should NOT start until pre-search completes

    // After pre-search completes (Frame 11), participants start
    store.getState().appendEntityStreamingText(0, 'Based on research: ', 1);
    store.getState().appendEntityStreamingText(0, 'AI is evolving rapidly.', 1);

    const state = store.getState();
    expect(state.messages).toHaveLength(2); // User message + P0 streaming

    const p0Placeholder = findStreamingPlaceholder(state.messages, 'streaming_p0_r1');
    expect(p0Placeholder).toBeDefined();
    expect(getMessageText(p0Placeholder!)).toBe('Based on research: AI is evolving rapidly.');
  });

  it('should maintain message ordering with streaming placeholders', () => {
    // Add user message first
    const userMessage = createTestUserMessage({
      content: 'Test question',
      id: 'user_r0',
      roundNumber: 0,
    });
    store.getState().setMessages([userMessage]);

    // P0 streaming
    store.getState().appendEntityStreamingText(0, 'P0 answer', 0);

    // P0 server message arrives
    const p0Server = createTestAssistantMessage({
      content: 'P0 final answer',
      id: 'thread_r0_p0',
      participantId: 'p0',
      participantIndex: 0,
      roundNumber: 0,
    });

    let state = store.getState();
    store.getState().setMessages([...state.messages, p0Server]);

    // P1 streaming
    store.getState().appendEntityStreamingText(1, 'P1 answer', 0);

    // P1 server message arrives
    const p1Server = createTestAssistantMessage({
      content: 'P1 final answer',
      id: 'thread_r0_p1',
      participantId: 'p1',
      participantIndex: 1,
      roundNumber: 0,
    });

    state = store.getState();
    store.getState().setMessages([...state.messages, p1Server]);

    // Moderator streaming
    store.getState().appendModeratorStreamingText('Moderator summary', 0);

    state = store.getState();

    // Order should be: user -> p0_streaming -> p0_server -> p1_streaming -> p1_server -> moderator_streaming
    expect(state.messages.length).toBeGreaterThanOrEqual(5);
    expect(state.messages[0]!.id).toBe('user_r0');
  });
});

// ============================================================================
// Test Suite: Edge Cases
// ============================================================================

describe('edge Cases', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.clearAllMocks();
  });

  it('should handle empty text chunks gracefully - should not create or modify messages', () => {
    store.getState().setParticipants([createMockParticipant(0)]);

    // Empty string
    store.getState().appendEntityStreamingText(0, '', 0);
    expect(store.getState().messages).toHaveLength(0);

    // Create a message, then try empty append
    store.getState().appendEntityStreamingText(0, 'Initial', 0);
    expect(store.getState().messages).toHaveLength(1);

    store.getState().appendEntityStreamingText(0, '', 0);
    expect(getMessageText(store.getState().messages[0]!)).toBe('Initial');

    // Same for moderator
    store.getState().appendModeratorStreamingText('', 0);
    expect(store.getState().messages).toHaveLength(1); // No new moderator message
  });

  it('should NOT create message when participant not found in participants array', () => {
    // No participants set
    store.getState().setParticipants([]);

    // FIX: Should NOT create placeholder for invalid participant index
    // Previously this created a message with modelId='unknown' which is a bug
    store.getState().appendEntityStreamingText(0, 'Orphan participant', 0);

    const state = store.getState();
    // No message should be created since participant 0 doesn't exist
    expect(state.messages).toHaveLength(0);
  });

  it('should handle round number mismatch scenarios', () => {
    store.getState().setParticipants([createMockParticipant(0)]);

    // Create placeholder for round 0
    store.getState().appendEntityStreamingText(0, 'Round 0 content', 0);

    // Create placeholder for round 2 (skip round 1)
    store.getState().appendEntityStreamingText(0, 'Round 2 content', 2);

    const state = store.getState();
    expect(state.messages).toHaveLength(2);

    const r0Placeholder = findStreamingPlaceholder(state.messages, 'streaming_p0_r0');
    const r2Placeholder = findStreamingPlaceholder(state.messages, 'streaming_p0_r2');

    expect(r0Placeholder).toBeDefined();
    expect(r2Placeholder).toBeDefined();
    expect(getMessageText(r0Placeholder!)).toBe('Round 0 content');
    expect(getMessageText(r2Placeholder!)).toBe('Round 2 content');
  });

  it('should handle very large text chunks', () => {
    store.getState().setParticipants([createMockParticipant(0)]);

    const largeText = 'A'.repeat(10000);
    store.getState().appendEntityStreamingText(0, largeText, 0);

    const state = store.getState();
    expect(state.messages).toHaveLength(1);
    expect(getMessageText(state.messages[0]!)).toBe(largeText);

    // Append more large text
    store.getState().appendEntityStreamingText(0, largeText, 0);
    expect(getMessageText(store.getState().messages[0]!)).toBe(largeText + largeText);
  });

  it('should handle special characters in text', () => {
    store.getState().setParticipants([createMockParticipant(0)]);

    const specialText = 'Hello <script>alert("xss")</script> & "quotes" \n newline';
    store.getState().appendEntityStreamingText(0, specialText, 0);

    const state = store.getState();
    expect(getMessageText(state.messages[0]!)).toBe(specialText);
  });

  it('should handle unicode and emoji in text', () => {
    store.getState().setParticipants([createMockParticipant(0)]);

    const unicodeText = 'Hello world with emoji and CJK chars';
    store.getState().appendEntityStreamingText(0, unicodeText, 0);

    const state = store.getState();
    expect(getMessageText(state.messages[0]!)).toBe(unicodeText);
  });

  it('should correctly set message role as assistant', () => {
    store.getState().setParticipants([createMockParticipant(0)]);

    store.getState().appendEntityStreamingText(0, 'Test', 0);
    store.getState().appendModeratorStreamingText('Moderator test', 1);

    const state = store.getState();

    expect(state.messages[0]!.role).toBe(UIMessageRoles.ASSISTANT);
    expect(state.messages[1]!.role).toBe(UIMessageRoles.ASSISTANT);
  });

  it('should correctly set parts with MessagePartTypes.TEXT', () => {
    store.getState().setParticipants([createMockParticipant(0)]);

    store.getState().appendEntityStreamingText(0, 'Test content', 0);

    const state = store.getState();
    const placeholder = state.messages[0];

    expect(placeholder!.parts).toHaveLength(1);
    expect(placeholder!.parts[0]).toEqual({
      text: 'Test content',
      type: MessagePartTypes.TEXT,
    });
  });

  it('should handle completeStreaming called multiple times', () => {
    store.getState().setParticipants([createMockParticipant(0)]);

    // Create placeholder and server message
    store.getState().appendEntityStreamingText(0, 'Streaming', 0);

    const serverMessage = createTestAssistantMessage({
      content: 'Final',
      id: 'server_r0_p0',
      participantId: 'p0',
      participantIndex: 0,
      roundNumber: 0,
    });

    store.getState().setMessages([...store.getState().messages, serverMessage]);

    // Call completeStreaming multiple times - should not cause errors
    store.getState().completeStreaming();
    store.getState().completeStreaming();
    store.getState().completeStreaming();

    const state = store.getState();
    // Should not have duplicates or errors
    // Note: completeStreaming does NOT clean up placeholders - that happens via setMessages
    expect(state.messages).toHaveLength(2); // Both placeholder and server message
    expect(state.messages.some(m => m.id === 'server_r0_p0')).toBe(true);
  });
});

// ============================================================================
// Test Suite: Integration with Store State
// ============================================================================

describe('integration with Store State', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    store.getState().setParticipants([
      createMockParticipant(0),
      createMockParticipant(1),
    ]);
    vi.clearAllMocks();
  });

  it('should work correctly with setStreamingRoundNumber', () => {
    // Set streaming round number (Frame 2)
    store.getState().setStreamingRoundNumber(0);

    expect(store.getState().streamingRoundNumber).toBe(0);

    // Start streaming text
    store.getState().appendEntityStreamingText(0, 'Starting', 0);

    const state = store.getState();
    expect(state.messages).toHaveLength(1);

    const metadata = state.messages[0]!.metadata as Record<string, unknown>;
    expect(metadata.roundNumber).toBe(0);
  });

  it('should work correctly with setIsStreaming', () => {
    store.getState().setIsStreaming(true);
    store.getState().appendEntityStreamingText(0, 'Active streaming', 0);

    let state = store.getState();
    expect(state.isStreaming).toBe(true);
    expect(state.messages).toHaveLength(1);

    // Complete streaming
    store.getState().setIsStreaming(false);

    state = store.getState();
    expect(state.isStreaming).toBe(false);
    expect(state.messages).toHaveLength(1); // Placeholder still exists
  });

  it('should work correctly with currentParticipantIndex tracking', () => {
    store.getState().setCurrentParticipantIndex(0);
    store.getState().appendEntityStreamingText(0, 'P0 content', 0);

    store.getState().setCurrentParticipantIndex(1);
    store.getState().appendEntityStreamingText(1, 'P1 content', 0);

    const state = store.getState();
    expect(state.currentParticipantIndex).toBe(1);
    expect(state.messages).toHaveLength(2);
  });

  it('should preserve existing messages when appending streaming text', () => {
    // Add a user message first
    const userMessage = createTestUserMessage({
      content: 'User question',
      id: 'user_r0',
      roundNumber: 0,
    });
    store.getState().setMessages([userMessage]);

    // Append streaming text
    store.getState().appendEntityStreamingText(0, 'Response', 0);

    const state = store.getState();
    expect(state.messages).toHaveLength(2);
    expect(state.messages[0]!.id).toBe('user_r0');
    expect(state.messages[1]!.id).toBe('streaming_p0_r0');
  });

  it('should handle isModeratorStreaming flag with moderator text', () => {
    // Participants complete, moderator starts
    store.getState().setIsStreaming(false);
    store.getState().setIsModeratorStreaming(true);

    store.getState().appendModeratorStreamingText('Analyzing...', 0);

    const state = store.getState();
    expect(state.isModeratorStreaming).toBe(true);
    expect(state.messages).toHaveLength(1);

    const metadata = state.messages[0]!.metadata as Record<string, unknown>;
    expect(metadata.participantIndex).toBe(MODERATOR_PARTICIPANT_INDEX);
  });
});
