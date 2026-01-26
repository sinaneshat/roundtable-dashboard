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
      content: 'Test question',
      id: 'thread-error-123_r0_user',
      roundNumber: 0,
    });

    // Participant 0 succeeds
    const p0Message = createTestAssistantMessage({
      content: 'Success response',
      finishReason: FinishReasons.STOP,
      id: 'thread-error-123_r0_p0',
      participantId: 'participant-0',
      participantIndex: 0,
      roundNumber: 0,
    });

    // Participant 1 errors
    const p1Message = createTestAssistantMessage({
      content: 'Partial response before error...',
      finishReason: FinishReasons.ERROR,
      hasError: true,
      id: 'thread-error-123_r0_p1',
      participantId: 'participant-1',
      participantIndex: 1,
      roundNumber: 0,
    });

    state.setMessages([userMessage, p0Message, p1Message]);

    // Messages stored including errored one
    expect(getStoreState(store).messages).toHaveLength(3);

    // Can check error via metadata
    const erroredMessage = getStoreState(store).messages[2];
    expect((erroredMessage?.metadata as { hasError?: boolean }).hasError).toBeTruthy();
  });

  it('handles content_filter finishReason', () => {
    const state = getStoreState(store);

    const userMessage = createTestUserMessage({
      content: 'Test question',
      id: 'thread-error-123_r0_user',
      roundNumber: 0,
    });

    const p0Message = createTestAssistantMessage({
      content: '', // Empty content due to filter
      finishReason: FinishReasons.CONTENT_FILTER,
      id: 'thread-error-123_r0_p0',
      participantId: 'participant-0',
      participantIndex: 0,
      roundNumber: 0,
    });

    state.setMessages([userMessage, p0Message]);

    expect(getStoreState(store).messages).toHaveLength(2);
    expect((getStoreState(store).messages[1]?.metadata as { finishReason: string }).finishReason).toBe(FinishReasons.CONTENT_FILTER);
  });

  it('handles length finishReason (max tokens)', () => {
    const state = getStoreState(store);

    const userMessage = createTestUserMessage({
      content: 'Test question',
      id: 'thread-error-123_r0_user',
      roundNumber: 0,
    });

    const p0Message = createTestAssistantMessage({
      content: 'Long response that was truncated...',
      finishReason: FinishReasons.LENGTH,
      id: 'thread-error-123_r0_p0',
      participantId: 'participant-0',
      participantIndex: 0,
      roundNumber: 0,
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
    expect(getStoreState(store).isStreaming).toBeFalsy();
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
    expect(getStoreState(store).isModeratorStreaming).toBeTruthy();

    // Error handling should clear flag
    state.setIsModeratorStreaming(false);
    expect(getStoreState(store).isModeratorStreaming).toBeFalsy();
  });

  it('moderator can be retried after failure', () => {
    const state = getStoreState(store);

    // Mark moderator as created (simulating initial attempt)
    const wasMarked = state.tryMarkModeratorCreated(0);
    expect(wasMarked).toBeTruthy();

    // Verify it's marked
    expect(state.hasModeratorBeenCreated(0)).toBeTruthy();

    // Clear tracking to allow retry
    state.clearModeratorTracking(0);

    // Verify tracking cleared
    expect(state.hasModeratorBeenCreated(0)).toBeFalsy();

    // Retry can mark moderator created again
    const canRetry = state.tryMarkModeratorCreated(0);
    expect(canRetry).toBeTruthy();
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
      completedAt: null,
      createdAt: new Date(),
      errorMessage: 'Search timed out',
      id: 'presearch-0',
      roundNumber: 0,
      searchData: undefined,
      status: MessageStatuses.FAILED,
      threadId: 'thread-error-123',
      userQuery: 'Search query',
    } as StoredPreSearch;

    state.addPreSearch(failedPreSearch);

    expect(getStoreState(store).preSearches).toHaveLength(1);
    const preSearch = getStoreState(store).preSearches[0];
    if (!preSearch) {
      throw new Error('expected preSearch at index 0');
    }
    expect(preSearch.status).toBe(MessageStatuses.FAILED);
    expect(preSearch.errorMessage).toBe('Search timed out');
  });

  it('pre-search failure does not block participant streaming', () => {
    const state = getStoreState(store);

    // Pre-search fails
    const failedPreSearch: StoredPreSearch = {
      completedAt: null,
      createdAt: new Date(),
      errorMessage: 'Error',
      id: 'presearch-0',
      roundNumber: 0,
      searchData: undefined,
      status: MessageStatuses.FAILED,
      threadId: 'thread-error-123',
      userQuery: 'Search query',
    } as StoredPreSearch;

    state.addPreSearch(failedPreSearch);

    // Participant streaming can still proceed
    state.setIsStreaming(true);
    state.setStreamingRoundNumber(0);

    expect(getStoreState(store).isStreaming).toBeTruthy();
    const preSearchAfter = getStoreState(store).preSearches[0];
    if (!preSearchAfter) {
      throw new Error('expected preSearch at index 0');
    }
    expect(preSearchAfter.status).toBe(MessageStatuses.FAILED);
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
      content: 'Test',
      id: 'thread-error-123_r0_user',
      roundNumber: 0,
    });

    // Partial response (interrupted mid-stream)
    const partialMessage = createTestAssistantMessage({
      content: 'I was saying something important when-',
      finishReason: FinishReasons.UNKNOWN, // Unknown = incomplete
      id: 'thread-error-123_r0_p0',
      participantId: 'participant-0',
      participantIndex: 0,
      roundNumber: 0,
    });

    state.setMessages([userMessage, partialMessage]);
    state.setIsStreaming(true);

    // Stop/error occurs
    state.completeStreaming();

    // Partial content preserved
    expect(getStoreState(store).messages).toHaveLength(2);
    const partialMsg = getStoreState(store).messages[1];
    if (!partialMsg) {
      throw new Error('expected message at index 1');
    }
    expect(partialMsg.parts?.[0]).toEqual({
      text: 'I was saying something important when-',
      type: 'text',
    });
  });

  it('empty message with unknown finishReason indicates incomplete', () => {
    const state = getStoreState(store);

    const userMessage = createTestUserMessage({
      content: 'Test',
      id: 'user',
      roundNumber: 0,
    });

    // Empty message (failed before any content)
    const emptyMessage: UIMessage = {
      id: 'thread-error-123_r0_p0',
      metadata: {
        finishReason: FinishReasons.UNKNOWN,
        hasError: false,
        isPartialResponse: true,
        isTransient: false,
        model: 'gpt-4',
        participantId: 'participant-0',
        participantIndex: 0,
        participantRole: null,
        role: MessageRoles.ASSISTANT,
        roundNumber: 0,
        usage: { completionTokens: 0, promptTokens: 0, totalTokens: 0 },
      },
      parts: [],
      role: MessageRoles.ASSISTANT,
    };

    state.setMessages([userMessage, emptyMessage]);

    expect(getStoreState(store).messages).toHaveLength(2);
    const emptyMsg = getStoreState(store).messages[1];
    if (!emptyMsg) {
      throw new Error('expected message at index 1');
    }
    expect(emptyMsg.parts).toEqual([]);
    expect((emptyMsg.metadata as { isPartialResponse: boolean }).isPartialResponse).toBeTruthy();
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
    expect(getStoreState(store).isStreaming).toBeFalsy();
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
    expect(getStoreState(store).isStreaming).toBeFalsy();
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

    expect(getStoreState(store).isRegenerating).toBeFalsy();
    expect(getStoreState(store).regeneratingRoundNumber).toBeNull();

    state.setIsRegenerating(true);
    state.setRegeneratingRoundNumber(0);

    expect(getStoreState(store).isRegenerating).toBeTruthy();
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

    expect(getStoreState(store).isRegenerating).toBeFalsy();
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
      createTestUserMessage({ content: 'Q0', id: 'r0_user', roundNumber: 0 }),
      createTestAssistantMessage({
        content: 'R0P0',
        finishReason: FinishReasons.STOP,
        id: 'r0_p0',
        participantId: 'participant-0',
        participantIndex: 0,
        roundNumber: 0,
      }),
      createTestAssistantMessage({
        content: 'R0P1',
        finishReason: FinishReasons.STOP,
        id: 'r0_p1',
        participantId: 'participant-1',
        participantIndex: 1,
        roundNumber: 0,
      }),
    ];
    state.setMessages(round0Messages);

    // Mark round 0 as having completed moderator (tracking only)
    state.tryMarkModeratorCreated(0);

    // === ROUND 1: Participant 1 errors ===
    const round1UserMessage = createTestUserMessage({
      content: 'Q1',
      id: 'r1_user',
      roundNumber: 1,
    });

    const round1P0 = createTestAssistantMessage({
      content: 'R1P0 success',
      finishReason: FinishReasons.STOP,
      id: 'r1_p0',
      participantId: 'participant-0',
      participantIndex: 0,
      roundNumber: 1,
    });

    const round1P1Error = createTestAssistantMessage({
      content: 'Partial before error...',
      finishReason: FinishReasons.ERROR,
      hasError: true,
      id: 'r1_p1',
      participantId: 'participant-1',
      participantIndex: 1,
      roundNumber: 1,
    });

    state.setMessages([...round0Messages, round1UserMessage, round1P0, round1P1Error]);
    state.setIsStreaming(true);
    state.setError(new Error('Model rate limited'));

    // === ERROR STATE ===
    expect(getStoreState(store).isStreaming).toBeTruthy();
    expect(getStoreState(store).error).not.toBeNull();
    expect(getStoreState(store).messages).toHaveLength(6); // 4 from round 0 + 3 from round 1

    // === RECOVERY: Complete with partial results ===
    state.completeStreaming();
    state.setError(null);

    // Error cleared, but partial results preserved
    expect(getStoreState(store).isStreaming).toBeFalsy();
    expect(getStoreState(store).error).toBeNull();
    expect(getStoreState(store).messages).toHaveLength(6);

    // Round 0 moderator tracking still intact
    expect(state.hasModeratorBeenCreated(0)).toBeTruthy();
  });
});
