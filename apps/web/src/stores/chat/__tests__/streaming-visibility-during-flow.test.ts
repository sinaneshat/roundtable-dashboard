/**
 * Streaming Visibility During Flow Tests
 *
 * CRITICAL: These tests verify that messages and placeholders are VISIBLE DURING streaming,
 * not just after streaming completes. This is the core bug that was fixed.
 *
 * Bug Scenario (BEFORE FIX):
 * 1. User submits message in non-initial round
 * 2. User message NOT visible until streaming completes
 * 3. Placeholders NOT visible during streaming
 * 4. Content only appears AFTER all streams finish
 *
 * Expected Behavior (AFTER FIX):
 * 1. User submits message
 * 2. User message IMMEDIATELY visible (optimistic update)
 * 3. Placeholders IMMEDIATELY visible for all participants
 * 4. Content streams in GRADUALLY and updates UI progressively
 * 5. Messages remain visible throughout entire streaming process
 *
 * Test Coverage:
 * - Initial round (round 0) streaming visibility
 * - Non-initial rounds (round 1+) streaming visibility
 * - Pre-search placeholder visibility during streaming
 * - Participant placeholder visibility during streaming
 * - Moderator placeholder visibility during streaming
 * - Progressive content updates during streaming
 * - State consistency during streaming
 */

import { ChatModes, MessagePartTypes, MessageRoles, MessageStatuses } from '@roundtable/shared';
import { beforeEach, describe, expect, it } from 'vitest';

import { getRoundNumber } from '@/lib/utils';
import type { ApiMessage, ChatParticipant, ChatThread, DbAssistantMessageMetadata, DbUserMessageMetadata, StoredPreSearch } from '@/services/api';

import { createChatStore } from '../store';

// ============================================================================
// TEST HELPER FUNCTIONS
// ============================================================================

function createMockThread(overrides?: Partial<ChatThread>): ChatThread {
  return {
    id: 'thread-123',
    userId: 'user-123',
    slug: 'test-thread',
    previousSlug: null,
    projectId: null,
    title: 'Test Thread',
    mode: ChatModes.BRAINSTORM,
    status: 'active',
    isFavorite: false,
    isPublic: false,
    enableWebSearch: false,
    isAiGeneratedTitle: false,
    metadata: null,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastMessageAt: new Date(),
    ...overrides,
  };
}

function createMockParticipants(count = 2): ChatParticipant[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `participant-${i}`,
    threadId: 'thread-123',
    modelId: `model-${i}`,
    role: `Role ${i}`,
    customRoleId: null,
    priority: i,
    isEnabled: true,
    settings: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));
}

function createUserMessage(roundNumber: number, text: string): ApiMessage {
  const metadata: DbUserMessageMetadata = {
    role: MessageRoles.USER,
    roundNumber,
  };
  return {
    id: `user-msg-r${roundNumber}`,
    role: MessageRoles.USER,
    parts: [{ type: MessagePartTypes.TEXT, text }],
    metadata,
  };
}

function createOptimisticUserMessage(roundNumber: number, text: string): ApiMessage {
  const metadata: DbUserMessageMetadata = {
    role: MessageRoles.USER,
    roundNumber,
    isOptimistic: true,
  };
  return {
    id: `optimistic-user-r${roundNumber}-${Date.now()}`,
    role: MessageRoles.USER,
    parts: [{ type: MessagePartTypes.TEXT, text }],
    metadata,
  };
}

function createAssistantMessage(
  roundNumber: number,
  participantIndex: number,
  text: string,
  isComplete = true,
): ApiMessage {
  const metadata: DbAssistantMessageMetadata = {
    role: MessageRoles.ASSISTANT,
    roundNumber,
    participantId: `participant-${participantIndex}`,
    participantIndex,
    participantRole: `Role ${participantIndex}`,
    model: `model-${participantIndex}`,
    finishReason: isComplete ? 'stop' : null,
    usage: isComplete ? { promptTokens: 100, completionTokens: 50, totalTokens: 150 } : null,
    hasError: false,
    isTransient: false,
    isPartialResponse: !isComplete,
  };
  return {
    id: `assistant-msg-r${roundNumber}-p${participantIndex}`,
    role: MessageRoles.ASSISTANT,
    parts: [{ type: MessagePartTypes.TEXT, text }],
    metadata,
  };
}

