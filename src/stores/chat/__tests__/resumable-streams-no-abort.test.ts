/**
 * Resumable Streams - No Abort Pattern Tests
 *
 * Tests validating the AI SDK v6 resumable streams implementation where:
 * 1. Streams NEVER abort on HTTP disconnect or navigation
 * 2. Backend streams continue in background via waitUntil()
 * 3. Page refresh at ANY point resumes from buffered KV chunks
 * 4. All participants complete their streams regardless of frontend state
 *
 * KEY PRINCIPLE: With resume: true in useChat hook, calling stop() is
 * incompatible with stream resumption. Streams must run to completion.
 *
 * Location: /src/stores/chat/__tests__/resumable-streams-no-abort.test.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ScreenModes, StreamStatuses } from '@/api/core/enums';
import { createChatStore } from '@/stores/chat/store';

import {
  createMockMessage,
  createMockParticipants,
  createMockThread,
  createMockUserMessage,
} from './test-factories';

// ============================================================================
// TEST UTILITIES
// ============================================================================

function createTestStore() {
  return createChatStore();
}

function generateStreamId(
  threadId: string,
  roundNumber: number,
  participantIndex: number,
): string {
  return `${threadId}_r${roundNumber}_p${participantIndex}`;
}

// ============================================================================
// SECTION 1: NO ABORT ON NAVIGATION
// ============================================================================

describe('no Abort on Navigation (Resumable Streams)', () => {
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
   * NOABORT-01: resetForThreadNavigation should NOT call stop()
   *
   * With resumable streams, navigation between threads should NOT abort
   * the ongoing stream. The backend stream continues via waitUntil().
   */
  it('[NOABORT-01] resetForThreadNavigation should NOT call stop()', () => {
    const mockStop = vi.fn();
    const thread = createMockThread({ id: 'thread-1' });
    const participants = createMockParticipants(3);

    store.getState().initializeThread(thread, participants, [
      createMockUserMessage(0, 'Test question'),
    ]);
    store.getState().setScreenMode(ScreenModes.THREAD);
    store.getState().setStop(mockStop);
    store.getState().setIsStreaming(true);

    // Navigate to different thread
    store.getState().resetForThreadNavigation();

    // CRITICAL: stop() should NOT be called (resumable streams)
    expect(mockStop).not.toHaveBeenCalled();

    // Local streaming state should be reset
    expect(store.getState().isStreaming).toBe(false);
  });

  /**
   * NOABORT-02: resetToOverview should NOT call stop()
   *
   * Navigating to overview should NOT abort streams.
   * Backend continues, user can resume later.
   */
  it('[NOABORT-02] resetToOverview should NOT call stop()', () => {
    const mockStop = vi.fn();
    const thread = createMockThread({ id: 'thread-1' });
    const participants = createMockParticipants(2);

    store.getState().initializeThread(thread, participants, [
      createMockUserMessage(0, 'Test question'),
    ]);
    store.getState().setScreenMode(ScreenModes.THREAD);
    store.getState().setStop(mockStop);
    store.getState().setIsStreaming(true);
    store.getState().setCurrentParticipantIndex(1);

    // Navigate to overview
    store.getState().resetToOverview();

    // CRITICAL: stop() should NOT be called
    expect(mockStop).not.toHaveBeenCalled();

    // Local state should be reset
    expect(store.getState().isStreaming).toBe(false);
    expect(store.getState().screenMode).toBe(ScreenModes.OVERVIEW);
  });

  /**
   * NOABORT-03: resetToNewChat should NOT call stop()
   *
   * Starting a new chat should NOT abort ongoing streams.
   */
  it('[NOABORT-03] resetToNewChat should NOT call stop()', () => {
    const mockStop = vi.fn();
    const thread = createMockThread({ id: 'thread-1' });
    const participants = createMockParticipants(2);

    store.getState().initializeThread(thread, participants, [
      createMockUserMessage(0, 'Test question'),
      createMockMessage(0, 0),
    ]);
    store.getState().setStop(mockStop);
    store.getState().setIsStreaming(true);

    // Start new chat
    store.getState().resetToNewChat();

    // CRITICAL: stop() should NOT be called
    expect(mockStop).not.toHaveBeenCalled();
  });

  /**
   * NOABORT-04: stopStreaming action should NOT call stop()
   *
   * The stopStreaming action now only resets local UI state.
   * It does NOT abort the backend stream.
   */
  it('[NOABORT-04] stopStreaming should NOT call stop()', () => {
    const mockStop = vi.fn();
    const thread = createMockThread({ id: 'thread-1' });
    const participants = createMockParticipants(3);

    store.getState().initializeThread(thread, participants, [
      createMockUserMessage(0, 'Test question'),
    ]);
    store.getState().setStop(mockStop);
    store.getState().setIsStreaming(true);
    store.getState().setCurrentParticipantIndex(1);

    // Call stopStreaming
    store.getState().stopStreaming();

    // CRITICAL: stop() should NOT be called
    expect(mockStop).not.toHaveBeenCalled();

    // Local state should be reset
    expect(store.getState().isStreaming).toBe(false);
    expect(store.getState().currentParticipantIndex).toBe(0);
  });
});

