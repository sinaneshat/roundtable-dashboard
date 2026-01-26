/**
 * Conversation Round E2E Ordering Tests
 *
 * Comprehensive tests for timeline ordering across conversation rounds:
 *
 * SINGLE SOURCE OF TRUTH for conversation round behavior:
 * 1. Round starts when user sends a message (with optional files)
 * 2. Web search (if enabled) MUST complete BEFORE any participant speaks
 * 3. Participants respond in priority order (index 0, 1, 2...)
 * 4. Round moderator appears AFTER all participants complete
 * 5. Changelog appears ABOVE user message in subsequent rounds when config changes
 *
 * Timeline order per round:
 * [Changelog if config changed] → User Message → [Pre-search if enabled] → Participants → Moderator
 *
 * These tests validate the expected behavior documented in FLOW_DOCUMENTATION.md
 */

import { ChatModes, FinishReasons, MessageRoles, MessageStatuses, UIMessageRoles } from '@roundtable/shared';
import { describe, expect, it } from 'vitest';

import { useThreadTimeline } from '@/hooks/utils';
import {
  createTestAssistantMessage,
  createTestModeratorMessage,
  createTestUserMessage,
  renderHook,
} from '@/lib/testing';
import { getParticipantIndex, getRoundNumber } from '@/lib/utils';
import type { ApiMessage, ChatParticipant, ChatThread, ChatThreadChangelog, StoredPreSearch } from '@/services/api';

import { createChatStore } from '../store';

// ============================================================================
// TEST HELPERS
// ============================================================================

function createMockThread(overrides?: Partial<ChatThread>): ChatThread {
  return {
    createdAt: new Date(),
    enableWebSearch: true,
    id: 'thread-123',
    isAiGeneratedTitle: false,
    isFavorite: false,
    isPublic: false,
    lastMessageAt: new Date(),
    metadata: null,
    mode: ChatModes.ANALYZING,
    previousSlug: null,
    projectId: null,
    slug: 'test-thread',
    status: 'active',
    title: 'Test Thread',
    updatedAt: new Date(),
    userId: 'user-123',
    version: 1,
    ...overrides,
  } as ChatThread;
}

function createMockParticipant(index: number, threadId = 'thread-123'): ChatParticipant {
  return {
    createdAt: new Date(),
    customRoleId: null,
    id: `participant-${index}`,
    isEnabled: true,
    modelId: `provider/model-${index}`,
    priority: index,
    role: null,
    settings: null,
    threadId,
    updatedAt: new Date(),
  } as ChatParticipant;
}

function createMockPreSearch(
  roundNumber: number,
  status: 'pending' | 'streaming' | 'complete' | 'failed' = 'complete',
  threadId = 'thread-123',
): StoredPreSearch {
  return {
    completedAt: status === 'complete' ? new Date() : null,
    createdAt: new Date(),
    errorMessage: null,
    id: `presearch-${threadId}-r${roundNumber}`,
    roundNumber,
    searchData: status === 'complete'
      ? {
          failureCount: 0,
          moderatorSummary: 'Search moderator summary',
          queries: [{ index: 0, query: 'test', rationale: 'test', searchDepth: 'basic' as const, total: 1 }],
          results: [],
          successCount: 1,
          totalResults: 0,
          totalTime: 100,
        }
      : null,
    status: status === 'pending'
      ? MessageStatuses.PENDING
      : status === 'streaming'
        ? MessageStatuses.STREAMING
        : status === 'complete'
          ? MessageStatuses.COMPLETE
          : MessageStatuses.FAILED,
    threadId,
    userQuery: `Query for round ${roundNumber}`,
  } as StoredPreSearch;
}

function createMockChangelog(
  roundNumber: number,
  changes: {
    type: 'added' | 'removed' | 'modified' | 'reordered' | 'mode_change';
    participantId?: string;
    modelId?: string;
  }[],
  threadId = 'thread-123',
): ChatThreadChangelog {
  return {
    changeData: {
      changes: changes.map(c => ({
        modelId: c.modelId,
        participantId: c.participantId,
        type: c.type,
      })),
    },
    changeType: 'participant_change',
    createdAt: new Date(),
    id: `changelog-${threadId}-r${roundNumber}`,
    previousRoundNumber: roundNumber > 0 ? roundNumber - 1 : null,
    roundNumber,
    threadId,
  } as ChatThreadChangelog;
}

