/**
 * Full Flow Resumption Matrix Tests
 *
 * Comprehensive tests for stream resumption at every stage of a multi-round
 * conversation with 4 participants in undebating mode with web search enabled.
 *
 * Test Matrix:
 * - Pre-search phase: before, during, after
 * - Participant phase: before/during/after each of 4 participants
 * - Moderator phase: before, during, after
 * - Multi-round: resumption in round 2+ at various stages
 *
 * Each test validates:
 * 1. Correct detection of incomplete round
 * 2. Correct participant index to resume from
 * 3. No message leakage between participants
 * 4. Proper phase transitions
 * 5. No duplicate triggers
 */

import { FinishReasons, MessageStatuses, RoundPhases, TextPartStates, UIMessageRoles } from '@roundtable/shared';
import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';

import {
  createMockParticipants,
  createMockStoredPreSearch,
  createMockThread,
  createTestAssistantMessage,
  createTestModeratorMessage,
  createTestUserMessage,
  getMetadataFinishReason,
} from '@/lib/testing';
import type { ChatParticipant, ChatThread, StoredPreSearch } from '@/services/api';
import {
  getModeratorMessageForRound,
  getParticipantCompletionStatus,
} from '@/stores/chat';

// ============================================================================
// TEST CONFIGURATION
// ============================================================================

const THREAD_ID = 'thread-full-flow-test';
const PARTICIPANT_COUNT = 4;

// ============================================================================
// ENHANCED TEST HELPERS
// ============================================================================

/**
 * Creates a complete test thread with web search enabled
 */
function createTestThread(overrides?: Partial<ChatThread>): ChatThread {
  return createMockThread({
    enableWebSearch: true,
    id: THREAD_ID,
    mode: 'undebating',
    ...overrides,
  });
}

/**
 * Creates 4 test participants
 */
function createTestParticipants(): ChatParticipant[] {
  return createMockParticipants(PARTICIPANT_COUNT, THREAD_ID);
}

/**
 * Creates a streaming (incomplete) assistant message
 */
function createStreamingMessage(
  roundNumber: number,
  participantIndex: number,
  hasPartialContent = true,
): UIMessage {
  return {
    id: `${THREAD_ID}_r${roundNumber}_p${participantIndex}`,
    metadata: {
      // null finishReason = stream not finished (UNKNOWN is truthy and would mark complete)
      finishReason: null,
      hasError: false,
      isPartialResponse: true,
      isTransient: false,
      model: 'gpt-4o',
      participantId: `participant-${participantIndex}`,
      participantIndex,
      participantRole: null,
      role: UIMessageRoles.ASSISTANT,
      roundNumber,
      usage: { completionTokens: 0, promptTokens: 0, totalTokens: 0 },
    },
    parts: hasPartialContent
      ? [{ state: TextPartStates.STREAMING, text: 'Partial response...', type: 'text' as const }]
      : [],
    role: UIMessageRoles.ASSISTANT,
  };
}

/**
 * Creates a complete assistant message with proper finish reason
 */
function createCompleteMessage(
  roundNumber: number,
  participantIndex: number,
): UIMessage {
  return createTestAssistantMessage({
    content: `Complete response from participant ${participantIndex}`,
    finishReason: FinishReasons.STOP,
    id: `${THREAD_ID}_r${roundNumber}_p${participantIndex}`,
    participantId: `participant-${participantIndex}`,
    participantIndex,
    roundNumber,
  });
}

/**
 * Creates a user message for a round
 */
function createUserMessage(roundNumber: number): UIMessage {
  return createTestUserMessage({
    content: `User message for round ${roundNumber}`,
    id: `${THREAD_ID}_r${roundNumber}_user`,
    roundNumber,
  });
}

/**
 * Creates a complete moderator message
 */
function createModeratorMessage(roundNumber: number, isComplete = true): UIMessage {
  return createTestModeratorMessage({
    content: `Moderator summary for round ${roundNumber}`,
    finishReason: isComplete ? FinishReasons.STOP : FinishReasons.UNKNOWN,
    id: `${THREAD_ID}_r${roundNumber}_moderator`,
    roundNumber,
  });
}

/**
 * Creates pre-search for a round
 */
