/**
 * Message ID Consistency Tests
 *
 * Tests for ensuring message IDs remain consistent across different scenarios:
 * - Thread ID availability timing
 * - Multiple rounds
 * - Moderator vs participant message IDs
 * - ID collision prevention
 *
 * These test real issues found during code review where message ID mismatches
 * could cause duplicate messages or lost updates.
 */

import { MODERATOR_PARTICIPANT_INDEX } from '@roundtable/shared';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  createMockParticipants,
  createMockThread,
} from '@/lib/testing';

import { createChatStore } from '../store';

// ============================================================================
// Test Setup
// ============================================================================

type TestStore = ReturnType<typeof createChatStore>;

// ============================================================================
// SCENARIO: Moderator ID Consistency When ThreadId Becomes Available
// ============================================================================

describe('moderator ID Consistency', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createChatStore();
    const participants = createMockParticipants(2);
    store.setState({ participants });
  });

  it('should use fallback ID when threadId is null', () => {
    // No thread set
    store.getState().startRound(0, 2);

    const modMessage = store.getState().messages.find(m =>
      (m.metadata as Record<string, unknown>)?.isModerator === true,
    );

    expect(modMessage?.id).toBe('streaming_moderator_r0');
  });

  it('should use thread-based ID when threadId is available', () => {
    const thread = createMockThread({ id: 'test-thread-123' });
    store.setState({ thread });

    store.getState().startRound(0, 2);

    const modMessage = store.getState().messages.find(m =>
      (m.metadata as Record<string, unknown>)?.isModerator === true,
    );

    expect(modMessage?.id).toBe('test-thread-123_r0_moderator');
  });

  it('should find and update fallback ID message when threadId becomes available', () => {
    // Start without thread
    store.getState().startRound(0, 2);
    store.getState().appendModeratorStreamingText('Initial ', 0);

    // Message uses fallback ID
    const initialMessages = store.getState().messages;
    const initialMod = initialMessages.find(m =>
      (m.metadata as Record<string, unknown>)?.isModerator === true,
    );
    expect(initialMod?.id).toBe('streaming_moderator_r0');

    // Set thread
    const thread = createMockThread({ id: 'late-thread' });
    store.setState({ thread });

    // Append more text - should find existing message by metadata fallback
    store.getState().appendModeratorStreamingText('more text', 0);

    // Should still have only ONE moderator message for round 0
    const moderatorMessages = store.getState().messages.filter(m =>
      (m.metadata as Record<string, unknown>)?.isModerator === true
      && (m.metadata as Record<string, unknown>)?.roundNumber === 0,
    );

    expect(moderatorMessages).toHaveLength(1);

    // Text should be merged
    const text = (moderatorMessages[0]?.parts[0] as { text: string })?.text;
    expect(text).toBe('Initial more text');
  });

  it('should NOT duplicate moderator messages across rapid thread ID changes', () => {
    // Start without thread
    store.getState().startRound(0, 2);
    store.getState().appendModeratorStreamingText('Chunk 1 ', 0);

    // Set thread
    store.setState({ thread: createMockThread({ id: 'thread-v1' }) });
    store.getState().appendModeratorStreamingText('Chunk 2 ', 0);

    // Change thread ID again (edge case)
    store.setState({ thread: createMockThread({ id: 'thread-v2' }) });
    store.getState().appendModeratorStreamingText('Chunk 3', 0);

    // Should still have only ONE moderator message
    const moderatorMessages = store.getState().messages.filter(m =>
      (m.metadata as Record<string, unknown>)?.isModerator === true
      && (m.metadata as Record<string, unknown>)?.roundNumber === 0,
    );

    expect(moderatorMessages).toHaveLength(1);
    expect((moderatorMessages[0]?.parts[0] as { text: string })?.text).toBe('Chunk 1 Chunk 2 Chunk 3');
  });
});

// ============================================================================
// SCENARIO: Participant Message ID Uniqueness
// ============================================================================

