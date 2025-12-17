/**
 * Timeline API Response Flow Simulation Tests
 *
 * Tests the complete flow from API responses through store updates to timeline rendering.
 * Simulates real-world scenarios including:
 * - Stream message arrival patterns
 * - Pre-search completion triggering participant streams
 * - Summary creation and updates
 * - Resumption from various phases
 * - Error recovery scenarios
 */

import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  FinishReasons,
  MessageRoles,
  MessageStatuses,
} from '@/api/core/enums';
import type { StoredModeratorSummary, StoredPreSearch } from '@/api/routes/chat/schema';
import type { DbAssistantMessageMetadata } from '@/db/schemas/chat-metadata';
import { useThreadTimeline } from '@/hooks/utils/useThreadTimeline';
import {
  createMockStoredPreSearch,
  createMockSummary,
  createTestAssistantMessage,
  createTestUserMessage,
} from '@/lib/testing';

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
    role: 'assistant' as const,
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

function createSummaryEntry(
  threadId: string,
  roundNumber: number,
  status: 'pending' | 'streaming' | 'complete' | 'failed' = 'complete',
  participantMessageIds: string[] = [],
): StoredModeratorSummary {
  return createMockSummary(
    roundNumber,
    status === 'pending'
      ? MessageStatuses.PENDING
      : status === 'streaming'
        ? MessageStatuses.STREAMING
        : status === 'complete'
          ? MessageStatuses.COMPLETE
          : MessageStatuses.FAILED,
    { participantMessageIds },
  );
}

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
          summaries: [],
        }),
      );

      const r0Messages = result.current.find(item => item.type === 'messages' && item.roundNumber === 0);
      expect(r0Messages).toBeDefined();
      expect(r0Messages?.type).toBe('messages');

      const messagesData = r0Messages?.type === 'messages' ? r0Messages.data : [];
      const assistantMsgs = messagesData.filter(m => m.role === 'assistant');
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
          summaries: [],
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
          summaries: [],
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
          summaries: [],
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
          summaries: [],
          preSearches: [preSearch],
        }),
      );
      expect(phase2.current.find(item => item.type === 'pre-search')).toBeUndefined();
      expect(phase2.current.find(item => item.type === 'messages')).toBeDefined();
    });
  });

  describe('summary Creation and Updates', () => {
    it('should NOT show pending summary when participants still streaming', () => {
      const userMsg = createUserMessageForRound(threadId, 0);
      const p0Streaming = createStreamingAssistantMessage(threadId, 0, 0, 'gpt-4o', 'Still streaming...');
      const summary = createSummaryEntry(threadId, 0, 'pending', [p0Streaming.id]);

      const { result } = renderHook(() =>
        useThreadTimeline({
          messages: [userMsg, p0Streaming],
          changelog: [],
          summaries: [summary],
        }),
      );

      // Summary should NOT appear (pending + no finishReason on messages)
      const summaryItem = result.current.find(item => item.type === 'summary');
      expect(summaryItem).toBeUndefined();
    });

    it('should show summary once all referenced messages complete', () => {
      const userMsg = createUserMessageForRound(threadId, 0);
      const p0Complete = createAssistantMessageForRound(threadId, 0, 0, 'gpt-4o', 'Complete');
      const p1Complete = createAssistantMessageForRound(threadId, 0, 1, 'claude-3-opus', 'Complete');

      const summary = createSummaryEntry(threadId, 0, 'pending', [p0Complete.id, p1Complete.id]);

      const { result } = renderHook(() =>
        useThreadTimeline({
          messages: [userMsg, p0Complete, p1Complete],
          changelog: [],
          summaries: [summary],
        }),
      );

      // Summary should appear (pending but all messages have finishReason)
      const summaryItem = result.current.find(item => item.type === 'summary');
      expect(summaryItem).toBeDefined();
    });

    it('should show streaming summary regardless of message state', () => {
      const userMsg = createUserMessageForRound(threadId, 0);
      const p0Complete = createAssistantMessageForRound(threadId, 0, 0);
      const summary = createSummaryEntry(threadId, 0, 'streaming');

      const { result } = renderHook(() =>
        useThreadTimeline({
          messages: [userMsg, p0Complete],
          changelog: [],
          summaries: [summary],
        }),
      );

      // Streaming summary should always show
      const summaryItem = result.current.find(item => item.type === 'summary');
      expect(summaryItem).toBeDefined();
    });

    it('should show complete summary', () => {
      const userMsg = createUserMessageForRound(threadId, 0);
      const p0Complete = createAssistantMessageForRound(threadId, 0, 0);
      const summary = createSummaryEntry(threadId, 0, 'complete');

      const { result } = renderHook(() =>
        useThreadTimeline({
          messages: [userMsg, p0Complete],
          changelog: [],
          summaries: [summary],
        }),
      );

      const summaryItem = result.current.find(item => item.type === 'summary');
      expect(summaryItem).toBeDefined();
      expect(summaryItem?.data.status).toBe(MessageStatuses.COMPLETE);
    });
  });
});

