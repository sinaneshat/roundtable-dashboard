/**
 * Frozen Array Handling Tests
 *
 * Tests verify that structuredClone() is used correctly in setMessages callbacks
 * to prevent "Cannot add property 0, object is not extensible" errors when
 * Zustand store syncs frozen (Immer-protected) message arrays to the AI SDK hook.
 *
 * CRITICAL INVARIANT: AI SDK requires mutable arrays for streaming operations.
 * Zustand+Immer produces frozen (Object.freeze) arrays for immutability.
 * structuredClone() breaks the freeze and creates mutable deep copies.
 *
 * Test Scenarios:
 * 1. Frozen message objects from Zustand sync
 * 2. Frozen parts arrays within messages
 * 3. Frozen metadata objects
 * 4. Multiple nested freeze levels
 * 5. Error path with frozen arrays (onError callback)
 * 6. Complete path with frozen arrays (onFinish callback)
 * 7. Message updates with frozen previous messages
 *
 * Location: /src/hooks/utils/__tests__/frozen-array-handling.test.ts
 */

import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';

import { MessageRoles, TextPartStates } from '@/api/core/enums';

// ============================================================================
// Freeze Utilities - Simulate Immer/Zustand Behavior
// ============================================================================

/**
 * Deep freeze an object and all its nested properties
 * Simulates Immer's Object.freeze() behavior in Zustand stores
 */
function deepFreeze<T>(obj: T): T {
  // Freeze the object itself
  Object.freeze(obj);

  Object.getOwnPropertyNames(obj).forEach((prop) => {
    if (obj !== null && typeof obj === 'object' && prop in obj) {
      const value = (obj as Record<string, unknown>)[prop];
      if (value && typeof value === 'object') {
        deepFreeze(value);
      }
    }
  });

  return obj;
}

/**
 * Simulate Zustand store producing frozen message arrays
 * This matches the actual behavior when store.messages is synced to the hook
 */
function createFrozenMessageArray(messages: UIMessage[]): UIMessage[] {
  const frozen = messages.map(msg => deepFreeze({ ...msg }));
  return Object.freeze(frozen);
}

function isFrozen(obj: object | null): boolean {
  return obj !== null && Object.isFrozen(obj);
}

// ============================================================================
// Test Message Factories
// ============================================================================

function createBasicMessage(id: string, roundNumber: number): UIMessage {
  return {
    id,
    role: MessageRoles.ASSISTANT,
    parts: [{ type: 'text', text: 'Response content', state: TextPartStates.DONE }],
    metadata: {
      role: MessageRoles.ASSISTANT,
      roundNumber,
      participantId: 'p1',
      participantIndex: 0,
      model: 'gpt-4o',
    },
  };
}

function createStreamingMessage(id: string, roundNumber: number): UIMessage {
  return {
    id,
    role: MessageRoles.ASSISTANT,
    parts: [{ type: 'text', text: 'Streaming...', state: TextPartStates.STREAMING }],
    metadata: {
      role: MessageRoles.ASSISTANT,
      roundNumber,
      participantId: 'p2',
      participantIndex: 1,
      model: 'claude-opus',
    },
  };
}

// ============================================================================
// TESTS: Frozen Array Detection
// ============================================================================

describe('frozen Array Detection', () => {
  it('should detect frozen arrays from deepFreeze utility', () => {
    const messages = [createBasicMessage('msg-1', 0)];
    const frozen = createFrozenMessageArray(messages);

    expect(isFrozen(frozen)).toBe(true);
    expect(isFrozen(frozen[0])).toBe(true);
    expect(isFrozen(frozen[0].parts)).toBe(true);
    expect(isFrozen(frozen[0].metadata)).toBe(true);
  });

  it('should detect unfrozen arrays', () => {
    const messages = [createBasicMessage('msg-1', 0)];

    expect(isFrozen(messages)).toBe(false);
    expect(isFrozen(messages[0])).toBe(false);
  });
});

// ============================================================================
// TESTS: structuredClone with Frozen Arrays
// ============================================================================

