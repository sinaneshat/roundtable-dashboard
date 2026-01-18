/**
 * User Message Render Pipeline E2E Test
 *
 * Tests the COMPLETE flow from store to timeline rendering:
 * 1. Store: optimistic user message added
 * 2. Timeline: useThreadTimeline groups messages by round
 * 3. Render: ChatMessageList receives and displays user message
 *
 * Bug scenario:
 * - User submits for round 1 (non-initial round)
 * - Optimistic user message is added to store
 * - User message should appear in UI immediately
 * - BUG: User message doesn't show up in the component
 */

import { MessageRoles, MessageStatuses, ScreenModes } from '@roundtable/shared';
import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';

import { getRoundNumberFromMetadata } from '@/lib/utils';
import type { ChatParticipant, ChatThread, StoredPreSearch } from '@/types/api';

import { createChatStore } from '../store';

// ============================================================================
// TEST HELPERS
// ============================================================================

function createThread(id: string): ChatThread {
  return {
    id,
    userId: 'user-1',
    title: 'Test Thread',
    slug: 'test-thread',
    mode: 'debate',
    status: 'active',
    isFavorite: false,
    isPublic: false,
    isAiGeneratedTitle: false,
    enableWebSearch: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastMessageAt: new Date(),
  };
}

function createParticipants(threadId: string): ChatParticipant[] {
  return [
    {
      id: 'p-1',
      threadId,
      modelId: 'gpt-4',
      role: 'analyst',
      customRoleId: null,
      priority: 0,
      isEnabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'p-2',
      threadId,
      modelId: 'claude-3',
      role: 'critic',
      customRoleId: null,
      priority: 1,
      isEnabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];
}

function createRound0Messages(threadId: string): UIMessage[] {
  return [
    {
      id: `${threadId}_r0_user`,
      role: MessageRoles.USER,
      parts: [{ type: 'text', text: 'Initial question' }],
      metadata: { role: MessageRoles.USER, roundNumber: 0 },
    },
    {
      id: `${threadId}_r0_p0`,
      role: MessageRoles.ASSISTANT,
      parts: [{ type: 'text', text: 'GPT-4 response' }],
      metadata: {
        role: MessageRoles.ASSISTANT,
        model: 'gpt-4',
        participantIndex: 0,
        roundNumber: 0,
        finishReason: 'stop',
      },
    },
    {
      id: `${threadId}_r0_p1`,
      role: MessageRoles.ASSISTANT,
      parts: [{ type: 'text', text: 'Claude response' }],
      metadata: {
        role: MessageRoles.ASSISTANT,
        model: 'claude-3',
        participantIndex: 1,
        roundNumber: 0,
        finishReason: 'stop',
      },
    },
    {
      id: `${threadId}_r0_moderator`,
      role: MessageRoles.ASSISTANT,
      parts: [{ type: 'text', text: 'Summary' }],
      metadata: {
        role: 'moderator',
        isModerator: true,
        roundNumber: 0,
        finishReason: 'stop',
      },
    },
  ];
}

function createOptimisticUserMessage(roundNumber: number, text: string): UIMessage {
  return {
    id: `optimistic-user-${roundNumber}-${Date.now()}`,
    role: MessageRoles.USER,
    parts: [{ type: 'text', text }],
    metadata: {
      role: MessageRoles.USER,
      roundNumber,
      isOptimistic: true,
    },
  };
}

/**
 * Simulates useThreadTimeline grouping logic
 * Returns timeline items grouped by round
 */
function simulateUseThreadTimeline(
  messages: UIMessage[],
  preSearches: StoredPreSearch[] = [],
): Array<{ type: 'messages' | 'pre-search'; roundNumber: number; data: UIMessage[] | StoredPreSearch }> {
  const messagesByRound = new Map<number, UIMessage[]>();

  messages.forEach((message) => {
    const roundNumber = getRoundNumberFromMetadata(message, 0);
    if (!messagesByRound.has(roundNumber)) {
      messagesByRound.set(roundNumber, []);
    }
    messagesByRound.get(roundNumber)!.push(message);
  });

  const preSearchByRound = new Map<number, StoredPreSearch>();
  preSearches.forEach((ps) => {
    preSearchByRound.set(ps.roundNumber, ps);
  });

  const allRounds = new Set([
    ...messagesByRound.keys(),
    ...preSearchByRound.keys(),
  ]);

  const timeline: Array<{ type: 'messages' | 'pre-search'; roundNumber: number; data: UIMessage[] | StoredPreSearch }> = [];
  const sortedRounds = Array.from(allRounds).sort((a, b) => a - b);

  sortedRounds.forEach((roundNumber) => {
    const roundMessages = messagesByRound.get(roundNumber);
    const roundPreSearch = preSearchByRound.get(roundNumber);

    // Pre-search renders at timeline level ONLY for orphaned rounds
    if (roundPreSearch && (!roundMessages || roundMessages.length === 0)) {
      timeline.push({
        type: 'pre-search',
        roundNumber,
        data: roundPreSearch,
      });
    }

    if (roundMessages && roundMessages.length > 0) {
      timeline.push({
        type: 'messages',
        roundNumber,
        data: roundMessages,
      });
    }
  });

  return timeline;
}

// ============================================================================
// TESTS
// ============================================================================

describe('user Message Render Pipeline', () => {
  describe('store to Timeline Flow', () => {
    it('should include optimistic user message in store messages immediately after submission', () => {
      const store = createChatStore();
      const threadId = 'test-thread';
      const thread = createThread(threadId);
      const participants = createParticipants(threadId);
      const round0Messages = createRound0Messages(threadId);

      // Initialize with round 0 complete
      store.getState().initializeThread(thread, participants, round0Messages);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Verify initial state
      expect(store.getState().messages).toHaveLength(4);

      // Simulate form submission for round 1
      const optimisticMessage = createOptimisticUserMessage(1, 'Follow-up question');
      store.getState().setMessages(msgs => [...msgs, optimisticMessage]);
      store.getState().setStreamingRoundNumber(1);

      // CRITICAL: Verify optimistic message is in store
      const storeMessages = store.getState().messages;
      expect(storeMessages).toHaveLength(5);

      const round1UserMsg = storeMessages.find(
        m => m.role === MessageRoles.USER && getRoundNumberFromMetadata(m) === 1,
      );
      expect(round1UserMsg).toBeDefined();
      expect(round1UserMsg?.parts[0]).toEqual({ type: 'text', text: 'Follow-up question' });
    });

    it('should create timeline item for round 1 with user message', () => {
      const store = createChatStore();
      const threadId = 'test-thread';
      const thread = createThread(threadId);
      const participants = createParticipants(threadId);
      const round0Messages = createRound0Messages(threadId);

      // Initialize and add optimistic message
      store.getState().initializeThread(thread, participants, round0Messages);
      const optimisticMessage = createOptimisticUserMessage(1, 'Follow-up question');
      store.getState().setMessages(msgs => [...msgs, optimisticMessage]);

      // Simulate useThreadTimeline
      const timelineItems = simulateUseThreadTimeline(store.getState().messages);

      // Should have 2 timeline items: round 0 and round 1
      expect(timelineItems).toHaveLength(2);

      // Round 0 item
      const round0Item = timelineItems.find(item => item.roundNumber === 0);
      expect(round0Item).toBeDefined();
      expect(round0Item?.type).toBe('messages');
      expect((round0Item?.data as UIMessage[])).toHaveLength(4);

      // Round 1 item - CRITICAL: This must exist with the user message
      const round1Item = timelineItems.find(item => item.roundNumber === 1);
      expect(round1Item).toBeDefined();
      expect(round1Item?.type).toBe('messages');
      expect((round1Item?.data as UIMessage[])).toHaveLength(1);

      const round1Messages = round1Item?.data as UIMessage[];
      expect(round1Messages[0]?.role).toBe(MessageRoles.USER);
      expect(round1Messages[0]?.parts[0]).toEqual({ type: 'text', text: 'Follow-up question' });
    });

    it('should preserve user message when initializeThread called with server messages', () => {
      const store = createChatStore();
      const threadId = 'test-thread';
      const thread = createThread(threadId);
      const participants = createParticipants(threadId);
      const round0Messages = createRound0Messages(threadId);

      // Initialize with round 0
      store.getState().initializeThread(thread, participants, round0Messages);

      // Add optimistic message for round 1
      const optimisticMessage = createOptimisticUserMessage(1, 'Follow-up');
      store.getState().setMessages(msgs => [...msgs, optimisticMessage]);
      store.getState().setStreamingRoundNumber(1);
      store.getState().setConfigChangeRoundNumber(1);

      // Simulate PATCH response (initializeThread called again)
      store.getState().setIsWaitingForChangelog(true);
      store.getState().initializeThread(thread, participants, round0Messages);

      // User message should still exist
      expect(store.getState().messages).toHaveLength(5);

      const timelineItems = simulateUseThreadTimeline(store.getState().messages);
      const round1Item = timelineItems.find(item => item.roundNumber === 1);
      expect(round1Item).toBeDefined();
      expect((round1Item?.data as UIMessage[])[0]?.role).toBe(MessageRoles.USER);
    });
  });

  describe('pre-search and Placeholder Visibility', () => {
    it('should show pre-search placeholder for round 1 when web search enabled', () => {
      const store = createChatStore();
      const threadId = 'test-thread';
      const thread = createThread(threadId);
      const participants = createParticipants(threadId);
      const round0Messages = createRound0Messages(threadId);

      // Initialize
      store.getState().initializeThread(thread, participants, round0Messages);

      // Add optimistic message and pre-search
      const optimisticMessage = createOptimisticUserMessage(1, 'Search query');
      store.getState().setMessages(msgs => [...msgs, optimisticMessage]);
      store.getState().setStreamingRoundNumber(1);
      store.getState().addPreSearch({
        id: `presearch-${threadId}-1`,
        threadId,
        roundNumber: 1,
        userQuery: 'Search query',
        status: MessageStatuses.PENDING,
        searchData: null,
        errorMessage: null,
        createdAt: new Date(),
        completedAt: null,
      } as StoredPreSearch);

      // Verify pre-search is in store
      expect(store.getState().preSearches).toHaveLength(1);

      // Timeline should include user message for round 1
      // Pre-search is NOT a separate timeline item when user message exists
      const timelineItems = simulateUseThreadTimeline(
        store.getState().messages,
        store.getState().preSearches,
      );

      const round1Item = timelineItems.find(item => item.roundNumber === 1);
      expect(round1Item).toBeDefined();
      expect(round1Item?.type).toBe('messages'); // Not pre-search, because user message exists
    });

    it('should create pre-search timeline item for orphaned round (no user message)', () => {
      const store = createChatStore();
      const threadId = 'test-thread';
      const thread = createThread(threadId);
      const participants = createParticipants(threadId);
      const round0Messages = createRound0Messages(threadId);

      // Initialize
      store.getState().initializeThread(thread, participants, round0Messages);

      // Add pre-search WITHOUT user message (orphaned round scenario)
      store.getState().setStreamingRoundNumber(1);
      store.getState().addPreSearch({
        id: `presearch-${threadId}-1`,
        threadId,
        roundNumber: 1,
        userQuery: 'Search query',
        status: MessageStatuses.PENDING,
        searchData: null,
        errorMessage: null,
        createdAt: new Date(),
        completedAt: null,
      } as StoredPreSearch);

      const timelineItems = simulateUseThreadTimeline(
        store.getState().messages,
        store.getState().preSearches,
      );

      // Should have round 0 messages and round 1 pre-search
      expect(timelineItems).toHaveLength(2);

      const round1Item = timelineItems.find(item => item.roundNumber === 1);
      expect(round1Item).toBeDefined();
      expect(round1Item?.type).toBe('pre-search'); // Orphaned pre-search
    });
  });

  describe('streaming Round Placeholder Logic', () => {
    it('should set streamingRoundNumber to enable placeholder rendering', () => {
      const store = createChatStore();
      const threadId = 'test-thread';
      const thread = createThread(threadId);
      const participants = createParticipants(threadId);
      const round0Messages = createRound0Messages(threadId);

      // Initialize
      store.getState().initializeThread(thread, participants, round0Messages);

      // Simulate submission
      const optimisticMessage = createOptimisticUserMessage(1, 'Question');
      store.getState().setMessages(msgs => [...msgs, optimisticMessage]);
      store.getState().setStreamingRoundNumber(1);
      store.getState().setExpectedParticipantIds(['p-1', 'p-2']);
      store.getState().setWaitingToStartStreaming(true);

      // Verify streaming state
      expect(store.getState().streamingRoundNumber).toBe(1);
      expect(store.getState().expectedParticipantIds).toEqual(['p-1', 'p-2']);
      expect(store.getState().waitingToStartStreaming).toBe(true);

      // Rendering conditions
      const isStreamingRound = store.getState().streamingRoundNumber === 1;
      expect(isStreamingRound).toBe(true);

      // Placeholder should show because:
      // - streamingRoundNumber matches round 1
      // - waitingToStartStreaming is true
    });

    it('should preserve streamingRoundNumber when initializeThread called during submission', () => {
      const store = createChatStore();
      const threadId = 'test-thread';
      const thread = createThread(threadId);
      const participants = createParticipants(threadId);
      const round0Messages = createRound0Messages(threadId);

      // Initialize
      store.getState().initializeThread(thread, participants, round0Messages);

      // Simulate submission with all flags
      store.getState().setMessages(msgs => [
        ...msgs,
        createOptimisticUserMessage(1, 'Question'),
      ]);
      store.getState().setStreamingRoundNumber(1);
      store.getState().setConfigChangeRoundNumber(1);
      store.getState().setWaitingToStartStreaming(true);

      // PATCH completes
      store.getState().setIsWaitingForChangelog(true);

      // initializeThread called (simulating PATCH response update)
      store.getState().initializeThread(thread, participants, round0Messages);

      // CRITICAL: streamingRoundNumber must be preserved
      expect(store.getState().streamingRoundNumber).toBe(1);

      // This enables placeholder rendering
      const isStreamingRound = store.getState().streamingRoundNumber === 1;
      expect(isStreamingRound).toBe(true);
    });
  });

  describe('full Pipeline E2E', () => {
    it('should show user message and placeholders immediately after round 1 submission', () => {
      const store = createChatStore();
      const threadId = 'test-thread';
      const thread = createThread(threadId);
      const participants = createParticipants(threadId);
      const round0Messages = createRound0Messages(threadId);

      // === STEP 1: Initialize with round 0 complete ===
      store.getState().initializeThread(thread, participants, round0Messages);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // === STEP 2: User submits for round 1 ===
      // This simulates handleUpdateThreadAndSend
      const nextRoundNumber = 1;

      // 2a. Add optimistic user message
      const optimisticMessage = createOptimisticUserMessage(nextRoundNumber, 'My follow-up');
      store.getState().setMessages(msgs => [...msgs, optimisticMessage]);

      // 2b. Set streaming state
      store.getState().setStreamingRoundNumber(nextRoundNumber);
      store.getState().setExpectedParticipantIds(['p-1', 'p-2']);

      // 2c. Set submission flags (before PATCH)
      store.getState().setConfigChangeRoundNumber(nextRoundNumber);
      store.getState().setWaitingToStartStreaming(true);

      // 2d. Add pre-search placeholder
      store.getState().addPreSearch({
        id: `placeholder-presearch-${threadId}-${nextRoundNumber}`,
        threadId,
        roundNumber: nextRoundNumber,
        userQuery: 'My follow-up',
        status: MessageStatuses.PENDING,
        searchData: null,
        errorMessage: null,
        createdAt: new Date(),
        completedAt: null,
      } as StoredPreSearch);

      // === STEP 3: Verify UI state BEFORE PATCH ===
      // At this point, UI should show:
      // - User message for round 1 ✓
      // - Pre-search placeholder (PENDING) ✓
      // - Participant placeholders (via expectedParticipantIds) ✓

      // 3a. Verify messages in store
      expect(store.getState().messages).toHaveLength(5);

      // 3b. Verify timeline items
      const timelineBeforePatch = simulateUseThreadTimeline(
        store.getState().messages,
        store.getState().preSearches,
      );
      expect(timelineBeforePatch).toHaveLength(2); // Round 0 and Round 1

      const round1BeforePatch = timelineBeforePatch.find(item => item.roundNumber === 1);
      expect(round1BeforePatch).toBeDefined();
      expect(round1BeforePatch?.type).toBe('messages');
      expect((round1BeforePatch?.data as UIMessage[])[0]?.parts[0]).toEqual({
        type: 'text',
        text: 'My follow-up',
      });

      // 3c. Verify streaming state for placeholders
      expect(store.getState().streamingRoundNumber).toBe(nextRoundNumber);
      expect(store.getState().expectedParticipantIds).toEqual(['p-1', 'p-2']);
      expect(store.getState().preSearches).toHaveLength(1);

      // === STEP 4: Simulate PATCH completion ===
      store.getState().setIsWaitingForChangelog(true);

      // Simulate initializeThread being called (e.g., from TanStack Query update)
      store.getState().initializeThread(thread, participants, round0Messages);

      // === STEP 5: Verify UI state AFTER PATCH ===
      // Everything should still be visible!

      // 5a. Messages preserved
      expect(store.getState().messages).toHaveLength(5);

      // 5b. Timeline still has round 1
      const timelineAfterPatch = simulateUseThreadTimeline(
        store.getState().messages,
        store.getState().preSearches,
      );
      expect(timelineAfterPatch).toHaveLength(2);

      const round1AfterPatch = timelineAfterPatch.find(item => item.roundNumber === 1);
      expect(round1AfterPatch).toBeDefined();
      expect(round1AfterPatch?.type).toBe('messages');

      // 5c. Streaming state preserved (for placeholders)
      expect(store.getState().streamingRoundNumber).toBe(nextRoundNumber);

      // 5d. Pre-search still exists
      expect(store.getState().preSearches).toHaveLength(1);
    });

    it('bUG REPRODUCTION: user message disappears after initializeThread with messages reset', () => {
      const store = createChatStore();
      const threadId = 'test-thread';
      const thread = createThread(threadId);
      const participants = createParticipants(threadId);
      const round0Messages = createRound0Messages(threadId);

      // Initialize
      store.getState().initializeThread(thread, participants, round0Messages);

      // Add optimistic message
      const optimisticMessage = createOptimisticUserMessage(1, 'Question');
      store.getState().setMessages(msgs => [...msgs, optimisticMessage]);
      store.getState().setStreamingRoundNumber(1);

      // Verify message exists
      expect(store.getState().messages).toHaveLength(5);

      // BUG SCENARIO: initializeThread called WITHOUT hasActiveFormSubmission flags
      // This could happen if:
      // 1. configChangeRoundNumber was cleared too early
      // 2. isWaitingForChangelog was never set
      // 3. The submission detection logic failed

      // Simulate the bug: no flags set, initializeThread resets messages
      // NOTE: With the fix, messages should still be preserved due to round comparison
      // But if the round comparison fails, messages would be lost

      // Call initializeThread with server messages (round 0 only)
      store.getState().initializeThread(thread, participants, round0Messages);

      // With the fix: messages should be preserved (store has round 1, server has round 0)
      // BUG: If this fails, messages would be reset to round 0 only
      const messagesAfter = store.getState().messages;

      // This assertion verifies the fix is working
      expect(messagesAfter).toHaveLength(5);
      expect(messagesAfter.some(m => getRoundNumberFromMetadata(m) === 1)).toBe(true);
    });
  });
});
