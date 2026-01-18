/**
 * Thread Timeline Grouping Logic Tests
 *
 * Comprehensive unit tests for the useThreadTimeline hook that groups messages,
 * changelog, and pre-searches by round number.
 *
 * CRITICAL BEHAVIORS TESTED:
 * 1. Messages are grouped correctly by round number
 * 2. User messages come before participants in each round
 * 3. Moderator messages come LAST after all participants
 * 4. Changelog items are correctly associated with rounds
 * 5. Pre-search items render for orphaned rounds
 *
 * TESTS THAT WOULD HAVE CAUGHT BUGS:
 * - Non-initial round messages not appearing in timeline
 * - Round grouping is incorrect
 * - Message ordering within rounds is wrong
 * - Moderator appearing before participants
 * - Pre-search rendering incorrectly
 */

import { UIMessageRoles } from '@roundtable/shared';
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useThreadTimeline } from '@/hooks/utils';
import {
  createTestAssistantMessage,
  createTestModeratorMessage,
  createTestUserMessage,
} from '@/lib/testing';
import type { ChatThreadChangelog, StoredPreSearch } from '@/services/api';

// ============================================================================
// TEST HELPERS
// ============================================================================

function createChangelog(
  id: string,
  roundNumber: number,
  changeType: string,
): ChatThreadChangelog {
  return {
    id,
    threadId: 'thread-1',
    roundNumber,
    changeType: changeType as ChatThreadChangelog['changeType'],
    data: {} as ChatThreadChangelog['data'],
    createdAt: new Date(`2024-01-01T00:0${roundNumber}:00Z`),
  };
}

function createPreSearch(roundNumber: number): StoredPreSearch {
  return {
    threadId: 'thread-1',
    roundNumber,
    status: 'complete',
    query: `Search query for round ${roundNumber}`,
    executedAt: new Date(`2024-01-01T00:0${roundNumber}:01Z`).toISOString(),
    completedAt: new Date(`2024-01-01T00:0${roundNumber}:02Z`).toISOString(),
    results: [],
    totalResults: 0,
  };
}

function getTimeline(options: Parameters<typeof useThreadTimeline>[0]) {
  const { result } = renderHook(() => useThreadTimeline(options));
  return result.current;
}

// ============================================================================
// SINGLE ROUND GROUPING TESTS
// ============================================================================

