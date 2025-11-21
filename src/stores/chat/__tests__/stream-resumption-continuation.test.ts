/**
 * Stream Resumption & Auto-Continuation Tests
 *
 * Tests for auto chat continuations when user navigates away from the page.
 * These tests verify that:
 * 1. Streams continue running even when user navigates away
 * 2. Frontend detects active streams on page reload
 * 3. Next participant auto-triggers after resumed stream completes
 *
 * ROOT CAUSE:
 * Backend infrastructure exists (KV stream buffering, resume endpoints) but
 * frontend lacks detection/resume/auto-continuation logic.
 *
 * Location: /src/stores/chat/__tests__/stream-resumption-continuation.test.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ScreenModes,
  StreamStatuses,
} from '@/api/core/enums';
import { createChatStore } from '@/stores/chat/store';
import type { StreamResumptionState } from '@/stores/chat/store-schemas';

import {
  createMockAnalysis,
  createMockMessage,
  createMockParticipants,
  createMockThread,
  createMockUserMessage,
} from './test-factories';

// ============================================================================
// TEST UTILITIES - Uses StreamResumptionState from store-schemas
// ============================================================================

// ============================================================================
// TEST UTILITIES
// ============================================================================

function createTestStore() {
  return createChatStore();
}

/**
 * Generate stream ID matching backend pattern
 */
function generateStreamId(
  threadId: string,
  roundNumber: number,
  participantIndex: number,
): string {
  return `${threadId}_r${roundNumber}_p${participantIndex}`;
}

/**
 * Mock stream resumption state
 * Uses StreamResumptionState from store-schemas with StreamStatuses enum
 */
function createMockStreamMetadata(
  threadId: string,
  roundNumber: number,
  participantIndex: number,
  state: typeof StreamStatuses[keyof typeof StreamStatuses] = StreamStatuses.ACTIVE,
): StreamResumptionState {
  return {
    streamId: generateStreamId(threadId, roundNumber, participantIndex),
    threadId,
    roundNumber,
    participantIndex,
    state,
    createdAt: new Date(Date.now() - 5000), // 5 seconds ago
    updatedAt: new Date(),
  };
}

// ============================================================================
// SECTION 1: STREAM DETECTION ON PAGE RELOAD
// ============================================================================

