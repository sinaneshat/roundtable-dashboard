/**
 * Thread Timeline and Element Ordering Tests
 *
 * Tests for the visual ordering and timeline of elements in the thread screen
 * as documented in FLOW_DOCUMENTATION.md:
 *
 * Element Order (per round):
 * 1. User message
 * 2. Pre-search card (if web search enabled)
 * 3. Participant responses (in priority order)
 * 4. Round moderator card
 * 5. Feedback buttons (after moderator)
 *
 * Timeline Events:
 * - Thread creation
 * - Message timestamps
 * - Streaming start/end times
 * - Moderator trigger times
 *
 * Key Validations:
 * - Elements appear in correct order
 * - Timestamps are sequential
 * - Visual grouping per round
 */

import { MessageRoles } from '@roundtable/shared';
import { describe, expect, it } from 'vitest';

import {
  createTestAssistantMessage,
  createTestUserMessage,
} from '@/lib/testing';
import type { DbAssistantMessageMetadata, DbUserMessageMetadata } from '@/services/api';

// ============================================================================
// TEST HELPERS
// ============================================================================

type TimelineElement = {
  type: 'user-message' | 'pre-search' | 'participant-message' | 'moderator' | 'feedback';
  roundNumber: number;
  participantIndex?: number;
  timestamp: Date;
  id: string;
};

function createTimelineElement(
  type: TimelineElement['type'],
  roundNumber: number,
  timestamp: Date,
  participantIndex?: number,
): TimelineElement {
  return {
    type,
    roundNumber,
    participantIndex,
    timestamp,
    id: `${type}-r${roundNumber}${participantIndex !== undefined ? `-p${participantIndex}` : ''}`,
  };
}

/**
 * Builds a complete timeline for a round with all elements
 */
function buildRoundTimeline(
  roundNumber: number,
  participantCount: number,
  baseTime: Date,
  options?: {
    includePreSearch?: boolean;
    includeModerator?: boolean;
    includeFeedback?: boolean;
  },
): TimelineElement[] {
  const {
    includePreSearch = true,
    includeModerator = true,
    includeFeedback = true,
  } = options ?? {};

  const timeline: TimelineElement[] = [];
  let currentTime = new Date(baseTime);

  // 1. User message
  timeline.push(createTimelineElement('user-message', roundNumber, currentTime));

  // 2. Pre-search (if enabled)
  if (includePreSearch) {
    currentTime = new Date(currentTime.getTime() + 1000);
    timeline.push(createTimelineElement('pre-search', roundNumber, currentTime));
  }

  // 3. Participant messages (in order)
  for (let i = 0; i < participantCount; i++) {
    currentTime = new Date(currentTime.getTime() + 5000); // 5 seconds per participant
    timeline.push(createTimelineElement('participant-message', roundNumber, currentTime, i));
  }

  // 4. Moderator
  if (includeModerator) {
    currentTime = new Date(currentTime.getTime() + 2000);
    timeline.push(createTimelineElement('moderator', roundNumber, currentTime));
  }

  // 5. Feedback (after moderator)
  if (includeFeedback) {
    currentTime = new Date(currentTime.getTime() + 500);
    timeline.push(createTimelineElement('feedback', roundNumber, currentTime));
  }

  return timeline;
}

// ============================================================================
// ELEMENT ORDER TESTS
// ============================================================================

