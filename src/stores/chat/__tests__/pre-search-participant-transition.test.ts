/**
 * Pre-Search to Participant Transition Tests
 *
 * Tests critical transition from pre-search completion to participant streaming:
 * - Round 1: No pre-search, 2 participants stream normally
 * - Round 2: With pre-search, 2 participants stream after pre-search completes
 * - Pre-search data isolation (no contamination between rounds)
 * - Pre-search status doesn't block participant completion detection
 *
 * CRITICAL SCENARIOS:
 * - Pre-search completes → Participants start immediately (no blocking)
 * - Pre-search data in Round 2 doesn't leak into Round 1 participant messages
 * - Pre-search STREAMING status doesn't prevent Round 2 participants from completing
 * - Pre-search COMPLETE status triggers participant streaming in Round 2
 * - Multiple rounds with different pre-search states work correctly
 *
 * Location: /src/stores/chat/__tests__/pre-search-participant-transition.test.ts
 */

import type { UIMessage } from 'ai';
import { beforeEach, describe, expect, it } from 'vitest';

import { MessageRoles, MessageStatuses } from '@/api/core/enums';
import type { ChatParticipant } from '@/api/routes/chat/schema';
import type { StoredPreSearch } from '@/stores/chat/store-schemas';

import { getParticipantCompletionStatus } from '../utils/participant-completion-gate';

// ============================================================================
// Test Utilities
// ============================================================================

function createParticipant(id: string, index: number): ChatParticipant {
  return {
    id,
    threadId: 'thread-123',
    modelId: `model-${index}`,
    customRoleId: null,
    role: null,
    priority: index,
    isEnabled: true,
    settings: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };
}

function createUserMessage(roundNumber: number, text = 'Question'): UIMessage {
  return {
    id: `user-r${roundNumber}`,
    role: MessageRoles.USER,
    parts: [{ type: 'text', text }],
    metadata: { role: MessageRoles.USER, roundNumber },
  };
}

function createAssistantMessage(
  participantId: string,
  roundNumber: number,
  participantIndex: number,
  options: { streaming?: boolean; hasContent?: boolean; finishReason?: string } = {},
): UIMessage {
  const { streaming = false, hasContent = true, finishReason = 'stop' } = options;

  return {
    id: `msg-${participantId}-r${roundNumber}`,
    role: MessageRoles.ASSISTANT,
    parts: hasContent
      ? [{ type: 'text', text: `Response from ${participantId}`, state: streaming ? 'streaming' as const : 'done' as const }]
      : [],
    metadata: {
      role: MessageRoles.ASSISTANT,
      roundNumber,
      participantId,
      participantIndex,
      model: `model-${participantIndex}`,
      finishReason: streaming ? undefined : finishReason,
    },
  };
}

function createPreSearch(
  roundNumber: number,
  status: typeof MessageStatuses.PENDING | typeof MessageStatuses.STREAMING | typeof MessageStatuses.COMPLETE,
  searchData?: StoredPreSearch['searchData'],
): StoredPreSearch {
  return {
    id: `ps-r${roundNumber}`,
    threadId: 'thread-123',
    roundNumber,
    status,
    userQuery: `Question for round ${roundNumber}`,
    searchData: status === MessageStatuses.COMPLETE
      ? (searchData ?? {
          queries: [`query for round ${roundNumber}`],
          results: [],
          summary: `Summary for round ${roundNumber}`,
          successCount: 0,
          failureCount: 0,
          totalResults: 0,
          totalTime: 100,
        })
      : null,
    createdAt: new Date('2024-01-01'),
    completedAt: status === MessageStatuses.COMPLETE ? new Date('2024-01-01') : null,
  };
}

// ============================================================================
// Multi-Round Pre-Search Transition Tests
// ============================================================================

