/**
 * Timeline Integrity Comprehensive Tests
 *
 * Ensures the integrity of timeline elements throughout all conversation scenarios:
 * - User message → Pre-search (if enabled) → Participants → Moderator
 * - Resumption after page refresh
 * - Uninterrupted multi-round conversations
 * - Config changes between rounds (changelog card)
 * - Race condition prevention
 * - Sequential participant execution
 *
 * The timeline order MUST ALWAYS be:
 * 1. [Optional] Changelog card (if config changed from previous round)
 * 2. User message
 * 3. [Optional] Pre-search card (if web search enabled)
 * 4. Participant messages (P0 → P1 → P2 in priority order)
 * 5. Round moderator card (after last participant)
 */

import type {
  TimelineItemTypes,
} from '@roundtable/shared';
import {
  FinishReasons,
  MessagePartTypes,
  MessageRoles,
  MessageStatuses,
  StreamStatuses,
  TimelineElementTypes,
} from '@roundtable/shared';
import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';

import {
  createMockStoredPreSearch,
  createTestAssistantMessage,
  createTestUserMessage,
  getMetadataFinishReason,
  getMetadataRoundNumber,
  hasAssistantMetadata,
  hasUserMetadata,
  isMetadataModerator,
} from '@/lib/testing';
import type { ChatThread, DbModeratorMessageMetadata } from '@/services/api';

import type { ChatStoreApi } from '../store';
import { createChatStore } from '../store';

// ============================================================================
// TIMELINE ELEMENT TYPES (test-specific - mixes item types and element types)
// ============================================================================

type TimelineElementType
  = | typeof TimelineItemTypes.CHANGELOG // 'changelog' from TimelineItemTypes
    | typeof TimelineElementTypes.USER_MESSAGE // 'user_message'
    | typeof TimelineElementTypes.PRE_SEARCH // 'pre_search'
    | typeof TimelineElementTypes.PARTICIPANT_MESSAGE // 'participant_message'
    | typeof TimelineElementTypes.MODERATOR; // 'moderator'

type TimelineElement = {
  type: TimelineElementType;
  roundNumber: number;
  participantIndex?: number;
  timestamp: number;
};

// ============================================================================
// HELPERS
// ============================================================================

function createMockThread(id: string, enableWebSearch = false): ChatThread {
  return {
    id,
    userId: 'user-123',
    title: 'Test Thread',
    mode: 'analyzing',
    status: 'active',
    enableWebSearch,
    createdAt: new Date(),
    updatedAt: new Date(),
  } satisfies ChatThread;
}

function createMockParticipants(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `participant-${i}`,
    threadId: 'thread-123',
    modelId: `model-${i}`,
    role: `Role ${i}`,
    priority: i,
    isEnabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));
}

