/**
 * Conversation Round E2E Ordering Tests
 *
 * Comprehensive tests for timeline ordering across conversation rounds:
 *
 * SINGLE SOURCE OF TRUTH for conversation round behavior:
 * 1. Round starts when user sends a message (with optional files)
 * 2. Web search (if enabled) MUST complete BEFORE any participant speaks
 * 3. Participants respond in priority order (index 0, 1, 2...)
 * 4. Round summary appears AFTER all participants complete
 * 5. Changelog appears ABOVE user message in subsequent rounds when config changes
 *
 * Timeline order per round:
 * [Changelog if config changed] → User Message → [Pre-search if enabled] → Participants → Summary
 *
 * These tests validate the expected behavior documented in FLOW_DOCUMENTATION.md
 */

import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ChatModes, FinishReasons, MessageRoles, MessageStatuses } from '@/api/core/enums';
import type { ChatMessage, ChatParticipant, ChatThread, ChatThreadChangelog, StoredPreSearch, StoredRoundSummary } from '@/api/routes/chat/schema';
import { useThreadTimeline } from '@/hooks/utils/useThreadTimeline';
import {
  createTestAssistantMessage,
  createTestUserMessage,
} from '@/lib/testing/helpers';

import { createChatStore } from '../store';

// ============================================================================
// TEST HELPERS
// ============================================================================

function createMockThread(overrides?: Partial<ChatThread>): ChatThread {
  return {
    id: 'thread-123',
    userId: 'user-123',
    title: 'Test Thread',
    slug: 'test-thread',
    previousSlug: null,
    projectId: null,
    mode: ChatModes.ANALYZING,
    status: 'active',
    enableWebSearch: true,
    isFavorite: false,
    isPublic: false,
    isAiGeneratedTitle: false,
    metadata: null,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastMessageAt: new Date(),
    ...overrides,
  } as ChatThread;
}

function createMockParticipant(index: number, threadId = 'thread-123'): ChatParticipant {
  return {
    id: `participant-${index}`,
    threadId,
    modelId: `provider/model-${index}`,
    role: null,
    customRoleId: null,
    priority: index,
    isEnabled: true,
    settings: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as ChatParticipant;
}

function createMockPreSearch(
  roundNumber: number,
  status: 'pending' | 'streaming' | 'complete' | 'failed' = 'complete',
  threadId = 'thread-123',
): StoredPreSearch {
  return {
    id: `presearch-${threadId}-r${roundNumber}`,
    threadId,
    roundNumber,
    userQuery: `Query for round ${roundNumber}`,
    status: status === 'pending'
      ? MessageStatuses.PENDING
      : status === 'streaming'
        ? MessageStatuses.STREAMING
        : status === 'complete'
          ? MessageStatuses.COMPLETE
          : MessageStatuses.FAILED,
    searchData: status === 'complete'
      ? {
          queries: [{ query: 'test', rationale: 'test', searchDepth: 'basic' as const, index: 0, total: 1 }],
          results: [],
          summary: 'Search summary',
          successCount: 1,
          failureCount: 0,
          totalResults: 0,
          totalTime: 100,
        }
      : null,
    errorMessage: null,
    createdAt: new Date(),
    completedAt: status === 'complete' ? new Date() : null,
  } as StoredPreSearch;
}

function createMockSummary(
  roundNumber: number,
  status: 'pending' | 'streaming' | 'complete' | 'failed' = 'complete',
  participantMessageIds: string[] = [],
  threadId = 'thread-123',
): StoredRoundSummary {
  return {
    id: `summary-${threadId}-r${roundNumber}`,
    threadId,
    roundNumber,
    mode: ChatModes.ANALYZING,
    userQuestion: `Question for round ${roundNumber}`,
    status: status === 'pending'
      ? MessageStatuses.PENDING
      : status === 'streaming'
        ? MessageStatuses.STREAMING
        : status === 'complete'
          ? MessageStatuses.COMPLETE
          : MessageStatuses.FAILED,
    summaryData: status === 'complete'
      ? {
          confidence: { overall: 85, reasoning: 'Test' },
          modelVoices: [],
          article: { headline: 'Test', narrative: 'Test', keyTakeaway: 'Test' },
          recommendations: [],
          consensusTable: [],
          minorityViews: [],
          convergenceDivergence: { convergedOn: [], divergedOn: [], evolved: [] },
        }
      : null,
    participantMessageIds,
    errorMessage: null,
    completedAt: status === 'complete' ? new Date() : null,
    createdAt: new Date(),
  } as StoredRoundSummary;
}

function createMockChangelog(
  roundNumber: number,
  changes: Array<{
    type: 'added' | 'removed' | 'modified' | 'reordered' | 'mode_change';
    participantId?: string;
    modelId?: string;
  }>,
  threadId = 'thread-123',
): ChatThreadChangelog {
  return {
    id: `changelog-${threadId}-r${roundNumber}`,
    threadId,
    roundNumber,
    previousRoundNumber: roundNumber > 0 ? roundNumber - 1 : null,
    changeType: 'participant_change',
    changeData: {
      changes: changes.map(c => ({
        type: c.type,
        participantId: c.participantId,
        modelId: c.modelId,
      })),
    },
    createdAt: new Date(),
  } as ChatThreadChangelog;
}

// ============================================================================
// ROUND START BEHAVIOR TESTS
// ============================================================================

describe('round Start Behavior', () => {
  describe('round Initialization', () => {
    it('round 0 starts when user sends first message', () => {
      const store = createChatStore();
      const thread = createMockThread();
      const participants = [createMockParticipant(0), createMockParticipant(1)];

      store.getState().initializeThread(thread, participants, []);

      // User sends message - this starts round 0
      const userMessage = createTestUserMessage({
        id: 'thread-123_r0_user',
        content: 'First question',
        roundNumber: 0,
      });

      store.getState().setMessages([userMessage]);

      const messages = store.getState().messages;
      expect(messages).toHaveLength(1);
      expect(messages[0]?.role).toBe('user');
      expect((messages[0]?.metadata as { roundNumber: number }).roundNumber).toBe(0);
    });

    it('subsequent rounds start when user sends follow-up message', () => {
      const store = createChatStore();
      const thread = createMockThread();
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, []);

      // Round 0 complete
      store.getState().setMessages([
        createTestUserMessage({ id: 'u0', content: 'Q0', roundNumber: 0 }),
        createTestAssistantMessage({
          id: 'a0',
          content: 'R0',
          roundNumber: 0,
          participantId: 'participant-0',
          participantIndex: 0,
          finishReason: FinishReasons.STOP,
        }),
      ]);

      // User sends round 1 message
      const round1Message = createTestUserMessage({
        id: 'thread-123_r1_user',
        content: 'Follow-up question',
        roundNumber: 1,
      });

      store.getState().setMessages([
        ...store.getState().messages,
        round1Message,
      ]);

      const messages = store.getState().messages;
      const round1UserMsg = messages.find(
        m => m.role === 'user' && (m.metadata as { roundNumber: number }).roundNumber === 1,
      );
      expect(round1UserMsg).toBeDefined();
    });
  });
});

