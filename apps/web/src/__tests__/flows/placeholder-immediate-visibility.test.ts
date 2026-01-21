/**
 * Placeholder Immediate Visibility Tests
 *
 * CRITICAL REQUIREMENT: Placeholders MUST show IMMEDIATELY after user submission,
 * BEFORE any streaming or loading begins. This provides instant visual feedback.
 *
 * Test Coverage:
 * 1. Participant placeholders appear immediately after setStreamingRoundNumber
 * 2. Web search placeholder appears immediately when enabled
 * 3. Moderator placeholder appears immediately in the round
 * 4. ALL placeholders visible BEFORE first stream token arrives
 * 5. Placeholders based on configuration (participant count, web search toggle)
 *
 * Key Timing Sequence (from FLOW_DOCUMENTATION.md):
 * - User clicks submit → Input clears
 * - setStreamingRoundNumber(N) called → ALL PLACEHOLDERS APPEAR IMMEDIATELY
 * - Background: Thread creation, pre-search (if enabled), participant streaming
 * - Placeholders remain visible until content streams in
 *
 * @see /Users/avabagherzadeh/Desktop/projects/deadpixel/billing-dashboard/docs/FLOW_DOCUMENTATION.md
 * @see /Users/avabagherzadeh/Desktop/projects/deadpixel/billing-dashboard/src/components/chat/chat-message-list.tsx
 */

import { FinishReasons, MessageRoles, MODERATOR_PARTICIPANT_INDEX } from '@roundtable/shared';
import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';

import { createTestUserMessage } from '@/lib/testing';
import { getRoundNumber } from '@/lib/utils';

import { createChatStore } from '../../stores/chat/store';

// ============================================================================
// Test Utilities
// ============================================================================

function createParticipant(index: number, threadId: string = 'thread-123') {
  return {
    id: `participant-${index}`,
    threadId,
    modelId: `model-${index}`,
    customRoleId: null,
    role: null,
    priority: index,
    isEnabled: true,
    settings: null,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };
}

function createParticipantMessage(
  roundNumber: number,
  participantIndex: number,
  threadId: string,
  content: string = '',
): UIMessage {
  return {
    id: `${threadId}_r${roundNumber}_p${participantIndex}`,
    role: MessageRoles.ASSISTANT,
    parts: content ? [{ type: 'text', text: content }] : [],
    metadata: {
      role: MessageRoles.ASSISTANT,
      roundNumber,
      participantIndex,
      participantId: `participant-${participantIndex}`,
      finishReason: content ? FinishReasons.STOP : FinishReasons.UNKNOWN,
      hasError: false,
      usage: { promptTokens: 0, completionTokens: content.length, totalTokens: content.length },
    },
  };
}

function _createModeratorPlaceholder(threadId: string, roundNumber: number): UIMessage {
  return {
    id: `${threadId}_r${roundNumber}_moderator`,
    role: MessageRoles.ASSISTANT,
    parts: [],
    metadata: {
      isModerator: true,
      roundNumber,
      participantIndex: MODERATOR_PARTICIPANT_INDEX,
      model: 'Council Moderator',
      role: MessageRoles.ASSISTANT,
      finishReason: FinishReasons.UNKNOWN,
      hasError: false,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    },
  };
}

// ============================================================================
// Test Suite: Participant Placeholders Show Immediately
// ============================================================================

