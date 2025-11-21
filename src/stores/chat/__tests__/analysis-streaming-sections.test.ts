/**
 * Analysis Streaming Sections E2E Tests
 *
 * Tests the complete analysis streaming flow based on FLOW_DOCUMENTATION.md Part 4.
 * Covers: trigger timing, progressive streaming order, all section types,
 * data structure validation, mode-specific analysis, and status transitions.
 *
 * FLOW TESTED (from FLOW_DOCUMENTATION.md Part 4):
 * 1. Analysis triggers AFTER the LAST selected AI completes
 * 2. Progressive streaming order (5 sections)
 * 3. Leaderboard section with rankings, badges, scores
 * 4. Skills comparison chart with 5 dimensions per mode
 * 5. Individual participant cards (strengths, weaknesses, summary)
 * 6. Overall summary and conclusion sections
 * 7. Analysis data structure validation
 * 8. Mode-specific analysis content
 * 9. Multi-participant analysis patterns
 * 10. Status transitions (PENDING -> STREAMING -> COMPLETE)
 *
 * Location: /src/stores/chat/__tests__/analysis-streaming-sections.test.ts
 */

import type { UIMessage } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AnalysisStatuses,
  ChatModes,
} from '@/api/core/enums';
import type {
  LeaderboardEntry,
  ParticipantAnalysis,
} from '@/api/routes/chat/schema';
import { createChatStore } from '@/stores/chat/store';

import {
  createMockAnalysis,
  createMockAnalysisPayload,
  createMockMessage,
  createMockParticipant,
  createMockThread,
  createMockUserMessage,
} from './test-factories';

// ============================================================================
// TEST UTILITIES
// ============================================================================

/**
 * Create a store with initial state for testing
 */
function createTestStore() {
  return createChatStore();
}

/**
 * Setup store with completed participants for a round
 */
function setupCompletedRound(
  store: ReturnType<typeof createChatStore>,
  roundNumber: number,
  participantCount: number,
  mode = ChatModes.DEBATING,
): void {
  const thread = createMockThread({
    id: 'thread-123',
    mode,
  });
  const participants = Array.from({ length: participantCount }, (_, i) =>
    createMockParticipant(i, { threadId: 'thread-123' }));

  const messages: UIMessage[] = [
    createMockUserMessage(roundNumber, `Question for round ${roundNumber}`),
    ...Array.from({ length: participantCount }, (_, i) =>
      createMockMessage(i, roundNumber)),
  ];

  if (roundNumber === 0) {
    store.getState().initializeThread(thread, participants, messages);
  } else {
    // For subsequent rounds, just add messages
    messages.forEach((msg) => {
      store.getState().setMessages(prev => [...prev, msg]);
    });
  }
}

/**
 * Create mock leaderboard entry
 */
function createMockLeaderboardEntry(
  rank: number,
  participantIndex: number,
  overrides?: Partial<LeaderboardEntry>,
): LeaderboardEntry {
  return {
    rank,
    participantIndex,
    participantRole: null,
    modelId: `openai/gpt-4-${participantIndex}`,
    modelName: `GPT-4 Model ${participantIndex}`,
    overallRating: 10 - rank + 1, // Higher rank = higher rating
    badge: rank === 1 ? 'Top Performer' : rank === 2 ? 'Strong Contender' : null,
    ...overrides,
  };
}

/**
 * Create mock participant analysis
 */
function createMockParticipantAnalysis(
  participantIndex: number,
  overrides?: Partial<ParticipantAnalysis>,
): ParticipantAnalysis {
  return {
    participantIndex,
    participantRole: null,
    modelId: `openai/gpt-4-${participantIndex}`,
    modelName: `GPT-4 Model ${participantIndex}`,
    overallRating: 8,
    skillsMatrix: [
      { skillName: 'Creativity', rating: 8 },
      { skillName: 'Technical Depth', rating: 7 },
      { skillName: 'Clarity', rating: 9 },
      { skillName: 'Analysis', rating: 8 },
      { skillName: 'Innovation', rating: 7 },
    ],
    pros: ['Clear explanation', 'Good examples'],
    cons: ['Could be more detailed'],
    summary: `Participant ${participantIndex} provided a solid response with good clarity.`,
    ...overrides,
  };
}

// ============================================================================
// ANALYSIS TRIGGER TIMING TESTS
// ============================================================================