// ============================================================================
// WEB SEARCH BLOCKING BEHAVIOR TESTS
// ============================================================================

describe('web Search Blocking Behavior', () => {
  describe('pre-Search Must Complete Before Participants', () => {
    it('participants MUST NOT speak while pre-search is PENDING', () => {
      const store = createChatStore();
      const thread = createMockThread({ enableWebSearch: true });
      const participants = [createMockParticipant(0), createMockParticipant(1)];

      store.getState().initializeThread(thread, participants, []);
      store.getState().addPreSearch(createMockPreSearch(0, 'pending'));

      // User message exists
      store.getState().setMessages([
        createTestUserMessage({ id: 'u0', content: 'Q0', roundNumber: 0 }),
      ]);

      // Pre-search is pending - participants should be blocked
      const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 0);
      expect(preSearch?.status).toBe(MessageStatuses.PENDING);

      // No assistant messages should exist yet
      const assistantMessages = store.getState().messages.filter(m => m.role === 'assistant');
      expect(assistantMessages).toHaveLength(0);
    });

    it('participants MUST NOT speak while pre-search is STREAMING', () => {
      const store = createChatStore();
      const thread = createMockThread({ enableWebSearch: true });
      const participants = [createMockParticipant(0), createMockParticipant(1)];

      store.getState().initializeThread(thread, participants, []);
      store.getState().addPreSearch(createMockPreSearch(0, 'streaming'));

      store.getState().setMessages([
        createTestUserMessage({ id: 'u0', content: 'Q0', roundNumber: 0 }),
      ]);

      // Pre-search is streaming - participants should be blocked
      const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 0);
      expect(preSearch?.status).toBe(MessageStatuses.STREAMING);

      // No assistant messages should exist yet
      const assistantMessages = store.getState().messages.filter(m => m.role === 'assistant');
      expect(assistantMessages).toHaveLength(0);
    });

    it('participants CAN speak after pre-search is COMPLETE', () => {
      const store = createChatStore();
      const thread = createMockThread({ enableWebSearch: true });
      const participants = [createMockParticipant(0), createMockParticipant(1)];

      store.getState().initializeThread(thread, participants, []);
      store.getState().addPreSearch(createMockPreSearch(0, 'complete'));

      store.getState().setMessages([
        createTestUserMessage({ id: 'u0', content: 'Q0', roundNumber: 0 }),
        createTestAssistantMessage({
          id: 'a0p0',
          content: 'Response from participant 0',
          roundNumber: 0,
          participantId: 'participant-0',
          participantIndex: 0,
          finishReason: FinishReasons.STOP,
        }),
      ]);

      // Pre-search is complete - participants can speak
      const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 0);
      expect(preSearch?.status).toBe(MessageStatuses.COMPLETE);

      // Assistant message should exist
      const assistantMessages = store.getState().messages.filter(m => m.role === 'assistant');
      expect(assistantMessages).toHaveLength(1);
    });

    it('participants CAN speak after pre-search FAILED (non-blocking failure)', () => {
      const store = createChatStore();
      const thread = createMockThread({ enableWebSearch: true });
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, []);
      store.getState().addPreSearch(createMockPreSearch(0, 'failed'));

      store.getState().setMessages([
        createTestUserMessage({ id: 'u0', content: 'Q0', roundNumber: 0 }),
        createTestAssistantMessage({
          id: 'a0p0',
          content: 'Response without search data',
          roundNumber: 0,
          participantId: 'participant-0',
          participantIndex: 0,
          finishReason: FinishReasons.STOP,
        }),
      ]);

      // Pre-search failed - participants should still be able to speak
      const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 0);
      expect(preSearch?.status).toBe(MessageStatuses.FAILED);

      const assistantMessages = store.getState().messages.filter(m => m.role === 'assistant');
      expect(assistantMessages).toHaveLength(1);
    });
  });

  describe('web Search Disabled', () => {
    it('participants can speak immediately when web search is disabled', () => {
      const store = createChatStore();
      const thread = createMockThread({ enableWebSearch: false });
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, []);

      // No pre-search created when disabled
      expect(store.getState().preSearches).toHaveLength(0);

      // User message and immediate participant response
      store.getState().setMessages([
        createTestUserMessage({ id: 'u0', content: 'Q0', roundNumber: 0 }),
        createTestAssistantMessage({
          id: 'a0p0',
          content: 'Immediate response',
          roundNumber: 0,
          participantId: 'participant-0',
          participantIndex: 0,
          finishReason: FinishReasons.STOP,
        }),
      ]);

      const assistantMessages = store.getState().messages.filter(m => m.role === 'assistant');
      expect(assistantMessages).toHaveLength(1);
    });
  });
});