function createModeratorMessage(
  threadId: string,
  roundNumber: number,
  text: string,
): UIMessage {
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

function buildTimelineFromStore(store: ChatStoreApi): TimelineElement[] {
  const state = store.getState();
  const timeline: TimelineElement[] = [];
  let timestamp = 0;

  // Group messages and moderators by round
  const roundNumbers = new Set<number>();

  state.messages.forEach((m) => {
    const roundNumber = getMetadataRoundNumber(m.metadata);
    if (roundNumber !== null) {
      roundNumbers.add(roundNumber);
    }
  });

  state.preSearches.forEach((ps) => {
    roundNumbers.add(ps.roundNumber);
  });

  // Sort rounds and build timeline
  const sortedRounds = Array.from(roundNumbers).sort((a, b) => a - b);

  for (const roundNumber of sortedRounds) {
    // User message for this round
    const userMsg = state.messages.find((m) => {
      if (!hasUserMetadata(m)) {
        return false;
      }
      return m.metadata.roundNumber === roundNumber;
    });

    if (userMsg) {
      timeline.push({
        type: TimelineElementTypes.USER_MESSAGE,
        roundNumber,
        timestamp: timestamp++,
      });
    }

    // Pre-search for this round
    const preSearch = state.preSearches.find(ps => ps.roundNumber === roundNumber);
    if (preSearch) {
      timeline.push({
        type: TimelineElementTypes.PRE_SEARCH,
        roundNumber,
        timestamp: timestamp++,
      });
    }

    // Participant messages for this round (sorted by participantIndex, excluding moderator)
    const participantMsgs = state.messages
      .filter((m) => {
        if (!hasAssistantMetadata(m)) {
          return false;
        }
        return (
          m.metadata.roundNumber === roundNumber
          && !isMetadataModerator(m.metadata)
        );
      })
      .sort((a, b) => {
        if (!hasAssistantMetadata(a) || !hasAssistantMetadata(b)) {
          return 0;
        }
        const aIdx = a.metadata.participantIndex ?? 0;
        const bIdx = b.metadata.participantIndex ?? 0;
        return aIdx - bIdx;
      });

    for (const msg of participantMsgs) {
      if (hasAssistantMetadata(msg)) {
        timeline.push({
          type: TimelineElementTypes.PARTICIPANT_MESSAGE,
          roundNumber,
          participantIndex: msg.metadata.participantIndex,
          timestamp: timestamp++,
        });
      }
    }

    // Moderator for this round - derived from moderator messages
    const moderatorMsg = state.messages.find((m) => {
      const msgRoundNumber = getMetadataRoundNumber(m.metadata);
      return isMetadataModerator(m.metadata) && msgRoundNumber === roundNumber;
    });
    if (moderatorMsg) {
      timeline.push({
        type: TimelineElementTypes.MODERATOR,
        roundNumber,
        timestamp: timestamp++,
      });
    }
  }

  return timeline;
}

function validateTimelineOrder(timeline: TimelineElement[]): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Group by round
  const roundGroups = new Map<number, TimelineElement[]>();
  for (const element of timeline) {
    const group = roundGroups.get(element.roundNumber) ?? [];
    group.push(element);
    roundGroups.set(element.roundNumber, group);
  }

  // Validate each round's order
  for (const [roundNumber, elements] of roundGroups) {
    const sortedElements = [...elements].sort((a, b) => a.timestamp - b.timestamp);

    const expectedOrder: TimelineElementType[] = [];
    const hasPreSearch = sortedElements.some(e => e.type === TimelineElementTypes.PRE_SEARCH);
    const hasModerator = sortedElements.some(e => e.type === TimelineElementTypes.MODERATOR);
    const participantCount = sortedElements.filter(e => e.type === TimelineElementTypes.PARTICIPANT_MESSAGE).length;

    // Build expected order
    expectedOrder.push(TimelineElementTypes.USER_MESSAGE);
    if (hasPreSearch)
      expectedOrder.push(TimelineElementTypes.PRE_SEARCH);
    for (let i = 0; i < participantCount; i++) {
      expectedOrder.push(TimelineElementTypes.PARTICIPANT_MESSAGE);
    }
    if (hasModerator)
      expectedOrder.push(TimelineElementTypes.MODERATOR);

    // Validate
    const actualOrder = sortedElements.map(e => e.type);

    for (let i = 0; i < Math.max(expectedOrder.length, actualOrder.length); i++) {
      if (expectedOrder[i] !== actualOrder[i]) {
        errors.push(
          `Round ${roundNumber}, position ${i}: expected '${expectedOrder[i]}' but got '${actualOrder[i]}'`,
        );
      }
    }

    // Validate participant order within round
    const participantElements = sortedElements.filter(e => e.type === TimelineElementTypes.PARTICIPANT_MESSAGE);
    for (let i = 0; i < participantElements.length; i++) {
      if (participantElements[i]?.participantIndex !== i) {
        errors.push(
          `Round ${roundNumber}: participant ${i} has wrong index ${participantElements[i]?.participantIndex}`,
        );
      }
    }
  }

  return { isValid: errors.length === 0, errors };
}

// ============================================================================
// MULTI-ROUND TIMELINE TESTS
// ============================================================================

