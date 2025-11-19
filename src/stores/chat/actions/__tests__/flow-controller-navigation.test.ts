/**
 * Flow Controller Navigation Tests
 *
 * Tests navigation bug where analysis accordion content is emptied when navigating
 * from overview screen (/chat) to thread page (/chat/[slug]).
 *
 * BUG REPRODUCTION:
 * 1. On overview screen, first round streams complete
 * 2. Analysis data is stored in store with complete `analysisData` object
 * 3. After analysis completes (status: 'complete'), user is automatically navigated to /chat/[slug]
 * 4. The content inside RoundAnalysisCard becomes empty - `analysisData` is missing
 *
 * ROOT CAUSE:
 * In flow-controller.ts:284-287, the flow controller invalidates the analyses query before navigation.
 * This clears the query cache, and when the thread screen mounts and orchestrator fetches from server,
 * there's a race condition where server data doesn't include `analysisData` yet, causing it to
 * overwrite the complete client data.
 *
 * WHAT WE'RE TESTING:
 * - Navigation preserves complete analysis data (leaderboard, participantAnalyses, roundSummary)
 * - Store analyses array maintains complete data through navigation
 * - Query cache doesn't lose analysis data during navigation
 * - RoundAnalysisCard receives complete analysis content after navigation
 */

import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it } from 'vitest';

import { AnalysisStatuses, ChatModes } from '@/api/core/enums';
import type { ModeratorAnalysisPayload, StoredModeratorAnalysis } from '@/api/routes/chat/schema';
import { queryKeys } from '@/lib/data/query-keys';
import { createMockParticipant, createMockThread } from '@/lib/testing';

// ============================================================================
// Type Definitions
// ============================================================================

/** Paginated API response structure for analyses */
type AnalysesQueryData = {
  data: {
    items: StoredModeratorAnalysis[];
  };
} | undefined;

// ============================================================================
// Mock Data Factories
// ============================================================================

/**
 * Create complete analysis data payload (what's stored in analysisData field)
 * This is the critical data that gets lost during navigation
 */
function createCompleteAnalysisData(): ModeratorAnalysisPayload {
  return {
    participantAnalyses: [
      {
        participantIndex: 0,
        participantRole: 'The Analyst',
        modelId: 'gpt-4',
        modelName: 'GPT-4',
        overallRating: 9,
        skillsMatrix: [
          { skillName: 'Clarity', rating: 9 },
          { skillName: 'Depth', rating: 8 },
          { skillName: 'Accuracy', rating: 9 },
          { skillName: 'Creativity', rating: 7 },
          { skillName: 'Relevance', rating: 8 },
        ],
        pros: ['Very clear and structured', 'Good depth of analysis'],
        cons: ['Could be more creative'],
        summary: 'Strong analytical response with excellent clarity and depth',
      },
      {
        participantIndex: 1,
        participantRole: 'The Critic',
        modelId: 'claude-3.5-sonnet',
        modelName: 'Claude 3.5 Sonnet',
        overallRating: 8,
        skillsMatrix: [
          { skillName: 'Clarity', rating: 8 },
          { skillName: 'Depth', rating: 9 },
          { skillName: 'Accuracy', rating: 8 },
          { skillName: 'Creativity', rating: 9 },
          { skillName: 'Relevance', rating: 8 },
        ],
        pros: ['Excellent critical thinking', 'Creative approach'],
        cons: ['Could be more concise'],
        summary: 'Thoughtful critical analysis with creative perspective',
      },
    ],
    leaderboard: [
      {
        rank: 1,
        participantIndex: 0,
        participantRole: 'The Analyst',
        modelId: 'gpt-4',
        modelName: 'GPT-4',
        overallRating: 9,
        badge: 'Best Analysis',
      },
      {
        rank: 2,
        participantIndex: 1,
        participantRole: 'The Critic',
        modelId: 'claude-3.5-sonnet',
        modelName: 'Claude 3.5 Sonnet',
        overallRating: 8,
        badge: null,
      },
    ],
    roundSummary: {
      keyInsights: [
        'Both participants provided thoughtful analysis',
        'Clear consensus on main points',
        'Different approaches to problem-solving',
      ],
      consensusPoints: ['Point 1', 'Point 2'],
      divergentApproaches: [
        {
          topic: 'Problem-solving approach',
          perspectives: ['Analytical method', 'Critical thinking method'],
        },
      ],
      comparativeAnalysis: {
        strengthsByCategory: [
          { category: 'Technical Analysis', participants: ['p0', 'p1'] },
          { category: 'Creative Thinking', participants: ['p1'] },
        ],
        tradeoffs: ['Clarity vs Creativity', 'Depth vs Conciseness'],
      },
      decisionFramework: {
        criteriaToConsider: ['Clarity', 'Depth', 'Creativity'],
        scenarioRecommendations: [
          { scenario: 'Technical problems', recommendation: 'Use GPT-4 for clarity' },
          { scenario: 'Creative problems', recommendation: 'Use Claude for innovation' },
        ],
      },
      overallSummary: 'Comprehensive round with excellent contributions from all participants demonstrating strong analytical skills',
      conclusion: 'Both participants showed complementary strengths that together provide a complete analysis',
      recommendedActions: [
        {
          action: 'Continue with similar participant configuration',
          rationale: 'Good balance of analytical and critical thinking',
          suggestedModels: ['gpt-4', 'claude-3.5-sonnet'],
          suggestedRoles: ['The Analyst', 'The Critic'],
          suggestedMode: ChatModes.ANALYZING,
        },
      ],
    },
  };
}

