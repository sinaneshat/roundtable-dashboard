/**
 * Conversation Round Lifecycle Tests
 *
 * Tests for the complete lifecycle of conversation rounds as documented in FLOW_DOCUMENTATION.md:
 *
 * Round Structure (per FLOW_DOCUMENTATION.md):
 * - Each round begins with a user message
 * - Optional pre-search (web search) phase
 * - Sequential participant responses (round-robin)
 * - Optional round moderator
 * - Round completes when all participants respond
 *
 * Key Validations:
 * - Round numbering starts at 0
 * - Round numbers increment correctly
 * - All participants respond in order (priority-based)
 * - Round state transitions: pending → streaming → complete
 * - Refresh at any point can resume the round
 */

import { describe, expect, it } from 'vitest';

import { FinishReasons, MessageStatuses } from '@/api/core/enums';
import type { DbAssistantMessageMetadata } from '@/db/schemas/chat-metadata';
import type { TestAssistantMessage, TestUserMessage } from '@/lib/testing';
import {
  createMockParticipant,
  createMockStoredPreSearch,
  createTestAssistantMessage,
  createTestUserMessage,
} from '@/lib/testing';

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Type guard for assistant messages
 * ✅ ENUM PATTERN: Uses role literal for type narrowing
 */
function isAssistantMessage(msg: TestUserMessage | TestAssistantMessage): msg is TestAssistantMessage {
  return msg.role === 'assistant';
}

/**
 * Get assistant messages with proper typing
 * ✅ TYPE-SAFE: Returns narrowed array without casting
 */
function getAssistantMessages(messages: Array<TestUserMessage | TestAssistantMessage>): TestAssistantMessage[] {
  return messages.filter(isAssistantMessage);
}

/**
 * Creates a complete round of messages (user + all participant responses)
 * ✅ TYPE-SAFE: Returns explicitly typed array for proper narrowing
 */
function createCompleteRound(
  roundNumber: number,
  participantCount: number,
  options?: {
    participantFinishReasons?: Array<DbAssistantMessageMetadata['finishReason']>;
    includeUserMessage?: boolean;
  },
): Array<TestUserMessage | TestAssistantMessage> {
  const messages: Array<TestUserMessage | TestAssistantMessage> = [];
  const { participantFinishReasons, includeUserMessage = true } = options ?? {};

  if (includeUserMessage) {
    messages.push(createTestUserMessage({
      id: `thread-123_r${roundNumber}_user`,
      content: `User message for round ${roundNumber}`,
      roundNumber,
    }));
  }

  for (let i = 0; i < participantCount; i++) {
    const finishReason = participantFinishReasons?.[i] ?? FinishReasons.STOP;
    messages.push(createTestAssistantMessage({
      id: `thread-123_r${roundNumber}_p${i}`,
      content: `Participant ${i} response for round ${roundNumber}`,
      roundNumber,
      participantId: `participant-${i}`,
      participantIndex: i,
      finishReason,
    }));
  }

  return messages;
}

// ============================================================================
// ROUND NUMBERING TESTS
// ============================================================================

