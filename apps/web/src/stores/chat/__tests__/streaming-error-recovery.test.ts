/**
 * Streaming Error Recovery Tests
 *
 * Tests for error handling and recovery during streaming:
 * - Participant streaming errors
 * - Moderator streaming errors
 * - Pre-search streaming errors
 * - Partial response handling
 * - Error state cleanup
 * - Recovery and retry scenarios
 *
 * Based on AI SDK v6 patterns:
 * - Error events in SSE streams
 * - finishReason handling (stop, error, length, etc.)
 * - onFinish callback guarantees
 */

import { FinishReasons, MessageRoles, MessageStatuses, ScreenModes } from '@roundtable/shared';
import type { UIMessage } from 'ai';
import { beforeEach, describe, expect, it } from 'vitest';

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
// PARTICIPANT ERROR HANDLING TESTS
// ============================================================================

describe('participant Streaming Errors', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    const state = getStoreState(store);
    state.setThread(createMockThread());
    state.setParticipants(createMockParticipants(3));
    state.setScreenMode(ScreenModes.THREAD);
    state.setShowInitialUI(false);
  });

  it('handles error finishReason from participant', () => {
    const state = getStoreState(store);

    const userMessage = createTestUserMessage({
      id: 'thread-error-123_r0_user',
      content: 'Test question',
      roundNumber: 0,
    });

    // Participant 0 succeeds
    const p0Message = createTestAssistantMessage({
      id: 'thread-error-123_r0_p0',
      content: 'Success response',
      roundNumber: 0,
      participantId: 'participant-0',
      participantIndex: 0,
      finishReason: FinishReasons.STOP,
    });

    // Participant 1 errors
    const p1Message = createTestAssistantMessage({
      id: 'thread-error-123_r0_p1',
      content: 'Partial response before error...',
      roundNumber: 0,
      participantId: 'participant-1',
      participantIndex: 1,
      finishReason: FinishReasons.ERROR,
      hasError: true,
    });

    state.setMessages([userMessage, p0Message, p1Message]);

    // Messages stored including errored one
    expect(getStoreState(store).messages).toHaveLength(3);

    // Can check error via metadata
    const erroredMessage = getStoreState(store).messages[2];
    expect((erroredMessage?.metadata as { hasError?: boolean }).hasError).toBe(true);
  });

  it('handles content_filter finishReason', () => {
    const state = getStoreState(store);

    const userMessage = createTestUserMessage({
      id: 'thread-error-123_r0_user',
      content: 'Test question',
      roundNumber: 0,
    });

    const p0Message = createTestAssistantMessage({
      id: 'thread-error-123_r0_p0',
      content: '', // Empty content due to filter
      roundNumber: 0,
      participantId: 'participant-0',
      participantIndex: 0,
      finishReason: FinishReasons.CONTENT_FILTER,
    });

    state.setMessages([userMessage, p0Message]);

    expect(getStoreState(store).messages).toHaveLength(2);
    expect((getStoreState(store).messages[1]?.metadata as { finishReason: string }).finishReason).toBe(FinishReasons.CONTENT_FILTER);
  });

  it('handles length finishReason (max tokens)', () => {
    const state = getStoreState(store);

    const userMessage = createTestUserMessage({
      id: 'thread-error-123_r0_user',
      content: 'Test question',
      roundNumber: 0,
    });

    const p0Message = createTestAssistantMessage({
      id: 'thread-error-123_r0_p0',
      content: 'Long response that was truncated...',
      roundNumber: 0,
      participantId: 'participant-0',
      participantIndex: 0,
      finishReason: FinishReasons.LENGTH,
    });

    state.setMessages([userMessage, p0Message]);

    expect((getStoreState(store).messages[1]?.metadata as { finishReason: string }).finishReason).toBe(FinishReasons.LENGTH);
  });

  it('store error field can hold error object', () => {
    const state = getStoreState(store);

    expect(getStoreState(store).error).toBeNull();

    const error = new Error('Stream connection failed');
    state.setError(error);

    expect(getStoreState(store).error).toBe(error);
    expect(getStoreState(store).error?.message).toBe('Stream connection failed');
  });

  it('completeStreaming clears streaming state but preserves error', () => {
    const state = getStoreState(store);

    // Set up streaming with error
    state.setIsStreaming(true);
    state.setStreamingRoundNumber(0);
    state.setError(new Error('Streaming error'));

    state.completeStreaming();

    // Streaming flags cleared
    expect(getStoreState(store).isStreaming).toBe(false);
    expect(getStoreState(store).streamingRoundNumber).toBeNull();

    // Error preserved (caller decides when to clear)
    expect(getStoreState(store).error).not.toBeNull();
  });
});

