/**
 * Round Regeneration - Frozen Array Fix Tests
 *
 * Tests for the structuredClone fix that prevents frozen array errors during retry.
 * Reference: use-multi-participant-chat.ts lines 2166-2170
 *
 * CRITICAL BUG FIX:
 * Messages from Zustand store are frozen by Immer middleware.
 * AI SDK's useChat requires mutable message arrays for streaming.
 * Without structuredClone, retry fails with "Cannot add property 0, object is not extensible".
 *
 * This test file validates:
 * 1. Detection of frozen/sealed message arrays
 * 2. structuredClone creates mutable copies
 * 3. AI SDK can mutate cloned messages during streaming
 * 4. Retry fails gracefully without clone (negative test)
 */

import { MessagePartTypes, MessageRoles, UIMessageRoles } from '@roundtable/shared';
import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';

// ============================================================================
// TEST HELPERS
// ============================================================================

/**
 * Creates a frozen message array (simulating Zustand/Immer behavior)
 */
function createFrozenMessage(roundNumber: number, text: string): UIMessage {
  const message: UIMessage = {
    createdAt: new Date(),
    id: `thread-1_r${roundNumber}_user`,
    metadata: {
      role: MessageRoles.USER,
      roundNumber,
    },
    parts: [{ text, type: MessagePartTypes.TEXT }],
    role: UIMessageRoles.USER,
  };

  // Freeze the message and its nested parts (like Immer does)
  Object.freeze(message);
  Object.freeze(message.parts);
  Object.freeze(message.metadata);

  return message;
}

/**
 * Simulates filtering messages for retry (removes assistant messages from round)
 */
function filterMessagesForRetry(messages: UIMessage[], roundNumber: number): UIMessage[] {
  return messages.filter((msg) => {
    const msgRoundNumber = msg.metadata?.roundNumber;
    if (msgRoundNumber !== roundNumber) {
      return true;
    }
    // Keep user messages from the round
    if (msg.metadata?.role === MessageRoles.USER) {
      return true;
    }
    // Remove all assistant messages (participants + moderator) from the round
    return false;
  });
}

/**
 * Simulates AI SDK trying to push a new part to message.parts
 * This is what happens during streaming
 */
function simulateAiSdkStreamingPush(message: UIMessage): boolean {
  try {
    // AI SDK tries to push new streaming parts
    message.parts.push({
      text: 'Streaming chunk...',
      type: MessagePartTypes.TEXT,
    });
    return true;
  } catch {
    // Frozen array will throw error
    return false;
  }
}

// ============================================================================
// FROZEN ARRAY DETECTION TESTS
// ============================================================================

describe('round Regeneration - Frozen Array Detection', () => {
  it('should detect frozen message arrays from Zustand store', () => {
    const frozenMessage = createFrozenMessage(0, 'Test');

    const isFrozen = Object.isFrozen(frozenMessage);
    const arePartsFrozen = Object.isFrozen(frozenMessage.parts);

    expect(isFrozen).toBeTruthy();
    expect(arePartsFrozen).toBeTruthy();
  });

  it('should detect sealed message arrays', () => {
    const message: UIMessage = {
      createdAt: new Date(),
      id: 'test',
      metadata: { role: MessageRoles.USER, roundNumber: 0 },
      parts: [{ text: 'Test', type: MessagePartTypes.TEXT }],
      role: UIMessageRoles.USER,
    };

    Object.seal(message);
    Object.seal(message.parts);

    const isSealed = Object.isSealed(message);
    const arePartsSealed = Object.isSealed(message.parts);

    expect(isSealed).toBeTruthy();
    expect(arePartsSealed).toBeTruthy();
  });

  it('should detect when message arrays are NOT extensible', () => {
    const frozenMessage = createFrozenMessage(0, 'Test');

    const canExtend = Object.isExtensible(frozenMessage.parts);

    expect(canExtend).toBeFalsy();
  });
});

