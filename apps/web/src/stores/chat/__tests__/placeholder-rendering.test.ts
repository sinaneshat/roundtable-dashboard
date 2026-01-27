/**
 * Placeholder Rendering Tests
 *
 * Tests for streaming placeholder messages appearing at the right times.
 * Per FLOW_DOCUMENTATION.md:
 * - Frame 2: ALL placeholders appear instantly when user sends
 * - Frame 8: Changelog + all placeholders appear (Round 2+)
 * - Placeholders exist with empty text before streaming content arrives
 * - P0 is handled by AI SDK, P1+ get proactive placeholders
 *
 * @see docs/FLOW_DOCUMENTATION.md Section "Placeholder Pattern"
 */

import { MessagePartTypes, MODERATOR_NAME, MODERATOR_PARTICIPANT_INDEX, ScreenModes, UIMessageRoles } from '@roundtable/shared';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  createMockParticipants,
  createMockThread,
  createTestUserMessage,
} from '@/lib/testing';

import { createChatStore } from '../store';
import { ChatPhases } from '../store-schemas';

// ============================================================================
// Test Setup
// ============================================================================

type TestStore = ReturnType<typeof createChatStore>;

function setupStoreWithThread(store: TestStore, participantCount: number) {
  const participants = createMockParticipants(participantCount);
  const thread = createMockThread({ id: 'thread-placeholder' });

  store.setState({ participants, thread });
  store.getState().initializeThread(thread, participants, []);

  return { participants, thread };
}

// ============================================================================
// SCENARIO: Frame 2 - Initial Placeholder Creation
// ============================================================================

describe('frame 2: Initial Placeholder Creation on Send', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createChatStore();
  });

  it('should create P1+ placeholders when startRound is called', () => {
    setupStoreWithThread(store, 3);

    store.getState().startRound(0, 3);

    // P1 and P2 should have placeholders (P0 is handled by AI SDK)
    const placeholders = store.getState().messages.filter(m =>
      m.id.startsWith('streaming_p') && m.metadata?.isStreaming,
    );

    expect(placeholders).toHaveLength(2); // P1 and P2
    expect(placeholders.find(p => p.id === 'streaming_p1_r0')).toBeDefined();
    expect(placeholders.find(p => p.id === 'streaming_p2_r0')).toBeDefined();
  });

  it('should NOT create P0 placeholder (AI SDK handles it)', () => {
    setupStoreWithThread(store, 3);

    store.getState().startRound(0, 3);

    const p0Placeholder = store.getState().messages.find(m => m.id === 'streaming_p0_r0');
    expect(p0Placeholder).toBeUndefined();
  });

  it('should create moderator placeholder', () => {
    setupStoreWithThread(store, 2);

    store.getState().startRound(0, 2);

    const modPlaceholder = store.getState().messages.find(m =>
      m.metadata?.isModerator && m.metadata?.isStreaming,
    );

    expect(modPlaceholder).toBeDefined();
    expect(modPlaceholder?.metadata?.roundNumber).toBe(0);
  });

  it('should create placeholders with empty text initially', () => {
    setupStoreWithThread(store, 2);

    store.getState().startRound(0, 2);

    const placeholders = store.getState().messages.filter(m => m.metadata?.isStreaming);

    placeholders.forEach((placeholder) => {
      expect(placeholder.parts).toHaveLength(1);
      expect(placeholder.parts[0]?.type).toBe(MessagePartTypes.TEXT);
      expect((placeholder.parts[0] as { text: string }).text).toBe('');
    });
  });

  it('should include participant metadata in placeholders', () => {
    setupStoreWithThread(store, 3);

    store.getState().startRound(0, 3);

    const p1Placeholder = store.getState().messages.find(m => m.id === 'streaming_p1_r0');

    expect(p1Placeholder?.metadata?.participantIndex).toBe(1);
    expect(p1Placeholder?.metadata?.roundNumber).toBe(0);
    expect(p1Placeholder?.metadata?.isStreaming).toBe(true);
    expect(p1Placeholder?.role).toBe(UIMessageRoles.ASSISTANT);
  });

  it('should create placeholders for all enabled participants', () => {
    setupStoreWithThread(store, 5);

    store.getState().startRound(0, 5);

    // P1, P2, P3, P4 (4 placeholders, P0 is SDK)
    const participantPlaceholders = store.getState().messages.filter(m =>
      m.id.startsWith('streaming_p'),
    );

    expect(participantPlaceholders).toHaveLength(4);
  });
});

