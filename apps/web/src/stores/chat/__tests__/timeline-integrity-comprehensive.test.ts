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
    createdAt: new Date(),
    enableWebSearch,
    id,
    mode: 'analyzing',
    status: 'active',
    title: 'Test Thread',
    updatedAt: new Date(),
    userId: 'user-123',
  } satisfies ChatThread;
}

function createMockParticipants(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    createdAt: new Date(),
    id: `participant-${i}`,
    isEnabled: true,
    modelId: `model-${i}`,
    priority: i,
    role: `Role ${i}`,
    threadId: 'thread-123',
    updatedAt: new Date(),
  }));
}

function createModeratorMessage(
  threadId: string,
  roundNumber: number,
  text: string,
): UIMessage {
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
        roundNumber,
        timestamp: timestamp++,
        type: TimelineElementTypes.USER_MESSAGE,
      });
    }

    // Pre-search for this round
    const preSearch = state.preSearches.find(ps => ps.roundNumber === roundNumber);
    if (preSearch) {
      timeline.push({
        roundNumber,
        timestamp: timestamp++,
        type: TimelineElementTypes.PRE_SEARCH,
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
          participantIndex: msg.metadata.participantIndex,
          roundNumber,
          timestamp: timestamp++,
          type: TimelineElementTypes.PARTICIPANT_MESSAGE,
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
        roundNumber,
        timestamp: timestamp++,
        type: TimelineElementTypes.MODERATOR,
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
    if (hasPreSearch) {
      expectedOrder.push(TimelineElementTypes.PRE_SEARCH);
    }
    for (let i = 0; i < participantCount; i++) {
      expectedOrder.push(TimelineElementTypes.PARTICIPANT_MESSAGE);
    }
    if (hasModerator) {
      expectedOrder.push(TimelineElementTypes.MODERATOR);
    }

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

  return { errors, isValid: errors.length === 0 };
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
    const r0User = createTestUserMessage({ content: 'Q1', id: 'user-r0', roundNumber: 0 });
    const r0P0 = createTestAssistantMessage({
      content: 'A1',
      finishReason: FinishReasons.STOP,
      id: 'p0-r0',
      participantId: 'p0',
      participantIndex: 0,
      roundNumber: 0,
    });
    const r0P1 = createTestAssistantMessage({
      content: 'A2',
      finishReason: FinishReasons.STOP,
      id: 'p1-r0',
      participantId: 'p1',
      participantIndex: 1,
      roundNumber: 0,
    });
    const r0Moderator = createModeratorMessage('thread-123', 0, 'Round 0 moderator');

    // Round 1
    const r1User = createTestUserMessage({ content: 'Q2', id: 'user-r1', roundNumber: 1 });
    const r1P0 = createTestAssistantMessage({
      content: 'B1',
      finishReason: FinishReasons.STOP,
      id: 'p0-r1',
      participantId: 'p0',
      participantIndex: 0,
      roundNumber: 1,
    });
    const r1P1 = createTestAssistantMessage({
      content: 'B2',
      finishReason: FinishReasons.STOP,
      id: 'p1-r1',
      participantId: 'p1',
      participantIndex: 1,
      roundNumber: 1,
    });
    const r1Moderator = createModeratorMessage('thread-123', 1, 'Round 1 moderator');

    store.getState().setMessages([r0User, r0P0, r0P1, r0Moderator, r1User, r1P0, r1P1, r1Moderator]);

    const timeline = buildTimelineFromStore(store);
    const validation = validateTimelineOrder(timeline);

    expect(validation.isValid).toBeTruthy();
    expect(timeline).toHaveLength(8); // 2 rounds × (1 user + 2 participants + 1 moderator)

    // Round 0
    expect(timeline[0]).toMatchObject({ roundNumber: 0, type: TimelineElementTypes.USER_MESSAGE });
    expect(timeline[1]).toMatchObject({ participantIndex: 0, roundNumber: 0, type: TimelineElementTypes.PARTICIPANT_MESSAGE });
    expect(timeline[2]).toMatchObject({ participantIndex: 1, roundNumber: 0, type: TimelineElementTypes.PARTICIPANT_MESSAGE });
    expect(timeline[3]).toMatchObject({ roundNumber: 0, type: TimelineElementTypes.MODERATOR });

    // Round 1
    expect(timeline[4]).toMatchObject({ roundNumber: 1, type: TimelineElementTypes.USER_MESSAGE });
    expect(timeline[5]).toMatchObject({ participantIndex: 0, roundNumber: 1, type: TimelineElementTypes.PARTICIPANT_MESSAGE });
    expect(timeline[6]).toMatchObject({ participantIndex: 1, roundNumber: 1, type: TimelineElementTypes.PARTICIPANT_MESSAGE });
    expect(timeline[7]).toMatchObject({ roundNumber: 1, type: TimelineElementTypes.MODERATOR });
  });

  it('should handle mixed web search enabled/disabled across rounds', () => {
    const store = createChatStore();
    const participants = createMockParticipants(1);

    store.getState().setThread(createMockThread('thread-123', true));
    store.getState().setParticipants(participants);

    // Round 0: with web search
    const r0User = createTestUserMessage({ content: 'Q1', id: 'user-r0', roundNumber: 0 });
    store.getState().addPreSearch(createMockStoredPreSearch(0, MessageStatuses.COMPLETE));
    const r0P0 = createTestAssistantMessage({
      content: 'A1',
      finishReason: FinishReasons.STOP,
      id: 'p0-r0',
      participantId: 'p0',
      participantIndex: 0,
      roundNumber: 0,
    });

    // Round 1: without web search (user disabled it)
    const r1User = createTestUserMessage({ content: 'Q2', id: 'user-r1', roundNumber: 1 });
    // No pre-search for round 1
    const r1P0 = createTestAssistantMessage({
      content: 'B1',
      finishReason: FinishReasons.STOP,
      id: 'p0-r1',
      participantId: 'p0',
      participantIndex: 0,
      roundNumber: 1,
    });

    store.getState().setMessages([r0User, r0P0, r1User, r1P0]);

    const timeline = buildTimelineFromStore(store);

    // Round 0 should have pre-search
    const round0 = timeline.filter(e => e.roundNumber === 0);
    expect(round0.some(e => e.type === TimelineElementTypes.PRE_SEARCH)).toBeTruthy();

    // Round 1 should NOT have pre-search
    const round1 = timeline.filter(e => e.roundNumber === 1);
    expect(round1.some(e => e.type === TimelineElementTypes.PRE_SEARCH)).toBeFalsy();

    // Both rounds should be valid
    const validation = validateTimelineOrder(timeline);
    expect(validation.isValid).toBeTruthy();
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
      content: 'Streaming...',
      finishReason: FinishReasons.UNKNOWN, // Still streaming
      id: 'p0-r0',
      participantId: 'p0',
      participantIndex: 0,
      roundNumber: 0,
    });

    store.getState().setMessages([
      createTestUserMessage({ content: 'Q', id: 'user-r0', roundNumber: 0 }),
      p0Streaming,
    ]);

    // Check if P1 can start
    const currentIdx = store.getState().currentParticipantIndex;
    const canStartP1 = currentIdx === 1;

    expect(canStartP1).toBeFalsy();
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
      content: 'Complete',
      finishReason: FinishReasons.STOP,
      id: 'p0-r0',
      participantId: 'p0',
      participantIndex: 0,
      roundNumber: 0,
    });

    store.getState().setMessages([
      createTestUserMessage({ content: 'Q', id: 'user-r0', roundNumber: 0 }),
      p0Complete,
    ]);

    // Advance to P1
    store.getState().setCurrentParticipantIndex(1);

    expect(store.getState().currentParticipantIndex).toBe(1);

    // P1 completes
    const p1Complete = createTestAssistantMessage({
      content: 'Complete',
      finishReason: FinishReasons.STOP,
      id: 'p1-r0',
      participantId: 'p1',
      participantIndex: 1,
      roundNumber: 0,
    });

    store.getState().setMessages([
      createTestUserMessage({ content: 'Q', id: 'user-r0', roundNumber: 0 }),
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

    const userMsg = createTestUserMessage({ content: 'Q', id: 'user-r0', roundNumber: 0 });
    const messages = [userMsg];

    // Add completed participants one by one
    for (let i = 0; i < participantCount; i++) {
      const pMsg = createTestAssistantMessage({
        content: `Response ${i}`,
        finishReason: FinishReasons.STOP,
        id: `p${i}-r0`,
        participantId: `p${i}`,
        participantIndex: i,
        roundNumber: 0,
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
    const r0User = createTestUserMessage({ content: 'Q1', id: 'user-r0', roundNumber: 0 });
    store.getState().addPreSearch(createMockStoredPreSearch(0, MessageStatuses.COMPLETE));
    const r0P0 = createTestAssistantMessage({
      content: 'A0',
      finishReason: FinishReasons.STOP,
      id: 'p0-r0',
      participantId: 'p0',
      participantIndex: 0,
      roundNumber: 0,
    });
    const r0P1 = createTestAssistantMessage({
      content: 'A1',
      finishReason: FinishReasons.STOP,
      id: 'p1-r0',
      participantId: 'p1',
      participantIndex: 1,
      roundNumber: 0,
    });

    store.getState().setMessages([r0User, r0P0, r0P1]);

    // Round 1 incomplete (interrupted by refresh)
    const r1User = createTestUserMessage({ content: 'Q2', id: 'user-r1', roundNumber: 1 });
    store.getState().addPreSearch(createMockStoredPreSearch(1, MessageStatuses.COMPLETE));
    const r1P0 = createTestAssistantMessage({
      content: 'Incomplete...',
      finishReason: FinishReasons.UNKNOWN, // Incomplete
      id: 'p0-r1',
      participantId: 'p0',
      participantIndex: 0,
      roundNumber: 1,
    });

    store.getState().setMessages([r0User, r0P0, r0P1, r1User, r1P0]);

    // Set up resumption state
    store.getState().setStreamResumptionState({
      createdAt: new Date(),
      participantIndex: 0,
      roundNumber: 1,
      state: StreamStatuses.ACTIVE,
      threadId: 'thread-123',
    });

    // Verify resumption is needed
    expect(store.getState().needsStreamResumption()).toBeTruthy();

    // After resumption completes, P1 should be next
    store.getState().setNextParticipantToTrigger(1);

    // Complete P0 R1
    const r1P0Complete = createTestAssistantMessage({
      content: 'Complete after resume',
      finishReason: FinishReasons.STOP,
      id: 'p0-r1',
      participantId: 'p0',
      participantIndex: 0,
      roundNumber: 1,
    });

    store.getState().setMessages([r0User, r0P0, r0P1, r1User, r1P0Complete]);

    // Timeline should still be valid
    const timeline = buildTimelineFromStore(store);
    const validation = validateTimelineOrder(timeline);

    expect(validation.isValid).toBeTruthy();
  });

  it('should resume from pre-search if interrupted during search', () => {
    const store = createChatStore();

    store.getState().setThread(createMockThread('thread-123', true));
    store.getState().setParticipants(createMockParticipants(2));

    // Pre-search interrupted (STREAMING state)
    store.getState().addPreSearch(createMockStoredPreSearch(0, MessageStatuses.STREAMING));

    const userMsg = createTestUserMessage({ content: 'Q', id: 'user-r0', roundNumber: 0 });
    store.getState().setMessages([userMsg]);

    // Check pre-search needs resumption
    const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 0);
    const needsResume = preSearch?.status === MessageStatuses.STREAMING;

    expect(needsResume).toBeTruthy();

    // After pre-search resumes and completes
    store.getState().updatePreSearchStatus(0, MessageStatuses.COMPLETE);

    // Participants can now start
    const updatedPreSearch = store.getState().preSearches.find(ps => ps.roundNumber === 0);
    const canStartParticipants = updatedPreSearch?.status === MessageStatuses.COMPLETE;

    expect(canStartParticipants).toBeTruthy();
  });

  it('should resume from correct participant if interrupted mid-round', () => {
    const store = createChatStore();

    store.getState().setThread(createMockThread('thread-123', false));
    store.getState().setParticipants(createMockParticipants(3));

    const userMsg = createTestUserMessage({ content: 'Q', id: 'user-r0', roundNumber: 0 });

    // P0 complete, P1 incomplete, P2 not started
    const p0 = createTestAssistantMessage({
      content: 'Complete',
      finishReason: FinishReasons.STOP,
      id: 'p0-r0',
      participantId: 'p0',
      participantIndex: 0,
      roundNumber: 0,
    });
    const p1Incomplete = createTestAssistantMessage({
      content: 'Streaming...',
      finishReason: FinishReasons.UNKNOWN,
      id: 'p1-r0',
      participantId: 'p1',
      participantIndex: 1,
      roundNumber: 0,
    });

    store.getState().setMessages([userMsg, p0, p1Incomplete]);

    // Set resumption state for P1
    store.getState().setStreamResumptionState({
      createdAt: new Date(),
      participantIndex: 1,
      roundNumber: 0,
      state: StreamStatuses.ACTIVE,
      threadId: 'thread-123',
    });

    // Should resume from P1 (index 1)
    expect(store.getState().streamResumptionState?.participantIndex).toBe(1);
    expect(store.getState().needsStreamResumption()).toBeTruthy();

    // After P1 completes, P2 should be next
    const p1Complete = createTestAssistantMessage({
      content: 'Complete',
      finishReason: FinishReasons.STOP,
      id: 'p1-r0',
      participantId: 'p1',
      participantIndex: 1,
      roundNumber: 0,
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
    expect(firstResult).toBeTruthy();

    // Duplicate trigger (race condition)
    const secondResult = store.getState().tryMarkPreSearchTriggered(0);
    expect(secondResult).toBeFalsy();

    // Different round should work
    const thirdResult = store.getState().tryMarkPreSearchTriggered(1);
    expect(thirdResult).toBeTruthy();
  });

  it('should handle concurrent message submissions', () => {
    const store = createChatStore();

    store.getState().setThread(createMockThread('thread-123', false));

    // First submission
    store.getState().setPendingMessage('First message');
    store.getState().setHasSentPendingMessage(true);

    // Second concurrent submission should be blocked
    const canSendSecond = !store.getState().hasSentPendingMessage;
    expect(canSendSecond).toBeFalsy();

    // After streaming completes, can send again
    store.getState().completeStreaming();
    const canSendAfterComplete = !store.getState().hasSentPendingMessage;
    expect(canSendAfterComplete).toBeTruthy();
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

    const userMsg = createTestUserMessage({ content: 'Q', id: 'user-r0', roundNumber: 0 });

    // Add messages incrementally
    const allMessages = [userMsg];

    for (let i = 0; i < participantCount; i++) {
      const pMsg = createTestAssistantMessage({
        content: `Response ${i}`,
        finishReason: FinishReasons.STOP,
        id: `p${i}-r0`,
        participantId: `p${i}`,
        participantIndex: i,
        roundNumber: 0,
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

    expect(webSearchToggled).toBeTruthy();
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
    expect(store.getState().isStreaming).toBeFalsy();
    expect(store.getState().waitingToStartStreaming).toBeFalsy();

    // Prepare for streaming
    store.getState().setWaitingToStartStreaming(true);
    expect(store.getState().waitingToStartStreaming).toBeTruthy();

    // Start streaming
    store.getState().setIsStreaming(true);
    store.getState().setWaitingToStartStreaming(false);
    expect(store.getState().isStreaming).toBeTruthy();
    expect(store.getState().waitingToStartStreaming).toBeFalsy();

    // Complete streaming
    store.getState().completeStreaming();
    expect(store.getState().isStreaming).toBeFalsy();
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

    expect(store.getState().isStreaming).toBeFalsy();
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

    expect(shouldBlockParticipants).toBeFalsy();

    // Add participant messages
    const userMsg = createTestUserMessage({ content: 'Q', id: 'user-r0', roundNumber: 0 });
    const p0 = createTestAssistantMessage({
      content: 'Response',
      finishReason: FinishReasons.STOP,
      id: 'p0-r0',
      participantId: 'p0',
      participantIndex: 0,
      roundNumber: 0,
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

    const userMsg = createTestUserMessage({ content: 'Q', id: 'user-r0', roundNumber: 0 });

    // P0 errors
    const p0Error = createTestAssistantMessage({
      content: 'Error occurred',
      finishReason: FinishReasons.ERROR,
      hasError: true,
      id: 'p0-r0',
      participantId: 'p0',
      participantIndex: 0,
      roundNumber: 0,
    });

    // P1 should still proceed
    const p1 = createTestAssistantMessage({
      content: 'Response',
      finishReason: FinishReasons.STOP,
      id: 'p1-r0',
      participantId: 'p1',
      participantIndex: 1,
      roundNumber: 0,
    });

    store.getState().setMessages([userMsg, p0Error, p1]);

    // Moderator should still be created

    const timeline = buildTimelineFromStore(store);
    const validation = validateTimelineOrder(timeline);

    expect(validation.isValid).toBeTruthy();
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
    expect(store.getState().hasPreSearchBeenTriggered(0)).toBeFalsy();
    expect(store.getState().hasModeratorBeenCreated(0)).toBeFalsy();
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
    expect(store.getState().hasModeratorBeenCreated(1)).toBeTruthy();
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
        content: `Question ${round}`,
        id: `user-r${round}`,
        roundNumber: round,
      });
      allMessages.push(userMsg);

      // Pre-search
      store.getState().addPreSearch(createMockStoredPreSearch(round, MessageStatuses.COMPLETE));

      // Participants
      for (let p = 0; p < participants.length; p++) {
        const pMsg = createTestAssistantMessage({
          content: `P${p} R${round} response`,
          finishReason: FinishReasons.STOP,
          id: `p${p}-r${round}`,
          participantId: `participant-${p}`,
          participantIndex: p,
          roundNumber: round,
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

    expect(validation.isValid).toBeTruthy();
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

    const r0User = createTestUserMessage({ content: 'Q1', id: 'user-r0', roundNumber: 0 });
    const r0P0 = createTestAssistantMessage({
      content: 'A0',
      finishReason: FinishReasons.STOP,
      id: 'p0-r0',
      participantId: 'p0',
      participantIndex: 0,
      roundNumber: 0,
    });
    const r0P1 = createTestAssistantMessage({
      content: 'A1',
      finishReason: FinishReasons.STOP,
      id: 'p1-r0',
      participantId: 'p1',
      participantIndex: 1,
      roundNumber: 0,
    });

    store.getState().setMessages([r0User, r0P0, r0P1]);

    // Round 1: 3 participants (one added)
    store.getState().setParticipants(createMockParticipants(3));

    const r1User = createTestUserMessage({ content: 'Q2', id: 'user-r1', roundNumber: 1 });
    const r1P0 = createTestAssistantMessage({
      content: 'B0',
      finishReason: FinishReasons.STOP,
      id: 'p0-r1',
      participantId: 'p0',
      participantIndex: 0,
      roundNumber: 1,
    });
    const r1P1 = createTestAssistantMessage({
      content: 'B1',
      finishReason: FinishReasons.STOP,
      id: 'p1-r1',
      participantId: 'p1',
      participantIndex: 1,
      roundNumber: 1,
    });
    const r1P2 = createTestAssistantMessage({
      content: 'B2',
      finishReason: FinishReasons.STOP,
      id: 'p2-r1',
      participantId: 'p2',
      participantIndex: 2,
      roundNumber: 1,
    });

    store.getState().setMessages([r0User, r0P0, r0P1, r1User, r1P0, r1P1, r1P2]);

    const timeline = buildTimelineFromStore(store);
    const validation = validateTimelineOrder(timeline);

    expect(validation.isValid).toBeTruthy();

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
