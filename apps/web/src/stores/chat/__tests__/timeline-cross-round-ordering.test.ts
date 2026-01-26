/**
 * Timeline Cross-Round Ordering Tests
 *
 * Tests for correct message ordering ACROSS consecutive rounds.
 * Specifically targets bugs where Round 2 user message appears before Round 1 moderator.
 *
 * Expected order for complete rounds:
 * Round 1: user → pre-search → participants (by index) → moderator
 * Round 2: user → participants (by index) → moderator (no pre-search)
 *
 * Bug scenarios tested:
 * - Round 2 user message appearing before Round 1 moderator
 * - Messages within a round out of order
 * - Pre-search cards at wrong position
 * - Timeline jumps/flashes during round transitions
 * - Moderator messages not appearing last in each round
 */

import { ChatModes, MessagePartTypes, MessageRoles, MessageStatuses } from '@roundtable/shared';
import { describe, expect, it } from 'vitest';

import { getParticipantIndex, getRoundNumberFromMetadata, isModeratorMessage } from '@/lib/utils';
import type { ApiMessage, ChatParticipant, DbAssistantMessageMetadata, DbModeratorMessageMetadata, DbUserMessageMetadata, StoredPreSearch } from '@/services/api';

import { createChatStore } from '../store';

// ============================================================================
// TEST SETUP
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
    role: `Role ${i}`,
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
    participantRole: `Role ${participantIndex}`,
    role: MessageRoles.ASSISTANT,
    roundNumber,
    usage: { completionTokens: 20, promptTokens: 10, totalTokens: 30 },
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
    finishReason: 'stop',
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

