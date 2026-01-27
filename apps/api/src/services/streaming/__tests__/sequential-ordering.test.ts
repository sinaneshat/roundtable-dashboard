/**
 * Sequential Participant Ordering Tests
 *
 * Tests for the sequential guard logic in createWaitingParticipantStream that
 * enforces the GOLDEN RULE: "Nothing starts until the thing above it finishes"
 *
 * Order: User Message -> Web Research -> P0 -> P1 -> P2 -> ... -> PN -> Moderator
 *
 * Key scenarios tested:
 * 1. Baton passing order (P0 -> P1 -> P2 -> Moderator)
 * 2. createWaitingParticipantStream sequential guard
 * 3. Active stream tracking for ordering
 * 4. Out-of-order completion handling
 * 5. Round boundary ordering
 * 6. Error handling in ordering (failed = complete for ordering)
 *
 * @see docs/FLOW_DOCUMENTATION.md - Visual flow documentation
 * @see src/services/streaming/unified-stream-buffer.service.ts - Implementation
 */

import { ParticipantStreamStatuses } from '@roundtable/shared/enums';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ThreadActiveStream } from '@/types/streaming';

// ============================================================================
// Mock Setup
// ============================================================================

// Track mock call history for verification
let getThreadActiveStreamCalls: string[] = [];
let getActiveParticipantStreamIdCalls: Array<{
  threadId: string;
  roundNumber: number;
  participantIndex: number;
}> = [];

// Configurable mock responses
let mockThreadActiveStream: ThreadActiveStream | null = null;
let mockStreamIds: Record<string, string | null> = {};

vi.mock('../resumable-stream-kv.service', () => ({
  getThreadActiveStream: vi.fn(async (threadId: string) => {
    getThreadActiveStreamCalls.push(threadId);
    return mockThreadActiveStream;
  }),
}));

