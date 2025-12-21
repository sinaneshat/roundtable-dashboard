/**
 * Cross-Round Message Deduplication Tests
 *
 * Tests deduplication logic that separates messages across rounds.
 * Ensures messages from round N don't incorrectly appear in round N+1,
 * and that deduplication correctly handles same participant across rounds.
 *
 * Key Scenarios Tested:
 * 1. Same message ID accidentally used across rounds (ID collision)
 * 2. Deduplication by (roundNumber, participantIndex) preserves round boundaries
 * 3. Similar messages in consecutive rounds don't cross-contaminate
 * 4. Optimistic messages replaced correctly per round
 * 5. Deterministic ID replacement doesn't affect other rounds
 * 6. Moderator messages properly isolated per round
 *
 * Related Files:
 * - src/components/chat/chat-message-list.tsx:643-779 - Deduplication logic
 * - src/lib/utils/metadata.ts:240-273 - getRoundNumber extraction
 * - src/stores/chat/utils/placeholder-factories.ts:164 - Optimistic ID generation
 */

import { describe, expect, it } from 'vitest';

import { FinishReasons, MessageRoles } from '@/api/core/enums';
import type { TestAssistantMessage, TestUserMessage } from '@/lib/testing';
import {
  createTestAssistantMessage,
  createTestModeratorMessage,
  createTestUserMessage,
} from '@/lib/testing';
import { getRoundNumber } from '@/lib/utils/metadata';

// ============================================================================
// DEDUPLICATION SIMULATION
// ============================================================================

/**
 * Simulates the deduplication logic from chat-message-list.tsx:643-779
 * This tests the actual algorithm used in production
 */
function deduplicateMessages(messages: Array<TestUserMessage | TestAssistantMessage>) {
  const seenMessageIds = new Set<string>();
  const seenAssistantMessages = new Set<string>();
  const _seenModeratorRounds = new Set<number>(); // Prefixed - reserved for moderator deduplication
  const result: typeof messages = [];

  for (const message of messages) {
    // Skip if we've already processed this exact message ID
    if (seenMessageIds.has(message.id)) {
      continue;
    }

    // For user messages
    if (message.role === MessageRoles.USER) {
      seenMessageIds.add(message.id);
      result.push(message);
    } else {
      // For assistant messages (participants), deduplicate by (roundNumber, participantIndex)
      const meta = message.metadata;
      const roundNum = meta.roundNumber;
      const participantIdx = meta.participantIndex;
      const participantId = meta.participantId;

      // Create a unique key for this participant's response in this round
      let dedupeKey: string | null = null;
      if (roundNum !== undefined && roundNum !== null) {
        if (participantId) {
          dedupeKey = `r${roundNum}_pid${participantId}`;
        } else if (participantIdx !== undefined && participantIdx !== null) {
          dedupeKey = `r${roundNum}_p${participantIdx}`;
        }
      }

      // Skip if we've already seen a message for this participant in this round
      if (dedupeKey && seenAssistantMessages.has(dedupeKey)) {
        // Prefer deterministic IDs over temp IDs
        const isDeterministicId = message.id.includes('_r') && message.id.includes('_p');
        if (!isDeterministicId) {
          // This is a temp ID message, skip it in favor of the DB message
          continue;
        }
        // This is a deterministic ID message - find and replace the temp ID message
        const existingTempIdx = result.findIndex((m) => {
          if (m.role !== MessageRoles.ASSISTANT)
            return false;
          const mMeta = m.metadata;
          const mRound = mMeta.roundNumber;
          const mPid = mMeta.participantId;
          const mIdx = mMeta.participantIndex;
          // Check if it's the same participant in the same round
          return mRound === roundNum
            && ((participantId && mPid === participantId)
              || (participantIdx !== undefined && mIdx === participantIdx));
        });
        if (existingTempIdx !== -1) {
          // Replace temp ID message with deterministic ID message
          result[existingTempIdx] = message;
          seenMessageIds.add(message.id);
          continue;
        }
      }

      if (dedupeKey) {
        seenAssistantMessages.add(dedupeKey);
      }
      seenMessageIds.add(message.id);
      result.push(message);
    }
  }

  return result;
}

// ============================================================================
// TEST HELPERS
// ============================================================================

/**
 * Groups deduplicated messages by round for verification
 */
