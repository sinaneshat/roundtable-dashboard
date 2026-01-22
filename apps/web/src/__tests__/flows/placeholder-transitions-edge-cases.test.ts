/**
 * Placeholder Transitions & Edge Cases Tests
 *
 * Tests for placeholder behavior during complex scenarios:
 * 1. Placeholder transitions during multi-round conversations
 * 2. Placeholder behavior with configuration changes
 * 3. Edge cases: errors, stop button, rapid submissions
 * 4. Placeholder cleanup when round completes
 * 5. Pre-search placeholder integration with participant placeholders
 *
 * These tests ensure placeholders remain stable and provide clear
 * visual feedback even during complex user interactions.
 *
 * @see /Users/avabagherzadeh/Desktop/projects/deadpixel/billing-dashboard/docs/FLOW_DOCUMENTATION.md
 */

import { FinishReasons, MessageRoles, MessageStatuses, MODERATOR_PARTICIPANT_INDEX } from '@roundtable/shared';
import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';

import { createTestUserMessage } from '@/lib/testing';
import { createChatStore } from '@/stores/chat';

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
  finishReason: string = FinishReasons.STOP,
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
      finishReason,
      hasError: false,
      usage: { promptTokens: 0, completionTokens: content.length, totalTokens: content.length },
    },
  };
}

function createModeratorMessage(
  roundNumber: number,
  threadId: string,
  content: string = '',
  finishReason: string = FinishReasons.STOP,
): UIMessage {
  return {
    id: `${threadId}_r${roundNumber}_moderator`,
    role: MessageRoles.ASSISTANT,
    parts: content ? [{ type: 'text', text: content }] : [],
    metadata: {
      isModerator: true,
      roundNumber,
      participantIndex: MODERATOR_PARTICIPANT_INDEX,
      model: 'Council Moderator',
      role: MessageRoles.ASSISTANT,
      finishReason,
      hasError: false,
      usage: { promptTokens: 0, completionTokens: content.length, totalTokens: content.length },
    },
  };
}

function createThread(enableWebSearch: boolean = false) {
  return {
    id: 'thread-123',
    userId: 'user-123',
    projectId: null,
    title: 'Test Thread',
    slug: 'test-thread',
    previousSlug: null,
    mode: 'debating' as const,
    status: 'active' as const,
    isFavorite: false,
    isPublic: false,
    isAiGeneratedTitle: false,
    enableWebSearch,
    metadata: null,
    version: 1,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    lastMessageAt: '2024-01-01T00:00:00Z',
  };
}

function createPreSearch(roundNumber: number, status: string = MessageStatuses.PENDING) {
  return {
    id: `presearch-r${roundNumber}`,
    threadId: 'thread-123',
    roundNumber,
    userQuery: 'Test query',
    status,
    searchData: null,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };
}

// ============================================================================
// Test Suite: Multi-Round Placeholder Behavior
// ============================================================================