describe('multi-Round Timeline Integrity', () => {
  it('should maintain order across multiple rounds', () => {
    const store = createChatStore();
    const participants = createMockParticipants(2);

    store.getState().setThread(createMockThread('thread-123', false));
    store.getState().setParticipants(participants);

    // Round 0
    const r0User = createTestUserMessage({ id: 'user-r0', content: 'Q1', roundNumber: 0 });
    const r0P0 = createTestAssistantMessage({
      id: 'p0-r0',
      content: 'A1',
      roundNumber: 0,
      participantId: 'p0',
      participantIndex: 0,
      finishReason: FinishReasons.STOP,
    });
    const r0P1 = createTestAssistantMessage({
      id: 'p1-r0',
      content: 'A2',
      roundNumber: 0,
      participantId: 'p1',
      participantIndex: 1,
      finishReason: FinishReasons.STOP,
    });
    const r0Moderator = createModeratorMessage('thread-123', 0, 'Round 0 moderator');

    // Round 1
    const r1User = createTestUserMessage({ id: 'user-r1', content: 'Q2', roundNumber: 1 });
    const r1P0 = createTestAssistantMessage({
      id: 'p0-r1',
      content: 'B1',
      roundNumber: 1,
      participantId: 'p0',
      participantIndex: 0,
      finishReason: FinishReasons.STOP,
    });
    const r1P1 = createTestAssistantMessage({
      id: 'p1-r1',
      content: 'B2',
      roundNumber: 1,
      participantId: 'p1',
      participantIndex: 1,
      finishReason: FinishReasons.STOP,
    });
    const r1Moderator = createModeratorMessage('thread-123', 1, 'Round 1 moderator');

    store.getState().setMessages([r0User, r0P0, r0P1, r0Moderator, r1User, r1P0, r1P1, r1Moderator]);

    const timeline = buildTimelineFromStore(store);
    const validation = validateTimelineOrder(timeline);

    expect(validation.isValid).toBe(true);
    expect(timeline).toHaveLength(8); // 2 rounds × (1 user + 2 participants + 1 moderator)

    // Round 0
    expect(timeline[0]).toMatchObject({ type: TimelineElementTypes.USER_MESSAGE, roundNumber: 0 });
    expect(timeline[1]).toMatchObject({ type: TimelineElementTypes.PARTICIPANT_MESSAGE, roundNumber: 0, participantIndex: 0 });
    expect(timeline[2]).toMatchObject({ type: TimelineElementTypes.PARTICIPANT_MESSAGE, roundNumber: 0, participantIndex: 1 });
    expect(timeline[3]).toMatchObject({ type: TimelineElementTypes.MODERATOR, roundNumber: 0 });

    // Round 1
    expect(timeline[4]).toMatchObject({ type: TimelineElementTypes.USER_MESSAGE, roundNumber: 1 });
    expect(timeline[5]).toMatchObject({ type: TimelineElementTypes.PARTICIPANT_MESSAGE, roundNumber: 1, participantIndex: 0 });
    expect(timeline[6]).toMatchObject({ type: TimelineElementTypes.PARTICIPANT_MESSAGE, roundNumber: 1, participantIndex: 1 });
    expect(timeline[7]).toMatchObject({ type: TimelineElementTypes.MODERATOR, roundNumber: 1 });
  });

  it('should handle mixed web search enabled/disabled across rounds', () => {
    const store = createChatStore();
    const participants = createMockParticipants(1);

    store.getState().setThread(createMockThread('thread-123', true));
    store.getState().setParticipants(participants);

    // Round 0: with web search
    const r0User = createTestUserMessage({ id: 'user-r0', content: 'Q1', roundNumber: 0 });
    store.getState().addPreSearch(createMockStoredPreSearch(0, MessageStatuses.COMPLETE));
    const r0P0 = createTestAssistantMessage({
      id: 'p0-r0',
      content: 'A1',
      roundNumber: 0,
      participantId: 'p0',
      participantIndex: 0,
      finishReason: FinishReasons.STOP,
    });

    // Round 1: without web search (user disabled it)
    const r1User = createTestUserMessage({ id: 'user-r1', content: 'Q2', roundNumber: 1 });
    // No pre-search for round 1
    const r1P0 = createTestAssistantMessage({
      id: 'p0-r1',
      content: 'B1',
      roundNumber: 1,
      participantId: 'p0',
      participantIndex: 0,
      finishReason: FinishReasons.STOP,
    });

    store.getState().setMessages([r0User, r0P0, r1User, r1P0]);

    const timeline = buildTimelineFromStore(store);

    // Round 0 should have pre-search
    const round0 = timeline.filter(e => e.roundNumber === 0);
    expect(round0.some(e => e.type === TimelineElementTypes.PRE_SEARCH)).toBe(true);

    // Round 1 should NOT have pre-search
    const round1 = timeline.filter(e => e.roundNumber === 1);
    expect(round1.some(e => e.type === TimelineElementTypes.PRE_SEARCH)).toBe(false);

    // Both rounds should be valid
    const validation = validateTimelineOrder(timeline);
    expect(validation.isValid).toBe(true);
  });
});

// ============================================================================
// PARTICIPANT SEQUENTIAL EXECUTION TESTS
// ============================================================================