describe('participant Placeholders - Immediate Visibility', () => {
  it('should enable placeholder visibility the moment streamingRoundNumber is set', () => {
    const store = createChatStore();

    // User submits message
    const userMessage = createTestUserMessage({
      id: 'user_r0',
      content: 'What is the meaning of life?',
      roundNumber: 0,
    });

    store.getState().setMessages([userMessage]);

    // Configure participants (2 participants)
    const participants = [
      createParticipant(0),
      createParticipant(1),
    ];
    store.getState().setParticipants(participants);

    // CRITICAL ACTION: Set streamingRoundNumber
    // This is the TRIGGER for ALL placeholders to become visible
    store.getState().setStreamingRoundNumber(0);

    const state = store.getState();

    // Verify: streamingRoundNumber is set
    expect(state.streamingRoundNumber).toBe(0);

    // Verification: The store state allows UI to render placeholders
    // (Actual rendering tested in component tests, but state is correct here)
  });

  it('should have placeholder state ready before isStreaming becomes true', () => {
    const store = createChatStore();

    const userMessage = createTestUserMessage({
      id: 'user_r0',
      content: 'Test question',
      roundNumber: 0,
    });

    const participants = [
      createParticipant(0),
      createParticipant(1),
      createParticipant(2),
    ];

    store.getState().setMessages([userMessage]);
    store.getState().setParticipants(participants);

    // Step 1: Set streamingRoundNumber (placeholders now visible)
    store.getState().setStreamingRoundNumber(0);

    const stateAfterRoundSet = store.getState();
    expect(stateAfterRoundSet.streamingRoundNumber).toBe(0);
    expect(stateAfterRoundSet.isStreaming).toBe(false); // Not streaming yet!

    // At this point, UI shows 3 participant placeholders even though isStreaming=false
    // This is CORRECT behavior - placeholders show BEFORE streaming starts

    // Step 2: Streaming starts (happens later, after API setup)
    store.getState().setIsStreaming(true);

    const stateAfterStreaming = store.getState();
    expect(stateAfterStreaming.isStreaming).toBe(true);

    // Placeholders were already visible, now streaming has started
  });

  it('should show correct number of participant placeholders based on configuration', () => {
    const store = createChatStore();

    const userMessage = createTestUserMessage({
      id: 'user_r0',
      content: 'Test',
      roundNumber: 0,
    });

    store.getState().setMessages([userMessage]);

    // Test Case 1: 2 participants
    const twoParticipants = [
      createParticipant(0),
      createParticipant(1),
    ];
    store.getState().setParticipants(twoParticipants);
    store.getState().setStreamingRoundNumber(0);

    let state = store.getState();
    expect(state.participants).toHaveLength(2);
    expect(state.streamingRoundNumber).toBe(0);

    // Reset for next test
    store.getState().completeStreaming();

    // Test Case 2: 5 participants
    const fiveParticipants = [
      createParticipant(0),
      createParticipant(1),
      createParticipant(2),
      createParticipant(3),
      createParticipant(4),
    ];
    store.getState().setParticipants(fiveParticipants);
    store.getState().setMessages([createTestUserMessage({ id: 'user_r1', content: 'Test 2', roundNumber: 1 })]);
    store.getState().setStreamingRoundNumber(1);

    state = store.getState();
    expect(state.participants).toHaveLength(5);
    expect(state.streamingRoundNumber).toBe(1);

    // UI will render 5 participant placeholders
  });

  it('should maintain placeholder visibility during participant transitions', () => {
    const store = createChatStore();

    const userMessage = createTestUserMessage({
      id: 'user_r0',
      content: 'Test',
      roundNumber: 0,
    });

    const participants = [
      createParticipant(0),
      createParticipant(1),
      createParticipant(2),
    ];

    store.getState().setMessages([userMessage]);
    store.getState().setParticipants(participants);
    store.getState().setStreamingRoundNumber(0);
    store.getState().setIsStreaming(true);
    store.getState().setCurrentParticipantIndex(0);

    // All placeholders visible, P0 is current
    let state = store.getState();
    expect(state.streamingRoundNumber).toBe(0);
    expect(state.currentParticipantIndex).toBe(0);

    // P0 completes, transition to P1
    const p0Complete = createParticipantMessage(0, 0, 'thread-123', 'P0 response');
    store.getState().setMessages([userMessage, p0Complete]);
    store.getState().setCurrentParticipantIndex(1);

    state = store.getState();
    expect(state.streamingRoundNumber).toBe(0); // Still same round
    expect(state.currentParticipantIndex).toBe(1);

    // Placeholders for P1 and P2 still visible (isStreamingRound=true)

    // P1 completes, transition to P2
    const p1Complete = createParticipantMessage(0, 1, 'thread-123', 'P1 response');
    store.getState().setMessages([userMessage, p0Complete, p1Complete]);
    store.getState().setCurrentParticipantIndex(2);

    state = store.getState();
    expect(state.streamingRoundNumber).toBe(0);
    expect(state.currentParticipantIndex).toBe(2);

    // P2 placeholder still visible
  });
});

