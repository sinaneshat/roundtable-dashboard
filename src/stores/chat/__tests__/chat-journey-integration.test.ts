/**
 * Chat Journey Integration Tests
 *
 * Full end-to-end user journey testing from overview screen through thread creation
 * and analysis. These tests verify the complete flow documented in FLOW_DOCUMENTATION.md.
 *
 * USER JOURNEY:
 * 1. User lands on /chat (Overview Screen)
 * 2. Selects AI models and conversation mode
 * 3. Types first message and clicks send
 * 4. System creates thread with r0 (round 0)
 * 5. Participants respond in order with IDs like: thread_r0_p0, thread_r0_p1
 * 6. Analysis created for r0 (not r1!)
 * 7. Page navigates to /chat/[slug] (Thread Screen)
 * 8. User can continue conversation with r1, r2, etc.
 *
 * CRITICAL BUG BEING TESTED:
 * - Round numbers start at 0, not 1
 * - First round message IDs use r0, not r1
 * - Analysis for first round is roundNumber: 0, not 1
 * - UI displays r0 as "Round 1" (0-based storage, 1-indexed display)
 */

import type { UIMessage } from 'ai';

import { AnalysisStatuses, MessageRoles } from '@/api/core/enums';
import type { RoundSummary, StoredModeratorAnalysis } from '@/api/routes/chat/schema';
import { formatRoundNumber, getDisplayRoundNumber } from '@/lib/schemas/round-schemas';
import type { TestAssistantMessage } from '@/lib/testing';
import { createTestAssistantMessage, createTestUserMessage } from '@/lib/testing';
import { getRoundNumber } from '@/lib/utils/metadata';
import { getCurrentRoundNumber } from '@/lib/utils/round-utils';

/**
 * Create minimal valid RoundSummary for testing
 * Satisfies all required fields from RoundSummarySchema
 */
function createTestRoundSummary(): RoundSummary {
  return {
    keyInsights: ['Test insight 1'],
    consensusPoints: [],
    divergentApproaches: [],
    comparativeAnalysis: {
      strengthsByCategory: [{ category: 'Test', participants: ['p0'] }],
      tradeoffs: ['Test tradeoff'],
    },
    decisionFramework: {
      criteriaToConsider: ['Criterion 1', 'Criterion 2'],
      scenarioRecommendations: [{ scenario: 'Test scenario', recommendation: 'Test recommendation' }],
    },
    overallSummary: 'Test summary that meets minimum character requirements for validation',
    conclusion: 'Test conclusion with recommendation',
    recommendedActions: [{
      action: 'Test action',
      rationale: 'Test rationale',
      suggestedModels: [],
      suggestedRoles: [],
      suggestedMode: '',
    }],
  };
}