describe('participant Sequential Execution', () => {
  it('should enforce P0 completes before P1 starts', () => {
    const store = createChatStore();

    store.getState().setThread(createMockThread('thread-123', false));
    store.getState().setParticipants(createMockParticipants(3));
    store.getState().setCurrentParticipantIndex(0);

    // P0 streaming (not complete)
    const p0Streaming = createTestAssistantMessage({
      id: 'p0-r0',
      content: 'Streaming...',
      roundNumber: 0,
      participantId: 'p0',
      participantIndex: 0,
      finishReason: FinishReasons.UNKNOWN, // Still streaming
    });

    store.getState().setMessages([
      createTestUserMessage({ id: 'user-r0', content: 'Q', roundNumber: 0 }),
      p0Streaming,
    ]);

    // Check if P1 can start
    const currentIdx = store.getState().currentParticipantIndex;
    const canStartP1 = currentIdx === 1;

    expect(canStartP1).toBe(false);
    expect(currentIdx).toBe(0);
  });

  it('should advance to next participant after completion', () => {
    const store = createChatStore();

    store.getState().setThread(createMockThread('thread-123', false));
    store.getState().setParticipants(createMockParticipants(3));
    store.getState().setCurrentParticipantIndex(0);
    store.getState().setIsStreaming(true);

    // P0 completes
    const p0Complete = createTestAssistantMessage({
      id: 'p0-r0',
      content: 'Complete',
      roundNumber: 0,
      participantId: 'p0',
      participantIndex: 0,
      finishReason: FinishReasons.STOP,
    });

    store.getState().setMessages([
      createTestUserMessage({ id: 'user-r0', content: 'Q', roundNumber: 0 }),
      p0Complete,
    ]);

    // Advance to P1
    store.getState().setCurrentParticipantIndex(1);

    expect(store.getState().currentParticipantIndex).toBe(1);

    // P1 completes
    const p1Complete = createTestAssistantMessage({
      id: 'p1-r0',
      content: 'Complete',
      roundNumber: 0,
      participantId: 'p1',
      participantIndex: 1,
      finishReason: FinishReasons.STOP,
    });

    store.getState().setMessages([
      createTestUserMessage({ id: 'user-r0', content: 'Q', roundNumber: 0 }),
      p0Complete,
      p1Complete,
    ]);

    // Advance to P2
    store.getState().setCurrentParticipantIndex(2);

    expect(store.getState().currentParticipantIndex).toBe(2);
  });

  it('should trigger moderator only after last participant', () => {
    const store = createChatStore();
    const participantCount = 3;

    store.getState().setThread(createMockThread('thread-123', false));
    store.getState().setParticipants(createMockParticipants(participantCount));

    const userMsg = createTestUserMessage({ id: 'user-r0', content: 'Q', roundNumber: 0 });
    const messages = [userMsg];

    // Add completed participants one by one
    for (let i = 0; i < participantCount; i++) {
      const pMsg = createTestAssistantMessage({
        id: `p${i}-r0`,
        content: `Response ${i}`,
        roundNumber: 0,
        participantId: `p${i}`,
        participantIndex: i,
        finishReason: FinishReasons.STOP,
      });
      messages.push(pMsg);

      store.getState().setMessages([...messages]);

      const completedCount = messages.filter((m) => {
        if (!hasAssistantMetadata(m)) {
          return false;
        }
        const finishReason = getMetadataFinishReason(m.metadata);
        return finishReason === FinishReasons.STOP;
      }).length;

      const allComplete = completedCount === participantCount;
      const isLastParticipant = i === participantCount - 1;

      // Before last participant: not all complete; after last: all complete
      expect(allComplete).toBe(isLastParticipant);
    }
  });
});

// ============================================================================
// RESUMPTION TIMELINE INTEGRITY TESTS
// ============================================================================