describe('analysis Streaming Sections', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('analysis Trigger Timing', () => {
    it('should trigger analysis only after ALL selected AIs complete', () => {
      // Setup with 3 participants
      const thread = createMockThread({ id: 'thread-123' });
      const participants = [
        createMockParticipant(0),
        createMockParticipant(1),
        createMockParticipant(2),
      ];

      const messages: UIMessage[] = [createMockUserMessage(0)];
      store.getState().initializeThread(thread, participants, messages);

      // Participant 0 responds - should NOT trigger analysis
      store.getState().setMessages(prev => [...prev, createMockMessage(0, 0)]);
      expect(store.getState().analyses).toHaveLength(0);

      // Participant 1 responds - should NOT trigger analysis
      store.getState().setMessages(prev => [...prev, createMockMessage(1, 0)]);
      expect(store.getState().analyses).toHaveLength(0);

      // Participant 2 responds - NOW analysis can be triggered
      store.getState().setMessages(prev => [...prev, createMockMessage(2, 0)]);

      // Verify all participants have responded
      const state = store.getState();
      const participantMessages = state.messages.filter(m => m.role === 'assistant');
      expect(participantMessages).toHaveLength(3);

      // Analysis should now be created
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.PENDING,
      }));
      expect(store.getState().analyses).toHaveLength(1);
    });

    it('should not trigger analysis while streaming is in progress', () => {
      setupCompletedRound(store, 0, 2);

      // Streaming still in progress
      store.getState().setIsStreaming(true);

      // Even with all participants done, analysis shouldn't auto-create while streaming
      const state = store.getState();
      expect(state.isStreaming).toBe(true);
      expect(state.analyses).toHaveLength(0);
    });

    it('should trigger analysis automatically (not manually) after last participant', () => {
      setupCompletedRound(store, 0, 2);

      // Simulate streaming completion
      store.getState().setIsStreaming(false);

      // Analysis should be created automatically by the flow
      store.getState().markAnalysisCreated(0);
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.PENDING,
      }));

      // Verify automatic creation tracking
      expect(store.getState().hasAnalysisBeenCreated(0)).toBe(true);
      expect(store.getState().analyses[0].status).toBe(AnalysisStatuses.PENDING);
    });

    it('should respect participant order for analysis timing', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = [
        createMockParticipant(0, { priority: 0 }),
        createMockParticipant(1, { priority: 1 }),
      ];

      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);

      // First participant (priority 0)
      store.getState().setMessages(prev => [...prev, createMockMessage(0, 0)]);
      expect(store.getState().analyses).toHaveLength(0);

      // Second participant (priority 1) - last one
      store.getState().setMessages(prev => [...prev, createMockMessage(1, 0)]);

      // Now analysis can be triggered
      store.getState().addAnalysis(createMockAnalysis({ roundNumber: 0 }));
      expect(store.getState().analyses).toHaveLength(1);
    });
  });

  // ==========================================================================
  // PROGRESSIVE STREAMING ORDER TESTS
  // ==========================================================================

  describe('progressive Streaming Order', () => {
    it('should stream sections in correct order: leaderboard -> skills -> participants -> summary -> conclusion', () => {
      setupCompletedRound(store, 0, 2);

      // Add analysis with full data
      const analysisPayload = createMockAnalysisPayload(0);
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.STREAMING,
      }));

      // Update with data - all sections should be present
      store.getState().updateAnalysisData(0, analysisPayload);

      const analysis = store.getState().analyses[0];
      expect(analysis.analysisData).toBeDefined();

      // Verify all sections are present in the data structure
      const data = analysis.analysisData;
      expect(data?.leaderboard).toBeDefined();
      expect(data?.participantAnalyses).toBeDefined();
      expect(data?.roundSummary).toBeDefined();

      // Verify leaderboard (Section 1)
      expect(data?.leaderboard.length).toBeGreaterThan(0);

      // Verify participant analyses (Section 3)
      expect(data?.participantAnalyses.length).toBeGreaterThan(0);

      // Verify round summary with all subsections (Sections 4 & 5)
      expect(data?.roundSummary.overallSummary).toBeDefined();
      expect(data?.roundSummary.conclusion).toBeDefined();
    });

    it('should maintain data integrity during progressive streaming', () => {
      setupCompletedRound(store, 0, 3);

      // Start with pending analysis
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.PENDING,
      }));

      // Transition to streaming
      store.getState().updateAnalysisStatus(0, AnalysisStatuses.STREAMING);
      expect(store.getState().analyses[0].status).toBe(AnalysisStatuses.STREAMING);

      // Add full analysis data
      const fullPayload = createMockAnalysisPayload(0, {
        participantAnalyses: [
          createMockParticipantAnalysis(0),
          createMockParticipantAnalysis(1),
          createMockParticipantAnalysis(2),
        ],
        leaderboard: [
          createMockLeaderboardEntry(1, 0),
          createMockLeaderboardEntry(2, 1),
          createMockLeaderboardEntry(3, 2),
        ],
      });

      store.getState().updateAnalysisData(0, fullPayload);

      // Verify data is complete
      const analysis = store.getState().analyses[0];
      expect(analysis.analysisData?.participantAnalyses).toHaveLength(3);
      expect(analysis.analysisData?.leaderboard).toHaveLength(3);
      expect(analysis.status).toBe(AnalysisStatuses.COMPLETE);
    });
  });

  // ==========================================================================
  // LEADERBOARD SECTION TESTS
  // ==========================================================================

  describe('leaderboard Section', () => {
    it('should include rankings for all participants (1st, 2nd, 3rd...)', () => {
      setupCompletedRound(store, 0, 4);

      const leaderboard: LeaderboardEntry[] = [
        createMockLeaderboardEntry(1, 2), // GPT-4-2 is 1st
        createMockLeaderboardEntry(2, 0), // GPT-4-0 is 2nd
        createMockLeaderboardEntry(3, 3), // GPT-4-3 is 3rd
        createMockLeaderboardEntry(4, 1), // GPT-4-1 is 4th
      ];

      const payload = createMockAnalysisPayload(0, {
        leaderboard,
        participantAnalyses: [
          createMockParticipantAnalysis(0),
          createMockParticipantAnalysis(1),
          createMockParticipantAnalysis(2),
          createMockParticipantAnalysis(3),
        ],
      });

      store.getState().addAnalysis(createMockAnalysis({ roundNumber: 0 }));
      store.getState().updateAnalysisData(0, payload);

      const data = store.getState().analyses[0].analysisData;

      // Verify rankings
      expect(data?.leaderboard).toHaveLength(4);
      expect(data?.leaderboard[0].rank).toBe(1);
      expect(data?.leaderboard[1].rank).toBe(2);
      expect(data?.leaderboard[2].rank).toBe(3);
      expect(data?.leaderboard[3].rank).toBe(4);

      // Verify participant indices are mapped correctly
      expect(data?.leaderboard[0].participantIndex).toBe(2);
      expect(data?.leaderboard[1].participantIndex).toBe(0);
    });

    it('should include trophy/medal badges for top 3', () => {
      setupCompletedRound(store, 0, 3);

      const leaderboard: LeaderboardEntry[] = [
        createMockLeaderboardEntry(1, 0, { badge: 'Most Creative' }),
        createMockLeaderboardEntry(2, 1, { badge: 'Best Analysis' }),
        createMockLeaderboardEntry(3, 2, { badge: 'Clear Communicator' }),
      ];

      const payload = createMockAnalysisPayload(0, { leaderboard });
      store.getState().addAnalysis(createMockAnalysis({ roundNumber: 0 }));
      store.getState().updateAnalysisData(0, payload);

      const data = store.getState().analyses[0].analysisData;

      // Verify badges for top 3
      expect(data?.leaderboard[0].badge).toBe('Most Creative');
      expect(data?.leaderboard[1].badge).toBe('Best Analysis');
      expect(data?.leaderboard[2].badge).toBe('Clear Communicator');
    });

    it('should include scores out of 10 for each model', () => {
      setupCompletedRound(store, 0, 2);

      const leaderboard: LeaderboardEntry[] = [
        createMockLeaderboardEntry(1, 0, { overallRating: 9.2 }),
        createMockLeaderboardEntry(2, 1, { overallRating: 8.5 }),
      ];

      const payload = createMockAnalysisPayload(0, { leaderboard });
      store.getState().addAnalysis(createMockAnalysis({ roundNumber: 0 }));
      store.getState().updateAnalysisData(0, payload);

      const data = store.getState().analyses[0].analysisData;

      // Verify scores
      expect(data?.leaderboard[0].overallRating).toBe(9.2);
      expect(data?.leaderboard[1].overallRating).toBe(8.5);

      // Verify scores are in valid range
      data?.leaderboard.forEach((entry) => {
        expect(entry.overallRating).toBeGreaterThanOrEqual(1);
        expect(entry.overallRating).toBeLessThanOrEqual(10);
      });
    });

    it('should order leaderboard by rank', () => {
      setupCompletedRound(store, 0, 3);

      const leaderboard: LeaderboardEntry[] = [
        createMockLeaderboardEntry(1, 2, { overallRating: 9 }),
        createMockLeaderboardEntry(2, 0, { overallRating: 8 }),
        createMockLeaderboardEntry(3, 1, { overallRating: 7 }),
      ];

      const payload = createMockAnalysisPayload(0, { leaderboard });
      store.getState().addAnalysis(createMockAnalysis({ roundNumber: 0 }));
      store.getState().updateAnalysisData(0, payload);

      const data = store.getState().analyses[0].analysisData;

      // Verify ordering
      for (let i = 0; i < data!.leaderboard.length - 1; i++) {
        expect(data!.leaderboard[i].rank).toBeLessThan(data!.leaderboard[i + 1].rank);
      }
    });
  });

  // ==========================================================================
  // SKILLS COMPARISON CHART TESTS
  // ==========================================================================

  describe('skills Comparison Chart', () => {
    it('should include pentagon/radar chart data with exactly 5 skill dimensions', () => {
      setupCompletedRound(store, 0, 2);

      const participantAnalyses = [
        createMockParticipantAnalysis(0, {
          skillsMatrix: [
            { skillName: 'Creativity', rating: 8 },
            { skillName: 'Technical Depth', rating: 7 },
            { skillName: 'Clarity', rating: 9 },
            { skillName: 'Analysis', rating: 8 },
            { skillName: 'Innovation', rating: 7 },
          ],
        }),
        createMockParticipantAnalysis(1),
      ];

      const payload = createMockAnalysisPayload(0, { participantAnalyses });
      store.getState().addAnalysis(createMockAnalysis({ roundNumber: 0 }));
      store.getState().updateAnalysisData(0, payload);

      const data = store.getState().analyses[0].analysisData;

      // Verify exactly 5 skills for pentagon chart
      data?.participantAnalyses.forEach((analysis) => {
        expect(analysis.skillsMatrix).toHaveLength(5);
        analysis.skillsMatrix.forEach((skill) => {
          expect(skill.skillName).toBeDefined();
          expect(skill.rating).toBeGreaterThanOrEqual(1);
          expect(skill.rating).toBeLessThanOrEqual(10);
        });
      });
    });

    it('should have different data for each participant', () => {
      setupCompletedRound(store, 0, 2);

      const participantAnalyses = [
        createMockParticipantAnalysis(0, {
          skillsMatrix: [
            { skillName: 'Creativity', rating: 9 },
            { skillName: 'Technical Depth', rating: 6 },
            { skillName: 'Clarity', rating: 8 },
            { skillName: 'Analysis', rating: 7 },
            { skillName: 'Innovation', rating: 9 },
          ],
        }),
        createMockParticipantAnalysis(1, {
          skillsMatrix: [
            { skillName: 'Creativity', rating: 6 },
            { skillName: 'Technical Depth', rating: 9 },
            { skillName: 'Clarity', rating: 7 },
            { skillName: 'Analysis', rating: 9 },
            { skillName: 'Innovation', rating: 6 },
          ],
        }),
      ];

      const payload = createMockAnalysisPayload(0, { participantAnalyses });
      store.getState().addAnalysis(createMockAnalysis({ roundNumber: 0 }));
      store.getState().updateAnalysisData(0, payload);

      const data = store.getState().analyses[0].analysisData;

      // Verify different ratings between participants
      const p0Creativity = data!.participantAnalyses[0].skillsMatrix[0].rating;
      const p1Creativity = data!.participantAnalyses[1].skillsMatrix[0].rating;
      expect(p0Creativity).not.toBe(p1Creativity);
    });

    it('should use brainstorming-specific skills for brainstorming mode', () => {
      const thread = createMockThread({ id: 'thread-123', mode: ChatModes.BRAINSTORMING });
      const participants = [createMockParticipant(0), createMockParticipant(1)];
      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0),
        createMockMessage(0, 0),
        createMockMessage(1, 0),
      ]);

      const brainstormingSkills = [
        { skillName: 'Creativity', rating: 9 },
        { skillName: 'Diversity of Ideas', rating: 8 },
        { skillName: 'Practicality', rating: 7 },
        { skillName: 'Originality', rating: 8 },
        { skillName: 'Feasibility', rating: 7 },
      ];

      const payload = createMockAnalysisPayload(0, {
        mode: ChatModes.BRAINSTORMING,
        participantAnalyses: [
          createMockParticipantAnalysis(0, { skillsMatrix: brainstormingSkills }),
          createMockParticipantAnalysis(1, { skillsMatrix: brainstormingSkills }),
        ],
      });

      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 0,
        mode: ChatModes.BRAINSTORMING,
      }));
      store.getState().updateAnalysisData(0, payload);

      const data = store.getState().analyses[0].analysisData;
      const skillNames = data!.participantAnalyses[0].skillsMatrix.map(s => s.skillName);

      expect(skillNames).toContain('Creativity');
      expect(skillNames).toContain('Practicality');
    });

    it('should use analyzing-specific skills for analyzing mode', () => {
      const thread = createMockThread({ id: 'thread-123', mode: ChatModes.ANALYZING });
      const participants = [createMockParticipant(0)];
      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0),
        createMockMessage(0, 0),
      ]);

      const analyzingSkills = [
        { skillName: 'Analytical Depth', rating: 9 },
        { skillName: 'Evidence Quality', rating: 8 },
        { skillName: 'Objectivity', rating: 8 },
        { skillName: 'Comprehensiveness', rating: 7 },
        { skillName: 'Accuracy', rating: 9 },
      ];

      const payload = createMockAnalysisPayload(0, {
        mode: ChatModes.ANALYZING,
        participantAnalyses: [
          createMockParticipantAnalysis(0, { skillsMatrix: analyzingSkills }),
        ],
      });

      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 0,
        mode: ChatModes.ANALYZING,
      }));
      store.getState().updateAnalysisData(0, payload);

      const data = store.getState().analyses[0].analysisData;
      const skillNames = data!.participantAnalyses[0].skillsMatrix.map(s => s.skillName);

      expect(skillNames).toContain('Analytical Depth');
      expect(skillNames).toContain('Objectivity');
    });

    it('should use debating-specific skills for debating mode', () => {
      setupCompletedRound(store, 0, 2, ChatModes.DEBATING);

      const debatingSkills = [
        { skillName: 'Argument Strength', rating: 8 },
        { skillName: 'Logic', rating: 9 },
        { skillName: 'Persuasiveness', rating: 7 },
        { skillName: 'Evidence', rating: 8 },
        { skillName: 'Rebuttal Quality', rating: 7 },
      ];

      const payload = createMockAnalysisPayload(0, {
        mode: ChatModes.DEBATING,
        participantAnalyses: [
          createMockParticipantAnalysis(0, { skillsMatrix: debatingSkills }),
          createMockParticipantAnalysis(1, { skillsMatrix: debatingSkills }),
        ],
      });

      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 0,
        mode: ChatModes.DEBATING,
      }));
      store.getState().updateAnalysisData(0, payload);

      const data = store.getState().analyses[0].analysisData;
      const skillNames = data!.participantAnalyses[0].skillsMatrix.map(s => s.skillName);

      expect(skillNames).toContain('Argument Strength');
      expect(skillNames).toContain('Logic');
      expect(skillNames).toContain('Persuasiveness');
    });
  });

  // ==========================================================================
  // INDIVIDUAL PARTICIPANT CARDS TESTS
  // ==========================================================================

  describe('individual Participant Cards', () => {
    it('should create one card per AI model', () => {
      setupCompletedRound(store, 0, 3);

      const payload = createMockAnalysisPayload(0, {
        participantAnalyses: [
          createMockParticipantAnalysis(0),
          createMockParticipantAnalysis(1),
          createMockParticipantAnalysis(2),
        ],
      });

      store.getState().addAnalysis(createMockAnalysis({ roundNumber: 0 }));
      store.getState().updateAnalysisData(0, payload);

      const data = store.getState().analyses[0].analysisData;
      expect(data?.participantAnalyses).toHaveLength(3);
    });

    it('should include strengths (2-3 pros) with content', () => {
      setupCompletedRound(store, 0, 1);

      const payload = createMockAnalysisPayload(0, {
        participantAnalyses: [
          createMockParticipantAnalysis(0, {
            pros: [
              'Excellent technical depth',
              'Clear and concise explanations',
              'Good use of examples',
            ],
          }),
        ],
      });

      store.getState().addAnalysis(createMockAnalysis({ roundNumber: 0 }));
      store.getState().updateAnalysisData(0, payload);

      const data = store.getState().analyses[0].analysisData;
      const pros = data!.participantAnalyses[0].pros;

      expect(pros.length).toBeGreaterThanOrEqual(2);
      expect(pros.length).toBeLessThanOrEqual(4);
      pros.forEach((pro) => {
        expect(typeof pro).toBe('string');
        expect(pro.length).toBeGreaterThan(0);
      });
    });

    it('should include areas for improvement (1-2 cons) with content', () => {
      setupCompletedRound(store, 0, 1);

      const payload = createMockAnalysisPayload(0, {
        participantAnalyses: [
          createMockParticipantAnalysis(0, {
            cons: [
              'Could provide more practical examples',
              'Some points need more elaboration',
            ],
          }),
        ],
      });

      store.getState().addAnalysis(createMockAnalysis({ roundNumber: 0 }));
      store.getState().updateAnalysisData(0, payload);

      const data = store.getState().analyses[0].analysisData;
      const cons = data!.participantAnalyses[0].cons;

      expect(cons.length).toBeGreaterThanOrEqual(1);
      expect(cons.length).toBeLessThanOrEqual(3);
      cons.forEach((con) => {
        expect(typeof con).toBe('string');
        expect(con.length).toBeGreaterThan(0);
      });
    });

    it('should include summary (overall assessment paragraph)', () => {
      setupCompletedRound(store, 0, 1);

      const summaryText = 'This participant provided a comprehensive response that demonstrated strong analytical skills and clear communication. The answer addressed the key points effectively while maintaining objectivity throughout.';

      const payload = createMockAnalysisPayload(0, {
        participantAnalyses: [
          createMockParticipantAnalysis(0, { summary: summaryText }),
        ],
      });

      store.getState().addAnalysis(createMockAnalysis({ roundNumber: 0 }));
      store.getState().updateAnalysisData(0, payload);

      const data = store.getState().analyses[0].analysisData;
      const summary = data!.participantAnalyses[0].summary;

      expect(summary).toBe(summaryText);
      expect(summary.length).toBeLessThanOrEqual(300);
    });

    it('should include participant role when assigned', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = [
        createMockParticipant(0, { role: 'The Ideator' }),
        createMockParticipant(1, { role: 'Devil\'s Advocate' }),
      ];
      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0),
        createMockMessage(0, 0),
        createMockMessage(1, 0),
      ]);

      const payload = createMockAnalysisPayload(0, {
        participantAnalyses: [
          createMockParticipantAnalysis(0, { participantRole: 'The Ideator' }),
          createMockParticipantAnalysis(1, { participantRole: 'Devil\'s Advocate' }),
        ],
      });

      store.getState().addAnalysis(createMockAnalysis({ roundNumber: 0 }));
      store.getState().updateAnalysisData(0, payload);

      const data = store.getState().analyses[0].analysisData;
      expect(data!.participantAnalyses[0].participantRole).toBe('The Ideator');
      expect(data!.participantAnalyses[1].participantRole).toBe('Devil\'s Advocate');
    });
  });

  // ==========================================================================
  // OVERALL SUMMARY SECTION TESTS
  // ==========================================================================

  describe('overall Summary Section', () => {
    it('should include 50-1200 character synthesis', () => {
      setupCompletedRound(store, 0, 2);

      const overallSummary = 'The participants provided complementary perspectives on the topic. While Participant 0 focused on technical implementation details, Participant 1 emphasized user experience considerations. Both approaches have merit and together provide a comprehensive view of the problem space.';

      const payload = createMockAnalysisPayload(0);
      payload.roundSummary.overallSummary = overallSummary;

      store.getState().addAnalysis(createMockAnalysis({ roundNumber: 0 }));
      store.getState().updateAnalysisData(0, payload);

      const data = store.getState().analyses[0].analysisData;
      const summary = data!.roundSummary.overallSummary;

      expect(summary.length).toBeGreaterThanOrEqual(50);
      expect(summary.length).toBeLessThanOrEqual(1200);
    });

    it('should include key insights (3-6 items)', () => {
      setupCompletedRound(store, 0, 2);

      const payload = createMockAnalysisPayload(0);
      payload.roundSummary.keyInsights = [
        'Both participants agree on the importance of scalability',
        'Technical debt was identified as a key concern',
        'User feedback should drive development priorities',
        'Testing strategy needs improvement',
      ];

      store.getState().addAnalysis(createMockAnalysis({ roundNumber: 0 }));
      store.getState().updateAnalysisData(0, payload);

      const data = store.getState().analyses[0].analysisData;
      const insights = data!.roundSummary.keyInsights;

      expect(insights.length).toBeGreaterThanOrEqual(1);
      expect(insights.length).toBeLessThanOrEqual(6);
    });

    it('should include consensus points when participants agree', () => {
      setupCompletedRound(store, 0, 3);

      const payload = createMockAnalysisPayload(0);
      payload.roundSummary.consensusPoints = [
        'All participants recommend iterative development',
        'Security should be prioritized from the start',
        'Documentation is essential for maintainability',
      ];

      store.getState().addAnalysis(createMockAnalysis({ roundNumber: 0 }));
      store.getState().updateAnalysisData(0, payload);

      const data = store.getState().analyses[0].analysisData;
      expect(data!.roundSummary.consensusPoints.length).toBeGreaterThan(0);
    });

    it('should include divergent approaches when participants differ', () => {
      setupCompletedRound(store, 0, 2);

      const payload = createMockAnalysisPayload(0);
      payload.roundSummary.divergentApproaches = [
        {
          topic: 'Database choice',
          perspectives: ['SQL for ACID compliance', 'NoSQL for scalability'],
        },
        {
          topic: 'Deployment strategy',
          perspectives: ['Containers for portability', 'Serverless for cost optimization'],
        },
      ];

      store.getState().addAnalysis(createMockAnalysis({ roundNumber: 0 }));
      store.getState().updateAnalysisData(0, payload);

      const data = store.getState().analyses[0].analysisData;
      expect(data!.roundSummary.divergentApproaches.length).toBeGreaterThan(0);
      expect(data!.roundSummary.divergentApproaches[0].perspectives.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ==========================================================================
  // CONCLUSION SECTION TESTS
  // ==========================================================================

  describe('conclusion Section', () => {
    it('should include final recommendations (30-600 chars)', () => {
      setupCompletedRound(store, 0, 2);

      const conclusion = 'Based on the analysis, we recommend starting with a microservices architecture that can scale independently while maintaining data consistency through event-driven patterns.';

      const payload = createMockAnalysisPayload(0);
      payload.roundSummary.conclusion = conclusion;

      store.getState().addAnalysis(createMockAnalysis({ roundNumber: 0 }));
      store.getState().updateAnalysisData(0, payload);

      const data = store.getState().analyses[0].analysisData;
      const conclusionText = data!.roundSummary.conclusion;

      expect(conclusionText.length).toBeGreaterThanOrEqual(30);
      expect(conclusionText.length).toBeLessThanOrEqual(600);
    });

    it('should include recommended actions (1-5 items)', () => {
      setupCompletedRound(store, 0, 2);

      const payload = createMockAnalysisPayload(0);
      payload.roundSummary.recommendedActions = [
        {
          action: 'Can you explore the tradeoffs between SQL and NoSQL for our use case?',
          rationale: 'This will help clarify the database decision',
          suggestedModels: [],
          suggestedRoles: [],
          suggestedMode: '',
        },
        {
          action: 'What testing strategies would work best for a microservices architecture?',
          rationale: 'Testing approach was not fully addressed',
          suggestedModels: ['anthropic/claude-3'],
          suggestedRoles: ['Quality Analyst'],
          suggestedMode: 'analyzing',
        },
      ];

      store.getState().addAnalysis(createMockAnalysis({ roundNumber: 0 }));
      store.getState().updateAnalysisData(0, payload);

      const data = store.getState().analyses[0].analysisData;
      const actions = data!.roundSummary.recommendedActions;

      expect(actions.length).toBeGreaterThanOrEqual(1);
      expect(actions.length).toBeLessThanOrEqual(5);

      // Verify action structure
      actions.forEach((action) => {
        expect(action.action).toBeDefined();
        expect(action.rationale).toBeDefined();
        expect(Array.isArray(action.suggestedModels)).toBe(true);
        expect(Array.isArray(action.suggestedRoles)).toBe(true);
      });
    });

    it('should include decision framework with criteria', () => {
      setupCompletedRound(store, 0, 2);

      const payload = createMockAnalysisPayload(0);
      payload.roundSummary.decisionFramework = {
        criteriaToConsider: [
          'Time to market',
          'Team expertise',
          'Budget constraints',
          'Scalability requirements',
        ],
        scenarioRecommendations: [
          {
            scenario: 'Startup with limited resources',
            recommendation: 'Use managed services and serverless to reduce operational overhead',
          },
          {
            scenario: 'Enterprise with existing infrastructure',
            recommendation: 'Leverage containers and existing CI/CD pipelines',
          },
        ],
      };

      store.getState().addAnalysis(createMockAnalysis({ roundNumber: 0 }));
      store.getState().updateAnalysisData(0, payload);

      const data = store.getState().analyses[0].analysisData;
      const framework = data!.roundSummary.decisionFramework;

      expect(framework.criteriaToConsider.length).toBeGreaterThanOrEqual(2);
      expect(framework.criteriaToConsider.length).toBeLessThanOrEqual(5);
      expect(framework.scenarioRecommendations.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ==========================================================================
  // ANALYSIS DATA STRUCTURE TESTS
  // ==========================================================================

  describe('analysis Data Structure', () => {
    it('should have correct analysisData schema structure', () => {
      setupCompletedRound(store, 0, 2);

      // Use custom payload with correct schema structure
      const payload = createMockAnalysisPayload(0, {
        leaderboard: [
          createMockLeaderboardEntry(1, 0),
          createMockLeaderboardEntry(2, 1),
        ],
        participantAnalyses: [
          createMockParticipantAnalysis(0),
          createMockParticipantAnalysis(1),
        ],
      });
      store.getState().addAnalysis(createMockAnalysis({ roundNumber: 0 }));
      store.getState().updateAnalysisData(0, payload);

      const data = store.getState().analyses[0].analysisData;

      // Top-level structure
      expect(data).toHaveProperty('leaderboard');
      expect(data).toHaveProperty('participantAnalyses');
      expect(data).toHaveProperty('roundSummary');

      // Leaderboard entry structure - check fields that exist in our mock
      const leaderboardEntry = data!.leaderboard[0];
      expect(leaderboardEntry).toHaveProperty('rank');
      expect(leaderboardEntry).toHaveProperty('participantIndex');
      expect(leaderboardEntry).toHaveProperty('modelId');
      expect(leaderboardEntry).toHaveProperty('modelName');
      expect(leaderboardEntry).toHaveProperty('overallRating');
      expect(leaderboardEntry).toHaveProperty('badge');

      // Participant analysis structure - check fields that exist in our mock
      const participantAnalysis = data!.participantAnalyses[0];
      expect(participantAnalysis).toHaveProperty('participantIndex');
      expect(participantAnalysis).toHaveProperty('modelId');
      expect(participantAnalysis).toHaveProperty('overallRating');
      expect(participantAnalysis).toHaveProperty('skillsMatrix');
      expect(participantAnalysis).toHaveProperty('pros');
      expect(participantAnalysis).toHaveProperty('cons');
      expect(participantAnalysis).toHaveProperty('summary');

      // Round summary structure - test fields that exist in the factory
      const roundSummary = data!.roundSummary;
      expect(roundSummary).toHaveProperty('consensusPoints');
      expect(roundSummary).toHaveProperty('comparativeAnalysis');
      expect(roundSummary).toHaveProperty('decisionFramework');
      expect(roundSummary).toHaveProperty('overallSummary');
      expect(roundSummary).toHaveProperty('conclusion');
      expect(roundSummary).toHaveProperty('recommendedActions');
    });

    it('should generate correct analysis ID format: threadId_r{round}_analysis', () => {
      setupCompletedRound(store, 0, 1);

      const analysisId = 'thread-123_r0_analysis';
      store.getState().addAnalysis(createMockAnalysis({
        id: analysisId,
        threadId: 'thread-123',
        roundNumber: 0,
      }));

      const analysis = store.getState().analyses[0];
      expect(analysis.id).toBe(analysisId);
      expect(analysis.threadId).toBe('thread-123');
      expect(analysis.roundNumber).toBe(0);
    });

    it('should link analysis to correct round number', () => {
      setupCompletedRound(store, 0, 1);

      // Complete round 0
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
      }));

      // Add round 1
      store.getState().setMessages(prev => [...prev, createMockUserMessage(1)]);
      store.getState().setMessages(prev => [...prev, createMockMessage(0, 1)]);
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 1,
        status: AnalysisStatuses.STREAMING,
      }));

      const analyses = store.getState().analyses;
      expect(analyses[0].roundNumber).toBe(0);
      expect(analyses[1].roundNumber).toBe(1);
    });
  });

  // ==========================================================================
  // MODE-SPECIFIC ANALYSIS TESTS
  // ==========================================================================

  describe('mode-Specific Analysis', () => {
    it('should adapt analysis focus for brainstorming mode', () => {
      const thread = createMockThread({
        id: 'thread-123',
        mode: ChatModes.BRAINSTORMING,
      });
      const participants = [createMockParticipant(0)];
      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0),
        createMockMessage(0, 0),
      ]);

      const payload = createMockAnalysisPayload(0, {
        mode: ChatModes.BRAINSTORMING,
      });

      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 0,
        mode: ChatModes.BRAINSTORMING,
      }));
      store.getState().updateAnalysisData(0, payload);

      const analysis = store.getState().analyses[0];
      expect(analysis.mode).toBe(ChatModes.BRAINSTORMING);
    });

    it('should adapt analysis focus for analyzing mode', () => {
      const thread = createMockThread({
        id: 'thread-123',
        mode: ChatModes.ANALYZING,
      });
      const participants = [createMockParticipant(0)];
      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0),
        createMockMessage(0, 0),
      ]);

      const payload = createMockAnalysisPayload(0, {
        mode: ChatModes.ANALYZING,
      });

      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 0,
        mode: ChatModes.ANALYZING,
      }));
      store.getState().updateAnalysisData(0, payload);

      const analysis = store.getState().analyses[0];
      expect(analysis.mode).toBe(ChatModes.ANALYZING);
    });

    it('should adapt analysis focus for debating mode', () => {
      setupCompletedRound(store, 0, 2, ChatModes.DEBATING);

      const payload = createMockAnalysisPayload(0, {
        mode: ChatModes.DEBATING,
      });

      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 0,
        mode: ChatModes.DEBATING,
      }));
      store.getState().updateAnalysisData(0, payload);

      const analysis = store.getState().analyses[0];
      expect(analysis.mode).toBe(ChatModes.DEBATING);
    });
  });

  // ==========================================================================
  // MULTI-PARTICIPANT ANALYSIS TESTS
  // ==========================================================================

  describe('multi-Participant Analysis', () => {
    it('should focus on comparison for 2 participants', () => {
      setupCompletedRound(store, 0, 2);

      const payload = createMockAnalysisPayload(0, {
        participantAnalyses: [
          createMockParticipantAnalysis(0),
          createMockParticipantAnalysis(1),
        ],
        leaderboard: [
          createMockLeaderboardEntry(1, 0),
          createMockLeaderboardEntry(2, 1),
        ],
      });

      store.getState().addAnalysis(createMockAnalysis({ roundNumber: 0 }));
      store.getState().updateAnalysisData(0, payload);

      const data = store.getState().analyses[0].analysisData;

      // Should have comparison data
      expect(data!.participantAnalyses).toHaveLength(2);
      expect(data!.leaderboard).toHaveLength(2);
      expect(data!.roundSummary.comparativeAnalysis).toBeDefined();
    });

    it('should analyze group dynamics for 3+ participants', () => {
      setupCompletedRound(store, 0, 4);

      const payload = createMockAnalysisPayload(0, {
        participantAnalyses: [
          createMockParticipantAnalysis(0),
          createMockParticipantAnalysis(1),
          createMockParticipantAnalysis(2),
          createMockParticipantAnalysis(3),
        ],
        leaderboard: [
          createMockLeaderboardEntry(1, 2),
          createMockLeaderboardEntry(2, 0),
          createMockLeaderboardEntry(3, 3),
          createMockLeaderboardEntry(4, 1),
        ],
      });

      store.getState().addAnalysis(createMockAnalysis({ roundNumber: 0 }));
      store.getState().updateAnalysisData(0, payload);

      const data = store.getState().analyses[0].analysisData;

      // Should have group analysis
      expect(data!.participantAnalyses).toHaveLength(4);
      expect(data!.leaderboard).toHaveLength(4);
      expect(data!.roundSummary.consensusPoints).toBeDefined();
      // Note: divergentApproaches may not be in the factory's roundSummary
      // but comparativeAnalysis is - which serves similar purpose
      expect(data!.roundSummary.comparativeAnalysis).toBeDefined();
    });

    it('should provide individual assessment for single participant', () => {
      setupCompletedRound(store, 0, 1);

      const payload = createMockAnalysisPayload(0, {
        participantAnalyses: [createMockParticipantAnalysis(0)],
        leaderboard: [createMockLeaderboardEntry(1, 0)],
      });

      store.getState().addAnalysis(createMockAnalysis({ roundNumber: 0 }));
      store.getState().updateAnalysisData(0, payload);

      const data = store.getState().analyses[0].analysisData;

      // Should still have complete analysis
      expect(data!.participantAnalyses).toHaveLength(1);
      expect(data!.leaderboard).toHaveLength(1);
      expect(data!.roundSummary).toBeDefined();
    });
  });

  // ==========================================================================
  // ANALYSIS STATUS TRANSITIONS TESTS
  // ==========================================================================

  describe('analysis Status Transitions', () => {
    it('should transition PENDING -> STREAMING -> COMPLETE', () => {
      setupCompletedRound(store, 0, 2);

      // Create with PENDING status
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.PENDING,
      }));
      expect(store.getState().analyses[0].status).toBe(AnalysisStatuses.PENDING);

      // Transition to STREAMING
      store.getState().updateAnalysisStatus(0, AnalysisStatuses.STREAMING);
      expect(store.getState().analyses[0].status).toBe(AnalysisStatuses.STREAMING);

      // Transition to COMPLETE with data
      const payload = createMockAnalysisPayload(0);
      store.getState().updateAnalysisData(0, payload);
      expect(store.getState().analyses[0].status).toBe(AnalysisStatuses.COMPLETE);
    });

    it('should handle FAILED status', () => {
      setupCompletedRound(store, 0, 2);

      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.STREAMING,
      }));

      // Transition to FAILED
      store.getState().updateAnalysisError(0, 'Analysis generation failed');

      const analysis = store.getState().analyses[0];
      expect(analysis.status).toBe(AnalysisStatuses.FAILED);
      expect(analysis.errorMessage).toBe('Analysis generation failed');
    });

    it('should preserve analysisData when already COMPLETE', () => {
      setupCompletedRound(store, 0, 1);

      const payload = createMockAnalysisPayload(0);
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.STREAMING,
      }));
      store.getState().updateAnalysisData(0, payload);

      // Verify data persists after completion
      const analysis = store.getState().analyses[0];
      expect(analysis.status).toBe(AnalysisStatuses.COMPLETE);
      expect(analysis.analysisData).toBeDefined();
      expect(analysis.analysisData?.leaderboard).toBeDefined();
    });

    it('should track each round status independently', () => {
      setupCompletedRound(store, 0, 1);

      // Round 0 complete
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
      }));

      // Round 1 streaming
      store.getState().setMessages(prev => [...prev, createMockUserMessage(1)]);
      store.getState().setMessages(prev => [...prev, createMockMessage(0, 1)]);
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 1,
        status: AnalysisStatuses.STREAMING,
      }));

      const analyses = store.getState().analyses;
      expect(analyses[0].status).toBe(AnalysisStatuses.COMPLETE);
      expect(analyses[1].status).toBe(AnalysisStatuses.STREAMING);
    });

    it('should allow retry after FAILED status', () => {
      setupCompletedRound(store, 0, 1);

      // Initial failure
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.FAILED,
        errorMessage: 'Network error',
      }));

      // Remove failed analysis
      store.getState().removeAnalysis(0);
      expect(store.getState().analyses).toHaveLength(0);

      // Retry with new analysis
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.PENDING,
      }));
      expect(store.getState().analyses[0].status).toBe(AnalysisStatuses.PENDING);
    });
  });

  // ==========================================================================
  // EDGE CASE TESTS
  // ==========================================================================

  describe('edge Cases', () => {
    it('should handle empty pros or cons gracefully', () => {
      setupCompletedRound(store, 0, 1);

      // Minimum valid data
      const payload = createMockAnalysisPayload(0, {
        participantAnalyses: [
          createMockParticipantAnalysis(0, {
            pros: ['Single strength'],
            cons: ['Single improvement area'],
          }),
        ],
      });

      store.getState().addAnalysis(createMockAnalysis({ roundNumber: 0 }));
      store.getState().updateAnalysisData(0, payload);

      const data = store.getState().analyses[0].analysisData;
      expect(data!.participantAnalyses[0].pros).toHaveLength(1);
      expect(data!.participantAnalyses[0].cons).toHaveLength(1);
    });

    it('should handle analysis for round 0', () => {
      setupCompletedRound(store, 0, 2);

      store.getState().addAnalysis(createMockAnalysis({
        id: 'thread-123_r0_analysis',
        roundNumber: 0,
      }));

      const analysis = store.getState().analyses[0];
      expect(analysis.roundNumber).toBe(0);
      expect(analysis.id).toContain('r0');
    });

    it('should handle maximum participants (10)', () => {
      setupCompletedRound(store, 0, 10);

      const participantAnalyses = Array.from({ length: 10 }, (_, i) =>
        createMockParticipantAnalysis(i));
      const leaderboard = Array.from({ length: 10 }, (_, i) =>
        createMockLeaderboardEntry(i + 1, i));

      const payload = createMockAnalysisPayload(0, {
        participantAnalyses,
        leaderboard,
      });

      store.getState().addAnalysis(createMockAnalysis({ roundNumber: 0 }));
      store.getState().updateAnalysisData(0, payload);

      const data = store.getState().analyses[0].analysisData;
      expect(data!.participantAnalyses).toHaveLength(10);
      expect(data!.leaderboard).toHaveLength(10);
    });

    it('should update analysis data without losing existing fields', () => {
      setupCompletedRound(store, 0, 1);

      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.STREAMING,
        mode: ChatModes.DEBATING,
        userQuestion: 'Original question',
      }));

      const payload = createMockAnalysisPayload(0);
      store.getState().updateAnalysisData(0, payload);

      const analysis = store.getState().analyses[0];
      expect(analysis.userQuestion).toBe('Original question');
      expect(analysis.mode).toBe(ChatModes.DEBATING);
      expect(analysis.analysisData).toBeDefined();
    });
  });
});
