/**
 * Background Completion Scenarios - Comprehensive Unit Tests
 *
 * Tests that rounds ALWAYS complete behind the scenes regardless of:
 * - When user navigates away (before P0, during P0, between participants, during moderator)
 * - Configuration (pre-search enabled, uploads attached, config changes)
 * - Number of participants (1, 2, 3, 4+)
 * - Which round (first round, subsequent rounds)
 *
 * These tests verify the round orchestration service correctly tracks state
 * and allows rounds to complete even when client disconnects.
 *
 * @see src/api/routes/chat/handlers/streaming.handler.ts - Server-side continuation in onFinish
 * @see src/api/services/round-orchestration - Round state tracking
 */

import { ParticipantStreamStatuses, RoundExecutionPhases, RoundExecutionStatuses } from '@roundtable/shared/enums';
import type { Mock } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  computeRoundStatus,
  getExistingRoundExecution,
  initializeRoundExecution,
  markModeratorCompleted,
  markModeratorFailed,
  markParticipantCompleted,
  markParticipantFailed,
  markParticipantStarted,
  markRoundFailed,
} from '../round-orchestration.service';

// ============================================================================
// Test Setup
// ============================================================================

describe('background Completion Scenarios', () => {
  let mockEnv: {
    KV: {
      get: Mock;
      put: Mock;
    };
  };

  let mockDb: {
    query: {
      chatMessage: {
        findMany: Mock;
      };
      chatParticipant: {
        findMany: Mock;
      };
    };
  };

  // Track state across operations for stateful tests
  let currentState: Record<string, string> = {};

  // Helper to get the correct KV key format
  const getKey = (threadId: string, roundNumber: number) =>
    `round:execution:${threadId}:r${roundNumber}`;

  // Helper to get parsed state from storage
  const getState = (threadId: string, roundNumber: number) => {
    const raw = currentState[getKey(threadId, roundNumber)];
    return raw ? JSON.parse(raw) : null;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    currentState = {};

    // Mock KV with stateful storage
    // Note: The service uses env.KV.get(key, 'json') which parses automatically
    mockEnv = {
      KV: {
        get: vi.fn().mockImplementation(async (key: string, format?: string) => {
          const raw = currentState[key];
          if (!raw) {
            return null;
          }
          // Service uses 'json' format which auto-parses
          return format === 'json' ? JSON.parse(raw) : raw;
        }),
        put: vi.fn().mockImplementation(async (key: string, value: string) => {
          currentState[key] = value;
        }),
      },
    };

    mockDb = {
      query: {
        chatMessage: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        chatParticipant: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      },
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================================================
  // Core Background Completion Tests
  // ============================================================================

  describe('core: Round State Transitions', () => {
    it('initializes round state correctly', async () => {
      const threadId = 'thread-init';
      const roundNumber = 0;

      const result = await initializeRoundExecution(threadId, roundNumber, 3, undefined, mockEnv as never);

      expect(result.status).toBe(RoundExecutionStatuses.RUNNING);
      expect(result.phase).toBe(RoundExecutionPhases.PARTICIPANTS);
      expect(result.totalParticipants).toBe(3);
      expect(mockEnv.KV.put).toHaveBeenCalledTimes(1);

      // Verify stored state
      const state = getState(threadId, roundNumber);
      expect(state.status).toBe(RoundExecutionStatuses.RUNNING);
      expect(state.totalParticipants).toBe(3);
      expect(state.completedParticipants).toBe(0);
    });

    it('tracks participant start correctly', async () => {
      const threadId = 'thread-start';
      const roundNumber = 0;

      // Initialize
      await initializeRoundExecution(threadId, roundNumber, 2, undefined, mockEnv as never);

      // Start P0
      await markParticipantStarted(threadId, roundNumber, 0, mockEnv as never);

      const state = getState(threadId, roundNumber);
      expect(state.triggeredParticipants).toContain(0);
      expect(state.participantStatuses['0']).toBe(ParticipantStreamStatuses.ACTIVE);
    });

    it('transitions to moderator phase when all participants complete', async () => {
      const threadId = 'thread-all-complete';
      const roundNumber = 0;

      // Initialize with 2 participants
      await initializeRoundExecution(threadId, roundNumber, 2, undefined, mockEnv as never);

      // Complete P0
      await markParticipantCompleted(threadId, roundNumber, 0, mockEnv as never);

      // Complete P1
      const result = await markParticipantCompleted(threadId, roundNumber, 1, mockEnv as never);

      expect(result.allParticipantsComplete).toBe(true);

      const state = getState(threadId, roundNumber);
      expect(state.phase).toBe(RoundExecutionPhases.MODERATOR);
    });

    it('completes round when moderator finishes', async () => {
      const threadId = 'thread-mod-complete';
      const roundNumber = 0;

      // Initialize
      await initializeRoundExecution(threadId, roundNumber, 2, undefined, mockEnv as never);

      // Complete participants
      await markParticipantCompleted(threadId, roundNumber, 0, mockEnv as never);
      await markParticipantCompleted(threadId, roundNumber, 1, mockEnv as never);

      // Complete moderator
      await markModeratorCompleted(threadId, roundNumber, mockEnv as never);

      const state = getState(threadId, roundNumber);
      expect(state.status).toBe(RoundExecutionStatuses.COMPLETED);
      expect(state.phase).toBe(RoundExecutionPhases.COMPLETE);
    });
  });

  // ============================================================================
  // Navigate Away Scenarios - State Persistence
  // ============================================================================

  describe('navigate Away: State persists for background completion', () => {
    it('state persists when user navigates away before P0 starts', async () => {
      const threadId = 'thread-nav-before-p0';
      const roundNumber = 0;

      // User starts round (initializes state)
      await initializeRoundExecution(threadId, roundNumber, 2, undefined, mockEnv as never);

      // User navigates away - state should still exist
      const state = getState(threadId, roundNumber);

      expect(state.status).toBe(RoundExecutionStatuses.RUNNING);
      expect(state.totalParticipants).toBe(2);
    });

    it('state persists when user navigates away during P0 streaming', async () => {
      const threadId = 'thread-nav-during-p0';
      const roundNumber = 0;

      // Initialize and start P0
      await initializeRoundExecution(threadId, roundNumber, 3, undefined, mockEnv as never);
      await markParticipantStarted(threadId, roundNumber, 0, mockEnv as never);

      // User navigates away - P0 still active in state
      let state = getState(threadId, roundNumber);
      expect(state.participantStatuses['0']).toBe(ParticipantStreamStatuses.ACTIVE);

      // Server continues P0, completes it
      await markParticipantCompleted(threadId, roundNumber, 0, mockEnv as never);

      state = getState(threadId, roundNumber);
      expect(state.participantStatuses['0']).toBe(ParticipantStreamStatuses.COMPLETED);
      expect(state.completedParticipants).toBe(1);
    });

    it('state persists when user navigates away between participants', async () => {
      const threadId = 'thread-nav-between';
      const roundNumber = 0;

      // Initialize and complete P0
      await initializeRoundExecution(threadId, roundNumber, 3, undefined, mockEnv as never);
      await markParticipantCompleted(threadId, roundNumber, 0, mockEnv as never);

      // User navigates away between P0 and P1
      let state = getState(threadId, roundNumber);

      expect(state.completedParticipants).toBe(1);
      expect(state.phase).toBe(RoundExecutionPhases.PARTICIPANTS);

      // Server continues with P1 and P2
      await markParticipantCompleted(threadId, roundNumber, 1, mockEnv as never);
      await markParticipantCompleted(threadId, roundNumber, 2, mockEnv as never);

      state = getState(threadId, roundNumber);
      expect(state.completedParticipants).toBe(3);
      expect(state.phase).toBe(RoundExecutionPhases.MODERATOR);
    });

    it('state persists when user navigates away before moderator', async () => {
      const threadId = 'thread-nav-before-mod';
      const roundNumber = 0;

      // Initialize and complete all participants
      await initializeRoundExecution(threadId, roundNumber, 2, undefined, mockEnv as never);
      await markParticipantCompleted(threadId, roundNumber, 0, mockEnv as never);
      await markParticipantCompleted(threadId, roundNumber, 1, mockEnv as never);

      // User navigates away before moderator
      let state = getState(threadId, roundNumber);

      expect(state.phase).toBe(RoundExecutionPhases.MODERATOR);
      expect(state.status).toBe(RoundExecutionStatuses.RUNNING);

      // Server completes moderator
      await markModeratorCompleted(threadId, roundNumber, mockEnv as never);

      state = getState(threadId, roundNumber);
      expect(state.status).toBe(RoundExecutionStatuses.COMPLETED);
    });

    it('state persists when user navigates away during moderator streaming', async () => {
      const threadId = 'thread-nav-during-mod';
      const roundNumber = 0;

      // Initialize, complete all participants
      await initializeRoundExecution(threadId, roundNumber, 2, undefined, mockEnv as never);
      await markParticipantCompleted(threadId, roundNumber, 0, mockEnv as never);
      await markParticipantCompleted(threadId, roundNumber, 1, mockEnv as never);

      // User navigates away during moderator
      // Server completes moderator
      await markModeratorCompleted(threadId, roundNumber, mockEnv as never);

      const state = getState(threadId, roundNumber);
      expect(state.status).toBe(RoundExecutionStatuses.COMPLETED);
      expect(state.phase).toBe(RoundExecutionPhases.COMPLETE);
    });
  });

  // ============================================================================
  // Single Participant (No Moderator)
  // ============================================================================

  describe('single Participant: No moderator needed', () => {
    it('completes round immediately for single participant', async () => {
      const threadId = 'thread-single';
      const roundNumber = 0;

      // Initialize with 1 participant
      await initializeRoundExecution(threadId, roundNumber, 1, undefined, mockEnv as never);

      // Complete P0
      const result = await markParticipantCompleted(threadId, roundNumber, 0, mockEnv as never);

      // Single participant = round complete (no moderator)
      expect(result.allParticipantsComplete).toBe(true);

      // Phase should still go to moderator phase, but for 1 participant
      // the streaming handler knows not to trigger moderator
      const state = getState(threadId, roundNumber);
      expect(state.completedParticipants).toBe(1);
    });
  });

  // ============================================================================
  // Participant Failures
  // ============================================================================

  describe('participant Failures: Round continues despite failures', () => {
    it('continues to next participant after failure', async () => {
      const threadId = 'thread-failure';
      const roundNumber = 0;

      await initializeRoundExecution(threadId, roundNumber, 3, undefined, mockEnv as never);

      // P0 fails
      await markParticipantFailed(threadId, roundNumber, 0, 'AI error', mockEnv as never);

      let state = getState(threadId, roundNumber);

      expect(state.failedParticipants).toBe(1);
      expect(state.participantStatuses['0']).toBe(ParticipantStreamStatuses.FAILED);
      // Round should still be running for remaining participants
      expect(state.status).toBe(RoundExecutionStatuses.RUNNING);

      // P1 succeeds
      await markParticipantCompleted(threadId, roundNumber, 1, mockEnv as never);

      state = getState(threadId, roundNumber);
      expect(state.completedParticipants).toBe(1);
      expect(state.failedParticipants).toBe(1);
    });

    it('triggers moderator even with some failures', async () => {
      const threadId = 'thread-mixed';
      const roundNumber = 0;

      await initializeRoundExecution(threadId, roundNumber, 3, undefined, mockEnv as never);

      // P0 succeeds, P1 fails, P2 succeeds
      await markParticipantCompleted(threadId, roundNumber, 0, mockEnv as never);
      await markParticipantFailed(threadId, roundNumber, 1, 'Error', mockEnv as never);
      const result = await markParticipantCompleted(threadId, roundNumber, 2, mockEnv as never);

      // All participants done (regardless of success/failure)
      expect(result.allParticipantsComplete).toBe(true);

      const state = getState(threadId, roundNumber);
      expect(state.phase).toBe(RoundExecutionPhases.MODERATOR);
    });

    it('handles all participants failing gracefully', async () => {
      const threadId = 'thread-all-fail';
      const roundNumber = 0;

      await initializeRoundExecution(threadId, roundNumber, 2, undefined, mockEnv as never);

      await markParticipantFailed(threadId, roundNumber, 0, 'Error', mockEnv as never);
      const result = await markParticipantFailed(threadId, roundNumber, 1, 'Error', mockEnv as never);

      expect(result.allParticipantsComplete).toBe(true);

      const state = getState(threadId, roundNumber);
      expect(state.failedParticipants).toBe(2);
      expect(state.phase).toBe(RoundExecutionPhases.MODERATOR);
    });
  });

  // ============================================================================
  // Multiple Rounds
  // ============================================================================

  describe('multiple Rounds: Independent tracking', () => {
    it('tracks round 0 and round 1 independently', async () => {
      const threadId = 'thread-multi';

      // Initialize round 0
      await initializeRoundExecution(threadId, 0, 2, undefined, mockEnv as never);
      await markParticipantCompleted(threadId, 0, 0, mockEnv as never);
      await markParticipantCompleted(threadId, 0, 1, mockEnv as never);
      await markModeratorCompleted(threadId, 0, mockEnv as never);

      // Initialize round 1
      await initializeRoundExecution(threadId, 1, 2, undefined, mockEnv as never);

      // Check both rounds have separate states
      const state0 = getState(threadId, 0);
      const state1 = getState(threadId, 1);

      expect(state0.status).toBe(RoundExecutionStatuses.COMPLETED);
      expect(state1.status).toBe(RoundExecutionStatuses.RUNNING);
    });
  });

  // ============================================================================
  // Status Computation
  // ============================================================================

  describe('status Computation: Accurate status at any point', () => {
    it('computes status from KV when available', async () => {
      const threadId = 'thread-status-kv';
      const roundNumber = 0;

      await initializeRoundExecution(threadId, roundNumber, 3, undefined, mockEnv as never);
      await markParticipantCompleted(threadId, roundNumber, 0, mockEnv as never);

      mockDb.query.chatParticipant.findMany.mockResolvedValue([
        { id: 'p0' },
        { id: 'p1' },
        { id: 'p2' },
      ]);

      const status = await computeRoundStatus({
        db: mockDb as never,
        env: mockEnv as never,
        roundNumber,
        threadId,
      });

      expect(status.status).toBe(RoundExecutionStatuses.RUNNING);
      expect(status.totalParticipants).toBe(3);
    });

    it('computes status from DB when KV not available', async () => {
      const threadId = 'thread-status-db';
      const roundNumber = 0;

      // No KV state - use empty env
      const emptyEnv = { KV: { get: vi.fn().mockResolvedValue(null), put: vi.fn() } };

      // DB has messages for completed participant
      mockDb.query.chatMessage.findMany.mockResolvedValue([
        {
          id: `${threadId}_r0_p0`,
          metadata: {},
          participantId: 'p0',
        },
      ]);
      mockDb.query.chatParticipant.findMany.mockResolvedValue([
        { id: 'p0' },
        { id: 'p1' },
      ]);

      const status = await computeRoundStatus({
        db: mockDb as never,
        env: emptyEnv as never,
        roundNumber,
        threadId,
      });

      // Should show incomplete - some messages but no KV state
      expect(status.status).toBe(RoundExecutionStatuses.INCOMPLETE);
    });

    it('returns completed status for zero participants', async () => {
      const threadId = 'thread-zero';
      const roundNumber = 0;

      const emptyEnv = { KV: { get: vi.fn().mockResolvedValue(null), put: vi.fn() } };
      mockDb.query.chatMessage.findMany.mockResolvedValue([]);
      mockDb.query.chatParticipant.findMany.mockResolvedValue([]);

      const status = await computeRoundStatus({
        db: mockDb as never,
        env: emptyEnv as never,
        roundNumber,
        threadId,
      });

      expect(status.isComplete).toBe(true);
    });
  });

  // ============================================================================
  // Critical Error Handling
  // ============================================================================

  describe('critical Errors: Round failure handling', () => {
    it('marks round as failed for critical errors', async () => {
      const threadId = 'thread-critical';
      const roundNumber = 0;

      await initializeRoundExecution(threadId, roundNumber, 2, undefined, mockEnv as never);
      await markRoundFailed(threadId, roundNumber, 'Critical system error', mockEnv as never);

      const state = getState(threadId, roundNumber);

      expect(state.status).toBe(RoundExecutionStatuses.FAILED);
      expect(state.error).toBe('Critical system error');
    });

    it('handles moderator failure gracefully', async () => {
      const threadId = 'thread-mod-fail';
      const roundNumber = 0;

      await initializeRoundExecution(threadId, roundNumber, 2, undefined, mockEnv as never);
      await markParticipantCompleted(threadId, roundNumber, 0, mockEnv as never);
      await markParticipantCompleted(threadId, roundNumber, 1, mockEnv as never);
      await markModeratorFailed(threadId, roundNumber, 'Moderator error', mockEnv as never);

      const state = getState(threadId, roundNumber);

      // Round is still considered "completed" even if moderator failed
      // (participants finished, moderator attempted)
      expect(state.status).toBe(RoundExecutionStatuses.COMPLETED);
      expect(state.phase).toBe(RoundExecutionPhases.COMPLETE);
    });
  });

  // ============================================================================
  // getExistingRoundExecution Behavior
  // ============================================================================

  describe('getExistingRoundExecution: Running state detection', () => {
    it('returns null for completed rounds', async () => {
      const threadId = 'thread-existing';
      const roundNumber = 0;

      await initializeRoundExecution(threadId, roundNumber, 2, undefined, mockEnv as never);
      await markParticipantCompleted(threadId, roundNumber, 0, mockEnv as never);
      await markParticipantCompleted(threadId, roundNumber, 1, mockEnv as never);
      await markModeratorCompleted(threadId, roundNumber, mockEnv as never);

      const existing = await getExistingRoundExecution(threadId, roundNumber, mockEnv as never);
      expect(existing).toBeNull();
    });

    it('returns state for running rounds', async () => {
      const threadId = 'thread-running';
      const roundNumber = 0;

      await initializeRoundExecution(threadId, roundNumber, 2, undefined, mockEnv as never);

      const existing = await getExistingRoundExecution(threadId, roundNumber, mockEnv as never);
      expect(existing).not.toBeNull();
      expect(existing?.status).toBe(RoundExecutionStatuses.RUNNING);
    });
  });

  // ============================================================================
  // Full Flow Tests
  // ============================================================================

  describe('full Flow: Complete round lifecycle', () => {
    it('completes 2-participant round fully', async () => {
      const threadId = 'thread-full-2';
      const roundNumber = 0;

      // Initialize
      await initializeRoundExecution(threadId, roundNumber, 2, undefined, mockEnv as never);

      // P0 starts and completes
      await markParticipantStarted(threadId, roundNumber, 0, mockEnv as never);
      await markParticipantCompleted(threadId, roundNumber, 0, mockEnv as never);

      // P1 starts and completes
      await markParticipantStarted(threadId, roundNumber, 1, mockEnv as never);
      const p1Result = await markParticipantCompleted(threadId, roundNumber, 1, mockEnv as never);

      expect(p1Result.allParticipantsComplete).toBe(true);

      // Moderator completes
      await markModeratorCompleted(threadId, roundNumber, mockEnv as never);

      const finalState = getState(threadId, roundNumber);

      expect(finalState.status).toBe(RoundExecutionStatuses.COMPLETED);
      expect(finalState.phase).toBe(RoundExecutionPhases.COMPLETE);
      expect(finalState.completedParticipants).toBe(2);
    });

    it('completes 3-participant round fully', async () => {
      const threadId = 'thread-full-3';
      const roundNumber = 0;

      await initializeRoundExecution(threadId, roundNumber, 3, undefined, mockEnv as never);

      // All participants complete
      await markParticipantCompleted(threadId, roundNumber, 0, mockEnv as never);
      await markParticipantCompleted(threadId, roundNumber, 1, mockEnv as never);
      const p2Result = await markParticipantCompleted(threadId, roundNumber, 2, mockEnv as never);

      expect(p2Result.allParticipantsComplete).toBe(true);

      // Moderator completes
      await markModeratorCompleted(threadId, roundNumber, mockEnv as never);

      const finalState = getState(threadId, roundNumber);

      expect(finalState.status).toBe(RoundExecutionStatuses.COMPLETED);
      expect(finalState.completedParticipants).toBe(3);
    });

    it('completes 4-participant round fully', async () => {
      const threadId = 'thread-full-4';
      const roundNumber = 0;

      await initializeRoundExecution(threadId, roundNumber, 4, undefined, mockEnv as never);

      // All participants complete
      await markParticipantCompleted(threadId, roundNumber, 0, mockEnv as never);
      await markParticipantCompleted(threadId, roundNumber, 1, mockEnv as never);
      await markParticipantCompleted(threadId, roundNumber, 2, mockEnv as never);
      const p3Result = await markParticipantCompleted(threadId, roundNumber, 3, mockEnv as never);

      expect(p3Result.allParticipantsComplete).toBe(true);

      // Moderator completes
      await markModeratorCompleted(threadId, roundNumber, mockEnv as never);

      const finalState = getState(threadId, roundNumber);

      expect(finalState.status).toBe(RoundExecutionStatuses.COMPLETED);
      expect(finalState.completedParticipants).toBe(4);
    });
  });

  // ============================================================================
  // Attachments: State Preservation
  // ============================================================================

  describe('attachments: State preservation', () => {
    it('preserves attachment IDs through round execution', async () => {
      const threadId = 'thread-attachments';
      const roundNumber = 0;
      const attachmentIds = ['att-1', 'att-2'];

      await initializeRoundExecution(threadId, roundNumber, 2, attachmentIds, mockEnv as never);

      const state = getState(threadId, roundNumber);
      expect(state.attachmentIds).toEqual(attachmentIds);

      // Complete round
      await markParticipantCompleted(threadId, roundNumber, 0, mockEnv as never);
      await markParticipantCompleted(threadId, roundNumber, 1, mockEnv as never);

      const finalState = getState(threadId, roundNumber);
      expect(finalState.attachmentIds).toEqual(attachmentIds);
    });
  });
});