function createPreSearch(
  roundNumber: number,
  status: typeof MessageStatuses[keyof typeof MessageStatuses],
): StoredPreSearch {
  return createMockStoredPreSearch(roundNumber, status, {
    id: `${THREAD_ID}_presearch_r${roundNumber}`,
    threadId: THREAD_ID,
    userQuery: `Search query for round ${roundNumber}`,
  });
}

/**
 * Builds messages array for a specific resumption point
 */
function buildMessagesForResumptionPoint(config: {
  roundNumber: number;
  completedParticipants: number;
  hasStreamingParticipant: boolean;
  streamingParticipantHasContent: boolean;
  hasModerator: boolean;
  moderatorComplete: boolean;
  previousRounds?: number;
}): UIMessage[] {
  const messages: UIMessage[] = [];

  // Add previous complete rounds
  const prevRounds = config.previousRounds ?? 0;
  for (let r = 0; r < prevRounds; r++) {
    messages.push(createUserMessage(r));
    for (let p = 0; p < PARTICIPANT_COUNT; p++) {
      messages.push(createCompleteMessage(r, p));
    }
    messages.push(createModeratorMessage(r, true));
  }

  // Add current round user message
  messages.push(createUserMessage(config.roundNumber));

  // Add completed participants
  for (let p = 0; p < config.completedParticipants; p++) {
    messages.push(createCompleteMessage(config.roundNumber, p));
  }

  // Add streaming participant if applicable
  if (config.hasStreamingParticipant) {
    messages.push(createStreamingMessage(
      config.roundNumber,
      config.completedParticipants,
      config.streamingParticipantHasContent,
    ));
  }

  // Add moderator if applicable
  if (config.hasModerator) {
    messages.push(createModeratorMessage(config.roundNumber, config.moderatorComplete));
  }

  return messages;
}

/**
 * Determines next participant to trigger based on messages and participants
 */
function determineNextParticipantToTrigger(
  messages: UIMessage[],
  participants: ChatParticipant[],
  roundNumber: number,
): number | null {
  const completionStatus = getParticipantCompletionStatus(messages, participants, roundNumber);

  if (completionStatus.allComplete) {
    return null; // All done, moderator phase
  }

  // Convert completedParticipantIds to a set for lookup
  const completedIds = new Set(completionStatus.completedParticipantIds);

  // Find first incomplete participant
  const enabledParticipants = participants.filter(p => p.isEnabled);
  for (let i = 0; i < enabledParticipants.length; i++) {
    const participant = enabledParticipants[i];
    if (participant && !completedIds.has(participant.id)) {
      return i;
    }
  }

  return null;
}

/**
 * Determines current phase based on state
 */
function determinePhase(config: {
  preSearchStatus: typeof MessageStatuses[keyof typeof MessageStatuses] | null;
  completedParticipants: number;
  totalParticipants: number;
  hasModerator: boolean;
  moderatorComplete: boolean;
}): typeof RoundPhases[keyof typeof RoundPhases] {
  // Pre-search phase
  if (config.preSearchStatus === MessageStatuses.PENDING
    || config.preSearchStatus === MessageStatuses.STREAMING) {
    return RoundPhases.PRE_SEARCH;
  }

  // Moderator phase
  if (config.hasModerator || config.completedParticipants >= config.totalParticipants) {
    return RoundPhases.MODERATOR;
  }

  // Participants phase
  return RoundPhases.PARTICIPANTS;
}

// ============================================================================
// PRE-SEARCH PHASE RESUMPTION TESTS
// ============================================================================

