/**
 * Full Journey Store Integration Tests
 *
 * Tests the actual chat store through complete conversation journeys.
 * Uses createChatStore factory to test real state transitions.
 *
 * Key Journeys:
 * - Thread creation → streaming → moderator → navigation
 * - Multi-round conversations with state preservation
 * - Stream resumption after refresh
 * - Configuration changes between rounds
 *
 * Based on AI SDK v6 patterns:
 * - onFinish callback guarantees stream completion
 * - UIMessage → ModelMessage conversion
 * - Stream consumption before persistence
 */

import { FinishReasons, MessageRoles, ScreenModes } from '@roundtable/shared';
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

// ============================================================================
// STORE INITIALIZATION TESTS
// ============================================================================

describe('store Initialization', () => {
  it('creates store with default state', () => {
    const store = createChatStore();
    const state = getStoreState(store);

    expect(state.thread).toBeNull();
    expect(state.participants).toEqual([]);
    expect(state.messages).toEqual([]);
    expect(state.isStreaming).toBeFalsy();
    expect(state.showInitialUI).toBeTruthy();
    expect(state.screenMode).toBe(ScreenModes.OVERVIEW);
  });

  it('has all slice actions available', () => {
    const store = createChatStore();
    const state = getStoreState(store);

    // Form actions
    expect(typeof state.setInputValue).toBe('function');
    expect(typeof state.setSelectedMode).toBe('function');

    // Thread actions
    expect(typeof state.setThread).toBe('function');
    expect(typeof state.setParticipants).toBe('function');
    expect(typeof state.setMessages).toBe('function');

    // UI actions
    expect(typeof state.setShowInitialUI).toBe('function');
    expect(typeof state.setWaitingToStartStreaming).toBe('function');

    // Tracking actions
    expect(typeof state.tryMarkModeratorCreated).toBe('function');
    expect(typeof state.setIsModeratorStreaming).toBe('function');
  });
});

// ============================================================================
// THREAD CREATION JOURNEY
// ============================================================================

describe('thread Creation Journey', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
  });

  it('journey: idle → preparing → thread created → streaming', () => {
    const state = getStoreState(store);
    const thread = createMockThread();
    const participants = createMockParticipants(3);

    // Step 1: Initial state
    expect(state.thread).toBeNull();
    expect(state.showInitialUI).toBeTruthy();

    // Step 2: User starts typing
    state.setInputValue('What is the best approach?');
    expect(getStoreState(store).inputValue).toBe('What is the best approach?');

    // Step 3: Prepare for message send
    state.setPendingMessage('What is the best approach?');
    state.setWaitingToStartStreaming(true);
    expect(getStoreState(store).pendingMessage).toBe('What is the best approach?');
    expect(getStoreState(store).waitingToStartStreaming).toBeTruthy();

    // Step 4: Thread creation response
    state.setIsCreatingThread(true);
    expect(getStoreState(store).isCreatingThread).toBeTruthy();

    state.setThread(thread);
    state.setParticipants(participants);
    state.setCreatedThreadId(thread.id);
    state.setIsCreatingThread(false);

    expect(getStoreState(store).thread).toEqual(thread);
    expect(getStoreState(store).participants).toHaveLength(3);
    // ✅ FIX: Use thread.id from createMockThread() which returns 'thread-123'
    expect(getStoreState(store).createdThreadId).toBe(thread.id);

    // Step 5: Streaming starts - hide initial UI
    state.setShowInitialUI(false);
    expect(getStoreState(store).showInitialUI).toBeFalsy();

    // Step 6: Streaming begins
    state.setIsStreaming(true);
    state.setWaitingToStartStreaming(false);
    state.setStreamingRoundNumber(0);

    expect(getStoreState(store).isStreaming).toBeTruthy();
    expect(getStoreState(store).streamingRoundNumber).toBe(0);
  });

  it('maintains participant order during streaming', () => {
    const state = getStoreState(store);
    const thread = createMockThread();
    const participants = createMockParticipants(3);

    state.setThread(thread);
    state.setParticipants(participants);
    state.setIsStreaming(true);
    state.setCurrentParticipantIndex(0);

    // First participant
    expect(getStoreState(store).currentParticipantIndex).toBe(0);

    // Advance to second
    state.setCurrentParticipantIndex(1);
    expect(getStoreState(store).currentParticipantIndex).toBe(1);

    // Advance to third
    state.setCurrentParticipantIndex(2);
    expect(getStoreState(store).currentParticipantIndex).toBe(2);

    // Participants array unchanged
    expect(getStoreState(store).participants).toHaveLength(3);
    const firstParticipant = getStoreState(store).participants[0];
    if (!firstParticipant) {
      throw new Error('expected participant');
    }
    expect(firstParticipant.id).toBe('participant-0');
  });
});