// ============================================================================
// SECTION 2: PAGE REFRESH RESUMPTION FLOW
// ============================================================================

describe('page Refresh Resumption Flow', () => {
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
   * REFRESH-01: Should detect active stream on page load
   *
   * When user refreshes during streaming:
   * 1. Backend stream continues (buffering to KV)
   * 2. Frontend loads and detects active stream
   * 3. Frontend resumes from buffered chunks
   */
  it('[REFRESH-01] should detect active stream and need resumption', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = createMockParticipants(3);

    // Simulate: User was on round 0, participant 1 was streaming
    store.getState().initializeThread(thread, participants, [
      createMockUserMessage(0, 'Test question'),
      createMockMessage(0, 0), // P0 completed
    ]);
    store.getState().setScreenMode(ScreenModes.THREAD);

    // Backend reports active stream for P1
    store.getState().setStreamResumptionState({
      streamId: generateStreamId('thread-123', 0, 1),
      threadId: 'thread-123',
      roundNumber: 0,
      participantIndex: 1,
      state: StreamStatuses.ACTIVE,
      createdAt: new Date(),
    });

    // Should need resumption
    expect(store.getState().needsStreamResumption()).toBe(true);
    expect(store.getState().isStreamResumptionValid()).toBe(true);
  });

  /**
   * REFRESH-02: Should resume mid-participant and continue to next
   *
   * Scenario: P1 was streaming, user refreshed
   * 1. Resume P1 stream
   * 2. P1 completes
   * 3. P2 auto-triggers
   * 4. P2 completes
   * 5. Round complete, analysis triggers
   */
  it('[REFRESH-02] should complete full round after mid-participant resume', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = createMockParticipants(3);

    // P0 already responded, P1 was streaming
    store.getState().initializeThread(thread, participants, [
      createMockUserMessage(0, 'Test question'),
      createMockMessage(0, 0), // P0 complete
    ]);
    store.getState().setScreenMode(ScreenModes.THREAD);

    const state = store.getState();

    // Set resumption state for P1
    state.setStreamResumptionState({
      streamId: generateStreamId('thread-123', 0, 1),
      threadId: 'thread-123',
      roundNumber: 0,
      participantIndex: 1,
      state: StreamStatuses.ACTIVE,
      createdAt: new Date(),
    });

    expect(state.needsStreamResumption()).toBe(true);

    // P1 stream resumes and completes
    state.setMessages([
      ...state.messages,
      createMockMessage(1, 0), // P1 complete
    ]);
    state.handleResumedStreamComplete(0, 1);

    // Should indicate P2 needs to trigger
    expect(state.getNextParticipantToTrigger()).toBe(2);

    // P2 streams and completes
    state.setMessages([
      ...store.getState().messages,
      createMockMessage(2, 0), // P2 complete
    ]);
    state.handleResumedStreamComplete(0, 2);

    // Round complete - no more participants
    expect(state.getNextParticipantToTrigger()).toBeNull();
  });

  /**
   * REFRESH-03: Should handle refresh at very start of participant stream
   *
   * If user refreshes right after participant started (few chunks buffered):
   * 1. Resume stream
   * 2. Continue receiving remaining chunks
   * 3. Complete normally
   *
   * NOTE: Backend uses ACTIVE state for resumable streams, STREAMING is legacy.
   */
  it('[REFRESH-03] should handle refresh at stream start', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = createMockParticipants(2);

    // Only user message, P0 just started streaming
    store.getState().initializeThread(thread, participants, [
      createMockUserMessage(0, 'Test question'),
    ]);
    store.getState().setScreenMode(ScreenModes.THREAD);

    const state = store.getState();

    // P0 just started (ACTIVE state - used for resumable streams)
    state.setStreamResumptionState({
      streamId: generateStreamId('thread-123', 0, 0),
      threadId: 'thread-123',
      roundNumber: 0,
      participantIndex: 0,
      state: StreamStatuses.ACTIVE, // Backend uses ACTIVE for resumable streams
      createdAt: new Date(),
    });

    // Should need resumption
    expect(state.needsStreamResumption()).toBe(true);
  });

  /**
   * REFRESH-04: Should handle refresh right before completion
   *
   * If user refreshes when stream was about to complete:
   * 1. Backend finishes and marks COMPLETED
   * 2. Frontend detects COMPLETED state
   * 3. Frontend syncs final message from DB
   * 4. Triggers next participant
   */
  it('[REFRESH-04] should handle already-completed stream on refresh', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = createMockParticipants(2);

    store.getState().initializeThread(thread, participants, [
      createMockUserMessage(0, 'Test question'),
    ]);
    store.getState().setScreenMode(ScreenModes.THREAD);

    const state = store.getState();

    // Backend already completed while we were refreshing
    state.setStreamResumptionState({
      streamId: generateStreamId('thread-123', 0, 0),
      threadId: 'thread-123',
      roundNumber: 0,
      participantIndex: 0,
      state: StreamStatuses.COMPLETED, // Already done on backend
      createdAt: new Date(),
    });

    // Should NOT need stream resumption (already complete)
    expect(state.needsStreamResumption()).toBe(false);

    // Should need message sync instead
    expect(state.needsMessageSync()).toBe(true);
  });
});

