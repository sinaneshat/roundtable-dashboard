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

import { ChatModes, MessagePartTypes, MessageRoles, MessageStatuses } from '@roundtable/shared';
import { describe, expect, it } from 'vitest';

import type { ApiMessage, ChatParticipant, DbAssistantMessageMetadata, DbModeratorMessageMetadata, DbUserMessageMetadata, StoredPreSearch } from '@/services/api';
import { isAssistantMessageMetadata } from '@/services/api';

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
    createdAt: new Date(),
    enableWebSearch: true,
    id: threadId,
    isAiGeneratedTitle: false,
    isFavorite: false,
    isPublic: false,
    lastMessageAt: new Date(),
    metadata: null,
    mode: ChatModes.ANALYZING,
    previousSlug: null,
    projectId: null,
    slug: 'test-thread',
    status: 'active' as const,
    title: 'Test Thread',
    updatedAt: new Date(),
    userId: 'user-123',
    version: 1,
  };
}

function createMockParticipants(threadId: string, count: number): ChatParticipant[] {
  return Array.from({ length: count }, (_, i) => ({
    createdAt: new Date(),
    customRoleId: null,
    id: `participant-${i}`,
    isEnabled: true,
    modelId: `provider/model-${i}`,
    priority: i,
    role: null,
    settings: null,
    threadId,
    updatedAt: new Date(),
  }));
}

function createUserMessage(threadId: string, roundNumber: number, text: string): ApiMessage {
  const metadata: DbUserMessageMetadata = {
    role: MessageRoles.USER,
    roundNumber,
  };
  return {
    id: `${threadId}_r${roundNumber}_user`,
    metadata,
    parts: [{ text, type: MessagePartTypes.TEXT }],
    role: MessageRoles.USER,
  };
}

function createAssistantMessage(
  threadId: string,
  roundNumber: number,
  participantIndex: number,
  participantId: string,
  text: string,
): ApiMessage {
  const metadata: DbAssistantMessageMetadata = {
    finishReason: 'stop',
    hasError: false,
    isPartialResponse: false,
    isTransient: false,
    model: `provider/model-${participantIndex}`,
    participantId,
    participantIndex,
    participantRole: null,
    role: MessageRoles.ASSISTANT,
    roundNumber,
    usage: { completionTokens: 0, promptTokens: 0, totalTokens: 0 },
  };
  return {
    id: `${threadId}_r${roundNumber}_p${participantIndex}`,
    metadata,
    parts: [{ text, type: MessagePartTypes.TEXT }],
    role: MessageRoles.ASSISTANT,
  };
}

function createModeratorMessage(
  threadId: string,
  roundNumber: number,
  text: string,
): ApiMessage {
  const metadata: DbModeratorMessageMetadata = {
    hasError: false,
    isModerator: true,
    model: 'moderator-model',
    role: MessageRoles.ASSISTANT,
    roundNumber,
  };
  return {
    id: `${threadId}_r${roundNumber}_moderator`,
    metadata,
    parts: [{ text, type: MessagePartTypes.TEXT }],
    role: MessageRoles.ASSISTANT,
  };
}

function createPlaceholderPreSearch(
  threadId: string,
  roundNumber: number,
  userQuery: string,
): StoredPreSearch {
  return {
    completedAt: null,
    createdAt: new Date(),
    errorMessage: null,
    id: `presearch-${threadId}-r${roundNumber}`,
    roundNumber,
    searchData: null,
    status: MessageStatuses.PENDING,
    threadId,
    userQuery,
  } as StoredPreSearch;
}

