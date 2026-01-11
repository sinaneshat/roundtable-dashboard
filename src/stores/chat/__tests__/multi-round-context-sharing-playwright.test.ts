/**
 * Multi-Round Message Context Sharing E2E Tests
 *
 * Tests message context sharing within and across rounds as documented in
 * FLOW_DOCUMENTATION.md Part 8: Key Behavioral Patterns - Message Context Sharing
 *
 * Key behaviors tested:
 * - Within same round: Each AI sees previous AI responses
 * - Across rounds: All AIs see complete history from all previous rounds
 * - Pre-search context: Current round gets full results, previous rounds get summary
 * - Context accumulation across 5+ rounds
 *
 * Per FLOW_DOCUMENTATION.md Part 8:
 * "Within Same Round: Second AI sees user's question + first AI's response"
 * "Across Rounds: All AIs see complete history from all previous rounds"
 * "System automatically includes relevant context from past discussion"
 */

import { describe, expect, it } from 'vitest';

import { FinishReasons, MessageStatuses, UIMessageRoles } from '@/api/core/enums';
import type { StoredPreSearch } from '@/api/routes/chat/schema';
import type { TestAssistantMessage, TestUserMessage } from '@/lib/testing';
import {
  createMockStoredPreSearch,
  createTestAssistantMessage,
  createTestUserMessage,
} from '@/lib/testing';

// ============================================================================
// TYPES
// ============================================================================

type MessageContext = {
  userMessages: TestUserMessage[];
  assistantMessages: TestAssistantMessage[];
  preSearchResults?: StoredPreSearch[];
};

type ParticipantContext = {
  participantIndex: number;
  roundNumber: number;
  availableContext: MessageContext;
};

type RoundHistory = {
  roundNumber: number;
  messages: Array<TestUserMessage | TestAssistantMessage>;
  preSearch?: StoredPreSearch;
};