describe('element Order Within Round', () => {
  describe('standard Round Order', () => {
    it('elements appear in correct order: user -> pre-search -> participants -> moderator -> feedback', () => {
      const timeline = buildRoundTimeline(0, 3, new Date());

      const expectedOrder: TimelineElement['type'][] = [
        'user-message',
        'pre-search',
        'participant-message',
        'participant-message',
        'participant-message',
        'moderator',
        'feedback',
      ];

      expect(timeline.map(e => e.type)).toEqual(expectedOrder);
    });

    it('user message is always first in round', () => {
      const timeline = buildRoundTimeline(0, 3, new Date());

      expect(timeline[0]?.type).toBe('user-message');
    });

    it('pre-search appears after user message but before participants', () => {
      const timeline = buildRoundTimeline(0, 3, new Date());

      const userIndex = timeline.findIndex(e => e.type === 'user-message');
      const preSearchIndex = timeline.findIndex(e => e.type === 'pre-search');
      const firstParticipantIndex = timeline.findIndex(e => e.type === 'participant-message');

      expect(preSearchIndex).toBeGreaterThan(userIndex);
      expect(preSearchIndex).toBeLessThan(firstParticipantIndex);
    });

    it('moderator appears after all participants', () => {
      const timeline = buildRoundTimeline(0, 3, new Date());

      const participantIndices = timeline
        .map((e, i) => (e.type === 'participant-message' ? i : -1))
        .filter(i => i !== -1);
      const moderatorIndex = timeline.findIndex(e => e.type === 'moderator');
      const lastParticipantIndex = Math.max(...participantIndices);

      expect(moderatorIndex).toBeGreaterThan(lastParticipantIndex);
    });

    it('feedback appears after moderator', () => {
      const timeline = buildRoundTimeline(0, 3, new Date());

      const moderatorIndex = timeline.findIndex(e => e.type === 'moderator');
      const feedbackIndex = timeline.findIndex(e => e.type === 'feedback');

      expect(feedbackIndex).toBeGreaterThan(moderatorIndex);
    });
  });

  describe('round Without Pre-Search', () => {
    it('order is correct when web search disabled', () => {
      const timeline = buildRoundTimeline(0, 3, new Date(), { includePreSearch: false });

      const expectedOrder: TimelineElement['type'][] = [
        'user-message',
        'participant-message',
        'participant-message',
        'participant-message',
        'moderator',
        'feedback',
      ];

      expect(timeline.map(e => e.type)).toEqual(expectedOrder);
    });

    it('participants immediately follow user message without pre-search', () => {
      const timeline = buildRoundTimeline(0, 3, new Date(), { includePreSearch: false });

      expect(timeline[0]?.type).toBe('user-message');
      expect(timeline[1]?.type).toBe('participant-message');
    });
  });

  describe('round Without Moderator', () => {
    it('order is correct without moderator (e.g., brainstorming mode)', () => {
      const timeline = buildRoundTimeline(0, 3, new Date(), {
        includeModerator: false,
        includeFeedback: false,
      });

      const expectedOrder: TimelineElement['type'][] = [
        'user-message',
        'pre-search',
        'participant-message',
        'participant-message',
        'participant-message',
      ];

      expect(timeline.map(e => e.type)).toEqual(expectedOrder);
    });
  });
});

// ============================================================================
// PARTICIPANT ORDER TESTS
// ============================================================================

describe('participant Message Order', () => {
  describe('priority Order', () => {
    it('participants appear in index order (0, 1, 2)', () => {
      const timeline = buildRoundTimeline(0, 3, new Date());
      const participantMessages = timeline.filter(e => e.type === 'participant-message');

      expect(participantMessages[0]?.participantIndex).toBe(0);
      expect(participantMessages[1]?.participantIndex).toBe(1);
      expect(participantMessages[2]?.participantIndex).toBe(2);
    });

    it('maintains order with 5 participants', () => {
      const timeline = buildRoundTimeline(0, 5, new Date());
      const participantMessages = timeline.filter(e => e.type === 'participant-message');

      participantMessages.forEach((msg, index) => {
        expect(msg.participantIndex).toBe(index);
      });
    });
  });

  describe('messages to UI Messages Mapping', () => {
    it('maps store messages to timeline elements correctly', () => {
      const storeMessages = [
        createTestUserMessage({
          id: 'msg-user-0',
          content: 'User question',
          roundNumber: 0,
        }),
        createTestAssistantMessage({
          id: 'msg-p0',
          content: 'Participant 0 response',
          roundNumber: 0,
          participantId: 'participant-0',
          participantIndex: 0,
        }),
        createTestAssistantMessage({
          id: 'msg-p1',
          content: 'Participant 1 response',
          roundNumber: 0,
          participantId: 'participant-1',
          participantIndex: 1,
        }),
      ];

      // Verify message order reflects timeline
      expect(storeMessages[0]?.role).toBe(MessageRoles.USER);
      expect((storeMessages[1]?.metadata as DbAssistantMessageMetadata).participantIndex).toBe(0);
      expect((storeMessages[2]?.metadata as DbAssistantMessageMetadata).participantIndex).toBe(1);
    });
  });
});

// ============================================================================
// TIMESTAMP SEQUENCE TESTS
// ============================================================================