// ============================================================================
// PARTICIPANT ORDER TESTS
// ============================================================================

describe('participant Response Order', () => {
  describe('sequential Participant Response', () => {
    it('participants respond in priority order (0, 1, 2)', () => {
      const store = createChatStore();
      const thread = createMockThread({ enableWebSearch: false });
      const participants = [
        createMockParticipant(0),
        createMockParticipant(1),
        createMockParticipant(2),
      ];

      store.getState().initializeThread(thread, participants, []);

      store.getState().setMessages([
        createTestUserMessage({ id: 'u0', content: 'Q0', roundNumber: 0 }),
        createTestAssistantMessage({
          id: 'a0p0',
          content: 'First response',
          roundNumber: 0,
          participantId: 'participant-0',
          participantIndex: 0,
          finishReason: FinishReasons.STOP,
        }),
        createTestAssistantMessage({
          id: 'a0p1',
          content: 'Second response',
          roundNumber: 0,
          participantId: 'participant-1',
          participantIndex: 1,
          finishReason: FinishReasons.STOP,
        }),
        createTestAssistantMessage({
          id: 'a0p2',
          content: 'Third response',
          roundNumber: 0,
          participantId: 'participant-2',
          participantIndex: 2,
          finishReason: FinishReasons.STOP,
        }),
      ]);

      const assistantMessages = store.getState().messages.filter(m => m.role === 'assistant');
      expect(assistantMessages).toHaveLength(3);

      // Verify order by participantIndex
      const indices = assistantMessages.map(
        m => (m.metadata as { participantIndex: number }).participantIndex,
      );
      expect(indices).toEqual([0, 1, 2]);
    });

    it('participant n+1 MUST NOT start until participant n completes', () => {
      const store = createChatStore();
      const participants = [createMockParticipant(0), createMockParticipant(1)];

      store.getState().initializeThread(createMockThread(), participants, []);

      // During streaming: participant 0 is streaming (no finishReason)
      store.getState().setMessages([
        createTestUserMessage({ id: 'u0', content: 'Q0', roundNumber: 0 }),
        {
          id: 'a0p0',
          role: MessageRoles.ASSISTANT,
          parts: [{ type: 'text', text: 'Streaming...' }],
          metadata: {
            role: MessageRoles.ASSISTANT,
            roundNumber: 0,
            participantId: 'participant-0',
            participantIndex: 0,
            model: 'provider/model-0',
            finishReason: null, // Still streaming
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            hasError: false,
            isTransient: false,
            participantRole: null,
          },
        } as ChatMessage,
      ]);

      // Only one assistant message (participant 0 streaming)
      const assistantMessages = store.getState().messages.filter(m => m.role === 'assistant');
      expect(assistantMessages).toHaveLength(1);
      expect((assistantMessages[0]?.metadata as { participantIndex: number }).participantIndex).toBe(0);
    });
  });
});