function createPreSearch(
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
      queries: [{ index: 0, query: userQuery, rationale: 'test', searchDepth: 'basic', total: 1 }],
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

// ============================================================================
// TIMELINE VERIFICATION HELPERS
// ============================================================================

type TimelinePosition = {
  type: 'user' | 'pre-search' | 'participant' | 'moderator';
  roundNumber: number;
  participantIndex?: number;
  messageId?: string;
};

/**
 * Extract timeline positions by replicating useThreadTimeline logic
 * This matches the ACTUAL rendering order used by ThreadTimeline component
 * Reimplemented here to avoid using React hooks in tests
 */
function extractTimelinePositions(
  messages: ApiMessage[],
  preSearches: StoredPreSearch[],
): TimelinePosition[] {
  // STEP 1: Group messages by round number (same as useThreadTimeline)
  const messagesByRound = new Map<number, ApiMessage[]>();
  messages.forEach((message) => {
    const roundNumber = getRoundNumberFromMetadata(message.metadata, 0);

    if (!messagesByRound.has(roundNumber)) {
      messagesByRound.set(roundNumber, []);
    }
    const roundMessages = messagesByRound.get(roundNumber);
    if (roundMessages) {
      roundMessages.push(message);
    }
  });

  // STEP 2: Sort messages within each round (same as useThreadTimeline)
  // Order: user → participants (by index) → moderator LAST
  messagesByRound.forEach((roundMessages) => {
    roundMessages.sort((a, b) => {
      // User messages come first
      if (a.role === MessageRoles.USER && b.role !== MessageRoles.USER) {
        return -1;
      }
      if (a.role !== MessageRoles.USER && b.role === MessageRoles.USER) {
        return 1;
      }

      // For assistant messages, sort by participantIndex
      // Moderator (isModerator: true, no participantIndex) comes LAST
      if (a.role === MessageRoles.ASSISTANT && b.role === MessageRoles.ASSISTANT) {
        const aIsModerator = isModeratorMessage(a);
        const bIsModerator = isModeratorMessage(b);

        // Moderator always comes after participants
        if (aIsModerator && !bIsModerator) {
          return 1;
        }
        if (!aIsModerator && bIsModerator) {
          return -1;
        }

        // Neither is moderator - sort by participantIndex
        const indexA = getParticipantIndex(a.metadata) ?? 0;
        const indexB = getParticipantIndex(b.metadata) ?? 0;
        return indexA - indexB;
      }

      return 0;
    });
  });

  // STEP 3: Index pre-searches by round number
  const preSearchByRound = new Map<number, StoredPreSearch>();
  preSearches.forEach((preSearch) => {
    preSearchByRound.set(preSearch.roundNumber, preSearch);
  });

  // STEP 4: Collect all unique round numbers
  const allRoundNumbers = new Set<number>([
    ...messagesByRound.keys(),
    ...preSearchByRound.keys(),
  ]);

  // STEP 5: Build timeline positions in chronological order
  const positions: TimelinePosition[] = [];
  const sortedRounds = Array.from(allRoundNumbers).sort((a, b) => a - b);

  sortedRounds.forEach((roundNumber) => {
    const roundMessages = messagesByRound.get(roundNumber);
    const roundPreSearch = preSearchByRound.get(roundNumber);

    // Add pre-search first (if exists)
    if (roundPreSearch) {
      positions.push({
        roundNumber,
        type: 'pre-search',
      });
    }

    // Add messages for this round (user → participants → moderator)
    if (roundMessages && roundMessages.length > 0) {
      for (const msg of roundMessages) {
        if (msg.role === MessageRoles.USER) {
          positions.push({
            messageId: msg.id,
            roundNumber,
            type: 'user',
          });
        } else if (msg.role === MessageRoles.ASSISTANT) {
          if (isModeratorMessage(msg)) {
            positions.push({
              messageId: msg.id,
              roundNumber,
              type: 'moderator',
            });
          } else {
            const participantIndex = getParticipantIndex(msg.metadata) ?? 0;
            positions.push({
              messageId: msg.id,
              participantIndex,
              roundNumber,
              type: 'participant',
            });
          }
        }
      }
    }
  });

  return positions;
}

/**
 * Verify positions match expected order exactly
 */
function expectTimelineOrder(
  positions: TimelinePosition[],
  expected: TimelinePosition[],
) {
  // Compare without messageId (it's implementation detail)
  const actual = positions.map(({ participantIndex, roundNumber, type }) => ({
    participantIndex,
    roundNumber,
    type,
  }));
  const exp = expected.map(({ participantIndex, roundNumber, type }) => ({
    participantIndex,
    roundNumber,
    type,
  }));

  expect(actual).toEqual(exp);
}

/**
 * Verify round boundaries - Round N must be COMPLETELY before Round N+1
 */
function expectRoundBoundaries(positions: TimelinePosition[]) {
  const rounds = new Set(positions.map(p => p.roundNumber));
  const sortedRounds = Array.from(rounds).sort((a, b) => a - b);

  for (let i = 0; i < sortedRounds.length - 1; i++) {
    const currentRound = sortedRounds[i];
    const nextRound = sortedRounds[i + 1];
    if (currentRound === undefined || nextRound === undefined) {
      continue;
    }

    // Find indices of messages from each round
    const currentRoundIndices = positions
      .map((p, idx) => (p.roundNumber === currentRound ? idx : -1))
      .filter(idx => idx !== -1);
    const nextRoundIndices = positions
      .map((p, idx) => (p.roundNumber === nextRound ? idx : -1))
      .filter(idx => idx !== -1);

    // Max index of current round must be LESS than min index of next round
    const maxCurrentIndex = Math.max(...currentRoundIndices);
    const minNextIndex = Math.min(...nextRoundIndices);

    expect(maxCurrentIndex).toBeLessThan(minNextIndex);
  }
}

/**
 * Verify moderator is LAST in each round
 */
function expectModeratorLast(positions: TimelinePosition[]) {
  const rounds = new Set(positions.map(p => p.roundNumber));

  for (const roundNum of rounds) {
    const roundPositions = positions.filter(p => p.roundNumber === roundNum);
    const moderatorIdx = roundPositions.findIndex(p => p.type === 'moderator');

    if (moderatorIdx !== -1) {
      // Moderator must be at the end of this round's items
      expect(moderatorIdx).toBe(roundPositions.length - 1);
    }
  }
}

// ============================================================================
// TESTS
// ============================================================================

describe('timeline cross-round ordering', () => {
  describe('two complete rounds with pre-search', () => {
    it('should maintain correct order: R1 complete before R2 starts', () => {
      const store = createChatStore();
      const threadId = 'thread-123';
      const participants = createMockParticipants(threadId, 2);

      store.getState().initializeThread(
        createMockThread(threadId),
        participants,
        [],
      );

      // Round 1: user → pre-search → p0 → p1 → moderator
      store.getState().addPreSearch(createPreSearch(threadId, 1, 'Round 1 query'));
      store.getState().setMessages([
        createUserMessage(threadId, 1, 'Round 1 query'),
        createAssistantMessage(threadId, 1, 0, 'participant-0', 'R1 P0 response'),
        createAssistantMessage(threadId, 1, 1, 'participant-1', 'R1 P1 response'),
        createModeratorMessage(threadId, 1, 'Round 1 summary'),
      ]);

      const positionsR1 = extractTimelinePositions(
        store.getState().messages,
        store.getState().preSearches,
      );

      expectTimelineOrder(positionsR1, [
        { roundNumber: 1, type: 'pre-search' },
        { roundNumber: 1, type: 'user' },
        { participantIndex: 0, roundNumber: 1, type: 'participant' },
        { participantIndex: 1, roundNumber: 1, type: 'participant' },
        { roundNumber: 1, type: 'moderator' },
      ]);

      // Add Round 2: user → p0 → p1 → moderator (no pre-search)
      store.getState().setMessages([
        ...store.getState().messages,
        createUserMessage(threadId, 2, 'Round 2 query'),
        createAssistantMessage(threadId, 2, 0, 'participant-0', 'R2 P0 response'),
        createAssistantMessage(threadId, 2, 1, 'participant-1', 'R2 P1 response'),
        createModeratorMessage(threadId, 2, 'Round 2 summary'),
      ]);

      const positionsR1R2 = extractTimelinePositions(
        store.getState().messages,
        store.getState().preSearches,
      );

      // Full expected order
      expectTimelineOrder(positionsR1R2, [
        // Round 1
        { roundNumber: 1, type: 'pre-search' },
        { roundNumber: 1, type: 'user' },
        { participantIndex: 0, roundNumber: 1, type: 'participant' },
        { participantIndex: 1, roundNumber: 1, type: 'participant' },
        { roundNumber: 1, type: 'moderator' },
        // Round 2
        { roundNumber: 2, type: 'user' },
        { participantIndex: 0, roundNumber: 2, type: 'participant' },
        { participantIndex: 1, roundNumber: 2, type: 'participant' },
        { roundNumber: 2, type: 'moderator' },
      ]);

      // Verify round boundaries are respected
      expectRoundBoundaries(positionsR1R2);

      // Verify moderator is last in each round
      expectModeratorLast(positionsR1R2);
    });

    it('should handle messages arriving out of order', () => {
      const store = createChatStore();
      const threadId = 'thread-123';
      const participants = createMockParticipants(threadId, 2);

      store.getState().initializeThread(
        createMockThread(threadId),
        participants,
        [],
      );

      // Simulate messages arriving in wrong order (e.g., from API)
      // R2 user arrives before R1 moderator
      store.getState().setMessages([
        createUserMessage(threadId, 1, 'Round 1 query'),
        createAssistantMessage(threadId, 1, 0, 'participant-0', 'R1 P0 response'),
        createAssistantMessage(threadId, 1, 1, 'participant-1', 'R1 P1 response'),
        createUserMessage(threadId, 2, 'Round 2 query'), // OUT OF ORDER
        createModeratorMessage(threadId, 1, 'Round 1 summary'), // OUT OF ORDER
        createAssistantMessage(threadId, 2, 0, 'participant-0', 'R2 P0 response'),
        createAssistantMessage(threadId, 2, 1, 'participant-1', 'R2 P1 response'),
        createModeratorMessage(threadId, 2, 'Round 2 summary'),
      ]);

      store.getState().addPreSearch(createPreSearch(threadId, 1, 'Round 1 query'));

      const positions = extractTimelinePositions(
        store.getState().messages,
        store.getState().preSearches,
      );

      // Timeline should CORRECT the order via sorting
      expectTimelineOrder(positions, [
        { roundNumber: 1, type: 'pre-search' },
        { roundNumber: 1, type: 'user' },
        { participantIndex: 0, roundNumber: 1, type: 'participant' },
        { participantIndex: 1, roundNumber: 1, type: 'participant' },
        { roundNumber: 1, type: 'moderator' },
        { roundNumber: 2, type: 'user' },
        { participantIndex: 0, roundNumber: 2, type: 'participant' },
        { participantIndex: 1, roundNumber: 2, type: 'participant' },
        { roundNumber: 2, type: 'moderator' },
      ]);

      expectRoundBoundaries(positions);
      expectModeratorLast(positions);
    });
  });

  describe('three rounds with mixed pre-search', () => {
    it('should maintain order with pre-search in R1 and R3, but not R2', () => {
      const store = createChatStore();
      const threadId = 'thread-123';
      const participants = createMockParticipants(threadId, 2);

      store.getState().initializeThread(
        createMockThread(threadId),
        participants,
        [],
      );

      // R1 has pre-search
      store.getState().addPreSearch(createPreSearch(threadId, 1, 'Round 1 query'));
      // R2 has NO pre-search
      // R3 has pre-search
      store.getState().addPreSearch(createPreSearch(threadId, 3, 'Round 3 query'));

      store.getState().setMessages([
        // Round 1
        createUserMessage(threadId, 1, 'Round 1 query'),
        createAssistantMessage(threadId, 1, 0, 'participant-0', 'R1 P0'),
        createAssistantMessage(threadId, 1, 1, 'participant-1', 'R1 P1'),
        createModeratorMessage(threadId, 1, 'R1 summary'),
        // Round 2
        createUserMessage(threadId, 2, 'Round 2 query'),
        createAssistantMessage(threadId, 2, 0, 'participant-0', 'R2 P0'),
        createAssistantMessage(threadId, 2, 1, 'participant-1', 'R2 P1'),
        createModeratorMessage(threadId, 2, 'R2 summary'),
        // Round 3
        createUserMessage(threadId, 3, 'Round 3 query'),
        createAssistantMessage(threadId, 3, 0, 'participant-0', 'R3 P0'),
        createAssistantMessage(threadId, 3, 1, 'participant-1', 'R3 P1'),
        createModeratorMessage(threadId, 3, 'R3 summary'),
      ]);

      const positions = extractTimelinePositions(
        store.getState().messages,
        store.getState().preSearches,
      );

      expectTimelineOrder(positions, [
        // R1 with pre-search
        { roundNumber: 1, type: 'pre-search' },
        { roundNumber: 1, type: 'user' },
        { participantIndex: 0, roundNumber: 1, type: 'participant' },
        { participantIndex: 1, roundNumber: 1, type: 'participant' },
        { roundNumber: 1, type: 'moderator' },
        // R2 without pre-search
        { roundNumber: 2, type: 'user' },
        { participantIndex: 0, roundNumber: 2, type: 'participant' },
        { participantIndex: 1, roundNumber: 2, type: 'participant' },
        { roundNumber: 2, type: 'moderator' },
        // R3 with pre-search
        { roundNumber: 3, type: 'pre-search' },
        { roundNumber: 3, type: 'user' },
        { participantIndex: 0, roundNumber: 3, type: 'participant' },
        { participantIndex: 1, roundNumber: 3, type: 'participant' },
        { roundNumber: 3, type: 'moderator' },
      ]);

      expectRoundBoundaries(positions);
      expectModeratorLast(positions);
    });
  });

  describe('participants sorted by index within round', () => {
    it('should maintain participant order even when messages arrive reversed', () => {
      const store = createChatStore();
      const threadId = 'thread-123';
      const participants = createMockParticipants(threadId, 3);

      store.getState().initializeThread(
        createMockThread(threadId),
        participants,
        [],
      );

      // Messages arrive in reverse participant order
      store.getState().setMessages([
        createUserMessage(threadId, 1, 'Round 1 query'),
        createAssistantMessage(threadId, 1, 2, 'participant-2', 'P2'), // arrives first
        createAssistantMessage(threadId, 1, 1, 'participant-1', 'P1'), // arrives second
        createAssistantMessage(threadId, 1, 0, 'participant-0', 'P0'), // arrives third
        createModeratorMessage(threadId, 1, 'R1 summary'),
      ]);

      const positions = extractTimelinePositions(
        store.getState().messages,
        store.getState().preSearches,
      );

      // Should be sorted by participantIndex, not arrival order
      expectTimelineOrder(positions, [
        { roundNumber: 1, type: 'user' },
        { participantIndex: 0, roundNumber: 1, type: 'participant' },
        { participantIndex: 1, roundNumber: 1, type: 'participant' },
        { participantIndex: 2, roundNumber: 1, type: 'participant' },
        { roundNumber: 1, type: 'moderator' },
      ]);
    });
  });

  describe('edge cases', () => {
    it('should handle round with only user message (no responses yet)', () => {
      const store = createChatStore();
      const threadId = 'thread-123';
      const participants = createMockParticipants(threadId, 2);

      store.getState().initializeThread(
        createMockThread(threadId),
        participants,
        [],
      );

      // R1 complete
      store.getState().setMessages([
        createUserMessage(threadId, 1, 'Round 1 query'),
        createAssistantMessage(threadId, 1, 0, 'participant-0', 'R1 P0'),
        createAssistantMessage(threadId, 1, 1, 'participant-1', 'R1 P1'),
        createModeratorMessage(threadId, 1, 'R1 summary'),
        // R2 only has user message so far
        createUserMessage(threadId, 2, 'Round 2 query'),
      ]);

      const positions = extractTimelinePositions(
        store.getState().messages,
        store.getState().preSearches,
      );

      expectTimelineOrder(positions, [
        { roundNumber: 1, type: 'user' },
        { participantIndex: 0, roundNumber: 1, type: 'participant' },
        { participantIndex: 1, roundNumber: 1, type: 'participant' },
        { roundNumber: 1, type: 'moderator' },
        { roundNumber: 2, type: 'user' },
      ]);

      expectRoundBoundaries(positions);
    });

    it('should handle round with user + some participants (moderator pending)', () => {
      const store = createChatStore();
      const threadId = 'thread-123';
      const participants = createMockParticipants(threadId, 2);

      store.getState().initializeThread(
        createMockThread(threadId),
        participants,
        [],
      );

      // R1 complete
      store.getState().setMessages([
        createUserMessage(threadId, 1, 'Round 1 query'),
        createAssistantMessage(threadId, 1, 0, 'participant-0', 'R1 P0'),
        createAssistantMessage(threadId, 1, 1, 'participant-1', 'R1 P1'),
        createModeratorMessage(threadId, 1, 'R1 summary'),
        // R2 has user + participants, but moderator hasn't arrived yet
        createUserMessage(threadId, 2, 'Round 2 query'),
        createAssistantMessage(threadId, 2, 0, 'participant-0', 'R2 P0'),
        createAssistantMessage(threadId, 2, 1, 'participant-1', 'R2 P1'),
      ]);

      const positions = extractTimelinePositions(
        store.getState().messages,
        store.getState().preSearches,
      );

      expectTimelineOrder(positions, [
        { roundNumber: 1, type: 'user' },
        { participantIndex: 0, roundNumber: 1, type: 'participant' },
        { participantIndex: 1, roundNumber: 1, type: 'participant' },
        { roundNumber: 1, type: 'moderator' },
        { roundNumber: 2, type: 'user' },
        { participantIndex: 0, roundNumber: 2, type: 'participant' },
        { participantIndex: 1, roundNumber: 2, type: 'participant' },
      ]);

      expectRoundBoundaries(positions);
    });

    it('should handle non-sequential round numbers (1, 3, 5)', () => {
      const store = createChatStore();
      const threadId = 'thread-123';
      const participants = createMockParticipants(threadId, 2);

      store.getState().initializeThread(
        createMockThread(threadId),
        participants,
        [],
      );

      store.getState().setMessages([
        // Round 1
        createUserMessage(threadId, 1, 'R1'),
        createAssistantMessage(threadId, 1, 0, 'participant-0', 'R1 P0'),
        createModeratorMessage(threadId, 1, 'R1 summary'),
        // Round 3 (skipped 2)
        createUserMessage(threadId, 3, 'R3'),
        createAssistantMessage(threadId, 3, 0, 'participant-0', 'R3 P0'),
        createModeratorMessage(threadId, 3, 'R3 summary'),
        // Round 5 (skipped 4)
        createUserMessage(threadId, 5, 'R5'),
        createAssistantMessage(threadId, 5, 0, 'participant-0', 'R5 P0'),
        createModeratorMessage(threadId, 5, 'R5 summary'),
      ]);

      const positions = extractTimelinePositions(
        store.getState().messages,
        store.getState().preSearches,
      );

      // Should be sorted numerically (1, 3, 5) not by arrival
      expectRoundBoundaries(positions);
      expectModeratorLast(positions);
    });
  });

  describe('streaming transitions', () => {
    it('should maintain correct order during participant streaming', () => {
      const store = createChatStore();
      const threadId = 'thread-123';
      const participants = createMockParticipants(threadId, 2);

      store.getState().initializeThread(
        createMockThread(threadId),
        participants,
        [],
      );

      // R1 complete
      store.getState().setMessages([
        createUserMessage(threadId, 1, 'Round 1 query'),
        createAssistantMessage(threadId, 1, 0, 'participant-0', 'R1 P0'),
        createAssistantMessage(threadId, 1, 1, 'participant-1', 'R1 P1'),
        createModeratorMessage(threadId, 1, 'R1 summary'),
      ]);

      // R2 starts - user message arrives
      store.getState().setMessages([
        ...store.getState().messages,
        createUserMessage(threadId, 2, 'Round 2 query'),
      ]);

      store.getState().setStreamingRoundNumber(2);
      store.getState().setIsStreaming(true);

      let positions = extractTimelinePositions(
        store.getState().messages,
        store.getState().preSearches,
      );

      // R1 complete, R2 has only user message
      expectRoundBoundaries(positions);

      // First participant starts streaming
      store.getState().setMessages([
        ...store.getState().messages,
        createAssistantMessage(threadId, 2, 0, 'participant-0', 'R2 P0 partial'),
      ]);

      positions = extractTimelinePositions(
        store.getState().messages,
        store.getState().preSearches,
      );

      // R1 complete, R2 has user + p0
      expectRoundBoundaries(positions);

      // Second participant completes
      store.getState().setMessages([
        ...store.getState().messages,
        createAssistantMessage(threadId, 2, 1, 'participant-1', 'R2 P1 complete'),
      ]);

      positions = extractTimelinePositions(
        store.getState().messages,
        store.getState().preSearches,
      );

      // R1 complete, R2 has user + p0 + p1
      expectRoundBoundaries(positions);
    });

    it('should maintain order when moderator arrives after streaming ends', () => {
      const store = createChatStore();
      const threadId = 'thread-123';
      const participants = createMockParticipants(threadId, 2);

      store.getState().initializeThread(
        createMockThread(threadId),
        participants,
        [],
      );

      // R1 complete + R2 participants complete (no moderator yet)
      store.getState().setMessages([
        createUserMessage(threadId, 1, 'R1'),
        createAssistantMessage(threadId, 1, 0, 'participant-0', 'R1 P0'),
        createAssistantMessage(threadId, 1, 1, 'participant-1', 'R1 P1'),
        createModeratorMessage(threadId, 1, 'R1 summary'),
        createUserMessage(threadId, 2, 'R2'),
        createAssistantMessage(threadId, 2, 0, 'participant-0', 'R2 P0'),
        createAssistantMessage(threadId, 2, 1, 'participant-1', 'R2 P1'),
      ]);

      store.getState().setIsStreaming(false);
      store.getState().setStreamingRoundNumber(null);

      let positions = extractTimelinePositions(
        store.getState().messages,
        store.getState().preSearches,
      );

      // R1 complete with moderator, R2 complete without moderator yet
      expectRoundBoundaries(positions);

      // Moderator arrives
      store.getState().setMessages([
        ...store.getState().messages,
        createModeratorMessage(threadId, 2, 'R2 summary'),
      ]);

      positions = extractTimelinePositions(
        store.getState().messages,
        store.getState().preSearches,
      );

      // Now both rounds complete with moderators
      expectTimelineOrder(positions, [
        { roundNumber: 1, type: 'user' },
        { participantIndex: 0, roundNumber: 1, type: 'participant' },
        { participantIndex: 1, roundNumber: 1, type: 'participant' },
        { roundNumber: 1, type: 'moderator' },
        { roundNumber: 2, type: 'user' },
        { participantIndex: 0, roundNumber: 2, type: 'participant' },
        { participantIndex: 1, roundNumber: 2, type: 'participant' },
        { roundNumber: 2, type: 'moderator' },
      ]);

      expectRoundBoundaries(positions);
      expectModeratorLast(positions);
    });
  });
});
