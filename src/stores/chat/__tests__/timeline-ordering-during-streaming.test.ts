/**
 * Timeline Ordering During Streaming Tests
 *
 * Verifies timeline items appear in correct order during streaming:
 * 1. Pre-search should appear before participant messages
 * 2. User messages should appear before assistant responses
 * 3. Round moderator should appear after all participants
 * 4. Non-initial rounds should maintain correct ordering
 *
 * Bug scenarios tested:
 * - Pre-search appearing after participant messages during streaming
 * - Timeline jumping/reordering during live updates
 * - Wrong timeline position for non-first round elements
 */

import { describe, expect, it } from 'vitest';

import { ChatModes, MessagePartTypes, MessageRoles, MessageStatuses } from '@/api/core/enums';
import type { ChatMessage, ChatParticipant, StoredPreSearch } from '@/api/routes/chat/schema';
import type { DbAssistantMessageMetadata, DbModeratorMessageMetadata, DbUserMessageMetadata } from '@/db/schemas/chat-metadata';
import { isAssistantMessageMetadata } from '@/db/schemas/chat-metadata';

import { createChatStore } from '../store';

// ============================================================================
// TIMELINE ITEM TYPE HELPERS
// ============================================================================

type TimelineItemType = 'user-message'
  | 'assistant-message'
  | 'pre-search'
  | 'round-moderator' // Represents moderator message (isModerator: true)
  | 'pending-message'
  | 'pending-participant';

type MockTimelineItem = {
  type: TimelineItemType;
  roundNumber: number;
  participantIndex?: number;
};

// ============================================================================
// TEST HELPER FUNCTIONS
// ============================================================================

function createMockThread(threadId: string) {
  return {
    id: threadId,
    userId: 'user-123',
    title: 'Test Thread',
    slug: 'test-thread',
    previousSlug: null,
    projectId: null,
    mode: ChatModes.ANALYZING,
    status: 'active' as const,
    enableWebSearch: true,
    isFavorite: false,
    isPublic: false,
    isAiGeneratedTitle: false,
    metadata: null,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastMessageAt: new Date(),
  };
}

function createMockParticipants(threadId: string, count: number): ChatParticipant[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `participant-${i}`,
    threadId,
    modelId: `provider/model-${i}`,
    role: null,
    customRoleId: null,
    priority: i,
    isEnabled: true,
    settings: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));
}

function createUserMessage(threadId: string, roundNumber: number, text: string): ChatMessage {
  const metadata: DbUserMessageMetadata = {
    role: MessageRoles.USER,
    roundNumber,
  };
  return {
    id: `${threadId}_r${roundNumber}_user`,
    role: MessageRoles.USER,
    parts: [{ type: MessagePartTypes.TEXT, text }],
    metadata,
  };
}

function createAssistantMessage(
  threadId: string,
  roundNumber: number,
  participantIndex: number,
  participantId: string,
  text: string,
): ChatMessage {
  const metadata: DbAssistantMessageMetadata = {
    role: MessageRoles.ASSISTANT,
    roundNumber,
    participantId,
    participantIndex,
    participantRole: null,
    model: `provider/model-${participantIndex}`,
    finishReason: 'stop',
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    hasError: false,
    isTransient: false,
    isPartialResponse: false,
  };
  return {
    id: `${threadId}_r${roundNumber}_p${participantIndex}`,
    role: MessageRoles.ASSISTANT,
    parts: [{ type: MessagePartTypes.TEXT, text }],
    metadata,
  };
}

function createModeratorMessage(
  threadId: string,
  roundNumber: number,
  text: string,
): ChatMessage {
  const metadata: DbModeratorMessageMetadata = {
    role: MessageRoles.ASSISTANT,
    isModerator: true,
    roundNumber,
    model: 'moderator-model',
    hasError: false,
  };
  return {
    id: `${threadId}_r${roundNumber}_moderator`,
    role: MessageRoles.ASSISTANT,
    parts: [{ type: MessagePartTypes.TEXT, text }],
    metadata,
  };
}

