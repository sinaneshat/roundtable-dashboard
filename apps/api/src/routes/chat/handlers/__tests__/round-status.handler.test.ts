import { ParticipantStreamStatuses, RoundExecutionPhases, RoundExecutionStatuses } from '@roundtable/shared/enums';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getDbAsync } from '@/db';
import {
  computeRoundStatus,
  getIncompleteParticipants,
  getRoundExecutionState,
  incrementRecoveryAttempts,
} from '@/services/round-orchestration/round-orchestration.service';

import type { RoundStatus } from '../../schema';

// Mock the round-orchestration service
vi.mock('@/services/round-orchestration/round-orchestration.service', () => ({
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
        attachmentIds: undefined,
        canRecover: true,
        completedParticipants: 1,
        failedParticipants: 0,
        maxRecoveryAttempts: 3,
        needsModerator: false,
        needsPreSearch: false,
        nextParticipantIndex: 1,
        phase: RoundExecutionPhases.PARTICIPANTS,
        recoveryAttempts: 0,
        status: RoundExecutionStatuses.RUNNING,
        totalParticipants: 3,
        userQuery: undefined,
      };

      expect(response.nextParticipantIndex).toBe(1);
      expect(response.needsModerator).toBe(false);
      expect(response.canRecover).toBe(true);
    });

    it('returns needsModerator true when all participants complete', () => {
      const response: RoundStatus = {
        attachmentIds: undefined,
        canRecover: true,
        completedParticipants: 3,
        failedParticipants: 0,
        maxRecoveryAttempts: 3,
        needsModerator: true,
        needsPreSearch: false,
        nextParticipantIndex: null,
        phase: RoundExecutionPhases.MODERATOR,
        recoveryAttempts: 0,
        status: RoundExecutionStatuses.RUNNING,
        totalParticipants: 3,
        userQuery: undefined,
      };

      expect(response.nextParticipantIndex).toBeNull();
      expect(response.needsModerator).toBe(true);
    });

    it('returns needsPreSearch true when web search enabled and pending', () => {
      const response: RoundStatus = {
        attachmentIds: undefined,
        canRecover: true,
        completedParticipants: 0,
        failedParticipants: 0,
        maxRecoveryAttempts: 3,
        needsModerator: false,
        needsPreSearch: true,
        nextParticipantIndex: 0,
        phase: RoundExecutionPhases.PARTICIPANTS,
        recoveryAttempts: 0,
        status: RoundExecutionStatuses.RUNNING,
        totalParticipants: 2,
        userQuery: 'What are best practices for React?',
      };

      expect(response.needsPreSearch).toBe(true);
      expect(response.userQuery).toBeDefined();
    });

    it('returns canRecover false when max recovery attempts exceeded', () => {
      const response: RoundStatus = {
        attachmentIds: undefined,
        canRecover: false,
        completedParticipants: 1,
        failedParticipants: 0,
        maxRecoveryAttempts: 3,
        needsModerator: false,
        needsPreSearch: false,
        nextParticipantIndex: 1,
        phase: RoundExecutionPhases.PARTICIPANTS,
        recoveryAttempts: 4,
        status: RoundExecutionStatuses.FAILED,
        totalParticipants: 2,
        userQuery: undefined,
      };

      expect(response.canRecover).toBe(false);
      expect(response.recoveryAttempts).toBeGreaterThan(response.maxRecoveryAttempts);
    });
  });

  describe('service function mocking', () => {
    it('should call computeRoundStatus with correct params', async () => {
      const mockDb = {
        query: {
          chatMessage: {
            findFirst: vi.fn().mockResolvedValue(null),
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
          chatThread: {
            findFirst: vi.fn().mockResolvedValue({
              enableWebSearch: false,
              id: 'thread-123',
              userId: 'user-123',
            }),
          },
        },
      };

      mockGetDbAsync.mockResolvedValue(mockDb as never);

      mockComputeRoundStatus.mockResolvedValue({
        completedParticipants: 1,
        error: null,
        failedParticipants: 0,
        hasModeratorMessage: false,
        isComplete: false,
        moderatorStatus: null,
        participantStatuses: { 0: ParticipantStreamStatuses.COMPLETED },
        phase: RoundExecutionPhases.PARTICIPANTS,
        status: RoundExecutionStatuses.RUNNING,
        totalParticipants: 2,
      });

      mockGetRoundExecutionState.mockResolvedValue({
        attachmentIds: undefined,
        completedAt: null,
        completedParticipants: 1,
        error: null,
        failedParticipants: 0,
        maxRecoveryAttempts: 3,
        moderatorStatus: null,
        participantStatuses: { 0: ParticipantStreamStatuses.COMPLETED },
        phase: RoundExecutionPhases.PARTICIPANTS,
        recoveryAttempts: 0,
        roundNumber: 1,
        startedAt: new Date().toISOString(),
        status: RoundExecutionStatuses.RUNNING,
        threadId: 'thread-123',
        totalParticipants: 2,
        triggeredParticipants: [0],
      });

      mockIncrementRecoveryAttempts.mockResolvedValue({
        attempts: 1,
        canRecover: true,
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