describe('useThreadTimeline - Single Round Grouping', () => {
  describe('initial round (round 0) with all message types', () => {
    it('groups all messages correctly in round 0', () => {
      const messages = [
        createTestUserMessage({ id: 'msg-user-0', content: 'Question', roundNumber: 0 }),
        createTestAssistantMessage({
          id: 'msg-p0',
          content: 'Participant 0',
          roundNumber: 0,
          participantId: 'p0',
          participantIndex: 0,
        }),
        createTestAssistantMessage({
          id: 'msg-p1',
          content: 'Participant 1',
          roundNumber: 0,
          participantId: 'p1',
          participantIndex: 1,
        }),
        createTestModeratorMessage({
          id: 'msg-mod-0',
          content: 'Moderator summary',
          roundNumber: 0,
        }),
      ];

      const timeline = getTimeline({ messages, changelog: [] });

      expect(timeline).toHaveLength(1);
      expect(timeline[0]?.type).toBe('messages');
      expect(timeline[0]?.roundNumber).toBe(0);
      expect(timeline[0]?.data).toHaveLength(4);
    });

    it('orders messages correctly: user -> participants -> moderator', () => {
      const messages = [
        createTestModeratorMessage({ id: 'msg-mod-0', content: 'Moderator', roundNumber: 0 }),
        createTestAssistantMessage({
          id: 'msg-p1',
          content: 'Participant 1',
          roundNumber: 0,
          participantId: 'p1',
          participantIndex: 1,
        }),
        createTestUserMessage({ id: 'msg-user-0', content: 'Question', roundNumber: 0 }),
        createTestAssistantMessage({
          id: 'msg-p0',
          content: 'Participant 0',
          roundNumber: 0,
          participantId: 'p0',
          participantIndex: 0,
        }),
      ];

      const timeline = getTimeline({ messages, changelog: [] });

      const orderedMessages = timeline[0]?.data;
      expect(orderedMessages?.[0]?.role).toBe(UIMessageRoles.USER);
      expect(orderedMessages?.[1]?.metadata).toHaveProperty('participantIndex', 0);
      expect(orderedMessages?.[2]?.metadata).toHaveProperty('participantIndex', 1);
      expect(orderedMessages?.[3]?.metadata).toHaveProperty('isModerator', true);
    });

    it('participants are sorted by participantIndex', () => {
      const messages = [
        createTestUserMessage({ id: 'msg-user-0', content: 'Question', roundNumber: 0 }),
        createTestAssistantMessage({
          id: 'msg-p2',
          content: 'Participant 2',
          roundNumber: 0,
          participantId: 'p2',
          participantIndex: 2,
        }),
        createTestAssistantMessage({
          id: 'msg-p0',
          content: 'Participant 0',
          roundNumber: 0,
          participantId: 'p0',
          participantIndex: 0,
        }),
        createTestAssistantMessage({
          id: 'msg-p1',
          content: 'Participant 1',
          roundNumber: 0,
          participantId: 'p1',
          participantIndex: 1,
        }),
      ];

      const timeline = getTimeline({ messages, changelog: [] });

      const orderedMessages = timeline[0]?.data;
      expect(orderedMessages?.[1]?.metadata).toHaveProperty('participantIndex', 0);
      expect(orderedMessages?.[2]?.metadata).toHaveProperty('participantIndex', 1);
      expect(orderedMessages?.[3]?.metadata).toHaveProperty('participantIndex', 2);
    });

    it('moderator always comes last after all participants', () => {
      const messages = [
        createTestUserMessage({ id: 'msg-user-0', content: 'Question', roundNumber: 0 }),
        createTestModeratorMessage({ id: 'msg-mod-0', content: 'Moderator', roundNumber: 0 }),
        createTestAssistantMessage({
          id: 'msg-p0',
          content: 'Participant 0',
          roundNumber: 0,
          participantId: 'p0',
          participantIndex: 0,
        }),
        createTestAssistantMessage({
          id: 'msg-p1',
          content: 'Participant 1',
          roundNumber: 0,
          participantId: 'p1',
          participantIndex: 1,
        }),
        createTestAssistantMessage({
          id: 'msg-p2',
          content: 'Participant 2',
          roundNumber: 0,
          participantId: 'p2',
          participantIndex: 2,
        }),
      ];

      const timeline = getTimeline({ messages, changelog: [] });

      const orderedMessages = timeline[0]?.data;
      const lastMessage = orderedMessages && orderedMessages.length > 0 ? orderedMessages[orderedMessages.length - 1] : undefined;
      expect(lastMessage?.metadata).toHaveProperty('isModerator', true);
    });
  });

  describe('changelog integration with round', () => {
    it('includes changelog before messages in timeline', () => {
      const messages = [
        createTestUserMessage({ id: 'msg-user-0', content: 'Question', roundNumber: 0 }),
        createTestAssistantMessage({
          id: 'msg-p0',
          content: 'Participant 0',
          roundNumber: 0,
          participantId: 'p0',
          participantIndex: 0,
        }),
      ];
      const changelog = [
        createChangelog('cl-1', 0, 'participant_added'),
      ];

      const timeline = getTimeline({ messages, changelog });

      expect(timeline).toHaveLength(2);
      expect(timeline[0]?.type).toBe('changelog');
      expect(timeline[0]?.roundNumber).toBe(0);
      expect(timeline[1]?.type).toBe('messages');
      expect(timeline[1]?.roundNumber).toBe(0);
    });

    it('deduplicates changelog items by id', () => {
      const messages = [
        createTestUserMessage({ id: 'msg-user-0', content: 'Question', roundNumber: 0 }),
      ];
      const changelog = [
        createChangelog('cl-1', 0, 'participant_added'),
        createChangelog('cl-1', 0, 'participant_added'), // Duplicate
        createChangelog('cl-2', 0, 'participant_removed'),
      ];

      const timeline = getTimeline({ messages, changelog });

      const changelogItem = timeline.find(item => item.type === 'changelog');
      expect(changelogItem?.data).toHaveLength(2);
    });

    it('skips changelog-only rounds without messages or pre-search', () => {
      const messages: Array<ReturnType<typeof createTestUserMessage>> = [];
      const changelog = [
        createChangelog('cl-1', 0, 'participant_added'),
      ];

      const timeline = getTimeline({ messages, changelog });

      expect(timeline).toHaveLength(0);
    });
  });

  describe('pre-search integration with round', () => {
    it('renders pre-search for orphaned round (round without messages)', () => {
      const messages: Array<ReturnType<typeof createTestUserMessage>> = [];
      const preSearches = [createPreSearch(0)];

      const timeline = getTimeline({ messages, changelog: [], preSearches });

      expect(timeline).toHaveLength(1);
      expect(timeline[0]?.type).toBe('pre-search');
      expect(timeline[0]?.roundNumber).toBe(0);
    });

    it('does NOT render pre-search at timeline level when round has messages', () => {
      const messages = [
        createTestUserMessage({ id: 'msg-user-0', content: 'Question', roundNumber: 0 }),
        createTestAssistantMessage({
          id: 'msg-p0',
          content: 'Participant 0',
          roundNumber: 0,
          participantId: 'p0',
          participantIndex: 0,
        }),
      ];
      const preSearches = [createPreSearch(0)];

      const timeline = getTimeline({ messages, changelog: [], preSearches });

      expect(timeline).toHaveLength(1);
      expect(timeline[0]?.type).toBe('messages');
      expect(timeline.some(item => item.type === 'pre-search')).toBe(false);
    });

    it('renders changelog + pre-search for orphaned round', () => {
      const messages: Array<ReturnType<typeof createTestUserMessage>> = [];
      const changelog = [createChangelog('cl-1', 0, 'participant_added')];
      const preSearches = [createPreSearch(0)];

      const timeline = getTimeline({ messages, changelog, preSearches });

      expect(timeline).toHaveLength(2);
      expect(timeline[0]?.type).toBe('changelog');
      expect(timeline[1]?.type).toBe('pre-search');
    });
  });
});