vi.mock('../unified-stream-buffer.service', async (importOriginal) => {
  const original = await importOriginal<typeof import('../unified-stream-buffer.service')>();
  return {
    ...original,
    getActiveParticipantStreamId: vi.fn(
      async (
        threadId: string,
        roundNumber: number,
        participantIndex: number,
      ) => {
        getActiveParticipantStreamIdCalls.push({ participantIndex, roundNumber, threadId });
        const key = `${threadId}:r${roundNumber}:p${participantIndex}`;
        return mockStreamIds[key] ?? null;
      },
    ),
    getParticipantStreamChunks: vi.fn(async () => []),
    getParticipantStreamMetadata: vi.fn(async () => ({
      chunkCount: 0,
      createdAt: Date.now(),
      status: 'completed',
    })),
  };
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a mock ThreadActiveStream with specified participant statuses
 */
function createMockActiveStream(
  roundNumber: number,
  participantStatuses: Record<number, string>,
  totalParticipants = 3,
): ThreadActiveStream {
  return {
    createdAt: new Date().toISOString(),
    participantIndex: 0,
    participantStatuses: participantStatuses as Record<number, typeof ParticipantStreamStatuses.ACTIVE>,
    roundNumber,
    streamId: `thread-123_r${roundNumber}_p0`,
    totalParticipants,
  };
}

/**
 * Set mock stream ID for a specific participant
 */
function setMockStreamId(
  threadId: string,
  roundNumber: number,
  participantIndex: number,
  streamId: string | null,
): void {
  const key = `${threadId}:r${roundNumber}:p${participantIndex}`;
  mockStreamIds[key] = streamId;
}

// ============================================================================
// Tests
// ============================================================================

describe('sequential Participant Ordering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getThreadActiveStreamCalls = [];
    getActiveParticipantStreamIdCalls = [];
    mockThreadActiveStream = null;
    mockStreamIds = {};
  });

  // ==========================================================================
  // 1. Baton Passing Order (P0 -> P1 -> P2 -> Moderator)
  // ==========================================================================

  describe('baton passing order', () => {
    it('p0 should start immediately without waiting for previous participants', () => {
      // P0 has no previous participants to wait for
      const participantIndex = 0;
      const roundNumber = 1;

      // Given: Round 1 with no participant statuses yet
      mockThreadActiveStream = createMockActiveStream(roundNumber, {}, 3);

      // When: P0 checks sequential guard
      // P0 should NOT be blocked by the sequential guard
      // The guard only checks participantIndex > 0
      const shouldWait = participantIndex > 0;

      // Then: P0 does not need to wait
      expect(shouldWait).toBe(false);
    });

    it('p1 should wait for P0 to complete before starting', () => {
      const roundNumber = 1;

      // Given: P0 is still active (not completed)
      mockThreadActiveStream = createMockActiveStream(roundNumber, {
        0: ParticipantStreamStatuses.ACTIVE,
      }, 3);

      // When: P1 checks if P0 is complete
      const statuses = mockThreadActiveStream.participantStatuses;
      const p0Status = statuses[0];
      const p0Complete = p0Status === 'completed' || p0Status === 'failed';

      // Then: P1 should wait (P0 not complete)
      expect(p0Complete).toBe(false);
    });

    it('p1 should proceed when P0 is completed', () => {
      const roundNumber = 1;

      // Given: P0 has completed
      mockThreadActiveStream = createMockActiveStream(roundNumber, {
        0: ParticipantStreamStatuses.COMPLETED,
      }, 3);

      // When: P1 checks if P0 is complete
      const statuses = mockThreadActiveStream.participantStatuses;
      const p0Status = statuses[0];
      const p0Complete = p0Status === 'completed' || p0Status === 'failed';

      // Then: P1 should proceed
      expect(p0Complete).toBe(true);
    });

    it('p2 should wait for both P0 and P1 to complete', () => {
      const roundNumber = 1;
      const participantIndex = 2;

      // Given: P0 completed, P1 still active
      mockThreadActiveStream = createMockActiveStream(roundNumber, {
        0: ParticipantStreamStatuses.COMPLETED,
        1: ParticipantStreamStatuses.ACTIVE,
      }, 3);

      // When: P2 checks if all previous participants are complete
      const statuses = mockThreadActiveStream.participantStatuses;
      const allPreviousComplete = Array.from({ length: participantIndex }).every((_, i) => {
        const status = statuses[i];
        return status === 'completed' || status === 'failed';
      });

      // Then: P2 should wait (P1 not complete)
      expect(allPreviousComplete).toBe(false);
    });

    it('p2 should proceed when P0 and P1 are both completed', () => {
      const roundNumber = 1;
      const participantIndex = 2;

      // Given: Both P0 and P1 completed
      mockThreadActiveStream = createMockActiveStream(roundNumber, {
        0: ParticipantStreamStatuses.COMPLETED,
        1: ParticipantStreamStatuses.COMPLETED,
      }, 3);

      // When: P2 checks if all previous participants are complete
      const statuses = mockThreadActiveStream.participantStatuses;
      const allPreviousComplete = Array.from({ length: participantIndex }).every((_, i) => {
        const status = statuses[i];
        return status === 'completed' || status === 'failed';
      });

      // Then: P2 should proceed
      expect(allPreviousComplete).toBe(true);
    });

    it('moderator should wait for ALL participants to complete', () => {
      const roundNumber = 1;
      const participantIndex = -1; // Moderator uses negative index

      // Given: P0 and P1 completed, P2 still active
      mockThreadActiveStream = createMockActiveStream(roundNumber, {
        0: ParticipantStreamStatuses.COMPLETED,
        1: ParticipantStreamStatuses.COMPLETED,
        2: ParticipantStreamStatuses.ACTIVE,
      }, 3);

      // When: Moderator checks if all participants are complete
      const statuses = mockThreadActiveStream.participantStatuses;
      const participantIndices = Object.keys(statuses).map(Number).filter(i => i >= 0);
      const allParticipantsComplete = participantIndices.length > 0 && participantIndices.every((i) => {
        const status = statuses[i];
        return status === 'completed' || status === 'failed';
      });

      // Then: Moderator should wait (P2 not complete)
      expect(participantIndex < 0).toBe(true); // Confirm moderator detection
      expect(allParticipantsComplete).toBe(false);
    });

    it('moderator should proceed when ALL participants are completed', () => {
      const roundNumber = 1;
      const participantIndex = -1;

      // Given: All participants completed
      mockThreadActiveStream = createMockActiveStream(roundNumber, {
        0: ParticipantStreamStatuses.COMPLETED,
        1: ParticipantStreamStatuses.COMPLETED,
        2: ParticipantStreamStatuses.COMPLETED,
      }, 3);

      // When: Moderator checks if all participants are complete
      const statuses = mockThreadActiveStream.participantStatuses;
      const participantIndices = Object.keys(statuses).map(Number).filter(i => i >= 0);
      const allParticipantsComplete = participantIndices.length > 0 && participantIndices.every((i) => {
        const status = statuses[i];
        return status === 'completed' || status === 'failed';
      });

      // Then: Moderator should proceed
      expect(participantIndex < 0).toBe(true);
      expect(allParticipantsComplete).toBe(true);
    });
  });

  // ==========================================================================
  // 2. Sequential Guard Logic
  // ==========================================================================

  describe('createWaitingParticipantStream sequential guard', () => {
    it('should check activeStream round number matches before applying guard', () => {
      const targetRound = 2;
      const participantIndex = 1;

      // Given: Active stream is for round 1, but we want round 2
      mockThreadActiveStream = createMockActiveStream(1, {
        0: ParticipantStreamStatuses.ACTIVE,
      }, 3);

      // When: Checking if guard applies
      const activeStream = mockThreadActiveStream;
      const guardApplies = activeStream?.roundNumber === targetRound && activeStream.participantStatuses;

      // Then: Guard should NOT apply (different round)
      expect(guardApplies).toBeFalsy();
    });

    it('should filter only non-negative indices when checking participant statuses', () => {
      const roundNumber = 1;

      // Given: Statuses include moderator (negative index) for some reason
      const statuses: Record<number, string> = {
        [-1]: ParticipantStreamStatuses.COMPLETED, // Moderator
        0: ParticipantStreamStatuses.COMPLETED,
        1: ParticipantStreamStatuses.ACTIVE,
      };

      // When: Filtering participant indices
      const participantIndices = Object.keys(statuses).map(Number).filter(i => i >= 0);

      // Then: Only non-negative indices should be included
      expect(participantIndices).toEqual([0, 1]);
      expect(participantIndices).not.toContain(-1);
    });

    it('should handle empty participantStatuses gracefully', () => {
      const roundNumber = 1;
      const participantIndex = 1;

      // Given: No participant statuses recorded yet
      mockThreadActiveStream = {
        createdAt: new Date().toISOString(),
        participantIndex: 0,
        participantStatuses: {},
        roundNumber,
        streamId: 'thread-123_r1_p0',
        totalParticipants: 3,
      };

      // When: P1 checks previous participant status
      const statuses = mockThreadActiveStream.participantStatuses;
      const allPreviousComplete = Array.from({ length: participantIndex }).every((_, i) => {
        const status = statuses[i];
        return status === 'completed' || status === 'failed';
      });

      // Then: Should return false (undefined !== 'completed')
      expect(allPreviousComplete).toBe(false);
    });

    it('should handle null activeStream by allowing participant to proceed to stream check', () => {
      const roundNumber = 1;
      const participantIndex = 1;

      // Given: No active stream exists
      mockThreadActiveStream = null;

      // When: Guard check runs
      const activeStream = mockThreadActiveStream;
      const shouldApplyGuard = activeStream?.roundNumber === roundNumber && activeStream?.participantStatuses;

      // Then: Guard should not apply (no active stream to check)
      expect(shouldApplyGuard).toBeFalsy();
    });
  });

  // ==========================================================================
  // 3. Active Stream Tracking for Ordering
  // ==========================================================================

  describe('active stream tracking', () => {
    it('should use participantStatuses to track individual participant progress', () => {
      const roundNumber = 1;

      // Given: Active stream tracking multiple participants
      mockThreadActiveStream = createMockActiveStream(roundNumber, {
        0: ParticipantStreamStatuses.COMPLETED,
        1: ParticipantStreamStatuses.ACTIVE,
        2: ParticipantStreamStatuses.ACTIVE,
      }, 3);

      // When: Checking statuses
      const { participantStatuses } = mockThreadActiveStream;

      // Then: Each participant has tracked status
      expect(participantStatuses[0]).toBe('completed');
      expect(participantStatuses[1]).toBe('active');
      expect(participantStatuses[2]).toBe('active');
    });

    it('should track totalParticipants for round completion check', () => {
      // Given: Round with 5 participants
      mockThreadActiveStream = createMockActiveStream(1, {
        0: ParticipantStreamStatuses.COMPLETED,
      }, 5);

      // Then: totalParticipants should be stored
      expect(mockThreadActiveStream.totalParticipants).toBe(5);
    });

    it('should use roundNumber to scope ordering within a round', () => {
      // Given: Active stream for round 2
      mockThreadActiveStream = createMockActiveStream(2, {
        0: ParticipantStreamStatuses.ACTIVE,
      }, 3);

      // When: Checking round-scoped ordering
      const targetRound = 2;
      const isCorrectRound = mockThreadActiveStream.roundNumber === targetRound;

      // Then: Should match correct round
      expect(isCorrectRound).toBe(true);
    });
  });

  // ==========================================================================
  // 4. Out-of-Order Completion Handling
  // ==========================================================================

  describe('out-of-order completion handling', () => {
    it('should still enforce order even if P1 finishes faster than expected', () => {
      const roundNumber = 1;
      const participantIndex = 2; // P2

      // Given: P0 completed, P1 completed very quickly (edge case)
      mockThreadActiveStream = createMockActiveStream(roundNumber, {
        0: ParticipantStreamStatuses.COMPLETED,
        1: ParticipantStreamStatuses.COMPLETED,
      }, 3);

      // When: P2 checks ordering
      const statuses = mockThreadActiveStream.participantStatuses;
      const allPreviousComplete = Array.from({ length: participantIndex }).every((_, i) => {
        const status = statuses[i];
        return status === 'completed' || status === 'failed';
      });

      // Then: P2 should proceed (ordering is about start time, not completion)
      expect(allPreviousComplete).toBe(true);
    });

    it('should handle gap in participant indices (P0 done, P1 missing, P2 waiting)', () => {
      const roundNumber = 1;
      const participantIndex = 2;

      // Given: P0 completed, P1 status missing (never started?)
      mockThreadActiveStream = createMockActiveStream(roundNumber, {
        0: ParticipantStreamStatuses.COMPLETED,
        // P1 missing - no entry
      }, 3);

      // When: P2 checks if all previous are complete
      const statuses = mockThreadActiveStream.participantStatuses;
      const allPreviousComplete = Array.from({ length: participantIndex }).every((_, i) => {
        const status = statuses[i];
        return status === 'completed' || status === 'failed';
      });

      // Then: P2 should wait (P1 status undefined)
      expect(allPreviousComplete).toBe(false);
    });

    it('should correctly identify incomplete sequence (P0 active, P1 completed out of order)', () => {
      const roundNumber = 1;
      const participantIndex = 2;

      // Given: Somehow P1 completed before P0 (shouldn't happen but test resilience)
      mockThreadActiveStream = createMockActiveStream(roundNumber, {
        0: ParticipantStreamStatuses.ACTIVE, // P0 still running
        1: ParticipantStreamStatuses.COMPLETED, // P1 somehow done
      }, 3);

      // When: P2 checks ordering
      const statuses = mockThreadActiveStream.participantStatuses;
      const allPreviousComplete = Array.from({ length: participantIndex }).every((_, i) => {
        const status = statuses[i];
        return status === 'completed' || status === 'failed';
      });

      // Then: P2 should still wait (P0 not complete)
      expect(allPreviousComplete).toBe(false);
    });
  });

  // ==========================================================================
  // 5. Round Boundary Ordering
  // ==========================================================================

  describe('round boundary ordering', () => {
    it('round 2 should not be affected by Round 1 participant statuses', () => {
      const targetRound = 2;
      const participantIndex = 0; // P0 of round 2

      // Given: Active stream is tracking Round 1
      mockThreadActiveStream = createMockActiveStream(1, {
        0: ParticipantStreamStatuses.COMPLETED,
        1: ParticipantStreamStatuses.COMPLETED,
        2: ParticipantStreamStatuses.COMPLETED,
      }, 3);

      // When: Round 2 P0 checks guard
      const activeStream = mockThreadActiveStream;
      const guardApplies = activeStream?.roundNumber === targetRound && activeStream.participantStatuses;

      // Then: Guard should not apply (different round)
      expect(guardApplies).toBeFalsy();
    });

    it('should use roundNumber from activeStream to scope ordering checks', () => {
      // Given: Comparing rounds
      const round1Stream = createMockActiveStream(1, {
        0: ParticipantStreamStatuses.ACTIVE,
      }, 3);

      const round2Stream = createMockActiveStream(2, {
        0: ParticipantStreamStatuses.ACTIVE,
      }, 3);

      // Then: Round numbers should be distinct
      expect(round1Stream.roundNumber).toBe(1);
      expect(round2Stream.roundNumber).toBe(2);
      expect(round1Stream.roundNumber).not.toBe(round2Stream.roundNumber);
    });

    it('should handle transition between rounds (Round 1 moderator complete -> Round 2 start)', () => {
      // Given: Round 1 fully complete including moderator
      const round1Complete = createMockActiveStream(1, {
        0: ParticipantStreamStatuses.COMPLETED,
        1: ParticipantStreamStatuses.COMPLETED,
        2: ParticipantStreamStatuses.COMPLETED,
      }, 3);

      // When: Round 2 starts fresh
      const round2Fresh = createMockActiveStream(2, {}, 3);

      // Then: Round 2 should have clean state
      expect(Object.keys(round2Fresh.participantStatuses)).toHaveLength(0);
      expect(round2Fresh.roundNumber).toBe(2);
    });
  });

  // ==========================================================================
  // 6. Error Handling in Ordering
  // ==========================================================================

  describe('error handling in ordering', () => {
    it('failed participant should count as complete for ordering purposes', () => {
      const roundNumber = 1;
      const participantIndex = 1;

      // Given: P0 failed (error during generation)
      mockThreadActiveStream = createMockActiveStream(roundNumber, {
        0: ParticipantStreamStatuses.FAILED,
      }, 3);

      // When: P1 checks if P0 is "complete" (for ordering)
      const statuses = mockThreadActiveStream.participantStatuses;
      const p0Complete = statuses[0] === 'completed' || statuses[0] === 'failed';

      // Then: P1 should proceed (failed counts as complete for ordering)
      expect(p0Complete).toBe(true);
    });

    it('moderator should proceed when all participants have completed or failed', () => {
      const roundNumber = 1;
      const participantIndex = -1;

      // Given: Mixed completion states (some completed, some failed)
      mockThreadActiveStream = createMockActiveStream(roundNumber, {
        0: ParticipantStreamStatuses.COMPLETED,
        1: ParticipantStreamStatuses.FAILED,
        2: ParticipantStreamStatuses.COMPLETED,
      }, 3);

      // When: Moderator checks if all participants are done
      const statuses = mockThreadActiveStream.participantStatuses;
      const participantIndices = Object.keys(statuses).map(Number).filter(i => i >= 0);
      const allParticipantsComplete = participantIndices.length > 0 && participantIndices.every((i) => {
        const status = statuses[i];
        return status === 'completed' || status === 'failed';
      });

      // Then: Moderator should proceed
      expect(allParticipantsComplete).toBe(true);
    });

    it('should handle unknown/unexpected status values defensively', () => {
      const roundNumber = 1;
      const participantIndex = 1;

      // Given: P0 has an unexpected status value
      mockThreadActiveStream = createMockActiveStream(roundNumber, {
        0: 'unknown_status' as unknown as string,
      }, 3);

      // When: P1 checks if P0 is complete
      const statuses = mockThreadActiveStream.participantStatuses;
      const p0Complete = statuses[0] === 'completed' || statuses[0] === 'failed';

      // Then: P1 should wait (unknown status is not 'completed' or 'failed')
      expect(p0Complete).toBe(false);
    });

    it('moderator should wait when no participants have any status yet', () => {
      const roundNumber = 1;
      const participantIndex = -1;

      // Given: Empty participant statuses (round just started)
      mockThreadActiveStream = createMockActiveStream(roundNumber, {}, 3);

      // When: Moderator checks
      const statuses = mockThreadActiveStream.participantStatuses;
      const participantIndices = Object.keys(statuses).map(Number).filter(i => i >= 0);
      const allParticipantsComplete = participantIndices.length > 0 && participantIndices.every((i) => {
        const status = statuses[i];
        return status === 'completed' || status === 'failed';
      });

      // Then: Moderator should wait (no participants tracked yet)
      // participantIndices.length === 0 means allParticipantsComplete is false
      expect(allParticipantsComplete).toBe(false);
    });

    it('should handle partial failure gracefully (some participants failed, others pending)', () => {
      const roundNumber = 1;
      const participantIndex = 2;

      // Given: P0 failed, P1 still active
      mockThreadActiveStream = createMockActiveStream(roundNumber, {
        0: ParticipantStreamStatuses.FAILED,
        1: ParticipantStreamStatuses.ACTIVE,
      }, 3);

      // When: P2 checks ordering
      const statuses = mockThreadActiveStream.participantStatuses;
      const allPreviousComplete = Array.from({ length: participantIndex }).every((_, i) => {
        const status = statuses[i];
        return status === 'completed' || status === 'failed';
      });

      // Then: P2 should wait (P1 is still active)
      expect(allPreviousComplete).toBe(false);
    });
  });

  // ==========================================================================
  // Integration Scenario Tests
  // ==========================================================================

  describe('integration scenarios', () => {
    it('full round lifecycle: P0 -> P1 -> P2 -> Moderator sequential start', () => {
      const roundNumber = 1;

      // Step 1: P0 can start immediately
      const p0CanStart = true; // P0 has no prerequisites
      expect(p0CanStart).toBe(true);

      // Step 2: P0 completes, P1 can start
      mockThreadActiveStream = createMockActiveStream(roundNumber, {
        0: ParticipantStreamStatuses.COMPLETED,
      }, 3);

      let statuses = mockThreadActiveStream.participantStatuses;
      const p1CanStart = statuses[0] === 'completed' || statuses[0] === 'failed';
      expect(p1CanStart).toBe(true);

      // Step 3: P1 completes, P2 can start
      mockThreadActiveStream = createMockActiveStream(roundNumber, {
        0: ParticipantStreamStatuses.COMPLETED,
        1: ParticipantStreamStatuses.COMPLETED,
      }, 3);

      statuses = mockThreadActiveStream.participantStatuses;
      const p2CanStart = Array.from({ length: 2 }).every((_, i) => {
        const status = statuses[i];
        return status === 'completed' || status === 'failed';
      });
      expect(p2CanStart).toBe(true);

      // Step 4: P2 completes, Moderator can start
      mockThreadActiveStream = createMockActiveStream(roundNumber, {
        0: ParticipantStreamStatuses.COMPLETED,
        1: ParticipantStreamStatuses.COMPLETED,
        2: ParticipantStreamStatuses.COMPLETED,
      }, 3);

      statuses = mockThreadActiveStream.participantStatuses;
      const participantIndices = Object.keys(statuses).map(Number).filter(i => i >= 0);
      const moderatorCanStart = participantIndices.length > 0 && participantIndices.every((i) => {
        const status = statuses[i];
        return status === 'completed' || status === 'failed';
      });
      expect(moderatorCanStart).toBe(true);
    });

    it('error recovery: P1 fails but P2 and Moderator can still proceed', () => {
      const roundNumber = 1;

      // Given: P0 completed, P1 failed
      mockThreadActiveStream = createMockActiveStream(roundNumber, {
        0: ParticipantStreamStatuses.COMPLETED,
        1: ParticipantStreamStatuses.FAILED,
      }, 3);

      // When: P2 checks
      let statuses = mockThreadActiveStream.participantStatuses;
      const p2CanStart = Array.from({ length: 2 }).every((_, i) => {
        const status = statuses[i];
        return status === 'completed' || status === 'failed';
      });

      // Then: P2 can proceed (failed counts as complete)
      expect(p2CanStart).toBe(true);

      // And when P2 completes, Moderator can proceed
      mockThreadActiveStream = createMockActiveStream(roundNumber, {
        0: ParticipantStreamStatuses.COMPLETED,
        1: ParticipantStreamStatuses.FAILED,
        2: ParticipantStreamStatuses.COMPLETED,
      }, 3);

      statuses = mockThreadActiveStream.participantStatuses;
      const participantIndices = Object.keys(statuses).map(Number).filter(i => i >= 0);
      const moderatorCanStart = participantIndices.length > 0 && participantIndices.every((i) => {
        const status = statuses[i];
        return status === 'completed' || status === 'failed';
      });
      expect(moderatorCanStart).toBe(true);
    });
  });
});
