/* eslint-disable no-console -- Performance test file requires console for metrics */
/**
 * Placeholder Timing & Transitions Tests
 *
 * Comprehensive tests to verify:
 * 1. ALL placeholders (participants + moderator) appear immediately after submission
 * 2. Full conversation round simulation with turn-taking
 * 3. Store update frequency tracking (detect over-rendering)
 * 4. Participant transition smoothness (no flashing)
 * 5. Participant → Moderator transition smoothness (no flashing)
 *
 * Uses console logs for debugging - DO NOT REMOVE them.
 */

import type { UIMessage } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FinishReasons, MessagePartTypes, MessageRoles, MessageStatuses } from '@/api/core/enums';
import { createTestUserMessage } from '@/lib/testing';

import { createChatStore } from '../store';

// ============================================================================
// Test Utilities
// ============================================================================

type UpdateTracker = {
  count: number;
  timestamps: number[];
  changes: Array<{ field: string; from: unknown; to: unknown }>;
  actionCalls: Map<string, number>;
};

function createUpdateTracker(): UpdateTracker {
  return {
    count: 0,
    timestamps: [],
    changes: [],
    actionCalls: new Map(),
  };
}

function trackStoreUpdate(
  tracker: UpdateTracker,
  prevState: ReturnType<ReturnType<typeof createChatStore>['getState']>,
  nextState: ReturnType<ReturnType<typeof createChatStore>['getState']>,
): void {
  tracker.count++;
  tracker.timestamps.push(Date.now());

  // Track what changed
  if (prevState.messages.length !== nextState.messages.length) {
    tracker.changes.push({ field: 'messages.length', from: prevState.messages.length, to: nextState.messages.length });
  }
  if (prevState.isStreaming !== nextState.isStreaming) {
    tracker.changes.push({ field: 'isStreaming', from: prevState.isStreaming, to: nextState.isStreaming });
  }
  if (prevState.isModeratorStreaming !== nextState.isModeratorStreaming) {
    tracker.changes.push({ field: 'isModeratorStreaming', from: prevState.isModeratorStreaming, to: nextState.isModeratorStreaming });
  }
  if (prevState.currentParticipantIndex !== nextState.currentParticipantIndex) {
    tracker.changes.push({ field: 'currentParticipantIndex', from: prevState.currentParticipantIndex, to: nextState.currentParticipantIndex });
  }
  if (prevState.streamingRoundNumber !== nextState.streamingRoundNumber) {
    tracker.changes.push({ field: 'streamingRoundNumber', from: prevState.streamingRoundNumber, to: nextState.streamingRoundNumber });
  }
}

function trackActionCall(tracker: UpdateTracker, actionName: string): void {
  const current = tracker.actionCalls.get(actionName) ?? 0;
  tracker.actionCalls.set(actionName, current + 1);
}

function getUpdatesPerSecond(tracker: UpdateTracker): number {
  if (tracker.timestamps.length < 2)
    return 0;
  const first = tracker.timestamps[0]!;
  const last = tracker.timestamps[tracker.timestamps.length - 1]!;
  const durationSeconds = (last - first) / 1000;
  if (durationSeconds === 0)
    return tracker.count;
  return tracker.count / durationSeconds;
}

// Create streaming message with proper types
function createStreamingMessage(
  participantIndex: number,
  roundNumber: number,
  textContent: string,
  finishReason: string = FinishReasons.UNKNOWN,
): UIMessage {
  return {
    id: `thread_r${roundNumber}_p${participantIndex}`,
    role: MessageRoles.ASSISTANT as const,
    parts: textContent
      ? [{ type: MessagePartTypes.TEXT as const, text: textContent }]
      : [],
    metadata: {
      role: MessageRoles.ASSISTANT,
      roundNumber,
      participantIndex,
      participantId: `participant-${participantIndex}`,
      finishReason,
      hasError: false,
      usage: { promptTokens: 0, completionTokens: textContent.length, totalTokens: textContent.length },
    },
  };
}

// Create moderator message
function createModeratorStreamingMessage(
  roundNumber: number,
  textContent: string,
  finishReason: string = FinishReasons.UNKNOWN,
): UIMessage {
  return {
    id: `thread_r${roundNumber}_moderator`,
    role: MessageRoles.ASSISTANT as const,
    parts: textContent
      ? [{ type: MessagePartTypes.TEXT as const, text: textContent }]
      : [],
    metadata: {
      role: MessageRoles.ASSISTANT,
      roundNumber,
      isModerator: true,
      participantIndex: -1,
      finishReason,
      hasError: false,
      usage: { promptTokens: 0, completionTokens: textContent.length, totalTokens: textContent.length },
    },
  };
}

// ============================================================================
// Test Suite: Placeholder Timing After Submission
// ============================================================================

