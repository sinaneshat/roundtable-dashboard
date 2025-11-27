/**
 * Overview to Thread Navigation Tests
 *
 * Tests validating the critical flow when:
 * 1. User starts chat on overview screen (round 0)
 * 2. Round 0 completes (participants stream, analysis created)
 * 3. User navigates to thread screen
 * 4. User sends second message (should be round 1, not round 0)
 *
 * ROOT CAUSE OF BUG:
 * When navigating from overview to thread screen, the store messages
 * must be preserved (not overwritten by SSR initialMessages).
 * If messages are lost, calculateNextRoundNumber returns 0 instead of 1.
 *
 * CRITICAL INVARIANTS:
 * 1. Messages from overview screen MUST be preserved during navigation
 * 2. calculateNextRoundNumber MUST return maxRound + 1 (1 after round 0)
 * 3. Backend MUST reject requests that try to create round 0 twice (409 Conflict)
 * 4. Participant order MUST follow selection/priority order (0, 1, 2...)
 *
 * Location: /src/stores/chat/__tests__/overview-to-thread-navigation.test.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AnalysisStatuses,
  MessagePartTypes,
  MessageRoles,
  ScreenModes,
} from '@/api/core/enums';
import { getRoundNumber } from '@/lib/utils/metadata';
import { calculateNextRoundNumber, getMaxRoundNumber, groupMessagesByRound } from '@/lib/utils/round-utils';
import { createChatStore } from '@/stores/chat/store';

import {
  createMockAnalysis,
  createMockMessage,
  createMockParticipants,
  createMockThread,
  createMockUserMessage,
} from './test-factories';

// ============================================================================
// MESSAGE PRESERVATION DURING NAVIGATION
// ============================================================================

describe('overview to Thread Navigation - Message Preservation', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('initializeThread message preservation', () => {
    it('should preserve store messages when navigating from overview to thread (same thread)', () => {
      /**
       * SCENARIO: User completes round 0 on overview, navigates to thread screen
       * Thread screen receives SSR initialMessages (potentially stale)
       * Store should preserve the messages from overview (more complete)
       */
      const thread = createMockThread({ id: 'thread-123' });
      const participants = createMockParticipants(2);
      const round0UserMsg = createMockUserMessage(0, 'Round 0 question');
      const round0P0Msg = createMockMessage(0, 0);
      const round0P1Msg = createMockMessage(1, 0);

      // Simulate overview screen: set createdThreadId and messages
      store.getState().setCreatedThreadId(thread.id);
      store.getState().setMessages([round0UserMsg, round0P0Msg, round0P1Msg]);

      // Verify overview screen state
      expect(store.getState().createdThreadId).toBe(thread.id);
      expect(store.getState().messages).toHaveLength(3);

      // Simulate navigation to thread screen with SSR initialMessages (potentially stale)
      // SSR fetch might have happened before all messages were saved
      const ssrMessages = [round0UserMsg]; // Only has user message (stale)

      // Thread screen calls initializeThread
      store.getState().initializeThread(thread, participants, ssrMessages);

      // Store messages should be PRESERVED (not overwritten by stale SSR data)
      expect(store.getState().messages).toHaveLength(3);
      expect(store.getState().thread?.id).toBe(thread.id);
    });

    it('should preserve store messages when SSR has same messages', () => {
      /**
       * SCENARIO: SSR has identical messages to store (normal case)
       */
      const thread = createMockThread({ id: 'thread-123' });
      const participants = createMockParticipants(2);
      const round0UserMsg = createMockUserMessage(0);
      const round0P0Msg = createMockMessage(0, 0);
      const round0P1Msg = createMockMessage(1, 0);

      const messages = [round0UserMsg, round0P0Msg, round0P1Msg];

      // Set initial state from overview
      store.getState().setCreatedThreadId(thread.id);
      store.getState().setMessages(messages);

      // Thread screen with same messages
      store.getState().initializeThread(thread, participants, messages);

      // Should still have all 3 messages
      expect(store.getState().messages).toHaveLength(3);
    });

    it('should use SSR messages when store is empty (fresh page load)', () => {
      /**
       * SCENARIO: User directly loads thread page (no overview state)
       * Store is empty, should use SSR initialMessages
       */
      const thread = createMockThread({ id: 'thread-123' });
      const participants = createMockParticipants(2);
      const round0UserMsg = createMockUserMessage(0);
      const round0P0Msg = createMockMessage(0, 0);
      const round0P1Msg = createMockMessage(1, 0);

      const ssrMessages = [round0UserMsg, round0P0Msg, round0P1Msg];

      // No prior state - direct page load
      expect(store.getState().messages).toHaveLength(0);

      // Thread screen initializes with SSR messages
      store.getState().initializeThread(thread, participants, ssrMessages);

      // Should have all SSR messages
      expect(store.getState().messages).toHaveLength(3);
    });

    it('should use SSR messages when navigating to DIFFERENT thread', () => {
      /**
       * SCENARIO: User was on thread-A, navigates to thread-B
       * Store has messages from thread-A, should use thread-B SSR messages
       */
      const threadA = createMockThread({ id: 'thread-A' });
      const threadB = createMockThread({ id: 'thread-B' });
      const participants = createMockParticipants(2);

      // Thread-A messages
      const threadAMsg = createMockUserMessage(0, 'Thread A question');

      // Thread-B messages (from SSR)
      const threadBMsg = createMockUserMessage(0, 'Thread B question');

      // Set state from thread-A
      store.getState().setCreatedThreadId(threadA.id);
      store.getState().setMessages([threadAMsg]);

      // Navigate to thread-B (different thread)
      store.getState().initializeThread(threadB, participants, [threadBMsg]);

      // Should have thread-B messages (not thread-A)
      expect(store.getState().messages).toHaveLength(1);
      expect(store.getState().messages[0]).toBe(threadBMsg);
      expect(store.getState().thread?.id).toBe(threadB.id);
    });
  });
});

