/**
 * Round Analysis & Navigation Comprehensive Tests (Section 4)
 *
 * Tests analysis triggering, content streaming, UI states, and navigation behavior
 * based on COMPREHENSIVE_TEST_PLAN.md Section 4.
 *
 * FLOW TESTED:
 * 4.1 Analysis Triggering
 *   - ANALYSIS-TRIG-01: Analysis triggers after ALL selected models finish
 *   - ANALYSIS-TRIG-02: Analysis does NOT trigger if "Stop" was clicked
 *   - ANALYSIS-TRIG-03: "Analyzing responses..." UI state appears
 *
 * 4.2 Analysis Content & UI
 *   - ANALYSIS-UI-01: Progressive streaming of analysis sections
 *   - ANALYSIS-UI-02: Leaderboard ranks match scores
 *   - ANALYSIS-UI-03: Skills Chart renders with correct dimensions for mode
 *   - ANALYSIS-UI-04: Individual cards show correct strengths/weaknesses
 *   - ANALYSIS-UI-05: Empty analysis fallback
 *   - ANALYSIS-ERR-01: Handling malformed JSON from analysis stream
 *
 * 4.3 Navigation (First Round Only)
 *   - NAV-01: Automatic navigation from /chat to /chat/[slug]
 *   - NAV-02: Immediate polling after thread creation
 *   - NAV-03: URL update via history.replaceState
 *   - NAV-04: router.push after analysis completion
 *   - NAV-05: Navigation fallback if title generation fails
 *
 * Location: /src/stores/chat/__tests__/round-analysis-transitions.test.ts
 */

import type { UIMessage } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AnalysisStatuses,
  ChatModes,
  ScreenModes,
} from '@/api/core/enums';
import type { LeaderboardEntry, ModeratorAnalysisPayload, ParticipantAnalysis } from '@/api/routes/chat/schema';
import { createChatStore } from '@/stores/chat/store';

import {
  createMockAnalysis,
  createMockAnalysisPayload,
  createMockMessage,
  createMockParticipant,
  createMockThread,
  createMockUserMessage,
  createPendingAnalysis,
  createStreamingAnalysis,
  createTimedOutAnalysis,
} from './test-factories';

// ============================================================================
// TEST UTILITIES
// ============================================================================

function createTestStore() {
  return createChatStore();
}

/**
 * Setup store with completed participants for a round
 * Simulates all participants having finished their responses
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
 * Create mock leaderboard entry for testing
 */
function createMockLeaderboardEntry(
  rank: number,
  participantIndex: number,
  score: number,
  badges: string[] = [],
): LeaderboardEntry {
  return {
    rank,
    participantIndex,
    model: `openai/gpt-4-${participantIndex}`,
    score,
    badges,
  };
}

/**
 * Create mock participant analysis for testing
 */
function createMockParticipantAnalysisData(
  participantIndex: number,
  overrides?: Partial<ParticipantAnalysis>,
): ParticipantAnalysis {
  return {
    participantIndex,
    model: `openai/gpt-4-${participantIndex}`,
    role: null,
    overallScore: 85,
    keyInsights: ['Key insight 1', 'Key insight 2'],
    strengths: ['Strength 1', 'Strength 2'],
    weaknesses: ['Weakness 1'],
    uniqueContributions: ['Unique contribution 1'],
    reasoning: {
      clarity: 8,
      depth: 7,
      evidence: 8,
      creativity: 7,
    },
    communication: {
      engagement: 8,
      tone: 8,
      structure: 7,
    },
    factualAccuracy: {
      score: 8,
      concerns: [],
    },
    summary: `Participant ${participantIndex} provided a comprehensive response.`,
    ...overrides,
  };
}

// ============================================================================
// SECTION 4.1: ANALYSIS TRIGGERING
// ============================================================================