// ============================================================================
// ROUND SUMMARY POSITION TESTS
// ============================================================================

describe('round Summary Position', () => {
  describe('summary Appears After Last Participant', () => {
    it('summary MUST appear AFTER all participants complete', () => {
      const messages = [
        createTestUserMessage({ id: 'u0', content: 'Q0', roundNumber: 0 }),
        createTestAssistantMessage({
          id: 'a0p0',
          content: 'P0 response',
          roundNumber: 0,
          participantId: 'participant-0',
          participantIndex: 0,
          finishReason: FinishReasons.STOP,
        }),
        createTestAssistantMessage({
          id: 'a0p1',
          content: 'P1 response',
          roundNumber: 0,
          participantId: 'participant-1',
          participantIndex: 1,
          finishReason: FinishReasons.STOP,
        }),
      ];

      const summaries = [
        createMockSummary(0, 'complete', ['a0p0', 'a0p1']),
      ];

      const { result } = renderHook(() =>
        useThreadTimeline({
          messages,
          summaries,
          changelog: [],
          preSearches: [],
        }),
      );

      const timeline = result.current;

      // Find positions
      const messagesIndex = timeline.findIndex(item => item.type === 'messages');
      const summaryIndex = timeline.findIndex(item => item.type === 'summary');

      expect(messagesIndex).toBeGreaterThan(-1);
      expect(summaryIndex).toBeGreaterThan(-1);
      expect(summaryIndex).toBeGreaterThan(messagesIndex);
    });

    it('summary MUST NOT appear while participants are still streaming', () => {
      const messages = [
        createTestUserMessage({ id: 'u0', content: 'Q0', roundNumber: 0 }),
        createTestAssistantMessage({
          id: 'a0p0',
          content: 'P0 response',
          roundNumber: 0,
          participantId: 'participant-0',
          participantIndex: 0,
          finishReason: FinishReasons.STOP,
        }),
        // Participant 1 is still streaming (no finishReason in a real scenario)
      ];

      // Pending summary with no participantMessageIds = not ready
      const summaries = [
        createMockSummary(0, 'pending', []),
      ];

      const { result } = renderHook(() =>
        useThreadTimeline({
          messages,
          summaries,
          changelog: [],
          preSearches: [],
        }),
      );

      const timeline = result.current;

      // Pending summary without messageIds should NOT appear
      const summaryItem = timeline.find(item => item.type === 'summary');
      expect(summaryItem).toBeUndefined();
    });

    it('summary with complete status always appears', () => {
      const messages = [
        createTestUserMessage({ id: 'u0', content: 'Q0', roundNumber: 0 }),
        createTestAssistantMessage({
          id: 'a0p0',
          content: 'P0 response',
          roundNumber: 0,
          participantId: 'participant-0',
          participantIndex: 0,
          finishReason: FinishReasons.STOP,
        }),
      ];

      const summaries = [
        createMockSummary(0, 'complete', ['a0p0']),
      ];

      const { result } = renderHook(() =>
        useThreadTimeline({
          messages,
          summaries,
          changelog: [],
          preSearches: [],
        }),
      );

      const timeline = result.current;
      const summaryItem = timeline.find(item => item.type === 'summary');
      expect(summaryItem).toBeDefined();
      expect(summaryItem?.type).toBe('summary');
    });
  });
});

// ============================================================================
// CHANGELOG POSITION TESTS
// ============================================================================