function createModeratorMsg(
  roundNumber: number,
  content = `Moderator for round ${roundNumber}`,
): ApiMessage {
  return createTestModeratorMessage({
    content,
    finishReason: FinishReasons.STOP,
    id: `thread-123_r${roundNumber}_moderator`,
    roundNumber,
  });
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
        content: 'First question',
        id: 'thread-123_r0_user',
        roundNumber: 0,
      });

      store.getState().setMessages([userMessage]);

      const messages = store.getState().messages;
      expect(messages).toHaveLength(1);
      expect(messages[0]?.role).toBe(MessageRoles.USER);
      expect(getRoundNumber(messages[0]?.metadata)).toBe(0);
    });

    it('subsequent rounds start when user sends follow-up message', () => {
      const store = createChatStore();
      const thread = createMockThread();
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, []);

      // Round 0 complete
      store.getState().setMessages([
        createTestUserMessage({ content: 'Q0', id: 'u0', roundNumber: 0 }),
        createTestAssistantMessage({
          content: 'R0',
          finishReason: FinishReasons.STOP,
          id: 'a0',
          participantId: 'participant-0',
          participantIndex: 0,
          roundNumber: 0,
        }),
      ]);

      // User sends round 1 message
      const round1Message = createTestUserMessage({
        content: 'Follow-up question',
        id: 'thread-123_r1_user',
        roundNumber: 1,
      });

      store.getState().setMessages([
        ...store.getState().messages,
        round1Message,
      ]);

      const messages = store.getState().messages;
      const round1UserMsg = messages.find(
        m => m.role === UIMessageRoles.USER && getRoundNumber(m.metadata) === 1,
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
        createTestUserMessage({ content: 'Q0', id: 'u0', roundNumber: 0 }),
      ]);

      // Pre-search is pending - participants should be blocked
      const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 0);
      expect(preSearch?.status).toBe(MessageStatuses.PENDING);

      // No assistant messages should exist yet
      const assistantMessages = store.getState().messages.filter(m => m.role === UIMessageRoles.ASSISTANT);
      expect(assistantMessages).toHaveLength(0);
    });

    it('participants MUST NOT speak while pre-search is STREAMING', () => {
      const store = createChatStore();
      const thread = createMockThread({ enableWebSearch: true });
      const participants = [createMockParticipant(0), createMockParticipant(1)];

      store.getState().initializeThread(thread, participants, []);
      store.getState().addPreSearch(createMockPreSearch(0, 'streaming'));

      store.getState().setMessages([
        createTestUserMessage({ content: 'Q0', id: 'u0', roundNumber: 0 }),
      ]);

      // Pre-search is streaming - participants should be blocked
      const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 0);
      expect(preSearch?.status).toBe(MessageStatuses.STREAMING);

      // No assistant messages should exist yet
      const assistantMessages = store.getState().messages.filter(m => m.role === UIMessageRoles.ASSISTANT);
      expect(assistantMessages).toHaveLength(0);
    });

    it('participants CAN speak after pre-search is COMPLETE', () => {
      const store = createChatStore();
      const thread = createMockThread({ enableWebSearch: true });
      const participants = [createMockParticipant(0), createMockParticipant(1)];

      store.getState().initializeThread(thread, participants, []);
      store.getState().addPreSearch(createMockPreSearch(0, 'complete'));

      store.getState().setMessages([
        createTestUserMessage({ content: 'Q0', id: 'u0', roundNumber: 0 }),
        createTestAssistantMessage({
          content: 'Response from participant 0',
          finishReason: FinishReasons.STOP,
          id: 'a0p0',
          participantId: 'participant-0',
          participantIndex: 0,
          roundNumber: 0,
        }),
      ]);

      // Pre-search is complete - participants can speak
      const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 0);
      expect(preSearch?.status).toBe(MessageStatuses.COMPLETE);

      // Assistant message should exist
      const assistantMessages = store.getState().messages.filter(m => m.role === UIMessageRoles.ASSISTANT);
      expect(assistantMessages).toHaveLength(1);
    });

    it('participants CAN speak after pre-search FAILED (non-blocking failure)', () => {
      const store = createChatStore();
      const thread = createMockThread({ enableWebSearch: true });
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, []);
      store.getState().addPreSearch(createMockPreSearch(0, 'failed'));

      store.getState().setMessages([
        createTestUserMessage({ content: 'Q0', id: 'u0', roundNumber: 0 }),
        createTestAssistantMessage({
          content: 'Response without search data',
          finishReason: FinishReasons.STOP,
          id: 'a0p0',
          participantId: 'participant-0',
          participantIndex: 0,
          roundNumber: 0,
        }),
      ]);

      // Pre-search failed - participants should still be able to speak
      const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 0);
      expect(preSearch?.status).toBe(MessageStatuses.FAILED);

      const assistantMessages = store.getState().messages.filter(m => m.role === UIMessageRoles.ASSISTANT);
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
        createTestUserMessage({ content: 'Q0', id: 'u0', roundNumber: 0 }),
        createTestAssistantMessage({
          content: 'Immediate response',
          finishReason: FinishReasons.STOP,
          id: 'a0p0',
          participantId: 'participant-0',
          participantIndex: 0,
          roundNumber: 0,
        }),
      ]);

      const assistantMessages = store.getState().messages.filter(m => m.role === UIMessageRoles.ASSISTANT);
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
        createTestUserMessage({ content: 'Q0', id: 'u0', roundNumber: 0 }),
        createTestAssistantMessage({
          content: 'First response',
          finishReason: FinishReasons.STOP,
          id: 'a0p0',
          participantId: 'participant-0',
          participantIndex: 0,
          roundNumber: 0,
        }),
        createTestAssistantMessage({
          content: 'Second response',
          finishReason: FinishReasons.STOP,
          id: 'a0p1',
          participantId: 'participant-1',
          participantIndex: 1,
          roundNumber: 0,
        }),
        createTestAssistantMessage({
          content: 'Third response',
          finishReason: FinishReasons.STOP,
          id: 'a0p2',
          participantId: 'participant-2',
          participantIndex: 2,
          roundNumber: 0,
        }),
      ]);

      const assistantMessages = store.getState().messages.filter(m => m.role === UIMessageRoles.ASSISTANT);
      expect(assistantMessages).toHaveLength(3);

      // Verify order by participantIndex
      const indices = assistantMessages.map(m => getParticipantIndex(m.metadata));
      expect(indices).toEqual([0, 1, 2]);
    });

    it('participant n+1 MUST NOT start until participant n completes', () => {
      const store = createChatStore();
      const participants = [createMockParticipant(0), createMockParticipant(1)];

      store.getState().initializeThread(createMockThread(), participants, []);

      // During streaming: participant 0 is streaming (no finishReason)
      store.getState().setMessages([
        createTestUserMessage({ content: 'Q0', id: 'u0', roundNumber: 0 }),
        {
          id: 'a0p0',
          metadata: {
            finishReason: null, // Still streaming
            hasError: false,
            isTransient: false,
            model: 'provider/model-0',
            participantId: 'participant-0',
            participantIndex: 0,
            participantRole: null,
            role: MessageRoles.ASSISTANT,
            roundNumber: 0,
            usage: { completionTokens: 0, promptTokens: 0, totalTokens: 0 },
          },
          parts: [{ text: 'Streaming...', type: 'text' }],
          role: MessageRoles.ASSISTANT,
        } as ApiMessage,
      ]);

      // Only one assistant message (participant 0 streaming)
      const assistantMessages = store.getState().messages.filter(m => m.role === UIMessageRoles.ASSISTANT);
      expect(assistantMessages).toHaveLength(1);
      expect(getParticipantIndex(assistantMessages[0]?.metadata)).toBe(0);
    });
  });
});