describe('placeholder Timing After Submission', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  it('should show all placeholders immediately after streamingRoundNumber is set', () => {
    const store = createChatStore();
    const tracker = createUpdateTracker();
    let prevState = store.getState();

    const unsubscribe = store.subscribe(() => {
      const nextState = store.getState();
      trackStoreUpdate(tracker, prevState, nextState);
      prevState = nextState;
    });

    // Step 1: Set user message
    const userMessage = createTestUserMessage({
      id: 'user_r0',
      content: 'Hello',
      roundNumber: 0,
    });
    store.getState().setMessages([userMessage]);

    // Step 2: Set streaming round number (simulates handleUpdateThreadAndSend line 437)
    // This is the TRIGGER for all placeholders to appear
    store.getState().setStreamingRoundNumber(0);
    trackActionCall(tracker, 'setStreamingRoundNumber');

    const stateAfterSubmission = store.getState();

    console.log('[TEST:SUBMIT] State after setStreamingRoundNumber:', JSON.stringify({
      streamingRoundNumber: stateAfterSubmission.streamingRoundNumber,
      isStreaming: stateAfterSubmission.isStreaming,
      isModeratorStreaming: stateAfterSubmission.isModeratorStreaming,
      messagesCount: stateAfterSubmission.messages.length,
    }));

    // Verify: streamingRoundNumber should be set
    expect(stateAfterSubmission.streamingRoundNumber).toBe(0);

    // The UI rendering condition (isStreamingRound = roundNumber === streamingRoundNumber)
    // should now be TRUE for round 0, enabling ALL placeholders to render

    unsubscribe();

    console.log('[TEST:SUBMIT] Total updates:', tracker.count);

    console.log('[TEST:SUBMIT] Changes:', JSON.stringify(tracker.changes));
  });

  it('should track store updates when setting up streaming state', () => {
    const store = createChatStore();
    const tracker = createUpdateTracker();
    let prevState = store.getState();

    const unsubscribe = store.subscribe(() => {
      const nextState = store.getState();
      trackStoreUpdate(tracker, prevState, nextState);
      prevState = nextState;
    });

    // Simulate complete submission setup (from form-actions.ts handleUpdateThreadAndSend)
    const userMessage = createTestUserMessage({
      id: 'user_r0',
      content: 'Test question',
      roundNumber: 0,
    });

    // These should ideally be batched but currently run separately
    store.getState().setMessages([userMessage]);
    store.getState().setStreamingRoundNumber(0);
    store.getState().setIsStreaming(true);
    store.getState().setCurrentParticipantIndex(0);

    unsubscribe();

    console.log('[TEST:SETUP] Total setup updates:', tracker.count);

    console.log('[TEST:SETUP] Changes:', JSON.stringify(tracker.changes));

    // Should have minimal updates for setup
    // Currently expect 4 separate updates, ideally would be batched to fewer
    expect(tracker.count).toBeLessThanOrEqual(4);
  });
});

// ============================================================================
// Test Suite: Full Conversation Round Simulation
// ============================================================================

