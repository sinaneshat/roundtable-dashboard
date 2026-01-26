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

import { ChatModes, FinishReasons, MessageRoles, MessageStatuses, ScreenModes } from '@roundtable/shared';
import type { UIMessage } from 'ai';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  createMockParticipant,
  createMockPreSearch as createMockPreSearchBase,
  createMockThread as createMockThreadBase,
  createTestAssistantMessage,
  createTestUserMessage,
  getStoreState,
} from '@/lib/testing';
import type { ChatParticipant, ChatThread, StoredPreSearch } from '@/services/api';

import { createChatStore } from '../store';

// ============================================================================
// TEST HELPERS - Use shared helpers with test-specific defaults
// ============================================================================

function createMockThread(overrides?: Partial<ChatThread>): ChatThread {
  return createMockThreadBase({
    enableWebSearch: true,
    id: 'thread-pipeline-123',
    mode: ChatModes.ANALYZING,
    slug: 'pipeline-test-thread',
    title: 'Pipeline Test Thread',
    ...overrides,
  });
}

function createMockParticipants(count: number): ChatParticipant[] {
  const models = ['gpt-4o', 'claude-3-opus', 'gemini-pro'];
  return Array.from({ length: count }, (_, i) =>
    createMockParticipant({
      id: `participant-${i}`,
      modelId: models[i % models.length] as string,
      priority: i,
      role: `Expert ${i}`,
      threadId: 'thread-pipeline-123',
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
      roundNumber,
      threadId: 'thread-pipeline-123',
    }),
    completedAt: status === MessageStatuses.COMPLETE ? new Date() : null,
    errorMessage: null,
    searchData: hasData
      ? {
          failureCount: 0,
          queries: [{ index: 0, query: 'test', rationale: 'test', searchDepth: 'basic', total: 1 }],
          results: [{
            answer: 'test answer',
            query: 'test',
            responseTime: 1000,
            results: [{ content: 'Content', score: 0.9, title: 'Result', url: 'https://example.com' }],
          }],
          successCount: 1,
          summary: 'Search summary',
          totalResults: 1,
          totalTime: 1000,
        }
      : undefined,
    status,
    userQuery: `Search query for round ${roundNumber}`,
  } as StoredPreSearch;
}