// ============================================================================
// SCENARIO: Placeholder ID Generation
// ============================================================================

describe('placeholder ID Generation', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createChatStore();
  });

  it('should generate unique IDs per round for participants', () => {
    setupStoreWithThread(store, 2);

    // Round 0
    store.getState().startRound(0, 2);
    const r0Placeholders = store.getState().messages.filter(m => m.id.includes('_r0'));

    // Complete round and start round 1
    store.getState().onParticipantComplete(0);
    store.getState().onParticipantComplete(1);
    store.getState().onModeratorComplete();
    store.getState().prepareForNewMessage();

    store.getState().startRound(1, 2);
    const r1Placeholders = store.getState().messages.filter(m => m.id.includes('_r1'));

    // Should have placeholders for both rounds
    expect(r0Placeholders.length).toBeGreaterThan(0);
    expect(r1Placeholders.length).toBeGreaterThan(0);
    // No ID collisions
    const allIds = store.getState().messages.map(m => m.id);
    const uniqueIds = [...new Set(allIds)];
    expect(allIds.length).toBe(uniqueIds.length);
  });

  it('should use thread ID in moderator placeholder ID', () => {
    const { thread } = setupStoreWithThread(store, 2);

    store.getState().startRound(0, 2);

    const modPlaceholder = store.getState().messages.find(m =>
      m.metadata?.isModerator && m.metadata?.isStreaming,
    );

    expect(modPlaceholder?.id).toBe(`${thread.id}_r0_moderator`);
  });

  it('should fallback gracefully if thread ID missing', () => {
    store = createChatStore();
    const participants = createMockParticipants(2);

    // Don't set thread, just participants
    store.setState({ participants, thread: null as any });

    store.getState().startRound(0, 2);

    const modPlaceholder = store.getState().messages.find(m =>
      m.metadata?.isModerator && m.metadata?.isStreaming,
    );

    // Should use fallback ID
    expect(modPlaceholder?.id).toBe('streaming_moderator_r0');
  });
});

// ============================================================================
// SCENARIO: Duplicate Placeholder Prevention
// ============================================================================

describe('duplicate Placeholder Prevention', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createChatStore();
  });

  it('should not create duplicate placeholders if called twice', () => {
    setupStoreWithThread(store, 3);

    store.getState().startRound(0, 3);
    const firstCount = store.getState().messages.length;

    // Call again (e.g., React StrictMode double-render)
    store.getState().createStreamingPlaceholders(0, 3);
    const secondCount = store.getState().messages.length;

    expect(secondCount).toBe(firstCount);
  });

  it('should not create duplicate moderator placeholder', () => {
    setupStoreWithThread(store, 2);

    store.getState().startRound(0, 2);
    store.getState().createStreamingPlaceholders(0, 2);
    store.getState().createStreamingPlaceholders(0, 2);

    const modPlaceholders = store.getState().messages.filter(m =>
      m.metadata?.isModerator && m.metadata?.roundNumber === 0,
    );

    expect(modPlaceholders).toHaveLength(1);
  });
});

// ============================================================================
// SCENARIO: Text Appending to Placeholders
// ============================================================================