// ============================================================================
// ROUND NUMBER CALCULATION
// ============================================================================

describe('round Number Calculation', () => {
  // NOTE: These tests validate pure utility functions that don't require store state
  // The store is only needed in tests that exercise store actions

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('calculateNextRoundNumber', () => {
    it('should return 0 when no messages exist', () => {
      /**
       * First round should be round 0 (0-based indexing)
       */
      const nextRound = calculateNextRoundNumber([]);
      expect(nextRound).toBe(0);
    });

    it('should return 1 when round 0 exists', () => {
      /**
       * CRITICAL: After round 0 completes, next round should be 1
       */
      const round0UserMsg = createMockUserMessage(0, 'Round 0 question');
      const round0P0Msg = createMockMessage(0, 0);
      const round0P1Msg = createMockMessage(1, 0);

      const messages = [round0UserMsg, round0P0Msg, round0P1Msg];
      const nextRound = calculateNextRoundNumber(messages);

      expect(nextRound).toBe(1);
    });

    it('should return 2 when rounds 0 and 1 exist', () => {
      const round0UserMsg = createMockUserMessage(0);
      const round0AssistantMsg = createMockMessage(0, 0);
      const round1UserMsg = createMockUserMessage(1);
      const round1AssistantMsg = createMockMessage(0, 1);

      const messages = [round0UserMsg, round0AssistantMsg, round1UserMsg, round1AssistantMsg];
      const nextRound = calculateNextRoundNumber(messages);

      expect(nextRound).toBe(2);
    });

    it('should only count user messages for round calculation', () => {
      /**
       * Round number is determined by user messages, not assistant messages
       */
      const round0UserMsg = createMockUserMessage(0);
      // Only assistant messages for round 1 (incomplete round)
      const round1AssistantMsg = createMockMessage(0, 1);

      const messages = [round0UserMsg, round1AssistantMsg];
      const nextRound = calculateNextRoundNumber(messages);

      // Should still be 1, as no user message for round 1 exists
      expect(nextRound).toBe(1);
    });

    it('should handle messages with missing metadata gracefully', () => {
      /**
       * Messages without roundNumber metadata should not break calculation
       * ✅ TYPE-SAFE: Use proper enum values (not string literals with 'as const')
       */
      const msgWithMetadata = createMockUserMessage(0);
      const msgWithoutMetadata = {
        id: 'msg-no-metadata',
        role: MessageRoles.USER,
        parts: [{ type: MessagePartTypes.TEXT, text: 'No metadata' }],
        metadata: {}, // Empty metadata
      };

      const messages = [msgWithMetadata, msgWithoutMetadata];
      const nextRound = calculateNextRoundNumber(messages);

      // Should return 1 (based on the message with valid metadata)
      expect(nextRound).toBe(1);
    });
  });

  describe('getMaxRoundNumber', () => {
    it('should return max round from all messages', () => {
      const round0UserMsg = createMockUserMessage(0);
      const round0AssistantMsg = createMockMessage(0, 0);
      const round1UserMsg = createMockUserMessage(1);
      const round1AssistantMsg = createMockMessage(0, 1);
      const round2UserMsg = createMockUserMessage(2);

      const messages = [
        round0UserMsg,
        round0AssistantMsg,
        round1UserMsg,
        round1AssistantMsg,
        round2UserMsg,
      ];

      const maxRound = getMaxRoundNumber(messages);
      expect(maxRound).toBe(2);
    });
  });

  describe('groupMessagesByRound', () => {
    it('should correctly group messages by round', () => {
      const round0UserMsg = createMockUserMessage(0, 'R0 question');
      const round0P0Msg = createMockMessage(0, 0);
      const round0P1Msg = createMockMessage(1, 0);
      const round1UserMsg = createMockUserMessage(1, 'R1 question');
      const round1P0Msg = createMockMessage(0, 1);

      const messages = [round0UserMsg, round0P0Msg, round0P1Msg, round1UserMsg, round1P0Msg];
      const grouped = groupMessagesByRound(messages);

      expect(grouped.get(0)?.length).toBe(3);
      expect(grouped.get(1)?.length).toBe(2);
    });
  });
});

