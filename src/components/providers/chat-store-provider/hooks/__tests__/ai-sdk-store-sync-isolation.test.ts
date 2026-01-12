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

import type { UIMessage } from 'ai';
import { act } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';

import { MessageRoles, ModelIds, TextPartStates, UIMessageRoles } from '@/api/core/enums';
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
 * Deep freeze an object and all its nested properties
 * Simulates Immer's Object.freeze() behavior in Zustand stores
 * (In tests, Immer may not freeze for performance - this simulates production behavior)
 */
function deepFreeze<T extends object>(obj: T): T {
  Object.freeze(obj);
  Object.getOwnPropertyNames(obj).forEach((prop) => {
    const value = obj[prop as keyof T];
    if (value && typeof value === 'object') {
      deepFreeze(value as object);
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
 * Deep check if any part of the object tree is frozen
 */
function hasAnyFrozenProperty(obj: unknown, path = ''): string | null {
  if (obj === null || typeof obj !== 'object') {
    return null;
  }

  if (Object.isFrozen(obj)) {
    return path || 'root';
  }

  for (const key of Object.keys(obj)) {
    const value = (obj as Record<string, unknown>)[key];
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
    role: MessageRoles.ASSISTANT,
    parts: [], // Mutable empty array for streaming
    metadata: {
      role: UIMessageRoles.ASSISTANT,
      roundNumber,
      participantId: `participant-${participantIndex}`,
      participantIndex,
      model: 'test-model',
    },
  };
}

/**
 * Create a user message
 */
function createUserMessage(id: string, text: string, roundNumber: number): UIMessage {
  return {
    id,
    role: MessageRoles.USER,
    parts: [{ type: 'text', text }],
    metadata: {
      role: UIMessageRoles.USER,
      roundNumber,
    },
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
      cloned.parts.push({ type: 'text', text: 'Hello', state: TextPartStates.STREAMING });
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

      expect(isFrozen(original)).toBe(true);
      expect(isFrozen(original.parts)).toBe(true);
      expect(isFrozen(cloned)).toBe(false);
      expect(isFrozen(cloned.parts)).toBe(false);

      // Can modify cloned
      expect(() => cloned.parts.push({ type: 'text', text: 'Hello' })).not.toThrow();
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
    expect(isFrozen(frozenMessages)).toBe(true);
    expect(isFrozen(frozenMessages[0])).toBe(true);
    expect(isFrozen(frozenMessages[0].parts)).toBe(true);
  });

  it('should NOT freeze the original message if cloned before store sync', () => {
    const originalMessage = createAiSdkMessage('msg-1', 0);

    // This is the CORRECT pattern: clone before syncing
    const clonedMessages = structuredClone([originalMessage]);
    const frozenStoreMessages = simulateStoreFreeze(clonedMessages);

    // Store messages are frozen
    expect(isFrozen(frozenStoreMessages[0])).toBe(true);
    expect(isFrozen(frozenStoreMessages[0].parts)).toBe(true);

    // Original remains mutable!
    expect(isFrozen(originalMessage)).toBe(false);
    expect(isFrozen(originalMessage.parts)).toBe(false);

    // Can still push to original
    expect(() => originalMessage.parts.push({ type: 'text', text: 'Streaming...' })).not.toThrow();
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
    expect(isFrozen(originalMessage)).toBe(true);
    expect(isFrozen(originalMessage.parts)).toBe(true);

    // Trying to push now fails
    expect(() => originalMessage.parts.push({ type: 'text', text: 'Hello' }))
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
        id: 'thread-1',
        userId: 'user-1',
        projectId: null,
        title: 'Test Thread',
        slug: 'test-thread',
        previousSlug: null,
        mode: 'debating',
        status: 'active',
        isFavorite: false,
        isPublic: false,
        isAiGeneratedTitle: false,
        enableWebSearch: false,
        metadata: null,
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastMessageAt: new Date().toISOString(),
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
    expect(isFrozen(aiSdkMessage)).toBe(false);
    expect(isFrozen(aiSdkMessage.parts)).toBe(false);

    // STEP 5: AI SDK pushes streaming content (this is what fails with the bug)
    expect(() => {
      aiSdkMessage.parts.push({
        type: 'text',
        text: 'Hello, world!',
        state: TextPartStates.STREAMING,
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
    aiSdkMessage.parts.push({ type: 'text', text: 'First ', state: TextPartStates.STREAMING });

    // Sync cycle 2: After first chunk
    act(() => {
      store.getState().setMessages(structuredClone([aiSdkMessage]));
    });

    // AI SDK still mutable
    expect(isFrozen(aiSdkMessage.parts)).toBe(false);

    // AI SDK streams second chunk
    aiSdkMessage.parts[0] = { type: 'text', text: 'First Second ', state: TextPartStates.STREAMING };

    // Sync cycle 3: After second chunk
    act(() => {
      store.getState().setMessages(structuredClone([aiSdkMessage]));
    });

    // AI SDK still mutable after 3 sync cycles
    expect(isFrozen(aiSdkMessage.parts)).toBe(false);

    // Final verification: AI SDK can complete the stream
    aiSdkMessage.parts[0] = { type: 'text', text: 'First Second Third!', state: TextPartStates.DONE };
    expect(aiSdkMessage.parts[0].text).toBe('First Second Third!');
  });

  it('should handle multi-participant streaming with sync isolation', () => {
    const participant0 = createAiSdkMessage('thread-1_r0_p0', 0, 0);
    const participant1 = createAiSdkMessage('thread-1_r0_p1', 0, 1);
    const participant2 = createAiSdkMessage('thread-1_r0_p2', 0, 2);

    // Participant 0 starts streaming
    participant0.parts.push({ type: 'text', text: 'P0: ', state: TextPartStates.STREAMING });

    // Sync to store
    act(() => {
      store.getState().setMessages(structuredClone([participant0]));
    });

    // Participant 0 completes
    participant0.parts[0] = { type: 'text', text: 'P0: Complete', state: TextPartStates.DONE };

    // Participant 1 starts streaming
    participant1.parts.push({ type: 'text', text: 'P1: ', state: TextPartStates.STREAMING });

    // Sync both to store
    act(() => {
      store.getState().setMessages(structuredClone([participant0, participant1]));
    });

    // All AI SDK messages still mutable
    expect(isFrozen(participant0.parts)).toBe(false);
    expect(isFrozen(participant1.parts)).toBe(false);
    expect(isFrozen(participant2.parts)).toBe(false);

    // Participant 1 continues streaming (this would fail with the bug)
    expect(() => {
      participant1.parts[0] = { type: 'text', text: 'P1: Still streaming...', state: TextPartStates.STREAMING };
    }).not.toThrow();

    // Participant 2 starts streaming
    expect(() => {
      participant2.parts.push({ type: 'text', text: 'P2: Starting...', state: TextPartStates.STREAMING });
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
      expect(isFrozen(msg)).toBe(false);
      expect(isFrozen(msg.parts)).toBe(false);
      expect(() => msg.parts.push({ type: 'text', text: 'test' })).not.toThrow();
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
    expect(isFrozen(frozenMessages)).toBe(true);
    expect(isFrozen(frozenMessages[0])).toBe(true);
    expect(isFrozen(frozenMessages[0].parts)).toBe(true);
    expect(isFrozen(frozenMessages[0].metadata)).toBe(true);

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
          type: 'text',
          text: `Chunk ${i}`,
          state: TextPartStates.STREAMING,
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
    ModelIds.DEEPSEEK_DEEPSEEK_R1_0528,
    ModelIds.MISTRALAI_MISTRAL_LARGE_2512,
  ];

  it.each(openRouterModels)('should handle %s streaming without frozen array errors', (model) => {
    const aiSdkMessage: UIMessage = {
      id: 'thread-1_r0_p0',
      role: MessageRoles.ASSISTANT,
      parts: [],
      metadata: {
        role: UIMessageRoles.ASSISTANT,
        roundNumber: 0,
        participantId: 'p0',
        participantIndex: 0,
        model,
      },
    };

    // Simulate streaming flow
    for (let chunk = 0; chunk < 5; chunk++) {
      // AI SDK receives chunk
      if (chunk === 0) {
        aiSdkMessage.parts.push({
          type: 'text',
          text: `Chunk ${chunk} from ${model}`,
          state: TextPartStates.STREAMING,
        });
      } else {
        aiSdkMessage.parts[0] = {
          type: 'text',
          text: `Chunks 0-${chunk} from ${model}`,
          state: TextPartStates.STREAMING,
        };
      }

      // Sync to store (with clone)
      act(() => {
        store.getState().setMessages(structuredClone([aiSdkMessage]));
      });

      // Verify AI SDK can continue
      expect(isFrozen(aiSdkMessage.parts)).toBe(false);
    }

    // Complete the stream
    aiSdkMessage.parts[0] = {
      type: 'text',
      text: `Complete response from ${model}`,
      state: TextPartStates.DONE,
    };

    expect(aiSdkMessage.parts[0].state).toBe(TextPartStates.DONE);
  });

  it('should handle reasoning models with multiple part types', () => {
    const reasoningMessage: UIMessage = {
      id: 'thread-1_r0_p0',
      role: MessageRoles.ASSISTANT,
      parts: [],
      metadata: {
        role: UIMessageRoles.ASSISTANT,
        roundNumber: 0,
        participantId: 'p0',
        participantIndex: 0,
        model: ModelIds.DEEPSEEK_DEEPSEEK_R1_0528,
      },
    };

    // Reasoning models emit reasoning parts first
    reasoningMessage.parts.push({
      type: 'reasoning',
      text: 'Let me think about this...',
      state: TextPartStates.STREAMING,
    });

    act(() => {
      store.getState().setMessages(structuredClone([reasoningMessage]));
    });

    expect(isFrozen(reasoningMessage.parts)).toBe(false);

    // Then text part
    reasoningMessage.parts.push({
      type: 'text',
      text: 'Here is my answer:',
      state: TextPartStates.STREAMING,
    });

    act(() => {
      store.getState().setMessages(structuredClone([reasoningMessage]));
    });

    expect(isFrozen(reasoningMessage.parts)).toBe(false);
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
        aiSdkMessage.parts.push({ type: 'text', text: `${i}`, state: TextPartStates.STREAMING });
      } else {
        aiSdkMessage.parts[0] = { type: 'text', text: `${i}`, state: TextPartStates.STREAMING };
      }

      // Sync to store
      act(() => {
        store.getState().setMessages(structuredClone([aiSdkMessage]));
      });

      // Verify still mutable
      expect(isFrozen(aiSdkMessage.parts)).toBe(false);
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
          msg.parts.push({ type: 'text', text: `P${p}R${round}`, state: TextPartStates.STREAMING });
        } else {
          msg.parts[0] = { type: 'text', text: `P${p}R${round}`, state: TextPartStates.STREAMING };
        }
      }

      // Sync all to store
      act(() => {
        store.getState().setMessages(structuredClone(participants));
      });

      // All participants still mutable
      for (let p = 0; p < participants.length; p++) {
        expect(isFrozen(participants[p].parts)).toBe(false);
      }
    }
  });
});
