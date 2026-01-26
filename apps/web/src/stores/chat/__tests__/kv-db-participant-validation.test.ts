/**
 * KV/DB Participant Validation Tests
 *
 * Tests for the critical bug where KV participant statuses become out of sync
 * with actual DB messages during mid-stream page refresh.
 *
 * Bug Scenario:
 * 1. 3 participants (P0, P1, P2)
 * 2. P0 starts streaming
 * 3. Page refresh happens mid-stream (before P0's message is saved to DB)
 * 4. Stale detection marks P0 as FAILED in KV
 * 5. getNextParticipantToStream returns P1 (skipping P0)
 * 6. P0 never gets a response, breaking the conversation
 *
 * Fix: Cross-validate KV statuses against actual DB messages before
 * determining the next participant to trigger.
 */

import { FinishReasons, MessageRoles, ParticipantStreamStatuses } from '@roundtable/shared';
import { describe, expect, it } from 'vitest';

import { createMockParticipant, createTestAssistantMessage, createTestUserMessage } from '@/lib/testing';
import type { DbMessageMetadata } from '@/services/api';
import { isModeratorMessageMetadata } from '@/services/api';

// ============================================================================
// TEST TYPES
// ============================================================================

type KVParticipantStatuses = Record<number, typeof ParticipantStreamStatuses[keyof typeof ParticipantStreamStatuses]>;

type ThreadActiveStream = {
  threadId: string;
  streamId: string;
  roundNumber: number;
  participantIndex: number;
  totalParticipants: number;
  participantStatuses: KVParticipantStatuses;
  createdAt: string;
};

type DbMessage = ReturnType<typeof createTestUserMessage> | ReturnType<typeof createTestAssistantMessage>;

// ============================================================================
// TEST HELPERS
// ============================================================================

/**
 * Simulates getNextParticipantToStream (KV-only, before fix)
 * Returns next participant based only on KV statuses
 */
function getNextParticipantFromKV(
  activeStream: ThreadActiveStream,
): { participantIndex: number } | null {
  for (let i = 0; i < activeStream.totalParticipants; i++) {
    const status = activeStream.participantStatuses[i];
    // KV logic: return first participant that is ACTIVE or undefined (not yet started)
    if (status === ParticipantStreamStatuses.ACTIVE || status === undefined) {
      return { participantIndex: i };
    }
  }
  return null;
}

/**
 * Simulates getDbValidatedNextParticipant (after fix)
 * Cross-validates KV against actual DB messages
 */
function getDbValidatedNextParticipant(
  dbMessages: DbMessage[],
  totalParticipants: number,
  roundNumber: number,
): { participantIndex: number } | null {
  // Get participant indices that have actual DB messages (excluding moderator)
  const participantIndicesWithMessages = new Set<number>();

  for (const msg of dbMessages) {
    if (msg.role !== MessageRoles.ASSISTANT) {
      continue;
    }
    const metadata = msg.metadata as DbMessageMetadata | null;
    if (!metadata) {
      continue;
    }

    // Skip moderator messages
    if (isModeratorMessageMetadata(metadata)) {
      continue;
    }

    // Check round number
    if ('roundNumber' in metadata && metadata.roundNumber !== roundNumber) {
      continue;
    }

    // Get participant index
    if ('participantIndex' in metadata && typeof metadata.participantIndex === 'number') {
      participantIndicesWithMessages.add(metadata.participantIndex);
    }
  }

  // Find first participant without a DB message
  for (let i = 0; i < totalParticipants; i++) {
    if (!participantIndicesWithMessages.has(i)) {
      return { participantIndex: i };
    }
  }

  return null;
}

// ============================================================================
// BUG REPRODUCTION TESTS
// ============================================================================

