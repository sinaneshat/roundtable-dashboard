/**
 * Full Render Pipeline Simulation Tests
 *
 * Simulates the ENTIRE pipeline from store message addition to what
 * ChatMessageList would render. This catches issues that unit tests miss.
 *
 * Pipeline:
 * 1. Store: setMessages adds optimistic user message
 * 2. useThreadTimeline: Groups messages by round, creates TimelineItem[]
 * 3. ThreadTimeline: Virtualizes timeline items
 * 4. ChatMessageList: Deduplicates, groups, and renders messages
 *
 * KEY BUG: User message doesn't show until streaming completes.
 */

import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';

import { MessageRoles } from '@/api/core/enums';
import type { StoredPreSearch } from '@/api/routes/chat/schema';
import type { TimelineItem } from '@/hooks/utils';
import { getRoundNumberFromMetadata } from '@/lib/utils';

// =====================
// Step 1: Store Simulation
// =====================
type SimulatedStoreState = {
  messages: UIMessage[];
  streamingRoundNumber: number | null;
  isStreaming: boolean;
  preSearches: StoredPreSearch[];
};

function createInitialStoreState(): SimulatedStoreState {
  return {
    messages: [
      {
        id: 'thread_r0_user',
        role: MessageRoles.USER,
        parts: [{ type: 'text', text: 'Initial question' }],
        metadata: { role: MessageRoles.USER, roundNumber: 0 },
      },
      {
        id: 'thread_r0_p0',
        role: MessageRoles.ASSISTANT,
        parts: [{ type: 'text', text: 'GPT response' }],
        metadata: {
          role: MessageRoles.ASSISTANT,
          roundNumber: 0,
          participantIndex: 0,
          model: 'gpt-4o',
        },
      },
      {
        id: 'thread_r0_p1',
        role: MessageRoles.ASSISTANT,
        parts: [{ type: 'text', text: 'Claude response' }],
        metadata: {
          role: MessageRoles.ASSISTANT,
          roundNumber: 0,
          participantIndex: 1,
          model: 'claude-3-5-sonnet',
        },
      },
    ],
    streamingRoundNumber: null,
    isStreaming: false,
    preSearches: [],
  };
}

function addOptimisticUserMessage(
  state: SimulatedStoreState,
  roundNumber: number,
  text: string,
): SimulatedStoreState {
  const optimisticMessage: UIMessage = {
    id: `optimistic-user-${roundNumber}-${Date.now()}`,
    role: MessageRoles.USER,
    parts: [{ type: 'text', text }],
    metadata: { role: MessageRoles.USER, roundNumber, isOptimistic: true },
  };

  return {
    ...state,
    messages: [...state.messages, optimisticMessage],
    streamingRoundNumber: roundNumber,
  };
}