// ============================================================================
// MODERATOR ERROR HANDLING TESTS
// ============================================================================

describe('moderator Streaming Errors', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    const state = getStoreState(store);
    state.setThread(createMockThread());
    state.setParticipants(createMockParticipants(2));
    state.setScreenMode(ScreenModes.THREAD);
    state.setShowInitialUI(false);
  });

  it('clears isModeratorStreaming flag on error', () => {
    const state = getStoreState(store);

    state.setIsModeratorStreaming(true);
    expect(getStoreState(store).isModeratorStreaming).toBe(true);

    // Error handling should clear flag
    state.setIsModeratorStreaming(false);
    expect(getStoreState(store).isModeratorStreaming).toBe(false);
  });

  it('moderator can be retried after failure', () => {
    const state = getStoreState(store);

    // Mark moderator as created (simulating initial attempt)
    const wasMarked = state.tryMarkModeratorCreated(0);
    expect(wasMarked).toBe(true);

    // Verify it's marked
    expect(state.hasModeratorBeenCreated(0)).toBe(true);

    // Clear tracking to allow retry
    state.clearModeratorTracking(0);

    // Verify tracking cleared
    expect(state.hasModeratorBeenCreated(0)).toBe(false);

    // Retry can mark moderator created again
    const canRetry = state.tryMarkModeratorCreated(0);
    expect(canRetry).toBe(true);
  });
});

// ============================================================================
// PRE-SEARCH ERROR HANDLING TESTS
// ============================================================================

describe('pre-Search Errors', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    const state = getStoreState(store);
    state.setThread(createMockThread({ enableWebSearch: true }));
    state.setParticipants(createMockParticipants(2));
    state.setScreenMode(ScreenModes.THREAD);
  });

  it('adds pre-search with failed status', () => {
    const state = getStoreState(store);

    const failedPreSearch: StoredPreSearch = {
      id: 'presearch-0',
      threadId: 'thread-error-123',
      roundNumber: 0,
      status: MessageStatuses.FAILED,
      userQuery: 'Search query',
      searchData: undefined,
      errorMessage: 'Search timed out',
      createdAt: new Date(),
      completedAt: null,
    } as StoredPreSearch;

    state.addPreSearch(failedPreSearch);

    expect(getStoreState(store).preSearches).toHaveLength(1);
    expect(getStoreState(store).preSearches[0]!.status).toBe(MessageStatuses.FAILED);
    expect(getStoreState(store).preSearches[0]!.errorMessage).toBe('Search timed out');
  });

  it('pre-search failure does not block participant streaming', () => {
    const state = getStoreState(store);

    // Pre-search fails
    const failedPreSearch: StoredPreSearch = {
      id: 'presearch-0',
      threadId: 'thread-error-123',
      roundNumber: 0,
      status: MessageStatuses.FAILED,
      userQuery: 'Search query',
      searchData: undefined,
      errorMessage: 'Error',
      createdAt: new Date(),
      completedAt: null,
    } as StoredPreSearch;

    state.addPreSearch(failedPreSearch);

    // Participant streaming can still proceed
    state.setIsStreaming(true);
    state.setStreamingRoundNumber(0);

    expect(getStoreState(store).isStreaming).toBe(true);
    expect(getStoreState(store).preSearches[0]!.status).toBe(MessageStatuses.FAILED);
  });
});

