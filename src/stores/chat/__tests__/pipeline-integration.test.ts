/**
 * Pre-Search → Participant → Summary Pipeline Integration Tests
 *
 * Tests the complete data flow through all stages of a conversation round:
 * - Pre-search (web search) phase
 * - Participant streaming phase
 * - Summary generation phase
 * - State handoffs between phases
 *
 * These tests verify the pipeline orchestration and data flow integrity.
 */

import type { UIMessage } from 'ai';
import { beforeEach, describe, expect, it } from 'vitest';

import { ChatModes, FinishReasons, MessageStatuses, ScreenModes } from '@/api/core/enums';
import type { ChatParticipant, ChatThread, StoredPreSearch } from '@/api/routes/chat/schema';
import {
  createMockParticipant,
  createMockPreSearch as createMockPreSearchBase,
  createMockThread as createMockThreadBase,
} from '@/lib/testing/api-mocks';
import { getStoreState } from '@/lib/testing/chat-store-helpers';
import {
  createTestAssistantMessage,
  createTestUserMessage,
} from '@/lib/testing/helpers';

import { createChatStore } from '../store';

// ============================================================================
// TEST HELPERS - Use shared helpers with test-specific defaults
// ============================================================================

function createMockThread(overrides?: Partial<ChatThread>): ChatThread {
  return createMockThreadBase({
    id: 'thread-pipeline-123',
    title: 'Pipeline Test Thread',
    slug: 'pipeline-test-thread',
    mode: ChatModes.ANALYZING,
    enableWebSearch: true,
    ...overrides,
  });
}

function createMockParticipants(count: number): ChatParticipant[] {
  const models = ['gpt-4o', 'claude-3-opus', 'gemini-pro'];
  return Array.from({ length: count }, (_, i) =>
    createMockParticipant({
      id: `participant-${i}`,
      threadId: 'thread-pipeline-123',
      modelId: models[i % models.length] as string,
      role: `Expert ${i}`,
      priority: i,
    }));
}

function createMockPreSearch(
  roundNumber: number,
  status: typeof MessageStatuses[keyof typeof MessageStatuses],
  hasData = false,
): StoredPreSearch {
  return {
    ...createMockPreSearchBase({
      id: `presearch-${roundNumber}`,
      threadId: 'thread-pipeline-123',
      roundNumber,
    }),
    status,
    userQuery: `Search query for round ${roundNumber}`,
    searchData: hasData
      ? {
          queries: [{ query: 'test', rationale: 'test', searchDepth: 'basic', index: 0, total: 1 }],
          results: [{
            query: 'test',
            answer: 'test answer',
            results: [{ title: 'Result', url: 'https://example.com', content: 'Content', score: 0.9 }],
            responseTime: 1000,
          }],
          summary: 'Search summary',
          successCount: 1,
          failureCount: 0,
          totalResults: 1,
          totalTime: 1000,
        }
      : undefined,
    errorMessage: null,
    completedAt: status === MessageStatuses.COMPLETE ? new Date() : null,
  } as StoredPreSearch;
}

function createRoundMessages(roundNumber: number, participantCount: number): UIMessage[] {
  const messages: UIMessage[] = [
    createTestUserMessage({
      id: `thread-pipeline-123_r${roundNumber}_user`,
      content: `Question for round ${roundNumber}`,
      roundNumber,
    }),
  ];

  for (let i = 0; i < participantCount; i++) {
    messages.push(
      createTestAssistantMessage({
        id: `thread-pipeline-123_r${roundNumber}_p${i}`,
        content: `Response from participant ${i} for round ${roundNumber}`,
        roundNumber,
        participantId: `participant-${i}`,
        participantIndex: i,
        finishReason: FinishReasons.STOP,
      }),
    );
  }

  return messages;
}

// ============================================================================
// PIPELINE PHASE TESTS
// ============================================================================

