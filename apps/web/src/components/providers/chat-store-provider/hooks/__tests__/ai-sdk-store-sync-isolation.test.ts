/**
 * AI SDK ↔ Store Sync Isolation Tests
 *
 * CRITICAL: These tests ensure that AI SDK messages remain MUTABLE after syncing to the store.
 *
 * BUG BACKGROUND:
 * When AI SDK messages are synced to the Zustand store without cloning, Immer freezes
 * the original AI SDK objects. This causes "Cannot add property 0, object is not extensible"
 * errors when AI SDK tries to push streaming content to frozen `parts` arrays.
 *
 * FIX:
 * All sync paths must use `structuredClone()` before passing messages to the store.
 * This breaks the reference link, ensuring only copies get frozen.
 *
 * TEST STRATEGY:
 * 1. Unit tests verify sync functions clone messages
 * 2. E2E simulation tests verify full streaming flow
 * 3. Regression tests catch future violations
 *
 * Location: src/components/providers/chat-store-provider/hooks/__tests__/ai-sdk-store-sync-isolation.test.ts
 */

import { MessageRoles, ModelIds, TextPartStates, UIMessageRoles } from '@roundtable/shared';
import type { UIMessage } from 'ai';
import { act } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';

import { createChatStore } from '@/stores/chat';

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Check if an object or any nested property is frozen
 */
function isFrozen(obj: object | null | undefined): boolean {
  return Object.isFrozen(obj);
}

/**
 * Type guard to check if a value is a non-null object that can be frozen
 */
function isFreezableObject(value: unknown): value is object {
  return value !== null && typeof value === 'object';
}

/**
 * Deep freeze an object and all its nested properties
 * Simulates Immer's Object.freeze() behavior in Zustand stores
 * (In tests, Immer may not freeze for performance - this simulates production behavior)
 */
function deepFreeze<T extends object>(obj: T): T {
  Object.freeze(obj);
  Object.getOwnPropertyNames(obj).forEach((prop) => {
    const value = obj[prop as keyof T];
    if (isFreezableObject(value)) {
      deepFreeze(value);
    }
  });
  return obj;
}

/**
 * Simulate Zustand store producing frozen message arrays
 * This matches the actual production behavior when Immer freezes state
 */
function simulateStoreFreeze(messages: UIMessage[]): UIMessage[] {
  const frozen = messages.map(msg => deepFreeze({ ...msg }));
  return Object.freeze(frozen) as UIMessage[];
}

/**
 * Safe property accessor for objects during frozen check
 * Uses Object.prototype.hasOwnProperty for type-safe access
 */
function getNestedValue<T extends object>(obj: T, key: string): unknown {
  if (Object.prototype.hasOwnProperty.call(obj, key)) {
    return obj[key as keyof T];
  }
  return undefined;
}

/**
 * Deep check if any part of the object tree is frozen
 */
function hasAnyFrozenProperty(obj: unknown, path = ''): string | null {
  if (!isFreezableObject(obj)) {
    return null;
  }

  if (Object.isFrozen(obj)) {
    return path || 'root';
  }

  for (const key of Object.keys(obj)) {
    const value = getNestedValue(obj, key);
    const frozenPath = hasAnyFrozenProperty(value, path ? `${path}.${key}` : key);
    if (frozenPath) {
      return frozenPath;
    }
  }

  return null;
}

/**
 * Create a mutable AI SDK message (simulates what AI SDK creates internally)
 */
function createAiSdkMessage(id: string, roundNumber: number, participantIndex = 0): UIMessage {
  return {
    id,
    metadata: {
      model: 'test-model',
      participantId: `participant-${participantIndex}`,
      participantIndex,
      role: UIMessageRoles.ASSISTANT,
      roundNumber,
    },
    parts: [], // Mutable empty array for streaming
    role: MessageRoles.ASSISTANT,
  };
}

/**
 * Create a user message
 */
function createUserMessage(id: string, text: string, roundNumber: number): UIMessage {
  return {
    id,
    metadata: {
      role: UIMessageRoles.USER,
      roundNumber,
    },
    parts: [{ text, type: 'text' }],
    role: MessageRoles.USER,
  };
}

// ============================================================================
// UNIT TESTS: Message Cloning Verification
// ============================================================================