// ============================================================================
// structuredClone BEHAVIOR TESTS
// ============================================================================

describe('round Regeneration - structuredClone Behavior', () => {
  it('should create mutable copy from frozen message', () => {
    const frozenMessage = createFrozenMessage(0, 'Test');

    // Verify original is frozen
    expect(Object.isFrozen(frozenMessage)).toBeTruthy();
    expect(Object.isFrozen(frozenMessage.parts)).toBeTruthy();

    // Clone the message
    const clonedMessage = structuredClone(frozenMessage);

    // Cloned message should NOT be frozen
    expect(Object.isFrozen(clonedMessage)).toBeFalsy();
    expect(Object.isFrozen(clonedMessage.parts)).toBeFalsy();
  });

  it('should create extensible arrays after cloning', () => {
    const frozenMessage = createFrozenMessage(0, 'Test');

    // Original is not extensible
    expect(Object.isExtensible(frozenMessage.parts)).toBeFalsy();

    // Clone and verify extensibility
    const clonedMessage = structuredClone(frozenMessage);
    expect(Object.isExtensible(clonedMessage.parts)).toBeTruthy();
  });

  it('should allow mutations on cloned message parts', () => {
    const frozenMessage = createFrozenMessage(0, 'Test');
    const clonedMessage = structuredClone(frozenMessage);

    // Should be able to push new parts
    expect(() => {
      clonedMessage.parts.push({
        text: 'New content',
        type: MessagePartTypes.TEXT,
      });
    }).not.toThrow();

    expect(clonedMessage.parts).toHaveLength(2);
  });

  it('should preserve message content after cloning', () => {
    const frozenMessage = createFrozenMessage(0, 'Original text');
    const clonedMessage = structuredClone(frozenMessage);

    // Content should match
    expect(clonedMessage.id).toBe(frozenMessage.id);
    expect(clonedMessage.role).toBe(frozenMessage.role);
    expect(clonedMessage.parts[0]?.text).toBe('Original text');
    expect(clonedMessage.metadata?.roundNumber).toBe(0);
  });

  it('should create deep copy (not shallow reference)', () => {
    const frozenMessage = createFrozenMessage(0, 'Test');
    const clonedMessage = structuredClone(frozenMessage);

    // Modifying clone should not affect original
    clonedMessage.parts.push({
      text: 'New part',
      type: MessagePartTypes.TEXT,
    });

    expect(frozenMessage.parts).toHaveLength(1);
    expect(clonedMessage.parts).toHaveLength(2);
  });
});

// ============================================================================
// AI SDK STREAMING COMPATIBILITY TESTS
// ============================================================================

describe('round Regeneration - AI SDK Streaming Compatibility', () => {
  it('should FAIL to push streaming parts to frozen messages', () => {
    const frozenMessage = createFrozenMessage(0, 'Test');

    const canPush = simulateAiSdkStreamingPush(frozenMessage);

    expect(canPush).toBeFalsy();
  });

  it('should SUCCEED pushing streaming parts to cloned messages', () => {
    const frozenMessage = createFrozenMessage(0, 'Test');
    const clonedMessage = structuredClone(frozenMessage);

    const canPush = simulateAiSdkStreamingPush(clonedMessage);

    expect(canPush).toBeTruthy();
  });

  it('should allow AI SDK to add multiple streaming chunks', () => {
    const frozenMessage = createFrozenMessage(0, 'Test');
    const clonedMessage = structuredClone(frozenMessage);

    // Simulate multiple streaming chunks
    clonedMessage.parts.push({
      text: 'Chunk 1',
      type: MessagePartTypes.TEXT,
    });
    clonedMessage.parts.push({
      text: 'Chunk 2',
      type: MessagePartTypes.TEXT,
    });
    clonedMessage.parts.push({
      text: 'Chunk 3',
      type: MessagePartTypes.TEXT,
    });

    expect(clonedMessage.parts).toHaveLength(4); // Original + 3 chunks
  });
});