describe('multi-Round Placeholder Behavior', () => {
  it('should show placeholders for second round after first round completes', () => {
    const store = createChatStore();

    // Round 0: Complete
    const userR0 = createTestUserMessage({ id: 'user_r0', content: 'Question 1', roundNumber: 0 });
    const p0R0 = createParticipantMessage(0, 0, 'thread-123', 'Answer 1');
    const modR0 = createModeratorMessage(0, 'thread-123', 'Summary 1');

    store.getState().setMessages([userR0, p0R0, modR0]);
    store.getState().setParticipants([createParticipant(0)]);

    // Round 0 completes
    store.getState().completeStreaming();

    const stateAfterR0 = store.getState();
    expect(stateAfterR0.streamingRoundNumber).toBeNull();
    expect(stateAfterR0.isStreaming).toBe(false);

    // User submits Round 1
    const userR1 = createTestUserMessage({ id: 'user_r1', content: 'Question 2', roundNumber: 1 });
    store.getState().setMessages([userR0, p0R0, modR0, userR1]);

    // Trigger Round 1 placeholders
    store.getState().setStreamingRoundNumber(1);

    const stateAfterR1Submit = store.getState();
    expect(stateAfterR1Submit.streamingRoundNumber).toBe(1);
    expect(stateAfterR1Submit.messages).toHaveLength(4);

    // UI: Round 1 placeholders visible
    // Round 0 messages remain, Round 1 placeholders appear below
  });

  it('should maintain separate placeholder state for each round', () => {
    const store = createChatStore();

    // Round 0
    const userR0 = createTestUserMessage({ id: 'user_r0', content: 'R0', roundNumber: 0 });
    store.getState().setMessages([userR0]);
    store.getState().setParticipants([createParticipant(0), createParticipant(1)]);
    store.getState().setStreamingRoundNumber(0);

    const stateR0 = store.getState();
    expect(stateR0.streamingRoundNumber).toBe(0);

    // Complete Round 0
    const p0R0 = createParticipantMessage(0, 0, 'thread-123', 'A0');
    const p1R0 = createParticipantMessage(0, 1, 'thread-123', 'A1');
    const modR0 = createModeratorMessage(0, 'thread-123', 'S0');
    store.getState().setMessages([userR0, p0R0, p1R0, modR0]);
    store.getState().completeStreaming();

    // Round 1 with different participant count
    const userR1 = createTestUserMessage({ id: 'user_r1', content: 'R1', roundNumber: 1 });
    store.getState().setMessages([userR0, p0R0, p1R0, modR0, userR1]);
    store.getState().setParticipants([createParticipant(0), createParticipant(1), createParticipant(2)]);
    store.getState().setStreamingRoundNumber(1);

    const stateR1 = store.getState();
    expect(stateR1.streamingRoundNumber).toBe(1);
    expect(stateR1.participants).toHaveLength(3);

    // UI: Round 1 shows 3 participant placeholders (different from Round 0's 2)
  });

  it('should handle rapid round transitions', () => {
    const store = createChatStore();

    const participants = [createParticipant(0)];
    store.getState().setParticipants(participants);

    // Round 0
    const userR0 = createTestUserMessage({ id: 'user_r0', content: 'R0', roundNumber: 0 });
    store.getState().setMessages([userR0]);
    store.getState().setStreamingRoundNumber(0);

    expect(store.getState().streamingRoundNumber).toBe(0);

    // Quickly complete Round 0
    const p0R0 = createParticipantMessage(0, 0, 'thread-123', 'A0');
    const modR0 = createModeratorMessage(0, 'thread-123', 'S0');
    store.getState().setMessages([userR0, p0R0, modR0]);
    store.getState().completeStreaming();

    expect(store.getState().streamingRoundNumber).toBeNull();

    // Immediately start Round 1
    const userR1 = createTestUserMessage({ id: 'user_r1', content: 'R1', roundNumber: 1 });
    store.getState().setMessages([userR0, p0R0, modR0, userR1]);
    store.getState().setStreamingRoundNumber(1);

    const stateR1 = store.getState();
    expect(stateR1.streamingRoundNumber).toBe(1);

    // No placeholder state pollution between rounds
  });
});

// ============================================================================
// Test Suite: Configuration Change Impact on Placeholders
// ============================================================================