// ============================================================================
// MULTI-ROUND GROUPING TESTS
// ============================================================================

describe('useThreadTimeline - Multi-Round Grouping', () => {
  describe('non-initial rounds (round 1+) appear correctly', () => {
    it('groups messages from round 0 and round 1 separately', () => {
      const messages = [
        createTestUserMessage({ id: 'msg-user-0', content: 'Question 1', roundNumber: 0 }),
        createTestAssistantMessage({
          id: 'msg-p0-r0',
          content: 'Round 0 Participant 0',
          roundNumber: 0,
          participantId: 'p0',
          participantIndex: 0,
        }),
        createTestUserMessage({ id: 'msg-user-1', content: 'Question 2', roundNumber: 1 }),
        createTestAssistantMessage({
          id: 'msg-p0-r1',
          content: 'Round 1 Participant 0',
          roundNumber: 1,
          participantId: 'p0',
          participantIndex: 0,
        }),
      ];

      const timeline = getTimeline({ messages, changelog: [] });

      expect(timeline).toHaveLength(2);
      expect(timeline[0]?.roundNumber).toBe(0);
      expect(timeline[0]?.data).toHaveLength(2);
      expect(timeline[1]?.roundNumber).toBe(1);
      expect(timeline[1]?.data).toHaveLength(2);
    });

    it('round 1 messages are correctly ordered: user -> participants -> moderator', () => {
      const messages = [
        createTestUserMessage({ id: 'msg-user-0', content: 'Question 1', roundNumber: 0 }),
        createTestAssistantMessage({
          id: 'msg-p0-r0',
          content: 'Round 0 Participant',
          roundNumber: 0,
          participantId: 'p0',
          participantIndex: 0,
        }),
        createTestModeratorMessage({ id: 'msg-mod-1', content: 'Moderator R1', roundNumber: 1 }),
        createTestAssistantMessage({
          id: 'msg-p1-r1',
          content: 'Round 1 Participant 1',
          roundNumber: 1,
          participantId: 'p1',
          participantIndex: 1,
        }),
        createTestUserMessage({ id: 'msg-user-1', content: 'Question 2', roundNumber: 1 }),
        createTestAssistantMessage({
          id: 'msg-p0-r1',
          content: 'Round 1 Participant 0',
          roundNumber: 1,
          participantId: 'p0',
          participantIndex: 0,
        }),
      ];

      const timeline = getTimeline({ messages, changelog: [] });

      const round1 = timeline.find(item => item.roundNumber === 1);
      expect(round1?.type).toBe('messages');

      const round1Messages = round1?.data;
      expect(round1Messages?.[0]?.role).toBe(UIMessageRoles.USER);
      expect(round1Messages?.[1]?.metadata).toHaveProperty('participantIndex', 0);
      expect(round1Messages?.[2]?.metadata).toHaveProperty('participantIndex', 1);
      expect(round1Messages?.[3]?.metadata).toHaveProperty('isModerator', true);
    });

    it('handles 3 consecutive rounds with correct ordering', () => {
      const messages = [
        createTestUserMessage({ id: 'msg-user-0', content: 'Q1', roundNumber: 0 }),
        createTestAssistantMessage({
          id: 'msg-p0-r0',
          content: 'R0 P0',
          roundNumber: 0,
          participantId: 'p0',
          participantIndex: 0,
        }),
        createTestUserMessage({ id: 'msg-user-1', content: 'Q2', roundNumber: 1 }),
        createTestAssistantMessage({
          id: 'msg-p0-r1',
          content: 'R1 P0',
          roundNumber: 1,
          participantId: 'p0',
          participantIndex: 0,
        }),
        createTestUserMessage({ id: 'msg-user-2', content: 'Q3', roundNumber: 2 }),
        createTestAssistantMessage({
          id: 'msg-p0-r2',
          content: 'R2 P0',
          roundNumber: 2,
          participantId: 'p0',
          participantIndex: 0,
        }),
      ];

      const timeline = getTimeline({ messages, changelog: [] });

      expect(timeline).toHaveLength(3);
      expect(timeline[0]?.roundNumber).toBe(0);
      expect(timeline[1]?.roundNumber).toBe(1);
      expect(timeline[2]?.roundNumber).toBe(2);
    });
  });

  describe('changelog integration across multiple rounds', () => {
    it('associates changelog with correct rounds', () => {
      const messages = [
        createTestUserMessage({ id: 'msg-user-0', content: 'Q1', roundNumber: 0 }),
        createTestAssistantMessage({
          id: 'msg-p0-r0',
          content: 'R0 P0',
          roundNumber: 0,
          participantId: 'p0',
          participantIndex: 0,
        }),
        createTestUserMessage({ id: 'msg-user-1', content: 'Q2', roundNumber: 1 }),
        createTestAssistantMessage({
          id: 'msg-p0-r1',
          content: 'R1 P0',
          roundNumber: 1,
          participantId: 'p0',
          participantIndex: 0,
        }),
      ];
      const changelog = [
        createChangelog('cl-1', 0, 'participant_added'),
        createChangelog('cl-2', 1, 'participant_removed'),
      ];

      const timeline = getTimeline({ messages, changelog });

      expect(timeline).toHaveLength(4);
      expect(timeline[0]?.type).toBe('changelog');
      expect(timeline[0]?.roundNumber).toBe(0);
      expect(timeline[1]?.type).toBe('messages');
      expect(timeline[1]?.roundNumber).toBe(0);
      expect(timeline[2]?.type).toBe('changelog');
      expect(timeline[2]?.roundNumber).toBe(1);
      expect(timeline[3]?.type).toBe('messages');
      expect(timeline[3]?.roundNumber).toBe(1);
    });

    it('changelog appears before messages in each round', () => {
      const messages = [
        createTestUserMessage({ id: 'msg-user-0', content: 'Q1', roundNumber: 0 }),
        createTestUserMessage({ id: 'msg-user-1', content: 'Q2', roundNumber: 1 }),
      ];
      const changelog = [
        createChangelog('cl-1', 0, 'participant_added'),
        createChangelog('cl-2', 1, 'participant_added'),
      ];

      const timeline = getTimeline({ messages, changelog });

      const round0Items = timeline.filter(item => item.roundNumber === 0);
      expect(round0Items[0]?.type).toBe('changelog');
      expect(round0Items[1]?.type).toBe('messages');

      const round1Items = timeline.filter(item => item.roundNumber === 1);
      expect(round1Items[0]?.type).toBe('changelog');
      expect(round1Items[1]?.type).toBe('messages');
    });
  });

  describe('pre-search integration across multiple rounds', () => {
    it('orphaned pre-search in round 1 renders correctly', () => {
      const messages = [
        createTestUserMessage({ id: 'msg-user-0', content: 'Q1', roundNumber: 0 }),
        createTestAssistantMessage({
          id: 'msg-p0-r0',
          content: 'R0 P0',
          roundNumber: 0,
          participantId: 'p0',
          participantIndex: 0,
        }),
      ];
      const preSearches = [createPreSearch(1)];

      const timeline = getTimeline({ messages, changelog: [], preSearches });

      expect(timeline).toHaveLength(2);
      expect(timeline[0]?.roundNumber).toBe(0);
      expect(timeline[0]?.type).toBe('messages');
      expect(timeline[1]?.roundNumber).toBe(1);
      expect(timeline[1]?.type).toBe('pre-search');
    });

    it('orphaned pre-search with changelog renders correctly', () => {
      const messages = [
        createTestUserMessage({ id: 'msg-user-0', content: 'Q1', roundNumber: 0 }),
      ];
      const changelog = [createChangelog('cl-1', 1, 'participant_added')];
      const preSearches = [createPreSearch(1)];

      const timeline = getTimeline({ messages, changelog, preSearches });

      expect(timeline).toHaveLength(3);
      expect(timeline[0]?.roundNumber).toBe(0);
      expect(timeline[0]?.type).toBe('messages');
      expect(timeline[1]?.roundNumber).toBe(1);
      expect(timeline[1]?.type).toBe('changelog');
      expect(timeline[2]?.roundNumber).toBe(1);
      expect(timeline[2]?.type).toBe('pre-search');
    });
  });
});