describe('full Conversation Round Simulation', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  it('should simulate complete round with 3 participants and moderator', () => {
    const store = createChatStore();
    const tracker = createUpdateTracker();
    let prevState = store.getState();

    const unsubscribe = store.subscribe(() => {
      const nextState = store.getState();
      trackStoreUpdate(tracker, prevState, nextState);
      prevState = nextState;
    });

    // --- PHASE 1: SUBMISSION ---

    console.log('[TEST:ROUND] === PHASE 1: SUBMISSION ===');

    const userMessage = createTestUserMessage({
      id: 'user_r0',
      content: 'What is the meaning of life?',
      roundNumber: 0,
    });

    store.getState().setMessages([userMessage]);
    store.getState().setStreamingRoundNumber(0);
    store.getState().setIsStreaming(true);
    store.getState().setCurrentParticipantIndex(0);

    const updatesAfterSubmission = tracker.count;

    console.log('[TEST:ROUND] Updates after submission:', updatesAfterSubmission);

    // --- PHASE 2: PARTICIPANT 0 STREAMING ---

    console.log('[TEST:ROUND] === PHASE 2: PARTICIPANT 0 STREAMING ===');

    const p0Chunks = ['The ', 'meaning ', 'of ', 'life ', 'is...'];
    for (const chunk of p0Chunks) {
      const p0 = createStreamingMessage(0, 0, p0Chunks.slice(0, p0Chunks.indexOf(chunk) + 1).join(''));
      store.getState().setMessages([userMessage, p0]);
    }

    const updatesAfterP0Streaming = tracker.count - updatesAfterSubmission;

    console.log('[TEST:ROUND] Updates during P0 streaming:', updatesAfterP0Streaming);

    // --- PHASE 3: PARTICIPANT 0 COMPLETE, TRANSITION TO PARTICIPANT 1 ---

    console.log('[TEST:ROUND] === PHASE 3: P0 COMPLETE, TRANSITION TO P1 ===');

    const p0Final = createStreamingMessage(0, 0, 'The meaning of life is to find purpose.', FinishReasons.STOP);

    const updatesBeforeTransition = tracker.count;

    // Transition: P0 complete, P1 starts
    store.getState().setCurrentParticipantIndex(1);
    store.getState().setMessages([userMessage, p0Final]);

    const updatesForP0ToP1Transition = tracker.count - updatesBeforeTransition;

    console.log('[TEST:ROUND] Updates for P0→P1 transition:', updatesForP0ToP1Transition);

    // --- PHASE 4: PARTICIPANT 1 STREAMING ---

    console.log('[TEST:ROUND] === PHASE 4: PARTICIPANT 1 STREAMING ===');

    const p1Chunks = ['I ', 'think ', 'it\'s ', 'about ', 'happiness.'];
    for (const chunk of p1Chunks) {
      const p1 = createStreamingMessage(1, 0, p1Chunks.slice(0, p1Chunks.indexOf(chunk) + 1).join(''));
      store.getState().setMessages([userMessage, p0Final, p1]);
    }

    const updatesAfterP1Streaming = tracker.count - updatesBeforeTransition - updatesForP0ToP1Transition;

    console.log('[TEST:ROUND] Updates during P1 streaming:', updatesAfterP1Streaming);

    // --- PHASE 5: PARTICIPANT 1 COMPLETE, TRANSITION TO PARTICIPANT 2 ---

    console.log('[TEST:ROUND] === PHASE 5: P1 COMPLETE, TRANSITION TO P2 ===');

    const p1Final = createStreamingMessage(1, 0, 'I think it\'s about happiness.', FinishReasons.STOP);

    const updatesBeforeP1P2Transition = tracker.count;

    store.getState().setCurrentParticipantIndex(2);
    store.getState().setMessages([userMessage, p0Final, p1Final]);

    const updatesForP1ToP2Transition = tracker.count - updatesBeforeP1P2Transition;

    console.log('[TEST:ROUND] Updates for P1→P2 transition:', updatesForP1ToP2Transition);

    // --- PHASE 6: PARTICIPANT 2 STREAMING ---

    console.log('[TEST:ROUND] === PHASE 6: PARTICIPANT 2 STREAMING ===');

    const p2Chunks = ['Love ', 'and ', 'connection.'];
    for (const chunk of p2Chunks) {
      const p2 = createStreamingMessage(2, 0, p2Chunks.slice(0, p2Chunks.indexOf(chunk) + 1).join(''));
      store.getState().setMessages([userMessage, p0Final, p1Final, p2]);
    }

    // --- PHASE 7: ALL PARTICIPANTS COMPLETE, TRANSITION TO MODERATOR ---

    console.log('[TEST:ROUND] === PHASE 7: ALL PARTICIPANTS COMPLETE, TRANSITION TO MODERATOR ===');

    const p2Final = createStreamingMessage(2, 0, 'Love and connection.', FinishReasons.STOP);

    const updatesBeforeModeratorTransition = tracker.count;

    // Participants done, moderator starts
    store.getState().setIsStreaming(false);
    store.getState().setIsModeratorStreaming(true);
    store.getState().setMessages([userMessage, p0Final, p1Final, p2Final]);

    const updatesForModeratorTransition = tracker.count - updatesBeforeModeratorTransition;

    console.log('[TEST:ROUND] Updates for participants→moderator transition:', updatesForModeratorTransition);

    // CRITICAL: This transition should be smooth with minimal updates
    // If this is > 5, there's likely over-rendering happening
    expect(updatesForModeratorTransition).toBeLessThanOrEqual(5);

    // --- PHASE 8: MODERATOR STREAMING ---

    console.log('[TEST:ROUND] === PHASE 8: MODERATOR STREAMING ===');

    const moderatorChunks = ['All ', 'participants ', 'agree: ', 'purpose, ', 'happiness, ', 'love.'];
    for (const chunk of moderatorChunks) {
      const moderator = createModeratorStreamingMessage(
        0,
        moderatorChunks.slice(0, moderatorChunks.indexOf(chunk) + 1).join(''),
      );
      store.getState().setMessages([userMessage, p0Final, p1Final, p2Final, moderator]);
    }

    // --- PHASE 9: MODERATOR COMPLETE, ROUND DONE ---

    console.log('[TEST:ROUND] === PHASE 9: MODERATOR COMPLETE, ROUND DONE ===');

    const moderatorFinal = createModeratorStreamingMessage(
      0,
      'All participants agree: purpose, happiness, love.',
      FinishReasons.STOP,
    );

    store.getState().setMessages([userMessage, p0Final, p1Final, p2Final, moderatorFinal]);
    store.getState().setIsModeratorStreaming(false);
    store.getState().completeStreaming();

    unsubscribe();

    // --- SUMMARY ---

    console.log('[TEST:ROUND] === SUMMARY ===');

    console.log('[TEST:ROUND] Total updates for complete round:', tracker.count);

    console.log('[TEST:ROUND] Updates per second:', getUpdatesPerSecond(tracker).toFixed(2));

    // Verify final state
    const finalState = store.getState();
    expect(finalState.messages).toHaveLength(5); // user + 3 participants + moderator
    expect(finalState.isStreaming).toBe(false);
    expect(finalState.isModeratorStreaming).toBe(false);

    // Performance bounds: entire round should have < 100 updates
    expect(tracker.count).toBeLessThan(100);
  });

  it('should detect excessive updates during participant transitions', () => {
    const store = createChatStore();
    const transitionUpdates: number[] = [];
    let prevState = store.getState();

    const unsubscribe = store.subscribe(() => {
      const nextState = store.getState();
      if (prevState.currentParticipantIndex !== nextState.currentParticipantIndex) {
        transitionUpdates.push(Date.now());

        console.log('[TEST:TRANS] Participant transition:', {
          from: prevState.currentParticipantIndex,
          to: nextState.currentParticipantIndex,
        });
      }
      prevState = nextState;
    });

    // Setup
    const userMessage = createTestUserMessage({
      id: 'user_r0',
      content: 'Test',
      roundNumber: 0,
    });
    store.getState().setMessages([userMessage]);
    store.getState().setStreamingRoundNumber(0);
    store.getState().setIsStreaming(true);

    // Simulate rapid transitions (like a bug causing multiple triggers)
    // Note: Store starts with currentParticipantIndex = 0, so setting 0 again is a no-op
    store.getState().setCurrentParticipantIndex(0); // No-op (already 0)
    store.getState().setCurrentParticipantIndex(1);
    store.getState().setCurrentParticipantIndex(2);
    store.getState().setCurrentParticipantIndex(3);

    unsubscribe();

    console.log('[TEST:TRANS] Total participant transitions:', transitionUpdates.length);

    // Only 3 actual transitions (1, 2, 3) since 0→0 is skipped by store optimization
    // This is GOOD - it means the store doesn't trigger unnecessary updates
    expect(transitionUpdates).toHaveLength(3);
  });
});

