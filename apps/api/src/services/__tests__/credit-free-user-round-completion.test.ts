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

import { MessageRoles } from '@roundtable/shared/enums';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getDbAsync } from '@/db';
import { checkFreeUserHasCompletedRound } from '@/services/billing';

// Mock the database module with all required exports
vi.mock('@/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/db')>();
  return {
    ...actual,
    getDbAsync: vi.fn(),
  };
});

function withCache<T>(value: T) {
  const promise = Promise.resolve(value) as Promise<T> & { $withCache: ReturnType<typeof vi.fn> };
  promise.$withCache = vi.fn(() => promise);
  return promise;
}

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
      creditTransaction: {
        findFirst: ReturnType<typeof vi.fn>;
      };
    };
  };

  /**
   * Helper function to setup select mock for tests
   * The function mocks:
   * 1. db.select().from().where().limit().$withCache() for transaction check
   * 2. db.select().from().where().limit().$withCache() for thread check
   * 3. db.select().from().where() for participant query
   * 4. db.select().from().where() for message query
   */
  function setupSelectMock(
    transactionResult: unknown[],
    messageResult: unknown[],
    participantCount: number = 2,
  ) {
    // Create participant array based on count
    const participantArray = Array.from({ length: participantCount }, (_, i) => ({
      id: `p${i + 1}`,
      threadId: 'thread-1',
      isEnabled: true,
    }));

    // Mock db.select() - handles 4 sequential calls:
    // 1. Transaction check: .from().where().limit().$withCache()
    // 2. Thread check: .from().where().limit().$withCache()
    // 3. Participant query: .from().where() (no limit)
    // 4. Message query: .from().where() (no limit)
    const fromMock = vi.fn();
    let callCount = 0;

    fromMock.mockImplementation(() => {
      callCount++;

      if (callCount === 1) {
        // Transaction check - needs .where().limit().$withCache()
        return {
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockImplementation(() => withCache(Promise.resolve(transactionResult))),
          }),
        };
      } else if (callCount === 2) {
        // Thread check - needs .where().limit().$withCache()
        return {
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockImplementation(() =>
              withCache(Promise.resolve([{ id: 'thread-1', userId: 'user-1' }])),
            ),
          }),
        };
      } else if (callCount === 3) {
        // Participant query - just .where() (no limit)
        return {
          where: vi.fn().mockResolvedValue(participantArray),
        };
      } else {
        // Message query - just .where() (no limit)
        return {
          where: vi.fn().mockResolvedValue(messageResult),
        };
      }
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
        creditTransaction: {
          findFirst: vi.fn(),
        },
      },
    };

    // Setup the default mock implementation with complete chain
    (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockImplementation(() => withCache(Promise.resolve([]))),
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
          { id: 'msg-1', participantId: 'p1', role: MessageRoles.ASSISTANT, roundNumber: 0 },
          { id: 'msg-2', participantId: 'p2', role: MessageRoles.ASSISTANT, roundNumber: 0 },
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
        // Single participant (participantCount = 1) - no moderator check needed
        setupSelectMock(
          [], // No transaction
          [{ id: 'msg-1', participantId: 'p1', role: MessageRoles.ASSISTANT, roundNumber: 0 }],
          1,
        );

        mockDb.query.chatThread.findFirst.mockResolvedValue({
          id: 'thread-123',
          userId: 'user-123',
        });
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
            { id: 'msg-1', participantId: 'p1', role: MessageRoles.ASSISTANT, roundNumber: 0 },
            { id: 'msg-2', participantId: 'p2', role: MessageRoles.ASSISTANT, roundNumber: 0 },
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
          role: MessageRoles.ASSISTANT,
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
            { id: 'msg-1', participantId: 'p1', role: MessageRoles.ASSISTANT, roundNumber: 0 },
            { id: 'msg-2', participantId: 'p2', role: MessageRoles.ASSISTANT, roundNumber: 0 },
            { id: 'msg-3', participantId: 'p3', role: MessageRoles.ASSISTANT, roundNumber: 0 },
            { id: 'msg-4', participantId: 'p4', role: MessageRoles.ASSISTANT, roundNumber: 0 },
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
          role: MessageRoles.ASSISTANT,
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
            { id: 'msg-1', participantId: 'p1', role: MessageRoles.ASSISTANT, roundNumber: 0 },
            { id: 'msg-2', participantId: 'p2', role: MessageRoles.ASSISTANT, roundNumber: 0 },
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
          role: MessageRoles.ASSISTANT,
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
            { id: 'msg-1', participantId: 'p3', role: MessageRoles.ASSISTANT, roundNumber: 0 },
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
      const freeRoundTransaction = {
        id: 'tx-1',
        userId: 'user-123',
        action: 'free_round_complete',
      };

      // Mock db.select() for transaction check - returns existing transaction
      (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockImplementation(() => withCache(Promise.resolve([freeRoundTransaction]))),
          }),
        }),
      });
    });

    it('should return true immediately without checking thread/participants', async () => {
      const result = await checkFreeUserHasCompletedRound('user-123');

      expect(result).toBe(true);
      // Should only query once (transaction check) since transaction exists
      expect(mockDb.select).toHaveBeenCalledTimes(1);
    });

    it('should return true even if thread does not exist', async () => {
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
          { id: 'msg-1', participantId: 'p1', role: MessageRoles.ASSISTANT, roundNumber: 0 },
          { id: 'msg-2', participantId: 'p1', role: MessageRoles.ASSISTANT, roundNumber: 0 },
          { id: 'msg-3', participantId: 'p2', role: MessageRoles.ASSISTANT, roundNumber: 0 },
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
        role: MessageRoles.ASSISTANT,
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
          { id: 'msg-user', participantId: null, role: MessageRoles.USER, roundNumber: 0 },
          { id: 'msg-1', participantId: 'p1', role: MessageRoles.ASSISTANT, roundNumber: 0 },
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
            { id: 'msg-1', participantId: 'p1', role: MessageRoles.ASSISTANT, roundNumber: 0 },
            { id: 'msg-2', participantId: 'p2', role: MessageRoles.ASSISTANT, roundNumber: 0 },
            { id: 'msg-3', participantId: 'p1', role: MessageRoles.ASSISTANT, roundNumber: 1 },
            { id: 'msg-4', participantId: null, role: MessageRoles.USER, roundNumber: 0 },
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
          role: MessageRoles.ASSISTANT,
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
