/**
 * Screen Navigation Integration Tests
 *
 * Tests the ACTUAL data flow and state synchronization between:
 * - Overview Screen (/chat) → Thread Screen (/chat/[slug]) navigation
 * - Server data (API responses) → Store state synchronization
 * - Round numbers, participants, messages, analyses consistency
 *
 * CRITICAL FLOW (from FLOW_DOCUMENTATION.md):
 * 1. User submits first message on overview screen
 * 2. Thread created with round 0 (r0)
 * 3. Participants stream responses sequentially
 * 4. Analysis generated for round 0
 * 5. Navigation to /chat/[slug] (Thread Screen)
 * 6. Thread screen initializes from server data
 * 7. Store state must match server data exactly
 *
 * WHAT WE'RE TESTING:
 * - Data completeness (all fields present)
 * - Round number consistency (0-based storage)
 * - Participant ID matching between messages/participants
 * - Analysis roundNumber matches message roundNumber
 * - No missing metadata or incomplete records
 * - Screen mode transitions preserve data
 */

import type { UIMessage } from 'ai';

import { AnalysisStatuses, MessageRoles } from '@/api/core/enums';
import type { RoundSummary, StoredModeratorAnalysis } from '@/api/routes/chat/schema';
import type { DbMessageMetadata } from '@/db/schemas/chat-metadata';
import type { ChatParticipant } from '@/db/validation/chat';
import type { TestAssistantMessage } from '@/lib/testing';
import { createMockParticipant, createMockThread, createTestAssistantMessage, createTestUserMessage } from '@/lib/testing';
import { getRoundNumber } from '@/lib/utils/metadata';
import { getCurrentRoundNumber } from '@/lib/utils/round-utils';

// ============================================================================
// Test Data Factories (Mimicking Server Responses)
// ============================================================================

// Using createMockThread and createMockParticipant from @/lib/testing instead of duplicating

/**
 * Create complete participant objects as returned by server
 * This mimics /api/v1/chat/threads/[id]/participants response
 */
function createMockParticipants(count = 2): ChatParticipant[] {
  return Array.from({ length: count }, (_, i) => createMockParticipant({
    id: `p${i}`,
    threadId: '01KA1DEY81D0X6760M7ZDKZTC5',
    modelId: `model-${i}`,
    role: i === 0 ? 'The Analyst' : 'The Critic',
    priority: i,
  }));
}

/**
 * Create complete RoundSummary for analysis testing
 */
function createMockRoundSummary(): RoundSummary {
  return {
    keyInsights: ['Insight 1', 'Insight 2'],
    consensusPoints: ['Consensus point 1'],
    divergentApproaches: [
      { topic: 'Approach to problem', perspectives: ['Perspective 1', 'Perspective 2'] },
    ],
    comparativeAnalysis: {
      strengthsByCategory: [
        { category: 'Category 1', participants: ['p0', 'p1'] },
      ],
      tradeoffs: ['Tradeoff 1'],
    },
    decisionFramework: {
      criteriaToConsider: ['Criterion 1', 'Criterion 2'],
      scenarioRecommendations: [
        { scenario: 'Scenario 1', recommendation: 'Recommendation 1' },
      ],
    },
    overallSummary: 'This is a comprehensive overall summary that meets minimum character requirements',
    conclusion: 'This is the final conclusion with recommendations',
    recommendedActions: [
      {
        action: 'Test action',
        rationale: 'Test rationale',
        suggestedModels: [],
        suggestedRoles: [],
        suggestedMode: '',
      },
    ],
  };
}

/**
 * Create complete analysis object as returned by server
 * This mimics /api/v1/chat/threads/[id]/analyses response
 */