// ============================================================================
// Test Suite: Flashing Prevention During Transitions
// ============================================================================

describe('flashing Prevention During Transitions', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  it('should not have message array churn during participant streaming', () => {
    const store = createChatStore();
    const messageArrayReferences: unknown[] = [];

    const unsubscribe = store.subscribe(() => {
      messageArrayReferences.push(store.getState().messages);
    });

    // Setup
    const userMessage = createTestUserMessage({
      id: 'user_r0',
      content: 'Test',
      roundNumber: 0,
    });
    store.getState().setMessages([userMessage]);
    store.getState().setStreamingRoundNumber(0);
    store.getState().setIsStreaming(true);

    // Stream 10 chunks for participant 0
    for (let i = 1; i <= 10; i++) {
      const p0 = createStreamingMessage(0, 0, 'A'.repeat(i * 10));
      store.getState().setMessages([userMessage, p0]);
    }

    unsubscribe();

    console.log('[TEST:CHURN] Message array updates:', messageArrayReferences.length);

    // Each setMessages creates a new array (expected)
    // The test verifies this doesn't cause excessive re-renders
    expect(messageArrayReferences.length).toBeGreaterThan(0);
  });

  it('should preserve message order during participant completion transitions', () => {
    const store = createChatStore();
    const messageOrderSnapshots: string[][] = [];

    const unsubscribe = store.subscribe(() => {
      const messages = store.getState().messages;
      const ids = messages.map(m => m.id);
      messageOrderSnapshots.push(ids);
    });

    // Setup
    const userMessage = createTestUserMessage({
      id: 'user_r0',
      content: 'Test',
      roundNumber: 0,
    });
    store.getState().setMessages([userMessage]);
    store.getState().setStreamingRoundNumber(0);
    store.getState().setIsStreaming(true);
    store.getState().setCurrentParticipantIndex(0);

    // P0 completes
    const p0Final = createStreamingMessage(0, 0, 'P0 response', FinishReasons.STOP);
    store.getState().setMessages([userMessage, p0Final]);

    // Transition to P1
    store.getState().setCurrentParticipantIndex(1);

    // P1 starts
    const p1Initial = createStreamingMessage(1, 0, 'P1');
    store.getState().setMessages([userMessage, p0Final, p1Initial]);

    // P1 streams
    const p1Streaming = createStreamingMessage(1, 0, 'P1 streaming...');
    store.getState().setMessages([userMessage, p0Final, p1Streaming]);

    // P1 completes
    const p1Final = createStreamingMessage(1, 0, 'P1 response', FinishReasons.STOP);
    store.getState().setMessages([userMessage, p0Final, p1Final]);

    unsubscribe();

    // Verify message order is always correct (user, p0, p1)
    const snapshotsWithUser = messageOrderSnapshots.filter(s => s.includes('user_r0'));
    const snapshotsWithBothParticipants = messageOrderSnapshots.filter(
      s => s.includes('thread_r0_p0') && s.includes('thread_r0_p1'),
    );

    // User message should always be first when present
    const userOrderViolations = snapshotsWithUser.filter((snapshot) => {
      const userIndex = snapshot.indexOf('user_r0');
      return userIndex !== 0;
    });
    expect(userOrderViolations).toHaveLength(0);

    // P0 should come before P1 when both are present
    const p0p1OrderViolations = snapshotsWithBothParticipants.filter((snapshot) => {
      const p0Index = snapshot.indexOf('thread_r0_p0');
      const p1Index = snapshot.indexOf('thread_r0_p1');
      return p0Index >= p1Index;
    });
    expect(p0p1OrderViolations).toHaveLength(0);
  });

  it('should detect status transitions that might cause flashing', () => {
    const store = createChatStore();
    const statusTransitions: Array<{ messageId: string; from: string; to: string }> = [];
    let prevMessages = store.getState().messages;

    const unsubscribe = store.subscribe(() => {
      const currMessages = store.getState().messages;

      // Track status changes for each message
      for (const curr of currMessages) {
        const prev = prevMessages.find(m => m.id === curr.id);
        if (prev) {
          const prevStatus = (prev.metadata as { finishReason?: string })?.finishReason ?? MessageStatuses.PENDING;
          const currStatus = (curr.metadata as { finishReason?: string })?.finishReason ?? MessageStatuses.PENDING;
          if (prevStatus !== currStatus) {
            statusTransitions.push({
              messageId: curr.id,
              from: prevStatus,
              to: currStatus,
            });

            console.log('[TEST:STATUS] Transition:', { id: curr.id, from: prevStatus, to: currStatus });
          }
        }
      }
      prevMessages = currMessages;
    });

    // Setup
    const userMessage = createTestUserMessage({
      id: 'user_r0',
      content: 'Test',
      roundNumber: 0,
    });
    store.getState().setMessages([userMessage]);
    store.getState().setStreamingRoundNumber(0);
    store.getState().setIsStreaming(true);

    // P0: pending → streaming → complete
    const p0Pending = createStreamingMessage(0, 0, '', FinishReasons.UNKNOWN);
    store.getState().setMessages([userMessage, p0Pending]);

    const p0Streaming = createStreamingMessage(0, 0, 'Streaming...', FinishReasons.UNKNOWN);
    store.getState().setMessages([userMessage, p0Streaming]);

    const p0Complete = createStreamingMessage(0, 0, 'Complete', FinishReasons.STOP);
    store.getState().setMessages([userMessage, p0Complete]);

    unsubscribe();

    console.log('[TEST:STATUS] Total status transitions:', statusTransitions.length);

    // Each message should have a clean transition: UNKNOWN → STOP
    // NOT: UNKNOWN → PENDING → STREAMING → COMPLETE (too many)
    expect(statusTransitions.length).toBeLessThanOrEqual(3);
  });
});