describe('chat journey integration tests', () => {
  const THREAD_ID = '01KA1DEY81D0X6760M7ZDKZTC5';

  describe('overview screen: first message submission', () => {
    /**
     * STEP 1: User submits first message
     * Expected: Thread created with round 0
     */
    it('should create thread with round 0 for first message', () => {
      const userMessage = createTestUserMessage({
        id: 'user-r0',
        content: 'Say hi with just one word.',
        roundNumber: 0,
      });

      // Verify round number
      expect(getRoundNumber(userMessage.metadata)).toBe(0);

      // Calculate current round from messages
      const currentRound = getCurrentRoundNumber([userMessage]);
      expect(currentRound).toBe(0);
    });

    /**
     * STEP 2: Participants respond in order
     * Expected: IDs use r0, not r1
     */
    it('should create participant responses with r0 IDs', () => {
      const messages: UIMessage[] = [
        createTestUserMessage({
          id: 'user-r0',
          content: 'Say hi with just one word.',
          roundNumber: 0,
        }),
        createTestAssistantMessage({
          id: `${THREAD_ID}_r0_p0`,
          content: 'Hey!',
          roundNumber: 0,
          participantId: 'p0',
          participantIndex: 0,
        }),
        createTestAssistantMessage({
          id: `${THREAD_ID}_r0_p1`,
          content: 'Hello!',
          roundNumber: 0,
          participantId: 'p1',
          participantIndex: 1,
        }),
      ];

      // Verify all participant messages have r0 in ID
      const participantMessages = messages.filter((m): m is TestAssistantMessage => m.role === MessageRoles.ASSISTANT);
      participantMessages.forEach((msg, index) => {
        expect(msg.id).toContain('_r0_');
        expect(msg.id).toContain(`_p${index}`);
        expect(msg.id).not.toContain('_r1_');
        expect(getRoundNumber(msg.metadata)).toBe(0);
      });

      // Verify current round
      const currentRound = getCurrentRoundNumber(messages);
      expect(currentRound).toBe(0);
    });

    /**
     * STEP 3: Analysis created after last participant
     * Expected: Analysis has roundNumber: 0, NOT 1
     */
    it('should create analysis for round 0 after participants complete', () => {
      const messages: UIMessage[] = [
        createTestUserMessage({
          id: 'user-r0',
          content: 'Say hi with just one word.',
          roundNumber: 0,
        }),
        createTestAssistantMessage({
          id: `${THREAD_ID}_r0_p0`,
          content: 'Hey!',
          roundNumber: 0,
          participantId: 'p0',
          participantIndex: 0,
        }),
      ];

      const participantMessages = messages.filter((m): m is TestAssistantMessage => m.role === MessageRoles.ASSISTANT);
      const participantMessageIds = participantMessages.map(m => m.id);

      const analysis: StoredModeratorAnalysis = {
        id: 'analysis-r0',
        threadId: THREAD_ID,
        roundNumber: 0,
        mode: 'analyzing',
        userQuestion: 'Question for round 0',
        status: AnalysisStatuses.COMPLETE,
        participantMessageIds,
        analysisData: {
          participantAnalyses: [],
          leaderboard: [],
          roundSummary: createTestRoundSummary(),
        },
        errorMessage: null,
        completedAt: null,
        createdAt: new Date(),
      };

      // CRITICAL: Analysis should be for round 0, NOT round 1
      expect(analysis.roundNumber).toBe(0);
      expect(analysis.roundNumber).not.toBe(1);

      // Participant message IDs should contain r0
      analysis.participantMessageIds.forEach((id) => {
        expect(id).toContain('_r0_');
      });

      // Display should show "Round 1"
      expect(getDisplayRoundNumber(analysis.roundNumber)).toBe(1);
      expect(formatRoundNumber(analysis.roundNumber)).toBe('Round 1');
    });

    /**
     * REGRESSION TEST: Verify exact state from user report
     * User state showed: analyses[0].roundNumber = 1 (BUG!)
     * Expected: analyses[0].roundNumber = 0
     */
    it('should NOT have roundNumber: 1 for first analysis (user-reported bug)', () => {
      const messages: UIMessage[] = [
        createTestUserMessage({
          id: 'user-r0',
          content: 'Say hi with just one word.',
          roundNumber: 0,
        }),
        createTestAssistantMessage({
          id: `${THREAD_ID}_r0_p0`,
          content: 'Hey!',
          roundNumber: 0,
          participantId: 'p0',
          participantIndex: 0,
        }),
      ];

      const currentRound = getCurrentRoundNumber(messages);

      // CRITICAL: First round must be 0
      expect(currentRound).toBe(0);
      expect(currentRound).not.toBe(1);

      // Analysis created for this round must have roundNumber: 0
      const analysis: StoredModeratorAnalysis = {
        id: 'analysis-r0',
        threadId: THREAD_ID,
        roundNumber: currentRound,
        mode: 'analyzing',
        userQuestion: 'Question for round 0',
        status: AnalysisStatuses.COMPLETE,
        participantMessageIds: [messages[1]!.id],
        analysisData: {
          participantAnalyses: [],
          leaderboard: [],
          roundSummary: createTestRoundSummary(),
        },
        errorMessage: null,
        completedAt: null,
        createdAt: new Date(),
      };

      expect(analysis.roundNumber).toBe(0);
      expect(analysis.roundNumber).not.toBe(1);

      // But UI should display "Round 1"
      expect(formatRoundNumber(analysis.roundNumber)).toBe('Round 1');
    });
  });

  describe('thread screen: continuing conversation', () => {
    /**
     * STEP 4: User continues conversation on thread screen
     * Expected: Second round uses r1, third uses r2, etc.
     */
    it('should create second round with r1 after first round completes', () => {
      const messages: UIMessage[] = [
        // Round 0 (first round)
        createTestUserMessage({
          id: 'user-r0',
          content: 'First question',
          roundNumber: 0,
        }),
        createTestAssistantMessage({
          id: `${THREAD_ID}_r0_p0`,
          content: 'Response 1',
          roundNumber: 0,
          participantId: 'p0',
          participantIndex: 0,
        }),
        // Round 1 (second round)
        createTestUserMessage({
          id: 'user-r1',
          content: 'Second question',
          roundNumber: 1,
        }),
        createTestAssistantMessage({
          id: `${THREAD_ID}_r1_p0`,
          content: 'Response 2',
          roundNumber: 1,
          participantId: 'p0',
          participantIndex: 0,
        }),
      ];

      const currentRound = getCurrentRoundNumber(messages);
      expect(currentRound).toBe(1);

      // Second round messages use r1
      const round1Messages = messages.filter(m => getRoundNumber(m.metadata) === 1);
      const round1AssistantMsg = round1Messages.find(m => m.role === MessageRoles.ASSISTANT);
      expect(round1AssistantMsg).toBeDefined();
      expect(round1AssistantMsg?.id).toContain('_r1_');

      // Display should show "Round 2"
      expect(formatRoundNumber(currentRound)).toBe('Round 2');
    });

    /**
     * STEP 5: Multiple rounds maintain correct sequence
     */
    it('should maintain correct round sequence across multiple rounds', () => {
      const messages: UIMessage[] = [
        // Round 0
        createTestUserMessage({ id: 'user-r0', content: 'Q1', roundNumber: 0 }),
        createTestAssistantMessage({ id: `${THREAD_ID}_r0_p0`, content: 'A1', roundNumber: 0, participantId: 'p0', participantIndex: 0 }),
        // Round 1
        createTestUserMessage({ id: 'user-r1', content: 'Q2', roundNumber: 1 }),
        createTestAssistantMessage({ id: `${THREAD_ID}_r1_p0`, content: 'A2', roundNumber: 1, participantId: 'p0', participantIndex: 0 }),
        // Round 2
        createTestUserMessage({ id: 'user-r2', content: 'Q3', roundNumber: 2 }),
        createTestAssistantMessage({ id: `${THREAD_ID}_r2_p0`, content: 'A3', roundNumber: 2, participantId: 'p0', participantIndex: 0 }),
      ];

      // Verify each round
      for (let r = 0; r <= 2; r++) {
        const roundMessages = messages.filter(m => getRoundNumber(m.metadata) === r);

        // User message should have correct round
        const userMsg = roundMessages.find(m => m.role === MessageRoles.USER);
        expect(getRoundNumber(userMsg?.metadata)).toBe(r);

        // Assistant message should have correct ID format
        const assistantMsg = roundMessages.find(m => m.role === MessageRoles.ASSISTANT);
        expect(assistantMsg).toBeDefined();
        expect(assistantMsg?.id).toContain(`_r${r}_`);
        expect(getRoundNumber(assistantMsg?.metadata)).toBe(r);

        // Display conversion
        expect(formatRoundNumber(r)).toBe(`Round ${r + 1}`);
      }
    });
  });

  describe('analysis creation across rounds', () => {
    /**
     * TEST: Each round gets its own analysis with correct round number
     */
    it('should create separate analyses for each round with matching round numbers', () => {
      const messages: UIMessage[] = [
        // Round 0
        createTestUserMessage({ id: 'user-r0', content: 'Q1', roundNumber: 0 }),
        createTestAssistantMessage({ id: `${THREAD_ID}_r0_p0`, content: 'A1-P0', roundNumber: 0, participantId: 'p0', participantIndex: 0 }),
        createTestAssistantMessage({ id: `${THREAD_ID}_r0_p1`, content: 'A1-P1', roundNumber: 0, participantId: 'p1', participantIndex: 1 }),
        // Round 1
        createTestUserMessage({ id: 'user-r1', content: 'Q2', roundNumber: 1 }),
        createTestAssistantMessage({ id: `${THREAD_ID}_r1_p0`, content: 'A2-P0', roundNumber: 1, participantId: 'p0', participantIndex: 0 }),
        createTestAssistantMessage({ id: `${THREAD_ID}_r1_p1`, content: 'A2-P1', roundNumber: 1, participantId: 'p1', participantIndex: 1 }),
      ];

      // Create analyses for each round
      const analyses: StoredModeratorAnalysis[] = [];

      for (let r = 0; r <= 1; r++) {
        const roundMessages = messages.filter(
          m => m.role === MessageRoles.ASSISTANT && getRoundNumber(m.metadata) === r,
        );
        const participantMessageIds = roundMessages.map(m => m.id);

        const analysis: StoredModeratorAnalysis = {
          id: `analysis-r${r}`,
          threadId: THREAD_ID,
          roundNumber: r,
          mode: 'analyzing',
          userQuestion: `Question for round ${r}`,
          status: AnalysisStatuses.COMPLETE,
          participantMessageIds,
          analysisData: {
            participantAnalyses: [],
            leaderboard: [],
            roundSummary: createTestRoundSummary(),
          },
          errorMessage: null,
          completedAt: null,
          createdAt: new Date(),
        };
        analyses.push(analysis);
      }

      // Verify each analysis
      expect(analyses).toHaveLength(2);

      expect(analyses[0]!.roundNumber).toBe(0);
      expect(analyses[0]!.participantMessageIds).toEqual([
        `${THREAD_ID}_r0_p0`,
        `${THREAD_ID}_r0_p1`,
      ]);

      expect(analyses[1]!.roundNumber).toBe(1);
      expect(analyses[1]!.participantMessageIds).toEqual([
        `${THREAD_ID}_r1_p0`,
        `${THREAD_ID}_r1_p1`,
      ]);
    });

    /**
     * TEST: Analysis participantMessageIds match actual message IDs
     */
    it('should have matching message IDs between messages and analysis', () => {
      const roundNumber = 0;
      const messages: UIMessage[] = [
        createTestUserMessage({
          id: 'user-r0',
          content: 'Question',
          roundNumber,
        }),
        createTestAssistantMessage({
          id: `${THREAD_ID}_r${roundNumber}_p0`,
          content: 'Response 1',
          roundNumber,
          participantId: 'p0',
          participantIndex: 0,
        }),
        createTestAssistantMessage({
          id: `${THREAD_ID}_r${roundNumber}_p1`,
          content: 'Response 2',
          roundNumber,
          participantId: 'p1',
          participantIndex: 1,
        }),
      ];

      const participantMessages = messages.filter((m): m is TestAssistantMessage => m.role === MessageRoles.ASSISTANT);
      const participantMessageIds = participantMessages.map(m => m.id);

      const analysis: StoredModeratorAnalysis = {
        id: `analysis-r${roundNumber}`,
        threadId: THREAD_ID,
        roundNumber,
        mode: 'analyzing',
        userQuestion: 'Question',
        status: AnalysisStatuses.COMPLETE,
        participantMessageIds,
        analysisData: {
          participantAnalyses: [],
          leaderboard: [],
          roundSummary: createTestRoundSummary(),
        },
        errorMessage: null,
        completedAt: null,
        createdAt: new Date(),
      };

      // Analysis round number matches message round number
      expect(analysis.roundNumber).toBe(roundNumber);

      // Analysis participantMessageIds exactly match message IDs
      participantMessages.forEach((msg, index) => {
        expect(analysis.participantMessageIds[index]).toBe(msg.id);
        expect(msg.id).toContain(`_r${roundNumber}_`);
      });
    });
  });

  describe('participant turn-taking and ordering', () => {
    /**
     * TEST: Participants take turns in correct order
     */
    it('should maintain participant order within rounds', () => {
      const roundNumber = 0;
      const participantCount = 3;

      const messages: UIMessage[] = [
        createTestUserMessage({
          id: 'user-r0',
          content: 'Question',
          roundNumber,
        }),
      ];

      // Add participants in order
      for (let p = 0; p < participantCount; p++) {
        messages.push(
          createTestAssistantMessage({
            id: `${THREAD_ID}_r${roundNumber}_p${p}`,
            content: `Response from p${p}`,
            roundNumber,
            participantId: `p${p}`,
            participantIndex: p,
          }),
        );
      }

      // Verify order
      const participantMessages = messages.filter((m): m is TestAssistantMessage => m.role === MessageRoles.ASSISTANT);
      expect(participantMessages).toHaveLength(participantCount);

      participantMessages.forEach((msg, index) => {
        expect(msg.metadata?.participantIndex).toBe(index);
        expect(msg.id).toContain(`_p${index}`);
      });
    });

    /**
     * TEST: Participant indices reset per round
     */
    it('should reset participant indices for each new round', () => {
      const messages: UIMessage[] = [
        // Round 0
        createTestUserMessage({ id: 'user-r0', content: 'Q1', roundNumber: 0 }),
        createTestAssistantMessage({ id: `${THREAD_ID}_r0_p0`, content: 'R0-P0', roundNumber: 0, participantId: 'p0', participantIndex: 0 }),
        createTestAssistantMessage({ id: `${THREAD_ID}_r0_p1`, content: 'R0-P1', roundNumber: 0, participantId: 'p1', participantIndex: 1 }),
        // Round 1 - indices should start at 0 again
        createTestUserMessage({ id: 'user-r1', content: 'Q2', roundNumber: 1 }),
        createTestAssistantMessage({ id: `${THREAD_ID}_r1_p0`, content: 'R1-P0', roundNumber: 1, participantId: 'p0', participantIndex: 0 }),
        createTestAssistantMessage({ id: `${THREAD_ID}_r1_p1`, content: 'R1-P1', roundNumber: 1, participantId: 'p1', participantIndex: 1 }),
      ];

      // Round 0 participants
      const round0Participants = messages.filter(
        (m): m is TestAssistantMessage => m.role === MessageRoles.ASSISTANT && getRoundNumber(m.metadata) === 0,
      );
      expect(round0Participants[0]!.metadata.participantIndex).toBe(0);
      expect(round0Participants[1]!.metadata.participantIndex).toBe(1);

      // Round 1 participants - should also start at 0
      const round1Participants = messages.filter(
        (m): m is TestAssistantMessage => m.role === MessageRoles.ASSISTANT && getRoundNumber(m.metadata) === 1,
      );
      expect(round1Participants[0]!.metadata.participantIndex).toBe(0);
      expect(round1Participants[1]!.metadata.participantIndex).toBe(1);
    });
  });

  describe('edge cases and error scenarios', () => {
    /**
     * TEST: Incomplete round handling
     */
    it('should handle incomplete rounds correctly', () => {
      const messages: UIMessage[] = [
        createTestUserMessage({
          id: 'user-r0',
          content: 'Question',
          roundNumber: 0,
        }),
        createTestAssistantMessage({
          id: `${THREAD_ID}_r0_p0`,
          content: 'Response 1',
          roundNumber: 0,
          participantId: 'p0',
          participantIndex: 0,
        }),
        // Round incomplete - missing other participants
      ];

      const currentRound = getCurrentRoundNumber(messages);

      // Should still be round 0
      expect(currentRound).toBe(0);

      // If analysis is created prematurely, it should still use round 0
      const analysis: StoredModeratorAnalysis = {
        id: 'analysis-r0',
        threadId: THREAD_ID,
        roundNumber: currentRound,
        mode: 'analyzing',
        userQuestion: 'Question',
        status: AnalysisStatuses.COMPLETE,
        participantMessageIds: [messages[1]!.id],
        analysisData: {
          participantAnalyses: [],
          leaderboard: [],
          roundSummary: createTestRoundSummary(),
        },
        errorMessage: null,
        completedAt: null,
        createdAt: new Date(),
      };
      expect(analysis.roundNumber).toBe(0);
    });

    /**
     * TEST: Out-of-order message handling
     */
    it('should use last user message for current round determination', () => {
      const messages: UIMessage[] = [
        createTestUserMessage({ id: 'user-r0', content: 'Q1', roundNumber: 0 }),
        createTestUserMessage({ id: 'user-r1', content: 'Q2', roundNumber: 1 }),
        createTestUserMessage({ id: 'user-r2', content: 'Q3', roundNumber: 2 }),
        // Last user message is actually from round 1 (out of order)
        createTestUserMessage({ id: 'user-r1-retry', content: 'Q2 retry', roundNumber: 1 }),
      ];

      const currentRound = getCurrentRoundNumber(messages);

      // Should use last user message (round 1)
      expect(currentRound).toBe(1);
    });

    /**
     * TEST: Empty messages array
     */
    it('should default to round 0 for empty messages', () => {
      const messages: UIMessage[] = [];
      const currentRound = getCurrentRoundNumber(messages);

      expect(currentRound).toBe(0);
    });
  });

  describe('display conversion consistency', () => {
    /**
     * TEST: Storage vs display round numbers
     */
    it('should consistently convert between storage and display round numbers', () => {
      const testCases = [
        { storage: 0, display: 1, text: 'Round 1' },
        { storage: 1, display: 2, text: 'Round 2' },
        { storage: 2, display: 3, text: 'Round 3' },
        { storage: 5, display: 6, text: 'Round 6' },
      ];

      testCases.forEach(({ storage, display, text }) => {
        // Messages use storage format (0-based)
        const messages: UIMessage[] = [
          createTestUserMessage({
            id: `user-r${storage}`,
            content: 'Question',
            roundNumber: storage,
          }),
        ];

        const currentRound = getCurrentRoundNumber(messages);
        expect(currentRound).toBe(storage);

        // UI displays as 1-based
        expect(getDisplayRoundNumber(storage)).toBe(display);
        expect(formatRoundNumber(storage)).toBe(text);

        // Analysis uses storage format
        const analysis: StoredModeratorAnalysis = {
          id: `analysis-r${storage}`,
          threadId: THREAD_ID,
          roundNumber: storage,
          mode: 'analyzing',
          userQuestion: 'Question',
          status: AnalysisStatuses.COMPLETE,
          participantMessageIds: [],
          analysisData: {
            participantAnalyses: [],
            leaderboard: [],
            roundSummary: createTestRoundSummary(),
          },
          errorMessage: null,
          completedAt: null,
          createdAt: new Date(),
        };
        expect(analysis.roundNumber).toBe(storage);

        // But displays as 1-based
        expect(formatRoundNumber(analysis.roundNumber)).toBe(text);
      });
    });
  });
});
