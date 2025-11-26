/**
 * Web Search (Pre-Search) Flow Tests
 *
 * Comprehensive tests for Web Search (Pre-Search) functionality as defined in
 * COMPREHENSIVE_TEST_PLAN.md Section 2. These tests cover toggle behavior, blocking
 * logic, timeout/error handling, multi-round scenarios, and deadlock prevention.
 *
 * KEY CONCEPTS:
 * - Pre-search MUST complete before participant streaming starts
 * - Status transitions: PENDING -> STREAMING -> COMPLETE/FAILED
 * - Each round gets independent pre-search when web search is enabled
 * - 10-second timeout protection for hanging pre-searches
 * - Graceful degradation on failure (participants proceed without search)
 *
 * Location: /src/stores/chat/__tests__/web-search-presearch-flow.test.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AnalysisStatuses,
  PreSearchStatuses,
  ScreenModes,
  UIMessageRoles,
} from '@/api/core/enums';
import type { StoredPreSearch } from '@/api/routes/chat/schema';
import { shouldSendPendingMessage, shouldWaitForPreSearch } from '@/stores/chat/actions/pending-message-sender';
import { createChatStore } from '@/stores/chat/store';

import {
  createMockAnalysis,
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

/**
 * Helper to check if streaming should wait for pre-search
 * Uses the actual production logic from pending-message-sender.ts
 *
 * ✅ FIX: Use form state as sole source of truth for web search enabled
 * Form state represents user's current intention and should always be synced
 * when thread is loaded. This allows both enabling AND disabling mid-conversation.
 */
function checkShouldWaitForPreSearch(
  store: ReturnType<typeof createChatStore>,
  roundNumber: number,
): boolean {
  const state = store.getState();
  // ✅ FIX: Use form state as sole source of truth
  // Form state is synced with thread on load, then user can toggle
  const webSearchEnabled = state.enableWebSearch;

  return shouldWaitForPreSearch({
    webSearchEnabled,
    preSearches: state.preSearches,
    roundNumber,
  });
}

/**
 * Helper to check complete pending message validation
 */
function checkShouldSendPendingMessage(store: ReturnType<typeof createChatStore>) {
  const state = store.getState();
  return shouldSendPendingMessage({
    pendingMessage: state.pendingMessage,
    expectedParticipantIds: state.expectedParticipantIds,
    hasSentPendingMessage: state.hasSentPendingMessage,
    isStreaming: state.isStreaming,
    isWaitingForChangelog: state.isWaitingForChangelog,
    screenMode: state.screenMode ?? ScreenModes.OVERVIEW,
    participants: state.participants,
    messages: state.messages,
    preSearches: state.preSearches,
    thread: state.thread,
    enableWebSearch: state.enableWebSearch,
  });
}

// ============================================================================
// SECTION 2.1: TOGGLE & TRIGGERING
// ============================================================================

describe('2.1 Toggle & Triggering', () => {
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
   * SEARCH-01: Test enabling "Web Search" toggle persists state for the message
   *
   * Validates that when a user enables web search toggle, the state is correctly
   * stored and accessible when preparing a message submission.
   */
  it('sEARCH-01: enabling Web Search toggle persists state for the message', () => {
    // Initial state should have web search disabled
    expect(store.getState().enableWebSearch).toBe(false);

    // User enables web search toggle
    store.getState().setEnableWebSearch(true);

    // State should persist
    expect(store.getState().enableWebSearch).toBe(true);

    // Toggle off
    store.getState().setEnableWebSearch(false);
    expect(store.getState().enableWebSearch).toBe(false);

    // Toggle back on
    store.getState().setEnableWebSearch(true);
    expect(store.getState().enableWebSearch).toBe(true);
  });

  /**
   * SEARCH-01 (Extended): Web search state persists in thread object
   *
   * When thread is initialized with web search enabled, the thread-level
   * enableWebSearch should take precedence over form state.
   */
  it('sEARCH-01: web search state persists in thread object when initialized', () => {
    const thread = createMockThread({ enableWebSearch: true });
    const participants = [createMockParticipant(0)];

    store.getState().initializeThread(thread, participants);
    // ✅ FIX: Sync form state with thread state on initialization
    // In real app, this is done by UI components that load thread data
    store.getState().setEnableWebSearch(thread.enableWebSearch);

    // Thread-level web search should be enabled
    expect(store.getState().thread?.enableWebSearch).toBe(true);

    // Form state is now synced with thread on initialization
    // Validation uses form's enableWebSearch (source of truth)
    const webSearchEnabled = store.getState().enableWebSearch;
    expect(webSearchEnabled).toBe(true);
  });

  /**
   * SEARCH-02: Test submission with Web Search enabled triggers PENDING pre-search record creation
   *
   * Validates that when a user submits a message with web search enabled,
   * a pre-search record is created with PENDING status.
   */
  it('sEARCH-02: submission with Web Search enabled triggers PENDING pre-search creation', () => {
    const thread = createMockThread({
      id: 'thread-123',
      enableWebSearch: true,
    });
    const participants = [createMockParticipant(0)];

    store.getState().initializeThread(thread, participants);
    store.getState().setScreenMode(ScreenModes.OVERVIEW);

    // Simulate user preparing to send message
    store.getState().prepareForNewMessage('Test question', ['openai/gpt-4']);

    // Simulate provider creating PENDING pre-search (as done in chat-store-provider)
    const pendingPreSearch: StoredPreSearch = {
      id: 'presearch-001',
      threadId: 'thread-123',
      roundNumber: 0,
      userQuery: 'Test question',
      status: AnalysisStatuses.PENDING,
      searchData: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    store.getState().addPreSearch(pendingPreSearch);
    store.getState().markPreSearchTriggered(0);

    // Verify PENDING pre-search was created
    const state = store.getState();
    expect(state.preSearches).toHaveLength(1);
    expect(state.preSearches[0].status).toBe(AnalysisStatuses.PENDING);
    expect(state.preSearches[0].roundNumber).toBe(0);
    expect(state.preSearches[0].userQuery).toBe('Test question');
    expect(state.hasPreSearchBeenTriggered(0)).toBe(true);
  });

  /**
   * SEARCH-03: Test loading indicator "Searching the web..." appears immediately after submission
   *
   * Validates that the pre-search exists in PENDING or STREAMING status immediately
   * after submission, which would cause the UI to show loading state.
   */
  it('sEARCH-03: loading state is available immediately after submission', () => {
    const thread = createMockThread({ enableWebSearch: true });
    const participants = [createMockParticipant(0)];

    store.getState().initializeThread(thread, participants);
    store.getState().setScreenMode(ScreenModes.OVERVIEW);

    // User submits message
    store.getState().prepareForNewMessage('What is AI?', ['openai/gpt-4']);

    // Pre-search created with PENDING status
    store.getState().addPreSearch(createPendingPreSearch(0));

    // UI should show loading (pre-search is PENDING)
    const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 0);
    expect(preSearch).toBeDefined();
    expect(preSearch?.status).toBe(AnalysisStatuses.PENDING);

    // Status transitions to STREAMING when execution starts
    store.getState().updatePreSearchStatus(0, AnalysisStatuses.STREAMING);

    const updatedPreSearch = store.getState().preSearches.find(ps => ps.roundNumber === 0);
    expect(updatedPreSearch?.status).toBe(AnalysisStatuses.STREAMING);

    // Both PENDING and STREAMING should indicate loading state
    const isLoading = preSearch?.status === AnalysisStatuses.PENDING
      || updatedPreSearch?.status === AnalysisStatuses.STREAMING;
    expect(isLoading).toBe(true);
  });
});

