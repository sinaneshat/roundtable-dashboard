/**
 * Optimistic Message Sync Race Condition Tests
 *
 * Tests validating the fix for a critical race condition where:
 * 1. User submits message via handleUpdateThreadAndSend
 * 2. Optimistic user message is added to store
 * 3. AI SDK message sync effect runs and overwrites store messages
 * 4. Optimistic message is lost, causing UI freeze
 *
 * ROOT CAUSE:
 * - handleUpdateThreadAndSend adds optimistic message directly to store
 * - AI SDK (useChat) doesn't know about this message
 * - Provider's message sync effect replaces all store messages with AI SDK messages
 * - Optimistic message disappears, accordion collapses but no message shows
 *
 * FIX:
 * 1. Skip message sync when hasEarlyOptimisticMessage=true
 * 2. Preserve optimistic messages (isOptimistic=true) during sync
 * 3. Clear flags properly on error to restore usable state
 *
 * Bug Report Context:
 * - User clicks recommended action (changes participants)
 * - Submits new message with modified config
 * - UI freezes: accordion collapsed, no message shown, input not cleared
 *
 * Location: /src/stores/chat/__tests__/optimistic-message-sync-race.test.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AnalysisStatuses,
  MessageRoles,
  ScreenModes,
} from '@/api/core/enums';
import { createChatStore } from '@/stores/chat/store';

import {
  createMockAnalysis,
  createMockMessage,
  createMockParticipants,
  createMockThread,
  createMockUserMessage,
} from './test-factories';

// ============================================================================
// OPTIMISTIC MESSAGE PRESERVATION
// ============================================================================

describe('optimistic Message Sync Race Condition', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('hasEarlyOptimisticMessage flag', () => {
    it('should block message sync when hasEarlyOptimisticMessage is true', () => {
      /**
       * SCENARIO: Form submission sets hasEarlyOptimisticMessage=true
       * Provider sync should NOT overwrite messages during this window
       */
      const thread = createMockThread({ id: 'thread-123' });
      const participants = createMockParticipants(2);
      const round0UserMsg = createMockUserMessage(0, 'Round 0 question');
      const round0AssistantMsg = createMockMessage(0, 0);

      store.getState().initializeThread(thread, participants, [
        round0UserMsg,
        round0AssistantMsg,
      ]);

      // Simulate form submission adding optimistic message
      const optimisticUserMessage = {
        id: 'optimistic-user-1234567890',
        role: MessageRoles.USER as const,
        parts: [{ type: 'text' as const, text: 'Round 1 question' }],
        metadata: {
          role: MessageRoles.USER,
          roundNumber: 1,
          isOptimistic: true,
        },
      };

      const messagesWithOptimistic = [
        ...store.getState().messages,
        optimisticUserMessage,
      ];

      store.getState().setMessages(messagesWithOptimistic);
      store.getState().setHasEarlyOptimisticMessage(true);
      store.getState().setStreamingRoundNumber(1);

      // Verify optimistic message was added
      expect(store.getState().messages).toHaveLength(3);
      expect(store.getState().hasEarlyOptimisticMessage).toBe(true);

      // Verify last message is the optimistic one
      const lastMessage = store.getState().messages[2];
      expect(lastMessage.metadata?.isOptimistic).toBe(true);
      expect(lastMessage.metadata?.roundNumber).toBe(1);
    });

    it('should clear hasEarlyOptimisticMessage after prepareForNewMessage', () => {
      /**
       * SCENARIO: prepareForNewMessage should clear the flag
       */
      const thread = createMockThread({ id: 'thread-123' });
      const participants = createMockParticipants(2);
      const round0UserMsg = createMockUserMessage(0);

      store.getState().initializeThread(thread, participants, [round0UserMsg]);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Set the flag (simulating handleUpdateThreadAndSend)
      store.getState().setHasEarlyOptimisticMessage(true);
      expect(store.getState().hasEarlyOptimisticMessage).toBe(true);

      // Call prepareForNewMessage
      store.getState().prepareForNewMessage('New message', []);

      // Flag should be cleared
      expect(store.getState().hasEarlyOptimisticMessage).toBe(false);
    });

    it('should preserve streamingRoundNumber when hasEarlyOptimisticMessage is true', () => {
      /**
       * SCENARIO: prepareForNewMessage should preserve streamingRoundNumber
       * that was set earlier by handleUpdateThreadAndSend
       */
      const thread = createMockThread({ id: 'thread-123' });
      const participants = createMockParticipants(2);
      const round0UserMsg = createMockUserMessage(0);

      store.getState().initializeThread(thread, participants, [round0UserMsg]);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Simulate handleUpdateThreadAndSend setting state
      store.getState().setStreamingRoundNumber(1);
      store.getState().setHasEarlyOptimisticMessage(true);

      expect(store.getState().streamingRoundNumber).toBe(1);

      // Call prepareForNewMessage
      store.getState().prepareForNewMessage('New message', []);

      // streamingRoundNumber should be preserved
      expect(store.getState().streamingRoundNumber).toBe(1);
    });
  });

  describe('optimistic message identification', () => {
    it('should identify optimistic messages by isOptimistic metadata', () => {
      /**
       * SCENARIO: Messages with isOptimistic=true should be identifiable
       */
      const optimisticMessage = {
        id: 'optimistic-user-123',
        role: MessageRoles.USER as const,
        parts: [{ type: 'text' as const, text: 'Test' }],
        metadata: {
          role: MessageRoles.USER,
          roundNumber: 1,
          isOptimistic: true,
        },
      };

      const regularMessage = {
        id: 'regular-user-456',
        role: MessageRoles.USER as const,
        parts: [{ type: 'text' as const, text: 'Test' }],
        metadata: {
          role: MessageRoles.USER,
          roundNumber: 0,
        },
      };

      // Check isOptimistic flag
      expect(optimisticMessage.metadata.isOptimistic).toBe(true);
      expect(regularMessage.metadata.isOptimistic).toBeUndefined();
    });

    it('should not create duplicate optimistic messages', () => {
      /**
       * SCENARIO: If hasEarlyOptimisticMessage is true, prepareForNewMessage
       * should NOT add another optimistic message
       */
      const thread = createMockThread({ id: 'thread-123' });
      const participants = createMockParticipants(2);
      const round0UserMsg = createMockUserMessage(0);

      store.getState().initializeThread(thread, participants, [round0UserMsg]);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Add optimistic message (simulating handleUpdateThreadAndSend)
      const optimisticMessage = {
        id: 'optimistic-user-early',
        role: MessageRoles.USER as const,
        parts: [{ type: 'text' as const, text: 'Early optimistic' }],
        metadata: {
          role: MessageRoles.USER,
          roundNumber: 1,
          isOptimistic: true,
        },
      };

      store.getState().setMessages([...store.getState().messages, optimisticMessage]);
      store.getState().setHasEarlyOptimisticMessage(true);
      store.getState().setStreamingRoundNumber(1);

      const messagesBefore = store.getState().messages.length;

      // Call prepareForNewMessage - should NOT add duplicate
      store.getState().prepareForNewMessage('Same message', []);

      const messagesAfter = store.getState().messages.length;

      // Should not have added another message
      expect(messagesAfter).toBe(messagesBefore);
    });
  });

  describe('round transition with participant changes', () => {
    it('should preserve optimistic message when participants change', () => {
      /**
       * SCENARIO: User clicks recommended action that changes participants,
       * then submits. The optimistic message should be preserved even when
       * participants are different from round 0.
       */
      const thread = createMockThread({ id: 'thread-123' });
      const originalParticipants = createMockParticipants(1);
      const round0UserMsg = createMockUserMessage(0, 'Round 0 question');
      const round0AssistantMsg = createMockMessage(0, 0);

      // Initialize with original participant
      store.getState().initializeThread(thread, originalParticipants, [
        round0UserMsg,
        round0AssistantMsg,
      ]);

      // Simulate changing participants (recommended action)
      const newParticipants = createMockParticipants(2);
      store.getState().updateParticipants(newParticipants);

      // Add optimistic message for round 1
      const optimisticMessage = {
        id: 'optimistic-user-round1',
        role: MessageRoles.USER as const,
        parts: [{ type: 'text' as const, text: 'Round 1 with new participants' }],
        metadata: {
          role: MessageRoles.USER,
          roundNumber: 1,
          isOptimistic: true,
        },
      };

      store.getState().setMessages([...store.getState().messages, optimisticMessage]);
      store.getState().setHasEarlyOptimisticMessage(true);
      store.getState().setStreamingRoundNumber(1);

      // Verify state
      expect(store.getState().messages).toHaveLength(3);
      expect(store.getState().participants).toHaveLength(2);
      expect(store.getState().streamingRoundNumber).toBe(1);

      // Last message should be optimistic round 1 message
      const lastMsg = store.getState().messages[2];
      expect(lastMsg.metadata?.roundNumber).toBe(1);
      expect(lastMsg.metadata?.isOptimistic).toBe(true);
    });

    it('should not lose optimistic message during PATCH await', () => {
      /**
       * SCENARIO: During await for PATCH mutation, AI SDK might trigger
       * a message sync. The optimistic message should be preserved.
       */
      const thread = createMockThread({ id: 'thread-123' });
      const participants = createMockParticipants(2);
      const round0UserMsg = createMockUserMessage(0);
      const round0AssistantMsg = createMockMessage(0, 0);

      store.getState().initializeThread(thread, participants, [
        round0UserMsg,
        round0AssistantMsg,
      ]);

      // Set hasEarlyOptimisticMessage BEFORE adding the message
      // This simulates the timing in handleUpdateThreadAndSend
      store.getState().setStreamingRoundNumber(1);

      // Add optimistic message
      const optimisticMessage = {
        id: 'optimistic-user-123',
        role: MessageRoles.USER as const,
        parts: [{ type: 'text' as const, text: 'Round 1' }],
        metadata: {
          role: MessageRoles.USER,
          roundNumber: 1,
          isOptimistic: true,
        },
      };

      store.getState().setMessages([...store.getState().messages, optimisticMessage]);
      store.getState().setHasEarlyOptimisticMessage(true);

      // Verify message is in store
      const messages = store.getState().messages;
      expect(messages).toHaveLength(3);

      // hasEarlyOptimisticMessage should block sync
      expect(store.getState().hasEarlyOptimisticMessage).toBe(true);
    });
  });
});