describe('pipeline Phase Transitions', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    const state = getStoreState(store);
    state.setThread(createMockThread({ enableWebSearch: true }));
    state.setParticipants(createMockParticipants(2));
    state.setScreenMode(ScreenModes.THREAD);
    state.setEnableWebSearch(true);
    state.setShowInitialUI(false);
  });

  describe('pre-Search Phase', () => {
    it('pre-search pending blocks participant streaming', () => {
      const state = getStoreState(store);

      const pendingPreSearch = createMockPreSearch(0, MessageStatuses.PENDING);
      state.addPreSearch(pendingPreSearch);

      // Pre-search is pending
      expect(getStoreState(store).preSearches[0]!.status).toBe(MessageStatuses.PENDING);

      // Streaming should not start yet (controlled by orchestrator)
      expect(getStoreState(store).isStreaming).toBe(false);
    });

    it('pre-search streaming shows activity', () => {
      const state = getStoreState(store);

      const streamingPreSearch = createMockPreSearch(0, MessageStatuses.STREAMING);
      state.addPreSearch(streamingPreSearch);

      expect(getStoreState(store).preSearches[0]!.status).toBe(MessageStatuses.STREAMING);
    });

    it('pre-search complete allows participant streaming', () => {
      const state = getStoreState(store);

      const completePreSearch = createMockPreSearch(0, MessageStatuses.COMPLETE, true);
      state.addPreSearch(completePreSearch);

      expect(getStoreState(store).preSearches[0]!.status).toBe(MessageStatuses.COMPLETE);
      expect(getStoreState(store).preSearches[0]!.searchData).toBeDefined();

      // Now participant streaming can start
      state.setIsStreaming(true);
      expect(getStoreState(store).isStreaming).toBe(true);
    });
  });

  describe('participant Streaming Phase', () => {
    it('tracks current participant index during streaming', () => {
      const state = getStoreState(store);

      state.setIsStreaming(true);
      state.setStreamingRoundNumber(0);
      state.setCurrentParticipantIndex(0);

      expect(getStoreState(store).isStreaming).toBe(true);
      expect(getStoreState(store).currentParticipantIndex).toBe(0);

      // Advance to next participant
      state.setCurrentParticipantIndex(1);
      expect(getStoreState(store).currentParticipantIndex).toBe(1);
    });

    it('all participants complete enables summary phase', () => {
      const state = getStoreState(store);

      const round0Messages = createRoundMessages(0, 2);
      state.setMessages(round0Messages);

      // All participants done
      state.setIsStreaming(false);

      // Can now create summary
      state.createPendingSummary({
        roundNumber: 0,
        messages: round0Messages,
        userQuestion: 'Question for round 0',
        threadId: 'thread-pipeline-123',
        mode: ChatModes.ANALYZING,
      });

      expect(getStoreState(store).summaries).toHaveLength(1);
    });
  });

  describe('summary Phase', () => {
    it('summary uses participant messages from correct round', () => {
      const state = getStoreState(store);

      const round0Messages = createRoundMessages(0, 2);
      const round1Messages = createRoundMessages(1, 2);
      state.setMessages([...round0Messages, ...round1Messages]);

      // Create summary for round 0 only
      state.createPendingSummary({
        roundNumber: 0,
        messages: [...round0Messages, ...round1Messages],
        userQuestion: 'Question for round 0',
        threadId: 'thread-pipeline-123',
        mode: ChatModes.ANALYZING,
      });

      // Should only have round 0 participant message IDs
      const summary = getStoreState(store).summaries[0]!;
      expect(summary.participantMessageIds).toHaveLength(2);
      expect(summary.participantMessageIds[0]).toContain('_r0_');
      expect(summary.participantMessageIds[1]).toContain('_r0_');
    });

    it('summary completion marks round as finished', () => {
      const state = getStoreState(store);

      const round0Messages = createRoundMessages(0, 2);
      state.setMessages(round0Messages);

      state.createPendingSummary({
        roundNumber: 0,
        messages: round0Messages,
        userQuestion: 'Q',
        threadId: 'thread-pipeline-123',
        mode: ChatModes.ANALYZING,
      });

      state.updateSummaryStatus(0, MessageStatuses.STREAMING);
      state.updateSummaryStatus(0, MessageStatuses.COMPLETE);

      expect(getStoreState(store).summaries[0]!.status).toBe(MessageStatuses.COMPLETE);
    });
  });
});