describe('kV/DB Participant Mismatch Bug', () => {
  describe('bug Scenario: Mid-Stream Refresh Skips Participant', () => {
    it('reproduces bug when KV marks P0 FAILED but no DB message exists', () => {
      // Setup: 3 participants, P0 was streaming but page refreshed
      const activeStream: ThreadActiveStream = {
        createdAt: new Date(Date.now() - 60000).toISOString(), // 1 minute ago
        participantIndex: 0,
        // BUG STATE: P0 marked as FAILED (stale detection), but message was never saved
        participantStatuses: {
          0: ParticipantStreamStatuses.FAILED,
        },
        roundNumber: 0,
        streamId: 'stream-abc_r0_p0',
        threadId: 'thread-123',
        totalParticipants: 3,
      };

      // DB has NO messages for round 0 (P0's message was never saved)
      const dbMessages: DbMessage[] = [
        createTestUserMessage({ content: 'Test query', id: 'user-0', roundNumber: 0 }),
      ];

      // OLD BEHAVIOR (BUG): KV-only returns P1, skipping P0
      const kvResult = getNextParticipantFromKV(activeStream);
      expect(kvResult?.participantIndex).toBe(1); // BUG: Skips P0!

      // NEW BEHAVIOR (FIX): DB validation returns P0
      const dbValidatedResult = getDbValidatedNextParticipant(dbMessages, 3, 0);
      expect(dbValidatedResult?.participantIndex).toBe(0); // CORRECT: P0 needs to respond
    });

    it('reproduces bug when KV marks P0 COMPLETED but no DB message exists', () => {
      // Setup: Race condition where KV was updated but DB save failed
      const activeStream: ThreadActiveStream = {
        createdAt: new Date(Date.now() - 30000).toISOString(),
        participantIndex: 0,
        // BUG STATE: KV thinks P0 completed, but message save failed
        participantStatuses: {
          0: ParticipantStreamStatuses.COMPLETED,
        },
        roundNumber: 0,
        streamId: 'stream-abc_r0_p0',
        threadId: 'thread-123',
        totalParticipants: 3,
      };

      // DB has NO assistant messages (save failed/interrupted)
      const dbMessages: DbMessage[] = [
        createTestUserMessage({ content: 'Test query', id: 'user-0', roundNumber: 0 }),
      ];

      // OLD BEHAVIOR (BUG): KV-only returns P1
      const kvResult = getNextParticipantFromKV(activeStream);
      expect(kvResult?.participantIndex).toBe(1); // BUG: Skips P0!

      // NEW BEHAVIOR (FIX): DB validation returns P0
      const dbValidatedResult = getDbValidatedNextParticipant(dbMessages, 3, 0);
      expect(dbValidatedResult?.participantIndex).toBe(0); // CORRECT
    });

    it('reproduces bug when P0 message exists but P1 marked FAILED incorrectly', () => {
      // Setup: P0 completed, P1 was streaming but marked FAILED incorrectly
      const activeStream: ThreadActiveStream = {
        createdAt: new Date(Date.now() - 30000).toISOString(),
        participantIndex: 1,
        participantStatuses: {
          0: ParticipantStreamStatuses.COMPLETED,
          1: ParticipantStreamStatuses.FAILED, // BUG: Marked failed but no message
        },
        roundNumber: 0,
        streamId: 'stream-abc_r0_p1',
        threadId: 'thread-123',
        totalParticipants: 3,
      };

      // DB only has P0's message, not P1's
      const dbMessages: DbMessage[] = [
        createTestUserMessage({ content: 'Test query', id: 'user-0', roundNumber: 0 }),
        createTestAssistantMessage({
          content: 'P0 response',
          finishReason: FinishReasons.STOP,
          id: 'p0-msg',
          participantId: 'participant-0',
          participantIndex: 0,
          roundNumber: 0,
        }),
      ];

      // OLD BEHAVIOR (BUG): KV-only returns P2, skipping P1!
      const kvResult = getNextParticipantFromKV(activeStream);
      expect(kvResult?.participantIndex).toBe(2); // BUG: Skips P1!

      // NEW BEHAVIOR (FIX): DB validation returns P1
      const dbValidatedResult = getDbValidatedNextParticipant(dbMessages, 3, 0);
      expect(dbValidatedResult?.participantIndex).toBe(1); // CORRECT
    });
  });

  describe('correct Behavior: KV and DB In Sync', () => {
    it('returns correct next participant when KV and DB match', () => {
      // Setup: Normal case, P0 completed successfully
      const activeStream: ThreadActiveStream = {
        createdAt: new Date().toISOString(),
        participantIndex: 1,
        participantStatuses: {
          0: ParticipantStreamStatuses.COMPLETED,
          1: ParticipantStreamStatuses.ACTIVE,
        },
        roundNumber: 0,
        streamId: 'stream-abc_r0_p1',
        threadId: 'thread-123',
        totalParticipants: 3,
      };

      // DB has P0's message
      const dbMessages: DbMessage[] = [
        createTestUserMessage({ content: 'Test query', id: 'user-0', roundNumber: 0 }),
        createTestAssistantMessage({
          content: 'P0 response',
          finishReason: FinishReasons.STOP,
          id: 'p0-msg',
          participantId: 'participant-0',
          participantIndex: 0,
          roundNumber: 0,
        }),
      ];

      // Both methods return same result
      const kvResult = getNextParticipantFromKV(activeStream);
      const dbValidatedResult = getDbValidatedNextParticipant(dbMessages, 3, 0);

      expect(kvResult?.participantIndex).toBe(1);
      expect(dbValidatedResult?.participantIndex).toBe(1);
    });

    it('returns null when all participants have messages', () => {
      const dbMessages: DbMessage[] = [
        createTestUserMessage({ content: 'Test query', id: 'user-0', roundNumber: 0 }),
        createTestAssistantMessage({
          content: 'P0 response',
          finishReason: FinishReasons.STOP,
          id: 'p0-msg',
          participantId: 'participant-0',
          participantIndex: 0,
          roundNumber: 0,
        }),
        createTestAssistantMessage({
          content: 'P1 response',
          finishReason: FinishReasons.STOP,
          id: 'p1-msg',
          participantId: 'participant-1',
          participantIndex: 1,
          roundNumber: 0,
        }),
        createTestAssistantMessage({
          content: 'P2 response',
          finishReason: FinishReasons.STOP,
          id: 'p2-msg',
          participantId: 'participant-2',
          participantIndex: 2,
          roundNumber: 0,
        }),
      ];

      const dbValidatedResult = getDbValidatedNextParticipant(dbMessages, 3, 0);
      expect(dbValidatedResult).toBeNull(); // All participants responded
    });

    it('excludes moderator messages from participant count', () => {
      const dbMessages: DbMessage[] = [
        createTestUserMessage({ content: 'Test query', id: 'user-0', roundNumber: 0 }),
        createTestAssistantMessage({
          content: 'P0 response',
          finishReason: FinishReasons.STOP,
          id: 'p0-msg',
          participantId: 'participant-0',
          participantIndex: 0,
          roundNumber: 0,
        }),
        // Moderator message (should be excluded)
        {
          id: 'moderator-msg',
          metadata: {
            finishReason: FinishReasons.STOP,
            hasError: false,
            isModerator: true,
            model: 'gpt-4',
            role: MessageRoles.ASSISTANT,
            roundNumber: 0,
            usage: { completionTokens: 50, promptTokens: 100, totalTokens: 150 },
          } satisfies DbMessageMetadata,
          parts: [{ text: 'Summary', type: 'text' as const }],
          role: MessageRoles.ASSISTANT as const,
        },
      ];

      // Should return P1 (moderator doesn't count as participant)
      const dbValidatedResult = getDbValidatedNextParticipant(dbMessages, 3, 0);
      expect(dbValidatedResult?.participantIndex).toBe(1);
    });
  });

  describe('edge Cases', () => {
    it('handles empty DB messages (fresh round)', () => {
      const dbMessages: DbMessage[] = [
        createTestUserMessage({ content: 'Test query', id: 'user-0', roundNumber: 0 }),
      ];

      const dbValidatedResult = getDbValidatedNextParticipant(dbMessages, 3, 0);
      expect(dbValidatedResult?.participantIndex).toBe(0); // Start from P0
    });

    it('handles single participant thread', () => {
      const dbMessages: DbMessage[] = [
        createTestUserMessage({ content: 'Test query', id: 'user-0', roundNumber: 0 }),
      ];

      const dbValidatedResult = getDbValidatedNextParticipant(dbMessages, 1, 0);
      expect(dbValidatedResult?.participantIndex).toBe(0);
    });

    it('handles participant with out-of-order indices in DB', () => {
      // P0 and P2 have messages, but P1 doesn't (should return P1)
      const dbMessages: DbMessage[] = [
        createTestUserMessage({ content: 'Test query', id: 'user-0', roundNumber: 0 }),
        createTestAssistantMessage({
          content: 'P0 response',
          finishReason: FinishReasons.STOP,
          id: 'p0-msg',
          participantId: 'participant-0',
          participantIndex: 0,
          roundNumber: 0,
        }),
        createTestAssistantMessage({
          content: 'P2 response',
          finishReason: FinishReasons.STOP,
          id: 'p2-msg',
          participantId: 'participant-2',
          participantIndex: 2,
          roundNumber: 0,
        }),
      ];

      const dbValidatedResult = getDbValidatedNextParticipant(dbMessages, 3, 0);
      expect(dbValidatedResult?.participantIndex).toBe(1); // P1 is missing
    });

    it('handles messages from different rounds correctly', () => {
      const dbMessages: DbMessage[] = [
        // Round 0 (complete)
        createTestUserMessage({ content: 'Round 0', id: 'user-0', roundNumber: 0 }),
        createTestAssistantMessage({
          content: 'P0 R0',
          finishReason: FinishReasons.STOP,
          id: 'p0-r0',
          participantId: 'participant-0',
          participantIndex: 0,
          roundNumber: 0,
        }),
        // Round 1 (in progress)
        createTestUserMessage({ content: 'Round 1', id: 'user-1', roundNumber: 1 }),
      ];

      // Query for round 1 should return P0 (no messages for round 1)
      const dbValidatedResult = getDbValidatedNextParticipant(dbMessages, 2, 1);
      expect(dbValidatedResult?.participantIndex).toBe(0);
    });
  });
});

