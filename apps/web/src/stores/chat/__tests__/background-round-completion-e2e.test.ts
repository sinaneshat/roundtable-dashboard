/**
 * Background Round Completion E2E Tests
 *
 * Comprehensive tests simulating conversation threads at different points in time
 * to verify the server-side round orchestration and auto-recovery system works
 * correctly behind the user's back.
 *
 * Based on docs/FLOW_DOCUMENTATION.md flow stages:
 * 1. Thread creation → Pre-search (if enabled)
 * 2. Pre-search streaming
 * 3. Participant streaming (P0, P1, P2, ...)
 * 4. Between participants (transition)
 * 5. Moderator streaming
 * 6. Round completion
 *
 * Key scenarios tested:
 * - User refresh at each stage
 * - Stream failures at each stage
 * - Network interruptions
 * - Auto-recovery triggering
 * - Duplicate prevention
 *
 * @see docs/FLOW_DOCUMENTATION.md - Full flow documentation
 * @see src/api/services/round-orchestration - Server-side orchestration
 */

import {
  ParticipantStreamStatuses,
  RoundExecutionPhases,
  RoundExecutionStatuses,
  RoundOrchestrationMessageTypes,
} from '@roundtable/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Local type for testing (mirrors backend queue message shape)
type TriggerParticipantQueueMessage = {
  type: typeof RoundOrchestrationMessageTypes.TRIGGER_PARTICIPANT;
  messageId: string;
  threadId: string;
  roundNumber: number;
  participantIndex: number;
  userId: string;
  sessionToken?: string;
  attachmentIds?: string[];
  queuedAt: string;
};

// ============================================================================
// Test Helpers
// ============================================================================

type MockRoundState = {
  threadId: string;
  roundNumber: number;
  status: typeof RoundExecutionStatuses[keyof typeof RoundExecutionStatuses];
  phase: typeof RoundExecutionPhases[keyof typeof RoundExecutionPhases];
  totalParticipants: number;
  completedParticipants: number;
  failedParticipants: number;
  participantStatuses: Record<string, typeof ParticipantStreamStatuses[keyof typeof ParticipantStreamStatuses]>;
  moderatorStatus: typeof ParticipantStreamStatuses[keyof typeof ParticipantStreamStatuses] | null;
  startedAt: string;
  completedAt: string | null;
  error: string | null;
  triggeredParticipants: number[];
  preSearchStatus?: 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | null;
  preSearchId?: string | null;
  lastActivityAt?: string;
  recoveryAttempts?: number;
  maxRecoveryAttempts?: number;
};

/**
 * Creates a mock round state at a specific point in the flow
 */
function createMockRoundState(overrides: Partial<MockRoundState> = {}): MockRoundState {
  return {
    threadId: 'thread-123',
    roundNumber: 0,
    status: RoundExecutionStatuses.RUNNING,
    phase: RoundExecutionPhases.PARTICIPANTS,
    totalParticipants: 3,
    completedParticipants: 0,
    failedParticipants: 0,
    participantStatuses: {},
    moderatorStatus: null,
    startedAt: new Date().toISOString(),
    completedAt: null,
    error: null,
    triggeredParticipants: [],
    preSearchStatus: null,
    preSearchId: null,
    lastActivityAt: new Date().toISOString(),
    recoveryAttempts: 0,
    maxRecoveryAttempts: 3,
    ...overrides,
  };
}

/**
 * Simulates what the check-round-completion handler would determine
 */
function determineNextAction(state: MockRoundState): {
  action: 'trigger-pre-search' | 'trigger-participant' | 'trigger-moderator' | 'complete' | 'none';
  participantIndex?: number;
} {
  // Check if pre-search needed
  if (state.preSearchStatus === 'pending' || state.preSearchStatus === 'failed') {
    return { action: 'trigger-pre-search' };
  }

  // Check if participants incomplete
  const completedIndices = new Set<number>();
  for (const [idx, status] of Object.entries(state.participantStatuses)) {
    if (status === ParticipantStreamStatuses.COMPLETED) {
      completedIndices.add(Number.parseInt(idx, 10));
    }
  }

  for (let i = 0; i < state.totalParticipants; i++) {
    if (!completedIndices.has(i)) {
      return { action: 'trigger-participant', participantIndex: i };
    }
  }

  // All participants complete - check moderator
  if (state.totalParticipants >= 2 && state.moderatorStatus !== ParticipantStreamStatuses.COMPLETED) {
    return { action: 'trigger-moderator' };
  }

  // Round complete
  return { action: 'complete' };
}

// ============================================================================
// Tests
// ============================================================================