describe('pre-Search Phase Resumption', () => {
  const _thread = createTestThread();
  const participants = createTestParticipants();

  describe('refresh Before Pre-Search Begins', () => {
    it('detects pending pre-search and waits', () => {
      const preSearch = createPreSearch(0, MessageStatuses.PENDING);
      const messages = [createUserMessage(0)];

      const phase = determinePhase({
        completedParticipants: 0,
        hasModerator: false,
        moderatorComplete: false,
        preSearchStatus: preSearch.status,
        totalParticipants: PARTICIPANT_COUNT,
      });

      expect(phase).toBe(RoundPhases.PRE_SEARCH);

      // Should not trigger participants yet
      const nextParticipant = determineNextParticipantToTrigger(messages, participants, 0);
      expect(nextParticipant).toBe(0); // P0 is next, but blocked by pre-search
    });
  });

  describe('refresh Mid Pre-Search Streaming', () => {
    it('detects streaming pre-search and resumes', () => {
      const preSearch = createPreSearch(0, MessageStatuses.STREAMING);
      const _messages = [createUserMessage(0)];

      const phase = determinePhase({
        completedParticipants: 0,
        hasModerator: false,
        moderatorComplete: false,
        preSearchStatus: preSearch.status,
        totalParticipants: PARTICIPANT_COUNT,
      });

      expect(phase).toBe(RoundPhases.PRE_SEARCH);
      expect(preSearch.status).toBe(MessageStatuses.STREAMING);
    });

    it('blocks participant triggers while pre-search streams', () => {
      const preSearch = createPreSearch(0, MessageStatuses.STREAMING);

      const shouldWaitForPreSearch = preSearch.status === MessageStatuses.PENDING
        || preSearch.status === MessageStatuses.STREAMING;

      expect(shouldWaitForPreSearch).toBeTruthy();
    });
  });

  describe('refresh After Pre-Search Complete', () => {
    it('transitions to participants phase after pre-search completes', () => {
      const preSearch = createPreSearch(0, MessageStatuses.COMPLETE);
      const messages = [createUserMessage(0)];

      const phase = determinePhase({
        completedParticipants: 0,
        hasModerator: false,
        moderatorComplete: false,
        preSearchStatus: preSearch.status,
        totalParticipants: PARTICIPANT_COUNT,
      });

      expect(phase).toBe(RoundPhases.PARTICIPANTS);

      // Should trigger P0
      const nextParticipant = determineNextParticipantToTrigger(messages, participants, 0);
      expect(nextParticipant).toBe(0);
    });

    it('handles failed pre-search gracefully', () => {
      const preSearch = createPreSearch(0, MessageStatuses.FAILED);

      const shouldWaitForPreSearch = preSearch.status === MessageStatuses.PENDING
        || preSearch.status === MessageStatuses.STREAMING;

      expect(shouldWaitForPreSearch).toBeFalsy();
      // Should proceed to participants even if pre-search failed
    });
  });
});

// ============================================================================
// PARTICIPANT PHASE RESUMPTION TESTS
// ============================================================================