function createPreSearch(roundNumber: number, status: string = MessageStatuses.PENDING): StoredPreSearch {
  return {
    id: `presearch-r${roundNumber}`,
    threadId: 'thread-123',
    roundNumber,
    userQuery: `Query for round ${roundNumber}`,
    status,
    searchData: status === MessageStatuses.COMPLETE
      ? {
          queries: [{ query: 'test', rationale: 'test', searchDepth: 'basic', index: 0, total: 1 }],
          results: [],
          summary: 'test summary',
          successCount: 1,
          failureCount: 0,
          totalResults: 0,
          totalTime: 100,
        }
      : null,
    errorMessage: null,
    createdAt: new Date(),
    completedAt: status === MessageStatuses.COMPLETE ? new Date() : null,
  } as StoredPreSearch;
}

/**
 * Helper to verify state enables visibility of messages and placeholders
 */
function verifyStreamingVisibilityState(
  store: ReturnType<typeof createChatStore>,
  roundNumber: number,
  options: {
    expectUserMessage: boolean;
    expectPlaceholders: boolean;
    expectPreSearch?: boolean;
    participantCount?: number;
  },
): void {
  const state = store.getState();

  // 1. Verify streamingRoundNumber is set (enables placeholder rendering)
  if (options.expectPlaceholders) {
    expect(state.streamingRoundNumber).toBe(roundNumber);
  }

  // 2. Verify user message exists in store
  if (options.expectUserMessage) {
    const userMessages = state.messages.filter(
      m => m.role === MessageRoles.USER && getRoundNumber(m.metadata) === roundNumber,
    );
    expect(userMessages.length).toBeGreaterThan(0);
  }

  // 3. Verify participants are available for placeholder rendering
  if (options.expectPlaceholders && options.participantCount) {
    expect(state.participants).toHaveLength(options.participantCount);
  }

  // 4. Verify pre-search if expected
  if (options.expectPreSearch) {
    const preSearch = state.preSearches.find(ps => ps.roundNumber === roundNumber);
    expect(preSearch).toBeDefined();
  }
}

// ============================================================================
// TESTS - INITIAL ROUND (ROUND 0) STREAMING VISIBILITY
// ============================================================================