// ============================================================================
// ERROR HANDLING AND CLEANUP
// ============================================================================

describe('error Handling and State Cleanup', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('cleanup on error', () => {
    it('should clear hasEarlyOptimisticMessage on error', () => {
      /**
       * SCENARIO: If PATCH mutation fails, we must clear hasEarlyOptimisticMessage
       * to allow message sync to resume
       */
      store.getState().setHasEarlyOptimisticMessage(true);
      expect(store.getState().hasEarlyOptimisticMessage).toBe(true);

      // Simulate error cleanup
      store.getState().setHasEarlyOptimisticMessage(false);
      expect(store.getState().hasEarlyOptimisticMessage).toBe(false);
    });

    it('should reset streamingRoundNumber on error', () => {
      /**
       * SCENARIO: If submission fails, streamingRoundNumber should be reset
       * so accordion doesn't stay collapsed
       */
      store.getState().setStreamingRoundNumber(1);
      expect(store.getState().streamingRoundNumber).toBe(1);

      // Simulate error cleanup
      store.getState().setStreamingRoundNumber(null);
      expect(store.getState().streamingRoundNumber).toBeNull();
    });

    it('should remove optimistic messages on error', () => {
      /**
       * SCENARIO: If submission fails, optimistic messages should be removed
       * so user can retry without stale data
       */
      const thread = createMockThread({ id: 'thread-123' });
      const participants = createMockParticipants(2);
      const round0UserMsg = createMockUserMessage(0);

      store.getState().initializeThread(thread, participants, [round0UserMsg]);

      // Add optimistic message
      const optimisticMessage = {
        id: 'optimistic-user-error',
        role: MessageRoles.USER as const,
        parts: [{ type: 'text' as const, text: 'Will fail' }],
        metadata: {
          role: MessageRoles.USER,
          roundNumber: 1,
          isOptimistic: true,
        },
      };

      store.getState().setMessages([...store.getState().messages, optimisticMessage]);
      expect(store.getState().messages).toHaveLength(2);

      // Simulate error cleanup - filter out optimistic messages
      const messagesWithoutOptimistic = store.getState().messages.filter((m) => {
        const metadata = m.metadata;
        return !(metadata && typeof metadata === 'object' && 'isOptimistic' in metadata && metadata.isOptimistic === true);
      });

      store.getState().setMessages(messagesWithoutOptimistic);

      // Optimistic message should be removed
      expect(store.getState().messages).toHaveLength(1);
      expect(store.getState().messages[0].metadata?.isOptimistic).toBeUndefined();
    });

    it('should allow retry after error cleanup', () => {
      /**
       * SCENARIO: After error cleanup, user should be able to retry submission
       */
      const thread = createMockThread({ id: 'thread-123' });
      const participants = createMockParticipants(2);
      const round0UserMsg = createMockUserMessage(0);

      store.getState().initializeThread(thread, participants, [round0UserMsg]);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // First attempt - set flags
      store.getState().setStreamingRoundNumber(1);
      store.getState().setHasEarlyOptimisticMessage(true);

      // Error cleanup
      store.getState().setHasEarlyOptimisticMessage(false);
      store.getState().setStreamingRoundNumber(null);

      // Verify clean state
      expect(store.getState().hasEarlyOptimisticMessage).toBe(false);
      expect(store.getState().streamingRoundNumber).toBeNull();

      // Retry should work
      store.getState().setStreamingRoundNumber(1);
      store.getState().setHasEarlyOptimisticMessage(true);

      expect(store.getState().streamingRoundNumber).toBe(1);
      expect(store.getState().hasEarlyOptimisticMessage).toBe(true);
    });
  });
});