// ============================================================================
// SECOND MESSAGE SUBMISSION (ROUND 1)
// ============================================================================

describe('second Message Submission', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('prepareForNewMessage after round 0', () => {
    it('should calculate correct round number for second message', () => {
      /**
       * CRITICAL TEST: After round 0 completes, second message should be round 1
       * This is the exact scenario that caused the bug
       */
      const thread = createMockThread({ id: 'thread-123' });
      const participants = createMockParticipants(2);
      const round0UserMsg = createMockUserMessage(0, 'Round 0 question');
      const round0P0Msg = createMockMessage(0, 0);
      const round0P1Msg = createMockMessage(1, 0);

      // Initialize with round 0 messages
      store.getState().initializeThread(thread, participants, [
        round0UserMsg,
        round0P0Msg,
        round0P1Msg,
      ]);

      // Set screen mode to thread (important for prepareForNewMessage)
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Verify round 0 messages exist
      expect(store.getState().messages).toHaveLength(3);

      // Calculate next round number (simulating handleUpdateThreadAndSend logic)
      const nextRound = calculateNextRoundNumber(store.getState().messages);

      // CRITICAL ASSERTION: Next round should be 1, not 0
      expect(nextRound).toBe(1);
    });

    it('should not lose round 0 messages when preparing round 1', () => {
      /**
       * Preparing for round 1 should not clear round 0 messages
       */
      const thread = createMockThread({ id: 'thread-123' });
      const participants = createMockParticipants(2);
      const round0UserMsg = createMockUserMessage(0);
      const round0P0Msg = createMockMessage(0, 0);

      store.getState().initializeThread(thread, participants, [round0UserMsg, round0P0Msg]);
      store.getState().setScreenMode(ScreenModes.THREAD);

      const messagesBefore = store.getState().messages.length;

      // Prepare for new message (round 1)
      store.getState().prepareForNewMessage('Round 1 question', ['participant-1']);

      // Round 0 messages should still exist
      const messagesAfter = store.getState().messages;
      expect(messagesAfter.length).toBeGreaterThanOrEqual(messagesBefore);

      // Verify round 0 messages are still there
      // ✅ TYPE-SAFE: Use getRoundNumber utility instead of unsafe type cast
      const round0Messages = messagesAfter.filter(
        m => getRoundNumber(m.metadata) === 0,
      );
      expect(round0Messages.length).toBeGreaterThanOrEqual(2);
    });
  });
});

// ============================================================================
// PARTICIPANT ORDER
// ============================================================================

describe('participant Order', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('participant priority assignment', () => {
    it('should assign sequential priorities starting from 0', () => {
      /**
       * Participants should have priorities: 0, 1, 2, ...
       * This determines streaming order (top to bottom)
       */
      const participants = createMockParticipants(3);

      expect(participants[0].priority).toBe(0);
      expect(participants[1].priority).toBe(1);
      expect(participants[2].priority).toBe(2);
    });

    it('should preserve priority order after adding participant', () => {
      /**
       * When adding a new participant, it should get the next priority
       */
      store.getState().addParticipant({
        id: 'participant-1',
        modelId: 'model-1',
        role: '',
        priority: 0,
      });

      store.getState().addParticipant({
        id: 'participant-2',
        modelId: 'model-2',
        role: '',
        priority: 1,
      });

      const participants = store.getState().selectedParticipants;

      expect(participants[0].priority).toBe(0);
      expect(participants[1].priority).toBe(1);
    });

    it('should reindex priorities after removing participant', () => {
      /**
       * When removing a participant, remaining participants should be reindexed
       */
      store.getState().setSelectedParticipants([
        { id: 'p1', modelId: 'model-1', role: '', priority: 0 },
        { id: 'p2', modelId: 'model-2', role: '', priority: 1 },
        { id: 'p3', modelId: 'model-3', role: '', priority: 2 },
      ]);

      // Remove middle participant
      store.getState().removeParticipant('p2');

      const participants = store.getState().selectedParticipants;

      // Priorities should be reindexed: 0, 1
      expect(participants).toHaveLength(2);
      expect(participants[0].priority).toBe(0);
      expect(participants[1].priority).toBe(1);
    });

    it('should reindex priorities after reordering', () => {
      /**
       * After drag-drop reorder, priorities should match new visual order
       */
      store.getState().setSelectedParticipants([
        { id: 'p1', modelId: 'model-1', role: '', priority: 0 },
        { id: 'p2', modelId: 'model-2', role: '', priority: 1 },
        { id: 'p3', modelId: 'model-3', role: '', priority: 2 },
      ]);

      // Reorder: move first to last (0 -> 2)
      store.getState().reorderParticipants(0, 2);

      const participants = store.getState().selectedParticipants;

      // After moving p1 to end: p2(0), p3(1), p1(2)
      expect(participants[0].modelId).toBe('model-2');
      expect(participants[0].priority).toBe(0);
      expect(participants[1].modelId).toBe('model-3');
      expect(participants[1].priority).toBe(1);
      expect(participants[2].modelId).toBe('model-1');
      expect(participants[2].priority).toBe(2);
    });
  });

  describe('streaming order follows priority', () => {
    it('should have participants ordered by priority for streaming', () => {
      /**
       * When streaming starts, participants with lower priority should go first
       * Priority 0 = first to stream (top of list)
       * Priority 1 = second to stream
       * etc.
       */
      const thread = createMockThread({ id: 'thread-123' });
      const participants = createMockParticipants(3);

      store.getState().initializeThread(thread, participants);

      const storeParticipants = store.getState().participants;

      // Participants should be sorted by priority (ascending)
      expect(storeParticipants[0].priority).toBe(0);
      expect(storeParticipants[1].priority).toBe(1);
      expect(storeParticipants[2].priority).toBe(2);

      // First participant (priority 0) should stream first
      expect(storeParticipants[0].priority).toBeLessThan(storeParticipants[1].priority);
    });
  });
});