describe('configuration Changes Impact on Placeholders', () => {
  it('should update placeholders when participants added mid-conversation', () => {
    const store = createChatStore();

    // Start with 2 participants
    const initialParticipants = [createParticipant(0), createParticipant(1)];
    store.getState().setParticipants(initialParticipants);

    const userMessage = createTestUserMessage({ id: 'user_r0', content: 'Test', roundNumber: 0 });
    store.getState().setMessages([userMessage]);
    store.getState().setStreamingRoundNumber(0);

    expect(store.getState().participants).toHaveLength(2);

    // User adds third participant before round starts streaming
    const updatedParticipants = [...initialParticipants, createParticipant(2)];
    store.getState().setParticipants(updatedParticipants);

    const stateAfterAdd = store.getState();
    expect(stateAfterAdd.participants).toHaveLength(3);
    expect(stateAfterAdd.streamingRoundNumber).toBe(0);

    // UI now shows 3 participant placeholders instead of 2
  });

  it('should update placeholders when participants removed mid-conversation', () => {
    const store = createChatStore();

    const allParticipants = [createParticipant(0), createParticipant(1), createParticipant(2)];
    store.getState().setParticipants(allParticipants);

    const userMessage = createTestUserMessage({ id: 'user_r0', content: 'Test', roundNumber: 0 });
    store.getState().setMessages([userMessage]);
    store.getState().setStreamingRoundNumber(0);

    expect(store.getState().participants).toHaveLength(3);

    // User removes one participant
    const reducedParticipants = [createParticipant(0), createParticipant(1)];
    store.getState().setParticipants(reducedParticipants);

    const stateAfterRemove = store.getState();
    expect(stateAfterRemove.participants).toHaveLength(2);
    expect(stateAfterRemove.streamingRoundNumber).toBe(0);

    // UI now shows 2 participant placeholders instead of 3
  });

  it('should handle participant reordering', () => {
    const store = createChatStore();

    const participants = [
      createParticipant(0),
      createParticipant(1),
      createParticipant(2),
    ];
    store.getState().setParticipants(participants);

    const userMessage = createTestUserMessage({ id: 'user_r0', content: 'Test', roundNumber: 0 });
    store.getState().setMessages([userMessage]);
    store.getState().setStreamingRoundNumber(0);

    // Reorder participants (swap priority)
    const reorderedParticipants = [
      { ...createParticipant(2), priority: 0 },
      { ...createParticipant(1), priority: 1 },
      { ...createParticipant(0), priority: 2 },
    ];
    store.getState().setParticipants(reorderedParticipants);

    const state = store.getState();
    expect(state.participants).toHaveLength(3);
    const firstParticipant = state.participants[0];
    if (!firstParticipant)
      throw new Error('Expected first participant');
    expect(firstParticipant.priority).toBe(0);

    // UI shows placeholders in new order
  });
});

// ============================================================================
// Test Suite: Pre-Search Placeholder Integration
// ============================================================================

