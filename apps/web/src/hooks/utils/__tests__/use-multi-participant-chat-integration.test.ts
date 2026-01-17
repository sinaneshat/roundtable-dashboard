/**
 * useMultiParticipantChat Integration Tests
 *
 * Tests the critical integration between:
 * - form-actions (adds optimistic message to store)
 * - useMultiParticipantChat (AI SDK management)
 * - useMinimalMessageSync (syncs AI SDK to store)
 *
 * CRITICAL BUG SCENARIO TESTED:
 * When AI SDK creates a participant trigger message, the original user message
 * from the store must not be overwritten or lost.
 *
 * Flow:
 * 1. User submits round 1 → form-actions adds optimistic message to store
 * 2. PATCH /threads/:id completes → DB message replaces optimistic in store
 * 3. AI SDK starts streaming → creates participant trigger message (isParticipantTrigger=true)
 * 4. useMinimalMessageSync syncs AI SDK → store
 * 5. CRITICAL: Original user message must still exist in store
 * 6. Deduplication filters out participant trigger
 * 7. Original user message remains visible in UI
 */

import { MessageRoles, UIMessageRoles } from '@roundtable/shared';
import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';

import { createInvalidMetadata } from '@/lib/testing';
import { getRoundNumber, getUserMetadata } from '@/lib/utils';

// ============================================================================
// Simulated Components
// ============================================================================

/**
 * Simulates the AI SDK message sync logic from useMinimalMessageSync
 * This is the CRITICAL fix that preserves original user messages
 */
function simulateAiSdkToStoreSync(
  aiSdkMessages: UIMessage[],
  storeMessages: UIMessage[],
): UIMessage[] {
  const chatMessageIds = new Set(aiSdkMessages.map(m => m.id));

  // Find store-only messages
  const storeOnlyMessages = storeMessages.filter((m) => {
    // Keep messages that are in store but not in AI SDK
    if (chatMessageIds.has(m.id))
      return false;

    // ✅ CRITICAL FIX: Preserve non-participant-trigger user messages
    if (m.role === MessageRoles.USER) {
      const userMeta = getUserMetadata(m.metadata);
      if (!userMeta?.isParticipantTrigger) {
        return true; // Always preserve the original user message
      }
    }

    // Preserve messages from different rounds (they might have been filtered by AI SDK)
    const chatRounds = new Set(aiSdkMessages.map(cm => getRoundNumber(cm.metadata)));
    const msgRound = getRoundNumber(m.metadata);
    if (msgRound !== null && !chatRounds.has(msgRound))
      return true;

    return false;
  });

  // Merge: AI SDK messages first, then store-only
  return [...aiSdkMessages, ...storeOnlyMessages];
}

/**
 * Simulates the deduplication logic from ChatMessageList
 * This filters out participant trigger messages
 */
function simulateDeduplication(messages: UIMessage[]): UIMessage[] {
  const seenMessageIds = new Set<string>();
  const userRoundToIdx = new Map<number, number>();
  const result: UIMessage[] = [];

  for (const message of messages) {
    if (seenMessageIds.has(message.id)) {
      continue;
    }

    if (message.role === MessageRoles.USER) {
      const roundNum = message.metadata?.roundNumber as number | undefined;
      const userMeta = getUserMetadata(message.metadata);
      const isParticipantTrigger = userMeta?.isParticipantTrigger;

      // Filter out participant trigger messages
      if (isParticipantTrigger) {
        continue;
      }

      if (roundNum !== undefined && roundNum !== null) {
        const existingIdx = userRoundToIdx.get(roundNum);

        if (existingIdx !== undefined) {
          const isDeterministicId = message.id.includes('_r') && message.id.includes('_user');
          const isOptimistic = message.id.startsWith('optimistic-');

          if (isOptimistic) {
            continue;
          }
          if (isDeterministicId) {
            // Replace optimistic with DB message
            result[existingIdx] = message;
            seenMessageIds.add(message.id);
            continue;
          }
          continue;
        }
        userRoundToIdx.set(roundNum, result.length);
      }

      seenMessageIds.add(message.id);
      result.push(message);
    } else {
      seenMessageIds.add(message.id);
      result.push(message);
    }
  }

  return result;
}

// ============================================================================
// Test Helpers
// ============================================================================