describe('participant Phase Resumption - 4 Participants', () => {
  const _thread = createTestThread();
  const participants = createTestParticipants();

  describe('refresh Before First Participant (P0)', () => {
    it('detects no responses and triggers P0', () => {
      const messages = buildMessagesForResumptionPoint({
        completedParticipants: 0,
        hasModerator: false,
        hasStreamingParticipant: false,
        moderatorComplete: false,
        roundNumber: 0,
        streamingParticipantHasContent: false,
      });

      const nextParticipant = determineNextParticipantToTrigger(messages, participants, 0);
      expect(nextParticipant).toBe(0);

      const phase = determinePhase({
        completedParticipants: 0,
        hasModerator: false,
        moderatorComplete: false,
        preSearchStatus: MessageStatuses.COMPLETE,
        totalParticipants: PARTICIPANT_COUNT,
      });
      expect(phase).toBe(RoundPhases.PARTICIPANTS);
    });
  });

  describe('refresh Mid P0 Streaming', () => {
    it('detects incomplete P0 with partial content', () => {
      const messages = buildMessagesForResumptionPoint({
        completedParticipants: 0,
        hasModerator: false,
        hasStreamingParticipant: true,
        moderatorComplete: false,
        roundNumber: 0,
        streamingParticipantHasContent: true,
      });

      // P0 exists but is incomplete - all 4 participants are "streaming" (not complete)
      const completionStatus = getParticipantCompletionStatus(messages, participants, 0);
      expect(completionStatus.completedCount).toBe(0);
      // streamingCount includes all non-complete participants
      expect(completionStatus.streamingCount).toBe(4);
      expect(completionStatus.allComplete).toBeFalsy();

      // Should re-trigger P0
      const nextParticipant = determineNextParticipantToTrigger(messages, participants, 0);
      expect(nextParticipant).toBe(0);
    });

    it('detects incomplete P0 with no content (early interrupt)', () => {
      const messages = buildMessagesForResumptionPoint({
        completedParticipants: 0,
        hasModerator: false,
        hasStreamingParticipant: true,
        moderatorComplete: false,
        roundNumber: 0,
        streamingParticipantHasContent: false,
      });

      // Empty message with no finishReason - BUT if it has empty parts,
      // isMessageComplete may return true. The key assertion is next participant
      const completionStatus = getParticipantCompletionStatus(messages, participants, 0);
      expect(completionStatus.allComplete).toBeFalsy();

      // Should re-trigger P0 (first incomplete)
      const nextParticipant = determineNextParticipantToTrigger(messages, participants, 0);
      expect(nextParticipant).toBe(0);
    });
  });

  describe('refresh After P0 Complete, Before P1', () => {
    it('detects P0 complete and triggers P1', () => {
      const messages = buildMessagesForResumptionPoint({
        completedParticipants: 1,
        hasModerator: false,
        hasStreamingParticipant: false,
        moderatorComplete: false,
        roundNumber: 0,
        streamingParticipantHasContent: false,
      });

      const completionStatus = getParticipantCompletionStatus(messages, participants, 0);
      expect(completionStatus.completedCount).toBe(1);
      expect(completionStatus.completedParticipantIds).toContain('participant-0');
      expect(completionStatus.completedParticipantIds).not.toContain('participant-1');

      const nextParticipant = determineNextParticipantToTrigger(messages, participants, 0);
      expect(nextParticipant).toBe(1);
    });

    it('does not re-trigger P0 when already complete', () => {
      const messages = buildMessagesForResumptionPoint({
        completedParticipants: 1,
        hasModerator: false,
        hasStreamingParticipant: false,
        moderatorComplete: false,
        roundNumber: 0,
        streamingParticipantHasContent: false,
      });

      const completionStatus = getParticipantCompletionStatus(messages, participants, 0);
      expect(completionStatus.completedParticipantIds).toContain('participant-0');

      // Next should be P1, not P0
      const nextParticipant = determineNextParticipantToTrigger(messages, participants, 0);
      expect(nextParticipant).not.toBe(0);
      expect(nextParticipant).toBe(1);
    });
  });

  describe('refresh Mid P1 Streaming', () => {
    it('detects P0 complete, P1 incomplete', () => {
      const messages = buildMessagesForResumptionPoint({
        completedParticipants: 1,
        hasModerator: false,
        hasStreamingParticipant: true,
        moderatorComplete: false,
        roundNumber: 0,
        streamingParticipantHasContent: true,
      });

      const completionStatus = getParticipantCompletionStatus(messages, participants, 0);
      expect(completionStatus.completedCount).toBe(1);
      expect(completionStatus.completedParticipantIds).toContain('participant-0');
      // streamingCount = 3 (P1, P2, P3 not complete)
      expect(completionStatus.streamingCount).toBe(3);
      expect(completionStatus.allComplete).toBeFalsy();

      // Should re-trigger P1
      const nextParticipant = determineNextParticipantToTrigger(messages, participants, 0);
      expect(nextParticipant).toBe(1);
    });
  });

  describe('refresh After P1, Before P2', () => {
    it('detects P0,P1 complete and triggers P2', () => {
      const messages = buildMessagesForResumptionPoint({
        completedParticipants: 2,
        hasModerator: false,
        hasStreamingParticipant: false,
        moderatorComplete: false,
        roundNumber: 0,
        streamingParticipantHasContent: false,
      });

      const completionStatus = getParticipantCompletionStatus(messages, participants, 0);
      expect(completionStatus.completedCount).toBe(2);
      expect(completionStatus.completedParticipantIds).toContain('participant-0');
      expect(completionStatus.completedParticipantIds).toContain('participant-1');

      const nextParticipant = determineNextParticipantToTrigger(messages, participants, 0);
      expect(nextParticipant).toBe(2);
    });
  });

  describe('refresh Mid P2 Streaming', () => {
    it('detects P0,P1 complete, P2 incomplete', () => {
      const messages = buildMessagesForResumptionPoint({
        completedParticipants: 2,
        hasModerator: false,
        hasStreamingParticipant: true,
        moderatorComplete: false,
        roundNumber: 0,
        streamingParticipantHasContent: true,
      });

      const completionStatus = getParticipantCompletionStatus(messages, participants, 0);
      expect(completionStatus.completedCount).toBe(2);
      // P2 is streaming, P3 has no message - both count as "streaming" (not complete)
      expect(completionStatus.streamingCount).toBe(2);

      const nextParticipant = determineNextParticipantToTrigger(messages, participants, 0);
      expect(nextParticipant).toBe(2);
    });
  });

  describe('refresh After P2, Before P3 (Last Participant)', () => {
    it('detects P0,P1,P2 complete and triggers P3', () => {
      const messages = buildMessagesForResumptionPoint({
        completedParticipants: 3,
        hasModerator: false,
        hasStreamingParticipant: false,
        moderatorComplete: false,
        roundNumber: 0,
        streamingParticipantHasContent: false,
      });

      const completionStatus = getParticipantCompletionStatus(messages, participants, 0);
      expect(completionStatus.completedCount).toBe(3);

      const nextParticipant = determineNextParticipantToTrigger(messages, participants, 0);
      expect(nextParticipant).toBe(3);
    });
  });

  describe('refresh Mid P3 (Last Participant) Streaming', () => {
    it('detects P0,P1,P2 complete, P3 incomplete', () => {
      const messages = buildMessagesForResumptionPoint({
        completedParticipants: 3,
        hasModerator: false,
        hasStreamingParticipant: true,
        moderatorComplete: false,
        roundNumber: 0,
        streamingParticipantHasContent: true,
      });

      const completionStatus = getParticipantCompletionStatus(messages, participants, 0);
      expect(completionStatus.completedCount).toBe(3);
      expect(completionStatus.streamingCount).toBe(1);
      expect(completionStatus.allComplete).toBeFalsy();

      const nextParticipant = determineNextParticipantToTrigger(messages, participants, 0);
      expect(nextParticipant).toBe(3);
    });
  });

  describe('refresh After All Participants Complete, Before Moderator', () => {
    it('detects all participants complete and triggers moderator', () => {
      const messages = buildMessagesForResumptionPoint({
        completedParticipants: 4,
        hasModerator: false,
        hasStreamingParticipant: false,
        moderatorComplete: false,
        roundNumber: 0,
        streamingParticipantHasContent: false,
      });

      const completionStatus = getParticipantCompletionStatus(messages, participants, 0);
      expect(completionStatus.completedCount).toBe(4);
      expect(completionStatus.allComplete).toBeTruthy();

      // No more participants to trigger
      const nextParticipant = determineNextParticipantToTrigger(messages, participants, 0);
      expect(nextParticipant).toBeNull();

      // Should transition to moderator phase
      const phase = determinePhase({
        completedParticipants: 4,
        hasModerator: false,
        moderatorComplete: false,
        preSearchStatus: MessageStatuses.COMPLETE,
        totalParticipants: PARTICIPANT_COUNT,
      });
      expect(phase).toBe(RoundPhases.MODERATOR);
    });
  });
});