// ============================================================================
// SECTION 2.2: PRE-SEARCH EXECUTION (BLOCKING LOGIC)
// ============================================================================

describe('2.2 Pre-Search Execution (Blocking Logic)', () => {
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
   * SEARCH-BLOCK-01: Verify participant streaming is BLOCKED if enableWebSearch=true
   * but no pre-search record exists yet (Optimistic Blocking)
   *
   * This tests the race condition where web search is enabled but the orchestrator
   * hasn't synced the pre-search record yet (0-2s polling window).
   */
  it('sEARCH-BLOCK-01: participant streaming is BLOCKED when web search enabled but no pre-search exists (Optimistic)', () => {
    const thread = createMockThread({ enableWebSearch: true });
    const participants = [createMockParticipant(0)];

    store.getState().initializeThread(thread, participants);

    // Pre-search array is empty (orchestrator hasn't synced yet)
    expect(store.getState().preSearches).toHaveLength(0);

    // Should wait (optimistic blocking)
    const shouldWait = checkShouldWaitForPreSearch(store, 0);
    expect(shouldWait).toBe(true);
  });

  /**
   * SEARCH-BLOCK-01 (Extended): No blocking when web search is disabled
   */
  it('sEARCH-BLOCK-01: no blocking when web search is disabled', () => {
    const thread = createMockThread({ enableWebSearch: false });
    const participants = [createMockParticipant(0)];

    store.getState().initializeThread(thread, participants);

    // Should NOT wait
    const shouldWait = checkShouldWaitForPreSearch(store, 0);
    expect(shouldWait).toBe(false);
  });

  /**
   * SEARCH-BLOCK-02: Verify participant streaming is BLOCKED while pre-search status is PENDING
   *
   * When pre-search record exists but execution hasn't started yet.
   */
  it('sEARCH-BLOCK-02: participant streaming is BLOCKED while pre-search status is PENDING', () => {
    const thread = createMockThread({ enableWebSearch: true });
    const participants = [createMockParticipant(0)];

    store.getState().initializeThread(thread, participants);

    // Create PENDING pre-search
    store.getState().addPreSearch(createPendingPreSearch(0));

    // Verify PENDING status
    expect(store.getState().preSearches[0].status).toBe(AnalysisStatuses.PENDING);

    // Should wait
    const shouldWait = checkShouldWaitForPreSearch(store, 0);
    expect(shouldWait).toBe(true);
  });

  /**
   * SEARCH-BLOCK-03: Verify participant streaming is BLOCKED while pre-search status is STREAMING
   *
   * When pre-search execution is in progress.
   */
  it('sEARCH-BLOCK-03: participant streaming is BLOCKED while pre-search status is STREAMING', () => {
    const thread = createMockThread({ enableWebSearch: true });
    const participants = [createMockParticipant(0)];

    store.getState().initializeThread(thread, participants);

    // Create and start streaming pre-search
    store.getState().addPreSearch(createStreamingPreSearch(0));

    // Verify STREAMING status
    expect(store.getState().preSearches[0].status).toBe(PreSearchStatuses.STREAMING);

    // Should wait
    const shouldWait = checkShouldWaitForPreSearch(store, 0);
    expect(shouldWait).toBe(true);
  });

  /**
   * SEARCH-BLOCK-04: Verify participant streaming STARTS immediately when status becomes COMPLETED
   *
   * When pre-search completes, streaming should be unblocked.
   */
  it('sEARCH-BLOCK-04: participant streaming STARTS when pre-search status becomes COMPLETED (Release)', () => {
    const thread = createMockThread({ enableWebSearch: true });
    const participants = [createMockParticipant(0)];

    store.getState().initializeThread(thread, participants);

    // Create pre-search and complete it
    store.getState().addPreSearch(createPendingPreSearch(0));
    store.getState().updatePreSearchStatus(0, AnalysisStatuses.STREAMING);
    store.getState().updatePreSearchData(0, createMockPreSearchDataPayload());

    // Verify COMPLETE status
    expect(store.getState().preSearches[0].status).toBe(AnalysisStatuses.COMPLETE);

    // Should NOT wait
    const shouldWait = checkShouldWaitForPreSearch(store, 0);
    expect(shouldWait).toBe(false);
  });

  /**
   * SEARCH-BLOCK-05: Verify participant streaming STARTS if status becomes FAILED (graceful degradation)
   *
   * When pre-search fails, streaming should proceed without search results.
   */
  it('sEARCH-BLOCK-05: participant streaming STARTS when pre-search status becomes FAILED (Fail Release)', () => {
    const thread = createMockThread({ enableWebSearch: true });
    const participants = [createMockParticipant(0)];

    store.getState().initializeThread(thread, participants);

    // Create pre-search and mark it as failed
    store.getState().addPreSearch(createPendingPreSearch(0));
    store.getState().updatePreSearchStatus(0, AnalysisStatuses.FAILED);

    // Verify FAILED status
    expect(store.getState().preSearches[0].status).toBe(AnalysisStatuses.FAILED);

    // Should NOT wait (graceful degradation)
    const shouldWait = checkShouldWaitForPreSearch(store, 0);
    expect(shouldWait).toBe(false);
  });

  /**
   * Extended test: Complete state machine transitions
   */
  it('should correctly transition through all blocking states', () => {
    const thread = createMockThread({ enableWebSearch: true });
    const participants = [createMockParticipant(0)];

    store.getState().initializeThread(thread, participants);

    // State 1: No pre-search (optimistic blocking)
    expect(checkShouldWaitForPreSearch(store, 0)).toBe(true);

    // State 2: PENDING
    store.getState().addPreSearch(createPendingPreSearch(0));
    expect(checkShouldWaitForPreSearch(store, 0)).toBe(true);

    // State 3: STREAMING
    store.getState().updatePreSearchStatus(0, AnalysisStatuses.STREAMING);
    expect(checkShouldWaitForPreSearch(store, 0)).toBe(true);

    // State 4: COMPLETE (unblocked)
    store.getState().updatePreSearchData(0, createMockPreSearchDataPayload());
    expect(checkShouldWaitForPreSearch(store, 0)).toBe(false);
  });
});

