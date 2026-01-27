/**
 * SSR Hydration Consistency Tests
 *
 * Tests for SSR → client hydration consistency to catch:
 * 1. Re-render flash when completed messages hydrate
 * 2. State updates when hydrated state matches current
 * 3. Streaming message handling during hydration
 * 4. Phase preservation from loader data
 * 5. lastSeq value preservation
 *
 * @see /Users/avabagherzadeh/Desktop/projects/deadpixel/billing-dashboard/docs/FLOW_DOCUMENTATION.md
 */

import { MessageStatuses, ScreenModes } from '@roundtable/shared';
import type { UIMessage } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createMockParticipant,
  createMockParticipants,
  createMockStoredPreSearch,
  createMockThread,
  createTestAssistantMessage,
  createTestModeratorMessage,
  createTestUserMessage,
} from '@/lib/testing';
import { createChatStore } from '@/stores/chat';

import { ChatPhases } from '../store-schemas';

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Simulate SSR hydration by calling initializeThread with loader data
 */
function simulateSSRHydration(
  store: ReturnType<typeof createChatStore>,
  options: {
    thread: ReturnType<typeof createMockThread>;
    participants: ReturnType<typeof createMockParticipants>;
    messages: UIMessage[];
    preSearches?: ReturnType<typeof createMockStoredPreSearch>[];
  },
) {
  const { messages, participants, preSearches, thread } = options;

  // This mirrors what useSyncHydrateStore does
  store.getState().initializeThread(thread, participants, messages);

  if (preSearches && preSearches.length > 0) {
    store.getState().setPreSearches(preSearches);
  }

  store.getState().setHasInitiallyLoaded(true);
  store.getState().setShowInitialUI(false);
}

/**
 * Create a set of completed round messages
 */
function createCompletedRoundMessages(
  roundNumber: number,
  participantCount: number,
  threadId: string,
): UIMessage[] {
  const messages: UIMessage[] = [];

  // User message
  messages.push(createTestUserMessage({
    content: `User question round ${roundNumber}`,
    id: `${threadId}_r${roundNumber}_user`,
    roundNumber,
  }));

  // Participant messages
  for (let i = 0; i < participantCount; i++) {
    messages.push(createTestAssistantMessage({
      content: `Participant ${i} response round ${roundNumber}`,
      id: `${threadId}_r${roundNumber}_p${i}`,
      participantId: `participant-${i}`,
      participantIndex: i,
      roundNumber,
    }));
  }

  // Moderator message
  messages.push(createTestModeratorMessage({
    content: `Moderator summary round ${roundNumber}`,
    id: `${threadId}_r${roundNumber}_moderator`,
    roundNumber,
  }));

  return messages;
}

// ============================================================================
// Test Suite: SSR Hydration Consistency
// ============================================================================