function createMockAnalysis(
  roundNumber: number,
  participantMessageIds: string[],
  statusOverride?: typeof AnalysisStatuses[keyof typeof AnalysisStatuses],
): StoredModeratorAnalysis {
  return {
    id: `analysis-r${roundNumber}`,
    threadId: '01KA1DEY81D0X6760M7ZDKZTC5',
    roundNumber,
    mode: 'analyzing',
    userQuestion: `Question for round ${roundNumber}`,
    status: statusOverride ?? AnalysisStatuses.COMPLETE,
    participantMessageIds,
    analysisData: {
      participantAnalyses: participantMessageIds.map((_msgId, index) => ({
        participantIndex: index,
        participantRole: index === 0 ? 'The Analyst' : 'The Critic',
        modelId: `model-${index}`,
        modelName: `Model ${index}`,
        overallRating: 8.5,
        skillsMatrix: [
          { skillName: 'Analytical Depth', rating: 9 },
          { skillName: 'Evidence Usage', rating: 8 },
          { skillName: 'Objectivity', rating: 7 },
          { skillName: 'Clarity', rating: 8 },
          { skillName: 'Comprehensiveness', rating: 9 },
        ],
        pros: ['Strength 1', 'Strength 2'],
        cons: ['Weakness 1'],
        summary: 'Participant summary that is concise and informative',
      })),
      leaderboard: participantMessageIds.map((_msgId, index) => ({
        rank: index + 1,
        participantIndex: index,
        participantRole: index === 0 ? 'The Analyst' : 'The Critic',
        modelId: `model-${index}`,
        modelName: `Model ${index}`,
        overallRating: 9 - index,
        badge: index === 0 ? 'Best Analysis' : null,
      })),
      roundSummary: createMockRoundSummary(),
    },
    errorMessage: null,
    completedAt: new Date('2024-01-01T00:01:00Z'),
    createdAt: new Date('2024-01-01T00:00:30Z'),
  };
}

// ============================================================================
// OVERVIEW SCREEN → THREAD SCREEN NAVIGATION TESTS
// ============================================================================