describe('pre-Search Placeholder Integration', () => {
  it('should show pre-search placeholder before participant placeholders', () => {
    const store = createChatStore();

    const userMessage = createTestUserMessage({ id: 'user_r0', content: 'Research question', roundNumber: 0 });
    const participants = [createParticipant(0), createParticipant(1)];

    store.getState().setMessages([userMessage]);
    store.getState().setParticipants(participants);
    store.getState().setThread(createThread(true)); // enableWebSearch = true

    // Add pending pre-search
    const preSearch = createPreSearch(0, MessageStatuses.PENDING);
    store.getState().setPreSearches([preSearch]);

    store.getState().setStreamingRoundNumber(0);

    const state = store.getState();
    expect(state.thread?.enableWebSearch).toBe(true);
    expect(state.preSearches).toHaveLength(1);
    const statePreSearch = state.preSearches[0];
    if (!statePreSearch)
      throw new Error('Expected pre-search');
    expect(statePreSearch.status).toBe(MessageStatuses.PENDING);

    // UI Flow:
    // 1. Pre-search placeholder (top of round)
    // 2. Participant placeholders (below pre-search)
    // 3. Moderator placeholder (bottom)
  });

  it('should transition pre-search placeholder through status states', () => {
    const store = createChatStore();

    const userMessage = createTestUserMessage({ id: 'user_r0', content: 'Test', roundNumber: 0 });
    store.getState().setMessages([userMessage]);
    store.getState().setThread(createThread(true));

    // Pending state
    const pendingPreSearch = createPreSearch(0, MessageStatuses.PENDING);
    store.getState().setPreSearches([pendingPreSearch]);
    store.getState().setStreamingRoundNumber(0);

    let state = store.getState();
    let currentPreSearch = state.preSearches[0];
    if (!currentPreSearch)
      throw new Error('Expected pre-search');
    expect(currentPreSearch.status).toBe(MessageStatuses.PENDING);

    // Streaming state
    const streamingPreSearch = createPreSearch(0, MessageStatuses.STREAMING);
    store.getState().setPreSearches([streamingPreSearch]);

    state = store.getState();
    currentPreSearch = state.preSearches[0];
    if (!currentPreSearch)
      throw new Error('Expected pre-search');
    expect(currentPreSearch.status).toBe(MessageStatuses.STREAMING);

    // Complete state
    const completePreSearch = createPreSearch(0, MessageStatuses.COMPLETE);
    store.getState().setPreSearches([completePreSearch]);

    state = store.getState();
    currentPreSearch = state.preSearches[0];
    if (!currentPreSearch)
      throw new Error('Expected pre-search');
    expect(currentPreSearch.status).toBe(MessageStatuses.COMPLETE);

    // Placeholder remains visible throughout, updating its visual state
  });

  it('should keep participant placeholders visible while pre-search executes', () => {
    const store = createChatStore();

    const userMessage = createTestUserMessage({ id: 'user_r0', content: 'Test', roundNumber: 0 });
    const participants = [createParticipant(0), createParticipant(1)];

    store.getState().setMessages([userMessage]);
    store.getState().setParticipants(participants);
    store.getState().setThread(createThread(true));

    const preSearch = createPreSearch(0, MessageStatuses.STREAMING);
    store.getState().setPreSearches([preSearch]);

    store.getState().setStreamingRoundNumber(0);

    const state = store.getState();
    expect(state.streamingRoundNumber).toBe(0);
    const preSearchItem = state.preSearches[0];
    if (!preSearchItem)
      throw new Error('Expected pre-search');
    expect(preSearchItem.status).toBe(MessageStatuses.STREAMING);
    expect(state.participants).toHaveLength(2);

    // Both pre-search AND participant placeholders visible
    // Pre-search is executing, participants are waiting
  });

  it('should handle pre-search failure gracefully', () => {
    const store = createChatStore();

    const userMessage = createTestUserMessage({ id: 'user_r0', content: 'Test', roundNumber: 0 });
    const participants = [createParticipant(0)];

    store.getState().setMessages([userMessage]);
    store.getState().setParticipants(participants);
    store.getState().setThread(createThread(true));

    const failedPreSearch = createPreSearch(0, MessageStatuses.FAILED);
    store.getState().setPreSearches([failedPreSearch]);

    store.getState().setStreamingRoundNumber(0);

    const state = store.getState();
    const failedSearch = state.preSearches[0];
    if (!failedSearch)
      throw new Error('Expected pre-search');
    expect(failedSearch.status).toBe(MessageStatuses.FAILED);
    expect(state.streamingRoundNumber).toBe(0);

    // Pre-search shows error state
    // Participant placeholders still visible (streaming can proceed without search)
  });
});

// ============================================================================
// Test Suite: Error Handling & Edge Cases
// ============================================================================