describe('participant Message ID Uniqueness', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createChatStore();
    const participants = createMockParticipants(3);
    const thread = createMockThread({ id: 'thread-unique' });
    store.setState({ participants, thread });
  });

  it('should generate unique IDs per participant per round', () => {
    store.getState().startRound(0, 3);

    const messages = store.getState().messages;
    const ids = messages.map(m => m.id);
    const uniqueIds = [...new Set(ids)];

    expect(ids).toHaveLength(uniqueIds.length);

    // Verify expected IDs
    expect(ids).toContain('streaming_p1_r0');
    expect(ids).toContain('streaming_p2_r0');
  });

  it('should maintain separate IDs across rounds', () => {
    // Round 0
    store.getState().startRound(0, 3);
    store.getState().initializeSubscriptions(0, 3);
    store.getState().updateEntitySubscriptionStatus(0, 'complete', 100);
    store.getState().updateEntitySubscriptionStatus(1, 'complete', 100);
    store.getState().updateEntitySubscriptionStatus(2, 'complete', 100);
    store.getState().onParticipantComplete(0);
    store.getState().onParticipantComplete(1);
    store.getState().onParticipantComplete(2);
    store.getState().onModeratorComplete();
    store.getState().prepareForNewMessage();

    // Round 1
    store.getState().startRound(1, 3);

    const messages = store.getState().messages;

    // Should have separate messages for both rounds
    expect(messages.find(m => m.id === 'streaming_p1_r0')).toBeDefined();
    expect(messages.find(m => m.id === 'streaming_p1_r1')).toBeDefined();
    expect(messages.find(m => m.id === 'streaming_p2_r0')).toBeDefined();
    expect(messages.find(m => m.id === 'streaming_p2_r1')).toBeDefined();
  });

  it('should not create duplicate message if ID already exists', () => {
    store.getState().startRound(0, 3);

    const initialCount = store.getState().messages.length;

    // Try to create placeholders again
    store.getState().createStreamingPlaceholders(0, 3);
    store.getState().createStreamingPlaceholders(0, 3);
    store.getState().createStreamingPlaceholders(0, 3);

    // Count should not change
    expect(store.getState().messages).toHaveLength(initialCount);
  });
});

// ============================================================================
// SCENARIO: ID Format Consistency
// ============================================================================

describe('iD Format Consistency', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createChatStore();
    const participants = createMockParticipants(2);
    const thread = createMockThread({ id: 'thread-format' });
    store.setState({ participants, thread });
  });

  it('should use consistent participant ID format', () => {
    store.getState().startRound(0, 2);

    const p1Msg = store.getState().messages.find(m => m.id === 'streaming_p1_r0');

    expect(p1Msg).toBeDefined();
    expect(p1Msg?.id).toMatch(/^streaming_p\d+_r\d+$/);
  });

  it('should use consistent moderator ID format with threadId', () => {
    store.getState().startRound(0, 2);

    const modMsg = store.getState().messages.find(m =>
      (m.metadata as Record<string, unknown>)?.isModerator === true,
    );

    expect(modMsg).toBeDefined();
    expect(modMsg?.id).toMatch(/^thread-format_r\d+_moderator$/);
  });

  it('should use consistent moderator fallback ID format', () => {
    // Remove thread
    store.setState({ thread: null as any });

    store.getState().startRound(0, 2);

    const modMsg = store.getState().messages.find(m =>
      (m.metadata as Record<string, unknown>)?.isModerator === true,
    );

    expect(modMsg).toBeDefined();
    expect(modMsg?.id).toMatch(/^streaming_moderator_r\d+$/);
  });
});

// ============================================================================
// SCENARIO: Message Metadata Consistency
// ============================================================================