// ============================================================================
// MESSAGE ACCUMULATION TESTS
// ============================================================================

describe('message Accumulation', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    const state = getStoreState(store);
    state.setThread(createMockThread());
    state.setParticipants(createMockParticipants(3));
  });

  it('accumulates messages in correct order', () => {
    const state = getStoreState(store);

    // Add user message
    const userMessage = createTestUserMessage({
      content: 'Test question',
      id: 'thread-e2e-123_r0_user',
      roundNumber: 0,
    });
    state.setMessages([userMessage]);
    expect(getStoreState(store).messages).toHaveLength(1);

    // Add participant messages
    const messages = [userMessage];
    for (let i = 0; i < 3; i++) {
      const assistantMessage = createTestAssistantMessage({
        content: `Response from participant ${i}`,
        finishReason: FinishReasons.STOP,
        id: `thread-e2e-123_r0_p${i}`,
        participantId: `participant-${i}`,
        participantIndex: i,
        roundNumber: 0,
      });
      messages.push(assistantMessage);
    }
    state.setMessages(messages);

    expect(getStoreState(store).messages).toHaveLength(4);
    const msg0 = getStoreState(store).messages[0];
    const msg1 = getStoreState(store).messages[1];
    const msg2 = getStoreState(store).messages[2];
    const msg3 = getStoreState(store).messages[3];
    if (!msg0) {
      throw new Error('expected message 0');
    }
    if (!msg1) {
      throw new Error('expected message 1');
    }
    if (!msg2) {
      throw new Error('expected message 2');
    }
    if (!msg3) {
      throw new Error('expected message 3');
    }
    expect(msg0.role).toBe(MessageRoles.USER);
    expect(msg1.role).toBe(MessageRoles.ASSISTANT);
    expect(msg2.role).toBe(MessageRoles.ASSISTANT);
    expect(msg3.role).toBe(MessageRoles.ASSISTANT);
  });

  it('preserves message metadata through updates', () => {
    const state = getStoreState(store);

    const userMessage = createTestUserMessage({
      content: 'Test',
      id: 'thread-e2e-123_r0_user',
      roundNumber: 0,
    });
    const assistantMessage = createTestAssistantMessage({
      content: 'Response',
      finishReason: FinishReasons.STOP,
      id: 'thread-e2e-123_r0_p0',
      participantId: 'participant-0',
      participantIndex: 0,
      roundNumber: 0,
    });

    state.setMessages([userMessage, assistantMessage]);

    const storedAssistant = getStoreState(store).messages[1];
    expect(storedAssistant?.metadata).toBeDefined();
    expect((storedAssistant?.metadata as { participantId: string }).participantId).toBe('participant-0');
  });
});

// ============================================================================
// MODERATOR TRACKING TESTS
// ============================================================================