describe('error Handling & Edge Cases', () => {
  it('should show placeholder with error state for failed participant', () => {
    const store = createChatStore();

    const userMessage = createTestUserMessage({ id: 'user_r0', content: 'Test', roundNumber: 0 });
    const participants = [createParticipant(0), createParticipant(1)];

    store.getState().setMessages([userMessage]);
    store.getState().setParticipants(participants);
    store.getState().setStreamingRoundNumber(0);
    store.getState().setIsStreaming(true);

    // P0 fails
    const p0Error = createParticipantMessage(0, 0, 'thread-123', '', FinishReasons.ERROR);
    store.getState().setMessages([userMessage, p0Error]);

    // Continue to P1
    store.getState().setCurrentParticipantIndex(1);

    const state = store.getState();
    expect(state.messages).toHaveLength(2);
    expect(state.currentParticipantIndex).toBe(1);

    // P0 shows error, P1 placeholder still visible and streaming
  });

  it('should handle stop button during placeholder phase', () => {
    const store = createChatStore();

    const userMessage = createTestUserMessage({ id: 'user_r0', content: 'Test', roundNumber: 0 });
    const participants = [createParticipant(0), createParticipant(1)];

    store.getState().setMessages([userMessage]);
    store.getState().setParticipants(participants);
    store.getState().setStreamingRoundNumber(0);
    store.getState().setIsStreaming(true);
    store.getState().setCurrentParticipantIndex(0);

    // User clicks stop before any participant streams
    // Stop is simulated by calling completeStreaming which clears state
    store.getState().completeStreaming();

    const state = store.getState();
    expect(state.isStreaming).toBe(false);
    expect(state.streamingRoundNumber).toBeNull();

    // Placeholders should disappear/become inactive
  });

  it('should cleanup placeholders when round completes', () => {
    const store = createChatStore();

    const userMessage = createTestUserMessage({ id: 'user_r0', content: 'Test', roundNumber: 0 });
    const participants = [createParticipant(0)];

    store.getState().setMessages([userMessage]);
    store.getState().setParticipants(participants);
    store.getState().setStreamingRoundNumber(0);
    store.getState().setIsStreaming(true);

    // Complete round
    const p0 = createParticipantMessage(0, 0, 'thread-123', 'Response');
    const mod = createModeratorMessage(0, 'thread-123', 'Summary');

    store.getState().setMessages([userMessage, p0, mod]);
    store.getState().setIsStreaming(false);
    store.getState().setIsModeratorStreaming(false);
    store.getState().completeStreaming();

    const state = store.getState();
    expect(state.streamingRoundNumber).toBeNull();
    expect(state.isStreaming).toBe(false);
    expect(state.isModeratorStreaming).toBe(false);

    // Placeholders no longer visible (round complete)
  });

  it('should handle no participants configured', () => {
    const store = createChatStore();

    const userMessage = createTestUserMessage({ id: 'user_r0', content: 'Test', roundNumber: 0 });

    store.getState().setMessages([userMessage]);
    store.getState().setParticipants([]); // No participants!

    store.getState().setStreamingRoundNumber(0);

    const state = store.getState();
    expect(state.participants).toHaveLength(0);
    expect(state.streamingRoundNumber).toBe(0);

    // UI should handle gracefully - no participant placeholders shown
    // Error message or empty state displayed instead
  });

  it('should handle duplicate streamingRoundNumber set', () => {
    const store = createChatStore();

    const userMessage = createTestUserMessage({ id: 'user_r0', content: 'Test', roundNumber: 0 });
    const participants = [createParticipant(0)];

    store.getState().setMessages([userMessage]);
    store.getState().setParticipants(participants);

    // Set streamingRoundNumber twice (bug or rapid resubmit)
    store.getState().setStreamingRoundNumber(0);
    store.getState().setStreamingRoundNumber(0);

    const state = store.getState();
    expect(state.streamingRoundNumber).toBe(0);

    // No duplicate placeholder rendering
  });
});

// ============================================================================
// Test Suite: Placeholder Visibility Rules
// ============================================================================

describe('placeholder Visibility Rules', () => {
  it('should hide placeholders when streamingRoundNumber is null', () => {
    const store = createChatStore();

    const userMessage = createTestUserMessage({ id: 'user_r0', content: 'Test', roundNumber: 0 });
    const participants = [createParticipant(0)];

    store.getState().setMessages([userMessage]);
    store.getState().setParticipants(participants);

    // No streaming round set
    const state = store.getState();
    expect(state.streamingRoundNumber).toBeNull();

    // UI: No placeholders visible
  });

  it('should only show placeholders for the streaming round', () => {
    const store = createChatStore();

    // Round 0 complete
    const userR0 = createTestUserMessage({ id: 'user_r0', content: 'R0', roundNumber: 0 });
    const p0R0 = createParticipantMessage(0, 0, 'thread-123', 'A0');
    const modR0 = createModeratorMessage(0, 'thread-123', 'S0');

    // Round 1 streaming
    const userR1 = createTestUserMessage({ id: 'user_r1', content: 'R1', roundNumber: 1 });

    store.getState().setMessages([userR0, p0R0, modR0, userR1]);
    store.getState().setParticipants([createParticipant(0)]);
    store.getState().setStreamingRoundNumber(1);

    const state = store.getState();
    expect(state.streamingRoundNumber).toBe(1);

    // UI: Placeholders ONLY for Round 1
    // Round 0 shows completed messages (no placeholders)
  });

  it('should show placeholders even if messages array is empty', () => {
    const store = createChatStore();

    // Edge case: streamingRoundNumber set but no messages yet
    const participants = [createParticipant(0), createParticipant(1)];

    store.getState().setParticipants(participants);
    store.getState().setStreamingRoundNumber(0);

    const state = store.getState();
    expect(state.messages).toHaveLength(0);
    expect(state.streamingRoundNumber).toBe(0);
    expect(state.participants).toHaveLength(2);

    // UI: Placeholders visible based on participants and streamingRoundNumber
    // (Unusual but valid state during optimistic updates)
  });
});