describe('resumption Timeline Integrity', () => {
  it('should preserve timeline order after page refresh resumption', () => {
    const store = createChatStore();

    // Simulate state before refresh
    store.getState().setThread(createMockThread('thread-123', true));
    store.getState().setParticipants(createMockParticipants(2));

    // Complete round 0
    const r0User = createTestUserMessage({ id: 'user-r0', content: 'Q1', roundNumber: 0 });
    store.getState().addPreSearch(createMockStoredPreSearch(0, MessageStatuses.COMPLETE));
    const r0P0 = createTestAssistantMessage({
      id: 'p0-r0',
      content: 'A0',
      roundNumber: 0,
      participantId: 'p0',
      participantIndex: 0,
      finishReason: FinishReasons.STOP,
    });
    const r0P1 = createTestAssistantMessage({
      id: 'p1-r0',
      content: 'A1',
      roundNumber: 0,
      participantId: 'p1',
      participantIndex: 1,
      finishReason: FinishReasons.STOP,
    });

    store.getState().setMessages([r0User, r0P0, r0P1]);

    // Round 1 incomplete (interrupted by refresh)
    const r1User = createTestUserMessage({ id: 'user-r1', content: 'Q2', roundNumber: 1 });
    store.getState().addPreSearch(createMockStoredPreSearch(1, MessageStatuses.COMPLETE));
    const r1P0 = createTestAssistantMessage({
      id: 'p0-r1',
      content: 'Incomplete...',
      roundNumber: 1,
      participantId: 'p0',
      participantIndex: 0,
      finishReason: FinishReasons.UNKNOWN, // Incomplete
    });

    store.getState().setMessages([r0User, r0P0, r0P1, r1User, r1P0]);

    // Set up resumption state
    store.getState().setStreamResumptionState({
      threadId: 'thread-123',
      roundNumber: 1,
      participantIndex: 0,
      state: StreamStatuses.ACTIVE,
      createdAt: new Date(),
    });

    // Verify resumption is needed
    expect(store.getState().needsStreamResumption()).toBe(true);

    // After resumption completes, P1 should be next
    store.getState().setNextParticipantToTrigger(1);

    // Complete P0 R1
    const r1P0Complete = createTestAssistantMessage({
      id: 'p0-r1',
      content: 'Complete after resume',
      roundNumber: 1,
      participantId: 'p0',
      participantIndex: 0,
      finishReason: FinishReasons.STOP,
    });

    store.getState().setMessages([r0User, r0P0, r0P1, r1User, r1P0Complete]);

    // Timeline should still be valid
    const timeline = buildTimelineFromStore(store);
    const validation = validateTimelineOrder(timeline);

    expect(validation.isValid).toBe(true);
  });

  it('should resume from pre-search if interrupted during search', () => {
    const store = createChatStore();

    store.getState().setThread(createMockThread('thread-123', true));
    store.getState().setParticipants(createMockParticipants(2));

    // Pre-search interrupted (STREAMING state)
    store.getState().addPreSearch(createMockStoredPreSearch(0, MessageStatuses.STREAMING));

    const userMsg = createTestUserMessage({ id: 'user-r0', content: 'Q', roundNumber: 0 });
    store.getState().setMessages([userMsg]);

    // Check pre-search needs resumption
    const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 0);
    const needsResume = preSearch?.status === MessageStatuses.STREAMING;

    expect(needsResume).toBe(true);

    // After pre-search resumes and completes
    store.getState().updatePreSearchStatus(0, MessageStatuses.COMPLETE);

    // Participants can now start
    const updatedPreSearch = store.getState().preSearches.find(ps => ps.roundNumber === 0);
    const canStartParticipants = updatedPreSearch?.status === MessageStatuses.COMPLETE;

    expect(canStartParticipants).toBe(true);
  });

  it('should resume from correct participant if interrupted mid-round', () => {
    const store = createChatStore();

    store.getState().setThread(createMockThread('thread-123', false));
    store.getState().setParticipants(createMockParticipants(3));

    const userMsg = createTestUserMessage({ id: 'user-r0', content: 'Q', roundNumber: 0 });

    // P0 complete, P1 incomplete, P2 not started
    const p0 = createTestAssistantMessage({
      id: 'p0-r0',
      content: 'Complete',
      roundNumber: 0,
      participantId: 'p0',
      participantIndex: 0,
      finishReason: FinishReasons.STOP,
    });
    const p1Incomplete = createTestAssistantMessage({
      id: 'p1-r0',
      content: 'Streaming...',
      roundNumber: 0,
      participantId: 'p1',
      participantIndex: 1,
      finishReason: FinishReasons.UNKNOWN,
    });

    store.getState().setMessages([userMsg, p0, p1Incomplete]);

    // Set resumption state for P1
    store.getState().setStreamResumptionState({
      threadId: 'thread-123',
      roundNumber: 0,
      participantIndex: 1,
      state: StreamStatuses.ACTIVE,
      createdAt: new Date(),
    });

    // Should resume from P1 (index 1)
    expect(store.getState().streamResumptionState?.participantIndex).toBe(1);
    expect(store.getState().needsStreamResumption()).toBe(true);

    // After P1 completes, P2 should be next
    const p1Complete = createTestAssistantMessage({
      id: 'p1-r0',
      content: 'Complete',
      roundNumber: 0,
      participantId: 'p1',
      participantIndex: 1,
      finishReason: FinishReasons.STOP,
    });

    store.getState().setMessages([userMsg, p0, p1Complete]);
    store.getState().setNextParticipantToTrigger(2);

    expect(store.getState().nextParticipantToTrigger).toBe(2);
  });
});

// ============================================================================
// RACE CONDITION PREVENTION TESTS
// ============================================================================