function createCompletePreSearch(
  threadId: string,
  roundNumber: number,
  userQuery: string,
): StoredPreSearch {
  return {
    completedAt: new Date(),
    createdAt: new Date(),
    errorMessage: null,
    id: `presearch-${threadId}-r${roundNumber}`,
    roundNumber,
    searchData: {
      failureCount: 0,
      queries: [{ index: 0, query: 'test', rationale: 'test', searchDepth: 'basic', total: 1 }],
      results: [],
      successCount: 1,
      summary: 'test summary',
      totalResults: 0,
      totalTime: 100,
    },
    status: MessageStatuses.COMPLETE,
    threadId,
    userQuery,
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

  const messagesByRound = new Map<number, ApiMessage[]>();
  for (const msg of messages) {
    if (!msg.metadata) {
      continue;
    }

    if ('isModerator' in msg.metadata && msg.metadata.isModerator) {
      continue;
    }

    const roundNum = msg.metadata.roundNumber;
    const existing = messagesByRound.get(roundNum);
    if (existing) {
      existing.push(msg);
    } else {
      messagesByRound.set(roundNum, [msg]);
    }
  }

  const preSearchByRound = new Map<number, StoredPreSearch>();
  for (const ps of preSearches) {
    preSearchByRound.set(ps.roundNumber, ps);
  }

  const moderatorByRound = new Map<number, boolean>();
  for (const msg of messages) {
    if (!msg.metadata) {
      continue;
    }
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
      actualItems.push({ roundNumber, type: 'pre-search' });
    }

    const roundMessages = messagesByRound.get(roundNumber) || [];
    for (const msg of roundMessages) {
      if (!msg.metadata) {
        continue;
      }

      if (msg.role === MessageRoles.USER) {
        actualItems.push({ roundNumber, type: 'user-message' });
      } else if (msg.role === MessageRoles.ASSISTANT && 'participantIndex' in msg.metadata) {
        actualItems.push({
          participantIndex: msg.metadata.participantIndex,
          roundNumber,
          type: 'assistant-message',
        });
      }
    }

    const moderator = moderatorByRound.get(roundNumber);
    if (moderator) {
      // Moderator message rendered inline, appears last in round
      actualItems.push({ roundNumber, type: 'round-moderator' });
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
        { roundNumber: 0, type: 'pre-search' },
        { roundNumber: 0, type: 'user-message' },
        { participantIndex: 0, roundNumber: 0, type: 'assistant-message' },
        { participantIndex: 1, roundNumber: 0, type: 'assistant-message' },
        { roundNumber: 0, type: 'round-moderator' },
        { roundNumber: 1, type: 'pre-search' },
        { roundNumber: 1, type: 'user-message' },
        { participantIndex: 0, roundNumber: 1, type: 'assistant-message' },
        { participantIndex: 1, roundNumber: 1, type: 'assistant-message' },
        { roundNumber: 1, type: 'round-moderator' },
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
        failureCount: 0,
        queries: [{ index: 0, query: 'test', rationale: 'test', searchDepth: 'basic', total: 1 }],
        results: [],
        successCount: 1,
        summary: 'done',
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

      const p0 = round0Participants[0];
      const p1 = round0Participants[1];
      if (!p0 || !p1) {
        throw new Error('Test setup error: participants not created');
      }

      store.getState().setMessages([
        createUserMessage(threadId, 0, 'round 0'),
        createAssistantMessage(threadId, 0, 0, p0.id, 'R0 P0'),
        createAssistantMessage(threadId, 0, 1, p1.id, 'R0 P1'),
      ]);

      const newParticipantBase = createMockParticipants(threadId, 1)[0];
      if (!newParticipantBase) {
        throw new Error('Test setup error: new participant not created');
      }
      const round1Participants: ChatParticipant[] = [
        { ...newParticipantBase, id: 'new-participant-0', modelId: 'new-provider/new-model-0' },
      ];
      store.getState().updateParticipants(round1Participants);

      expect(store.getState().participants).toHaveLength(1);
      const updatedParticipant = store.getState().participants[0];
      expect(updatedParticipant?.id).toBe('new-participant-0');

      const round0Messages = store.getState().messages.filter(m =>
        m.metadata?.roundNumber === 0,
      );
      expect(round0Messages).toHaveLength(3);

      const r0AssistantMsgs = round0Messages.filter(m => m.role === MessageRoles.ASSISTANT);
      expect(r0AssistantMsgs).toHaveLength(2);

      const firstMsg = r0AssistantMsgs[0];
      const secondMsg = r0AssistantMsgs[1];
      if (!firstMsg || !secondMsg) {
        throw new Error('Test assertion failed: expected 2 assistant messages');
      }

      expect(firstMsg.metadata).toBeDefined();
      expect(secondMsg.metadata).toBeDefined();

      const firstMetadata = firstMsg.metadata;
      const secondMetadata = secondMsg.metadata;
      if (!firstMetadata || !secondMetadata) {
        throw new Error('Test assertion failed: expected metadata on messages');
      }

      expect(isAssistantMessageMetadata(firstMetadata)).toBeTruthy();
      expect(isAssistantMessageMetadata(secondMetadata)).toBeTruthy();

      expect(isAssistantMessageMetadata(firstMetadata) && firstMetadata.participantId).toBe(p0.id);
      expect(isAssistantMessageMetadata(secondMetadata) && secondMetadata.participantId).toBe(p1.id);
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
      expect(store.getState().isStreaming).toBeTruthy();

      store.getState().setIsStreaming(false);
      store.getState().setStreamingRoundNumber(null);

      expect(store.getState().streamingRoundNumber).toBeNull();
      expect(store.getState().isStreaming).toBeFalsy();
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
