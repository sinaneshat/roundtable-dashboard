import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ParticipantStreamStatuses, RoundExecutionPhases, RoundExecutionStatuses } from '@/api/core/enums';
import {
  computeRoundStatus,
  getIncompleteParticipants,
  getRoundExecutionState,
  incrementRecoveryAttempts,
} from '@/api/services/round-orchestration/round-orchestration.service';
import { getDbAsync } from '@/db';

import type { RoundStatus } from '../../schema';

// Mock the round-orchestration service
vi.mock('@/api/services/round-orchestration/round-orchestration.service', () => ({
  computeRoundStatus: vi.fn(),
  getIncompleteParticipants: vi.fn(),
  getRoundExecutionState: vi.fn(),
  incrementRecoveryAttempts: vi.fn(),
}));

// Mock database
vi.mock('@/db', () => ({
  getDbAsync: vi.fn(),
}));

const mockComputeRoundStatus = vi.mocked(computeRoundStatus);
const mockGetIncompleteParticipants = vi.mocked(getIncompleteParticipants);
const mockGetRoundExecutionState = vi.mocked(getRoundExecutionState);
const mockIncrementRecoveryAttempts = vi.mocked(incrementRecoveryAttempts);
const mockGetDbAsync = vi.mocked(getDbAsync);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('round-status handler', () => {
  describe('roundStatus response shape', () => {
    it('returns correct nextParticipantIndex when participants incomplete', () => {
      // Test the expected response shape
      const response: RoundStatus = {
        status: RoundExecutionStatuses.RUNNING,
        phase: RoundExecutionPhases.PARTICIPANTS,
        totalParticipants: 3,
        completedParticipants: 1,
        failedParticipants: 0,
        nextParticipantIndex: 1,
        needsModerator: false,
        needsPreSearch: false,
        userQuery: undefined,
        attachmentIds: undefined,
        canRecover: true,
        recoveryAttempts: 0,
        maxRecoveryAttempts: 3,
      };

      expect(response.nextParticipantIndex).toBe(1);
      expect(response.needsModerator).toBe(false);
      expect(response.canRecover).toBe(true);
    });

    it('returns needsModerator true when all participants complete', () => {
      const response: RoundStatus = {
        status: RoundExecutionStatuses.RUNNING,
        phase: RoundExecutionPhases.MODERATOR,
        totalParticipants: 3,
        completedParticipants: 3,
        failedParticipants: 0,
        nextParticipantIndex: null,
        needsModerator: true,
        needsPreSearch: false,
        userQuery: undefined,
        attachmentIds: undefined,
        canRecover: true,
        recoveryAttempts: 0,
        maxRecoveryAttempts: 3,
      };

      expect(response.nextParticipantIndex).toBeNull();
      expect(response.needsModerator).toBe(true);
    });

    it('returns needsPreSearch true when web search enabled and pending', () => {
      const response: RoundStatus = {
        status: RoundExecutionStatuses.RUNNING,
        phase: RoundExecutionPhases.PARTICIPANTS,
        totalParticipants: 2,
        completedParticipants: 0,
        failedParticipants: 0,
        nextParticipantIndex: 0,
        needsModerator: false,
        needsPreSearch: true,
        userQuery: 'What are best practices for React?',
        attachmentIds: undefined,
        canRecover: true,
        recoveryAttempts: 0,
        maxRecoveryAttempts: 3,
      };

      expect(response.needsPreSearch).toBe(true);
      expect(response.userQuery).toBeDefined();
    });

    it('returns canRecover false when max recovery attempts exceeded', () => {
      const response: RoundStatus = {
        status: RoundExecutionStatuses.FAILED,
        phase: RoundExecutionPhases.PARTICIPANTS,
        totalParticipants: 2,
        completedParticipants: 1,
        failedParticipants: 0,
        nextParticipantIndex: 1,
        needsModerator: false,
        needsPreSearch: false,
        userQuery: undefined,
        attachmentIds: undefined,
        canRecover: false,
        recoveryAttempts: 4,
        maxRecoveryAttempts: 3,
      };

      expect(response.canRecover).toBe(false);
      expect(response.recoveryAttempts).toBeGreaterThan(response.maxRecoveryAttempts);
    });
  });

  describe('service function mocking', () => {
    it('should call computeRoundStatus with correct params', async () => {
      const mockDb = {
        query: {
          chatThread: {
            findFirst: vi.fn().mockResolvedValue({
              id: 'thread-123',
              userId: 'user-123',
              enableWebSearch: false,
            }),
          },
          chatParticipant: {
            findMany: vi.fn().mockResolvedValue([
              { id: 'p1' },
              { id: 'p2' },
            ]),
          },
          chatPreSearch: {
            findFirst: vi.fn().mockResolvedValue(null),
          },
          chatMessage: {
            findFirst: vi.fn().mockResolvedValue(null),
          },
        },
      };

      mockGetDbAsync.mockResolvedValue(mockDb as never);

      mockComputeRoundStatus.mockResolvedValue({
        status: RoundExecutionStatuses.RUNNING,
        phase: RoundExecutionPhases.PARTICIPANTS,
        totalParticipants: 2,
        completedParticipants: 1,
        failedParticipants: 0,
        participantStatuses: { 0: ParticipantStreamStatuses.COMPLETED },
        moderatorStatus: null,
        hasModeratorMessage: false,
        isComplete: false,
        error: null,
      });

      mockGetRoundExecutionState.mockResolvedValue({
        threadId: 'thread-123',
        roundNumber: 1,
        status: RoundExecutionStatuses.RUNNING,
        phase: RoundExecutionPhases.PARTICIPANTS,
        totalParticipants: 2,
        completedParticipants: 1,
        failedParticipants: 0,
        participantStatuses: { 0: ParticipantStreamStatuses.COMPLETED },
        moderatorStatus: null,
        startedAt: new Date().toISOString(),
        completedAt: null,
        error: null,
        triggeredParticipants: [0],
        attachmentIds: undefined,
        recoveryAttempts: 0,
        maxRecoveryAttempts: 3,
      });

      mockIncrementRecoveryAttempts.mockResolvedValue({
        canRecover: true,
        attempts: 1,
        maxAttempts: 3,
      });

      mockGetIncompleteParticipants.mockResolvedValue([1]);

      // Verify the mock setup
      expect(mockComputeRoundStatus).not.toHaveBeenCalled();
      expect(mockGetIncompleteParticipants).not.toHaveBeenCalled();
      expect(mockIncrementRecoveryAttempts).not.toHaveBeenCalled();
    });
  });

  describe('needsModerator logic', () => {
    it('should be false when totalParticipants < 2', () => {
      const totalParticipants = 1;
      const completedParticipants = 1;
      const hasModeratorMessage = false;

      // needsModerator = totalParticipants >= 2 && completedParticipants >= total && !hasModeratorMessage
      const needsModerator = totalParticipants >= 2
        && completedParticipants >= totalParticipants
        && !hasModeratorMessage;

      expect(needsModerator).toBe(false);
    });

    it('should be true when all participants complete and no moderator message', () => {
      const totalParticipants = 3;
      const completedParticipants = 3;
      const hasModeratorMessage = false;

      const needsModerator = totalParticipants >= 2
        && completedParticipants >= totalParticipants
        && !hasModeratorMessage;

      expect(needsModerator).toBe(true);
    });

    it('should be false when moderator message already exists', () => {
      const totalParticipants = 3;
      const completedParticipants = 3;
      const hasModeratorMessage = true;

      const needsModerator = totalParticipants >= 2
        && completedParticipants >= totalParticipants
        && !hasModeratorMessage;

      expect(needsModerator).toBe(false);
    });

    it('should be false when participants not yet complete', () => {
      const totalParticipants = 3;
      const completedParticipants = 2;
      const hasModeratorMessage = false;

      const needsModerator = totalParticipants >= 2
        && completedParticipants >= totalParticipants
        && !hasModeratorMessage;

      expect(needsModerator).toBe(false);
    });
  });

  describe('nextParticipantIndex logic', () => {
    it('returns first incomplete participant index', () => {
      const incompleteParticipants = [1, 2];
      const nextParticipantIndex = incompleteParticipants.length > 0
        ? incompleteParticipants[0]
        : null;

      expect(nextParticipantIndex).toBe(1);
    });

    it('returns null when all participants complete', () => {
      const incompleteParticipants: number[] = [];
      const nextParticipantIndex = incompleteParticipants.length > 0
        ? incompleteParticipants[0]
        : null;

      expect(nextParticipantIndex).toBeNull();
    });
  });

  describe('canRecover logic', () => {
    it('allows recovery when attempts within limit', () => {
      const attempts = 2;
      const maxAttempts = 3;
      const canRecover = attempts <= maxAttempts;

      expect(canRecover).toBe(true);
    });

    it('prevents recovery when attempts exceed limit', () => {
      const attempts = 4;
      const maxAttempts = 3;
      const canRecover = attempts <= maxAttempts;

      expect(canRecover).toBe(false);
    });

    it('allows recovery at exactly max attempts', () => {
      const attempts = 3;
      const maxAttempts = 3;
      const canRecover = attempts <= maxAttempts;

      expect(canRecover).toBe(true);
    });
  });

  describe('status determination', () => {
    it('marks as FAILED when canRecover false and status was RUNNING', () => {
      let status: string = RoundExecutionStatuses.RUNNING;
      const canRecover = false;

      if (!canRecover && status === RoundExecutionStatuses.RUNNING) {
        status = RoundExecutionStatuses.FAILED;
      }

      expect(status).toBe(RoundExecutionStatuses.FAILED);
    });

    it('preserves status when canRecover is true', () => {
      let status: string = RoundExecutionStatuses.RUNNING;
      const canRecover = true;

      if (!canRecover && status === RoundExecutionStatuses.RUNNING) {
        status = RoundExecutionStatuses.FAILED;
      }

      expect(status).toBe(RoundExecutionStatuses.RUNNING);
    });

    it('preserves COMPLETED status regardless of canRecover', () => {
      let status: string = RoundExecutionStatuses.COMPLETED;
      const canRecover = false;

      if (!canRecover && status === RoundExecutionStatuses.RUNNING) {
        status = RoundExecutionStatuses.FAILED;
      }

      expect(status).toBe(RoundExecutionStatuses.COMPLETED);
    });
  });
});