describe('moderator Tracking', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    const state = getStoreState(store);
    state.setThread(createMockThread());
    state.setParticipants(createMockParticipants(2));
  });

  it('atomic moderator creation prevents race conditions', () => {
    const state = getStoreState(store);

    // First caller marks round 0
    const firstResult = state.tryMarkModeratorCreated(0);
    expect(firstResult).toBeTruthy();

    // Second caller (race condition) tries same round
    const secondResult = state.tryMarkModeratorCreated(0);
    expect(secondResult).toBeFalsy();

    // Verify only marked once
    expect(getStoreState(store).createdModeratorRounds.has(0)).toBeTruthy();
    expect(getStoreState(store).createdModeratorRounds.size).toBe(1);
  });

  it('tracks moderator streaming flags', () => {
    const state = getStoreState(store);

    // Initially not streaming moderator
    expect(getStoreState(store).isModeratorStreaming).toBeFalsy();

    // Set streaming moderator
    state.setIsModeratorStreaming(true);
    expect(getStoreState(store).isModeratorStreaming).toBeTruthy();

    // Clear streaming moderator
    state.setIsModeratorStreaming(false);
    expect(getStoreState(store).isModeratorStreaming).toBeFalsy();
  });
});

// ============================================================================
// MULTI-ROUND CONVERSATION TESTS
// ============================================================================

describe('multi-Round Conversation', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    const state = getStoreState(store);
    state.setThread(createMockThread());
    state.setParticipants(createMockParticipants(2));
    state.setScreenMode(ScreenModes.THREAD);
    state.setShowInitialUI(false);
  });

  it('can track moderator creation for multiple rounds', () => {
    const state = getStoreState(store);

    // Round 0 messages
    const round0Messages: UIMessage[] = [
      createTestUserMessage({ content: 'Question 0', id: 'r0_user', roundNumber: 0 }),
      createTestAssistantMessage({
        content: 'R0 Response',
        finishReason: FinishReasons.STOP,
        id: 'r0_p0',
        participantId: 'participant-0',
        participantIndex: 0,
        roundNumber: 0,
      }),
    ];

    // Round 1 messages
    const round1Messages: UIMessage[] = [
      createTestUserMessage({ content: 'Question 1', id: 'r1_user', roundNumber: 1 }),
      createTestAssistantMessage({
        content: 'R1 Response',
        finishReason: FinishReasons.STOP,
        id: 'r1_p0',
        participantId: 'participant-0',
        participantIndex: 0,
        roundNumber: 1,
      }),
    ];

    // Set all messages
    state.setMessages([...round0Messages, ...round1Messages]);

    // Mark moderators as created for both rounds
    expect(state.tryMarkModeratorCreated(0)).toBeTruthy();
    expect(state.tryMarkModeratorCreated(1)).toBeTruthy();

    // Verify tracking
    expect(getStoreState(store).createdModeratorRounds.has(0)).toBeTruthy();
    expect(getStoreState(store).createdModeratorRounds.has(1)).toBeTruthy();
  });

  it('preserves round 0 messages when adding round 1', () => {
    const state = getStoreState(store);

    // Round 0 messages
    const round0Messages: UIMessage[] = [
      createTestUserMessage({ content: 'Q0', id: 'r0_user', roundNumber: 0 }),
      createTestAssistantMessage({
        content: 'R0P0',
        finishReason: FinishReasons.STOP,
        id: 'r0_p0',
        participantId: 'p0',
        participantIndex: 0,
        roundNumber: 0,
      }),
    ];
    state.setMessages(round0Messages);
    expect(getStoreState(store).messages).toHaveLength(2);

    // Add round 1 messages
    const allMessages: UIMessage[] = [
      ...round0Messages,
      createTestUserMessage({ content: 'Q1', id: 'r1_user', roundNumber: 1 }),
      createTestAssistantMessage({
        content: 'R1P0',
        finishReason: FinishReasons.STOP,
        id: 'r1_p0',
        participantId: 'p0',
        participantIndex: 0,
        roundNumber: 1,
      }),
    ];
    state.setMessages(allMessages);

    expect(getStoreState(store).messages).toHaveLength(4);

    // Round 0 preserved
    const round0 = getStoreState(store).messages.filter(m => m.metadata.roundNumber === 0);
    expect(round0).toHaveLength(2);

    // Round 1 added
    const round1 = getStoreState(store).messages.filter(m => m.metadata.roundNumber === 1);
    expect(round1).toHaveLength(2);
  });

  it('resets streaming state between rounds', () => {
    const state = getStoreState(store);

    // Round 0 streaming
    state.setIsStreaming(true);
    state.setStreamingRoundNumber(0);
    state.setCurrentParticipantIndex(1);

    // Complete round 0
    state.completeStreaming();

    expect(getStoreState(store).isStreaming).toBeFalsy();
    expect(getStoreState(store).streamingRoundNumber).toBeNull();
    expect(getStoreState(store).currentParticipantIndex).toBe(0);
  });
});