// ============================================================================
// THREAD STATE RESET
// ============================================================================

describe('thread State Reset', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('resetThreadState', () => {
    it('should NOT clear messages (preserves conversation)', () => {
      /**
       * resetThreadState is called during navigation but should NOT clear messages
       * This is critical for preserving the conversation when moving between screens
       */
      const thread = createMockThread({ id: 'thread-123' });
      const participants = createMockParticipants(2);
      const messages = [createMockUserMessage(0), createMockMessage(0, 0)];

      store.getState().initializeThread(thread, participants, messages);
      expect(store.getState().messages).toHaveLength(2);

      // Reset thread state (happens on navigation)
      store.getState().resetThreadState();

      // Messages should still be there!
      expect(store.getState().messages).toHaveLength(2);
    });

    it('should clear streaming flags', () => {
      /**
       * Streaming flags should be cleared to allow new streaming
       */
      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(1);
      store.getState().setWaitingToStartStreaming(true);

      store.getState().resetThreadState();

      expect(store.getState().isStreaming).toBe(false);
      expect(store.getState().streamingRoundNumber).toBeNull();
      expect(store.getState().waitingToStartStreaming).toBe(false);
    });
  });

  describe('resetForThreadNavigation', () => {
    it('should clear ALL thread data (for navigating to different thread)', () => {
      /**
       * When navigating to a DIFFERENT thread, all data should be cleared
       * This prevents stale data from leaking between threads
       */
      const thread = createMockThread({ id: 'thread-123' });
      const participants = createMockParticipants(2);
      const messages = [createMockUserMessage(0)];

      store.getState().initializeThread(thread, participants, messages);
      expect(store.getState().messages).toHaveLength(1);
      expect(store.getState().thread?.id).toBe('thread-123');

      // Navigate to different thread - reset everything
      store.getState().resetForThreadNavigation();

      // All thread data should be cleared
      expect(store.getState().messages).toHaveLength(0);
      expect(store.getState().thread).toBeNull();
      expect(store.getState().participants).toHaveLength(0);
    });
  });
});

// ============================================================================
// ANALYSIS STATE DURING NAVIGATION
// ============================================================================

describe('analysis State During Navigation', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should preserve analyses when navigating from overview to thread', () => {
    /**
     * Round 0 analysis created on overview should persist on thread screen
     */
    const thread = createMockThread({ id: 'thread-123' });
    const participants = createMockParticipants(2);
    const analysis = createMockAnalysis({
      threadId: thread.id,
      roundNumber: 0,
      status: AnalysisStatuses.COMPLETE,
    });

    // Simulate overview: add analysis
    store.getState().setCreatedThreadId(thread.id);
    store.getState().addAnalysis(analysis);

    expect(store.getState().analyses).toHaveLength(1);

    // Navigate to thread (initializeThread does NOT clear analyses)
    const messages = [createMockUserMessage(0), createMockMessage(0, 0)];
    store.getState().initializeThread(thread, participants, messages);

    // Analysis should still exist
    expect(store.getState().analyses).toHaveLength(1);
    expect(store.getState().analyses[0].roundNumber).toBe(0);
  });
});