describe('structuredClone with Frozen Arrays', () => {
  it('should clone frozen message array to create mutable copy', () => {
    const original = [createBasicMessage('msg-1', 0)];
    const frozen = createFrozenMessageArray(original);

    // Verify frozen
    expect(isFrozen(frozen)).toBe(true);
    expect(() => frozen.push(createBasicMessage('msg-2', 0)))
      .toThrow(/Cannot add property/);

    // structuredClone should create mutable copy
    const cloned = structuredClone(frozen);

    expect(isFrozen(cloned)).toBe(false);
    expect(() => cloned.push(createBasicMessage('msg-2', 0))).not.toThrow();
    expect(cloned).toHaveLength(2);
  });

  it('should clone frozen message objects within array', () => {
    const original = [createBasicMessage('msg-1', 0)];
    const frozen = createFrozenMessageArray(original);

    const cloned = structuredClone(frozen);

    // Nested objects should also be mutable
    expect(isFrozen(cloned[0])).toBe(false);
    expect(isFrozen(cloned[0].parts)).toBe(false);
    expect(isFrozen(cloned[0].metadata)).toBe(false);

    // Should be able to modify nested properties
    expect(() => {
      cloned[0].parts.push({ type: 'text', text: 'New part', state: TextPartStates.DONE });
    })
      .not
      .toThrow();
  });

  it('should handle deeply nested frozen structures', () => {
    const message: UIMessage = {
      id: 'msg-1',
      role: MessageRoles.ASSISTANT,
      parts: [
        { type: 'reasoning', text: 'Thinking...', state: TextPartStates.STREAMING },
        { type: 'text', text: 'Response', state: TextPartStates.STREAMING },
      ],
      metadata: {
        role: MessageRoles.ASSISTANT,
        roundNumber: 0,
        participantId: 'p1',
        participantIndex: 0,
        model: 'o1-preview',
        usage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
      },
    };

    const frozen = deepFreeze(message);

    // Verify all levels are frozen
    expect(isFrozen(frozen)).toBe(true);
    expect(isFrozen(frozen.parts)).toBe(true);
    expect(isFrozen(frozen.parts[0])).toBe(true);
    expect(isFrozen(frozen.metadata)).toBe(true);
    expect(frozen.metadata && typeof frozen.metadata === 'object' && 'usage' in frozen.metadata
      ? isFrozen(frozen.metadata.usage as object)
      : true).toBe(true);

    // Clone should make all levels mutable
    const cloned = structuredClone(frozen);

    expect(isFrozen(cloned)).toBe(false);
    expect(isFrozen(cloned.parts)).toBe(false);
    expect(isFrozen(cloned.parts[0])).toBe(false);
    expect(isFrozen(cloned.metadata)).toBe(false);
  });
});

// ============================================================================
// Helper Functions for setMessages Simulation
// ============================================================================

/**
 * Simulates the setMessages callback pattern from use-multi-participant-chat.ts
 * This is the ACTUAL pattern used in lines 833, 868, 1149, etc.
 */
function simulateSetMessagesCallback(
  frozenPrev: UIMessage[],
  operation: 'add' | 'update' | 'filter',
): UIMessage[] {
  switch (operation) {
    case 'add': {
      // Pattern from line 868: return structuredClone([...prev, errorUIMessage]);
      const newMessage = createBasicMessage('msg-new', 0);
      return structuredClone([...frozenPrev, newMessage]);
    }

    case 'update': {
      // Pattern from line 1320: return structuredClone(prev.map(...))
      return structuredClone(
        frozenPrev.map(msg => (msg.id === 'msg-1'
          ? { ...msg, parts: [{ type: 'text', text: 'Updated', state: TextPartStates.DONE }] }
          : msg)),
      );
    }

    case 'filter': {
      // Pattern from line 1247: filter then map
      const filtered = frozenPrev.filter(msg => msg.id !== 'msg-delete');
      return structuredClone(
        filtered.map(msg => ({ ...msg })),
      );
    }

    default:
      return frozenPrev;
  }
}

/**
 * Simulates onError callback from use-multi-participant-chat.ts line 833
 */