// ============================================================================
// RETRY INTEGRATION TESTS
// ============================================================================

describe('round Regeneration - Retry with structuredClone', () => {
  it('should clone filtered messages before retry', () => {
    const messages: UIMessage[] = [
      createFrozenMessage(0, 'Question'),
      {
        createdAt: new Date(),
        id: 'assistant-0',
        metadata: { role: MessageRoles.ASSISTANT, roundNumber: 0 },
        parts: [{ text: 'Response', type: MessagePartTypes.TEXT }],
        role: UIMessageRoles.ASSISTANT,
      },
    ];

    // Freeze all messages (like Zustand would)
    messages.forEach((msg) => {
      Object.freeze(msg);
      Object.freeze(msg.parts);
    });

    // Filter messages for retry
    const filteredMessages = filterMessagesForRetry(messages, 0);

    // Clone the filtered messages (mimicking retry logic)
    const clonedMessages = structuredClone(filteredMessages);

    // Cloned messages should be mutable
    expect(Object.isFrozen(clonedMessages[0])).toBeFalsy();
    expect(Object.isFrozen(clonedMessages[0]?.parts)).toBeFalsy();
  });

  it('should handle retry with multiple frozen messages', () => {
    const messages: UIMessage[] = [
      createFrozenMessage(0, 'Question 1'),
      createFrozenMessage(1, 'Question 2'),
    ];

    // Filter and clone for retry on round 1
    const filteredMessages = filterMessagesForRetry(messages, 1);
    const clonedMessages = structuredClone(filteredMessages);

    // Should have 2 messages (both user messages preserved)
    expect(clonedMessages).toHaveLength(2);

    // All should be mutable
    clonedMessages.forEach((msg) => {
      expect(Object.isFrozen(msg)).toBeFalsy();
      expect(Object.isFrozen(msg.parts)).toBeFalsy();
    });
  });

  it('should preserve message order after clone', () => {
    const messages: UIMessage[] = [
      createFrozenMessage(0, 'First'),
      createFrozenMessage(1, 'Second'),
      createFrozenMessage(2, 'Third'),
    ];

    const clonedMessages = structuredClone(messages);

    expect(clonedMessages[0]?.parts[0]?.text).toBe('First');
    expect(clonedMessages[1]?.parts[0]?.text).toBe('Second');
    expect(clonedMessages[2]?.parts[0]?.text).toBe('Third');
  });

  it('should handle clone with complex nested metadata', () => {
    const complexMessage: UIMessage = {
      createdAt: new Date(),
      id: 'complex',
      metadata: {
        model: 'gpt-4',
        participantId: 'participant-0',
        participantIndex: 0,
        role: MessageRoles.ASSISTANT,
        roundNumber: 0,
        usage: { completionTokens: 50, promptTokens: 100, totalTokens: 150 },
      },
      parts: [
        { text: 'Text', type: MessagePartTypes.TEXT },
        {
          file: {
            contentType: 'application/pdf',
            name: 'test.pdf',
            size: 1024,
            url: 'https://example.com/test.pdf',
          },
          type: MessagePartTypes.FILE,
        },
      ],
      role: UIMessageRoles.ASSISTANT,
    };

    Object.freeze(complexMessage);
    Object.freeze(complexMessage.parts);
    Object.freeze(complexMessage.metadata);

    const clonedMessage = structuredClone(complexMessage);

    // Should be mutable
    expect(Object.isFrozen(clonedMessage)).toBeFalsy();
    expect(Object.isFrozen(clonedMessage.parts)).toBeFalsy();

    // Content should be preserved
    expect(clonedMessage.parts).toHaveLength(2);
    expect(clonedMessage.metadata?.participantIndex).toBe(0);
  });
});

// ============================================================================
// ERROR SIMULATION TESTS (Without Clone)
// ============================================================================