describe('stream Detection on Page Reload', () => {
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
   * RESUME-01: Frontend should detect active streams when component mounts
   *
   * When a user reloads the page during participant streaming:
   * 1. Frontend should check for active streams via GET /chat/threads/{threadId}/streams/{streamId}
   * 2. If active stream found, frontend should resume from buffered chunks
   * 3. Store should have mechanism to track "activeStreamId" for current thread
   */
  it('[RESUME-01] should have mechanism to detect active streams on mount', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = createMockParticipants(3);

    store.getState().initializeThread(thread, participants, [
      createMockUserMessage(0, 'Test question'),
    ]);
    store.getState().setScreenMode(ScreenModes.THREAD);

    // Simulate: Participant 0 was streaming when user navigated away
    // Backend has stream buffered in KV with state ACTIVE
    const streamMetadata = createMockStreamMetadata('thread-123', 0, 0, StreamStatuses.ACTIVE);

    const state = store.getState();

    // Expected: Store should have stream resumption tracking methods
    expect(typeof state.setStreamResumptionState).toBe('function');
    expect(typeof state.getStreamResumptionState).toBe('function');
    expect(typeof state.clearStreamResumption).toBe('function');

    // Set the stream resumption state
    state.setStreamResumptionState(streamMetadata);
    expect(state.getStreamResumptionState()?.streamId).toBe(streamMetadata.streamId);
  });

  /**
   * RESUME-02: Store should track which participant was streaming
   *
   * After page reload, frontend needs to know:
   * - Which round was active
   * - Which participant was streaming
   * - So it can resume and then trigger next participant
   */
  it('[RESUME-02] should track streaming participant state for resumption', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = createMockParticipants(3);

    store.getState().initializeThread(thread, participants, [
      createMockUserMessage(0, 'Test question'),
      createMockMessage(0, 0), // Participant 0 finished
    ]);
    store.getState().setScreenMode(ScreenModes.THREAD);

    const state = store.getState();

    // Set the resumption state
    state.setStreamResumptionState({
      streamId: generateStreamId('thread-123', 0, 1),
      threadId: 'thread-123',
      roundNumber: 0,
      participantIndex: 1,
      state: StreamStatuses.ACTIVE,
      createdAt: new Date(),
    });

    // Should be able to retrieve it
    const resumptionState = state.getStreamResumptionState();
    expect(resumptionState?.roundNumber).toBe(0);
    expect(resumptionState?.participantIndex).toBe(1);
    expect(resumptionState?.state).toBe(StreamStatuses.ACTIVE);
  });

  /**
   * RESUME-03: Store should indicate when stream resumption is needed
   *
   * When component mounts, it should check if resumption is needed
   * based on stored stream state.
   */
  it('[RESUME-03] should indicate when stream resumption is needed', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = createMockParticipants(2);

    store.getState().initializeThread(thread, participants, [
      createMockUserMessage(0, 'Test question'),
    ]);
    store.getState().setScreenMode(ScreenModes.THREAD);

    const state = store.getState();

    // When no active stream, should return false
    expect(state.needsStreamResumption()).toBe(false);

    // When active stream exists, should return true
    state.setStreamResumptionState({
      streamId: generateStreamId('thread-123', 0, 0),
      threadId: 'thread-123',
      roundNumber: 0,
      participantIndex: 0,
      state: StreamStatuses.ACTIVE,
      createdAt: new Date(),
    });

    expect(state.needsStreamResumption()).toBe(true);
  });
});

// ============================================================================
// SECTION 2: AUTO-CONTINUATION AFTER STREAM RESUMPTION
// ============================================================================

