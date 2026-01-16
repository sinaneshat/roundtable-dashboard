import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ParticipantStreamStatuses, RoundExecutionPhases, RoundExecutionStatuses } from '@/api/core/enums';
import type { MockDrizzleDb } from '@/lib/testing';
import {
  createMockApiEnv,
  createMockDrizzleDb,
  createMockKV,
  createMockLogger,
} from '@/lib/testing';

import * as roundOrchestrationService from '../round-orchestration.service';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('round orchestration service', () => {
  describe('initializeRoundExecution', () => {
    it('creates new round execution state in KV', async () => {
      const mockKV = createMockKV();
      const env = createMockApiEnv({ KV: mockKV });
      const logger = createMockLogger();

      const result = await roundOrchestrationService.initializeRoundExecution(
        'thread-123',
        1,
        3,
        ['attachment-1', 'attachment-2'],
        env,
        logger,
      );

      expect(result).toMatchObject({
        threadId: 'thread-123',
        roundNumber: 1,
        status: RoundExecutionStatuses.RUNNING,
        phase: RoundExecutionPhases.PARTICIPANTS,
        totalParticipants: 3,
        completedParticipants: 0,
        failedParticipants: 0,
        participantStatuses: {},
        moderatorStatus: null,
        error: null,
        triggeredParticipants: [],
        attachmentIds: ['attachment-1', 'attachment-2'],
      });

      expect(result.startedAt).toBeDefined();
      expect(result.completedAt).toBeNull();

      expect(mockKV.put).toHaveBeenCalledWith(
        'round:execution:thread-123:r1',
        expect.any(String),
        { expirationTtl: 3600 },
      );

      expect(logger.info).toHaveBeenCalledWith(
        'Initialized round execution state',
        expect.objectContaining({
          logType: 'operation',
          operationName: 'initializeRoundExecution',
          threadId: 'thread-123',
          roundNumber: 1,
          totalParticipants: 3,
        }),
      );
    });

    it('handles initialization without attachment IDs', async () => {
      const mockKV = createMockKV();
      const env = createMockApiEnv({ KV: mockKV });

      const result = await roundOrchestrationService.initializeRoundExecution(
        'thread-456',
        2,
        2,
        undefined,
        env,
      );

      expect(result.attachmentIds).toBeUndefined();
      expect(mockKV.put).toHaveBeenCalled();
    });

    it('handles missing KV gracefully', async () => {
      const env = createMockApiEnv({ KV: undefined });

      const result = await roundOrchestrationService.initializeRoundExecution(
        'thread-789',
        1,
        3,
        undefined,
        env,
      );

      expect(result).toMatchObject({
        threadId: 'thread-789',
        roundNumber: 1,
        status: RoundExecutionStatuses.RUNNING,
        phase: RoundExecutionPhases.PARTICIPANTS,
        totalParticipants: 3,
      });
    });
  });

  describe('getRoundExecutionState', () => {
    it('retrieves existing round execution state from KV', async () => {
      const mockKV = createMockKV();
      const existingState = {
        threadId: 'thread-123',
        roundNumber: 1,
        status: RoundExecutionStatuses.RUNNING,
        phase: RoundExecutionPhases.PARTICIPANTS,
        totalParticipants: 3,
        completedParticipants: 1,
        failedParticipants: 0,
        participantStatuses: { 0: ParticipantStreamStatuses.COMPLETED },
        moderatorStatus: null,
        startedAt: new Date().toISOString(),
        completedAt: null,
        error: null,
        triggeredParticipants: [0],
      };

      mockKV.get.mockResolvedValue(existingState);
      const env = createMockApiEnv({ KV: mockKV });

      const result = await roundOrchestrationService.getRoundExecutionState(
        'thread-123',
        1,
        env,
      );

      expect(result).toEqual(existingState);
      expect(mockKV.get).toHaveBeenCalledWith('round:execution:thread-123:r1', 'json');
    });

    it('returns null for non-existent round', async () => {
      const mockKV = createMockKV();
      mockKV.get.mockResolvedValue(null);
      const env = createMockApiEnv({ KV: mockKV });

      const result = await roundOrchestrationService.getRoundExecutionState(
        'thread-999',
        5,
        env,
      );

      expect(result).toBeNull();
    });

    it('returns null when KV is unavailable', async () => {
      const env = createMockApiEnv({ KV: undefined });

      const result = await roundOrchestrationService.getRoundExecutionState(
        'thread-123',
        1,
        env,
      );

      expect(result).toBeNull();
    });

    it('handles invalid state data in KV', async () => {
      const mockKV = createMockKV();
      const logger = createMockLogger();
      mockKV.get.mockResolvedValue({
        invalidField: 'bad data',
      });
      const env = createMockApiEnv({ KV: mockKV });

      const result = await roundOrchestrationService.getRoundExecutionState(
        'thread-123',
        1,
        env,
        logger,
      );

      expect(result).toBeNull();
      expect(logger.warn).toHaveBeenCalledWith(
        'Invalid round execution state in KV',
        expect.objectContaining({
          logType: 'operation',
          operationName: 'getRoundExecutionState',
        }),
      );
    });

    it('handles KV errors gracefully', async () => {
      const mockKV = createMockKV();
      const logger = createMockLogger();
      mockKV.get.mockRejectedValue(new Error('KV connection error'));
      const env = createMockApiEnv({ KV: mockKV });

      const result = await roundOrchestrationService.getRoundExecutionState(
        'thread-123',
        1,
        env,
        logger,
      );

      expect(result).toBeNull();
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to get round execution state',
        expect.objectContaining({
          error: 'KV connection error',
        }),
      );
    });
  });

  describe('markParticipantStarted', () => {
    it('marks participant as started and adds to triggered list', async () => {
      const mockKV = createMockKV();
      const existingState = {
        threadId: 'thread-123',
        roundNumber: 1,
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
      };

      mockKV.get.mockResolvedValue(existingState);
      const env = createMockApiEnv({ KV: mockKV });

      await roundOrchestrationService.markParticipantStarted(
        'thread-123',
        1,
        0,
        env,
      );

      expect(mockKV.put).toHaveBeenCalledWith(
        'round:execution:thread-123:r1',
        expect.stringContaining(ParticipantStreamStatuses.ACTIVE),
        { expirationTtl: 3600 },
      );

      const updatedState = JSON.parse(mockKV.put.mock.calls[0]![1] as string);
      expect(updatedState.participantStatuses).toEqual({ 0: ParticipantStreamStatuses.ACTIVE });
      expect(updatedState.triggeredParticipants).toEqual([0]);
    });

    it('does not duplicate participant in triggered list', async () => {
      const mockKV = createMockKV();
      const existingState = {
        threadId: 'thread-123',
        roundNumber: 1,
        status: RoundExecutionStatuses.RUNNING,
        phase: RoundExecutionPhases.PARTICIPANTS,
        totalParticipants: 3,
        completedParticipants: 0,
        failedParticipants: 0,
        participantStatuses: { 0: ParticipantStreamStatuses.ACTIVE },
        moderatorStatus: null,
        startedAt: new Date().toISOString(),
        completedAt: null,
        error: null,
        triggeredParticipants: [0],
      };

      mockKV.get.mockResolvedValue(existingState);
      const env = createMockApiEnv({ KV: mockKV });

      await roundOrchestrationService.markParticipantStarted(
        'thread-123',
        1,
        0,
        env,
      );

      const updatedState = JSON.parse(mockKV.put.mock.calls[0]![1] as string);
      expect(updatedState.triggeredParticipants).toEqual([0]);
    });

    it('handles non-existent state gracefully', async () => {
      const mockKV = createMockKV();
      mockKV.get.mockResolvedValue(null);
      const env = createMockApiEnv({ KV: mockKV });

      await roundOrchestrationService.markParticipantStarted(
        'thread-123',
        1,
        0,
        env,
      );

      expect(mockKV.put).not.toHaveBeenCalled();
    });
  });

  describe('markParticipantCompleted', () => {
    it('marks participant as completed and updates counts', async () => {
      const mockKV = createMockKV();
      const existingState = {
        threadId: 'thread-123',
        roundNumber: 1,
        status: RoundExecutionStatuses.RUNNING,
        phase: RoundExecutionPhases.PARTICIPANTS,
        totalParticipants: 3,
        completedParticipants: 0,
        failedParticipants: 0,
        participantStatuses: { 0: ParticipantStreamStatuses.ACTIVE },
        moderatorStatus: null,
        startedAt: new Date().toISOString(),
        completedAt: null,
        error: null,
        triggeredParticipants: [0],
      };

      mockKV.get.mockResolvedValue(existingState);
      const env = createMockApiEnv({ KV: mockKV });
      const logger = createMockLogger();

      const result = await roundOrchestrationService.markParticipantCompleted(
        'thread-123',
        1,
        0,
        env,
        logger,
      );

      expect(result.allParticipantsComplete).toBe(false);

      const updatedState = JSON.parse(mockKV.put.mock.calls[0]![1] as string);
      expect(updatedState.participantStatuses).toEqual({
        0: ParticipantStreamStatuses.COMPLETED,
      });
      expect(updatedState.completedParticipants).toBe(1);
      expect(updatedState.phase).toBe(RoundExecutionPhases.PARTICIPANTS);

      expect(logger.info).toHaveBeenCalledWith(
        'Marked participant completed',
        expect.objectContaining({
          logType: 'operation',
          operationName: 'markParticipantCompleted',
          participantIndex: 0,
          completedParticipants: 1,
          totalParticipants: 3,
          allParticipantsComplete: false,
        }),
      );
    });

    it('transitions to moderator phase when all participants complete', async () => {
      const mockKV = createMockKV();
      const existingState = {
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
        triggeredParticipants: [0, 1],
      };

      mockKV.get.mockResolvedValue(existingState);
      const env = createMockApiEnv({ KV: mockKV });

      const result = await roundOrchestrationService.markParticipantCompleted(
        'thread-123',
        1,
        1,
        env,
      );

      expect(result.allParticipantsComplete).toBe(true);

      const updatedState = JSON.parse(mockKV.put.mock.calls[0]![1] as string);
      expect(updatedState.completedParticipants).toBe(2);
      expect(updatedState.phase).toBe(RoundExecutionPhases.MODERATOR);
    });

    it('handles mix of completed and failed participants', async () => {
      const mockKV = createMockKV();
      const existingState = {
        threadId: 'thread-123',
        roundNumber: 1,
        status: RoundExecutionStatuses.RUNNING,
        phase: RoundExecutionPhases.PARTICIPANTS,
        totalParticipants: 3,
        completedParticipants: 1,
        failedParticipants: 1,
        participantStatuses: {
          0: ParticipantStreamStatuses.COMPLETED,
          1: ParticipantStreamStatuses.FAILED,
        },
        moderatorStatus: null,
        startedAt: new Date().toISOString(),
        completedAt: null,
        error: null,
        triggeredParticipants: [0, 1, 2],
      };

      mockKV.get.mockResolvedValue(existingState);
      const env = createMockApiEnv({ KV: mockKV });

      const result = await roundOrchestrationService.markParticipantCompleted(
        'thread-123',
        1,
        2,
        env,
      );

      expect(result.allParticipantsComplete).toBe(true);

      const updatedState = JSON.parse(mockKV.put.mock.calls[0]![1] as string);
      expect(updatedState.completedParticipants).toBe(2);
      expect(updatedState.failedParticipants).toBe(1);
      expect(updatedState.phase).toBe(RoundExecutionPhases.MODERATOR);
    });

    it('returns false when state does not exist', async () => {
      const mockKV = createMockKV();
      mockKV.get.mockResolvedValue(null);
      const env = createMockApiEnv({ KV: mockKV });

      const result = await roundOrchestrationService.markParticipantCompleted(
        'thread-123',
        1,
        0,
        env,
      );

      expect(result.allParticipantsComplete).toBe(false);
      expect(mockKV.put).not.toHaveBeenCalled();
    });
  });

  describe('markParticipantFailed', () => {
    it('marks participant as failed and updates counts', async () => {
      const mockKV = createMockKV();
      const existingState = {
        threadId: 'thread-123',
        roundNumber: 1,
        status: RoundExecutionStatuses.RUNNING,
        phase: RoundExecutionPhases.PARTICIPANTS,
        totalParticipants: 3,
        completedParticipants: 0,
        failedParticipants: 0,
        participantStatuses: { 0: ParticipantStreamStatuses.ACTIVE },
        moderatorStatus: null,
        startedAt: new Date().toISOString(),
        completedAt: null,
        error: null,
        triggeredParticipants: [0],
      };

      mockKV.get.mockResolvedValue(existingState);
      const env = createMockApiEnv({ KV: mockKV });
      const logger = createMockLogger();

      const result = await roundOrchestrationService.markParticipantFailed(
        'thread-123',
        1,
        0,
        'API rate limit exceeded',
        env,
        logger,
      );

      expect(result.allParticipantsComplete).toBe(false);

      const updatedState = JSON.parse(mockKV.put.mock.calls[0]![1] as string);
      expect(updatedState.participantStatuses).toEqual({
        0: ParticipantStreamStatuses.FAILED,
      });
      expect(updatedState.failedParticipants).toBe(1);
      expect(updatedState.phase).toBe(RoundExecutionPhases.PARTICIPANTS);
      expect(updatedState.error).toBeNull();

      expect(logger.warn).toHaveBeenCalledWith(
        'Marked participant failed',
        expect.objectContaining({
          logType: 'operation',
          operationName: 'markParticipantFailed',
          participantIndex: 0,
          error: 'API rate limit exceeded',
          failedParticipants: 1,
        }),
      );
    });

    it('transitions to moderator phase when all participants done (with failures)', async () => {
      const mockKV = createMockKV();
      const existingState = {
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
        triggeredParticipants: [0, 1],
      };

      mockKV.get.mockResolvedValue(existingState);
      const env = createMockApiEnv({ KV: mockKV });

      const result = await roundOrchestrationService.markParticipantFailed(
        'thread-123',
        1,
        1,
        'Participant timeout',
        env,
      );

      expect(result.allParticipantsComplete).toBe(true);

      const updatedState = JSON.parse(mockKV.put.mock.calls[0]![1] as string);
      expect(updatedState.phase).toBe(RoundExecutionPhases.MODERATOR);
    });

    it('sets error when all participants fail', async () => {
      const mockKV = createMockKV();
      const existingState = {
        threadId: 'thread-123',
        roundNumber: 1,
        status: RoundExecutionStatuses.RUNNING,
        phase: RoundExecutionPhases.PARTICIPANTS,
        totalParticipants: 2,
        completedParticipants: 0,
        failedParticipants: 1,
        participantStatuses: { 0: ParticipantStreamStatuses.FAILED },
        moderatorStatus: null,
        startedAt: new Date().toISOString(),
        completedAt: null,
        error: null,
        triggeredParticipants: [0, 1],
      };

      mockKV.get.mockResolvedValue(existingState);
      const env = createMockApiEnv({ KV: mockKV });

      const result = await roundOrchestrationService.markParticipantFailed(
        'thread-123',
        1,
        1,
        'Complete failure',
        env,
      );

      expect(result.allParticipantsComplete).toBe(true);

      const updatedState = JSON.parse(mockKV.put.mock.calls[0]![1] as string);
      expect(updatedState.failedParticipants).toBe(2);
      expect(updatedState.error).toBe('Complete failure');
    });

    it('returns false when state does not exist', async () => {
      const mockKV = createMockKV();
      mockKV.get.mockResolvedValue(null);
      const env = createMockApiEnv({ KV: mockKV });

      const result = await roundOrchestrationService.markParticipantFailed(
        'thread-123',
        1,
        0,
        'Error message',
        env,
      );

      expect(result.allParticipantsComplete).toBe(false);
      expect(mockKV.put).not.toHaveBeenCalled();
    });
  });

  describe('computeRoundStatus', () => {
    it('computes status when no KV state exists and no messages in DB', async () => {
      const mockDb = createMockDrizzleDb();
      const mockKV = createMockKV();

      mockKV.get.mockResolvedValue(null);
      mockDb.query.chatParticipant.findMany.mockResolvedValue([
        { id: 'p1' },
        { id: 'p2' },
        { id: 'p3' },
      ]);
      mockDb.query.chatMessage.findMany.mockResolvedValue([]);

      const env = createMockApiEnv({ KV: mockKV });

      const result = await roundOrchestrationService.computeRoundStatus({
        threadId: 'thread-123',
        roundNumber: 1,
        env,
        db: mockDb as MockDrizzleDb,
      });

      expect(result).toMatchObject({
        status: RoundExecutionStatuses.NOT_STARTED,
        phase: RoundExecutionPhases.PARTICIPANTS,
        totalParticipants: 3,
        completedParticipants: 0,
        failedParticipants: 0,
        participantStatuses: {},
        moderatorStatus: null,
        hasModeratorMessage: false,
        isComplete: false,
        error: null,
      });
    });

    it('computes status with KV state during execution', async () => {
      const mockDb = createMockDrizzleDb();
      const mockKV = createMockKV();

      const kvState = {
        threadId: 'thread-123',
        roundNumber: 1,
        status: RoundExecutionStatuses.RUNNING,
        phase: RoundExecutionPhases.PARTICIPANTS,
        totalParticipants: 3,
        completedParticipants: 1,
        failedParticipants: 0,
        participantStatuses: {
          0: ParticipantStreamStatuses.COMPLETED,
          1: ParticipantStreamStatuses.ACTIVE,
        },
        moderatorStatus: null,
        startedAt: new Date().toISOString(),
        completedAt: null,
        error: null,
        triggeredParticipants: [0, 1],
      };

      mockKV.get.mockResolvedValue(kvState);
      mockDb.query.chatParticipant.findMany.mockResolvedValue([
        { id: 'p1' },
        { id: 'p2' },
        { id: 'p3' },
      ]);
      mockDb.query.chatMessage.findMany.mockResolvedValue([
        {
          id: 'thread-123_r1_p0',
          participantId: 'p1',
          metadata: {},
        },
      ]);

      const env = createMockApiEnv({ KV: mockKV });

      const result = await roundOrchestrationService.computeRoundStatus({
        threadId: 'thread-123',
        roundNumber: 1,
        env,
        db: mockDb as MockDrizzleDb,
      });

      expect(result).toMatchObject({
        status: RoundExecutionStatuses.RUNNING,
        phase: RoundExecutionPhases.PARTICIPANTS,
        totalParticipants: 3,
        completedParticipants: 1,
        participantStatuses: {
          0: ParticipantStreamStatuses.COMPLETED,
        },
        isComplete: false,
      });
    });

    it('computes status with all participants complete, waiting for moderator', async () => {
      const mockDb = createMockDrizzleDb();
      const mockKV = createMockKV();

      mockKV.get.mockResolvedValue(null);
      mockDb.query.chatParticipant.findMany.mockResolvedValue([
        { id: 'p1' },
        { id: 'p2' },
      ]);
      mockDb.query.chatMessage.findMany.mockResolvedValue([
        {
          id: 'thread-123_r1_p0',
          participantId: 'p1',
          metadata: {},
        },
        {
          id: 'thread-123_r1_p1',
          participantId: 'p2',
          metadata: {},
        },
      ]);

      const env = createMockApiEnv({ KV: mockKV });

      const result = await roundOrchestrationService.computeRoundStatus({
        threadId: 'thread-123',
        roundNumber: 1,
        env,
        db: mockDb as MockDrizzleDb,
      });

      expect(result).toMatchObject({
        status: RoundExecutionStatuses.RUNNING,
        phase: RoundExecutionPhases.MODERATOR,
        totalParticipants: 2,
        completedParticipants: 2,
        moderatorStatus: ParticipantStreamStatuses.PENDING,
        hasModeratorMessage: false,
        isComplete: false,
      });
    });

    it('computes status with complete round (participants + moderator)', async () => {
      const mockDb = createMockDrizzleDb();
      const mockKV = createMockKV();

      mockKV.get.mockResolvedValue(null);
      mockDb.query.chatParticipant.findMany.mockResolvedValue([
        { id: 'p1' },
        { id: 'p2' },
      ]);
      mockDb.query.chatMessage.findMany.mockResolvedValue([
        {
          id: 'thread-123_r1_p0',
          participantId: 'p1',
          metadata: {},
        },
        {
          id: 'thread-123_r1_p1',
          participantId: 'p2',
          metadata: {},
        },
        {
          id: 'thread-123_r1_moderator',
          participantId: null,
          metadata: { isModerator: true },
        },
      ]);

      const env = createMockApiEnv({ KV: mockKV });

      const result = await roundOrchestrationService.computeRoundStatus({
        threadId: 'thread-123',
        roundNumber: 1,
        env,
        db: mockDb as MockDrizzleDb,
      });

      expect(result).toMatchObject({
        status: RoundExecutionStatuses.COMPLETED,
        phase: RoundExecutionPhases.COMPLETE,
        totalParticipants: 2,
        completedParticipants: 2,
        moderatorStatus: ParticipantStreamStatuses.COMPLETED,
        hasModeratorMessage: true,
        isComplete: true,
      });
    });

    it('computes status with single participant (no moderator needed)', async () => {
      const mockDb = createMockDrizzleDb();
      const mockKV = createMockKV();

      mockKV.get.mockResolvedValue(null);
      mockDb.query.chatParticipant.findMany.mockResolvedValue([{ id: 'p1' }]);
      mockDb.query.chatMessage.findMany.mockResolvedValue([
        {
          id: 'thread-123_r1_p0',
          participantId: 'p1',
          metadata: {},
        },
      ]);

      const env = createMockApiEnv({ KV: mockKV });

      const result = await roundOrchestrationService.computeRoundStatus({
        threadId: 'thread-123',
        roundNumber: 1,
        env,
        db: mockDb as MockDrizzleDb,
      });

      expect(result).toMatchObject({
        status: RoundExecutionStatuses.COMPLETED,
        phase: RoundExecutionPhases.COMPLETE,
        totalParticipants: 1,
        completedParticipants: 1,
        isComplete: true,
      });
    });

    it('computes status with incomplete round (some participants missing)', async () => {
      const mockDb = createMockDrizzleDb();
      const mockKV = createMockKV();

      mockKV.get.mockResolvedValue(null);
      mockDb.query.chatParticipant.findMany.mockResolvedValue([
        { id: 'p1' },
        { id: 'p2' },
        { id: 'p3' },
      ]);
      mockDb.query.chatMessage.findMany.mockResolvedValue([
        {
          id: 'thread-123_r1_p0',
          participantId: 'p1',
          metadata: {},
        },
      ]);

      const env = createMockApiEnv({ KV: mockKV });

      const result = await roundOrchestrationService.computeRoundStatus({
        threadId: 'thread-123',
        roundNumber: 1,
        env,
        db: mockDb as MockDrizzleDb,
      });

      expect(result).toMatchObject({
        status: RoundExecutionStatuses.INCOMPLETE,
        phase: RoundExecutionPhases.PARTICIPANTS,
        totalParticipants: 3,
        completedParticipants: 1,
        isComplete: false,
      });
    });

    it('computes status with mixed completed and failed participants', async () => {
      const mockDb = createMockDrizzleDb();
      const mockKV = createMockKV();

      const kvState = {
        threadId: 'thread-123',
        roundNumber: 1,
        status: RoundExecutionStatuses.RUNNING,
        phase: RoundExecutionPhases.PARTICIPANTS,
        totalParticipants: 3,
        completedParticipants: 2,
        failedParticipants: 1,
        participantStatuses: {
          0: ParticipantStreamStatuses.COMPLETED,
          1: ParticipantStreamStatuses.FAILED,
          2: ParticipantStreamStatuses.COMPLETED,
        },
        moderatorStatus: null,
        startedAt: new Date().toISOString(),
        completedAt: null,
        error: 'Participant 1 failed',
        triggeredParticipants: [0, 1, 2],
      };

      mockKV.get.mockResolvedValue(kvState);
      mockDb.query.chatParticipant.findMany.mockResolvedValue([
        { id: 'p1' },
        { id: 'p2' },
        { id: 'p3' },
      ]);
      mockDb.query.chatMessage.findMany.mockResolvedValue([
        {
          id: 'thread-123_r1_p0',
          participantId: 'p1',
          metadata: {},
        },
        {
          id: 'thread-123_r1_p2',
          participantId: 'p3',
          metadata: {},
        },
      ]);

      const env = createMockApiEnv({ KV: mockKV });

      const result = await roundOrchestrationService.computeRoundStatus({
        threadId: 'thread-123',
        roundNumber: 1,
        env,
        db: mockDb as MockDrizzleDb,
      });

      expect(result).toMatchObject({
        status: RoundExecutionStatuses.RUNNING,
        totalParticipants: 3,
        completedParticipants: 2,
        failedParticipants: 1,
        error: 'Participant 1 failed',
      });
    });

    it('handles zero participants edge case', async () => {
      const mockDb = createMockDrizzleDb();
      const mockKV = createMockKV();

      mockKV.get.mockResolvedValue(null);
      mockDb.query.chatParticipant.findMany.mockResolvedValue([]);
      mockDb.query.chatMessage.findMany.mockResolvedValue([]);

      const env = createMockApiEnv({ KV: mockKV });

      const result = await roundOrchestrationService.computeRoundStatus({
        threadId: 'thread-123',
        roundNumber: 1,
        env,
        db: mockDb as MockDrizzleDb,
      });

      expect(result).toMatchObject({
        status: RoundExecutionStatuses.COMPLETED,
        phase: RoundExecutionPhases.COMPLETE,
        totalParticipants: 0,
        completedParticipants: 0,
        isComplete: true,
      });
    });
  });

  describe('markModeratorCompleted', () => {
    it('marks moderator as completed and round as complete', async () => {
      const mockKV = createMockKV();
      const existingState = {
        threadId: 'thread-123',
        roundNumber: 1,
        status: RoundExecutionStatuses.RUNNING,
        phase: RoundExecutionPhases.MODERATOR,
        totalParticipants: 2,
        completedParticipants: 2,
        failedParticipants: 0,
        participantStatuses: {
          0: ParticipantStreamStatuses.COMPLETED,
          1: ParticipantStreamStatuses.COMPLETED,
        },
        moderatorStatus: ParticipantStreamStatuses.ACTIVE,
        startedAt: new Date().toISOString(),
        completedAt: null,
        error: null,
        triggeredParticipants: [0, 1],
      };

      mockKV.get.mockResolvedValue(existingState);
      const env = createMockApiEnv({ KV: mockKV });
      const logger = createMockLogger();

      await roundOrchestrationService.markModeratorCompleted(
        'thread-123',
        1,
        env,
        logger,
      );

      const updatedState = JSON.parse(mockKV.put.mock.calls[0]![1] as string);
      expect(updatedState.moderatorStatus).toBe(ParticipantStreamStatuses.COMPLETED);
      expect(updatedState.phase).toBe(RoundExecutionPhases.COMPLETE);
      expect(updatedState.status).toBe(RoundExecutionStatuses.COMPLETED);
      expect(updatedState.completedAt).toBeDefined();

      expect(logger.info).toHaveBeenCalledWith(
        'Marked moderator completed - round execution complete',
        expect.objectContaining({
          logType: 'operation',
          operationName: 'markModeratorCompleted',
          threadId: 'thread-123',
          roundNumber: 1,
        }),
      );
    });
  });

  describe('markModeratorFailed', () => {
    it('marks moderator as failed but round as completed', async () => {
      const mockKV = createMockKV();
      const existingState = {
        threadId: 'thread-123',
        roundNumber: 1,
        status: RoundExecutionStatuses.RUNNING,
        phase: RoundExecutionPhases.MODERATOR,
        totalParticipants: 2,
        completedParticipants: 2,
        failedParticipants: 0,
        participantStatuses: {
          0: ParticipantStreamStatuses.COMPLETED,
          1: ParticipantStreamStatuses.COMPLETED,
        },
        moderatorStatus: ParticipantStreamStatuses.ACTIVE,
        startedAt: new Date().toISOString(),
        completedAt: null,
        error: null,
        triggeredParticipants: [0, 1],
      };

      mockKV.get.mockResolvedValue(existingState);
      const env = createMockApiEnv({ KV: mockKV });
      const logger = createMockLogger();

      await roundOrchestrationService.markModeratorFailed(
        'thread-123',
        1,
        'Moderator API error',
        env,
        logger,
      );

      const updatedState = JSON.parse(mockKV.put.mock.calls[0]![1] as string);
      expect(updatedState.moderatorStatus).toBe(ParticipantStreamStatuses.FAILED);
      expect(updatedState.phase).toBe(RoundExecutionPhases.COMPLETE);
      expect(updatedState.status).toBe(RoundExecutionStatuses.COMPLETED);
      expect(updatedState.error).toBe('Moderator API error');
      expect(updatedState.completedAt).toBeDefined();

      expect(logger.warn).toHaveBeenCalledWith(
        'Marked moderator failed',
        expect.objectContaining({
          logType: 'operation',
          operationName: 'markModeratorFailed',
          threadId: 'thread-123',
          roundNumber: 1,
          error: 'Moderator API error',
        }),
      );
    });
  });

  describe('markRoundFailed', () => {
    it('marks entire round execution as failed', async () => {
      const mockKV = createMockKV();
      const existingState = {
        threadId: 'thread-123',
        roundNumber: 1,
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
      };

      mockKV.get.mockResolvedValue(existingState);
      const env = createMockApiEnv({ KV: mockKV });
      const logger = createMockLogger();

      await roundOrchestrationService.markRoundFailed(
        'thread-123',
        1,
        'Critical system error',
        env,
        logger,
      );

      const updatedState = JSON.parse(mockKV.put.mock.calls[0]![1] as string);
      expect(updatedState.status).toBe(RoundExecutionStatuses.FAILED);
      expect(updatedState.error).toBe('Critical system error');
      expect(updatedState.completedAt).toBeDefined();

      expect(logger.error).toHaveBeenCalledWith(
        'Marked round execution as failed',
        expect.objectContaining({
          logType: 'operation',
          operationName: 'markRoundFailed',
          threadId: 'thread-123',
          roundNumber: 1,
          error: 'Critical system error',
        }),
      );
    });
  });

  describe('getExistingRoundExecution', () => {
    it('returns state when round is running', async () => {
      const mockKV = createMockKV();
      const runningState = {
        threadId: 'thread-123',
        roundNumber: 1,
        status: RoundExecutionStatuses.RUNNING,
        phase: RoundExecutionPhases.PARTICIPANTS,
        totalParticipants: 3,
        completedParticipants: 1,
        failedParticipants: 0,
        participantStatuses: { 0: ParticipantStreamStatuses.COMPLETED },
        moderatorStatus: null,
        startedAt: new Date().toISOString(),
        completedAt: null,
        error: null,
        triggeredParticipants: [0],
      };

      mockKV.get.mockResolvedValue(runningState);
      const env = createMockApiEnv({ KV: mockKV });

      const result = await roundOrchestrationService.getExistingRoundExecution(
        'thread-123',
        1,
        env,
      );

      expect(result).toEqual(runningState);
    });

    it('returns null when round is completed', async () => {
      const mockKV = createMockKV();
      const completedState = {
        threadId: 'thread-123',
        roundNumber: 1,
        status: RoundExecutionStatuses.COMPLETED,
        phase: RoundExecutionPhases.COMPLETE,
        totalParticipants: 2,
        completedParticipants: 2,
        failedParticipants: 0,
        participantStatuses: {
          0: ParticipantStreamStatuses.COMPLETED,
          1: ParticipantStreamStatuses.COMPLETED,
        },
        moderatorStatus: ParticipantStreamStatuses.COMPLETED,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        error: null,
        triggeredParticipants: [0, 1],
      };

      mockKV.get.mockResolvedValue(completedState);
      const env = createMockApiEnv({ KV: mockKV });

      const result = await roundOrchestrationService.getExistingRoundExecution(
        'thread-123',
        1,
        env,
      );

      expect(result).toBeNull();
    });

    it('returns null when no state exists', async () => {
      const mockKV = createMockKV();
      mockKV.get.mockResolvedValue(null);
      const env = createMockApiEnv({ KV: mockKV });

      const result = await roundOrchestrationService.getExistingRoundExecution(
        'thread-123',
        1,
        env,
      );

      expect(result).toBeNull();
    });
  });
});