// ============================================================================
// SECTION 3: MULTI-ROUND RESUMPTION
// ============================================================================

describe('multi-Round Resumption Scenarios', () => {
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
   * MULTIROUND-01: Should resume correctly in round 2+
   *
   * Previous rounds complete. User refreshes during round 2.
   * Should resume round 2 and complete it correctly.
   */
  it('[MULTIROUND-01] should resume stream in later rounds', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = createMockParticipants(2);

    // Round 0 complete, Round 1 in progress
    store.getState().initializeThread(thread, participants, [
      createMockUserMessage(0, 'Question 1'),
      createMockMessage(0, 0),
      createMockMessage(1, 0),
      createMockUserMessage(1, 'Question 2'),
      createMockMessage(0, 1), // P0 complete in round 1
    ]);
    store.getState().setScreenMode(ScreenModes.THREAD);

    const state = store.getState();

    // P1 was streaming in round 1
    state.setStreamResumptionState({
      streamId: generateStreamId('thread-123', 1, 1),
      threadId: 'thread-123',
      roundNumber: 1,
      participantIndex: 1,
      state: StreamStatuses.ACTIVE,
      createdAt: new Date(),
    });

    expect(state.needsStreamResumption()).toBe(true);

    const resumptionState = state.getStreamResumptionState();
    expect(resumptionState?.roundNumber).toBe(1);
    expect(resumptionState?.participantIndex).toBe(1);
  });

  /**
   * MULTIROUND-02: Should handle refresh at round boundary
   *
   * Last participant of round just completed, analysis about to trigger.
   * User refreshes at this exact moment.
   */
  it('[MULTIROUND-02] should handle refresh at round completion boundary', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = createMockParticipants(2);

    // All participants complete for round 0
    store.getState().initializeThread(thread, participants, [
      createMockUserMessage(0, 'Test question'),
      createMockMessage(0, 0),
      createMockMessage(1, 0), // P1 just completed
    ]);
    store.getState().setScreenMode(ScreenModes.THREAD);

    const state = store.getState();

    // P1 stream just completed
    state.setStreamResumptionState({
      streamId: generateStreamId('thread-123', 0, 1),
      threadId: 'thread-123',
      roundNumber: 0,
      participantIndex: 1,
      state: StreamStatuses.COMPLETED,
      createdAt: new Date(),
    });

    // Stream is complete, need message sync
    expect(state.needsStreamResumption()).toBe(false);
    expect(state.needsMessageSync()).toBe(true);
  });
});

