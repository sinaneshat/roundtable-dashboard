/**
 * Free User Round Completion Tests
 *
 * Comprehensive test suite for checkFreeUserHasCompletedRound function.
 * Tests the logic that determines if a free user has completed their one free round.
 *
 * Business Rules:
 * - Free users get one complete conversation round
 * - A round is complete when ALL enabled participants have responded in round 0
 * - Disabled participants don't count toward round completion
 * - If no thread exists, round is not complete
 * - If no participants exist, round is not complete
 * - Only round 0 (first round, 0-based indexing) counts for free users
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { checkFreeUserHasCompletedRound } from '@/api/services/billing';
// Import the mocked module
import { getDbAsync } from '@/db';

// Mock the database module with all required exports
vi.mock('@/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/db')>();
  return {
    ...actual,
    getDbAsync: vi.fn(),
  };
});

describe('checkFreeUserHasCompletedRound', () => {
  let mockDb: {
    select: ReturnType<typeof vi.fn>;
    query: {
      chatThread: {
        findFirst: ReturnType<typeof vi.fn>;
      };
      chatParticipant: {
        findMany: ReturnType<typeof vi.fn>;
      };
      chatMessage: {
        findFirst: ReturnType<typeof vi.fn>;
      };
    };
  };

  /**
   * Helper function to setup select mock for tests
   * The function is called twice in checkFreeUserHasCompletedRound:
   * 1. First for creditTransaction query (with .limit())
   * 2. Second for chatMessage query (without .limit())
   */
  function setupSelectMock(transactionResult: unknown[], messageResult: unknown[]) {
    const fromMock = vi.fn();
    let callCount = 0;

    fromMock.mockImplementation(() => {
      callCount++;
      const whereMock = vi.fn();

      if (callCount === 1) {
        // First call: creditTransaction query (with limit)
        whereMock.mockReturnValue({
          limit: vi.fn().mockResolvedValue(transactionResult),
        });
      } else {
        // Second call: chatMessage query (no limit)
        whereMock.mockResolvedValue(messageResult);
      }

      return { where: whereMock };
    });

    (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: fromMock,
    });
  }

  beforeEach(() => {
    // Create mock database object with chainable query methods
    mockDb = {
      select: vi.fn(),
      query: {
        chatThread: {
          findFirst: vi.fn(),
        },
        chatParticipant: {
          findMany: vi.fn(),
        },
        chatMessage: {
          findFirst: vi.fn(),
        },
      },
    };

    // Setup the default mock implementation with complete chain
    (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    // Mock getDbAsync to return our mock database
    (getDbAsync as ReturnType<typeof vi.fn>).mockResolvedValue(mockDb);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('when user has no threads', () => {
    beforeEach(() => {
      setupSelectMock([], []);
      mockDb.query.chatThread.findFirst.mockResolvedValue(undefined);
    });

    it('should return false', async () => {
      const result = await checkFreeUserHasCompletedRound('user-123');

      expect(result).toBe(false);
    });
  });

  describe('when thread has no participants', () => {
    beforeEach(() => {
      setupSelectMock([], []);
      mockDb.query.chatThread.findFirst.mockResolvedValue({
        id: 'thread-123',
        userId: 'user-123',
        title: 'Test Thread',
        mode: 'brainstorming',
      });

      mockDb.query.chatParticipant.findMany.mockResolvedValue([]);
    });

    it('should return false', async () => {
      const result = await checkFreeUserHasCompletedRound('user-123');

      expect(result).toBe(false);
    });
  });

  describe('when only some participants have responded', () => {
    beforeEach(() => {
      setupSelectMock(
        [], // No transaction
        [
          // Only 2 out of 3 participants have responded
          { id: 'msg-1', participantId: 'p1', role: 'assistant', roundNumber: 0 },
          { id: 'msg-2', participantId: 'p2', role: 'assistant', roundNumber: 0 },
        ],
      );

      mockDb.query.chatThread.findFirst.mockResolvedValue({
        id: 'thread-123',
        userId: 'user-123',
      });

      mockDb.query.chatParticipant.findMany.mockResolvedValue([
        { id: 'p1', modelId: 'model-1', isEnabled: true },
        { id: 'p2', modelId: 'model-2', isEnabled: true },
        { id: 'p3', modelId: 'model-3', isEnabled: true },
      ]);
    });

    it('should return false when not all participants have responded', async () => {
      const result = await checkFreeUserHasCompletedRound('user-123');

      expect(result).toBe(false);
    });
  });

  describe('when all enabled participants have responded in round 0', () => {
    describe('with 1 participant', () => {
      beforeEach(() => {
        setupSelectMock(
          [], // No transaction
          [{ id: 'msg-1', participantId: 'p1', role: 'assistant', roundNumber: 0 }],
        );

        mockDb.query.chatThread.findFirst.mockResolvedValue({
          id: 'thread-123',
          userId: 'user-123',
        });

        mockDb.query.chatParticipant.findMany.mockResolvedValue([
          { id: 'p1', modelId: 'model-1', isEnabled: true },
        ]);
      });

      it('should return true', async () => {
        const result = await checkFreeUserHasCompletedRound('user-123');

        expect(result).toBe(true);
      });
    });

    describe('with 2 participants', () => {
      beforeEach(() => {
        setupSelectMock(
          [], // No transaction
          [
            { id: 'msg-1', participantId: 'p1', role: 'assistant', roundNumber: 0 },
            { id: 'msg-2', participantId: 'p2', role: 'assistant', roundNumber: 0 },
          ],
        );

        mockDb.query.chatThread.findFirst.mockResolvedValue({
          id: 'thread-123',
          userId: 'user-123',
        });

        mockDb.query.chatParticipant.findMany.mockResolvedValue([
          { id: 'p1', modelId: 'model-1', isEnabled: true },
          { id: 'p2', modelId: 'model-2', isEnabled: true },
        ]);

        // For 2+ participants, moderator must also complete for round to be done
        mockDb.query.chatMessage.findFirst.mockResolvedValue({
          id: 'thread-123_r0_moderator',
          threadId: 'thread-123',
          role: 'assistant',
          parts: [{ type: 'text', text: 'Moderator summary...' }],
          roundNumber: 0,
        });
      });

      it('should return true', async () => {
        const result = await checkFreeUserHasCompletedRound('user-123');

        expect(result).toBe(true);
      });
    });

    describe('with 3+ participants', () => {
      beforeEach(() => {
        setupSelectMock(
          [], // No transaction
          [
            { id: 'msg-1', participantId: 'p1', role: 'assistant', roundNumber: 0 },
            { id: 'msg-2', participantId: 'p2', role: 'assistant', roundNumber: 0 },
            { id: 'msg-3', participantId: 'p3', role: 'assistant', roundNumber: 0 },
            { id: 'msg-4', participantId: 'p4', role: 'assistant', roundNumber: 0 },
          ],
        );

        mockDb.query.chatThread.findFirst.mockResolvedValue({
          id: 'thread-123',
          userId: 'user-123',
        });

        mockDb.query.chatParticipant.findMany.mockResolvedValue([
          { id: 'p1', modelId: 'model-1', isEnabled: true },
          { id: 'p2', modelId: 'model-2', isEnabled: true },
          { id: 'p3', modelId: 'model-3', isEnabled: true },
          { id: 'p4', modelId: 'model-4', isEnabled: true },
        ]);

        // For 2+ participants, moderator must also complete for round to be done
        mockDb.query.chatMessage.findFirst.mockResolvedValue({
          id: 'thread-123_r0_moderator',
          threadId: 'thread-123',
          role: 'assistant',
          parts: [{ type: 'text', text: 'Moderator summary...' }],
          roundNumber: 0,
        });
      });

      it('should return true', async () => {
        const result = await checkFreeUserHasCompletedRound('user-123');

        expect(result).toBe(true);
      });
    });
  });

  describe('when disabled participants exist', () => {
    describe('and all enabled participants have responded', () => {
      beforeEach(() => {
        setupSelectMock(
          [], // No transaction
          [
            // Only enabled participants have responded
            { id: 'msg-1', participantId: 'p1', role: 'assistant', roundNumber: 0 },
            { id: 'msg-2', participantId: 'p2', role: 'assistant', roundNumber: 0 },
          ],
        );

        mockDb.query.chatThread.findFirst.mockResolvedValue({
          id: 'thread-123',
          userId: 'user-123',
        });

        // findMany filters by isEnabled: true, so only return enabled participants
        mockDb.query.chatParticipant.findMany.mockResolvedValue([
          { id: 'p1', modelId: 'model-1', isEnabled: true },
          { id: 'p2', modelId: 'model-2', isEnabled: true },
        ]);

        // For 2+ participants, moderator must also complete for round to be done
        mockDb.query.chatMessage.findFirst.mockResolvedValue({
          id: 'thread-123_r0_moderator',
          threadId: 'thread-123',
          role: 'assistant',
          parts: [{ type: 'text', text: 'Moderator summary...' }],
          roundNumber: 0,
        });
      });

      it('should return true (disabled participants should not count)', async () => {
        const result = await checkFreeUserHasCompletedRound('user-123');

        expect(result).toBe(true);
      });
    });

    describe('and disabled participants have responded but enabled have not', () => {
      beforeEach(() => {
        setupSelectMock(
          [], // No transaction
          [
            // Only disabled participant has responded
            { id: 'msg-1', participantId: 'p3', role: 'assistant', roundNumber: 0 },
          ],
        );

        mockDb.query.chatThread.findFirst.mockResolvedValue({
          id: 'thread-123',
          userId: 'user-123',
        });

        // 2 enabled + 1 disabled participant
        mockDb.query.chatParticipant.findMany.mockResolvedValue([
          { id: 'p1', modelId: 'model-1', isEnabled: true },
          { id: 'p2', modelId: 'model-2', isEnabled: true },
          { id: 'p3', modelId: 'model-3', isEnabled: false },
        ]);
      });

      it('should return false (enabled participants must respond)', async () => {
        const result = await checkFreeUserHasCompletedRound('user-123');

        expect(result).toBe(false);
      });
    });
  });

  describe('when free round complete transaction exists', () => {
    beforeEach(() => {
      // Mock transaction query to return a completed transaction
      (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: 'tx-1',
                userId: 'user-123',
                action: 'free_round_complete',
              },
            ]),
          }),
        }),
      });
    });

    it('should return true immediately without checking thread/participants', async () => {
      const result = await checkFreeUserHasCompletedRound('user-123');

      expect(result).toBe(true);
      // Verify that thread/participant queries were not called
      expect(mockDb.query.chatThread.findFirst).not.toHaveBeenCalled();
      expect(mockDb.query.chatParticipant.findMany).not.toHaveBeenCalled();
    });

    it('should return true even if thread does not exist', async () => {
      mockDb.query.chatThread.findFirst.mockResolvedValue(undefined);

      const result = await checkFreeUserHasCompletedRound('user-123');

      expect(result).toBe(true);
    });
  });

  describe('edge cases with multiple assistant messages from same participant', () => {
    beforeEach(() => {
      setupSelectMock(
        [], // No transaction
        [
          // Participant 1 has responded twice, participant 2 once
          { id: 'msg-1', participantId: 'p1', role: 'assistant', roundNumber: 0 },
          { id: 'msg-2', participantId: 'p1', role: 'assistant', roundNumber: 0 },
          { id: 'msg-3', participantId: 'p2', role: 'assistant', roundNumber: 0 },
        ],
      );

      mockDb.query.chatThread.findFirst.mockResolvedValue({
        id: 'thread-123',
        userId: 'user-123',
      });

      mockDb.query.chatParticipant.findMany.mockResolvedValue([
        { id: 'p1', modelId: 'model-1', isEnabled: true },
        { id: 'p2', modelId: 'model-2', isEnabled: true },
      ]);

      // For 2+ participants, moderator must also complete for round to be done
      mockDb.query.chatMessage.findFirst.mockResolvedValue({
        id: 'thread-123_r0_moderator',
        threadId: 'thread-123',
        role: 'assistant',
        parts: [{ type: 'text', text: 'Moderator summary...' }],
        roundNumber: 0,
      });
    });

    it('should count participant only once even with multiple messages', async () => {
      const result = await checkFreeUserHasCompletedRound('user-123');

      expect(result).toBe(true);
    });
  });

  describe('when messages exist in round 1 but not round 0', () => {
    beforeEach(() => {
      setupSelectMock(
        [], // No transaction
        [], // No messages in round 0 (WHERE clause filters out round 1 messages)
      );

      mockDb.query.chatThread.findFirst.mockResolvedValue({
        id: 'thread-123',
        userId: 'user-123',
      });

      mockDb.query.chatParticipant.findMany.mockResolvedValue([
        { id: 'p1', modelId: 'model-1', isEnabled: true },
        { id: 'p2', modelId: 'model-2', isEnabled: true },
      ]);
    });

    it('should return false (only round 0 counts)', async () => {
      const result = await checkFreeUserHasCompletedRound('user-123');

      expect(result).toBe(false);
    });
  });

  describe('when messages with null participantId exist', () => {
    beforeEach(() => {
      setupSelectMock(
        [], // No transaction
        [
          // User message (null participantId) and only one participant response
          { id: 'msg-user', participantId: null, role: 'user', roundNumber: 0 },
          { id: 'msg-1', participantId: 'p1', role: 'assistant', roundNumber: 0 },
        ],
      );

      mockDb.query.chatThread.findFirst.mockResolvedValue({
        id: 'thread-123',
        userId: 'user-123',
      });

      mockDb.query.chatParticipant.findMany.mockResolvedValue([
        { id: 'p1', modelId: 'model-1', isEnabled: true },
        { id: 'p2', modelId: 'model-2', isEnabled: true },
      ]);
    });

    it('should ignore messages with null participantId and return false', async () => {
      const result = await checkFreeUserHasCompletedRound('user-123');

      expect(result).toBe(false);
    });
  });

  describe('mixed scenarios', () => {
    describe('when all enabled participants responded but some messages are in other rounds', () => {
      beforeEach(() => {
        setupSelectMock(
          [], // No transaction
          [
            // Both participants responded in round 0, plus messages in other rounds
            { id: 'msg-1', participantId: 'p1', role: 'assistant', roundNumber: 0 },
            { id: 'msg-2', participantId: 'p2', role: 'assistant', roundNumber: 0 },
            { id: 'msg-3', participantId: 'p1', role: 'assistant', roundNumber: 1 },
            { id: 'msg-4', participantId: null, role: 'user', roundNumber: 0 },
          ],
        );

        mockDb.query.chatThread.findFirst.mockResolvedValue({
          id: 'thread-123',
          userId: 'user-123',
        });

        mockDb.query.chatParticipant.findMany.mockResolvedValue([
          { id: 'p1', modelId: 'model-1', isEnabled: true },
          { id: 'p2', modelId: 'model-2', isEnabled: true },
        ]);

        // For 2+ participants, moderator must also complete for round to be done
        mockDb.query.chatMessage.findFirst.mockResolvedValue({
          id: 'thread-123_r0_moderator',
          threadId: 'thread-123',
          role: 'assistant',
          parts: [{ type: 'text', text: 'Moderator summary...' }],
          roundNumber: 0,
        });
      });

      it('should return true when all enabled participants responded in round 0', async () => {
        const result = await checkFreeUserHasCompletedRound('user-123');

        expect(result).toBe(true);
      });
    });

    describe('when no enabled participants exist (all disabled)', () => {
      beforeEach(() => {
        setupSelectMock([], []);

        mockDb.query.chatThread.findFirst.mockResolvedValue({
          id: 'thread-123',
          userId: 'user-123',
        });

        mockDb.query.chatParticipant.findMany.mockResolvedValue([
          { id: 'p1', modelId: 'model-1', isEnabled: false },
          { id: 'p2', modelId: 'model-2', isEnabled: false },
        ]);
      });

      it('should return false (no enabled participants to complete round)', async () => {
        const result = await checkFreeUserHasCompletedRound('user-123');

        expect(result).toBe(false);
      });
    });
  });
});
