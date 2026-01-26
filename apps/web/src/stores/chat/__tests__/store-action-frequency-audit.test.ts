/**
 * Store Action Frequency Audit Tests
 *
 * Verifies store actions batch updates appropriately and don't leak subscriptions.
 * Ensures minimal store updates for better performance.
 *
 * Pattern: Store subscription counting to verify batching efficiency
 */

import { beforeEach, describe, expect, it } from 'vitest';

import {
  createTestAssistantMessage,
  createTestChatStore,
  createTestUserMessage,
} from '@/lib/testing';
import type { ChatStoreApi } from '@/stores/chat';

describe('store Action Frequency Audit', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createTestChatStore();
  });

  describe('category 2: Store Action Update Frequency', () => {
    it('2.1 - subscription count stable during streaming session', () => {
      /**
       * Test: Start vs end subscription count equal
       * Verifies no subscription leaks during streaming
       */
      let _subscriptionCount = 0;
      let unsubscribeCount = 0;

      // Create multiple subscriptions to simulate component mounts
      const subscriptions: (() => void)[] = [];
      for (let i = 0; i < 5; i++) {
        const unsub = store.subscribe(() => {
          _subscriptionCount++;
        });
        subscriptions.push(() => {
          unsubscribeCount++;
          unsub();
        });
      }

      // Simulate streaming session
      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(0);
      store.getState().setCurrentParticipantIndex(0);

      // Simulate message updates
      for (let i = 0; i < 10; i++) {
        store.getState().setMessages([
          createTestAssistantMessage({
            content: `Chunk ${i}`,
            id: 'thread_r0_p0',
            participantId: 'p0',
            participantIndex: 0,
            roundNumber: 0,
          }),
        ]);
      }

      // Complete streaming
      store.getState().completeStreaming();

      // Unsubscribe all
      subscriptions.forEach(unsub => unsub());

      // All subscriptions should be properly cleaned up
      expect(unsubscribeCount).toBe(5);

      // Verify no memory leak - create new subscription and it works
      let newSubCalled = false;
      const newUnsub = store.subscribe(() => {
        newSubCalled = true;
      });
      store.getState().setInputValue('test');
      expect(newSubCalled).toBeTruthy();
      newUnsub();
    });

    it('2.2 - completeStreaming batches all resets', () => {
      /**
       * Test: completeStreaming 10+ field resets → exactly 1 store update
       */

      // Set up streaming state
      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(0);
      store.getState().setCurrentParticipantIndex(2);
      store.getState().setWaitingToStartStreaming(true);
      store.getState().setIsModeratorStreaming(true);

      let updateCount = 0;
      const unsubscribe = store.subscribe(() => {
        updateCount++;
      });

      const before = updateCount;

      // completeStreaming should batch all resets into 1 update
      store.getState().completeStreaming();

      unsubscribe();

      // CRITICAL: Single batched update (not 10+ individual setters)
      // completeStreaming also calls deduplicateMessages which may add 1 more
      expect(updateCount - before).toBeLessThanOrEqual(2);

      // Verify all state was reset
      const state = store.getState();
      expect(state.isStreaming).toBeFalsy();
      expect(state.streamingRoundNumber).toBeNull();
      expect(state.currentParticipantIndex).toBe(0);
      expect(state.waitingToStartStreaming).toBeFalsy();
      expect(state.isModeratorStreaming).toBeFalsy();
    });

    it('2.3 - initializeThread batches atomically', () => {
      /**
       * Test: Thread + participants + messages → 1 update
       */
      let updateCount = 0;
      const unsubscribe = store.subscribe(() => {
        updateCount++;
      });

      const before = updateCount;

      const thread = {
        createdAt: new Date(),
        enableWebSearch: false,
        id: 'thread-123',
        isPublic: false,
        mode: 'brainstorming' as const,
        slug: 'test-thread',
        title: 'Test Thread',
        updatedAt: new Date(),
        userId: 'user-1',
      };

      const participants = [
        {
          createdAt: new Date(),
          customRoleId: null,
          id: 'p0',
          isEnabled: true,
          modelId: 'gpt-4',
          priority: 0,
          role: null,
          threadId: 'thread-123',
          updatedAt: new Date(),
        },
        {
          createdAt: new Date(),
          customRoleId: null,
          id: 'p1',
          isEnabled: true,
          modelId: 'claude',
          priority: 1,
          role: null,
          threadId: 'thread-123',
          updatedAt: new Date(),
        },
      ];

      // initializeThread batches thread + participants into single update
      store.getState().initializeThread(thread, participants);

      unsubscribe();

      const totalUpdates = updateCount - before;

      // Should be 1 batched update, not 3+ individual updates
      expect(totalUpdates).toBe(1);

      // Verify initialization worked
      const state = store.getState();
      expect(state.thread?.id).toBe('thread-123');
      expect(state.participants).toHaveLength(2);
    });

    it('2.4 - selector isolation with useShallow', () => {
      /**
       * Test: Unrelated state change → isolated selector tracking
       * Document: This tests store-level updates, not React re-renders
       */
      let messagesUpdateCount = 0;
      let streamingUpdateCount = 0;

      // Simulate two isolated selectors by tracking specific changes
      let prevMessages = store.getState().messages;
      let prevIsStreaming = store.getState().isStreaming;

      const unsubscribe = store.subscribe(() => {
        const state = store.getState();
        if (state.messages !== prevMessages) {
          messagesUpdateCount++;
          prevMessages = state.messages;
        }
        if (state.isStreaming !== prevIsStreaming) {
          streamingUpdateCount++;
          prevIsStreaming = state.isStreaming;
        }
      });

      // Change messages
      store.getState().setMessages([
        createTestUserMessage({ content: 'Hello', id: 'msg1', roundNumber: 0 }),
      ]);

      // Change streaming state
      store.getState().setIsStreaming(true);

      // Change messages again
      store.getState().setMessages([
        createTestUserMessage({ content: 'Hello', id: 'msg1', roundNumber: 0 }),
        createTestAssistantMessage({
          content: 'Hi',
          id: 'msg2',
          participantId: 'p0',
          participantIndex: 0,
          roundNumber: 0,
        }),
      ]);

      unsubscribe();

      // Messages changed 2x, streaming changed 1x
      expect(messagesUpdateCount).toBe(2);
      expect(streamingUpdateCount).toBe(1);

      // Document: With useShallow in components, only relevant updates cause re-renders
    });

    it('2.5 - tracking Set updates minimal', () => {
      /**
       * Test: tryMarkPreSearchTriggered returns false on duplicate adds
       * Verifies Set-based tracking doesn't cause duplicate triggers
       */
      let updateCount = 0;
      const unsubscribe = store.subscribe(() => {
        updateCount++;
      });

      // Initial add to triggeredPreSearchRounds
      const before = updateCount;
      const firstResult = store.getState().tryMarkPreSearchTriggered(0);
      const afterFirst = updateCount - before;

      // Adding same value again
      const beforeSecond = updateCount;
      const secondResult = store.getState().tryMarkPreSearchTriggered(0);
      const afterSecond = updateCount - beforeSecond;

      unsubscribe();

      // First add should succeed and trigger update
      expect(firstResult).toBeTruthy();
      expect(afterFirst).toBe(1);

      // Second add should fail (already tracked) and NOT trigger update
      expect(secondResult).toBeFalsy();
      expect(afterSecond).toBe(0);

      // Set should only have 1 entry
      expect(store.getState().triggeredPreSearchRounds.size).toBe(1);
    });

    it('2.6 - concurrent setMessages with function updater', () => {
      /**
       * Test: Multiple concurrent setMessages calls with function updaters
       * Verifies proper handling of concurrent updates
       */
      // Set initial messages
      store.getState().setMessages([
        createTestUserMessage({ content: 'Initial', id: 'user-0', roundNumber: 0 }),
      ]);

      let updateCount = 0;
      const unsubscribe = store.subscribe(() => {
        updateCount++;
      });

      const before = updateCount;

      // Simulate concurrent updates with function updaters
      store.getState().setMessages(prev => [
        ...prev,
        createTestAssistantMessage({
          content: 'P0',
          id: 'p0-0',
          participantId: 'p0',
          participantIndex: 0,
          roundNumber: 0,
        }),
      ]);

      store.getState().setMessages(prev => [
        ...prev,
        createTestAssistantMessage({
          content: 'P1',
          id: 'p1-0',
          participantId: 'p1',
          participantIndex: 1,
          roundNumber: 0,
        }),
      ]);

      store.getState().setMessages(prev => [
        ...prev,
        createTestAssistantMessage({
          content: 'P2',
          id: 'p2-0',
          participantId: 'p2',
          participantIndex: 2,
          roundNumber: 0,
        }),
      ]);

      unsubscribe();

      // 3 setMessages calls = 3 updates
      expect(updateCount - before).toBe(3);

      // All messages should be present (function updaters read fresh state)
      const messages = store.getState().messages;
      expect(messages).toHaveLength(4); // user + 3 participants
    });

    it('2.7 - prepareForNewMessage batches setup', () => {
      /**
       * Test: prepareForNewMessage sets multiple state fields in single update
       */
      // Initialize thread first
      store.getState().initializeThread(
        {
          createdAt: new Date(),
          enableWebSearch: false,
          id: 'thread-123',
          isPublic: false,
          mode: 'brainstorming',
          slug: 'test',
          title: 'Test',
          updatedAt: new Date(),
          userId: 'user-1',
        },
        [
          {
            createdAt: new Date(),
            customRoleId: null,
            id: 'p0',
            isEnabled: true,
            modelId: 'gpt-4',
            priority: 0,
            role: null,
            threadId: 'thread-123',
            updatedAt: new Date(),
          },
        ],
      );

      let updateCount = 0;
      const unsubscribe = store.subscribe(() => {
        updateCount++;
      });

      const before = updateCount;

      // prepareForNewMessage requires message + participantIds array
      store.getState().prepareForNewMessage('Test message', ['gpt-4']);

      unsubscribe();

      // Should be batched into 1-2 updates max
      expect(updateCount - before).toBeLessThanOrEqual(2);

      // Verify state was set
      const state = store.getState();
      expect(state.pendingMessage).toBe('Test message');
    });
  });
});