// ============================================================================
// SECTION 4: CONCURRENT STREAM HANDLING
// ============================================================================

describe('concurrent Stream Handling', () => {
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
   * CONCURRENT-01: Should not interrupt participant with navigation
   *
   * If user rapidly navigates (thread -> overview -> thread),
   * the backend stream should continue uninterrupted.
   */
  it('[CONCURRENT-01] should preserve backend stream during rapid navigation', () => {
    const mockStop = vi.fn();
    const thread = createMockThread({ id: 'thread-123' });
    const participants = createMockParticipants(3);

    store.getState().initializeThread(thread, participants, [
      createMockUserMessage(0, 'Test question'),
    ]);
    store.getState().setScreenMode(ScreenModes.THREAD);
    store.getState().setStop(mockStop);
    store.getState().setIsStreaming(true);

    // Rapid navigation: thread -> overview -> thread
    store.getState().resetToOverview();
    expect(mockStop).not.toHaveBeenCalled();

    // Back to thread
    store.getState().initializeThread(thread, participants, [
      createMockUserMessage(0, 'Test question'),
    ]);
    store.getState().setScreenMode(ScreenModes.THREAD);

    // stop() should NEVER have been called
    expect(mockStop).not.toHaveBeenCalled();
  });

  /**
   * CONCURRENT-02: Should handle multiple participants finishing during disconnect
   *
   * User disconnects during P0, but backend completes P0, P1, P2 before reconnect.
   * Frontend should sync all completed messages on return.
   */
  it('[CONCURRENT-02] should handle multiple completions during disconnect', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = createMockParticipants(3);

    // User reconnects - backend has completed all participants
    store.getState().initializeThread(thread, participants, [
      createMockUserMessage(0, 'Test question'),
      createMockMessage(0, 0), // P0 complete
      createMockMessage(1, 0), // P1 complete
      createMockMessage(2, 0), // P2 complete
    ]);
    store.getState().setScreenMode(ScreenModes.THREAD);

    const state = store.getState();
    const messages = state.messages;

    // All 3 assistant messages present
    const assistantMessages = messages.filter(m => m.role === 'assistant');
    expect(assistantMessages).toHaveLength(3);

    // No resumption needed - all complete
    expect(state.needsStreamResumption()).toBe(false);
  });
});

// ============================================================================
// SECTION 5: ERROR RECOVERY
// ============================================================================

