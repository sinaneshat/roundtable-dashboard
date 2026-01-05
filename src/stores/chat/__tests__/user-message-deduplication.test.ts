/**
 * User Message Deduplication Tests
 *
 * Tests the critical deduplication logic in ChatMessageList for user messages.
 * This logic determines whether optimistic messages appear in the UI.
 *
 * KEY BUG: Optimistic user messages may be incorrectly filtered out if
 * deduplication logic sees them AFTER a DB message for the same round.
 */

import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';

import { MessageRoles } from '@/api/core/enums';

// Simulate the deduplication logic from ChatMessageList
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

      if (roundNum !== undefined && roundNum !== null) {
        const existingIdx = userRoundToIdx.get(roundNum);

        if (existingIdx !== undefined) {
          const isDeterministicId = message.id.includes('_r') && message.id.includes('_user');
          const isOptimistic = message.id.startsWith('optimistic-');

          if (isOptimistic) {
            // Skip optimistic in favor of DB message
            continue;
          }
          if (isDeterministicId) {
            // Replace optimistic with DB message
            result[existingIdx] = message;
            seenMessageIds.add(message.id);
            continue;
          }
          // Skip duplicate
          continue;
        }
        userRoundToIdx.set(roundNum, result.length);
      }

      seenMessageIds.add(message.id);
      result.push(message);
    } else {
      // Just add assistant messages for now
      seenMessageIds.add(message.id);
      result.push(message);
    }
  }

  return result;
}

// Helper to create messages
function createUserMessage(id: string, roundNumber: number, text: string): UIMessage {
  return {
    id,
    role: MessageRoles.USER,
    parts: [{ type: 'text', text }],
    metadata: { role: MessageRoles.USER, roundNumber },
  };
}

function createAssistantMessage(id: string, roundNumber: number): UIMessage {
  return {
    id,
    role: MessageRoles.ASSISTANT,
    parts: [{ type: 'text', text: 'Response' }],
    metadata: {
      role: MessageRoles.ASSISTANT,
      roundNumber,
      participantIndex: 0,
    },
  };
}