function simulateOnErrorCallback(frozenMessages: UIMessage[]): UIMessage[] {
  const errorMessage: UIMessage = {
    id: 'error-msg',
    role: MessageRoles.ASSISTANT,
    parts: [{ type: 'text', text: 'Error occurred', state: TextPartStates.DONE }],
    metadata: {
      role: MessageRoles.ASSISTANT,
      roundNumber: 0,
      participantId: 'p1',
      hasError: true,
      errorType: 'provider_error',
    },
  };

  // Check if error message already exists
  const existing = frozenMessages.find(msg => msg.id === 'error-msg');
  if (existing) {
    // Update existing
    return structuredClone(
      frozenMessages.map(msg =>
        msg.id === 'error-msg'
          ? {
              ...msg,
              metadata: {
                ...msg.metadata,
                hasError: true,
                errorType: 'provider_error',
              },
            }
          : msg,
      ),
    );
  }

  // Add new error message
  // ✅ FROZEN ARRAY FIX: Clone prev to break Immer freeze (line 868)
  return structuredClone([...frozenMessages, errorMessage]);
}

/**
 * Simulates onFinish callback from use-multi-participant-chat.ts lines 1247-1253
 */
function simulateOnFinishCallback(
  frozenMessages: UIMessage[],
  completeMessage: UIMessage,
): UIMessage[] {
  const correctId = completeMessage.id;

  // Filter out temp messages and duplicates
  const filteredMessages = frozenMessages.filter(
    msg => msg.id !== 'temp-id' && msg.id !== correctId,
  );

  const correctIdExists = filteredMessages.some(msg => msg.id === correctId);

  if (correctIdExists) {
    // Update existing message with correct ID
    // ✅ FROZEN ARRAY FIX: Clone to break Immer freeze for AI SDK mutability (line 1247)
    return structuredClone(
      filteredMessages.map((msg: UIMessage) => (msg.id === correctId ? completeMessage : msg)),
    );
  } else {
    // Add new message with correct ID
    // ✅ FROZEN ARRAY FIX: Clone to break Immer freeze for AI SDK mutability (line 1253)
    return structuredClone([...filteredMessages, completeMessage]);
  }
}

// ============================================================================
// TESTS: setMessages Callback Patterns
// ============================================================================

describe('setMessages Callback Patterns with Frozen Arrays', () => {
  it('should handle ADD operation with frozen previous messages', () => {
    const original = [createBasicMessage('msg-1', 0)];
    const frozen = createFrozenMessageArray(original);

    // Simulate setMessages with frozen prev
    const result = simulateSetMessagesCallback(frozen, 'add');

    expect(isFrozen(result)).toBe(false);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('msg-1');
    expect(result[1].id).toBe('msg-new');
  });

  it('should handle UPDATE operation with frozen previous messages', () => {
    const original = [createBasicMessage('msg-1', 0)];
    const frozen = createFrozenMessageArray(original);

    const result = simulateSetMessagesCallback(frozen, 'update');

    expect(isFrozen(result)).toBe(false);
    expect(result[0].parts[0].text).toBe('Updated');
  });

  it('should handle FILTER operation with frozen previous messages', () => {
    const original = [
      createBasicMessage('msg-1', 0),
      createBasicMessage('msg-delete', 0),
      createBasicMessage('msg-3', 0),
    ];
    const frozen = createFrozenMessageArray(original);

    const result = simulateSetMessagesCallback(frozen, 'filter');

    expect(isFrozen(result)).toBe(false);
    expect(result).toHaveLength(2);
    expect(result.map(m => m.id)).toEqual(['msg-1', 'msg-3']);
  });
});

// ============================================================================
// TESTS: Error Path with Frozen Arrays
// ============================================================================

describe('error path with frozen arrays', () => {
  it('should add error message to frozen array', () => {
    const original = [createBasicMessage('msg-1', 0)];
    const frozen = createFrozenMessageArray(original);

    const result = simulateOnErrorCallback(frozen);

    expect(isFrozen(result)).toBe(false);
    expect(result).toHaveLength(2);
    expect(result[1].id).toBe('error-msg');
    expect(result[1].metadata).toHaveProperty('hasError', true);
  });

  it('should update existing error message in frozen array', () => {
    const original = [
      createBasicMessage('msg-1', 0),
      {
        id: 'error-msg',
        role: MessageRoles.ASSISTANT,
        parts: [],
        metadata: { role: MessageRoles.ASSISTANT, roundNumber: 0 },
      } satisfies UIMessage,
    ];
    const frozen = createFrozenMessageArray(original);

    const result = simulateOnErrorCallback(frozen);

    expect(isFrozen(result)).toBe(false);
    expect(result).toHaveLength(2);
    expect(result[1].metadata).toHaveProperty('hasError', true);
  });
});