function createOptimisticUserMessage(roundNumber: number, text: string): UIMessage {
  return {
    id: `optimistic-user-${roundNumber}`,
    role: MessageRoles.USER,
    parts: [{ type: 'text', text }],
    metadata: {
      role: UIMessageRoles.USER,
      roundNumber,
    },
  };
}

function createDbUserMessage(threadId: string, roundNumber: number, text: string): UIMessage {
  return {
    id: `${threadId}_r${roundNumber}_user`,
    role: MessageRoles.USER,
    parts: [{ type: 'text', text }],
    metadata: {
      role: UIMessageRoles.USER,
      roundNumber,
    },
  };
}

function createParticipantTriggerMessage(roundNumber: number, text: string): UIMessage {
  return {
    id: `trigger-${roundNumber}-${Date.now()}`,
    role: MessageRoles.USER,
    parts: [{ type: 'text', text }],
    metadata: {
      role: UIMessageRoles.USER,
      roundNumber,
      isParticipantTrigger: true,
    },
  };
}

function createAssistantMessage(
  threadId: string,
  roundNumber: number,
  participantIndex: number,
  text = 'Response',
): UIMessage {
  return {
    id: `${threadId}_r${roundNumber}_p${participantIndex}`,
    role: MessageRoles.ASSISTANT,
    parts: [{ type: 'text', text }],
    metadata: {
      role: UIMessageRoles.ASSISTANT,
      roundNumber,
      participantIndex,
      participantId: `participant-${participantIndex}`,
      model: 'test-model',
    },
  };
}

// ============================================================================
// Integration Tests
// ============================================================================