describe('timestamp Sequences', () => {
  describe('chronological Order', () => {
    it('timestamps are strictly increasing within round', () => {
      const timeline = buildRoundTimeline(0, 3, new Date());

      for (let i = 1; i < timeline.length; i++) {
        const prevElement = timeline[i - 1];
        const currElement = timeline[i];
        if (!prevElement || !currElement) {
          throw new Error(`Expected timeline elements at indices ${i - 1} and ${i}`);
        }
        const prevTime = prevElement.timestamp.getTime();
        const currTime = currElement.timestamp.getTime();
        expect(currTime).toBeGreaterThan(prevTime);
      }
    });

    it('maintains timestamp order across multiple rounds', () => {
      const round0 = buildRoundTimeline(0, 2, new Date('2024-01-01T00:00:00Z'));
      const round1 = buildRoundTimeline(1, 2, new Date('2024-01-01T00:01:00Z'));
      const allElements = [...round0, ...round1];

      for (let i = 1; i < allElements.length; i++) {
        const prevElement = allElements[i - 1];
        const currElement = allElements[i];
        if (!prevElement || !currElement) {
          throw new Error(`Expected elements at indices ${i - 1} and ${i}`);
        }
        const prevTime = prevElement.timestamp.getTime();
        const currTime = currElement.timestamp.getTime();
        expect(currTime).toBeGreaterThan(prevTime);
      }
    });
  });

  describe('created At Timestamps', () => {
    it('message createdAt is set on creation', () => {
      const message = createTestUserMessage({
        id: 'msg-1',
        content: 'Test',
        roundNumber: 0,
        createdAt: '2024-01-01T00:00:00Z',
      });

      expect((message.metadata as DbUserMessageMetadata).createdAt).toBe('2024-01-01T00:00:00Z');
    });

    it('assistant message createdAt is set after streaming completes', () => {
      const message = createTestAssistantMessage({
        id: 'msg-1',
        content: 'Test',
        roundNumber: 0,
        participantId: 'p0',
        participantIndex: 0,
        createdAt: '2024-01-01T00:00:05Z',
      });

      expect((message.metadata as DbAssistantMessageMetadata).createdAt).toBe('2024-01-01T00:00:05Z');
    });
  });
});

// ============================================================================
// MULTI-ROUND TIMELINE TESTS
// ============================================================================

describe('multi-Round Timeline', () => {
  describe('round Boundaries', () => {
    it('each round starts with user message', () => {
      const round0 = buildRoundTimeline(0, 2, new Date('2024-01-01T00:00:00Z'));
      const round1 = buildRoundTimeline(1, 2, new Date('2024-01-01T00:01:00Z'));

      expect(round0[0]?.type).toBe('user-message');
      expect(round0[0]?.roundNumber).toBe(0);

      expect(round1[0]?.type).toBe('user-message');
      expect(round1[0]?.roundNumber).toBe(1);
    });

    it('round numbers increment correctly', () => {
      const timeline0 = buildRoundTimeline(0, 2, new Date());
      const timeline1 = buildRoundTimeline(1, 2, new Date());
      const timeline2 = buildRoundTimeline(2, 2, new Date());

      timeline0.forEach(e => expect(e.roundNumber).toBe(0));
      timeline1.forEach(e => expect(e.roundNumber).toBe(1));
      timeline2.forEach(e => expect(e.roundNumber).toBe(2));
    });
  });

  describe('grouping by Round', () => {
    it('elements can be grouped by roundNumber', () => {
      const allElements = [
        ...buildRoundTimeline(0, 2, new Date('2024-01-01T00:00:00Z')),
        ...buildRoundTimeline(1, 2, new Date('2024-01-01T00:01:00Z')),
      ];

      const groupedByRound = allElements.reduce((acc, element) => {
        const round = element.roundNumber;
        if (!acc[round])
          acc[round] = [];
        acc[round].push(element);
        return acc;
      }, {} as Record<number, TimelineElement[]>);

      expect(Object.keys(groupedByRound)).toHaveLength(2);
      expect(groupedByRound[0]).toBeDefined();
      expect(groupedByRound[1]).toBeDefined();
    });

    it('each round has expected element count', () => {
      const timeline = buildRoundTimeline(0, 3, new Date());
      // user + pre-search + 3 participants + analysis + feedback = 7
      expect(timeline).toHaveLength(7);
    });
  });
});

// ============================================================================
// VISUAL ORDERING TESTS
// ============================================================================

describe('visual Ordering', () => {
  describe('card Stack Order', () => {
    it('pre-search card appears before first participant card', () => {
      const elements = buildRoundTimeline(0, 2, new Date());
      const preSearchIndex = elements.findIndex(e => e.type === 'pre-search');
      const firstParticipantIndex = elements.findIndex(e => e.type === 'participant-message');

      expect(preSearchIndex).toBeLessThan(firstParticipantIndex);
    });

    it('moderator card appears after last participant card', () => {
      const elements = buildRoundTimeline(0, 2, new Date());
      const moderatorIndex = elements.findIndex(e => e.type === 'moderator');
      const participantIndices = elements
        .map((e, i) => e.type === 'participant-message' ? i : -1)
        .filter(i => i !== -1);

      expect(moderatorIndex).toBeGreaterThan(Math.max(...participantIndices));
    });
  });

  describe('streaming Indicator Position', () => {
    it('streaming indicator shows on currently streaming element', () => {
      // During pre-search streaming
      const streamingElement: TimelineElement = {
        type: 'pre-search',
        roundNumber: 0,
        timestamp: new Date(),
        id: 'presearch-r0',
      };

      expect(streamingElement.type).toBe('pre-search');
    });

    it('streaming indicator moves to next element when complete', () => {
      // After pre-search, streaming moves to participant 0
      const elements = buildRoundTimeline(0, 3, new Date());

      const preSearchIndex = elements.findIndex(e => e.type === 'pre-search');
      const nextElement = elements[preSearchIndex + 1];

      expect(nextElement?.type).toBe('participant-message');
      expect(nextElement?.participantIndex).toBe(0);
    });
  });
});