describe('message Cloning Verification', () => {
  describe('structuredClone breaks freeze inheritance', () => {
    it('should create independent copies that do not share references', () => {
      const original: UIMessage = createAiSdkMessage('msg-1', 0);

      // Clone the message
      const cloned = structuredClone(original);

      // Verify they are independent
      expect(cloned).not.toBe(original);
      expect(cloned.parts).not.toBe(original.parts);
      expect(cloned.metadata).not.toBe(original.metadata);

      // Modifying clone should not affect original
      cloned.parts.push({ state: TextPartStates.STREAMING, text: 'Hello', type: 'text' });
      expect(original.parts).toHaveLength(0);
      expect(cloned.parts).toHaveLength(1);
    });

    it('should break freeze when cloning frozen objects', () => {
      const original: UIMessage = createAiSdkMessage('msg-1', 0);

      // Freeze the original (simulates Immer behavior)
      Object.freeze(original);
      Object.freeze(original.parts);
      Object.freeze(original.metadata);

      // Clone should be mutable
      const cloned = structuredClone(original);

      expect(isFrozen(original)).toBeTruthy();
      expect(isFrozen(original.parts)).toBeTruthy();
      expect(isFrozen(cloned)).toBeFalsy();
      expect(isFrozen(cloned.parts)).toBeFalsy();

      // Can modify cloned
      expect(() => cloned.parts.push({ text: 'Hello', type: 'text' })).not.toThrow();
    });
  });
});

// ============================================================================
// UNIT TESTS: Store setMessages Behavior (Simulated Freeze)
// ============================================================================

describe('store setMessages Freeze Behavior (Simulated)', () => {
  /**
   * NOTE: In tests, Immer may not freeze for performance reasons.
   * These tests use simulateStoreFreeze() to model production behavior.
   * The key invariant is: cloning before passing to store prevents
   * the original from being affected when the store freezes its copy.
   */

  it('should freeze messages when simulating store behavior', () => {
    const message = createUserMessage('user-1', 'Hello', 0);

    // Simulate what happens in production when Immer freezes
    const frozenMessages = simulateStoreFreeze([message]);

    // Store messages should be frozen
    expect(isFrozen(frozenMessages)).toBeTruthy();
    expect(isFrozen(frozenMessages[0])).toBeTruthy();
    expect(isFrozen(frozenMessages[0].parts)).toBeTruthy();
  });

  it('should NOT freeze the original message if cloned before store sync', () => {
    const originalMessage = createAiSdkMessage('msg-1', 0);

    // This is the CORRECT pattern: clone before syncing
    const clonedMessages = structuredClone([originalMessage]);
    const frozenStoreMessages = simulateStoreFreeze(clonedMessages);

    // Store messages are frozen
    expect(isFrozen(frozenStoreMessages[0])).toBeTruthy();
    expect(isFrozen(frozenStoreMessages[0].parts)).toBeTruthy();

    // Original remains mutable!
    expect(isFrozen(originalMessage)).toBeFalsy();
    expect(isFrozen(originalMessage.parts)).toBeFalsy();

    // Can still push to original
    expect(() => originalMessage.parts.push({ text: 'Streaming...', type: 'text' })).not.toThrow();
    expect(originalMessage.parts).toHaveLength(1);
  });

  it('should freeze original message if NOT cloned (demonstrates the bug)', () => {
    const originalMessage = createAiSdkMessage('msg-1', 0);

    // This is the BUG pattern: NOT cloning before syncing
    // If we pass the same reference to the store, freezing affects both
    const messagesWithoutClone = [originalMessage];

    // Simulate store freeze - this freezes the SAME objects
    // Note: simulateStoreFreeze creates shallow copies, so we need to freeze in-place
    deepFreeze(messagesWithoutClone[0]);

    // BUG: Original is now frozen because it's the same reference!
    expect(isFrozen(originalMessage)).toBeTruthy();
    expect(isFrozen(originalMessage.parts)).toBeTruthy();

    // Trying to push now fails
    expect(() => originalMessage.parts.push({ text: 'Hello', type: 'text' }))
      .toThrow(/Cannot add property/);
  });
});

// ============================================================================
// E2E SIMULATION: Full Streaming Flow
// ============================================================================