// ============================================================================
// EDGE CASE TESTS
// ============================================================================

describe('useThreadTimeline - Edge Cases', () => {
  describe('empty states', () => {
    it('returns empty timeline when no messages, changelog, or pre-searches', () => {
      const timeline = getTimeline({ messages: [], changelog: [] });

      expect(timeline).toHaveLength(0);
    });

    it('returns empty timeline when only empty arrays provided', () => {
      const timeline = getTimeline({ messages: [], changelog: [], preSearches: [] });

      expect(timeline).toHaveLength(0);
    });
  });

  describe('missing metadata handling', () => {
    it('handles messages with roundNumber 0 correctly', () => {
      const messages = [
        createTestUserMessage({ id: 'msg-user-0', content: 'Question', roundNumber: 0 }),
      ];

      const timeline = getTimeline({ messages, changelog: [] });

      expect(timeline).toHaveLength(1);
      expect(timeline[0]?.roundNumber).toBe(0);
    });

    it('groups messages with same roundNumber together', () => {
      const messages = [
        createTestUserMessage({ id: 'msg-user-0', content: 'Q1', roundNumber: 0 }),
        createTestUserMessage({ id: 'msg-user-1', content: 'Q2', roundNumber: 0 }),
      ];

      const timeline = getTimeline({ messages, changelog: [] });

      expect(timeline).toHaveLength(1);
      expect(timeline[0]?.data).toHaveLength(2);
    });
  });

  describe('moderator-only rounds', () => {
    it('handles round with only moderator message', () => {
      const messages = [
        createTestModeratorMessage({ id: 'msg-mod-0', content: 'Moderator only', roundNumber: 0 }),
      ];

      const timeline = getTimeline({ messages, changelog: [] });

      expect(timeline).toHaveLength(1);
      expect(timeline[0]?.type).toBe('messages');
      expect(timeline[0]?.data).toHaveLength(1);
    });

    it('moderator comes after user in moderator-only participant round', () => {
      const messages = [
        createTestModeratorMessage({ id: 'msg-mod-0', content: 'Moderator', roundNumber: 0 }),
        createTestUserMessage({ id: 'msg-user-0', content: 'Question', roundNumber: 0 }),
      ];

      const timeline = getTimeline({ messages, changelog: [] });

      const orderedMessages = timeline[0]?.data;
      expect(orderedMessages?.[0]?.role).toBe(UIMessageRoles.USER);
      expect(orderedMessages?.[1]?.metadata).toHaveProperty('isModerator', true);
    });
  });

  describe('participant ordering edge cases', () => {
    it('handles participants with non-sequential indices', () => {
      const messages = [
        createTestUserMessage({ id: 'msg-user-0', content: 'Question', roundNumber: 0 }),
        createTestAssistantMessage({
          id: 'msg-p5',
          content: 'Participant 5',
          roundNumber: 0,
          participantId: 'p5',
          participantIndex: 5,
        }),
        createTestAssistantMessage({
          id: 'msg-p0',
          content: 'Participant 0',
          roundNumber: 0,
          participantId: 'p0',
          participantIndex: 0,
        }),
        createTestAssistantMessage({
          id: 'msg-p2',
          content: 'Participant 2',
          roundNumber: 0,
          participantId: 'p2',
          participantIndex: 2,
        }),
      ];

      const timeline = getTimeline({ messages, changelog: [] });

      const orderedMessages = timeline[0]?.data;
      expect(orderedMessages?.[1]?.metadata).toHaveProperty('participantIndex', 0);
      expect(orderedMessages?.[2]?.metadata).toHaveProperty('participantIndex', 2);
      expect(orderedMessages?.[3]?.metadata).toHaveProperty('participantIndex', 5);
    });

    it('handles single participant correctly', () => {
      const messages = [
        createTestUserMessage({ id: 'msg-user-0', content: 'Question', roundNumber: 0 }),
        createTestAssistantMessage({
          id: 'msg-p0',
          content: 'Participant 0',
          roundNumber: 0,
          participantId: 'p0',
          participantIndex: 0,
        }),
      ];

      const timeline = getTimeline({ messages, changelog: [] });

      expect(timeline).toHaveLength(1);
      expect(timeline[0]?.data).toHaveLength(2);
    });
  });

  describe('round ordering', () => {
    it('rounds are sorted in chronological order', () => {
      const messages = [
        createTestUserMessage({ id: 'msg-user-2', content: 'Q3', roundNumber: 2 }),
        createTestUserMessage({ id: 'msg-user-0', content: 'Q1', roundNumber: 0 }),
        createTestUserMessage({ id: 'msg-user-1', content: 'Q2', roundNumber: 1 }),
      ];

      const timeline = getTimeline({ messages, changelog: [] });

      expect(timeline[0]?.roundNumber).toBe(0);
      expect(timeline[1]?.roundNumber).toBe(1);
      expect(timeline[2]?.roundNumber).toBe(2);
    });

    it('handles non-sequential round numbers', () => {
      const messages = [
        createTestUserMessage({ id: 'msg-user-0', content: 'Q1', roundNumber: 0 }),
        createTestUserMessage({ id: 'msg-user-5', content: 'Q6', roundNumber: 5 }),
        createTestUserMessage({ id: 'msg-user-2', content: 'Q3', roundNumber: 2 }),
      ];

      const timeline = getTimeline({ messages, changelog: [] });

      expect(timeline).toHaveLength(3);
      expect(timeline[0]?.roundNumber).toBe(0);
      expect(timeline[1]?.roundNumber).toBe(2);
      expect(timeline[2]?.roundNumber).toBe(5);
    });
  });

  describe('complex multi-round scenarios', () => {
    it('handles complete flow: multiple rounds with changelog and pre-search', () => {
      const messages = [
        createTestUserMessage({ id: 'msg-user-0', content: 'Q1', roundNumber: 0 }),
        createTestAssistantMessage({
          id: 'msg-p0-r0',
          content: 'R0 P0',
          roundNumber: 0,
          participantId: 'p0',
          participantIndex: 0,
        }),
        createTestAssistantMessage({
          id: 'msg-p1-r0',
          content: 'R0 P1',
          roundNumber: 0,
          participantId: 'p1',
          participantIndex: 1,
        }),
        createTestModeratorMessage({ id: 'msg-mod-0', content: 'R0 Mod', roundNumber: 0 }),
        createTestUserMessage({ id: 'msg-user-1', content: 'Q2', roundNumber: 1 }),
        createTestAssistantMessage({
          id: 'msg-p0-r1',
          content: 'R1 P0',
          roundNumber: 1,
          participantId: 'p0',
          participantIndex: 0,
        }),
        createTestModeratorMessage({ id: 'msg-mod-1', content: 'R1 Mod', roundNumber: 1 }),
      ];
      const changelog = [
        createChangelog('cl-1', 0, 'participant_added'),
        createChangelog('cl-2', 1, 'participant_removed'),
      ];
      const preSearches = [createPreSearch(2)];

      const timeline = getTimeline({ messages, changelog, preSearches });

      // 5 items total:
      // Round 0: changelog + messages
      // Round 1: changelog + messages
      // Round 2: pre-search (no changelog for round 2 in input)
      expect(timeline).toHaveLength(5);

      expect(timeline[0]?.type).toBe('changelog');
      expect(timeline[0]?.roundNumber).toBe(0);

      expect(timeline[1]?.type).toBe('messages');
      expect(timeline[1]?.roundNumber).toBe(0);
      expect(timeline[1]?.data).toHaveLength(4);

      expect(timeline[2]?.type).toBe('changelog');
      expect(timeline[2]?.roundNumber).toBe(1);

      expect(timeline[3]?.type).toBe('messages');
      expect(timeline[3]?.roundNumber).toBe(1);
      expect(timeline[3]?.data).toHaveLength(3);

      expect(timeline[4]?.type).toBe('pre-search');
      expect(timeline[4]?.roundNumber).toBe(2);
    });
  });
});

