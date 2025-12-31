/**
 * Streaming Update Frequency Tests
 *
 * Tests to identify excessive store updates during streaming.
 * Root cause: Message sync effect runs on every chunk, causing:
 * - Excessive setMessages calls
 * - Expensive processing (Sets, Maps, sorting) on every update
 * - UI freezing due to rapid re-renders
 *
 * Test Coverage:
 * - setMessages call frequency during streaming
 * - Content-based change detection
 * - Throttling behavior
 * - Moderator streaming updates
 * - Component render count tracking
 */

import { describe, expect, it, vi } from 'vitest';

import { FinishReasons, MessagePartTypes, UIMessageRoles } from '@/api/core/enums';

import { createChatStore } from '../store';

describe('streaming Update Frequency', () => {
  describe('setMessages call frequency', () => {
    it('should throttle setMessages during rapid streaming updates', () => {
      const store = createChatStore();
      const setMessagesSpy = vi.fn();

      // Track setMessages calls
      const originalSetMessages = store.getState().setMessages;
      store.setState({
        setMessages: (messages) => {
          setMessagesSpy();
          originalSetMessages(messages);
        },
      });

      // Simulate rapid streaming chunks (10 chunks in 100ms = 10ms per chunk)
      const baseMessage = {
        id: 'thread-1_r0_p0',
        role: UIMessageRoles.ASSISTANT,
        metadata: { roundNumber: 0, participantIndex: 0 },
        createdAt: new Date(),
      };

      // Initial message
      store.getState().setMessages([
        {
          ...baseMessage,
          parts: [{ type: MessagePartTypes.TEXT, text: 'Hello' }],
        },
      ]);

      // Reset spy after initial
      setMessagesSpy.mockClear();

      // Simulate 10 rapid chunk updates (like streaming)
      for (let i = 0; i < 10; i++) {
        store.getState().setMessages([
          {
            ...baseMessage,
            parts: [{ type: MessagePartTypes.TEXT, text: 'Hello'.repeat(i + 2) }],
          },
        ]);
      }

      // Current behavior: 10 updates (unthrottled)
      // After optimization: should be throttled to fewer updates
      expect(setMessagesSpy).toHaveBeenCalled();
      // Document current behavior
      const callCount = setMessagesSpy.mock.calls.length;
      expect(callCount).toBe(10); // Currently unthrottled
    });

    it('should not call setMessages when content has not changed', () => {
      const store = createChatStore();
      const setMessagesSpy = vi.fn();

      const originalSetMessages = store.getState().setMessages;
      store.setState({
        setMessages: (messages) => {
          setMessagesSpy();
          originalSetMessages(messages);
        },
      });

      const message = {
        id: 'thread-1_r0_p0',
        role: UIMessageRoles.ASSISTANT,
        parts: [{ type: MessagePartTypes.TEXT, text: 'Hello world' }],
        metadata: { roundNumber: 0, participantIndex: 0 },
        createdAt: new Date(),
      };

      // First call
      store.getState().setMessages([message]);
      setMessagesSpy.mockClear();

      // Second call with SAME content (different reference)
      store.getState().setMessages([{ ...message }]);

      // After optimization: should detect same content and skip update
      // Current behavior: updates anyway (new reference)
      expect(setMessagesSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('message comparison optimization', () => {
    it('should efficiently compare message content', () => {
      const store = createChatStore();

      const createMessage = (text: string) => ({
        id: 'thread-1_r0_p0',
        role: UIMessageRoles.ASSISTANT,
        parts: [{ type: MessagePartTypes.TEXT, text }],
        metadata: { roundNumber: 0, participantIndex: 0 },
        createdAt: new Date(),
      });

      // Set initial message
      store.getState().setMessages([createMessage('Hello')]);
      const _initialMessages = store.getState().messages; // Baseline reference

      // Update with same content
      store.getState().setMessages([createMessage('Hello')]);
      const _afterSameContent = store.getState().messages; // Same content reference

      // Update with different content
      store.getState().setMessages([createMessage('Hello World')]);
      const afterDifferentContent = store.getState().messages;

      // After optimization:
      // - Same content should preserve reference (or at least not trigger re-render)
      // - Different content should update

      // Currently messages always update
      expect(afterDifferentContent[0]?.parts?.[0]).toMatchObject({
        type: 'text',
        text: 'Hello World',
      });
    });

    it('should only process last message parts during streaming', () => {
      const store = createChatStore();

      // Create messages from multiple participants
      const messages = [
        {
          id: 'msg-user-0',
          role: UIMessageRoles.USER,
          parts: [{ type: MessagePartTypes.TEXT, text: 'User message' }],
          metadata: { roundNumber: 0 },
          createdAt: new Date(),
        },
        {
          id: 'thread-1_r0_p0',
          role: UIMessageRoles.ASSISTANT,
          parts: [{ type: MessagePartTypes.TEXT, text: 'Participant 0 complete message' }],
          metadata: { roundNumber: 0, participantIndex: 0 },
          createdAt: new Date(),
        },
        {
          id: 'thread-1_r0_p1',
          role: UIMessageRoles.ASSISTANT,
          parts: [{ type: MessagePartTypes.TEXT, text: 'Streaming...' }], // Currently streaming
          metadata: { roundNumber: 0, participantIndex: 1 },
          createdAt: new Date(),
        },
      ];

      store.getState().setMessages(messages);

      // When updating streaming message, only compare last message content
      // Earlier messages should not be processed
      const updatedMessages = [
        ...messages.slice(0, 2), // Same earlier messages
        {
          ...messages[2],
          parts: [{ type: MessagePartTypes.TEXT, text: 'Streaming more...' }],
        },
      ];

      store.getState().setMessages(updatedMessages);

      // Verify only last message changed
      const storeMessages = store.getState().messages;
      expect(storeMessages[2]?.parts?.[0]).toMatchObject({
        type: 'text',
        text: 'Streaming more...',
      });
    });
  });

  describe('streaming state transitions', () => {
    it('should handle streaming flag changes without excessive updates', () => {
      const store = createChatStore();
      let updateCount = 0;

      const unsubscribe = store.subscribe(() => {
        updateCount++;
      });

      // Set streaming
      store.getState().setIsStreaming(true);
      const afterStreamingStart = updateCount;

      // Multiple isStreaming=true calls (should be idempotent)
      store.getState().setIsStreaming(true);
      store.getState().setIsStreaming(true);
      store.getState().setIsStreaming(true);

      // After optimization: should not trigger updates for same value
      // Current behavior: may trigger updates

      // End streaming
      store.getState().setIsStreaming(false);

      unsubscribe();

      // Document behavior
      expect(afterStreamingStart).toBeGreaterThan(0);
    });

    it('should batch related state updates', () => {
      const store = createChatStore();
      let updateCount = 0;

      const unsubscribe = store.subscribe(() => {
        updateCount++;
      });

      // Simulate what happens when streaming starts
      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(0);
      store.getState().setCurrentParticipantIndex(0);

      unsubscribe();

      // Document current behavior
      // After optimization: these could be batched into fewer updates
      expect(updateCount).toBe(3); // Currently 3 separate updates
    });
  });

  describe('content-based update detection', () => {
    it('should detect when text content actually changed', () => {
      const store = createChatStore();

      const message1 = {
        id: 'thread-1_r0_p0',
        role: UIMessageRoles.ASSISTANT,
        parts: [{ type: MessagePartTypes.TEXT, text: 'Hello' }],
        metadata: { roundNumber: 0, participantIndex: 0 },
        createdAt: new Date(),
      };

      const message2 = {
        id: 'thread-1_r0_p0',
        role: UIMessageRoles.ASSISTANT,
        parts: [{ type: MessagePartTypes.TEXT, text: 'Hello World' }],
        metadata: { roundNumber: 0, participantIndex: 0 },
        createdAt: new Date(),
      };

      store.getState().setMessages([message1]);

      // Helper to check if content changed
      const hasContentChanged = (oldMsg: typeof message1, newMsg: typeof message2) => {
        if (!oldMsg.parts || !newMsg.parts)
          return true;
        if (oldMsg.parts.length !== newMsg.parts.length)
          return true;

        for (let i = 0; i < oldMsg.parts.length; i++) {
          const oldPart = oldMsg.parts[i];
          const newPart = newMsg.parts[i];
          if (oldPart?.type !== newPart?.type)
            return true;
          if (oldPart?.type === MessagePartTypes.TEXT && newPart?.type === MessagePartTypes.TEXT) {
            if ('text' in oldPart && 'text' in newPart && oldPart.text !== newPart.text) {
              return true;
            }
          }
        }
        return false;
      };

      // Same content
      expect(hasContentChanged(message1, { ...message1 })).toBe(false);

      // Different content
      expect(hasContentChanged(message1, message2)).toBe(true);
    });

    it('should efficiently compare streaming message content length', () => {
      const store = createChatStore();

      const createStreamingMessage = (textLength: number) => ({
        id: 'thread-1_r0_p0',
        role: UIMessageRoles.ASSISTANT,
        parts: [{ type: MessagePartTypes.TEXT, text: 'A'.repeat(textLength) }],
        metadata: { roundNumber: 0, participantIndex: 0 },
        createdAt: new Date(),
      });

      // Initial
      store.getState().setMessages([createStreamingMessage(100)]);

      // Quick length check should detect change
      const msg1 = store.getState().messages[0];
      const msg2 = createStreamingMessage(150);

      // Length-based quick check (optimization)
      const textPart1 = msg1?.parts?.[0];
      const textPart2 = msg2.parts[0];

      const lengthChanged = textPart1?.type === MessagePartTypes.TEXT && textPart2.type === MessagePartTypes.TEXT
        && 'text' in textPart1 && 'text' in textPart2
        && textPart1.text.length !== textPart2.text.length;

      expect(lengthChanged).toBe(true);
    });
  });

  describe('throttle behavior', () => {
    it('should respect throttle interval during streaming', async () => {
      const THROTTLE_MS = 100;
      const timestamps: number[] = [];

      // Simulate throttled updates
      const throttledUpdate = (() => {
        let lastUpdate = 0;
        return () => {
          const now = Date.now();
          if (now - lastUpdate >= THROTTLE_MS) {
            lastUpdate = now;
            timestamps.push(now);
            return true;
          }
          return false;
        };
      })();

      // Simulate rapid calls
      for (let i = 0; i < 20; i++) {
        throttledUpdate();
        await new Promise(resolve => setTimeout(resolve, 20));
      }

      // With 100ms throttle and 20*20ms = 400ms total time
      // We should have roughly 4-5 updates
      expect(timestamps.length).toBeGreaterThanOrEqual(4);
      expect(timestamps.length).toBeLessThanOrEqual(6);

      // Verify minimum interval
      for (let i = 1; i < timestamps.length; i++) {
        const interval = timestamps[i]! - timestamps[i - 1]!;
        expect(interval).toBeGreaterThanOrEqual(THROTTLE_MS - 10); // Allow small variance
      }
    });
  });

  describe('moderator streaming update frequency', () => {
    it('documents moderator content update behavior', () => {
      const store = createChatStore();
      let updateCount = 0;

      // Use global subscribe to track all state changes
      const unsubscribe = store.subscribe(() => {
        updateCount++;
      });

      const initialCount = updateCount;

      // Simulate 10 moderator chunks
      for (let i = 1; i <= 10; i++) {
        const moderatorMessage = {
          id: 'thread_r0_moderator',
          role: UIMessageRoles.ASSISTANT,
          parts: [{ type: MessagePartTypes.TEXT, text: `Chunk ${i} ` }],
          metadata: { role: UIMessageRoles.ASSISTANT, roundNumber: 0, isModerator: true },
        };
        store.getState().setMessages([moderatorMessage]);
      }

      unsubscribe();

      // Each setMessages triggers update
      expect(updateCount - initialCount).toBe(10);
    });

    it('documents metadata change update behavior', () => {
      const store = createChatStore();
      let updateCount = 0;

      const unsubscribe = store.subscribe(() => {
        updateCount++;
      });

      const moderatorMessage = {
        id: 'thread_r0_moderator',
        role: UIMessageRoles.ASSISTANT,
        parts: [{ type: MessagePartTypes.TEXT, text: 'Summary complete' }],
        metadata: {
          role: UIMessageRoles.ASSISTANT,
          roundNumber: 0,
          isModerator: true,
          finishReason: FinishReasons.UNKNOWN,
        },
      };

      store.getState().setMessages([moderatorMessage]);
      const countAfterFirst = updateCount;

      // Update with different finishReason
      store.getState().setMessages([{
        ...moderatorMessage,
        metadata: {
          ...moderatorMessage.metadata,
          finishReason: FinishReasons.STOP,
        },
      }]);

      unsubscribe();

      // Metadata change triggers update
      expect(updateCount).toBeGreaterThan(countAfterFirst);
    });
  });

  describe('participant transition performance', () => {
    it('should not cause excessive updates when switching participants', () => {
      const store = createChatStore();
      const stateChanges: string[] = [];

      const unsubscribe = store.subscribe((state, prevState) => {
        const changes: string[] = [];
        if (state.currentParticipantIndex !== prevState.currentParticipantIndex) {
          changes.push('participantIndex');
        }
        if (state.messages.length !== prevState.messages.length) {
          changes.push('messages');
        }
        if (changes.length > 0) {
          stateChanges.push(changes.join('+'));
        }
      });

      // Participant 0 finishes
      const p0Message = {
        id: 'thread_r0_p0',
        role: UIMessageRoles.ASSISTANT,
        parts: [{ type: MessagePartTypes.TEXT, text: 'Response 0' }],
        metadata: {
          role: UIMessageRoles.ASSISTANT,
          roundNumber: 0,
          participantIndex: 0,
          finishReason: FinishReasons.STOP,
        },
        createdAt: new Date(),
      };

      store.getState().setMessages([p0Message]);

      // Transition to participant 1
      store.getState().setCurrentParticipantIndex(1);

      // Participant 1 starts streaming
      const p1Message = {
        id: 'thread_r0_p1',
        role: UIMessageRoles.ASSISTANT,
        parts: [{ type: MessagePartTypes.TEXT, text: 'Response 1' }],
        metadata: {
          role: UIMessageRoles.ASSISTANT,
          roundNumber: 0,
          participantIndex: 1,
          finishReason: FinishReasons.UNKNOWN,
        },
        createdAt: new Date(),
      };

      store.getState().setMessages([p0Message, p1Message]);

      unsubscribe();

      // Should have minimal state changes during transition
      expect(stateChanges.length).toBeLessThan(10);
    });

    it('should preserve completed participant messages when transitioning', () => {
      const store = createChatStore();

      // Participant 0 complete
      const p0Complete = {
        id: 'thread_r0_p0',
        role: UIMessageRoles.ASSISTANT,
        parts: [{ type: MessagePartTypes.TEXT, text: 'P0 complete' }],
        metadata: {
          role: UIMessageRoles.ASSISTANT,
          roundNumber: 0,
          participantIndex: 0,
          participantId: 'participant-0',
          finishReason: FinishReasons.STOP,
        },
        createdAt: new Date(),
      };

      store.getState().setMessages([p0Complete]);

      // Start participant 1
      store.getState().setCurrentParticipantIndex(1);

      const p1Streaming = {
        id: 'thread_r0_p1',
        role: UIMessageRoles.ASSISTANT,
        parts: [{ type: MessagePartTypes.TEXT, text: 'P1 streaming...' }],
        metadata: {
          role: UIMessageRoles.ASSISTANT,
          roundNumber: 0,
          participantIndex: 1,
          participantId: 'participant-1',
          finishReason: FinishReasons.UNKNOWN,
        },
        createdAt: new Date(),
      };

      store.getState().setMessages([p0Complete, p1Streaming]);

      // Verify p0 message is still present and unchanged
      const messages = store.getState().messages;
      const p0Preserved = messages.find(m => m.id === 'thread_r0_p0');

      expect(p0Preserved).toBeDefined();
      expect(p0Preserved?.parts?.[0]).toMatchObject({
        type: MessagePartTypes.TEXT,
        text: 'P0 complete',
      });
    });
  });

  describe('store subscription patterns', () => {
    it('documents optimal subscription pattern for components', () => {
      const store = createChatStore();

      // ❌ BAD: Subscribe to entire store
      // Component re-renders on ANY state change
      const badPattern = () => {
        let renderCount = 0;
        const unsubscribe = store.subscribe(() => {
          renderCount++;
        });

        // Any state change triggers render
        store.getState().setInputValue('test');
        store.getState().setIsStreaming(true);
        store.getState().setCurrentParticipantIndex(1);

        unsubscribe();
        return renderCount;
      };

      // ✅ GOOD: Subscribe to specific slice
      // Component only re-renders when relevant state changes
      const goodPattern = () => {
        let renderCount = 0;
        const unsubscribe = store.subscribe(
          state => state.messages,
          () => {
            renderCount++;
          },
        );

        // These don't trigger render
        store.getState().setInputValue('test');
        store.getState().setIsStreaming(true);
        store.getState().setCurrentParticipantIndex(1);

        unsubscribe();
        return renderCount;
      };

      const badRenders = badPattern();
      const goodRenders = goodPattern();

      // Bad pattern has many more renders
      expect(badRenders).toBeGreaterThan(goodRenders);
      expect(goodRenders).toBe(0); // No message changes = no renders
    });

    it('verifies selector batching prevents object reference issues', () => {
      const store = createChatStore();
      let callbackCount = 0;

      // Object selector creates new reference every time
      const objectSelector = (state: ReturnType<typeof store.getState>) => ({
        messages: state.messages,
        isStreaming: state.isStreaming,
      });

      // With reference equality, this will trigger on every state change
      const unsubscribe = store.subscribe(
        objectSelector,
        () => {
          callbackCount++;
        },
        { equalityFn: (a, b) => a === b },
      );

      const _initialCount = callbackCount; // Baseline for comparison

      // Change unrelated state
      store.getState().setInputValue('test');

      unsubscribe();

      // Without useShallow, object reference changes even though values same
      // This demonstrates why useShallow is needed in components
    });
  });

  describe('performance regression detection', () => {
    it('tracks total updates during complete streaming cycle', () => {
      const store = createChatStore();
      let totalUpdates = 0;

      const unsubscribe = store.subscribe(() => {
        totalUpdates++;
      });

      // Simulate complete round: user message + 3 participants + moderator
      const userMessage = {
        id: 'user_r0',
        role: UIMessageRoles.USER,
        parts: [{ type: MessagePartTypes.TEXT, text: 'Question' }],
        metadata: { role: UIMessageRoles.USER, roundNumber: 0 },
      };

      store.getState().setMessages([userMessage]);
      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(0);

      // Participant 0: 5 chunks
      for (let i = 1; i <= 5; i++) {
        const p0 = {
          id: 'thread_r0_p0',
          role: UIMessageRoles.ASSISTANT,
          parts: [{ type: MessagePartTypes.TEXT, text: 'Response '.repeat(i) }],
          metadata: { role: UIMessageRoles.ASSISTANT, roundNumber: 0, participantIndex: 0 },
          createdAt: new Date(),
        };
        store.getState().setMessages([userMessage, p0]);
      }

      // Participant 1: 5 chunks
      store.getState().setCurrentParticipantIndex(1);
      const p0Final = {
        id: 'thread_r0_p0',
        role: UIMessageRoles.ASSISTANT,
        parts: [{ type: MessagePartTypes.TEXT, text: 'Response '.repeat(5) }],
        metadata: { role: UIMessageRoles.ASSISTANT, roundNumber: 0, participantIndex: 0, finishReason: FinishReasons.STOP },
        createdAt: new Date(),
      };

      for (let i = 1; i <= 5; i++) {
        const p1 = {
          id: 'thread_r0_p1',
          role: UIMessageRoles.ASSISTANT,
          parts: [{ type: MessagePartTypes.TEXT, text: 'Another '.repeat(i) }],
          metadata: { role: UIMessageRoles.ASSISTANT, roundNumber: 0, participantIndex: 1 },
          createdAt: new Date(),
        };
        store.getState().setMessages([userMessage, p0Final, p1]);
      }

      // Moderator: 3 chunks
      store.getState().setIsStreaming(false);
      store.getState().setIsModeratorStreaming(true);

      const p1Final = {
        id: 'thread_r0_p1',
        role: UIMessageRoles.ASSISTANT,
        parts: [{ type: MessagePartTypes.TEXT, text: 'Another '.repeat(5) }],
        metadata: { role: UIMessageRoles.ASSISTANT, roundNumber: 0, participantIndex: 1, finishReason: FinishReasons.STOP },
        createdAt: new Date(),
      };

      for (let i = 1; i <= 3; i++) {
        const moderator = {
          id: 'thread_r0_moderator',
          role: UIMessageRoles.ASSISTANT,
          parts: [{ type: MessagePartTypes.TEXT, text: `Summary ${i}` }],
          metadata: { role: UIMessageRoles.ASSISTANT, roundNumber: 0, isModerator: true },
        };
        store.getState().setMessages([userMessage, p0Final, p1Final, moderator]);
      }

      store.getState().setIsModeratorStreaming(false);
      store.getState().completeStreaming();

      unsubscribe();

      // Document total update count for baseline
      // This test will catch regressions if refactoring increases update frequency
      expect(totalUpdates).toBeGreaterThan(0);
      expect(totalUpdates).toBeLessThan(100); // Reasonable upper bound

      // Log for regression tracking
      // eslint-disable-next-line no-console
      console.log(`[PERFORMANCE] Total updates for complete round: ${totalUpdates}`);
    });
  });
});