// ============================================================================
// TESTS: Complete Path with Frozen Arrays
// ============================================================================

describe('complete path with frozen arrays (onFinish)', () => {
  it('should add completed message to frozen array', () => {
    const original = [createStreamingMessage('msg-1', 0)];
    const frozen = createFrozenMessageArray(original);

    const completeMessage = createBasicMessage('msg-2', 0);

    const result = simulateOnFinishCallback(frozen, completeMessage);

    expect(isFrozen(result)).toBe(false);
    expect(result).toHaveLength(2);
    expect(result[1].id).toBe('msg-2');
  });

  it('should update existing message in frozen array', () => {
    const original = [
      createBasicMessage('msg-1', 0),
      createStreamingMessage('msg-2', 0),
    ];
    const frozen = createFrozenMessageArray(original);

    const completeMessage = {
      ...createBasicMessage('msg-2', 0),
      parts: [{ type: 'text', text: 'Complete content', state: TextPartStates.DONE }],
    };

    const result = simulateOnFinishCallback(frozen, completeMessage);

    expect(isFrozen(result)).toBe(false);
    expect(result).toHaveLength(2);
    expect(result[1].parts[0].text).toBe('Complete content');
    expect(result[1].parts[0].state).toBe(TextPartStates.DONE);
  });

  it('should filter temp messages and handle frozen array', () => {
    const original = [
      createBasicMessage('msg-1', 0),
      { ...createStreamingMessage('temp-id', 0), id: 'temp-id' },
      createStreamingMessage('msg-3', 0),
    ];
    const frozen = createFrozenMessageArray(original);

    const completeMessage = createBasicMessage('msg-2', 0);

    const result = simulateOnFinishCallback(frozen, completeMessage);

    expect(isFrozen(result)).toBe(false);
    expect(result).toHaveLength(3); // msg-1, msg-3, msg-2 (temp-id filtered out)
    expect(result.map(m => m.id)).not.toContain('temp-id');
  });
});

// ============================================================================
// TESTS: Part State Update with Frozen Arrays
// ============================================================================

describe('part state update with frozen arrays', () => {
  /**
   * Simulates the onFinish part state update fix
   * This ensures all parts have state='done' before creating completeMessage
   * Reference: streaming-ui-sync-race-conditions.test.ts lines 114-130
   */
  function simulatePartStateUpdate(frozenMessage: UIMessage): UIMessage {
    const completedParts
      = frozenMessage.parts?.map((part) => {
        if ('state' in part && part.state === TextPartStates.STREAMING) {
          return { ...part, state: TextPartStates.DONE };
        }
        return part;
      }) ?? [];

    return {
      ...frozenMessage,
      parts: completedParts,
    };
  }

  it('should update streaming parts to done in frozen message', () => {
    const message = createStreamingMessage('msg-1', 0);
    const frozen = deepFreeze(message);

    // Verify frozen
    expect(isFrozen(frozen)).toBe(true);
    expect(isFrozen(frozen.parts)).toBe(true);

    // Update should create mutable copy
    const updated = simulatePartStateUpdate(frozen);

    expect(isFrozen(updated)).toBe(false);
    expect(updated.parts[0].state).toBe(TextPartStates.DONE);
  });

  it('should handle multiple streaming parts in frozen message', () => {
    const message: UIMessage = {
      id: 'msg-1',
      role: MessageRoles.ASSISTANT,
      parts: [
        { type: 'reasoning', text: 'Thinking...', state: TextPartStates.STREAMING },
        { type: 'text', text: 'Response', state: TextPartStates.STREAMING },
      ],
      metadata: {
        role: MessageRoles.ASSISTANT,
        roundNumber: 0,
        participantId: 'p1',
      },
    };

    const frozen = deepFreeze(message);

    const updated = simulatePartStateUpdate(frozen);

    expect(isFrozen(updated)).toBe(false);
    expect(updated.parts[0].state).toBe(TextPartStates.DONE);
    expect(updated.parts[1].state).toBe(TextPartStates.DONE);
  });

  it('should preserve parts already in done state', () => {
    const message = createBasicMessage('msg-1', 0);
    const frozen = deepFreeze(message);

    const updated = simulatePartStateUpdate(frozen);

    expect(updated.parts[0].state).toBe(TextPartStates.DONE);
  });
});