describe('message Metadata Consistency', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createChatStore();
    const participants = createMockParticipants(3);
    participants[0]!.modelId = 'anthropic/claude-3-opus';
    participants[1]!.modelId = 'openai/gpt-4o';
    participants[2]!.modelId = 'google/gemini-pro';
    const thread = createMockThread({ id: 'thread-meta' });
    store.setState({ participants, thread });
  });

  it('should include correct modelId in participant placeholders', () => {
    store.getState().startRound(0, 3);

    const p1Msg = store.getState().messages.find(m => m.id === 'streaming_p1_r0');
    const p2Msg = store.getState().messages.find(m => m.id === 'streaming_p2_r0');

    expect((p1Msg?.metadata as Record<string, unknown>)?.model).toBe('openai/gpt-4o');
    expect((p2Msg?.metadata as Record<string, unknown>)?.model).toBe('google/gemini-pro');
  });

  it('should include participantIndex in metadata', () => {
    store.getState().startRound(0, 3);

    const p1Msg = store.getState().messages.find(m => m.id === 'streaming_p1_r0');
    const p2Msg = store.getState().messages.find(m => m.id === 'streaming_p2_r0');

    expect((p1Msg?.metadata as Record<string, unknown>)?.participantIndex).toBe(1);
    expect((p2Msg?.metadata as Record<string, unknown>)?.participantIndex).toBe(2);
  });

  it('should mark moderator messages with correct metadata', () => {
    store.getState().startRound(0, 2);

    const modMsg = store.getState().messages.find(m =>
      (m.metadata as Record<string, unknown>)?.isModerator === true,
    );

    expect(modMsg).toBeDefined();
    expect((modMsg?.metadata as Record<string, unknown>)?.isModerator).toBe(true);
    expect((modMsg?.metadata as Record<string, unknown>)?.participantIndex).toBe(MODERATOR_PARTICIPANT_INDEX);
    expect((modMsg?.metadata as Record<string, unknown>)?.roundNumber).toBe(0);
    expect((modMsg?.metadata as Record<string, unknown>)?.isStreaming).toBe(true);
  });

  it('should include roundNumber in all streaming messages', () => {
    store.getState().startRound(0, 3);

    const streamingMessages = store.getState().messages.filter(m =>
      (m.metadata as Record<string, unknown>)?.isStreaming === true,
    );

    streamingMessages.forEach((msg) => {
      expect((msg.metadata as Record<string, unknown>)?.roundNumber).toBe(0);
    });
  });
});

// ============================================================================
// SCENARIO: Edge Cases with Special Characters in Thread ID
// ============================================================================

describe('special Characters in Thread ID', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createChatStore();
    const participants = createMockParticipants(2);
    store.setState({ participants });
  });

  it('should handle thread ID with special characters', () => {
    const thread = createMockThread({ id: 'thread-with-special_chars.123' });
    store.setState({ thread });

    store.getState().startRound(0, 2);

    const modMsg = store.getState().messages.find(m =>
      (m.metadata as Record<string, unknown>)?.isModerator === true,
    );

    expect(modMsg?.id).toBe('thread-with-special_chars.123_r0_moderator');
  });

  it('should handle thread ID with UUID format', () => {
    const thread = createMockThread({ id: '550e8400-e29b-41d4-a716-446655440000' });
    store.setState({ thread });

    store.getState().startRound(0, 2);

    const modMsg = store.getState().messages.find(m =>
      (m.metadata as Record<string, unknown>)?.isModerator === true,
    );

    expect(modMsg?.id).toBe('550e8400-e29b-41d4-a716-446655440000_r0_moderator');
  });
});

// ============================================================================
// SCENARIO: Message ID Stability During Text Append
// ============================================================================

describe('message ID Stability During Append', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createChatStore();
    const participants = createMockParticipants(2);
    const thread = createMockThread({ id: 'thread-stable' });
    store.setState({ participants, thread });
  });

  it('should maintain same ID when appending text to participant', () => {
    store.getState().startRound(0, 2);

    const initialId = store.getState().messages.find(m => m.id === 'streaming_p1_r0')?.id;

    // Append multiple times
    store.getState().appendEntityStreamingText(1, 'A', 0);
    store.getState().appendEntityStreamingText(1, 'B', 0);
    store.getState().appendEntityStreamingText(1, 'C', 0);

    const finalId = store.getState().messages.find(m => m.id === 'streaming_p1_r0')?.id;

    expect(finalId).toBe(initialId);
    expect(finalId).toBe('streaming_p1_r0');
  });

  it('should maintain same ID when appending text to moderator', () => {
    store.getState().startRound(0, 2);

    const initialMod = store.getState().messages.find(m =>
      (m.metadata as Record<string, unknown>)?.isModerator === true,
    );
    const initialId = initialMod?.id;

    // Append multiple times
    store.getState().appendModeratorStreamingText('A', 0);
    store.getState().appendModeratorStreamingText('B', 0);
    store.getState().appendModeratorStreamingText('C', 0);

    const finalMod = store.getState().messages.find(m =>
      (m.metadata as Record<string, unknown>)?.isModerator === true
      && (m.metadata as Record<string, unknown>)?.roundNumber === 0,
    );
    const finalId = finalMod?.id;

    expect(finalId).toBe(initialId);
  });
});
