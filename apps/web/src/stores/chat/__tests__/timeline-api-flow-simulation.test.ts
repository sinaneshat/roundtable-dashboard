/**
 * Timeline API Response Flow Simulation Tests
 *
 * Tests the complete flow from API responses through store updates to timeline rendering.
 * Simulates real-world scenarios including:
 * - Stream message arrival patterns
 * - Pre-search completion triggering participant streams
 * - Moderator message creation and updates
 * - Resumption from various phases
 * - Error recovery scenarios
 */

import {
  FinishReasons,
  MessageRoles,
  MessageStatuses,
} from '@roundtable/shared';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useThreadTimeline } from '@/hooks/utils';
import { createMockStoredPreSearch, createTestAssistantMessage, createTestUserMessage } from '@/lib/testing';
import type { DbAssistantMessageMetadata, StoredPreSearch } from '@/services/api';

import type { ChatStoreApi } from '../store';
import { createChatStore } from '../store';

// ============================================================================
// TEST HELPERS
// ============================================================================

let messageIdCounter = 0;

function createMessageId(threadId: string, roundNumber: number, participantIndex?: number): string {
  messageIdCounter++;
  if (participantIndex !== undefined) {
    return `${threadId}_r${roundNumber}_p${participantIndex}_${messageIdCounter}`;
  }
  return `${threadId}_r${roundNumber}_user_${messageIdCounter}`;
}

function createUserMessageForRound(
  threadId: string,
  roundNumber: number,
  content: string = `Message for round ${roundNumber}`,
) {
  return createTestUserMessage({
    id: createMessageId(threadId, roundNumber),
    content,
    roundNumber,
  });
}

function createAssistantMessageForRound(
  threadId: string,
  roundNumber: number,
  participantIndex: number,
  modelId: string = 'gpt-4o',
  content: string = `Response from participant ${participantIndex}`,
  finishReason: typeof FinishReasons[keyof typeof FinishReasons] = FinishReasons.STOP,
) {
  return createTestAssistantMessage({
    id: createMessageId(threadId, roundNumber, participantIndex),
    content,
    roundNumber,
    participantId: `participant-${participantIndex}`,
    participantIndex,
    model: modelId,
    finishReason,
  });
}

function createStreamingAssistantMessage(
  threadId: string,
  roundNumber: number,
  participantIndex: number,
  modelId: string = 'gpt-4o',
  partialContent: string = '',
) {
  // Create message manually to avoid helper's default finishReason
  messageIdCounter++;
  const msgId = `${threadId}_r${roundNumber}_p${participantIndex}_${messageIdCounter}`;
  return {
    id: msgId,
    role: MessageRoles.ASSISTANT as const,
    parts: [{ type: 'text' as const, text: partialContent }],
    metadata: {
      role: MessageRoles.ASSISTANT,
      roundNumber,
      participantId: `participant-${participantIndex}`,
      participantIndex,
      participantRole: null,
      model: modelId,
      finishReason: undefined, // Still streaming - no finishReason yet
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      hasError: false,
      isTransient: false,
      isPartialResponse: true,
    },
  };
}

function createPreSearch(
  threadId: string,
  roundNumber: number,
  status: 'pending' | 'streaming' | 'complete' | 'failed' = 'complete',
): StoredPreSearch {
  return createMockStoredPreSearch(roundNumber, status === 'pending'
    ? MessageStatuses.PENDING
    : status === 'streaming'
      ? MessageStatuses.STREAMING
      : status === 'complete'
        ? MessageStatuses.COMPLETE
        : MessageStatuses.FAILED);
}

// ✅ TEXT STREAMING: createModeratorEntry removed
// Moderator messages are now stored as chatMessage entries with metadata.isModerator: true

// ============================================================================
// STREAM MESSAGE ARRIVAL TESTS
// ============================================================================