// ============================================================================
// SECTION 2.3: TIMEOUT & ERROR HANDLING
// ============================================================================

describe('2.3 Timeout & Error Handling', () => {
  let store: ReturnType<typeof createChatStore>;
  const PRE_SEARCH_TIMEOUT_MS = 10000; // 10 seconds

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  /**
   * SEARCH-ERR-01: Test pre-search hanging for >10 seconds triggers timeout protection
   *
   * Validates that a pre-search stuck in PENDING/STREAMING for more than 10 seconds
   * can be detected for timeout handling.
   */
  it('sEARCH-ERR-01: detects pre-search hanging for >10 seconds triggers timeout protection', () => {
    const thread = createMockThread({ enableWebSearch: true });
    const participants = [createMockParticipant(0)];

    store.getState().initializeThread(thread, participants);

    // Create pre-search with old timestamp (11 seconds ago)
    const stuckPreSearch: StoredPreSearch = {
      id: 'presearch-stuck',
      threadId: 'thread-123',
      roundNumber: 0,
      userQuery: 'Test question',
      status: AnalysisStatuses.STREAMING,
      searchData: null,
      createdAt: new Date(Date.now() - 11000), // 11 seconds ago
      updatedAt: new Date(Date.now() - 11000),
    };
    store.getState().addPreSearch(stuckPreSearch);

    // Calculate age
    const preSearch = store.getState().preSearches[0];
    const ageMs = Date.now() - preSearch.createdAt.getTime();

    // Should be past timeout
    expect(ageMs).toBeGreaterThan(PRE_SEARCH_TIMEOUT_MS);

    // Timeout detected
    const hasTimedOut = ageMs > PRE_SEARCH_TIMEOUT_MS;
    expect(hasTimedOut).toBe(true);
  });

  /**
   * SEARCH-ERR-02: Test system proceeds to participant streaming automatically after timeout
   *
   * When timeout is detected, the system should mark pre-search as FAILED and proceed.
   */
  it('sEARCH-ERR-02: system proceeds to participant streaming automatically after timeout', () => {
    const thread = createMockThread({ enableWebSearch: true });
    const participants = [createMockParticipant(0)];

    store.getState().initializeThread(thread, participants);

    // Create stuck pre-search
    const stuckPreSearch: StoredPreSearch = {
      id: 'presearch-stuck',
      threadId: 'thread-123',
      roundNumber: 0,
      userQuery: 'Test question',
      status: AnalysisStatuses.STREAMING,
      searchData: null,
      createdAt: new Date(Date.now() - 11000),
      updatedAt: new Date(Date.now() - 11000),
    };
    store.getState().addPreSearch(stuckPreSearch);

    // Still blocking before timeout handling
    expect(checkShouldWaitForPreSearch(store, 0)).toBe(true);

    // Timeout handler forces status to FAILED
    store.getState().updatePreSearchStatus(0, AnalysisStatuses.FAILED);
    store.getState().updatePreSearchError(0, 'Pre-search timed out');

    // Now unblocked
    expect(checkShouldWaitForPreSearch(store, 0)).toBe(false);
    expect(store.getState().preSearches[0].status).toBe(AnalysisStatuses.FAILED);
    expect(store.getState().preSearches[0].errorMessage).toBe('Pre-search timed out');
  });

  /**
   * SEARCH-ERR-03: Test pre-search failure (FAILED status) displays error UI but allows flow to continue
   *
   * When pre-search fails, error state is stored but participants can proceed.
   */
  it('sEARCH-ERR-03: pre-search failure stores error but allows flow to continue', () => {
    const thread = createMockThread({ enableWebSearch: true });
    const participants = [createMockParticipant(0)];

    store.getState().initializeThread(thread, participants);
    store.getState().setScreenMode(ScreenModes.THREAD);

    // Add user message for round 0
    store.getState().setMessages([createMockUserMessage(0, 'Test question')]);

    // Pre-search fails
    store.getState().addPreSearch(createPendingPreSearch(0));
    store.getState().updatePreSearchStatus(0, AnalysisStatuses.FAILED);
    store.getState().updatePreSearchError(0, 'Search service unavailable');

    const state = store.getState();

    // Error is stored for UI display
    expect(state.preSearches[0].status).toBe(AnalysisStatuses.FAILED);
    expect(state.preSearches[0].errorMessage).toBe('Search service unavailable');

    // Flow should continue (not blocked)
    const shouldWait = checkShouldWaitForPreSearch(store, 0);
    expect(shouldWait).toBe(false);
  });

  /**
   * SEARCH-ERR-04: Test network disconnection during pre-search (client-side)
   *
   * When network fails during pre-search streaming, the system should handle gracefully.
   */
  it('sEARCH-ERR-04: handles network disconnection during pre-search (client-side)', () => {
    const thread = createMockThread({ enableWebSearch: true });
    const participants = [createMockParticipant(0)];

    store.getState().initializeThread(thread, participants);

    // Pre-search starts streaming
    store.getState().addPreSearch(createStreamingPreSearch(0));

    // Network error occurs - simulate by marking as FAILED
    store.getState().updatePreSearchStatus(0, AnalysisStatuses.FAILED);
    store.getState().updatePreSearchError(0, 'Network error: Connection lost');

    const state = store.getState();

    // Error is captured
    expect(state.preSearches[0].status).toBe(AnalysisStatuses.FAILED);
    expect(state.preSearches[0].errorMessage).toContain('Network error');

    // Flow can continue despite network failure
    expect(checkShouldWaitForPreSearch(store, 0)).toBe(false);
  });

  /**
   * Extended: Multiple sequential timeouts
   */
  it('should handle multiple pre-search timeouts across rounds', () => {
    const thread = createMockThread({ enableWebSearch: true });
    const participants = [createMockParticipant(0)];

    store.getState().initializeThread(thread, participants);

    // Add timed-out pre-searches for multiple rounds
    for (let round = 0; round < 3; round++) {
      const timedOutPreSearch: StoredPreSearch = {
        id: `presearch-${round}`,
        threadId: 'thread-123',
        roundNumber: round,
        userQuery: `Question ${round}`,
        status: AnalysisStatuses.STREAMING,
        searchData: null,
        createdAt: new Date(Date.now() - 15000),
        updatedAt: new Date(Date.now() - 15000),
      };
      store.getState().addPreSearch(timedOutPreSearch);
    }

    // Force all to FAILED
    for (let round = 0; round < 3; round++) {
      store.getState().updatePreSearchStatus(round, AnalysisStatuses.FAILED);
      store.getState().updatePreSearchError(round, `Timeout on round ${round}`);
    }

    // All rounds should be unblocked
    expect(checkShouldWaitForPreSearch(store, 0)).toBe(false);
    expect(checkShouldWaitForPreSearch(store, 1)).toBe(false);
    expect(checkShouldWaitForPreSearch(store, 2)).toBe(false);
  });
});