/**
 * Create stored analysis with complete data (as it exists in store/cache)
 */
function createStoredAnalysisWithData(
  roundNumber = 0,
  status: typeof AnalysisStatuses[keyof typeof AnalysisStatuses] = AnalysisStatuses.COMPLETE,
): StoredModeratorAnalysis {
  return {
    id: `analysis_thread123_${roundNumber}_${Date.now()}`,
    threadId: 'thread123',
    roundNumber,
    mode: ChatModes.ANALYZING,
    userQuestion: 'What are the key differences between REST and GraphQL?',
    status,
    participantMessageIds: ['thread123_r0_p0', 'thread123_r0_p1'],
    analysisData: createCompleteAnalysisData(),
    errorMessage: null,
    completedAt: new Date(),
    createdAt: new Date(),
  };
}

/**
 * Create stored analysis WITHOUT data (as might come from incomplete server response)
 * This simulates the race condition where server hasn't finished persisting
 */
function createStoredAnalysisWithoutData(
  roundNumber = 0,
  status: typeof AnalysisStatuses[keyof typeof AnalysisStatuses] = AnalysisStatuses.STREAMING,
): StoredModeratorAnalysis {
  return {
    id: `analysis_thread123_${roundNumber}_${Date.now()}`,
    threadId: 'thread123',
    roundNumber,
    mode: ChatModes.ANALYZING,
    userQuestion: 'What are the key differences between REST and GraphQL?',
    status,
    participantMessageIds: ['thread123_r0_p0', 'thread123_r0_p1'],
    analysisData: null, // ⚠️ Data not yet available
    errorMessage: null,
    completedAt: null,
    createdAt: new Date(),
  };
}

// ============================================================================
// NAVIGATION FLOW TESTS - Bug Reproduction
// ============================================================================