function createPlaceholderPreSearch(
  threadId: string,
  roundNumber: number,
  userQuery: string,
): StoredPreSearch {
  return {
    id: `presearch-${threadId}-r${roundNumber}`,
    threadId,
    roundNumber,
    userQuery,
    status: MessageStatuses.PENDING,
    searchData: null,
    errorMessage: null,
    createdAt: new Date(),
    completedAt: null,
  } as StoredPreSearch;
}

function createCompletePreSearch(
  threadId: string,
  roundNumber: number,
  userQuery: string,
): StoredPreSearch {
  return {
    id: `presearch-${threadId}-r${roundNumber}`,
    threadId,
    roundNumber,
    userQuery,
    status: MessageStatuses.COMPLETE,
    searchData: {
      queries: [{ query: 'test', rationale: 'test', searchDepth: 'basic', index: 0, total: 1 }],
      results: [],
      summary: 'test summary',
      successCount: 1,
      failureCount: 0,
      totalResults: 0,
      totalTime: 100,
    },
    errorMessage: null,
    createdAt: new Date(),
    completedAt: new Date(),
  } as StoredPreSearch;
}

/**
 * Helper to verify timeline ordering
 *
 * Note: 'round-moderator' represents moderator messages (isModerator: true in metadata)
 * which render inline via ChatMessageList, placed LAST in each round by useThreadTimeline.
 */
function verifyTimelineOrder(
  store: ReturnType<typeof createChatStore>,
  expectedOrder: MockTimelineItem[],
): void {
  const state = store.getState();
  const messages = state.messages;
  const preSearches = state.preSearches;

  const actualItems: MockTimelineItem[] = [];

  const messagesByRound = new Map<number, ChatMessage[]>();
  for (const msg of messages) {
    if (!msg.metadata)
      continue;

    if ('isModerator' in msg.metadata && msg.metadata.isModerator)
      continue;

    const roundNum = msg.metadata.roundNumber;
    if (!messagesByRound.has(roundNum)) {
      messagesByRound.set(roundNum, []);
    }
    messagesByRound.get(roundNum)!.push(msg);
  }

  const preSearchByRound = new Map<number, StoredPreSearch>();
  for (const ps of preSearches) {
    preSearchByRound.set(ps.roundNumber, ps);
  }

  const moderatorByRound = new Map<number, boolean>();
  for (const msg of messages) {
    if (!msg.metadata)
      continue;
    if ('isModerator' in msg.metadata && msg.metadata.isModerator) {
      moderatorByRound.set(msg.metadata.roundNumber, true);
    }
  }

  const rounds = [...new Set([
    ...messagesByRound.keys(),
    ...preSearchByRound.keys(),
    ...moderatorByRound.keys(),
  ])].sort((a, b) => a - b);

  for (const roundNumber of rounds) {
    const preSearch = preSearchByRound.get(roundNumber);
    if (preSearch) {
      actualItems.push({ type: 'pre-search', roundNumber });
    }

    const roundMessages = messagesByRound.get(roundNumber) || [];
    for (const msg of roundMessages) {
      if (!msg.metadata)
        continue;

      if (msg.role === MessageRoles.USER) {
        actualItems.push({ type: 'user-message', roundNumber });
      } else if (msg.role === MessageRoles.ASSISTANT && 'participantIndex' in msg.metadata) {
        actualItems.push({
          type: 'assistant-message',
          roundNumber,
          participantIndex: msg.metadata.participantIndex,
        });
      }
    }

    const moderator = moderatorByRound.get(roundNumber);
    if (moderator) {
      // Moderator message rendered inline, appears last in round
      actualItems.push({ type: 'round-moderator', roundNumber });
    }
  }

  expect(actualItems).toEqual(expectedOrder);
}

// ============================================================================
// TESTS
// ============================================================================