// ============================================================================
// MODERATOR PHASE RESUMPTION TESTS
// ============================================================================

describe('moderator Phase Resumption', () => {
  const _thread = createTestThread();
  const participants = createTestParticipants();

  describe('refresh Mid Moderator Streaming', () => {
    it('detects incomplete moderator message', () => {
      const messages = buildMessagesForResumptionPoint({
        completedParticipants: 4,
        hasModerator: true,
        hasStreamingParticipant: false,
        moderatorComplete: false,
        roundNumber: 0,
        streamingParticipantHasContent: false,
      });

      const moderatorMessage = getModeratorMessageForRound(messages, 0);
      expect(moderatorMessage).toBeDefined();
      expect(moderatorMessage?.metadata).toBeDefined();

      // Moderator is incomplete
      const finishReason = moderatorMessage ? getMetadataFinishReason(moderatorMessage.metadata) : null;
      expect(finishReason).toBe(FinishReasons.UNKNOWN);
    });

    it('all participants still marked complete', () => {
      const messages = buildMessagesForResumptionPoint({
        completedParticipants: 4,
        hasModerator: true,
        hasStreamingParticipant: false,
        moderatorComplete: false,
        roundNumber: 0,
        streamingParticipantHasContent: false,
      });

      const completionStatus = getParticipantCompletionStatus(messages, participants, 0);
      expect(completionStatus.allComplete).toBeTruthy();
      expect(completionStatus.completedCount).toBe(4);
    });
  });

  describe('refresh After Moderator Complete', () => {
    it('detects complete round', () => {
      const messages = buildMessagesForResumptionPoint({
        completedParticipants: 4,
        hasModerator: true,
        hasStreamingParticipant: false,
        moderatorComplete: true,
        roundNumber: 0,
        streamingParticipantHasContent: false,
      });

      const moderatorMessage = getModeratorMessageForRound(messages, 0);
      expect(moderatorMessage).toBeDefined();

      const finishReason = moderatorMessage ? getMetadataFinishReason(moderatorMessage.metadata) : null;
      expect(finishReason).toBe(FinishReasons.STOP);

      // Round is complete
      const completionStatus = getParticipantCompletionStatus(messages, participants, 0);
      expect(completionStatus.allComplete).toBeTruthy();
    });

    it('does not re-trigger any participants', () => {
      const messages = buildMessagesForResumptionPoint({
        completedParticipants: 4,
        hasModerator: true,
        hasStreamingParticipant: false,
        moderatorComplete: true,
        roundNumber: 0,
        streamingParticipantHasContent: false,
      });

      const nextParticipant = determineNextParticipantToTrigger(messages, participants, 0);
      expect(nextParticipant).toBeNull();
    });
  });
});