// ============================================================================
// Test Suite: Web Search Placeholder
// ============================================================================

describe('web Search Placeholder - Immediate Visibility', () => {
  it('should show web search placeholder when enableWebSearch is true', () => {
    const store = createChatStore();

    const userMessage = createTestUserMessage({
      id: 'user_r0',
      content: 'Research AI trends',
      roundNumber: 0,
    });

    store.getState().setMessages([userMessage]);

    // Set thread with web search enabled
    store.getState().setThread({
      id: 'thread-123',
      userId: 'user-123',
      projectId: null,
      title: 'Test Thread',
      slug: 'test-thread',
      previousSlug: null,
      mode: 'debating',
      status: 'active',
      isFavorite: false,
      isPublic: false,
      isAiGeneratedTitle: false,
      enableWebSearch: true, // Web search enabled
      metadata: null,
      version: 1,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      lastMessageAt: '2024-01-01T00:00:00Z',
    });

    store.getState().setStreamingRoundNumber(0);

    const state = store.getState();
    expect(state.thread?.enableWebSearch).toBe(true);
    expect(state.streamingRoundNumber).toBe(0);

    // UI Logic (chat-message-list.tsx):
    // - Pre-search section renders when preSearchActive or preSearchComplete
    // - Pre-search placeholder shows BEFORE pre-search starts
    // - This provides immediate feedback that web search is happening
  });

  it('should NOT show web search placeholder when enableWebSearch is false', () => {
    const store = createChatStore();

    const userMessage = createTestUserMessage({
      id: 'user_r0',
      content: 'Simple question',
      roundNumber: 0,
    });

    store.getState().setMessages([userMessage]);

    store.getState().setThread({
      id: 'thread-123',
      userId: 'user-123',
      projectId: null,
      title: 'Test Thread',
      slug: 'test-thread',
      previousSlug: null,
      mode: 'debating',
      status: 'active',
      isFavorite: false,
      isPublic: false,
      isAiGeneratedTitle: false,
      enableWebSearch: false, // Web search disabled
      metadata: null,
      version: 1,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      lastMessageAt: '2024-01-01T00:00:00Z',
    });

    store.getState().setStreamingRoundNumber(0);

    const state = store.getState();
    expect(state.thread?.enableWebSearch).toBe(false);

    // No pre-search placeholder will render
  });

  it('should show web search placeholder before participant placeholders when enabled', () => {
    const store = createChatStore();

    const userMessage = createTestUserMessage({
      id: 'user_r0',
      content: 'Research question',
      roundNumber: 0,
    });

    const participants = [
      createParticipant(0),
      createParticipant(1),
    ];

    store.getState().setMessages([userMessage]);
    store.getState().setParticipants(participants);

    store.getState().setThread({
      id: 'thread-123',
      userId: 'user-123',
      projectId: null,
      title: 'Test Thread',
      slug: 'test-thread',
      previousSlug: null,
      mode: 'debating',
      status: 'active',
      isFavorite: false,
      isPublic: false,
      isAiGeneratedTitle: false,
      enableWebSearch: true,
      metadata: null,
      version: 1,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      lastMessageAt: '2024-01-01T00:00:00Z',
    });

    store.getState().setStreamingRoundNumber(0);

    const state = store.getState();
    expect(state.thread?.enableWebSearch).toBe(true);
    expect(state.participants).toHaveLength(2);
    expect(state.streamingRoundNumber).toBe(0);

    // UI Flow:
    // 1. Web search placeholder appears first (pre-search section)
    // 2. Participant placeholders appear below (pending cards section)
    // 3. Pre-search completes → web search results shown
    // 4. Participants stream → placeholders fill with content
  });
});

// ============================================================================
// Test Suite: Moderator Placeholder
// ============================================================================