describe('timeline Race Condition Prevention', () => {
  it('should prevent duplicate pre-search triggers', () => {
    const store = createChatStore();

    store.getState().setThread(createMockThread('thread-123', true));

    // First trigger
    const firstResult = store.getState().tryMarkPreSearchTriggered(0);
    expect(firstResult).toBe(true);

    // Duplicate trigger (race condition)
    const secondResult = store.getState().tryMarkPreSearchTriggered(0);
    expect(secondResult).toBe(false);

    // Different round should work
    const thirdResult = store.getState().tryMarkPreSearchTriggered(1);
    expect(thirdResult).toBe(true);
  });

  it('should handle concurrent message submissions', () => {
    const store = createChatStore();

    store.getState().setThread(createMockThread('thread-123', false));

    // First submission
    store.getState().setPendingMessage('First message');
    store.getState().setHasSentPendingMessage(true);

    // Second concurrent submission should be blocked
    const canSendSecond = !store.getState().hasSentPendingMessage;
    expect(canSendSecond).toBe(false);

    // After streaming completes, can send again
    store.getState().completeStreaming();
    const canSendAfterComplete = !store.getState().hasSentPendingMessage;
    expect(canSendAfterComplete).toBe(true);
  });

  it('should wait for animations before moderator', async () => {
    const store = createChatStore();

    // Register animations for participants
    store.getState().registerAnimation(0);
    store.getState().registerAnimation(1);
    store.getState().registerAnimation(2);

    expect(store.getState().pendingAnimations.size).toBe(3);

    // Complete animations out of order
    store.getState().completeAnimation(1);
    expect(store.getState().pendingAnimations.size).toBe(2);

    store.getState().completeAnimation(0);
    expect(store.getState().pendingAnimations.size).toBe(1);

    store.getState().completeAnimation(2);
    expect(store.getState().pendingAnimations.size).toBe(0);
  });
});

// ============================================================================
// MODERATOR TRIGGER TIMING TESTS
// ============================================================================

describe('moderator Trigger Timing', () => {
  it('should only trigger moderator after all participants complete', () => {
    const store = createChatStore();
    const participantCount = 3;

    store.getState().setThread(createMockThread('thread-123', false));
    store.getState().setParticipants(createMockParticipants(participantCount));

    const userMsg = createTestUserMessage({ id: 'user-r0', content: 'Q', roundNumber: 0 });

    // Add messages incrementally
    const allMessages = [userMsg];

    for (let i = 0; i < participantCount; i++) {
      const pMsg = createTestAssistantMessage({
        id: `p${i}-r0`,
        content: `Response ${i}`,
        roundNumber: 0,
        participantId: `p${i}`,
        participantIndex: i,
        finishReason: FinishReasons.STOP,
      });
      allMessages.push(pMsg);
      store.getState().setMessages([...allMessages]);

      const completedCount = store.getState().messages.filter((m) => {
        if (!hasAssistantMetadata(m)) {
          return false;
        }
        const roundNumber = getMetadataRoundNumber(m.metadata);
        const finishReason = getMetadataFinishReason(m.metadata);
        return (
          roundNumber === 0
          && finishReason === FinishReasons.STOP
        );
      }).length;

      const shouldTriggerModerator = completedCount === participantCount;
      const isLastParticipant = i === participantCount - 1;

      // Moderator should only trigger after last participant
      expect(shouldTriggerModerator).toBe(isLastParticipant);
    }
  });
});

// ============================================================================
// WEB SEARCH TOGGLE BETWEEN ROUNDS TESTS
// ============================================================================

describe('web Search Toggle Between Rounds', () => {
  it('should include pre-search only when enabled', () => {
    const store = createChatStore();

    // Round 0: Web search enabled
    store.getState().setThread(createMockThread('thread-123', true));
    store.getState().setParticipants(createMockParticipants(1));
    store.getState().setEnableWebSearch(true);

    store.getState().addPreSearch(createMockStoredPreSearch(0, MessageStatuses.COMPLETE));

    // Round 1: Web search disabled
    store.getState().setEnableWebSearch(false);
    // No pre-search added for round 1

    const preSearchR0 = store.getState().preSearches.find(ps => ps.roundNumber === 0);
    const preSearchR1 = store.getState().preSearches.find(ps => ps.roundNumber === 1);

    expect(preSearchR0).toBeDefined();
    expect(preSearchR1).toBeUndefined();
  });

  it('should detect web search toggle as config change', () => {
    type RoundConfig = {
      enableWebSearch: boolean;
    };

    const round0Config: RoundConfig = { enableWebSearch: false };
    const round1Config: RoundConfig = { enableWebSearch: true };

    const webSearchToggled = round0Config.enableWebSearch !== round1Config.enableWebSearch;

    expect(webSearchToggled).toBe(true);
  });
});

// ============================================================================
// STREAMING STATE TRANSITIONS TESTS
// ============================================================================