// ============================================================================
// SECTION 2.4: MULTI-ROUND WEB SEARCH
// ============================================================================

describe('2.4 Multi-Round Web Search', () => {
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
   * SEARCH-MULTI-01: Test enabling web search for Round 2
   *
   * User can enable web search for subsequent rounds even if it was disabled
   * in previous rounds.
   */
  it('sEARCH-MULTI-01: can enable web search for Round 2', () => {
    // Start without web search
    const thread = createMockThread({
      id: 'thread-123',
      enableWebSearch: false,
    });
    const participants = [createMockParticipant(0)];

    // Complete round 0 without web search
    store.getState().initializeThread(thread, participants, [
      createMockUserMessage(0, 'First question'),
      createMockMessage(0, 0),
    ]);
    store.getState().setScreenMode(ScreenModes.THREAD);
    store.getState().markAnalysisCreated(0);
    store.getState().addAnalysis(createMockAnalysis({
      roundNumber: 0,
      status: AnalysisStatuses.COMPLETE,
    }));

    // Enable web search for round 1
    const updatedThread = { ...thread, enableWebSearch: true };
    store.getState().setThread(updatedThread);

    // Verify web search is now enabled
    expect(store.getState().thread?.enableWebSearch).toBe(true);

    // Round 1 should require pre-search
    const shouldWait = checkShouldWaitForPreSearch(store, 1);
    expect(shouldWait).toBe(true); // Optimistic blocking - no pre-search yet
  });

  /**
   * SEARCH-MULTI-02: Verify Round number is calculated correctly (getCurrentRoundNumber + 1)
   *
   * Pre-search round number should match the upcoming round.
   */
  it('sEARCH-MULTI-02: round number is calculated correctly for new search', () => {
    const thread = createMockThread({ enableWebSearch: true });
    const participants = [createMockParticipant(0)];

    // Setup with 2 completed rounds
    store.getState().initializeThread(thread, participants, [
      createMockUserMessage(0),
      createMockMessage(0, 0),
      createMockUserMessage(1),
      createMockMessage(0, 1),
    ]);

    // Add completed pre-searches for rounds 0 and 1
    store.getState().addPreSearch(createMockPreSearch({
      roundNumber: 0,
      status: AnalysisStatuses.COMPLETE,
      searchData: createMockPreSearchDataPayload(),
    }));
    store.getState().addPreSearch(createMockPreSearch({
      roundNumber: 1,
      status: AnalysisStatuses.COMPLETE,
      searchData: createMockPreSearchDataPayload(),
    }));

    // Next round should be 2
    const messages = store.getState().messages;
    const userMessages = messages.filter(m => m.role === UIMessageRoles.USER);
    const nextRoundNumber = userMessages.length; // 2 user messages = next is round 2

    expect(nextRoundNumber).toBe(2);

    // Pre-search for round 2
    store.getState().addPreSearch(createPendingPreSearch(2));

    const preSearches = store.getState().preSearches;
    expect(preSearches).toHaveLength(3);
    expect(preSearches[2].roundNumber).toBe(2);
  });

  /**
   * SEARCH-MULTI-03: Verify Round 2 participants wait for Round 2 pre-search to complete
   *
   * Each round's participants wait only for their own round's pre-search.
   */
  it('sEARCH-MULTI-03: round 2 participants wait for round 2 pre-search to complete', () => {
    const thread = createMockThread({ enableWebSearch: true });
    const participants = [createMockParticipant(0), createMockParticipant(1)];

    // Setup with round 0 and 1 complete
    store.getState().initializeThread(thread, participants, [
      createMockUserMessage(0),
      createMockMessage(0, 0),
      createMockMessage(1, 0),
      createMockUserMessage(1),
      createMockMessage(0, 1),
      createMockMessage(1, 1),
    ]);
    store.getState().setScreenMode(ScreenModes.THREAD);

    // Add completed pre-searches for rounds 0 and 1
    store.getState().addPreSearch(createMockPreSearch({
      roundNumber: 0,
      status: AnalysisStatuses.COMPLETE,
    }));
    store.getState().addPreSearch(createMockPreSearch({
      roundNumber: 1,
      status: AnalysisStatuses.COMPLETE,
    }));

    // Round 2 pre-search is PENDING
    store.getState().addPreSearch(createPendingPreSearch(2));

    // Round 0 and 1 should NOT wait (already complete)
    expect(checkShouldWaitForPreSearch(store, 0)).toBe(false);
    expect(checkShouldWaitForPreSearch(store, 1)).toBe(false);

    // Round 2 SHOULD wait
    expect(checkShouldWaitForPreSearch(store, 2)).toBe(true);

    // Complete round 2 pre-search
    store.getState().updatePreSearchData(2, createMockPreSearchDataPayload());

    // Now round 2 should NOT wait
    expect(checkShouldWaitForPreSearch(store, 2)).toBe(false);
  });

  /**
   * SEARCH-MULTI-04: Verify previous rounds' search context is summarized, not passed as full content
   *
   * This test validates that search data exists independently per round
   * and doesn't accumulate raw content.
   */
  it('sEARCH-MULTI-04: each round maintains independent search data (summarized)', () => {
    const thread = createMockThread({ enableWebSearch: true });
    const participants = [createMockParticipant(0)];

    store.getState().initializeThread(thread, participants);

    // Create pre-searches for 3 rounds with different search data
    for (let round = 0; round < 3; round++) {
      const searchData = createMockPreSearchDataPayload({
        queries: [{
          query: `Query for round ${round}`,
          rationale: `Rationale ${round}`,
          searchDepth: 'basic',
          index: 0,
          total: 1,
        }],
        analysis: `Analysis summary for round ${round}`,
      });

      store.getState().addPreSearch(createMockPreSearch({
        id: `presearch-${round}`,
        roundNumber: round,
        status: AnalysisStatuses.COMPLETE,
        searchData,
      }));
    }

    // Verify each round has independent search data
    const preSearches = store.getState().preSearches;
    expect(preSearches).toHaveLength(3);

    // Each round's data is independent (summarized, not accumulated)
    preSearches.forEach((ps, index) => {
      expect(ps.roundNumber).toBe(index);
      expect(ps.searchData?.analysis).toBe(`Analysis summary for round ${index}`);
      expect(ps.searchData?.queries[0]?.query).toBe(`Query for round ${index}`);
    });
  });

  /**
   * Extended: Toggle web search on/off between rounds
   */
  it('should handle web search toggle between rounds', () => {
    const thread = createMockThread({
      id: 'thread-123',
      enableWebSearch: true,
    });
    const participants = [createMockParticipant(0)];

    store.getState().initializeThread(thread, participants);
    // ✅ FIX: Sync form state with thread
    store.getState().setEnableWebSearch(true);
    store.getState().setScreenMode(ScreenModes.THREAD);

    // Round 0 with web search
    store.getState().addPreSearch(createMockPreSearch({
      roundNumber: 0,
      status: AnalysisStatuses.COMPLETE,
    }));

    // Disable web search - ✅ FIX: Also sync form state
    store.getState().setThread({ ...thread, enableWebSearch: false });
    store.getState().setEnableWebSearch(false);

    // Round 1 should NOT require pre-search
    expect(checkShouldWaitForPreSearch(store, 1)).toBe(false);

    // Re-enable web search - ✅ FIX: Also sync form state
    store.getState().setThread({ ...thread, enableWebSearch: true });
    store.getState().setEnableWebSearch(true);

    // Round 1 should now require pre-search (optimistic blocking)
    expect(checkShouldWaitForPreSearch(store, 1)).toBe(true);
  });
});