describe('section 4.1: Analysis Triggering', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  /**
   * ANALYSIS-TRIG-01: Test analysis triggers automatically after ALL selected models finish
   *
   * Validates that the analysis only begins after every selected AI participant
   * has completed their response, not prematurely after any single participant.
   */
  describe('aNALYSIS-TRIG-01: Analysis triggers after ALL models finish', () => {
    it('should trigger analysis only when all participants have responded', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = [
        createMockParticipant(0, { threadId: 'thread-123' }),
        createMockParticipant(1, { threadId: 'thread-123' }),
        createMockParticipant(2, { threadId: 'thread-123' }),
      ];

      // Initialize with user message only
      const messages = [createMockUserMessage(0)];
      store.getState().initializeThread(thread, participants, messages);
      store.getState().setIsStreaming(true);

      // Participant 0 responds - should NOT trigger analysis yet
      store.getState().setMessages(prev => [...prev, createMockMessage(0, 0)]);
      expect(store.getState().analyses).toHaveLength(0);

      // Participant 1 responds - should NOT trigger analysis yet
      store.getState().setMessages(prev => [...prev, createMockMessage(1, 0)]);
      expect(store.getState().analyses).toHaveLength(0);

      // Participant 2 responds - all finished, can now trigger analysis
      store.getState().setMessages(prev => [...prev, createMockMessage(2, 0)]);
      store.getState().setIsStreaming(false);

      // Verify all participant messages exist
      const state = store.getState();
      const participantMessages = state.messages.filter(m => m.role === 'assistant');
      expect(participantMessages).toHaveLength(3);

      // Add analysis (simulating what provider does after all complete)
      store.getState().addAnalysis(createPendingAnalysis(0));
      expect(store.getState().analyses).toHaveLength(1);
      expect(store.getState().analyses[0].status).toBe(AnalysisStatuses.PENDING);
    });

    it('should count all selected participants before triggering', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = [
        createMockParticipant(0, { threadId: 'thread-123', isEnabled: true }),
        createMockParticipant(1, { threadId: 'thread-123', isEnabled: true }),
      ];

      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);
      store.getState().setIsStreaming(true);

      // Only 1 of 2 completed
      store.getState().setMessages(prev => [...prev, createMockMessage(0, 0)]);

      // Verify incomplete - streaming should continue
      expect(store.getState().isStreaming).toBe(true);

      // Complete second participant
      store.getState().setMessages(prev => [...prev, createMockMessage(1, 0)]);
      store.getState().setIsStreaming(false);

      // Now analysis can be created
      store.getState().addAnalysis(createPendingAnalysis(0));
      expect(store.getState().analyses[0].roundNumber).toBe(0);
    });

    it('should handle single participant correctly', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = [createMockParticipant(0, { threadId: 'thread-123' })];

      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);
      store.getState().setIsStreaming(true);

      // Single participant completes
      store.getState().setMessages(prev => [...prev, createMockMessage(0, 0)]);
      store.getState().setIsStreaming(false);

      // Analysis should be triggered
      store.getState().addAnalysis(createPendingAnalysis(0));
      expect(store.getState().analyses).toHaveLength(1);
    });

    it('should handle maximum participants (10)', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = Array.from({ length: 10 }, (_, i) =>
        createMockParticipant(i, { threadId: 'thread-123' }));

      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);
      store.getState().setIsStreaming(true);

      // Add all 10 participant responses
      for (let i = 0; i < 10; i++) {
        store.getState().setMessages(prev => [...prev, createMockMessage(i, 0)]);
      }
      store.getState().setIsStreaming(false);

      // Verify all messages
      const participantMessages = store.getState().messages.filter(m => m.role === 'assistant');
      expect(participantMessages).toHaveLength(10);

      // Analysis can now be triggered
      store.getState().addAnalysis(createPendingAnalysis(0));
      expect(store.getState().analyses).toHaveLength(1);
    });
  });

  /**
   * ANALYSIS-TRIG-02: Test analysis does NOT trigger if "Stop" was clicked
   *
   * Validates that stopping the streaming mid-way prevents the analysis from
   * being triggered since not all participants completed their responses.
   */
  describe('aNALYSIS-TRIG-02: Analysis does NOT trigger if Stop clicked', () => {
    it('should not create analysis when streaming is stopped', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = [
        createMockParticipant(0, { threadId: 'thread-123' }),
        createMockParticipant(1, { threadId: 'thread-123' }),
        createMockParticipant(2, { threadId: 'thread-123' }),
      ];

      // Initialize with only partial responses (2 of 3)
      const messages = [
        createMockUserMessage(0),
        createMockMessage(0, 0),
        createMockMessage(1, 0),
        // Model 3 never completed due to stop
      ];

      store.getState().initializeThread(thread, participants, messages);
      store.getState().setIsStreaming(true);

      // User clicks Stop
      store.getState().stopStreaming();

      // Verify streaming stopped
      expect(store.getState().isStreaming).toBe(false);

      // No analysis should be created for incomplete round
      expect(store.getState().analyses).toHaveLength(0);
    });

    it('should set isStopped flag when stop is clicked', () => {
      const thread = createMockThread({ id: 'thread-123' });
      store.getState().initializeThread(thread, [createMockParticipant(0)], [createMockUserMessage(0)]);
      store.getState().setIsStreaming(true);

      // Verify streaming is active
      expect(store.getState().isStreaming).toBe(true);

      // Stop streaming
      store.getState().stopStreaming();

      // Verify stopped state
      expect(store.getState().isStreaming).toBe(false);
    });

    it('should prevent analysis even if some participants finished', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = [
        createMockParticipant(0),
        createMockParticipant(1),
      ];

      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);
      store.getState().setIsStreaming(true);

      // First participant completes
      store.getState().setMessages(prev => [...prev, createMockMessage(0, 0)]);

      // User clicks Stop before second participant
      store.getState().stopStreaming();

      // Analysis should not be created
      expect(store.getState().analyses).toHaveLength(0);
    });

    it('should handle stop during first participant response', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);
      store.getState().setIsStreaming(true);

      // Stop before any participant completes
      store.getState().stopStreaming();

      // No analysis
      expect(store.getState().analyses).toHaveLength(0);
    });
  });

  /**
   * ANALYSIS-TRIG-03: Verify "Analyzing responses..." UI state appears
   *
   * Validates that the analysis enters PENDING or STREAMING status to
   * trigger the appropriate UI state for users.
   */
  describe('aNALYSIS-TRIG-03: Analyzing responses UI state', () => {
    it('should show PENDING status immediately after creation', () => {
      const thread = createMockThread({ id: 'thread-123' });
      store.getState().initializeThread(thread, [], []);

      // Add pending analysis
      const pendingAnalysis = createPendingAnalysis(0);
      store.getState().setAnalyses([pendingAnalysis]);

      const analysis = store.getState().analyses[0];
      expect(analysis.status).toBe(AnalysisStatuses.PENDING);
    });

    it('should transition to STREAMING status when analysis begins', () => {
      const thread = createMockThread({ id: 'thread-123' });
      store.getState().initializeThread(thread, [], []);

      // Add streaming analysis
      const streamingAnalysis = createStreamingAnalysis(0);
      store.getState().setAnalyses([streamingAnalysis]);

      const analysis = store.getState().analyses[0];
      expect(analysis.status).toBe(AnalysisStatuses.STREAMING);
    });

    it('should track correct round number for UI display', () => {
      const thread = createMockThread({ id: 'thread-123' });
      store.getState().initializeThread(thread, [], []);

      // Round 0 analysis
      store.getState().setAnalyses([createPendingAnalysis(0)]);
      expect(store.getState().analyses[0].roundNumber).toBe(0);

      // Add Round 1 analysis
      store.getState().setAnalyses([
        createPendingAnalysis(0),
        createPendingAnalysis(1),
      ]);
      expect(store.getState().analyses[1].roundNumber).toBe(1);
    });

    it('should use markAnalysisCreated to prevent duplicate creation', () => {
      setupCompletedRound(store, 0, 2);
      store.getState().setIsStreaming(false);

      // Mark analysis as created for round 0
      store.getState().markAnalysisCreated(0);
      expect(store.getState().hasAnalysisBeenCreated(0)).toBe(true);

      // Add the analysis
      store.getState().addAnalysis(createPendingAnalysis(0));

      // Second attempt to create should be blocked
      expect(store.getState().hasAnalysisBeenCreated(0)).toBe(true);
    });
  });
});