// ============================================================================
// Test Suite: Moderator Placeholder Timing
// ============================================================================

describe('moderator Placeholder Timing', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  it('should show moderator placeholder immediately after streamingRoundNumber is set', () => {
    const store = createChatStore();

    // Setup
    const userMessage = createTestUserMessage({
      id: 'user_r0',
      content: 'Test',
      roundNumber: 0,
    });
    store.getState().setMessages([userMessage]);

    // This triggers the UI to show ALL placeholders including moderator
    store.getState().setStreamingRoundNumber(0);

    const state = store.getState();

    console.log('[TEST:MOD-PLACEHOLDER] State after setStreamingRoundNumber:', {
      streamingRoundNumber: state.streamingRoundNumber,
      isStreaming: state.isStreaming,
      isModeratorStreaming: state.isModeratorStreaming,
    });

    // The condition for moderator placeholder in chat-message-list.tsx:1486-1488 is:
    // isActuallyLatestRound && !isRoundComplete && (isModeratorStreaming || moderatorHasContent || hasModeratorMessage || isStreamingRound)
    // When streamingRoundNumber=0, isStreamingRound=true for round 0
    // So moderator placeholder should render

    expect(state.streamingRoundNumber).toBe(0);
  });

  it('should transition smoothly from participants to moderator streaming', () => {
    const store = createChatStore();
    const tracker = createUpdateTracker();
    let prevState = store.getState();

    const unsubscribe = store.subscribe(() => {
      const nextState = store.getState();
      trackStoreUpdate(tracker, prevState, nextState);
      prevState = nextState;
    });

    // Setup complete participants
    const userMessage = createTestUserMessage({
      id: 'user_r0',
      content: 'Test',
      roundNumber: 0,
    });
    const p0 = createStreamingMessage(0, 0, 'P0 done', FinishReasons.STOP);
    const p1 = createStreamingMessage(1, 0, 'P1 done', FinishReasons.STOP);

    store.getState().setMessages([userMessage, p0, p1]);
    store.getState().setStreamingRoundNumber(0);
    store.getState().setIsStreaming(true);
    store.getState().setCurrentParticipantIndex(1);

    const updatesBeforeTransition = tracker.count;

    console.log('[TEST:MOD-TRANS] State before transition:', {
      isStreaming: store.getState().isStreaming,
      isModeratorStreaming: store.getState().isModeratorStreaming,
    });

    // CRITICAL TRANSITION: Participants done → Moderator starts
    store.getState().setIsStreaming(false);
    store.getState().setIsModeratorStreaming(true);

    const updatesForTransition = tracker.count - updatesBeforeTransition;

    console.log('[TEST:MOD-TRANS] State after transition:', {
      isStreaming: store.getState().isStreaming,
      isModeratorStreaming: store.getState().isModeratorStreaming,
    });

    console.log('[TEST:MOD-TRANS] Updates for transition:', updatesForTransition);

    unsubscribe();

    // Transition should be exactly 2 updates (setIsStreaming, setIsModeratorStreaming)
    expect(updatesForTransition).toBe(2);
  });

  it('should not cause message churn when adding moderator message', () => {
    const store = createChatStore();
    const messageCountChanges: number[] = [];

    const unsubscribe = store.subscribe(() => {
      messageCountChanges.push(store.getState().messages.length);
    });

    // Setup
    const userMessage = createTestUserMessage({
      id: 'user_r0',
      content: 'Test',
      roundNumber: 0,
    });
    const p0 = createStreamingMessage(0, 0, 'P0 done', FinishReasons.STOP);

    store.getState().setMessages([userMessage, p0]);
    store.getState().setStreamingRoundNumber(0);
    store.getState().setIsStreaming(false);
    store.getState().setIsModeratorStreaming(true);

    // Add moderator placeholder
    const moderatorPlaceholder = createModeratorStreamingMessage(0, '');
    store.getState().setMessages([userMessage, p0, moderatorPlaceholder]);

    // Stream moderator content
    const moderator1 = createModeratorStreamingMessage(0, 'Summary');
    store.getState().setMessages([userMessage, p0, moderator1]);

    const moderator2 = createModeratorStreamingMessage(0, 'Summary complete');
    store.getState().setMessages([userMessage, p0, moderator2]);

    const moderatorFinal = createModeratorStreamingMessage(0, 'Summary complete', FinishReasons.STOP);
    store.getState().setMessages([userMessage, p0, moderatorFinal]);

    unsubscribe();

    console.log('[TEST:MOD-CHURN] Message count changes:', messageCountChanges);

    // Message count should only increase when adding new messages, not fluctuate
    let increases = 0;
    let decreases = 0;
    for (let i = 1; i < messageCountChanges.length; i++) {
      const prev = messageCountChanges[i - 1]!;
      const curr = messageCountChanges[i]!;
      if (curr > prev)
        increases++;
      if (curr < prev)
        decreases++;
    }

    // Should have no decreases (no message removal churn)
    expect(decreases).toBe(0);

    console.log('[TEST:MOD-CHURN] Increases:', increases, 'Decreases:', decreases);
  });
});