describe('text Appending to Placeholders', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createChatStore();
  });

  it('should append text to existing participant placeholder', () => {
    setupStoreWithThread(store, 3);
    store.getState().startRound(0, 3);

    // Append text to P1
    store.getState().appendEntityStreamingText(1, 'Hello', 0);
    store.getState().appendEntityStreamingText(1, ' World', 0);

    const p1Message = store.getState().messages.find(m => m.id === 'streaming_p1_r0');
    expect((p1Message?.parts[0] as { text: string }).text).toBe('Hello World');
  });

  it('should append text to moderator placeholder', () => {
    setupStoreWithThread(store, 2);
    store.getState().startRound(0, 2);

    store.getState().appendModeratorStreamingText('Summary: ', 0);
    store.getState().appendModeratorStreamingText('All agreed.', 0);

    const modMessage = store.getState().messages.find(m => m.metadata?.isModerator);
    expect((modMessage?.parts[0] as { text: string }).text).toBe('Summary: All agreed.');
  });

  it('should create placeholder if not exists when appending', () => {
    setupStoreWithThread(store, 3);
    // Don't call startRound - no placeholders exist

    // Append should create placeholder
    store.getState().appendEntityStreamingText(1, 'Text', 0);

    const p1Message = store.getState().messages.find(m => m.id === 'streaming_p1_r0');
    expect(p1Message).toBeDefined();
    expect((p1Message?.parts[0] as { text: string }).text).toBe('Text');
  });

  it('should ignore empty text chunks', () => {
    setupStoreWithThread(store, 2);
    store.getState().startRound(0, 2);

    store.getState().appendEntityStreamingText(1, 'Hello', 0);
    store.getState().appendEntityStreamingText(1, '', 0);
    store.getState().appendEntityStreamingText(1, ' World', 0);

    const p1Message = store.getState().messages.find(m => m.id === 'streaming_p1_r0');
    expect((p1Message?.parts[0] as { text: string }).text).toBe('Hello World');
  });
});

// ============================================================================
// SCENARIO: Placeholder State During Different Phases
// ============================================================================

describe('placeholder State During Different Phases', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createChatStore();
  });

  it('IDLE phase: no streaming placeholders exist', () => {
    setupStoreWithThread(store, 2);

    expect(store.getState().phase).toBe(ChatPhases.IDLE);

    const streamingMessages = store.getState().messages.filter(m => m.metadata?.isStreaming);
    expect(streamingMessages).toHaveLength(0);
  });

  it('PARTICIPANTS phase: all placeholders exist', () => {
    setupStoreWithThread(store, 3);
    store.getState().startRound(0, 3);

    expect(store.getState().phase).toBe(ChatPhases.PARTICIPANTS);

    // P1, P2 + moderator = 3 placeholders
    const streamingMessages = store.getState().messages.filter(m => m.metadata?.isStreaming);
    expect(streamingMessages).toHaveLength(3);
  });

  it('MODERATOR phase: participant messages converted, mod placeholder streaming', () => {
    setupStoreWithThread(store, 2);
    store.getState().startRound(0, 2);
    store.getState().initializeSubscriptions(0, 2);

    // Complete participants
    store.getState().updateEntitySubscriptionStatus(0, 'complete', 100);
    store.getState().updateEntitySubscriptionStatus(1, 'complete', 100);
    store.getState().onParticipantComplete(0);
    store.getState().onParticipantComplete(1);

    expect(store.getState().phase).toBe(ChatPhases.MODERATOR);

    // Moderator should still be streaming
    const modPlaceholder = store.getState().messages.find(m =>
      m.metadata?.isModerator && m.metadata?.isStreaming,
    );
    expect(modPlaceholder).toBeDefined();
  });

  it('COMPLETE phase: all streaming flags should be cleared on completeStreaming', () => {
    setupStoreWithThread(store, 2);
    store.getState().startRound(0, 2);
    store.getState().initializeSubscriptions(0, 2);

    // Complete all
    store.getState().updateEntitySubscriptionStatus(0, 'complete', 100);
    store.getState().updateEntitySubscriptionStatus(1, 'complete', 100);
    store.getState().onParticipantComplete(0);
    store.getState().onParticipantComplete(1);
    store.getState().onModeratorComplete();

    expect(store.getState().phase).toBe(ChatPhases.COMPLETE);
    expect(store.getState().isStreaming).toBe(false);
  });
});

// ============================================================================
// SCENARIO: Single Participant Edge Case
// ============================================================================

describe('single Participant Edge Case', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createChatStore();
  });

  it('should only create moderator placeholder for single participant', () => {
    setupStoreWithThread(store, 1);
    store.getState().startRound(0, 1);

    // P0 is handled by SDK, so no participant placeholders
    const participantPlaceholders = store.getState().messages.filter(m =>
      m.id.startsWith('streaming_p'),
    );
    expect(participantPlaceholders).toHaveLength(0);

    // But moderator placeholder should exist
    const modPlaceholder = store.getState().messages.find(m => m.metadata?.isModerator);
    expect(modPlaceholder).toBeDefined();
  });
});