describe('error Recovery in Resumable Streams', () => {
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
   * ERROR-01: Should handle FAILED stream state gracefully
   *
   * If backend stream failed (timeout, API error), frontend should:
   * 1. Detect FAILED state
   * 2. Clear resumption state
   * 3. Allow user to retry or continue
   */
  it('[ERROR-01] should handle failed stream state', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = createMockParticipants(2);

    store.getState().initializeThread(thread, participants, [
      createMockUserMessage(0, 'Test question'),
    ]);
    store.getState().setScreenMode(ScreenModes.THREAD);

    const state = store.getState();

    // Backend reports stream failed
    state.setStreamResumptionState({
      streamId: generateStreamId('thread-123', 0, 0),
      threadId: 'thread-123',
      roundNumber: 0,
      participantIndex: 0,
      state: StreamStatuses.FAILED,
      createdAt: new Date(),
    });

    // Should NOT try to resume failed stream
    expect(state.needsStreamResumption()).toBe(false);
  });

  /**
   * ERROR-02: Should handle TIMEOUT stream state
   *
   * If stream exceeded timeout, should be treated as failed.
   */
  it('[ERROR-02] should handle timeout stream state', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = createMockParticipants(2);

    store.getState().initializeThread(thread, participants, [
      createMockUserMessage(0, 'Test question'),
    ]);
    store.getState().setScreenMode(ScreenModes.THREAD);

    const state = store.getState();

    // Backend reports stream timed out
    state.setStreamResumptionState({
      streamId: generateStreamId('thread-123', 0, 0),
      threadId: 'thread-123',
      roundNumber: 0,
      participantIndex: 0,
      state: StreamStatuses.TIMEOUT,
      createdAt: new Date(),
    });

    // Should NOT try to resume timed out stream
    expect(state.needsStreamResumption()).toBe(false);
  });

  /**
   * ERROR-03: Should handle resumption failure gracefully
   *
   * If resume endpoint returns 404 (stream not found), should clear state
   * and not block user from sending new messages.
   */
  it('[ERROR-03] should recover from resumption failure', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = createMockParticipants(2);

    store.getState().initializeThread(thread, participants, [
      createMockUserMessage(0, 'Test question'),
    ]);
    store.getState().setScreenMode(ScreenModes.THREAD);

    const state = store.getState();

    // Set up stream that will fail to resume
    state.setStreamResumptionState({
      streamId: generateStreamId('thread-123', 0, 0),
      threadId: 'thread-123',
      roundNumber: 0,
      participantIndex: 0,
      state: StreamStatuses.ACTIVE,
      createdAt: new Date(),
    });

    expect(state.needsStreamResumption()).toBe(true);

    // Simulate failure
    state.handleStreamResumptionFailure(new Error('Stream expired'));

    // Should clear state and allow new operations
    expect(state.needsStreamResumption()).toBe(false);
    expect(state.isStreaming).toBe(false);
  });
});

// ============================================================================
// SECTION 6: BACKEND STREAM CONTINUATION VERIFICATION
// ============================================================================

describe('backend Stream Continuation', () => {
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
   * BACKEND-01: Local state changes should not affect backend stream
   *
   * When frontend clears local streaming state, backend continues.
   * This is the key difference from old abort pattern.
   */
  it('[BACKEND-01] stopStreaming only affects local state', () => {
    const mockStop = vi.fn();

    store.getState().setStop(mockStop);
    store.getState().setIsStreaming(true);
    store.getState().setCurrentParticipantIndex(1);

    // Clear local state
    store.getState().stopStreaming();

    // Local state cleared
    expect(store.getState().isStreaming).toBe(false);
    expect(store.getState().currentParticipantIndex).toBe(0);

    // Backend abort NOT called - stream continues
    expect(mockStop).not.toHaveBeenCalled();
  });

  /**
   * BACKEND-02: Navigation resets should be safe for background streams
   *
   * All reset functions should be "backend-safe" - they only clear
   * frontend state without interrupting background processing.
   */
  it('[BACKEND-02] all reset functions are backend-safe', () => {
    const mockStop = vi.fn();
    const thread = createMockThread({ id: 'thread-123' });
    const participants = createMockParticipants(2);

    store.getState().initializeThread(thread, participants, [
      createMockUserMessage(0, 'Test question'),
    ]);
    store.getState().setStop(mockStop);
    store.getState().setIsStreaming(true);

    // Test all reset functions
    store.getState().resetThreadState();
    expect(mockStop).not.toHaveBeenCalled();

    store.getState().setIsStreaming(true);
    store.getState().resetForThreadNavigation();
    expect(mockStop).not.toHaveBeenCalled();

    store.getState().setIsStreaming(true);
    store.getState().resetToOverview();
    expect(mockStop).not.toHaveBeenCalled();

    store.getState().setIsStreaming(true);
    store.getState().resetToNewChat();
    expect(mockStop).not.toHaveBeenCalled();

    store.getState().setIsStreaming(true);
    store.getState().stopStreaming();
    expect(mockStop).not.toHaveBeenCalled();

    // stop() should NEVER be called by any reset function
    expect(mockStop).toHaveBeenCalledTimes(0);
  });
});

// ============================================================================
// SECTION 7: COMPLETE FLOW INTEGRATION
// ============================================================================