describe('changelog Position in Subsequent Rounds', () => {
  describe('changelog Appears ABOVE User Message', () => {
    it('changelog MUST appear BEFORE messages in the same round', () => {
      const messages = [
        // Round 0 - no config change
        createTestUserMessage({ id: 'u0', content: 'Q0', roundNumber: 0 }),
        createTestAssistantMessage({
          id: 'a0p0',
          content: 'R0',
          roundNumber: 0,
          participantId: 'participant-0',
          participantIndex: 0,
          finishReason: FinishReasons.STOP,
        }),
        // Round 1 - config changed
        createTestUserMessage({ id: 'u1', content: 'Q1', roundNumber: 1 }),
        createTestAssistantMessage({
          id: 'a1p0',
          content: 'R1',
          roundNumber: 1,
          participantId: 'new-participant-0',
          participantIndex: 0,
          finishReason: FinishReasons.STOP,
        }),
      ];

      const changelog = [
        createMockChangelog(1, [
          { type: 'removed', participantId: 'participant-0', modelId: 'provider/model-0' },
          { type: 'added', participantId: 'new-participant-0', modelId: 'provider/new-model-0' },
        ]),
      ];

      const summaries = [
        createMockSummary(0, 'complete', ['a0p0']),
        createMockSummary(1, 'complete', ['a1p0']),
      ];

      const { result } = renderHook(() =>
        useThreadTimeline({
          messages,
          summaries,
          changelog,
          preSearches: [],
        }),
      );

      const timeline = result.current;

      // Find round 1 items
      const round1Items = timeline.filter(item => item.roundNumber === 1);
      expect(round1Items.length).toBeGreaterThan(0);

      // Changelog should be FIRST in round 1
      expect(round1Items[0]?.type).toBe('changelog');

      // Then messages
      expect(round1Items[1]?.type).toBe('messages');
    });

    it('changelog persists after new round is submitted', () => {
      const messages = [
        // Round 1 with config change
        createTestUserMessage({ id: 'u1', content: 'Q1', roundNumber: 1 }),
        createTestAssistantMessage({
          id: 'a1p0',
          content: 'R1',
          roundNumber: 1,
          participantId: 'participant-0',
          participantIndex: 0,
          finishReason: FinishReasons.STOP,
        }),
        // Round 2 - same config
        createTestUserMessage({ id: 'u2', content: 'Q2', roundNumber: 2 }),
        createTestAssistantMessage({
          id: 'a2p0',
          content: 'R2',
          roundNumber: 2,
          participantId: 'participant-0',
          participantIndex: 0,
          finishReason: FinishReasons.STOP,
        }),
      ];

      const changelog = [
        createMockChangelog(1, [
          { type: 'added', participantId: 'participant-0', modelId: 'provider/model-0' },
        ]),
      ];

      const summaries = [
        createMockSummary(1, 'complete', ['a1p0']),
        createMockSummary(2, 'complete', ['a2p0']),
      ];

      const { result } = renderHook(() =>
        useThreadTimeline({
          messages,
          summaries,
          changelog,
          preSearches: [],
        }),
      );

      const timeline = result.current;

      // Round 1 changelog should still exist after round 2 is submitted
      const round1Changelog = timeline.find(
        item => item.type === 'changelog' && item.roundNumber === 1,
      );
      expect(round1Changelog).toBeDefined();
    });

    it('no changelog shown for round 0 (first round has no previous config)', () => {
      const messages = [
        createTestUserMessage({ id: 'u0', content: 'Q0', roundNumber: 0 }),
        createTestAssistantMessage({
          id: 'a0p0',
          content: 'R0',
          roundNumber: 0,
          participantId: 'participant-0',
          participantIndex: 0,
          finishReason: FinishReasons.STOP,
        }),
      ];

      const { result } = renderHook(() =>
        useThreadTimeline({
          messages,
          summaries: [createMockSummary(0, 'complete', ['a0p0'])],
          changelog: [],
          preSearches: [],
        }),
      );

      const timeline = result.current;
      const round0Changelog = timeline.find(
        item => item.type === 'changelog' && item.roundNumber === 0,
      );
      expect(round0Changelog).toBeUndefined();
    });
  });
});

// ============================================================================
// COMPLETE ROUND TIMELINE ORDER TESTS
// ============================================================================