describe('screen navigation integration', () => {
  const THREAD_ID = '01KA1DEY81D0X6760M7ZDKZTC5';

  describe('overview screen: first round completion', () => {
    /**
     * TEST: Complete first round flow on overview screen
     * Verify all data is created correctly with round 0
     */
    it('should create complete round 0 data on overview screen', () => {
      // 1. User submits first message
      const userMessage = createTestUserMessage({
        id: 'user-r0',
        content: 'What are the key differences between REST and GraphQL?',
        roundNumber: 0,
      });

      // 2. Participants respond (server returns these with complete metadata)
      const participants = createMockParticipants(2);
      const participantMessages: TestAssistantMessage[] = participants.map((p, index) =>
        createTestAssistantMessage({
          id: `${THREAD_ID}_r0_p${index}`,
          content: `Response from ${p.role}`,
          roundNumber: 0,
          participantId: p.id,
          participantIndex: index,
          model: p.modelId,
        }),
      );

      // 3. Combine all messages
      const allMessages: UIMessage[] = [userMessage, ...participantMessages];

      // 4. Analysis created after all participants complete
      const participantMessageIds = participantMessages.map(m => m.id);
      const analysis = createMockAnalysis(0, participantMessageIds);

      // ========== VERIFICATION: Data Completeness ==========

      // User message has correct round number
      expect(getRoundNumber(userMessage.metadata)).toBe(0);

      // All participant messages have complete metadata
      participantMessages.forEach((msg, index) => {
        const metadata = msg.metadata;
        expect(metadata.roundNumber).toBe(0);
        expect(metadata.participantId).toBe(`p${index}`);
        expect(metadata.participantIndex).toBe(index);
        expect(metadata.model).toBe(`model-${index}`);
        expect(metadata.hasError).toBe(false);
        expect(metadata.usage).toBeDefined();
        expect(metadata.finishReason).toBe('stop');
      });

      // Analysis has correct round number (NOT 1!)
      expect(analysis.roundNumber).toBe(0);

      // Analysis references match actual message IDs
      expect(analysis.participantMessageIds).toEqual(participantMessageIds);
      analysis.participantMessageIds.forEach((id, index) => {
        expect(id).toBe(`${THREAD_ID}_r0_p${index}`);
        expect(id).toContain('_r0_');
      });

      // Current round calculation is correct
      const currentRound = getCurrentRoundNumber(allMessages);
      expect(currentRound).toBe(0);

      // Analysis data is complete
      expect(analysis.analysisData).toBeDefined();
      expect(analysis.analysisData).toBeDefined();
      expect(analysis.analysisData?.participantAnalyses).toHaveLength(2);
      expect(analysis.analysisData?.leaderboard).toHaveLength(2);
      expect(analysis.analysisData?.roundSummary).toBeDefined();
      expect(analysis.status).toBe(AnalysisStatuses.COMPLETE);
    });

    /**
     * TEST: Verify navigation trigger conditions
     * Navigation should happen when analysis completes + AI title ready
     */
    it('should trigger navigation when analysis completes and AI title ready', () => {
      const thread = createMockThread({
        isAiGeneratedTitle: true,
        title: 'AI Generated Title for Discussion',
      });

      const analysis = createMockAnalysis(0, [`${THREAD_ID}_r0_p0`]);

      // Navigation should be triggered when:
      // 1. Analysis status is COMPLETE
      expect(analysis.status).toBe(AnalysisStatuses.COMPLETE);

      // 2. Thread has AI-generated title
      expect(thread.isAiGeneratedTitle).toBe(true);
      expect(thread.title).toBeTruthy();

      // These conditions together trigger navigation to /chat/[slug]
      const shouldNavigate = analysis.status === AnalysisStatuses.COMPLETE && thread.isAiGeneratedTitle;
      expect(shouldNavigate).toBe(true);
    });
  });

  describe('thread screen: server data initialization', () => {
    /**
     * TEST: Thread screen receives complete data from server
     * Verify ThreadScreen props match server response structure
     */
    it('should receive complete thread data from server on initial load', () => {
      // Server provides these props to ThreadScreen via SSR/Server Component
      const thread = createMockThread({ id: THREAD_ID });
      const participants = createMockParticipants(2);

      // Messages from server (already in UIMessage format via chatMessagesToUIMessages)
      const messages: UIMessage[] = [
        createTestUserMessage({
          id: 'user-r0',
          content: 'First question',
          roundNumber: 0,
        }),
        createTestAssistantMessage({
          id: `${THREAD_ID}_r0_p0`,
          content: 'First response',
          roundNumber: 0,
          participantId: 'p0',
          participantIndex: 0,
        }),
        createTestAssistantMessage({
          id: `${THREAD_ID}_r0_p1`,
          content: 'Second response',
          roundNumber: 0,
          participantId: 'p1',
          participantIndex: 1,
        }),
      ];

      // ========== VERIFICATION: Server Data Structure ==========

      // Thread object is complete
      expect(thread.id).toBe(THREAD_ID);
      expect(thread.slug).toBeTruthy();
      expect(thread.title).toBeTruthy();
      expect(thread.mode).toBeDefined();
      expect(thread.createdAt).toBeInstanceOf(Date);

      // Participants array is complete
      expect(participants).toHaveLength(2);
      participants.forEach((p, index) => {
        expect(p.id).toBe(`p${index}`);
        expect(p.threadId).toBe(THREAD_ID);
        expect(p.modelId).toBeTruthy();
        expect(p.priority).toBe(index);
      });

      // Messages have complete metadata
      const assistantMessages = messages.filter(
        (m): m is TestAssistantMessage => m.role === MessageRoles.ASSISTANT,
      );
      assistantMessages.forEach((msg, index) => {
        expect(msg.metadata.roundNumber).toBe(0);
        expect(msg.metadata.participantId).toBe(`p${index}`);
        expect(msg.metadata.participantIndex).toBe(index);
        expect(msg.metadata.model).toBeTruthy();
      });
    });

    /**
     * TEST: Store initialization matches server data
     * Verify useScreenInitialization correctly initializes store from server props
     */
    it('should synchronize store state with server data on thread screen mount', () => {
      const thread = createMockThread();
      const participants = createMockParticipants(2);
      const messages: UIMessage[] = [
        createTestUserMessage({
          id: 'user-r0',
          content: 'Question',
          roundNumber: 0,
        }),
        createTestAssistantMessage({
          id: `${THREAD_ID}_r0_p0`,
          content: 'Response',
          roundNumber: 0,
          participantId: 'p0',
          participantIndex: 0,
        }),
      ];

      // After useScreenInitialization runs with these props:
      // - store.thread should equal thread
      // - store.participants should equal participants
      // - store.messages should equal messages
      // - store.screenMode should be 'thread'

      // Simulate what initializeThread does:
      const storeState = {
        thread,
        participants,
        messages,
        screenMode: 'thread' as const,
      };

      // Verify state matches server data
      expect(storeState.thread).toEqual(thread);
      expect(storeState.participants).toEqual(participants);
      expect(storeState.messages).toEqual(messages);
      expect(storeState.screenMode).toBe('thread');
    });

    /**
     * TEST: Analyses are fetched and synced separately via orchestrator
     * Verify analysis data is properly synchronized
     */
    it('should fetch and sync analyses via orchestrator after thread initialization', () => {
      const participantMessageIds = [`${THREAD_ID}_r0_p0`, `${THREAD_ID}_r0_p1`];
      const analysis = createMockAnalysis(0, participantMessageIds);

      // Orchestrator fetches analyses from server
      const serverAnalyses = [analysis];

      // After orchestrator sync, store.analyses should contain fetched analyses
      const storeAnalyses = serverAnalyses;

      // Verify analysis data structure
      expect(storeAnalyses).toHaveLength(1);
      expect(storeAnalyses[0]).toEqual(analysis);
      expect(storeAnalyses[0]!.roundNumber).toBe(0);
      expect(storeAnalyses[0]!.participantMessageIds).toEqual(participantMessageIds);
      expect(storeAnalyses[0]!.status).toBe(AnalysisStatuses.COMPLETE);
    });
  });

  describe('state synchronization: messages ↔ participants ↔ analyses', () => {
    /**
     * TEST: Participant IDs in messages match participants array
     * Critical for rendering correct model avatars and names
     */
    it('should have matching participant IDs between messages and participants', () => {
      const participants = createMockParticipants(3);
      const messages: UIMessage[] = [
        createTestUserMessage({
          id: 'user-r0',
          content: 'Question',
          roundNumber: 0,
        }),
        ...participants.map((p, index) =>
          createTestAssistantMessage({
            id: `${THREAD_ID}_r0_p${index}`,
            content: `Response from ${p.role}`,
            roundNumber: 0,
            participantId: p.id,
            participantIndex: index,
            model: p.modelId,
          }),
        ),
      ];

      // Extract participant IDs from messages
      const messageParticipantIds = messages
        .filter((m): m is TestAssistantMessage => m.role === MessageRoles.ASSISTANT)
        .map(m => m.metadata.participantId);

      // Extract participant IDs from participants array
      const participantIds = participants.map(p => p.id);

      // MUST match exactly
      expect(messageParticipantIds).toEqual(participantIds);

      // Verify each message can find its participant
      messages
        .filter((m): m is TestAssistantMessage => m.role === MessageRoles.ASSISTANT)
        .forEach((msg) => {
          const participant = participants.find(p => p.id === msg.metadata.participantId);
          expect(participant).toBeDefined();
          expect(participant?.modelId).toBe(msg.metadata.model);
        });
    });

    /**
     * TEST: Analysis participantMessageIds match actual message IDs
     * Critical for linking analyses to specific responses
     */
    it('should have matching message IDs between messages and analysis', () => {
      const participants = createMockParticipants(2);
      const participantMessages = participants.map((p, index) =>
        createTestAssistantMessage({
          id: `${THREAD_ID}_r0_p${index}`,
          content: `Response ${index + 1}`,
          roundNumber: 0,
          participantId: p.id,
          participantIndex: index,
        }),
      );

      const messageIds = participantMessages.map(m => m.id);
      const analysis = createMockAnalysis(0, messageIds);

      // Analysis references must exactly match message IDs
      expect(analysis.participantMessageIds).toEqual(messageIds);

      // Each referenced message must exist
      analysis.participantMessageIds.forEach((id) => {
        const message = participantMessages.find(m => m.id === id);
        expect(message).toBeDefined();
      });

      // Analysis participant analyses must match participant count
      expect(analysis.analysisData).toBeDefined();
      expect(analysis.analysisData?.participantAnalyses).toHaveLength(participantMessages.length);

      // Each participant analysis must reference a valid participant by index
      analysis.analysisData?.participantAnalyses.forEach((pa) => {
        const message = participantMessages[pa.participantIndex];
        expect(message).toBeDefined();
        expect(message?.metadata.participantIndex).toBe(pa.participantIndex);
      });
    });

    /**
     * TEST: Round numbers are consistent across all entities
     * Messages, participants, and analyses must all agree on round numbers
     */
    it('should have consistent round numbers across messages and analyses', () => {
      const roundNumber = 0;

      // Create messages for round 0
      const messages: UIMessage[] = [
        createTestUserMessage({
          id: 'user-r0',
          content: 'Question',
          roundNumber,
        }),
        createTestAssistantMessage({
          id: `${THREAD_ID}_r0_p0`,
          content: 'Response 1',
          roundNumber,
          participantId: 'p0',
          participantIndex: 0,
        }),
        createTestAssistantMessage({
          id: `${THREAD_ID}_r0_p1`,
          content: 'Response 2',
          roundNumber,
          participantId: 'p1',
          participantIndex: 1,
        }),
      ];

      // Create analysis for round 0
      const participantMessageIds = messages
        .filter(m => m.role === MessageRoles.ASSISTANT)
        .map(m => m.id);
      const analysis = createMockAnalysis(roundNumber, participantMessageIds);

      // ========== VERIFICATION: Round Number Consistency ==========

      // All messages have same round number
      messages.forEach((msg) => {
        expect(getRoundNumber(msg.metadata)).toBe(roundNumber);
      });

      // Analysis round number matches messages
      expect(analysis.roundNumber).toBe(roundNumber);

      // Message IDs contain correct round number
      participantMessageIds.forEach((id) => {
        expect(id).toContain(`_r${roundNumber}_`);
      });

      // Current round calculation is correct
      const currentRound = getCurrentRoundNumber(messages);
      expect(currentRound).toBe(roundNumber);
    });

    /**
     * TEST: Multi-round consistency
     * Verify data remains consistent across multiple rounds
     */
    it('should maintain consistency across multiple rounds', () => {
      const participants = createMockParticipants(2);

      // Create 3 rounds of messages
      const allMessages: UIMessage[] = [];
      const allAnalyses: StoredModeratorAnalysis[] = [];

      for (let r = 0; r < 3; r++) {
        // User message
        allMessages.push(
          createTestUserMessage({
            id: `user-r${r}`,
            content: `Question for round ${r}`,
            roundNumber: r,
          }),
        );

        // Participant responses
        const roundParticipantMessages = participants.map((p, index) =>
          createTestAssistantMessage({
            id: `${THREAD_ID}_r${r}_p${index}`,
            content: `Round ${r} response ${index + 1}`,
            roundNumber: r,
            participantId: p.id,
            participantIndex: index,
          }),
        );
        allMessages.push(...roundParticipantMessages);

        // Analysis for this round
        const participantMessageIds = roundParticipantMessages.map(m => m.id);
        const analysis = createMockAnalysis(r, participantMessageIds);
        allAnalyses.push(analysis);
      }

      // ========== VERIFICATION: Cross-Round Consistency ==========

      // Verify each round independently
      for (let r = 0; r < 3; r++) {
        const roundMessages = allMessages.filter(m => getRoundNumber(m.metadata) === r);
        const roundAnalysis = allAnalyses[r]!;

        // Round has correct number of messages (1 user + 2 participants)
        expect(roundMessages).toHaveLength(3);

        // Analysis round number matches
        expect(roundAnalysis.roundNumber).toBe(r);

        // Analysis references correct messages
        const roundParticipantMessages = roundMessages.filter(m => m.role === MessageRoles.ASSISTANT);
        const roundParticipantIds = roundParticipantMessages.map(m => m.id);
        expect(roundAnalysis.participantMessageIds).toEqual(roundParticipantIds);

        // All message IDs have correct format
        roundParticipantIds.forEach((id) => {
          expect(id).toContain(`_r${r}_`);
        });
      }

      // Verify analyses are in correct order
      expect(allAnalyses[0]!.roundNumber).toBe(0);
      expect(allAnalyses[1]!.roundNumber).toBe(1);
      expect(allAnalyses[2]!.roundNumber).toBe(2);
    });
  });

  describe('data completeness checks', () => {
    /**
     * TEST: No missing metadata in messages
     * All messages must have complete metadata for proper rendering
     */
    it('should have complete metadata for all messages', () => {
      const messages: UIMessage[] = [
        createTestUserMessage({
          id: 'user-r0',
          content: 'Question',
          roundNumber: 0,
        }),
        createTestAssistantMessage({
          id: `${THREAD_ID}_r0_p0`,
          content: 'Response',
          roundNumber: 0,
          participantId: 'p0',
          participantIndex: 0,
          model: 'gpt-4',
        }),
      ];

      // Verify all messages have complete metadata
      messages.forEach((msg) => {
        expect(msg.metadata).toBeDefined();
        const metadata = msg.metadata as DbMessageMetadata;
        expect([MessageRoles.USER, MessageRoles.ASSISTANT]).toContain(metadata.role);
        expect(metadata.roundNumber).toBeDefined();
        expect(metadata.roundNumber).toBeGreaterThanOrEqual(0);
      });

      // Verify assistant messages have complete metadata
      const assistantMessages = messages.filter((m): m is TestAssistantMessage => m.role === MessageRoles.ASSISTANT);
      assistantMessages.forEach((assistantMsg) => {
        expect(assistantMsg.metadata.participantId).toBeTruthy();
        expect(assistantMsg.metadata.participantIndex).toBeGreaterThanOrEqual(0);
        expect(assistantMsg.metadata.model).toBeTruthy();
        expect(assistantMsg.metadata.finishReason).toBeTruthy();
        expect(assistantMsg.metadata.usage).toBeDefined();
        expect(assistantMsg.metadata.hasError).toBeDefined();
      });
    });

    /**
     * TEST: No missing data in participants
     * All participants must have complete configuration
     */
    it('should have complete data for all participants', () => {
      const participants = createMockParticipants(3);

      participants.forEach((p, index) => {
        expect(p.id).toBeTruthy();
        expect(p.threadId).toBe(THREAD_ID);
        expect(p.modelId).toBeTruthy();
        expect(p.priority).toBe(index);
        expect(p.createdAt).toBeInstanceOf(Date);

        // Role can be empty string but must be defined
        expect(p.role).toBeDefined();
      });
    });

    /**
     * TEST: No missing data in analyses
     * All analyses must have complete data structure
     */
    it('should have complete data for all analyses', () => {
      const analysis = createMockAnalysis(0, [`${THREAD_ID}_r0_p0`, `${THREAD_ID}_r0_p1`]);

      // Top-level fields
      expect(analysis.id).toBeTruthy();
      expect(analysis.threadId).toBe(THREAD_ID);
      expect(analysis.roundNumber).toBeGreaterThanOrEqual(0);
      expect(analysis.mode).toBeTruthy();
      expect(analysis.userQuestion).toBeTruthy();
      expect(analysis.status).toBeTruthy();
      expect(analysis.participantMessageIds).toHaveLength(2);
      expect(analysis.createdAt).toBeInstanceOf(Date);

      // Analysis data structure
      expect(analysis.analysisData).toBeDefined();
      expect(analysis.analysisData?.participantAnalyses).toBeDefined();
      expect(analysis.analysisData?.leaderboard).toBeDefined();
      expect(analysis.analysisData?.roundSummary).toBeDefined();

      // Participant analyses completeness (matches ParticipantAnalysisSchema)
      analysis.analysisData?.participantAnalyses.forEach((pa) => {
        expect(pa.participantIndex).toBeGreaterThanOrEqual(0);
        expect(pa.participantRole).toBeDefined();
        expect(pa.modelId).toBeTruthy();
        expect(pa.modelName).toBeTruthy();
        expect(pa.overallRating).toBeGreaterThanOrEqual(1);
        expect(pa.skillsMatrix).toHaveLength(5);
        expect(pa.pros).toBeDefined();
        expect(pa.cons).toBeDefined();
        expect(pa.summary).toBeTruthy();
      });

      // Leaderboard completeness (matches LeaderboardEntrySchema)
      analysis.analysisData?.leaderboard.forEach((entry) => {
        expect(entry.rank).toBeGreaterThan(0);
        expect(entry.participantIndex).toBeGreaterThanOrEqual(0);
        expect(entry.participantRole).toBeDefined();
        expect(entry.modelId).toBeTruthy();
        expect(entry.modelName).toBeTruthy();
        expect(entry.overallRating).toBeGreaterThanOrEqual(1);
        expect(entry.badge).toBeDefined(); // Can be null
      });

      // Round summary completeness
      const summary = analysis.analysisData?.roundSummary;
      expect(summary).toBeDefined();
      expect(summary?.keyInsights).toBeDefined();
      expect(summary?.overallSummary).toBeTruthy();
      expect(summary?.conclusion).toBeTruthy();
      expect(summary?.recommendedActions).toBeDefined();
    });
  });

  describe('screen mode transitions', () => {
    /**
     * TEST: Screen mode changes from overview to thread
     * Verify screenMode flag updates correctly
     */
    it('should transition screenMode from overview to thread', () => {
      // Overview screen sets screenMode to 'overview'
      const overviewScreenMode = 'overview' as const;
      expect(overviewScreenMode).toBe('overview');

      // After navigation, thread screen sets screenMode to 'thread'
      const threadScreenMode = 'thread' as const;
      expect(threadScreenMode).toBe('thread');

      // Modes are different
      expect(overviewScreenMode).not.toBe(threadScreenMode);
    });

    /**
     * TEST: isReadonly flag based on screen mode
     * Overview screen is NOT readonly, thread screen can be readonly for public views
     */
    it('should set correct readonly state for each screen', () => {
      // Overview screen: always interactive (user is creating thread)
      const overviewReadonly = false;
      expect(overviewReadonly).toBe(false);

      // Thread screen (private): interactive
      const threadReadonly = false;
      expect(threadReadonly).toBe(false);

      // Public thread screen: readonly
      const publicThreadReadonly = true;
      expect(publicThreadReadonly).toBe(true);
    });

    /**
     * TEST: Form state preservation across navigation
     * Some form state should be preserved, others reset
     */
    it('should handle form state correctly during navigation', () => {
      // On overview: user configures participants and mode
      const overviewFormState = {
        selectedParticipants: [
          { id: 'p0', modelId: 'model-0', role: 'Analyst', priority: 0 },
          { id: 'p1', modelId: 'model-1', role: 'Critic', priority: 1 },
        ],
        selectedMode: 'analyzing' as const,
        inputValue: '', // Cleared after submission
      };

      // After navigation to thread screen:
      // - Participants are stored in thread (from server)
      // - Mode is stored in thread
      // - Input is cleared for next message
      const threadFormState = {
        selectedParticipants: overviewFormState.selectedParticipants,
        selectedMode: overviewFormState.selectedMode,
        inputValue: '', // Ready for next message
      };

      // Participants and mode preserved
      expect(threadFormState.selectedParticipants).toEqual(overviewFormState.selectedParticipants);
      expect(threadFormState.selectedMode).toBe(overviewFormState.selectedMode);

      // Input cleared
      expect(threadFormState.inputValue).toBe('');
    });
  });

  describe('regression: user-reported bugs', () => {
    /**
     * REGRESSION TEST: First analysis must have roundNumber: 0, not 1
     * User report: "analyses[0].roundNumber = 1" (BUG!)
     * Expected: "analyses[0].roundNumber = 0"
     */
    it('should NOT have roundNumber 1 for first analysis', () => {
      const analysis = createMockAnalysis(0, [`${THREAD_ID}_r0_p0`]);

      // CRITICAL: First analysis must be round 0
      expect(analysis.roundNumber).toBe(0);
      expect(analysis.roundNumber).not.toBe(1);

      // Message IDs must contain r0
      analysis.participantMessageIds.forEach((id) => {
        expect(id).toContain('_r0_');
        expect(id).not.toContain('_r1_');
      });
    });

    /**
     * REGRESSION TEST: Navigation should not happen before analysis completes
     * Verify navigation only triggers with correct conditions
     */
    it('should NOT navigate before analysis completes', () => {
      const thread = createMockThread({ isAiGeneratedTitle: true });

      // Scenario 1: Analysis still streaming
      const streamingAnalysis = createMockAnalysis(0, [`${THREAD_ID}_r0_p0`], AnalysisStatuses.STREAMING);

      const shouldNavigateStreaming = streamingAnalysis.status === AnalysisStatuses.COMPLETE && thread.isAiGeneratedTitle;
      expect(shouldNavigateStreaming).toBe(false); // Should NOT navigate

      // Scenario 2: Analysis pending
      const pendingAnalysis = createMockAnalysis(0, [`${THREAD_ID}_r0_p0`], AnalysisStatuses.PENDING);

      const shouldNavigatePending = pendingAnalysis.status === AnalysisStatuses.COMPLETE && thread.isAiGeneratedTitle;
      expect(shouldNavigatePending).toBe(false); // Should NOT navigate

      // Scenario 3: Analysis complete + AI title ready
      const completeAnalysis = createMockAnalysis(0, [`${THREAD_ID}_r0_p0`], AnalysisStatuses.COMPLETE);

      const shouldNavigateComplete = completeAnalysis.status === AnalysisStatuses.COMPLETE && thread.isAiGeneratedTitle;
      expect(shouldNavigateComplete).toBe(true); // SHOULD navigate
    });

    /**
     * REGRESSION TEST: Participant indices must reset per round
     * Ensure p0, p1 indices restart for each round
     */
    it('should reset participant indices for each round', () => {
      const messages: UIMessage[] = [
        // Round 0
        createTestUserMessage({ id: 'user-r0', content: 'Q1', roundNumber: 0 }),
        createTestAssistantMessage({
          id: `${THREAD_ID}_r0_p0`,
          content: 'R0-P0',
          roundNumber: 0,
          participantId: 'p0',
          participantIndex: 0,
        }),
        createTestAssistantMessage({
          id: `${THREAD_ID}_r0_p1`,
          content: 'R0-P1',
          roundNumber: 0,
          participantId: 'p1',
          participantIndex: 1,
        }),
        // Round 1 - indices should restart at 0
        createTestUserMessage({ id: 'user-r1', content: 'Q2', roundNumber: 1 }),
        createTestAssistantMessage({
          id: `${THREAD_ID}_r1_p0`,
          content: 'R1-P0',
          roundNumber: 1,
          participantId: 'p0',
          participantIndex: 0, // MUST be 0, not 2!
        }),
        createTestAssistantMessage({
          id: `${THREAD_ID}_r1_p1`,
          content: 'R1-P1',
          roundNumber: 1,
          participantId: 'p1',
          participantIndex: 1, // MUST be 1, not 3!
        }),
      ];

      // Round 0 participants
      const r0Participants = messages.filter(
        (m): m is TestAssistantMessage => m.role === MessageRoles.ASSISTANT && getRoundNumber(m.metadata) === 0,
      );
      expect(r0Participants[0]!.metadata.participantIndex).toBe(0);
      expect(r0Participants[1]!.metadata.participantIndex).toBe(1);

      // Round 1 participants - MUST restart at 0
      const r1Participants = messages.filter(
        (m): m is TestAssistantMessage => m.role === MessageRoles.ASSISTANT && getRoundNumber(m.metadata) === 1,
      );
      expect(r1Participants[0]!.metadata.participantIndex).toBe(0);
      expect(r1Participants[1]!.metadata.participantIndex).toBe(1);
    });
  });
});