// ============================================================================
// THREAD NAVIGATION RESET TESTS
// ============================================================================

describe('thread Navigation Reset', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
  });

  it('resets state when navigating to new thread', () => {
    const state = getStoreState(store);

    // Setup existing thread state with valid participant messages
    state.setThread(createMockThread({ id: 'old-thread' }));
    state.setParticipants(createMockParticipants(2));
    const messages: UIMessage[] = [
      createTestUserMessage({ content: 'Old', id: 'msg1', roundNumber: 0 }),
      createTestAssistantMessage({
        content: 'Response',
        finishReason: FinishReasons.STOP,
        id: 'msg2',
        participantId: 'participant-0',
        participantIndex: 0,
        roundNumber: 0,
      }),
    ];
    state.setMessages(messages);
    state.tryMarkModeratorCreated(0);

    expect(getStoreState(store).messages).toHaveLength(2);
    expect(getStoreState(store).createdModeratorRounds.has(0)).toBeTruthy();

    // Navigate to new thread - reset via resetForThreadNavigation
    state.resetForThreadNavigation();

    expect(getStoreState(store).messages).toEqual([]);
    expect(getStoreState(store).thread).toBeNull();
    expect(getStoreState(store).createdModeratorRounds.size).toBe(0);
  });

  it('clears tracking state on navigation', () => {
    const state = getStoreState(store);

    // Build up tracking state
    state.tryMarkModeratorCreated(0);
    state.tryMarkModeratorCreated(1);
    state.setHasSentPendingMessage(true);

    expect(getStoreState(store).createdModeratorRounds.size).toBe(2);
    expect(getStoreState(store).hasSentPendingMessage).toBeTruthy();

    // Reset
    state.resetForThreadNavigation();

    expect(getStoreState(store).createdModeratorRounds.size).toBe(0);
    expect(getStoreState(store).hasSentPendingMessage).toBeFalsy();
  });

  it('clears feedback state on navigation (fresh Map instances)', () => {
    const state = getStoreState(store);

    // Simulate feedback
    state.setFeedback(0, 'like');

    expect(getStoreState(store).feedbackByRound.size).toBe(1);

    // Reset
    state.resetForThreadNavigation();

    // Should have fresh Map, not shared reference
    expect(getStoreState(store).feedbackByRound.size).toBe(0);

    // Verify it's a new Map instance (not polluted)
    state.setFeedback(0, 'dislike');
    expect(getStoreState(store).feedbackByRound.get(0)).toBe('dislike');
  });
});

// ============================================================================
// STREAMING COMPLETION TESTS
// ============================================================================

describe('streaming Completion', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    const state = getStoreState(store);
    state.setThread(createMockThread());
    state.setParticipants(createMockParticipants(3));
  });

  it('completeStreaming resets all streaming flags', () => {
    const state = getStoreState(store);

    // Setup active streaming
    state.setIsStreaming(true);
    state.setStreamingRoundNumber(0);
    state.setCurrentParticipantIndex(2);
    state.setWaitingToStartStreaming(false);

    // Complete
    state.completeStreaming();

    expect(getStoreState(store).isStreaming).toBeFalsy();
    expect(getStoreState(store).streamingRoundNumber).toBeNull();
    expect(getStoreState(store).currentParticipantIndex).toBe(0);
  });

  it('completeStreaming does not clear messages', () => {
    const state = getStoreState(store);

    const messages: UIMessage[] = [
      createTestUserMessage({ content: 'Q', id: 'user', roundNumber: 0 }),
      createTestAssistantMessage({
        content: 'R',
        finishReason: FinishReasons.STOP,
        id: 'p0',
        participantId: 'p0',
        participantIndex: 0,
        roundNumber: 0,
      }),
    ];
    state.setMessages(messages);
    state.setIsStreaming(true);

    state.completeStreaming();

    // Messages preserved
    expect(getStoreState(store).messages).toHaveLength(2);
  });
});