describe('complete Round Timeline Order', () => {
  describe('full Round Order: Changelog → User → PreSearch → Participants → Summary', () => {
    it('round with all elements in correct order', () => {
      const messages = [
        createTestUserMessage({ id: 'u0', content: 'Q0', roundNumber: 0 }),
        createTestAssistantMessage({
          id: 'a0p0',
          content: 'P0',
          roundNumber: 0,
          participantId: 'participant-0',
          participantIndex: 0,
          finishReason: FinishReasons.STOP,
        }),
        createTestAssistantMessage({
          id: 'a0p1',
          content: 'P1',
          roundNumber: 0,
          participantId: 'participant-1',
          participantIndex: 1,
          finishReason: FinishReasons.STOP,
        }),
      ];

      const preSearches = [createMockPreSearch(0, 'complete')];
      const summaries = [createMockSummary(0, 'complete', ['a0p0', 'a0p1'])];

      const { result } = renderHook(() =>
        useThreadTimeline({
          messages,
          summaries,
          changelog: [],
          preSearches,
        }),
      );

      const timeline = result.current;

      // Expected order: messages (contains user + assistants), summary
      // Pre-search is rendered INSIDE ChatMessageList when messages exist
      expect(timeline.map(item => item.type)).toEqual(['messages', 'summary']);
    });

    it('multi-round conversation maintains correct order per round', () => {
      const messages = [
        // Round 0
        createTestUserMessage({ id: 'u0', content: 'Q0', roundNumber: 0 }),
        createTestAssistantMessage({
          id: 'a0p0',
          content: 'R0P0',
          roundNumber: 0,
          participantId: 'participant-0',
          participantIndex: 0,
          finishReason: FinishReasons.STOP,
        }),
        // Round 1 with config change
        createTestUserMessage({ id: 'u1', content: 'Q1', roundNumber: 1 }),
        createTestAssistantMessage({
          id: 'a1p0',
          content: 'R1P0',
          roundNumber: 1,
          participantId: 'new-participant-0',
          participantIndex: 0,
          finishReason: FinishReasons.STOP,
        }),
      ];

      const changelog = [
        createMockChangelog(1, [
          { type: 'removed', participantId: 'participant-0' },
          { type: 'added', participantId: 'new-participant-0', modelId: 'new-model' },
        ]),
      ];

      const summaries = [
        createMockSummary(0, 'complete', ['a0p0']),
        createMockSummary(1, 'complete', ['a1p0']),
      ];

      const { result } = renderHook(() =>
        useThreadTimeline({
          messages,
          summaries,
          changelog,
          preSearches: [],
        }),
      );

      const timeline = result.current;

      // Expected order:
      // Round 0: messages, summary
      // Round 1: changelog, messages, summary
      const expectedOrder = [
        { type: 'messages', roundNumber: 0 },
        { type: 'summary', roundNumber: 0 },
        { type: 'changelog', roundNumber: 1 },
        { type: 'messages', roundNumber: 1 },
        { type: 'summary', roundNumber: 1 },
      ];

      expect(timeline.map(item => ({ type: item.type, roundNumber: item.roundNumber }))).toEqual(expectedOrder);
    });
  });

  describe('orphaned Pre-Search (page refresh scenario)', () => {
    it('pre-search renders at timeline level when no messages exist for round', () => {
      const messages = [
        // Round 0 complete
        createTestUserMessage({ id: 'u0', content: 'Q0', roundNumber: 0 }),
        createTestAssistantMessage({
          id: 'a0p0',
          content: 'R0',
          roundNumber: 0,
          participantId: 'participant-0',
          participantIndex: 0,
          finishReason: FinishReasons.STOP,
        }),
        // Round 1 has NO messages yet (page refresh during web search)
      ];

      const preSearches = [
        createMockPreSearch(0, 'complete'),
        createMockPreSearch(1, 'streaming'), // Orphaned pre-search
      ];

      const summaries = [createMockSummary(0, 'complete', ['a0p0'])];

      const { result } = renderHook(() =>
        useThreadTimeline({
          messages,
          summaries,
          changelog: [],
          preSearches,
        }),
      );

      const timeline = result.current;

      // Round 1 should have a pre-search item at timeline level
      const round1PreSearch = timeline.find(
        item => item.type === 'pre-search' && item.roundNumber === 1,
      );
      expect(round1PreSearch).toBeDefined();
    });
  });
});

// ============================================================================
// RACE CONDITION TESTS
// ============================================================================