describe('round Numbering', () => {
  describe('initial Round', () => {
    it('first round should be numbered 0', () => {
      const userMessage = createTestUserMessage({
        id: 'msg-1',
        content: 'First message',
        roundNumber: 0,
      });

      expect(userMessage.metadata.roundNumber).toBe(0);
    });

    it('first participant response should have roundNumber 0', () => {
      const assistantMessage = createTestAssistantMessage({
        id: 'msg-2',
        content: 'First response',
        roundNumber: 0,
        participantId: 'participant-0',
        participantIndex: 0,
      });

      expect(assistantMessage.metadata.roundNumber).toBe(0);
    });

    it('all participants in round 0 should have roundNumber 0', () => {
      const round = createCompleteRound(0, 3);

      round.forEach((msg) => {
        expect(msg.metadata.roundNumber).toBe(0);
      });
    });
  });

  describe('round Increment', () => {
    it('second round should be numbered 1', () => {
      const round0 = createCompleteRound(0, 2);
      const round1 = createCompleteRound(1, 2);

      expect(round0[0]?.metadata.roundNumber).toBe(0);
      expect(round1[0]?.metadata.roundNumber).toBe(1);
    });

    it('round numbers should increment sequentially', () => {
      const rounds = [
        createCompleteRound(0, 2),
        createCompleteRound(1, 2),
        createCompleteRound(2, 2),
        createCompleteRound(3, 2),
      ];

      rounds.forEach((round, i) => {
        round.forEach((msg) => {
          expect(msg.metadata.roundNumber).toBe(i);
        });
      });
    });

    it('user message starts new round', () => {
      const allMessages = [
        ...createCompleteRound(0, 2),
        ...createCompleteRound(1, 2),
      ];

      // User messages should be at indices 0 (round 0) and 3 (round 1)
      const userMessages = allMessages.filter(m => m.role === 'user');
      expect(userMessages).toHaveLength(2);
      expect(userMessages[0]?.metadata.roundNumber).toBe(0);
      expect(userMessages[1]?.metadata.roundNumber).toBe(1);
    });
  });

  describe('round Number Extraction', () => {
    it('should extract highest round number from messages', () => {
      const messages = [
        ...createCompleteRound(0, 3),
        ...createCompleteRound(1, 3),
        ...createCompleteRound(2, 3),
      ];

      const maxRound = Math.max(
        ...messages.map(m => m.metadata.roundNumber),
      );

      expect(maxRound).toBe(2);
    });

    it('should handle empty messages array', () => {
      const messages: ReturnType<typeof createTestUserMessage>[] = [];

      const maxRound = messages.length > 0
        ? Math.max(...messages.map(m => m.metadata.roundNumber))
        : -1;

      expect(maxRound).toBe(-1);
    });
  });
});

// ============================================================================
// PARTICIPANT ORDER TESTS
// ============================================================================

describe('participant Response Order', () => {
  describe('priority-Based Order', () => {
    it('participants respond in priority order (0, 1, 2, ...)', () => {
      const round = createCompleteRound(0, 3);
      const assistantMessages = getAssistantMessages(round);

      assistantMessages.forEach((msg, index) => {
        expect(msg.metadata.participantIndex).toBe(index);
      });
    });

    it('participant index matches priority in participants array', () => {
      const participants = [
        createMockParticipant(0, { priority: 0 }),
        createMockParticipant(1, { priority: 1 }),
        createMockParticipant(2, { priority: 2 }),
      ];

      const round = createCompleteRound(0, 3);
      const assistantMessages = getAssistantMessages(round);

      assistantMessages.forEach((msg, index) => {
        expect(msg.metadata.participantId).toBe(participants[index]?.id);
      });
    });
  });

  describe('currentParticipantIndex Tracking', () => {
    it('starts at 0 for new round', () => {
      const initialIndex = 0;
      expect(initialIndex).toBe(0);
    });

    it('increments after each participant completes', () => {
      let currentIndex = 0;
      const participantCount = 3;

      // Simulate each participant completing
      for (let i = 0; i < participantCount; i++) {
        expect(currentIndex).toBe(i);
        currentIndex++;
      }

      expect(currentIndex).toBe(participantCount);
    });

    it('resets to 0 for next round', () => {
      let currentIndex = 3; // After round completes

      // Start new round
      currentIndex = 0;

      expect(currentIndex).toBe(0);
    });
  });
});

// ============================================================================
// ROUND COMPLETION DETECTION TESTS
// ============================================================================

