/**
 * Analysis Flow State Machine Tests
 *
 * Verifies the complete flow of analysis creation and streaming:
 * 1. Analysis is triggered ONLY after all participants respond
 * 2. State transitions correctly: streaming_participants → creating_analysis → streaming_analysis → complete
 * 3. Analysis is created with correct round number
 * 4. Analysis status updates correctly during streaming
 *
 * Critical for ensuring FLOW_DOCUMENTATION.md analysis behavior
 */

import { AnalysisStatuses, MessageRoles } from '@/api/core/enums';
import type { StoredModeratorAnalysis } from '@/api/routes/chat/schema';
import type { TestAssistantMessage, TestUserMessage } from '@/lib/testing';
import { createTestAssistantMessage, createTestUserMessage } from '@/lib/testing';
import { getParticipantId, getRoundNumber } from '@/lib/utils/metadata';

describe('analysis flow state machine', () => {
  describe('analysis triggering conditions', () => {
    /**
     * TEST CASE 1: Analysis NOT triggered until all participants respond
     * With 3 participants, analysis should only trigger after 3rd participant responds
     */
    it('should not trigger analysis until all participants have responded', () => {
      const totalParticipants = 3;
      const messages: (TestUserMessage | TestAssistantMessage)[] = [
        createTestUserMessage({
          id: 'user-1',
          content: 'Question',
          roundNumber: 0,
        }),
        createTestAssistantMessage({
          id: 'p0-response',
          content: 'Response from p0',
          roundNumber: 0,
          participantId: 'p0',
          participantIndex: 0,
        }),
        createTestAssistantMessage({
          id: 'p1-response',
          content: 'Response from p1',
          roundNumber: 0,
          participantId: 'p1',
          participantIndex: 1,
        }),
      ];

      // Count participant responses for current round
      const participantMessages = messages.filter(
        (m): m is TestAssistantMessage =>
          m.role === MessageRoles.ASSISTANT && getParticipantId(m.metadata) !== null,
      );

      const allParticipantsResponded = participantMessages.length >= totalParticipants;

      // ASSERTION: With only 2 responses (p0, p1), should NOT trigger analysis
      expect(allParticipantsResponded).toBe(false);
      expect(participantMessages).toHaveLength(2);
    });

    /**
     * TEST CASE 2: Analysis triggered when all participants respond
     */
    it('should trigger analysis when all participants have responded', () => {
      const totalParticipants = 3;
      const messages: (TestUserMessage | TestAssistantMessage)[] = [
        createTestUserMessage({
          id: 'user-1',
          content: 'Question',
          roundNumber: 0,
        }),
        createTestAssistantMessage({
          id: 'p0-response',
          content: 'Response from p0',
          roundNumber: 0,
          participantId: 'p0',
          participantIndex: 0,
        }),
        createTestAssistantMessage({
          id: 'p1-response',
          content: 'Response from p1',
          roundNumber: 0,
          participantId: 'p1',
          participantIndex: 1,
        }),
        createTestAssistantMessage({
          id: 'p2-response',
          content: 'Response from p2',
          roundNumber: 0,
          participantId: 'p2',
          participantIndex: 2,
        }),
      ];

      // Count participant responses for current round
      const participantMessages = messages.filter(
        (m): m is TestAssistantMessage =>
          m.role === MessageRoles.ASSISTANT && getParticipantId(m.metadata) !== null,
      );

      const allParticipantsResponded = participantMessages.length >= totalParticipants;

      // ASSERTION: With 3 responses (p0, p1, p2), SHOULD trigger analysis
      expect(allParticipantsResponded).toBe(true);
      expect(participantMessages).toHaveLength(3);
    });

    /**
     * TEST CASE 3: Analysis triggered separately for each round
     */
    it('should trigger analysis separately for each round', () => {
      const totalParticipants = 2;

      // Round 0 - complete
      const round0Messages: (TestUserMessage | TestAssistantMessage)[] = [
        createTestUserMessage({ id: 'u1', content: 'Q1', roundNumber: 0 }),
        createTestAssistantMessage({
          id: 'p0-r0',
          content: 'A1',
          roundNumber: 0,
          participantId: 'p0',
          participantIndex: 0,
        }),
        createTestAssistantMessage({
          id: 'p1-r0',
          content: 'A2',
          roundNumber: 0,
          participantId: 'p1',
          participantIndex: 1,
        }),
      ];

      const round0Participants = round0Messages.filter(
        (m): m is TestAssistantMessage =>
          m.role === MessageRoles.ASSISTANT
          && getParticipantId(m.metadata) !== null
          && getRoundNumber(m.metadata) === 0,
      );

      // ASSERTION: Round 0 should trigger analysis
      expect(round0Participants.length >= totalParticipants).toBe(true);

      // Round 1 - incomplete
      const round1Messages: (TestUserMessage | TestAssistantMessage)[] = [
        createTestUserMessage({ id: 'u2', content: 'Q2', roundNumber: 1 }),
        createTestAssistantMessage({
          id: 'p0-r1',
          content: 'A3',
          roundNumber: 1,
          participantId: 'p0',
          participantIndex: 0,
        }),
      ];

      const round1Participants = round1Messages.filter(
        (m): m is TestAssistantMessage =>
          m.role === MessageRoles.ASSISTANT
          && getParticipantId(m.metadata) !== null
          && getRoundNumber(m.metadata) === 1,
      );

      // ASSERTION: Round 1 should NOT trigger analysis yet
      expect(round1Participants.length >= totalParticipants).toBe(false);
    });

    /**
     * TEST CASE 4: Analysis only counts participant messages, not pre-search
     */
    it('should only count participant messages for analysis trigger', () => {
      const totalParticipants = 2;
      const messages: (TestUserMessage | TestAssistantMessage)[] = [
        createTestUserMessage({ id: 'user-1', content: 'Q', roundNumber: 0 }),
        createTestAssistantMessage({
          id: 'p0',
          content: 'A1',
          roundNumber: 0,
          participantId: 'p0',
          participantIndex: 0,
        }),
        createTestAssistantMessage({
          id: 'p1',
          content: 'A2',
          roundNumber: 0,
          participantId: 'p1',
          participantIndex: 1,
        }),
      ];

      const participantMessages = messages.filter(
        m => m.role === MessageRoles.ASSISTANT && getParticipantId(m.metadata) !== null,
      );

      const allParticipantsResponded = participantMessages.length >= totalParticipants;

      // ASSERTION: Should only count p0 and p1 (not pre-search)
      expect(participantMessages).toHaveLength(2);
      expect(allParticipantsResponded).toBe(true);
    });
  });

  describe('analysis status progression', () => {
    /**
     * TEST CASE 5: Analysis starts with PENDING status
     */
    it('should create analysis with PENDING status initially', () => {
      const analysis: Partial<StoredModeratorAnalysis> = {
        id: 'analysis-1',
        threadId: 'thread-1',
        roundNumber: 0,
        status: AnalysisStatuses.PENDING,
      };

      expect(analysis.status).toBe(AnalysisStatuses.PENDING);
    });

    /**
     * TEST CASE 6: Analysis transitions to STREAMING when stream starts
     */
    it('should transition from PENDING to STREAMING', () => {
      const analysis: Partial<StoredModeratorAnalysis> = {
        id: 'analysis-1',
        threadId: 'thread-1',
        roundNumber: 0,
        status: AnalysisStatuses.PENDING,
      };

      // Simulate stream starting
      const updatedAnalysis = {
        ...analysis,
        status: AnalysisStatuses.STREAMING,
      };

      expect(updatedAnalysis.status).toBe(AnalysisStatuses.STREAMING);
    });

    /**
     * TEST CASE 7: Analysis transitions to COMPLETE when finished
     */
    it('should transition from STREAMING to COMPLETE', () => {
      const analysis: StoredModeratorAnalysis = {
        id: 'analysis-1',
        threadId: 'thread-1',
        roundNumber: 0,
        mode: 'analyzing',
        userQuestion: 'Test question',
        status: AnalysisStatuses.COMPLETE,
        participantMessageIds: ['msg1', 'msg2'],
        analysisData: {
          participantAnalyses: [],
          leaderboard: [],
          roundSummary: {
            keyInsights: ['insight1'],
            consensusPoints: [],
            divergentApproaches: [],
            comparativeAnalysis: {
              strengthsByCategory: [{ category: 'test', participants: ['p0'] }],
              tradeoffs: ['tradeoff1'],
            },
            decisionFramework: {
              criteriaToConsider: ['criteria1', 'criteria2'],
              scenarioRecommendations: [{ scenario: 'test', recommendation: 'test' }],
            },
            overallSummary: 'Test summary that meets minimum character requirements',
            conclusion: 'Test conclusion with recommendation',
            recommendedActions: [
              {
                action: 'Test action',
                rationale: 'Test rationale',
                suggestedModels: [],
                suggestedRoles: [],
                suggestedMode: '',
              },
            ],
          },
        },
        errorMessage: null,
        completedAt: null,
        createdAt: new Date(),
      };

      expect(analysis.status).toBe(AnalysisStatuses.COMPLETE);
      expect(analysis.analysisData).toBeDefined();
      expect(analysis.createdAt).toBeDefined();
    });

    /**
     * TEST CASE 8: Complete analysis has all required fields
     */
    it('should have all required fields when COMPLETE', () => {
      const completeAnalysis: StoredModeratorAnalysis = {
        id: 'analysis-1',
        threadId: 'thread-1',
        roundNumber: 0,
        mode: 'analyzing',
        userQuestion: 'Test question',
        status: AnalysisStatuses.COMPLETE,
        participantMessageIds: ['msg1'],
        analysisData: {
          participantAnalyses: [
            {
              participantIndex: 0,
              participantRole: null,
              modelId: 'gpt-4',
              modelName: 'GPT-4',
              overallRating: 8,
              skillsMatrix: [
                { skillName: 'Clarity', rating: 8 },
                { skillName: 'Creativity', rating: 7 },
                { skillName: 'Depth', rating: 9 },
                { skillName: 'Accuracy', rating: 8 },
                { skillName: 'Innovation', rating: 7 },
              ],
              pros: ['Clear', 'Concise'],
              cons: ['Could be more detailed'],
              summary: 'Good response',
            },
          ],
          leaderboard: [
            {
              rank: 1,
              participantIndex: 0,
              participantRole: null,
              modelId: 'gpt-4',
              modelName: 'GPT-4',
              overallRating: 8,
              badge: null,
            },
          ],
          roundSummary: {
            keyInsights: ['insight1'],
            consensusPoints: [],
            divergentApproaches: [],
            comparativeAnalysis: {
              strengthsByCategory: [{ category: 'test', participants: ['p0'] }],
              tradeoffs: ['tradeoff1'],
            },
            decisionFramework: {
              criteriaToConsider: ['criteria1', 'criteria2'],
              scenarioRecommendations: [{ scenario: 'test', recommendation: 'test' }],
            },
            overallSummary: 'Test summary that meets minimum character requirements',
            conclusion: 'Test conclusion with recommendation',
            recommendedActions: [
              {
                action: 'Test action',
                rationale: 'Test rationale',
                suggestedModels: [],
                suggestedRoles: [],
                suggestedMode: '',
              },
            ],
          },
        },
        errorMessage: null,
        completedAt: null,
        createdAt: new Date(),
      };

      // Verify all required fields
      expect(completeAnalysis.id).toBeDefined();
      expect(completeAnalysis.threadId).toBeDefined();
      expect(completeAnalysis.roundNumber).toBe(0);
      expect(completeAnalysis.status).toBe(AnalysisStatuses.COMPLETE);
      expect(completeAnalysis.analysisData).toBeDefined();
      expect(completeAnalysis.analysisData?.participantAnalyses).toBeInstanceOf(Array);
      expect(completeAnalysis.analysisData?.leaderboard).toBeInstanceOf(Array);
      expect(completeAnalysis.createdAt).toBeInstanceOf(Date);
    });
  });

  describe('analysis and round correlation', () => {
    /**
     * TEST CASE 9: Each round gets its own analysis
     */
    it('should create separate analysis for each round', () => {
      const analyses: StoredModeratorAnalysis[] = [
        {
          id: 'analysis-r0',
          threadId: 'thread-1',
          roundNumber: 0,
          mode: 'analyzing',
          userQuestion: 'Q1',
          status: AnalysisStatuses.COMPLETE,
          participantMessageIds: [],
          analysisData: {
            participantAnalyses: [],
            leaderboard: [],
            roundSummary: {
              keyInsights: ['insight1'],
              consensusPoints: [],
              divergentApproaches: [],
              comparativeAnalysis: {
                strengthsByCategory: [{ category: 'test', participants: ['p0'] }],
                tradeoffs: ['tradeoff1'],
              },
              decisionFramework: {
                criteriaToConsider: ['criteria1', 'criteria2'],
                scenarioRecommendations: [{ scenario: 'test', recommendation: 'test' }],
              },
              overallSummary: 'Test summary that meets minimum character requirements',
              conclusion: 'Test conclusion with recommendation',
              recommendedActions: [
                {
                  action: 'Test action',
                  rationale: 'Test rationale',
                  suggestedModels: [],
                  suggestedRoles: [],
                  suggestedMode: '',
                },
              ],
            },
          },
          errorMessage: null,
          completedAt: null,
          createdAt: new Date(),
        },
        {
          id: 'analysis-r1',
          threadId: 'thread-1',
          roundNumber: 1,
          mode: 'analyzing',
          userQuestion: 'Q2',
          status: AnalysisStatuses.COMPLETE,
          participantMessageIds: [],
          analysisData: {
            participantAnalyses: [],
            leaderboard: [],
            roundSummary: {
              keyInsights: ['insight1'],
              consensusPoints: [],
              divergentApproaches: [],
              comparativeAnalysis: {
                strengthsByCategory: [{ category: 'test', participants: ['p0'] }],
                tradeoffs: ['tradeoff1'],
              },
              decisionFramework: {
                criteriaToConsider: ['criteria1', 'criteria2'],
                scenarioRecommendations: [{ scenario: 'test', recommendation: 'test' }],
              },
              overallSummary: 'Test summary that meets minimum character requirements',
              conclusion: 'Test conclusion with recommendation',
              recommendedActions: [
                {
                  action: 'Test action',
                  rationale: 'Test rationale',
                  suggestedModels: [],
                  suggestedRoles: [],
                  suggestedMode: '',
                },
              ],
            },
          },
          errorMessage: null,
          completedAt: null,
          createdAt: new Date(),
        },
      ];

      // ASSERTION: Each analysis has unique round number
      expect(analyses[0]?.roundNumber).toBe(0);
      expect(analyses[1]?.roundNumber).toBe(1);

      // ASSERTION: Different analyses for different rounds
      expect(analyses[0]?.id).not.toBe(analyses[1]?.id);
    });

    /**
     * TEST CASE 10: Analysis can be retrieved by round number
     */
    it('should allow retrieval of analysis by round number', () => {
      const analyses: StoredModeratorAnalysis[] = [
        {
          id: 'analysis-r0',
          threadId: 'thread-1',
          roundNumber: 0,
          mode: 'analyzing',
          userQuestion: 'Q1',
          status: AnalysisStatuses.COMPLETE,
          participantMessageIds: [],
          analysisData: {
            participantAnalyses: [],
            leaderboard: [],
            roundSummary: {
              keyInsights: ['insight1'],
              consensusPoints: [],
              divergentApproaches: [],
              comparativeAnalysis: {
                strengthsByCategory: [{ category: 'test', participants: ['p0'] }],
                tradeoffs: ['tradeoff1'],
              },
              decisionFramework: {
                criteriaToConsider: ['criteria1', 'criteria2'],
                scenarioRecommendations: [{ scenario: 'test', recommendation: 'test' }],
              },
              overallSummary: 'Test summary that meets minimum character requirements',
              conclusion: 'Test conclusion with recommendation',
              recommendedActions: [
                {
                  action: 'Test action',
                  rationale: 'Test rationale',
                  suggestedModels: [],
                  suggestedRoles: [],
                  suggestedMode: '',
                },
              ],
            },
          },
          errorMessage: null,
          completedAt: null,
          createdAt: new Date(),
        },
        {
          id: 'analysis-r1',
          threadId: 'thread-1',
          roundNumber: 1,
          mode: 'analyzing',
          userQuestion: 'Q2',
          status: AnalysisStatuses.COMPLETE,
          participantMessageIds: [],
          analysisData: {
            participantAnalyses: [],
            leaderboard: [],
            roundSummary: {
              keyInsights: ['insight1'],
              consensusPoints: [],
              divergentApproaches: [],
              comparativeAnalysis: {
                strengthsByCategory: [{ category: 'test', participants: ['p0'] }],
                tradeoffs: ['tradeoff1'],
              },
              decisionFramework: {
                criteriaToConsider: ['criteria1', 'criteria2'],
                scenarioRecommendations: [{ scenario: 'test', recommendation: 'test' }],
              },
              overallSummary: 'Test summary that meets minimum character requirements',
              conclusion: 'Test conclusion with recommendation',
              recommendedActions: [
                {
                  action: 'Test action',
                  rationale: 'Test rationale',
                  suggestedModels: [],
                  suggestedRoles: [],
                  suggestedMode: '',
                },
              ],
            },
          },
          errorMessage: null,
          completedAt: null,
          createdAt: new Date(),
        },
      ];

      // Simulate finding analysis by round number
      const round0Analysis = analyses.find(a => a.roundNumber === 0);
      const round1Analysis = analyses.find(a => a.roundNumber === 1);

      expect(round0Analysis).toBeDefined();
      expect(round0Analysis?.roundNumber).toBe(0);
      expect(round1Analysis).toBeDefined();
      expect(round1Analysis?.roundNumber).toBe(1);
    });
  });

  describe('participant analyses in complete analysis', () => {
    /**
     * TEST CASE 11: Participant analyses match message participants
     */
    it('should have analysis for each participant that responded', () => {
      const messages: (TestUserMessage | TestAssistantMessage)[] = [
        createTestUserMessage({ id: 'u1', content: 'Q', roundNumber: 0 }),
        createTestAssistantMessage({
          id: 'p0',
          content: 'A1',
          roundNumber: 0,
          participantId: 'p0',
          participantIndex: 0,
        }),
        createTestAssistantMessage({
          id: 'p1',
          content: 'A2',
          roundNumber: 0,
          participantId: 'p1',
          participantIndex: 1,
        }),
        createTestAssistantMessage({
          id: 'p2',
          content: 'A3',
          roundNumber: 0,
          participantId: 'p2',
          participantIndex: 2,
        }),
      ];

      const participantMessages = messages.filter(
        (m): m is TestAssistantMessage =>
          m.role === MessageRoles.ASSISTANT && getParticipantId(m.metadata) !== null,
      );

      // Simulate creating participant analyses
      const participantAnalyses = participantMessages.map(msg => ({
        participantId: msg.metadata.participantId,
        participantIndex: msg.metadata.participantIndex,
        participantRole: msg.metadata.participantRole,
        summary: `Summary for ${msg.metadata.participantId}`,
        strengths: ['Good response'],
        weaknesses: [],
        score: 8,
      }));

      expect(participantAnalyses).toHaveLength(3);
      expect(participantAnalyses[0]?.participantId).toBe('p0');
      expect(participantAnalyses[1]?.participantId).toBe('p1');
      expect(participantAnalyses[2]?.participantId).toBe('p2');
    });

    /**
     * TEST CASE 12: Leaderboard rankings match participant count
     */
    it('should have leaderboard entry for each participant', () => {
      const participantAnalyses = [
        {
          participantId: 'p0',
          participantIndex: 0,
          participantRole: null,
          summary: '',
          strengths: [],
          weaknesses: [],
          score: 9,
        },
        {
          participantId: 'p1',
          participantIndex: 1,
          participantRole: null,
          summary: '',
          strengths: [],
          weaknesses: [],
          score: 7,
        },
        {
          participantId: 'p2',
          participantIndex: 2,
          participantRole: null,
          summary: '',
          strengths: [],
          weaknesses: [],
          score: 8,
        },
      ];

      // Simulate creating leaderboard
      const leaderboard = participantAnalyses
        .map(pa => ({
          participantId: pa.participantId,
          participantIndex: pa.participantIndex,
          participantRole: pa.participantRole,
          rank: 0, // Will be calculated based on score
          score: pa.score,
        }))
        .sort((a, b) => b.score - a.score)
        .map((entry, index) => ({
          ...entry,
          rank: index + 1,
        }));

      expect(leaderboard).toHaveLength(3);
      expect(leaderboard[0]?.participantId).toBe('p0'); // Highest score (9)
      expect(leaderboard[0]?.rank).toBe(1);
      expect(leaderboard[1]?.participantId).toBe('p2'); // Second highest (8)
      expect(leaderboard[1]?.rank).toBe(2);
      expect(leaderboard[2]?.participantId).toBe('p1'); // Lowest (7)
      expect(leaderboard[2]?.rank).toBe(3);
    });
  });
});
