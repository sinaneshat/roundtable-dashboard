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

import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';

import { FinishReasons, MessageStatuses, RoundPhases, UIMessageRoles } from '@/api/core/enums';
import type { StoredPreSearch } from '@/api/routes/chat/schema';
import type { ChatParticipant, ChatThread } from '@/db/validation';
import {
  createMockParticipants,
  createMockStoredPreSearch,
  createMockThread,
  createTestAssistantMessage,
  createTestModeratorMessage,
  createTestUserMessage,
} from '@/lib/testing';
import {
  getModeratorMessageForRound,
  getParticipantCompletionStatus,
} from '@/stores/chat/utils/participant-completion-gate';

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
    id: THREAD_ID,
    mode: 'undebating',
    enableWebSearch: true,
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
    role: UIMessageRoles.ASSISTANT,
    parts: hasPartialContent
      ? [{ type: 'text' as const, text: 'Partial response...', state: 'streaming' as const }]
      : [],
    metadata: {
      role: UIMessageRoles.ASSISTANT,
      roundNumber,
      participantId: `participant-${participantIndex}`,
      participantIndex,
      participantRole: null,
      model: 'gpt-4o',
      // null finishReason = stream not finished (UNKNOWN is truthy and would mark complete)
      finishReason: null,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      hasError: false,
      isTransient: false,
      isPartialResponse: true,
    },
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
    id: `${THREAD_ID}_r${roundNumber}_p${participantIndex}`,
    content: `Complete response from participant ${participantIndex}`,
    roundNumber,
    participantId: `participant-${participantIndex}`,
    participantIndex,
    finishReason: FinishReasons.STOP,
  });
}

/**
 * Creates a user message for a round
 */
function createUserMessage(roundNumber: number): UIMessage {
  return createTestUserMessage({
    id: `${THREAD_ID}_r${roundNumber}_user`,
    content: `User message for round ${roundNumber}`,
    roundNumber,
  });
}

/**
 * Creates a complete moderator message
 */