// ============================================================================
// Test Suite: Moderator Placeholder Specific Behavior
// ============================================================================

describe('moderator Placeholder Specific Behavior', () => {
  it('should keep moderator placeholder visible throughout participant streaming', () => {
    const store = createChatStore();

    const userMessage = createTestUserMessage({ id: 'user_r0', content: 'Test', roundNumber: 0 });
    const participants = [createParticipant(0), createParticipant(1), createParticipant(2)];

    store.getState().setMessages([userMessage]);
    store.getState().setParticipants(participants);
    store.getState().setStreamingRoundNumber(0);
    store.getState().setIsStreaming(true);

    // Track moderator placeholder visibility
    const visibilityChecks: boolean[] = [];

    // Check at each participant completion
    for (let i = 0; i < participants.length; i++) {
      store.getState().setCurrentParticipantIndex(i);

      const state = store.getState();
      const moderatorShouldBeVisible = state.streamingRoundNumber === 0;
      visibilityChecks.push(moderatorShouldBeVisible);

      // Add participant message
      const pMessage = createParticipantMessage(0, i, 'thread-123', `P${i} response`);
      const currentMessages = [...store.getState().messages, pMessage];
      store.getState().setMessages(currentMessages);
    }

    // Moderator placeholder should be visible at all times
    expect(visibilityChecks.every(v => v === true)).toBe(true);
  });

  it('should transition moderator placeholder to streaming when participants complete', () => {
    const store = createChatStore();

    const userMessage = createTestUserMessage({ id: 'user_r0', content: 'Test', roundNumber: 0 });
    const p0 = createParticipantMessage(0, 0, 'thread-123', 'Response');

    store.getState().setMessages([userMessage, p0]);
    store.getState().setParticipants([createParticipant(0)]);
    store.getState().setStreamingRoundNumber(0);
    store.getState().setIsStreaming(true);

    // Participant completes
    store.getState().setIsStreaming(false);

    const stateBeforeModerator = store.getState();
    expect(stateBeforeModerator.isStreaming).toBe(false);
    expect(stateBeforeModerator.isModeratorStreaming).toBe(false);

    // Moderator starts
    store.getState().setIsModeratorStreaming(true);

    const stateAfterModerator = store.getState();
    expect(stateAfterModerator.isModeratorStreaming).toBe(true);
    expect(stateAfterModerator.streamingRoundNumber).toBe(0);

    // Same placeholder, now shows streaming indicator
  });

  it('should hide moderator placeholder when round completes', () => {
    const store = createChatStore();

    const userMessage = createTestUserMessage({ id: 'user_r0', content: 'Test', roundNumber: 0 });
    const p0 = createParticipantMessage(0, 0, 'thread-123', 'Response');
    const mod = createModeratorMessage(0, 'thread-123', 'Summary');

    store.getState().setMessages([userMessage, p0, mod]);
    store.getState().setParticipants([createParticipant(0)]);
    store.getState().setStreamingRoundNumber(0);
    store.getState().setIsModeratorStreaming(true);

    // Moderator completes
    store.getState().setIsModeratorStreaming(false);
    store.getState().completeStreaming();

    const state = store.getState();
    expect(state.streamingRoundNumber).toBeNull();
    expect(state.isModeratorStreaming).toBe(false);

    // Moderator placeholder hidden, actual message visible
  });
});