describe('stream Message Arrival Patterns', () => {
  let store: ChatStoreApi;
  const threadId = 'thread-api-flow';

  beforeEach(() => {
    store = createChatStore();
    messageIdCounter = 0;
  });

  describe('sequential Participant Streaming', () => {
    it('should handle first participant streaming while others wait', () => {
      // Start round with user message
      const userMsg = createUserMessageForRound(threadId, 0);
      store.getState().setMessages([userMsg]);

      // P0 starts streaming
      const p0Streaming = createStreamingAssistantMessage(threadId, 0, 0, 'gpt-4o', 'Starting to respond...');
      store.getState().setMessages([userMsg, p0Streaming]);

      const messages = store.getState().messages;
      expect(messages).toHaveLength(2);

      // P0's message should be streaming (no finishReason)
      const p0Msg = messages.find((m) => {
        const meta = m.metadata as DbAssistantMessageMetadata;
        return meta?.participantIndex === 0;
      });
      expect(p0Msg).toBeDefined();
      expect((p0Msg?.metadata as DbAssistantMessageMetadata)?.finishReason).toBeUndefined();
    });

    it('should transition to next participant after first completes', () => {
      const userMsg = createUserMessageForRound(threadId, 0);

      // P0 completes
      const p0Complete = createAssistantMessageForRound(threadId, 0, 0, 'gpt-4o', 'P0 complete response');

      // P1 starts streaming
      const p1Streaming = createStreamingAssistantMessage(threadId, 0, 1, 'claude-3-opus', 'P1 starting...');

      store.getState().setMessages([userMsg, p0Complete, p1Streaming]);

      const messages = store.getState().messages;

      // P0 should be complete
      const p0Msg = messages.find((m) => {
        const meta = m.metadata as DbAssistantMessageMetadata;
        return meta?.participantIndex === 0;
      });
      expect((p0Msg?.metadata as DbAssistantMessageMetadata)?.finishReason).toBe(FinishReasons.STOP);

      // P1 should be streaming
      const p1Msg = messages.find((m) => {
        const meta = m.metadata as DbAssistantMessageMetadata;
        return meta?.participantIndex === 1;
      });
      expect((p1Msg?.metadata as DbAssistantMessageMetadata)?.finishReason).toBeUndefined();
    });

    it('should maintain participant order regardless of message arrival order', () => {
      const userMsg = createUserMessageForRound(threadId, 0);

      // Simulate messages arriving out of order
      const p1 = createAssistantMessageForRound(threadId, 0, 1, 'claude-3-opus', 'P1 response');
      const p0 = createAssistantMessageForRound(threadId, 0, 0, 'gpt-4o', 'P0 response');
      const p2 = createAssistantMessageForRound(threadId, 0, 2, 'gemini-pro', 'P2 response');

      // Add in scrambled order
      store.getState().setMessages([userMsg, p1, p2, p0]);

      // Verify timeline orders them correctly
      const messages = store.getState().messages;
      const { result } = renderHook(() =>
        useThreadTimeline({
          messages,
          changelog: [],
        }),
      );

      const r0Messages = result.current.find(item => item.type === 'messages' && item.roundNumber === 0);
      expect(r0Messages).toBeDefined();
      expect(r0Messages?.type).toBe('messages');

      const messagesData = r0Messages?.type === 'messages' ? r0Messages.data : [];
      const assistantMsgs = messagesData.filter(m => m.role === MessageRoles.ASSISTANT);
      // Should be sorted by participantIndex: 0, 1, 2
      expect((assistantMsgs[0]?.metadata as DbAssistantMessageMetadata)?.participantIndex).toBe(0);
      expect((assistantMsgs[1]?.metadata as DbAssistantMessageMetadata)?.participantIndex).toBe(1);
      expect((assistantMsgs[2]?.metadata as DbAssistantMessageMetadata)?.participantIndex).toBe(2);
    });
  });

  describe('pre-search Blocking Behavior', () => {
    it('should show pre-search as standalone item when no messages exist', () => {
      // Pre-search starts before user message is persisted
      const preSearch = createPreSearch(threadId, 0, 'streaming');
      store.getState().addPreSearch(preSearch);

      const { result } = renderHook(() =>
        useThreadTimeline({
          messages: [],
          changelog: [],
          preSearches: [preSearch],
        }),
      );

      // Pre-search should appear as timeline item
      const preSearchItem = result.current.find(item => item.type === 'pre-search');
      expect(preSearchItem).toBeDefined();
      expect(preSearchItem?.roundNumber).toBe(0);
    });

    it('should NOT show pre-search as standalone when messages exist', () => {
      // Normal flow: user message + pre-search + participants
      const userMsg = createUserMessageForRound(threadId, 0);
      const preSearch = createPreSearch(threadId, 0, 'complete');

      const { result } = renderHook(() =>
        useThreadTimeline({
          messages: [userMsg],
          changelog: [],
          preSearches: [preSearch],
        }),
      );

      // Pre-search should NOT appear as standalone item (rendered by ChatMessageList instead)
      const preSearchItem = result.current.find(item => item.type === 'pre-search');
      expect(preSearchItem).toBeUndefined();

      // But messages should be there
      const messagesItem = result.current.find(item => item.type === 'messages');
      expect(messagesItem).toBeDefined();
    });

    it('should transition from pre-search standalone to messages after user message persists', () => {
      const preSearch = createPreSearch(threadId, 0, 'complete');

      // Phase 1: Only pre-search
      const { result: phase1 } = renderHook(() =>
        useThreadTimeline({
          messages: [],
          changelog: [],
          preSearches: [preSearch],
        }),
      );
      expect(phase1.current.find(item => item.type === 'pre-search')).toBeDefined();
      expect(phase1.current.find(item => item.type === 'messages')).toBeUndefined();

      // Phase 2: User message arrives
      const userMsg = createUserMessageForRound(threadId, 0);
      const { result: phase2 } = renderHook(() =>
        useThreadTimeline({
          messages: [userMsg],
          changelog: [],
          preSearches: [preSearch],
        }),
      );
      expect(phase2.current.find(item => item.type === 'pre-search')).toBeUndefined();
      expect(phase2.current.find(item => item.type === 'messages')).toBeDefined();
    });
  });
});