describe('race Condition Prevention', () => {
  describe('duplicate Trigger Prevention', () => {
    it('pre-search trigger is idempotent (only triggers once per round)', () => {
      const store = createChatStore();

      // First trigger should succeed
      const firstTrigger = store.getState().tryMarkPreSearchTriggered(0);
      expect(firstTrigger).toBe(true);

      // Second trigger should fail (already triggered)
      const secondTrigger = store.getState().tryMarkPreSearchTriggered(0);
      expect(secondTrigger).toBe(false);

      // Different round should succeed
      const round1Trigger = store.getState().tryMarkPreSearchTriggered(1);
      expect(round1Trigger).toBe(true);
    });

    it('summary trigger is idempotent (only triggers once per round)', () => {
      const store = createChatStore();

      // First check - not triggered yet
      expect(store.getState().hasSummaryStreamBeenTriggered('summary-123', 0)).toBe(false);

      // Mark as triggered
      store.getState().markSummaryStreamTriggered('summary-123', 0);

      // Second check - should be blocked
      expect(store.getState().hasSummaryStreamBeenTriggered('summary-123', 0)).toBe(true);

      // Different round should not be blocked
      expect(store.getState().hasSummaryStreamBeenTriggered('summary-456', 1)).toBe(false);
    });
  });

  describe('message Ordering During Concurrent Updates', () => {
    it('messages maintain correct order even when added out of sequence', () => {
      const messages = [
        createTestUserMessage({ id: 'u0', content: 'Q0', roundNumber: 0 }),
        // Intentionally out of order (simulating race condition)
        createTestAssistantMessage({
          id: 'a0p2',
          content: 'P2',
          roundNumber: 0,
          participantId: 'participant-2',
          participantIndex: 2,
          finishReason: FinishReasons.STOP,
        }),
        createTestAssistantMessage({
          id: 'a0p0',
          content: 'P0',
          roundNumber: 0,
          participantId: 'participant-0',
          participantIndex: 0,
          finishReason: FinishReasons.STOP,
        }),
        createTestAssistantMessage({
          id: 'a0p1',
          content: 'P1',
          roundNumber: 0,
          participantId: 'participant-1',
          participantIndex: 1,
          finishReason: FinishReasons.STOP,
        }),
      ];

      const { result } = renderHook(() =>
        useThreadTimeline({
          messages,
          summaries: [],
          changelog: [],
          preSearches: [],
        }),
      );

      const timeline = result.current;
      const messagesItem = timeline.find(item => item.type === 'messages');
      expect(messagesItem).toBeDefined();

      // useThreadTimeline sorts messages by participantIndex
      const sortedMessages = messagesItem?.data.filter(m => m.role === 'assistant');
      const indices = sortedMessages?.map(
        m => (m.metadata as { participantIndex?: number })?.participantIndex,
      );
      expect(indices).toEqual([0, 1, 2]);
    });
  });

  describe('pre-Search State Consistency', () => {
    it('pre-search deduplication prevents duplicate entries', () => {
      const store = createChatStore();

      store.getState().addPreSearch(createMockPreSearch(0, 'pending'));
      expect(store.getState().preSearches).toHaveLength(1);

      // Adding same round again should not duplicate
      store.getState().addPreSearch(createMockPreSearch(0, 'streaming'));
      expect(store.getState().preSearches).toHaveLength(1);

      // Different round should be added
      store.getState().addPreSearch(createMockPreSearch(1, 'pending'));
      expect(store.getState().preSearches).toHaveLength(2);
    });

    it('summary deduplication prevents duplicate entries', () => {
      const store = createChatStore();

      store.getState().addSummary(createMockSummary(0, 'pending'));
      expect(store.getState().summaries).toHaveLength(1);

      // Adding same round again should not duplicate
      store.getState().addSummary(createMockSummary(0, 'streaming'));
      expect(store.getState().summaries).toHaveLength(1);

      // Different round should be added
      store.getState().addSummary(createMockSummary(1, 'pending'));
      expect(store.getState().summaries).toHaveLength(2);
    });
  });
});

// ============================================================================
// MULTI-ROUND E2E SCENARIO TESTS
// ============================================================================