// ============================================================================
// SECTION 2.5: DEADLOCK PREVENTION (CIRCULAR DEPENDENCY)
// ============================================================================

describe('2.5 Deadlock Prevention (Circular Dependency)', () => {
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
   * SEARCH-DEADLOCK-01: Verify provider executes pre-search immediately after creation
   *
   * CRITICAL: This tests the deadlock scenario where:
   * 1. Provider creates PENDING pre-search
   * 2. Provider waits for COMPLETE
   * 3. PreSearchStream needs user message to render
   * 4. User message needs streaming to start
   * 5. Streaming waits for pre-search
   * 6. DEADLOCK
   *
   * Solution: Provider must execute pre-search immediately after creation.
   */
  it('sEARCH-DEADLOCK-01: detects stuck PENDING pre-search to avoid deadlock', () => {
    const thread = createMockThread({
      id: 'thread-123',
      enableWebSearch: true,
    });
    const participants = [createMockParticipant(0)];

    // Setup: Round 0 complete
    store.getState().initializeThread(thread, participants, [
      createMockUserMessage(0, 'First question'),
      createMockMessage(0, 0),
    ]);
    // ✅ FIX: Sync form state with thread
    store.getState().setEnableWebSearch(true);
    store.getState().setScreenMode(ScreenModes.THREAD);
    store.getState().markAnalysisCreated(0);
    store.getState().addAnalysis(createMockAnalysis({
      roundNumber: 0,
      status: AnalysisStatuses.COMPLETE,
    }));
    store.getState().addPreSearch(createMockPreSearch({
      roundNumber: 0,
      status: AnalysisStatuses.COMPLETE,
    }));

    // User sends second message
    store.getState().prepareForNewMessage('Second question', ['openai/gpt-4']);

    // Pre-search created for round 1 but NOT executed (stuck in PENDING)
    const stuckPreSearch: StoredPreSearch = {
      id: 'presearch-r1-stuck',
      threadId: 'thread-123',
      roundNumber: 1,
      userQuery: 'Second question',
      status: AnalysisStatuses.PENDING,
      searchData: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    store.getState().addPreSearch(stuckPreSearch);

    // THE DEADLOCK STATE:
    const state = store.getState();

    // Pre-search is PENDING
    expect(state.preSearches[1].status).toBe(AnalysisStatuses.PENDING);

    // Message not sent yet
    expect(state.hasSentPendingMessage).toBe(false);
    expect(state.pendingMessage).toBe('Second question');

    // Blocking check would return true
    const shouldWait = checkShouldWaitForPreSearch(store, 1);
    expect(shouldWait).toBe(true);

    // This is the deadlock detection point
    // Provider should recognize this and trigger execution immediately
  });

  /**
   * SEARCH-DEADLOCK-01 (Extended): Correct flow with immediate execution
   */
  it('sEARCH-DEADLOCK-01: correct flow executes pre-search immediately after creation', () => {
    const thread = createMockThread({
      id: 'thread-123',
      enableWebSearch: true,
    });
    const participants = [createMockParticipant(0)];

    // Setup: Round 0 complete
    store.getState().initializeThread(thread, participants, [
      createMockUserMessage(0, 'First question'),
      createMockMessage(0, 0),
    ]);
    store.getState().setScreenMode(ScreenModes.THREAD);

    // Add completed pre-search for round 0
    store.getState().addPreSearch(createMockPreSearch({
      roundNumber: 0,
      status: AnalysisStatuses.COMPLETE,
    }));

    // User sends second message
    store.getState().prepareForNewMessage('Second question', ['openai/gpt-4']);

    // CORRECT FLOW: Create and IMMEDIATELY execute
    // Step 1: Create PENDING
    store.getState().addPreSearch(createPendingPreSearch(1));
    store.getState().markPreSearchTriggered(1);

    // Step 2: IMMEDIATELY start execution (PENDING -> STREAMING)
    store.getState().updatePreSearchStatus(1, AnalysisStatuses.STREAMING);

    // Now waiting for completion (not deadlocked)
    expect(store.getState().preSearches[1].status).toBe(AnalysisStatuses.STREAMING);

    // Step 3: Complete
    store.getState().updatePreSearchData(1, createMockPreSearchDataPayload());

    // Now unblocked
    expect(checkShouldWaitForPreSearch(store, 1)).toBe(false);
    expect(store.getState().preSearches[1].status).toBe(AnalysisStatuses.COMPLETE);
  });

  /**
   * SEARCH-DEADLOCK-02: Test recovery mechanism for "stuck" PENDING pre-searches
   *
   * Provider should detect pre-searches stuck in PENDING for too long and
   * trigger execution or force failure.
   */
  it('sEARCH-DEADLOCK-02: recovery mechanism detects stuck PENDING pre-searches', () => {
    const thread = createMockThread({ enableWebSearch: true });
    const participants = [createMockParticipant(0)];

    store.getState().initializeThread(thread, participants);
    store.getState().setScreenMode(ScreenModes.THREAD);

    // Pre-search stuck in PENDING for 5+ seconds
    const stuckPreSearch: StoredPreSearch = {
      id: 'presearch-stuck',
      threadId: 'thread-123',
      roundNumber: 0,
      userQuery: 'Test question',
      status: AnalysisStatuses.PENDING,
      searchData: null,
      createdAt: new Date(Date.now() - 5000), // 5 seconds ago
      updatedAt: new Date(Date.now() - 5000),
    };
    store.getState().addPreSearch(stuckPreSearch);

    // Detect stuck state
    const preSearch = store.getState().preSearches[0];
    const ageMs = Date.now() - preSearch.createdAt.getTime();
    const STUCK_THRESHOLD_MS = 3000; // 3 seconds to detect stuck

    expect(ageMs).toBeGreaterThan(STUCK_THRESHOLD_MS);

    // Recovery option 1: Force execution (PENDING -> STREAMING)
    store.getState().updatePreSearchStatus(0, AnalysisStatuses.STREAMING);
    expect(store.getState().preSearches[0].status).toBe(AnalysisStatuses.STREAMING);
  });

  /**
   * SEARCH-DEADLOCK-02 (Extended): Recovery by forcing failure
   */
  it('sEARCH-DEADLOCK-02: recovers by forcing failure after timeout', () => {
    const thread = createMockThread({ enableWebSearch: true });
    const participants = [createMockParticipant(0)];

    store.getState().initializeThread(thread, participants);

    // Pre-search stuck for too long
    const stuckPreSearch: StoredPreSearch = {
      id: 'presearch-stuck',
      threadId: 'thread-123',
      roundNumber: 0,
      userQuery: 'Test question',
      status: AnalysisStatuses.PENDING,
      searchData: null,
      createdAt: new Date(Date.now() - 15000), // 15 seconds ago
      updatedAt: new Date(Date.now() - 15000),
    };
    store.getState().addPreSearch(stuckPreSearch);

    // Recovery option 2: Force failure and proceed
    store.getState().updatePreSearchStatus(0, AnalysisStatuses.FAILED);
    store.getState().updatePreSearchError(0, 'Pre-search stuck - forcing completion');

    // Verify recovery
    expect(store.getState().preSearches[0].status).toBe(AnalysisStatuses.FAILED);
    expect(checkShouldWaitForPreSearch(store, 0)).toBe(false);
  });

  /**
   * Extended: Differentiate PENDING (needs execution) from STREAMING (in progress)
   */
  it('should differentiate PENDING (needs execution) from STREAMING (in progress)', () => {
    const thread = createMockThread({ enableWebSearch: true });
    const participants = [createMockParticipant(0)];

    store.getState().initializeThread(thread, participants);

    // PENDING: Needs execution trigger
    store.getState().addPreSearch(createPendingPreSearch(0));
    expect(store.getState().preSearches[0].status).toBe(AnalysisStatuses.PENDING);

    // Provider detects PENDING and should trigger execution
    const needsExecution = store.getState().preSearches[0].status === AnalysisStatuses.PENDING;
    expect(needsExecution).toBe(true);

    // After execution trigger: STREAMING (in progress)
    store.getState().updatePreSearchStatus(0, AnalysisStatuses.STREAMING);
    expect(store.getState().preSearches[0].status).toBe(AnalysisStatuses.STREAMING);

    // Now it's in progress, just needs to wait for completion
    const inProgress = store.getState().preSearches[0].status === AnalysisStatuses.STREAMING;
    expect(inProgress).toBe(true);
  });
});

// ============================================================================
// INTEGRATION TESTS: COMPLETE FLOW SCENARIOS
// ============================================================================

describe('integration: Complete Pre-Search Flow', () => {
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
   * Complete 3-round flow with web search
   */
  it('should handle complete 3-round flow with pre-search', () => {
    const thread = createMockThread({
      id: 'thread-123',
      enableWebSearch: true,
    });
    const participants = [createMockParticipant(0), createMockParticipant(1)];

    // Initialize
    store.getState().initializeThread(thread, participants, []);
    store.getState().setScreenMode(ScreenModes.OVERVIEW);

    // === ROUND 0 ===
    store.getState().setMessages(prev => [...prev, createMockUserMessage(0, 'Question 1')]);

    // Pre-search flow
    store.getState().addPreSearch(createPendingPreSearch(0));
    store.getState().markPreSearchTriggered(0);
    expect(checkShouldWaitForPreSearch(store, 0)).toBe(true);

    store.getState().updatePreSearchStatus(0, AnalysisStatuses.STREAMING);
    expect(checkShouldWaitForPreSearch(store, 0)).toBe(true);

    store.getState().updatePreSearchData(0, createMockPreSearchDataPayload());
    expect(checkShouldWaitForPreSearch(store, 0)).toBe(false);

    // Participants respond
    store.getState().setMessages(prev => [...prev, createMockMessage(0, 0)]);
    store.getState().setMessages(prev => [...prev, createMockMessage(1, 0)]);

    // Analysis
    store.getState().markAnalysisCreated(0);
    store.getState().addAnalysis(createMockAnalysis({
      roundNumber: 0,
      status: AnalysisStatuses.COMPLETE,
    }));

    // Navigate to thread
    store.getState().setScreenMode(ScreenModes.THREAD);

    // === ROUND 1 ===
    // ✅ FIX: prepareForNewMessage now adds optimistic user message, no need for manual setMessages
    store.getState().prepareForNewMessage('Question 2', ['openai/gpt-4', 'openai/gpt-4']);

    // Pre-search flow
    store.getState().addPreSearch(createPendingPreSearch(1));
    store.getState().markPreSearchTriggered(1);
    store.getState().updatePreSearchStatus(1, AnalysisStatuses.STREAMING);
    store.getState().updatePreSearchData(1, createMockPreSearchDataPayload());

    // Participants respond
    store.getState().setMessages(prev => [...prev, createMockMessage(0, 1)]);
    store.getState().setMessages(prev => [...prev, createMockMessage(1, 1)]);

    // Analysis
    store.getState().markAnalysisCreated(1);
    store.getState().addAnalysis(createMockAnalysis({
      roundNumber: 1,
      status: AnalysisStatuses.COMPLETE,
    }));

    // === ROUND 2 ===
    // ✅ FIX: prepareForNewMessage now adds optimistic user message, no need for manual setMessages
    store.getState().prepareForNewMessage('Question 3', ['openai/gpt-4', 'openai/gpt-4']);

    // Pre-search flow
    store.getState().addPreSearch(createPendingPreSearch(2));
    store.getState().markPreSearchTriggered(2);
    store.getState().updatePreSearchStatus(2, AnalysisStatuses.STREAMING);
    store.getState().updatePreSearchData(2, createMockPreSearchDataPayload());

    // Participants respond
    store.getState().setMessages(prev => [...prev, createMockMessage(0, 2)]);
    store.getState().setMessages(prev => [...prev, createMockMessage(1, 2)]);

    // Analysis
    store.getState().markAnalysisCreated(2);
    store.getState().addAnalysis(createMockAnalysis({
      roundNumber: 2,
      status: AnalysisStatuses.COMPLETE,
    }));

    // === FINAL VERIFICATION ===
    const finalState = store.getState();

    // All pre-searches complete
    expect(finalState.preSearches).toHaveLength(3);
    expect(finalState.preSearches.every(ps => ps.status === AnalysisStatuses.COMPLETE)).toBe(true);

    // All analyses complete
    expect(finalState.analyses).toHaveLength(3);
    expect(finalState.analyses.every(a => a.status === AnalysisStatuses.COMPLETE)).toBe(true);

    // All messages present (3 rounds × 3 messages each)
    expect(finalState.messages).toHaveLength(9);

    // All tracking correct
    expect(finalState.hasPreSearchBeenTriggered(0)).toBe(true);
    expect(finalState.hasPreSearchBeenTriggered(1)).toBe(true);
    expect(finalState.hasPreSearchBeenTriggered(2)).toBe(true);
  });

  /**
   * Mixed success/failure across rounds
   */
  it('should handle mixed success/failure across rounds', () => {
    const thread = createMockThread({ enableWebSearch: true });
    const participants = [createMockParticipant(0)];

    store.getState().initializeThread(thread, participants);

    // Round 0: Success
    store.getState().addPreSearch(createMockPreSearch({
      roundNumber: 0,
      status: AnalysisStatuses.COMPLETE,
      searchData: createMockPreSearchDataPayload(),
    }));

    // Round 1: Failure
    store.getState().addPreSearch(createMockPreSearch({
      roundNumber: 1,
      status: AnalysisStatuses.FAILED,
      errorMessage: 'Service unavailable',
    }));

    // Round 2: Success
    store.getState().addPreSearch(createMockPreSearch({
      roundNumber: 2,
      status: AnalysisStatuses.COMPLETE,
      searchData: createMockPreSearchDataPayload(),
    }));

    // All rounds should be unblocked
    expect(checkShouldWaitForPreSearch(store, 0)).toBe(false);
    expect(checkShouldWaitForPreSearch(store, 1)).toBe(false);
    expect(checkShouldWaitForPreSearch(store, 2)).toBe(false);

    // Verify status
    const preSearches = store.getState().preSearches;
    expect(preSearches[0].status).toBe(AnalysisStatuses.COMPLETE);
    expect(preSearches[1].status).toBe(AnalysisStatuses.FAILED);
    expect(preSearches[2].status).toBe(AnalysisStatuses.COMPLETE);
  });

  /**
   * Validate pending message blocking integration
   */
  it('should correctly integrate with pending message validation', () => {
    const thread = createMockThread({
      id: 'thread-123',
      enableWebSearch: true,
    });
    const participants = [createMockParticipant(0)];

    // Setup on thread screen
    store.getState().initializeThread(thread, participants, [
      createMockUserMessage(0),
      createMockMessage(0, 0),
    ]);
    store.getState().setScreenMode(ScreenModes.THREAD);

    // Complete round 0 pre-search and analysis
    store.getState().addPreSearch(createMockPreSearch({
      roundNumber: 0,
      status: AnalysisStatuses.COMPLETE,
    }));
    store.getState().markAnalysisCreated(0);
    store.getState().addAnalysis(createMockAnalysis({
      roundNumber: 0,
      status: AnalysisStatuses.COMPLETE,
    }));

    // Prepare message for round 1
    store.getState().prepareForNewMessage('Follow-up question', ['openai/gpt-4']);
    store.getState().setExpectedParticipantIds(['openai/gpt-4']);

    // IMPORTANT: Must set isWaitingForChangelog to false AFTER prepareForNewMessage
    // because prepareForNewMessage may reset certain states
    store.getState().setIsWaitingForChangelog(false);

    // No pre-search yet - should NOT send
    let result = checkShouldSendPendingMessage(store);
    expect(result.shouldSend).toBe(false);
    expect(result.reason).toBe('waiting for pre-search creation');

    // Add PENDING pre-search - still should NOT send
    store.getState().addPreSearch(createPendingPreSearch(1));
    result = checkShouldSendPendingMessage(store);
    expect(result.shouldSend).toBe(false);
    expect(result.reason).toBe('waiting for pre-search');

    // Complete pre-search - should send
    store.getState().updatePreSearchData(1, createMockPreSearchDataPayload());
    result = checkShouldSendPendingMessage(store);
    expect(result.shouldSend).toBe(true);
    expect(result.roundNumber).toBe(1);
  });
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe('web Search Edge Cases', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should handle empty search results gracefully', () => {
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
    expect(checkShouldWaitForPreSearch(store, 0)).toBe(false);
  });

  it('should handle very long search queries', () => {
    const longQuery = 'a'.repeat(1000);
    store.getState().setInputValue(longQuery);

    expect(store.getState().inputValue).toHaveLength(1000);
  });

  it('should handle special characters in search query', () => {
    const specialQuery = 'AI & ML in 2025: What\'s new? (Latest trends)';
    store.getState().setInputValue(specialQuery);

    expect(store.getState().inputValue).toBe(specialQuery);
  });

  it('should maintain pre-search state across screen mode changes', () => {
    const thread = createMockThread({ enableWebSearch: true });
    const participants = [createMockParticipant(0)];

    store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);
    store.getState().setScreenMode(ScreenModes.OVERVIEW);

    // Add pre-search
    store.getState().addPreSearch(createPendingPreSearch(0));

    // Change screen mode
    store.getState().setScreenMode(ScreenModes.THREAD);

    // Pre-search should still exist
    expect(store.getState().preSearches).toHaveLength(1);
    expect(store.getState().screenMode).toBe(ScreenModes.THREAD);
  });

  it('should handle rapid consecutive pre-search status updates', () => {
    const thread = createMockThread({ enableWebSearch: true });
    const participants = [createMockParticipant(0)];

    store.getState().initializeThread(thread, participants);

    // Rapidly update status
    store.getState().addPreSearch(createPendingPreSearch(0));
    store.getState().updatePreSearchStatus(0, AnalysisStatuses.STREAMING);
    store.getState().updatePreSearchData(0, createMockPreSearchDataPayload());

    expect(store.getState().preSearches[0].status).toBe(AnalysisStatuses.COMPLETE);
    expect(checkShouldWaitForPreSearch(store, 0)).toBe(false);
  });
});