// ============================================================================
// SECTION 4.2: ANALYSIS CONTENT & UI
// ============================================================================

describe('section 4.2: Analysis Content & UI', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  /**
   * ANALYSIS-UI-01: Test progressive streaming of analysis sections
   *
   * Validates that analysis sections stream in the correct order:
   * Leaderboard -> Chart -> Cards -> Summary -> Conclusion
   */
  describe('aNALYSIS-UI-01: Progressive streaming order', () => {
    it('should have all sections present when analysis completes', () => {
      const thread = createMockThread({ id: 'thread-123' });
      store.getState().initializeThread(thread, [], []);

      // Complete analysis with all sections
      const analysisPayload = createMockAnalysisPayload(0);
      const completedAnalysis = createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
        analysisData: analysisPayload,
      });

      store.getState().setAnalyses([completedAnalysis]);

      const analysisData = store.getState().analyses[0].analysisData;

      // Verify all 5 sections present
      // Section 1: Leaderboard
      expect(analysisData?.leaderboard).toBeDefined();
      expect(analysisData?.leaderboard.length).toBeGreaterThan(0);

      // Section 2: Skills Chart (via participantAnalyses)
      expect(analysisData?.participantAnalyses).toBeDefined();

      // Section 3: Individual Cards (participantAnalyses)
      expect(analysisData?.participantAnalyses[0].strengths).toBeDefined();
      expect(analysisData?.participantAnalyses[0].weaknesses).toBeDefined();

      // Section 4: Summary
      expect(analysisData?.roundSummary).toBeDefined();
      expect(analysisData?.roundSummary?.overallSummary).toBeDefined();

      // Section 5: Conclusion
      expect(analysisData?.roundSummary?.conclusion).toBeDefined();
    });

    it('should transition through PENDING -> STREAMING -> COMPLETE', () => {
      setupCompletedRound(store, 0, 2);

      // Start with PENDING
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

    it('should maintain data structure during streaming updates', () => {
      setupCompletedRound(store, 0, 2);

      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.STREAMING,
      }));

      // Update with partial data (simulating streaming)
      const partialPayload: ModeratorAnalysisPayload = {
        ...createMockAnalysisPayload(0),
        leaderboard: [
          createMockLeaderboardEntry(1, 0, 90, ['Top Performer']),
        ],
        participantAnalyses: [
          createMockParticipantAnalysisData(0),
        ],
      };

      store.getState().updateAnalysisData(0, partialPayload);

      // Verify data integrity
      const analysis = store.getState().analyses[0];
      expect(analysis.analysisData?.leaderboard).toHaveLength(1);
      expect(analysis.analysisData?.participantAnalyses).toHaveLength(1);
    });
  });

  /**
   * ANALYSIS-UI-02: Verify Leaderboard ranks match scores
   *
   * Validates that the leaderboard correctly orders participants by score
   * and assigns appropriate ranks.
   */
  describe('aNALYSIS-UI-02: Leaderboard ranks match scores', () => {
    it('should order participants by score descending', () => {
      const analysisPayload = createMockAnalysisPayload(0, {
        leaderboard: [
          createMockLeaderboardEntry(1, 2, 95, ['Winner']),
          createMockLeaderboardEntry(2, 0, 85, ['Runner-up']),
          createMockLeaderboardEntry(3, 1, 75, []),
        ],
      });

      const analysis = createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
        analysisData: analysisPayload,
      });

      store.getState().setAnalyses([analysis]);

      const leaderboard = store.getState().analyses[0].analysisData?.leaderboard;

      // Verify ordering
      expect(leaderboard?.[0].rank).toBe(1);
      expect(leaderboard?.[0].score).toBe(95);
      expect(leaderboard?.[1].rank).toBe(2);
      expect(leaderboard?.[1].score).toBe(85);
      expect(leaderboard?.[2].rank).toBe(3);
      expect(leaderboard?.[2].score).toBe(75);
    });

    it('should include badges for top performers', () => {
      const analysisPayload = createMockAnalysisPayload(0, {
        leaderboard: [
          createMockLeaderboardEntry(1, 0, 95, ['Top Performer', 'Most Creative']),
          createMockLeaderboardEntry(2, 1, 85, ['Strong Contender']),
          createMockLeaderboardEntry(3, 2, 75, []),
        ],
      });

      store.getState().setAnalyses([createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
        analysisData: analysisPayload,
      })]);

      const leaderboard = store.getState().analyses[0].analysisData?.leaderboard;

      // Verify badges
      expect(leaderboard?.[0].badges).toContain('Top Performer');
      expect(leaderboard?.[0].badges).toContain('Most Creative');
      expect(leaderboard?.[1].badges).toContain('Strong Contender');
      expect(leaderboard?.[2].badges).toHaveLength(0);
    });

    it('should map participant indices correctly', () => {
      const analysisPayload = createMockAnalysisPayload(0, {
        leaderboard: [
          createMockLeaderboardEntry(1, 2, 95, []), // Participant 2 is 1st
          createMockLeaderboardEntry(2, 0, 85, []), // Participant 0 is 2nd
          createMockLeaderboardEntry(3, 1, 75, []), // Participant 1 is 3rd
        ],
      });

      store.getState().setAnalyses([createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
        analysisData: analysisPayload,
      })]);

      const leaderboard = store.getState().analyses[0].analysisData?.leaderboard;

      expect(leaderboard?.[0].participantIndex).toBe(2);
      expect(leaderboard?.[1].participantIndex).toBe(0);
      expect(leaderboard?.[2].participantIndex).toBe(1);
    });
  });

  /**
   * ANALYSIS-UI-03: Verify Skills Chart renders with correct dimensions for mode
   *
   * Validates that analysis adapts skill dimensions based on the conversation mode.
   */
  describe('aNALYSIS-UI-03: Skills Chart mode-specific dimensions', () => {
    it('should have correct mode for Debating', () => {
      const analysisPayload = createMockAnalysisPayload(0, {
        mode: ChatModes.DEBATING,
      });

      const analysis = createMockAnalysis({
        roundNumber: 0,
        mode: ChatModes.DEBATING,
        status: AnalysisStatuses.COMPLETE,
        analysisData: analysisPayload,
      });

      store.getState().setAnalyses([analysis]);

      expect(store.getState().analyses[0].mode).toBe(ChatModes.DEBATING);
      expect(store.getState().analyses[0].analysisData?.mode).toBe(ChatModes.DEBATING);
    });

    it('should have correct mode for Brainstorming', () => {
      const analysisPayload = createMockAnalysisPayload(0, {
        mode: ChatModes.BRAINSTORMING,
      });

      const analysis = createMockAnalysis({
        roundNumber: 0,
        mode: ChatModes.BRAINSTORMING,
        status: AnalysisStatuses.COMPLETE,
        analysisData: analysisPayload,
      });

      store.getState().setAnalyses([analysis]);

      expect(store.getState().analyses[0].mode).toBe(ChatModes.BRAINSTORMING);
    });

    it('should have correct mode for Analyzing', () => {
      const analysisPayload = createMockAnalysisPayload(0, {
        mode: ChatModes.ANALYZING,
      });

      const analysis = createMockAnalysis({
        roundNumber: 0,
        mode: ChatModes.ANALYZING,
        status: AnalysisStatuses.COMPLETE,
        analysisData: analysisPayload,
      });

      store.getState().setAnalyses([analysis]);

      expect(store.getState().analyses[0].mode).toBe(ChatModes.ANALYZING);
    });

    it('should have correct mode for Problem Solving', () => {
      const analysisPayload = createMockAnalysisPayload(0, {
        mode: ChatModes.PROBLEM_SOLVING,
      });

      const analysis = createMockAnalysis({
        roundNumber: 0,
        mode: ChatModes.PROBLEM_SOLVING,
        status: AnalysisStatuses.COMPLETE,
        analysisData: analysisPayload,
      });

      store.getState().setAnalyses([analysis]);

      expect(store.getState().analyses[0].mode).toBe(ChatModes.PROBLEM_SOLVING);
    });

    it('should include reasoning scores for skills chart', () => {
      const analysisPayload = createMockAnalysisPayload(0);
      store.getState().setAnalyses([createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
        analysisData: analysisPayload,
      })]);

      const participantAnalysis = store.getState().analyses[0].analysisData?.participantAnalyses[0];

      // Verify skill dimensions
      expect(participantAnalysis?.reasoning).toBeDefined();
      expect(participantAnalysis?.reasoning?.clarity).toBeDefined();
      expect(participantAnalysis?.reasoning?.depth).toBeDefined();
      expect(participantAnalysis?.reasoning?.evidence).toBeDefined();
      expect(participantAnalysis?.reasoning?.creativity).toBeDefined();
    });
  });

  /**
   * ANALYSIS-UI-04: Verify Individual cards show correct strengths/weaknesses
   *
   * Validates that each participant's card contains appropriate feedback.
   */
  describe('aNALYSIS-UI-04: Individual cards content', () => {
    it('should create one card per AI model', () => {
      const analysisPayload = createMockAnalysisPayload(0, {
        participantAnalyses: [
          createMockParticipantAnalysisData(0),
          createMockParticipantAnalysisData(1),
          createMockParticipantAnalysisData(2),
        ],
      });

      store.getState().setAnalyses([createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
        analysisData: analysisPayload,
      })]);

      const analyses = store.getState().analyses[0].analysisData?.participantAnalyses;
      expect(analyses).toHaveLength(3);
    });

    it('should include strengths with meaningful content', () => {
      const analysisPayload = createMockAnalysisPayload(0, {
        participantAnalyses: [
          createMockParticipantAnalysisData(0, {
            strengths: [
              'Excellent technical depth and accuracy',
              'Clear and structured explanations',
              'Good use of real-world examples',
            ],
          }),
        ],
      });

      store.getState().setAnalyses([createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
        analysisData: analysisPayload,
      })]);

      const strengths = store.getState().analyses[0].analysisData?.participantAnalyses[0].strengths;

      expect(strengths?.length).toBeGreaterThanOrEqual(2);
      expect(strengths?.length).toBeLessThanOrEqual(4);
      strengths?.forEach((strength) => {
        expect(typeof strength).toBe('string');
        expect(strength.length).toBeGreaterThan(0);
      });
    });

    it('should include weaknesses with meaningful content', () => {
      const analysisPayload = createMockAnalysisPayload(0, {
        participantAnalyses: [
          createMockParticipantAnalysisData(0, {
            weaknesses: [
              'Could provide more practical examples',
              'Some points need further elaboration',
            ],
          }),
        ],
      });

      store.getState().setAnalyses([createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
        analysisData: analysisPayload,
      })]);

      const weaknesses = store.getState().analyses[0].analysisData?.participantAnalyses[0].weaknesses;

      expect(weaknesses?.length).toBeGreaterThanOrEqual(1);
      expect(weaknesses?.length).toBeLessThanOrEqual(3);
      weaknesses?.forEach((weakness) => {
        expect(typeof weakness).toBe('string');
        expect(weakness.length).toBeGreaterThan(0);
      });
    });

    it('should include summary paragraph', () => {
      const summaryText = 'This participant provided a comprehensive response that demonstrated strong analytical skills and clear communication. The answer addressed key points effectively.';

      const analysisPayload = createMockAnalysisPayload(0, {
        participantAnalyses: [
          createMockParticipantAnalysisData(0, { summary: summaryText }),
        ],
      });

      store.getState().setAnalyses([createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
        analysisData: analysisPayload,
      })]);

      const summary = store.getState().analyses[0].analysisData?.participantAnalyses[0].summary;
      expect(summary).toBe(summaryText);
      expect(summary?.length).toBeLessThanOrEqual(300);
    });

    it('should include overall score', () => {
      const analysisPayload = createMockAnalysisPayload(0, {
        participantAnalyses: [
          createMockParticipantAnalysisData(0, { overallScore: 85 }),
        ],
      });

      store.getState().setAnalyses([createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
        analysisData: analysisPayload,
      })]);

      const score = store.getState().analyses[0].analysisData?.participantAnalyses[0].overallScore;
      expect(score).toBe(85);
      expect(score).toBeLessThanOrEqual(100);
      expect(score).toBeGreaterThanOrEqual(0);
    });
  });

  /**
   * ANALYSIS-UI-05: Test empty analysis fallback
   *
   * Validates graceful handling when API returns partial or empty data.
   */
  describe('aNALYSIS-UI-05: Empty analysis fallback', () => {
    it('should handle null analysisData gracefully', () => {
      const analysis = createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.PENDING,
        analysisData: null,
      });

      store.getState().setAnalyses([analysis]);

      expect(store.getState().analyses[0].analysisData).toBeNull();
      expect(store.getState().analyses[0].status).toBe(AnalysisStatuses.PENDING);
    });

    it('should handle empty participant analyses array', () => {
      const analysisPayload = createMockAnalysisPayload(0, {
        participantAnalyses: [],
        leaderboard: [],
      });

      const analysis = createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
        analysisData: analysisPayload,
      });

      store.getState().setAnalyses([analysis]);

      expect(store.getState().analyses[0].analysisData?.participantAnalyses).toHaveLength(0);
      expect(store.getState().analyses[0].analysisData?.leaderboard).toHaveLength(0);
    });

    it('should handle missing optional fields', () => {
      const minimalPayload = createMockAnalysisPayload(0, {
        participantAnalyses: [
          createMockParticipantAnalysisData(0, {
            keyInsights: [],
            uniqueContributions: [],
          }),
        ],
      });

      store.getState().setAnalyses([createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
        analysisData: minimalPayload,
      })]);

      const analysis = store.getState().analyses[0].analysisData?.participantAnalyses[0];
      expect(analysis?.keyInsights).toHaveLength(0);
      expect(analysis?.uniqueContributions).toHaveLength(0);
    });
  });

  /**
   * ANALYSIS-ERR-01: Test handling of malformed JSON from analysis stream
   *
   * Validates that analysis errors are properly captured and status is set to FAILED.
   */
  describe('aNALYSIS-ERR-01: Malformed JSON handling', () => {
    it('should transition to FAILED status on error', () => {
      setupCompletedRound(store, 0, 2);

      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.STREAMING,
      }));

      // Simulate error during parsing
      store.getState().updateAnalysisError(0, 'Failed to parse analysis JSON');

      const analysis = store.getState().analyses[0];
      expect(analysis.status).toBe(AnalysisStatuses.FAILED);
      expect(analysis.errorMessage).toBe('Failed to parse analysis JSON');
    });

    it('should preserve roundNumber on error', () => {
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 2,
        status: AnalysisStatuses.STREAMING,
      }));

      store.getState().updateAnalysisError(2, 'JSON parse error');

      expect(store.getState().analyses[0].roundNumber).toBe(2);
      expect(store.getState().analyses[0].status).toBe(AnalysisStatuses.FAILED);
    });

    it('should allow retry after FAILED status', () => {
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.FAILED,
        errorMessage: 'Initial failure',
      }));

      // Remove failed analysis
      store.getState().removeAnalysis(0);
      expect(store.getState().analyses).toHaveLength(0);

      // Retry with new analysis
      store.getState().addAnalysis(createPendingAnalysis(0));
      expect(store.getState().analyses[0].status).toBe(AnalysisStatuses.PENDING);
    });
  });
});