// ============================================================================
// COMPLETE ROUND FLOW TESTS
// ============================================================================

describe('complete Round Flow Simulation', () => {
  let store: ChatStoreApi;
  const threadId = 'thread-complete-flow';

  beforeEach(() => {
    store = createChatStore();
    messageIdCounter = 0;
  });

  it('should simulate complete round without web search', () => {
    // Phase 1: User sends message
    const userMsg = createUserMessageForRound(threadId, 0, 'What is the capital of France?');
    store.getState().setMessages([userMsg]);

    // Phase 2: P0 streams
    const p0Streaming = createStreamingAssistantMessage(threadId, 0, 0, 'gpt-4o', 'The capital');
    store.getState().setMessages([userMsg, p0Streaming]);

    // Phase 3: P0 completes, P1 starts
    const p0Complete = createAssistantMessageForRound(threadId, 0, 0, 'gpt-4o', 'The capital of France is Paris.');
    const p1Streaming = createStreamingAssistantMessage(threadId, 0, 1, 'claude-3-opus', 'I agree');
    store.getState().setMessages([userMsg, p0Complete, p1Streaming]);

    // Phase 4: P1 completes
    const p1Complete = createAssistantMessageForRound(threadId, 0, 1, 'claude-3-opus', 'I agree, Paris is the capital.');
    store.getState().setMessages([userMsg, p0Complete, p1Complete]);

    // Phase 5: Summary streams
    const summaryStreaming = createSummaryEntry(threadId, 0, 'streaming', [p0Complete.id, p1Complete.id]);
    store.getState().setSummaries([summaryStreaming]);

    // Phase 6: Summary completes
    const summaryComplete = createSummaryEntry(threadId, 0, 'complete', [p0Complete.id, p1Complete.id]);
    store.getState().setSummaries([summaryComplete]);

    // Verify final state
    const messages = store.getState().messages;
    const summaries = store.getState().summaries;

    const { result } = renderHook(() =>
      useThreadTimeline({
        messages,
        changelog: [],
        summaries,
      }),
    );

    // Should have: messages, summary for round 0
    const r0Items = result.current.filter(item => item.roundNumber === 0);
    expect(r0Items).toHaveLength(2); // messages + summary

    const messagesItem = r0Items.find(item => item.type === 'messages');
    const summaryItem = r0Items.find(item => item.type === 'summary');

    expect(messagesItem).toBeDefined();
    expect(summaryItem).toBeDefined();

    // Messages order: user, p0, p1
    expect(messagesItem?.type).toBe('messages');
    const messagesData = messagesItem?.type === 'messages' ? messagesItem.data : [];
    expect(messagesData).toHaveLength(3);
    expect(messagesData[0]?.role).toBe('user');
    expect((messagesData[1]?.metadata as DbAssistantMessageMetadata)?.participantIndex).toBe(0);
    expect((messagesData[2]?.metadata as DbAssistantMessageMetadata)?.participantIndex).toBe(1);
  });

  it('should simulate complete round with web search', () => {
    // Phase 1: User sends message with web search
    const userMsg = createUserMessageForRound(threadId, 0, 'What is the latest news?');
    store.getState().setMessages([userMsg]);

    // Phase 2: Pre-search starts
    const preSearchPending = createPreSearch(threadId, 0, 'pending');
    store.getState().addPreSearch(preSearchPending);

    // Phase 3: Pre-search streams
    const preSearchStreaming = createPreSearch(threadId, 0, 'streaming');
    store.getState().setPreSearches([preSearchStreaming]);

    // Phase 4: Pre-search completes
    const preSearchComplete = createPreSearch(threadId, 0, 'complete');
    store.getState().setPreSearches([preSearchComplete]);

    // Phase 5: P0 streams (triggered by pre-search completion)
    const p0Streaming = createStreamingAssistantMessage(threadId, 0, 0, 'gpt-4o', 'Based on the search...');
    store.getState().setMessages([userMsg, p0Streaming]);

    // Phase 6: P0 completes
    const p0Complete = createAssistantMessageForRound(threadId, 0, 0, 'gpt-4o', 'Based on the search results...');
    store.getState().setMessages([userMsg, p0Complete]);

    // Phase 7: Summary completes
    const summary = createSummaryEntry(threadId, 0, 'complete', [p0Complete.id]);
    store.getState().setSummaries([summary]);

    // Verify timeline
    const messages = store.getState().messages;
    const summaries = store.getState().summaries;
    const preSearches = store.getState().preSearches;

    const { result } = renderHook(() =>
      useThreadTimeline({
        messages,
        changelog: [],
        summaries,
        preSearches,
      }),
    );

    // Pre-search should NOT be a standalone item (messages exist)
    const preSearchItem = result.current.find(item => item.type === 'pre-search');
    expect(preSearchItem).toBeUndefined();

    // But messages and summary should be there
    const r0Items = result.current.filter(item => item.roundNumber === 0);
    expect(r0Items.find(item => item.type === 'messages')).toBeDefined();
    expect(r0Items.find(item => item.type === 'summary')).toBeDefined();
  });

  it('should simulate multi-round conversation', () => {
    // Round 0
    const r0User = createUserMessageForRound(threadId, 0, 'First question');
    const r0P0 = createAssistantMessageForRound(threadId, 0, 0, 'gpt-4o', 'First answer');
    const r0Summary = createSummaryEntry(threadId, 0, 'complete', [r0P0.id]);

    // Round 1
    const r1User = createUserMessageForRound(threadId, 1, 'Follow up');
    const r1P0 = createAssistantMessageForRound(threadId, 1, 0, 'gpt-4o', 'Follow up answer');
    const r1Summary = createSummaryEntry(threadId, 1, 'complete', [r1P0.id]);

    // Round 2
    const r2User = createUserMessageForRound(threadId, 2, 'Final question');
    const r2P0 = createAssistantMessageForRound(threadId, 2, 0, 'gpt-4o', 'Final answer');
    const r2Summary = createSummaryEntry(threadId, 2, 'complete', [r2P0.id]);

    const messages = [r0User, r0P0, r1User, r1P0, r2User, r2P0];
    const summaries = [r0Summary, r1Summary, r2Summary];

    const { result } = renderHook(() =>
      useThreadTimeline({
        messages,
        changelog: [],
        summaries,
      }),
    );

    // Should have 6 items: (messages + summary) × 3 rounds
    expect(result.current).toHaveLength(6);

    // Verify round ordering
    const rounds = result.current.map(item => item.roundNumber);
    expect(rounds).toEqual([0, 0, 1, 1, 2, 2]); // messages, summary for each round in order
  });
});