// ============================================================================
// MULTI-ROUND RESUMPTION TESTS
// ============================================================================

describe('multi-Round Resumption', () => {
  const _thread = createTestThread();
  const participants = createTestParticipants();

  describe('round 2 - Refresh at Various Points', () => {
    it('correctly identifies round 1 with previous round complete', () => {
      const messages = buildMessagesForResumptionPoint({
        completedParticipants: 0,
        hasModerator: false,
        hasStreamingParticipant: false,
        moderatorComplete: false,
        previousRounds: 1,
        roundNumber: 1,
        streamingParticipantHasContent: false,
      });

      // Should have round 0 complete messages + round 1 user message
      const userMessages = messages.filter(m => m.role === UIMessageRoles.USER);
      expect(userMessages).toHaveLength(2); // r0 + r1

      const round0Messages = messages.filter((m) => {
        const metadata = m.metadata as { roundNumber?: number };
        return metadata.roundNumber === 0;
      });
      const round1Messages = messages.filter((m) => {
        const metadata = m.metadata as { roundNumber?: number };
        return metadata.roundNumber === 1;
      });

      // Round 0: user + 4 participants + moderator = 6
      expect(round0Messages).toHaveLength(6);
      // Round 1: just user so far
      expect(round1Messages).toHaveLength(1);
    });

    it('triggers P0 of round 1 after pre-search', () => {
      const messages = buildMessagesForResumptionPoint({
        completedParticipants: 0,
        hasModerator: false,
        hasStreamingParticipant: false,
        moderatorComplete: false,
        previousRounds: 1,
        roundNumber: 1,
        streamingParticipantHasContent: false,
      });

      const nextParticipant = determineNextParticipantToTrigger(messages, participants, 1);
      expect(nextParticipant).toBe(0);
    });

    it('triggers P2 of round 1 when P0,P1 complete', () => {
      const messages = buildMessagesForResumptionPoint({
        completedParticipants: 2,
        hasModerator: false,
        hasStreamingParticipant: false,
        moderatorComplete: false,
        previousRounds: 1,
        roundNumber: 1,
        streamingParticipantHasContent: false,
      });

      const completionStatus = getParticipantCompletionStatus(messages, participants, 1);
      expect(completionStatus.completedCount).toBe(2);

      const nextParticipant = determineNextParticipantToTrigger(messages, participants, 1);
      expect(nextParticipant).toBe(2);
    });

    it('does not confuse round 0 messages with round 1', () => {
      const messages = buildMessagesForResumptionPoint({
        completedParticipants: 2,
        hasModerator: false,
        hasStreamingParticipant: true,
        moderatorComplete: false,
        previousRounds: 1,
        roundNumber: 1,
        streamingParticipantHasContent: true,
      });

      // Round 0 should still show all complete
      const round0Status = getParticipantCompletionStatus(messages, participants, 0);
      expect(round0Status.allComplete).toBeTruthy();

      // Round 1 should show partial
      const round1Status = getParticipantCompletionStatus(messages, participants, 1);
      expect(round1Status.completedCount).toBe(2);
      expect(round1Status.allComplete).toBeFalsy();
    });
  });

  describe('round 3 - Deep Multi-Round', () => {
    it('handles resumption correctly with 2 previous rounds', () => {
      const messages = buildMessagesForResumptionPoint({
        completedParticipants: 1,
        hasModerator: false,
        hasStreamingParticipant: true,
        moderatorComplete: false,
        previousRounds: 2,
        roundNumber: 2,
        streamingParticipantHasContent: true,
      });

      // Should have messages from rounds 0, 1, and partial 2
      const round0Status = getParticipantCompletionStatus(messages, participants, 0);
      const round1Status = getParticipantCompletionStatus(messages, participants, 1);
      const round2Status = getParticipantCompletionStatus(messages, participants, 2);

      expect(round0Status.allComplete).toBeTruthy();
      expect(round1Status.allComplete).toBeTruthy();
      expect(round2Status.completedCount).toBe(1);
      expect(round2Status.allComplete).toBeFalsy();

      // Should trigger P1 of round 2
      const nextParticipant = determineNextParticipantToTrigger(messages, participants, 2);
      expect(nextParticipant).toBe(1);
    });
  });
});

