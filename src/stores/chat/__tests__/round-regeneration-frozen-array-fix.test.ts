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

import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';

import { MessagePartTypes, MessageRoles, UIMessageRoles } from '@/api/core/enums';

// ============================================================================
// TEST HELPERS
// ============================================================================

/**
 * Creates a frozen message array (simulating Zustand/Immer behavior)
 */
function createFrozenMessage(roundNumber: number, text: string): UIMessage {
  const message: UIMessage = {
    id: `thread-1_r${roundNumber}_user`,
    role: UIMessageRoles.USER,
    parts: [{ type: MessagePartTypes.TEXT, text }],
    metadata: {
      role: MessageRoles.USER,
      roundNumber,
    },
    createdAt: new Date(),
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
      type: MessagePartTypes.TEXT,
      text: 'Streaming chunk...',
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

    expect(isFrozen).toBe(true);
    expect(arePartsFrozen).toBe(true);
  });

  it('should detect sealed message arrays', () => {
    const message: UIMessage = {
      id: 'test',
      role: UIMessageRoles.USER,
      parts: [{ type: MessagePartTypes.TEXT, text: 'Test' }],
      metadata: { role: MessageRoles.USER, roundNumber: 0 },
      createdAt: new Date(),
    };

    Object.seal(message);
    Object.seal(message.parts);

    const isSealed = Object.isSealed(message);
    const arePartsSealed = Object.isSealed(message.parts);

    expect(isSealed).toBe(true);
    expect(arePartsSealed).toBe(true);
  });

  it('should detect when message arrays are NOT extensible', () => {
    const frozenMessage = createFrozenMessage(0, 'Test');

    const canExtend = Object.isExtensible(frozenMessage.parts);

    expect(canExtend).toBe(false);
  });
});

// ============================================================================
// structuredClone BEHAVIOR TESTS
// ============================================================================