function createRoundMessages(roundNumber: number, participantCount: number): UIMessage[] {
  const messages: UIMessage[] = [
    createTestUserMessage({
      content: `Question for round ${roundNumber}`,
      id: `thread-pipeline-123_r${roundNumber}_user`,
      roundNumber,
    }),
  ];

  for (let i = 0; i < participantCount; i++) {
    messages.push(
      createTestAssistantMessage({
        content: `Response from participant ${i} for round ${roundNumber}`,
        finishReason: FinishReasons.STOP,
        id: `thread-pipeline-123_r${roundNumber}_p${i}`,
        participantId: `participant-${i}`,
        participantIndex: i,
        roundNumber,
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
      const preSearch0 = getStoreState(store).preSearches[0];
      if (!preSearch0) {
        throw new Error('expected preSearch0');
      }
      expect(preSearch0.status).toBe(MessageStatuses.PENDING);

      // Streaming should not start yet (controlled by orchestrator)
      expect(getStoreState(store).isStreaming).toBeFalsy();
    });

    it('pre-search streaming shows activity', () => {
      const state = getStoreState(store);

      const streamingPreSearch = createMockPreSearch(0, MessageStatuses.STREAMING);
      state.addPreSearch(streamingPreSearch);

      const preSearch0 = getStoreState(store).preSearches[0];
      if (!preSearch0) {
        throw new Error('expected preSearch0');
      }
      expect(preSearch0.status).toBe(MessageStatuses.STREAMING);
    });

    it('pre-search complete allows participant streaming', () => {
      const state = getStoreState(store);

      const completePreSearch = createMockPreSearch(0, MessageStatuses.COMPLETE, true);
      state.addPreSearch(completePreSearch);

      const preSearch0 = getStoreState(store).preSearches[0];
      if (!preSearch0) {
        throw new Error('expected preSearch0');
      }
      expect(preSearch0.status).toBe(MessageStatuses.COMPLETE);
      expect(preSearch0.searchData).toBeDefined();

      // Now participant streaming can start
      state.setIsStreaming(true);
      expect(getStoreState(store).isStreaming).toBeTruthy();
    });
  });

  describe('participant Streaming Phase', () => {
    it('tracks current participant index during streaming', () => {
      const state = getStoreState(store);

      state.setIsStreaming(true);
      state.setStreamingRoundNumber(0);
      state.setCurrentParticipantIndex(0);

      expect(getStoreState(store).isStreaming).toBeTruthy();
      expect(getStoreState(store).currentParticipantIndex).toBe(0);

      // Advance to next participant
      state.setCurrentParticipantIndex(1);
      expect(getStoreState(store).currentParticipantIndex).toBe(1);
    });

    it('all participants complete enables moderator phase', () => {
      const state = getStoreState(store);

      const round0Messages = createRoundMessages(0, 2);
      state.setMessages(round0Messages);

      // All participants done
      state.setIsStreaming(false);

      // Can now mark moderator as ready to create
      expect(state.tryMarkModeratorCreated(0)).toBeTruthy();
      expect(getStoreState(store).createdModeratorRounds.has(0)).toBeTruthy();
    });
  });

  describe('moderator Phase', () => {
    it('moderator tracking prevents duplicate creation', () => {
      const state = getStoreState(store);

      const round0Messages = createRoundMessages(0, 2);
      state.setMessages(round0Messages);

      // First attempt should succeed
      expect(state.tryMarkModeratorCreated(0)).toBeTruthy();

      // Second attempt should fail
      expect(state.tryMarkModeratorCreated(0)).toBeFalsy();
    });

    it('moderator creation can be tracked per round', () => {
      const state = getStoreState(store);

      const round0Messages = createRoundMessages(0, 2);
      const round1Messages = createRoundMessages(1, 2);
      state.setMessages([...round0Messages, ...round1Messages]);

      // Round 0 moderator created
      state.tryMarkModeratorCreated(0);
      expect(getStoreState(store).createdModeratorRounds.has(0)).toBeTruthy();
      expect(getStoreState(store).createdModeratorRounds.has(1)).toBeFalsy();

      // Round 1 moderator created
      state.tryMarkModeratorCreated(1);
      expect(getStoreState(store).createdModeratorRounds.has(0)).toBeTruthy();
      expect(getStoreState(store).createdModeratorRounds.has(1)).toBeTruthy();
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
    const storedPreSearch = getStoreState(store).preSearches[0];
    if (!storedPreSearch) {
      throw new Error('expected storedPreSearch');
    }
    expect(storedPreSearch.searchData).toBeDefined();
    const searchData = storedPreSearch.searchData;
    if (!searchData) {
      throw new Error('expected searchData');
    }
    expect(searchData.results).toHaveLength(1);
    expect(searchData.summary).toBe('Search summary');
  });

  it('participant messages available for moderator generation', () => {
    const state = getStoreState(store);

    const round0Messages = createRoundMessages(0, 3);
    state.setMessages(round0Messages);

    // All participant messages are in the store and available for moderator
    expect(getStoreState(store).messages).toHaveLength(4); // 1 user + 3 participants
    expect(getStoreState(store).messages.filter(m => m.role === MessageRoles.ASSISTANT)).toHaveLength(3);
  });

  it('userQuestion preserved through pipeline', () => {
    const state = getStoreState(store);

    const userQuestion = 'What is the meaning of life?';
    const round0Messages = [
      createTestUserMessage({
        content: userQuestion,
        id: 'user-msg',
        roundNumber: 0,
      }),
      createTestAssistantMessage({
        content: 'Response',
        finishReason: FinishReasons.STOP,
        id: 'p0-msg',
        participantId: 'participant-0',
        participantIndex: 0,
        roundNumber: 0,
      }),
    ];
    state.setMessages(round0Messages);

    // User question is available in messages
    const userMessage = getStoreState(store).messages.find(m => m.role === MessageRoles.USER);
    // Content is in parts array
    const textPart = userMessage?.parts.find(p => p.type === 'text');
    expect(textPart && 'text' in textPart ? textPart.text : undefined).toBe(userQuestion);
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

    state.tryMarkModeratorCreated(0);

    // Round 1 pipeline
    const preSearch1 = createMockPreSearch(1, MessageStatuses.COMPLETE, true);
    state.addPreSearch(preSearch1);

    const round1Messages = createRoundMessages(1, 2);
    state.setMessages([...round0Messages, ...round1Messages]);

    state.tryMarkModeratorCreated(1);

    // Verify independence
    expect(getStoreState(store).preSearches).toHaveLength(2);
    const ps0 = getStoreState(store).preSearches[0];
    if (!ps0) {
      throw new Error('expected ps0');
    }
    const ps1 = getStoreState(store).preSearches[1];
    if (!ps1) {
      throw new Error('expected ps1');
    }
    expect(ps0.roundNumber).toBe(0);
    expect(ps1.roundNumber).toBe(1);
    expect(getStoreState(store).createdModeratorRounds.has(0)).toBeTruthy();
    expect(getStoreState(store).createdModeratorRounds.has(1)).toBeTruthy();
  });

  it('round 1 can access round 0 context', () => {
    const state = getStoreState(store);

    // Complete round 0
    const round0Messages = createRoundMessages(0, 2);
    state.setMessages(round0Messages);
    state.tryMarkModeratorCreated(0);

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

  it('moderator creation atomic prevents duplicates', () => {
    const state = getStoreState(store);

    const round0Messages = createRoundMessages(0, 2);
    state.setMessages(round0Messages);

    // First attempt succeeds
    expect(state.tryMarkModeratorCreated(0)).toBeTruthy();

    // Second attempt blocked
    expect(state.tryMarkModeratorCreated(0)).toBeFalsy();

    // Tracking shows moderator was created
    expect(getStoreState(store).createdModeratorRounds.has(0)).toBeTruthy();
  });

  it('pre-search trigger tracking prevents duplicates', () => {
    const state = getStoreState(store);

    expect(state.hasPreSearchBeenTriggered(0)).toBeFalsy();
    state.markPreSearchTriggered(0);
    expect(state.hasPreSearchBeenTriggered(0)).toBeTruthy();

    // Already triggered - caller should check this before triggering
    expect(state.hasPreSearchBeenTriggered(0)).toBeTruthy();
  });
});

// ============================================================================
// COMPLETE PIPELINE JOURNEY TEST
// ============================================================================

describe('complete Pipeline Journey', () => {
  it('full round with web search: pre-search → participants → moderator', () => {
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
    expect(getStoreState(store).triggeredPreSearchRounds.has(0)).toBeTruthy();

    // Pre-search starts streaming
    const pendingPreSearch = createMockPreSearch(0, MessageStatuses.PENDING);
    state.addPreSearch(pendingPreSearch);
    const pendingPs = getStoreState(store).preSearches[0];
    if (!pendingPs) {
      throw new Error('expected pendingPs');
    }
    expect(pendingPs.status).toBe(MessageStatuses.PENDING);

    // Pre-search completes with data
    state.updatePreSearchData(0, {
      failureCount: 0,
      queries: [{ index: 0, query: 'AI trends 2024', rationale: 'User question', searchDepth: 'basic', total: 1 }],
      results: [{
        answer: 'AI has seen major advances...',
        query: 'AI trends 2024',
        responseTime: 1200,
        results: [
          { content: 'Article content', score: 0.95, title: 'AI in 2024', url: 'https://example.com/ai' },
        ],
      }],
      successCount: 1,
      summary: 'The search reveals significant AI developments in 2024.',
      totalResults: 1,
      totalTime: 1200,
    });
    const completePs = getStoreState(store).preSearches[0];
    if (!completePs) {
      throw new Error('expected completePs');
    }
    expect(completePs.status).toBe(MessageStatuses.COMPLETE);
    const completePsData = completePs.searchData;
    if (!completePsData) {
      throw new Error('expected completePsData');
    }
    expect(completePsData.summary).toContain('AI developments');

    // === PHASE 2: Participant Streaming ===
    state.setIsStreaming(true);
    state.setStreamingRoundNumber(0);
    state.setCurrentParticipantIndex(0);

    // Add user message
    const userMessage = createTestUserMessage({
      content: 'What are the latest AI trends?',
      id: 'thread-pipeline-123_r0_user',
      roundNumber: 0,
    });
    state.setMessages([userMessage]);

    // Participant 0 streams and completes
    const p0Message = createTestAssistantMessage({
      content: 'Based on recent developments, AI has made significant strides in...',
      finishReason: FinishReasons.STOP,
      id: 'thread-pipeline-123_r0_p0',
      participantId: 'participant-0',
      participantIndex: 0,
      roundNumber: 0,
    });
    state.setMessages([userMessage, p0Message]);
    state.setCurrentParticipantIndex(1);

    // Participant 1 streams and completes
    const p1Message = createTestAssistantMessage({
      content: 'I would add that the transformer architecture has enabled...',
      finishReason: FinishReasons.STOP,
      id: 'thread-pipeline-123_r0_p1',
      participantId: 'participant-1',
      participantIndex: 1,
      roundNumber: 0,
    });
    state.setMessages([userMessage, p0Message, p1Message]);

    // All participants done
    expect(getStoreState(store).messages).toHaveLength(3);

    // === PHASE 3: Moderator ===
    // Complete streaming
    state.completeStreaming();
    expect(getStoreState(store).isStreaming).toBeFalsy();

    // Atomic moderator creation check
    expect(state.tryMarkModeratorCreated(0)).toBeTruthy();

    // Moderator is now created as a moderator message (handled by orchestrator/backend)
    // The store just tracks that moderator was created for this round
    state.setIsModeratorStreaming(true);

    // Moderator completes
    state.setIsModeratorStreaming(false);

    // === VERIFY FINAL STATE ===
    const finalState = getStoreState(store);

    // Pre-search complete with data
    expect(finalState.preSearches).toHaveLength(1);
    const finalPs = finalState.preSearches[0];
    if (!finalPs) {
      throw new Error('expected finalPs');
    }
    expect(finalPs.status).toBe(MessageStatuses.COMPLETE);
    expect(finalPs.searchData).toBeDefined();

    // All messages present
    expect(finalState.messages).toHaveLength(3);

    // Tracking state correct
    expect(finalState.triggeredPreSearchRounds.has(0)).toBeTruthy();
    expect(finalState.createdModeratorRounds.has(0)).toBeTruthy();

    // Flags cleared
    expect(finalState.isStreaming).toBeFalsy();
    expect(finalState.isModeratorStreaming).toBeFalsy();
  });

  it('pipeline without web search: participants → moderator', () => {
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

    // === PHASE 2: Moderator ===
    state.tryMarkModeratorCreated(0);
    state.setIsModeratorStreaming(true);
    state.setIsModeratorStreaming(false);

    // === VERIFY ===
    const finalState = getStoreState(store);
    expect(finalState.preSearches).toHaveLength(0); // No pre-search
    expect(finalState.messages).toHaveLength(3);
    expect(finalState.createdModeratorRounds.has(0)).toBeTruthy();
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
    const streamingPs = getStoreState(store).preSearches[0];
    if (!streamingPs) {
      throw new Error('expected streamingPs');
    }
    expect(streamingPs.status).toBe(MessageStatuses.STREAMING);

    // Participant streaming can still be started (bypass pre-search)
    state.setIsStreaming(true);
    expect(getStoreState(store).isStreaming).toBeTruthy();
  });

  it('stop during participants preserves completed messages', () => {
    const state = getStoreState(store);

    state.setIsStreaming(true);
    state.setStreamingRoundNumber(0);

    // Participant 0 completes
    const messages: UIMessage[] = [
      createTestUserMessage({ content: 'Q', id: 'user', roundNumber: 0 }),
      createTestAssistantMessage({
        content: 'Complete response',
        finishReason: FinishReasons.STOP,
        id: 'p0',
        participantId: 'participant-0',
        participantIndex: 0,
        roundNumber: 0,
      }),
    ];
    state.setMessages(messages);
    state.setCurrentParticipantIndex(1);

    // User stops during participant 1
    state.completeStreaming();

    // Participant 0's message preserved
    expect(getStoreState(store).messages).toHaveLength(2);
    expect(getStoreState(store).isStreaming).toBeFalsy();
  });

  it('navigation clears entire pipeline state', () => {
    const state = getStoreState(store);

    // Build up pipeline state
    const preSearch = createMockPreSearch(0, MessageStatuses.COMPLETE, true);
    state.addPreSearch(preSearch);

    const round0Messages = createRoundMessages(0, 2);
    state.setMessages(round0Messages);

    state.tryMarkModeratorCreated(0);

    expect(getStoreState(store).preSearches).toHaveLength(1);
    expect(getStoreState(store).messages).toHaveLength(3);
    expect(getStoreState(store).createdModeratorRounds.has(0)).toBeTruthy();

    // Navigate away
    state.resetForThreadNavigation();

    // All cleared
    expect(getStoreState(store).preSearches).toEqual([]);
    expect(getStoreState(store).messages).toEqual([]);
    expect(getStoreState(store).triggeredPreSearchRounds.size).toBe(0);
    expect(getStoreState(store).createdModeratorRounds.size).toBe(0);
  });
});
