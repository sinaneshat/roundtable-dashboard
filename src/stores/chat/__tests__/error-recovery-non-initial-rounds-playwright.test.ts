/**
 * Error Recovery in Non-Initial Rounds - E2E Tests
 *
 * Tests comprehensive error recovery scenarios in Round 1+ based on FLOW_DOCUMENTATION.md Part 10.
 *
 * CRITICAL BUSINESS LOGIC (from FLOW_DOCUMENTATION.md):
 * - "One AI failure doesn't stop the round. Remaining AIs still respond."
 * - "Round can complete with partial results."
 * - "User can retry entire round to regenerate all responses."
 * - "Failed moderator doesn't prevent continuing conversation."
 *
 * ERROR RECOVERY SCENARIOS TESTED:
 * 1. PATCH failure recovery (optimistic message removed, state reset)
 * 2. Changelog fetch failure (timeout and continue)
 * 3. Pre-search failure (mark as FAILED and continue with participants)
 * 4. Participant streaming failure (continue with other participants)
 * 5. Moderator failure (round completes anyway, conversation can continue)
 * 6. Network interruption recovery (reconnection and state sync)
 * 7. State cleanup after errors (allow submission again)
 *
 * TEST ARCHITECTURE:
 * - Tests focus on Round 1+ (non-initial rounds with existing conversation history)
 * - Uses store state machine patterns (no complex React mocking)
 * - Validates optimistic updates, rollback, and error state cleanup
 * - Ensures conversation can continue after errors
 *
 * REFERENCE:
 * - form-actions.ts: PATCH error handling with optimistic rollback
 * - FLOW_DOCUMENTATION.md Part 10: Error Handling Users See
 * - streaming-error-recovery.test.ts: Participant error patterns
 * - participant-sequential-error-recovery.test.ts: Sequential failure handling
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { FinishReasons, MessageStatuses, ScreenModes } from '@/api/core/enums';
import {
  createMockParticipants,
  createMockThread,
  createTestAssistantMessage,
  createTestUserMessage,
  getStoreState,
} from '@/lib/testing';

import { createChatStore } from '../store';
import type { StoredPreSearch } from '../store-action-types';

// ============================================================================
// PATCH FAILURE RECOVERY - OPTIMISTIC MESSAGE REMOVED
// ============================================================================

describe('pATCH Failure Recovery - Round 1+', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    const state = getStoreState(store);
    state.setThread(createMockThread({ id: 'thread-456' }));
    state.setParticipants(createMockParticipants(2, 'thread-456'));
    state.setScreenMode(ScreenModes.THREAD);
    state.setShowInitialUI(false);

    // Round 0 complete (existing conversation history)
    state.setMessages([
      createTestUserMessage({ id: 'r0_user', content: 'Initial question', roundNumber: 0 }),
      createTestAssistantMessage({
        id: 'r0_p0',
        content: 'Response from P0',
        roundNumber: 0,
        participantId: 'participant-0',
        participantIndex: 0,
        finishReason: FinishReasons.STOP,
      }),
      createTestAssistantMessage({
        id: 'r0_p1',
        content: 'Response from P1',
        roundNumber: 0,
        participantId: 'participant-1',
        participantIndex: 1,
        finishReason: FinishReasons.STOP,
      }),
    ]);
    state.tryMarkModeratorCreated(0);
  });

  it('handles PATCH 500 error - removes optimistic message and resets state', () => {
    const state = getStoreState(store);

    // User submits Round 1 message (optimistic update)
    const optimisticMessage = createTestUserMessage({
      id: 'optimistic-r1-user',
      content: 'Follow-up question',
      roundNumber: 1,
    });

    state.setMessages(prevMessages => [...prevMessages, optimisticMessage]);
    state.setStreamingRoundNumber(1);
    state.setWaitingToStartStreaming(true);
    state.setConfigChangeRoundNumber(1); // PATCH in progress

    expect(getStoreState(store).messages).toHaveLength(4); // 3 from R0 + 1 optimistic
    expect(getStoreState(store).waitingToStartStreaming).toBe(true);

    // === PATCH FAILS (500 Internal Server Error) ===
    // Rollback: Remove optimistic message
    state.setMessages(prevMessages => prevMessages.filter(m => m.id !== optimisticMessage.id));

    // Reset streaming state
    state.setWaitingToStartStreaming(false);
    state.setStreamingRoundNumber(null);
    state.setConfigChangeRoundNumber(null);

    // Verify rollback complete
    expect(getStoreState(store).messages).toHaveLength(3); // Back to R0 only
    expect(getStoreState(store).waitingToStartStreaming).toBe(false);
    expect(getStoreState(store).streamingRoundNumber).toBeNull();
    expect(getStoreState(store).configChangeRoundNumber).toBeNull();

    // User can submit again (state is clean)
    expect(getStoreState(store).isStreaming).toBe(false);
  });

  it('handles PATCH error - comprehensive state cleanup including nextParticipantToTrigger', () => {
    const state = getStoreState(store);

    // User submits Round 1 message with complete optimistic setup
    const optimisticMessage = createTestUserMessage({
      id: 'optimistic-full-cleanup',
      content: 'Test full cleanup',
      roundNumber: 1,
    });

    state.setMessages(prevMessages => [...prevMessages, optimisticMessage]);
    state.setStreamingRoundNumber(1);
    state.setWaitingToStartStreaming(true);
    state.setConfigChangeRoundNumber(1);
    state.setNextParticipantToTrigger(0); // Set for streaming trigger

    expect(getStoreState(store).messages).toHaveLength(4); // 3 from R0 + 1 optimistic
    expect(getStoreState(store).waitingToStartStreaming).toBe(true);
    expect(getStoreState(store).streamingRoundNumber).toBe(1);
    expect(getStoreState(store).configChangeRoundNumber).toBe(1);
    expect(getStoreState(store).nextParticipantToTrigger).toBe(0);

    // === PATCH FAILS - COMPLETE ROLLBACK ===
    state.setMessages(prevMessages => prevMessages.filter(m => m.id !== optimisticMessage.id));
    state.setWaitingToStartStreaming(false);
    state.setStreamingRoundNumber(null);
    state.setNextParticipantToTrigger(null); // ✅ Must reset to allow retry
    state.setConfigChangeRoundNumber(null);

    // Verify ALL streaming state flags are reset
    expect(getStoreState(store).messages).toHaveLength(3); // Back to R0 only
    expect(getStoreState(store).waitingToStartStreaming).toBe(false);
    expect(getStoreState(store).streamingRoundNumber).toBeNull();
    expect(getStoreState(store).nextParticipantToTrigger).toBeNull();
    expect(getStoreState(store).configChangeRoundNumber).toBeNull();
    expect(getStoreState(store).isStreaming).toBe(false);

    // User can submit again - all flags clean
    const retryMessage = createTestUserMessage({
      id: 'retry-after-cleanup',
      content: 'Retry submission',
      roundNumber: 1,
    });

    state.setMessages(prevMessages => [...prevMessages, retryMessage]);
    state.setWaitingToStartStreaming(true);
    state.setStreamingRoundNumber(1);
    state.setNextParticipantToTrigger(0);

    expect(getStoreState(store).messages).toHaveLength(4);
    expect(getStoreState(store).waitingToStartStreaming).toBe(true);
  });

  it('handles PATCH error with web search - cleans up pre-search placeholder', () => {
    // Enable web search for this test
    const state = getStoreState(store);
    state.setThread(createMockThread({ id: 'thread-456', enableWebSearch: true }));

    // User submits Round 1 message with web search enabled
    const optimisticMessage = createTestUserMessage({
      id: 'optimistic-with-presearch',
      content: 'Query with web search',
      roundNumber: 1,
    });

    state.setMessages(prevMessages => [...prevMessages, optimisticMessage]);

    // Pre-search placeholder added (before PATCH)
    state.addPreSearch({
      id: 'presearch-r1-placeholder',
      threadId: 'thread-456',
      roundNumber: 1,
      status: MessageStatuses.PENDING,
      userQuery: 'Query with web search',
      searchData: null,
      errorMessage: null,
      createdAt: new Date(),
      completedAt: null,
    } as StoredPreSearch);

    state.setStreamingRoundNumber(1);
    state.setWaitingToStartStreaming(true);
    state.setConfigChangeRoundNumber(1);

    expect(getStoreState(store).messages).toHaveLength(4); // 3 from R0 + 1 optimistic
    expect(getStoreState(store).preSearches).toHaveLength(1);
    expect(getStoreState(store).preSearches[0]?.status).toBe(MessageStatuses.PENDING);

    // === PATCH FAILS ===
    // Remove optimistic message
    state.setMessages(prevMessages => prevMessages.filter(m => m.id !== optimisticMessage.id));

    // ✅ CRITICAL: Remove pre-search placeholder on error
    // Without this, user sees stale "Searching..." UI on retry
    state.removePreSearch(1);

    // Reset streaming state
    state.setWaitingToStartStreaming(false);
    state.setStreamingRoundNumber(null);
    state.setNextParticipantToTrigger(null);
    state.setConfigChangeRoundNumber(null);

    // Verify pre-search placeholder removed
    expect(getStoreState(store).messages).toHaveLength(3); // Back to R0 only
    expect(getStoreState(store).preSearches).toHaveLength(0); // ✅ Cleaned up
    expect(getStoreState(store).waitingToStartStreaming).toBe(false);
    expect(getStoreState(store).streamingRoundNumber).toBeNull();
    expect(getStoreState(store).configChangeRoundNumber).toBeNull();

    // User can retry - no lingering pre-search UI
    const retryMessage = createTestUserMessage({
      id: 'retry-with-presearch',
      content: 'Retry with web search',
      roundNumber: 1,
    });

    state.setMessages(prevMessages => [...prevMessages, retryMessage]);

    // Fresh pre-search placeholder for retry
    state.addPreSearch({
      id: 'presearch-r1-retry',
      threadId: 'thread-456',
      roundNumber: 1,
      status: MessageStatuses.PENDING,
      userQuery: 'Retry with web search',
      searchData: null,
      errorMessage: null,
      createdAt: new Date(),
      completedAt: null,
    } as StoredPreSearch);

    expect(getStoreState(store).messages).toHaveLength(4);
    expect(getStoreState(store).preSearches).toHaveLength(1);
    expect(getStoreState(store).preSearches[0]?.id).toBe('presearch-r1-retry');
  });

  it('handles PATCH error - no lingering UI elements or state pollution', () => {
    const state = getStoreState(store);

    // User submits Round 1 message (full optimistic setup)
    const optimisticMessage = createTestUserMessage({
      id: 'optimistic-ui-check',
      content: 'UI pollution test',
      roundNumber: 1,
    });

    state.setMessages(prevMessages => [...prevMessages, optimisticMessage]);
    state.setStreamingRoundNumber(1);
    state.setWaitingToStartStreaming(true);
    state.setConfigChangeRoundNumber(1);
    state.setNextParticipantToTrigger(0);
    state.setIsWaitingForChangelog(false); // Set to false initially

    const preErrorState = {
      messagesLength: getStoreState(store).messages.length,
      waitingToStartStreaming: getStoreState(store).waitingToStartStreaming,
      streamingRoundNumber: getStoreState(store).streamingRoundNumber,
      configChangeRoundNumber: getStoreState(store).configChangeRoundNumber,
      nextParticipantToTrigger: getStoreState(store).nextParticipantToTrigger,
    };

    expect(preErrorState.messagesLength).toBe(4);
    expect(preErrorState.waitingToStartStreaming).toBe(true);
    expect(preErrorState.streamingRoundNumber).toBe(1);
    expect(preErrorState.configChangeRoundNumber).toBe(1);
    expect(preErrorState.nextParticipantToTrigger).toBe(0);

    // === PATCH FAILS - COMPLETE CLEANUP ===
    state.setMessages(prevMessages => prevMessages.filter(m => m.id !== optimisticMessage.id));
    state.setWaitingToStartStreaming(false);
    state.setStreamingRoundNumber(null);
    state.setNextParticipantToTrigger(null);
    state.setConfigChangeRoundNumber(null);
    state.setIsWaitingForChangelog(false); // ✅ Ensure changelog flag cleared
    state.setError(null); // ✅ Clear any error state

    const postErrorState = {
      messagesLength: getStoreState(store).messages.length,
      waitingToStartStreaming: getStoreState(store).waitingToStartStreaming,
      streamingRoundNumber: getStoreState(store).streamingRoundNumber,
      configChangeRoundNumber: getStoreState(store).configChangeRoundNumber,
      nextParticipantToTrigger: getStoreState(store).nextParticipantToTrigger,
      isWaitingForChangelog: getStoreState(store).isWaitingForChangelog,
      error: getStoreState(store).error,
      isStreaming: getStoreState(store).isStreaming,
    };

    // ✅ VERIFY: All flags reset to allow submission
    expect(postErrorState.messagesLength).toBe(3); // Back to R0 only
    expect(postErrorState.waitingToStartStreaming).toBe(false);
    expect(postErrorState.streamingRoundNumber).toBeNull();
    expect(postErrorState.configChangeRoundNumber).toBeNull();
    expect(postErrorState.nextParticipantToTrigger).toBeNull();
    expect(postErrorState.isWaitingForChangelog).toBe(false);
    expect(postErrorState.error).toBeNull();
    expect(postErrorState.isStreaming).toBe(false);

    // ✅ VERIFY: User can retry submission immediately
    const canRetry = !postErrorState.waitingToStartStreaming
      && !postErrorState.isStreaming
      && postErrorState.streamingRoundNumber === null
      && postErrorState.configChangeRoundNumber === null;

    expect(canRetry).toBe(true);
  });

  it('handles PATCH 400 error - validation failure removes optimistic message', () => {
    const state = getStoreState(store);

    // Invalid message (e.g., too long, empty after trimming, etc.)
    const invalidOptimisticMessage = createTestUserMessage({
      id: 'optimistic-invalid',
      content: '', // Empty content (validation error)
      roundNumber: 1,
    });

    state.setMessages(prevMessages => [...prevMessages, invalidOptimisticMessage]);
    state.setWaitingToStartStreaming(true);
    state.setStreamingRoundNumber(1);

    expect(getStoreState(store).messages).toHaveLength(4);

    // === PATCH FAILS (400 Bad Request - Validation Error) ===
    // Rollback optimistic message
    state.setMessages(prevMessages => prevMessages.filter(m => m.id !== invalidOptimisticMessage.id));
    state.setWaitingToStartStreaming(false);
    state.setStreamingRoundNumber(null);

    expect(getStoreState(store).messages).toHaveLength(3); // R0 only
    expect(getStoreState(store).waitingToStartStreaming).toBe(false);
  });

  it('handles PATCH timeout - removes optimistic message after timeout', () => {
    const state = getStoreState(store);

    const optimisticMessage = createTestUserMessage({
      id: 'optimistic-timeout',
      content: 'Question that times out',
      roundNumber: 1,
    });

    state.setMessages(prevMessages => [...prevMessages, optimisticMessage]);
    state.setWaitingToStartStreaming(true);
    state.setConfigChangeRoundNumber(1);

    // Simulate timeout (PATCH never completes)
    // After timeout, frontend gives up and rolls back
    state.setMessages(prevMessages => prevMessages.filter(m => m.id !== optimisticMessage.id));
    state.setWaitingToStartStreaming(false);
    state.setConfigChangeRoundNumber(null);

    expect(getStoreState(store).messages).toHaveLength(3);
    expect(getStoreState(store).waitingToStartStreaming).toBe(false);
  });
});

// ============================================================================
// CHANGELOG FETCH FAILURE - TIMEOUT AND CONTINUE
// ============================================================================

describe('changelog Fetch Failure - Round 1+', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    const state = getStoreState(store);
    state.setThread(createMockThread({ id: 'thread-789' }));
    state.setParticipants(createMockParticipants(2, 'thread-789'));
    state.setScreenMode(ScreenModes.THREAD);

    // Round 0 complete
    state.setMessages([
      createTestUserMessage({ id: 'r0_user', content: 'Q0', roundNumber: 0 }),
      createTestAssistantMessage({
        id: 'r0_p0',
        content: 'A0',
        roundNumber: 0,
        participantId: 'participant-0',
        participantIndex: 0,
        finishReason: FinishReasons.STOP,
      }),
    ]);
  });

  it('changelog fetch times out - streaming continues after timeout', () => {
    const state = getStoreState(store);

    // User changes config (adds participant, changes mode, etc.)
    state.setHasPendingConfigChanges(true);

    // Submit Round 1 with config changes
    const r1UserMessage = createTestUserMessage({
      id: 'r1_user',
      content: 'Q1 with config changes',
      roundNumber: 1,
    });

    state.setMessages(prevMessages => [...prevMessages, r1UserMessage]);
    state.setIsWaitingForChangelog(true); // Waiting for changelog to fetch
    state.setConfigChangeRoundNumber(1);

    expect(getStoreState(store).isWaitingForChangelog).toBe(true);

    // === CHANGELOG FETCH TIMES OUT (10s timeout from FLOW_DOCUMENTATION.md) ===
    // Timeout protection: clear waiting flag and continue
    state.setIsWaitingForChangelog(false);
    state.setConfigChangeRoundNumber(null);

    // Streaming can now proceed (even without changelog)
    expect(getStoreState(store).isWaitingForChangelog).toBe(false);
    expect(getStoreState(store).configChangeRoundNumber).toBeNull();

    // Participants start streaming
    state.setIsStreaming(true);
    state.setStreamingRoundNumber(1);

    expect(getStoreState(store).isStreaming).toBe(true);
  });

  it('changelog fetch fails with error - streaming continues anyway', () => {
    const state = getStoreState(store);

    state.setHasPendingConfigChanges(true);
    state.setIsWaitingForChangelog(true);
    state.setConfigChangeRoundNumber(1);

    // === CHANGELOG FETCH FAILS (network error, 500, etc.) ===
    // Clear waiting flag and allow streaming to continue
    state.setIsWaitingForChangelog(false);
    state.setConfigChangeRoundNumber(null);

    expect(getStoreState(store).isWaitingForChangelog).toBe(false);

    // Streaming proceeds
    state.setIsStreaming(true);
    expect(getStoreState(store).isStreaming).toBe(true);
  });
});

// ============================================================================
// PRE-SEARCH FAILURE - MARK AS FAILED AND CONTINUE
// ============================================================================

describe('pre-Search Failure - Round 1+', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    const state = getStoreState(store);
    state.setThread(createMockThread({ id: 'thread-abc', enableWebSearch: true }));
    state.setParticipants(createMockParticipants(3, 'thread-abc'));
    state.setScreenMode(ScreenModes.THREAD);

    // Round 0 complete (with successful pre-search)
    state.addPreSearch({
      id: 'presearch-r0',
      threadId: 'thread-abc',
      roundNumber: 0,
      status: MessageStatuses.COMPLETE,
      userQuery: 'Initial query',
      searchData: {
        queries: [{ query: 'test', rationale: 'test', searchDepth: 'basic' as const, index: 0, total: 1 }],
        results: [],
        moderatorSummary: 'Summary',
        successCount: 1,
        failureCount: 0,
        totalResults: 5,
        totalTime: 3000,
      },
      errorMessage: null,
      createdAt: new Date(),
      completedAt: new Date(),
    } as StoredPreSearch);

    state.setMessages([
      createTestUserMessage({ id: 'r0_user', content: 'Q0', roundNumber: 0 }),
      createTestAssistantMessage({
        id: 'r0_p0',
        content: 'A0',
        roundNumber: 0,
        participantId: 'participant-0',
        participantIndex: 0,
        finishReason: FinishReasons.STOP,
      }),
    ]);
  });

  it('pre-search streaming error - marks as FAILED and participants continue', () => {
    const state = getStoreState(store);

    // Round 1 with web search enabled
    const r1UserMessage = createTestUserMessage({
      id: 'r1_user',
      content: 'Q1 with web search',
      roundNumber: 1,
    });

    state.setMessages(prevMessages => [...prevMessages, r1UserMessage]);

    // Pre-search starts
    state.addPreSearch({
      id: 'presearch-r1',
      threadId: 'thread-abc',
      roundNumber: 1,
      status: MessageStatuses.PENDING,
      userQuery: 'Q1 with web search',
      searchData: undefined,
      errorMessage: null,
      createdAt: new Date(),
      completedAt: null,
    } as StoredPreSearch);

    // Pre-search transitions to streaming
    state.updatePreSearchStatus(1, MessageStatuses.STREAMING);

    // === PRE-SEARCH STREAMING ERROR ===
    // Update pre-search to FAILED status directly
    state.setPreSearches([
      ...getStoreState(store).preSearches.slice(0, 1),
      {
        ...getStoreState(store).preSearches[1]!,
        status: MessageStatuses.FAILED,
        errorMessage: 'Search API timeout',
      },
    ]);

    expect(getStoreState(store).preSearches[1]?.status).toBe(MessageStatuses.FAILED);
    expect(getStoreState(store).preSearches[1]?.errorMessage).toBe('Search API timeout');

    // Participants STILL start streaming (pre-search failure non-blocking)
    state.setIsStreaming(true);
    state.setStreamingRoundNumber(1);

    expect(getStoreState(store).isStreaming).toBe(true);

    // Participants stream without search context
    const r1P0 = createTestAssistantMessage({
      id: 'r1_p0',
      content: 'Response without search results',
      roundNumber: 1,
      participantId: 'participant-0',
      participantIndex: 0,
      finishReason: FinishReasons.STOP,
    });

    state.setMessages(prevMessages => [...prevMessages, r1P0]);

    expect(getStoreState(store).messages).toHaveLength(4); // r0_user, r0_p0, r1_user, r1_p0 = 4 total
  });

  it('pre-search timeout - marks as FAILED after 10s timeout', () => {
    const state = getStoreState(store);

    state.addPreSearch({
      id: 'presearch-timeout',
      threadId: 'thread-abc',
      roundNumber: 1,
      status: MessageStatuses.STREAMING,
      userQuery: 'Timeout query',
      searchData: undefined,
      errorMessage: null,
      createdAt: new Date(),
      completedAt: null,
    } as StoredPreSearch);

    // Simulate 10s timeout check
    // After timeout, mark as FAILED and continue
    state.setPreSearches([
      {
        ...getStoreState(store).preSearches[0]!,
        status: MessageStatuses.FAILED,
        errorMessage: 'Pre-search timed out after 10s',
      },
    ]);

    expect(getStoreState(store).preSearches[0]?.status).toBe(MessageStatuses.FAILED);

    // Streaming proceeds
    state.setIsStreaming(true);
    expect(getStoreState(store).isStreaming).toBe(true);
  });
});

// ============================================================================
// PARTICIPANT STREAMING FAILURE - CONTINUE WITH OTHERS
// ============================================================================

describe('participant Streaming Failure - Round 1+', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    const state = getStoreState(store);
    state.setThread(createMockThread({ id: 'thread-def' }));
    state.setParticipants(createMockParticipants(3, 'thread-def'));
    state.setScreenMode(ScreenModes.THREAD);

    // Round 0 complete
    state.setMessages([
      createTestUserMessage({ id: 'r0_user', content: 'Q0', roundNumber: 0 }),
      createTestAssistantMessage({
        id: 'r0_p0',
        content: 'A0',
        roundNumber: 0,
        participantId: 'participant-0',
        participantIndex: 0,
        finishReason: FinishReasons.STOP,
      }),
    ]);
  });

  it('p1 fails in Round 1 - P0 and P2 continue streaming', () => {
    const state = getStoreState(store);

    const r1UserMessage = createTestUserMessage({
      id: 'r1_user',
      content: 'Q1',
      roundNumber: 1,
    });

    state.setMessages(prevMessages => [...prevMessages, r1UserMessage]);
    state.setIsStreaming(true);
    state.setStreamingRoundNumber(1);

    // P0 succeeds
    const r1P0 = createTestAssistantMessage({
      id: 'r1_p0',
      content: 'P0 response',
      roundNumber: 1,
      participantId: 'participant-0',
      participantIndex: 0,
      finishReason: FinishReasons.STOP,
    });

    state.setMessages(prevMessages => [...prevMessages, r1P0]);
    state.setCurrentParticipantIndex(1);

    // P1 FAILS
    const r1P1Error = createTestAssistantMessage({
      id: 'r1_p1',
      content: 'Error: Rate limit exceeded',
      roundNumber: 1,
      participantId: 'participant-1',
      participantIndex: 1,
      finishReason: FinishReasons.ERROR,
      hasError: true,
    });

    state.setMessages(prevMessages => [...prevMessages, r1P1Error]);
    state.setCurrentParticipantIndex(2);

    // P2 CONTINUES despite P1 failure
    const r1P2 = createTestAssistantMessage({
      id: 'r1_p2',
      content: 'P2 response (after P1 error)',
      roundNumber: 1,
      participantId: 'participant-2',
      participantIndex: 2,
      finishReason: FinishReasons.STOP,
    });

    state.setMessages(prevMessages => [...prevMessages, r1P2]);

    // Verify round completes with partial results
    expect(getStoreState(store).messages).toHaveLength(6); // r0_user, r0_p0, r1_user, r1_p0, r1_p1, r1_p2 = 6 total
    expect(getStoreState(store).messages.find(m => m.id === 'r1_p1')?.metadata).toHaveProperty('hasError', true);
    expect(getStoreState(store).messages.find(m => m.id === 'r1_p2')?.metadata).toHaveProperty('finishReason', FinishReasons.STOP);
  });

  it('first participant (P0) fails in Round 1 - all others continue', () => {
    const state = getStoreState(store);

    const r1UserMessage = createTestUserMessage({
      id: 'r1_user',
      content: 'Q1',
      roundNumber: 1,
    });

    state.setMessages(prevMessages => [...prevMessages, r1UserMessage]);
    state.setIsStreaming(true);
    state.setStreamingRoundNumber(1);

    // P0 FAILS (first participant)
    const r1P0Error = createTestAssistantMessage({
      id: 'r1_p0',
      content: '',
      roundNumber: 1,
      participantId: 'participant-0',
      participantIndex: 0,
      finishReason: FinishReasons.ERROR,
      hasError: true,
    });

    state.setMessages(prevMessages => [...prevMessages, r1P0Error]);
    state.setCurrentParticipantIndex(1);

    // P1 and P2 continue
    const r1P1 = createTestAssistantMessage({
      id: 'r1_p1',
      content: 'P1 success',
      roundNumber: 1,
      participantId: 'participant-1',
      participantIndex: 1,
      finishReason: FinishReasons.STOP,
    });

    const r1P2 = createTestAssistantMessage({
      id: 'r1_p2',
      content: 'P2 success',
      roundNumber: 1,
      participantId: 'participant-2',
      participantIndex: 2,
      finishReason: FinishReasons.STOP,
    });

    state.setMessages(prevMessages => [...prevMessages, r1P1, r1P2]);

    expect(getStoreState(store).messages).toHaveLength(6); // 2 from R0 + 4 from R1
    expect(getStoreState(store).messages[3]?.metadata).toHaveProperty('hasError', true); // P0 error
  });

  it('last participant (P2) fails in Round 1 - round completes anyway', () => {
    const state = getStoreState(store);

    const r1UserMessage = createTestUserMessage({
      id: 'r1_user',
      content: 'Q1',
      roundNumber: 1,
    });

    state.setMessages(prevMessages => [...prevMessages, r1UserMessage]);
    state.setIsStreaming(true);
    state.setStreamingRoundNumber(1);

    // P0 and P1 succeed
    const r1P0 = createTestAssistantMessage({
      id: 'r1_p0',
      content: 'P0 success',
      roundNumber: 1,
      participantId: 'participant-0',
      participantIndex: 0,
      finishReason: FinishReasons.STOP,
    });

    const r1P1 = createTestAssistantMessage({
      id: 'r1_p1',
      content: 'P1 success',
      roundNumber: 1,
      participantId: 'participant-1',
      participantIndex: 1,
      finishReason: FinishReasons.STOP,
    });

    state.setMessages(prevMessages => [...prevMessages, r1P0, r1P1]);
    state.setCurrentParticipantIndex(2);

    // P2 FAILS (last participant)
    const r1P2Error = createTestAssistantMessage({
      id: 'r1_p2',
      content: 'Partial response before timeout...',
      roundNumber: 1,
      participantId: 'participant-2',
      participantIndex: 2,
      finishReason: FinishReasons.ERROR,
      hasError: true,
    });

    state.setMessages(prevMessages => [...prevMessages, r1P2Error]);

    // Round completes
    state.completeStreaming();

    expect(getStoreState(store).isStreaming).toBe(false);
    expect(getStoreState(store).messages).toHaveLength(6); // 2 from R0 + 4 from R1
  });
});

// ============================================================================
// MODERATOR FAILURE - ROUND COMPLETES ANYWAY
// ============================================================================

describe('moderator Failure - Round 1+', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    const state = getStoreState(store);
    state.setThread(createMockThread({ id: 'thread-ghi' }));
    state.setParticipants(createMockParticipants(2, 'thread-ghi'));
    state.setScreenMode(ScreenModes.THREAD);

    // Round 0 complete with moderator
    state.setMessages([
      createTestUserMessage({ id: 'r0_user', content: 'Q0', roundNumber: 0 }),
      createTestAssistantMessage({
        id: 'r0_p0',
        content: 'A0',
        roundNumber: 0,
        participantId: 'participant-0',
        participantIndex: 0,
        finishReason: FinishReasons.STOP,
      }),
    ]);
    state.tryMarkModeratorCreated(0);
  });

  it('moderator fails in Round 1 - conversation can continue to Round 2', () => {
    const state = getStoreState(store);

    // Round 1 participants complete
    const r1Messages = [
      createTestUserMessage({ id: 'r1_user', content: 'Q1', roundNumber: 1 }),
      createTestAssistantMessage({
        id: 'r1_p0',
        content: 'A1',
        roundNumber: 1,
        participantId: 'participant-0',
        participantIndex: 0,
        finishReason: FinishReasons.STOP,
      }),
      createTestAssistantMessage({
        id: 'r1_p1',
        content: 'A1-P1',
        roundNumber: 1,
        participantId: 'participant-1',
        participantIndex: 1,
        finishReason: FinishReasons.STOP,
      }),
    ];

    state.setMessages(prevMessages => [...prevMessages, ...r1Messages]);

    // Moderator creation attempted
    state.tryMarkModeratorCreated(1);
    state.setIsModeratorStreaming(true);

    // === MODERATOR FAILS ===
    state.setIsModeratorStreaming(false);
    state.setError(new Error('Moderator generation failed'));

    expect(getStoreState(store).isModeratorStreaming).toBe(false);
    expect(getStoreState(store).error).not.toBeNull();

    // Clear error (user acknowledges failure)
    state.setError(null);

    // User can continue to Round 2 (moderator failure non-blocking)
    const r2UserMessage = createTestUserMessage({
      id: 'r2_user',
      content: 'Q2',
      roundNumber: 2,
    });

    state.setMessages(prevMessages => [...prevMessages, r2UserMessage]);
    state.setIsStreaming(true);
    state.setStreamingRoundNumber(2);

    expect(getStoreState(store).isStreaming).toBe(true);
    expect(getStoreState(store).streamingRoundNumber).toBe(2);
  });

  it('moderator retry works after initial failure', () => {
    const state = getStoreState(store);

    // Round 1 complete
    state.setMessages([
      createTestUserMessage({ id: 'r1_user', content: 'Q1', roundNumber: 1 }),
      createTestAssistantMessage({
        id: 'r1_p0',
        content: 'A1',
        roundNumber: 1,
        participantId: 'participant-0',
        participantIndex: 0,
        finishReason: FinishReasons.STOP,
      }),
    ]);

    // Moderator fails
    state.tryMarkModeratorCreated(1);
    state.setIsModeratorStreaming(true);
    state.setIsModeratorStreaming(false); // Failed

    // Clear tracking to allow retry
    state.clearModeratorTracking(1);

    expect(state.hasModeratorBeenCreated(1)).toBe(false);

    // Retry moderator
    const canRetry = state.tryMarkModeratorCreated(1);
    expect(canRetry).toBe(true);
    expect(state.hasModeratorBeenCreated(1)).toBe(true);
  });
});

// ============================================================================
// MULTIPLE ERRORS IN SAME ROUND
// ============================================================================

describe('multiple Errors in Same Round - Round 1+', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    const state = getStoreState(store);
    state.setThread(createMockThread({ id: 'thread-jkl', enableWebSearch: true }));
    state.setParticipants(createMockParticipants(3, 'thread-jkl'));
    state.setScreenMode(ScreenModes.THREAD);

    // Round 0 complete
    state.setMessages([
      createTestUserMessage({ id: 'r0_user', content: 'Q0', roundNumber: 0 }),
      createTestAssistantMessage({
        id: 'r0_p0',
        content: 'A0',
        roundNumber: 0,
        participantId: 'participant-0',
        participantIndex: 0,
        finishReason: FinishReasons.STOP,
      }),
    ]);
  });

  it('pre-search fails + participant fails - round still completes', () => {
    const state = getStoreState(store);

    const r1UserMessage = createTestUserMessage({
      id: 'r1_user',
      content: 'Q1',
      roundNumber: 1,
    });

    state.setMessages(prevMessages => [...prevMessages, r1UserMessage]);

    // === PRE-SEARCH FAILS ===
    state.addPreSearch({
      id: 'presearch-r1',
      threadId: 'thread-jkl',
      roundNumber: 1,
      status: MessageStatuses.FAILED,
      userQuery: 'Q1',
      searchData: undefined,
      errorMessage: 'Search API error',
      createdAt: new Date(),
      completedAt: null,
    } as StoredPreSearch);

    // Participants start (despite pre-search failure)
    state.setIsStreaming(true);
    state.setStreamingRoundNumber(1);

    // === P0 FAILS ===
    const r1P0Error = createTestAssistantMessage({
      id: 'r1_p0',
      content: 'Error',
      roundNumber: 1,
      participantId: 'participant-0',
      participantIndex: 0,
      finishReason: FinishReasons.ERROR,
      hasError: true,
    });

    state.setMessages(prevMessages => [...prevMessages, r1P0Error]);
    state.setCurrentParticipantIndex(1);

    // === P1 and P2 succeed ===
    const r1P1 = createTestAssistantMessage({
      id: 'r1_p1',
      content: 'P1 success',
      roundNumber: 1,
      participantId: 'participant-1',
      participantIndex: 1,
      finishReason: FinishReasons.STOP,
    });

    const r1P2 = createTestAssistantMessage({
      id: 'r1_p2',
      content: 'P2 success',
      roundNumber: 1,
      participantId: 'participant-2',
      participantIndex: 2,
      finishReason: FinishReasons.STOP,
    });

    state.setMessages(prevMessages => [...prevMessages, r1P1, r1P2]);

    // Round completes with pre-search failure + participant failure
    state.completeStreaming();

    expect(getStoreState(store).isStreaming).toBe(false);
    expect(getStoreState(store).preSearches[0]?.status).toBe(MessageStatuses.FAILED);
    expect(getStoreState(store).messages).toHaveLength(6); // 2 from R0 + 4 from R1
  });

  it('participant fails + moderator fails - conversation can continue', () => {
    const state = getStoreState(store);

    const r1UserMessage = createTestUserMessage({
      id: 'r1_user',
      content: 'Q1',
      roundNumber: 1,
    });

    state.setMessages(prevMessages => [...prevMessages, r1UserMessage]);
    state.setIsStreaming(true);
    state.setStreamingRoundNumber(1);

    // === P0 FAILS ===
    const r1P0Error = createTestAssistantMessage({
      id: 'r1_p0',
      content: 'Error',
      roundNumber: 1,
      participantId: 'participant-0',
      participantIndex: 0,
      finishReason: FinishReasons.ERROR,
      hasError: true,
    });

    state.setMessages(prevMessages => [...prevMessages, r1P0Error]);

    // P1 succeeds
    const r1P1 = createTestAssistantMessage({
      id: 'r1_p1',
      content: 'P1 success',
      roundNumber: 1,
      participantId: 'participant-1',
      participantIndex: 1,
      finishReason: FinishReasons.STOP,
    });

    state.setMessages(prevMessages => [...prevMessages, r1P1]);
    state.completeStreaming();

    // === MODERATOR FAILS ===
    state.tryMarkModeratorCreated(1);
    state.setIsModeratorStreaming(true);
    state.setIsModeratorStreaming(false); // Failed
    state.setError(new Error('Moderator error'));

    // Clear error
    state.setError(null);

    // User can submit Round 2 (both failures non-blocking)
    const r2UserMessage = createTestUserMessage({
      id: 'r2_user',
      content: 'Q2',
      roundNumber: 2,
    });

    state.setMessages(prevMessages => [...prevMessages, r2UserMessage]);

    expect(getStoreState(store).messages).toHaveLength(6); // 2 from R0, 3 from R1, 1 from R2
  });
});

// ============================================================================
// RECOVERY FROM ERROR STATE - CAN SUBMIT AGAIN
// ============================================================================

describe('recovery from Error State - Round 1+', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    const state = getStoreState(store);
    state.setThread(createMockThread({ id: 'thread-mno' }));
    state.setParticipants(createMockParticipants(2, 'thread-mno'));
    state.setScreenMode(ScreenModes.THREAD);

    // Round 0 complete
    state.setMessages([
      createTestUserMessage({ id: 'r0_user', content: 'Q0', roundNumber: 0 }),
      createTestAssistantMessage({
        id: 'r0_p0',
        content: 'A0',
        roundNumber: 0,
        participantId: 'participant-0',
        participantIndex: 0,
        finishReason: FinishReasons.STOP,
      }),
    ]);
  });

  it('after PATCH failure - user can resubmit message', () => {
    const state = getStoreState(store);

    // PATCH fails (optimistic message rolled back)
    const optimisticMessage = createTestUserMessage({
      id: 'optimistic-fail',
      content: 'Failed message',
      roundNumber: 1,
    });

    state.setMessages(prevMessages => [...prevMessages, optimisticMessage]);
    state.setWaitingToStartStreaming(true);

    // Rollback on error
    state.setMessages(prevMessages => prevMessages.filter(m => m.id !== optimisticMessage.id));
    state.setWaitingToStartStreaming(false);
    state.setError(null);

    // Verify state is clean for retry
    expect(getStoreState(store).messages).toHaveLength(2); // R0 only
    expect(getStoreState(store).waitingToStartStreaming).toBe(false);
    expect(getStoreState(store).error).toBeNull();

    // User can submit again
    const retryMessage = createTestUserMessage({
      id: 'r1_user_retry',
      content: 'Retry message',
      roundNumber: 1,
    });

    state.setMessages(prevMessages => [...prevMessages, retryMessage]);
    state.setWaitingToStartStreaming(true);

    expect(getStoreState(store).messages).toHaveLength(3); // R0 + retry
    expect(getStoreState(store).waitingToStartStreaming).toBe(true);
  });

  it('after participant streaming error - user can submit next round', () => {
    const state = getStoreState(store);

    // Round 1 with participant error
    const r1Messages = [
      createTestUserMessage({ id: 'r1_user', content: 'Q1', roundNumber: 1 }),
      createTestAssistantMessage({
        id: 'r1_p0',
        content: 'Error',
        roundNumber: 1,
        participantId: 'participant-0',
        participantIndex: 0,
        finishReason: FinishReasons.ERROR,
        hasError: true,
      }),
    ];

    state.setMessages(prevMessages => [...prevMessages, ...r1Messages]);
    state.setIsStreaming(true);
    state.completeStreaming();
    state.setError(null);

    // Verify state is clean
    expect(getStoreState(store).isStreaming).toBe(false);
    expect(getStoreState(store).error).toBeNull();

    // User can submit Round 2
    const r2UserMessage = createTestUserMessage({
      id: 'r2_user',
      content: 'Q2',
      roundNumber: 2,
    });

    state.setMessages(prevMessages => [...prevMessages, r2UserMessage]);
    state.setIsStreaming(true);
    state.setStreamingRoundNumber(2);

    expect(getStoreState(store).isStreaming).toBe(true);
    expect(getStoreState(store).streamingRoundNumber).toBe(2);
  });

  it('state cleanup after errors - all flags reset', () => {
    const state = getStoreState(store);

    // Set up error state
    state.setIsStreaming(true);
    state.setStreamingRoundNumber(1);
    state.setWaitingToStartStreaming(true);
    state.setIsModeratorStreaming(true);
    state.setIsWaitingForChangelog(true);
    state.setError(new Error('Test error'));

    // Complete streaming (cleanup)
    state.completeStreaming();
    state.setIsModeratorStreaming(false);
    state.setIsWaitingForChangelog(false);
    state.setError(null);

    // Verify all flags cleared
    expect(getStoreState(store).isStreaming).toBe(false);
    expect(getStoreState(store).streamingRoundNumber).toBeNull();
    expect(getStoreState(store).waitingToStartStreaming).toBe(false);
    expect(getStoreState(store).isModeratorStreaming).toBe(false);
    expect(getStoreState(store).isWaitingForChangelog).toBe(false);
    expect(getStoreState(store).error).toBeNull();
  });
});

// ============================================================================
// NETWORK INTERRUPTION RECOVERY
// ============================================================================

describe('network Interruption Recovery - Round 1+', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    const state = getStoreState(store);
    state.setThread(createMockThread({ id: 'thread-pqr' }));
    state.setParticipants(createMockParticipants(2, 'thread-pqr'));
    state.setScreenMode(ScreenModes.THREAD);

    // Round 0 complete
    state.setMessages([
      createTestUserMessage({ id: 'r0_user', content: 'Q0', roundNumber: 0 }),
      createTestAssistantMessage({
        id: 'r0_p0',
        content: 'A0',
        roundNumber: 0,
        participantId: 'participant-0',
        participantIndex: 0,
        finishReason: FinishReasons.STOP,
      }),
    ]);
  });

  it('network disconnect during streaming - preserves partial content', () => {
    const state = getStoreState(store);

    const r1UserMessage = createTestUserMessage({
      id: 'r1_user',
      content: 'Q1',
      roundNumber: 1,
    });

    state.setMessages(prevMessages => [...prevMessages, r1UserMessage]);
    state.setIsStreaming(true);
    state.setStreamingRoundNumber(1);

    // P0 starts streaming, then network disconnects mid-response
    const r1P0Partial = createTestAssistantMessage({
      id: 'r1_p0',
      content: 'Partial response before disconnect...',
      roundNumber: 1,
      participantId: 'participant-0',
      participantIndex: 0,
      finishReason: FinishReasons.UNKNOWN, // Unknown = incomplete
    });

    state.setMessages(prevMessages => [...prevMessages, r1P0Partial]);

    // === NETWORK DISCONNECT ===
    state.completeStreaming();
    state.setError(new Error('Network disconnected'));

    // Partial content preserved
    expect(getStoreState(store).messages).toHaveLength(4); // r0_user, r0_p0, r1_user, r1_p0 = 4 total
    expect(getStoreState(store).messages[3]?.parts?.[0]).toEqual({
      type: 'text',
      text: 'Partial response before disconnect...',
    });
  });

  it('network reconnect - page reload syncs state from server', () => {
    const state = getStoreState(store);

    // Simulate page reload after network issue
    // Clear all client state
    state.resetForThreadNavigation();

    expect(getStoreState(store).messages).toHaveLength(0);
    expect(getStoreState(store).isStreaming).toBe(false);
    expect(getStoreState(store).error).toBeNull();

    // Reload from server (simulated)
    const serverMessages = [
      createTestUserMessage({ id: 'r0_user', content: 'Q0', roundNumber: 0 }),
      createTestAssistantMessage({
        id: 'r0_p0',
        content: 'A0',
        roundNumber: 0,
        participantId: 'participant-0',
        participantIndex: 0,
        finishReason: FinishReasons.STOP,
      }),
      createTestUserMessage({ id: 'r1_user', content: 'Q1', roundNumber: 1 }),
      createTestAssistantMessage({
        id: 'r1_p0',
        content: 'Completed response (from server)',
        roundNumber: 1,
        participantId: 'participant-0',
        participantIndex: 0,
        finishReason: FinishReasons.STOP,
      }),
    ];

    state.setMessages(serverMessages);

    // State synced from server
    expect(getStoreState(store).messages).toHaveLength(4);
  });
});

// ============================================================================
// COMPLETE ERROR RECOVERY JOURNEY - ROUND 1+
// ============================================================================

describe('complete Error Recovery Journey - Round 1+', () => {
  it('handles multiple consecutive errors across rounds and recovers', () => {
    const store = createChatStore();
    const state = getStoreState(store);

    // === SETUP ===
    state.setThread(createMockThread({ id: 'thread-stu', enableWebSearch: true }));
    state.setParticipants(createMockParticipants(3, 'thread-stu'));
    state.setScreenMode(ScreenModes.THREAD);

    // === ROUND 0: Successful ===
    const r0Messages = [
      createTestUserMessage({ id: 'r0_user', content: 'Q0', roundNumber: 0 }),
      createTestAssistantMessage({
        id: 'r0_p0',
        content: 'A0',
        roundNumber: 0,
        participantId: 'participant-0',
        participantIndex: 0,
        finishReason: FinishReasons.STOP,
      }),
    ];
    state.setMessages(r0Messages);
    state.tryMarkModeratorCreated(0);

    // === ROUND 1: Pre-search fails, participants succeed, moderator fails ===
    const r1UserMessage = createTestUserMessage({
      id: 'r1_user',
      content: 'Q1',
      roundNumber: 1,
    });
    state.setMessages(prevMessages => [...prevMessages, r1UserMessage]);

    // Pre-search fails
    state.addPreSearch({
      id: 'presearch-r1',
      threadId: 'thread-stu',
      roundNumber: 1,
      status: MessageStatuses.FAILED,
      userQuery: 'Q1',
      searchData: undefined,
      errorMessage: 'Search timeout',
      createdAt: new Date(),
      completedAt: null,
    } as StoredPreSearch);

    // Participants proceed
    state.setIsStreaming(true);
    state.setStreamingRoundNumber(1);

    const r1P0 = createTestAssistantMessage({
      id: 'r1_p0',
      content: 'R1P0',
      roundNumber: 1,
      participantId: 'participant-0',
      participantIndex: 0,
      finishReason: FinishReasons.STOP,
    });

    const r1P1 = createTestAssistantMessage({
      id: 'r1_p1',
      content: 'R1P1',
      roundNumber: 1,
      participantId: 'participant-1',
      participantIndex: 1,
      finishReason: FinishReasons.STOP,
    });

    state.setMessages(prevMessages => [...prevMessages, r1P0, r1P1]);
    state.completeStreaming();

    // Moderator fails
    state.tryMarkModeratorCreated(1);
    state.setIsModeratorStreaming(true);
    state.setIsModeratorStreaming(false);
    state.setError(new Error('Moderator error'));
    state.setError(null); // Clear error

    expect(getStoreState(store).messages).toHaveLength(5); // 2 from R0, 3 from R1 (user + 2 participants)

    // === ROUND 2: Participant fails, round completes ===
    const r2UserMessage = createTestUserMessage({
      id: 'r2_user',
      content: 'Q2',
      roundNumber: 2,
    });
    state.setMessages(prevMessages => [...prevMessages, r2UserMessage]);

    state.setIsStreaming(true);
    state.setStreamingRoundNumber(2);

    // P0 fails
    const r2P0Error = createTestAssistantMessage({
      id: 'r2_p0',
      content: 'Error',
      roundNumber: 2,
      participantId: 'participant-0',
      participantIndex: 0,
      finishReason: FinishReasons.ERROR,
      hasError: true,
    });

    // P1 succeeds
    const r2P1 = createTestAssistantMessage({
      id: 'r2_p1',
      content: 'R2P1',
      roundNumber: 2,
      participantId: 'participant-1',
      participantIndex: 1,
      finishReason: FinishReasons.STOP,
    });

    state.setMessages(prevMessages => [...prevMessages, r2P0Error, r2P1]);
    state.completeStreaming();

    // === VERIFY RECOVERY ===
    expect(getStoreState(store).messages).toHaveLength(8); // 2 R0, 3 R1, 3 R2
    expect(getStoreState(store).isStreaming).toBe(false);
    expect(getStoreState(store).error).toBeNull();

    // === ROUND 3: Fully successful (recovery complete) ===
    const r3UserMessage = createTestUserMessage({
      id: 'r3_user',
      content: 'Q3',
      roundNumber: 3,
    });
    state.setMessages(prevMessages => [...prevMessages, r3UserMessage]);

    state.setIsStreaming(true);
    state.setStreamingRoundNumber(3);

    const r3P0 = createTestAssistantMessage({
      id: 'r3_p0',
      content: 'R3P0 success',
      roundNumber: 3,
      participantId: 'participant-0',
      participantIndex: 0,
      finishReason: FinishReasons.STOP,
    });

    const r3P1 = createTestAssistantMessage({
      id: 'r3_p1',
      content: 'R3P1 success',
      roundNumber: 3,
      participantId: 'participant-1',
      participantIndex: 1,
      finishReason: FinishReasons.STOP,
    });

    state.setMessages(prevMessages => [...prevMessages, r3P0, r3P1]);
    state.completeStreaming();

    // Moderator succeeds
    state.tryMarkModeratorCreated(3);
    expect(state.hasModeratorBeenCreated(3)).toBe(true);

    // === FINAL VERIFICATION ===
    expect(getStoreState(store).messages).toHaveLength(11); // 2 R0, 3 R1, 3 R2, 3 R3
    expect(getStoreState(store).isStreaming).toBe(false);
    expect(getStoreState(store).error).toBeNull();

    // Conversation successfully recovered from:
    // - Pre-search failure (R1)
    // - Moderator failure (R1)
    // - Participant failure (R2)
    // And continued to Round 3 with full success
  });
});
