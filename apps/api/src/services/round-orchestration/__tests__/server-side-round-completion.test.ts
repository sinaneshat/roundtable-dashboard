/**
 * Server-Side Round Completion Tests
 *
 * Tests for the server-side round orchestration system that ensures rounds
 * complete properly even when:
 * - User refreshes page mid-stream
 * - Stream fails/times out
 * - User navigates away
 *
 * Key scenarios tested:
 * 1. Queue message type validation
 * 2. Check-round-completion handler logic
 * 3. Recovery attempts tracking (prevents infinite loops)
 * 4. Pre-search status tracking
 * 5. Staleness detection
 *
 * @see src/api/types/queues.ts - Queue message types
 * @see src/api/services/round-orchestration/round-orchestration.service.ts - Round state
 * @see src/workers/round-orchestration-queue.ts - Queue handlers
 */

import {
  CheckRoundCompletionReasons,
  RoundExecutionPhases,
  RoundExecutionStatuses,
  RoundOrchestrationMessageTypes,
} from '@roundtable/shared/enums';
import type { Mock } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CheckRoundCompletionQueueMessageSchema,
  TriggerPreSearchQueueMessageSchema,
} from '@/types/queues';

import type { RoundExecutionState } from '../round-orchestration.service';
import {
  incrementRecoveryAttempts,
  initializeRoundExecution,
  isRoundStale,
  RoundPreSearchStatuses,
  updatePreSearchStatus,
  updateRoundActivity,
} from '../round-orchestration.service';

// ============================================================================
// Test Setup
// ============================================================================