describe('timeline ordering during streaming', () => {
  describe('round 0 ordering', () => {
    it('should have pre-search before user message in round 0', () => {
      const store = createChatStore();
      const threadId = 'thread-123';
      const participants = createMockParticipants(threadId, 2);

      store.getState().initializeThread(
        createMockThread(threadId),
        participants,
        [],
      );

      store.getState().addPreSearch(createPlaceholderPreSearch(threadId, 0, 'test query'));

      store.getState().setMessages([
        createUserMessage(threadId, 0, 'test query'),
      ]);

      const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 0);
      const userMsg = store.getState().messages.find(
        m => m.role === MessageRoles.USER && m.metadata?.roundNumber === 0,
      );

      expect(preSearch).toBeDefined();
      expect(userMsg).toBeDefined();
    });

    it('should maintain correct order after assistant responses', () => {
      const store = createChatStore();
      const threadId = 'thread-123';
      const participants = createMockParticipants(threadId, 2);

      store.getState().initializeThread(
        createMockThread(threadId),
        participants,
        [],
      );

      store.getState().addPreSearch(createCompletePreSearch(threadId, 0, 'test query'));

      store.getState().setMessages([
        createUserMessage(threadId, 0, 'test query'),
        createAssistantMessage(threadId, 0, 0, 'participant-0', 'Response 0'),
        createAssistantMessage(threadId, 0, 1, 'participant-1', 'Response 1'),
      ]);
    });
  });

  describe('non-first round ordering (round 1+)', () => {
    it('should add pre-search for round 1 in correct position', () => {
      const store = createChatStore();
      const threadId = 'thread-123';
      const participants = createMockParticipants(threadId, 2);

      store.getState().initializeThread(
        createMockThread(threadId),
        participants,
        [],
      );

      // Add round 0 data
      store.getState().addPreSearch(createCompletePreSearch(threadId, 0, 'round 0 query'));
      // Add round 1 data
      store.getState().addPreSearch(createCompletePreSearch(threadId, 1, 'round 1 query'));

      store.getState().setMessages([
        // Round 0 messages
        createUserMessage(threadId, 0, 'round 0 query'),
        createAssistantMessage(threadId, 0, 0, 'participant-0', 'Response 0'),
        createAssistantMessage(threadId, 0, 1, 'participant-1', 'Response 1'),
        // Round 0 moderator
        createModeratorMessage(threadId, 0, 'Round 0 summary'),
        // Round 1 messages
        createUserMessage(threadId, 1, 'round 1 query'),
        createAssistantMessage(threadId, 1, 0, 'participant-0', 'Response 0 R1'),
        createAssistantMessage(threadId, 1, 1, 'participant-1', 'Response 1 R1'),
        // Round 1 moderator
        createModeratorMessage(threadId, 1, 'Round 1 summary'),
      ]);

      verifyTimelineOrder(store, [
        { type: 'pre-search', roundNumber: 0 },
        { type: 'user-message', roundNumber: 0 },
        { type: 'assistant-message', roundNumber: 0, participantIndex: 0 },
        { type: 'assistant-message', roundNumber: 0, participantIndex: 1 },
        { type: 'round-moderator', roundNumber: 0 },
        { type: 'pre-search', roundNumber: 1 },
        { type: 'user-message', roundNumber: 1 },
        { type: 'assistant-message', roundNumber: 1, participantIndex: 0 },
        { type: 'assistant-message', roundNumber: 1, participantIndex: 1 },
        { type: 'round-moderator', roundNumber: 1 },
      ]);
    });
  });

  describe('streaming state transitions', () => {
    it('should handle pre-search status transition from PENDING to STREAMING to COMPLETE', () => {
      const store = createChatStore();
      const threadId = 'thread-123';

      store.getState().addPreSearch(createPlaceholderPreSearch(threadId, 0, 'test query'));
      expect(store.getState().preSearches[0]?.status).toBe(MessageStatuses.PENDING);

      store.getState().updatePreSearchStatus(0, MessageStatuses.STREAMING);
      expect(store.getState().preSearches[0]?.status).toBe(MessageStatuses.STREAMING);

      store.getState().updatePreSearchData(0, {
        queries: [{ query: 'test', rationale: 'test', searchDepth: 'basic', index: 0, total: 1 }],
        results: [],
        summary: 'done',
        successCount: 1,
        failureCount: 0,
        totalResults: 0,
        totalTime: 100,
      });
      expect(store.getState().preSearches[0]?.status).toBe(MessageStatuses.COMPLETE);
    });
  });

  describe('participant change between rounds', () => {
    it('should handle different participants between round 0 and round 1', () => {
      const store = createChatStore();
      const threadId = 'thread-123';

      const round0Participants = createMockParticipants(threadId, 2);
      store.getState().initializeThread(
        createMockThread(threadId),
        round0Participants,
        [],
      );

      store.getState().setMessages([
        createUserMessage(threadId, 0, 'round 0'),
        createAssistantMessage(threadId, 0, 0, round0Participants[0]!.id, 'R0 P0'),
        createAssistantMessage(threadId, 0, 1, round0Participants[1]!.id, 'R0 P1'),
      ]);

      const round1Participants: ChatParticipant[] = [
        { ...createMockParticipants(threadId, 1)[0]!, id: 'new-participant-0', modelId: 'new-provider/new-model-0' },
      ];
      store.getState().updateParticipants(round1Participants);

      expect(store.getState().participants).toHaveLength(1);
      expect(store.getState().participants[0]!.id).toBe('new-participant-0');

      const round0Messages = store.getState().messages.filter(m =>
        m.metadata?.roundNumber === 0,
      );
      expect(round0Messages).toHaveLength(3);

      const r0AssistantMsgs = round0Messages.filter(m => m.role === MessageRoles.ASSISTANT);
      expect(r0AssistantMsgs).toHaveLength(2);

      const firstMsg = r0AssistantMsgs[0]!;
      const secondMsg = r0AssistantMsgs[1]!;

      expect(firstMsg.metadata).toBeDefined();
      expect(secondMsg.metadata).toBeDefined();

      const firstMetadata = firstMsg.metadata!;
      const secondMetadata = secondMsg.metadata!;

      expect(isAssistantMessageMetadata(firstMetadata)).toBe(true);
      expect(isAssistantMessageMetadata(secondMetadata)).toBe(true);

      expect(isAssistantMessageMetadata(firstMetadata) && firstMetadata.participantId).toBe(round0Participants[0]!.id);
      expect(isAssistantMessageMetadata(secondMetadata) && secondMetadata.participantId).toBe(round0Participants[1]!.id);
    });
  });

  describe('streaming round number tracking', () => {
    it('should set streamingRoundNumber when starting new round', () => {
      const store = createChatStore();
      const threadId = 'thread-123';

      store.getState().initializeThread(
        createMockThread(threadId),
        createMockParticipants(threadId, 2),
        [],
      );

      store.getState().setStreamingRoundNumber(0);
      expect(store.getState().streamingRoundNumber).toBe(0);

      store.getState().setStreamingRoundNumber(null);
      expect(store.getState().streamingRoundNumber).toBeNull();

      store.getState().setStreamingRoundNumber(1);
      expect(store.getState().streamingRoundNumber).toBe(1);
    });

    it('should clear streamingRoundNumber after round completes', () => {
      const store = createChatStore();

      store.getState().setStreamingRoundNumber(0);
      store.getState().setIsStreaming(true);

      expect(store.getState().streamingRoundNumber).toBe(0);
      expect(store.getState().isStreaming).toBe(true);

      store.getState().setIsStreaming(false);
      store.getState().setStreamingRoundNumber(null);

      expect(store.getState().streamingRoundNumber).toBeNull();
      expect(store.getState().isStreaming).toBe(false);
    });
  });

  describe('pre-search deduplication', () => {
    it('should not duplicate pre-search when adding for same round', () => {
      const store = createChatStore();
      const threadId = 'thread-123';

      store.getState().addPreSearch(createPlaceholderPreSearch(threadId, 0, 'query 1'));
      expect(store.getState().preSearches).toHaveLength(1);

      store.getState().addPreSearch(createPlaceholderPreSearch(threadId, 0, 'query 2'));
      expect(store.getState().preSearches).toHaveLength(1);
    });

    it('should add pre-search for different rounds', () => {
      const store = createChatStore();
      const threadId = 'thread-123';

      store.getState().addPreSearch(createPlaceholderPreSearch(threadId, 0, 'query round 0'));
      store.getState().addPreSearch(createPlaceholderPreSearch(threadId, 1, 'query round 1'));
      store.getState().addPreSearch(createPlaceholderPreSearch(threadId, 2, 'query round 2'));

      expect(store.getState().preSearches).toHaveLength(3);
      expect(store.getState().preSearches.map(ps => ps.roundNumber)).toEqual([0, 1, 2]);
    });
  });
});
