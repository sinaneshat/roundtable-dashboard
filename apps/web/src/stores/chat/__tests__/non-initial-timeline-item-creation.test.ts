/**
 * Non-Initial Round Timeline Item Creation Tests
 *
 * Tests that useThreadTimeline hook correctly creates timeline items
 * for non-initial rounds when an optimistic user message is added.
 *
 * This verifies the pipeline from store messages → timeline items.
 */

import { MessageRoles, MessageStatuses } from '@roundtable/shared';
import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';

import type { TimelineItem } from '@/hooks/utils';
import { getRoundNumberFromMetadata } from '@/lib/utils';
import type { ChatThreadChangelog, StoredPreSearch } from '@/services/api';

// Simulate useThreadTimeline logic without React hooks
function simulateUseThreadTimeline(
  messages: UIMessage[],
  changelog: ChatThreadChangelog[] = [],
  preSearches: StoredPreSearch[] = [],
): TimelineItem[] {
  // Group messages by round number
  const messagesByRound = new Map<number, UIMessage[]>();
  messages.forEach((message) => {
    const roundNumber = getRoundNumberFromMetadata(message.metadata, 0);
    if (!messagesByRound.has(roundNumber)) {
      messagesByRound.set(roundNumber, []);
    }
    const roundMessages = messagesByRound.get(roundNumber);
    if (!roundMessages)
      throw new Error('expected round messages array');

    roundMessages.push(message);
  });

  // Sort messages within each round
  messagesByRound.forEach((roundMessages) => {
    roundMessages.sort((a, b) => {
      if (a.role === MessageRoles.USER && b.role !== MessageRoles.USER)
        return -1;
      if (a.role !== MessageRoles.USER && b.role === MessageRoles.USER)
        return 1;
      return 0;
    });
  });

  // Group changelog by round
  const changelogByRound = new Map<number, ChatThreadChangelog[]>();
  changelog.forEach((change) => {
    const roundNumber = change.roundNumber ?? 0;
    if (!changelogByRound.has(roundNumber)) {
      changelogByRound.set(roundNumber, []);
    }
    const roundChangelog = changelogByRound.get(roundNumber);
    if (!roundChangelog)
      throw new Error('expected round changelog array');

    roundChangelog.push(change);
  });

  // Index pre-searches by round
  const preSearchByRound = new Map<number, StoredPreSearch>();
  preSearches.forEach((preSearch) => {
    preSearchByRound.set(preSearch.roundNumber, preSearch);
  });

  // Collect all round numbers
  const allRoundNumbers = new Set<number>([
    ...messagesByRound.keys(),
    ...changelogByRound.keys(),
    ...preSearchByRound.keys(),
  ]);

  // Build timeline
  const timeline: TimelineItem[] = [];
  const sortedRounds = Array.from(allRoundNumbers).sort((a, b) => a - b);

  sortedRounds.forEach((roundNumber) => {
    const roundMessages = messagesByRound.get(roundNumber);
    const roundChangelog = changelogByRound.get(roundNumber);
    const roundPreSearch = preSearchByRound.get(roundNumber);

    const hasMessages = roundMessages && roundMessages.length > 0;
    const hasPreSearch = !!roundPreSearch;
    const hasChangelog = roundChangelog && roundChangelog.length > 0;

    if (!hasMessages && !hasPreSearch && !hasChangelog) {
      return;
    }

    const shouldShowChangelog = hasChangelog && (hasMessages || hasPreSearch);

    if (shouldShowChangelog) {
      timeline.push({
        type: 'changelog',
        data: roundChangelog,
        key: `round-${roundNumber}-changelog`,
        roundNumber,
      });
    }

    if (!hasMessages && !hasPreSearch) {
      return;
    }

    if (hasPreSearch && !hasMessages) {
      timeline.push({
        type: 'pre-search',
        data: roundPreSearch,
        key: `round-${roundNumber}-pre-search`,
        roundNumber,
      });
    }

    if (hasMessages) {
      timeline.push({
        type: 'messages',
        data: roundMessages,
        key: `round-${roundNumber}-messages`,
        roundNumber,
      });
    }
  });

  return timeline;
}