describe('round Regeneration - structuredClone Behavior', () => {
  it('should create mutable copy from frozen message', () => {
    const frozenMessage = createFrozenMessage(0, 'Test');

    // Verify original is frozen
    expect(Object.isFrozen(frozenMessage)).toBe(true);
    expect(Object.isFrozen(frozenMessage.parts)).toBe(true);

    // Clone the message
    const clonedMessage = structuredClone(frozenMessage);

    // Cloned message should NOT be frozen
    expect(Object.isFrozen(clonedMessage)).toBe(false);
    expect(Object.isFrozen(clonedMessage.parts)).toBe(false);
  });

  it('should create extensible arrays after cloning', () => {
    const frozenMessage = createFrozenMessage(0, 'Test');

    // Original is not extensible
    expect(Object.isExtensible(frozenMessage.parts)).toBe(false);

    // Clone and verify extensibility
    const clonedMessage = structuredClone(frozenMessage);
    expect(Object.isExtensible(clonedMessage.parts)).toBe(true);
  });

  it('should allow mutations on cloned message parts', () => {
    const frozenMessage = createFrozenMessage(0, 'Test');
    const clonedMessage = structuredClone(frozenMessage);

    // Should be able to push new parts
    expect(() => {
      clonedMessage.parts.push({
        type: MessagePartTypes.TEXT,
        text: 'New content',
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
      type: MessagePartTypes.TEXT,
      text: 'New part',
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

    expect(canPush).toBe(false);
  });

  it('should SUCCEED pushing streaming parts to cloned messages', () => {
    const frozenMessage = createFrozenMessage(0, 'Test');
    const clonedMessage = structuredClone(frozenMessage);

    const canPush = simulateAiSdkStreamingPush(clonedMessage);

    expect(canPush).toBe(true);
  });

  it('should allow AI SDK to add multiple streaming chunks', () => {
    const frozenMessage = createFrozenMessage(0, 'Test');
    const clonedMessage = structuredClone(frozenMessage);

    // Simulate multiple streaming chunks
    clonedMessage.parts.push({
      type: MessagePartTypes.TEXT,
      text: 'Chunk 1',
    });
    clonedMessage.parts.push({
      type: MessagePartTypes.TEXT,
      text: 'Chunk 2',
    });
    clonedMessage.parts.push({
      type: MessagePartTypes.TEXT,
      text: 'Chunk 3',
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
        id: 'assistant-0',
        role: UIMessageRoles.ASSISTANT,
        parts: [{ type: MessagePartTypes.TEXT, text: 'Response' }],
        metadata: { role: MessageRoles.ASSISTANT, roundNumber: 0 },
        createdAt: new Date(),
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
    expect(Object.isFrozen(clonedMessages[0])).toBe(false);
    expect(Object.isFrozen(clonedMessages[0]?.parts)).toBe(false);
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
      expect(Object.isFrozen(msg)).toBe(false);
      expect(Object.isFrozen(msg.parts)).toBe(false);
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
      id: 'complex',
      role: UIMessageRoles.ASSISTANT,
      parts: [
        { type: MessagePartTypes.TEXT, text: 'Text' },
        {
          type: MessagePartTypes.FILE,
          file: {
            name: 'test.pdf',
            url: 'https://example.com/test.pdf',
            contentType: 'application/pdf',
            size: 1024,
          },
        },
      ],
      metadata: {
        role: MessageRoles.ASSISTANT,
        roundNumber: 0,
        participantIndex: 0,
        participantId: 'participant-0',
        model: 'gpt-4',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      },
      createdAt: new Date(),
    };

    Object.freeze(complexMessage);
    Object.freeze(complexMessage.parts);
    Object.freeze(complexMessage.metadata);

    const clonedMessage = structuredClone(complexMessage);

    // Should be mutable
    expect(Object.isFrozen(clonedMessage)).toBe(false);
    expect(Object.isFrozen(clonedMessage.parts)).toBe(false);

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
        type: MessagePartTypes.TEXT,
        text: 'New part',
      });
    }).toThrow();
  });

  it('should throw "object is not extensible" error on frozen arrays', () => {
    const frozenMessage = createFrozenMessage(0, 'Test');

    // Verify the error message matches the expected pattern
    expect(() => {
      frozenMessage.parts.push({
        type: MessagePartTypes.TEXT,
        text: 'New part',
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
    expect(Object.isFrozen(filteredMessagesNoClone[0])).toBe(true);
    expect(simulateAiSdkStreamingPush(filteredMessagesNoClone[0]!)).toBe(false);

    // WITH structuredClone (correct approach)
    const filteredMessagesWithClone = structuredClone(filterMessagesForRetry(messages, 0));

    // These are now mutable
    expect(Object.isFrozen(filteredMessagesWithClone[0])).toBe(false);
    expect(simulateAiSdkStreamingPush(filteredMessagesWithClone[0]!)).toBe(true);
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
    expect(Object.isFrozen(clonedMessages)).toBe(false);
  });

  it('should handle cloning single frozen message', () => {
    const singleMessage = [createFrozenMessage(0, 'Single')];

    const clonedMessages = structuredClone(singleMessage);

    expect(clonedMessages).toHaveLength(1);
    expect(Object.isFrozen(clonedMessages[0])).toBe(false);
  });

  it('should handle cloning messages with Date objects', () => {
    const now = new Date();
    const messageWithDate: UIMessage = {
      id: 'test',
      role: UIMessageRoles.USER,
      parts: [{ type: MessagePartTypes.TEXT, text: 'Test' }],
      metadata: { role: MessageRoles.USER, roundNumber: 0 },
      createdAt: now,
    };

    Object.freeze(messageWithDate);

    const clonedMessage = structuredClone(messageWithDate);

    // Date should be cloned correctly
    expect(clonedMessage.createdAt).toBeInstanceOf(Date);
    expect(clonedMessage.createdAt?.getTime()).toBe(now.getTime());
  });

  it('should handle cloning messages with null/undefined fields', () => {
    const messageWithNulls: UIMessage = {
      id: 'test',
      role: UIMessageRoles.USER,
      parts: [{ type: MessagePartTypes.TEXT, text: 'Test' }],
      metadata: { role: MessageRoles.USER, roundNumber: 0 },
      createdAt: new Date(),
      // Optional fields that might be undefined
    };

    Object.freeze(messageWithNulls);

    const clonedMessage = structuredClone(messageWithNulls);

    expect(Object.isFrozen(clonedMessage)).toBe(false);
  });
});