// ============================================================================
// BUG REGRESSION TESTS
// ============================================================================

describe('useThreadTimeline - Bug Regression Tests', () => {
  describe('non-initial round messages not appearing (BUG FIX)', () => {
    it('round 1+ messages appear in timeline', () => {
      const messages = [
        createTestUserMessage({ id: 'msg-user-0', content: 'Q1', roundNumber: 0 }),
        createTestUserMessage({ id: 'msg-user-1', content: 'Q2', roundNumber: 1 }),
        createTestUserMessage({ id: 'msg-user-2', content: 'Q3', roundNumber: 2 }),
      ];

      const timeline = getTimeline({ messages, changelog: [] });

      expect(timeline).toHaveLength(3);
      expect(timeline.some(item => item.roundNumber === 1)).toBe(true);
      expect(timeline.some(item => item.roundNumber === 2)).toBe(true);
    });

    it('round 1 messages are not grouped with round 0', () => {
      const messages = [
        createTestUserMessage({ id: 'msg-user-0', content: 'Q1', roundNumber: 0 }),
        createTestAssistantMessage({
          id: 'msg-p0-r0',
          content: 'R0 P0',
          roundNumber: 0,
          participantId: 'p0',
          participantIndex: 0,
        }),
        createTestUserMessage({ id: 'msg-user-1', content: 'Q2', roundNumber: 1 }),
        createTestAssistantMessage({
          id: 'msg-p0-r1',
          content: 'R1 P0',
          roundNumber: 1,
          participantId: 'p0',
          participantIndex: 0,
        }),
      ];

      const timeline = getTimeline({ messages, changelog: [] });

      const round0 = timeline.find(item => item.roundNumber === 0);
      const round1 = timeline.find(item => item.roundNumber === 1);

      expect(round0?.data).toHaveLength(2);
      expect(round1?.data).toHaveLength(2);
    });
  });

  describe('message ordering within rounds (BUG FIX)', () => {
    it('user message is always first in round regardless of input order', () => {
      const messages = [
        createTestAssistantMessage({
          id: 'msg-p0',
          content: 'Participant 0',
          roundNumber: 0,
          participantId: 'p0',
          participantIndex: 0,
        }),
        createTestModeratorMessage({ id: 'msg-mod-0', content: 'Moderator', roundNumber: 0 }),
        createTestUserMessage({ id: 'msg-user-0', content: 'Question', roundNumber: 0 }),
      ];

      const timeline = getTimeline({ messages, changelog: [] });

      expect(timeline[0]?.data[0]?.role).toBe(UIMessageRoles.USER);
    });

    it('moderator never appears before participants', () => {
      const messages = [
        createTestUserMessage({ id: 'msg-user-0', content: 'Question', roundNumber: 0 }),
        createTestModeratorMessage({ id: 'msg-mod-0', content: 'Moderator', roundNumber: 0 }),
        createTestAssistantMessage({
          id: 'msg-p0',
          content: 'Participant 0',
          roundNumber: 0,
          participantId: 'p0',
          participantIndex: 0,
        }),
        createTestAssistantMessage({
          id: 'msg-p1',
          content: 'Participant 1',
          roundNumber: 0,
          participantId: 'p1',
          participantIndex: 1,
        }),
      ];

      const timeline = getTimeline({ messages, changelog: [] });

      const orderedMessages = timeline[0]?.data;
      const moderatorIndex = orderedMessages
        ? orderedMessages.findIndex(
            msg => msg.metadata && 'isModerator' in msg.metadata && msg.metadata.isModerator,
          )
        : -1;
      const lastParticipantIndex = orderedMessages
        ? orderedMessages.findLastIndex(
            msg => msg.metadata && 'participantIndex' in msg.metadata,
          )
        : -1;

      expect(moderatorIndex).toBeGreaterThan(lastParticipantIndex);
    });
  });

  describe('round grouping correctness (BUG FIX)', () => {
    it('messages with same roundNumber are in same timeline item', () => {
      const messages = [
        createTestUserMessage({ id: 'msg-user-0', content: 'Q1', roundNumber: 0 }),
        createTestAssistantMessage({
          id: 'msg-p0',
          content: 'P0',
          roundNumber: 0,
          participantId: 'p0',
          participantIndex: 0,
        }),
        createTestAssistantMessage({
          id: 'msg-p1',
          content: 'P1',
          roundNumber: 0,
          participantId: 'p1',
          participantIndex: 1,
        }),
        createTestModeratorMessage({ id: 'msg-mod-0', content: 'Mod', roundNumber: 0 }),
      ];

      const timeline = getTimeline({ messages, changelog: [] });

      expect(timeline).toHaveLength(1);
      expect(timeline[0]?.data).toHaveLength(4);
    });

    it('messages with different roundNumbers are in separate timeline items', () => {
      const messages = [
        createTestUserMessage({ id: 'msg-user-0', content: 'Q1', roundNumber: 0 }),
        createTestUserMessage({ id: 'msg-user-1', content: 'Q2', roundNumber: 1 }),
      ];

      const timeline = getTimeline({ messages, changelog: [] });

      expect(timeline).toHaveLength(2);
      expect(timeline[0]?.data).toHaveLength(1);
      expect(timeline[1]?.data).toHaveLength(1);
    });
  });

  describe('changelog rendering (BUG FIX)', () => {
    it('changelog only renders when round has messages or pre-search', () => {
      const messages = [
        createTestUserMessage({ id: 'msg-user-0', content: 'Q1', roundNumber: 0 }),
      ];
      const changelog = [
        createChangelog('cl-1', 0, 'participant_added'),
        createChangelog('cl-2', 1, 'participant_added'), // No messages in round 1
      ];

      const timeline = getTimeline({ messages, changelog });

      const round1Changelog = timeline.find(
        item => item.type === 'changelog' && item.roundNumber === 1,
      );
      expect(round1Changelog).toBeUndefined();
    });

    it('changelog renders when round has pre-search but no messages', () => {
      const messages: Array<ReturnType<typeof createTestUserMessage>> = [];
      const changelog = [createChangelog('cl-1', 0, 'participant_added')];
      const preSearches = [createPreSearch(0)];

      const timeline = getTimeline({ messages, changelog, preSearches });

      expect(timeline.some(item => item.type === 'changelog')).toBe(true);
    });
  });
});