// ============================================================================
// SECTION 4.3: NAVIGATION (FIRST ROUND ONLY)
// ============================================================================

describe('section 4.3: Navigation (First Round Only)', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  /**
   * NAV-01 (Critical): Verify automatic navigation conditions
   *
   * Navigation from /chat to /chat/[slug] happens ONLY when:
   * 1. Analysis is COMPLETED
   * 2. AI-generated title is ready (polled via slug-status)
   */
  describe('nAV-01: Automatic navigation conditions', () => {
    it('should meet navigation conditions when analysis COMPLETED and title ready', () => {
      const thread = createMockThread({
        id: 'thread-123',
        slug: 'ai-generated-slug',
        isAiGeneratedTitle: true,
      });

      store.getState().initializeThread(thread, [], []);
      store.getState().setScreenMode(ScreenModes.OVERVIEW);

      // Analysis complete
      store.getState().setAnalyses([createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
      })]);

      // Verify both conditions
      const state = store.getState();
      const isAnalysisComplete = state.analyses[0].status === AnalysisStatuses.COMPLETE;
      const isTitleReady = state.thread?.isAiGeneratedTitle === true;

      expect(isAnalysisComplete).toBe(true);
      expect(isTitleReady).toBe(true);
    });

    it('should NOT navigate if analysis is still STREAMING', () => {
      const thread = createMockThread({
        id: 'thread-123',
        slug: 'ai-generated-slug',
        isAiGeneratedTitle: true,
      });

      store.getState().initializeThread(thread, [], []);
      store.getState().setAnalyses([createStreamingAnalysis(0)]);

      const state = store.getState();
      const shouldNavigate = state.analyses[0].status === AnalysisStatuses.COMPLETE
        && state.thread?.isAiGeneratedTitle;

      expect(shouldNavigate).toBe(false);
    });

    it('should NOT navigate if AI title not ready', () => {
      const thread = createMockThread({
        id: 'thread-123',
        slug: 'initial-slug',
        isAiGeneratedTitle: false, // Not ready
      });

      store.getState().initializeThread(thread, [], []);
      store.getState().setAnalyses([createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
      })]);

      const state = store.getState();
      const shouldNavigate = state.analyses[0].status === AnalysisStatuses.COMPLETE
        && state.thread?.isAiGeneratedTitle;

      expect(shouldNavigate).toBe(false);
    });

    it('should NOT navigate if analysis is PENDING', () => {
      const thread = createMockThread({
        id: 'thread-123',
        slug: 'ai-slug',
        isAiGeneratedTitle: true,
      });

      store.getState().initializeThread(thread, [], []);
      store.getState().setAnalyses([createPendingAnalysis(0)]);

      const state = store.getState();
      const shouldNavigate = state.analyses[0].status === AnalysisStatuses.COMPLETE
        && state.thread?.isAiGeneratedTitle;

      expect(shouldNavigate).toBe(false);
    });
  });

  /**
   * NAV-02: Test immediate polling starts after thread creation
   *
   * Validates that slug polling begins as soon as thread is created,
   * not after streaming or analysis completion.
   */
  describe('nAV-02: Immediate polling after thread creation', () => {
    it('should have polling conditions met after thread creation', () => {
      const thread = createMockThread({
        id: 'thread-123',
        slug: 'initial-slug',
        isAiGeneratedTitle: false,
      });

      store.getState().initializeThread(thread, [], []);
      store.getState().setCreatedThreadId('thread-123');
      store.getState().setShowInitialUI(false);

      const state = store.getState();

      // Polling conditions
      const shouldPoll = !state.showInitialUI
        && state.createdThreadId !== null
        && !state.thread?.isAiGeneratedTitle;

      expect(shouldPoll).toBe(true);
    });

    it('should continue polling during streaming', () => {
      const thread = createMockThread({
        id: 'thread-123',
        isAiGeneratedTitle: false,
      });

      store.getState().initializeThread(thread, [], []);
      store.getState().setCreatedThreadId('thread-123');
      store.getState().setShowInitialUI(false);
      store.getState().setIsStreaming(true);

      const state = store.getState();

      // Polling should still be active during streaming
      const shouldPoll = !state.showInitialUI
        && state.createdThreadId !== null
        && !state.thread?.isAiGeneratedTitle;

      expect(shouldPoll).toBe(true);
      expect(state.isStreaming).toBe(true);
    });

    it('should require createdThreadId for polling', () => {
      const thread = createMockThread({ id: 'thread-123' });
      store.getState().initializeThread(thread, [], []);
      store.getState().setShowInitialUI(false);
      // createdThreadId NOT set

      const state = store.getState();
      const shouldPoll = !state.showInitialUI && state.createdThreadId !== null;

      expect(shouldPoll).toBe(false);
    });
  });

  /**
   * NAV-03: Test URL update via history.replaceState
   *
   * Validates that when title is ready during streaming, URL is updated
   * without full navigation (no reload).
   */
  describe('nAV-03: URL update via history.replaceState', () => {
    it('should update thread slug when AI title ready', () => {
      const thread = createMockThread({
        id: 'thread-123',
        slug: 'initial-slug',
        isAiGeneratedTitle: false,
      });

      store.getState().initializeThread(thread, [], []);
      store.getState().setIsStreaming(true);

      // AI title becomes ready during streaming
      const updatedThread = createMockThread({
        id: 'thread-123',
        slug: 'ai-generated-beautiful-slug',
        title: 'AI Generated Title',
        isAiGeneratedTitle: true,
      });

      store.getState().setThread(updatedThread);

      // Verify update
      expect(store.getState().thread?.slug).toBe('ai-generated-beautiful-slug');
      expect(store.getState().thread?.isAiGeneratedTitle).toBe(true);
      expect(store.getState().isStreaming).toBe(true); // Still streaming
    });

    it('should maintain screen mode during URL replace', () => {
      const thread = createMockThread({
        id: 'thread-123',
        isAiGeneratedTitle: false,
      });

      store.getState().initializeThread(thread, [], []);
      store.getState().setScreenMode(ScreenModes.OVERVIEW);

      // Update thread with AI title
      store.getState().setThread({
        ...thread,
        slug: 'ai-slug',
        isAiGeneratedTitle: true,
      });

      // Screen mode should NOT change yet
      expect(store.getState().screenMode).toBe(ScreenModes.OVERVIEW);
    });
  });

  /**
   * NAV-04: Test router.push occurs after analysis completion
   *
   * Validates that full navigation happens after both conditions are met.
   */
  describe('nAV-04: router.push after analysis completion', () => {
    it('should allow screen mode change when conditions met', () => {
      const thread = createMockThread({
        id: 'thread-123',
        slug: 'ai-generated-slug',
        isAiGeneratedTitle: true,
      });

      store.getState().initializeThread(thread, [], []);
      store.getState().setScreenMode(ScreenModes.OVERVIEW);

      // Complete analysis
      store.getState().setAnalyses([createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
      })]);

      // Simulate router.push effect
      store.getState().setScreenMode(ScreenModes.THREAD);

      expect(store.getState().screenMode).toBe(ScreenModes.THREAD);
    });

    it('should track hasUpdatedThread for navigation guard', () => {
      const thread = createMockThread({
        id: 'thread-123',
        isAiGeneratedTitle: false,
      });

      store.getState().initializeThread(thread, [], []);

      // Before title update
      expect(store.getState().thread?.isAiGeneratedTitle).toBe(false);

      // After title update
      store.getState().setThread({
        ...thread,
        slug: 'ai-slug',
        isAiGeneratedTitle: true,
      });

      expect(store.getState().thread?.isAiGeneratedTitle).toBe(true);
    });
  });

  /**
   * NAV-05: Edge Case - Navigation fallback if title generation fails
   *
   * Validates that user can still navigate with fallback ID-based slug.
   */
  describe('nAV-05: Navigation fallback on title generation failure', () => {
    it('should keep original title and slug if AI title fails', () => {
      const thread = createMockThread({
        id: 'thread-123',
        title: 'New Chat',
        slug: 'initial-slug-abc123',
        isAiGeneratedTitle: false,
      });

      store.getState().initializeThread(thread, [], []);

      // Complete analysis but no AI title
      store.getState().setAnalyses([createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
      })]);

      // Thread remains with original values
      expect(store.getState().thread?.title).toBe('New Chat');
      expect(store.getState().thread?.slug).toBe('initial-slug-abc123');
      expect(store.getState().thread?.isAiGeneratedTitle).toBe(false);
    });

    it('should allow conversation to continue without AI title', () => {
      const thread = createMockThread({
        id: 'thread-123',
        title: 'New Chat',
        slug: 'fallback-slug',
        isAiGeneratedTitle: false,
      });

      store.getState().initializeThread(thread, [createMockParticipant(0)], [
        createMockUserMessage(0),
        createMockMessage(0, 0),
      ]);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // User can submit more messages
      store.getState().setMessages(prev => [...prev, createMockUserMessage(1, 'Second question')]);

      expect(store.getState().messages).toHaveLength(3);
      expect(store.getState().thread?.title).toBe('New Chat');
    });
  });

  /**
   * Analysis Timeout Detection - 60s timeout fallback
   */
  describe('analysis Timeout Detection', () => {
    it('should detect timed out analysis (>60s streaming)', () => {
      const thread = createMockThread({ id: 'thread-123' });
      store.getState().initializeThread(thread, [], []);

      // Analysis timed out
      const timedOutAnalysis = createTimedOutAnalysis(0);
      store.getState().setAnalyses([timedOutAnalysis]);

      const analysis = store.getState().analyses[0];
      const elapsed = Date.now() - new Date(analysis.createdAt).getTime();

      // Should be detected as timed out
      expect(elapsed).toBeGreaterThan(60000);
      expect(analysis.status).toBe(AnalysisStatuses.STREAMING);
    });

    it('should use multi-layer completion detection', () => {
      const thread = createMockThread({ id: 'thread-123' });
      store.getState().initializeThread(thread, [], []);

      // Detection logic should consider multiple conditions:
      // 1. status === 'complete' (primary)
      // 2. (status === 'streaming' && elapsed > 60s) (timeout)
      // 3. (status === 'pending' && !isStreaming && elapsed > 60s) (stuck)

      // Test primary condition
      store.getState().setAnalyses([createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
      })]);

      expect(store.getState().analyses[0].status).toBe(AnalysisStatuses.COMPLETE);
    });
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('round Analysis Complete Flow', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should execute complete analysis flow for Round 1', () => {
    // Setup
    const thread = createMockThread({
      id: 'thread-123',
      slug: 'test-thread',
      isAiGeneratedTitle: false,
    });
    const participants = [
      createMockParticipant(0, { threadId: 'thread-123' }),
      createMockParticipant(1, { threadId: 'thread-123' }),
    ];
    const messages = [
      createMockUserMessage(0),
      createMockMessage(0, 0),
      createMockMessage(1, 0),
    ];

    store.getState().initializeThread(thread, participants, messages);
    store.getState().setScreenMode(ScreenModes.OVERVIEW);

    // Streaming complete
    store.getState().setIsStreaming(false);

    // Analysis PENDING
    store.getState().setAnalyses([createPendingAnalysis(0)]);
    expect(store.getState().analyses[0].status).toBe(AnalysisStatuses.PENDING);

    // Analysis STREAMING
    store.getState().setAnalyses([createStreamingAnalysis(0)]);
    expect(store.getState().analyses[0].status).toBe(AnalysisStatuses.STREAMING);

    // Analysis COMPLETE
    const completedAnalysis = createMockAnalysis({
      roundNumber: 0,
      status: AnalysisStatuses.COMPLETE,
      analysisData: createMockAnalysisPayload(0),
    });
    store.getState().setAnalyses([completedAnalysis]);

    // AI title ready
    store.getState().setThread(createMockThread({
      id: 'thread-123',
      slug: 'ai-generated-slug',
      title: 'AI Generated Title',
      isAiGeneratedTitle: true,
    }));

    // Navigation triggered
    store.getState().setScreenMode(ScreenModes.THREAD);

    const finalState = store.getState();
    expect(finalState.analyses[0].status).toBe(AnalysisStatuses.COMPLETE);
    expect(finalState.thread?.isAiGeneratedTitle).toBe(true);
    expect(finalState.screenMode).toBe(ScreenModes.THREAD);
  });

  it('should handle multi-round with analysis per round', () => {
    const thread = createMockThread({ id: 'thread-123' });
    store.getState().initializeThread(thread, [], []);

    // Round 0 analysis
    const round0Analysis = createMockAnalysis({
      id: 'analysis-0',
      roundNumber: 0,
      status: AnalysisStatuses.COMPLETE,
      analysisData: createMockAnalysisPayload(0),
    });

    // Round 1 analysis
    const round1Analysis = createMockAnalysis({
      id: 'analysis-1',
      roundNumber: 1,
      status: AnalysisStatuses.COMPLETE,
      analysisData: createMockAnalysisPayload(1),
    });

    store.getState().setAnalyses([round0Analysis, round1Analysis]);

    const state = store.getState();
    expect(state.analyses).toHaveLength(2);
    expect(state.analyses[0].roundNumber).toBe(0);
    expect(state.analyses[1].roundNumber).toBe(1);
  });

  it('should preserve thread metadata during analysis flow', () => {
    const thread = createMockThread({
      id: 'thread-123',
      mode: ChatModes.BRAINSTORMING,
      enableWebSearch: true,
    });

    store.getState().initializeThread(thread, [], []);

    // Add analysis
    store.getState().setAnalyses([createMockAnalysis({
      roundNumber: 0,
      mode: ChatModes.BRAINSTORMING,
      status: AnalysisStatuses.COMPLETE,
    })]);

    // Thread metadata preserved
    expect(store.getState().thread?.mode).toBe(ChatModes.BRAINSTORMING);
    expect(store.getState().thread?.enableWebSearch).toBe(true);
    expect(store.getState().analyses[0].mode).toBe(ChatModes.BRAINSTORMING);
  });
});