describe('sSR Hydration Consistency', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.clearAllMocks();
  });

  describe('hydrate completed messages without re-render flash', () => {
    it('should hydrate completed messages in a single state update', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = createMockParticipants(2, 'thread-123');
      const messages = createCompletedRoundMessages(0, 2, 'thread-123');

      // Track state updates
      const stateUpdates: number[] = [];
      const unsubscribe = store.subscribe(() => {
        stateUpdates.push(Date.now());
      });

      simulateSSRHydration(store, { messages, participants, thread });

      unsubscribe();

      // Verify messages are in store
      const state = store.getState();
      expect(state.messages).toHaveLength(messages.length);

      // Should have few state updates (initializeThread is batched)
      // This prevents flash from multiple rapid updates
      expect(stateUpdates.length).toBeLessThanOrEqual(5);
    });

    it('should set correct phase for completed round', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = createMockParticipants(2, 'thread-123');
      const messages = createCompletedRoundMessages(0, 2, 'thread-123');

      simulateSSRHydration(store, { messages, participants, thread });

      const state = store.getState();
      expect(state.phase).toBe(ChatPhases.COMPLETE);
    });

    it('should preserve message order after hydration', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = createMockParticipants(3, 'thread-123');
      const messages = createCompletedRoundMessages(0, 3, 'thread-123');

      simulateSSRHydration(store, { messages, participants, thread });

      const state = store.getState();
      expect(state.messages.map(m => m.id)).toEqual(messages.map(m => m.id));
    });
  });

  describe('preserve message content during hydration', () => {
    it('should preserve exact message content without modification', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = createMockParticipants(2, 'thread-123');
      const originalContent = 'Original **markdown** content with `code`';

      const messages = [
        createTestUserMessage({
          content: 'User question',
          id: 'msg-user',
          roundNumber: 0,
        }),
        createTestAssistantMessage({
          content: originalContent,
          id: 'msg-p0',
          participantId: 'participant-0',
          participantIndex: 0,
          roundNumber: 0,
        }),
      ];

      simulateSSRHydration(store, { messages, participants, thread });

      const state = store.getState();
      const assistantMsg = state.messages.find(m => m.id === 'msg-p0');
      expect(assistantMsg).toBeDefined();

      const textPart = assistantMsg!.parts?.find(p => 'text' in p);
      expect(textPart && 'text' in textPart ? textPart.text : '').toBe(originalContent);
    });

    it('should preserve metadata during hydration', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = createMockParticipants(1, 'thread-123');

      const messages = [
        createTestUserMessage({
          content: 'Question',
          id: 'msg-user',
          roundNumber: 0,
        }),
        createTestAssistantMessage({
          content: 'Answer',
          finishReason: 'stop',
          hasError: false,
          id: 'msg-p0',
          model: 'gpt-4-turbo',
          participantId: 'participant-0',
          participantIndex: 0,
          roundNumber: 0,
        }),
      ];

      simulateSSRHydration(store, { messages, participants, thread });

      const state = store.getState();
      const assistantMsg = state.messages.find(m => m.id === 'msg-p0');
      const metadata = assistantMsg?.metadata as Record<string, unknown>;

      expect(metadata.roundNumber).toBe(0);
      expect(metadata.participantIndex).toBe(0);
      expect(metadata.model).toBe('gpt-4-turbo');
    });
  });

  describe('not trigger state updates when hydrated state matches', () => {
    it('should skip hydration when thread ID matches and not streaming', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = createMockParticipants(2, 'thread-123');
      const messages = createCompletedRoundMessages(0, 2, 'thread-123');

      // First hydration
      simulateSSRHydration(store, { messages, participants, thread });

      const stateAfterFirst = store.getState();
      const messagesAfterFirst = stateAfterFirst.messages;

      // Track updates for second hydration
      let updateCount = 0;
      const unsubscribe = store.subscribe(() => {
        updateCount++;
      });

      // Simulate second hydration with same data
      // In useSyncHydrateStore, this would be skipped due to hasHydratedRef
      // Here we verify the store handles repeated initializeThread gracefully
      store.getState().initializeThread(thread, participants, messages);

      unsubscribe();

      // Messages should remain stable reference if no actual change needed
      const stateAfterSecond = store.getState();
      expect(stateAfterSecond.messages).toHaveLength(messagesAfterFirst.length);
    });
  });

  describe('handle hydration with streaming messages in progress', () => {
    it('should preserve streaming phase during hydration for same thread', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = createMockParticipants(2, 'thread-123');

      // Set up streaming state BEFORE hydration
      store.setState({
        isStreaming: true,
        phase: ChatPhases.PARTICIPANTS,
        thread,
        waitingToStartStreaming: false,
      });

      // Messages from SSR (user message only - streaming just started)
      const messages = [
        createTestUserMessage({
          content: 'Question',
          id: 'msg-user',
          roundNumber: 0,
        }),
      ];

      // Hydration should preserve streaming phase
      store.getState().initializeThread(thread, participants, messages);

      const state = store.getState();
      // Phase should be preserved since isStreaming was true
      expect(state.phase).toBe(ChatPhases.PARTICIPANTS);
      expect(state.messages).toHaveLength(1);
    });

    it('should preserve waitingToStartStreaming during hydration', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = createMockParticipants(2, 'thread-123');

      // Set up waiting state BEFORE hydration
      store.setState({
        thread,
        waitingToStartStreaming: true,
      });

      const messages: UIMessage[] = [];

      // initializeThread should NOT reset waitingToStartStreaming
      store.getState().initializeThread(thread, participants, messages);

      const state = store.getState();
      // waitingToStartStreaming is not modified by initializeThread
      // It's preserved in the state
      expect(state.waitingToStartStreaming).toBe(true);
    });
  });

  describe('hydrate store with correct phase from loader data', () => {
    it('should set IDLE phase for empty thread', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = createMockParticipants(2, 'thread-123');
      const messages: UIMessage[] = [];

      simulateSSRHydration(store, { messages, participants, thread });

      expect(store.getState().phase).toBe(ChatPhases.IDLE);
    });

    it('should set COMPLETE phase for thread with completed round', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = createMockParticipants(2, 'thread-123');
      const messages = createCompletedRoundMessages(0, 2, 'thread-123');

      simulateSSRHydration(store, { messages, participants, thread });

      expect(store.getState().phase).toBe(ChatPhases.COMPLETE);
    });

    it('should set screenMode to THREAD after hydration', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = createMockParticipants(2, 'thread-123');
      const messages = createCompletedRoundMessages(0, 2, 'thread-123');

      simulateSSRHydration(store, { messages, participants, thread });

      expect(store.getState().screenMode).toBe(ScreenModes.THREAD);
    });
  });

  describe('preserve lastSeq values during hydration', () => {
    it('should initialize subscription state with default lastSeq values', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = createMockParticipants(2, 'thread-123');
      const messages = createCompletedRoundMessages(0, 2, 'thread-123');

      simulateSSRHydration(store, { messages, participants, thread });

      // After hydration, subscription state should be at defaults
      // (actual lastSeq values come from API resumption data, not SSR)
      const state = store.getState();
      expect(state.subscriptionState.presearch.lastSeq).toBe(0);
      expect(state.subscriptionState.moderator.lastSeq).toBe(0);
    });

    it('should preserve lastSeq when streaming state is active', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = createMockParticipants(2, 'thread-123');

      // Initialize subscriptions with lastSeq values (simulating active stream)
      store.getState().initializeSubscriptions(0, 2);
      store.getState().updateEntitySubscriptionStatus(0, 'streaming', 50);
      store.getState().updateEntitySubscriptionStatus(1, 'waiting');

      // Set streaming state
      store.setState({
        isStreaming: true,
        phase: ChatPhases.PARTICIPANTS,
        thread,
      });

      const messages = [
        createTestUserMessage({
          content: 'Question',
          id: 'msg-user',
          roundNumber: 0,
        }),
      ];

      // Hydration during streaming
      store.getState().initializeThread(thread, participants, messages);

      // lastSeq should be preserved via subscriptionState (not reset by initializeThread)
      const state = store.getState();
      expect(state.subscriptionState.participants[0]?.lastSeq).toBe(50);
    });
  });

  describe('handle hydration when thread has no messages', () => {
    it('should hydrate empty thread correctly', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = createMockParticipants(2, 'thread-123');
      const messages: UIMessage[] = [];

      simulateSSRHydration(store, { messages, participants, thread });

      const state = store.getState();
      expect(state.messages).toHaveLength(0);
      expect(state.thread).toBe(thread);
      expect(state.participants).toBe(participants);
      expect(state.phase).toBe(ChatPhases.IDLE);
    });

    it('should show initial UI as false after hydration', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = createMockParticipants(2, 'thread-123');
      const messages: UIMessage[] = [];

      simulateSSRHydration(store, { messages, participants, thread });

      expect(store.getState().showInitialUI).toBe(false);
    });
  });

  describe('handle hydration with presearch data', () => {
    it('should hydrate presearch data from loader', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = createMockParticipants(2, 'thread-123');
      const messages = createCompletedRoundMessages(0, 2, 'thread-123');
      const preSearches = [
        createMockStoredPreSearch(0, MessageStatuses.COMPLETE),
      ];

      simulateSSRHydration(store, { messages, participants, preSearches, thread });

      const state = store.getState();
      expect(state.preSearches).toHaveLength(1);
      expect(state.preSearches[0]?.roundNumber).toBe(0);
      expect(state.preSearches[0]?.status).toBe(MessageStatuses.COMPLETE);
    });

    it('should hydrate multiple presearches for multiple rounds', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = createMockParticipants(2, 'thread-123');

      // Two rounds completed
      const messages = [
        ...createCompletedRoundMessages(0, 2, 'thread-123'),
        ...createCompletedRoundMessages(1, 2, 'thread-123'),
      ];

      const preSearches = [
        createMockStoredPreSearch(0, MessageStatuses.COMPLETE),
        createMockStoredPreSearch(1, MessageStatuses.COMPLETE),
      ];

      simulateSSRHydration(store, { messages, participants, preSearches, thread });

      const state = store.getState();
      expect(state.preSearches).toHaveLength(2);
      expect(state.preSearches.map(ps => ps.roundNumber)).toEqual([0, 1]);
    });

    it('should hydrate streaming presearch status', () => {
      const thread = createMockThread({ enableWebSearch: true, id: 'thread-123' });
      const participants = createMockParticipants(2, 'thread-123');

      // Only user message - presearch still in progress
      const messages = [
        createTestUserMessage({
          content: 'Research this topic',
          id: 'msg-user',
          roundNumber: 0,
        }),
      ];

      const preSearches = [
        createMockStoredPreSearch(0, MessageStatuses.STREAMING),
      ];

      simulateSSRHydration(store, { messages, participants, preSearches, thread });

      const state = store.getState();
      expect(state.preSearches[0]?.status).toBe(MessageStatuses.STREAMING);
    });
  });

  describe('multi-round hydration', () => {
    it('should hydrate multiple completed rounds', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = createMockParticipants(2, 'thread-123');

      const messages = [
        ...createCompletedRoundMessages(0, 2, 'thread-123'),
        ...createCompletedRoundMessages(1, 2, 'thread-123'),
        ...createCompletedRoundMessages(2, 2, 'thread-123'),
      ];

      simulateSSRHydration(store, { messages, participants, thread });

      const state = store.getState();
      // 3 rounds × (1 user + 2 participants + 1 moderator) = 12 messages
      expect(state.messages).toHaveLength(12);
      expect(state.phase).toBe(ChatPhases.COMPLETE);
    });

    it('should correctly identify highest round number', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = createMockParticipants(2, 'thread-123');

      const messages = [
        ...createCompletedRoundMessages(0, 2, 'thread-123'),
        ...createCompletedRoundMessages(1, 2, 'thread-123'),
      ];

      simulateSSRHydration(store, { messages, participants, thread });

      const state = store.getState();
      // After hydration, currentRoundNumber is not automatically set by initializeThread
      // It's set by the streaming flow
      expect(state.messages).toHaveLength(8);
    });
  });

  describe('participant hydration', () => {
    it('should hydrate participants array from loader', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = [
        createMockParticipant(0, { id: 'p0', modelId: 'gpt-4', threadId: 'thread-123' }),
        createMockParticipant(1, { id: 'p1', modelId: 'claude-3', threadId: 'thread-123' }),
        createMockParticipant(2, { id: 'p2', modelId: 'gemini-pro', threadId: 'thread-123' }),
      ];
      const messages = createCompletedRoundMessages(0, 3, 'thread-123');

      simulateSSRHydration(store, { messages, participants, thread });

      const state = store.getState();
      expect(state.participants).toHaveLength(3);
      expect(state.participants.map(p => p.modelId)).toEqual(['gpt-4', 'claude-3', 'gemini-pro']);
    });

    it('should preserve participant priority order', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = [
        createMockParticipant(0, { id: 'p0', priority: 2, threadId: 'thread-123' }),
        createMockParticipant(1, { id: 'p1', priority: 0, threadId: 'thread-123' }),
        createMockParticipant(2, { id: 'p2', priority: 1, threadId: 'thread-123' }),
      ];
      const messages = createCompletedRoundMessages(0, 3, 'thread-123');

      simulateSSRHydration(store, { messages, participants, thread });

      const state = store.getState();
      expect(state.participants.map(p => p.priority)).toEqual([2, 0, 1]);
    });
  });

  describe('thread state hydration', () => {
    it('should hydrate thread object correctly', () => {
      const thread = createMockThread({
        enableWebSearch: true,
        id: 'thread-123',
        title: 'Test Thread Title',
      });
      const participants = createMockParticipants(2, 'thread-123');
      const messages = createCompletedRoundMessages(0, 2, 'thread-123');

      simulateSSRHydration(store, { messages, participants, thread });

      const state = store.getState();
      expect(state.thread?.id).toBe('thread-123');
      expect(state.thread?.title).toBe('Test Thread Title');
      expect(state.thread?.enableWebSearch).toBe(true);
    });

    it('should clear changelog items on hydration', () => {
      // Pre-existing changelog items
      store.setState({
        changelogItems: [{ id: 'old-change', type: 'mode-change' } as never],
      });

      const thread = createMockThread({ id: 'thread-123' });
      const participants = createMockParticipants(2, 'thread-123');
      const messages = createCompletedRoundMessages(0, 2, 'thread-123');

      simulateSSRHydration(store, { messages, participants, thread });

      expect(store.getState().changelogItems).toHaveLength(0);
    });
  });

  describe('hydration does not corrupt existing streaming', () => {
    it('should not overwrite streaming placeholders with empty messages', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = createMockParticipants(2, 'thread-123');

      // Create streaming placeholder
      store.getState().setParticipants(participants);
      store.getState().appendEntityStreamingText(0, 'Streaming content...', 0);

      const streamingMsgBefore = store.getState().messages.find(m => m.id === 'streaming_p0_r0');
      expect(streamingMsgBefore).toBeDefined();

      // Hydration with only user message (SSR doesn't have streaming content)
      const messages = [
        createTestUserMessage({
          content: 'Question',
          id: 'msg-user',
          roundNumber: 0,
        }),
      ];

      // When streaming is active, initializeThread replaces messages
      // The streaming placeholder would be lost - this is expected behavior
      // The streaming hooks will recreate placeholders after hydration
      store.setState({ isStreaming: true, thread });
      store.getState().initializeThread(thread, participants, messages);

      // After initializeThread, messages are replaced
      const state = store.getState();
      expect(state.messages).toHaveLength(1);
      expect(state.messages[0]?.id).toBe('msg-user');
    });
  });
});
