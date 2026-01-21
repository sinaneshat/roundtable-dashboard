import { MessageRoles } from '@roundtable/shared';
import { describe, expect, it } from 'vitest';

/**
 * Optimistic Update and Replacement Tests
 *
 * Tests the lifecycle of optimistic messages:
 * - Initial optimistic message creation
 * - Replacement with server-confirmed messages
 * - Handling of failed optimistic updates
 * - Edge cases in replacement logic
 * - UI consistency during transitions
 */

// Types for optimistic message handling
type BaseMessage = {
  id: string;
  role: typeof MessageRoles[keyof typeof MessageRoles] | 'system';
  content: string;
  createdAt: Date;
};

type OptimisticMessage = {
  isOptimistic: true;
  tempId: string;
  status: 'pending' | 'sending' | 'failed';
} & BaseMessage;

type ConfirmedMessage = {
  isOptimistic: false;
  serverId: string;
  threadId: string;
  roundNumber: number;
} & BaseMessage;

type UIMessage = OptimisticMessage | ConfirmedMessage;

type _MessageStore = {
  messages: UIMessage[];
  pendingOptimisticIds: Set<string>;
  failedOptimisticIds: Set<string>;
};

// Helper functions for optimistic message handling
function createOptimisticMessage(content: string, tempId: string): OptimisticMessage {
  return {
    id: tempId,
    tempId,
    role: MessageRoles.USER,
    content,
    createdAt: new Date(),
    isOptimistic: true,
    status: 'pending',
  };
}

function createConfirmedMessage(
  content: string,
  serverId: string,
  threadId: string,
  roundNumber: number,
): ConfirmedMessage {
  return {
    id: serverId,
    serverId,
    role: MessageRoles.USER,
    content,
    createdAt: new Date(),
    isOptimistic: false,
    threadId,
    roundNumber,
  };
}

function replaceOptimisticMessage(
  messages: UIMessage[],
  tempId: string,
  confirmedMessage: ConfirmedMessage,
): UIMessage[] {
  const index = messages.findIndex(
    m => m.isOptimistic && (m as OptimisticMessage).tempId === tempId,
  );

  if (index === -1) {
    // Optimistic not found, append confirmed
    return [...messages, confirmedMessage];
  }

  // Replace optimistic with confirmed
  const newMessages = [...messages];
  newMessages[index] = confirmedMessage;
  return newMessages;
}

function markOptimisticFailed(
  messages: UIMessage[],
  tempId: string,
): UIMessage[] {
  return messages.map((m) => {
    if (m.isOptimistic && (m as OptimisticMessage).tempId === tempId) {
      return { ...m, status: 'failed' } as OptimisticMessage;
    }
    return m;
  });
}

function removeOptimisticMessage(messages: UIMessage[], tempId: string): UIMessage[] {
  return messages.filter(
    m => !(m.isOptimistic && (m as OptimisticMessage).tempId === tempId),
  );
}

function getOptimisticMessages(messages: UIMessage[]): OptimisticMessage[] {
  return messages.filter(m => m.isOptimistic) as OptimisticMessage[];
}

function hasOptimisticMessage(messages: UIMessage[], tempId: string): boolean {
  return messages.some(
    m => m.isOptimistic && (m as OptimisticMessage).tempId === tempId,
  );
}

function isMessageOptimistic(message: UIMessage): message is OptimisticMessage {
  return message.isOptimistic === true;
}