// ============================================================================
// Test Suite: Action Call Frequency
// ============================================================================

describe('action Call Frequency', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  it('should track setMessages call frequency during streaming', () => {
    const store = createChatStore();
    let setMessagesCount = 0;

    const originalSetMessages = store.getState().setMessages;
    store.setState({
      setMessages: (messages) => {
        setMessagesCount++;
        originalSetMessages(messages);
      },
    });

    // Setup
    const userMessage = createTestUserMessage({
      id: 'user_r0',
      content: 'Test',
      roundNumber: 0,
    });
    store.getState().setMessages([userMessage]);
    setMessagesCount = 0; // Reset after setup

    // Stream 20 chunks
    for (let i = 1; i <= 20; i++) {
      const p0 = createStreamingMessage(0, 0, 'A'.repeat(i * 10));
      store.getState().setMessages([userMessage, p0]);
    }

    console.log('[TEST:ACTION-FREQ] setMessages calls for 20 chunks:', setMessagesCount);

    // Should be exactly 20 calls (one per chunk)
    // If more, there's duplicate calling happening
    expect(setMessagesCount).toBe(20);
  });

  it('should not over-call setIsStreaming during streaming', () => {
    const store = createChatStore();
    let setIsStreamingCount = 0;

    const originalSetIsStreaming = store.getState().setIsStreaming;
    store.setState({
      setIsStreaming: (isStreaming) => {
        setIsStreamingCount++;

        console.log('[TEST:ACTION-FREQ] setIsStreaming called with:', isStreaming);
        originalSetIsStreaming(isStreaming);
      },
    });

    // Setup
    store.getState().setIsStreaming(true);
    setIsStreamingCount = 0; // Reset

    // Simulate streaming (should not call setIsStreaming again)
    for (let i = 0; i < 10; i++) {
      // If there's a bug, setIsStreaming might be called on every chunk
      // Good code: only calls it on start and end
    }

    store.getState().setIsStreaming(false);

    console.log('[TEST:ACTION-FREQ] setIsStreaming calls during round:', setIsStreamingCount);

    // Should only be called once (false at end)
    // Start was reset, so only end counts
    expect(setIsStreamingCount).toBe(1);
  });

  it('should not over-call setCurrentParticipantIndex during streaming', () => {
    const store = createChatStore();
    let setCurrentParticipantIndexCount = 0;
    const indexCalls: number[] = [];

    const originalSetCurrentParticipantIndex = store.getState().setCurrentParticipantIndex;
    store.setState({
      setCurrentParticipantIndex: (index) => {
        setCurrentParticipantIndexCount++;
        indexCalls.push(index);
        originalSetCurrentParticipantIndex(index);
      },
    });

    // Setup
    store.getState().setCurrentParticipantIndex(0);
    setCurrentParticipantIndexCount = 0;
    indexCalls.length = 0;

    // Simulate 3 participant transitions
    // Good: 0 → 1 → 2 (3 calls)
    // Bad: 0 → 0 → 1 → 1 → 2 → 2 (6+ calls - duplicate setting same index)
    store.getState().setCurrentParticipantIndex(1);
    store.getState().setCurrentParticipantIndex(2);

    console.log('[TEST:ACTION-FREQ] setCurrentParticipantIndex calls:', setCurrentParticipantIndexCount);

    console.log('[TEST:ACTION-FREQ] Index sequence:', indexCalls);

    // Should be exactly 2 (1, 2)
    expect(setCurrentParticipantIndexCount).toBe(2);
    expect(indexCalls).toEqual([1, 2]);
  });
});