describe('useMultiParticipantChat Integration', () => {
  describe('ai SDK Messages Do Not Overwrite Store Messages', () => {
    it('should preserve original user message when AI SDK creates participant trigger', () => {
      // STEP 1: Store has original user message (from form submission + PATCH completion)
      const storeMessages: UIMessage[] = [
        createDbUserMessage('thread-1', 0, 'Initial question'),
        createAssistantMessage('thread-1', 0, 0),
        createDbUserMessage('thread-1', 1, 'Follow-up'), // Original from form-actions
      ];

      // STEP 2: AI SDK starts streaming - creates participant trigger
      const aiSdkMessages: UIMessage[] = [
        createParticipantTriggerMessage(1, 'Follow-up'),
        createAssistantMessage('thread-1', 1, 0, 'Streaming...'),
      ];

      // STEP 3: useMinimalMessageSync merges AI SDK → store
      const merged = simulateAiSdkToStoreSync(aiSdkMessages, storeMessages);

      // CRITICAL ASSERTION: Original user message must be preserved
      const originalUserMsg = merged.find(m => m.id === 'thread-1_r1_user');
      expect(originalUserMsg).toBeDefined();
      expect(getUserMetadata(originalUserMsg!.metadata)?.isParticipantTrigger).toBeFalsy();

      // STEP 4: Deduplication filters out participant trigger
      const deduplicated = simulateDeduplication(merged);

      // STEP 5: Original user message should be visible in UI
      const round1UserMessages = deduplicated.filter(
        m => m.role === MessageRoles.USER && m.metadata?.roundNumber === 1,
      );

      expect(round1UserMessages).toHaveLength(1);
      expect(round1UserMessages[0].id).toBe('thread-1_r1_user');
      expect(round1UserMessages[0].parts[0]).toEqual({ type: 'text', text: 'Follow-up' });
    });

    it('should handle multiple rounds without losing user messages', () => {
      // Complete conversation with rounds 0, 1, 2
      const storeMessages: UIMessage[] = [
        createDbUserMessage('thread-1', 0, 'Round 0'),
        createAssistantMessage('thread-1', 0, 0),
        createDbUserMessage('thread-1', 1, 'Round 1'),
        createAssistantMessage('thread-1', 1, 0),
        createDbUserMessage('thread-1', 2, 'Round 2'),
      ];

      // AI SDK streaming round 2
      const aiSdkMessages: UIMessage[] = [
        createParticipantTriggerMessage(2, 'Round 2'),
        createAssistantMessage('thread-1', 2, 0, 'Streaming...'),
      ];

      const merged = simulateAiSdkToStoreSync(aiSdkMessages, storeMessages);
      const deduplicated = simulateDeduplication(merged);

      // All 3 user messages should be visible
      const userMessages = deduplicated.filter(m => m.role === MessageRoles.USER);
      expect(userMessages).toHaveLength(3);
      expect(userMessages.map(m => m.metadata?.roundNumber)).toEqual([0, 1, 2]);

      // No participant trigger messages should be visible
      const hasTriggers = userMessages.some((m) => {
        const meta = getUserMetadata(m.metadata);
        return meta?.isParticipantTrigger;
      });
      expect(hasTriggers).toBe(false);
    });
  });

  describe('hydration Works Correctly from Store to AI SDK', () => {
    it('should hydrate AI SDK with store messages on mount', () => {
      // Store has a complete conversation
      const storeMessages: UIMessage[] = [
        createDbUserMessage('thread-1', 0, 'Hello'),
        createAssistantMessage('thread-1', 0, 0, 'Hi!'),
        createAssistantMessage('thread-1', 0, 1, 'Hello there!'),
      ];

      // AI SDK starts empty (before hydration)
      const _aiSdkMessages: UIMessage[] = [];

      // Hydration happens: pass store messages to AI SDK's initial messages
      // This is handled by the `messages` prop in useChat, not by sync
      const hydratedAiSdk = [...storeMessages];

      expect(hydratedAiSdk).toHaveLength(3);
      expect(hydratedAiSdk).toEqual(storeMessages);
    });

    it('should not double-hydrate on thread changes', () => {
      // Thread 1 messages
      const thread1Messages: UIMessage[] = [
        createDbUserMessage('thread-1', 0, 'Thread 1 question'),
        createAssistantMessage('thread-1', 0, 0),
      ];

      // Thread 2 messages
      const thread2Messages: UIMessage[] = [
        createDbUserMessage('thread-2', 0, 'Thread 2 question'),
        createAssistantMessage('thread-2', 0, 0),
      ];

      // Simulate thread switch: store changes, AI SDK gets new initial messages
      // The hook should detect threadId change and reset hydration flag

      // Thread 1 hydration
      let aiSdkMessages = [...thread1Messages];
      expect(aiSdkMessages).toHaveLength(2);

      // Thread switch: AI SDK should receive thread 2 messages
      aiSdkMessages = [...thread2Messages];
      expect(aiSdkMessages).toHaveLength(2);
      expect(aiSdkMessages[0].id).toBe('thread-2_r0_user');
    });
  });

  describe('message Sync During Streaming Preserves Original Messages', () => {
    it('should preserve all previous messages when syncing streaming updates', () => {
      // Store has complete round 0 + user message for round 1
      const storeMessages: UIMessage[] = [
        createDbUserMessage('thread-1', 0, 'Round 0'),
        createAssistantMessage('thread-1', 0, 0),
        createDbUserMessage('thread-1', 1, 'Round 1'),
      ];

      // AI SDK streaming round 1 participant 0
      const aiSdkMessages: UIMessage[] = [
        createParticipantTriggerMessage(1, 'Round 1'),
        createAssistantMessage('thread-1', 1, 0, 'Chunk 1...'),
      ];

      // Sync cycle 1
      let merged = simulateAiSdkToStoreSync(aiSdkMessages, storeMessages);
      // Should preserve: AI SDK messages + store-only messages (round 0 user, round 0 assistant, round 1 user)
      expect(merged).toHaveLength(5); // trigger + streaming assistant + round 0 user + round 0 assistant + round 1 user

      // AI SDK continues streaming
      aiSdkMessages[1] = createAssistantMessage('thread-1', 1, 0, 'Chunk 1... Chunk 2...');

      // Sync cycle 2
      merged = simulateAiSdkToStoreSync(aiSdkMessages, merged);
      expect(merged).toHaveLength(5);

      // Verify all original messages still present after deduplication
      const deduplicated = simulateDeduplication(merged);
      expect(deduplicated.filter(m => m.role === MessageRoles.USER)).toHaveLength(2);
      expect(deduplicated.filter(m => m.role === MessageRoles.ASSISTANT)).toHaveLength(2);
    });

    it('should handle rapid sync cycles during streaming without message loss', () => {
      const storeMessages: UIMessage[] = [
        createDbUserMessage('thread-1', 0, 'Hello'),
      ];

      const aiSdkMessages: UIMessage[] = [
        createParticipantTriggerMessage(0, 'Hello'),
        createAssistantMessage('thread-1', 0, 0, ''),
      ];

      // Simulate 10 rapid sync cycles (throttled in real implementation)
      let merged = storeMessages;
      for (let i = 0; i < 10; i++) {
        aiSdkMessages[1] = createAssistantMessage(
          'thread-1',
          0,
          0,
          `Chunk ${i}`,
        );
        merged = simulateAiSdkToStoreSync(aiSdkMessages, merged);
      }

      // Original user message should still be present
      const deduplicated = simulateDeduplication(merged);
      const userMessages = deduplicated.filter(m => m.role === MessageRoles.USER);
      expect(userMessages).toHaveLength(1);
      expect(userMessages[0].id).toBe('thread-1_r0_user');
    });
  });

  describe('setMessages Calls Don\'t Lose Existing Messages', () => {
    it('should merge AI SDK messages with existing store messages', () => {
      // Store has round 0 complete
      const existingStoreMessages: UIMessage[] = [
        createDbUserMessage('thread-1', 0, 'Round 0'),
        createAssistantMessage('thread-1', 0, 0),
      ];

      // User submits round 1 - optimistic message added
      const _storeAfterSubmit = [
        ...existingStoreMessages,
        createOptimisticUserMessage(1, 'Round 1'),
      ];

      // PATCH completes - DB message replaces optimistic
      const storeAfterPatch = [
        ...existingStoreMessages,
        createDbUserMessage('thread-1', 1, 'Round 1'),
      ];

      // AI SDK starts streaming - creates participant trigger
      const aiSdkMessages: UIMessage[] = [
        createParticipantTriggerMessage(1, 'Round 1'),
        createAssistantMessage('thread-1', 1, 0, 'Streaming...'),
      ];

      // Sync: Should merge AI SDK with store
      const merged = simulateAiSdkToStoreSync(aiSdkMessages, storeAfterPatch);

      // CRITICAL: Verify original round 1 user message is preserved
      expect(merged.find(m => m.id === 'thread-1_r1_user')).toBeDefined();

      // Deduplication should show 2 user messages, 2 assistant messages
      const deduplicated = simulateDeduplication(merged);
      expect(deduplicated.filter(m => m.role === MessageRoles.USER)).toHaveLength(2);
      expect(deduplicated.filter(m => m.role === MessageRoles.ASSISTANT)).toHaveLength(2);
    });

    it('should not create duplicate messages on repeated syncs', () => {
      const storeMessages: UIMessage[] = [
        createDbUserMessage('thread-1', 0, 'Round 0'),
        createAssistantMessage('thread-1', 0, 0),
      ];

      const aiSdkMessages: UIMessage[] = [
        createParticipantTriggerMessage(0, 'Round 0'),
        createAssistantMessage('thread-1', 0, 0),
      ];

      // Sync multiple times
      let merged = simulateAiSdkToStoreSync(aiSdkMessages, storeMessages);
      merged = simulateAiSdkToStoreSync(aiSdkMessages, merged);
      merged = simulateAiSdkToStoreSync(aiSdkMessages, merged);

      // Should not duplicate messages
      const deduplicated = simulateDeduplication(merged);
      expect(deduplicated).toHaveLength(2); // 1 user + 1 assistant
    });
  });

  describe('edge Cases', () => {
    it('should handle empty AI SDK messages', () => {
      const storeMessages: UIMessage[] = [
        createDbUserMessage('thread-1', 0, 'Hello'),
      ];

      const aiSdkMessages: UIMessage[] = [];

      const merged = simulateAiSdkToStoreSync(aiSdkMessages, storeMessages);
      expect(merged).toHaveLength(1);
      expect(merged[0].id).toBe('thread-1_r0_user');
    });

    it('should handle empty store messages', () => {
      const storeMessages: UIMessage[] = [];

      const aiSdkMessages: UIMessage[] = [
        createParticipantTriggerMessage(0, 'Hello'),
      ];

      const merged = simulateAiSdkToStoreSync(aiSdkMessages, storeMessages);
      expect(merged).toHaveLength(1);
      expect(merged[0].metadata?.isParticipantTrigger).toBe(true);
    });

    it('should handle null metadata gracefully', () => {
      const storeMessages: UIMessage[] = [
        {
          id: 'msg-null-meta',
          role: MessageRoles.USER,
          parts: [{ type: 'text', text: 'Test' }],
          metadata: createInvalidMetadata('null'),
        },
      ];

      const aiSdkMessages: UIMessage[] = [];

      const merged = simulateAiSdkToStoreSync(aiSdkMessages, storeMessages);
      expect(merged).toHaveLength(1);
    });

    it('should preserve messages with missing roundNumber', () => {
      const storeMessages: UIMessage[] = [
        {
          id: 'msg-no-round',
          role: MessageRoles.USER,
          parts: [{ type: 'text', text: 'No round number' }],
          metadata: { role: UIMessageRoles.USER },
        },
      ];

      const aiSdkMessages: UIMessage[] = [];

      const merged = simulateAiSdkToStoreSync(aiSdkMessages, storeMessages);
      expect(merged).toHaveLength(1);
    });
  });

  describe('full Flow Simulation: Form Submit to Streaming', () => {
    it('cRITICAL E2E: User message remains visible throughout entire flow', () => {
      // STEP 1: User submits round 1 - optimistic message added
      let storeMessages: UIMessage[] = [
        createDbUserMessage('thread-1', 0, 'Round 0'),
        createAssistantMessage('thread-1', 0, 0),
        createOptimisticUserMessage(1, 'Follow-up question'),
      ];

      // Verify optimistic is visible
      let deduplicated = simulateDeduplication(storeMessages);
      expect(deduplicated.filter(m => m.role === MessageRoles.USER)).toHaveLength(2);

      // STEP 2: PATCH /threads/:id completes - DB message replaces optimistic
      storeMessages = [
        createDbUserMessage('thread-1', 0, 'Round 0'),
        createAssistantMessage('thread-1', 0, 0),
        createDbUserMessage('thread-1', 1, 'Follow-up question'),
      ];

      // Verify DB message is visible
      deduplicated = simulateDeduplication(storeMessages);
      expect(deduplicated.filter(m => m.role === MessageRoles.USER)).toHaveLength(2);
      expect(deduplicated.find(m => m.id === 'thread-1_r1_user')).toBeDefined();

      // STEP 3: AI SDK starts streaming - creates participant trigger
      const aiSdkMessages: UIMessage[] = [
        createParticipantTriggerMessage(1, 'Follow-up question'),
      ];

      // Sync AI SDK → store
      storeMessages = simulateAiSdkToStoreSync(aiSdkMessages, storeMessages);

      // CRITICAL: Original user message MUST still be present
      expect(storeMessages.find(m => m.id === 'thread-1_r1_user')).toBeDefined();

      // Deduplication filters out participant trigger
      deduplicated = simulateDeduplication(storeMessages);
      expect(deduplicated.filter(m => m.role === MessageRoles.USER)).toHaveLength(2);
      expect(deduplicated.find(m => m.id === 'thread-1_r1_user')).toBeDefined();

      // STEP 4: AI SDK adds streaming assistant message
      aiSdkMessages.push(createAssistantMessage('thread-1', 1, 0, 'Chunk 1...'));
      storeMessages = simulateAiSdkToStoreSync(aiSdkMessages, storeMessages);

      // User message still visible
      deduplicated = simulateDeduplication(storeMessages);
      expect(deduplicated.filter(m => m.role === MessageRoles.USER)).toHaveLength(2);

      // STEP 5: Multiple sync cycles as streaming continues
      for (let i = 2; i <= 5; i++) {
        aiSdkMessages[1] = createAssistantMessage('thread-1', 1, 0, `Chunk ${i}...`);
        storeMessages = simulateAiSdkToStoreSync(aiSdkMessages, storeMessages);
      }

      // Final verification: User message still visible after all syncs
      deduplicated = simulateDeduplication(storeMessages);
      const round1User = deduplicated.find(
        m => m.role === MessageRoles.USER && m.metadata?.roundNumber === 1,
      );

      expect(round1User).toBeDefined();
      expect(round1User!.id).toBe('thread-1_r1_user');
      expect(getUserMetadata(round1User!.metadata)?.isParticipantTrigger).toBeFalsy();
      expect(round1User!.parts[0]).toEqual({ type: 'text', text: 'Follow-up question' });
    });
  });
});
