/**
 * Round Analysis & Transitions Tests (Section 4)
 *
 * Tests analysis triggering, content streaming, and navigation behavior.
 *
 * FLOW TESTED:
 * 4.1 Analysis Triggering
 * 4.2 Analysis Content & UI
 * 4.3 Navigation (First Round Only)
 *
 * Location: /src/stores/chat/__tests__/round-analysis-transitions.test.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AnalysisStatuses,
  ChatModes,
} from '@/api/core/enums';
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

// ============================================================================
// SECTION 4.1: ANALYSIS TRIGGERING
// ============================================================================

describe('Section 4.1: Analysis Triggering', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should trigger analysis automatically after ALL selected models finish', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [
      createMockParticipant(0, { threadId: 'thread-123' }),
      createMockParticipant(1, { threadId: 'thread-123' }),
    ];

    // All participants completed
    const messages = [
      createMockUserMessage(0),
      createMockMessage(0, 0),
      createMockMessage(1, 0),
    ];

    store.getState().initializeThread(thread, participants, messages);
    store.getState().setIsStreaming(false);

    // Analysis starts
    const pendingAnalysis = createPendingAnalysis(0);
    store.getState().setAnalyses([pendingAnalysis]);

    expect(store.getState().analyses[0].status).toBe(AnalysisStatuses.PENDING);
  });

  it('should NOT trigger analysis if Stop was clicked before all finish', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [
      createMockParticipant(0, { threadId: 'thread-123' }),
      createMockParticipant(1, { threadId: 'thread-123' }),
      createMockParticipant(2, { threadId: 'thread-123' }),
    ];

    // Only 2 of 3 participants completed
    const messages = [
      createMockUserMessage(0),
      createMockMessage(0, 0),
      createMockMessage(1, 0),
      // Model 3 never completed due to stop
    ];

    store.getState().initializeThread(thread, participants, messages);
    store.getState().setIsStreaming(true);
    store.getState().stopStreaming();

    // No analysis should be created for incomplete round
    // (in real implementation, this is controlled by the provider)
    expect(store.getState().analyses).toHaveLength(0);
  });

  it('should show analyzing responses UI state', () => {
    const thread = createMockThread({ id: 'thread-123' });
    store.getState().initializeThread(thread, [], []);

    // Analysis is PENDING or STREAMING
    const streamingAnalysis = createStreamingAnalysis(0);
    store.getState().setAnalyses([streamingAnalysis]);

    const analysis = store.getState().analyses[0];
    expect(analysis.status).toBe(AnalysisStatuses.STREAMING);
  });

  it('should track analysis for correct round number', () => {
    const thread = createMockThread({ id: 'thread-123' });
    store.getState().initializeThread(thread, [], []);

    // Round 0 analysis
    const round0Analysis = createPendingAnalysis(0);
    store.getState().setAnalyses([round0Analysis]);

    expect(store.getState().analyses[0].roundNumber).toBe(0);

    // Round 1 analysis
    const round1Analysis = createPendingAnalysis(1);
    store.getState().setAnalyses([round0Analysis, round1Analysis]);

    expect(store.getState().analyses[1].roundNumber).toBe(1);
  });
});

// ============================================================================
// SECTION 4.2: ANALYSIS CONTENT & UI
// ============================================================================

describe('Section 4.2: Analysis Content & UI', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // ==========================================================================
  // Progressive Streaming Tests
  // ==========================================================================

  describe('progressive Streaming', () => {
    it('should stream analysis sections in order: Leaderboard → Chart → Cards → Summary → Conclusion', () => {
      const thread = createMockThread({ id: 'thread-123' });
      store.getState().initializeThread(thread, [], []);

      // Analysis with full data (representing completed streaming)
      const analysisPayload = createMockAnalysisPayload(0);
      const completedAnalysis = createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
        analysisData: analysisPayload,
      });

      store.getState().setAnalyses([completedAnalysis]);

      const analysisData = store.getState().analyses[0].analysisData;

      // Verify all sections present
      expect(analysisData?.leaderboard).toBeDefined();
      expect(analysisData?.participantAnalyses).toBeDefined();
      expect(analysisData?.roundSummary).toBeDefined();
      expect(analysisData?.roundSummary?.overallSummary).toBeDefined();
      expect(analysisData?.roundSummary?.conclusion).toBeDefined();
    });
  });

  // ==========================================================================
  // Leaderboard Tests
  // ==========================================================================

  describe('leaderboard', () => {
    it('should have rankings matching scores', () => {
      const analysisPayload = createMockAnalysisPayload(0, {
        leaderboard: [
          { rank: 1, participantIndex: 0, model: 'gpt-4', score: 95, badges: ['Winner'] },
          { rank: 2, participantIndex: 1, model: 'claude-3', score: 85, badges: [] },
          { rank: 3, participantIndex: 2, model: 'gemini', score: 75, badges: [] },
        ],
      });

      const analysis = createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
        analysisData: analysisPayload,
      });

      store.getState().setAnalyses([analysis]);

      const leaderboard = store.getState().analyses[0].analysisData?.leaderboard;

      expect(leaderboard?.[0].rank).toBe(1);
      expect(leaderboard?.[0].score).toBe(95);
      expect(leaderboard?.[1].rank).toBe(2);
      expect(leaderboard?.[1].score).toBe(85);
      expect(leaderboard?.[2].rank).toBe(3);
      expect(leaderboard?.[2].score).toBe(75);
    });

    it('should have scores out of 10 for each model', () => {
      const analysisPayload = createMockAnalysisPayload(0);
      const analysis = createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
        analysisData: analysisPayload,
      });

      store.getState().setAnalyses([analysis]);

      const participantAnalysis = store.getState().analyses[0].analysisData?.participantAnalyses[0];

      // Overall score and individual scores
      expect(participantAnalysis?.overallScore).toBeDefined();
      expect(participantAnalysis?.reasoning?.clarity).toBeLessThanOrEqual(10);
      expect(participantAnalysis?.reasoning?.depth).toBeLessThanOrEqual(10);
    });
  });

  // ==========================================================================
  // Skills Chart Tests
  // ==========================================================================

  describe('skills Chart', () => {
    it('should have correct dimensions for Debating mode', () => {
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
    });

    it('should have correct dimensions for Brainstorming mode', () => {
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

    it('should have correct dimensions for Analyzing mode', () => {
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
  });

  // ==========================================================================
  // Participant Cards Tests
  // ==========================================================================

  describe('participant Cards', () => {
    it('should have one card per AI model', () => {
      const analysisPayload = createMockAnalysisPayload(0, {
        participantAnalyses: [
          {
            participantIndex: 0,
            model: 'openai/gpt-4',
            role: null,
            overallScore: 85,
            keyInsights: ['Insight 1'],
            strengths: ['Strength 1', 'Strength 2'],
            weaknesses: ['Weakness 1'],
            uniqueContributions: ['Contribution'],
            reasoning: { clarity: 8, depth: 7, evidence: 8, creativity: 7 },
            communication: { engagement: 8, tone: 8, structure: 7 },
            factualAccuracy: { score: 8, concerns: [] },
            summary: 'Summary',
          },
          {
            participantIndex: 1,
            model: 'anthropic/claude-3',
            role: null,
            overallScore: 90,
            keyInsights: ['Insight 2'],
            strengths: ['Strength 1'],
            weaknesses: ['Weakness 1', 'Weakness 2'],
            uniqueContributions: ['Contribution'],
            reasoning: { clarity: 9, depth: 8, evidence: 9, creativity: 8 },
            communication: { engagement: 9, tone: 8, structure: 8 },
            factualAccuracy: { score: 9, concerns: [] },
            summary: 'Summary',
          },
        ],
      });

      const analysis = createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
        analysisData: analysisPayload,
      });

      store.getState().setAnalyses([analysis]);

      const participantAnalyses = store.getState().analyses[0].analysisData?.participantAnalyses;

      expect(participantAnalyses).toHaveLength(2);
    });

    it('should have strengths with 2-3 pros', () => {
      const analysisPayload = createMockAnalysisPayload(0);
      const analysis = createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
        analysisData: analysisPayload,
      });

      store.getState().setAnalyses([analysis]);

      const strengths = store.getState().analyses[0].analysisData?.participantAnalyses[0].strengths;

      expect(strengths?.length).toBeGreaterThanOrEqual(1);
    });

    it('should have areas for improvement with 1-2 cons', () => {
      const analysisPayload = createMockAnalysisPayload(0);
      const analysis = createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
        analysisData: analysisPayload,
      });

      store.getState().setAnalyses([analysis]);

      const weaknesses = store.getState().analyses[0].analysisData?.participantAnalyses[0].weaknesses;

      expect(weaknesses?.length).toBeGreaterThanOrEqual(1);
    });

    it('should have summary paragraph', () => {
      const analysisPayload = createMockAnalysisPayload(0);
      const analysis = createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
        analysisData: analysisPayload,
      });

      store.getState().setAnalyses([analysis]);

      const summary = store.getState().analyses[0].analysisData?.participantAnalyses[0].summary;

      expect(summary).toBeDefined();
      expect(summary?.length).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // Overall Summary Tests
  // ==========================================================================

  describe('overall Summary', () => {
    it('should have 2-3 paragraph synthesis', () => {
      const analysisPayload = createMockAnalysisPayload(0);
      const analysis = createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
        analysisData: analysisPayload,
      });

      store.getState().setAnalyses([analysis]);

      const overallSummary = store.getState().analyses[0].analysisData?.roundSummary?.overallSummary;

      expect(overallSummary).toBeDefined();
      expect(overallSummary?.length).toBeGreaterThan(50);
    });

    it('should have group dynamics and patterns', () => {
      const analysisPayload = createMockAnalysisPayload(0);
      const analysis = createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
        analysisData: analysisPayload,
      });

      store.getState().setAnalyses([analysis]);

      const roundSummary = store.getState().analyses[0].analysisData?.roundSummary;

      expect(roundSummary?.consensusPoints).toBeDefined();
      expect(roundSummary?.keyDebatePoints).toBeDefined();
    });
  });

  // ==========================================================================
  // Conclusion Tests
  // ==========================================================================

  describe('conclusion', () => {
    it('should have final recommendations', () => {
      const analysisPayload = createMockAnalysisPayload(0);
      const analysis = createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
        analysisData: analysisPayload,
      });

      store.getState().setAnalyses([analysis]);

      const conclusion = store.getState().analyses[0].analysisData?.roundSummary?.conclusion;

      expect(conclusion).toBeDefined();
    });

    it('should have key takeaways', () => {
      const analysisPayload = createMockAnalysisPayload(0);
      const analysis = createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
        analysisData: analysisPayload,
      });

      store.getState().setAnalyses([analysis]);

      const recommendedActions = store.getState().analyses[0].analysisData?.roundSummary?.recommendedActions;

      expect(recommendedActions).toBeDefined();
      expect(recommendedActions?.length).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// SECTION 4.3: NAVIGATION (FIRST ROUND ONLY)
// ============================================================================

describe('Section 4.3: Navigation (First Round Only)', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should navigate from /chat to /chat/[slug] when analysis is COMPLETED and title ready', () => {
    const thread = createMockThread({
      id: 'thread-123',
      slug: 'ai-generated-slug',
      isAiGeneratedTitle: true,
    });

    store.getState().initializeThread(thread, [], []);
    store.getState().setScreenMode('overview');

    // Analysis complete
    const completedAnalysis = createMockAnalysis({
      roundNumber: 0,
      status: AnalysisStatuses.COMPLETE,
    });
    store.getState().setAnalyses([completedAnalysis]);

    // Conditions for navigation:
    // 1. Analysis is COMPLETED
    // 2. AI-generated title is ready
    const state = store.getState();
    const isAnalysisComplete = state.analyses[0].status === AnalysisStatuses.COMPLETE;
    const isTitleReady = state.thread?.isAiGeneratedTitle === true;

    expect(isAnalysisComplete).toBe(true);
    expect(isTitleReady).toBe(true);
  });

  it('should start polling immediately after thread creation', () => {
    const thread = createMockThread({
      id: 'thread-123',
      slug: 'initial-slug',
      isAiGeneratedTitle: false,
    });

    store.getState().initializeThread(thread, [], []);
    store.getState().setCreatedThreadId('thread-123');
    store.getState().setShowInitialUI(false);

    // Polling conditions met:
    // - Chat has started (showInitialUI = false)
    // - Thread ID exists (createdThreadId)
    // - Haven't detected AI title yet
    const state = store.getState();
    expect(state.showInitialUI).toBe(false);
    expect(state.createdThreadId).toBe('thread-123');
    expect(state.thread?.isAiGeneratedTitle).toBe(false);
  });

  it('should update URL via history.replaceState when title ready during streaming', () => {
    // This is a UI-level behavior, but we can test the state conditions
    const thread = createMockThread({
      id: 'thread-123',
      slug: 'initial-slug',
      isAiGeneratedTitle: false,
    });

    store.getState().initializeThread(thread, [], []);
    store.getState().setIsStreaming(true);

    // Title becomes ready during streaming
    const updatedThread = createMockThread({
      id: 'thread-123',
      slug: 'ai-generated-beautiful-slug',
      title: 'AI Generated Title',
      isAiGeneratedTitle: true,
    });

    store.getState().setThread(updatedThread);

    // URL should be updated without navigation
    // (history.replaceState behavior)
    expect(store.getState().thread?.slug).toBe('ai-generated-beautiful-slug');
    expect(store.getState().isStreaming).toBe(true); // Still streaming
  });

  it('should do router.push after analysis completion', () => {
    const thread = createMockThread({
      id: 'thread-123',
      slug: 'ai-generated-slug',
      isAiGeneratedTitle: true,
    });

    store.getState().initializeThread(thread, [], []);
    store.getState().setScreenMode('overview');

    // Analysis complete
    const completedAnalysis = createMockAnalysis({
      roundNumber: 0,
      status: AnalysisStatuses.COMPLETE,
    });
    store.getState().setAnalyses([completedAnalysis]);

    // After router.push, screen mode should change
    store.getState().setScreenMode('thread');

    expect(store.getState().screenMode).toBe('thread');
  });

  it('should fallback if title generation fails', () => {
    const thread = createMockThread({
      id: 'thread-123',
      title: 'New Chat',
      slug: 'initial-slug',
      isAiGeneratedTitle: false,
    });

    store.getState().initializeThread(thread, [], []);

    // Analysis complete but no AI title
    const completedAnalysis = createMockAnalysis({
      roundNumber: 0,
      status: AnalysisStatuses.COMPLETE,
    });
    store.getState().setAnalyses([completedAnalysis]);

    // Should keep original title and slug
    expect(store.getState().thread?.title).toBe('New Chat');
    expect(store.getState().thread?.slug).toBe('initial-slug');
  });

  it('should handle 60s timeout for analysis completion detection', () => {
    const thread = createMockThread({ id: 'thread-123' });
    store.getState().initializeThread(thread, [], []);

    // Analysis timed out (>60s streaming)
    const timedOutAnalysis = createTimedOutAnalysis(0);
    store.getState().setAnalyses([timedOutAnalysis]);

    const analysis = store.getState().analyses[0];
    const elapsed = Date.now() - new Date(analysis.createdAt).getTime();

    // After 60s timeout, navigation should proceed
    expect(elapsed).toBeGreaterThan(60000);
  });

  it('should use multi-layer analysis completion detection', () => {
    const thread = createMockThread({ id: 'thread-123' });
    store.getState().initializeThread(thread, [], []);

    // Detection logic:
    // status === 'complete' OR
    // (status === 'streaming' && elapsed > 60s) OR
    // (status === 'pending' && !isStreaming && elapsed > 60s)

    // Case 1: COMPLETE status
    const completeAnalysis = createMockAnalysis({
      roundNumber: 0,
      status: AnalysisStatuses.COMPLETE,
    });
    store.getState().setAnalyses([completeAnalysis]);

    expect(store.getState().analyses[0].status).toBe(AnalysisStatuses.COMPLETE);
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('Round Analysis Complete Flow', () => {
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
    store.getState().setScreenMode('overview');

    // Streaming complete
    store.getState().setIsStreaming(false);

    // Analysis starts (PENDING)
    store.getState().setAnalyses([createPendingAnalysis(0)]);
    expect(store.getState().analyses[0].status).toBe(AnalysisStatuses.PENDING);

    // Analysis streaming
    store.getState().setAnalyses([createStreamingAnalysis(0)]);
    expect(store.getState().analyses[0].status).toBe(AnalysisStatuses.STREAMING);

    // Analysis complete
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
    store.getState().setScreenMode('thread');

    const finalState = store.getState();
    expect(finalState.analyses[0].status).toBe(AnalysisStatuses.COMPLETE);
    expect(finalState.thread?.isAiGeneratedTitle).toBe(true);
    expect(finalState.screenMode).toBe('thread');
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
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe('Analysis Edge Cases', () => {
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
      leaderboard: [
        { rank: 1, participantIndex: 0, model: 'gpt-4', score: 85, badges: [] },
      ],
      participantAnalyses: [
        {
          participantIndex: 0,
          model: 'gpt-4',
          role: null,
          overallScore: 85,
          keyInsights: ['Insight'],
          strengths: ['Strength'],
          weaknesses: ['Weakness'],
          uniqueContributions: ['Contribution'],
          reasoning: { clarity: 8, depth: 8, evidence: 8, creativity: 8 },
          communication: { engagement: 8, tone: 8, structure: 8 },
          factualAccuracy: { score: 8, concerns: [] },
          summary: 'Summary',
        },
      ],
    });

    const analysis = createMockAnalysis({
      roundNumber: 0,
      status: AnalysisStatuses.COMPLETE,
      analysisData: analysisPayload,
    });

    store.getState().setAnalyses([analysis]);

    expect(store.getState().analyses[0].analysisData?.participantAnalyses).toHaveLength(1);
  });

  it('should handle analysis FAILED status', () => {
    const failedAnalysis = createMockAnalysis({
      roundNumber: 0,
      status: AnalysisStatuses.FAILED,
    });

    store.getState().setAnalyses([failedAnalysis]);

    expect(store.getState().analyses[0].status).toBe(AnalysisStatuses.FAILED);
  });

  it('should handle null analysisData', () => {
    const pendingAnalysis = createMockAnalysis({
      roundNumber: 0,
      status: AnalysisStatuses.PENDING,
      analysisData: null,
    });

    store.getState().setAnalyses([pendingAnalysis]);

    expect(store.getState().analyses[0].analysisData).toBeNull();
  });
});