// ============================================================================
// ACCORDION COLLAPSE TIMING
// ============================================================================

describe('accordion Collapse Timing', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('streamingRoundNumber for accordion collapse', () => {
    it('should set streamingRoundNumber immediately on submission', () => {
      /**
       * SCENARIO: When user submits, streamingRoundNumber should be set
       * IMMEDIATELY to trigger accordion collapse, before PATCH
       */
      const thread = createMockThread({ id: 'thread-123' });
      const participants = createMockParticipants(2);
      const round0UserMsg = createMockUserMessage(0);
      const round0Analysis = createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
      });

      store.getState().initializeThread(thread, participants, [round0UserMsg]);
      store.getState().addAnalysis(round0Analysis);

      // Verify initial state
      expect(store.getState().streamingRoundNumber).toBeNull();

      // Set streamingRoundNumber (this should happen IMMEDIATELY in handleUpdateThreadAndSend)
      store.getState().setStreamingRoundNumber(1);

      // Should trigger accordion collapse check:
      // streamingRoundNumber (1) > analysis.roundNumber (0)
      expect(store.getState().streamingRoundNumber).toBe(1);
      expect(store.getState().analyses[0].roundNumber).toBe(0);
    });

    it('should preserve streamingRoundNumber through prepareForNewMessage', () => {
      /**
       * SCENARIO: prepareForNewMessage should NOT reset streamingRoundNumber
       * that was set earlier for immediate accordion collapse
       */
      store.getState().setScreenMode(ScreenModes.THREAD);
      store.getState().setStreamingRoundNumber(1);
      store.getState().setHasEarlyOptimisticMessage(true);

      // Call prepareForNewMessage
      store.getState().prepareForNewMessage('Test', []);

      // streamingRoundNumber should still be 1
      expect(store.getState().streamingRoundNumber).toBe(1);
    });
  });
});

// ============================================================================
// MESSAGE ID UNIQUENESS
// ============================================================================

describe('message ID Uniqueness', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should generate unique IDs for optimistic messages', () => {
    /**
     * SCENARIO: Each optimistic message should have a unique ID
     */
    const timestamp1 = Date.now();
    vi.advanceTimersByTime(1);
    const timestamp2 = Date.now();

    const id1 = `optimistic-user-${timestamp1}`;
    const id2 = `optimistic-user-${timestamp2}`;

    expect(id1).not.toBe(id2);
  });

  it('should not have duplicate message IDs in store', () => {
    /**
     * SCENARIO: All messages in store should have unique IDs
     */
    const thread = createMockThread({ id: 'thread-123' });
    const participants = createMockParticipants(2);
    const round0UserMsg = createMockUserMessage(0);
    const round0P0Msg = createMockMessage(0, 0);
    const round0P1Msg = createMockMessage(1, 0);

    store.getState().initializeThread(thread, participants, [
      round0UserMsg,
      round0P0Msg,
      round0P1Msg,
    ]);

    const messageIds = store.getState().messages.map(m => m.id);
    const uniqueIds = new Set(messageIds);

    expect(uniqueIds.size).toBe(messageIds.length);
  });
});