// ============================================================================
// INTEGRATION SCENARIO TESTS
// ============================================================================

describe('mid-Stream Refresh Integration Scenarios', () => {
  const _participants = [
    createMockParticipant(0, { modelId: 'deepseek/deepseek-chat-v3' }),
    createMockParticipant(1, { modelId: 'openai/gpt-4.1-nano' }),
    createMockParticipant(2, { modelId: 'x-ai/grok-4-fast' }),
  ];

  it('scenario: Refresh during P0 streaming, P0 message never saved', () => {
    /**
     * Timeline:
     * 1. User submits query
     * 2. P0 (deepseek) starts streaming
     * 3. User refreshes page after 5 seconds
     * 4. Stale detection marks P0 as FAILED
     * 5. Server calculates nextParticipantToTrigger
     *
     * BUG: Without fix, server returns P1
     * FIX: Server validates against DB, returns P0
     */

    // State after stale detection
    const _kvState: ThreadActiveStream = {
      createdAt: new Date(Date.now() - 60000).toISOString(),
      participantIndex: 0,
      participantStatuses: { 0: ParticipantStreamStatuses.FAILED },
      roundNumber: 0,
      streamId: 'stream-xyz_r0_p0',
      threadId: 'thread-123',
      totalParticipants: 3,
    };

    // DB state (only user message, P0 never saved)
    const dbMessages: DbMessage[] = [
      createTestUserMessage({ content: 'Analyze market trends', id: 'user-0', roundNumber: 0 }),
    ];

    // Verify fix: DB validation returns P0
    const nextParticipant = getDbValidatedNextParticipant(dbMessages, 3, 0);
    expect(nextParticipant?.participantIndex).toBe(0);
  });

  it('scenario: Refresh between P0 complete and P1 start', () => {
    /**
     * Timeline:
     * 1. P0 completes successfully
     * 2. User refreshes before P1 starts
     * 3. KV shows P0 COMPLETED, P1 undefined
     * 4. Server calculates nextParticipantToTrigger
     *
     * Expected: Both KV and DB agree, return P1
     */

    const kvState1: ThreadActiveStream = {
      createdAt: new Date().toISOString(),
      participantIndex: 0,
      participantStatuses: { 0: ParticipantStreamStatuses.COMPLETED },
      roundNumber: 0,
      streamId: 'stream-xyz_r0_p0',
      threadId: 'thread-123',
      totalParticipants: 3,
    };

    const dbMessages: DbMessage[] = [
      createTestUserMessage({ content: 'Analyze market trends', id: 'user-0', roundNumber: 0 }),
      createTestAssistantMessage({
        content: 'Strategic analysis...',
        finishReason: FinishReasons.STOP,
        id: 'p0-msg',
        participantId: 'participant-0',
        participantIndex: 0,
        roundNumber: 0,
      }),
    ];

    // Both methods should agree
    const kvResult = getNextParticipantFromKV(kvState1);
    const dbResult = getDbValidatedNextParticipant(dbMessages, 3, 0);

    expect(kvResult?.participantIndex).toBe(1);
    expect(dbResult?.participantIndex).toBe(1);
  });

  it('scenario: Rapid refresh causing multiple stale detections', () => {
    /**
     * Timeline:
     * 1. P0 starts streaming
     * 2. User refreshes (stale → P0 FAILED)
     * 3. Resume triggers P0 again
     * 4. User refreshes again (stale → P0 FAILED again)
     * 5. Without fix: System might skip to P1
     * 6. With fix: System always returns P0 until message exists
     */

    // After multiple stale detections, KV might show P0 as FAILED
    const _kvState2: ThreadActiveStream = {
      createdAt: new Date(Date.now() - 30000).toISOString(),
      participantIndex: 0,
      participantStatuses: { 0: ParticipantStreamStatuses.FAILED },
      roundNumber: 0,
      streamId: 'stream-new_r0_p0',
      threadId: 'thread-123',
      totalParticipants: 3,
    };

    // Still no P0 message in DB
    const dbMessages: DbMessage[] = [
      createTestUserMessage({ content: 'Query', id: 'user-0', roundNumber: 0 }),
    ];

    // Fix ensures P0 is always returned until message exists
    const nextParticipant = getDbValidatedNextParticipant(dbMessages, 3, 0);
    expect(nextParticipant?.participantIndex).toBe(0);
  });

  it('scenario: All participants marked FAILED in KV but only P0 has message', () => {
    /**
     * Extreme edge case: KV corruption marks all as FAILED
     * DB only has P0's message
     * Fix: Return P1 (first without DB message)
     */

    const kvState3: ThreadActiveStream = {
      createdAt: new Date().toISOString(),
      participantIndex: 2,
      participantStatuses: {
        0: ParticipantStreamStatuses.FAILED,
        1: ParticipantStreamStatuses.FAILED,
        2: ParticipantStreamStatuses.FAILED,
      },
      roundNumber: 0,
      streamId: 'stream-xyz_r0_p2',
      threadId: 'thread-123',
      totalParticipants: 3,
    };

    const dbMessages: DbMessage[] = [
      createTestUserMessage({ content: 'Query', id: 'user-0', roundNumber: 0 }),
      createTestAssistantMessage({
        content: 'P0 response',
        finishReason: FinishReasons.STOP,
        id: 'p0-msg',
        participantId: 'participant-0',
        participantIndex: 0,
        roundNumber: 0,
      }),
    ];

    // KV-only would return null (all FAILED)
    const kvResult = getNextParticipantFromKV(kvState3);
    expect(kvResult).toBeNull();

    // DB validation returns P1 (first without message)
    const dbResult = getDbValidatedNextParticipant(dbMessages, 3, 0);
    expect(dbResult?.participantIndex).toBe(1);
  });
});