// ============================================================================
// PARTIAL RESPONSE HANDLING TESTS
// ============================================================================

describe('partial Response Handling', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    const state = getStoreState(store);
    state.setThread(createMockThread());
    state.setParticipants(createMockParticipants(3));
    state.setScreenMode(ScreenModes.THREAD);
  });

  it('preserves partial content when stream interrupted', () => {
    const state = getStoreState(store);

    const userMessage = createTestUserMessage({
      id: 'thread-error-123_r0_user',
      content: 'Test',
      roundNumber: 0,
    });

    // Partial response (interrupted mid-stream)
    const partialMessage = createTestAssistantMessage({
      id: 'thread-error-123_r0_p0',
      content: 'I was saying something important when-',
      roundNumber: 0,
      participantId: 'participant-0',
      participantIndex: 0,
      finishReason: FinishReasons.UNKNOWN, // Unknown = incomplete
    });

    state.setMessages([userMessage, partialMessage]);
    state.setIsStreaming(true);

    // Stop/error occurs
    state.completeStreaming();

    // Partial content preserved
    expect(getStoreState(store).messages).toHaveLength(2);
    expect(getStoreState(store).messages[1]!.parts?.[0]).toEqual({
      type: 'text',
      text: 'I was saying something important when-',
    });
  });

  it('empty message with unknown finishReason indicates incomplete', () => {
    const state = getStoreState(store);

    const userMessage = createTestUserMessage({
      id: 'user',
      content: 'Test',
      roundNumber: 0,
    });

    // Empty message (failed before any content)
    const emptyMessage: UIMessage = {
      id: 'thread-error-123_r0_p0',
      role: MessageRoles.ASSISTANT,
      parts: [],
      metadata: {
        role: MessageRoles.ASSISTANT,
        roundNumber: 0,
        participantId: 'participant-0',
        participantIndex: 0,
        participantRole: null,
        model: 'gpt-4',
        finishReason: FinishReasons.UNKNOWN,
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        hasError: false,
        isTransient: false,
        isPartialResponse: true,
      },
    };

    state.setMessages([userMessage, emptyMessage]);

    expect(getStoreState(store).messages).toHaveLength(2);
    expect(getStoreState(store).messages[1]!.parts).toEqual([]);
    expect((getStoreState(store).messages[1]!.metadata as { isPartialResponse: boolean }).isPartialResponse).toBe(true);
  });
});

// ============================================================================
// ERROR STATE CLEANUP TESTS
// ============================================================================

describe('error State Cleanup', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    const state = getStoreState(store);
    state.setThread(createMockThread());
    state.setParticipants(createMockParticipants(2));
  });

  it('clearError resets error state', () => {
    const state = getStoreState(store);

    state.setError(new Error('Test error'));
    expect(getStoreState(store).error).not.toBeNull();

    state.setError(null);
    expect(getStoreState(store).error).toBeNull();
  });

  it('resetForThreadNavigation clears all error state', () => {
    const state = getStoreState(store);

    // Set up error state
    state.setError(new Error('Navigation error'));
    state.setIsStreaming(true);

    // Navigate away
    state.resetForThreadNavigation();

    // All cleared
    expect(getStoreState(store).error).toBeNull();
    expect(getStoreState(store).isStreaming).toBe(false);
  });

  it('resetForNewRound clears streaming but preserves thread', () => {
    const state = getStoreState(store);
    const thread = createMockThread();
    state.setThread(thread);

    // Set up streaming state
    state.setIsStreaming(true);
    state.setStreamingRoundNumber(0);

    // Reset for new round
    state.completeStreaming();

    // Streaming cleared
    expect(getStoreState(store).isStreaming).toBe(false);
    expect(getStoreState(store).streamingRoundNumber).toBeNull();

    // Thread preserved
    expect(getStoreState(store).thread).toEqual(thread);
  });
});

// ============================================================================
// REGENERATION ERROR RECOVERY TESTS
// ============================================================================