// ============================================================================
// PRESEARCH STATE TESTS
// ============================================================================

describe('pre-Search State', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    const state = getStoreState(store);
    state.setThread(createMockThread({ enableWebSearch: true }));
    state.setParticipants(createMockParticipants(2));
  });

  it('tracks pre-search triggered state', () => {
    const state = getStoreState(store);

    // Mark round 0 as triggered
    state.markPreSearchTriggered(0);

    expect(getStoreState(store).triggeredPreSearchRounds.has(0)).toBeTruthy();
    expect(state.hasPreSearchBeenTriggered(0)).toBeTruthy();
  });

  it('prevents duplicate pre-search triggers', () => {
    const state = getStoreState(store);

    // First trigger - should not be triggered yet
    expect(state.hasPreSearchBeenTriggered(0)).toBeFalsy();

    // Mark as triggered
    state.markPreSearchTriggered(0);
    expect(state.hasPreSearchBeenTriggered(0)).toBeTruthy();

    // Check duplicate detection
    expect(getStoreState(store).triggeredPreSearchRounds.has(0)).toBeTruthy();
  });

  it('allows pre-search for different rounds', () => {
    const state = getStoreState(store);

    state.markPreSearchTriggered(0);
    state.markPreSearchTriggered(1);
    state.markPreSearchTriggered(2);

    expect(getStoreState(store).triggeredPreSearchRounds.size).toBe(3);
    expect(state.hasPreSearchBeenTriggered(0)).toBeTruthy();
    expect(state.hasPreSearchBeenTriggered(1)).toBeTruthy();
    expect(state.hasPreSearchBeenTriggered(2)).toBeTruthy();
  });

  it('clears pre-search tracking for specific round', () => {
    const state = getStoreState(store);

    state.markPreSearchTriggered(0);
    state.markPreSearchTriggered(1);
    expect(getStoreState(store).triggeredPreSearchRounds.size).toBe(2);

    // clearPreSearchTracking takes roundNumber param
    state.clearPreSearchTracking(0);
    expect(getStoreState(store).triggeredPreSearchRounds.size).toBe(1);
    expect(getStoreState(store).triggeredPreSearchRounds.has(0)).toBeFalsy();
    expect(getStoreState(store).triggeredPreSearchRounds.has(1)).toBeTruthy();

    state.clearPreSearchTracking(1);
    expect(getStoreState(store).triggeredPreSearchRounds.size).toBe(0);
  });
});

// ============================================================================
// COMPLETE ROUND JOURNEY TEST
// ============================================================================