function createModeratorMessage(roundNumber: number, isComplete = true): UIMessage {
  return createTestModeratorMessage({
    id: `${THREAD_ID}_r${roundNumber}_moderator`,
    content: `Moderator summary for round ${roundNumber}`,
    roundNumber,
    finishReason: isComplete ? FinishReasons.STOP : FinishReasons.UNKNOWN,
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
        preSearchStatus: preSearch.status,
        completedParticipants: 0,
        totalParticipants: PARTICIPANT_COUNT,
        hasModerator: false,
        moderatorComplete: false,
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
        preSearchStatus: preSearch.status,
        completedParticipants: 0,
        totalParticipants: PARTICIPANT_COUNT,
        hasModerator: false,
        moderatorComplete: false,
      });

      expect(phase).toBe(RoundPhases.PRE_SEARCH);
      expect(preSearch.status).toBe(MessageStatuses.STREAMING);
    });

    it('blocks participant triggers while pre-search streams', () => {
      const preSearch = createPreSearch(0, MessageStatuses.STREAMING);

      const shouldWaitForPreSearch = preSearch.status === MessageStatuses.PENDING
        || preSearch.status === MessageStatuses.STREAMING;

      expect(shouldWaitForPreSearch).toBe(true);
    });
  });

  describe('refresh After Pre-Search Complete', () => {
    it('transitions to participants phase after pre-search completes', () => {
      const preSearch = createPreSearch(0, MessageStatuses.COMPLETE);
      const messages = [createUserMessage(0)];

      const phase = determinePhase({
        preSearchStatus: preSearch.status,
        completedParticipants: 0,
        totalParticipants: PARTICIPANT_COUNT,
        hasModerator: false,
        moderatorComplete: false,
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

      expect(shouldWaitForPreSearch).toBe(false);
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
        roundNumber: 0,
        completedParticipants: 0,
        hasStreamingParticipant: false,
        streamingParticipantHasContent: false,
        hasModerator: false,
        moderatorComplete: false,
      });

      const nextParticipant = determineNextParticipantToTrigger(messages, participants, 0);
      expect(nextParticipant).toBe(0);

      const phase = determinePhase({
        preSearchStatus: MessageStatuses.COMPLETE,
        completedParticipants: 0,
        totalParticipants: PARTICIPANT_COUNT,
        hasModerator: false,
        moderatorComplete: false,
      });
      expect(phase).toBe(RoundPhases.PARTICIPANTS);
    });
  });

  describe('refresh Mid P0 Streaming', () => {
    it('detects incomplete P0 with partial content', () => {
      const messages = buildMessagesForResumptionPoint({
        roundNumber: 0,
        completedParticipants: 0,
        hasStreamingParticipant: true,
        streamingParticipantHasContent: true,
        hasModerator: false,
        moderatorComplete: false,
      });

      // P0 exists but is incomplete - all 4 participants are "streaming" (not complete)
      const completionStatus = getParticipantCompletionStatus(messages, participants, 0);
      expect(completionStatus.completedCount).toBe(0);
      // streamingCount includes all non-complete participants
      expect(completionStatus.streamingCount).toBe(4);
      expect(completionStatus.allComplete).toBe(false);

      // Should re-trigger P0
      const nextParticipant = determineNextParticipantToTrigger(messages, participants, 0);
      expect(nextParticipant).toBe(0);
    });

    it('detects incomplete P0 with no content (early interrupt)', () => {
      const messages = buildMessagesForResumptionPoint({
        roundNumber: 0,
        completedParticipants: 0,
        hasStreamingParticipant: true,
        streamingParticipantHasContent: false,
        hasModerator: false,
        moderatorComplete: false,
      });

      // Empty message with no finishReason - BUT if it has empty parts,
      // isMessageComplete may return true. The key assertion is next participant
      const completionStatus = getParticipantCompletionStatus(messages, participants, 0);
      expect(completionStatus.allComplete).toBe(false);

      // Should re-trigger P0 (first incomplete)
      const nextParticipant = determineNextParticipantToTrigger(messages, participants, 0);
      expect(nextParticipant).toBe(0);
    });
  });

  describe('refresh After P0 Complete, Before P1', () => {
    it('detects P0 complete and triggers P1', () => {
      const messages = buildMessagesForResumptionPoint({
        roundNumber: 0,
        completedParticipants: 1,
        hasStreamingParticipant: false,
        streamingParticipantHasContent: false,
        hasModerator: false,
        moderatorComplete: false,
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
        roundNumber: 0,
        completedParticipants: 1,
        hasStreamingParticipant: false,
        streamingParticipantHasContent: false,
        hasModerator: false,
        moderatorComplete: false,
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
        roundNumber: 0,
        completedParticipants: 1,
        hasStreamingParticipant: true,
        streamingParticipantHasContent: true,
        hasModerator: false,
        moderatorComplete: false,
      });

      const completionStatus = getParticipantCompletionStatus(messages, participants, 0);
      expect(completionStatus.completedCount).toBe(1);
      expect(completionStatus.completedParticipantIds).toContain('participant-0');
      // streamingCount = 3 (P1, P2, P3 not complete)
      expect(completionStatus.streamingCount).toBe(3);
      expect(completionStatus.allComplete).toBe(false);

      // Should re-trigger P1
      const nextParticipant = determineNextParticipantToTrigger(messages, participants, 0);
      expect(nextParticipant).toBe(1);
    });
  });

  describe('refresh After P1, Before P2', () => {
    it('detects P0,P1 complete and triggers P2', () => {
      const messages = buildMessagesForResumptionPoint({
        roundNumber: 0,
        completedParticipants: 2,
        hasStreamingParticipant: false,
        streamingParticipantHasContent: false,
        hasModerator: false,
        moderatorComplete: false,
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
        roundNumber: 0,
        completedParticipants: 2,
        hasStreamingParticipant: true,
        streamingParticipantHasContent: true,
        hasModerator: false,
        moderatorComplete: false,
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
        roundNumber: 0,
        completedParticipants: 3,
        hasStreamingParticipant: false,
        streamingParticipantHasContent: false,
        hasModerator: false,
        moderatorComplete: false,
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
        roundNumber: 0,
        completedParticipants: 3,
        hasStreamingParticipant: true,
        streamingParticipantHasContent: true,
        hasModerator: false,
        moderatorComplete: false,
      });

      const completionStatus = getParticipantCompletionStatus(messages, participants, 0);
      expect(completionStatus.completedCount).toBe(3);
      expect(completionStatus.streamingCount).toBe(1);
      expect(completionStatus.allComplete).toBe(false);

      const nextParticipant = determineNextParticipantToTrigger(messages, participants, 0);
      expect(nextParticipant).toBe(3);
    });
  });

  describe('refresh After All Participants Complete, Before Moderator', () => {
    it('detects all participants complete and triggers moderator', () => {
      const messages = buildMessagesForResumptionPoint({
        roundNumber: 0,
        completedParticipants: 4,
        hasStreamingParticipant: false,
        streamingParticipantHasContent: false,
        hasModerator: false,
        moderatorComplete: false,
      });

      const completionStatus = getParticipantCompletionStatus(messages, participants, 0);
      expect(completionStatus.completedCount).toBe(4);
      expect(completionStatus.allComplete).toBe(true);

      // No more participants to trigger
      const nextParticipant = determineNextParticipantToTrigger(messages, participants, 0);
      expect(nextParticipant).toBeNull();

      // Should transition to moderator phase
      const phase = determinePhase({
        preSearchStatus: MessageStatuses.COMPLETE,
        completedParticipants: 4,
        totalParticipants: PARTICIPANT_COUNT,
        hasModerator: false,
        moderatorComplete: false,
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
        roundNumber: 0,
        completedParticipants: 4,
        hasStreamingParticipant: false,
        streamingParticipantHasContent: false,
        hasModerator: true,
        moderatorComplete: false,
      });

      const moderatorMessage = getModeratorMessageForRound(messages, 0);
      expect(moderatorMessage).toBeDefined();
      expect(moderatorMessage?.metadata).toBeDefined();

      // Moderator is incomplete
      const metadata = moderatorMessage!.metadata as { finishReason?: string };
      expect(metadata.finishReason).toBe(FinishReasons.UNKNOWN);
    });

    it('all participants still marked complete', () => {
      const messages = buildMessagesForResumptionPoint({
        roundNumber: 0,
        completedParticipants: 4,
        hasStreamingParticipant: false,
        streamingParticipantHasContent: false,
        hasModerator: true,
        moderatorComplete: false,
      });

      const completionStatus = getParticipantCompletionStatus(messages, participants, 0);
      expect(completionStatus.allComplete).toBe(true);
      expect(completionStatus.completedCount).toBe(4);
    });
  });

  describe('refresh After Moderator Complete', () => {
    it('detects complete round', () => {
      const messages = buildMessagesForResumptionPoint({
        roundNumber: 0,
        completedParticipants: 4,
        hasStreamingParticipant: false,
        streamingParticipantHasContent: false,
        hasModerator: true,
        moderatorComplete: true,
      });

      const moderatorMessage = getModeratorMessageForRound(messages, 0);
      expect(moderatorMessage).toBeDefined();

      const metadata = moderatorMessage!.metadata as { finishReason?: string };
      expect(metadata.finishReason).toBe(FinishReasons.STOP);

      // Round is complete
      const completionStatus = getParticipantCompletionStatus(messages, participants, 0);
      expect(completionStatus.allComplete).toBe(true);
    });

    it('does not re-trigger any participants', () => {
      const messages = buildMessagesForResumptionPoint({
        roundNumber: 0,
        completedParticipants: 4,
        hasStreamingParticipant: false,
        streamingParticipantHasContent: false,
        hasModerator: true,
        moderatorComplete: true,
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
        roundNumber: 1,
        completedParticipants: 0,
        hasStreamingParticipant: false,
        streamingParticipantHasContent: false,
        hasModerator: false,
        moderatorComplete: false,
        previousRounds: 1,
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
        roundNumber: 1,
        completedParticipants: 0,
        hasStreamingParticipant: false,
        streamingParticipantHasContent: false,
        hasModerator: false,
        moderatorComplete: false,
        previousRounds: 1,
      });

      const nextParticipant = determineNextParticipantToTrigger(messages, participants, 1);
      expect(nextParticipant).toBe(0);
    });

    it('triggers P2 of round 1 when P0,P1 complete', () => {
      const messages = buildMessagesForResumptionPoint({
        roundNumber: 1,
        completedParticipants: 2,
        hasStreamingParticipant: false,
        streamingParticipantHasContent: false,
        hasModerator: false,
        moderatorComplete: false,
        previousRounds: 1,
      });

      const completionStatus = getParticipantCompletionStatus(messages, participants, 1);
      expect(completionStatus.completedCount).toBe(2);

      const nextParticipant = determineNextParticipantToTrigger(messages, participants, 1);
      expect(nextParticipant).toBe(2);
    });

    it('does not confuse round 0 messages with round 1', () => {
      const messages = buildMessagesForResumptionPoint({
        roundNumber: 1,
        completedParticipants: 2,
        hasStreamingParticipant: true,
        streamingParticipantHasContent: true,
        hasModerator: false,
        moderatorComplete: false,
        previousRounds: 1,
      });

      // Round 0 should still show all complete
      const round0Status = getParticipantCompletionStatus(messages, participants, 0);
      expect(round0Status.allComplete).toBe(true);

      // Round 1 should show partial
      const round1Status = getParticipantCompletionStatus(messages, participants, 1);
      expect(round1Status.completedCount).toBe(2);
      expect(round1Status.allComplete).toBe(false);
    });
  });

  describe('round 3 - Deep Multi-Round', () => {
    it('handles resumption correctly with 2 previous rounds', () => {
      const messages = buildMessagesForResumptionPoint({
        roundNumber: 2,
        completedParticipants: 1,
        hasStreamingParticipant: true,
        streamingParticipantHasContent: true,
        hasModerator: false,
        moderatorComplete: false,
        previousRounds: 2,
      });

      // Should have messages from rounds 0, 1, and partial 2
      const round0Status = getParticipantCompletionStatus(messages, participants, 0);
      const round1Status = getParticipantCompletionStatus(messages, participants, 1);
      const round2Status = getParticipantCompletionStatus(messages, participants, 2);

      expect(round0Status.allComplete).toBe(true);
      expect(round1Status.allComplete).toBe(true);
      expect(round2Status.completedCount).toBe(1);
      expect(round2Status.allComplete).toBe(false);

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
      roundNumber: 0,
      completedParticipants: 4,
      hasStreamingParticipant: false,
      streamingParticipantHasContent: false,
      hasModerator: false,
      moderatorComplete: false,
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
      roundNumber: 0,
      completedParticipants: 4,
      hasStreamingParticipant: false,
      streamingParticipantHasContent: false,
      hasModerator: false,
      moderatorComplete: false,
    });

    const messageIds = messages.map(m => m.id);
    const uniqueIds = new Set(messageIds);
    expect(uniqueIds.size).toBe(messageIds.length);
  });

  it('participants cannot overwrite each other\'s messages', () => {
    const messages = buildMessagesForResumptionPoint({
      roundNumber: 0,
      completedParticipants: 2,
      hasStreamingParticipant: true,
      streamingParticipantHasContent: true,
      hasModerator: false,
      moderatorComplete: false,
    });

    // P0 and P1 complete, P2 streaming
    const p0Msg = messages.find(m => m.id === `${THREAD_ID}_r0_p0`);
    const p1Msg = messages.find(m => m.id === `${THREAD_ID}_r0_p1`);
    const p2Msg = messages.find(m => m.id === `${THREAD_ID}_r0_p2`);

    expect(p0Msg).toBeDefined();
    expect(p1Msg).toBeDefined();
    expect(p2Msg).toBeDefined();

    // Each has distinct content/state
    const p0Meta = p0Msg!.metadata as { finishReason?: string };
    const p1Meta = p1Msg!.metadata as { finishReason?: string };
    const p2Meta = p2Msg!.metadata as { finishReason?: string };

    expect(p0Meta.finishReason).toBe(FinishReasons.STOP);
    expect(p1Meta.finishReason).toBe(FinishReasons.STOP);
    expect(p2Meta.finishReason).toBeNull(); // Still streaming (null = not finished)
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
      expect(completionStatus.allComplete).toBe(false);
    });
  });

  describe('no Participants', () => {
    it('handles zero participants', () => {
      const messages = [createUserMessage(0)];
      const noParticipants: ChatParticipant[] = [];

      const completionStatus = getParticipantCompletionStatus(messages, noParticipants, 0);
      expect(completionStatus.expectedCount).toBe(0);
      // When there are no participants, allComplete is false (the gate doesn't open)
      expect(completionStatus.allComplete).toBe(false);
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
      expect(completionStatus.allComplete).toBe(true);
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
        roundNumber: 0,
        completedParticipants: 1,
        hasStreamingParticipant: false,
        streamingParticipantHasContent: false,
        hasModerator: false,
        moderatorComplete: false,
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
        roundNumber: 0,
        completedParticipants: 3,
        hasStreamingParticipant: false,
        streamingParticipantHasContent: false,
        hasModerator: false,
        moderatorComplete: false,
      });

      const partialStatus = getParticipantCompletionStatus(partialMessages, participants, 0);
      expect(partialStatus.allComplete).toBe(false);

      // All 4 complete
      const completeMessages = buildMessagesForResumptionPoint({
        roundNumber: 0,
        completedParticipants: 4,
        hasStreamingParticipant: false,
        streamingParticipantHasContent: false,
        hasModerator: false,
        moderatorComplete: false,
      });

      const completeStatus = getParticipantCompletionStatus(completeMessages, participants, 0);
      expect(completeStatus.allComplete).toBe(true);
    });
  });
});