describe('complete Flow Integration', () => {
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
   * FLOW-01: Complete 3-participant round with refresh mid-P1
   *
   * 1. User sends message
   * 2. P0 streams and completes
   * 3. P1 starts streaming
   * 4. User refreshes page
   * 5. P1 stream resumes and completes
   * 6. P2 auto-triggers and completes
   * 7. Analysis triggers
   */
  it('[FLOW-01] should complete full round with mid-stream refresh', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = createMockParticipants(3);

    // Step 1-3: P0 complete, P1 was streaming when refresh happened
    store.getState().initializeThread(thread, participants, [
      createMockUserMessage(0, 'Test question'),
      createMockMessage(0, 0), // P0 complete
    ]);
    store.getState().setScreenMode(ScreenModes.THREAD);

    const state = store.getState();

    // Step 4: Page refresh detected - P1 was streaming
    state.setStreamResumptionState({
      streamId: generateStreamId('thread-123', 0, 1),
      threadId: 'thread-123',
      roundNumber: 0,
      participantIndex: 1,
      state: StreamStatuses.ACTIVE,
      createdAt: new Date(),
    });

    expect(state.needsStreamResumption()).toBe(true);

    // Step 5: P1 resumes and completes
    state.setMessages([
      ...state.messages,
      createMockMessage(1, 0),
    ]);
    state.handleResumedStreamComplete(0, 1);

    expect(state.getNextParticipantToTrigger()).toBe(2);

    // Step 6: P2 triggered and completes
    state.setMessages([
      ...store.getState().messages,
      createMockMessage(2, 0),
    ]);
    state.handleResumedStreamComplete(0, 2);

    // Step 7: Round complete
    expect(state.getNextParticipantToTrigger()).toBeNull();

    // Verify all messages present
    const finalMessages = store.getState().messages;
    expect(finalMessages.filter(m => m.role === 'assistant')).toHaveLength(3);
    expect(finalMessages.filter(m => m.role === 'user')).toHaveLength(1);
  });

  /**
   * FLOW-02: Multiple refreshes during same round
   *
   * User refreshes multiple times during streaming.
   * Each time, system should resume correctly.
   */
  it('[FLOW-02] should handle multiple refreshes gracefully', () => {
    const mockStop = vi.fn();
    const thread = createMockThread({ id: 'thread-123' });
    const participants = createMockParticipants(2);

    store.getState().initializeThread(thread, participants, [
      createMockUserMessage(0, 'Test question'),
    ]);
    store.getState().setScreenMode(ScreenModes.THREAD);
    store.getState().setStop(mockStop);
    store.getState().setIsStreaming(true);

    // First "refresh" (navigation reset)
    store.getState().resetForThreadNavigation();
    expect(mockStop).not.toHaveBeenCalled();

    // Simulate coming back
    store.getState().initializeThread(thread, participants, [
      createMockUserMessage(0, 'Test question'),
    ]);
    store.getState().setScreenMode(ScreenModes.THREAD);

    // Second "refresh" (to overview and back)
    store.getState().resetToOverview();
    expect(mockStop).not.toHaveBeenCalled();

    // Back again
    store.getState().initializeThread(thread, participants, [
      createMockUserMessage(0, 'Test question'),
    ]);

    // Backend stream should have continued throughout
    // stop() never called
    expect(mockStop).toHaveBeenCalledTimes(0);
  });

  /**
   * FLOW-03: Resume after all participants completed
   *
   * User refreshes, comes back, all participants already done.
   * Should just sync messages and show complete state.
   */
  it('[FLOW-03] should handle return when round already complete', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = createMockParticipants(2);

    // Backend completed everything during disconnect
    store.getState().initializeThread(thread, participants, [
      createMockUserMessage(0, 'Test question'),
      createMockMessage(0, 0), // P0 complete
      createMockMessage(1, 0), // P1 complete
    ]);
    store.getState().setScreenMode(ScreenModes.THREAD);

    const state = store.getState();

    // No active stream - all done
    expect(state.needsStreamResumption()).toBe(false);

    // Messages already synced
    const assistantMessages = state.messages.filter(m => m.role === 'assistant');
    expect(assistantMessages).toHaveLength(2);
  });
});