describe('server-side round completion', () => {
  let mockEnv: {
    KV: {
      get: Mock;
      put: Mock;
    };
  };

  let currentState: Record<string, string> = {};

  const getKey = (threadId: string, roundNumber: number) =>
    `round:execution:${threadId}:r${roundNumber}`;

  const getState = (threadId: string, roundNumber: number): RoundExecutionState | null => {
    const raw = currentState[getKey(threadId, roundNumber)];
    return raw ? JSON.parse(raw) : null;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    currentState = {};

    mockEnv = {
      KV: {
        get: vi.fn().mockImplementation(async (key: string, format?: string) => {
          const raw = currentState[key];
          if (!raw) {
            return null;
          }
          return format === 'json' ? JSON.parse(raw) : raw;
        }),
        put: vi.fn().mockImplementation(async (key: string, value: string) => {
          currentState[key] = value;
        }),
      },
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
    currentState = {};
  });

  // ==========================================================================
  // Queue Message Schema Validation
  // ==========================================================================

  describe('queue message schema validation', () => {
    describe('checkRoundCompletionQueueMessage', () => {
      it('validates correct message with stale_stream reason', () => {
        const message = {
          messageId: 'check-thread123-r0-123456',
          queuedAt: new Date().toISOString(),
          reason: CheckRoundCompletionReasons.STALE_STREAM,
          roundNumber: 0,
          sessionToken: 'a'.repeat(32), // Min 32 chars required
          threadId: 'thread123',
          type: RoundOrchestrationMessageTypes.CHECK_ROUND_COMPLETION,
          userId: 'user123',
        };

        const result = CheckRoundCompletionQueueMessageSchema.safeParse(message);
        expect(result.success).toBe(true);
      });

      it('validates correct message with resume_trigger reason', () => {
        const message = {
          messageId: 'check-thread123-r1-789',
          queuedAt: new Date().toISOString(),
          reason: CheckRoundCompletionReasons.RESUME_TRIGGER,
          roundNumber: 1,
          sessionToken: 'b'.repeat(32), // Min 32 chars required
          threadId: 'thread123',
          type: RoundOrchestrationMessageTypes.CHECK_ROUND_COMPLETION,
          userId: 'user456',
        };

        const result = CheckRoundCompletionQueueMessageSchema.safeParse(message);
        expect(result.success).toBe(true);
      });

      it('validates correct message with scheduled_check reason', () => {
        const message = {
          messageId: 'check-thread123-r2-999',
          queuedAt: new Date().toISOString(),
          reason: CheckRoundCompletionReasons.SCHEDULED_CHECK,
          roundNumber: 2,
          sessionToken: 'c'.repeat(32), // Min 32 chars required
          threadId: 'thread123',
          type: RoundOrchestrationMessageTypes.CHECK_ROUND_COMPLETION,
          userId: 'user789',
        };

        const result = CheckRoundCompletionQueueMessageSchema.safeParse(message);
        expect(result.success).toBe(true);
      });

      it('rejects message with invalid reason', () => {
        const message = {
          messageId: 'check-thread123-r0-123456',
          queuedAt: new Date().toISOString(),
          reason: 'invalid_reason',
          roundNumber: 0,
          threadId: 'thread123',
          type: RoundOrchestrationMessageTypes.CHECK_ROUND_COMPLETION,
          userId: 'user123',
        };

        const result = CheckRoundCompletionQueueMessageSchema.safeParse(message);
        expect(result.success).toBe(false);
      });

      it('rejects message with missing required fields', () => {
        const message = {
          threadId: 'thread123',
          type: RoundOrchestrationMessageTypes.CHECK_ROUND_COMPLETION,
          // Missing messageId, roundNumber, userId, reason, queuedAt
        };

        const result = CheckRoundCompletionQueueMessageSchema.safeParse(message);
        expect(result.success).toBe(false);
      });
    });

    describe('triggerPreSearchQueueMessage', () => {
      it('validates correct message without attachments', () => {
        const message = {
          messageId: 'trigger-thread123-r0-presearch',
          queuedAt: new Date().toISOString(),
          roundNumber: 0,
          sessionToken: 'd'.repeat(32), // Min 32 chars required
          threadId: 'thread123',
          type: RoundOrchestrationMessageTypes.TRIGGER_PRE_SEARCH,
          userId: 'user123',
          userQuery: 'What is the weather like?',
        };

        const result = TriggerPreSearchQueueMessageSchema.safeParse(message);
        expect(result.success).toBe(true);
      });

      it('validates correct message with attachments', () => {
        const message = {
          attachmentIds: ['attach1', 'attach2'],
          messageId: 'trigger-thread123-r0-presearch',
          queuedAt: new Date().toISOString(),
          roundNumber: 0,
          sessionToken: 'e'.repeat(32), // Min 32 chars required
          threadId: 'thread123',
          type: RoundOrchestrationMessageTypes.TRIGGER_PRE_SEARCH,
          userId: 'user123',
          userQuery: 'Analyze this document',
        };

        const result = TriggerPreSearchQueueMessageSchema.safeParse(message);
        expect(result.success).toBe(true);
        // Type narrowing after successful parse assertion
        const data = result.success ? result.data : null;
        expect(data?.attachmentIds).toEqual(['attach1', 'attach2']);
      });

      it('rejects message with missing userQuery', () => {
        const message = {
          messageId: 'trigger-thread123-r0-presearch',
          queuedAt: new Date().toISOString(),
          roundNumber: 0,
          threadId: 'thread123',
          type: RoundOrchestrationMessageTypes.TRIGGER_PRE_SEARCH,
          userId: 'user123',
        };

        const result = TriggerPreSearchQueueMessageSchema.safeParse(message);
        expect(result.success).toBe(false);
      });
    });
  });

  // ==========================================================================
  // Round Execution State - New Fields
  // ==========================================================================

  describe('round execution state - extended schema', () => {
    it('initializes state with pre-search tracking when web search enabled', async () => {
      await initializeRoundExecution(
        'thread-123',
        0,
        2,
        undefined,
        mockEnv as never,
        undefined,
        { enableWebSearch: true },
      );

      const state = getState('thread-123', 0);
      expect(state).not.toBeNull();
      expect(state?.preSearchStatus).toBe(RoundPreSearchStatuses.PENDING);
      expect(state?.preSearchId).toBeNull();
    });

    it('initializes state without pre-search when web search disabled', async () => {
      await initializeRoundExecution(
        'thread-123',
        0,
        2,
        undefined,
        mockEnv as never,
        undefined,
        { enableWebSearch: false },
      );

      const state = getState('thread-123', 0);
      expect(state).not.toBeNull();
      expect(state?.preSearchStatus).toBeNull();
    });

    it('initializes state with recovery tracking fields', async () => {
      await initializeRoundExecution(
        'thread-123',
        0,
        3,
        undefined,
        mockEnv as never,
      );

      const state = getState('thread-123', 0);
      expect(state).not.toBeNull();
      expect(state?.recoveryAttempts).toBe(0);
      expect(state?.maxRecoveryAttempts).toBe(3);
      expect(state?.lastActivityAt).toBeDefined();
    });

    it('initializes state with lastActivityAt timestamp', async () => {
      const beforeInit = new Date().toISOString();

      await initializeRoundExecution(
        'thread-123',
        0,
        2,
        undefined,
        mockEnv as never,
      );

      const state = getState('thread-123', 0);
      expect(state).not.toBeNull();
      if (!state) {
        throw new Error('State not found');
      }
      expect(state.lastActivityAt).toBeDefined();
      if (!state.lastActivityAt) {
        throw new Error('Last activity timestamp not set');
      }
      expect(new Date(state.lastActivityAt).getTime()).toBeGreaterThanOrEqual(
        new Date(beforeInit).getTime(),
      );
    });

    it('initializes state with existing pre-search ID', async () => {
      await initializeRoundExecution(
        'thread-123',
        0,
        2,
        undefined,
        mockEnv as never,
        undefined,
        { enableWebSearch: true, preSearchId: 'presearch-abc123' },
      );

      const state = getState('thread-123', 0);
      expect(state?.preSearchId).toBe('presearch-abc123');
    });
  });

  // ==========================================================================
  // Recovery Attempts Tracking
  // ==========================================================================

  describe('recovery attempts tracking', () => {
    it('increments recovery attempts counter', async () => {
      // Initialize state first
      await initializeRoundExecution(
        'thread-123',
        0,
        2,
        undefined,
        mockEnv as never,
      );

      const initialState = getState('thread-123', 0);
      expect(initialState?.recoveryAttempts).toBe(0);

      // Increment recovery attempts
      const result = await incrementRecoveryAttempts(
        'thread-123',
        0,
        mockEnv as never,
      );

      expect(result.canRecover).toBe(true);
      expect(result.attempts).toBe(1);
      expect(result.maxAttempts).toBe(3);

      const updatedState = getState('thread-123', 0);
      expect(updatedState?.recoveryAttempts).toBe(1);
    });

    it('allows recovery up to max attempts', async () => {
      await initializeRoundExecution(
        'thread-123',
        0,
        2,
        undefined,
        mockEnv as never,
      );

      // Increment 3 times (max attempts)
      let result = await incrementRecoveryAttempts('thread-123', 0, mockEnv as never);
      expect(result.canRecover).toBe(true);
      expect(result.attempts).toBe(1);

      result = await incrementRecoveryAttempts('thread-123', 0, mockEnv as never);
      expect(result.canRecover).toBe(true);
      expect(result.attempts).toBe(2);

      result = await incrementRecoveryAttempts('thread-123', 0, mockEnv as never);
      expect(result.canRecover).toBe(true);
      expect(result.attempts).toBe(3);
    });

    it('prevents recovery after max attempts exceeded', async () => {
      await initializeRoundExecution(
        'thread-123',
        0,
        2,
        undefined,
        mockEnv as never,
      );

      // Exhaust all recovery attempts
      await incrementRecoveryAttempts('thread-123', 0, mockEnv as never);
      await incrementRecoveryAttempts('thread-123', 0, mockEnv as never);
      await incrementRecoveryAttempts('thread-123', 0, mockEnv as never);

      // Fourth attempt should be denied
      const result = await incrementRecoveryAttempts('thread-123', 0, mockEnv as never);
      expect(result.canRecover).toBe(false);
      expect(result.attempts).toBe(4);
    });

    it('returns false for non-existent state', async () => {
      const result = await incrementRecoveryAttempts(
        'non-existent-thread',
        0,
        mockEnv as never,
      );

      expect(result.canRecover).toBe(false);
      expect(result.attempts).toBe(0);
    });

    it('updates lastActivityAt when incrementing attempts', async () => {
      await initializeRoundExecution(
        'thread-123',
        0,
        2,
        undefined,
        mockEnv as never,
      );

      const initialState = getState('thread-123', 0);
      const initialActivity = initialState?.lastActivityAt;

      // Small delay to ensure timestamp difference
      await new Promise((resolve) => {
        setTimeout(resolve, 10);
      });

      await incrementRecoveryAttempts('thread-123', 0, mockEnv as never);

      const updatedState = getState('thread-123', 0);
      expect(updatedState?.lastActivityAt).not.toBe(initialActivity);
    });
  });

  // ==========================================================================
  // Pre-Search Status Updates
  // ==========================================================================

  describe('pre-search status updates', () => {
    it('updates pre-search status to running', async () => {
      await initializeRoundExecution(
        'thread-123',
        0,
        2,
        undefined,
        mockEnv as never,
        undefined,
        { enableWebSearch: true },
      );

      await updatePreSearchStatus(
        'thread-123',
        0,
        RoundPreSearchStatuses.RUNNING,
        'presearch-123',
        mockEnv as never,
      );

      const state = getState('thread-123', 0);
      expect(state?.preSearchStatus).toBe(RoundPreSearchStatuses.RUNNING);
      expect(state?.preSearchId).toBe('presearch-123');
    });

    it('updates pre-search status to completed', async () => {
      await initializeRoundExecution(
        'thread-123',
        0,
        2,
        undefined,
        mockEnv as never,
        undefined,
        { enableWebSearch: true },
      );

      await updatePreSearchStatus(
        'thread-123',
        0,
        RoundPreSearchStatuses.COMPLETED,
        'presearch-123',
        mockEnv as never,
      );

      const state = getState('thread-123', 0);
      expect(state?.preSearchStatus).toBe(RoundPreSearchStatuses.COMPLETED);
    });

    it('updates pre-search status to failed', async () => {
      await initializeRoundExecution(
        'thread-123',
        0,
        2,
        undefined,
        mockEnv as never,
        undefined,
        { enableWebSearch: true },
      );

      await updatePreSearchStatus(
        'thread-123',
        0,
        RoundPreSearchStatuses.FAILED,
        'presearch-123',
        mockEnv as never,
      );

      const state = getState('thread-123', 0);
      expect(state?.preSearchStatus).toBe(RoundPreSearchStatuses.FAILED);
    });

    it('updates lastActivityAt when updating pre-search status', async () => {
      await initializeRoundExecution(
        'thread-123',
        0,
        2,
        undefined,
        mockEnv as never,
        undefined,
        { enableWebSearch: true },
      );

      const initialState = getState('thread-123', 0);
      const initialActivity = initialState?.lastActivityAt;

      await new Promise((resolve) => {
        setTimeout(resolve, 10);
      });

      await updatePreSearchStatus(
        'thread-123',
        0,
        RoundPreSearchStatuses.RUNNING,
        'presearch-123',
        mockEnv as never,
      );

      const updatedState = getState('thread-123', 0);
      expect(updatedState?.lastActivityAt).not.toBe(initialActivity);
    });
  });

  // ==========================================================================
  // Staleness Detection
  // ==========================================================================

  describe('staleness detection', () => {
    it('detects stale round when no activity for threshold duration', () => {
      const staleState: RoundExecutionState = {
        completedAt: null,
        completedParticipants: 0,
        error: null,
        failedParticipants: 0,
        lastActivityAt: new Date(Date.now() - 60_000).toISOString(), // 60s ago
        maxRecoveryAttempts: 3,
        moderatorStatus: null,
        participantStatuses: {},
        phase: RoundExecutionPhases.PARTICIPANTS,
        recoveryAttempts: 0,
        roundNumber: 0,
        startedAt: new Date(Date.now() - 60_000).toISOString(),
        status: RoundExecutionStatuses.RUNNING,
        threadId: 'thread-123',
        totalParticipants: 2,
        triggeredParticipants: [],
      };

      // Default threshold is 30s
      expect(isRoundStale(staleState)).toBe(true);
    });

    it('does not detect fresh round as stale', () => {
      const freshState: RoundExecutionState = {
        completedAt: null,
        completedParticipants: 0,
        error: null,
        failedParticipants: 0,
        lastActivityAt: new Date().toISOString(), // Just now
        maxRecoveryAttempts: 3,
        moderatorStatus: null,
        participantStatuses: {},
        phase: RoundExecutionPhases.PARTICIPANTS,
        recoveryAttempts: 0,
        roundNumber: 0,
        startedAt: new Date().toISOString(),
        status: RoundExecutionStatuses.RUNNING,
        threadId: 'thread-123',
        totalParticipants: 2,
        triggeredParticipants: [],
      };

      expect(isRoundStale(freshState)).toBe(false);
    });

    it('uses startedAt when lastActivityAt is missing', () => {
      const stateWithoutActivity: RoundExecutionState = {
        completedAt: null,
        completedParticipants: 0,
        error: null,
        failedParticipants: 0,
        maxRecoveryAttempts: 3,
        moderatorStatus: null,
        participantStatuses: {},
        phase: RoundExecutionPhases.PARTICIPANTS,
        // lastActivityAt missing
        recoveryAttempts: 0,
        roundNumber: 0,
        startedAt: new Date(Date.now() - 60_000).toISOString(), // 60s ago
        status: RoundExecutionStatuses.RUNNING,
        threadId: 'thread-123',
        totalParticipants: 2,
        triggeredParticipants: [],
      };

      expect(isRoundStale(stateWithoutActivity)).toBe(true);
    });

    it('respects custom stale threshold', () => {
      const state: RoundExecutionState = {
        completedAt: null,
        completedParticipants: 0,
        error: null,
        failedParticipants: 0,
        lastActivityAt: new Date(Date.now() - 15_000).toISOString(), // 15s ago
        maxRecoveryAttempts: 3,
        moderatorStatus: null,
        participantStatuses: {},
        phase: RoundExecutionPhases.PARTICIPANTS,
        recoveryAttempts: 0,
        roundNumber: 0,
        startedAt: new Date().toISOString(),
        status: RoundExecutionStatuses.RUNNING,
        threadId: 'thread-123',
        totalParticipants: 2,
        triggeredParticipants: [],
      };

      // With 10s threshold, should be stale
      expect(isRoundStale(state, 10_000)).toBe(true);

      // With 20s threshold, should not be stale
      expect(isRoundStale(state, 20_000)).toBe(false);
    });
  });

  // ==========================================================================
  // Activity Updates
  // ==========================================================================

  describe('activity updates', () => {
    it('updates lastActivityAt timestamp', async () => {
      await initializeRoundExecution(
        'thread-123',
        0,
        2,
        undefined,
        mockEnv as never,
      );

      const initialState = getState('thread-123', 0);
      const initialActivity = initialState?.lastActivityAt;

      await new Promise((resolve) => {
        setTimeout(resolve, 10);
      });

      await updateRoundActivity('thread-123', 0, mockEnv as never);

      const updatedState = getState('thread-123', 0);
      if (!updatedState) {
        throw new Error('Updated state not found');
      }
      expect(updatedState.lastActivityAt).not.toBe(initialActivity);
      if (!updatedState.lastActivityAt) {
        throw new Error('Updated activity timestamp not set');
      }
      if (!initialActivity) {
        throw new Error('Initial activity timestamp not set');
      }
      expect(new Date(updatedState.lastActivityAt).getTime()).toBeGreaterThan(
        new Date(initialActivity).getTime(),
      );
    });
  });
});