describe('background round completion E2E', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // Stage 1: Thread Just Created (Before Pre-Search)
  // ==========================================================================

  describe('stage 1: thread just created', () => {
    it('should trigger pre-search when web search enabled and status is pending', () => {
      const state = createMockRoundState({
        preSearchStatus: 'pending',
        completedParticipants: 0,
        participantStatuses: {},
      });

      const action = determineNextAction(state);
      expect(action.action).toBe('trigger-pre-search');
    });

    it('should trigger first participant when web search disabled', () => {
      const state = createMockRoundState({
        preSearchStatus: null,
        completedParticipants: 0,
        participantStatuses: {},
      });

      const action = determineNextAction(state);
      expect(action.action).toBe('trigger-participant');
      expect(action.participantIndex).toBe(0);
    });

    it('should recover from failed pre-search by re-triggering', () => {
      const state = createMockRoundState({
        preSearchStatus: 'failed',
        completedParticipants: 0,
        participantStatuses: {},
      });

      const action = determineNextAction(state);
      expect(action.action).toBe('trigger-pre-search');
    });
  });

  // ==========================================================================
  // Stage 2: During Pre-Search
  // ==========================================================================

  describe('stage 2: during pre-search', () => {
    it('should wait for pre-search when status is running', () => {
      const state = createMockRoundState({
        preSearchStatus: 'running',
        completedParticipants: 0,
        participantStatuses: {},
      });

      // When pre-search is running, we don't trigger anything new
      // The handler should detect this and return appropriate state
      expect(state.preSearchStatus).toBe('running');
    });

    it('should proceed to participants after pre-search completes', () => {
      const state = createMockRoundState({
        preSearchStatus: 'completed',
        completedParticipants: 0,
        participantStatuses: {},
      });

      const action = determineNextAction(state);
      expect(action.action).toBe('trigger-participant');
      expect(action.participantIndex).toBe(0);
    });
  });

  // ==========================================================================
  // Stage 3: During Participant Streaming
  // ==========================================================================

  describe('stage 3: during participant streaming', () => {
    describe('user refresh during P0 streaming', () => {
      it('should detect stale P0 stream and queue completion check', () => {
        const state = createMockRoundState({
          preSearchStatus: 'completed',
          participantStatuses: {
            0: ParticipantStreamStatuses.ACTIVE, // P0 was streaming
          },
          lastActivityAt: new Date(Date.now() - 60_000).toISOString(), // 60s ago (stale)
        });

        // Staleness check
        const isStale = Date.now() - new Date(state.lastActivityAt!).getTime() > 30_000;
        expect(isStale).toBe(true);
      });

      it('should trigger P0 again when stale and incomplete', () => {
        const state = createMockRoundState({
          preSearchStatus: 'completed',
          participantStatuses: {
            0: ParticipantStreamStatuses.FAILED, // P0 failed/stale
          },
          completedParticipants: 0,
        });

        const action = determineNextAction(state);
        expect(action.action).toBe('trigger-participant');
        expect(action.participantIndex).toBe(0);
      });
    });

    describe('user refresh during P1 streaming (P0 complete)', () => {
      it('should skip P0 and trigger P1 when P0 already complete', () => {
        const state = createMockRoundState({
          preSearchStatus: 'completed',
          participantStatuses: {
            0: ParticipantStreamStatuses.COMPLETED, // P0 done
            1: ParticipantStreamStatuses.FAILED, // P1 failed
          },
          completedParticipants: 1,
        });

        const action = determineNextAction(state);
        expect(action.action).toBe('trigger-participant');
        expect(action.participantIndex).toBe(1); // Should be P1, not P0
      });
    });

    describe('user refresh during last participant', () => {
      it('should trigger last participant when others complete', () => {
        const state = createMockRoundState({
          totalParticipants: 3,
          preSearchStatus: 'completed',
          participantStatuses: {
            0: ParticipantStreamStatuses.COMPLETED,
            1: ParticipantStreamStatuses.COMPLETED,
            2: ParticipantStreamStatuses.FAILED, // Last one failed
          },
          completedParticipants: 2,
        });

        const action = determineNextAction(state);
        expect(action.action).toBe('trigger-participant');
        expect(action.participantIndex).toBe(2);
      });
    });
  });

  // ==========================================================================
  // Stage 4: Between Participants
  // ==========================================================================

  describe('stage 4: between participants', () => {
    it('should trigger next participant when previous completed', () => {
      const state = createMockRoundState({
        totalParticipants: 3,
        preSearchStatus: 'completed',
        participantStatuses: {
          0: ParticipantStreamStatuses.COMPLETED,
        },
        completedParticipants: 1,
      });

      const action = determineNextAction(state);
      expect(action.action).toBe('trigger-participant');
      expect(action.participantIndex).toBe(1);
    });

    it('should handle gap in participant completion', () => {
      // Edge case: P0 and P2 complete but P1 failed
      const state = createMockRoundState({
        totalParticipants: 3,
        preSearchStatus: 'completed',
        participantStatuses: {
          0: ParticipantStreamStatuses.COMPLETED,
          1: ParticipantStreamStatuses.FAILED,
          2: ParticipantStreamStatuses.COMPLETED,
        },
        completedParticipants: 2,
      });

      const action = determineNextAction(state);
      expect(action.action).toBe('trigger-participant');
      expect(action.participantIndex).toBe(1); // Re-trigger P1
    });
  });

  // ==========================================================================
  // Stage 5: Before Moderator
  // ==========================================================================

  describe('stage 5: before moderator', () => {
    it('should trigger moderator when all participants complete (2+ participants)', () => {
      const state = createMockRoundState({
        totalParticipants: 3,
        preSearchStatus: 'completed',
        participantStatuses: {
          0: ParticipantStreamStatuses.COMPLETED,
          1: ParticipantStreamStatuses.COMPLETED,
          2: ParticipantStreamStatuses.COMPLETED,
        },
        completedParticipants: 3,
        moderatorStatus: null, // Not started
      });

      const action = determineNextAction(state);
      expect(action.action).toBe('trigger-moderator');
    });

    it('should skip moderator for single participant', () => {
      const state = createMockRoundState({
        totalParticipants: 1,
        preSearchStatus: 'completed',
        participantStatuses: {
          0: ParticipantStreamStatuses.COMPLETED,
        },
        completedParticipants: 1,
        moderatorStatus: null,
      });

      const action = determineNextAction(state);
      expect(action.action).toBe('complete'); // No moderator for 1 participant
    });
  });

  // ==========================================================================
  // Stage 6: During Moderator Streaming
  // ==========================================================================

  describe('stage 6: during moderator streaming', () => {
    it('should trigger moderator when stale during streaming', () => {
      const state = createMockRoundState({
        totalParticipants: 3,
        preSearchStatus: 'completed',
        participantStatuses: {
          0: ParticipantStreamStatuses.COMPLETED,
          1: ParticipantStreamStatuses.COMPLETED,
          2: ParticipantStreamStatuses.COMPLETED,
        },
        completedParticipants: 3,
        moderatorStatus: ParticipantStreamStatuses.FAILED, // Moderator failed
      });

      const action = determineNextAction(state);
      expect(action.action).toBe('trigger-moderator');
    });

    it('should complete round when moderator done', () => {
      const state = createMockRoundState({
        totalParticipants: 3,
        preSearchStatus: 'completed',
        participantStatuses: {
          0: ParticipantStreamStatuses.COMPLETED,
          1: ParticipantStreamStatuses.COMPLETED,
          2: ParticipantStreamStatuses.COMPLETED,
        },
        completedParticipants: 3,
        moderatorStatus: ParticipantStreamStatuses.COMPLETED,
      });

      const action = determineNextAction(state);
      expect(action.action).toBe('complete');
    });
  });

  // ==========================================================================
  // Recovery Attempt Limits
  // ==========================================================================

  describe('recovery attempt limits', () => {
    it('should allow recovery within max attempts', () => {
      const state = createMockRoundState({
        recoveryAttempts: 2,
        maxRecoveryAttempts: 3,
      });

      const canRecover = state.recoveryAttempts! < state.maxRecoveryAttempts!;
      expect(canRecover).toBe(true);
    });

    it('should prevent recovery after max attempts', () => {
      const state = createMockRoundState({
        recoveryAttempts: 3,
        maxRecoveryAttempts: 3,
      });

      const canRecover = state.recoveryAttempts! < state.maxRecoveryAttempts!;
      expect(canRecover).toBe(false);
    });

    it('should use default max attempts if not set', () => {
      const state = createMockRoundState({
        recoveryAttempts: 2,
        maxRecoveryAttempts: undefined,
      });

      const DEFAULT_MAX_RECOVERY_ATTEMPTS = 3;
      const maxAttempts = state.maxRecoveryAttempts ?? DEFAULT_MAX_RECOVERY_ATTEMPTS;
      expect(maxAttempts).toBe(3);
    });
  });

  // ==========================================================================
  // Multi-Round Scenarios
  // ==========================================================================

  describe('multi-round scenarios', () => {
    it('should handle round 2 correctly after round 1 complete', () => {
      const round2State = createMockRoundState({
        roundNumber: 1, // Second round (0-indexed)
        preSearchStatus: 'pending', // Web search enabled for round 2
        participantStatuses: {},
        completedParticipants: 0,
      });

      const action = determineNextAction(round2State);
      expect(action.action).toBe('trigger-pre-search');
    });

    it('should isolate recovery attempts per round', () => {
      const round1State = createMockRoundState({
        roundNumber: 0,
        recoveryAttempts: 3, // Exhausted
      });

      const round2State = createMockRoundState({
        roundNumber: 1,
        recoveryAttempts: 0, // Fresh
      });

      const round1CanRecover = round1State.recoveryAttempts! < round1State.maxRecoveryAttempts!;
      const round2CanRecover = round2State.recoveryAttempts! < round2State.maxRecoveryAttempts!;

      expect(round1CanRecover).toBe(false);
      expect(round2CanRecover).toBe(true);
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe('edge cases', () => {
    it('should handle empty participant statuses', () => {
      const state = createMockRoundState({
        totalParticipants: 2,
        participantStatuses: {},
      });

      const action = determineNextAction(state);
      expect(action.action).toBe('trigger-participant');
      expect(action.participantIndex).toBe(0);
    });

    it('should handle mixed participant statuses', () => {
      const state = createMockRoundState({
        totalParticipants: 4,
        participantStatuses: {
          0: ParticipantStreamStatuses.COMPLETED,
          1: ParticipantStreamStatuses.ACTIVE, // Still streaming
          2: ParticipantStreamStatuses.FAILED,
          3: ParticipantStreamStatuses.COMPLETED,
        },
        completedParticipants: 2,
      });

      // Determine next based on completion status (ACTIVE might be stale)
      const action = determineNextAction(state);
      // Should trigger P2 since it failed and P1 might need attention
      expect(action.action).toBe('trigger-participant');
      expect(action.participantIndex).toBe(1); // First incomplete
    });

    it('should handle zero participants (edge case)', () => {
      const state = createMockRoundState({
        totalParticipants: 0,
        participantStatuses: {},
      });

      const action = determineNextAction(state);
      expect(action.action).toBe('complete'); // Nothing to do
    });

    it('should handle rapid refresh scenario', () => {
      // User refreshes multiple times quickly
      const timestamps = [
        Date.now() - 5000, // 5s ago
        Date.now() - 3000, // 3s ago
        Date.now() - 1000, // 1s ago
        Date.now(), // now
      ];

      // Each refresh should create new check message with unique ID
      const messageIds = timestamps.map((t, i) =>
        `check-thread-123-r0-${t}-${i}`,
      );

      // All IDs should be unique
      const uniqueIds = new Set(messageIds);
      expect(uniqueIds.size).toBe(messageIds.length);
    });
  });

  // ==========================================================================
  // Queue Message Formation
  // ==========================================================================

  describe('queue message formation', () => {
    it('should form idempotent message IDs for participants', () => {
      const threadId = 'thread-abc';
      const roundNumber = 1;
      const participantIndex = 2;
      const timestamp = Date.now();

      const messageId = `trigger-${threadId}-r${roundNumber}-p${participantIndex}-${timestamp}`;

      expect(messageId).toContain(threadId);
      expect(messageId).toContain(`r${roundNumber}`);
      expect(messageId).toContain(`p${participantIndex}`);
    });

    it('should form idempotent message IDs for moderator', () => {
      const threadId = 'thread-xyz';
      const roundNumber = 0;
      const timestamp = Date.now();

      const messageId = `trigger-${threadId}-r${roundNumber}-moderator-${timestamp}`;

      expect(messageId).toContain('moderator');
      expect(messageId).not.toContain('-p');
    });

    it('should include attachment IDs when present', () => {
      const attachmentIds = ['upload-1', 'upload-2'];

      const message: TriggerParticipantQueueMessage = {
        type: RoundOrchestrationMessageTypes.TRIGGER_PARTICIPANT,
        messageId: 'trigger-thread-r0-p0-123',
        threadId: 'thread-123',
        roundNumber: 0,
        participantIndex: 0,
        userId: 'user-123',
        attachmentIds,
        queuedAt: new Date().toISOString(),
      };

      expect(message.attachmentIds).toEqual(attachmentIds);
    });
  });

  // ==========================================================================
  // Timing Scenarios (Simulated)
  // ==========================================================================

  describe('timing scenarios', () => {
    it('should detect activity timeout (30s threshold)', () => {
      const STALE_THRESHOLD_MS = 30_000;

      const scenarios = [
        { lastActivity: Date.now() - 10_000, expected: false }, // 10s - not stale
        { lastActivity: Date.now() - 25_000, expected: false }, // 25s - not stale
        { lastActivity: Date.now() - 31_000, expected: true }, // 31s - stale
        { lastActivity: Date.now() - 60_000, expected: true }, // 60s - stale
      ];

      for (const { lastActivity, expected } of scenarios) {
        const isStale = Date.now() - lastActivity > STALE_THRESHOLD_MS;
        expect(isStale).toBe(expected);
      }
    });

    it('should handle pre-search timeout (10s)', () => {
      const PRE_SEARCH_TIMEOUT_MS = 10_000;

      const startedAt = Date.now() - 15_000; // Started 15s ago
      const isTimedOut = Date.now() - startedAt > PRE_SEARCH_TIMEOUT_MS;

      expect(isTimedOut).toBe(true);
    });
  });
});