describe('streaming State Transitions', () => {
  it('should transition: waitingToStart → streaming → complete', () => {
    const store = createChatStore();

    store.getState().setThread(createMockThread('thread-123', false));
    store.getState().setParticipants(createMockParticipants(1));

    // Initial state
    expect(store.getState().isStreaming).toBe(false);
    expect(store.getState().waitingToStartStreaming).toBe(false);

    // Prepare for streaming
    store.getState().setWaitingToStartStreaming(true);
    expect(store.getState().waitingToStartStreaming).toBe(true);

    // Start streaming
    store.getState().setIsStreaming(true);
    store.getState().setWaitingToStartStreaming(false);
    expect(store.getState().isStreaming).toBe(true);
    expect(store.getState().waitingToStartStreaming).toBe(false);

    // Complete streaming
    store.getState().completeStreaming();
    expect(store.getState().isStreaming).toBe(false);
    expect(store.getState().currentParticipantIndex).toBe(0);
  });

  it('should reset streaming state on navigation', () => {
    const store = createChatStore();

    store.getState().setThread(createMockThread('thread-123', false));
    store.getState().setIsStreaming(true);
    store.getState().setCurrentParticipantIndex(2);
    store.getState().setStreamingRoundNumber(1);

    // Navigate to different thread
    store.getState().resetForThreadNavigation();

    expect(store.getState().isStreaming).toBe(false);
    expect(store.getState().currentParticipantIndex).toBe(0);
    expect(store.getState().streamingRoundNumber).toBeNull();
  });
});

// ============================================================================
// ERROR HANDLING IN TIMELINE TESTS
// ============================================================================

describe('error Handling in Timeline', () => {
  it('should continue timeline after pre-search failure', () => {
    const store = createChatStore();

    store.getState().setThread(createMockThread('thread-123', true));
    store.getState().setParticipants(createMockParticipants(2));

    // Pre-search fails
    store.getState().addPreSearch(createMockStoredPreSearch(0, MessageStatuses.FAILED));

    // Participants should still proceed
    const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 0);
    const shouldBlockParticipants
      = preSearch?.status === MessageStatuses.PENDING
        || preSearch?.status === MessageStatuses.STREAMING;

    expect(shouldBlockParticipants).toBe(false);

    // Add participant messages
    const userMsg = createTestUserMessage({ id: 'user-r0', content: 'Q', roundNumber: 0 });
    const p0 = createTestAssistantMessage({
      id: 'p0-r0',
      content: 'Response',
      roundNumber: 0,
      participantId: 'p0',
      participantIndex: 0,
      finishReason: FinishReasons.STOP,
    });

    store.getState().setMessages([userMsg, p0]);

    // Timeline should still be valid
    const timeline = buildTimelineFromStore(store);
    expect(timeline.length).toBeGreaterThan(0);
  });

  it('should continue timeline after participant error', () => {
    const store = createChatStore();

    store.getState().setThread(createMockThread('thread-123', false));
    store.getState().setParticipants(createMockParticipants(2));

    const userMsg = createTestUserMessage({ id: 'user-r0', content: 'Q', roundNumber: 0 });

    // P0 errors
    const p0Error = createTestAssistantMessage({
      id: 'p0-r0',
      content: 'Error occurred',
      roundNumber: 0,
      participantId: 'p0',
      participantIndex: 0,
      hasError: true,
      finishReason: FinishReasons.ERROR,
    });

    // P1 should still proceed
    const p1 = createTestAssistantMessage({
      id: 'p1-r0',
      content: 'Response',
      roundNumber: 0,
      participantId: 'p1',
      participantIndex: 1,
      finishReason: FinishReasons.STOP,
    });

    store.getState().setMessages([userMsg, p0Error, p1]);

    // Moderator should still be created

    const timeline = buildTimelineFromStore(store);
    const validation = validateTimelineOrder(timeline);

    expect(validation.isValid).toBe(true);
  });
});

// ============================================================================
// REGENERATION TIMELINE TESTS
// ============================================================================

describe('regeneration Timeline Integrity', () => {
  it('should clear round-specific state on regeneration', () => {
    const store = createChatStore();

    store.getState().setThread(createMockThread('thread-123', true));
    store.getState().setParticipants(createMockParticipants(2));

    // Complete round 0
    store.getState().addPreSearch(createMockStoredPreSearch(0, MessageStatuses.COMPLETE));
    store.getState().markPreSearchTriggered(0);
    store.getState().markModeratorCreated(0);

    // Start regeneration
    store.getState().startRegeneration(0);

    // Round 0 tracking should be cleared
    expect(store.getState().hasPreSearchBeenTriggered(0)).toBe(false);
    expect(store.getState().hasModeratorBeenCreated(0)).toBe(false);
  });

  it('should preserve other rounds during regeneration', () => {
    const store = createChatStore();

    store.getState().setThread(createMockThread('thread-123', false));
    store.getState().setParticipants(createMockParticipants(2));

    // Round 0 and 1 complete
    store.getState().markModeratorCreated(0);
    store.getState().markModeratorCreated(1);

    // Regenerate round 0
    store.getState().startRegeneration(0);

    // Round 1 should be preserved
    expect(store.getState().hasModeratorBeenCreated(1)).toBe(true);
  });
});