// ============================================================================
// DATA FLOW TESTS
// ============================================================================

describe('pipeline Data Flow', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    const state = getStoreState(store);
    state.setThread(createMockThread());
    state.setParticipants(createMockParticipants(3));
    state.setScreenMode(ScreenModes.THREAD);
  });

  it('pre-search data available to participants', () => {
    const state = getStoreState(store);

    // Pre-search completes with data
    const preSearch = createMockPreSearch(0, MessageStatuses.COMPLETE, true);
    state.addPreSearch(preSearch);

    // Data is accessible
    const storedPreSearch = getStoreState(store).preSearches[0]!;
    expect(storedPreSearch.searchData).toBeDefined();
    expect(storedPreSearch.searchData!.results).toHaveLength(1);
    expect(storedPreSearch.searchData!.summary).toBe('Search summary');
  });

  it('participant messages feed into summary', () => {
    const state = getStoreState(store);

    const round0Messages = createRoundMessages(0, 3);
    state.setMessages(round0Messages);

    state.createPendingSummary({
      roundNumber: 0,
      messages: round0Messages,
      userQuestion: 'Question for round 0',
      threadId: 'thread-pipeline-123',
      mode: ChatModes.ANALYZING,
    });

    // Summary has reference to all 3 participant messages
    expect(getStoreState(store).summaries[0]!.participantMessageIds).toHaveLength(3);
  });

  it('userQuestion preserved through pipeline', () => {
    const state = getStoreState(store);

    const userQuestion = 'What is the meaning of life?';
    const round0Messages = [
      createTestUserMessage({
        id: 'user-msg',
        content: userQuestion,
        roundNumber: 0,
      }),
      createTestAssistantMessage({
        id: 'p0-msg',
        content: 'Response',
        roundNumber: 0,
        participantId: 'participant-0',
        participantIndex: 0,
        finishReason: FinishReasons.STOP,
      }),
    ];
    state.setMessages(round0Messages);

    state.createPendingSummary({
      roundNumber: 0,
      messages: round0Messages,
      userQuestion,
      threadId: 'thread-pipeline-123',
      mode: ChatModes.ANALYZING,
    });

    expect(getStoreState(store).summaries[0]!.userQuestion).toBe(userQuestion);
  });
});

// ============================================================================
// MULTI-ROUND PIPELINE TESTS
// ============================================================================

describe('multi-Round Pipeline', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    const state = getStoreState(store);
    state.setThread(createMockThread());
    state.setParticipants(createMockParticipants(2));
    state.setScreenMode(ScreenModes.THREAD);
  });

  it('each round has independent pipeline data', () => {
    const state = getStoreState(store);

    // Round 0 pipeline
    const preSearch0 = createMockPreSearch(0, MessageStatuses.COMPLETE, true);
    state.addPreSearch(preSearch0);

    const round0Messages = createRoundMessages(0, 2);
    state.setMessages(round0Messages);

    state.createPendingSummary({
      roundNumber: 0,
      messages: round0Messages,
      userQuestion: 'Q0',
      threadId: 'thread-pipeline-123',
      mode: ChatModes.ANALYZING,
    });
    state.updateSummaryStatus(0, MessageStatuses.COMPLETE);

    // Round 1 pipeline
    const preSearch1 = createMockPreSearch(1, MessageStatuses.COMPLETE, true);
    state.addPreSearch(preSearch1);

    const round1Messages = createRoundMessages(1, 2);
    state.setMessages([...round0Messages, ...round1Messages]);

    state.createPendingSummary({
      roundNumber: 1,
      messages: [...round0Messages, ...round1Messages],
      userQuestion: 'Q1',
      threadId: 'thread-pipeline-123',
      mode: ChatModes.ANALYZING,
    });
    state.updateSummaryStatus(1, MessageStatuses.COMPLETE);

    // Verify independence
    expect(getStoreState(store).preSearches).toHaveLength(2);
    expect(getStoreState(store).preSearches[0]!.roundNumber).toBe(0);
    expect(getStoreState(store).preSearches[1]!.roundNumber).toBe(1);

    expect(getStoreState(store).summaries).toHaveLength(2);
    expect(getStoreState(store).summaries[0]!.roundNumber).toBe(0);
    expect(getStoreState(store).summaries[1]!.roundNumber).toBe(1);
  });

  it('round 1 can access round 0 context', () => {
    const state = getStoreState(store);

    // Complete round 0
    const round0Messages = createRoundMessages(0, 2);
    state.setMessages(round0Messages);
    state.createPendingSummary({
      roundNumber: 0,
      messages: round0Messages,
      userQuestion: 'Q0',
      threadId: 'thread-pipeline-123',
      mode: ChatModes.ANALYZING,
    });

    // Round 1 has access to round 0 messages
    const round1Messages = createRoundMessages(1, 2);
    state.setMessages([...round0Messages, ...round1Messages]);

    // All messages accessible
    expect(getStoreState(store).messages).toHaveLength(6); // 3 + 3
  });
});