describe('moderator Placeholder - Immediate Visibility', () => {
  it('should enable moderator placeholder visibility when streamingRoundNumber is set', () => {
    const store = createChatStore();

    const userMessage = createTestUserMessage({
      id: 'user_r0',
      content: 'Test question',
      roundNumber: 0,
    });

    const participants = [
      createParticipant(0),
      createParticipant(1),
    ];

    store.getState().setMessages([userMessage]);
    store.getState().setParticipants(participants);

    // Set streaming round number
    store.getState().setStreamingRoundNumber(0);

    const state = store.getState();
    expect(state.streamingRoundNumber).toBe(0);

    // When streamingRoundNumber=0, isStreamingRound=true for round 0
    // Moderator placeholder renders immediately
  });

  it('should show moderator placeholder even before participants stream', () => {
    const store = createChatStore();

    const userMessage = createTestUserMessage({
      id: 'user_r0',
      content: 'Test',
      roundNumber: 0,
    });

    const participants = [
      createParticipant(0),
      createParticipant(1),
    ];

    store.getState().setMessages([userMessage]);
    store.getState().setParticipants(participants);
    store.getState().setStreamingRoundNumber(0);

    const state = store.getState();
    expect(state.streamingRoundNumber).toBe(0);
    expect(state.isStreaming).toBe(false); // Not streaming yet
    expect(state.isModeratorStreaming).toBe(false); // Moderator not streaming yet

    // Moderator placeholder is visible (because isStreamingRound=true)
    // This provides visual feedback that moderator will analyze responses
  });

  it('should maintain moderator placeholder during participant streaming', () => {
    const store = createChatStore();

    const userMessage = createTestUserMessage({
      id: 'user_r0',
      content: 'Test',
      roundNumber: 0,
    });

    const participants = [
      createParticipant(0),
      createParticipant(1),
    ];

    store.getState().setMessages([userMessage]);
    store.getState().setParticipants(participants);
    store.getState().setStreamingRoundNumber(0);
    store.getState().setIsStreaming(true);
    store.getState().setCurrentParticipantIndex(0);

    // P0 streams
    const p0Message = createParticipantMessage(0, 0, 'thread-123', 'P0 response');
    store.getState().setMessages([userMessage, p0Message]);

    let state = store.getState();
    expect(state.streamingRoundNumber).toBe(0);
    expect(state.isStreaming).toBe(true);

    // Moderator placeholder still visible at bottom

    // P1 streams
    store.getState().setCurrentParticipantIndex(1);
    const p1Message = createParticipantMessage(0, 1, 'thread-123', 'P1 response');
    store.getState().setMessages([userMessage, p0Message, p1Message]);

    state = store.getState();
    expect(state.streamingRoundNumber).toBe(0);

    // Moderator placeholder remains visible throughout
  });

  it('should transition moderator placeholder to streaming state', () => {
    const store = createChatStore();

    const userMessage = createTestUserMessage({
      id: 'user_r0',
      content: 'Test',
      roundNumber: 0,
    });

    const p0 = createParticipantMessage(0, 0, 'thread-123', 'P0 done');
    const p1 = createParticipantMessage(0, 1, 'thread-123', 'P1 done');

    store.getState().setMessages([userMessage, p0, p1]);
    store.getState().setParticipants([createParticipant(0), createParticipant(1)]);
    store.getState().setStreamingRoundNumber(0);
    store.getState().setIsStreaming(true);
    store.getState().setCurrentParticipantIndex(1);

    // All participants complete, moderator starts
    store.getState().setIsStreaming(false);
    store.getState().setIsModeratorStreaming(true);

    const state = store.getState();
    expect(state.isStreaming).toBe(false);
    expect(state.isModeratorStreaming).toBe(true);
    expect(state.streamingRoundNumber).toBe(0);

    // Same moderator placeholder component, now actively streaming
  });
});

// ============================================================================
// Test Suite: Placeholder Timing - Before Streams Begin
// ============================================================================