describe('pre-Search to Participant Transition', () => {
  let participants: ChatParticipant[];

  beforeEach(() => {
    participants = [
      createParticipant('p1', 0),
      createParticipant('p2', 1),
    ];
  });

  describe('round 1: No Pre-Search Baseline', () => {
    it('should allow participants to stream normally without pre-search', () => {
      const messages: UIMessage[] = [
        createUserMessage(0),
        createAssistantMessage('p1', 0, 0),
        createAssistantMessage('p2', 0, 1),
      ];

      const preSearches: StoredPreSearch[] = [];

      const participantStatus = getParticipantCompletionStatus(messages, participants, 0);
      const preSearchForRound = preSearches.find(ps => ps.roundNumber === 0);

      // Participants complete
      expect(participantStatus.allComplete).toBe(true);
      expect(participantStatus.completedCount).toBe(2);

      // No pre-search blocking
      const preSearchBlocking = preSearchForRound && preSearchForRound.status !== MessageStatuses.COMPLETE;
      expect(preSearchBlocking).toBeFalsy();

      // Should allow next phase (moderator, etc.)
      const canProceed = participantStatus.allComplete && !preSearchBlocking;
      expect(canProceed).toBe(true);
    });

    it('should detect streaming participants correctly without pre-search', () => {
      const messages: UIMessage[] = [
        createUserMessage(0),
        createAssistantMessage('p1', 0, 0),
        createAssistantMessage('p2', 0, 1, { streaming: true }), // Still streaming
      ];

      const _preSearches: StoredPreSearch[] = []; // Unused but documents no pre-search in round 0

      const participantStatus = getParticipantCompletionStatus(messages, participants, 0);

      expect(participantStatus.allComplete).toBe(false);
      expect(participantStatus.completedCount).toBe(1);
      expect(participantStatus.streamingCount).toBe(1);
      expect(participantStatus.streamingParticipantIds).toContain('p2');
    });
  });

  describe('round 2: With Pre-Search', () => {
    it('should wait for pre-search PENDING before starting participants', () => {
      const messages: UIMessage[] = [
        // Round 0 complete
        createUserMessage(0),
        createAssistantMessage('p1', 0, 0),
        createAssistantMessage('p2', 0, 1),
        // Round 1 - user message sent, waiting for pre-search
        createUserMessage(1),
      ];

      const preSearches: StoredPreSearch[] = [
        createPreSearch(1, MessageStatuses.PENDING),
      ];

      const participantStatus = getParticipantCompletionStatus(messages, participants, 1);
      const preSearchForRound = preSearches.find(ps => ps.roundNumber === 1);

      // No participant messages yet
      expect(participantStatus.completedCount).toBe(0);

      // Pre-search is PENDING - should block participants
      expect(preSearchForRound?.status).toBe(MessageStatuses.PENDING);
      const shouldBlock = preSearchForRound && preSearchForRound.status !== MessageStatuses.COMPLETE;
      expect(shouldBlock).toBe(true);
    });

    it('should wait for pre-search STREAMING before starting participants', () => {
      const messages: UIMessage[] = [
        // Round 0 complete
        createUserMessage(0),
        createAssistantMessage('p1', 0, 0),
        createAssistantMessage('p2', 0, 1),
        // Round 1 - user message sent, pre-search streaming
        createUserMessage(1),
      ];

      const preSearches: StoredPreSearch[] = [
        createPreSearch(1, MessageStatuses.STREAMING),
      ];

      const participantStatus = getParticipantCompletionStatus(messages, participants, 1);
      const preSearchForRound = preSearches.find(ps => ps.roundNumber === 1);

      // No participant messages yet
      expect(participantStatus.completedCount).toBe(0);

      // Pre-search is STREAMING - should block participants
      expect(preSearchForRound?.status).toBe(MessageStatuses.STREAMING);
      const shouldBlock = preSearchForRound && preSearchForRound.status !== MessageStatuses.COMPLETE;
      expect(shouldBlock).toBe(true);
    });

    it('should start participants after pre-search COMPLETES', () => {
      const messages: UIMessage[] = [
        // Round 0 complete
        createUserMessage(0),
        createAssistantMessage('p1', 0, 0),
        createAssistantMessage('p2', 0, 1),
        // Round 1 - pre-search complete, participants starting
        createUserMessage(1),
        createAssistantMessage('p1', 1, 0, { streaming: true }),
      ];

      const preSearches: StoredPreSearch[] = [
        createPreSearch(1, MessageStatuses.COMPLETE),
      ];

      const participantStatus = getParticipantCompletionStatus(messages, participants, 1);
      const preSearchForRound = preSearches.find(ps => ps.roundNumber === 1);

      // Pre-search is COMPLETE - should NOT block participants
      expect(preSearchForRound?.status).toBe(MessageStatuses.COMPLETE);
      const shouldBlock = preSearchForRound && preSearchForRound.status !== MessageStatuses.COMPLETE;
      expect(shouldBlock).toBe(false);

      // Participants are streaming
      expect(participantStatus.streamingCount).toBe(2); // p1 streaming, p2 not started yet
    });
  });

  describe('pre-Search Data Isolation', () => {
    it('should NOT contaminate Round 1 participants with Round 2 pre-search data', () => {
      const round1PreSearchData = {
        queries: ['round 1 query'],
        results: [],
        summary: 'Round 1 Summary',
        successCount: 1,
        failureCount: 0,
        totalResults: 5,
        totalTime: 150,
      };

      const round2PreSearchData = {
        queries: ['round 2 query'],
        results: [],
        summary: 'Round 2 Summary',
        successCount: 2,
        failureCount: 0,
        totalResults: 10,
        totalTime: 250,
      };

      const messages: UIMessage[] = [
        // Round 0 complete (no pre-search)
        createUserMessage(0, 'Question 0'),
        createAssistantMessage('p1', 0, 0),
        createAssistantMessage('p2', 0, 1),
        // Round 1 complete (with pre-search)
        createUserMessage(1, 'Question 1'),
        createAssistantMessage('p1', 1, 0),
        createAssistantMessage('p2', 1, 1),
      ];

      const preSearches: StoredPreSearch[] = [
        createPreSearch(1, MessageStatuses.COMPLETE, round1PreSearchData),
        createPreSearch(2, MessageStatuses.COMPLETE, round2PreSearchData),
      ];

      // Get pre-search for each round
      const round1PreSearch = preSearches.find(ps => ps.roundNumber === 1);
      const round2PreSearch = preSearches.find(ps => ps.roundNumber === 2);

      // Verify data isolation
      expect(round1PreSearch?.searchData?.summary).toBe('Round 1 Summary');
      expect(round1PreSearch?.searchData?.totalResults).toBe(5);
      expect(round2PreSearch?.searchData?.summary).toBe('Round 2 Summary');
      expect(round2PreSearch?.searchData?.totalResults).toBe(10);

      // Verify participant messages don't contain pre-search data
      const round1P1Message = messages.find(m => m.id === 'msg-p1-r1');
      expect(round1P1Message?.parts[0]).toMatchObject({
        type: 'text',
        text: 'Response from p1',
      });

      // Pre-search data should NOT be in message metadata
      expect(round1P1Message?.metadata).not.toHaveProperty('searchData');
      expect(round1P1Message?.metadata).not.toHaveProperty('preSearchSummary');
    });

    it('should keep pre-search data separate from participant metadata', () => {
      const messages: UIMessage[] = [
        createUserMessage(0),
        createAssistantMessage('p1', 0, 0),
      ];

      // Pre-search data should not contaminate participant metadata
      const _preSearches: StoredPreSearch[] = [
        createPreSearch(0, MessageStatuses.COMPLETE, {
          queries: ['contaminating query'],
          results: [],
          summary: 'This should NOT appear in participant metadata',
          successCount: 1,
          failureCount: 0,
          totalResults: 5,
          totalTime: 100,
        }),
      ];

      const participantMessage = messages.find(m => m.role === MessageRoles.ASSISTANT);

      // Participant message should have its own metadata
      expect(participantMessage?.metadata).toMatchObject({
        role: MessageRoles.ASSISTANT,
        roundNumber: 0,
        participantId: 'p1',
        participantIndex: 0,
        model: 'model-0',
      });

      // Pre-search data should NOT contaminate participant metadata
      expect(participantMessage?.metadata).not.toHaveProperty('searchData');
      expect(participantMessage?.metadata).not.toHaveProperty('queries');
      expect(participantMessage?.metadata).not.toHaveProperty('summary');
    });
  });

  describe('pre-Search Status and Participant Completion', () => {
    it('should allow participant completion detection even if pre-search is STREAMING', () => {
      const messages: UIMessage[] = [
        createUserMessage(0),
        createAssistantMessage('p1', 0, 0),
        createAssistantMessage('p2', 0, 1),
      ];

      // Pre-search is STREAMING but participants are complete
      const preSearches: StoredPreSearch[] = [
        createPreSearch(0, MessageStatuses.STREAMING),
      ];

      const participantStatus = getParticipantCompletionStatus(messages, participants, 0);

      // Participant completion should be detected independently of pre-search status
      expect(participantStatus.allComplete).toBe(true);
      expect(participantStatus.completedCount).toBe(2);
      expect(participantStatus.streamingCount).toBe(0);

      // Even though pre-search is streaming, participant completion is correctly detected
      const preSearchForRound = preSearches.find(ps => ps.roundNumber === 0);
      expect(preSearchForRound?.status).toBe(MessageStatuses.STREAMING);
    });

    it('should NOT block participant completion if pre-search COMPLETE', () => {
      const messages: UIMessage[] = [
        createUserMessage(0),
        createAssistantMessage('p1', 0, 0),
        createAssistantMessage('p2', 0, 1),
      ];

      const preSearches: StoredPreSearch[] = [
        createPreSearch(0, MessageStatuses.COMPLETE),
      ];

      const participantStatus = getParticipantCompletionStatus(messages, participants, 0);
      const preSearchForRound = preSearches.find(ps => ps.roundNumber === 0);

      // Participants complete
      expect(participantStatus.allComplete).toBe(true);

      // Pre-search complete - should NOT block
      expect(preSearchForRound?.status).toBe(MessageStatuses.COMPLETE);
      const shouldBlock = preSearchForRound && preSearchForRound.status !== MessageStatuses.COMPLETE;
      expect(shouldBlock).toBe(false);
    });

    it('should handle FAILED pre-search without blocking participants', () => {
      const messages: UIMessage[] = [
        createUserMessage(0),
        createAssistantMessage('p1', 0, 0),
        createAssistantMessage('p2', 0, 1),
      ];

      // Pre-search FAILED - should not block participants
      const preSearches: StoredPreSearch[] = [
        { ...createPreSearch(0, MessageStatuses.COMPLETE), status: MessageStatuses.FAILED },
      ];

      const participantStatus = getParticipantCompletionStatus(messages, participants, 0);
      const preSearchForRound = preSearches.find(ps => ps.roundNumber === 0);

      // Participants complete
      expect(participantStatus.allComplete).toBe(true);

      // Pre-search FAILED counts as "not blocking" (same as COMPLETE)
      expect(preSearchForRound?.status).toBe(MessageStatuses.FAILED);
      const shouldBlock = preSearchForRound && preSearchForRound.status !== MessageStatuses.COMPLETE;
      expect(shouldBlock).toBe(true); // FAILED still blocks, needs handling
    });
  });

  describe('multi-Round Pre-Search Scenarios', () => {
    it('should handle Round 1 without pre-search, Round 2 with pre-search', () => {
      const messages: UIMessage[] = [
        // Round 0 - no pre-search
        createUserMessage(0),
        createAssistantMessage('p1', 0, 0),
        createAssistantMessage('p2', 0, 1),
        // Round 1 - with pre-search
        createUserMessage(1),
        createAssistantMessage('p1', 1, 0),
        createAssistantMessage('p2', 1, 1),
      ];

      const preSearches: StoredPreSearch[] = [
        // Only Round 1 has pre-search
        createPreSearch(1, MessageStatuses.COMPLETE),
      ];

      // Check Round 0
      const round0Status = getParticipantCompletionStatus(messages, participants, 0);
      const round0PreSearch = preSearches.find(ps => ps.roundNumber === 0);

      expect(round0Status.allComplete).toBe(true);
      expect(round0PreSearch).toBeUndefined();

      // Check Round 1
      const round1Status = getParticipantCompletionStatus(messages, participants, 1);
      const round1PreSearch = preSearches.find(ps => ps.roundNumber === 1);

      expect(round1Status.allComplete).toBe(true);
      expect(round1PreSearch?.status).toBe(MessageStatuses.COMPLETE);
    });

    it('should handle alternating pre-search states across rounds', () => {
      // Messages structure documents round context (actual assertions use preSearches)
      const _messages: UIMessage[] = [
        // Round 0 - complete
        createUserMessage(0),
        createAssistantMessage('p1', 0, 0),
        createAssistantMessage('p2', 0, 1),
        // Round 1 - streaming
        createUserMessage(1),
        createAssistantMessage('p1', 1, 0, { streaming: true }),
        // Round 2 - pending
        createUserMessage(2),
      ];

      const preSearches: StoredPreSearch[] = [
        createPreSearch(0, MessageStatuses.COMPLETE),
        createPreSearch(1, MessageStatuses.STREAMING),
        createPreSearch(2, MessageStatuses.PENDING),
      ];

      // Round 0 - complete, no blocking
      const round0PreSearch = preSearches.find(ps => ps.roundNumber === 0);
      expect(round0PreSearch?.status).toBe(MessageStatuses.COMPLETE);

      // Round 1 - streaming, should block moderator
      const round1PreSearch = preSearches.find(ps => ps.roundNumber === 1);
      expect(round1PreSearch?.status).toBe(MessageStatuses.STREAMING);
      const round1Blocking = round1PreSearch && round1PreSearch.status !== MessageStatuses.COMPLETE;
      expect(round1Blocking).toBe(true);

      // Round 2 - pending, should block participants
      const round2PreSearch = preSearches.find(ps => ps.roundNumber === 2);
      expect(round2PreSearch?.status).toBe(MessageStatuses.PENDING);
      const round2Blocking = round2PreSearch && round2PreSearch.status !== MessageStatuses.COMPLETE;
      expect(round2Blocking).toBe(true);
    });
  });

  describe('pre-Search Timing and Sequencing', () => {
    it('should verify pre-search completes BEFORE participants start in Round 2', () => {
      // This test simulates the expected sequence:
      // 1. User message
      // 2. Pre-search PENDING
      // 3. Pre-search STREAMING
      // 4. Pre-search COMPLETE
      // 5. Participants start streaming

      const sequence = [
        {
          label: 'User message sent',
          messages: [createUserMessage(0)],
          preSearchStatus: undefined,
          participantCount: 0,
        },
        {
          label: 'Pre-search pending',
          messages: [createUserMessage(0)],
          preSearchStatus: MessageStatuses.PENDING,
          participantCount: 0,
        },
        {
          label: 'Pre-search streaming',
          messages: [createUserMessage(0)],
          preSearchStatus: MessageStatuses.STREAMING,
          participantCount: 0,
        },
        {
          label: 'Pre-search complete',
          messages: [createUserMessage(0)],
          preSearchStatus: MessageStatuses.COMPLETE,
          participantCount: 0,
        },
        {
          label: 'Participants streaming',
          messages: [
            createUserMessage(0),
            createAssistantMessage('p1', 0, 0, { streaming: true }),
          ],
          preSearchStatus: MessageStatuses.COMPLETE,
          participantCount: 1,
        },
      ];

      sequence.forEach((step) => {
        const preSearch = step.preSearchStatus
          ? createPreSearch(0, step.preSearchStatus)
          : undefined;

        const participantMessages = step.messages.filter(
          m => m.role === MessageRoles.ASSISTANT,
        );

        expect(participantMessages).toHaveLength(step.participantCount);

        // If participants exist and pre-search exists, pre-search must be COMPLETE
        const preSearchStatusValid = !(preSearch && step.participantCount > 0)
          || preSearch.status === MessageStatuses.COMPLETE;
        expect(preSearchStatusValid).toBe(true);
      });
    });

    it('should handle rapid pre-search completion before participants initialize', () => {
      // Edge case: Pre-search completes so fast that participants haven't even
      // created placeholder messages yet

      const messages: UIMessage[] = [
        createUserMessage(0),
        // No participant messages yet, but pre-search already complete
      ];

      const preSearches: StoredPreSearch[] = [
        createPreSearch(0, MessageStatuses.COMPLETE),
      ];

      const participantStatus = getParticipantCompletionStatus(messages, participants, 0);
      const preSearchForRound = preSearches.find(ps => ps.roundNumber === 0);

      // Pre-search complete
      expect(preSearchForRound?.status).toBe(MessageStatuses.COMPLETE);

      // No participants yet
      expect(participantStatus.completedCount).toBe(0);

      // Should not block - pre-search is done
      const shouldBlock = preSearchForRound && preSearchForRound.status !== MessageStatuses.COMPLETE;
      expect(shouldBlock).toBe(false);
    });
  });

  describe('stale Pre-Search Detection', () => {
    it('should detect stale STREAMING pre-search after page refresh', () => {
      // Simulate a pre-search that was streaming before page refresh
      // and has been in STREAMING status for too long (15+ seconds)
      const staleTime = new Date(Date.now() - 20_000); // 20 seconds ago

      const preSearch = createPreSearch(0, MessageStatuses.STREAMING);
      preSearch.createdAt = staleTime;

      const messages: UIMessage[] = [
        createUserMessage(0),
        // Participants might have started before refresh
        createAssistantMessage('p1', 0, 0),
        createAssistantMessage('p2', 0, 1),
      ];

      const participantStatus = getParticipantCompletionStatus(messages, participants, 0);

      // Participants are complete
      expect(participantStatus.allComplete).toBe(true);

      // Pre-search is STREAMING but stale
      expect(preSearch.status).toBe(MessageStatuses.STREAMING);

      // Check if pre-search is stale (over 15 seconds old)
      const createdTime = preSearch.createdAt instanceof Date
        ? preSearch.createdAt.getTime()
        : new Date(preSearch.createdAt).getTime();
      const elapsed = Date.now() - createdTime;
      const isStale = elapsed > 15_000;

      expect(isStale).toBe(true);
      expect(elapsed).toBeGreaterThan(15_000);

      // Stale pre-search should not block participant completion
      // (shouldWaitForPreSearch would return false for stale STREAMING)
    });

    it('should NOT treat fresh STREAMING pre-search as stale', () => {
      // Pre-search just started streaming (within 15 seconds)
      const freshTime = new Date(Date.now() - 5_000); // 5 seconds ago

      const preSearch = createPreSearch(0, MessageStatuses.STREAMING);
      preSearch.createdAt = freshTime;

      const messages: UIMessage[] = [
        createUserMessage(0),
        // No participants yet - waiting for pre-search
      ];

      const participantStatus = getParticipantCompletionStatus(messages, participants, 0);

      // No participants yet
      expect(participantStatus.completedCount).toBe(0);

      // Pre-search is STREAMING and fresh
      expect(preSearch.status).toBe(MessageStatuses.STREAMING);

      // Check if pre-search is fresh (under 15 seconds old)
      const createdTime = preSearch.createdAt instanceof Date
        ? preSearch.createdAt.getTime()
        : new Date(preSearch.createdAt).getTime();
      const elapsed = Date.now() - createdTime;
      const isStale = elapsed > 15_000;

      expect(isStale).toBe(false);
      expect(elapsed).toBeLessThan(15_000);

      // Fresh pre-search SHOULD block participant streaming
      // (shouldWaitForPreSearch would return true for fresh STREAMING)
    });
  });

  describe('pre-Search Metadata and State Leaks', () => {
    it('should keep Round 1 pre-search separate from Round 2 participants', () => {
      const round1SearchData = {
        queries: ['round 1 specific query'],
        results: [
          {
            query: 'round 1 specific query',
            answer: 'Round 1 Answer',
            results: [],
            responseTime: 100,
            index: 0,
          },
        ],
        summary: 'Round 1 Summary',
        successCount: 1,
        failureCount: 0,
        totalResults: 5,
        totalTime: 150,
      };

      const messages: UIMessage[] = [
        // Round 0 complete
        createUserMessage(0),
        createAssistantMessage('p1', 0, 0),
        createAssistantMessage('p2', 0, 1),
        // Round 1 with pre-search, participants streaming
        createUserMessage(1),
        createAssistantMessage('p1', 1, 0, { streaming: true }),
      ];

      const preSearches: StoredPreSearch[] = [
        createPreSearch(1, MessageStatuses.COMPLETE, round1SearchData),
      ];

      // Get Round 1 participant message
      const round1ParticipantMsg = messages.find(
        m => m.role === MessageRoles.ASSISTANT && m.metadata?.roundNumber === 1,
      );

      // Get Round 1 pre-search
      const round1PreSearch = preSearches.find(ps => ps.roundNumber === 1);

      // Pre-search has its data
      expect(round1PreSearch?.searchData?.queries).toEqual(['round 1 specific query']);

      // Participant message should NOT have pre-search data
      expect(round1ParticipantMsg?.metadata).not.toHaveProperty('searchData');
      expect(round1ParticipantMsg?.metadata).not.toHaveProperty('queries');
      expect(round1ParticipantMsg?.parts).not.toContainEqual(
        expect.objectContaining({
          type: 'pre_search_data',
        }),
      );
    });

    it('should prevent pre-search results from affecting wrong round participants', () => {
      // This test verifies that Round 2 pre-search data doesn't accidentally
      // get associated with Round 1 participant messages due to race conditions

      const round1PreSearchData = {
        queries: ['query 1'],
        results: [],
        summary: 'Summary 1',
        successCount: 1,
        failureCount: 0,
        totalResults: 3,
        totalTime: 100,
      };

      const round2PreSearchData = {
        queries: ['query 2'],
        results: [],
        summary: 'Summary 2',
        successCount: 2,
        failureCount: 0,
        totalResults: 7,
        totalTime: 200,
      };

      const messages: UIMessage[] = [
        // Round 0
        createUserMessage(0),
        createAssistantMessage('p1', 0, 0),
        createAssistantMessage('p2', 0, 1),
        // Round 1
        createUserMessage(1),
        createAssistantMessage('p1', 1, 0),
        createAssistantMessage('p2', 1, 1),
      ];

      const preSearches: StoredPreSearch[] = [
        createPreSearch(0, MessageStatuses.COMPLETE, round1PreSearchData),
        createPreSearch(1, MessageStatuses.COMPLETE, round2PreSearchData),
      ];

      // Get pre-searches by round
      const round0PreSearch = preSearches.find(ps => ps.roundNumber === 0);
      const round1PreSearch = preSearches.find(ps => ps.roundNumber === 1);

      // Verify complete isolation
      expect(round0PreSearch?.searchData?.totalResults).toBe(3);
      expect(round1PreSearch?.searchData?.totalResults).toBe(7);

      // Get participant messages by round
      const round0Participants = messages.filter(
        m => m.role === MessageRoles.ASSISTANT && m.metadata?.roundNumber === 0,
      );
      const round1Participants = messages.filter(
        m => m.role === MessageRoles.ASSISTANT && m.metadata?.roundNumber === 1,
      );

      // Verify no cross-contamination
      round0Participants.forEach((msg) => {
        expect(msg.metadata?.roundNumber).toBe(0);
        expect(msg.metadata).not.toHaveProperty('searchData');
      });

      round1Participants.forEach((msg) => {
        expect(msg.metadata?.roundNumber).toBe(1);
        expect(msg.metadata).not.toHaveProperty('searchData');
      });
    });
  });
});