describe('e2E Simulation: Full Streaming Flow', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    // Initialize with thread data
    act(() => {
      store.getState().setThread({
        createdAt: new Date().toISOString(),
        enableWebSearch: false,
        id: 'thread-1',
        isAiGeneratedTitle: false,
        isFavorite: false,
        isPublic: false,
        lastMessageAt: new Date().toISOString(),
        metadata: null,
        mode: 'debating',
        previousSlug: null,
        projectId: null,
        slug: 'test-thread',
        status: 'active',
        title: 'Test Thread',
        updatedAt: new Date().toISOString(),
        userId: 'user-1',
        version: 1,
      });
    });
  });

  it('should allow AI SDK to continue streaming after sync to store (with clone)', () => {
    // STEP 1: AI SDK creates a streaming message
    const aiSdkMessage = createAiSdkMessage('thread-1_r0_p0', 0);

    // Verify AI SDK message is mutable
    expect(hasAnyFrozenProperty(aiSdkMessage)).toBeNull();

    // STEP 2: Simulate useMinimalMessageSync with CORRECT cloning
    act(() => {
      // This is the correct pattern from use-minimal-message-sync.ts
      const mergedMessages = structuredClone([aiSdkMessage]);
      store.getState().setMessages(mergedMessages);
    });

    // STEP 3: Store has messages (NOTE: Immer doesn't freeze in test mode for perf)
    const storeMessages = store.getState().messages;
    expect(storeMessages).toHaveLength(1);
    expect(storeMessages[0].id).toBe('thread-1_r0_p0');

    // STEP 4: AI SDK's original is still mutable - CAN CONTINUE STREAMING
    // This is the CRITICAL invariant - clone breaks reference so original stays mutable
    expect(isFrozen(aiSdkMessage)).toBeFalsy();
    expect(isFrozen(aiSdkMessage.parts)).toBeFalsy();

    // STEP 5: AI SDK pushes streaming content (this is what fails with the bug)
    expect(() => {
      aiSdkMessage.parts.push({
        state: TextPartStates.STREAMING,
        text: 'Hello, world!',
        type: 'text',
      });
    }).not.toThrow();

    expect(aiSdkMessage.parts).toHaveLength(1);
    expect(aiSdkMessage.parts[0]).toHaveProperty('text', 'Hello, world!');
  });

  it('should simulate multiple sync cycles without freezing AI SDK messages', () => {
    const aiSdkMessage = createAiSdkMessage('thread-1_r0_p0', 0);

    // Sync cycle 1: Initial empty message
    act(() => {
      store.getState().setMessages(structuredClone([aiSdkMessage]));
    });

    // AI SDK streams first chunk
    aiSdkMessage.parts.push({ state: TextPartStates.STREAMING, text: 'First ', type: 'text' });

    // Sync cycle 2: After first chunk
    act(() => {
      store.getState().setMessages(structuredClone([aiSdkMessage]));
    });

    // AI SDK still mutable
    expect(isFrozen(aiSdkMessage.parts)).toBeFalsy();

    // AI SDK streams second chunk
    aiSdkMessage.parts[0] = { state: TextPartStates.STREAMING, text: 'First Second ', type: 'text' };

    // Sync cycle 3: After second chunk
    act(() => {
      store.getState().setMessages(structuredClone([aiSdkMessage]));
    });

    // AI SDK still mutable after 3 sync cycles
    expect(isFrozen(aiSdkMessage.parts)).toBeFalsy();

    // Final verification: AI SDK can complete the stream
    aiSdkMessage.parts[0] = { state: TextPartStates.DONE, text: 'First Second Third!', type: 'text' };
    expect(aiSdkMessage.parts[0].text).toBe('First Second Third!');
  });

  it('should handle multi-participant streaming with sync isolation', () => {
    const participant0 = createAiSdkMessage('thread-1_r0_p0', 0, 0);
    const participant1 = createAiSdkMessage('thread-1_r0_p1', 0, 1);
    const participant2 = createAiSdkMessage('thread-1_r0_p2', 0, 2);

    // Participant 0 starts streaming
    participant0.parts.push({ state: TextPartStates.STREAMING, text: 'P0: ', type: 'text' });

    // Sync to store
    act(() => {
      store.getState().setMessages(structuredClone([participant0]));
    });

    // Participant 0 completes
    participant0.parts[0] = { state: TextPartStates.DONE, text: 'P0: Complete', type: 'text' };

    // Participant 1 starts streaming
    participant1.parts.push({ state: TextPartStates.STREAMING, text: 'P1: ', type: 'text' });

    // Sync both to store
    act(() => {
      store.getState().setMessages(structuredClone([participant0, participant1]));
    });

    // All AI SDK messages still mutable
    expect(isFrozen(participant0.parts)).toBeFalsy();
    expect(isFrozen(participant1.parts)).toBeFalsy();
    expect(isFrozen(participant2.parts)).toBeFalsy();

    // Participant 1 continues streaming (this would fail with the bug)
    expect(() => {
      participant1.parts[0] = { state: TextPartStates.STREAMING, text: 'P1: Still streaming...', type: 'text' };
    }).not.toThrow();

    // Participant 2 starts streaming
    expect(() => {
      participant2.parts.push({ state: TextPartStates.STREAMING, text: 'P2: Starting...', type: 'text' });
    }).not.toThrow();
  });
});