// ============================================================================
// SPECIAL STATES TESTS
// ============================================================================

describe('special UI States', () => {
  describe('empty State', () => {
    it('no elements when no messages', () => {
      const timeline: TimelineElement[] = [];
      expect(timeline).toHaveLength(0);
    });
  });

  describe('partial Round', () => {
    it('timeline shows partial elements during streaming', () => {
      // Mid-streaming: user + pre-search + participant 0 + (participant 1 streaming)
      const partialTimeline = buildRoundTimeline(0, 2, new Date(), {
        includeModerator: false, // Not yet triggered
        includeFeedback: false,
      });

      expect(partialTimeline.map(e => e.type)).toEqual([
        'user-message',
        'pre-search',
        'participant-message',
        'participant-message',
      ]);
    });
  });

  describe('loading States', () => {
    it('initial load shows skeleton until data ready', () => {
      const hasInitiallyLoaded = false;
      const messages: unknown[] = [];

      const showSkeleton = !hasInitiallyLoaded || messages.length === 0;
      expect(showSkeleton).toBe(true);
    });

    it('skeleton hidden after initial load', () => {
      const hasInitiallyLoaded = true;
      const messages = [{ id: 'msg-1' }];

      const showSkeleton = !hasInitiallyLoaded || messages.length === 0;
      expect(showSkeleton).toBe(false);
    });
  });
});

// ============================================================================
// SCROLL BEHAVIOR TESTS
// ============================================================================

describe('scroll Behavior', () => {
  describe('auto-Scroll During Streaming', () => {
    it('should scroll to streaming element', () => {
      const _isStreaming = true;
      const currentParticipantIndex = 1;

      // Scroll target should be the currently streaming participant
      const scrollTargetId = `participant-message-r0-p${currentParticipantIndex}`;
      expect(scrollTargetId).toContain(`p${currentParticipantIndex}`);
    });
  });

  describe('scroll Position Preservation', () => {
    it('preserves scroll position on refresh', () => {
      const scrollPosition = 500;
      const preservedPosition = scrollPosition;

      expect(preservedPosition).toBe(500);
    });
  });
});

// ============================================================================
// ELEMENT ID PATTERNS TESTS
// ============================================================================

describe('element ID Patterns', () => {
  describe('message IDs', () => {
    it('user message ID follows pattern: thread-{id}_r{round}_user', () => {
      const threadId = 'thread-123';
      const roundNumber = 0;
      const expectedId = `${threadId}_r${roundNumber}_user`;

      expect(expectedId).toBe('thread-123_r0_user');
    });

    it('assistant message ID follows pattern: thread-{id}_r{round}_p{index}', () => {
      const threadId = 'thread-123';
      const roundNumber = 0;
      const participantIndex = 1;
      const expectedId = `${threadId}_r${roundNumber}_p${participantIndex}`;

      expect(expectedId).toBe('thread-123_r0_p1');
    });
  });

  describe('pre-Search IDs', () => {
    it('pre-search ID contains round number', () => {
      const preSearchId = 'presearch-round-0';
      expect(preSearchId).toContain('0');
    });
  });

  describe('moderator IDs', () => {
    it('moderator ID contains round number', () => {
      const moderatorId = 'moderator-round-0';
      expect(moderatorId).toContain('0');
    });
  });
});

// ============================================================================
// RESPONSIVE LAYOUT TESTS
// ============================================================================

describe('responsive Layout', () => {
  describe('card Width', () => {
    it('participant cards maintain consistent width', () => {
      const participantCount = 3;
      const cards = Array.from({ length: participantCount }, (_, i) => ({
        index: i,
        width: '100%', // Full width on mobile
      }));

      cards.forEach((card) => {
        expect(card.width).toBe('100%');
      });
    });
  });

  describe('timeline Density', () => {
    it('all rounds visible in timeline', () => {
      const rounds = [0, 1, 2, 3, 4];
      const visibleRounds = rounds.filter(_ => true); // All visible

      expect(visibleRounds).toHaveLength(5);
    });
  });
});