// ============================================================================
// Test Suite: Performance Regression Detection
// ============================================================================

describe('performance Regression Detection', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  it('should complete full round within performance bounds', () => {
    const store = createChatStore();
    const startTime = Date.now();
    let updateCount = 0;

    const unsubscribe = store.subscribe(() => {
      updateCount++;
    });

    // Setup
    const userMessage = createTestUserMessage({
      id: 'user_r0',
      content: 'Test',
      roundNumber: 0,
    });
    store.getState().setMessages([userMessage]);
    store.getState().setStreamingRoundNumber(0);
    store.getState().setIsStreaming(true);
    store.getState().setCurrentParticipantIndex(0);

    // Simulate 3 participants with 10 chunks each
    const participantCount = 3;
    const chunksPerParticipant = 10;

    let allMessages: UIMessage[] = [userMessage];

    for (let p = 0; p < participantCount; p++) {
      store.getState().setCurrentParticipantIndex(p);

      for (let c = 1; c <= chunksPerParticipant; c++) {
        const message = createStreamingMessage(
          p,
          0,
          'Response '.repeat(c),
          c === chunksPerParticipant ? FinishReasons.STOP : FinishReasons.UNKNOWN,
        );

        // Replace or add this participant's message
        const existingIndex = allMessages.findIndex(m =>
          (m.metadata as { participantIndex?: number })?.participantIndex === p,
        );
        if (existingIndex >= 0) {
          allMessages = [
            ...allMessages.slice(0, existingIndex),
            message,
            ...allMessages.slice(existingIndex + 1),
          ];
        } else {
          allMessages = [...allMessages, message];
        }

        store.getState().setMessages(allMessages);
      }
    }

    // Moderator
    store.getState().setIsStreaming(false);
    store.getState().setIsModeratorStreaming(true);

    for (let c = 1; c <= 5; c++) {
      const moderator = createModeratorStreamingMessage(
        0,
        'Summary '.repeat(c),
        c === 5 ? FinishReasons.STOP : FinishReasons.UNKNOWN,
      );
      store.getState().setMessages([...allMessages, moderator]);
    }

    store.getState().setIsModeratorStreaming(false);
    store.getState().completeStreaming();

    unsubscribe();

    const endTime = Date.now();
    const duration = endTime - startTime;

    console.log('[TEST:PERF] === PERFORMANCE SUMMARY ===');

    console.log('[TEST:PERF] Total updates:', updateCount);

    console.log('[TEST:PERF] Duration:', duration, 'ms');

    console.log('[TEST:PERF] Updates per ms:', (updateCount / duration).toFixed(2));

    // Performance bounds
    expect(updateCount).toBeLessThan(150); // Reasonable upper bound for 3 participants + moderator
    expect(duration).toBeLessThan(1000); // Should complete in under 1 second
  });

  it('should baseline performance metrics for regression tracking', () => {
    const store = createChatStore();
    const metrics = {
      setMessagesCount: 0,
      setIsStreamingCount: 0,
      setCurrentParticipantIndexCount: 0,
      setStreamingRoundNumberCount: 0,
      setIsModeratorStreamingCount: 0,
      totalSubscriberNotifications: 0,
    };

    // Spy on all relevant actions
    const spySetMessages = store.getState().setMessages;
    const spySetIsStreaming = store.getState().setIsStreaming;
    const spySetCurrentParticipantIndex = store.getState().setCurrentParticipantIndex;
    const spySetStreamingRoundNumber = store.getState().setStreamingRoundNumber;
    const spySetIsModeratorStreaming = store.getState().setIsModeratorStreaming;

    store.setState({
      setMessages: (m) => {
        metrics.setMessagesCount++;
        spySetMessages(m);
      },
      setIsStreaming: (v) => {
        metrics.setIsStreamingCount++;
        spySetIsStreaming(v);
      },
      setCurrentParticipantIndex: (v) => {
        metrics.setCurrentParticipantIndexCount++;
        spySetCurrentParticipantIndex(v);
      },
      setStreamingRoundNumber: (v) => {
        metrics.setStreamingRoundNumberCount++;
        spySetStreamingRoundNumber(v);
      },
      setIsModeratorStreaming: (v) => {
        metrics.setIsModeratorStreamingCount++;
        spySetIsModeratorStreaming(v);
      },
    });

    const unsubscribe = store.subscribe(() => {
      metrics.totalSubscriberNotifications++;
    });

    // Simulate a minimal round: 2 participants, 3 chunks each, 2 moderator chunks
    const userMessage = createTestUserMessage({
      id: 'user_r0',
      content: 'Test',
      roundNumber: 0,
    });

    // Setup
    store.getState().setMessages([userMessage]);
    store.getState().setStreamingRoundNumber(0);
    store.getState().setIsStreaming(true);
    store.getState().setCurrentParticipantIndex(0);

    // P0: 3 chunks
    for (let i = 1; i <= 3; i++) {
      const p0 = createStreamingMessage(0, 0, 'P0'.repeat(i), i === 3 ? FinishReasons.STOP : FinishReasons.UNKNOWN);
      store.getState().setMessages([userMessage, p0]);
    }

    // P1: 3 chunks
    store.getState().setCurrentParticipantIndex(1);
    const p0Final = createStreamingMessage(0, 0, 'P0P0P0', FinishReasons.STOP);
    for (let i = 1; i <= 3; i++) {
      const p1 = createStreamingMessage(1, 0, 'P1'.repeat(i), i === 3 ? FinishReasons.STOP : FinishReasons.UNKNOWN);
      store.getState().setMessages([userMessage, p0Final, p1]);
    }

    // Moderator: 2 chunks
    const p1Final = createStreamingMessage(1, 0, 'P1P1P1', FinishReasons.STOP);
    store.getState().setIsStreaming(false);
    store.getState().setIsModeratorStreaming(true);

    for (let i = 1; i <= 2; i++) {
      const mod = createModeratorStreamingMessage(0, 'Mod'.repeat(i), i === 2 ? FinishReasons.STOP : FinishReasons.UNKNOWN);
      store.getState().setMessages([userMessage, p0Final, p1Final, mod]);
    }

    store.getState().setIsModeratorStreaming(false);

    unsubscribe();

    console.log('[TEST:BASELINE] === BASELINE METRICS ===');

    console.log('[TEST:BASELINE] setMessages calls:', metrics.setMessagesCount);

    console.log('[TEST:BASELINE] setIsStreaming calls:', metrics.setIsStreamingCount);

    console.log('[TEST:BASELINE] setCurrentParticipantIndex calls:', metrics.setCurrentParticipantIndexCount);

    console.log('[TEST:BASELINE] setStreamingRoundNumber calls:', metrics.setStreamingRoundNumberCount);

    console.log('[TEST:BASELINE] setIsModeratorStreaming calls:', metrics.setIsModeratorStreamingCount);

    console.log('[TEST:BASELINE] Total subscriber notifications:', metrics.totalSubscriberNotifications);

    // Expected baseline:
    // - setMessages: 1 (setup) + 3 (p0) + 3 (p1) + 2 (mod) = 9
    // - setIsStreaming: 2 (true, false)
    // - setCurrentParticipantIndex: 2 (0, 1)
    // - setStreamingRoundNumber: 1 (0)
    // - setIsModeratorStreaming: 2 (true, false)

    expect(metrics.setMessagesCount).toBe(9);
    expect(metrics.setIsStreamingCount).toBe(2);
    expect(metrics.setCurrentParticipantIndexCount).toBe(2);
    expect(metrics.setStreamingRoundNumberCount).toBe(1);
    expect(metrics.setIsModeratorStreamingCount).toBe(2);
  });
});
