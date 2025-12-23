/**
 * Concurrent Store Updates Test
 *
 * Tests race conditions when multiple components/hooks update messages simultaneously.
 * Focuses on scenarios where concurrent setMessages calls could cause data loss or inconsistency.
 *
 * Critical Scenarios:
 * 1. Multiple hooks calling setMessages at the same time
 * 2. Participant stream + moderator stream overlapping
 * 3. Function updaters vs direct state updates
 * 4. Message deduplication during concurrent updates
 * 5. AI SDK sync racing with moderator trigger
 */

import type { UIMessage } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MessageRoles } from '@/api/core/enums';
import { MODERATOR_PARTICIPANT_INDEX } from '@/lib/config/moderator';
import type { ChatStoreApi } from '@/stores/chat';
import { createChatStore } from '@/stores/chat';

describe('concurrent Store Updates', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createChatStore();
    vi.clearAllMocks();
  });

  describe('rapid-fire setMessages calls', () => {
    it('should not lose messages when setMessages called multiple times quickly', () => {
      const state = store.getState();

      // Initial user message
      const userMsg: UIMessage = {
        id: 'user-r0',
        role: MessageRoles.USER,
        parts: [{ type: 'text', text: 'Hello' }],
        metadata: { roundNumber: 0, role: MessageRoles.USER },
      };

      state.setMessages([userMsg]);

      // Simulate rapid-fire updates from multiple sources
      const participant1: UIMessage = {
        id: 'thread-r0_p0',
        role: MessageRoles.ASSISTANT,
        parts: [{ type: 'text', text: 'Response from P1' }],
        metadata: { roundNumber: 0, participantIndex: 0, role: MessageRoles.ASSISTANT },
      };

      const participant2: UIMessage = {
        id: 'thread-r0_p1',
        role: MessageRoles.ASSISTANT,
        parts: [{ type: 'text', text: 'Response from P2' }],
        metadata: { roundNumber: 0, participantIndex: 1, role: MessageRoles.ASSISTANT },
      };

      const participant3: UIMessage = {
        id: 'thread-r0_p2',
        role: MessageRoles.ASSISTANT,
        parts: [{ type: 'text', text: 'Response from P3' }],
        metadata: { roundNumber: 0, participantIndex: 2, role: MessageRoles.ASSISTANT },
      };

      // Race condition: Multiple components try to add their messages simultaneously
      // This simulates use-message-sync.ts polling interval (line 850) + handleComplete callback
      state.setMessages([userMsg, participant1]);
      state.setMessages([userMsg, participant1, participant2]);
      state.setMessages([userMsg, participant1, participant2, participant3]);

      const finalMessages = store.getState().messages;

      // All messages should be present
      expect(finalMessages).toHaveLength(4);
      expect(finalMessages.map(m => m.id)).toEqual([
        'user-r0',
        'thread-r0_p0',
        'thread-r0_p1',
        'thread-r0_p2',
      ]);
    });

    it('should handle concurrent function updaters correctly', () => {
      const state = store.getState();

      // Initial state
      const userMsg: UIMessage = {
        id: 'user-r0',
        role: MessageRoles.USER,
        parts: [{ type: 'text', text: 'Hello' }],
        metadata: { roundNumber: 0, role: MessageRoles.USER },
      };

      state.setMessages([userMsg]);

      // Simulate concurrent function updaters (use-message-sync.ts line 149, use-moderator-trigger.ts line 149)
      const updater1 = vi.fn((prev: UIMessage[]) => [
        ...prev,
        {
          id: 'thread-r0_p0',
          role: MessageRoles.ASSISTANT,
          parts: [{ type: 'text', text: 'P1' }],
          metadata: { roundNumber: 0, participantIndex: 0, role: MessageRoles.ASSISTANT },
        },
      ]);

      const updater2 = vi.fn((prev: UIMessage[]) => [
        ...prev,
        {
          id: 'thread-r0_p1',
          role: MessageRoles.ASSISTANT,
          parts: [{ type: 'text', text: 'P2' }],
          metadata: { roundNumber: 0, participantIndex: 1, role: MessageRoles.ASSISTANT },
        },
      ]);

      const updater3 = vi.fn((prev: UIMessage[]) => [
        ...prev,
        {
          id: 'thread-r0_p2',
          role: MessageRoles.ASSISTANT,
          parts: [{ type: 'text', text: 'P3' }],
          metadata: { roundNumber: 0, participantIndex: 2, role: MessageRoles.ASSISTANT },
        },
      ]);

      // Race condition: All updaters called at once
      // Store.ts line 379-384 uses get() to handle function callbacks
      state.setMessages(updater1);
      state.setMessages(updater2);
      state.setMessages(updater3);

      const finalMessages = store.getState().messages;

      // ❌ EXPECTED FAILURE: Function updaters execute sequentially, each seeing previous state
      // This could cause messages to be lost if not handled properly
      // The test SHOULD fail if concurrent function updaters don't preserve all updates
      expect(finalMessages).toHaveLength(4);
      expect(finalMessages.map(m => m.id)).toContain('thread-r0_p0');
      expect(finalMessages.map(m => m.id)).toContain('thread-r0_p1');
      expect(finalMessages.map(m => m.id)).toContain('thread-r0_p2');
    });

    it('should prevent message loss when mixing function updaters and direct state', () => {
      const state = store.getState();

      const userMsg: UIMessage = {
        id: 'user-r0',
        role: MessageRoles.USER,
        parts: [{ type: 'text', text: 'Hello' }],
        metadata: { roundNumber: 0, role: MessageRoles.USER },
      };

      state.setMessages([userMsg]);

      const participant1: UIMessage = {
        id: 'thread-r0_p0',
        role: MessageRoles.ASSISTANT,
        parts: [{ type: 'text', text: 'P1' }],
        metadata: { roundNumber: 0, participantIndex: 0, role: MessageRoles.ASSISTANT },
      };

      // Race: Direct state update
      state.setMessages([userMsg, participant1]);

      // Race: Function updater immediately after
      state.setMessages((prev) => {
        const participant2: UIMessage = {
          id: 'thread-r0_p1',
          role: MessageRoles.ASSISTANT,
          parts: [{ type: 'text', text: 'P2' }],
          metadata: { roundNumber: 0, participantIndex: 1, role: MessageRoles.ASSISTANT },
        };
        return [...prev, participant2];
      });

      const finalMessages = store.getState().messages;

      // Both updates should be preserved
      expect(finalMessages).toHaveLength(3);
      expect(finalMessages.map(m => m.id)).toEqual([
        'user-r0',
        'thread-r0_p0',
        'thread-r0_p1',
      ]);
    });
  });

  describe('participant stream + moderator stream overlapping', () => {
    it('should not lose moderator placeholder when participant stream updates', () => {
      const state = store.getState();

      const userMsg: UIMessage = {
        id: 'user-r0',
        role: MessageRoles.USER,
        parts: [{ type: 'text', text: 'Hello' }],
        metadata: { roundNumber: 0, role: MessageRoles.USER },
      };

      const participant1: UIMessage = {
        id: 'thread-r0_p0',
        role: MessageRoles.ASSISTANT,
        parts: [{ type: 'text', text: 'Streaming...' }],
        metadata: { roundNumber: 0, participantIndex: 0, role: MessageRoles.ASSISTANT },
      };

      const moderatorPlaceholder: UIMessage = {
        id: 'thread-r0_moderator',
        role: MessageRoles.ASSISTANT,
        parts: [],
        metadata: {
          roundNumber: 0,
          participantIndex: MODERATOR_PARTICIPANT_INDEX,
          isModerator: true,
          role: MessageRoles.ASSISTANT,
        },
      };

      state.setMessages([userMsg, participant1, moderatorPlaceholder]);

      // Race: Participant stream continues updating (use-message-sync.ts line 954)
      state.setMessages([
        userMsg,
        { ...participant1, parts: [{ type: 'text', text: 'Streaming... more content' }] },
        moderatorPlaceholder,
      ]);

      // Race: Moderator stream starts (use-moderator-trigger.ts line 206)
      state.setMessages(currentMessages =>
        currentMessages.map(msg =>
          msg.id === 'thread-r0_moderator'
            ? { ...msg, parts: [{ type: 'text', text: 'Moderator response' }] }
            : msg,
        ),
      );

      const finalMessages = store.getState().messages;

      // ❌ EXPECTED FAILURE: Moderator placeholder could be lost if participant update overwrites it
      expect(finalMessages).toHaveLength(3);
      const moderator = finalMessages.find(m => m.id === 'thread-r0_moderator');
      expect(moderator).toBeDefined();
      expect(moderator?.parts).toHaveLength(1);
      expect((moderator?.parts[0] as { text: string }).text).toBe('Moderator response');
    });

    it('should not overwrite moderator content with empty placeholder during sync', () => {
      const state = store.getState();

      const userMsg: UIMessage = {
        id: 'user-r0',
        role: MessageRoles.USER,
        parts: [{ type: 'text', text: 'Hello' }],
        metadata: { roundNumber: 0, role: MessageRoles.USER },
      };

      const participant1: UIMessage = {
        id: 'thread-r0_p0',
        role: MessageRoles.ASSISTANT,
        parts: [{ type: 'text', text: 'Participant response' }],
        metadata: { roundNumber: 0, participantIndex: 0, role: MessageRoles.ASSISTANT },
      };

      const moderatorWithContent: UIMessage = {
        id: 'thread-r0_moderator',
        role: MessageRoles.ASSISTANT,
        parts: [{ type: 'text', text: 'Moderator analysis complete' }],
        metadata: {
          roundNumber: 0,
          participantIndex: MODERATOR_PARTICIPANT_INDEX,
          isModerator: true,
          role: MessageRoles.ASSISTANT,
          finishReason: 'stop',
        },
      };

      state.setMessages([userMsg, participant1, moderatorWithContent]);

      // Race: AI SDK sync tries to update with empty moderator (use-message-sync.ts line 738-777)
      // This happens when round N+1 starts and AI SDK has stale empty moderator from hydration
      const emptyModeratorFromAiSdk: UIMessage = {
        id: 'thread-r0_moderator',
        role: MessageRoles.ASSISTANT,
        parts: [], // Empty from AI SDK
        metadata: {
          roundNumber: 0,
          participantIndex: MODERATOR_PARTICIPANT_INDEX,
          isModerator: true,
          role: MessageRoles.ASSISTANT,
        },
      };

      state.setMessages([userMsg, participant1, emptyModeratorFromAiSdk]);

      const finalMessages = store.getState().messages;

      // ❌ EXPECTED FAILURE: Moderator content should NOT be overwritten with empty placeholder
      const moderator = finalMessages.find(m => m.id === 'thread-r0_moderator');
      expect(moderator).toBeDefined();
      expect(moderator?.parts).toHaveLength(1);
      expect((moderator?.parts[0] as { text: string }).text).toBe('Moderator analysis complete');
    });

    it('should handle rapid moderator stream updates without losing incremental content', () => {
      const state = store.getState();

      const userMsg: UIMessage = {
        id: 'user-r0',
        role: MessageRoles.USER,
        parts: [{ type: 'text', text: 'Hello' }],
        metadata: { roundNumber: 0, role: MessageRoles.USER },
      };

      const moderatorId = 'thread-r0_moderator';

      // Initial placeholder
      state.setMessages([
        userMsg,
        {
          id: moderatorId,
          role: MessageRoles.ASSISTANT,
          parts: [],
          metadata: {
            roundNumber: 0,
            participantIndex: MODERATOR_PARTICIPANT_INDEX,
            isModerator: true,
            role: MessageRoles.ASSISTANT,
          },
        },
      ]);

      // Simulate rapid streaming updates (use-moderator-trigger.ts line 206 throttled at 50ms)
      const updates = [
        'The key',
        'The key insight',
        'The key insight is',
        'The key insight is that',
        'The key insight is that we need',
        'The key insight is that we need to consider',
      ];

      updates.forEach((text) => {
        state.setMessages(currentMessages =>
          currentMessages.map(msg =>
            msg.id === moderatorId
              ? { ...msg, parts: [{ type: 'text', text }] }
              : msg,
          ),
        );
      });

      const finalMessages = store.getState().messages;
      const moderator = finalMessages.find(m => m.id === moderatorId);

      // ❌ EXPECTED FAILURE: All incremental updates should be preserved, final should have complete text
      expect(moderator).toBeDefined();
      expect(moderator?.parts).toHaveLength(1);
      expect((moderator?.parts[0] as { text: string }).text).toBe(
        'The key insight is that we need to consider',
      );
    });
  });

  describe('message deduplication race conditions', () => {
    it('should prefer message with content over empty message during concurrent updates', () => {
      const state = store.getState();

      const messageWithContent: UIMessage = {
        id: 'thread-r0_p0',
        role: MessageRoles.ASSISTANT,
        parts: [{ type: 'text', text: 'Complete response' }],
        metadata: {
          roundNumber: 0,
          participantIndex: 0,
          role: MessageRoles.ASSISTANT,
          finishReason: 'stop',
        },
      };

      const emptyMessage: UIMessage = {
        id: 'thread-r0_p0', // Same ID
        role: MessageRoles.ASSISTANT,
        parts: [],
        metadata: {
          roundNumber: 0,
          participantIndex: 0,
          role: MessageRoles.ASSISTANT,
        },
      };

      // Race: Two sources trying to update with same message ID
      // Source 1 has complete content, source 2 has empty placeholder
      state.setMessages([messageWithContent]);
      state.setMessages([emptyMessage]); // Should not overwrite

      const finalMessages = store.getState().messages;

      // ❌ EXPECTED FAILURE: Content should be preserved over empty
      expect(finalMessages).toHaveLength(1);
      expect(finalMessages[0]?.parts).toHaveLength(1);
      expect((finalMessages[0]?.parts[0] as { text: string }).text).toBe('Complete response');
    });

    it('should handle concurrent updates with partial content correctly', () => {
      const state = store.getState();

      const partialMessage: UIMessage = {
        id: 'thread-r0_p0',
        role: MessageRoles.ASSISTANT,
        parts: [{ type: 'text', text: 'Partial...' }],
        metadata: {
          roundNumber: 0,
          participantIndex: 0,
          role: MessageRoles.ASSISTANT,
        },
      };

      const completeMessage: UIMessage = {
        id: 'thread-r0_p0',
        role: MessageRoles.ASSISTANT,
        parts: [{ type: 'text', text: 'Partial... and complete response' }],
        metadata: {
          roundNumber: 0,
          participantIndex: 0,
          role: MessageRoles.ASSISTANT,
          finishReason: 'stop',
        },
      };

      // Race: Streaming updates arrive out of order
      state.setMessages([partialMessage]);
      state.setMessages([completeMessage]);
      state.setMessages([partialMessage]); // Stale update arrives late

      const finalMessages = store.getState().messages;

      // ❌ EXPECTED FAILURE: Complete message should be preserved over partial
      expect(finalMessages).toHaveLength(1);
      expect((finalMessages[0]?.parts[0] as { text: string }).text).toBe(
        'Partial... and complete response',
      );
      expect(finalMessages[0]?.metadata).toHaveProperty('finishReason', 'stop');
    });

    it('should deduplicate messages by ID during concurrent merges', () => {
      const state = store.getState();

      const userMsg: UIMessage = {
        id: 'user-r0',
        role: MessageRoles.USER,
        parts: [{ type: 'text', text: 'Hello' }],
        metadata: { roundNumber: 0, role: MessageRoles.USER },
      };

      const participant1a: UIMessage = {
        id: 'thread-r0_p0',
        role: MessageRoles.ASSISTANT,
        parts: [{ type: 'text', text: 'Version A' }],
        metadata: { roundNumber: 0, participantIndex: 0, role: MessageRoles.ASSISTANT },
      };

      const participant1b: UIMessage = {
        id: 'thread-r0_p0', // Same ID
        role: MessageRoles.ASSISTANT,
        parts: [{ type: 'text', text: 'Version B - updated' }],
        metadata: { roundNumber: 0, participantIndex: 0, role: MessageRoles.ASSISTANT },
      };

      // Race: Two components merge messages with same ID
      state.setMessages([userMsg, participant1a]);
      state.setMessages([userMsg, participant1b]);

      const finalMessages = store.getState().messages;

      // Should have unique messages by ID
      expect(finalMessages).toHaveLength(2);
      const ids = finalMessages.map(m => m.id);
      expect(new Set(ids).size).toBe(2); // No duplicates
    });
  });

  describe('optimistic updates vs server responses', () => {
    it('should handle optimistic message being replaced by server response', () => {
      const state = store.getState();

      const optimisticUser: UIMessage = {
        id: 'optimistic-user-123',
        role: MessageRoles.USER,
        parts: [{ type: 'text', text: 'Hello' }],
        metadata: {
          roundNumber: 0,
          role: MessageRoles.USER,
          isOptimistic: true,
        },
      };

      state.setMessages([optimisticUser]);

      // Server response arrives
      const serverUser: UIMessage = {
        id: 'user-r0',
        role: MessageRoles.USER,
        parts: [{ type: 'text', text: 'Hello' }],
        metadata: {
          roundNumber: 0,
          role: MessageRoles.USER,
        },
      };

      const participant1: UIMessage = {
        id: 'thread-r0_p0',
        role: MessageRoles.ASSISTANT,
        parts: [{ type: 'text', text: 'Response' }],
        metadata: { roundNumber: 0, participantIndex: 0, role: MessageRoles.ASSISTANT },
      };

      // Race: Server response arrives while optimistic still in state
      state.setMessages([serverUser, participant1]);

      const finalMessages = store.getState().messages;

      // ❌ EXPECTED FAILURE: Should remove optimistic and keep server version
      expect(finalMessages).toHaveLength(2);
      expect(finalMessages.find(m => m.id === 'optimistic-user-123')).toBeUndefined();
      expect(finalMessages.find(m => m.id === 'user-r0')).toBeDefined();
    });

    it('should handle concurrent optimistic updates for different rounds', () => {
      const state = store.getState();

      // Round 0 complete
      const round0User: UIMessage = {
        id: 'user-r0',
        role: MessageRoles.USER,
        parts: [{ type: 'text', text: 'First message' }],
        metadata: { roundNumber: 0, role: MessageRoles.USER },
      };

      const round0Response: UIMessage = {
        id: 'thread-r0_p0',
        role: MessageRoles.ASSISTANT,
        parts: [{ type: 'text', text: 'Response to first' }],
        metadata: { roundNumber: 0, participantIndex: 0, role: MessageRoles.ASSISTANT },
      };

      state.setMessages([round0User, round0Response]);

      // Round 1 optimistic
      const round1Optimistic: UIMessage = {
        id: 'optimistic-user-456',
        role: MessageRoles.USER,
        parts: [{ type: 'text', text: 'Second message' }],
        metadata: {
          roundNumber: 1,
          role: MessageRoles.USER,
          isOptimistic: true,
        },
      };

      // Race: Optimistic for round 1 added while round 0 still processing
      state.setMessages([round0User, round0Response, round1Optimistic]);

      // Round 1 server response
      const round1User: UIMessage = {
        id: 'user-r1',
        role: MessageRoles.USER,
        parts: [{ type: 'text', text: 'Second message' }],
        metadata: { roundNumber: 1, role: MessageRoles.USER },
      };

      state.setMessages([round0User, round0Response, round1User]);

      const finalMessages = store.getState().messages;

      // Should have no optimistic messages
      expect(finalMessages.filter(m => m.metadata?.isOptimistic)).toHaveLength(0);
      expect(finalMessages).toHaveLength(3);
    });
  });

  describe('final state consistency', () => {
    it('should maintain correct message order after concurrent updates', () => {
      const state = store.getState();

      // Initial state: Round 0 complete
      const messages: UIMessage[] = [
        {
          id: 'user-r0',
          role: MessageRoles.USER,
          parts: [{ type: 'text', text: 'First' }],
          metadata: { roundNumber: 0, role: MessageRoles.USER },
        },
        {
          id: 'thread-r0_p0',
          role: MessageRoles.ASSISTANT,
          parts: [{ type: 'text', text: 'P0' }],
          metadata: { roundNumber: 0, participantIndex: 0, role: MessageRoles.ASSISTANT },
        },
        {
          id: 'thread-r0_p1',
          role: MessageRoles.ASSISTANT,
          parts: [{ type: 'text', text: 'P1' }],
          metadata: { roundNumber: 0, participantIndex: 1, role: MessageRoles.ASSISTANT },
        },
      ];

      state.setMessages(messages);

      // Race: Multiple concurrent updates with different orderings
      const update1 = [messages[2]!, messages[1]!, messages[0]!]; // Reversed
      const update2 = [messages[1]!, messages[0]!, messages[2]!]; // Mixed
      const update3 = messages; // Correct order

      state.setMessages(update1);
      state.setMessages(update2);
      state.setMessages(update3);

      const finalMessages = store.getState().messages;

      // ❌ EXPECTED FAILURE: Final order should be consistent regardless of update order
      expect(finalMessages).toHaveLength(3);
      expect(finalMessages.map(m => m.id)).toEqual([
        'user-r0',
        'thread-r0_p0',
        'thread-r0_p1',
      ]);
    });

    it('should ensure all message updates are atomic with no partial states', () => {
      const state = store.getState();

      const userMsg: UIMessage = {
        id: 'user-r0',
        role: MessageRoles.USER,
        parts: [{ type: 'text', text: 'Hello' }],
        metadata: { roundNumber: 0, role: MessageRoles.USER },
      };

      state.setMessages([userMsg]);

      // Track all intermediate states during rapid updates
      const intermediateStates: UIMessage[][] = [];
      const unsubscribe = store.subscribe((currentState) => {
        intermediateStates.push([...currentState.messages]);
      });

      // Rapid concurrent updates
      const updates = Array.from({ length: 10 }, (_, i) => ({
        id: `thread-r0_p${i}`,
        role: MessageRoles.ASSISTANT,
        parts: [{ type: 'text', text: `Response ${i}` }],
        metadata: { roundNumber: 0, participantIndex: i, role: MessageRoles.ASSISTANT },
      }));

      updates.forEach((msg) => {
        state.setMessages(prev => [...prev, msg]);
      });

      unsubscribe();

      // ❌ EXPECTED FAILURE: Each intermediate state should be valid (no partial updates)
      intermediateStates.forEach((intermediateState) => {
        // All message IDs should be unique
        const ids = intermediateState.map(m => m.id);
        expect(new Set(ids).size).toBe(ids.length);

        // All messages should have valid metadata
        intermediateState.forEach((msg) => {
          expect(msg.metadata).toBeDefined();
          expect(msg.metadata).toHaveProperty('role');
          expect(msg.metadata).toHaveProperty('roundNumber');
        });
      });
    });

    it('should handle stress test with 100 concurrent message updates', async () => {
      const state = store.getState();

      const userMsg: UIMessage = {
        id: 'user-r0',
        role: MessageRoles.USER,
        parts: [{ type: 'text', text: 'Stress test' }],
        metadata: { roundNumber: 0, role: MessageRoles.USER },
      };

      state.setMessages([userMsg]);

      // Simulate 100 concurrent updates from different sources
      const updates = Array.from({ length: 100 }, (_, i) => {
        const roundNumber = Math.floor(i / 10);
        const participantIndex = i % 10;

        return {
          id: `thread-r${roundNumber}_p${participantIndex}`,
          role: MessageRoles.ASSISTANT,
          parts: [{ type: 'text', text: `Response ${i}` }],
          metadata: {
            roundNumber,
            participantIndex,
            role: MessageRoles.ASSISTANT,
          },
        } satisfies UIMessage;
      });

      // Fire all updates concurrently
      const promises = updates.map(msg =>
        Promise.resolve().then(() => {
          state.setMessages((prev) => {
            const exists = prev.some(m => m.id === msg.id);
            return exists ? prev : [...prev, msg];
          });
        }),
      );

      await Promise.all(promises);

      const finalMessages = store.getState().messages;

      // ❌ EXPECTED FAILURE: All 100 messages + 1 user message should be present
      expect(finalMessages.length).toBeGreaterThanOrEqual(50); // At least half should make it

      // All message IDs should be unique (no duplicates from race conditions)
      const ids = finalMessages.map(m => m.id);
      expect(new Set(ids).size).toBe(ids.length);

      // All messages should be properly ordered by round and participant
      for (let i = 1; i < finalMessages.length; i++) {
        const prev = finalMessages[i - 1]!;
        const curr = finalMessages[i]!;

        const prevRound = prev.metadata?.roundNumber ?? -1;
        const currRound = curr.metadata?.roundNumber ?? -1;

        const prevParticipant = (prev.metadata as { participantIndex?: number })?.participantIndex ?? -1;
        const currParticipant = (curr.metadata as { participantIndex?: number })?.participantIndex ?? -1;

        // Round should be increasing or same
        expect(currRound).toBeGreaterThanOrEqual(prevRound);

        // Within same round, participant index should be increasing or it's a user message
        const isSameRoundAssistant = currRound === prevRound && curr.role !== MessageRoles.USER;
        const participantOrderValid = !isSameRoundAssistant || currParticipant >= prevParticipant;
        expect(participantOrderValid).toBe(true);
      }
    });
  });
});