type ConversationHistory = {
  threadId: string;
  rounds: RoundHistory[];
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function createConversationHistory(threadId: string): ConversationHistory {
  return {
    threadId,
    rounds: [],
  };
}

function addRoundToHistory(
  history: ConversationHistory,
  roundNumber: number,
  userMessage: string,
  participantResponses: string[],
  preSearch?: StoredPreSearch,
): ConversationHistory {
  const messages: Array<TestUserMessage | TestAssistantMessage> = [];

  // Add user message
  messages.push(createTestUserMessage({
    id: `${history.threadId}_r${roundNumber}_user`,
    content: userMessage,
    roundNumber,
  }));

  // Add participant messages
  participantResponses.forEach((response, index) => {
    messages.push(createTestAssistantMessage({
      id: `${history.threadId}_r${roundNumber}_p${index}`,
      content: response,
      roundNumber,
      participantId: `participant-${index}`,
      participantIndex: index,
      finishReason: FinishReasons.STOP,
    }));
  });

  const round: RoundHistory = {
    roundNumber,
    messages,
    preSearch,
  };

  return {
    ...history,
    rounds: [...history.rounds, round],
  };
}

/**
 * Get context available to a specific participant at a specific round
 * This simulates what the backend would send to the AI model
 */
function getParticipantContext(
  history: ConversationHistory,
  roundNumber: number,
  participantIndex: number,
): ParticipantContext {
  const availableContext: MessageContext = {
    userMessages: [],
    assistantMessages: [],
    preSearchResults: [],
  };

  // Get all messages from previous rounds
  history.rounds.forEach((round) => {
    if (round.roundNumber < roundNumber) {
      round.messages.forEach((msg) => {
        if (msg.role === UIMessageRoles.USER) {
          availableContext.userMessages.push(msg);
        } else if (msg.role === UIMessageRoles.ASSISTANT) {
          availableContext.assistantMessages.push(msg);
        }
      });

      if (round.preSearch) {
        availableContext.preSearchResults?.push(round.preSearch);
      }
    }
  });

  // Get messages from current round (up to current participant)
  const currentRound = history.rounds.find(r => r.roundNumber === roundNumber);
  if (currentRound) {
    currentRound.messages.forEach((msg) => {
      if (msg.role === UIMessageRoles.USER) {
        availableContext.userMessages.push(msg);
      } else if (msg.role === UIMessageRoles.ASSISTANT && msg.metadata.participantIndex !== undefined && msg.metadata.participantIndex < participantIndex) {
        availableContext.assistantMessages.push(msg);
      }
    });

    if (currentRound.preSearch) {
      availableContext.preSearchResults?.push(currentRound.preSearch);
    }
  }

  return {
    participantIndex,
    roundNumber,
    availableContext,
  };
}

function getAllMessagesForRound(history: ConversationHistory, roundNumber: number): Array<TestUserMessage | TestAssistantMessage> {
  const round = history.rounds.find(r => r.roundNumber === roundNumber);
  return round?.messages || [];
}

// ============================================================================
// TESTS
// ============================================================================

describe('multi-Round Message Context Sharing E2E', () => {
  describe('within Same Round Context', () => {
    it('should verify Participant 1 receives Participant 0 message in context', () => {
      const history = createConversationHistory('thread-123');

      // Simulate Round 0 with 2 participants
      const participant0Response = 'I think approach A is best because of scalability.';
      const participant1Response = 'Building on the previous point about scalability...';

      // Add Round 0
      const updatedHistory = addRoundToHistory(
        history,
        0,
        'What is the best approach?',
        [participant0Response, participant1Response],
      );

      // Get context for Participant 1 (index 1)
      const p1Context = getParticipantContext(updatedHistory, 0, 1);

      // Participant 1 should see:
      // - User message (Round 0)
      // - Participant 0 response (Round 0)
      expect(p1Context.availableContext.userMessages).toHaveLength(1);
      expect(p1Context.availableContext.assistantMessages).toHaveLength(1);
      expect(p1Context.availableContext.assistantMessages[0]?.parts[0]?.text).toBe(participant0Response);
    });

    it('should verify Participant 2 receives Participant 0+1 messages in context', () => {
      const history = createConversationHistory('thread-123');

      const participant0Response = 'First response';
      const participant1Response = 'Second response';
      const participant2Response = 'Third response referencing both previous';

      const updatedHistory = addRoundToHistory(
        history,
        0,
        'Question',
        [participant0Response, participant1Response, participant2Response],
      );

      // Get context for Participant 2 (index 2)
      const p2Context = getParticipantContext(updatedHistory, 0, 2);

      // Participant 2 should see:
      // - User message (Round 0)
      // - Participant 0 response (Round 0)
      // - Participant 1 response (Round 0)
      expect(p2Context.availableContext.userMessages).toHaveLength(1);
      expect(p2Context.availableContext.assistantMessages).toHaveLength(2);
      expect(p2Context.availableContext.assistantMessages[0]?.parts[0]?.text).toBe(participant0Response);
      expect(p2Context.availableContext.assistantMessages[1]?.parts[0]?.text).toBe(participant1Response);
    });

    it('should verify Participant 0 sees only user message (no previous participants)', () => {
      const history = createConversationHistory('thread-123');

      const updatedHistory = addRoundToHistory(
        history,
        0,
        'Question',
        ['Response 0', 'Response 1'],
      );

      // Get context for Participant 0 (index 0)
      const p0Context = getParticipantContext(updatedHistory, 0, 0);

      // Participant 0 should see:
      // - User message (Round 0)
      // - NO assistant messages (first to respond)
      expect(p0Context.availableContext.userMessages).toHaveLength(1);
      expect(p0Context.availableContext.assistantMessages).toHaveLength(0);
    });

    it('should verify 5 participants see cumulative context within round', () => {
      const history = createConversationHistory('thread-123');

      const responses = [
        'Response 0',
        'Response 1',
        'Response 2',
        'Response 3',
        'Response 4',
      ];

      const updatedHistory = addRoundToHistory(history, 0, 'Question', responses);

      // Check each participant's context
      for (let i = 0; i < responses.length; i++) {
        const context = getParticipantContext(updatedHistory, 0, i);
        expect(context.availableContext.userMessages).toHaveLength(1);
        expect(context.availableContext.assistantMessages).toHaveLength(i); // Sees all previous
      }
    });
  });

  describe('across Rounds Context', () => {
    it('should verify Round 1 participants receive all Round 0 messages', () => {
      let history = createConversationHistory('thread-123');

      // Complete Round 0
      history = addRoundToHistory(
        history,
        0,
        'Round 0 question',
        ['Round 0 response A', 'Round 0 response B'],
      );

      // Start Round 1
      history = addRoundToHistory(
        history,
        1,
        'Round 1 question',
        ['Round 1 response A'],
      );

      // Get context for Round 1 Participant 0
      const r1p0Context = getParticipantContext(history, 1, 0);

      // Should see all of Round 0 + current user message
      expect(r1p0Context.availableContext.userMessages).toHaveLength(2); // R0 user + R1 user
      expect(r1p0Context.availableContext.assistantMessages).toHaveLength(2); // Both R0 responses
    });

    it('should verify Round 2 participants receive Round 0 + Round 1 messages', () => {
      let history = createConversationHistory('thread-123');

      // Complete Round 0
      history = addRoundToHistory(history, 0, 'Q0', ['R0 response 0', 'R0 response 1']);

      // Complete Round 1
      history = addRoundToHistory(history, 1, 'Q1', ['R1 response 0', 'R1 response 1']);

      // Start Round 2
      history = addRoundToHistory(history, 2, 'Q2', ['R2 response 0']);

      // Get context for Round 2 Participant 0
      const r2p0Context = getParticipantContext(history, 2, 0);

      // Should see all previous rounds
      expect(r2p0Context.availableContext.userMessages).toHaveLength(3); // R0, R1, R2 user messages
      expect(r2p0Context.availableContext.assistantMessages).toHaveLength(4); // R0 (2) + R1 (2)
    });

    it('should verify 5-round conversation has cumulative context', () => {
      let history = createConversationHistory('thread-123');

      // Complete 5 rounds, each with 2 participants
      for (let round = 0; round < 5; round++) {
        history = addRoundToHistory(
          history,
          round,
          `Question ${round}`,
          [`Response ${round}A`, `Response ${round}B`],
        );
      }

      // Get context for last round (Round 4) Participant 0
      const r4p0Context = getParticipantContext(history, 4, 0);

      // Should see all previous rounds
      expect(r4p0Context.availableContext.userMessages).toHaveLength(5); // All 5 user messages
      expect(r4p0Context.availableContext.assistantMessages).toHaveLength(8); // Rounds 0-3 (8 responses)
    });

    it('should verify context includes message metadata (round numbers, participant IDs)', () => {
      let history = createConversationHistory('thread-123');

      history = addRoundToHistory(history, 0, 'Q0', ['R0']);
      history = addRoundToHistory(history, 1, 'Q1', ['R1']);

      const r1p0Context = getParticipantContext(history, 1, 0);

      // Verify metadata preserved
      const round0Message = r1p0Context.availableContext.assistantMessages.find(
        m => m.metadata.roundNumber === 0,
      );
      expect(round0Message).toBeDefined();
      expect(round0Message?.metadata.roundNumber).toBe(0);
      expect(round0Message?.metadata.participantId).toBe('participant-0');
    });
  });

  describe('pre-Search Context Distribution', () => {
    it('should provide full web results to current round participants', () => {
      let history = createConversationHistory('thread-123');

      const preSearch = createMockStoredPreSearch(0, MessageStatuses.COMPLETE);
      history = addRoundToHistory(history, 0, 'Search query', ['Response 0'], preSearch);

      const r0p0Context = getParticipantContext(history, 0, 0);

      // Current round participant gets full pre-search
      expect(r0p0Context.availableContext.preSearchResults).toHaveLength(1);
      expect(r0p0Context.availableContext.preSearchResults?.[0]?.searchData).toBeDefined();
      expect(r0p0Context.availableContext.preSearchResults?.[0]?.roundNumber).toBe(0);
    });

    it('should provide pre-search results from all previous rounds', () => {
      let history = createConversationHistory('thread-123');

      // Round 0 with pre-search
      const preSearch0 = createMockStoredPreSearch(0, MessageStatuses.COMPLETE);
      history = addRoundToHistory(history, 0, 'Q0', ['R0'], preSearch0);

      // Round 1 with pre-search
      const preSearch1 = createMockStoredPreSearch(1, MessageStatuses.COMPLETE);
      history = addRoundToHistory(history, 1, 'Q1', ['R1'], preSearch1);

      // Round 2 without pre-search
      history = addRoundToHistory(history, 2, 'Q2', ['R2']);

      const r2p0Context = getParticipantContext(history, 2, 0);

      // Should see both previous pre-searches
      expect(r2p0Context.availableContext.preSearchResults).toHaveLength(2);
      expect(r2p0Context.availableContext.preSearchResults?.map(ps => ps.roundNumber)).toEqual([0, 1]);
    });

    it('should differentiate current round vs historical pre-search (placeholder)', () => {
      // In real implementation, current round pre-search would include full website content
      // Historical pre-search would include only summary/analysis
      // This test verifies the data structure supports this differentiation

      let history = createConversationHistory('thread-123');

      const preSearch0 = createMockStoredPreSearch(0, MessageStatuses.COMPLETE);
      history = addRoundToHistory(history, 0, 'Q0', ['R0'], preSearch0);

      const preSearch1 = createMockStoredPreSearch(1, MessageStatuses.COMPLETE);
      history = addRoundToHistory(history, 1, 'Q1', ['R1'], preSearch1);

      const r1p0Context = getParticipantContext(history, 1, 0);

      // Round 1 participant sees:
      // - Round 0 pre-search (historical - summary only in real impl)
      // - Round 1 pre-search (current - full content in real impl)
      const currentRoundPreSearch = r1p0Context.availableContext.preSearchResults?.find(ps => ps.roundNumber === 1);
      const historicalPreSearch = r1p0Context.availableContext.preSearchResults?.find(ps => ps.roundNumber === 0);

      expect(currentRoundPreSearch).toBeDefined();
      expect(historicalPreSearch).toBeDefined();

      // Both exist in context - backend would format differently
      expect(r1p0Context.availableContext.preSearchResults).toHaveLength(2);
    });
  });

  describe('context Truncation and Limits', () => {
    it('should handle large message history across 10+ rounds', () => {
      let history = createConversationHistory('thread-123');

      // Create 15 rounds with 3 participants each
      for (let round = 0; round < 15; round++) {
        history = addRoundToHistory(
          history,
          round,
          `Question ${round}`,
          [`Response ${round}A`, `Response ${round}B`, `Response ${round}C`],
        );
      }

      // Get context for last round
      const r14p0Context = getParticipantContext(history, 14, 0);

      // Should have all previous messages
      expect(r14p0Context.availableContext.userMessages).toHaveLength(15);
      expect(r14p0Context.availableContext.assistantMessages).toHaveLength(42); // 14 rounds * 3 participants

      // In real implementation, backend would handle truncation based on token limits
    });

    it('should maintain chronological order across rounds', () => {
      let history = createConversationHistory('thread-123');

      history = addRoundToHistory(history, 0, 'Q0', ['R0A', 'R0B']);
      history = addRoundToHistory(history, 1, 'Q1', ['R1A', 'R1B']);
      history = addRoundToHistory(history, 2, 'Q2', ['R2A', 'R2B']);

      const r2p0Context = getParticipantContext(history, 2, 0);

      // Verify chronological order
      const allMessages = [
        ...r2p0Context.availableContext.userMessages,
        ...r2p0Context.availableContext.assistantMessages,
      ].sort((a, b) => a.metadata.roundNumber - b.metadata.roundNumber);

      // Round numbers should be in order
      const roundNumbers = allMessages.map(m => m.metadata.roundNumber);
      expect(roundNumbers).toEqual([0, 0, 0, 1, 1, 1, 2]);
    });

    it('should handle empty rounds (no participant responses - error scenario)', () => {
      let history = createConversationHistory('thread-123');

      // Round 0 completes normally
      history = addRoundToHistory(history, 0, 'Q0', ['R0']);

      // Round 1 has user message but no participant responses (all failed)
      history = addRoundToHistory(history, 1, 'Q1', []);

      // Round 2 starts
      history = addRoundToHistory(history, 2, 'Q2', ['R2']);

      const r2p0Context = getParticipantContext(history, 2, 0);

      // Should see both user messages, but only R0 and R2 assistant messages
      expect(r2p0Context.availableContext.userMessages).toHaveLength(3);
      expect(r2p0Context.availableContext.assistantMessages).toHaveLength(1); // Only R0 succeeded
    });
  });

  describe('message Order Verification', () => {
    it('should maintain correct order within round (sequential participants)', () => {
      const history = createConversationHistory('thread-123');

      const updatedHistory = addRoundToHistory(
        history,
        0,
        'Question',
        ['First', 'Second', 'Third'],
      );

      const messages = getAllMessagesForRound(updatedHistory, 0);
      const assistantMessages = messages.filter(m => m.role === UIMessageRoles.ASSISTANT) as TestAssistantMessage[];

      // Verify order by participant index
      expect(assistantMessages[0]?.metadata.participantIndex).toBe(0);
      expect(assistantMessages[1]?.metadata.participantIndex).toBe(1);
      expect(assistantMessages[2]?.metadata.participantIndex).toBe(2);

      // Verify content order
      expect(assistantMessages[0]?.parts[0]?.text).toBe('First');
      expect(assistantMessages[1]?.parts[0]?.text).toBe('Second');
      expect(assistantMessages[2]?.parts[0]?.text).toBe('Third');
    });

    it('should maintain correct order across rounds', () => {
      let history = createConversationHistory('thread-123');

      history = addRoundToHistory(history, 0, 'Q0', ['R0A']);
      history = addRoundToHistory(history, 1, 'Q1', ['R1A']);
      history = addRoundToHistory(history, 2, 'Q2', ['R2A']);

      // Verify round order
      expect(history.rounds[0]?.roundNumber).toBe(0);
      expect(history.rounds[1]?.roundNumber).toBe(1);
      expect(history.rounds[2]?.roundNumber).toBe(2);

      // Verify messages are grouped by round
      const allR0Messages = getAllMessagesForRound(history, 0);
      const allR1Messages = getAllMessagesForRound(history, 1);
      const allR2Messages = getAllMessagesForRound(history, 2);

      expect(allR0Messages.every(m => m.metadata.roundNumber === 0)).toBe(true);
      expect(allR1Messages.every(m => m.metadata.roundNumber === 1)).toBe(true);
      expect(allR2Messages.every(m => m.metadata.roundNumber === 2)).toBe(true);
    });
  });

  describe('context Edge Cases', () => {
    it('should handle participant added mid-conversation sees all previous context', () => {
      let history = createConversationHistory('thread-123');

      // Round 0: 2 participants
      history = addRoundToHistory(history, 0, 'Q0', ['R0 from P0', 'R0 from P1']);

      // Round 1: 3 participants (P2 added)
      history = addRoundToHistory(history, 1, 'Q1', ['R1 from P0', 'R1 from P1', 'R1 from P2']);

      // Get context for new Participant 2 in Round 1
      const r1p2Context = getParticipantContext(history, 1, 2);

      // New participant should see:
      // - All Round 0 messages
      // - Round 1 user message
      // - Round 1 Participant 0 and 1 responses
      expect(r1p2Context.availableContext.userMessages).toHaveLength(2);
      expect(r1p2Context.availableContext.assistantMessages).toHaveLength(4); // 2 from R0 + 2 from R1
    });

    it('should handle participant removed - context still includes their historical messages', () => {
      let history = createConversationHistory('thread-123');

      // Round 0: 3 participants
      history = addRoundToHistory(history, 0, 'Q0', ['R0P0', 'R0P1', 'R0P2']);

      // Round 1: 2 participants (P2 removed)
      history = addRoundToHistory(history, 1, 'Q1', ['R1P0', 'R1P1']);

      // Get context for Round 1 Participant 1
      const r1p1Context = getParticipantContext(history, 1, 1);

      // Should still see removed participant's Round 0 response
      expect(r1p1Context.availableContext.assistantMessages).toHaveLength(4); // 3 from R0 + 1 from R1
      const removedParticipantMessage = r1p1Context.availableContext.assistantMessages.find(
        m => m.metadata.participantIndex === 2,
      );
      expect(removedParticipantMessage).toBeDefined();
      expect(removedParticipantMessage?.metadata.roundNumber).toBe(0);
    });

    it('should handle regenerated round - old messages replaced with new context', () => {
      let history = createConversationHistory('thread-123');

      // Round 0: Initial responses
      history = addRoundToHistory(history, 0, 'Q0', ['Original R0P0', 'Original R0P1']);

      // Round 0: Regenerated (simulated by removing and re-adding)
      // In real implementation, messages would be deleted and recreated
      history.rounds[0]!.messages = history.rounds[0]!.messages.filter(m => m.role === UIMessageRoles.USER);
      history.rounds[0]!.messages.push(
        createTestAssistantMessage({
          id: 'thread-123_r0_p0_retry',
          content: 'Regenerated R0P0',
          roundNumber: 0,
          participantId: 'participant-0',
          participantIndex: 0,
          finishReason: FinishReasons.STOP,
        }),
        createTestAssistantMessage({
          id: 'thread-123_r0_p1_retry',
          content: 'Regenerated R0P1',
          roundNumber: 0,
          participantId: 'participant-1',
          participantIndex: 1,
          finishReason: FinishReasons.STOP,
        }),
      );

      // Round 1: Should see regenerated content
      history = addRoundToHistory(history, 1, 'Q1', ['R1P0']);

      const r1p0Context = getParticipantContext(history, 1, 0);
      const round0Messages = r1p0Context.availableContext.assistantMessages.filter(
        m => m.metadata.roundNumber === 0,
      );

      expect(round0Messages).toHaveLength(2);
      expect(round0Messages[0]?.parts[0]?.text).toBe('Regenerated R0P0');
      expect(round0Messages[1]?.parts[0]?.text).toBe('Regenerated R0P1');
    });
  });
});