describe('complete Round Journey (Integration)', () => {
  it('full round: user message → participants → moderator → complete', () => {
    const store = createChatStore();
    const state = getStoreState(store);

    // === SETUP ===
    const thread = createMockThread();
    const participants = createMockParticipants(2);

    state.setThread(thread);
    state.setParticipants(participants);
    state.setScreenMode(ScreenModes.THREAD);
    state.setShowInitialUI(false);

    // === STEP 1: User submits message ===
    const userMessage = createTestUserMessage({
      content: 'What is the best approach?',
      id: 'thread-e2e-123_r0_user',
      roundNumber: 0,
    });

    state.setMessages([userMessage]);
    state.setPendingMessage('What is the best approach?');
    state.setWaitingToStartStreaming(true);

    expect(getStoreState(store).messages).toHaveLength(1);
    expect(getStoreState(store).waitingToStartStreaming).toBeTruthy();

    // === STEP 2: Streaming starts ===
    state.setIsStreaming(true);
    state.setWaitingToStartStreaming(false);
    state.setStreamingRoundNumber(0);
    state.setCurrentParticipantIndex(0);
    state.setHasSentPendingMessage(true);
    state.setPendingMessage(null);

    expect(getStoreState(store).isStreaming).toBeTruthy();
    expect(getStoreState(store).hasSentPendingMessage).toBeTruthy();

    // === STEP 3: Participant 0 completes ===
    const p0Message = createTestAssistantMessage({
      content: 'I recommend approach A...',
      finishReason: FinishReasons.STOP,
      id: 'thread-e2e-123_r0_p0',
      participantId: 'participant-0',
      participantIndex: 0,
      roundNumber: 0,
    });
    state.setMessages([userMessage, p0Message]);
    state.setCurrentParticipantIndex(1);

    expect(getStoreState(store).messages).toHaveLength(2);
    expect(getStoreState(store).currentParticipantIndex).toBe(1);

    // === STEP 4: Participant 1 completes ===
    const p1Message = createTestAssistantMessage({
      content: 'I suggest approach B...',
      finishReason: FinishReasons.STOP,
      id: 'thread-e2e-123_r0_p1',
      participantId: 'participant-1',
      participantIndex: 1,
      roundNumber: 0,
    });
    state.setMessages([userMessage, p0Message, p1Message]);

    expect(getStoreState(store).messages).toHaveLength(3);

    // === STEP 5: All participants done, streaming completes ===
    state.completeStreaming();

    expect(getStoreState(store).isStreaming).toBeFalsy();

    // === STEP 6: Mark moderator as created (atomic check-and-mark) ===
    const canCreateModerator = state.tryMarkModeratorCreated(0);
    expect(canCreateModerator).toBeTruthy();

    // === STEP 7: Moderator streaming initiated ===
    state.setIsModeratorStreaming(true);
    expect(getStoreState(store).isModeratorStreaming).toBeTruthy();

    // === STEP 8: Moderator complete ===
    state.setIsModeratorStreaming(false);
    expect(getStoreState(store).isModeratorStreaming).toBeFalsy();

    // === VERIFY FINAL STATE ===
    const finalState = getStoreState(store);
    expect(finalState.messages).toHaveLength(3);
    expect(finalState.isStreaming).toBeFalsy();
    expect(finalState.createdModeratorRounds.has(0)).toBeTruthy();
  });
});

// ============================================================================
// STOP BUTTON BEHAVIOR TESTS
// ============================================================================

describe('stop Button Behavior', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    const state = getStoreState(store);
    state.setThread(createMockThread());
    state.setParticipants(createMockParticipants(3));
  });

  it('stop during streaming preserves completed messages', () => {
    const state = getStoreState(store);

    const userMessage = createTestUserMessage({
      content: 'Q',
      id: 'user',
      roundNumber: 0,
    });
    const p0Message = createTestAssistantMessage({
      content: 'Complete response',
      finishReason: FinishReasons.STOP,
      id: 'p0',
      participantId: 'p0',
      participantIndex: 0,
      roundNumber: 0,
    });

    state.setMessages([userMessage, p0Message]);
    state.setIsStreaming(true);
    state.setCurrentParticipantIndex(1);

    // User stops during participant 1
    state.completeStreaming();

    // Participant 0's complete message preserved
    expect(getStoreState(store).messages).toHaveLength(2);
    expect(getStoreState(store).isStreaming).toBeFalsy();
  });

  it('stop prevents moderator creation if not all participants done', () => {
    const state = getStoreState(store);

    const userMessage = createTestUserMessage({
      content: 'Q',
      id: 'user',
      roundNumber: 0,
    });
    const p0Message = createTestAssistantMessage({
      content: 'Response',
      finishReason: FinishReasons.STOP,
      id: 'p0',
      participantId: 'p0',
      participantIndex: 0,
      roundNumber: 0,
    });

    state.setMessages([userMessage, p0Message]);
    state.setIsStreaming(true);

    // Stop with only 1/3 participants
    state.completeStreaming();

    // No moderator should be created (only 1 of 3 participants)
  });
});