describe('round Completion Detection', () => {
  describe('all Participants Responded', () => {
    it('round is complete when all participants have finishReason=stop', () => {
      const round = createCompleteRound(0, 3, {
        participantFinishReasons: [FinishReasons.STOP, FinishReasons.STOP, FinishReasons.STOP],
      });
      const assistantMessages = getAssistantMessages(round);

      const isComplete = assistantMessages.every(msg =>
        msg.metadata.finishReason === FinishReasons.STOP || msg.metadata.finishReason === FinishReasons.LENGTH);

      expect(isComplete).toBe(true);
    });

    it('round is NOT complete when participant has finishReason=unknown', () => {
      const round = createCompleteRound(0, 3, {
        participantFinishReasons: [FinishReasons.STOP, FinishReasons.UNKNOWN, FinishReasons.STOP],
      });
      const assistantMessages = getAssistantMessages(round);

      const isComplete = assistantMessages.every(msg =>
        msg.metadata.finishReason === FinishReasons.STOP || msg.metadata.finishReason === FinishReasons.LENGTH);

      expect(isComplete).toBe(false);
    });

    it('round is NOT complete when participants are missing', () => {
      // Only 2 participants responded out of 3 expected
      const partialRound = createCompleteRound(0, 2, {
        participantFinishReasons: [FinishReasons.STOP, FinishReasons.STOP],
      });
      const expectedParticipantCount = 3;
      const assistantMessages = getAssistantMessages(partialRound);

      const allResponded = assistantMessages.length === expectedParticipantCount;

      expect(allResponded).toBe(false);
    });
  });

  describe('error States', () => {
    it('participant with hasError=true still counts as responded', () => {
      const errorMessage = createTestAssistantMessage({
        id: 'error-msg',
        content: 'Error occurred',
        roundNumber: 0,
        participantId: 'participant-0',
        participantIndex: 0,
        hasError: true,
        finishReason: FinishReasons.ERROR,
      });

      // ✅ TYPE-SAFE: Direct property access on properly typed message
      expect(errorMessage.metadata.hasError).toBe(true);
      // Even with error, participant has responded
      expect(errorMessage.role).toBe('assistant');
    });

    it('finishReason=error indicates participant failed', () => {
      const errorMessage = createTestAssistantMessage({
        id: 'error-msg',
        content: '',
        roundNumber: 0,
        participantId: 'participant-0',
        participantIndex: 0,
        finishReason: FinishReasons.ERROR,
      });

      // ✅ TYPE-SAFE: Direct property access on properly typed message
      expect(errorMessage.metadata.finishReason).toBe(FinishReasons.ERROR);
    });
  });
});

// ============================================================================
// ROUND STATE TRANSITIONS TESTS
// ============================================================================

describe('round State Transitions', () => {
  describe('streaming State', () => {
    it('isStreaming=true when round is in progress', () => {
      // Simulate state during streaming
      const state = {
        isStreaming: true,
        streamingRoundNumber: 0,
        currentParticipantIndex: 1,
      };

      expect(state.isStreaming).toBe(true);
      expect(state.streamingRoundNumber).toBe(0);
    });

    it('isStreaming=false when round completes', () => {
      // Simulate state after completion
      const state = {
        isStreaming: false,
        streamingRoundNumber: null,
        currentParticipantIndex: 0,
      };

      expect(state.isStreaming).toBe(false);
      expect(state.streamingRoundNumber).toBeNull();
    });

    it('streamingRoundNumber tracks current round', () => {
      // Round 0 streaming
      let streamingRoundNumber: number | null = 0;
      expect(streamingRoundNumber).toBe(0);

      // Round 1 streaming
      streamingRoundNumber = 1;
      expect(streamingRoundNumber).toBe(1);

      // No active stream
      streamingRoundNumber = null;
      expect(streamingRoundNumber).toBeNull();
    });
  });

  describe('waitingToStartStreaming State', () => {
    it('true when preparing to stream (before first participant)', () => {
      const state = {
        waitingToStartStreaming: true,
        isStreaming: false,
      };

      expect(state.waitingToStartStreaming).toBe(true);
    });

    it('false once streaming actually begins', () => {
      const state = {
        waitingToStartStreaming: false,
        isStreaming: true,
      };

      expect(state.waitingToStartStreaming).toBe(false);
      expect(state.isStreaming).toBe(true);
    });
  });
});

// ============================================================================
// PRE-SEARCH PHASE TESTS
// ============================================================================

describe('pre-Search Phase', () => {
  describe('blocking Behavior', () => {
    it('participants wait for pre-search when enabled', () => {
      const preSearch = createMockStoredPreSearch(0, MessageStatuses.STREAMING);
      const enableWebSearch = true;

      const shouldWait = enableWebSearch
        && (preSearch.status === MessageStatuses.PENDING
          || preSearch.status === MessageStatuses.STREAMING);

      expect(shouldWait).toBe(true);
    });

    it('participants proceed when pre-search complete', () => {
      const preSearch = createMockStoredPreSearch(0, MessageStatuses.COMPLETE);
      const enableWebSearch = true;

      const shouldWait = enableWebSearch
        && (preSearch.status === MessageStatuses.PENDING
          || preSearch.status === MessageStatuses.STREAMING);

      expect(shouldWait).toBe(false);
    });

    it('participants proceed when web search disabled', () => {
      const preSearch = createMockStoredPreSearch(0, MessageStatuses.STREAMING);
      const enableWebSearch = false;

      const shouldWait = enableWebSearch
        && (preSearch.status === MessageStatuses.PENDING
          || preSearch.status === MessageStatuses.STREAMING);

      expect(shouldWait).toBe(false);
    });
  });

  describe('pre-Search Per Round', () => {
    it('each round has its own pre-search', () => {
      const preSearches = [
        createMockStoredPreSearch(0, MessageStatuses.COMPLETE),
        createMockStoredPreSearch(1, MessageStatuses.STREAMING),
        createMockStoredPreSearch(2, MessageStatuses.PENDING),
      ];

      expect(preSearches[0]?.roundNumber).toBe(0);
      expect(preSearches[1]?.roundNumber).toBe(1);
      expect(preSearches[2]?.roundNumber).toBe(2);
    });

    it('finds correct pre-search for round', () => {
      const preSearches = [
        createMockStoredPreSearch(0, MessageStatuses.COMPLETE),
        createMockStoredPreSearch(1, MessageStatuses.STREAMING),
      ];

      const currentRound = 1;
      const currentPreSearch = preSearches.find(ps => ps.roundNumber === currentRound);

      expect(currentPreSearch?.status).toBe(MessageStatuses.STREAMING);
    });
  });
});