// ============================================================================
// TIMELINE ORDERING EDGE CASES
// ============================================================================

describe('timeline Ordering Edge Cases', () => {
  const threadId = 'thread-ordering';

  beforeEach(() => {
    messageIdCounter = 0;
  });

  it('should handle gaps in round numbers', () => {
    // Rounds 0, 2, 5 (gaps at 1, 3, 4)
    const r0User = createUserMessageForRound(threadId, 0);
    const r0P0 = createAssistantMessageForRound(threadId, 0, 0);

    const r2User = createUserMessageForRound(threadId, 2);
    const r2P0 = createAssistantMessageForRound(threadId, 2, 0);

    const r5User = createUserMessageForRound(threadId, 5);
    const r5P0 = createAssistantMessageForRound(threadId, 5, 0);

    const { result } = renderHook(() =>
      useThreadTimeline({
        messages: [r0User, r0P0, r2User, r2P0, r5User, r5P0],
        changelog: [],
      }),
    );

    // Should have 3 message items for rounds 0, 2, 5
    expect(result.current).toHaveLength(3);
    expect(result.current[0]?.roundNumber).toBe(0);
    expect(result.current[1]?.roundNumber).toBe(2);
    expect(result.current[2]?.roundNumber).toBe(5);
  });

  it('should handle single message rounds', () => {
    // Round with only user message (no AI response yet)
    const userMsg = createUserMessageForRound(threadId, 0);

    const { result } = renderHook(() =>
      useThreadTimeline({
        messages: [userMsg],
        changelog: [],
      }),
    );

    expect(result.current).toHaveLength(1);
    const item = result.current[0];
    expect(item?.type).toBe('messages');
    const itemData = item?.type === 'messages' ? item.data : [];
    expect(itemData).toHaveLength(1);
  });

  it('should deduplicate identical changelog entries', () => {
    const userMsg = createUserMessageForRound(threadId, 0);

    // Duplicate changelog entries (same ID)
    const changelog = [
      {
        id: 'changelog-1',
        threadId,
        roundNumber: 0,
        changeType: 'mode_change' as const,
        changeData: { oldMode: 'brainstorm', newMode: 'analyzing' },
        createdAt: new Date(),
      },
      {
        id: 'changelog-1', // Duplicate ID
        threadId,
        roundNumber: 0,
        changeType: 'mode_change' as const,
        changeData: { oldMode: 'brainstorm', newMode: 'analyzing' },
        createdAt: new Date(),
      },
    ];

    const { result } = renderHook(() =>
      useThreadTimeline({
        messages: [userMsg],
        changelog,
      }),
    );

    const changelogItem = result.current.find(item => item.type === 'changelog');
    expect(changelogItem).toBeDefined();
    expect(changelogItem?.type).toBe('changelog');
    // Should be deduplicated to 1 entry
    const changelogData = changelogItem?.type === 'changelog' ? changelogItem.data : [];
    expect(changelogData).toHaveLength(1);
  });

  it('should handle changelog-only rounds (no messages yet)', () => {
    // Round 0 complete
    const r0User = createUserMessageForRound(threadId, 0);
    const r0P0 = createAssistantMessageForRound(threadId, 0, 0);

    // Round 1 has changelog but user hasn't sent message yet
    const r1Changelog = [{
      id: 'changelog-r1',
      threadId,
      roundNumber: 1,
      changeType: 'participant_added' as const,
      changeData: {},
      createdAt: new Date(),
    }];

    const { result } = renderHook(() =>
      useThreadTimeline({
        messages: [r0User, r0P0],
        changelog: r1Changelog,
      }),
    );

    // Should only show R0 (R1 changelog without messages should be skipped)
    expect(result.current).toHaveLength(1);
    expect(result.current[0]?.roundNumber).toBe(0);
  });
});