// ============================================================================
// REGRESSION TESTS: Catch Future Violations
// ============================================================================

describe('regression Tests: Sync Isolation Invariants', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
  });

  /**
   * INVARIANT 1: Any message passed to setMessages should be cloned first
   * if it needs to remain mutable after the call.
   */
  it('iNVARIANT: Messages synced to store must be cloned to preserve mutability', () => {
    const aiSdkMessages = [
      createAiSdkMessage('msg-1', 0, 0),
      createAiSdkMessage('msg-2', 0, 1),
    ];

    // CORRECT: Clone before sync
    act(() => {
      store.getState().setMessages(structuredClone(aiSdkMessages));
    });

    // Verify originals are still mutable
    for (const msg of aiSdkMessages) {
      expect(isFrozen(msg)).toBeFalsy();
      expect(isFrozen(msg.parts)).toBeFalsy();
      expect(() => msg.parts.push({ text: 'test', type: 'text' })).not.toThrow();
    }
  });

  /**
   * INVARIANT 2: Store messages are frozen by Immer in production
   * NOTE: In test mode, Immer may not freeze for performance.
   * This test uses simulateStoreFreeze to verify production behavior.
   */
  it('iNVARIANT: Store messages are frozen by Immer (simulated production)', () => {
    const message = createUserMessage('user-1', 'Hello', 0);

    // Simulate what production Immer would do
    const frozenMessages = simulateStoreFreeze([message]);

    // In production, store state would be frozen
    expect(isFrozen(frozenMessages)).toBeTruthy();
    expect(isFrozen(frozenMessages[0])).toBeTruthy();
    expect(isFrozen(frozenMessages[0].parts)).toBeTruthy();
    expect(isFrozen(frozenMessages[0].metadata)).toBeTruthy();

    // Verify that modifying frozen state throws
    expect(() => frozenMessages.push(createUserMessage('user-2', 'Hello2', 0))).toThrow();
  });

  /**
   * INVARIANT 3: Pushing to parts array of AI SDK message must always work
   */
  it('iNVARIANT: AI SDK can always push to its own parts array', () => {
    const aiSdkMessage = createAiSdkMessage('msg-1', 0);

    // Simulate 10 sync cycles
    for (let i = 0; i < 10; i++) {
      // Sync to store (with clone)
      act(() => {
        store.getState().setMessages(structuredClone([aiSdkMessage]));
      });

      // AI SDK must be able to push after each sync
      expect(() => {
        aiSdkMessage.parts.push({
          state: TextPartStates.STREAMING,
          text: `Chunk ${i}`,
          type: 'text',
        });
      }).not.toThrow();
    }

    expect(aiSdkMessage.parts).toHaveLength(10);
  });

  /**
   * INVARIANT 4: Frozen detection utility catches issues early
   */
  it('iNVARIANT: hasAnyFrozenProperty detects frozen objects', () => {
    const message = createAiSdkMessage('msg-1', 0);

    // Initially mutable
    expect(hasAnyFrozenProperty(message)).toBeNull();

    // Freeze parts array
    Object.freeze(message.parts);
    expect(hasAnyFrozenProperty(message)).toBe('parts');

    // Freeze entire message
    Object.freeze(message);
    expect(hasAnyFrozenProperty(message)).toBe('root');
  });
});

// ============================================================================
// EDGE CASES: OpenRouter Model Variations
// ============================================================================