// ============================================================================
// MESSAGE ISOLATION TESTS
// ============================================================================

describe('message Isolation - No Leakage Between Participants', () => {
  const _participants = createTestParticipants();

  it('each participant message has correct metadata', () => {
    const messages = buildMessagesForResumptionPoint({
      completedParticipants: 4,
      hasModerator: false,
      hasStreamingParticipant: false,
      moderatorComplete: false,
      roundNumber: 0,
      streamingParticipantHasContent: false,
    });

    const assistantMessages = messages.filter(m => m.role === UIMessageRoles.ASSISTANT);
    expect(assistantMessages).toHaveLength(4);

    assistantMessages.forEach((msg, index) => {
      const metadata = msg.metadata as { participantIndex?: number; participantId?: string };
      expect(metadata.participantIndex).toBe(index);
      expect(metadata.participantId).toBe(`participant-${index}`);
    });
  });

  it('message IDs are unique per participant', () => {
    const messages = buildMessagesForResumptionPoint({
      completedParticipants: 4,
      hasModerator: false,
      hasStreamingParticipant: false,
      moderatorComplete: false,
      roundNumber: 0,
      streamingParticipantHasContent: false,
    });

    const messageIds = messages.map(m => m.id);
    const uniqueIds = new Set(messageIds);
    expect(uniqueIds.size).toBe(messageIds.length);
  });

  it('participants cannot overwrite each other\'s messages', () => {
    const messages = buildMessagesForResumptionPoint({
      completedParticipants: 2,
      hasModerator: false,
      hasStreamingParticipant: true,
      moderatorComplete: false,
      roundNumber: 0,
      streamingParticipantHasContent: true,
    });

    // P0 and P1 complete, P2 streaming
    const p0Msg = messages.find(m => m.id === `${THREAD_ID}_r0_p0`);
    const p1Msg = messages.find(m => m.id === `${THREAD_ID}_r0_p1`);
    const p2Msg = messages.find(m => m.id === `${THREAD_ID}_r0_p2`);

    expect(p0Msg).toBeDefined();
    expect(p1Msg).toBeDefined();
    expect(p2Msg).toBeDefined();

    // Each has distinct content/state
    const p0FinishReason = p0Msg ? getMetadataFinishReason(p0Msg.metadata) : null;
    const p1FinishReason = p1Msg ? getMetadataFinishReason(p1Msg.metadata) : null;
    const p2FinishReason = p2Msg ? getMetadataFinishReason(p2Msg.metadata) : null;

    expect(p0FinishReason).toBe(FinishReasons.STOP);
    expect(p1FinishReason).toBe(FinishReasons.STOP);
    expect(p2FinishReason).toBeNull(); // Still streaming (null = not finished)
  });
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe('edge Cases', () => {
  const participants = createTestParticipants();

  describe('empty Messages Array', () => {
    it('handles empty messages gracefully', () => {
      const messages: UIMessage[] = [];
      const completionStatus = getParticipantCompletionStatus(messages, participants, 0);

      // No messages means no completions - 4 participants expected, none complete
      expect(completionStatus.completedCount).toBe(0);
      // streamingCount is 4 (all participants are effectively "streaming" since they haven't responded)
      expect(completionStatus.streamingCount).toBe(4);
      expect(completionStatus.allComplete).toBeFalsy();
    });
  });

  describe('no Participants', () => {
    it('handles zero participants', () => {
      const messages = [createUserMessage(0)];
      const noParticipants: ChatParticipant[] = [];

      const completionStatus = getParticipantCompletionStatus(messages, noParticipants, 0);
      expect(completionStatus.expectedCount).toBe(0);
      // When there are no participants, allComplete is false (the gate doesn't open)
      expect(completionStatus.allComplete).toBeFalsy();
    });
  });

  describe('out-of-Order Message IDs', () => {
    it('correctly identifies completion regardless of message order', () => {
      // Messages in reverse order
      const messages: UIMessage[] = [
        createCompleteMessage(0, 3),
        createCompleteMessage(0, 2),
        createCompleteMessage(0, 1),
        createCompleteMessage(0, 0),
        createUserMessage(0),
      ];

      const completionStatus = getParticipantCompletionStatus(messages, participants, 0);
      expect(completionStatus.allComplete).toBeTruthy();
      expect(completionStatus.completedCount).toBe(4);
    });
  });

  describe('duplicate Messages (Edge Case)', () => {
    it('handles duplicate participant messages', () => {
      const messages: UIMessage[] = [
        createUserMessage(0),
        createCompleteMessage(0, 0),
        createCompleteMessage(0, 0), // Duplicate
        createCompleteMessage(0, 1),
      ];

      const completionStatus = getParticipantCompletionStatus(messages, participants, 0);
      // Should deduplicate and count correctly
      expect(completionStatus.completedParticipantIds).toContain('participant-0');
      expect(completionStatus.completedParticipantIds).toContain('participant-1');
      expect(completionStatus.completedCount).toBe(2);
    });
  });
});

// ============================================================================
// RACE CONDITION PREVENTION TESTS
// ============================================================================

describe('race Condition Prevention', () => {
  const participants = createTestParticipants();

  describe('double Trigger Prevention', () => {
    it('same participant cannot be triggered twice', () => {
      const messages = buildMessagesForResumptionPoint({
        completedParticipants: 1,
        hasModerator: false,
        hasStreamingParticipant: false,
        moderatorComplete: false,
        roundNumber: 0,
        streamingParticipantHasContent: false,
      });

      // First determination
      const firstTrigger = determineNextParticipantToTrigger(messages, participants, 0);
      expect(firstTrigger).toBe(1);

      // After P1 starts streaming, add streaming message
      const messagesWithStreaming = [
        ...messages,
        createStreamingMessage(0, 1, true),
      ];

      // Determination should still return 1 (the streaming one)
      const secondTrigger = determineNextParticipantToTrigger(messagesWithStreaming, participants, 0);
      expect(secondTrigger).toBe(1);

      // After P1 completes
      const messagesWithComplete = [
        ...messages,
        createCompleteMessage(0, 1),
      ];

      // Now should move to P2
      const thirdTrigger = determineNextParticipantToTrigger(messagesWithComplete, participants, 0);
      expect(thirdTrigger).toBe(2);
    });
  });

  describe('phase Transition Atomicity', () => {
    it('moderator trigger only after ALL participants complete', () => {
      // 3 of 4 complete
      const partialMessages = buildMessagesForResumptionPoint({
        completedParticipants: 3,
        hasModerator: false,
        hasStreamingParticipant: false,
        moderatorComplete: false,
        roundNumber: 0,
        streamingParticipantHasContent: false,
      });

      const partialStatus = getParticipantCompletionStatus(partialMessages, participants, 0);
      expect(partialStatus.allComplete).toBeFalsy();

      // All 4 complete
      const completeMessages = buildMessagesForResumptionPoint({
        completedParticipants: 4,
        hasModerator: false,
        hasStreamingParticipant: false,
        moderatorComplete: false,
        roundNumber: 0,
        streamingParticipantHasContent: false,
      });

      const completeStatus = getParticipantCompletionStatus(completeMessages, participants, 0);
      expect(completeStatus.allComplete).toBeTruthy();
    });
  });
});