// ============================================================================
// PIPELINE DEDUPLICATION TESTS
// ============================================================================

describe('pipeline Deduplication', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    const state = getStoreState(store);
    state.setThread(createMockThread());
    state.setParticipants(createMockParticipants(2));
    state.setScreenMode(ScreenModes.THREAD);
  });

  it('pre-search not duplicated on repeated add', () => {
    const state = getStoreState(store);

    const preSearch = createMockPreSearch(0, MessageStatuses.STREAMING);
    state.addPreSearch(preSearch);
    state.addPreSearch(preSearch); // Duplicate

    expect(getStoreState(store).preSearches).toHaveLength(1);
  });

  it('summary creation atomic prevents duplicates', () => {
    const state = getStoreState(store);

    const round0Messages = createRoundMessages(0, 2);
    state.setMessages(round0Messages);

    // First attempt
    expect(state.tryMarkSummaryCreated(0)).toBe(true);
    state.createPendingSummary({
      roundNumber: 0,
      messages: round0Messages,
      userQuestion: 'Q',
      threadId: 'thread-pipeline-123',
      mode: ChatModes.ANALYZING,
    });

    // Second attempt blocked
    expect(state.tryMarkSummaryCreated(0)).toBe(false);

    // Only one summary exists
    expect(getStoreState(store).summaries).toHaveLength(1);
  });

  it('pre-search trigger tracking prevents duplicates', () => {
    const state = getStoreState(store);

    expect(state.hasPreSearchBeenTriggered(0)).toBe(false);
    state.markPreSearchTriggered(0);
    expect(state.hasPreSearchBeenTriggered(0)).toBe(true);

    // Already triggered - caller should check this before triggering
    expect(state.hasPreSearchBeenTriggered(0)).toBe(true);
  });
});

// ============================================================================
// COMPLETE PIPELINE JOURNEY TEST
// ============================================================================

