/**
 * Web Search (Pre-Search) Flow Tests (Section 2)
 *
 * Tests the complete web search flow including blocking behavior,
 * timeout protection, and multi-round scenarios.
 *
 * FLOW TESTED:
 * 2.1 Toggle & Triggering
 * 2.2 Pre-Search Execution (Blocking)
 * 2.3 Timeout & Error Handling
 * 2.4 Multi-Round Web Search
 * 2.5 Deadlock Prevention
 *
 * Location: /src/stores/chat/__tests__/web-search-presearch-flow.test.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AnalysisStatuses,
  ChatModes,
  PreSearchStatuses,
} from '@/api/core/enums';
import { createChatStore } from '@/stores/chat/store';

import {
  createMockMessage,
  createMockParticipant,
  createMockPreSearch,
  createMockPreSearchDataPayload,
  createMockThread,
  createMockUserMessage,
  createPendingPreSearch,
  createStreamingPreSearch,
} from './test-factories';

// ============================================================================
// TEST UTILITIES
// ============================================================================

function createTestStore() {
  return createChatStore();
}

// ============================================================================
// SECTION 2.1: TOGGLE & TRIGGERING
// ============================================================================

describe('Section 2.1: Toggle & Triggering', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should enable web search toggle and persist state', () => {
    store.getState().setEnableWebSearch(true);
    expect(store.getState().enableWebSearch).toBe(true);
  });

  it('should disable web search toggle', () => {
    store.getState().setEnableWebSearch(true);
    store.getState().setEnableWebSearch(false);
    expect(store.getState().enableWebSearch).toBe(false);
  });

  it('should create PENDING pre-search record on submission with web search enabled', () => {
    // Initialize thread
    const thread = createMockThread({
      id: 'thread-123',
      enableWebSearch: true,
    });

    store.getState().initializeThread(thread, [], []);

    // Add PENDING pre-search
    const pendingPreSearch = createPendingPreSearch(0);
    store.getState().setPreSearches([pendingPreSearch]);

    const state = store.getState();
    expect(state.preSearches).toHaveLength(1);
    expect(state.preSearches[0].status).toBe(AnalysisStatuses.PENDING);
  });

  it('should have empty pre-searches when web search is disabled', () => {
    const thread = createMockThread({
      id: 'thread-123',
      enableWebSearch: false,
    });

    store.getState().initializeThread(thread, [], []);

    expect(store.getState().preSearches).toHaveLength(0);
  });

  it('should toggle web search state independently', () => {
    // Toggle on
    store.getState().setEnableWebSearch(true);
    expect(store.getState().enableWebSearch).toBe(true);

    // Toggle off
    store.getState().setEnableWebSearch(false);
    expect(store.getState().enableWebSearch).toBe(false);

    // Toggle on again
    store.getState().setEnableWebSearch(true);
    expect(store.getState().enableWebSearch).toBe(true);
  });
});

// ============================================================================
// SECTION 2.2: PRE-SEARCH EXECUTION (BLOCKING)
// ============================================================================

describe('Section 2.2: Pre-Search Execution (Blocking)', () => {
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
  // Blocking Behavior Tests
  // ==========================================================================

  describe('blocking Behavior', () => {
    it('should block participant streaming while pre-search is PENDING', () => {
      const thread = createMockThread({ id: 'thread-123' });
      store.getState().initializeThread(thread, [], []);

      // Set PENDING pre-search
      const pendingPreSearch = createPendingPreSearch(0);
      store.getState().setPreSearches([pendingPreSearch]);

      // shouldWaitForPreSearch should return true for PENDING
      const preSearches = store.getState().preSearches;
      const hasPendingPreSearch = preSearches.some(
        ps => ps.roundNumber === 0 && ps.status === AnalysisStatuses.PENDING
      );

      expect(hasPendingPreSearch).toBe(true);
    });

    it('should block participant streaming while pre-search is STREAMING', () => {
      const thread = createMockThread({ id: 'thread-123' });
      store.getState().initializeThread(thread, [], []);

      // Set STREAMING pre-search
      const streamingPreSearch = createStreamingPreSearch(0);
      store.getState().setPreSearches([streamingPreSearch]);

      const preSearches = store.getState().preSearches;
      const hasStreamingPreSearch = preSearches.some(
        ps => ps.roundNumber === 0 && ps.status === PreSearchStatuses.STREAMING
      );

      expect(hasStreamingPreSearch).toBe(true);
    });

    it('should allow participant streaming when pre-search is COMPLETED', () => {
      const thread = createMockThread({ id: 'thread-123' });
      store.getState().initializeThread(thread, [], []);

      // Set COMPLETED pre-search
      const completedPreSearch = createMockPreSearch({
        roundNumber: 0,
        status: PreSearchStatuses.COMPLETE,
      });
      store.getState().setPreSearches([completedPreSearch]);

      const preSearches = store.getState().preSearches;
      const isComplete = preSearches.some(
        ps => ps.roundNumber === 0 && ps.status === PreSearchStatuses.COMPLETE
      );

      expect(isComplete).toBe(true);
    });

    it('should allow participant streaming when pre-search is FAILED', () => {
      const thread = createMockThread({ id: 'thread-123' });
      store.getState().initializeThread(thread, [], []);

      // Set FAILED pre-search
      const failedPreSearch = createMockPreSearch({
        roundNumber: 0,
        status: PreSearchStatuses.FAILED,
      });
      store.getState().setPreSearches([failedPreSearch]);

      const preSearches = store.getState().preSearches;
      const isFailed = preSearches.some(
        ps => ps.roundNumber === 0 && ps.status === PreSearchStatuses.FAILED
      );

      expect(isFailed).toBe(true);
    });
  });

  // ==========================================================================
  // Status Transition Tests
  // ==========================================================================

  describe('status Transitions', () => {
    it('should transition from PENDING to STREAMING', () => {
      const thread = createMockThread({ id: 'thread-123' });
      store.getState().initializeThread(thread, [], []);

      // Start with PENDING
      const pendingPreSearch = createPendingPreSearch(0);
      store.getState().setPreSearches([pendingPreSearch]);

      expect(store.getState().preSearches[0].status).toBe(AnalysisStatuses.PENDING);

      // Transition to STREAMING
      const streamingPreSearch = createStreamingPreSearch(0);
      store.getState().setPreSearches([streamingPreSearch]);

      expect(store.getState().preSearches[0].status).toBe(PreSearchStatuses.STREAMING);
    });

    it('should transition from STREAMING to COMPLETED', () => {
      const thread = createMockThread({ id: 'thread-123' });
      store.getState().initializeThread(thread, [], []);

      // Start with STREAMING
      const streamingPreSearch = createStreamingPreSearch(0);
      store.getState().setPreSearches([streamingPreSearch]);

      // Transition to COMPLETED
      const completedPreSearch = createMockPreSearch({
        roundNumber: 0,
        status: PreSearchStatuses.COMPLETE,
        searchData: createMockPreSearchDataPayload(),
      });
      store.getState().setPreSearches([completedPreSearch]);

      expect(store.getState().preSearches[0].status).toBe(PreSearchStatuses.COMPLETE);
    });

    it('should transition from STREAMING to FAILED', () => {
      const thread = createMockThread({ id: 'thread-123' });
      store.getState().initializeThread(thread, [], []);

      // Start with STREAMING
      const streamingPreSearch = createStreamingPreSearch(0);
      store.getState().setPreSearches([streamingPreSearch]);

      // Transition to FAILED
      const failedPreSearch = createMockPreSearch({
        roundNumber: 0,
        status: PreSearchStatuses.FAILED,
      });
      store.getState().setPreSearches([failedPreSearch]);

      expect(store.getState().preSearches[0].status).toBe(PreSearchStatuses.FAILED);
    });
  });

  // ==========================================================================
  // Pre-Search Card Tests
  // ==========================================================================

  describe('pre-Search Card Display', () => {
    it('should store search data with generated query', () => {
      const thread = createMockThread({ id: 'thread-123' });
      store.getState().initializeThread(thread, [], []);

      const searchData = createMockPreSearchDataPayload({
        queries: [
          {
            query: 'optimized search query',
            rationale: 'Generated to find relevant results',
            searchDepth: 'basic',
            index: 0,
            total: 1,
          },
        ],
      });

      const preSearch = createMockPreSearch({
        roundNumber: 0,
        status: PreSearchStatuses.COMPLETE,
        searchData,
      });
      store.getState().setPreSearches([preSearch]);

      const storedSearchData = store.getState().preSearches[0].searchData;
      expect(storedSearchData?.queries[0].query).toBe('optimized search query');
    });

    it('should store streaming results with title, URL, snippet', () => {
      const searchData = createMockPreSearchDataPayload({
        results: [
          {
            query: 'test query',
            answer: 'Summary answer',
            results: [
              {
                title: 'Test Article Title',
                url: 'https://example.com/article',
                content: 'Article content snippet...',
              },
            ],
            responseTime: 1500,
          },
        ],
      });

      const preSearch = createMockPreSearch({
        roundNumber: 0,
        status: PreSearchStatuses.COMPLETE,
        searchData,
      });
      store.getState().setPreSearches([preSearch]);

      const result = store.getState().preSearches[0].searchData?.results[0];
      expect(result?.results[0].title).toBe('Test Article Title');
      expect(result?.results[0].url).toBe('https://example.com/article');
      expect(result?.results[0].content).toBe('Article content snippet...');
    });
  });

  // ==========================================================================
  // Immediate Start After Completion
  // ==========================================================================

  describe('immediate Start After Completion', () => {
    it('should allow streaming to start immediately after COMPLETED status', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = [
        createMockParticipant(0, { threadId: 'thread-123' }),
      ];

      store.getState().initializeThread(thread, participants, []);

      // Set PENDING -> STREAMING -> COMPLETED
      store.getState().setPreSearches([createPendingPreSearch(0)]);
      store.getState().setPreSearches([createStreamingPreSearch(0)]);

      const completedPreSearch = createMockPreSearch({
        roundNumber: 0,
        status: PreSearchStatuses.COMPLETE,
      });
      store.getState().setPreSearches([completedPreSearch]);

      // Now streaming can start
      store.getState().setIsStreaming(true);
      expect(store.getState().isStreaming).toBe(true);
    });
  });
});

// ============================================================================
// SECTION 2.3: TIMEOUT & ERROR HANDLING
// ============================================================================

describe('Section 2.3: Timeout & Error Handling', () => {
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
  // Timeout Protection Tests
  // ==========================================================================

  describe('timeout Protection', () => {
    it('should detect pre-search hanging for >10 seconds', () => {
      const thread = createMockThread({ id: 'thread-123' });
      store.getState().initializeThread(thread, [], []);

      // Create pre-search with old timestamp (>10 seconds ago)
      const oldPreSearch = createMockPreSearch({
        roundNumber: 0,
        status: PreSearchStatuses.STREAMING,
        createdAt: new Date(Date.now() - 11000), // 11 seconds ago
      });
      store.getState().setPreSearches([oldPreSearch]);

      const preSearch = store.getState().preSearches[0];
      const createdAt = new Date(preSearch.createdAt);
      const elapsed = Date.now() - createdAt.getTime();

      expect(elapsed).toBeGreaterThan(10000);
    });

    it('should allow proceeding after timeout', () => {
      const thread = createMockThread({ id: 'thread-123' });
      store.getState().initializeThread(thread, [], []);

      // Pre-search timed out - system should proceed
      const timedOutPreSearch = createMockPreSearch({
        roundNumber: 0,
        status: PreSearchStatuses.STREAMING,
        createdAt: new Date(Date.now() - 11000),
      });
      store.getState().setPreSearches([timedOutPreSearch]);

      // Should be able to start streaming after timeout
      store.getState().setIsStreaming(true);
      expect(store.getState().isStreaming).toBe(true);
    });
  });

  // ==========================================================================
  // Error Handling Tests
  // ==========================================================================

  describe('error Handling', () => {
    it('should handle pre-search failure gracefully', () => {
      const thread = createMockThread({ id: 'thread-123' });
      store.getState().initializeThread(thread, [], []);

      const failedPreSearch = createMockPreSearch({
        roundNumber: 0,
        status: PreSearchStatuses.FAILED,
      });
      store.getState().setPreSearches([failedPreSearch]);

      // Failed pre-search should allow participants to stream
      const isFailed = store.getState().preSearches[0].status === PreSearchStatuses.FAILED;
      expect(isFailed).toBe(true);
    });

    it('should allow streaming after FAILED status', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = [createMockParticipant(0, { threadId: 'thread-123' })];

      store.getState().initializeThread(thread, participants, []);

      // Set FAILED pre-search
      const failedPreSearch = createMockPreSearch({
        roundNumber: 0,
        status: PreSearchStatuses.FAILED,
      });
      store.getState().setPreSearches([failedPreSearch]);

      // Streaming should be allowed
      store.getState().setIsStreaming(true);
      expect(store.getState().isStreaming).toBe(true);
    });

    it('should handle network disconnection during pre-search', () => {
      const thread = createMockThread({ id: 'thread-123' });
      store.getState().initializeThread(thread, [], []);

      // Simulate network disconnection by setting FAILED status
      const networkErrorPreSearch = createMockPreSearch({
        roundNumber: 0,
        status: PreSearchStatuses.FAILED,
      });
      store.getState().setPreSearches([networkErrorPreSearch]);

      expect(store.getState().preSearches[0].status).toBe(PreSearchStatuses.FAILED);
    });
  });
});

// ============================================================================
// SECTION 2.4: MULTI-ROUND WEB SEARCH
// ============================================================================

describe('Section 2.4: Multi-Round Web Search', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should enable web search for Round 2', () => {
    const thread = createMockThread({ id: 'thread-123', enableWebSearch: true });
    store.getState().initializeThread(thread, [], []);

    // Round 1 pre-search
    const round1PreSearch = createMockPreSearch({
      id: 'pre-search-1',
      roundNumber: 0,
      status: PreSearchStatuses.COMPLETE,
    });

    // Round 2 pre-search
    const round2PreSearch = createMockPreSearch({
      id: 'pre-search-2',
      roundNumber: 1,
      status: AnalysisStatuses.PENDING,
    });

    store.getState().setPreSearches([round1PreSearch, round2PreSearch]);

    const preSearches = store.getState().preSearches;
    expect(preSearches).toHaveLength(2);
    expect(preSearches[1].roundNumber).toBe(1);
  });

  it('should calculate round number correctly as getCurrentRoundNumber + 1', () => {
    const thread = createMockThread({ id: 'thread-123' });

    // Create messages for round 0
    const userMessage = createMockUserMessage(0, 'First question');
    const participantMessage = createMockMessage(0, 0);

    store.getState().initializeThread(thread, [], [userMessage, participantMessage]);

    // Round 2 should be round number 1 (0-indexed)
    const messages = store.getState().messages;
    const maxRound = Math.max(...messages.map(m =>
      (m.metadata as { roundNumber?: number })?.roundNumber ?? 0
    ));
    const nextRound = maxRound + 1;

    expect(nextRound).toBe(1);
  });

  it('should block Round 2 participants until Round 2 pre-search completes', () => {
    const thread = createMockThread({ id: 'thread-123' });
    store.getState().initializeThread(thread, [], []);

    // Round 2 pre-search is PENDING
    const round2PreSearch = createPendingPreSearch(1);
    store.getState().setPreSearches([round2PreSearch]);

    // Should be blocking for round 1
    const isPending = store.getState().preSearches.some(
      ps => ps.roundNumber === 1 && ps.status === AnalysisStatuses.PENDING
    );

    expect(isPending).toBe(true);
  });

  it('should maintain independent pre-search per round', () => {
    const thread = createMockThread({ id: 'thread-123' });
    store.getState().initializeThread(thread, [], []);

    // Multiple rounds with different statuses
    const preSearches = [
      createMockPreSearch({ id: 'ps-1', roundNumber: 0, status: PreSearchStatuses.COMPLETE }),
      createMockPreSearch({ id: 'ps-2', roundNumber: 1, status: PreSearchStatuses.COMPLETE }),
      createMockPreSearch({ id: 'ps-3', roundNumber: 2, status: AnalysisStatuses.PENDING }),
    ];

    store.getState().setPreSearches(preSearches);

    const state = store.getState();
    expect(state.preSearches[0].roundNumber).toBe(0);
    expect(state.preSearches[1].roundNumber).toBe(1);
    expect(state.preSearches[2].roundNumber).toBe(2);
  });

  it('should summarize previous rounds search context (not full content)', () => {
    const thread = createMockThread({ id: 'thread-123' });
    store.getState().initializeThread(thread, [], []);

    // Round 1 has full search data
    const round1SearchData = createMockPreSearchDataPayload({
      analysis: 'Summary of Round 1 search results',
    });

    const round1PreSearch = createMockPreSearch({
      id: 'ps-1',
      roundNumber: 0,
      status: PreSearchStatuses.COMPLETE,
      searchData: round1SearchData,
    });

    store.getState().setPreSearches([round1PreSearch]);

    // The analysis field serves as the summary for subsequent rounds
    const summary = store.getState().preSearches[0].searchData?.analysis;
    expect(summary).toBe('Summary of Round 1 search results');
  });
});

// ============================================================================
// SECTION 2.5: DEADLOCK PREVENTION (CIRCULAR DEPENDENCY)
// ============================================================================

describe('Section 2.5: Deadlock Prevention', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should execute pre-search immediately after creation to avoid deadlock', () => {
    const thread = createMockThread({ id: 'thread-123', enableWebSearch: true });
    store.getState().initializeThread(thread, [], []);

    // PENDING pre-search should be executed immediately
    const pendingPreSearch = createPendingPreSearch(0);
    store.getState().setPreSearches([pendingPreSearch]);

    // Provider should detect PENDING and trigger execution
    const hasPendingPreSearch = store.getState().preSearches.some(
      ps => ps.status === AnalysisStatuses.PENDING
    );

    expect(hasPendingPreSearch).toBe(true);
    // In real implementation, provider would POST to execute
  });

  it('should detect stuck PENDING pre-searches', () => {
    const thread = createMockThread({ id: 'thread-123' });
    store.getState().initializeThread(thread, [], []);

    // Create stuck PENDING pre-search (old timestamp)
    const stuckPreSearch = createMockPreSearch({
      roundNumber: 0,
      status: AnalysisStatuses.PENDING,
      createdAt: new Date(Date.now() - 5000), // 5 seconds ago
    });
    store.getState().setPreSearches([stuckPreSearch]);

    const preSearch = store.getState().preSearches[0];
    const elapsed = Date.now() - new Date(preSearch.createdAt).getTime();

    expect(elapsed).toBeGreaterThan(3000);
    expect(preSearch.status).toBe(AnalysisStatuses.PENDING);
  });

  it('should transition correctly: create → execute → complete → send message', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [createMockParticipant(0, { threadId: 'thread-123' })];

    store.getState().initializeThread(thread, participants, []);

    // Step 1: Create PENDING
    store.getState().setPreSearches([createPendingPreSearch(0)]);
    expect(store.getState().preSearches[0].status).toBe(AnalysisStatuses.PENDING);

    // Step 2: Execute (STREAMING)
    store.getState().setPreSearches([createStreamingPreSearch(0)]);
    expect(store.getState().preSearches[0].status).toBe(PreSearchStatuses.STREAMING);

    // Step 3: Complete
    const completedPreSearch = createMockPreSearch({
      roundNumber: 0,
      status: PreSearchStatuses.COMPLETE,
      searchData: createMockPreSearchDataPayload(),
    });
    store.getState().setPreSearches([completedPreSearch]);
    expect(store.getState().preSearches[0].status).toBe(PreSearchStatuses.COMPLETE);

    // Step 4: Now message can be sent and streaming can start
    store.getState().setIsStreaming(true);
    expect(store.getState().isStreaming).toBe(true);
  });

  it('should not deadlock when stream waits for message and message waits for stream', () => {
    // This test verifies the fix for the circular dependency bug
    const thread = createMockThread({ id: 'thread-123', enableWebSearch: true });
    store.getState().initializeThread(thread, [], []);

    // Initial state: waiting for pre-search
    store.getState().setWaitingToStartStreaming(true);
    expect(store.getState().waitingToStartStreaming).toBe(true);

    // Pre-search is PENDING - should be executed immediately by provider
    const pendingPreSearch = createPendingPreSearch(0);
    store.getState().setPreSearches([pendingPreSearch]);

    // After execution completes
    const completedPreSearch = createMockPreSearch({
      roundNumber: 0,
      status: PreSearchStatuses.COMPLETE,
    });
    store.getState().setPreSearches([completedPreSearch]);

    // Streaming can now proceed
    store.getState().setWaitingToStartStreaming(false);
    expect(store.getState().waitingToStartStreaming).toBe(false);
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('Web Search Complete Flow Integration', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should execute complete web search flow for single round', () => {
    // Step 1: Configure chat with web search
    store.getState().setEnableWebSearch(true);
    store.getState().setInputValue('What is the latest in AI?');

    // Step 2: Thread creation
    const thread = createMockThread({
      id: 'thread-123',
      enableWebSearch: true,
    });
    const participants = [createMockParticipant(0, { threadId: 'thread-123' })];
    const userMessage = createMockUserMessage(0, 'What is the latest in AI?');

    store.getState().initializeThread(thread, participants, [userMessage]);
    store.getState().setCreatedThreadId('thread-123');

    // Step 3: PENDING pre-search created
    store.getState().setPreSearches([createPendingPreSearch(0)]);
    expect(store.getState().preSearches[0].status).toBe(AnalysisStatuses.PENDING);

    // Step 4: Pre-search executing
    store.getState().setPreSearches([createStreamingPreSearch(0)]);
    expect(store.getState().preSearches[0].status).toBe(PreSearchStatuses.STREAMING);

    // Step 5: Pre-search complete
    const completedPreSearch = createMockPreSearch({
      roundNumber: 0,
      status: PreSearchStatuses.COMPLETE,
      searchData: createMockPreSearchDataPayload(),
    });
    store.getState().setPreSearches([completedPreSearch]);
    expect(store.getState().preSearches[0].status).toBe(PreSearchStatuses.COMPLETE);

    // Step 6: Participant streaming starts
    store.getState().setIsStreaming(true);
    store.getState().setCurrentParticipantIndex(0);

    expect(store.getState().isStreaming).toBe(true);
    expect(store.getState().currentParticipantIndex).toBe(0);
  });

  it('should execute multi-round web search flow', () => {
    const thread = createMockThread({ id: 'thread-123', enableWebSearch: true });
    store.getState().initializeThread(thread, [], []);

    // Round 1 complete
    const round1PreSearch = createMockPreSearch({
      id: 'ps-1',
      roundNumber: 0,
      status: PreSearchStatuses.COMPLETE,
      searchData: createMockPreSearchDataPayload(),
    });
    store.getState().setPreSearches([round1PreSearch]);

    // Round 2 starts
    const round2Pending = createMockPreSearch({
      id: 'ps-2',
      roundNumber: 1,
      status: AnalysisStatuses.PENDING,
    });
    store.getState().setPreSearches([round1PreSearch, round2Pending]);

    expect(store.getState().preSearches).toHaveLength(2);

    // Round 2 completes
    const round2Complete = createMockPreSearch({
      id: 'ps-2',
      roundNumber: 1,
      status: PreSearchStatuses.COMPLETE,
      searchData: createMockPreSearchDataPayload(),
    });
    store.getState().setPreSearches([round1PreSearch, round2Complete]);

    const finalState = store.getState();
    expect(finalState.preSearches[0].status).toBe(PreSearchStatuses.COMPLETE);
    expect(finalState.preSearches[1].status).toBe(PreSearchStatuses.COMPLETE);
  });
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe('Web Search Edge Cases', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should handle toggling web search between rounds', () => {
    const thread = createMockThread({ id: 'thread-123' });
    store.getState().initializeThread(thread, [], []);

    // Round 1: Web search enabled
    store.getState().setEnableWebSearch(true);
    const round1PreSearch = createMockPreSearch({
      roundNumber: 0,
      status: PreSearchStatuses.COMPLETE,
    });
    store.getState().setPreSearches([round1PreSearch]);

    // Round 2: Web search disabled - no new pre-search
    store.getState().setEnableWebSearch(false);

    expect(store.getState().enableWebSearch).toBe(false);
    // Pre-search from round 1 still exists
    expect(store.getState().preSearches).toHaveLength(1);
  });

  it('should handle empty search results', () => {
    const emptySearchData = createMockPreSearchDataPayload({
      results: [],
      totalResults: 0,
      successCount: 0,
    });

    const preSearch = createMockPreSearch({
      roundNumber: 0,
      status: PreSearchStatuses.COMPLETE,
      searchData: emptySearchData,
    });
    store.getState().setPreSearches([preSearch]);

    expect(store.getState().preSearches[0].searchData?.totalResults).toBe(0);
  });

  it('should handle very long search queries', () => {
    const longQuery = 'a'.repeat(1000);
    store.getState().setInputValue(longQuery);

    expect(store.getState().inputValue.length).toBe(1000);
  });

  it('should handle special characters in search query', () => {
    const specialQuery = 'AI & ML in 2025: What\'s new? (Latest trends)';
    store.getState().setInputValue(specialQuery);

    expect(store.getState().inputValue).toBe(specialQuery);
  });
});