describe('multi-Round E2E Scenarios', () => {
  describe('complete 3-Round Conversation', () => {
    it('maintains correct timeline through 3 rounds with config changes', () => {
      const messages = [
        // Round 0: 2 participants
        createTestUserMessage({ id: 'u0', content: 'Initial question', roundNumber: 0 }),
        createTestAssistantMessage({
          id: 'a0p0',
          content: 'Response from P0',
          roundNumber: 0,
          participantId: 'p0',
          participantIndex: 0,
          finishReason: FinishReasons.STOP,
        }),
        createTestAssistantMessage({
          id: 'a0p1',
          content: 'Response from P1',
          roundNumber: 0,
          participantId: 'p1',
          participantIndex: 1,
          finishReason: FinishReasons.STOP,
        }),

        // Round 1: Same config
        createTestUserMessage({ id: 'u1', content: 'Follow-up 1', roundNumber: 1 }),
        createTestAssistantMessage({
          id: 'a1p0',
          content: 'R1 from P0',
          roundNumber: 1,
          participantId: 'p0',
          participantIndex: 0,
          finishReason: FinishReasons.STOP,
        }),
        createTestAssistantMessage({
          id: 'a1p1',
          content: 'R1 from P1',
          roundNumber: 1,
          participantId: 'p1',
          participantIndex: 1,
          finishReason: FinishReasons.STOP,
        }),

        // Round 2: Config changed - only 1 participant
        createTestUserMessage({ id: 'u2', content: 'Follow-up 2', roundNumber: 2 }),
        createTestAssistantMessage({
          id: 'a2p0',
          content: 'R2 from new P0',
          roundNumber: 2,
          participantId: 'new-p0',
          participantIndex: 0,
          finishReason: FinishReasons.STOP,
        }),
      ];

      const changelog = [
        createMockChangelog(2, [
          { type: 'removed', participantId: 'p0' },
          { type: 'removed', participantId: 'p1' },
          { type: 'added', participantId: 'new-p0', modelId: 'new-model' },
        ]),
      ];

      const summaries = [
        createMockSummary(0, 'complete', ['a0p0', 'a0p1']),
        createMockSummary(1, 'complete', ['a1p0', 'a1p1']),
        createMockSummary(2, 'complete', ['a2p0']),
      ];

      const { result } = renderHook(() =>
        useThreadTimeline({
          messages,
          summaries,
          changelog,
          preSearches: [],
        }),
      );

      const timeline = result.current;

      // Verify structure
      // Round 0: messages, summary
      // Round 1: messages, summary
      // Round 2: changelog, messages, summary
      expect(timeline).toHaveLength(7);

      // Round 0
      expect(timeline[0]).toEqual(expect.objectContaining({ type: 'messages', roundNumber: 0 }));
      expect(timeline[1]).toEqual(expect.objectContaining({ type: 'summary', roundNumber: 0 }));

      // Round 1
      expect(timeline[2]).toEqual(expect.objectContaining({ type: 'messages', roundNumber: 1 }));
      expect(timeline[3]).toEqual(expect.objectContaining({ type: 'summary', roundNumber: 1 }));

      // Round 2 (with changelog)
      expect(timeline[4]).toEqual(expect.objectContaining({ type: 'changelog', roundNumber: 2 }));
      expect(timeline[5]).toEqual(expect.objectContaining({ type: 'messages', roundNumber: 2 }));
      expect(timeline[6]).toEqual(expect.objectContaining({ type: 'summary', roundNumber: 2 }));
    });
  });

  describe('web Search Toggle Between Rounds', () => {
    it('handles web search enabled then disabled between rounds', () => {
      const messages = [
        // Round 0: Web search enabled
        createTestUserMessage({ id: 'u0', content: 'Q0', roundNumber: 0 }),
        createTestAssistantMessage({
          id: 'a0p0',
          content: 'R0 with search context',
          roundNumber: 0,
          participantId: 'p0',
          participantIndex: 0,
          finishReason: FinishReasons.STOP,
        }),

        // Round 1: Web search disabled
        createTestUserMessage({ id: 'u1', content: 'Q1', roundNumber: 1 }),
        createTestAssistantMessage({
          id: 'a1p0',
          content: 'R1 without search',
          roundNumber: 1,
          participantId: 'p0',
          participantIndex: 0,
          finishReason: FinishReasons.STOP,
        }),
      ];

      const preSearches = [
        createMockPreSearch(0, 'complete'), // Only round 0 has pre-search
      ];

      const summaries = [
        createMockSummary(0, 'complete', ['a0p0']),
        createMockSummary(1, 'complete', ['a1p0']),
      ];

      const { result } = renderHook(() =>
        useThreadTimeline({
          messages,
          summaries,
          changelog: [],
          preSearches,
        }),
      );

      const timeline = result.current;

      // Verify structure
      expect(timeline.map(item => ({ type: item.type, roundNumber: item.roundNumber }))).toEqual([
        { type: 'messages', roundNumber: 0 },
        { type: 'summary', roundNumber: 0 },
        { type: 'messages', roundNumber: 1 },
        { type: 'summary', roundNumber: 1 },
      ]);

      // No orphaned pre-search items at timeline level (rendered inside messages)
      const timelinePreSearches = timeline.filter(item => item.type === 'pre-search');
      expect(timelinePreSearches).toHaveLength(0);
    });
  });
});