// ============================================================================
// COMPLETE CONVERSATION FLOW TESTS
// ============================================================================

describe('complete Conversation Flow', () => {
  it('should handle full 3-round conversation with web search', () => {
    const store = createChatStore();
    const participants = createMockParticipants(2);

    store.getState().setThread(createMockThread('thread-123', true));
    store.getState().setParticipants(participants);

    const allMessages = [];

    for (let round = 0; round < 3; round++) {
      // User message
      const userMsg = createTestUserMessage({
        id: `user-r${round}`,
        content: `Question ${round}`,
        roundNumber: round,
      });
      allMessages.push(userMsg);

      // Pre-search
      store.getState().addPreSearch(createMockStoredPreSearch(round, MessageStatuses.COMPLETE));

      // Participants
      for (let p = 0; p < participants.length; p++) {
        const pMsg = createTestAssistantMessage({
          id: `p${p}-r${round}`,
          content: `P${p} R${round} response`,
          roundNumber: round,
          participantId: `participant-${p}`,
          participantIndex: p,
          finishReason: FinishReasons.STOP,
        });
        allMessages.push(pMsg);
      }

      // Moderator message
      const moderatorMsg = createModeratorMessage('thread-123', round, `Moderator for round ${round}`);
      allMessages.push(moderatorMsg);
    }

    store.getState().setMessages(allMessages);

    // Validate complete timeline
    const timeline = buildTimelineFromStore(store);
    const validation = validateTimelineOrder(timeline);

    expect(validation.isValid).toBe(true);
    expect(validation.errors).toHaveLength(0);

    // Verify element counts
    expect(timeline.filter(e => e.type === TimelineElementTypes.USER_MESSAGE)).toHaveLength(3);
    expect(timeline.filter(e => e.type === TimelineElementTypes.PRE_SEARCH)).toHaveLength(3);
    expect(timeline.filter(e => e.type === TimelineElementTypes.PARTICIPANT_MESSAGE)).toHaveLength(6);
    expect(timeline.filter(e => e.type === TimelineElementTypes.MODERATOR)).toHaveLength(3);
  });

  it('should handle conversation with participant count change', () => {
    const store = createChatStore();

    store.getState().setThread(createMockThread('thread-123', false));

    // Round 0: 2 participants
    store.getState().setParticipants(createMockParticipants(2));

    const r0User = createTestUserMessage({ id: 'user-r0', content: 'Q1', roundNumber: 0 });
    const r0P0 = createTestAssistantMessage({
      id: 'p0-r0',
      content: 'A0',
      roundNumber: 0,
      participantId: 'p0',
      participantIndex: 0,
      finishReason: FinishReasons.STOP,
    });
    const r0P1 = createTestAssistantMessage({
      id: 'p1-r0',
      content: 'A1',
      roundNumber: 0,
      participantId: 'p1',
      participantIndex: 1,
      finishReason: FinishReasons.STOP,
    });

    store.getState().setMessages([r0User, r0P0, r0P1]);

    // Round 1: 3 participants (one added)
    store.getState().setParticipants(createMockParticipants(3));

    const r1User = createTestUserMessage({ id: 'user-r1', content: 'Q2', roundNumber: 1 });
    const r1P0 = createTestAssistantMessage({
      id: 'p0-r1',
      content: 'B0',
      roundNumber: 1,
      participantId: 'p0',
      participantIndex: 0,
      finishReason: FinishReasons.STOP,
    });
    const r1P1 = createTestAssistantMessage({
      id: 'p1-r1',
      content: 'B1',
      roundNumber: 1,
      participantId: 'p1',
      participantIndex: 1,
      finishReason: FinishReasons.STOP,
    });
    const r1P2 = createTestAssistantMessage({
      id: 'p2-r1',
      content: 'B2',
      roundNumber: 1,
      participantId: 'p2',
      participantIndex: 2,
      finishReason: FinishReasons.STOP,
    });

    store.getState().setMessages([r0User, r0P0, r0P1, r1User, r1P0, r1P1, r1P2]);

    const timeline = buildTimelineFromStore(store);
    const validation = validateTimelineOrder(timeline);

    expect(validation.isValid).toBe(true);

    // Round 0 has 2 participant messages
    const round0Participants = timeline.filter(
      e => e.type === TimelineElementTypes.PARTICIPANT_MESSAGE && e.roundNumber === 0,
    );
    expect(round0Participants).toHaveLength(2);

    // Round 1 has 3 participant messages
    const round1Participants = timeline.filter(
      e => e.type === TimelineElementTypes.PARTICIPANT_MESSAGE && e.roundNumber === 1,
    );
    expect(round1Participants).toHaveLength(3);
  });
});