describe('auto-Continuation After Stream Resumption', () => {
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
   * RESUME-04: Should auto-trigger next participant after resumed stream completes
   *
   * When a resumed stream completes:
   * 1. Mark resumed stream as COMPLETED
   * 2. Check if more participants remain in the round
   * 3. Auto-trigger next participant if available
   */
  it('[RESUME-04] should auto-trigger next participant after resumed stream completes', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = createMockParticipants(3);

    // Setup: Round 0 with P0 complete, P1 resumed and completing
    store.getState().initializeThread(thread, participants, [
      createMockUserMessage(0, 'Test question'),
      createMockMessage(0, 0), // P0 finished
    ]);
    store.getState().setScreenMode(ScreenModes.THREAD);

    // Simulate: P1 stream was resumed and is now completing
    // Need mechanism to detect completion and trigger P2

    const state = store.getState();

    expect(typeof state.handleResumedStreamComplete).toBe('function');

    // P1 finishes
    state.setMessages([
      ...state.messages,
      createMockMessage(1, 0), // P1 finished
    ]);

    // Mark resumed stream as complete
    state.handleResumedStreamComplete(0, 1);

    // Should indicate next participant needs to start
    expect(state.getNextParticipantToTrigger()).toBe(2);
  });

  /**
   * RESUME-05: Should complete round if last participant's resumed stream finishes
   *
   * When the last participant's resumed stream completes:
   * 1. Mark round as complete
   * 2. Trigger analysis creation
   * 3. Clear stream resumption state
   */
  it('[RESUME-05] should complete round when last participant resumed stream finishes', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = createMockParticipants(2);

    // Setup: Round 0 with P0 complete, P1 being last participant
    store.getState().initializeThread(thread, participants, [
      createMockUserMessage(0, 'Test question'),
      createMockMessage(0, 0), // P0 finished
    ]);
    store.getState().setScreenMode(ScreenModes.THREAD);

    const state = store.getState();

    expect(typeof state.handleResumedStreamComplete).toBe('function');

    // P1 (last participant) finishes
    state.setMessages([
      ...state.messages,
      createMockMessage(1, 0), // P1 finished
    ]);

    // Mark resumed stream as complete
    state.handleResumedStreamComplete(0, 1);

    // Should trigger analysis (since all participants responded)
    // The onComplete callback should fire
    expect(state.getNextParticipantToTrigger()).toBeNull();

    // Should clear stream resumption state
    expect(state.needsStreamResumption()).toBe(false);
  });

  /**
   * RESUME-06: Should handle mid-round navigation and resumption correctly
   *
   * Scenario:
   * 1. User sends message, P0 starts streaming
   * 2. User navigates away during P0
   * 3. User returns, P0 stream resumed and completes
   * 4. P1 auto-triggered
   * 5. P1 completes
   * 6. P2 auto-triggered
   * 7. P2 completes
   * 8. Analysis triggers
   */
  it('[RESUME-06] should handle complete multi-participant resumption flow', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = createMockParticipants(3);

    store.getState().initializeThread(thread, participants, [
      createMockUserMessage(0, 'Test question'),
    ]);
    store.getState().setScreenMode(ScreenModes.THREAD);

    const state = store.getState();

    // Set up resumption state (P0 was streaming)
    state.setStreamResumptionState({
      streamId: generateStreamId('thread-123', 0, 0),
      threadId: 'thread-123',
      roundNumber: 0,
      participantIndex: 0,
      state: StreamStatuses.ACTIVE,
      createdAt: new Date(),
    });

    // Verify resumption is needed
    expect(state.needsStreamResumption()).toBe(true);

    // P0 stream resumes and completes
    state.setMessages([
      ...state.messages,
      createMockMessage(0, 0),
    ]);

    state.handleResumedStreamComplete(0, 0);

    // Should indicate P1 needs to trigger
    expect(state.getNextParticipantToTrigger()).toBe(1);

    // P1 completes
    state.setMessages([
      ...state.messages,
      createMockMessage(1, 0),
    ]);
    state.handleResumedStreamComplete(0, 1);

    // Should indicate P2 needs to trigger
    expect(state.getNextParticipantToTrigger()).toBe(2);

    // P2 completes
    state.setMessages([
      ...state.messages,
      createMockMessage(2, 0),
    ]);
    state.handleResumedStreamComplete(0, 2);

    // Round complete - no more participants
    expect(state.getNextParticipantToTrigger()).toBeNull();
  });
});

// ============================================================================
// SECTION 3: STREAM STATE PERSISTENCE
// ============================================================================