// ============================================================================
// SCENARIO: Multi-Round Placeholder Management
// ============================================================================

describe('multi-Round Placeholder Management', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createChatStore();
  });

  it('should preserve old round messages when creating new round placeholders', () => {
    setupStoreWithThread(store, 2);

    // Round 0
    store.getState().startRound(0, 2);
    store.getState().appendEntityStreamingText(1, 'R0 P1 content', 0);
    store.getState().appendModeratorStreamingText('R0 Mod content', 0);
    store.getState().initializeSubscriptions(0, 2);
    store.getState().updateEntitySubscriptionStatus(0, 'complete', 100);
    store.getState().updateEntitySubscriptionStatus(1, 'complete', 100);
    store.getState().onParticipantComplete(0);
    store.getState().onParticipantComplete(1);
    store.getState().onModeratorComplete();
    store.getState().prepareForNewMessage();

    const r0MessageCount = store.getState().messages.length;

    // Round 1
    store.getState().startRound(1, 2);

    // Old messages should still exist
    const r0P1 = store.getState().messages.find(m => m.id === 'streaming_p1_r0');
    expect(r0P1).toBeDefined();
    expect((r0P1?.parts[0] as { text: string }).text).toBe('R0 P1 content');

    // New placeholders should exist
    const r1P1 = store.getState().messages.find(m => m.id === 'streaming_p1_r1');
    expect(r1P1).toBeDefined();
    expect((r1P1?.parts[0] as { text: string }).text).toBe('');

    // Total messages increased
    expect(store.getState().messages.length).toBeGreaterThan(r0MessageCount);
  });

  it('should correctly identify placeholders by round number', () => {
    setupStoreWithThread(store, 2);

    store.getState().startRound(0, 2);
    store.getState().initializeSubscriptions(0, 2);
    store.getState().updateEntitySubscriptionStatus(0, 'complete', 100);
    store.getState().updateEntitySubscriptionStatus(1, 'complete', 100);
    store.getState().onParticipantComplete(0);
    store.getState().onParticipantComplete(1);
    store.getState().onModeratorComplete();
    store.getState().prepareForNewMessage();

    store.getState().startRound(1, 2);

    const r0Messages = store.getState().messages.filter(m => m.metadata?.roundNumber === 0);
    const r1Messages = store.getState().messages.filter(m => m.metadata?.roundNumber === 1);

    // Both rounds should have messages
    expect(r0Messages.length).toBeGreaterThan(0);
    expect(r1Messages.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// SCENARIO: Placeholder Model Information
// ============================================================================

describe('placeholder Model Information', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createChatStore();
  });

  it('should include model ID from participant config', () => {
    const participants = createMockParticipants(2);
    participants[1]!.modelId = 'anthropic/claude-3-opus';

    const thread = createMockThread({ id: 'thread-model' });
    store.setState({ participants, thread });

    store.getState().startRound(0, 2);

    const p1Placeholder = store.getState().messages.find(m => m.id === 'streaming_p1_r0');
    expect(p1Placeholder?.metadata?.model).toBe('anthropic/claude-3-opus');
  });

  it('should include participant ID in metadata', () => {
    const participants = createMockParticipants(2);
    participants[1]!.id = 'participant-123';

    const thread = createMockThread({ id: 'thread-pid' });
    store.setState({ participants, thread });

    store.getState().startRound(0, 2);

    const p1Placeholder = store.getState().messages.find(m => m.id === 'streaming_p1_r0');
    expect(p1Placeholder?.metadata?.participantId).toBe('participant-123');
  });

  it('should mark moderator with correct metadata', () => {
    setupStoreWithThread(store, 2);
    store.getState().startRound(0, 2);

    const modPlaceholder = store.getState().messages.find(m => m.metadata?.isModerator);

    expect(modPlaceholder?.metadata?.isModerator).toBe(true);
    expect(modPlaceholder?.metadata?.model).toBe(MODERATOR_NAME);
    expect(modPlaceholder?.metadata?.participantIndex).toBe(MODERATOR_PARTICIPANT_INDEX);
  });
});