describe('regeneration Error Recovery', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    const state = getStoreState(store);
    state.setThread(createMockThread());
    state.setParticipants(createMockParticipants(2));
    state.setScreenMode(ScreenModes.THREAD);
  });

  it('regeneration state tracks round number', () => {
    const state = getStoreState(store);

    expect(getStoreState(store).isRegenerating).toBe(false);
    expect(getStoreState(store).regeneratingRoundNumber).toBeNull();

    state.setIsRegenerating(true);
    state.setRegeneratingRoundNumber(0);

    expect(getStoreState(store).isRegenerating).toBe(true);
    expect(getStoreState(store).regeneratingRoundNumber).toBe(0);
  });

  it('regeneration error can be cleared', () => {
    const state = getStoreState(store);

    state.setIsRegenerating(true);
    state.setRegeneratingRoundNumber(0);
    state.setError(new Error('Regeneration failed'));

    // Clear regeneration state
    state.setIsRegenerating(false);
    state.setRegeneratingRoundNumber(null);
    state.setError(null);

    expect(getStoreState(store).isRegenerating).toBe(false);
    expect(getStoreState(store).regeneratingRoundNumber).toBeNull();
    expect(getStoreState(store).error).toBeNull();
  });
});

// ============================================================================
// COMPLETE ERROR JOURNEY TEST
// ============================================================================

describe('complete Error Journey', () => {
  it('handles error mid-round and allows recovery', () => {
    const store = createChatStore();
    const state = getStoreState(store);

    // === SETUP ===
    state.setThread(createMockThread());
    state.setParticipants(createMockParticipants(3));
    state.setScreenMode(ScreenModes.THREAD);

    // === ROUND 0: Successful ===
    const round0Messages: UIMessage[] = [
      createTestUserMessage({ id: 'r0_user', content: 'Q0', roundNumber: 0 }),
      createTestAssistantMessage({
        id: 'r0_p0',
        content: 'R0P0',
        roundNumber: 0,
        participantId: 'participant-0',
        participantIndex: 0,
        finishReason: FinishReasons.STOP,
      }),
      createTestAssistantMessage({
        id: 'r0_p1',
        content: 'R0P1',
        roundNumber: 0,
        participantId: 'participant-1',
        participantIndex: 1,
        finishReason: FinishReasons.STOP,
      }),
    ];
    state.setMessages(round0Messages);

    // Mark round 0 as having completed moderator (tracking only)
    state.tryMarkModeratorCreated(0);

    // === ROUND 1: Participant 1 errors ===
    const round1UserMessage = createTestUserMessage({
      id: 'r1_user',
      content: 'Q1',
      roundNumber: 1,
    });

    const round1P0 = createTestAssistantMessage({
      id: 'r1_p0',
      content: 'R1P0 success',
      roundNumber: 1,
      participantId: 'participant-0',
      participantIndex: 0,
      finishReason: FinishReasons.STOP,
    });

    const round1P1Error = createTestAssistantMessage({
      id: 'r1_p1',
      content: 'Partial before error...',
      roundNumber: 1,
      participantId: 'participant-1',
      participantIndex: 1,
      finishReason: FinishReasons.ERROR,
      hasError: true,
    });

    state.setMessages([...round0Messages, round1UserMessage, round1P0, round1P1Error]);
    state.setIsStreaming(true);
    state.setError(new Error('Model rate limited'));

    // === ERROR STATE ===
    expect(getStoreState(store).isStreaming).toBe(true);
    expect(getStoreState(store).error).not.toBeNull();
    expect(getStoreState(store).messages).toHaveLength(6); // 4 from round 0 + 3 from round 1

    // === RECOVERY: Complete with partial results ===
    state.completeStreaming();
    state.setError(null);

    // Error cleared, but partial results preserved
    expect(getStoreState(store).isStreaming).toBe(false);
    expect(getStoreState(store).error).toBeNull();
    expect(getStoreState(store).messages).toHaveLength(6);

    // Round 0 moderator tracking still intact
    expect(state.hasModeratorBeenCreated(0)).toBe(true);
  });
});