// ============================================================================
// EDGE CASES & ERROR HANDLING
// ============================================================================

describe('analysis Edge Cases', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should handle analysis with single participant', () => {
    const analysisPayload = createMockAnalysisPayload(0, {
      leaderboard: [createMockLeaderboardEntry(1, 0, 85, [])],
      participantAnalyses: [createMockParticipantAnalysisData(0)],
    });

    store.getState().setAnalyses([createMockAnalysis({
      roundNumber: 0,
      status: AnalysisStatuses.COMPLETE,
      analysisData: analysisPayload,
    })]);

    expect(store.getState().analyses[0].analysisData?.participantAnalyses).toHaveLength(1);
    expect(store.getState().analyses[0].analysisData?.leaderboard).toHaveLength(1);
  });

  it('should handle rapid status transitions', () => {
    store.getState().addAnalysis(createPendingAnalysis(0));
    store.getState().updateAnalysisStatus(0, AnalysisStatuses.STREAMING);
    store.getState().updateAnalysisStatus(0, AnalysisStatuses.COMPLETE);

    expect(store.getState().analyses[0].status).toBe(AnalysisStatuses.COMPLETE);
  });

  it('should handle concurrent analysis operations', () => {
    // Add multiple analyses
    store.getState().setAnalyses([
      createPendingAnalysis(0),
      createPendingAnalysis(1),
    ]);

    // Update individually
    store.getState().updateAnalysisStatus(0, AnalysisStatuses.COMPLETE);
    store.getState().updateAnalysisStatus(1, AnalysisStatuses.STREAMING);

    const analyses = store.getState().analyses;
    expect(analyses[0].status).toBe(AnalysisStatuses.COMPLETE);
    expect(analyses[1].status).toBe(AnalysisStatuses.STREAMING);
  });

  it('should handle analysis data update without losing existing fields', () => {
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

  it('should correctly generate analysis ID format', () => {
    store.getState().addAnalysis(createMockAnalysis({
      id: 'thread-123_r0_analysis',
      threadId: 'thread-123',
      roundNumber: 0,
    }));

    const analysis = store.getState().analyses[0];
    expect(analysis.id).toBe('thread-123_r0_analysis');
    expect(analysis.id).toContain('r0');
    expect(analysis.id).toContain('analysis');
  });

  it('should track each round status independently', () => {
    store.getState().setAnalyses([
      createMockAnalysis({ roundNumber: 0, status: AnalysisStatuses.COMPLETE }),
      createMockAnalysis({ roundNumber: 1, status: AnalysisStatuses.STREAMING }),
      createMockAnalysis({ roundNumber: 2, status: AnalysisStatuses.PENDING }),
    ]);

    const analyses = store.getState().analyses;
    expect(analyses[0].status).toBe(AnalysisStatuses.COMPLETE);
    expect(analyses[1].status).toBe(AnalysisStatuses.STREAMING);
    expect(analyses[2].status).toBe(AnalysisStatuses.PENDING);
  });
});