// ============================================================================
// RESUMPTION FLOW TESTS
// ============================================================================

describe('resumption Flow Simulation', () => {
  const threadId = 'thread-resumption';

  beforeEach(() => {
    messageIdCounter = 0;
  });

  it('should resume from pre-search streaming phase', () => {
    // State when page was refreshed: pre-search was streaming
    const preSearch = createPreSearch(threadId, 0, 'streaming');

    const { result } = renderHook(() =>
      useThreadTimeline({
        messages: [],
        changelog: [],
        summaries: [],
        preSearches: [preSearch],
      }),
    );

    // Pre-search should show as standalone (orphaned)
    const preSearchItem = result.current.find(item => item.type === 'pre-search');
    expect(preSearchItem).toBeDefined();
    expect(preSearchItem?.data.status).toBe(MessageStatuses.STREAMING);
  });

  it('should resume from participant streaming phase', () => {
    // State when page was refreshed: user msg + pre-search complete + p0 streaming
    const userMsg = createUserMessageForRound(threadId, 0);
    const preSearch = createPreSearch(threadId, 0, 'complete');
    const p0Streaming = createStreamingAssistantMessage(threadId, 0, 0, 'gpt-4o', 'Partial content...');

    const { result } = renderHook(() =>
      useThreadTimeline({
        messages: [userMsg, p0Streaming],
        changelog: [],
        summaries: [],
        preSearches: [preSearch],
      }),
    );

    // Should have messages item
    const messagesItem = result.current.find(item => item.type === 'messages');
    expect(messagesItem).toBeDefined();

    // P0 should still be in messages (streaming state)
    expect(messagesItem?.type).toBe('messages');
    const messagesData = messagesItem?.type === 'messages' ? messagesItem.data : [];
    const p0 = messagesData.find((m) => {
      const meta = m.metadata as DbAssistantMessageMetadata;
      return meta?.participantIndex === 0;
    });
    expect(p0).toBeDefined();
    expect((p0?.metadata as DbAssistantMessageMetadata)?.finishReason).toBeUndefined();
  });

  it('should resume from summary streaming phase', () => {
    // State when page was refreshed: complete messages + streaming summary
    const userMsg = createUserMessageForRound(threadId, 0);
    const p0Complete = createAssistantMessageForRound(threadId, 0, 0);
    const summaryStreaming = createSummaryEntry(threadId, 0, 'streaming', [p0Complete.id]);

    const { result } = renderHook(() =>
      useThreadTimeline({
        messages: [userMsg, p0Complete],
        changelog: [],
        summaries: [summaryStreaming],
      }),
    );

    // Should have messages and summary
    const messagesItem = result.current.find(item => item.type === 'messages');
    const summaryItem = result.current.find(item => item.type === 'summary');

    expect(messagesItem).toBeDefined();
    expect(summaryItem).toBeDefined();
    expect(summaryItem?.data.status).toBe(MessageStatuses.STREAMING);
  });

  it('should resume mid-round with completed participants', () => {
    // P0 complete, P1 streaming, P2 not started
    const userMsg = createUserMessageForRound(threadId, 0);
    const p0Complete = createAssistantMessageForRound(threadId, 0, 0, 'gpt-4o', 'Done');
    const p1Streaming = createStreamingAssistantMessage(threadId, 0, 1, 'claude-3-opus', 'Working...');

    const { result } = renderHook(() =>
      useThreadTimeline({
        messages: [userMsg, p0Complete, p1Streaming],
        changelog: [],
        summaries: [],
      }),
    );

    const messagesItem = result.current.find(item => item.type === 'messages');
    expect(messagesItem).toBeDefined();
    expect(messagesItem?.type).toBe('messages');

    const messagesData = messagesItem?.type === 'messages' ? messagesItem.data : [];
    const assistants = messagesData.filter(m => m.role === 'assistant');
    expect(assistants).toHaveLength(2); // P0 and P1

    // P0 complete
    expect((assistants[0]?.metadata as DbAssistantMessageMetadata)?.finishReason).toBe(FinishReasons.STOP);
    // P1 streaming
    expect((assistants[1]?.metadata as DbAssistantMessageMetadata)?.finishReason).toBeUndefined();
  });
});