describe('complete Pipeline Journey', () => {
  it('full round with web search: pre-search → participants → summary', () => {
    const store = createChatStore();
    const state = getStoreState(store);

    // === SETUP ===
    state.setThread(createMockThread({ enableWebSearch: true }));
    state.setParticipants(createMockParticipants(2));
    state.setScreenMode(ScreenModes.THREAD);
    state.setEnableWebSearch(true);
    state.setShowInitialUI(false);

    // === PHASE 1: Pre-Search ===
    // Trigger pre-search
    state.markPreSearchTriggered(0);
    expect(getStoreState(store).triggeredPreSearchRounds.has(0)).toBe(true);

    // Pre-search starts streaming
    const pendingPreSearch = createMockPreSearch(0, MessageStatuses.PENDING);
    state.addPreSearch(pendingPreSearch);
    expect(getStoreState(store).preSearches[0]!.status).toBe(MessageStatuses.PENDING);

    // Pre-search completes with data
    state.updatePreSearchData(0, {
      queries: [{ query: 'AI trends 2024', rationale: 'User question', searchDepth: 'basic', index: 0, total: 1 }],
      results: [{
        query: 'AI trends 2024',
        answer: 'AI has seen major advances...',
        results: [
          { title: 'AI in 2024', url: 'https://example.com/ai', content: 'Article content', score: 0.95 },
        ],
        responseTime: 1200,
      }],
      summary: 'The search reveals significant AI developments in 2024.',
      successCount: 1,
      failureCount: 0,
      totalResults: 1,
      totalTime: 1200,
    });
    expect(getStoreState(store).preSearches[0]!.status).toBe(MessageStatuses.COMPLETE);
    expect(getStoreState(store).preSearches[0]!.searchData!.summary).toContain('AI developments');

    // === PHASE 2: Participant Streaming ===
    state.setIsStreaming(true);
    state.setStreamingRoundNumber(0);
    state.setCurrentParticipantIndex(0);

    // Add user message
    const userMessage = createTestUserMessage({
      id: 'thread-pipeline-123_r0_user',
      content: 'What are the latest AI trends?',
      roundNumber: 0,
    });
    state.setMessages([userMessage]);

    // Participant 0 streams and completes
    const p0Message = createTestAssistantMessage({
      id: 'thread-pipeline-123_r0_p0',
      content: 'Based on recent developments, AI has made significant strides in...',
      roundNumber: 0,
      participantId: 'participant-0',
      participantIndex: 0,
      finishReason: FinishReasons.STOP,
    });
    state.setMessages([userMessage, p0Message]);
    state.setCurrentParticipantIndex(1);

    // Participant 1 streams and completes
    const p1Message = createTestAssistantMessage({
      id: 'thread-pipeline-123_r0_p1',
      content: 'I would add that the transformer architecture has enabled...',
      roundNumber: 0,
      participantId: 'participant-1',
      participantIndex: 1,
      finishReason: FinishReasons.STOP,
    });
    state.setMessages([userMessage, p0Message, p1Message]);

    // All participants done
    expect(getStoreState(store).messages).toHaveLength(3);

    // === PHASE 3: Summary ===
    // Complete streaming
    state.completeStreaming();
    expect(getStoreState(store).isStreaming).toBe(false);

    // Atomic summary creation check
    expect(state.tryMarkSummaryCreated(0)).toBe(true);

    // Create pending summary
    state.createPendingSummary({
      roundNumber: 0,
      messages: [userMessage, p0Message, p1Message],
      userQuestion: 'What are the latest AI trends?',
      threadId: 'thread-pipeline-123',
      mode: ChatModes.ANALYZING,
    });
    expect(getStoreState(store).summaries).toHaveLength(1);
    expect(getStoreState(store).summaries[0]!.status).toBe(MessageStatuses.PENDING);

    // Summary starts streaming
    state.setIsCreatingSummary(true);
    state.updateSummaryStatus(0, MessageStatuses.STREAMING);
    expect(getStoreState(store).summaries[0]!.status).toBe(MessageStatuses.STREAMING);

    // Summary completes
    state.updateSummaryStatus(0, MessageStatuses.COMPLETE);
    state.setIsCreatingSummary(false);

    // === VERIFY FINAL STATE ===
    const finalState = getStoreState(store);

    // Pre-search complete with data
    expect(finalState.preSearches).toHaveLength(1);
    expect(finalState.preSearches[0]!.status).toBe(MessageStatuses.COMPLETE);
    expect(finalState.preSearches[0]!.searchData).toBeDefined();

    // All messages present
    expect(finalState.messages).toHaveLength(3);

    // Summary complete
    expect(finalState.summaries).toHaveLength(1);
    expect(finalState.summaries[0]!.status).toBe(MessageStatuses.COMPLETE);
    expect(finalState.summaries[0]!.participantMessageIds).toHaveLength(2);

    // Tracking state correct
    expect(finalState.triggeredPreSearchRounds.has(0)).toBe(true);
    expect(finalState.createdSummaryRounds.has(0)).toBe(true);

    // Flags cleared
    expect(finalState.isStreaming).toBe(false);
    expect(finalState.isCreatingSummary).toBe(false);
  });

  it('pipeline without web search: participants → summary', () => {
    const store = createChatStore();
    const state = getStoreState(store);

    // === SETUP ===
    state.setThread(createMockThread({ enableWebSearch: false }));
    state.setParticipants(createMockParticipants(2));
    state.setScreenMode(ScreenModes.THREAD);
    state.setEnableWebSearch(false);
    state.setShowInitialUI(false);

    // === NO PRE-SEARCH ===
    expect(getStoreState(store).preSearches).toHaveLength(0);

    // === PHASE 1: Participant Streaming ===
    state.setIsStreaming(true);
    state.setStreamingRoundNumber(0);

    const round0Messages = createRoundMessages(0, 2);
    state.setMessages(round0Messages);
    state.completeStreaming();

    // === PHASE 2: Summary ===
    state.tryMarkSummaryCreated(0);
    state.createPendingSummary({
      roundNumber: 0,
      messages: round0Messages,
      userQuestion: 'Question for round 0',
      threadId: 'thread-pipeline-123',
      mode: ChatModes.ANALYZING,
    });
    state.updateSummaryStatus(0, MessageStatuses.COMPLETE);

    // === VERIFY ===
    const finalState = getStoreState(store);
    expect(finalState.preSearches).toHaveLength(0); // No pre-search
    expect(finalState.messages).toHaveLength(3);
    expect(finalState.summaries).toHaveLength(1);
    expect(finalState.summaries[0]!.status).toBe(MessageStatuses.COMPLETE);
  });
});