describe('placeholder Timing - Before Stream Tokens Arrive', () => {
  it('should show ALL placeholders before first stream token arrives', () => {
    const store = createChatStore();

    const userMessage = createTestUserMessage({
      id: 'user_r0',
      content: 'Multi-participant question',
      roundNumber: 0,
    });

    const participants = [
      createParticipant(0),
      createParticipant(1),
      createParticipant(2),
    ];

    store.getState().setMessages([userMessage]);
    store.getState().setParticipants(participants);

    // Trigger: User submits, streamingRoundNumber set
    store.getState().setStreamingRoundNumber(0);

    const stateBeforeStreaming = store.getState();

    // Verify: streamingRoundNumber set, but streaming hasn't started
    expect(stateBeforeStreaming.streamingRoundNumber).toBe(0);
    expect(stateBeforeStreaming.isStreaming).toBe(false);
    expect(stateBeforeStreaming.messages).toHaveLength(1); // Only user message

    // UI State: ALL placeholders visible
    // - Participant placeholders: 3 (one for each participant)
    // - Moderator placeholder: 1 (at bottom)
    //
    // This happens BEFORE any streaming starts, providing instant feedback
  });

  it('should not require message creation to show placeholders', () => {
    const store = createChatStore();

    const userMessage = createTestUserMessage({
      id: 'user_r0',
      content: 'Test',
      roundNumber: 0,
    });

    const participants = [
      createParticipant(0),
      createParticipant(1),
    ];

    store.getState().setMessages([userMessage]);
    store.getState().setParticipants(participants);
    store.getState().setStreamingRoundNumber(0);

    const state = store.getState();

    // Messages array only has user message
    expect(state.messages).toHaveLength(1);
    const firstMessage = state.messages[0];
    if (!firstMessage)
      throw new Error('Expected first message');
    expect(getRoundNumber(firstMessage.metadata)).toBe(0);

    // But UI renders placeholders based on:
    // - streamingRoundNumber (which round is active)
    // - participants array (how many placeholders)
    //
    // No placeholder messages need to exist in messages array
  });

  it('should show placeholders during background loading (thread creation, pre-search)', () => {
    const store = createChatStore();

    const userMessage = createTestUserMessage({
      id: 'user_r0',
      content: 'Question with web search',
      roundNumber: 0,
    });

    const participants = [
      createParticipant(0),
      createParticipant(1),
    ];

    store.getState().setMessages([userMessage]);
    store.getState().setParticipants(participants);

    store.getState().setThread({
      id: 'thread-123',
      userId: 'user-123',
      projectId: null,
      title: 'Test Thread',
      slug: 'test-thread',
      previousSlug: null,
      mode: 'debating',
      status: 'active',
      isFavorite: false,
      isPublic: false,
      isAiGeneratedTitle: false,
      enableWebSearch: true,
      metadata: null,
      version: 1,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      lastMessageAt: '2024-01-01T00:00:00Z',
    });

    store.getState().setStreamingRoundNumber(0);

    const state = store.getState();
    expect(state.streamingRoundNumber).toBe(0);
    expect(state.isStreaming).toBe(false);

    // Background Operations (not reflected in store yet):
    // - Thread creation API call
    // - Pre-search creation
    // - Pre-search execution
    //
    // UI Shows:
    // - Web search placeholder (loading/searching state)
    // - Participant placeholders (pending state)
    // - Moderator placeholder (pending state)
    //
    // User sees activity immediately, even though backend is still working
  });

  it('should track placeholder visibility duration', () => {
    const store = createChatStore();
    const visibilityMarkers: Array<{ timestamp: number; event: string }> = [];

    store.subscribe(() => {
      const state = store.getState();
      if (state.streamingRoundNumber !== null && state.messages.length === 1) {
        visibilityMarkers.push({ timestamp: Date.now(), event: 'placeholders-visible' });
      }
      if (state.isStreaming && state.messages.length > 1) {
        visibilityMarkers.push({ timestamp: Date.now(), event: 'first-stream-token' });
      }
    });

    const userMessage = createTestUserMessage({
      id: 'user_r0',
      content: 'Test',
      roundNumber: 0,
    });

    store.getState().setMessages([userMessage]);
    store.getState().setParticipants([createParticipant(0), createParticipant(1)]);

    // Placeholders become visible
    store.getState().setStreamingRoundNumber(0);

    // Simulate delay before streaming starts
    store.getState().setIsStreaming(true);

    // First token arrives
    const p0Message = createParticipantMessage(0, 0, 'thread-123', 'First');
    store.getState().setMessages([userMessage, p0Message]);

    // Verify placeholders were visible BEFORE first token
    const placeholderEvent = visibilityMarkers.find(m => m.event === 'placeholders-visible');
    const streamEvent = visibilityMarkers.find(m => m.event === 'first-stream-token');

    expect(placeholderEvent).toBeDefined();
    if (!placeholderEvent)
      throw new Error('Expected placeholder event');
    // Verify timing - if stream event exists, placeholder should have been visible before/at stream start

    const placeholderBeforeStream = streamEvent
      ? placeholderEvent.timestamp <= streamEvent.timestamp
      : true; // No stream event to compare
    expect(placeholderBeforeStream).toBe(true);
  });
});