// =====================
// Step 2: Timeline Simulation (useThreadTimeline)
// =====================
function simulateUseThreadTimeline(
  messages: UIMessage[],
  preSearches: StoredPreSearch[] = [],
): TimelineItem[] {
  const messagesByRound = new Map<number, UIMessage[]>();

  messages.forEach((message) => {
    const roundNumber = getRoundNumberFromMetadata(message.metadata, 0);
    if (!messagesByRound.has(roundNumber)) {
      messagesByRound.set(roundNumber, []);
    }
    messagesByRound.get(roundNumber)!.push(message);
  });

  // Sort messages within each round (user first, then by participantIndex)
  messagesByRound.forEach((roundMessages) => {
    roundMessages.sort((a, b) => {
      if (a.role === MessageRoles.USER && b.role !== MessageRoles.USER)
        return -1;
      if (a.role !== MessageRoles.USER && b.role === MessageRoles.USER)
        return 1;
      const aIdx = (a.metadata?.participantIndex as number) ?? 999;
      const bIdx = (b.metadata?.participantIndex as number) ?? 999;
      return aIdx - bIdx;
    });
  });

  // Index pre-searches by round
  const preSearchByRound = new Map<number, StoredPreSearch>();
  preSearches.forEach((ps) => {
    preSearchByRound.set(ps.roundNumber, ps);
  });

  // Build timeline
  const allRounds = new Set([...messagesByRound.keys(), ...preSearchByRound.keys()]);
  const timeline: TimelineItem[] = [];

  Array.from(allRounds).sort((a, b) => a - b).forEach((roundNumber) => {
    const roundMessages = messagesByRound.get(roundNumber);
    const roundPreSearch = preSearchByRound.get(roundNumber);

    const hasMessages = roundMessages && roundMessages.length > 0;
    const hasPreSearch = !!roundPreSearch;

    if (!hasMessages && !hasPreSearch)
      return;

    // Pre-search timeline item only when NO messages exist
    if (hasPreSearch && !hasMessages) {
      timeline.push({
        type: 'pre-search',
        data: roundPreSearch,
        key: `round-${roundNumber}-pre-search`,
        roundNumber,
      });
    }

    // Messages timeline item
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

// =====================
// Step 3: ChatMessageList Deduplication Simulation
// =====================
function simulateChatMessageListDeduplication(messages: UIMessage[]): UIMessage[] {
  const seenMessageIds = new Set<string>();
  const userRoundToIdx = new Map<number, number>();
  const result: UIMessage[] = [];

  for (const message of messages) {
    if (seenMessageIds.has(message.id))
      continue;

    if (message.role === MessageRoles.USER) {
      const roundNum = message.metadata?.roundNumber as number | undefined;
      if (roundNum !== undefined && roundNum !== null) {
        const existingIdx = userRoundToIdx.get(roundNum);
        if (existingIdx !== undefined) {
          const isOptimistic = message.id.startsWith('optimistic-');
          if (isOptimistic)
            continue;
          const isDeterministic = message.id.includes('_r') && message.id.includes('_user');
          if (isDeterministic) {
            result[existingIdx] = message;
            seenMessageIds.add(message.id);
            continue;
          }
          continue;
        }
        userRoundToIdx.set(roundNum, result.length);
      }
      seenMessageIds.add(message.id);
      result.push(message);
    } else {
      seenMessageIds.add(message.id);
      result.push(message);
    }
  }

  return result;
}

// =====================
// Step 4: Message Groups Simulation
// =====================
type MessageGroup = {
  type: 'user-group' | 'assistant-group';
  messages: Array<{ message: UIMessage; index: number }>;
  roundNumber: number;
};

function simulateMessageGroups(
  messages: UIMessage[],
  streamingRoundNumber: number | null,
  isStreaming: boolean,
): MessageGroup[] {
  const groups: MessageGroup[] = [];
  let currentUserGroup: MessageGroup | null = null;

  messages.forEach((message, index) => {
    const roundNumber = getRoundNumberFromMetadata(message.metadata, 0);

    if (message.role === MessageRoles.USER) {
      // Close current user group if different round
      if (currentUserGroup && currentUserGroup.roundNumber !== roundNumber) {
        groups.push(currentUserGroup);
        currentUserGroup = null;
      }

      if (!currentUserGroup) {
        currentUserGroup = {
          type: 'user-group',
          messages: [],
          roundNumber,
        };
      }
      currentUserGroup.messages.push({ message, index });
    } else {
      // Close user group when assistant message comes
      if (currentUserGroup) {
        groups.push(currentUserGroup);
        currentUserGroup = null;
      }

      // Skip streaming round assistant messages (handled by pending cards)
      const isCurrentStreamingRound = roundNumber === streamingRoundNumber;
      if (isStreaming && isCurrentStreamingRound) {
        return; // Skip, pending cards will handle
      }

      groups.push({
        type: 'assistant-group',
        messages: [{ message, index }],
        roundNumber,
      });
    }
  });

  // Push remaining user group
  if (currentUserGroup) {
    groups.push(currentUserGroup);
  }

  return groups;
}

// =====================
// TESTS
// =====================
describe('full Render Pipeline Simulation', () => {
  describe('store to Timeline', () => {
    it('should create round 1 timeline item after optimistic message added', () => {
      const initial = createInitialStoreState();
      const afterSubmit = addOptimisticUserMessage(initial, 1, 'Follow-up question');

      const timeline = simulateUseThreadTimeline(afterSubmit.messages);

      expect(timeline).toHaveLength(2);
      expect(timeline[0].roundNumber).toBe(0);
      expect(timeline[1].roundNumber).toBe(1);
      expect(timeline[1].type).toBe('messages');
    });
  });

  describe('timeline to ChatMessageList', () => {
    it('should pass round 1 messages to ChatMessageList', () => {
      const initial = createInitialStoreState();
      const afterSubmit = addOptimisticUserMessage(initial, 1, 'Follow-up question');

      const timeline = simulateUseThreadTimeline(afterSubmit.messages);
      const round1Item = timeline.find(item => item.roundNumber === 1);

      expect(round1Item).toBeDefined();
      expect(round1Item!.type).toBe('messages');

      const round1Messages = round1Item!.data as UIMessage[];
      expect(round1Messages).toHaveLength(1);
      expect(round1Messages[0].role).toBe(MessageRoles.USER);
    });
  });

  describe('chatMessageList Deduplication', () => {
    it('should preserve optimistic user message in round 1', () => {
      const initial = createInitialStoreState();
      const afterSubmit = addOptimisticUserMessage(initial, 1, 'Follow-up question');

      const timeline = simulateUseThreadTimeline(afterSubmit.messages);
      const round1Item = timeline.find(item => item.roundNumber === 1);
      const round1Messages = round1Item!.data as UIMessage[];

      const deduplicated = simulateChatMessageListDeduplication(round1Messages);

      expect(deduplicated).toHaveLength(1);
      expect(deduplicated[0].role).toBe(MessageRoles.USER);
      expect(deduplicated[0].parts[0]).toEqual({ type: 'text', text: 'Follow-up question' });
    });
  });

  describe('chatMessageList Message Groups', () => {
    it('should create user-group for round 1 when NOT streaming yet', () => {
      const initial = createInitialStoreState();
      const afterSubmit = addOptimisticUserMessage(initial, 1, 'Follow-up');

      const timeline = simulateUseThreadTimeline(afterSubmit.messages);
      const round1Item = timeline.find(item => item.roundNumber === 1);
      const round1Messages = round1Item!.data as UIMessage[];
      const deduplicated = simulateChatMessageListDeduplication(round1Messages);

      // Not streaming yet (waiting for API)
      const groups = simulateMessageGroups(deduplicated, 1, false);

      expect(groups).toHaveLength(1);
      expect(groups[0].type).toBe('user-group');
      expect(groups[0].roundNumber).toBe(1);
    });

    it('should create user-group for round 1 when streaming IS active', () => {
      const initial = createInitialStoreState();
      const afterSubmit = addOptimisticUserMessage(initial, 1, 'Follow-up');

      const timeline = simulateUseThreadTimeline(afterSubmit.messages);
      const round1Item = timeline.find(item => item.roundNumber === 1);
      const round1Messages = round1Item!.data as UIMessage[];
      const deduplicated = simulateChatMessageListDeduplication(round1Messages);

      // Streaming is now active
      const groups = simulateMessageGroups(deduplicated, 1, true);

      // User message should STILL be in groups (only assistants are skipped)
      expect(groups).toHaveLength(1);
      expect(groups[0].type).toBe('user-group');
    });
  });

  describe('full Pipeline Critical Path', () => {
    it('cRITICAL: User message should be renderable immediately after submission', () => {
      // Step 1: Initial state with round 0 complete
      const initial = createInitialStoreState();

      // Step 2: Submit round 1 (adds optimistic message)
      const afterSubmit = addOptimisticUserMessage(initial, 1, 'My follow-up question');

      // Step 3: Create timeline (what useThreadTimeline returns)
      const timeline = simulateUseThreadTimeline(afterSubmit.messages);

      // Verify: Round 1 timeline item exists
      const round1Item = timeline.find(item => item.roundNumber === 1);
      expect(round1Item).toBeDefined();
      expect(round1Item!.type).toBe('messages');

      // Step 4: Get messages for round 1 (what ChatMessageList receives)
      const round1Messages = round1Item!.data as UIMessage[];
      expect(round1Messages).toHaveLength(1);

      // Step 5: Deduplicate (what ChatMessageList does internally)
      const deduplicated = simulateChatMessageListDeduplication(round1Messages);
      expect(deduplicated).toHaveLength(1);

      // Step 6: Create message groups (what ChatMessageList does for rendering)
      // At this point isStreaming is still false (waiting for API)
      const groups = simulateMessageGroups(deduplicated, 1, false);

      // CRITICAL ASSERTION: User message group should exist and be renderable
      expect(groups).toHaveLength(1);
      expect(groups[0].type).toBe('user-group');
      expect(groups[0].messages).toHaveLength(1);
      expect(groups[0].messages[0].message.parts[0]).toEqual({
        type: 'text',
        text: 'My follow-up question',
      });
    });
  });
});