function groupByRound(messages: Array<TestUserMessage | TestAssistantMessage>) {
  const rounds = new Map<number, typeof messages>();

  for (const msg of messages) {
    const round = getRoundNumber(msg.metadata) ?? 0;
    if (!rounds.has(round)) {
      rounds.set(round, []);
    }
    rounds.get(round)!.push(msg);
  }

  return rounds;
}

/**
 * Verifies no message from round N appears in round M
 */
function assertRoundIsolation(
  messages: Array<TestUserMessage | TestAssistantMessage>,
  round1: number,
  round2: number,
) {
  const byRound = groupByRound(messages);
  const round1Messages = byRound.get(round1) ?? [];
  const round2Messages = byRound.get(round2) ?? [];

  // No message IDs should overlap
  const round1Ids = new Set(round1Messages.map(m => m.id));
  const round2Ids = new Set(round2Messages.map(m => m.id));

  round1Ids.forEach((id) => {
    expect(round2Ids.has(id), `Message ${id} leaked from round ${round1} to round ${round2}`).toBe(false);
  });
}

// ============================================================================
// ID COLLISION TESTS
// ============================================================================

describe('cross-Round Message Deduplication', () => {
  describe('iD Collision Scenarios', () => {
    it('documents current behavior: same message ID used in different rounds gets deduplicated', () => {
      // CURRENT BEHAVIOR: seenMessageIds check on line 653 prevents same ID across ALL rounds
      // This means if a message ID collides across rounds, second occurrence is dropped
      const messages = [
        // Round 0
        createTestUserMessage({ id: 'user-msg', content: 'Q0', roundNumber: 0 }),
        createTestAssistantMessage({
          id: 'participant-response', // ⚠️ Non-unique ID across rounds
          content: 'Round 0 Response',
          roundNumber: 0,
          participantId: 'p0',
          participantIndex: 0,
          finishReason: FinishReasons.STOP,
        }),
        // Round 1
        createTestUserMessage({ id: 'user-msg-2', content: 'Q1', roundNumber: 1 }),
        createTestAssistantMessage({
          id: 'participant-response', // ⚠️ SAME ID, different round
          content: 'Round 1 Response',
          roundNumber: 1,
          participantId: 'p0',
          participantIndex: 0,
          finishReason: FinishReasons.STOP,
        }),
      ];

      const deduplicated = deduplicateMessages(messages);

      // CURRENT BEHAVIOR: Second message with 'participant-response' ID is dropped
      expect(deduplicated).toHaveLength(3); // Gets 3 (first ID occurrence wins)

      // Verify: round 1 is missing the assistant message
      const byRound = groupByRound(deduplicated);
      expect(byRound.get(0)?.length).toBe(2); // User + assistant
      expect(byRound.get(1)?.length).toBe(1); // Only user (assistant dropped)

      // The assistant message for round 1 was filtered out by seenMessageIds
      const round1Assistant = deduplicated.find(
        m => m.role === MessageRoles.ASSISTANT && getRoundNumber(m.metadata) === 1,
      );
      expect(round1Assistant).toBeUndefined(); // Dropped
    });

    it.todo('should keep both messages when ID collides across different rounds - KNOWN BUG: seenMessageIds deduplicates globally, second occurrence dropped by line 653 check');

    it('sHOULD preserve both messages when same participant ID pattern in consecutive rounds', () => {
      // Common pattern: participant-0, participant-1 used every round
      const messages = [
        // Round 0
        createTestUserMessage({ id: 'u0', content: 'Q0', roundNumber: 0 }),
        createTestAssistantMessage({
          id: 'thread_r0_p0', // Deterministic ID pattern
          content: 'Round 0, Participant 0',
          roundNumber: 0,
          participantId: 'participant-0',
          participantIndex: 0,
          finishReason: FinishReasons.STOP,
        }),
        createTestAssistantMessage({
          id: 'thread_r0_p1',
          content: 'Round 0, Participant 1',
          roundNumber: 0,
          participantId: 'participant-1',
          participantIndex: 1,
          finishReason: FinishReasons.STOP,
        }),
        // Round 1 - SAME PARTICIPANTS
        createTestUserMessage({ id: 'u1', content: 'Q1', roundNumber: 1 }),
        createTestAssistantMessage({
          id: 'thread_r1_p0', // Different round, same participant
          content: 'Round 1, Participant 0',
          roundNumber: 1,
          participantId: 'participant-0', // SAME participantId as round 0
          participantIndex: 0,
          finishReason: FinishReasons.STOP,
        }),
        createTestAssistantMessage({
          id: 'thread_r1_p1',
          content: 'Round 1, Participant 1',
          roundNumber: 1,
          participantId: 'participant-1', // SAME participantId as round 0
          participantIndex: 1,
          finishReason: FinishReasons.STOP,
        }),
      ];

      const deduplicated = deduplicateMessages(messages);

      // EXPECTED: All 6 messages kept (2 rounds × 3 messages each)
      expect(deduplicated).toHaveLength(6);

      // Verify round 0 integrity
      const round0 = deduplicated.filter(m => getRoundNumber(m.metadata) === 0);
      expect(round0).toHaveLength(3);
      expect(round0.filter(m => m.role === MessageRoles.USER)).toHaveLength(1);
      expect(round0.filter(m => m.role === MessageRoles.ASSISTANT)).toHaveLength(2);

      // Verify round 1 integrity
      const round1 = deduplicated.filter(m => getRoundNumber(m.metadata) === 1);
      expect(round1).toHaveLength(3);
      expect(round1.filter(m => m.role === MessageRoles.USER)).toHaveLength(1);
      expect(round1.filter(m => m.role === MessageRoles.ASSISTANT)).toHaveLength(2);

      // Verify no cross-contamination
      assertRoundIsolation(deduplicated, 0, 1);
    });
  });

  // ============================================================================
  // DEDUPLICATION KEY TESTS
  // ============================================================================

  describe('deduplication Key Isolation', () => {
    it('sHOULD use (roundNumber, participantIndex) as composite key', () => {
      // Test that dedupeKey correctly includes round number
      const messages = [
        createTestUserMessage({ id: 'u0', content: 'Q0', roundNumber: 0 }),
        createTestAssistantMessage({
          id: 'temp-gen-123',
          content: 'Streaming...',
          roundNumber: 0,
          participantId: 'p0',
          participantIndex: 0,
          finishReason: FinishReasons.UNKNOWN,
        }),
        createTestAssistantMessage({
          id: 'thread_r0_p0', // Deterministic ID
          content: 'Complete',
          roundNumber: 0,
          participantId: 'p0',
          participantIndex: 0,
          finishReason: FinishReasons.STOP,
        }),
        // Round 1 - DIFFERENT ROUND, SAME PARTICIPANT
        createTestUserMessage({ id: 'u1', content: 'Q1', roundNumber: 1 }),
        createTestAssistantMessage({
          id: 'thread_r1_p0', // Deterministic ID for round 1
          content: 'Round 1 Response',
          roundNumber: 1,
          participantId: 'p0', // SAME participant
          participantIndex: 0,
          finishReason: FinishReasons.STOP,
        }),
      ];

      const deduplicated = deduplicateMessages(messages);

      // EXPECTED:
      // - Round 0: temp-gen-123 replaced by thread_r0_p0 (deduplication within round)
      // - Round 1: thread_r1_p0 kept (different round, different dedupeKey)
      expect(deduplicated).toHaveLength(4); // 2 users + 2 assistants

      // Verify round 0 has only the deterministic ID
      const round0Assistants = deduplicated.filter(
        m => m.role === MessageRoles.ASSISTANT && getRoundNumber(m.metadata) === 0,
      );
      expect(round0Assistants).toHaveLength(1);
      expect(round0Assistants[0]?.id).toBe('thread_r0_p0');

      // Verify round 1 has its own message
      const round1Assistants = deduplicated.filter(
        m => m.role === MessageRoles.ASSISTANT && getRoundNumber(m.metadata) === 1,
      );
      expect(round1Assistants).toHaveLength(1);
      expect(round1Assistants[0]?.id).toBe('thread_r1_p0');
    });

    it('sHOULD NOT remove valid messages from round N+1 when deduplicating round N', () => {
      // Regression test: Ensure deduplication within round 0 doesn't affect round 1
      const messages = [
        // Round 0 - Two versions of same participant message (temp + real)
        createTestUserMessage({ id: 'u0', content: 'Q0', roundNumber: 0 }),
        createTestAssistantMessage({
          id: 'temp-p0-r0',
          content: 'Streaming R0...',
          roundNumber: 0,
          participantId: 'p0',
          participantIndex: 0,
          finishReason: FinishReasons.UNKNOWN,
        }),
        createTestAssistantMessage({
          id: 'db-p0-r0',
          content: 'Complete R0',
          roundNumber: 0,
          participantId: 'p0',
          participantIndex: 0,
          finishReason: FinishReasons.STOP,
        }),
        // Round 1 - Same participant, fresh message
        createTestUserMessage({ id: 'u1', content: 'Q1', roundNumber: 1 }),
        createTestAssistantMessage({
          id: 'db-p0-r1',
          content: 'Complete R1',
          roundNumber: 1,
          participantId: 'p0',
          participantIndex: 0,
          finishReason: FinishReasons.STOP,
        }),
      ];

      const deduplicated = deduplicateMessages(messages);

      // Verify round 1 message is NOT removed
      const round1Messages = deduplicated.filter(m => getRoundNumber(m.metadata) === 1);
      expect(round1Messages).toHaveLength(2); // user + assistant

      const round1Assistant = round1Messages.find(m => m.role === MessageRoles.ASSISTANT);
      expect(round1Assistant).toBeDefined();
      expect(round1Assistant?.id).toBe('db-p0-r1');
      expect(round1Assistant?.metadata.roundNumber).toBe(1);
    });
  });

  // ============================================================================
  // OPTIMISTIC MESSAGE TESTS
  // ============================================================================

  describe('optimistic Message Replacement Per Round', () => {
    it('documents current behavior: allows duplicate user messages in same round', () => {
      // CURRENT BEHAVIOR: User messages are NOT deduplicated by round
      // The deduplication ONLY filters by message ID (line 653)
      const messages = [
        // Round 0 - Optimistic user message
        createTestUserMessage({
          id: 'optimistic-user-0-12345',
          content: 'Question 0',
          roundNumber: 0,
        }),
        createTestAssistantMessage({
          id: 'thread_r0_p0',
          content: 'Response 0',
          roundNumber: 0,
          participantId: 'p0',
          participantIndex: 0,
          finishReason: FinishReasons.STOP,
        }),
        // Round 0 - Real user message arrives (different ID, so both kept)
        createTestUserMessage({
          id: 'db-user-0',
          content: 'Question 0',
          roundNumber: 0,
        }),
        // Round 1 - New optimistic message
        createTestUserMessage({
          id: 'optimistic-user-1-67890',
          content: 'Question 1',
          roundNumber: 1,
        }),
      ];

      const deduplicated = deduplicateMessages(messages);

      // CURRENT BEHAVIOR: Both user messages in round 0 are kept (different IDs)
      const round0Users = deduplicated.filter(
        m => m.role === MessageRoles.USER && getRoundNumber(m.metadata) === 0,
      );
      expect(round0Users).toHaveLength(2); // Both optimistic and real kept
    });

    it.todo('should deduplicate user messages within same round (prefer real over optimistic) - KNOWN BUG: user messages NOT deduplicated by round, both optimistic and real kept with different IDs');

    it('sHOULD handle optimistic assistant messages per round', () => {
      const messages = [
        // Round 0
        createTestUserMessage({ id: 'u0', content: 'Q0', roundNumber: 0 }),
        createTestAssistantMessage({
          id: 'thread_r0_p0',
          content: 'R0 P0',
          roundNumber: 0,
          participantId: 'p0',
          participantIndex: 0,
          finishReason: FinishReasons.STOP,
        }),
        // Round 1 - Optimistic
        createTestUserMessage({ id: 'u1', content: 'Q1', roundNumber: 1 }),
        createTestAssistantMessage({
          id: 'gen-temp-r1-p0', // Temp ID
          content: 'Streaming R1...',
          roundNumber: 1,
          participantId: 'p0',
          participantIndex: 0,
          finishReason: FinishReasons.UNKNOWN,
        }),
        // Round 1 - Real message arrives
        createTestAssistantMessage({
          id: 'thread_r1_p0', // Deterministic ID
          content: 'Complete R1',
          roundNumber: 1,
          participantId: 'p0',
          participantIndex: 0,
          finishReason: FinishReasons.STOP,
        }),
      ];

      const deduplicated = deduplicateMessages(messages);

      // Round 0 should be untouched
      const round0Assistant = deduplicated.find(
        m => m.role === MessageRoles.ASSISTANT && getRoundNumber(m.metadata) === 0,
      );
      expect(round0Assistant?.id).toBe('thread_r0_p0');

      // Round 1 should have deterministic ID (temp replaced)
      const round1Assistants = deduplicated.filter(
        m => m.role === MessageRoles.ASSISTANT && getRoundNumber(m.metadata) === 1,
      );
      expect(round1Assistants).toHaveLength(1);
      expect(round1Assistants[0]?.id).toBe('thread_r1_p0');
    });
  });

  // ============================================================================
  // MODERATOR MESSAGE TESTS
  // ============================================================================

  describe('moderator Message Isolation', () => {
    it('sHOULD keep moderator messages isolated per round', () => {
      const messages = [
        // Round 0
        createTestUserMessage({ id: 'u0', content: 'Q0', roundNumber: 0 }),
        createTestAssistantMessage({
          id: 'thread_r0_p0',
          content: 'Participant response',
          roundNumber: 0,
          participantId: 'p0',
          participantIndex: 0,
          finishReason: FinishReasons.STOP,
        }),
        createTestModeratorMessage({
          id: 'thread_r0_moderator',
          content: 'Round 0 summary',
          roundNumber: 0,
          finishReason: FinishReasons.STOP,
        }),
        // Round 1
        createTestUserMessage({ id: 'u1', content: 'Q1', roundNumber: 1 }),
        createTestAssistantMessage({
          id: 'thread_r1_p0',
          content: 'Participant response',
          roundNumber: 1,
          participantId: 'p0',
          participantIndex: 0,
          finishReason: FinishReasons.STOP,
        }),
        createTestModeratorMessage({
          id: 'thread_r1_moderator',
          content: 'Round 1 summary',
          roundNumber: 1,
          finishReason: FinishReasons.STOP,
        }),
      ];

      const deduplicated = deduplicateMessages(messages);

      // Both rounds should have their moderator messages
      expect(deduplicated).toHaveLength(6);

      const round0Moderator = deduplicated.find(m => m.id === 'thread_r0_moderator');
      const round1Moderator = deduplicated.find(m => m.id === 'thread_r1_moderator');

      expect(round0Moderator).toBeDefined();
      expect(getRoundNumber(round0Moderator!.metadata)).toBe(0);

      expect(round1Moderator).toBeDefined();
      expect(getRoundNumber(round1Moderator!.metadata)).toBe(1);
    });
  });

  // ============================================================================
  // MESSAGE ORDER PRESERVATION TESTS
  // ============================================================================

  describe('message Order Preservation', () => {
    it('sHOULD maintain correct order within each round after deduplication', () => {
      const messages = [
        // Round 0
        createTestUserMessage({ id: 'u0', content: 'Q0', roundNumber: 0 }),
        createTestAssistantMessage({
          id: 'thread_r0_p0',
          content: 'R0 P0',
          roundNumber: 0,
          participantId: 'p0',
          participantIndex: 0,
          finishReason: FinishReasons.STOP,
        }),
        createTestAssistantMessage({
          id: 'thread_r0_p1',
          content: 'R0 P1',
          roundNumber: 0,
          participantId: 'p1',
          participantIndex: 1,
          finishReason: FinishReasons.STOP,
        }),
        // Round 1 - Inserted out of order
        createTestAssistantMessage({
          id: 'thread_r1_p1',
          content: 'R1 P1',
          roundNumber: 1,
          participantId: 'p1',
          participantIndex: 1,
          finishReason: FinishReasons.STOP,
        }),
        createTestUserMessage({ id: 'u1', content: 'Q1', roundNumber: 1 }),
        createTestAssistantMessage({
          id: 'thread_r1_p0',
          content: 'R1 P0',
          roundNumber: 1,
          participantId: 'p0',
          participantIndex: 0,
          finishReason: FinishReasons.STOP,
        }),
      ];

      const deduplicated = deduplicateMessages(messages);

      // All messages should be kept
      expect(deduplicated).toHaveLength(6);

      // Verify round 0 order
      const round0Indices = deduplicated
        .map((m, idx) => ({ m, idx }))
        .filter(({ m }) => getRoundNumber(m.metadata) === 0)
        .map(({ idx }) => idx);

      expect(round0Indices).toEqual([0, 1, 2]); // Sequential

      // Verify round 1 messages exist (order may vary based on insertion)
      const round1Messages = deduplicated.filter(m => getRoundNumber(m.metadata) === 1);
      expect(round1Messages).toHaveLength(3);

      // Check all expected IDs present
      const round1Ids = new Set(round1Messages.map(m => m.id));
      expect(round1Ids.has('u1')).toBe(true);
      expect(round1Ids.has('thread_r1_p0')).toBe(true);
      expect(round1Ids.has('thread_r1_p1')).toBe(true);
    });

    it('sHOULD preserve insertion order when processing messages', () => {
      // Test that first occurrence is kept when IDs collide
      const messages = [
        createTestUserMessage({ id: 'u0', content: 'Q0', roundNumber: 0 }),
        createTestAssistantMessage({
          id: 'duplicate-id', // First occurrence - round 0
          content: 'First',
          roundNumber: 0,
          participantId: 'p0',
          participantIndex: 0,
          finishReason: FinishReasons.STOP,
        }),
        createTestUserMessage({ id: 'u1', content: 'Q1', roundNumber: 1 }),
        createTestAssistantMessage({
          id: 'duplicate-id', // Second occurrence - round 1 (should be dropped by seenMessageIds)
          content: 'Second',
          roundNumber: 1,
          participantId: 'p0',
          participantIndex: 0,
          finishReason: FinishReasons.STOP,
        }),
      ];

      const deduplicated = deduplicateMessages(messages);

      // First occurrence should be kept
      const duplicateMsg = deduplicated.find(m => m.id === 'duplicate-id');
      expect(duplicateMsg).toBeDefined();
      expect(duplicateMsg?.metadata.roundNumber).toBe(0);
      expect((duplicateMsg?.parts[0] as { text: string }).text).toBe('First');

      // Round 1 should only have user message
      const round1 = deduplicated.filter(m => getRoundNumber(m.metadata) === 1);
      expect(round1).toHaveLength(1); // Only user message
      expect(round1[0]?.role).toBe(MessageRoles.USER);
    });
  });

  // ============================================================================
  // EDGE CASES
  // ============================================================================

  describe('edge Cases', () => {
    it('sHOULD handle empty messages array', () => {
      const deduplicated = deduplicateMessages([]);
      expect(deduplicated).toEqual([]);
    });

    it('sHOULD handle single round', () => {
      const messages = [
        createTestUserMessage({ id: 'u0', content: 'Q0', roundNumber: 0 }),
        createTestAssistantMessage({
          id: 'thread_r0_p0',
          content: 'R0',
          roundNumber: 0,
          participantId: 'p0',
          participantIndex: 0,
          finishReason: FinishReasons.STOP,
        }),
      ];

      const deduplicated = deduplicateMessages(messages);
      expect(deduplicated).toHaveLength(2);
    });

    it('sHOULD handle many rounds with same participants', () => {
      const messages: Array<TestUserMessage | TestAssistantMessage> = [];

      // Create 10 rounds, each with 3 participants
      for (let round = 0; round < 10; round++) {
        messages.push(createTestUserMessage({
          id: `u${round}`,
          content: `Q${round}`,
          roundNumber: round,
        }));

        for (let p = 0; p < 3; p++) {
          messages.push(createTestAssistantMessage({
            id: `thread_r${round}_p${p}`,
            content: `R${round} P${p}`,
            roundNumber: round,
            participantId: `p${p}`,
            participantIndex: p,
            finishReason: FinishReasons.STOP,
          }));
        }
      }

      const deduplicated = deduplicateMessages(messages);

      // All messages should be kept (10 rounds × 4 messages)
      expect(deduplicated).toHaveLength(40);

      // Verify each round has correct count
      for (let round = 0; round < 10; round++) {
        const roundMessages = deduplicated.filter(m => getRoundNumber(m.metadata) === round);
        expect(roundMessages, `Round ${round} should have 4 messages`).toHaveLength(4);
      }
    });

    it('sHOULD handle missing metadata gracefully', () => {
      const messages = [
        createTestUserMessage({ id: 'u0', content: 'Q0', roundNumber: 0 }),
        {
          id: 'malformed',
          role: MessageRoles.ASSISTANT as const,
          parts: [{ type: 'text' as const, text: 'Malformed' }],
          metadata: {} as TestAssistantMessage['metadata'], // Intentionally incomplete for edge case test
        },
      ];

      // Should not crash, but behavior depends on getRoundNumber fallback
      const deduplicated = deduplicateMessages(messages as Array<TestUserMessage | TestAssistantMessage>);
      expect(deduplicated.length).toBeGreaterThanOrEqual(1); // At least user message
    });
  });
});