describe('streaming visibility during flow', () => {
  let store: ReturnType<typeof createChatStore>;
  let thread: ChatThread;
  let participants: ChatParticipant[];

  beforeEach(() => {
    store = createChatStore();
    thread = createMockThread();
    participants = createMockParticipants(2);
  });

  describe('initial round (round 0) streaming visibility', () => {
    it('should show user message DURING streaming, not just after', () => {
      // Initialize thread
      store.getState().initializeThread(thread, participants, []);

      // Add user message for round 0
      const userMsg = createUserMessage(0, 'What is AI?');
      store.getState().setMessages([userMsg]);

      // Set streaming state for round 0
      store.getState().setStreamingRoundNumber(0);
      store.getState().setIsStreaming(true);

      // CRITICAL ASSERTION: User message is visible DURING streaming
      const state = store.getState();
      expect(state.isStreaming).toBe(true);
      expect(state.streamingRoundNumber).toBe(0);

      const userMessages = state.messages.filter(
        m => m.role === MessageRoles.USER && getRoundNumber(m.metadata) === 0,
      );
      expect(userMessages).toHaveLength(1);
      const firstUserMsg = userMessages[0];
      if (!firstUserMsg)
        throw new Error('Expected user message');
      expect(firstUserMsg.parts[0]).toHaveProperty('text', 'What is AI?');
    });

    it('should show placeholders for participants DURING streaming', () => {
      store.getState().initializeThread(thread, participants, []);
      store.getState().setMessages([createUserMessage(0, 'Question')]);
      store.getState().setStreamingRoundNumber(0);
      store.getState().setIsStreaming(true);

      // CRITICAL: streamingRoundNumber + participants array enables placeholder rendering
      verifyStreamingVisibilityState(store, 0, {
        expectUserMessage: true,
        expectPlaceholders: true,
        participantCount: 2,
      });

      // Verify each participant can have a placeholder
      const state = store.getState();
      expect(state.participants).toHaveLength(2);
      const participant0 = state.participants[0];
      const participant1 = state.participants[1];
      if (!participant0 || !participant1)
        throw new Error('Expected participants');
      expect(participant0.modelId).toBeDefined();
      expect(participant1.modelId).toBeDefined();
    });

    it('should show gradual content updates DURING streaming', () => {
      store.getState().initializeThread(thread, participants, []);
      store.getState().setMessages([createUserMessage(0, 'Question')]);
      store.getState().setStreamingRoundNumber(0);
      store.getState().setIsStreaming(true);
      store.getState().setCurrentParticipantIndex(0);

      // Start streaming first participant with partial content
      const partialMsg = createAssistantMessage(0, 0, 'Hello', false);
      store.getState().setMessages(msgs => [...msgs, partialMsg]);

      // CRITICAL: Partial message is visible DURING streaming
      let state = store.getState();
      expect(state.isStreaming).toBe(true);
      const assistantMessages = state.messages.filter(
        m => m.role === MessageRoles.ASSISTANT && getRoundNumber(m.metadata) === 0,
      );
      expect(assistantMessages).toHaveLength(1);
      const firstAssistantMsg = assistantMessages[0];
      if (!firstAssistantMsg)
        throw new Error('Expected assistant message');
      expect(firstAssistantMsg.parts[0]).toHaveProperty('text', 'Hello');

      // Update with more content (simulating streaming chunks)
      const updatedMsg = createAssistantMessage(0, 0, 'Hello world', false);
      store.getState().setMessages(msgs =>
        msgs.map(m => m.id === partialMsg.id ? updatedMsg : m),
      );

      // CRITICAL: Updated content is visible DURING streaming
      state = store.getState();
      expect(state.isStreaming).toBe(true);
      const updatedMessages = state.messages.filter(
        m => m.role === MessageRoles.ASSISTANT && getRoundNumber(m.metadata) === 0,
      );
      const firstUpdatedMsg = updatedMessages[0];
      if (!firstUpdatedMsg)
        throw new Error('Expected updated message');
      expect(firstUpdatedMsg.parts[0]).toHaveProperty('text', 'Hello world');
    });

    it('should show pre-search placeholder DURING streaming when web search enabled', () => {
      const threadWithSearch = createMockThread({ enableWebSearch: true });
      store.getState().initializeThread(threadWithSearch, participants, []);

      // Add pre-search placeholder
      store.getState().addPreSearch(createPreSearch(0, MessageStatuses.PENDING));
      store.getState().setMessages([createUserMessage(0, 'Search query')]);
      store.getState().setStreamingRoundNumber(0);

      // CRITICAL: Pre-search placeholder is visible DURING streaming
      verifyStreamingVisibilityState(store, 0, {
        expectUserMessage: true,
        expectPlaceholders: true,
        expectPreSearch: true,
        participantCount: 2,
      });

      const state = store.getState();
      const preSearch = state.preSearches.find(ps => ps.roundNumber === 0);
      expect(preSearch).toBeDefined();
      expect(preSearch?.status).toBe(MessageStatuses.PENDING);
    });
  });

  // ============================================================================
  // TESTS - NON-INITIAL ROUNDS (ROUND 1+) STREAMING VISIBILITY
  // ============================================================================

  describe('non-initial rounds (round 1+) streaming visibility', () => {
    beforeEach(() => {
      // Set up completed round 0
      store.getState().initializeThread(thread, participants, [
        createUserMessage(0, 'First question'),
        createAssistantMessage(0, 0, 'Response 0-0'),
        createAssistantMessage(0, 1, 'Response 0-1'),
      ]);
    });

    it('should show optimistic user message IMMEDIATELY in round 1', () => {
      // Simulate user submitting message in round 1
      const optimisticMsg = createOptimisticUserMessage(1, 'Second question');
      store.getState().setMessages(msgs => [...msgs, optimisticMsg]);
      store.getState().setStreamingRoundNumber(1);

      // CRITICAL: Optimistic message is visible IMMEDIATELY (before streaming starts)
      const state = store.getState();
      expect(state.streamingRoundNumber).toBe(1);

      const round1UserMessages = state.messages.filter(
        m => m.role === MessageRoles.USER && getRoundNumber(m.metadata) === 1,
      );
      expect(round1UserMessages).toHaveLength(1);
      const round1UserMsg = round1UserMessages[0];
      if (!round1UserMsg)
        throw new Error('Expected round 1 user message');
      expect(round1UserMsg.parts[0]).toHaveProperty('text', 'Second question');
      expect(round1UserMsg.metadata.isOptimistic).toBe(true);
    });

    it('should show placeholders for all participants IMMEDIATELY in round 1', () => {
      const optimisticMsg = createOptimisticUserMessage(1, 'Second question');
      store.getState().setMessages(msgs => [...msgs, optimisticMsg]);
      store.getState().setStreamingRoundNumber(1);
      store.getState().setWaitingToStartStreaming(true);

      // CRITICAL: Placeholders can render BEFORE streaming actually starts
      verifyStreamingVisibilityState(store, 1, {
        expectUserMessage: true,
        expectPlaceholders: true,
        participantCount: 2,
      });

      const state = store.getState();
      expect(state.waitingToStartStreaming).toBe(true);
      expect(state.isStreaming).toBe(false); // Not yet streaming, but placeholders visible
    });

    it('should maintain visibility when streaming starts in round 1', () => {
      // Add optimistic message
      const optimisticMsg = createOptimisticUserMessage(1, 'Second question');
      store.getState().setMessages(msgs => [...msgs, optimisticMsg]);
      store.getState().setStreamingRoundNumber(1);
      store.getState().setWaitingToStartStreaming(true);

      // Verify visibility before streaming
      let state = store.getState();
      const beforeStreamingUserMsgs = state.messages.filter(
        m => m.role === MessageRoles.USER && getRoundNumber(m.metadata) === 1,
      );
      expect(beforeStreamingUserMsgs).toHaveLength(1);

      // Start streaming
      store.getState().setIsStreaming(true);
      store.getState().setWaitingToStartStreaming(false);

      // CRITICAL: User message still visible AFTER streaming starts
      state = store.getState();
      expect(state.isStreaming).toBe(true);

      const afterStreamingUserMsgs = state.messages.filter(
        m => m.role === MessageRoles.USER && getRoundNumber(m.metadata) === 1,
      );
      expect(afterStreamingUserMsgs).toHaveLength(1);
      const afterStreamingUserMsg = afterStreamingUserMsgs[0];
      if (!afterStreamingUserMsg)
        throw new Error('Expected after streaming user message');
      expect(afterStreamingUserMsg.id).toBe(optimisticMsg.id);
    });

    it('should show gradual updates for first participant in round 1', () => {
      // Set up round 1 user message
      const userMsg = createUserMessage(1, 'Second question');
      store.getState().setMessages(msgs => [...msgs, userMsg]);
      store.getState().setStreamingRoundNumber(1);
      store.getState().setIsStreaming(true);
      store.getState().setCurrentParticipantIndex(0);

      // Add partial response from first participant
      const partialMsg = createAssistantMessage(1, 0, 'Starting to answer', false);
      store.getState().setMessages(msgs => [...msgs, partialMsg]);

      // CRITICAL: Partial message visible DURING streaming in round 1
      let state = store.getState();
      expect(state.isStreaming).toBe(true);
      expect(state.currentParticipantIndex).toBe(0);

      const round1AssistantMsgs = state.messages.filter(
        m => m.role === MessageRoles.ASSISTANT && getRoundNumber(m.metadata) === 1,
      );
      expect(round1AssistantMsgs).toHaveLength(1);
      const round1AssistantMsg = round1AssistantMsgs[0];
      if (!round1AssistantMsg)
        throw new Error('Expected round 1 assistant message');
      expect(round1AssistantMsg.parts[0]).toHaveProperty('text', 'Starting to answer');

      // Update with more content
      const updatedMsg = createAssistantMessage(1, 0, 'Starting to answer... here is more', false);
      store.getState().setMessages(msgs =>
        msgs.map(m => m.id === partialMsg.id ? updatedMsg : m),
      );

      // CRITICAL: Updated content visible progressively
      state = store.getState();
      const updatedAssistantMsgs = state.messages.filter(
        m => m.role === MessageRoles.ASSISTANT && getRoundNumber(m.metadata) === 1,
      );
      const updatedAssistantMsg = updatedAssistantMsgs[0];
      if (!updatedAssistantMsg)
        throw new Error('Expected updated assistant message');
      expect(updatedAssistantMsg.parts[0]).toHaveProperty('text', 'Starting to answer... here is more');
    });

    it('should show all participants streaming sequentially in round 1', () => {
      const userMsg = createUserMessage(1, 'Second question');
      store.getState().setMessages(msgs => [...msgs, userMsg]);
      store.getState().setStreamingRoundNumber(1);
      store.getState().setIsStreaming(true);

      // First participant streams
      store.getState().setCurrentParticipantIndex(0);
      const msg0 = createAssistantMessage(1, 0, 'Response from participant 0');
      store.getState().setMessages(msgs => [...msgs, msg0]);

      let state = store.getState();
      expect(state.currentParticipantIndex).toBe(0);
      expect(state.messages.filter(m => getRoundNumber(m.metadata) === 1 && m.role === MessageRoles.ASSISTANT)).toHaveLength(1);

      // Second participant streams
      store.getState().setCurrentParticipantIndex(1);
      const msg1 = createAssistantMessage(1, 1, 'Response from participant 1');
      store.getState().setMessages(msgs => [...msgs, msg1]);

      state = store.getState();
      expect(state.currentParticipantIndex).toBe(1);
      expect(state.messages.filter(m => getRoundNumber(m.metadata) === 1 && m.role === MessageRoles.ASSISTANT)).toHaveLength(2);

      // CRITICAL: Both messages visible DURING streaming
      const round1Messages = state.messages.filter(m => getRoundNumber(m.metadata) === 1);
      expect(round1Messages).toHaveLength(3); // 1 user + 2 assistant
    });

    it('should preserve visibility across PATCH response update in round 1', () => {
      // Add optimistic message
      const optimisticId = `optimistic-user-1-${Date.now()}`;
      const optimisticMsg = createOptimisticUserMessage(1, 'Question');
      optimisticMsg.id = optimisticId;

      store.getState().setMessages(msgs => [...msgs, optimisticMsg]);
      store.getState().setStreamingRoundNumber(1);
      store.getState().setConfigChangeRoundNumber(1); // Indicates PATCH in progress
      store.getState().setWaitingToStartStreaming(true);

      // Verify optimistic message is visible
      let state = store.getState();
      const beforePatchMsgs = state.messages.filter(
        m => m.role === MessageRoles.USER && getRoundNumber(m.metadata) === 1,
      );
      expect(beforePatchMsgs).toHaveLength(1);
      const beforePatchMsg = beforePatchMsgs[0];
      if (!beforePatchMsg)
        throw new Error('Expected before patch message');
      expect(beforePatchMsg.id).toBe(optimisticId);

      // Simulate PATCH response: Replace optimistic with persisted message
      const persistedMsg = createUserMessage(1, 'Question');
      persistedMsg.id = 'thread_r1_user';

      store.getState().setMessages(msgs =>
        msgs.map(m => m.id === optimisticId ? persistedMsg : m),
      );

      // CRITICAL: User message still visible after PATCH (just different ID)
      state = store.getState();
      const afterPatchMsgs = state.messages.filter(
        m => m.role === MessageRoles.USER && getRoundNumber(m.metadata) === 1,
      );
      expect(afterPatchMsgs).toHaveLength(1);
      const afterPatchMsg = afterPatchMsgs[0];
      if (!afterPatchMsg)
        throw new Error('Expected after patch message');
      expect(afterPatchMsg.id).toBe('thread_r1_user');
      expect(afterPatchMsg.parts[0]).toHaveProperty('text', 'Question');
    });
  });

  // ============================================================================
  // TESTS - MULTI-ROUND STREAMING VISIBILITY
  // ============================================================================

  describe('multi-round streaming visibility', () => {
    it('should maintain visibility across rounds 0, 1, and 2', () => {
      // Round 0
      store.getState().initializeThread(thread, participants, []);
      store.getState().setMessages([
        createUserMessage(0, 'Q0'),
        createAssistantMessage(0, 0, 'A0-0'),
        createAssistantMessage(0, 1, 'A0-1'),
      ]);

      // Verify round 0 messages visible
      let state = store.getState();
      expect(state.messages.filter(m => getRoundNumber(m.metadata) === 0)).toHaveLength(3);

      // Round 1
      const r1UserMsg = createUserMessage(1, 'Q1');
      store.getState().setMessages(msgs => [...msgs, r1UserMsg]);
      store.getState().setStreamingRoundNumber(1);
      store.getState().setIsStreaming(true);

      // Add round 1 assistant messages
      store.getState().setMessages(msgs => [
        ...msgs,
        createAssistantMessage(1, 0, 'A1-0'),
        createAssistantMessage(1, 1, 'A1-1'),
      ]);

      // CRITICAL: All round 0 and round 1 messages visible
      state = store.getState();
      expect(state.messages.filter(m => getRoundNumber(m.metadata) === 0)).toHaveLength(3);
      expect(state.messages.filter(m => getRoundNumber(m.metadata) === 1)).toHaveLength(3);

      // Complete round 1
      store.getState().setIsStreaming(false);
      store.getState().setStreamingRoundNumber(null);

      // Round 2
      const r2UserMsg = createUserMessage(2, 'Q2');
      store.getState().setMessages(msgs => [...msgs, r2UserMsg]);
      store.getState().setStreamingRoundNumber(2);
      store.getState().setIsStreaming(true);

      // CRITICAL: All previous messages still visible while round 2 streams
      state = store.getState();
      expect(state.messages.filter(m => getRoundNumber(m.metadata) === 0)).toHaveLength(3);
      expect(state.messages.filter(m => getRoundNumber(m.metadata) === 1)).toHaveLength(3);
      expect(state.messages.filter(m => getRoundNumber(m.metadata) === 2)).toHaveLength(1);
      expect(state.isStreaming).toBe(true);
      expect(state.streamingRoundNumber).toBe(2);
    });
  });

  // ============================================================================
  // TESTS - STATE CONSISTENCY DURING STREAMING
  // ============================================================================

  describe('state consistency during streaming', () => {
    it('should maintain streamingRoundNumber throughout entire streaming process', () => {
      store.getState().initializeThread(thread, participants, [
        createUserMessage(0, 'Q0'),
        createAssistantMessage(0, 0, 'A0-0'),
        createAssistantMessage(0, 1, 'A0-1'),
      ]);

      // Start round 1
      const userMsg = createUserMessage(1, 'Q1');
      store.getState().setMessages(msgs => [...msgs, userMsg]);
      store.getState().setStreamingRoundNumber(1);

      // Verify streamingRoundNumber is set
      expect(store.getState().streamingRoundNumber).toBe(1);

      // Start streaming
      store.getState().setIsStreaming(true);
      expect(store.getState().streamingRoundNumber).toBe(1);

      // During first participant
      store.getState().setCurrentParticipantIndex(0);
      store.getState().setMessages(msgs => [...msgs, createAssistantMessage(1, 0, 'A1-0', false)]);
      expect(store.getState().streamingRoundNumber).toBe(1);

      // During second participant
      store.getState().setCurrentParticipantIndex(1);
      store.getState().setMessages(msgs => [...msgs, createAssistantMessage(1, 1, 'A1-1', false)]);
      expect(store.getState().streamingRoundNumber).toBe(1);

      // CRITICAL: streamingRoundNumber maintained throughout
      expect(store.getState().streamingRoundNumber).toBe(1);
      expect(store.getState().isStreaming).toBe(true);
    });

    it('should not clear streamingRoundNumber when configChangeRoundNumber is set', () => {
      store.getState().initializeThread(thread, participants, [
        createUserMessage(0, 'Q0'),
      ]);

      // Start round 1 submission with config change
      const userMsg = createOptimisticUserMessage(1, 'Q1');
      store.getState().setMessages(msgs => [...msgs, userMsg]);
      store.getState().setStreamingRoundNumber(1);
      store.getState().setConfigChangeRoundNumber(1);
      store.getState().setWaitingToStartStreaming(true);

      // Simulate initializeThread being called (e.g., from PATCH response)
      store.getState().initializeThread(thread, participants, [
        createUserMessage(0, 'Q0'),
      ]);

      // CRITICAL: streamingRoundNumber should be preserved (not reset to null)
      // because configChangeRoundNumber indicates active submission
      const state = store.getState();
      expect(state.streamingRoundNumber).toBe(1);
      expect(state.configChangeRoundNumber).toBe(1);
    });

    it('should preserve messages when initializeThread called during active submission', () => {
      store.getState().initializeThread(thread, participants, [
        createUserMessage(0, 'Q0'),
        createAssistantMessage(0, 0, 'A0-0'),
      ]);

      // Start round 1 with optimistic message
      const optimisticMsg = createOptimisticUserMessage(1, 'Q1');
      store.getState().setMessages(msgs => [...msgs, optimisticMsg]);
      store.getState().setStreamingRoundNumber(1);
      store.getState().setConfigChangeRoundNumber(1);

      // initializeThread called with only round 0 data
      store.getState().initializeThread(thread, participants, [
        createUserMessage(0, 'Q0'),
        createAssistantMessage(0, 0, 'A0-0'),
      ]);

      // CRITICAL: Round 1 optimistic message should be preserved
      const state = store.getState();
      const round1Messages = state.messages.filter(m => getRoundNumber(m.metadata) === 1);
      expect(round1Messages).toHaveLength(1);
      const round1Msg = round1Messages[0];
      if (!round1Msg)
        throw new Error('Expected round 1 message');
      expect(round1Msg.role).toBe(MessageRoles.USER);
    });
  });

  // ============================================================================
  // TESTS - EDGE CASES
  // ============================================================================

  describe('edge cases', () => {
    it('should handle streaming starting before PATCH completes', () => {
      store.getState().initializeThread(thread, participants, [
        createUserMessage(0, 'Q0'),
      ]);

      // Add optimistic message and set streaming state
      const optimisticMsg = createOptimisticUserMessage(1, 'Q1');
      store.getState().setMessages(msgs => [...msgs, optimisticMsg]);
      store.getState().setStreamingRoundNumber(1);
      store.getState().setConfigChangeRoundNumber(1); // PATCH in progress

      // Streaming starts before PATCH completes
      store.getState().setIsStreaming(true);

      // CRITICAL: User message should still be visible
      const state = store.getState();
      expect(state.isStreaming).toBe(true);
      expect(state.configChangeRoundNumber).toBe(1);

      const userMessages = state.messages.filter(
        m => m.role === MessageRoles.USER && getRoundNumber(m.metadata) === 1,
      );
      expect(userMessages).toHaveLength(1);
    });

    it('should handle rapid consecutive submissions', () => {
      store.getState().initializeThread(thread, participants, []);

      // Submit round 0
      store.getState().setMessages([createUserMessage(0, 'Q0')]);
      store.getState().setStreamingRoundNumber(0);

      // Verify round 0 user message visible
      let state = store.getState();
      expect(state.messages.filter(m => getRoundNumber(m.metadata) === 0)).toHaveLength(1);

      // Complete round 0
      store.getState().setMessages(msgs => [
        ...msgs,
        createAssistantMessage(0, 0, 'A0-0'),
        createAssistantMessage(0, 1, 'A0-1'),
      ]);
      store.getState().setStreamingRoundNumber(null);

      // Immediately submit round 1
      store.getState().setMessages(msgs => [...msgs, createUserMessage(1, 'Q1')]);
      store.getState().setStreamingRoundNumber(1);

      // CRITICAL: Both rounds should be visible
      state = store.getState();
      expect(state.messages.filter(m => getRoundNumber(m.metadata) === 0)).toHaveLength(3);
      expect(state.messages.filter(m => getRoundNumber(m.metadata) === 1)).toHaveLength(1);
    });

    it('should maintain visibility when web search enabled mid-conversation', () => {
      // Round 0 without web search
      store.getState().initializeThread(thread, participants, [
        createUserMessage(0, 'Q0'),
        createAssistantMessage(0, 0, 'A0-0'),
      ]);

      // Enable web search before round 1
      const threadWithSearch = createMockThread({ enableWebSearch: true });
      store.getState().setThread(threadWithSearch);

      // Add round 1 with pre-search
      store.getState().addPreSearch(createPreSearch(1, MessageStatuses.PENDING));
      store.getState().setMessages(msgs => [...msgs, createUserMessage(1, 'Search query')]);
      store.getState().setStreamingRoundNumber(1);

      // CRITICAL: Pre-search and user message both visible
      verifyStreamingVisibilityState(store, 1, {
        expectUserMessage: true,
        expectPlaceholders: true,
        expectPreSearch: true,
        participantCount: 2,
      });
    });
  });
});