describe('stream State Persistence', () => {
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
   * RESUME-07: Stream state should be clearable on navigation cleanup
   *
   * When user explicitly navigates to a new thread or overview:
   * 1. Clear any pending stream resumption state
   * 2. Don't attempt to resume stale streams
   */
  it('[RESUME-07] should clear stream resumption state on navigation cleanup', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = createMockParticipants(2);

    store.getState().initializeThread(thread, participants, [
      createMockUserMessage(0, 'Test question'),
    ]);

    const state = store.getState();

    // Set up resumption state
    state.setStreamResumptionState({
      threadId: 'thread-123',
      roundNumber: 0,
      participantIndex: 0,
      streamId: generateStreamId('thread-123', 0, 0),
      state: StreamStatuses.ACTIVE,
      createdAt: new Date(),
    });

    // Navigate away (reset to overview)
    state.resetToOverview();

    // Resumption state should be cleared
    expect(state.needsStreamResumption()).toBe(false);
    expect(state.getStreamResumptionState()).toBeNull();
  });

  /**
   * RESUME-08: Stream resumption should timeout if stream is too old
   *
   * Streams buffered in KV have 1-hour TTL.
   * Frontend should detect if stream is too old and skip resumption.
   */
  it('[RESUME-08] should timeout old streams and not attempt resumption', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = createMockParticipants(2);

    store.getState().initializeThread(thread, participants);

    const state = store.getState();

    // Set up old stream (created 2 hours ago)
    const oldStream: StreamResumptionState = {
      streamId: generateStreamId('thread-123', 0, 0),
      threadId: 'thread-123',
      roundNumber: 0,
      participantIndex: 0,
      state: StreamStatuses.ACTIVE,
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
      updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    };

    state.setStreamResumptionState(oldStream);

    // Should detect that stream is too old
    expect(state.isStreamResumptionStale()).toBe(true);

    // needsStreamResumption should return false for stale streams
    expect(state.needsStreamResumption()).toBe(false);
  });

  /**
   * RESUME-09: Should handle failed stream resumption gracefully
   *
   * If stream resumption fails (network error, stream not found):
   * 1. Clear resumption state
   * 2. Continue with normal flow (user can send new message)
   * 3. Don't get stuck in broken state
   */
  it('[RESUME-09] should handle failed stream resumption gracefully', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = createMockParticipants(2);

    store.getState().initializeThread(thread, participants, [
      createMockUserMessage(0, 'Test question'),
    ]);
    store.getState().setScreenMode(ScreenModes.THREAD);

    const state = store.getState();

    // Set up stream that will fail to resume
    state.setStreamResumptionState({
      threadId: 'thread-123',
      roundNumber: 0,
      participantIndex: 0,
      streamId: generateStreamId('thread-123', 0, 0),
      state: StreamStatuses.ACTIVE,
      createdAt: new Date(),
    });

    // Simulate resumption failure
    state.handleStreamResumptionFailure(new Error('Stream not found in buffer'));

    // Should clear resumption state
    expect(state.needsStreamResumption()).toBe(false);

    // Should not block new messages
    expect(state.hasSentPendingMessage).toBe(false);
    expect(state.isStreaming).toBe(false);
  });
});

// ============================================================================
// SECTION 4: MULTI-ROUND STREAM RESUMPTION
// ============================================================================

describe('multi-Round Stream Resumption', () => {
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
   * RESUME-10: Should handle resumption in round > 0
   *
   * User navigates away during round 2, participant 1.
   * On return, should resume round 2 participant 1, then continue.
   */
  it('[RESUME-10] should handle stream resumption in later rounds', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = createMockParticipants(2);

    // Setup: Round 0 and 1 complete, Round 2 in progress
    const messages = [
      // Round 0
      createMockUserMessage(0, 'Question 1'),
      createMockMessage(0, 0),
      createMockMessage(1, 0),
      // Round 1
      createMockUserMessage(1, 'Question 2'),
      createMockMessage(0, 1),
      createMockMessage(1, 1),
      // Round 2 - P0 complete, P1 was streaming
      createMockUserMessage(2, 'Question 3'),
      createMockMessage(0, 2),
    ];

    store.getState().initializeThread(thread, participants, messages);
    store.getState().setScreenMode(ScreenModes.THREAD);
    store.getState().markAnalysisCreated(0);
    store.getState().markAnalysisCreated(1);
    store.getState().addAnalysis(createMockAnalysis({ roundNumber: 0 }));
    store.getState().addAnalysis(createMockAnalysis({ roundNumber: 1 }));

    const state = store.getState();

    // P1 in round 2 was streaming
    state.setStreamResumptionState({
      threadId: 'thread-123',
      roundNumber: 2,
      participantIndex: 1,
      streamId: generateStreamId('thread-123', 2, 1),
      state: StreamStatuses.ACTIVE,
      createdAt: new Date(),
    });

    // Verify resumption targets correct round
    const resumptionState = state.getStreamResumptionState();
    expect(resumptionState?.roundNumber).toBe(2);
    expect(resumptionState?.participantIndex).toBe(1);

    // Resume and complete
    state.setMessages([
      ...state.messages,
      createMockMessage(1, 2),
    ]);
    state.handleResumedStreamComplete(2, 1);

    // Round 2 complete - should trigger analysis
    expect(state.getNextParticipantToTrigger()).toBeNull();
  });

  /**
   * RESUME-11: Should not resume streams from different thread
   *
   * If user loads thread A but had active stream in thread B,
   * should not attempt to resume thread B's stream.
   */
  it('[RESUME-11] should not resume streams from different thread', () => {
    const threadA = createMockThread({ id: 'thread-A' });
    const participants = createMockParticipants(2);

    store.getState().initializeThread(threadA, participants);
    store.getState().setScreenMode(ScreenModes.THREAD);

    const state = store.getState();

    // Attempt to set resumption state for different thread
    state.setStreamResumptionState({
      threadId: 'thread-B', // Different thread!
      roundNumber: 0,
      participantIndex: 0,
      streamId: generateStreamId('thread-B', 0, 0),
      state: StreamStatuses.ACTIVE,
      createdAt: new Date(),
    });

    // Should detect mismatch and not need resumption
    expect(state.needsStreamResumption()).toBe(false);
  });
});