describe('round Regeneration - Errors Without structuredClone', () => {
  it('should throw error when trying to mutate frozen message array', () => {
    const frozenMessage = createFrozenMessage(0, 'Test');

    expect(() => {
      frozenMessage.parts.push({
        text: 'New part',
        type: MessagePartTypes.TEXT,
      });
    }).toThrow();
  });

  it('should throw "object is not extensible" error on frozen arrays', () => {
    const frozenMessage = createFrozenMessage(0, 'Test');

    // Verify the error message matches the expected pattern
    expect(() => {
      frozenMessage.parts.push({
        text: 'New part',
        type: MessagePartTypes.TEXT,
      });
    }).toThrow(/not extensible|Cannot add property/);
  });

  it('should demonstrate retry failure without structuredClone', () => {
    const messages: UIMessage[] = [
      createFrozenMessage(0, 'Question'),
    ];

    // WITHOUT structuredClone (incorrect approach)
    const filteredMessagesNoClone = filterMessagesForRetry(messages, 0);

    // These are still frozen references
    expect(Object.isFrozen(filteredMessagesNoClone[0])).toBeTruthy();
    const noCloneMsg = filteredMessagesNoClone[0];
    if (!noCloneMsg) {
      throw new Error('expected noCloneMsg');
    }
    expect(simulateAiSdkStreamingPush(noCloneMsg)).toBeFalsy();

    // WITH structuredClone (correct approach)
    const filteredMessagesWithClone = structuredClone(filterMessagesForRetry(messages, 0));

    // These are now mutable
    expect(Object.isFrozen(filteredMessagesWithClone[0])).toBeFalsy();
    const cloneMsg = filteredMessagesWithClone[0];
    if (!cloneMsg) {
      throw new Error('expected cloneMsg');
    }
    expect(simulateAiSdkStreamingPush(cloneMsg)).toBeTruthy();
  });
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe('round Regeneration - structuredClone Edge Cases', () => {
  it('should handle cloning empty message array', () => {
    const emptyMessages: UIMessage[] = [];
    Object.freeze(emptyMessages);

    const clonedMessages = structuredClone(emptyMessages);

    expect(clonedMessages).toHaveLength(0);
    expect(Object.isFrozen(clonedMessages)).toBeFalsy();
  });

  it('should handle cloning single frozen message', () => {
    const singleMessage = [createFrozenMessage(0, 'Single')];

    const clonedMessages = structuredClone(singleMessage);

    expect(clonedMessages).toHaveLength(1);
    expect(Object.isFrozen(clonedMessages[0])).toBeFalsy();
  });

  it('should handle cloning messages with Date objects', () => {
    const now = new Date();
    const messageWithDate: UIMessage = {
      createdAt: now,
      id: 'test',
      metadata: { role: MessageRoles.USER, roundNumber: 0 },
      parts: [{ text: 'Test', type: MessagePartTypes.TEXT }],
      role: UIMessageRoles.USER,
    };

    Object.freeze(messageWithDate);

    const clonedMessage = structuredClone(messageWithDate);

    // Date should be cloned correctly
    expect(clonedMessage.createdAt).toBeInstanceOf(Date);
    expect(clonedMessage.createdAt?.getTime()).toBe(now.getTime());
  });

  it('should handle cloning messages with null/undefined fields', () => {
    const messageWithNulls: UIMessage = {
      createdAt: new Date(),
      id: 'test',
      metadata: { role: MessageRoles.USER, roundNumber: 0 },
      parts: [{ text: 'Test', type: MessagePartTypes.TEXT }],
      role: UIMessageRoles.USER,
      // Optional fields that might be undefined
    };

    Object.freeze(messageWithNulls);

    const clonedMessage = structuredClone(messageWithNulls);

    expect(Object.isFrozen(clonedMessage)).toBeFalsy();
  });
});
