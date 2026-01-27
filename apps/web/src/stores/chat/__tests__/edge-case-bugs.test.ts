/**
 * Edge Case Bug Tests
 *
 * Tests that expose actual bugs found in code review:
 * 1. Out-of-bounds participant index access
 * 2. Duplicate moderator messages when threadId becomes available mid-stream
 * 3. Moderator fallback matching wrong round's message
 * 4. Missing validation on subscription state entity types
 * 5. Race condition: streaming flag not cleared on error
 *
 * These tests are designed to FAIL first, then we fix the bugs.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import {
  createMockParticipants,
  createMockThread,
} from '@/lib/testing';

import { createChatStore } from '../store';
import type { EntityStatus } from '../store-schemas';
import { ChatPhases } from '../store-schemas';

// ============================================================================
// Test Setup
// ============================================================================

type TestStore = ReturnType<typeof createChatStore>;

// ============================================================================
// BUG 1: Out-of-Bounds Participant Index Access
// File: store.ts, line 146
// Issue: appendEntityStreamingText doesn't validate participantIndex bounds
// ============================================================================

describe('bUG 1: Out-of-Bounds Participant Index (FIXED)', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createChatStore();
    const participants = createMockParticipants(2); // Only 2 participants (index 0, 1)
    const thread = createMockThread({ id: 'thread-bounds' });
    store.setState({ participants, thread });
  });

  it('should NOT create message for out-of-bounds index', () => {
    // Attempt to stream to participant index 5 when only 2 exist
    store.getState().appendEntityStreamingText(5, 'Text for non-existent participant', 0);

    // Check what was created - should be nothing
    const messages = store.getState().messages;
    const p5Message = messages.find(m => m.id === 'streaming_p5_r0');

    // FIX VERIFIED: No message should be created for invalid index
    expect(p5Message).toBeUndefined();
  });

  it('should NOT create message for negative participant index', () => {
    store.getState().appendEntityStreamingText(-1, 'Negative index text', 0);

    const messages = store.getState().messages;
    const negativeMsg = messages.find(m => m.id === 'streaming_p-1_r0');

    // FIX VERIFIED: Should not create message with negative index
    expect(negativeMsg).toBeUndefined();
  });

  it('should only create placeholders for valid participants in createStreamingPlaceholders', () => {
    // Call with more participants than exist (10 requested, only 2 exist)
    store.getState().createStreamingPlaceholders(0, 10);

    // Check created placeholders
    const messages = store.getState().messages;

    // FIX VERIFIED: Should only create P1 placeholder (not P2-P9)
    // because only participants[0] and participants[1] exist
    const participantPlaceholders = messages.filter(m =>
      m.id.startsWith('streaming_p'),
    );

    // Only P1 should have a placeholder (P0 is SDK, P2+ don't exist)
    expect(participantPlaceholders).toHaveLength(1);
    expect(participantPlaceholders[0]?.id).toBe('streaming_p1_r0');

    // No 'unknown' modelIds
    const invalidPlaceholders = messages.filter((m) => {
      const meta = m.metadata as Record<string, unknown> | undefined;
      return meta?.model === 'unknown';
    });
    expect(invalidPlaceholders).toHaveLength(0);
  });

  it('should silently ignore NaN participant index', () => {
    store.getState().appendEntityStreamingText(Number.NaN, 'NaN index text', 0);

    // Should not create any message
    const messages = store.getState().messages;
    expect(messages).toHaveLength(0);
  });

  it('should allow valid indices within bounds', () => {
    // Index 0 and 1 are valid for 2 participants
    store.getState().appendEntityStreamingText(0, 'P0 text', 0);
    store.getState().appendEntityStreamingText(1, 'P1 text', 0);

    const messages = store.getState().messages;
    expect(messages.find(m => m.id === 'streaming_p0_r0')).toBeDefined();
    expect(messages.find(m => m.id === 'streaming_p1_r0')).toBeDefined();

    // Both should have valid modelIds (not 'unknown')
    messages.forEach((m) => {
      const meta = m.metadata as Record<string, unknown> | undefined;
      expect(meta?.model).not.toBe('unknown');
    });
  });
});

// ============================================================================
// BUG 2: Duplicate Moderator Messages When ThreadId Becomes Available
// File: store.ts, lines 188-216
// Issue: When threadId is null initially, fallback ID is used. Later when
// threadId is available, a new message with different ID can be created.
// ============================================================================

describe('bUG 2: Duplicate Moderator Messages', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createChatStore();
    const participants = createMockParticipants(2);
    // Start with NO thread (null)
    store.setState({ participants, thread: null as any });
  });

  it('should NOT create duplicate moderator when threadId becomes available', () => {
    // Step 1: Append text when threadId is null (uses fallback ID)
    store.getState().appendModeratorStreamingText('Initial text ', 0);

    const messagesAfterFirst = store.getState().messages;
    expect(messagesAfterFirst).toHaveLength(1);
    expect(messagesAfterFirst[0]?.id).toBe('streaming_moderator_r0'); // Fallback ID

    // Step 2: Set thread (simulating server response)
    const thread = createMockThread({ id: 'thread-123' });
    store.setState({ thread });

    // Step 3: Append more text now that threadId is available
    store.getState().appendModeratorStreamingText('More text', 0);

    // BUG CHECK: Should still have only 1 moderator message, not 2
    const moderatorMessages = store.getState().messages.filter((m) => {
      const meta = m.metadata as Record<string, unknown> | undefined;
      return meta?.isModerator === true && meta?.roundNumber === 0;
    });

    // Currently may create 2 messages:
    // 1. streaming_moderator_r0 (fallback)
    // 2. thread-123_r0_moderator (proper ID)
    expect(moderatorMessages).toHaveLength(1);
  });

  it('should merge text when fallback ID message exists and threadId becomes available', () => {
    // Append with no threadId
    store.getState().appendModeratorStreamingText('Part 1', 0);

    // Set thread
    const thread = createMockThread({ id: 'thread-merge' });
    store.setState({ thread });

    // Append more
    store.getState().appendModeratorStreamingText(' Part 2', 0);

    // Should have merged text
    const messages = store.getState().messages;
    const modMessage = messages.find(m =>
      (m.metadata as Record<string, unknown>)?.isModerator === true,
    );

    expect(modMessage).toBeDefined();
    const text = (modMessage?.parts[0] as { text: string })?.text;
    expect(text).toBe('Part 1 Part 2');
  });
});

// ============================================================================
// BUG 3: Moderator Fallback Matches Wrong Round's Message
// File: store.ts, lines 200-206
// Issue: Fallback lookup searches by isModerator+roundNumber+isStreaming
// but could match a stale moderator from different round if not cleaned up
// ============================================================================

describe('bUG 3: Moderator Fallback Matches Wrong Round', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createChatStore();
    const participants = createMockParticipants(2);
    const thread = createMockThread({ id: 'thread-round-match' });
    store.setState({ participants, thread });
  });

  it('should NOT match a different round moderator message', () => {
    // Create R0 moderator placeholder
    store.getState().startRound(0, 2);
    store.getState().appendModeratorStreamingText('R0 Moderator start', 0);

    // The R0 moderator message already has isStreaming=true from creation
    // Now try to stream R1 moderator - should create a separate message
    store.getState().appendModeratorStreamingText('R1 Moderator', 1);

    const allMessages = store.getState().messages;

    // Should have separate messages for R0 and R1
    const r0Mod = allMessages.find(m =>
      (m.metadata as Record<string, unknown>)?.roundNumber === 0
      && (m.metadata as Record<string, unknown>)?.isModerator === true,
    );
    const r1Mod = allMessages.find(m =>
      (m.metadata as Record<string, unknown>)?.roundNumber === 1
      && (m.metadata as Record<string, unknown>)?.isModerator === true,
    );

    expect(r0Mod).toBeDefined();
    expect(r1Mod).toBeDefined();

    // R0 message should be unchanged
    expect((r0Mod?.parts[0] as { text: string })?.text).toBe('R0 Moderator start');
    // R1 message should have its own content
    expect((r1Mod?.parts[0] as { text: string })?.text).toBe('R1 Moderator');

    // They should be different messages
    expect(r0Mod?.id).not.toBe(r1Mod?.id);
  });
});

// ============================================================================
// BUG 4: Invalid Entity Type for Subscription Updates
// File: store.ts, updateEntitySubscriptionStatus
// Issue: No validation that entity is valid ('presearch', 'moderator', or number)
// ============================================================================

describe('bUG 4: Invalid Entity Type Handling', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createChatStore();
    const participants = createMockParticipants(2);
    const thread = createMockThread({ id: 'thread-entity' });
    store.setState({ participants, thread });
    store.getState().startRound(0, 2);
    store.getState().initializeSubscriptions(0, 2);
  });

  it('should handle invalid entity type gracefully', () => {
    // Try to update with an invalid entity type
    // TypeScript would catch this, but at runtime it could happen
    const invalidEntity = 'invalid' as unknown as 'presearch' | 'moderator' | number;

    // Should not throw
    expect(() => {
      store.getState().updateEntitySubscriptionStatus(invalidEntity, 'streaming' as EntityStatus, 10);
    }).not.toThrow();

    // State should be unchanged (no phantom updates)
    expect(store.getState().subscriptionState.presearch.status).toBe('idle');
    expect(store.getState().subscriptionState.moderator.status).toBe('idle');
  });

  it('should handle NaN participant index gracefully', () => {
    const nanIndex = Number.NaN;

    expect(() => {
      store.getState().updateEntitySubscriptionStatus(nanIndex, 'streaming' as EntityStatus, 10);
    }).not.toThrow();

    // Participant states should be unchanged
    store.getState().subscriptionState.participants.forEach((p) => {
      expect(p.status).toBe('idle');
    });
  });
});

// ============================================================================
// BUG 5: isStreaming Not Cleared on All Error Paths
// Issue: If streaming encounters an error, isStreaming may remain true
// ============================================================================

describe('bUG 5: isStreaming Flag Error Handling', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createChatStore();
    const participants = createMockParticipants(2);
    const thread = createMockThread({ id: 'thread-streaming-error' });
    store.setState({ participants, thread });
  });

  it('should clear isStreaming when all entities error', () => {
    store.getState().startRound(0, 2);
    store.getState().initializeSubscriptions(0, 2);

    expect(store.getState().isStreaming).toBe(true);

    // All participants error
    store.getState().updateEntitySubscriptionStatus(0, 'error' as EntityStatus, 10, 'Error 1');
    store.getState().updateEntitySubscriptionStatus(1, 'error' as EntityStatus, 10, 'Error 2');
    store.getState().onParticipantComplete(0);
    store.getState().onParticipantComplete(1);

    // Moderator errors
    store.getState().updateEntitySubscriptionStatus('moderator', 'error' as EntityStatus, 10, 'Mod error');

    // Call onModeratorComplete to finalize the round
    store.getState().onModeratorComplete();

    // isStreaming should be false after all errors
    expect(store.getState().isStreaming).toBe(false);
    expect(store.getState().phase).toBe(ChatPhases.COMPLETE);
  });

  it('should handle completeStreaming even during error state', () => {
    store.getState().startRound(0, 2);
    store.getState().initializeSubscriptions(0, 2);

    // Set error state
    store.getState().updateEntitySubscriptionStatus(0, 'error' as EntityStatus, 10);

    // completeStreaming should work
    store.getState().completeStreaming(0);

    expect(store.getState().isStreaming).toBe(false);
  });
});

// ============================================================================
// BUG 6: Message Parts Structure Validation
// Issue: appendEntityStreamingText assumes parts[0] has text field
// ============================================================================

describe('bUG 6: Message Parts Structure Validation', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createChatStore();
    const participants = createMockParticipants(2);
    const thread = createMockThread({ id: 'thread-parts' });
    store.setState({ participants, thread });
  });

  it('should handle appending to non-existent placeholder gracefully', () => {
    // Don't call startRound - no placeholders exist
    // Append should create a new placeholder, not crash
    expect(() => {
      store.getState().appendEntityStreamingText(1, 'Text', 0);
    }).not.toThrow();

    // Should have created a new placeholder
    const p1Msg = store.getState().messages.find(m => m.id === 'streaming_p1_r0');
    expect(p1Msg).toBeDefined();
    expect((p1Msg?.parts[0] as { text: string })?.text).toBe('Text');
  });

  it('should append to existing placeholder with text part', () => {
    store.getState().startRound(0, 2);

    // Placeholder was created with empty text part
    const p1MsgBefore = store.getState().messages.find(m => m.id === 'streaming_p1_r0');
    expect(p1MsgBefore?.parts[0]).toEqual({ text: '', type: 'text' });

    // Append should work
    store.getState().appendEntityStreamingText(1, 'Hello', 0);

    const p1MsgAfter = store.getState().messages.find(m => m.id === 'streaming_p1_r0');
    expect((p1MsgAfter?.parts[0] as { text: string })?.text).toBe('Hello');
  });

  it('should handle multiple sequential appends', () => {
    store.getState().startRound(0, 2);

    store.getState().appendEntityStreamingText(1, 'A', 0);
    store.getState().appendEntityStreamingText(1, 'B', 0);
    store.getState().appendEntityStreamingText(1, 'C', 0);

    const p1Msg = store.getState().messages.find(m => m.id === 'streaming_p1_r0');
    expect((p1Msg?.parts[0] as { text: string })?.text).toBe('ABC');
  });
});

// ============================================================================
// BUG 7: Placeholder Creation with Missing Thread
// Issue: createStreamingPlaceholders accesses draft.thread?.id
// If thread is null, moderator ID uses fallback but may cause issues
// ============================================================================

describe('bUG 7: Placeholder Creation Without Thread', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createChatStore();
    const participants = createMockParticipants(2);
    // NO thread set
    store.setState({ participants });
  });

  it('should create consistent IDs when thread is null', () => {
    // Create placeholders without thread
    store.getState().startRound(0, 2);

    const messages = store.getState().messages;

    // Check moderator placeholder exists with fallback ID
    const modPlaceholder = messages.find(m =>
      (m.metadata as Record<string, unknown>)?.isModerator === true,
    );

    expect(modPlaceholder).toBeDefined();
    // Should use fallback format
    expect(modPlaceholder?.id).toBe('streaming_moderator_r0');
  });

  it('should handle thread becoming available after placeholders created', () => {
    // Create placeholders without thread
    store.getState().startRound(0, 2);

    // Now set thread
    const thread = createMockThread({ id: 'late-thread' });
    store.setState({ thread });

    // Append to moderator
    store.getState().appendModeratorStreamingText('Text after thread set', 0);

    // Should still find and update the existing placeholder, not create new one
    const modMessages = store.getState().messages.filter(m =>
      (m.metadata as Record<string, unknown>)?.isModerator === true
      && (m.metadata as Record<string, unknown>)?.roundNumber === 0,
    );

    expect(modMessages).toHaveLength(1);
  });
});

// ============================================================================
// BUG 8: Subscription State with Mismatched Participant Count
// Issue: initializeSubscriptions creates N participant slots, but if
// actual participants array has different length, updates may fail
// ============================================================================

describe('bUG 8: Subscription/Participant Count Mismatch (FIXED)', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createChatStore();
    const participants = createMockParticipants(3);
    const thread = createMockThread({ id: 'thread-mismatch' });
    store.setState({ participants, thread });
  });

  it('should NOT create placeholders for non-existent participants', () => {
    // Initialize subscriptions for 5 participants when only 3 exist
    store.getState().startRound(0, 5);
    store.getState().initializeSubscriptions(0, 5);

    // Subscription state allows 5 slots (for tracking purposes)
    expect(store.getState().subscriptionState.participants).toHaveLength(5);

    // Subscription updates work for P4 slot
    expect(() => {
      store.getState().updateEntitySubscriptionStatus(4, 'streaming' as EntityStatus, 10);
    }).not.toThrow();
    expect(store.getState().subscriptionState.participants[4]?.status).toBe('streaming');

    // FIX VERIFIED: Attempting to stream text to P4 should be rejected
    // because P4 doesn't exist in participants array
    store.getState().appendEntityStreamingText(4, 'Text for P4', 0);
    const p4Msg = store.getState().messages.find(m => m.id === 'streaming_p4_r0');

    // No message should be created for non-existent participant
    expect(p4Msg).toBeUndefined();

    // Placeholders created by startRound should also respect bounds
    // P1 and P2 exist (index 1, 2 for 3 participants), P3+ don't
    const participantPlaceholders = store.getState().messages.filter(m =>
      m.id.startsWith('streaming_p'),
    );

    // Should only have P1 and P2 (not P3, P4)
    expect(participantPlaceholders).toHaveLength(2);
    expect(participantPlaceholders.find(m => m.id === 'streaming_p1_r0')).toBeDefined();
    expect(participantPlaceholders.find(m => m.id === 'streaming_p2_r0')).toBeDefined();
    expect(participantPlaceholders.find(m => m.id === 'streaming_p3_r0')).toBeUndefined();
    expect(participantPlaceholders.find(m => m.id === 'streaming_p4_r0')).toBeUndefined();
  });

  it('should handle fewer subscription slots than participants', () => {
    // Initialize subscriptions for 2 participants when 3 exist
    store.getState().startRound(0, 2);
    store.getState().initializeSubscriptions(0, 2);

    expect(store.getState().subscriptionState.participants).toHaveLength(2);

    // Try to update P2 (exists in participants but not in subscription state)
    // This should be handled gracefully
    expect(() => {
      store.getState().updateEntitySubscriptionStatus(2, 'streaming' as EntityStatus, 10);
    }).not.toThrow();

    // P2 slot doesn't exist in subscription state
    expect(store.getState().subscriptionState.participants[2]).toBeUndefined();

    // But we CAN still stream to P2 since it exists in participants array
    store.getState().appendEntityStreamingText(2, 'Text for P2', 0);
    const p2Msg = store.getState().messages.find(m => m.id === 'streaming_p2_r0');

    expect(p2Msg).toBeDefined();
    expect(p2Msg?.metadata?.model).not.toBe('unknown');
  });
});

// ============================================================================
// BUG 9: Phase Transition with Incomplete Subscription State
// Issue: onParticipantComplete checks subscriptionState.participants.every()
// but if participants array is empty, every() returns true
// ============================================================================

describe('bUG 9: Phase Transition with Empty Subscription State', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createChatStore();
    const participants = createMockParticipants(2);
    const thread = createMockThread({ id: 'thread-empty-sub' });
    store.setState({ participants, thread });
  });

  it('should NOT transition to MODERATOR if subscriptions not initialized', () => {
    // Start round but don't initialize subscriptions
    store.getState().startRound(0, 2);
    // Skip: store.getState().initializeSubscriptions(0, 2);

    // Subscription participants array is empty
    expect(store.getState().subscriptionState.participants).toHaveLength(0);

    // Call onParticipantComplete
    store.getState().onParticipantComplete(0);

    // BUG: With empty array, every() returns true, may cause premature transition
    // After fix, should NOT transition when subscriptions not initialized
    // This depends on the guard in onParticipantComplete
    expect(store.getState().phase).toBe(ChatPhases.PARTICIPANTS);
  });
});

// ============================================================================
// BUG 10: Concurrent Modifications During Streaming
// Issue: Multiple rapid updates could cause race conditions in immer draft
// ============================================================================

describe('bUG 10: Concurrent Streaming Modifications', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createChatStore();
    const participants = createMockParticipants(3);
    const thread = createMockThread({ id: 'thread-concurrent' });
    store.setState({ participants, thread });
    store.getState().startRound(0, 3);
    store.getState().initializeSubscriptions(0, 3);
  });

  it('should handle rapid text appends without losing data', () => {
    // Simulate rapid streaming chunks
    const chunks = Array.from({ length: 100 }, (_, i) => `chunk${i} `);

    chunks.forEach((chunk) => {
      store.getState().appendEntityStreamingText(1, chunk, 0);
    });

    const p1Msg = store.getState().messages.find(m => m.id === 'streaming_p1_r0');
    const text = (p1Msg?.parts[0] as { text: string })?.text || '';

    // All chunks should be present
    chunks.forEach((chunk) => {
      expect(text).toContain(chunk.trim());
    });

    // Total length should match
    const expectedLength = chunks.join('').length;
    expect(text).toHaveLength(expectedLength);
  });

  it('should handle interleaved appends to multiple participants', () => {
    // Interleaved updates to P1 and P2
    for (let i = 0; i < 50; i++) {
      store.getState().appendEntityStreamingText(1, `P1-${i} `, 0);
      store.getState().appendEntityStreamingText(2, `P2-${i} `, 0);
    }

    const p1Msg = store.getState().messages.find(m => m.id === 'streaming_p1_r0');
    const p2Msg = store.getState().messages.find(m => m.id === 'streaming_p2_r0');

    const p1Text = (p1Msg?.parts[0] as { text: string })?.text || '';
    const p2Text = (p2Msg?.parts[0] as { text: string })?.text || '';

    // Each should have 50 chunks
    expect(p1Text.split('P1-').length - 1).toBe(50);
    expect(p2Text.split('P2-').length - 1).toBe(50);

    // No cross-contamination
    expect(p1Text).not.toContain('P2-');
    expect(p2Text).not.toContain('P1-');
  });
});