// ============================================================================
// TESTS: Real-World Scenario - Full Streaming Flow
// ============================================================================

describe('real-world scenario: full streaming flow with frozen arrays', () => {
  it('should handle complete streaming lifecycle with frozen store sync', () => {
    // Scenario: Zustand store syncs frozen messages to hook during streaming

    // Step 1: Initial state from store (frozen)
    const storeMessages = createFrozenMessageArray([
      {
        id: 'user-msg',
        role: MessageRoles.USER,
        parts: [{ type: 'text', text: 'User question' }],
        metadata: { role: MessageRoles.USER, roundNumber: 0 },
      } satisfies UIMessage,
    ]);

    expect(isFrozen(storeMessages)).toBe(true);

    // Step 2: AI SDK starts streaming - add streaming message with temp ID
    const streamingMessage = { ...createStreamingMessage('temp-id', 0), id: 'temp-id' };
    let currentMessages = structuredClone([...storeMessages, streamingMessage]);

    expect(isFrozen(currentMessages)).toBe(false);
    expect(currentMessages).toHaveLength(2);

    // Step 3: Store syncs back (now frozen again)
    currentMessages = createFrozenMessageArray(currentMessages);
    expect(isFrozen(currentMessages)).toBe(true);

    // Step 4: onFinish - update to completed message with correct ID (filters temp-id, adds msg-p0)
    const completedMessage = createBasicMessage('msg-p0', 0);
    currentMessages = simulateOnFinishCallback(currentMessages, completedMessage);

    expect(isFrozen(currentMessages)).toBe(false);
    expect(currentMessages).toHaveLength(2); // user + msg-p0 (temp-id filtered out)
    expect(currentMessages[1].id).toBe('msg-p0');
    expect(currentMessages[1].parts[0].state).toBe(TextPartStates.DONE);

    // Step 5: Store syncs back again (frozen)
    currentMessages = createFrozenMessageArray(currentMessages);

    // Step 6: Next participant starts
    const nextStreamingMessage = { ...createStreamingMessage('temp-id-2', 0), id: 'temp-id-2' };
    currentMessages = structuredClone([...currentMessages, nextStreamingMessage]);

    expect(isFrozen(currentMessages)).toBe(false);
    expect(currentMessages).toHaveLength(3); // user + msg-p0 + temp-id-2
  });

  it('should handle error during streaming with frozen arrays', () => {
    const storeMessages = createFrozenMessageArray([
      {
        id: 'user-msg',
        role: MessageRoles.USER,
        parts: [{ type: 'text', text: 'User question' }],
        metadata: { role: MessageRoles.USER, roundNumber: 0 },
      } satisfies UIMessage,
      createStreamingMessage('msg-p0', 0),
    ]);

    // Error occurs during p0 streaming
    const messagesWithError = simulateOnErrorCallback(storeMessages);

    expect(isFrozen(messagesWithError)).toBe(false);
    expect(messagesWithError).toHaveLength(3); // user + p0 + error
    expect(messagesWithError[2].id).toBe('error-msg');
    expect(messagesWithError[2].metadata).toHaveProperty('hasError', true);
  });
});

// ============================================================================
// TESTS: AI SDK ↔ Store Sync Isolation (Root Cause of Bug)
// ============================================================================