// Helper to create messages
function createUserMessage(roundNumber: number, text: string, isOptimistic = false): UIMessage {
  return {
    id: isOptimistic ? `optimistic-user-${roundNumber}-${Date.now()}` : `user-msg-r${roundNumber}`,
    role: MessageRoles.USER,
    parts: [{ type: 'text', text }],
    metadata: {
      role: MessageRoles.USER,
      roundNumber,
      ...(isOptimistic ? { isOptimistic: true } : {}),
    },
  };
}

function createAssistantMessage(roundNumber: number, participantIndex: number): UIMessage {
  return {
    id: `assistant-msg-r${roundNumber}-p${participantIndex}`,
    role: MessageRoles.ASSISTANT,
    parts: [{ type: 'text', text: `Response from participant ${participantIndex}` }],
    metadata: {
      role: MessageRoles.ASSISTANT,
      roundNumber,
      participantIndex,
      participantId: `participant-${participantIndex}`,
      model: 'gpt-4o',
      finishReason: 'stop',
      hasError: false,
      isTransient: false,
      isPartialResponse: false,
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    },
  };
}

describe('non-Initial Round Timeline Item Creation', () => {
  describe('timeline Item Creation', () => {
    it('should create timeline item for round with only optimistic user message', () => {
      const messages: UIMessage[] = [
        createUserMessage(0, 'Round 0 question'),
        createAssistantMessage(0, 0),
        createAssistantMessage(0, 1),
        createUserMessage(1, 'Round 1 question', true), // Optimistic
      ];

      const timeline = simulateUseThreadTimeline(messages);

      // Should have 2 timeline items: one for round 0, one for round 1
      expect(timeline).toHaveLength(2);

      // Round 0 should have all messages
      expect(timeline[0].type).toBe('messages');
      expect(timeline[0].roundNumber).toBe(0);
      expect(timeline[0].data).toHaveLength(3);

      // Round 1 should have only the user message
      expect(timeline[1].type).toBe('messages');
      expect(timeline[1].roundNumber).toBe(1);
      expect(timeline[1].data).toHaveLength(1);
      expect(timeline[1].data[0].role).toBe(MessageRoles.USER);
    });

    it('should include optimistic user message in correct round', () => {
      const messages: UIMessage[] = [
        createUserMessage(0, 'First question'),
        createAssistantMessage(0, 0),
        createUserMessage(1, 'Second question', true),
      ];

      const timeline = simulateUseThreadTimeline(messages);

      // Find the round 1 timeline item
      const round1Item = timeline.find(item => item.roundNumber === 1);
      expect(round1Item).toBeDefined();
      expect(round1Item?.type).toBe('messages');

      // Check the user message is there
      const round1Messages = (round1Item?.type === 'messages' ? round1Item.data : []) as UIMessage[];
      const userMessage = round1Messages.find(m => m.role === MessageRoles.USER);
      expect(userMessage).toBeDefined();
      expect(userMessage?.parts[0]).toEqual({ type: 'text', text: 'Second question' });
    });

    it('should order timeline items by round number', () => {
      const messages: UIMessage[] = [
        createUserMessage(0, 'Round 0'),
        createAssistantMessage(0, 0),
        createUserMessage(1, 'Round 1', true),
        createUserMessage(2, 'Round 2', true),
      ];

      const timeline = simulateUseThreadTimeline(messages);

      expect(timeline).toHaveLength(3);
      expect(timeline[0].roundNumber).toBe(0);
      expect(timeline[1].roundNumber).toBe(1);
      expect(timeline[2].roundNumber).toBe(2);
    });

    it('should create timeline item for pre-search only round', () => {
      const messages: UIMessage[] = [
        createUserMessage(0, 'Round 0'),
        createAssistantMessage(0, 0),
      ];

      const preSearches: StoredPreSearch[] = [{
        id: 'presearch-1',
        threadId: 'thread-1',
        roundNumber: 1,
        userQuery: 'Search query',
        status: MessageStatuses.PENDING,
        searchData: null,
        createdAt: new Date(),
        completedAt: null,
        errorMessage: null,
      }];

      const timeline = simulateUseThreadTimeline(messages, [], preSearches);

      // Should have round 0 messages + round 1 pre-search
      expect(timeline).toHaveLength(2);
      expect(timeline[1].type).toBe('pre-search');
      expect(timeline[1].roundNumber).toBe(1);
    });

    it('should NOT create pre-search timeline item when messages exist for round', () => {
      const messages: UIMessage[] = [
        createUserMessage(0, 'Round 0'),
        createAssistantMessage(0, 0),
        createUserMessage(1, 'Round 1', true),
      ];

      const preSearches: StoredPreSearch[] = [{
        id: 'presearch-1',
        threadId: 'thread-1',
        roundNumber: 1,
        userQuery: 'Search query',
        status: MessageStatuses.PENDING,
        searchData: null,
        createdAt: new Date(),
        completedAt: null,
        errorMessage: null,
      }];

      const timeline = simulateUseThreadTimeline(messages, [], preSearches);

      // Should have round 0 messages + round 1 messages (NOT pre-search)
      // Pre-search is rendered by ChatMessageList when messages exist
      expect(timeline).toHaveLength(2);
      expect(timeline[1].type).toBe('messages');
      expect(timeline[1].roundNumber).toBe(1);
    });
  });

  describe('immediate Visibility After Submission', () => {
    it('should have timeline item immediately after adding optimistic message', () => {
      // Simulate the state BEFORE submission (only round 0)
      const beforeSubmission: UIMessage[] = [
        createUserMessage(0, 'Initial question'),
        createAssistantMessage(0, 0),
        createAssistantMessage(0, 1),
      ];

      const timelineBefore = simulateUseThreadTimeline(beforeSubmission);
      expect(timelineBefore).toHaveLength(1);
      expect(timelineBefore[0].roundNumber).toBe(0);

      // Simulate the state AFTER submission (add optimistic message)
      const afterSubmission: UIMessage[] = [
        ...beforeSubmission,
        createUserMessage(1, 'Follow-up question', true),
      ];

      const timelineAfter = simulateUseThreadTimeline(afterSubmission);

      // Should now have 2 timeline items
      expect(timelineAfter).toHaveLength(2);
      expect(timelineAfter[1].roundNumber).toBe(1);
      expect(timelineAfter[1].type).toBe('messages');

      // Round 1 should have the optimistic user message
      const round1Data = timelineAfter[1].data as UIMessage[];
      expect(round1Data).toHaveLength(1);
      expect(round1Data[0].role).toBe(MessageRoles.USER);
    });

    it('should show user message before any assistant responses', () => {
      const messages: UIMessage[] = [
        createUserMessage(0, 'Round 0'),
        createAssistantMessage(0, 0),
        createUserMessage(1, 'Round 1', true), // Just submitted
      ];

      const timeline = simulateUseThreadTimeline(messages);
      const round1Item = timeline.find(item => item.roundNumber === 1);

      expect(round1Item).toBeDefined();
      const round1Messages = (round1Item?.type === 'messages' ? round1Item.data : []) as UIMessage[];

      // Only user message, no assistant responses yet
      expect(round1Messages).toHaveLength(1);
      expect(round1Messages[0]?.role).toBe(MessageRoles.USER);
    });
  });

  describe('edge Cases', () => {
    it('should handle empty messages array', () => {
      const timeline = simulateUseThreadTimeline([]);
      expect(timeline).toHaveLength(0);
    });

    it('should handle single user message (round 0)', () => {
      const messages: UIMessage[] = [
        createUserMessage(0, 'First message'),
      ];

      const timeline = simulateUseThreadTimeline(messages);
      expect(timeline).toHaveLength(1);
      expect(timeline[0].type).toBe('messages');
      expect(timeline[0].roundNumber).toBe(0);
    });

    it('should handle multiple consecutive user messages in same round', () => {
      // This shouldn't normally happen, but test edge case
      const messages: UIMessage[] = [
        {
          ...createUserMessage(0, 'First message'),
          id: 'user-1',
        },
        {
          ...createUserMessage(0, 'Second message'),
          id: 'user-2',
        },
      ];

      const timeline = simulateUseThreadTimeline(messages);
      expect(timeline).toHaveLength(1);
      expect(timeline[0].data).toHaveLength(2);
    });
  });
});
