/**
 * Analysis Round Number Tests
 *
 * CRITICAL BUG VERIFICATION:
 * User reported: "Analysis round number is always +1 number ahead of expected round number"
 * - Initial round shows up as "round 2" on UI instead of expected "round 1"
 * - r0 is not made and r1 is sent to analyze object stream for the round analysis
 *
 * EXPECTED BEHAVIOR (0-based indexing):
 * - First round: r0 (storage) → "Round 1" (display)
 * - Analysis created for r0 should have roundNumber: 0
 * - UI should display "Round 1" when showing round 0 analysis
 *
 * These tests verify that:
 * 1. Analysis is created with correct round number matching messages
 * 2. Round display conversion works correctly (0 → "Round 1")
 * 3. No off-by-one errors in analysis creation
 */

import { AnalysisStatuses, MessageRoles } from '@/api/core/enums';
import type { ModeratorAnalysisPayload, StoredModeratorAnalysis } from '@/api/routes/chat/schema';
import { formatRoundNumber, getDisplayRoundNumber } from '@/lib/schemas/round-schemas';
import type { TestAssistantMessage, TestUserMessage } from '@/lib/testing';
import { createTestAssistantMessage, createTestUserMessage } from '@/lib/testing';
import { getCurrentRoundNumber } from '@/lib/utils/round-utils';