// ============================================================================
// ERROR RECOVERY TESTS
// ============================================================================

describe('error Recovery Scenarios', () => {
  const threadId = 'thread-errors';

  beforeEach(() => {
    messageIdCounter = 0;
  });

  it('should handle pre-search failure gracefully', () => {
    const userMsg = createUserMessageForRound(threadId, 0);
    const preSearchFailed = createPreSearch(threadId, 0, 'failed');

    const { result } = renderHook(() =>
      useThreadTimeline({
        messages: [userMsg],
        changelog: [],
        summaries: [],
        preSearches: [preSearchFailed],
      }),
    );

    // Messages should still be there
    const messagesItem = result.current.find(item => item.type === 'messages');
    expect(messagesItem).toBeDefined();
  });

  it('should handle summary failure gracefully', () => {
    const userMsg = createUserMessageForRound(threadId, 0);
    const p0Complete = createAssistantMessageForRound(threadId, 0, 0);
    const summaryFailed = createSummaryEntry(threadId, 0, 'failed', [p0Complete.id]);

    const { result } = renderHook(() =>
      useThreadTimeline({
        messages: [userMsg, p0Complete],
        changelog: [],
        summaries: [summaryFailed],
      }),
    );

    // Both messages and failed summary should be visible
    const messagesItem = result.current.find(item => item.type === 'messages');
    const summaryItem = result.current.find(item => item.type === 'summary');

    expect(messagesItem).toBeDefined();
    expect(summaryItem).toBeDefined();
    expect(summaryItem?.data.status).toBe(MessageStatuses.FAILED);
  });

  it('should handle participant message with error finishReason', () => {
    const userMsg = createUserMessageForRound(threadId, 0);
    const p0Error = createAssistantMessageForRound(threadId, 0, 0, 'gpt-4o', 'Error occurred', FinishReasons.ERROR);

    const { result } = renderHook(() =>
      useThreadTimeline({
        messages: [userMsg, p0Error],
        changelog: [],
        summaries: [],
      }),
    );

    const messagesItem = result.current.find(item => item.type === 'messages');
    expect(messagesItem).toBeDefined();
    expect(messagesItem?.type).toBe('messages');

    const messagesData = messagesItem?.type === 'messages' ? messagesItem.data : [];
    const p0 = messagesData.find((m) => {
      const meta = m.metadata as DbAssistantMessageMetadata;
      return meta?.participantIndex === 0;
    });
    expect((p0?.metadata as DbAssistantMessageMetadata)?.finishReason).toBe(FinishReasons.ERROR);
  });

  it('should handle empty round (no participants)', () => {
    const userMsg = createUserMessageForRound(threadId, 0);

    const { result } = renderHook(() =>
      useThreadTimeline({
        messages: [userMsg],
        changelog: [],
        summaries: [],
      }),
    );

    // Should still show the user message
    const messagesItem = result.current.find(item => item.type === 'messages');
    expect(messagesItem).toBeDefined();
    expect(messagesItem?.type).toBe('messages');

    const messagesData = messagesItem?.type === 'messages' ? messagesItem.data : [];
    expect(messagesData).toHaveLength(1);
    expect(messagesData[0]?.role).toBe('user');
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
        summaries: [],
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
        summaries: [],
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
        summaries: [],
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
        summaries: [],
      }),
    );

    // Should only show R0 (R1 changelog without messages should be skipped)
    expect(result.current).toHaveLength(1);
    expect(result.current[0]?.roundNumber).toBe(0);
  });
});