// ============================================================================
// SECTION 5: INTEGRATION WITH EXISTING STREAMING
// ============================================================================

describe('integration with Existing Streaming', () => {
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
   * RESUME-12: Stream resumption should work with pre-search blocking
   *
   * If web search is enabled and user navigates away during pre-search:
   * 1. Pre-search continues in background
   * 2. On return, resume pre-search if still running
   * 3. Then start participant streaming
   */
  it('[RESUME-12] should handle resumption with web search enabled', () => {
    const thread = createMockThread({
      id: 'thread-123',
      enableWebSearch: true,
    });
    const participants = createMockParticipants(2);

    store.getState().initializeThread(thread, participants, [
      createMockUserMessage(0, 'Search and discuss'),
    ]);
    store.getState().setEnableWebSearch(true);
    store.getState().setScreenMode(ScreenModes.THREAD);

    const state = store.getState();

    // Scenario: Pre-search completed, participant 0 was streaming
    // Pre-search already complete (normal case)
    // Participant stream needs resumption
    state.setStreamResumptionState({
      streamId: generateStreamId('thread-123', 0, 0),
      threadId: 'thread-123',
      roundNumber: 0,
      participantIndex: 0,
      state: StreamStatuses.ACTIVE,
      createdAt: new Date(),
    });

    // Should need resumption even with web search enabled
    expect(state.needsStreamResumption()).toBe(true);
  });

  /**
   * RESUME-13: New message should clear any pending resumption state
   *
   * If user sends a new message, any pending stream resumption
   * should be abandoned (user is starting fresh).
   */
  it('[RESUME-13] should clear resumption state when new message sent', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = createMockParticipants(2);

    store.getState().initializeThread(thread, participants, [
      createMockUserMessage(0, 'Original question'),
      createMockMessage(0, 0),
    ]);
    store.getState().setScreenMode(ScreenModes.THREAD);

    const state = store.getState();

    // Set up pending resumption (P1 was streaming)
    state.setStreamResumptionState({
      threadId: 'thread-123',
      roundNumber: 0,
      participantIndex: 1,
      streamId: generateStreamId('thread-123', 0, 1),
      state: StreamStatuses.ACTIVE,
      createdAt: new Date(),
    });

    // User sends new message (abandoning round 0)
    state.prepareForNewMessage('New question', ['model-1', 'model-2']);

    // Resumption state should be cleared
    expect(state.needsStreamResumption()).toBe(false);
  });

  /**
   * RESUME-14: Regeneration should clear resumption state
   *
   * If user regenerates a round, any pending stream resumption
   * for that round should be cleared.
   */
  it('[RESUME-14] should clear resumption state on regeneration', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = createMockParticipants(2);

    store.getState().initializeThread(thread, participants, [
      createMockUserMessage(0, 'Original question'),
      createMockMessage(0, 0),
    ]);
    store.getState().setScreenMode(ScreenModes.THREAD);

    const state = store.getState();

    // Set up pending resumption
    state.setStreamResumptionState({
      threadId: 'thread-123',
      roundNumber: 0,
      participantIndex: 1,
      streamId: generateStreamId('thread-123', 0, 1),
      state: StreamStatuses.ACTIVE,
      createdAt: new Date(),
    });

    // User regenerates round 0
    state.startRegeneration(0);

    // Resumption state should be cleared
    expect(state.needsStreamResumption()).toBe(false);
  });
});