describe('analysis round number behavior', () => {
  describe('round number assignment for analysis', () => {
    /**
     * TEST CASE 1: First round analysis
     * Verifies that when first round completes (round 0), analysis is created with roundNumber: 0
     */
    it('should create analysis for round 0 when first round completes', () => {
      const messages: (TestUserMessage | TestAssistantMessage)[] = [
        createTestUserMessage({
          id: 'user-1',
          content: 'First question',
          roundNumber: 0,
        }),
        createTestAssistantMessage({
          id: 'assistant-1',
          content: 'Response from participant 1',
          roundNumber: 0,
          participantId: 'p0',
          participantIndex: 0,
        }),
        createTestAssistantMessage({
          id: 'assistant-2',
          content: 'Response from participant 2',
          roundNumber: 0,
          participantId: 'p1',
          participantIndex: 1,
        }),
      ];

      // Get current round from messages
      const currentRound = getCurrentRoundNumber(messages);

      // ASSERTION: First round should be 0 (not 1)
      expect(currentRound).toBe(0);

      // Analysis creation payload should use round 0
      const analysisPayload: Pick<ModeratorAnalysisPayload, 'roundNumber' | 'mode' | 'userQuestion'> = {
        roundNumber: currentRound,
        mode: 'analyzing',
        userQuestion: 'First question',
      };

      // ASSERTION: Analysis should be created for round 0
      expect(analysisPayload.roundNumber).toBe(0);

      // Display should show "Round 1"
      expect(formatRoundNumber(currentRound)).toBe('Round 1');
      expect(getDisplayRoundNumber(currentRound)).toBe(1);
    });

    /**
     * TEST CASE 2: Second round analysis
     * Verifies that second round (round 1) creates analysis with correct round number
     */
    it('should create analysis for round 1 when second round completes', () => {
      const messages: (TestUserMessage | TestAssistantMessage)[] = [
        // Round 0
        createTestUserMessage({ id: 'u1', content: 'Q1', roundNumber: 0 }),
        createTestAssistantMessage({ id: 'a1', content: 'A1', roundNumber: 0, participantId: 'p0', participantIndex: 0 }),
        createTestAssistantMessage({ id: 'a2', content: 'A2', roundNumber: 0, participantId: 'p1', participantIndex: 1 }),
        // Round 1
        createTestUserMessage({ id: 'u2', content: 'Q2', roundNumber: 1 }),
        createTestAssistantMessage({ id: 'a3', content: 'A3', roundNumber: 1, participantId: 'p0', participantIndex: 0 }),
        createTestAssistantMessage({ id: 'a4', content: 'A4', roundNumber: 1, participantId: 'p1', participantIndex: 1 }),
      ];

      const currentRound = getCurrentRoundNumber(messages);

      // ASSERTION: Second round should be 1 (not 2)
      expect(currentRound).toBe(1);

      // Analysis should be created for round 1
      const analysisPayload: Pick<ModeratorAnalysisPayload, 'roundNumber'> = {
        roundNumber: currentRound,
      };

      expect(analysisPayload.roundNumber).toBe(1);

      // Display should show "Round 2"
      expect(formatRoundNumber(currentRound)).toBe('Round 2');
      expect(getDisplayRoundNumber(currentRound)).toBe(2);
    });

    /**
     * TEST CASE 3: Analysis retrieval and display
     * Verifies that stored analysis has correct round number and displays correctly
     */
    it('should display analysis with correct round number', () => {
      const storedAnalysis: Pick<StoredModeratorAnalysis, 'id' | 'threadId' | 'roundNumber' | 'mode' | 'userQuestion' | 'status'> = {
        id: 'analysis-1',
        threadId: 'thread-1',
        roundNumber: 0, // First round (0-based)
        mode: 'analyzing',
        userQuestion: 'Test question',
        status: AnalysisStatuses.COMPLETE,
      };

      // ASSERTION: Storage uses 0-based indexing
      expect(storedAnalysis.roundNumber).toBe(0);

      // ASSERTION: Display should show "Round 1"
      expect(formatRoundNumber(storedAnalysis.roundNumber)).toBe('Round 1');
      expect(getDisplayRoundNumber(storedAnalysis.roundNumber)).toBe(1);
    });

    /**
     * TEST CASE 4: Multiple rounds - verify no off-by-one errors
     * Tests that analysis round numbers match message round numbers across multiple rounds
     */
    it('should maintain correct round numbers across multiple rounds', () => {
      const rounds = [
        { roundNumber: 0, displayRound: 'Round 1' },
        { roundNumber: 1, displayRound: 'Round 2' },
        { roundNumber: 2, displayRound: 'Round 3' },
        { roundNumber: 3, displayRound: 'Round 4' },
      ];

      rounds.forEach(({ roundNumber, displayRound }) => {
        // Create messages for this round
        const messages: (TestUserMessage | TestAssistantMessage)[] = [];

        // Add all previous rounds + current round
        for (let r = 0; r <= roundNumber; r++) {
          messages.push(createTestUserMessage({
            id: `user-r${r}`,
            content: `Question ${r}`,
            roundNumber: r,
          }));
          messages.push(createTestAssistantMessage({
            id: `assistant-r${r}`,
            content: `Response ${r}`,
            roundNumber: r,
            participantId: 'p0',
            participantIndex: 0,
          }));
        }

        const currentRound = getCurrentRoundNumber(messages);

        // ASSERTION: Current round should match expected round number
        expect(currentRound).toBe(roundNumber);

        // ASSERTION: Display should match expected format
        expect(formatRoundNumber(currentRound)).toBe(displayRound);

        // ASSERTION: Analysis should be created with same round number
        const analysisRound = currentRound;
        expect(analysisRound).toBe(roundNumber);
      });
    });
  });

  describe('analysis round number edge cases', () => {
    /**
     * TEST CASE 5: Empty messages array
     * Verifies behavior when no messages exist
     */
    it('should handle empty messages array correctly', () => {
      const messages: (TestUserMessage | TestAssistantMessage)[] = [];
      const currentRound = getCurrentRoundNumber(messages);

      // Should default to round 0
      expect(currentRound).toBe(0);
      expect(formatRoundNumber(currentRound)).toBe('Round 1');
    });

    /**
     * TEST CASE 6: Incomplete round
     * Verifies that analysis uses correct round number even when round is incomplete
     */
    it('should use correct round number for incomplete rounds', () => {
      const messages: (TestUserMessage | TestAssistantMessage)[] = [
        createTestUserMessage({
          id: 'user-1',
          content: 'Question',
          roundNumber: 0,
        }),
        createTestAssistantMessage({
          id: 'assistant-1',
          content: 'Partial response',
          roundNumber: 0,
          participantId: 'p0',
          participantIndex: 0,
        }),
        // Round is incomplete - missing other participants
      ];

      const currentRound = getCurrentRoundNumber(messages);

      // Should still be round 0
      expect(currentRound).toBe(0);

      // Analysis (if created) should be for round 0
      expect(formatRoundNumber(currentRound)).toBe('Round 1');
    });

    /**
     * TEST CASE 7: Out-of-order messages
     * Verifies that getCurrentRoundNumber uses last user message, not max round
     */
    it('should use last user message round number, not max', () => {
      const messages: (TestUserMessage | TestAssistantMessage)[] = [
        createTestUserMessage({ id: 'u1', content: 'Q1', roundNumber: 0 }),
        createTestUserMessage({ id: 'u2', content: 'Q2', roundNumber: 1 }),
        createTestUserMessage({ id: 'u3', content: 'Q3', roundNumber: 2 }),
        // Hypothetical: Last user message is actually from round 1 (out of order)
        createTestUserMessage({ id: 'u4', content: 'Q2 retry', roundNumber: 1 }),
      ];

      const currentRound = getCurrentRoundNumber(messages);

      // Should use last user message (round 1)
      expect(currentRound).toBe(1);
    });
  });

  describe('analysis display consistency', () => {
    /**
     * TEST CASE 8: Verify display conversion is consistent
     * Ensures that display conversion is always roundNumber + 1
     */
    it('should consistently convert storage round to display round', () => {
      const testCases = [
        { storage: 0, display: 1 },
        { storage: 1, display: 2 },
        { storage: 2, display: 3 },
        { storage: 5, display: 6 },
        { storage: 10, display: 11 },
        { storage: 99, display: 100 },
      ];

      testCases.forEach(({ storage, display }) => {
        expect(getDisplayRoundNumber(storage)).toBe(display);
        expect(formatRoundNumber(storage)).toBe(`Round ${display}`);
      });
    });

    /**
     * TEST CASE 9: Analysis status and round number correlation
     * Verifies that analysis status changes don't affect round number
     */
    it('should maintain round number across status changes', () => {
      const roundNumber = 0;

      const statuses = [
        AnalysisStatuses.PENDING,
        AnalysisStatuses.STREAMING,
        AnalysisStatuses.COMPLETE,
      ];

      statuses.forEach((status) => {
        const analysis: Pick<StoredModeratorAnalysis, 'roundNumber' | 'status'> = {
          roundNumber,
          status,
        };

        // Round number should remain constant regardless of status
        expect(analysis.roundNumber).toBe(0);
        expect(formatRoundNumber(analysis.roundNumber)).toBe('Round 1');
      });
    });
  });

  describe('regression tests for reported bug', () => {
    /**
     * REGRESSION TEST: Verify initial round is not "Round 2"
     * User reported: Initial round shows up as "round 2" on UI
     * Expected: Initial round should show as "Round 1"
     */
    it('should NOT display initial round as "Round 2"', () => {
      const messages: (TestUserMessage | TestAssistantMessage)[] = [
        createTestUserMessage({
          id: 'user-1',
          content: 'First question ever',
          roundNumber: 0,
        }),
      ];

      const currentRound = getCurrentRoundNumber(messages);

      // ASSERTION: Should NOT be 1 (which would display as "Round 2")
      expect(currentRound).not.toBe(1);

      // ASSERTION: Should be 0 (displays as "Round 1")
      expect(currentRound).toBe(0);

      // ASSERTION: Display should be "Round 1", NOT "Round 2"
      const displayRound = formatRoundNumber(currentRound);
      expect(displayRound).not.toBe('Round 2');
      expect(displayRound).toBe('Round 1');
    });

    /**
     * REGRESSION TEST: Verify r0 analysis is created
     * User reported: r0 is not made and r1 is sent to analyze
     * Expected: First analysis should be for round 0, not round 1
     */
    it('should create analysis for r0, NOT r1, for first round', () => {
      const messages: (TestUserMessage | TestAssistantMessage)[] = [
        createTestUserMessage({
          id: 'user-1',
          content: 'First question',
          roundNumber: 0,
        }),
        createTestAssistantMessage({
          id: 'assistant-1',
          content: 'First response',
          roundNumber: 0,
          participantId: 'p0',
          participantIndex: 0,
        }),
      ];

      const currentRound = getCurrentRoundNumber(messages);

      // Simulate what would be sent to analysis endpoint
      const analysisRequest: Pick<ModeratorAnalysisPayload, 'roundNumber'> = {
        roundNumber: currentRound, // This is what gets sent to backend
      };

      // ASSERTION: Analysis should be for round 0, NOT round 1
      expect(analysisRequest.roundNumber).not.toBe(1);
      expect(analysisRequest.roundNumber).toBe(0);

      // ASSERTION: This is the FIRST round (r0), not second round (r1)
      expect(currentRound).toBe(0);
    });

    /**
     * REGRESSION TEST: Verify analysis round matches message round
     * Ensures analysis is always created for the same round as the messages
     */
    it('should create analysis with same round number as participant messages', () => {
      const roundNumber = 0;

      const messages: (TestUserMessage | TestAssistantMessage)[] = [
        createTestUserMessage({
          id: 'user-1',
          content: 'Question',
          roundNumber,
        }),
        createTestAssistantMessage({
          id: 'assistant-1',
          content: 'Response 1',
          roundNumber,
          participantId: 'p0',
          participantIndex: 0,
        }),
        createTestAssistantMessage({
          id: 'assistant-2',
          content: 'Response 2',
          roundNumber,
          participantId: 'p1',
          participantIndex: 1,
        }),
      ];

      const currentRound = getCurrentRoundNumber(messages);
      const participantMessages = messages.filter((m): m is TestAssistantMessage => m.role === MessageRoles.ASSISTANT);

      // All participant messages should have same round number
      participantMessages.forEach((msg) => {
        expect(msg.metadata.roundNumber).toBe(roundNumber);
      });

      // Analysis should be created for same round
      expect(currentRound).toBe(roundNumber);

      // ASSERTION: No off-by-one error
      expect(currentRound).toBe(participantMessages[0]?.metadata.roundNumber);
    });
  });
});