describe('optimistic Update and Replacement', () => {
  describe('optimistic Message Creation', () => {
    it('should create optimistic message with pending status', () => {
      const tempId = 'temp-123';
      const content = 'User question';

      const optimistic = createOptimisticMessage(content, tempId);

      expect(optimistic.isOptimistic).toBe(true);
      expect(optimistic.tempId).toBe(tempId);
      expect(optimistic.id).toBe(tempId);
      expect(optimistic.content).toBe(content);
      expect(optimistic.status).toBe('pending');
      expect(optimistic.role).toBe(MessageRoles.USER);
    });

    it('should generate unique tempIds', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        const id = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        ids.add(id);
      }

      expect(ids.size).toBe(100); // All unique
    });

    it('should preserve creation timestamp', () => {
      const before = new Date();
      const optimistic = createOptimisticMessage('test', 'temp-1');
      const after = new Date();

      expect(optimistic.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(optimistic.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('optimistic to Confirmed Replacement', () => {
    it('should replace optimistic message at same position', () => {
      const tempId = 'temp-123';
      const messages: UIMessage[] = [
        createConfirmedMessage('Previous message', 'srv-1', 'thread-1', 0),
        createOptimisticMessage('User question', tempId),
      ];

      const confirmed = createConfirmedMessage('User question', 'srv-2', 'thread-1', 0);
      const result = replaceOptimisticMessage(messages, tempId, confirmed);

      expect(result).toHaveLength(2);
      expect(result[1].id).toBe('srv-2');
      expect((result[1] as ConfirmedMessage).serverId).toBe('srv-2');
      expect(result[1].isOptimistic).toBe(false);
    });

    it('should maintain message order after replacement', () => {
      const tempId = 'temp-middle';
      const messages: UIMessage[] = [
        createConfirmedMessage('First', 'srv-1', 'thread-1', 0),
        createOptimisticMessage('Middle', tempId),
        createConfirmedMessage('Last', 'srv-3', 'thread-1', 0),
      ];

      const confirmed = createConfirmedMessage('Middle', 'srv-2', 'thread-1', 0);
      const result = replaceOptimisticMessage(messages, tempId, confirmed);

      expect(result).toHaveLength(3);
      expect(result[0].id).toBe('srv-1');
      expect(result[1].id).toBe('srv-2');
      expect(result[2].id).toBe('srv-3');
    });

    it('should append if optimistic not found', () => {
      const messages: UIMessage[] = [
        createConfirmedMessage('Existing', 'srv-1', 'thread-1', 0),
      ];

      const confirmed = createConfirmedMessage('New', 'srv-2', 'thread-1', 0);
      const result = replaceOptimisticMessage(messages, 'non-existent-temp', confirmed);

      expect(result).toHaveLength(2);
      expect(result[1].id).toBe('srv-2');
    });

    it('should handle empty messages array', () => {
      const confirmed = createConfirmedMessage('First message', 'srv-1', 'thread-1', 0);
      const result = replaceOptimisticMessage([], 'temp-123', confirmed);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('srv-1');
    });
  });

  describe('failed Optimistic Updates', () => {
    it('should mark optimistic message as failed', () => {
      const tempId = 'temp-fail';
      const messages: UIMessage[] = [
        createOptimisticMessage('Will fail', tempId),
      ];

      const result = markOptimisticFailed(messages, tempId);

      expect(result).toHaveLength(1);
      expect((result[0] as OptimisticMessage).status).toBe('failed');
    });

    it('should only mark specified message as failed', () => {
      const messages: UIMessage[] = [
        createOptimisticMessage('First', 'temp-1'),
        createOptimisticMessage('Second', 'temp-2'),
        createOptimisticMessage('Third', 'temp-3'),
      ];

      const result = markOptimisticFailed(messages, 'temp-2');

      expect((result[0] as OptimisticMessage).status).toBe('pending');
      expect((result[1] as OptimisticMessage).status).toBe('failed');
      expect((result[2] as OptimisticMessage).status).toBe('pending');
    });

    it('should handle non-existent tempId gracefully', () => {
      const messages: UIMessage[] = [
        createOptimisticMessage('Test', 'temp-1'),
      ];

      const result = markOptimisticFailed(messages, 'non-existent');

      expect(result).toHaveLength(1);
      expect((result[0] as OptimisticMessage).status).toBe('pending');
    });

    it('should not modify confirmed messages', () => {
      const messages: UIMessage[] = [
        createConfirmedMessage('Confirmed', 'srv-1', 'thread-1', 0),
        createOptimisticMessage('Optimistic', 'temp-1'),
      ];

      const result = markOptimisticFailed(messages, 'temp-1');

      expect(result[0].isOptimistic).toBe(false);
      expect((result[1] as OptimisticMessage).status).toBe('failed');
    });
  });

  describe('optimistic Message Removal', () => {
    it('should remove optimistic message by tempId', () => {
      const messages: UIMessage[] = [
        createConfirmedMessage('Keep', 'srv-1', 'thread-1', 0),
        createOptimisticMessage('Remove', 'temp-remove'),
        createConfirmedMessage('Also keep', 'srv-2', 'thread-1', 0),
      ];

      const result = removeOptimisticMessage(messages, 'temp-remove');

      expect(result).toHaveLength(2);
      expect(result.map(m => m.id)).toEqual(['srv-1', 'srv-2']);
    });

    it('should not affect confirmed messages with same id', () => {
      // Edge case: what if a confirmed message somehow has same id pattern?
      const messages: UIMessage[] = [
        createConfirmedMessage('Confirmed', 'temp-123', 'thread-1', 0), // Server ID happens to be temp-123
        createOptimisticMessage('Optimistic', 'temp-123'),
      ];

      const result = removeOptimisticMessage(messages, 'temp-123');

      // Should only remove the optimistic one
      expect(result).toHaveLength(1);
      expect(result[0].isOptimistic).toBe(false);
    });

    it('should handle multiple optimistic messages', () => {
      const messages: UIMessage[] = [
        createOptimisticMessage('First', 'temp-1'),
        createOptimisticMessage('Second', 'temp-2'),
        createOptimisticMessage('Third', 'temp-3'),
      ];

      const result = removeOptimisticMessage(messages, 'temp-2');

      expect(result).toHaveLength(2);
      expect(result.map(m => m.id)).toEqual(['temp-1', 'temp-3']);
    });
  });

  describe('optimistic Message Queries', () => {
    it('should get all optimistic messages', () => {
      const messages: UIMessage[] = [
        createConfirmedMessage('Confirmed 1', 'srv-1', 'thread-1', 0),
        createOptimisticMessage('Optimistic 1', 'temp-1'),
        createConfirmedMessage('Confirmed 2', 'srv-2', 'thread-1', 0),
        createOptimisticMessage('Optimistic 2', 'temp-2'),
      ];

      const optimistics = getOptimisticMessages(messages);

      expect(optimistics).toHaveLength(2);
      expect(optimistics.every(m => m.isOptimistic)).toBe(true);
      expect(optimistics.map(m => m.tempId)).toEqual(['temp-1', 'temp-2']);
    });

    it('should return empty array when no optimistic messages', () => {
      const messages: UIMessage[] = [
        createConfirmedMessage('Confirmed 1', 'srv-1', 'thread-1', 0),
        createConfirmedMessage('Confirmed 2', 'srv-2', 'thread-1', 0),
      ];

      const optimistics = getOptimisticMessages(messages);

      expect(optimistics).toHaveLength(0);
    });

    it('should check if optimistic message exists', () => {
      const messages: UIMessage[] = [
        createOptimisticMessage('Test', 'temp-exists'),
      ];

      expect(hasOptimisticMessage(messages, 'temp-exists')).toBe(true);
      expect(hasOptimisticMessage(messages, 'temp-not-exists')).toBe(false);
    });

    it('should correctly identify optimistic messages with type guard', () => {
      const optimistic = createOptimisticMessage('Test', 'temp-1');
      const confirmed = createConfirmedMessage('Test', 'srv-1', 'thread-1', 0);

      expect(isMessageOptimistic(optimistic)).toBe(true);
      expect(isMessageOptimistic(confirmed)).toBe(false);
    });
  });

  describe('concurrent Optimistic Operations', () => {
    it('should handle rapid sequential submissions', () => {
      let messages: UIMessage[] = [];

      // Simulate rapid submissions
      for (let i = 0; i < 5; i++) {
        const tempId = `temp-rapid-${i}`;
        const optimistic = createOptimisticMessage(`Message ${i}`, tempId);
        messages = [...messages, optimistic];
      }

      expect(messages).toHaveLength(5);
      expect(getOptimisticMessages(messages)).toHaveLength(5);

      // Confirm them in reverse order (simulating network variance)
      for (let i = 4; i >= 0; i--) {
        const tempId = `temp-rapid-${i}`;
        const confirmed = createConfirmedMessage(`Message ${i}`, `srv-${i}`, 'thread-1', 0);
        messages = replaceOptimisticMessage(messages, tempId, confirmed);
      }

      expect(messages).toHaveLength(5);
      expect(getOptimisticMessages(messages)).toHaveLength(0);
    });

    it('should handle interleaved confirms and new submissions', () => {
      let messages: UIMessage[] = [];

      // Submit first
      messages = [...messages, createOptimisticMessage('First', 'temp-1')];

      // Confirm first while submitting second
      const confirmed1 = createConfirmedMessage('First', 'srv-1', 'thread-1', 0);
      messages = replaceOptimisticMessage(messages, 'temp-1', confirmed1);
      messages = [...messages, createOptimisticMessage('Second', 'temp-2')];

      expect(messages).toHaveLength(2);
      expect(messages[0].isOptimistic).toBe(false);
      expect(messages[1].isOptimistic).toBe(true);

      // Submit third while confirming second
      messages = [...messages, createOptimisticMessage('Third', 'temp-3')];
      const confirmed2 = createConfirmedMessage('Second', 'srv-2', 'thread-1', 0);
      messages = replaceOptimisticMessage(messages, 'temp-2', confirmed2);

      expect(messages).toHaveLength(3);
      expect(messages[1].isOptimistic).toBe(false);
      expect(messages[2].isOptimistic).toBe(true);
    });
  });

  describe('optimistic UI States', () => {
    type OptimisticUIState = {
      isSubmitting: boolean;
      hasPendingOptimistic: boolean;
      hasFailedOptimistic: boolean;
      pendingCount: number;
      failedCount: number;
    };

    function computeUIState(messages: UIMessage[]): OptimisticUIState {
      const optimistics = getOptimisticMessages(messages);
      const pending = optimistics.filter(m => m.status === 'pending' || m.status === 'sending');
      const failed = optimistics.filter(m => m.status === 'failed');

      return {
        isSubmitting: pending.length > 0,
        hasPendingOptimistic: pending.length > 0,
        hasFailedOptimistic: failed.length > 0,
        pendingCount: pending.length,
        failedCount: failed.length,
      };
    }

    it('should show submitting state with pending optimistic', () => {
      const messages: UIMessage[] = [
        createOptimisticMessage('Sending...', 'temp-1'),
      ];

      const state = computeUIState(messages);

      expect(state.isSubmitting).toBe(true);
      expect(state.hasPendingOptimistic).toBe(true);
      expect(state.pendingCount).toBe(1);
    });

    it('should show failed state with failed optimistic', () => {
      let messages: UIMessage[] = [
        createOptimisticMessage('Will fail', 'temp-1'),
      ];
      messages = markOptimisticFailed(messages, 'temp-1');

      const state = computeUIState(messages);

      expect(state.isSubmitting).toBe(false);
      expect(state.hasFailedOptimistic).toBe(true);
      expect(state.failedCount).toBe(1);
    });

    it('should show mixed state with pending and failed', () => {
      let messages: UIMessage[] = [
        createOptimisticMessage('Pending', 'temp-1'),
        createOptimisticMessage('Failed', 'temp-2'),
      ];
      messages = markOptimisticFailed(messages, 'temp-2');

      const state = computeUIState(messages);

      expect(state.isSubmitting).toBe(true);
      expect(state.hasPendingOptimistic).toBe(true);
      expect(state.hasFailedOptimistic).toBe(true);
      expect(state.pendingCount).toBe(1);
      expect(state.failedCount).toBe(1);
    });

    it('should clear all states when confirmed', () => {
      let messages: UIMessage[] = [
        createOptimisticMessage('Test', 'temp-1'),
      ];

      const confirmed = createConfirmedMessage('Test', 'srv-1', 'thread-1', 0);
      messages = replaceOptimisticMessage(messages, 'temp-1', confirmed);

      const state = computeUIState(messages);

      expect(state.isSubmitting).toBe(false);
      expect(state.hasPendingOptimistic).toBe(false);
      expect(state.hasFailedOptimistic).toBe(false);
    });
  });

  describe('retry Failed Optimistic', () => {
    function retryOptimisticMessage(
      messages: UIMessage[],
      tempId: string,
      newTempId: string,
    ): { messages: UIMessage[]; retryMessage: OptimisticMessage | null } {
      const failedIndex = messages.findIndex(
        m =>
          m.isOptimistic
          && (m as OptimisticMessage).tempId === tempId
          && (m as OptimisticMessage).status === 'failed',
      );

      if (failedIndex === -1) {
        return { messages, retryMessage: null };
      }

      const failed = messages[failedIndex] as OptimisticMessage;
      const retryMessage: OptimisticMessage = {
        ...failed,
        id: newTempId,
        tempId: newTempId,
        status: 'pending',
        createdAt: new Date(),
      };

      const newMessages = [...messages];
      newMessages[failedIndex] = retryMessage;

      return { messages: newMessages, retryMessage };
    }

    it('should retry failed optimistic with new tempId', () => {
      let messages: UIMessage[] = [
        createOptimisticMessage('Retry me', 'temp-original'),
      ];
      messages = markOptimisticFailed(messages, 'temp-original');

      const { messages: result, retryMessage } = retryOptimisticMessage(
        messages,
        'temp-original',
        'temp-retry',
      );

      expect(result).toHaveLength(1);
      expect(retryMessage).not.toBeNull();
      expect(retryMessage?.tempId).toBe('temp-retry');
      expect(retryMessage?.status).toBe('pending');
    });

    it('should not retry non-failed messages', () => {
      const messages: UIMessage[] = [
        createOptimisticMessage('Not failed', 'temp-1'),
      ];

      const { retryMessage } = retryOptimisticMessage(messages, 'temp-1', 'temp-retry');

      expect(retryMessage).toBeNull();
    });

    it('should preserve message content on retry', () => {
      let messages: UIMessage[] = [
        createOptimisticMessage('Important content', 'temp-1'),
      ];
      messages = markOptimisticFailed(messages, 'temp-1');

      const { retryMessage } = retryOptimisticMessage(messages, 'temp-1', 'temp-2');

      expect(retryMessage?.content).toBe('Important content');
    });
  });

  describe('message Content Mismatch Handling', () => {
    it('should handle server returning modified content', () => {
      const messages: UIMessage[] = [
        createOptimisticMessage('original content', 'temp-1'),
      ];

      // Server might sanitize/modify content
      const confirmed = createConfirmedMessage(
        'Original Content', // Capitalized by server
        'srv-1',
        'thread-1',
        0,
      );
      const result = replaceOptimisticMessage(messages, 'temp-1', confirmed);

      expect(result[0].content).toBe('Original Content');
    });

    it('should handle server truncating content', () => {
      const longContent = 'A'.repeat(10000);
      const messages: UIMessage[] = [
        createOptimisticMessage(longContent, 'temp-1'),
      ];

      const confirmed = createConfirmedMessage(
        'A'.repeat(5000), // Server truncated
        'srv-1',
        'thread-1',
        0,
      );
      const result = replaceOptimisticMessage(messages, 'temp-1', confirmed);

      expect(result[0].content).toHaveLength(5000);
    });
  });

  describe('multi-Round Optimistic Updates', () => {
    type _RoundMessage = {
      roundNumber: number;
    } & ConfirmedMessage;

    function getMessagesForRound(messages: UIMessage[], round: number): UIMessage[] {
      return messages.filter((m) => {
        if (m.isOptimistic)
          return false;
        return (m as ConfirmedMessage).roundNumber === round;
      });
    }

    it('should track optimistic per round', () => {
      const round0Messages: UIMessage[] = [
        createConfirmedMessage('R0 User', 'srv-1', 'thread-1', 0),
        createConfirmedMessage('R0 Assistant', 'srv-2', 'thread-1', 0),
      ];

      const round1Messages: UIMessage[] = [
        createOptimisticMessage('R1 User Question', 'temp-r1'),
      ];

      const allMessages = [...round0Messages, ...round1Messages];

      expect(getMessagesForRound(allMessages, 0)).toHaveLength(2);
      expect(getOptimisticMessages(allMessages)).toHaveLength(1);
    });

    it('should replace optimistic in correct round context', () => {
      let messages: UIMessage[] = [
        createConfirmedMessage('R0', 'srv-1', 'thread-1', 0),
        createOptimisticMessage('R1 User', 'temp-r1'),
      ];

      const confirmed = createConfirmedMessage('R1 User', 'srv-2', 'thread-1', 1);
      messages = replaceOptimisticMessage(messages, 'temp-r1', confirmed);

      expect(messages).toHaveLength(2);
      expect((messages[1] as ConfirmedMessage).roundNumber).toBe(1);
    });
  });

  describe('optimistic Message Ordering Edge Cases', () => {
    it('should handle out-of-order confirmations', () => {
      let messages: UIMessage[] = [
        createOptimisticMessage('First', 'temp-1'),
        createOptimisticMessage('Second', 'temp-2'),
        createOptimisticMessage('Third', 'temp-3'),
      ];

      // Confirm in order: second, first, third
      const confirmed2 = createConfirmedMessage('Second', 'srv-2', 'thread-1', 0);
      messages = replaceOptimisticMessage(messages, 'temp-2', confirmed2);

      const confirmed1 = createConfirmedMessage('First', 'srv-1', 'thread-1', 0);
      messages = replaceOptimisticMessage(messages, 'temp-1', confirmed1);

      const confirmed3 = createConfirmedMessage('Third', 'srv-3', 'thread-1', 0);
      messages = replaceOptimisticMessage(messages, 'temp-3', confirmed3);

      // Original positions should be maintained
      expect(messages[0].content).toBe('First');
      expect(messages[1].content).toBe('Second');
      expect(messages[2].content).toBe('Third');
    });

    it('should handle duplicate confirmation attempts', () => {
      let messages: UIMessage[] = [
        createOptimisticMessage('Test', 'temp-1'),
      ];

      const confirmed = createConfirmedMessage('Test', 'srv-1', 'thread-1', 0);

      // First confirmation
      messages = replaceOptimisticMessage(messages, 'temp-1', confirmed);

      // Duplicate confirmation (should append since optimistic is gone)
      const duplicate = createConfirmedMessage('Test', 'srv-1', 'thread-1', 0);
      messages = replaceOptimisticMessage(messages, 'temp-1', duplicate);

      // Should have appended the duplicate
      expect(messages).toHaveLength(2);
    });
  });

  describe('store Integration Patterns', () => {
    type MessageStoreState = {
      messages: UIMessage[];
      addOptimistic: (content: string, tempId: string) => void;
      confirmOptimistic: (tempId: string, confirmed: ConfirmedMessage) => void;
      failOptimistic: (tempId: string) => void;
      removeOptimistic: (tempId: string) => void;
    };

    function createMessageStore(): MessageStoreState {
      let messages: UIMessage[] = [];

      return {
        get messages() {
          return messages;
        },
        addOptimistic: (content: string, tempId: string) => {
          messages = [...messages, createOptimisticMessage(content, tempId)];
        },
        confirmOptimistic: (tempId: string, confirmed: ConfirmedMessage) => {
          messages = replaceOptimisticMessage(messages, tempId, confirmed);
        },
        failOptimistic: (tempId: string) => {
          messages = markOptimisticFailed(messages, tempId);
        },
        removeOptimistic: (tempId: string) => {
          messages = removeOptimisticMessage(messages, tempId);
        },
      };
    }

    it('should support full optimistic lifecycle through store', () => {
      const store = createMessageStore();

      // Add optimistic
      store.addOptimistic('Hello', 'temp-1');
      expect(store.messages).toHaveLength(1);
      expect(store.messages[0].isOptimistic).toBe(true);

      // Confirm
      const confirmed = createConfirmedMessage('Hello', 'srv-1', 'thread-1', 0);
      store.confirmOptimistic('temp-1', confirmed);
      expect(store.messages).toHaveLength(1);
      expect(store.messages[0].isOptimistic).toBe(false);
    });

    it('should support failure and retry through store', () => {
      const store = createMessageStore();

      // Add and fail
      store.addOptimistic('Will fail', 'temp-1');
      store.failOptimistic('temp-1');
      expect((store.messages[0] as OptimisticMessage).status).toBe('failed');

      // Remove and re-add (retry)
      store.removeOptimistic('temp-1');
      store.addOptimistic('Will fail', 'temp-2');
      expect(store.messages).toHaveLength(1);
      expect((store.messages[0] as OptimisticMessage).tempId).toBe('temp-2');
    });
  });

  describe('edge Cases and Error Handling', () => {
    it('should handle empty content', () => {
      const optimistic = createOptimisticMessage('', 'temp-empty');

      expect(optimistic.content).toBe('');
      expect(optimistic.isOptimistic).toBe(true);
    });

    it('should handle very long tempIds', () => {
      const longId = `temp-${'x'.repeat(1000)}`;
      const optimistic = createOptimisticMessage('Test', longId);

      expect(optimistic.tempId).toBe(longId);
    });

    it('should handle special characters in content', () => {
      const specialContent = '<script>alert("xss")</script> && || \n\t';
      const optimistic = createOptimisticMessage(specialContent, 'temp-1');

      expect(optimistic.content).toBe(specialContent);
    });

    it('should handle null-ish values safely', () => {
      const messages: UIMessage[] = [];

      // Should not throw
      const result1 = replaceOptimisticMessage(messages, '', createConfirmedMessage('', 'srv-1', 'thread-1', 0));
      const result2 = markOptimisticFailed(messages, '');
      const result3 = removeOptimisticMessage(messages, '');

      expect(result1).toHaveLength(1);
      expect(result2).toHaveLength(0);
      expect(result3).toHaveLength(0);
    });
  });
});