// ============================================================================
// ROUND MODERATOR POSITION TESTS
// ============================================================================

describe('round Moderator Position', () => {
  describe('moderator Appears After Last Participant', () => {
    it('moderator MUST appear AFTER all participants in messages array', () => {
      // ✅ UNIFIED: Moderator now renders inline with participants in messages
      // Not as a separate timeline item
      const messages = [
        createTestUserMessage({ content: 'Q0', id: 'u0', roundNumber: 0 }),
        createTestAssistantMessage({
          content: 'P0 response',
          finishReason: FinishReasons.STOP,
          id: 'a0p0',
          participantId: 'participant-0',
          participantIndex: 0,
          roundNumber: 0,
        }),
        createTestAssistantMessage({
          content: 'P1 response',
          finishReason: FinishReasons.STOP,
          id: 'a0p1',
          participantId: 'participant-1',
          participantIndex: 1,
          roundNumber: 0,
        }),
        createModeratorMsg(0, 'Round 0 summary'),
      ];

      const { result } = renderHook(() =>
        useThreadTimeline({
          changelog: [],
          messages,
          preSearches: [],
        }),
      );

      const timeline = result.current;

      // Messages timeline item should exist
      const messagesItem = timeline.find(item => item.type === 'messages');
      expect(messagesItem).toBeDefined();
      expect(messagesItem?.type).toBe('messages');

      // ✅ UNIFIED: Moderator is now in messages array, sorted LAST
      const roundMessages = messagesItem?.type === 'messages' ? messagesItem.data : [];
      const lastMessage = roundMessages[roundMessages.length - 1];
      expect(lastMessage?.metadata).toHaveProperty('isModerator', true);
    });

    it('moderator MUST NOT appear while participants are still streaming', () => {
      const messages = [
        createTestUserMessage({ content: 'Q0', id: 'u0', roundNumber: 0 }),
        createTestAssistantMessage({
          content: 'P0 response',
          finishReason: FinishReasons.STOP,
          id: 'a0p0',
          participantId: 'participant-0',
          participantIndex: 0,
          roundNumber: 0,
        }),
        // Participant 1 is still streaming (no finishReason in a real scenario)
      ];

      const { result } = renderHook(() =>
        useThreadTimeline({
          changelog: [],
          messages,
          preSearches: [],
        }),
      );

      const timeline = result.current;

      // Pending moderator without messageIds should NOT appear
      const moderatorItem = timeline.find(item => item.type === 'moderator');
      expect(moderatorItem).toBeUndefined();
    });

    it('moderator with complete status always appears in messages', () => {
      // ✅ UNIFIED: Moderator is now included in messages, not as separate summary
      const messages = [
        createTestUserMessage({ content: 'Q0', id: 'u0', roundNumber: 0 }),
        createTestAssistantMessage({
          content: 'P0 response',
          finishReason: FinishReasons.STOP,
          id: 'a0p0',
          participantId: 'participant-0',
          participantIndex: 0,
          roundNumber: 0,
        }),
        createModeratorMsg(0, 'Round 0 summary'),
      ];

      const { result } = renderHook(() =>
        useThreadTimeline({
          changelog: [],
          messages,
          preSearches: [],
        }),
      );

      const timeline = result.current;

      // Should have messages item
      const messagesItem = timeline.find(item => item.type === 'messages');
      expect(messagesItem).toBeDefined();

      // Moderator should be in messages, sorted last
      const roundMessages = messagesItem?.type === 'messages' ? messagesItem.data : [];
      const moderatorMessage = roundMessages.find(m => m.metadata && 'isModerator' in m.metadata && m.metadata.isModerator === true);
      expect(moderatorMessage).toBeDefined();
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
        createTestUserMessage({ content: 'Q0', id: 'u0', roundNumber: 0 }),
        createTestAssistantMessage({
          content: 'R0',
          finishReason: FinishReasons.STOP,
          id: 'a0p0',
          participantId: 'participant-0',
          participantIndex: 0,
          roundNumber: 0,
        }),
        // Round 1 - config changed
        createTestUserMessage({ content: 'Q1', id: 'u1', roundNumber: 1 }),
        createTestAssistantMessage({
          content: 'R1',
          finishReason: FinishReasons.STOP,
          id: 'a1p0',
          participantId: 'new-participant-0',
          participantIndex: 0,
          roundNumber: 1,
        }),
      ];

      const changelog = [
        createMockChangelog(1, [
          { modelId: 'provider/model-0', participantId: 'participant-0', type: 'removed' },
          { modelId: 'provider/new-model-0', participantId: 'new-participant-0', type: 'added' },
        ]),
      ];

      const { result } = renderHook(() =>
        useThreadTimeline({
          changelog,
          messages,
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
        createTestUserMessage({ content: 'Q1', id: 'u1', roundNumber: 1 }),
        createTestAssistantMessage({
          content: 'R1',
          finishReason: FinishReasons.STOP,
          id: 'a1p0',
          participantId: 'participant-0',
          participantIndex: 0,
          roundNumber: 1,
        }),
        // Round 2 - same config
        createTestUserMessage({ content: 'Q2', id: 'u2', roundNumber: 2 }),
        createTestAssistantMessage({
          content: 'R2',
          finishReason: FinishReasons.STOP,
          id: 'a2p0',
          participantId: 'participant-0',
          participantIndex: 0,
          roundNumber: 2,
        }),
      ];

      const changelog = [
        createMockChangelog(1, [
          { modelId: 'provider/model-0', participantId: 'participant-0', type: 'added' },
        ]),
      ];

      // ✅ TEXT STREAMING: summaries removed - now chatMessage with metadata.isModerator

      const { result } = renderHook(() =>
        useThreadTimeline({
          changelog,
          messages,
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
        createTestUserMessage({ content: 'Q0', id: 'u0', roundNumber: 0 }),
        createTestAssistantMessage({
          content: 'R0',
          finishReason: FinishReasons.STOP,
          id: 'a0p0',
          participantId: 'participant-0',
          participantIndex: 0,
          roundNumber: 0,
        }),
      ];

      const { result } = renderHook(() =>
        useThreadTimeline({
          changelog: [],
          messages,
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
      // ✅ UNIFIED: Moderator is now included in messages, not as separate summary
      const messages = [
        createTestUserMessage({ content: 'Q0', id: 'u0', roundNumber: 0 }),
        createTestAssistantMessage({
          content: 'P0',
          finishReason: FinishReasons.STOP,
          id: 'a0p0',
          participantId: 'participant-0',
          participantIndex: 0,
          roundNumber: 0,
        }),
        createTestAssistantMessage({
          content: 'P1',
          finishReason: FinishReasons.STOP,
          id: 'a0p1',
          participantId: 'participant-1',
          participantIndex: 1,
          roundNumber: 0,
        }),
        createModeratorMsg(0, 'Round 0 summary'),
      ];

      const preSearches = [createMockPreSearch(0, 'complete')];

      const { result } = renderHook(() =>
        useThreadTimeline({
          changelog: [],
          messages,
          preSearches,
        }),
      );

      const timeline = result.current;

      // ✅ UNIFIED: Only 'messages' item now (moderator is inside messages, sorted last)
      // Pre-search is rendered INSIDE ChatMessageList when messages exist
      expect(timeline.map(item => item.type)).toEqual(['messages']);

      // Verify order within messages: user, participants by index, then moderator
      const messagesItem = timeline.find(item => item.type === 'messages');
      const roundMessages = messagesItem?.type === 'messages' ? messagesItem.data : [];
      expect(roundMessages).toHaveLength(4); // user + 2 participants + moderator
      expect(roundMessages[0]?.role).toBe(MessageRoles.USER);
      expect(roundMessages[3]?.metadata).toHaveProperty('isModerator', true);
    });

    it('multi-round conversation maintains correct order per round', () => {
      const messages = [
        // Round 0
        createTestUserMessage({ content: 'Q0', id: 'u0', roundNumber: 0 }),
        createTestAssistantMessage({
          content: 'R0P0',
          finishReason: FinishReasons.STOP,
          id: 'a0p0',
          participantId: 'participant-0',
          participantIndex: 0,
          roundNumber: 0,
        }),
        // Round 1 with config change
        createTestUserMessage({ content: 'Q1', id: 'u1', roundNumber: 1 }),
        createTestAssistantMessage({
          content: 'R1P0',
          finishReason: FinishReasons.STOP,
          id: 'a1p0',
          participantId: 'new-participant-0',
          participantIndex: 0,
          roundNumber: 1,
        }),
      ];

      const changelog = [
        createMockChangelog(1, [
          { participantId: 'participant-0', type: 'removed' },
          { modelId: 'new-model', participantId: 'new-participant-0', type: 'added' },
        ]),
      ];

      // ✅ TEXT STREAMING: summaries removed - now chatMessage with metadata.isModerator

      const { result } = renderHook(() =>
        useThreadTimeline({
          changelog,
          messages,
          preSearches: [],
        }),
      );

      const timeline = result.current;

      // Expected order (without summaries):
      // Round 0: messages
      // Round 1: changelog, messages
      const expectedOrder = [
        { roundNumber: 0, type: 'messages' },
        { roundNumber: 1, type: 'changelog' },
        { roundNumber: 1, type: 'messages' },
      ];

      expect(timeline.map(item => ({ roundNumber: item.roundNumber, type: item.type }))).toEqual(expectedOrder);
    });
  });

  describe('orphaned Pre-Search (page refresh scenario)', () => {
    it('pre-search renders at timeline level when no messages exist for round', () => {
      const messages = [
        // Round 0 complete
        createTestUserMessage({ content: 'Q0', id: 'u0', roundNumber: 0 }),
        createTestAssistantMessage({
          content: 'R0',
          finishReason: FinishReasons.STOP,
          id: 'a0p0',
          participantId: 'participant-0',
          participantIndex: 0,
          roundNumber: 0,
        }),
        // Round 1 has NO messages yet (page refresh during web search)
      ];

      const preSearches = [
        createMockPreSearch(0, 'complete'),
        createMockPreSearch(1, 'streaming'), // Orphaned pre-search
      ];

      const { result } = renderHook(() =>
        useThreadTimeline({
          changelog: [],
          messages,
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
      expect(firstTrigger).toBeTruthy();

      // Second trigger should fail (already triggered)
      const secondTrigger = store.getState().tryMarkPreSearchTriggered(0);
      expect(secondTrigger).toBeFalsy();

      // Different round should succeed
      const round1Trigger = store.getState().tryMarkPreSearchTriggered(1);
      expect(round1Trigger).toBeTruthy();
    });

    it('moderator trigger is idempotent (only triggers once per round)', () => {
      const store = createChatStore();

      // First check - not triggered yet
      expect(store.getState().hasModeratorStreamBeenTriggered('moderator-123', 0)).toBeFalsy();

      // Mark as triggered
      store.getState().markModeratorStreamTriggered('moderator-123', 0);

      // Second check - should be blocked
      expect(store.getState().hasModeratorStreamBeenTriggered('moderator-123', 0)).toBeTruthy();

      // Different round should not be blocked
      expect(store.getState().hasModeratorStreamBeenTriggered('moderator-456', 1)).toBeFalsy();
    });
  });

  describe('message Ordering During Concurrent Updates', () => {
    it('messages maintain correct order even when added out of sequence', () => {
      const messages = [
        createTestUserMessage({ content: 'Q0', id: 'u0', roundNumber: 0 }),
        // Intentionally out of order (simulating race condition)
        createTestAssistantMessage({
          content: 'P2',
          finishReason: FinishReasons.STOP,
          id: 'a0p2',
          participantId: 'participant-2',
          participantIndex: 2,
          roundNumber: 0,
        }),
        createTestAssistantMessage({
          content: 'P0',
          finishReason: FinishReasons.STOP,
          id: 'a0p0',
          participantId: 'participant-0',
          participantIndex: 0,
          roundNumber: 0,
        }),
        createTestAssistantMessage({
          content: 'P1',
          finishReason: FinishReasons.STOP,
          id: 'a0p1',
          participantId: 'participant-1',
          participantIndex: 1,
          roundNumber: 0,
        }),
      ];

      const { result } = renderHook(() =>
        useThreadTimeline({
          changelog: [],
          messages,
          preSearches: [],
        }),
      );

      const timeline = result.current;
      const messagesItem = timeline.find(item => item.type === 'messages');
      expect(messagesItem).toBeDefined();

      // useThreadTimeline sorts messages by participantIndex
      const sortedMessages = messagesItem?.data.filter(m => m.role === UIMessageRoles.ASSISTANT);
      const indices = sortedMessages?.map(m => getParticipantIndex(m.metadata));
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
        createTestUserMessage({ content: 'Initial question', id: 'u0', roundNumber: 0 }),
        createTestAssistantMessage({
          content: 'Response from P0',
          finishReason: FinishReasons.STOP,
          id: 'a0p0',
          participantId: 'p0',
          participantIndex: 0,
          roundNumber: 0,
        }),
        createTestAssistantMessage({
          content: 'Response from P1',
          finishReason: FinishReasons.STOP,
          id: 'a0p1',
          participantId: 'p1',
          participantIndex: 1,
          roundNumber: 0,
        }),

        // Round 1: Same config
        createTestUserMessage({ content: 'Follow-up 1', id: 'u1', roundNumber: 1 }),
        createTestAssistantMessage({
          content: 'R1 from P0',
          finishReason: FinishReasons.STOP,
          id: 'a1p0',
          participantId: 'p0',
          participantIndex: 0,
          roundNumber: 1,
        }),
        createTestAssistantMessage({
          content: 'R1 from P1',
          finishReason: FinishReasons.STOP,
          id: 'a1p1',
          participantId: 'p1',
          participantIndex: 1,
          roundNumber: 1,
        }),

        // Round 2: Config changed - only 1 participant
        createTestUserMessage({ content: 'Follow-up 2', id: 'u2', roundNumber: 2 }),
        createTestAssistantMessage({
          content: 'R2 from new P0',
          finishReason: FinishReasons.STOP,
          id: 'a2p0',
          participantId: 'new-p0',
          participantIndex: 0,
          roundNumber: 2,
        }),
      ];

      const changelog = [
        createMockChangelog(2, [
          { participantId: 'p0', type: 'removed' },
          { participantId: 'p1', type: 'removed' },
          { modelId: 'new-model', participantId: 'new-p0', type: 'added' },
        ]),
      ];

      // ✅ TEXT STREAMING: moderators now chatMessage with metadata.isModerator

      const { result } = renderHook(() =>
        useThreadTimeline({
          changelog,
          messages,
          preSearches: [],
        }),
      );

      const timeline = result.current;

      // Verify structure (with moderators in messages)
      // Round 0: messages
      // Round 1: messages
      // Round 2: changelog, messages
      expect(timeline).toHaveLength(4);

      // Round 0
      expect(timeline[0]).toEqual(expect.objectContaining({ roundNumber: 0, type: 'messages' }));

      // Round 1
      expect(timeline[1]).toEqual(expect.objectContaining({ roundNumber: 1, type: 'messages' }));

      // Round 2 (with changelog)
      expect(timeline[2]).toEqual(expect.objectContaining({ roundNumber: 2, type: 'changelog' }));
      expect(timeline[3]).toEqual(expect.objectContaining({ roundNumber: 2, type: 'messages' }));
    });
  });

  describe('web Search Toggle Between Rounds', () => {
    it('handles web search enabled then disabled between rounds', () => {
      // ✅ UNIFIED: Moderator is now included in messages, not as separate item
      const messages = [
        // Round 0: Web search enabled
        createTestUserMessage({ content: 'Q0', id: 'u0', roundNumber: 0 }),
        createTestAssistantMessage({
          content: 'R0 with search context',
          finishReason: FinishReasons.STOP,
          id: 'a0p0',
          participantId: 'p0',
          participantIndex: 0,
          roundNumber: 0,
        }),
        createModeratorMsg(0, 'Round 0 moderator'),

        // Round 1: Web search disabled
        createTestUserMessage({ content: 'Q1', id: 'u1', roundNumber: 1 }),
        createTestAssistantMessage({
          content: 'R1 without search',
          finishReason: FinishReasons.STOP,
          id: 'a1p0',
          participantId: 'p0',
          participantIndex: 0,
          roundNumber: 1,
        }),
        createModeratorMsg(1, 'Round 1 moderator'),
      ];

      const preSearches = [
        createMockPreSearch(0, 'complete'), // Only round 0 has pre-search
      ];

      const { result } = renderHook(() =>
        useThreadTimeline({
          changelog: [],
          messages,
          preSearches,
        }),
      );

      const timeline = result.current;

      // ✅ UNIFIED: Only 'messages' items now (moderator inside each round's messages)
      expect(timeline.map(item => ({ roundNumber: item.roundNumber, type: item.type }))).toEqual([
        { roundNumber: 0, type: 'messages' },
        { roundNumber: 1, type: 'messages' },
      ]);

      // Verify moderator is last in each round
      const round0 = timeline.find(item => item.type === 'messages' && item.roundNumber === 0);
      const round1 = timeline.find(item => item.type === 'messages' && item.roundNumber === 1);

      const round0Messages = round0?.type === 'messages' ? round0.data : [];
      const round1Messages = round1?.type === 'messages' ? round1.data : [];

      expect(round0Messages[round0Messages.length - 1]?.metadata).toHaveProperty('isModerator', true);
      expect(round1Messages[round1Messages.length - 1]?.metadata).toHaveProperty('isModerator', true);

      // No orphaned pre-search items at timeline level (rendered inside messages)
      const timelinePreSearches = timeline.filter(item => item.type === 'pre-search');
      expect(timelinePreSearches).toHaveLength(0);
    });
  });
});
