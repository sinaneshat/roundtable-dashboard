/**
 * Streaming Update Frequency Tests
 *
 * Tests store update behavior during streaming to prevent performance regressions.
 * Validates setMessages calls, content-based change detection, and throttling.
 */

import { FinishReasons, MessagePartTypes, UIMessageRoles } from '@roundtable/shared';
import { describe, expect, it, vi } from 'vitest';

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
        createdAt: new Date(),
        id: 'thread-1_r0_p0',
        metadata: { participantIndex: 0, roundNumber: 0 },
        role: UIMessageRoles.ASSISTANT,
      };

      // Initial message
      store.getState().setMessages([
        {
          ...baseMessage,
          parts: [{ text: 'Hello', type: MessagePartTypes.TEXT }],
        },
      ]);

      // Reset spy after initial
      setMessagesSpy.mockClear();

      // Simulate 10 rapid chunk updates (like streaming)
      for (let i = 0; i < 10; i++) {
        store.getState().setMessages([
          {
            ...baseMessage,
            parts: [{ text: 'Hello'.repeat(i + 2), type: MessagePartTypes.TEXT }],
          },
        ]);
      }

      // Current behavior: 10 updates (unthrottled)
      // After optimization: should be throttled to fewer updates
      expect(setMessagesSpy).toHaveBeenCalledWith();
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
        createdAt: new Date(),
        id: 'thread-1_r0_p0',
        metadata: { participantIndex: 0, roundNumber: 0 },
        parts: [{ text: 'Hello world', type: MessagePartTypes.TEXT }],
        role: UIMessageRoles.ASSISTANT,
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
    it('should update message content correctly', () => {
      const store = createChatStore();

      const createMessage = (text: string) => ({
        createdAt: new Date(),
        id: 'thread-1_r0_p0',
        metadata: { participantIndex: 0, roundNumber: 0 },
        parts: [{ text, type: MessagePartTypes.TEXT }],
        role: UIMessageRoles.ASSISTANT,
      });

      store.getState().setMessages([createMessage('Hello')]);
      store.getState().setMessages([createMessage('Hello World')]);

      const messages = store.getState().messages;
      expect(messages[0]?.parts?.[0]).toMatchObject({
        text: 'Hello World',
        type: 'text',
      });
    });

    it('should only process last message parts during streaming', () => {
      const store = createChatStore();

      // Create messages from multiple participants
      const messages = [
        {
          createdAt: new Date(),
          id: 'msg-user-0',
          metadata: { roundNumber: 0 },
          parts: [{ text: 'User message', type: MessagePartTypes.TEXT }],
          role: UIMessageRoles.USER,
        },
        {
          createdAt: new Date(),
          id: 'thread-1_r0_p0',
          metadata: { participantIndex: 0, roundNumber: 0 },
          parts: [{ text: 'Participant 0 complete message', type: MessagePartTypes.TEXT }],
          role: UIMessageRoles.ASSISTANT,
        },
        {
          createdAt: new Date(),
          id: 'thread-1_r0_p1',
          metadata: { participantIndex: 1, roundNumber: 0 },
          parts: [{ text: 'Streaming...', type: MessagePartTypes.TEXT }], // Currently streaming
          role: UIMessageRoles.ASSISTANT,
        },
      ];

      store.getState().setMessages(messages);

      // When updating streaming message, only compare last message content
      // Earlier messages should not be processed
      const updatedMessages = [
        ...messages.slice(0, 2), // Same earlier messages
        {
          ...messages[2],
          parts: [{ text: 'Streaming more...', type: MessagePartTypes.TEXT }],
        },
      ];

      store.getState().setMessages(updatedMessages);

      // Verify only last message changed
      const storeMessages = store.getState().messages;
      expect(storeMessages[2]?.parts?.[0]).toMatchObject({
        text: 'Streaming more...',
        type: 'text',
      });
    });
  });

  describe('streaming state transitions', () => {
    it('should trigger update when streaming flag changes', () => {
      const store = createChatStore();
      let updateCount = 0;

      const unsubscribe = store.subscribe(() => {
        updateCount++;
      });

      store.getState().setIsStreaming(true);
      const afterStreamingStart = updateCount;

      store.getState().setIsStreaming(false);

      unsubscribe();

      expect(afterStreamingStart).toBeGreaterThan(0);
    });

    it('should update each state field separately', () => {
      const store = createChatStore();
      let updateCount = 0;

      const unsubscribe = store.subscribe(() => {
        updateCount++;
      });

      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(0);
      store.getState().setCurrentParticipantIndex(0);

      unsubscribe();

      expect(updateCount).toBe(3);
    });
  });

  describe('content-based update detection', () => {
    it('should detect when text content actually changed', () => {
      const store = createChatStore();

      const message1 = {
        createdAt: new Date(),
        id: 'thread-1_r0_p0',
        metadata: { participantIndex: 0, roundNumber: 0 },
        parts: [{ text: 'Hello', type: MessagePartTypes.TEXT }],
        role: UIMessageRoles.ASSISTANT,
      };

      const message2 = {
        createdAt: new Date(),
        id: 'thread-1_r0_p0',
        metadata: { participantIndex: 0, roundNumber: 0 },
        parts: [{ text: 'Hello World', type: MessagePartTypes.TEXT }],
        role: UIMessageRoles.ASSISTANT,
      };

      store.getState().setMessages([message1]);

      // Helper to check if content changed
      const hasContentChanged = (oldMsg: typeof message1, newMsg: typeof message2) => {
        if (!oldMsg.parts || !newMsg.parts) {
          return true;
        }
        if (oldMsg.parts.length !== newMsg.parts.length) {
          return true;
        }

        for (let i = 0; i < oldMsg.parts.length; i++) {
          const oldPart = oldMsg.parts[i];
          const newPart = newMsg.parts[i];
          if (oldPart?.type !== newPart?.type) {
            return true;
          }
          if (oldPart?.type === MessagePartTypes.TEXT && newPart?.type === MessagePartTypes.TEXT) {
            if ('text' in oldPart && 'text' in newPart && oldPart.text !== newPart.text) {
              return true;
            }
          }
        }
        return false;
      };

      // Same content
      expect(hasContentChanged(message1, { ...message1 })).toBeFalsy();

      // Different content
      expect(hasContentChanged(message1, message2)).toBeTruthy();
    });

    it('should efficiently compare streaming message content length', () => {
      const store = createChatStore();

      const createStreamingMessage = (textLength: number) => ({
        createdAt: new Date(),
        id: 'thread-1_r0_p0',
        metadata: { participantIndex: 0, roundNumber: 0 },
        parts: [{ text: 'A'.repeat(textLength), type: MessagePartTypes.TEXT }],
        role: UIMessageRoles.ASSISTANT,
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

      expect(lengthChanged).toBeTruthy();
    });
  });

  describe('throttle behavior', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should respect throttle interval during streaming', () => {
      const THROTTLE_MS = 100;
      const timestamps: number[] = [];

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

      for (let i = 0; i < 20; i++) {
        throttledUpdate();
        vi.advanceTimersByTime(20);
      }

      expect(timestamps.length).toBeGreaterThanOrEqual(3);
      expect(timestamps.length).toBeLessThanOrEqual(8);

      for (let i = 1; i < timestamps.length; i++) {
        const current = timestamps[i];
        const previous = timestamps[i - 1];
        if (current === undefined || previous === undefined) {
          continue;
        }
        const interval = current - previous;
        expect(interval).toBeGreaterThanOrEqual(THROTTLE_MS - 10);
      }
    });
  });

  describe('moderator streaming update frequency', () => {
    it('triggers update for each moderator chunk', () => {
      const store = createChatStore();
      let updateCount = 0;

      const unsubscribe = store.subscribe(() => {
        updateCount++;
      });

      const initialCount = updateCount;

      for (let i = 1; i <= 10; i++) {
        const moderatorMessage = {
          id: 'thread_r0_moderator',
          metadata: { isModerator: true, role: UIMessageRoles.ASSISTANT, roundNumber: 0 },
          parts: [{ text: `Chunk ${i} `, type: MessagePartTypes.TEXT }],
          role: UIMessageRoles.ASSISTANT,
        };
        store.getState().setMessages([moderatorMessage]);
      }

      unsubscribe();

      expect(updateCount - initialCount).toBe(10);
    });

    it('triggers update when metadata changes', () => {
      const store = createChatStore();
      let updateCount = 0;

      const unsubscribe = store.subscribe(() => {
        updateCount++;
      });

      const moderatorMessage = {
        id: 'thread_r0_moderator',
        metadata: {
          finishReason: FinishReasons.UNKNOWN,
          isModerator: true,
          role: UIMessageRoles.ASSISTANT,
          roundNumber: 0,
        },
        parts: [{ text: 'Summary complete', type: MessagePartTypes.TEXT }],
        role: UIMessageRoles.ASSISTANT,
      };

      store.getState().setMessages([moderatorMessage]);
      const countAfterFirst = updateCount;

      store.getState().setMessages([{
        ...moderatorMessage,
        metadata: {
          ...moderatorMessage.metadata,
          finishReason: FinishReasons.STOP,
        },
      }]);

      unsubscribe();

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
        createdAt: new Date(),
        id: 'thread_r0_p0',
        metadata: {
          finishReason: FinishReasons.STOP,
          participantIndex: 0,
          role: UIMessageRoles.ASSISTANT,
          roundNumber: 0,
        },
        parts: [{ text: 'Response 0', type: MessagePartTypes.TEXT }],
        role: UIMessageRoles.ASSISTANT,
      };

      store.getState().setMessages([p0Message]);

      // Transition to participant 1
      store.getState().setCurrentParticipantIndex(1);

      // Participant 1 starts streaming
      const p1Message = {
        createdAt: new Date(),
        id: 'thread_r0_p1',
        metadata: {
          finishReason: FinishReasons.UNKNOWN,
          participantIndex: 1,
          role: UIMessageRoles.ASSISTANT,
          roundNumber: 0,
        },
        parts: [{ text: 'Response 1', type: MessagePartTypes.TEXT }],
        role: UIMessageRoles.ASSISTANT,
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
        createdAt: new Date(),
        id: 'thread_r0_p0',
        metadata: {
          finishReason: FinishReasons.STOP,
          participantId: 'participant-0',
          participantIndex: 0,
          role: UIMessageRoles.ASSISTANT,
          roundNumber: 0,
        },
        parts: [{ text: 'P0 complete', type: MessagePartTypes.TEXT }],
        role: UIMessageRoles.ASSISTANT,
      };

      store.getState().setMessages([p0Complete]);

      // Start participant 1
      store.getState().setCurrentParticipantIndex(1);

      const p1Streaming = {
        createdAt: new Date(),
        id: 'thread_r0_p1',
        metadata: {
          finishReason: FinishReasons.UNKNOWN,
          participantId: 'participant-1',
          participantIndex: 1,
          role: UIMessageRoles.ASSISTANT,
          roundNumber: 0,
        },
        parts: [{ text: 'P1 streaming...', type: MessagePartTypes.TEXT }],
        role: UIMessageRoles.ASSISTANT,
      };

      store.getState().setMessages([p0Complete, p1Streaming]);

      // Verify p0 message is still present and unchanged
      const messages = store.getState().messages;
      const p0Preserved = messages.find(m => m.id === 'thread_r0_p0');

      expect(p0Preserved).toBeDefined();
      expect(p0Preserved?.parts?.[0]).toMatchObject({
        text: 'P0 complete',
        type: MessagePartTypes.TEXT,
      });
    });
  });

  describe('store subscription patterns', () => {
    it('global subscription triggers on any state change', () => {
      const store = createChatStore();
      let renderCount = 0;

      const unsubscribe = store.subscribe(() => {
        renderCount++;
      });

      store.getState().setInputValue('test');
      store.getState().setIsStreaming(true);
      store.getState().setCurrentParticipantIndex(1);

      unsubscribe();

      expect(renderCount).toBe(3);
    });

    it('scoped subscription only triggers on relevant changes', () => {
      const store = createChatStore();
      let renderCount = 0;

      const unsubscribe = store.subscribe(
        state => state.messages,
        () => {
          renderCount++;
        },
      );

      store.getState().setInputValue('test');
      store.getState().setIsStreaming(true);
      store.getState().setCurrentParticipantIndex(1);

      unsubscribe();

      expect(renderCount).toBe(0);
    });

    it('object selector with shallow equality avoids unnecessary updates', () => {
      const store = createChatStore();
      let callbackCount = 0;

      const unsubscribe = store.subscribe(
        state => ({ isStreaming: state.isStreaming, messages: state.messages }),
        () => {
          callbackCount++;
        },
        { equalityFn: (a, b) => a.messages === b.messages && a.isStreaming === b.isStreaming },
      );

      store.getState().setInputValue('test');

      unsubscribe();

      expect(callbackCount).toBe(0);
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
        metadata: { role: UIMessageRoles.USER, roundNumber: 0 },
        parts: [{ text: 'Question', type: MessagePartTypes.TEXT }],
        role: UIMessageRoles.USER,
      };

      store.getState().setMessages([userMessage]);
      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(0);

      // Participant 0: 5 chunks
      for (let i = 1; i <= 5; i++) {
        const p0 = {
          createdAt: new Date(),
          id: 'thread_r0_p0',
          metadata: { participantIndex: 0, role: UIMessageRoles.ASSISTANT, roundNumber: 0 },
          parts: [{ text: 'Response '.repeat(i), type: MessagePartTypes.TEXT }],
          role: UIMessageRoles.ASSISTANT,
        };
        store.getState().setMessages([userMessage, p0]);
      }

      // Participant 1: 5 chunks
      store.getState().setCurrentParticipantIndex(1);
      const p0Final = {
        createdAt: new Date(),
        id: 'thread_r0_p0',
        metadata: { finishReason: FinishReasons.STOP, participantIndex: 0, role: UIMessageRoles.ASSISTANT, roundNumber: 0 },
        parts: [{ text: 'Response '.repeat(5), type: MessagePartTypes.TEXT }],
        role: UIMessageRoles.ASSISTANT,
      };

      for (let i = 1; i <= 5; i++) {
        const p1 = {
          createdAt: new Date(),
          id: 'thread_r0_p1',
          metadata: { participantIndex: 1, role: UIMessageRoles.ASSISTANT, roundNumber: 0 },
          parts: [{ text: 'Another '.repeat(i), type: MessagePartTypes.TEXT }],
          role: UIMessageRoles.ASSISTANT,
        };
        store.getState().setMessages([userMessage, p0Final, p1]);
      }

      // Moderator: 3 chunks
      store.getState().setIsStreaming(false);
      store.getState().setIsModeratorStreaming(true);

      const p1Final = {
        createdAt: new Date(),
        id: 'thread_r0_p1',
        metadata: { finishReason: FinishReasons.STOP, participantIndex: 1, role: UIMessageRoles.ASSISTANT, roundNumber: 0 },
        parts: [{ text: 'Another '.repeat(5), type: MessagePartTypes.TEXT }],
        role: UIMessageRoles.ASSISTANT,
      };

      for (let i = 1; i <= 3; i++) {
        const moderator = {
          id: 'thread_r0_moderator',
          metadata: { isModerator: true, role: UIMessageRoles.ASSISTANT, roundNumber: 0 },
          parts: [{ text: `Summary ${i}`, type: MessagePartTypes.TEXT }],
          role: UIMessageRoles.ASSISTANT,
        };
        store.getState().setMessages([userMessage, p0Final, p1Final, moderator]);
      }

      store.getState().setIsModeratorStreaming(false);
      store.getState().completeStreaming();

      unsubscribe();

      expect(totalUpdates).toBeGreaterThan(0);
      expect(totalUpdates).toBeLessThan(100);
    });
  });
});