describe('user Message Deduplication', () => {
  describe('optimistic Message Handling', () => {
    it('should include ONLY optimistic message when no DB message exists (round 1 just submitted)', () => {
      const messages: UIMessage[] = [
        createUserMessage('thread_r0_user', 0, 'Round 0'),
        createAssistantMessage('thread_r0_p0', 0),
        createUserMessage('optimistic-user-1', 1, 'Round 1'),
      ];

      const result = simulateDeduplication(messages);
      const round1Users = result.filter(
        m => m.role === MessageRoles.USER && m.metadata?.roundNumber === 1,
      );

      expect(round1Users).toHaveLength(1);
      expect(round1Users[0].id).toBe('optimistic-user-1');

      // CRITICAL: Message must be in final render output
      expect(result.some(m => m.id === 'optimistic-user-1')).toBe(true);
    });

    it('should replace optimistic with DB message when DB message comes after', () => {
      const messages: UIMessage[] = [
        createUserMessage('thread_r0_user', 0, 'Round 0'),
        createAssistantMessage('thread_r0_p0', 0),
        createUserMessage('optimistic-user-1', 1, 'Round 1'),
        createUserMessage('thread_r1_user', 1, 'Round 1'),
      ];

      const result = simulateDeduplication(messages);
      const round1Users = result.filter(
        m => m.role === MessageRoles.USER && m.metadata?.roundNumber === 1,
      );

      expect(round1Users).toHaveLength(1);
      expect(round1Users[0].id).toBe('thread_r1_user');

      // CRITICAL: User message STILL visible, just with different ID
      expect(result.some(m => m.role === MessageRoles.USER && m.metadata?.roundNumber === 1)).toBe(
        true,
      );
      expect(result.some(m => m.id === 'thread_r1_user')).toBe(true);
    });

    it('should skip optimistic when DB message comes first (BUG SCENARIO)', () => {
      // This is the problematic ordering that could happen with race conditions
      const messages: UIMessage[] = [
        createUserMessage('thread_r0_user', 0, 'Round 0'),
        createAssistantMessage('thread_r0_p0', 0),
        createUserMessage('thread_r1_user', 1, 'Round 1'), // DB message FIRST
        createUserMessage('optimistic-user-1', 1, 'Round 1'), // Optimistic SECOND
      ];

      const result = simulateDeduplication(messages);
      const round1Users = result.filter(
        m => m.role === MessageRoles.USER && m.metadata?.roundNumber === 1,
      );

      // Should have exactly 1 user message for round 1
      expect(round1Users).toHaveLength(1);
      // Should be the DB message
      expect(round1Users[0].id).toBe('thread_r1_user');

      // CRITICAL: User message MUST still be visible (not removed completely)
      expect(result.some(m => m.role === MessageRoles.USER && m.metadata?.roundNumber === 1)).toBe(
        true,
      );
    });
  });

  describe('immediate Visibility After Submission', () => {
    it('should have user message visible immediately after optimistic add (no duplicates in store)', () => {
      // Simulate state IMMEDIATELY after handleUpdateThreadAndSend adds optimistic message
      const messages: UIMessage[] = [
        createUserMessage('thread_r0_user', 0, 'Round 0'),
        createAssistantMessage('thread_r0_p0', 0),
        createAssistantMessage('thread_r0_p1', 0),
        createUserMessage('optimistic-user-1', 1, 'Follow-up'), // Just added
      ];

      const result = simulateDeduplication(messages);

      // Round 1 should have the optimistic user message
      const round1Users = result.filter(
        m => m.role === MessageRoles.USER && m.metadata?.roundNumber === 1,
      );
      expect(round1Users).toHaveLength(1);
      expect(round1Users[0].parts[0]).toEqual({ type: 'text', text: 'Follow-up' });
    });

    it('should preserve user message order within timeline item', () => {
      const messages: UIMessage[] = [
        createUserMessage('optimistic-user-1', 1, 'Round 1 question'),
      ];

      const result = simulateDeduplication(messages);

      expect(result).toHaveLength(1);
      expect(result[0].role).toBe(MessageRoles.USER);
      expect(result[0].metadata?.roundNumber).toBe(1);
    });
  });

  describe('edge Cases', () => {
    it('should handle empty messages', () => {
      const result = simulateDeduplication([]);
      expect(result).toHaveLength(0);
    });

    it('should handle single optimistic message for round 0', () => {
      const messages: UIMessage[] = [
        createUserMessage('optimistic-user-0', 0, 'First question'),
      ];

      const result = simulateDeduplication(messages);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('optimistic-user-0');
    });

    it('should not affect assistant messages deduplication', () => {
      const messages: UIMessage[] = [
        createUserMessage('thread_r0_user', 0, 'Round 0'),
        createAssistantMessage('thread_r0_p0', 0),
        createUserMessage('optimistic-user-1', 1, 'Round 1'),
        createAssistantMessage('stream_r1_p0', 1),
      ];

      const result = simulateDeduplication(messages);

      // Should have both assistant messages
      const assistants = result.filter(m => m.role === MessageRoles.ASSISTANT);
      expect(assistants).toHaveLength(2);
    });
  });

  describe('visibility Guarantees - Messages Never Disappear', () => {
    it('gUARANTEE: user message for round N always visible after submission', () => {
      // Test all rounds 0-5
      for (let roundNum = 0; roundNum <= 5; roundNum++) {
        const messages: UIMessage[] = [];

        // Add completed previous rounds
        for (let r = 0; r < roundNum; r++) {
          messages.push(createUserMessage(`thread_r${r}_user`, r, `Round ${r}`));
          messages.push(createAssistantMessage(`thread_r${r}_p0`, r));
        }

        // Add optimistic for current round
        messages.push(createUserMessage(`optimistic-user-${roundNum}`, roundNum, `Round ${roundNum}`));

        const result = simulateDeduplication(messages);
        const userMsgForRound = result.find(
          m => m.role === MessageRoles.USER && m.metadata?.roundNumber === roundNum,
        );

        expect(userMsgForRound).toBeDefined();
        expect(userMsgForRound!.parts[0]).toEqual({ type: 'text', text: `Round ${roundNum}` });
      }
    });

    it('gUARANTEE: user message visible through ID transitions (optimistic -> DB)', () => {
      const roundNum = 1;

      // State 1: Optimistic only
      const state1 = [
        createUserMessage('thread_r0_user', 0, 'Q0'),
        createUserMessage('optimistic-user-1', roundNum, 'Q1'),
      ];
      const result1 = simulateDeduplication(state1);
      expect(result1.some(m => m.role === MessageRoles.USER && m.metadata?.roundNumber === roundNum)).toBe(true);

      // State 2: Both optimistic and DB (during transition)
      const state2 = [
        createUserMessage('thread_r0_user', 0, 'Q0'),
        createUserMessage('optimistic-user-1', roundNum, 'Q1'),
        createUserMessage('thread_r1_user', roundNum, 'Q1'),
      ];
      const result2 = simulateDeduplication(state2);
      expect(result2.some(m => m.role === MessageRoles.USER && m.metadata?.roundNumber === roundNum)).toBe(true);

      // State 3: DB only (after replacement)
      const state3 = [
        createUserMessage('thread_r0_user', 0, 'Q0'),
        createUserMessage('thread_r1_user', roundNum, 'Q1'),
      ];
      const result3 = simulateDeduplication(state3);
      expect(result3.some(m => m.role === MessageRoles.USER && m.metadata?.roundNumber === roundNum)).toBe(true);
    });

    it('gUARANTEE: deduplication never removes ALL user messages for a round', () => {
      // Even with duplicate messages, at least one should remain
      const messages: UIMessage[] = [
        createUserMessage('thread_r0_user', 0, 'Q0'),
        // Multiple duplicates for round 1
        createUserMessage('optimistic-user-1-a', 1, 'Q1'),
        createUserMessage('optimistic-user-1-b', 1, 'Q1'),
        createUserMessage('thread_r1_user', 1, 'Q1'),
        createUserMessage('optimistic-user-1-c', 1, 'Q1'),
      ];

      const result = simulateDeduplication(messages);
      const round1Users = result.filter(
        m => m.role === MessageRoles.USER && m.metadata?.roundNumber === 1,
      );

      // MUST have at least one user message
      expect(round1Users.length).toBeGreaterThanOrEqual(1);
      expect(round1Users[0].parts[0]).toEqual({ type: 'text', text: 'Q1' });
    });

    it('gUARANTEE: message visibility independent of message order', () => {
      // Test different orderings of the same messages
      const orderings = [
        // Order 1: Optimistic first
        [
          createUserMessage('optimistic-user-1', 1, 'Q1'),
          createUserMessage('thread_r1_user', 1, 'Q1'),
        ],
        // Order 2: DB first
        [
          createUserMessage('thread_r1_user', 1, 'Q1'),
          createUserMessage('optimistic-user-1', 1, 'Q1'),
        ],
        // Order 3: With assistant messages interleaved
        [
          createAssistantMessage('thread_r0_p0', 0),
          createUserMessage('optimistic-user-1', 1, 'Q1'),
          createAssistantMessage('thread_r1_p0', 1),
          createUserMessage('thread_r1_user', 1, 'Q1'),
        ],
      ];

      orderings.forEach((messages, index) => {
        const result = simulateDeduplication(messages);
        const round1User = result.find(
          m => m.role === MessageRoles.USER && m.metadata?.roundNumber === 1,
        );

        expect(round1User).toBeDefined();
        expect(round1User!.parts[0]).toEqual({ type: 'text', text: 'Q1' });
      });
    });

    it('gUARANTEE: concurrent round submissions maintain visibility for all rounds', () => {
      // Simulate rapid consecutive submissions
      const messages: UIMessage[] = [
        createUserMessage('thread_r0_user', 0, 'Q0'),
        createAssistantMessage('thread_r0_p0', 0),
        // Round 1 submitted
        createUserMessage('optimistic-user-1', 1, 'Q1'),
        // Round 2 submitted before round 1 completes
        createUserMessage('optimistic-user-2', 2, 'Q2'),
        // Round 1 DB message arrives
        createUserMessage('thread_r1_user', 1, 'Q1'),
      ];

      const result = simulateDeduplication(messages);

      // ALL rounds must have user messages
      const round0User = result.find(m => m.role === MessageRoles.USER && m.metadata?.roundNumber === 0);
      const round1User = result.find(m => m.role === MessageRoles.USER && m.metadata?.roundNumber === 1);
      const round2User = result.find(m => m.role === MessageRoles.USER && m.metadata?.roundNumber === 2);

      expect(round0User).toBeDefined();
      expect(round1User).toBeDefined();
      expect(round2User).toBeDefined();
    });
  });
});