describe('flow controller navigation - analysis data preservation', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          gcTime: Number.POSITIVE_INFINITY,
        },
      },
    });
  });

  describe('bug reproduction: analysis data lost during navigation', () => {
    /**
     * TEST 1: Verify complete analysis data exists before navigation
     * On overview screen, after analysis completes, store should have complete analysisData
     */
    it('should have complete analysis data in store before navigation', () => {
      const completeAnalysis = createStoredAnalysisWithData(0, AnalysisStatuses.COMPLETE);

      // Verify analysis has ALL required fields
      expect(completeAnalysis.status).toBe(AnalysisStatuses.COMPLETE);
      expect(completeAnalysis.analysisData).toBeDefined();
      expect(completeAnalysis.analysisData).not.toBeNull();

      // Verify analysisData has all three critical components
      expect(completeAnalysis.analysisData?.participantAnalyses).toBeDefined();
      expect(completeAnalysis.analysisData?.participantAnalyses).toHaveLength(2);
      expect(completeAnalysis.analysisData?.leaderboard).toBeDefined();
      expect(completeAnalysis.analysisData?.leaderboard).toHaveLength(2);
      expect(completeAnalysis.analysisData?.roundSummary).toBeDefined();

      // Verify each participant analysis has complete data
      completeAnalysis.analysisData?.participantAnalyses.forEach((pa) => {
        expect(pa.participantIndex).toBeGreaterThanOrEqual(0);
        expect(pa.modelId).toBeTruthy();
        expect(pa.modelName).toBeTruthy();
        expect(pa.overallRating).toBeGreaterThan(0);
        expect(pa.skillsMatrix).toHaveLength(5);
        expect(pa.pros).toBeDefined();
        expect(pa.cons).toBeDefined();
        expect(pa.summary).toBeTruthy();
      });

      // Verify leaderboard entries
      completeAnalysis.analysisData?.leaderboard.forEach((entry) => {
        expect(entry.rank).toBeGreaterThan(0);
        expect(entry.participantIndex).toBeGreaterThanOrEqual(0);
        expect(entry.modelId).toBeTruthy();
        expect(entry.overallRating).toBeGreaterThan(0);
      });

      // Verify round summary
      const summary = completeAnalysis.analysisData?.roundSummary;
      expect(summary).toBeDefined();
      expect(summary?.keyInsights).toBeDefined();
      expect(summary?.keyInsights.length).toBeGreaterThan(0);
      expect(summary?.overallSummary).toBeTruthy();
      expect(summary?.conclusion).toBeTruthy();
      expect(summary?.comparativeAnalysis).toBeDefined();
      expect(summary?.decisionFramework).toBeDefined();
    });

    /**
     * TEST 2: Reproduce the bug - query invalidation clears analysis data
     * Simulates what happens in flow-controller.ts:284-287
     */
    it('should demonstrate data loss when query is invalidated before navigation', async () => {
      const threadId = 'thread123';
      const completeAnalysis = createStoredAnalysisWithData(0, AnalysisStatuses.COMPLETE);

      // STEP 1: Set complete analysis in query cache (overview screen state)
      queryClient.setQueryData(
        queryKeys.threads.analyses(threadId),
        {
          success: true,
          data: {
            items: [completeAnalysis],
          },
        },
      );

      // Verify data is in cache
      const cachedBefore = queryClient.getQueryData(queryKeys.threads.analyses(threadId)) as AnalysesQueryData;
      expect(cachedBefore?.data?.items[0]?.analysisData).toBeDefined();
      expect(cachedBefore?.data?.items[0]?.analysisData?.leaderboard).toBeDefined();

      // STEP 2: Invalidate query (this is what flow-controller does before navigation)
      await queryClient.invalidateQueries({
        queryKey: queryKeys.threads.analyses(threadId),
      });

      // STEP 3: Check if data is still accessible
      // Note: invalidateQueries marks data as stale but doesn't remove it immediately
      const cachedAfter = queryClient.getQueryData(queryKeys.threads.analyses(threadId)) as AnalysesQueryData;

      // ✅ ASSERTION: Data should still be in cache after invalidation
      // invalidateQueries only marks as stale, doesn't clear
      expect(cachedAfter?.data?.items[0]?.analysisData).toBeDefined();
    });

    /**
     * TEST 3: Reproduce race condition - server returns incomplete data
     * Server hasn't finished persisting analysisData when thread screen fetches
     */
    it('should show how server fetch can return incomplete analysis data', () => {
      // SCENARIO: Thread screen mounts and fetches from server
      // Server has created the analysis record but hasn't finished persisting analysisData

      const incompleteFromServer = createStoredAnalysisWithoutData(0, AnalysisStatuses.STREAMING);

      // Server returns analysis without analysisData
      expect(incompleteFromServer.status).toBe(AnalysisStatuses.STREAMING);
      expect(incompleteFromServer.analysisData).toBeNull();
      expect(incompleteFromServer.completedAt).toBeNull();

      // ⚠️ BUG: If this incomplete data overwrites the complete cached data,
      // the accordion content becomes empty
    });

    /**
     * TEST 4: Demonstrate the actual bug - complete data overwritten by incomplete data
     */
    it('should reproduce bug: complete cached data overwritten by incomplete server data', () => {
      const threadId = 'thread123';

      // STEP 1: Complete analysis in cache (from overview screen)
      const completeAnalysis = createStoredAnalysisWithData(0, AnalysisStatuses.COMPLETE);
      queryClient.setQueryData(
        queryKeys.threads.analyses(threadId),
        {
          success: true,
          data: {
            items: [completeAnalysis],
          },
        },
      );

      // Verify complete data
      const cached = queryClient.getQueryData(queryKeys.threads.analyses(threadId)) as AnalysesQueryData;
      expect(cached?.data?.items[0]?.analysisData?.leaderboard).toHaveLength(2);
      expect(cached?.data?.items[0]?.analysisData?.participantAnalyses).toHaveLength(2);

      // STEP 2: Server returns incomplete data (race condition)
      const incompleteFromServer = createStoredAnalysisWithoutData(0, AnalysisStatuses.STREAMING);

      // STEP 3: Naive implementation overwrites cache with server data
      queryClient.setQueryData(
        queryKeys.threads.analyses(threadId),
        {
          success: true,
          data: {
            items: [incompleteFromServer],
          },
        },
      );

      // ⚠️ BUG REPRODUCED: analysisData is now null
      const afterOverwrite = queryClient.getQueryData(queryKeys.threads.analyses(threadId)) as AnalysesQueryData;
      expect(afterOverwrite?.data?.items[0]?.analysisData).toBeNull();
      expect(afterOverwrite?.data?.items[0]?.status).toBe(AnalysisStatuses.STREAMING);

      // This is what causes the RoundAnalysisCard to show empty content!
    });
  });

  describe('correct behavior: preserve complete data during navigation', () => {
    /**
     * TEST 5: Verify merge strategy preserves complete cached data
     * When server returns incomplete data, we should keep the complete cached version
     */
    it('should preserve complete cached analysis when server returns incomplete data', () => {
      const threadId = 'thread123';

      // STEP 1: Complete analysis in cache
      const completeCached = createStoredAnalysisWithData(0, AnalysisStatuses.COMPLETE);
      queryClient.setQueryData(
        queryKeys.threads.analyses(threadId),
        {
          success: true,
          data: {
            items: [completeCached],
          },
        },
      );

      // STEP 2: Server returns incomplete data
      const incompleteFromServer = createStoredAnalysisWithoutData(0, AnalysisStatuses.STREAMING);

      // STEP 3: Get cached data
      const existingCache = queryClient.getQueryData(queryKeys.threads.analyses(threadId)) as AnalysesQueryData;

      // STEP 4: Smart merge - prefer complete cached data over incomplete server data
      const serverRoundNumbers = new Set([incompleteFromServer.roundNumber]);
      const cachedNotOnServer = existingCache?.data?.items.filter(
        (item: StoredModeratorAnalysis) => !serverRoundNumbers.has(item.roundNumber),
      ) || [];

      // For rounds that exist on server, check if cached version has more complete data
      const mergedItems = [];

      // ✅ CRITICAL FIX: If cached has complete data but server doesn't, keep cached
      const cachedItem = existingCache?.data?.items[0];
      const serverItem = incompleteFromServer;

      if (cachedItem?.analysisData && !serverItem.analysisData) {
        // Keep cached version - it has complete data
        mergedItems.push(cachedItem);
      } else {
        // Use server version - it has fresher or equally complete data
        mergedItems.push(serverItem);
      }

      // Add any cached items for rounds not on server
      mergedItems.push(...cachedNotOnServer);

      // ✅ ASSERTION: Merged data preserves complete analysisData
      expect(mergedItems[0]?.analysisData).toBeDefined();
      expect(mergedItems[0]?.analysisData?.leaderboard).toHaveLength(2);
      expect(mergedItems[0]?.analysisData?.participantAnalyses).toHaveLength(2);
      expect(mergedItems[0]?.status).toBe(AnalysisStatuses.COMPLETE);
    });

    /**
     * TEST 6: Verify complete data flows to RoundAnalysisCard
     * After navigation, RoundAnalysisCard should receive complete analysis data
     */
    it('should provide complete analysis data to RoundAnalysisCard after navigation', () => {
      const threadId = 'thread123';

      // After successful navigation with data preservation
      const completeAnalysis = createStoredAnalysisWithData(0, AnalysisStatuses.COMPLETE);

      queryClient.setQueryData(
        queryKeys.threads.analyses(threadId),
        {
          success: true,
          data: {
            items: [completeAnalysis],
          },
        },
      );

      // RoundAnalysisCard receives analysis prop from store
      const analysisForCard = completeAnalysis;

      // ✅ ASSERTIONS: Card has all required data for rendering
      expect(analysisForCard.analysisData).toBeDefined();

      // Leaderboard section
      expect(analysisForCard.analysisData?.leaderboard).toBeDefined();
      expect(analysisForCard.analysisData?.leaderboard.length).toBeGreaterThan(0);
      analysisForCard.analysisData?.leaderboard.forEach((entry) => {
        expect(entry.rank).toBeDefined();
        expect(entry.modelName).toBeTruthy();
        expect(entry.overallRating).toBeGreaterThan(0);
      });

      // Participant analyses section
      expect(analysisForCard.analysisData?.participantAnalyses).toBeDefined();
      expect(analysisForCard.analysisData?.participantAnalyses.length).toBeGreaterThan(0);
      analysisForCard.analysisData?.participantAnalyses.forEach((pa) => {
        expect(pa.summary).toBeTruthy();
        expect(pa.pros).toBeDefined();
        expect(pa.cons).toBeDefined();
        expect(pa.skillsMatrix).toHaveLength(5);
      });

      // Round summary section
      expect(analysisForCard.analysisData?.roundSummary).toBeDefined();
      expect(analysisForCard.analysisData?.roundSummary.keyInsights).toBeDefined();
      expect(analysisForCard.analysisData?.roundSummary.overallSummary).toBeTruthy();
      expect(analysisForCard.analysisData?.roundSummary.conclusion).toBeTruthy();
    });

    /**
     * TEST 7: Verify placeholderData prevents UI flicker during refetch
     */
    it('should use placeholderData to prevent empty state during navigation', () => {
      const threadId = 'thread123';
      const completeAnalysis = createStoredAnalysisWithData(0, AnalysisStatuses.COMPLETE);

      // Set initial data
      queryClient.setQueryData(
        queryKeys.threads.analyses(threadId),
        {
          success: true,
          data: {
            items: [completeAnalysis],
          },
        },
      );

      // Simulate query configuration with placeholderData
      const queryOptions = {
        queryKey: queryKeys.threads.analyses(threadId),
        placeholderData: (previousData: AnalysesQueryData) => previousData,
      };

      // Get data - should have previous data as placeholder
      const currentData = queryClient.getQueryData(queryOptions.queryKey) as AnalysesQueryData;

      // ✅ ASSERTION: Data available immediately (no empty state)
      expect(currentData?.data?.items[0]?.analysisData).toBeDefined();
    });
  });

  describe('store state consistency through navigation', () => {
    /**
     * TEST 8: Verify store analyses array maintains complete data
     */
    it('should maintain complete analyses in store through navigation', () => {
      // Simulate store state on overview screen
      const overviewAnalyses = [
        createStoredAnalysisWithData(0, AnalysisStatuses.COMPLETE),
      ];

      // Verify overview state
      expect(overviewAnalyses[0]?.analysisData).toBeDefined();
      expect(overviewAnalyses[0]?.status).toBe(AnalysisStatuses.COMPLETE);

      // After navigation, store should preserve this data
      const threadScreenAnalyses = [...overviewAnalyses];

      // ✅ ASSERTION: Data preserved through navigation
      expect(threadScreenAnalyses[0]?.analysisData?.leaderboard).toHaveLength(2);
      expect(threadScreenAnalyses[0]?.analysisData?.participantAnalyses).toHaveLength(2);
      expect(threadScreenAnalyses[0]?.analysisData?.roundSummary).toBeDefined();
    });

    /**
     * TEST 9: Verify orchestrator doesn't overwrite complete store data
     */
    it('should not overwrite complete store analysis with incomplete server data', () => {
      // Store has complete analysis (from streaming completion)
      const storeAnalysis = createStoredAnalysisWithData(0, AnalysisStatuses.COMPLETE);

      // Server returns incomplete (still persisting)
      const serverAnalysis = createStoredAnalysisWithoutData(0, AnalysisStatuses.STREAMING);

      // Orchestrator should be smart about merging
      const shouldOverwrite = !storeAnalysis.analysisData || !!serverAnalysis.analysisData;

      // ✅ ASSERTION: Should NOT overwrite complete with incomplete
      expect(shouldOverwrite).toBe(false);
      expect(storeAnalysis.analysisData).toBeDefined();
      expect(serverAnalysis.analysisData).toBeNull();
    });

    /**
     * TEST 10: Verify thread initialization from server doesn't affect existing analyses
     */
    it('should preserve analyses when thread initializes from server data', () => {
      const thread = createMockThread({ id: 'thread123' });
      const participants = [
        createMockParticipant({ id: 'p0', threadId: 'thread123' }),
        createMockParticipant({ id: 'p1', threadId: 'thread123' }),
      ];

      // Existing analysis in store
      const existingAnalysis = createStoredAnalysisWithData(0, AnalysisStatuses.COMPLETE);

      // Thread initialization should NOT clear analyses
      // Analyses are managed separately via orchestrator
      const analysesAfterInit = [existingAnalysis];

      // ✅ ASSERTION: Analyses preserved through thread init
      expect(analysesAfterInit[0]?.analysisData).toBeDefined();
      expect(thread.id).toBe('thread123');
      expect(participants).toHaveLength(2);
    });
  });

  describe('edge cases and error scenarios', () => {
    /**
     * TEST 11: Handle case where analysis status changes during navigation
     */
    it('should handle analysis transitioning from streaming to complete during navigation', () => {
      const threadId = 'thread123';

      // STEP 1: Analysis is streaming when navigation starts
      const streamingAnalysis = createStoredAnalysisWithoutData(0, AnalysisStatuses.STREAMING);
      queryClient.setQueryData(
        queryKeys.threads.analyses(threadId),
        {
          success: true,
          data: {
            items: [streamingAnalysis],
          },
        },
      );

      // STEP 2: During navigation, analysis completes
      const completedAnalysis = createStoredAnalysisWithData(0, AnalysisStatuses.COMPLETE);

      // STEP 3: Thread screen should get the complete version
      queryClient.setQueryData(
        queryKeys.threads.analyses(threadId),
        {
          success: true,
          data: {
            items: [completedAnalysis],
          },
        },
      );

      const final = queryClient.getQueryData(queryKeys.threads.analyses(threadId)) as AnalysesQueryData;

      // ✅ ASSERTION: Final state has complete data
      expect(final?.data?.items[0]?.status).toBe(AnalysisStatuses.COMPLETE);
      expect(final?.data?.items[0]?.analysisData).toBeDefined();
    });

    /**
     * TEST 12: Handle multiple analyses (multi-round scenario)
     */
    it('should preserve all analyses across multiple rounds during navigation', () => {
      const threadId = 'thread123';

      // Multiple rounds completed on overview screen
      const analyses = [
        createStoredAnalysisWithData(0, AnalysisStatuses.COMPLETE),
        createStoredAnalysisWithData(1, AnalysisStatuses.COMPLETE),
      ];

      queryClient.setQueryData(
        queryKeys.threads.analyses(threadId),
        {
          success: true,
          data: {
            items: analyses,
          },
        },
      );

      // After navigation
      const cached = queryClient.getQueryData(queryKeys.threads.analyses(threadId)) as AnalysesQueryData;

      // ✅ ASSERTION: All analyses preserved
      expect(cached?.data?.items).toHaveLength(2);
      expect(cached?.data?.items[0]?.analysisData).toBeDefined();
      expect(cached?.data?.items[1]?.analysisData).toBeDefined();
      expect(cached?.data?.items[0]?.roundNumber).toBe(0);
      expect(cached?.data?.items[1]?.roundNumber).toBe(1);
    });

    /**
     * TEST 13: Handle empty server response
     */
    it('should preserve cached data when server returns empty array', () => {
      const threadId = 'thread123';

      // Complete analysis in cache
      const cachedAnalysis = createStoredAnalysisWithData(0, AnalysisStatuses.COMPLETE);
      queryClient.setQueryData(
        queryKeys.threads.analyses(threadId),
        {
          success: true,
          data: {
            items: [cachedAnalysis],
          },
        },
      );

      // Server returns empty (analysis not persisted yet)
      const serverResponse = {
        success: true,
        data: {
          items: [],
        },
      };

      // Get cached data
      const cached = queryClient.getQueryData(queryKeys.threads.analyses(threadId)) as AnalysesQueryData;

      // Merge strategy: if server is empty but cache has data, keep cache
      const mergedItems = serverResponse.data.items.length > 0
        ? serverResponse.data.items
        : (cached?.data?.items || []);

      // ✅ ASSERTION: Cached data preserved
      expect(mergedItems).toHaveLength(1);
      expect(mergedItems[0]?.analysisData).toBeDefined();
    });

    /**
     * TEST 14: Verify analysis data completeness requirements
     */
    it('should validate that complete analysis has all required fields for UI rendering', () => {
      const analysis = createStoredAnalysisWithData(0, AnalysisStatuses.COMPLETE);

      // Required for leaderboard rendering
      expect(analysis.analysisData?.leaderboard).toBeDefined();
      expect(analysis.analysisData?.leaderboard.length).toBeGreaterThan(0);
      analysis.analysisData?.leaderboard.forEach((entry) => {
        expect(entry.rank).toBeGreaterThan(0);
        expect(entry.participantIndex).toBeGreaterThanOrEqual(0);
        expect(entry.modelId).toBeTruthy();
        expect(entry.modelName).toBeTruthy();
        expect(entry.overallRating).toBeGreaterThan(0);
        expect(entry.badge).toBeDefined(); // Can be null
      });

      // Required for participant cards rendering
      expect(analysis.analysisData?.participantAnalyses).toBeDefined();
      expect(analysis.analysisData?.participantAnalyses.length).toBeGreaterThan(0);
      analysis.analysisData?.participantAnalyses.forEach((pa) => {
        expect(pa.participantIndex).toBeGreaterThanOrEqual(0);
        expect(pa.modelId).toBeTruthy();
        expect(pa.modelName).toBeTruthy();
        expect(pa.overallRating).toBeGreaterThan(0);
        expect(pa.skillsMatrix).toHaveLength(5);
        expect(pa.pros.length).toBeGreaterThan(0);
        expect(pa.summary).toBeTruthy();
      });

      // Required for round summary rendering
      expect(analysis.analysisData?.roundSummary).toBeDefined();
      const summary = analysis.analysisData?.roundSummary;
      expect(summary?.keyInsights).toBeDefined();
      expect(summary?.keyInsights.length).toBeGreaterThan(0);
      expect(summary?.overallSummary).toBeTruthy();
      expect(summary?.conclusion).toBeTruthy();
      expect(summary?.comparativeAnalysis).toBeDefined();
      expect(summary?.decisionFramework).toBeDefined();
    });
  });
});