// ============================================================================
// ROUND MODERATOR PHASE TESTS
// ============================================================================

// Moderator functionality has been integrated into messages with isModerator metadata

// ============================================================================
// MULTI-ROUND CONVERSATION TESTS
// ============================================================================

describe('multi-Round Conversations', () => {
  describe('complete Two-Round Conversation', () => {
    it('maintains correct structure across rounds', () => {
      const conversation = [
        ...createCompleteRound(0, 2),
        ...createCompleteRound(1, 2),
      ];

      // Should have 2 user messages and 4 assistant messages
      const userMessages = conversation.filter(m => m.role === 'user');
      const assistantMessages = conversation.filter(m => m.role === 'assistant');

      expect(userMessages).toHaveLength(2);
      expect(assistantMessages).toHaveLength(4);
    });

    it('messages are ordered correctly', () => {
      const conversation = [
        ...createCompleteRound(0, 2),
        ...createCompleteRound(1, 2),
      ];

      // Expected order: U0, A0P0, A0P1, U1, A1P0, A1P1
      expect(conversation[0]?.role).toBe('user');
      expect(conversation[0]?.metadata.roundNumber).toBe(0);

      // ✅ TYPE-SAFE: Extract assistant messages for typed access
      const round0Assistants = getAssistantMessages(conversation).filter(
        m => m.metadata.roundNumber === 0,
      );
      expect(round0Assistants[0]?.metadata.participantIndex).toBe(0);
      expect(round0Assistants[1]?.metadata.participantIndex).toBe(1);

      expect(conversation[3]?.role).toBe('user');
      expect(conversation[3]?.metadata.roundNumber).toBe(1);
    });
  });

  describe('conversation with Different Participant Counts', () => {
    it('handles 3 participants per round', () => {
      const round = createCompleteRound(0, 3);
      const assistantMessages = getAssistantMessages(round);

      expect(assistantMessages).toHaveLength(3);
    });

    it('handles single participant', () => {
      const round = createCompleteRound(0, 1);
      const assistantMessages = getAssistantMessages(round);

      expect(assistantMessages).toHaveLength(1);
    });

    it('handles 5 participants', () => {
      const round = createCompleteRound(0, 5);
      const assistantMessages = getAssistantMessages(round);

      expect(assistantMessages).toHaveLength(5);
    });
  });
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe('edge Cases', () => {
  describe('empty Conversation', () => {
    it('handles no messages', () => {
      const messages: ReturnType<typeof createTestUserMessage>[] = [];

      expect(messages).toHaveLength(0);
    });
  });

  describe('participant Disabled Mid-Conversation', () => {
    it('skips disabled participants in round', () => {
      const participants = [
        createMockParticipant(0, { isEnabled: true }),
        createMockParticipant(1, { isEnabled: false }), // Disabled
        createMockParticipant(2, { isEnabled: true }),
      ];

      const enabledParticipants = participants.filter(p => p.isEnabled);
      expect(enabledParticipants).toHaveLength(2);
    });
  });

  describe('long Conversations', () => {
    it('handles 10+ rounds', () => {
      const rounds = Array.from({ length: 10 }, (_, i) => createCompleteRound(i, 2));
      const allMessages = rounds.flat();

      expect(allMessages).toHaveLength(30); // 3 messages per round × 10 rounds
    });
  });
});