// ============================================================================
// SECTION 6: EDGE CASES AND ERROR HANDLING
// ============================================================================

describe('edge Cases and Error Handling', () => {
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
   * RESUME-15: Should handle resumption when participant list changed
   *
   * Edge case: User had 3 participants, navigated away during P2.
   * On return, user changed config to 2 participants.
   * Should detect mismatch and handle gracefully.
   */
  it('[RESUME-15] should handle participant count mismatch gracefully', () => {
    const thread = createMockThread({ id: 'thread-123' });
    // Current config: only 2 participants
    const participants = createMockParticipants(2);

    store.getState().initializeThread(thread, participants, [
      createMockUserMessage(0, 'Question'),
      createMockMessage(0, 0),
      createMockMessage(1, 0),
    ]);
    store.getState().setScreenMode(ScreenModes.THREAD);

    const state = store.getState();

    // Resumption state for P2 (which no longer exists)
    state.setStreamResumptionState({
      threadId: 'thread-123',
      roundNumber: 0,
      participantIndex: 2, // Out of bounds!
      streamId: generateStreamId('thread-123', 0, 2),
      state: StreamStatuses.ACTIVE,
      createdAt: new Date(),
    });

    // Should detect invalid participant index
    expect(state.isStreamResumptionValid()).toBe(false);

    // Should not attempt resumption
    expect(state.needsStreamResumption()).toBe(false);
  });

  /**
   * RESUME-16: Should handle concurrent resumption attempts
   *
   * Multiple effects might try to handle resumption.
   * Should use tracking to prevent duplicate triggers.
   */
  it('[RESUME-16] should prevent duplicate resumption triggers', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = createMockParticipants(2);

    store.getState().initializeThread(thread, participants, [
      createMockUserMessage(0, 'Question'),
    ]);

    const state = store.getState();

    state.setStreamResumptionState({
      threadId: 'thread-123',
      roundNumber: 0,
      participantIndex: 0,
      streamId: generateStreamId('thread-123', 0, 0),
      state: StreamStatuses.ACTIVE,
      createdAt: new Date(),
    });

    // First attempt to start resumption
    const firstAttempt = state.markResumptionAttempted(0, 0);
    expect(firstAttempt).toBe(true); // First attempt succeeds

    // Second attempt should be blocked
    const secondAttempt = state.markResumptionAttempted(0, 0);
    expect(secondAttempt).toBe(false); // Duplicate blocked
  });

  /**
   * RESUME-17: Should handle COMPLETED state from backend
   *
   * If stream finished on backend but frontend didn't receive final message,
   * GET /stream returns COMPLETED. Frontend should fetch final message.
   */
  it('[RESUME-17] should handle already-completed streams', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = createMockParticipants(2);

    store.getState().initializeThread(thread, participants, [
      createMockUserMessage(0, 'Question'),
    ]);
    store.getState().setScreenMode(ScreenModes.THREAD);

    const state = store.getState();

    // Stream already completed on backend
    state.setStreamResumptionState({
      threadId: 'thread-123',
      roundNumber: 0,
      participantIndex: 0,
      streamId: generateStreamId('thread-123', 0, 0),
      state: StreamStatuses.COMPLETED, // Already done!
      createdAt: new Date(),
    });

    // Should indicate we need to fetch the completed message
    // (not resume stream, but sync message from database)
    expect(state.needsMessageSync()).toBe(true);

    // Should not attempt stream resumption
    expect(state.needsStreamResumption()).toBe(false);
  });
});