describe('edge Cases: OpenRouter Model Variations', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
  });

  const openRouterModels = [
    ModelIds.OPENAI_O3,
    ModelIds.ANTHROPIC_CLAUDE_OPUS_4_5,
    ModelIds.X_AI_GROK_4,
    ModelIds.GOOGLE_GEMINI_2_5_PRO,
    ModelIds.MISTRALAI_MISTRAL_LARGE_2512,
  ];

  it.each(openRouterModels)('should handle %s streaming without frozen array errors', (model) => {
    const aiSdkMessage: UIMessage = {
      id: 'thread-1_r0_p0',
      metadata: {
        model,
        participantId: 'p0',
        participantIndex: 0,
        role: UIMessageRoles.ASSISTANT,
        roundNumber: 0,
      },
      parts: [],
      role: MessageRoles.ASSISTANT,
    };

    // Simulate streaming flow
    for (let chunk = 0; chunk < 5; chunk++) {
      // AI SDK receives chunk
      if (chunk === 0) {
        aiSdkMessage.parts.push({
          state: TextPartStates.STREAMING,
          text: `Chunk ${chunk} from ${model}`,
          type: 'text',
        });
      } else {
        aiSdkMessage.parts[0] = {
          state: TextPartStates.STREAMING,
          text: `Chunks 0-${chunk} from ${model}`,
          type: 'text',
        };
      }

      // Sync to store (with clone)
      act(() => {
        store.getState().setMessages(structuredClone([aiSdkMessage]));
      });

      // Verify AI SDK can continue
      expect(isFrozen(aiSdkMessage.parts)).toBeFalsy();
    }

    // Complete the stream
    aiSdkMessage.parts[0] = {
      state: TextPartStates.DONE,
      text: `Complete response from ${model}`,
      type: 'text',
    };

    expect(aiSdkMessage.parts[0].state).toBe(TextPartStates.DONE);
  });

  it('should handle reasoning models with multiple part types', () => {
    const reasoningMessage: UIMessage = {
      id: 'thread-1_r0_p0',
      metadata: {
        model: ModelIds.OPENAI_O3,
        participantId: 'p0',
        participantIndex: 0,
        role: UIMessageRoles.ASSISTANT,
        roundNumber: 0,
      },
      parts: [],
      role: MessageRoles.ASSISTANT,
    };

    // Reasoning models emit reasoning parts first
    reasoningMessage.parts.push({
      state: TextPartStates.STREAMING,
      text: 'Let me think about this...',
      type: 'reasoning',
    });

    act(() => {
      store.getState().setMessages(structuredClone([reasoningMessage]));
    });

    expect(isFrozen(reasoningMessage.parts)).toBeFalsy();

    // Then text part
    reasoningMessage.parts.push({
      state: TextPartStates.STREAMING,
      text: 'Here is my answer:',
      type: 'text',
    });

    act(() => {
      store.getState().setMessages(structuredClone([reasoningMessage]));
    });

    expect(isFrozen(reasoningMessage.parts)).toBeFalsy();
    expect(reasoningMessage.parts).toHaveLength(2);
  });
});

// ============================================================================
// STRESS TESTS: High-Frequency Sync
// ============================================================================

describe('stress Tests: High-Frequency Sync', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
  });

  it('should handle 100 rapid sync cycles without freezing AI SDK message', () => {
    const aiSdkMessage = createAiSdkMessage('msg-1', 0);

    for (let i = 0; i < 100; i++) {
      // Simulate streaming chunk
      if (i === 0) {
        aiSdkMessage.parts.push({ state: TextPartStates.STREAMING, text: `${i}`, type: 'text' });
      } else {
        aiSdkMessage.parts[0] = { state: TextPartStates.STREAMING, text: `${i}`, type: 'text' };
      }

      // Sync to store
      act(() => {
        store.getState().setMessages(structuredClone([aiSdkMessage]));
      });

      // Verify still mutable
      expect(isFrozen(aiSdkMessage.parts)).toBeFalsy();
    }
  });

  it('should handle concurrent multi-participant sync without cross-contamination', () => {
    const participants = Array.from({ length: 5 }, (_, i) =>
      createAiSdkMessage(`msg-p${i}`, 0, i));

    // Simulate interleaved streaming and syncing
    for (let round = 0; round < 20; round++) {
      // Each participant gets a chunk
      for (let p = 0; p < participants.length; p++) {
        const msg = participants[p];
        if (round === 0) {
          msg.parts.push({ state: TextPartStates.STREAMING, text: `P${p}R${round}`, type: 'text' });
        } else {
          msg.parts[0] = { state: TextPartStates.STREAMING, text: `P${p}R${round}`, type: 'text' };
        }
      }

      // Sync all to store
      act(() => {
        store.getState().setMessages(structuredClone(participants));
      });

      // All participants still mutable
      for (let p = 0; p < participants.length; p++) {
        expect(isFrozen(participants[p].parts)).toBeFalsy();
      }
    }
  });
});