// ============================================================================
// PIPELINE INTERRUPTION TESTS
// ============================================================================

describe('pipeline Interruption Handling', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    const state = getStoreState(store);
    state.setThread(createMockThread());
    state.setParticipants(createMockParticipants(2));
    state.setScreenMode(ScreenModes.THREAD);
  });

  it('stop during pre-search skips to ready state', () => {
    const state = getStoreState(store);

    // Pre-search starts
    state.markPreSearchTriggered(0);
    const pendingPreSearch = createMockPreSearch(0, MessageStatuses.STREAMING);
    state.addPreSearch(pendingPreSearch);

    // User stops (simulated by not completing pre-search)
    // Pre-search stays in streaming state
    expect(getStoreState(store).preSearches[0]!.status).toBe(MessageStatuses.STREAMING);

    // Participant streaming can still be started (bypass pre-search)
    state.setIsStreaming(true);
    expect(getStoreState(store).isStreaming).toBe(true);
  });

  it('stop during participants preserves completed messages', () => {
    const state = getStoreState(store);

    state.setIsStreaming(true);
    state.setStreamingRoundNumber(0);

    // Participant 0 completes
    const messages: UIMessage[] = [
      createTestUserMessage({ id: 'user', content: 'Q', roundNumber: 0 }),
      createTestAssistantMessage({
        id: 'p0',
        content: 'Complete response',
        roundNumber: 0,
        participantId: 'participant-0',
        participantIndex: 0,
        finishReason: FinishReasons.STOP,
      }),
    ];
    state.setMessages(messages);
    state.setCurrentParticipantIndex(1);

    // User stops during participant 1
    state.completeStreaming();

    // Participant 0's message preserved
    expect(getStoreState(store).messages).toHaveLength(2);
    expect(getStoreState(store).isStreaming).toBe(false);
  });

  it('navigation clears entire pipeline state', () => {
    const state = getStoreState(store);

    // Build up pipeline state
    const preSearch = createMockPreSearch(0, MessageStatuses.COMPLETE, true);
    state.addPreSearch(preSearch);

    const round0Messages = createRoundMessages(0, 2);
    state.setMessages(round0Messages);

    state.createPendingSummary({
      roundNumber: 0,
      messages: round0Messages,
      userQuestion: 'Q',
      threadId: 'thread-pipeline-123',
      mode: ChatModes.ANALYZING,
    });

    expect(getStoreState(store).preSearches).toHaveLength(1);
    expect(getStoreState(store).messages).toHaveLength(3);
    expect(getStoreState(store).summaries).toHaveLength(1);

    // Navigate away
    state.resetForThreadNavigation();

    // All cleared
    expect(getStoreState(store).preSearches).toEqual([]);
    expect(getStoreState(store).messages).toEqual([]);
    expect(getStoreState(store).summaries).toEqual([]);
    expect(getStoreState(store).triggeredPreSearchRounds.size).toBe(0);
    expect(getStoreState(store).createdSummaryRounds.size).toBe(0);
  });
});