describe('ai sdk to store sync isolation', () => {
  /**
   * This test suite covers the ROOT CAUSE of the "Cannot add property 0" error.
   *
   * BUG SCENARIO:
   * 1. AI SDK creates message with mutable `parts: []`
   * 2. useMinimalMessageSync syncs AI SDK messages to store
   * 3. Store receives AI SDK's message objects BY REFERENCE
   * 4. Immer freezes store state, including the AI SDK's original objects
   * 5. AI SDK tries to push streaming content to `parts` → ERROR (frozen)
   *
   * FIX: Clone messages before passing to store to break the reference link
   */

  it('should demonstrate the bug: AI SDK message frozen by store sync without clone', () => {
    // This test demonstrates what happens WITHOUT the fix

    // AI SDK creates a message (mutable)
    const aiSdkMessage: UIMessage = {
      id: 'msg-1',
      role: MessageRoles.ASSISTANT,
      parts: [], // Mutable
      metadata: { role: MessageRoles.ASSISTANT, roundNumber: 0 },
    };

    // Verify AI SDK message is mutable
    expect(isFrozen(aiSdkMessage)).toBe(false);
    expect(isFrozen(aiSdkMessage.parts)).toBe(false);

    // BUG: Sync to store WITHOUT cloning (simulates old broken behavior)
    // The store would freeze the exact same object that AI SDK references
    const mergedMessagesWithoutClone = [aiSdkMessage]; // Same reference!
    const storeMessagesWithoutClone = createFrozenMessageArray(mergedMessagesWithoutClone);

    // After store sync, the AI SDK's original message is now frozen!
    // This is because they share the same object reference
    expect(isFrozen(storeMessagesWithoutClone[0])).toBe(true);
    expect(isFrozen(storeMessagesWithoutClone[0].parts)).toBe(true);

    // The AI SDK's reference points to the same frozen object
    // (In real code, aiSdkMessage.parts would now be frozen too)
    // This causes: "Cannot add property 0, object is not extensible"
    expect(() => storeMessagesWithoutClone[0].parts.push({ type: 'text', text: 'Hello' }))
      .toThrow(/Cannot add property/);
  });

  it('should prevent the bug: AI SDK message stays mutable with clone before store sync', () => {
    // This test demonstrates the FIX

    // AI SDK creates a message (mutable)
    const aiSdkMessage: UIMessage = {
      id: 'msg-1',
      role: MessageRoles.ASSISTANT,
      parts: [], // Mutable
      metadata: { role: MessageRoles.ASSISTANT, roundNumber: 0 },
    };

    // FIX: Clone before syncing to store
    // This breaks the reference link between AI SDK and store
    const mergedMessagesWithClone = structuredClone([aiSdkMessage]); // Cloned!
    const storeMessagesWithClone = createFrozenMessageArray(mergedMessagesWithClone);

    // Store messages are frozen (as expected)
    expect(isFrozen(storeMessagesWithClone[0])).toBe(true);
    expect(isFrozen(storeMessagesWithClone[0].parts)).toBe(true);

    // But AI SDK's original message remains mutable!
    expect(isFrozen(aiSdkMessage)).toBe(false);
    expect(isFrozen(aiSdkMessage.parts)).toBe(false);

    // AI SDK can continue streaming into its mutable parts array
    expect(() => aiSdkMessage.parts.push({ type: 'text', text: 'Hello', state: TextPartStates.STREAMING }))
      .not
      .toThrow();
    expect(aiSdkMessage.parts).toHaveLength(1);
  });

  it('should isolate AI SDK from store even with multiple sync cycles', () => {
    // AI SDK message
    const aiSdkMessage: UIMessage = {
      id: 'msg-1',
      role: MessageRoles.ASSISTANT,
      parts: [],
      metadata: { role: MessageRoles.ASSISTANT, roundNumber: 0 },
    };

    // First sync cycle (with clone)
    const clonedMessages1 = structuredClone([aiSdkMessage]);
    const storeMessages1 = createFrozenMessageArray(clonedMessages1);

    // AI SDK still mutable
    expect(isFrozen(aiSdkMessage.parts)).toBe(false);

    // AI SDK streams some content
    aiSdkMessage.parts.push({ type: 'text', text: 'First chunk', state: TextPartStates.STREAMING });

    // Second sync cycle (with clone)
    const clonedMessages2 = structuredClone([aiSdkMessage]);
    const storeMessages2 = createFrozenMessageArray(clonedMessages2);

    // AI SDK still mutable after second sync
    expect(isFrozen(aiSdkMessage.parts)).toBe(false);

    // AI SDK can continue streaming
    aiSdkMessage.parts.push({ type: 'text', text: 'Second chunk', state: TextPartStates.STREAMING });
    expect(aiSdkMessage.parts).toHaveLength(2);

    // Each store snapshot is independent and frozen
    expect(storeMessages1[0].parts).toHaveLength(0); // First snapshot
    expect(storeMessages2[0].parts).toHaveLength(1); // Second snapshot
    expect(isFrozen(storeMessages1[0].parts)).toBe(true);
    expect(isFrozen(storeMessages2[0].parts)).toBe(true);
  });
});