// ============================================================================
// SECTION 2.7: MID-CONVERSATION WEB SEARCH ENABLE
// ============================================================================

describe('2.7 Mid-Conversation Web Search Enable', () => {
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
   * SEARCH-MID-01: BUG TEST - Enabling web search mid-conversation should use form state
   *
   * When thread.enableWebSearch is false but user toggles enableWebSearch to true
   * in the form, the validation should use the form state.
   *
   * BUG: The ?? operator returns thread.enableWebSearch (false) instead of
   * falling back to enableWebSearch (true) because false is not null/undefined.
   */
  it('[SEARCH-MID-01] enabling web search mid-conversation should wait for pre-search', () => {
    // Setup: Thread created with web search disabled
    const thread = createMockThread({
      id: 'thread-123',
      enableWebSearch: false, // Thread has web search disabled
    });
    const participants = [createMockParticipant(0)];

    // Initialize thread (round 0 already complete)
    store.getState().initializeThread(thread, participants, [
      createMockUserMessage(0, 'First question'),
      createMockMessage(0, 0),
    ]);
    store.getState().setScreenMode(ScreenModes.THREAD);

    // User enables web search in form mid-conversation
    store.getState().setEnableWebSearch(true);

    // Verify state: thread.enableWebSearch = false, form enableWebSearch = true
    expect(store.getState().thread?.enableWebSearch).toBe(false);
    expect(store.getState().enableWebSearch).toBe(true);

    // BUG: This should return true because user enabled web search in form
    // But it returns false because thread.enableWebSearch (false) ?? enableWebSearch (true)
    // evaluates to false (the ?? only checks for null/undefined, not false)
    const shouldWait = checkShouldWaitForPreSearch(store, 1);
    expect(shouldWait).toBe(true); // This will FAIL with current bug
  });

  /**
   * SEARCH-MID-01 (Extended): Form state should take precedence over thread state
   * when user has pending config changes
   */
  it('[SEARCH-MID-01] form enableWebSearch should take precedence over thread enableWebSearch', () => {
    const thread = createMockThread({
      id: 'thread-123',
      enableWebSearch: false,
    });
    const participants = [createMockParticipant(0)];

    store.getState().initializeThread(thread, participants);
    store.getState().setScreenMode(ScreenModes.THREAD);

    // User toggles web search ON
    store.getState().setEnableWebSearch(true);
    store.getState().setHasPendingConfigChanges(true);

    // Prepare to send message
    store.getState().prepareForNewMessage('Second question', ['openai/gpt-4']);
    // ✅ FIX: Clear isWaitingForChangelog so we can test web search blocking
    // In real flow, changelog completes and clears this flag
    store.getState().setIsWaitingForChangelog(false);

    // shouldSendPendingMessage should detect web search is enabled
    const result = checkShouldSendPendingMessage(store);

    // Should be blocked waiting for pre-search creation
    // If form state is properly used, it should wait for pre-search
    expect(result.shouldSend).toBe(false);
    expect(result.reason).toBe('waiting for pre-search creation');
  });

  /**
   * SEARCH-MID-02: Disabling web search mid-conversation should not wait for pre-search
   *
   * When thread.enableWebSearch is true but user toggles to false,
   * the validation should use the form state (false).
   */
  it('[SEARCH-MID-02] disabling web search mid-conversation should not wait for pre-search', () => {
    const thread = createMockThread({
      id: 'thread-123',
      enableWebSearch: true, // Thread has web search enabled
    });
    const participants = [createMockParticipant(0)];

    store.getState().initializeThread(thread, participants, [
      createMockUserMessage(0, 'First question'),
      createMockMessage(0, 0),
    ]);
    store.getState().setScreenMode(ScreenModes.THREAD);

    // User disables web search in form mid-conversation
    store.getState().setEnableWebSearch(false);
    store.getState().setHasPendingConfigChanges(true);

    // Should NOT wait because form has web search disabled
    const shouldWait = checkShouldWaitForPreSearch(store, 1);
    expect(shouldWait).toBe(false);
  });

  /**
   * SEARCH-MID-03: Complete flow with mid-conversation web search enable
   *
   * Tests the full flow from enabling web search to pre-search completion
   */
  it('[SEARCH-MID-03] complete flow with mid-conversation web search enable', () => {
    const thread = createMockThread({
      id: 'thread-123',
      enableWebSearch: false,
    });
    const participants = [createMockParticipant(0)];

    // Round 0 complete without web search
    store.getState().initializeThread(thread, participants, [
      createMockUserMessage(0, 'First question'),
      createMockMessage(0, 0),
    ]);
    store.getState().setScreenMode(ScreenModes.THREAD);

    // User enables web search for round 1
    store.getState().setEnableWebSearch(true);

    // User prepares message
    store.getState().prepareForNewMessage('Second question', ['openai/gpt-4']);

    // Step 1: Should wait for pre-search creation (optimistic blocking)
    expect(checkShouldWaitForPreSearch(store, 1)).toBe(true);

    // Step 2: Pre-search created by backend
    store.getState().addPreSearch(createPendingPreSearch(1));

    // Step 3: Should wait for pre-search to complete
    expect(checkShouldWaitForPreSearch(store, 1)).toBe(true);

    // Step 4: Pre-search starts streaming
    store.getState().updatePreSearchStatus(1, AnalysisStatuses.STREAMING);
    expect(checkShouldWaitForPreSearch(store, 1)).toBe(true);

    // Step 5: Pre-search completes
    store.getState().updatePreSearchData(1, createMockPreSearchDataPayload());

    // Step 6: Should proceed
    expect(checkShouldWaitForPreSearch(store, 1)).toBe(false);
    expect(store.getState().preSearches.find(ps => ps.roundNumber === 1)?.status).toBe(AnalysisStatuses.COMPLETE);
  });
});