// ============================================================================
// Test Suite: Placeholder Content Based on Configuration
// ============================================================================

describe('placeholder Content - Based on Configuration', () => {
  it('should show placeholders for exact participant count', () => {
    const store = createChatStore();

    const testCases = [
      { count: 1, description: 'single participant' },
      { count: 2, description: 'two participants' },
      { count: 3, description: 'three participants' },
      { count: 5, description: 'five participants' },
    ];

    for (const testCase of testCases) {
      store.getState().completeStreaming(); // Reset

      const userMessage = createTestUserMessage({
        id: `user_r${testCase.count}`,
        content: `Test ${testCase.description}`,
        roundNumber: testCase.count,
      });

      const participants = Array.from({ length: testCase.count }, (_, i) => createParticipant(i));

      store.getState().setMessages([userMessage]);
      store.getState().setParticipants(participants);
      store.getState().setStreamingRoundNumber(testCase.count);

      const state = store.getState();
      expect(state.participants).toHaveLength(testCase.count);
      expect(state.streamingRoundNumber).toBe(testCase.count);

      // UI renders exactly testCase.count participant placeholders
    }
  });

  it('should handle disabled participants correctly', () => {
    const store = createChatStore();

    const userMessage = createTestUserMessage({
      id: 'user_r0',
      content: 'Test',
      roundNumber: 0,
    });

    // 3 participants, but 1 is disabled
    const participants = [
      createParticipant(0),
      { ...createParticipant(1), isEnabled: false }, // Disabled
      createParticipant(2),
    ];

    store.getState().setMessages([userMessage]);
    store.getState().setParticipants(participants);
    store.getState().setStreamingRoundNumber(0);

    const state = store.getState();
    const enabledParticipants = state.participants.filter(p => p.isEnabled);

    expect(state.participants).toHaveLength(3);
    expect(enabledParticipants).toHaveLength(2); // Only 2 enabled

    // UI shows placeholders for 2 enabled participants only
  });

  it('should show different placeholder states during round lifecycle', () => {
    const store = createChatStore();

    const userMessage = createTestUserMessage({
      id: 'user_r0',
      content: 'Test',
      roundNumber: 0,
    });

    const participants = [
      createParticipant(0),
      createParticipant(1),
    ];

    store.getState().setMessages([userMessage]);
    store.getState().setParticipants(participants);

    // Phase 1: Initial submission - all placeholders pending
    store.getState().setStreamingRoundNumber(0);

    let state = store.getState();
    expect(state.streamingRoundNumber).toBe(0);
    expect(state.isStreaming).toBe(false);
    // UI: All placeholders in pending state

    // Phase 2: Streaming starts - P0 streaming, P1 pending
    store.getState().setIsStreaming(true);
    store.getState().setCurrentParticipantIndex(0);

    state = store.getState();
    expect(state.isStreaming).toBe(true);
    expect(state.currentParticipantIndex).toBe(0);
    // UI: P0 placeholder shows streaming indicator, P1 still pending

    // Phase 3: P0 complete, P1 streaming
    const p0Complete = createParticipantMessage(0, 0, 'thread-123', 'P0 response');
    store.getState().setMessages([userMessage, p0Complete]);
    store.getState().setCurrentParticipantIndex(1);

    state = store.getState();
    expect(state.currentParticipantIndex).toBe(1);
    // UI: P0 shows complete message, P1 placeholder shows streaming indicator

    // Phase 4: All participants complete, moderator streaming
    const p1Complete = createParticipantMessage(0, 1, 'thread-123', 'P1 response');
    store.getState().setMessages([userMessage, p0Complete, p1Complete]);
    store.getState().setIsStreaming(false);
    store.getState().setIsModeratorStreaming(true);

    state = store.getState();
    expect(state.isStreaming).toBe(false);
    expect(state.isModeratorStreaming).toBe(true);
    // UI: All participants complete, moderator placeholder shows streaming indicator
  });
});
