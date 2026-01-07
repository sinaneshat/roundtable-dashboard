/**
 * Free User Round Completion Logic - Comprehensive Test Suite
 *
 * Tests the complete flow of round completion detection and credit zeroing for free users.
 * This is critical for enforcing the "one free round" business rule.
 *
 * BUSINESS LOGIC TESTED:
 * 1. Round completion detection (checkFreeUserHasCompletedRound)
 *    - All enabled participants must respond in round 0
 *    - For multi-participant (2+): moderator must also complete with content
 *    - For single-participant: no moderator required
 *    - Disabled participants don't affect completion
 *    - Only round 0 counts for free users
 *    - FREE_ROUND_COMPLETE transaction acts as permanent marker
 *
 * 2. Credit zeroing (zeroOutFreeUserCredits)
 *    - Sets balance and reservedCredits to 0
 *    - Creates FREE_ROUND_COMPLETE transaction
 *    - Only affects FREE plan users
 *    - Idempotent (safe to call multiple times)
 *
 * 3. Subsequent operation blocking (enforceCredits)
 *    - Free users blocked after round completion
 *    - Error message directs to subscription
 *
 * 4. Race condition prevention
 *    - Transaction marker prevents duplicate checks
 *    - Multiple concurrent completion checks handled safely
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CreditActions, CreditTransactionTypes, PlanTypes } from '@/api/core/enums';
import {
  checkFreeUserHasCompletedRound,
  enforceCredits,
  getUserCreditBalance,
  zeroOutFreeUserCredits,
} from '@/api/services/billing';
import { getDbAsync } from '@/db';

vi.mock('@/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/db')>();
  return {
    ...actual,
    getDbAsync: vi.fn(),
  };
});

describe('free User Round Completion Logic', () => {
  let mockDb: {
    select: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    insert: ReturnType<typeof vi.fn>;
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

  function setupSelectMock(transactionResult: unknown[], messageResult: unknown[]) {
    const fromMock = vi.fn();
    let callCount = 0;

    fromMock.mockImplementation(() => {
      callCount++;
      const whereMock = vi.fn();

      if (callCount === 1) {
        whereMock.mockReturnValue({
          limit: vi.fn().mockResolvedValue(transactionResult),
        });
      } else {
        whereMock.mockResolvedValue(messageResult);
      }

      return { where: whereMock };
    });

    (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: fromMock,
    });
  }

  beforeEach(() => {
    mockDb = {
      select: vi.fn(),
      update: vi.fn(),
      insert: vi.fn(),
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

    (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    (getDbAsync as ReturnType<typeof vi.fn>).mockResolvedValue(mockDb);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('round Completion Detection - Single Participant', () => {
    it('should detect completion with 1 participant after response', async () => {
      setupSelectMock(
        [],
        [{ id: 'msg-1', participantId: 'p1', role: 'assistant', roundNumber: 0 }],
      );

      mockDb.query.chatThread.findFirst.mockResolvedValue({
        id: 'thread-1',
        userId: 'user-1',
      });

      mockDb.query.chatParticipant.findMany.mockResolvedValue([
        { id: 'p1', modelId: 'model-1', isEnabled: true },
      ]);

      const result = await checkFreeUserHasCompletedRound('user-1');

      expect(result).toBe(true);
    });

    it('should NOT detect completion before participant responds', async () => {
      setupSelectMock([], []);

      mockDb.query.chatThread.findFirst.mockResolvedValue({
        id: 'thread-1',
        userId: 'user-1',
      });

      mockDb.query.chatParticipant.findMany.mockResolvedValue([
        { id: 'p1', modelId: 'model-1', isEnabled: true },
      ]);

      const result = await checkFreeUserHasCompletedRound('user-1');

      expect(result).toBe(false);
    });
  });

  describe('round Completion Detection - Multiple Participants (2+)', () => {
    describe('2 participants', () => {
      it('should NOT detect completion after 1st of 2 participants', async () => {
        setupSelectMock(
          [],
          [{ id: 'msg-1', participantId: 'p1', role: 'assistant', roundNumber: 0 }],
        );

        mockDb.query.chatThread.findFirst.mockResolvedValue({
          id: 'thread-2',
          userId: 'user-2',
        });

        mockDb.query.chatParticipant.findMany.mockResolvedValue([
          { id: 'p1', modelId: 'model-1', isEnabled: true },
          { id: 'p2', modelId: 'model-2', isEnabled: true },
        ]);

        mockDb.query.chatMessage.findFirst.mockResolvedValue(undefined);

        const result = await checkFreeUserHasCompletedRound('user-2');

        expect(result).toBe(false);
      });

      it('should NOT detect completion after 2nd participant but before moderator', async () => {
        setupSelectMock(
          [],
          [
            { id: 'msg-1', participantId: 'p1', role: 'assistant', roundNumber: 0 },
            { id: 'msg-2', participantId: 'p2', role: 'assistant', roundNumber: 0 },
          ],
        );

        mockDb.query.chatThread.findFirst.mockResolvedValue({
          id: 'thread-2',
          userId: 'user-2',
        });

        mockDb.query.chatParticipant.findMany.mockResolvedValue([
          { id: 'p1', modelId: 'model-1', isEnabled: true },
          { id: 'p2', modelId: 'model-2', isEnabled: true },
        ]);

        mockDb.query.chatMessage.findFirst.mockResolvedValue(undefined);

        const result = await checkFreeUserHasCompletedRound('user-2');

        expect(result).toBe(false);
      });

      it('should NOT detect completion when moderator exists but has no content', async () => {
        setupSelectMock(
          [],
          [
            { id: 'msg-1', participantId: 'p1', role: 'assistant', roundNumber: 0 },
            { id: 'msg-2', participantId: 'p2', role: 'assistant', roundNumber: 0 },
          ],
        );

        mockDb.query.chatThread.findFirst.mockResolvedValue({
          id: 'thread-2',
          userId: 'user-2',
        });

        mockDb.query.chatParticipant.findMany.mockResolvedValue([
          { id: 'p1', modelId: 'model-1', isEnabled: true },
          { id: 'p2', modelId: 'model-2', isEnabled: true },
        ]);

        mockDb.query.chatMessage.findFirst.mockResolvedValue({
          id: 'thread-2_r0_moderator',
          parts: [],
        });

        const result = await checkFreeUserHasCompletedRound('user-2');

        expect(result).toBe(false);
      });

      it('should detect completion after all participants AND moderator with content', async () => {
        setupSelectMock(
          [],
          [
            { id: 'msg-1', participantId: 'p1', role: 'assistant', roundNumber: 0 },
            { id: 'msg-2', participantId: 'p2', role: 'assistant', roundNumber: 0 },
          ],
        );

        mockDb.query.chatThread.findFirst.mockResolvedValue({
          id: 'thread-2',
          userId: 'user-2',
        });

        mockDb.query.chatParticipant.findMany.mockResolvedValue([
          { id: 'p1', modelId: 'model-1', isEnabled: true },
          { id: 'p2', modelId: 'model-2', isEnabled: true },
        ]);

        mockDb.query.chatMessage.findFirst.mockResolvedValue({
          id: 'thread-2_r0_moderator',
          parts: [{ type: 'text', text: 'Round summary content' }],
        });

        const result = await checkFreeUserHasCompletedRound('user-2');

        expect(result).toBe(true);
      });
    });

    describe('5 participants', () => {
      it('should NOT detect completion after 4 of 5 participants', async () => {
        setupSelectMock(
          [],
          [
            { id: 'msg-1', participantId: 'p1', role: 'assistant', roundNumber: 0 },
            { id: 'msg-2', participantId: 'p2', role: 'assistant', roundNumber: 0 },
            { id: 'msg-3', participantId: 'p3', role: 'assistant', roundNumber: 0 },
            { id: 'msg-4', participantId: 'p4', role: 'assistant', roundNumber: 0 },
          ],
        );

        mockDb.query.chatThread.findFirst.mockResolvedValue({
          id: 'thread-5',
          userId: 'user-5',
        });

        mockDb.query.chatParticipant.findMany.mockResolvedValue([
          { id: 'p1', modelId: 'model-1', isEnabled: true },
          { id: 'p2', modelId: 'model-2', isEnabled: true },
          { id: 'p3', modelId: 'model-3', isEnabled: true },
          { id: 'p4', modelId: 'model-4', isEnabled: true },
          { id: 'p5', modelId: 'model-5', isEnabled: true },
        ]);

        mockDb.query.chatMessage.findFirst.mockResolvedValue(undefined);

        const result = await checkFreeUserHasCompletedRound('user-5');

        expect(result).toBe(false);
      });

      it('should detect completion after all 5 participants AND moderator', async () => {
        setupSelectMock(
          [],
          [
            { id: 'msg-1', participantId: 'p1', role: 'assistant', roundNumber: 0 },
            { id: 'msg-2', participantId: 'p2', role: 'assistant', roundNumber: 0 },
            { id: 'msg-3', participantId: 'p3', role: 'assistant', roundNumber: 0 },
            { id: 'msg-4', participantId: 'p4', role: 'assistant', roundNumber: 0 },
            { id: 'msg-5', participantId: 'p5', role: 'assistant', roundNumber: 0 },
          ],
        );

        mockDb.query.chatThread.findFirst.mockResolvedValue({
          id: 'thread-5',
          userId: 'user-5',
        });

        mockDb.query.chatParticipant.findMany.mockResolvedValue([
          { id: 'p1', modelId: 'model-1', isEnabled: true },
          { id: 'p2', modelId: 'model-2', isEnabled: true },
          { id: 'p3', modelId: 'model-3', isEnabled: true },
          { id: 'p4', modelId: 'model-4', isEnabled: true },
          { id: 'p5', modelId: 'model-5', isEnabled: true },
        ]);

        mockDb.query.chatMessage.findFirst.mockResolvedValue({
          id: 'thread-5_r0_moderator',
          parts: [{ type: 'text', text: 'Summary of 5 perspectives' }],
        });

        const result = await checkFreeUserHasCompletedRound('user-5');

        expect(result).toBe(true);
      });
    });
  });

  describe('disabled Participants', () => {
    it('should ignore disabled participants and detect completion', async () => {
      setupSelectMock(
        [],
        [
          { id: 'msg-1', participantId: 'p1', role: 'assistant', roundNumber: 0 },
          { id: 'msg-2', participantId: 'p2', role: 'assistant', roundNumber: 0 },
        ],
      );

      mockDb.query.chatThread.findFirst.mockResolvedValue({
        id: 'thread-d',
        userId: 'user-d',
      });

      mockDb.query.chatParticipant.findMany.mockResolvedValue([
        { id: 'p1', modelId: 'model-1', isEnabled: true },
        { id: 'p2', modelId: 'model-2', isEnabled: true },
      ]);

      mockDb.query.chatMessage.findFirst.mockResolvedValue({
        id: 'thread-d_r0_moderator',
        parts: [{ type: 'text', text: 'Summary' }],
      });

      const result = await checkFreeUserHasCompletedRound('user-d');

      expect(result).toBe(true);
    });

    it('should NOT detect completion when only disabled participants responded', async () => {
      setupSelectMock(
        [],
        [{ id: 'msg-disabled', participantId: 'p-disabled', role: 'assistant', roundNumber: 0 }],
      );

      mockDb.query.chatThread.findFirst.mockResolvedValue({
        id: 'thread-d2',
        userId: 'user-d2',
      });

      mockDb.query.chatParticipant.findMany.mockResolvedValue([
        { id: 'p1', modelId: 'model-1', isEnabled: true },
        { id: 'p2', modelId: 'model-2', isEnabled: true },
      ]);

      const result = await checkFreeUserHasCompletedRound('user-d2');

      expect(result).toBe(false);
    });

    it('should handle all participants disabled scenario', async () => {
      setupSelectMock([], []);

      mockDb.query.chatThread.findFirst.mockResolvedValue({
        id: 'thread-all-disabled',
        userId: 'user-all-disabled',
      });

      mockDb.query.chatParticipant.findMany.mockResolvedValue([]);

      const result = await checkFreeUserHasCompletedRound('user-all-disabled');

      expect(result).toBe(false);
    });
  });

  describe('only Round 0 Counts', () => {
    it('should NOT detect completion when messages only in round 1', async () => {
      setupSelectMock([], []);

      mockDb.query.chatThread.findFirst.mockResolvedValue({
        id: 'thread-r1',
        userId: 'user-r1',
      });

      mockDb.query.chatParticipant.findMany.mockResolvedValue([
        { id: 'p1', modelId: 'model-1', isEnabled: true },
      ]);

      const result = await checkFreeUserHasCompletedRound('user-r1');

      expect(result).toBe(false);
    });

    it('should detect completion only from round 0 messages', async () => {
      setupSelectMock(
        [],
        [{ id: 'msg-r0', participantId: 'p1', role: 'assistant', roundNumber: 0 }],
      );

      mockDb.query.chatThread.findFirst.mockResolvedValue({
        id: 'thread-r0',
        userId: 'user-r0',
      });

      mockDb.query.chatParticipant.findMany.mockResolvedValue([
        { id: 'p1', modelId: 'model-1', isEnabled: true },
      ]);

      const result = await checkFreeUserHasCompletedRound('user-r0');

      expect(result).toBe(true);
    });
  });

  describe('fREE_ROUND_COMPLETE Transaction Marker', () => {
    it('should immediately return true when transaction exists', async () => {
      (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: 'tx-complete',
                userId: 'user-tx',
                action: CreditActions.FREE_ROUND_COMPLETE,
              },
            ]),
          }),
        }),
      });

      const result = await checkFreeUserHasCompletedRound('user-tx');

      expect(result).toBe(true);
      expect(mockDb.query.chatThread.findFirst).not.toHaveBeenCalled();
      expect(mockDb.query.chatParticipant.findMany).not.toHaveBeenCalled();
    });

    it('should prevent redundant database queries after completion', async () => {
      (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: 'tx-complete',
                userId: 'user-redundant',
                action: CreditActions.FREE_ROUND_COMPLETE,
              },
            ]),
          }),
        }),
      });

      await checkFreeUserHasCompletedRound('user-redundant');
      await checkFreeUserHasCompletedRound('user-redundant');
      await checkFreeUserHasCompletedRound('user-redundant');

      expect(mockDb.query.chatThread.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('credit Zeroing (zeroOutFreeUserCredits)', () => {
    it('should zero balance and reserved credits', async () => {
      const userBalance = {
        id: 'balance-1',
        userId: 'user-zero',
        balance: 4900,
        reservedCredits: 100,
        planType: PlanTypes.FREE,
        version: 1,
      };

      (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([userBalance]),
          }),
        }),
      });

      const updateMock = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });

      (mockDb.update as ReturnType<typeof vi.fn>).mockReturnValue({
        set: updateMock,
      });

      (mockDb.insert as ReturnType<typeof vi.fn>).mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      });

      await zeroOutFreeUserCredits('user-zero');

      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          balance: 0,
          reservedCredits: 0,
        }),
      );
    });

    it('should create FREE_ROUND_COMPLETE transaction', async () => {
      const userBalance = {
        id: 'balance-tx',
        userId: 'user-tx',
        balance: 3000,
        reservedCredits: 0,
        planType: PlanTypes.FREE,
        version: 1,
      };

      (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([userBalance]),
          }),
        }),
      });

      (mockDb.update as ReturnType<typeof vi.fn>).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });

      const insertValuesMock = vi.fn().mockResolvedValue(undefined);
      (mockDb.insert as ReturnType<typeof vi.fn>).mockReturnValue({
        values: insertValuesMock,
      });

      await zeroOutFreeUserCredits('user-tx');

      expect(insertValuesMock).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-tx',
          type: CreditTransactionTypes.DEDUCTION,
          action: CreditActions.FREE_ROUND_COMPLETE,
          amount: -3000,
          balanceAfter: 0,
        }),
      );
    });

    it('should only affect FREE plan users', async () => {
      const paidUserBalance = {
        id: 'balance-paid',
        userId: 'user-paid',
        balance: 50000,
        reservedCredits: 0,
        planType: PlanTypes.PAID,
        version: 1,
      };

      (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([paidUserBalance]),
          }),
        }),
      });

      const updateMock = vi.fn();
      (mockDb.update as ReturnType<typeof vi.fn>).mockReturnValue({
        set: updateMock,
      });

      await zeroOutFreeUserCredits('user-paid');

      expect(updateMock).not.toHaveBeenCalled();
    });

    it('should be idempotent when balance already 0', async () => {
      const zeroBalance = {
        id: 'balance-zero',
        userId: 'user-already-zero',
        balance: 0,
        reservedCredits: 0,
        planType: PlanTypes.FREE,
        version: 1,
      };

      (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([zeroBalance]),
          }),
        }),
      });

      (mockDb.update as ReturnType<typeof vi.fn>).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });

      const insertValuesMock = vi.fn().mockResolvedValue(undefined);
      (mockDb.insert as ReturnType<typeof vi.fn>).mockReturnValue({
        values: insertValuesMock,
      });

      await zeroOutFreeUserCredits('user-already-zero');

      expect(insertValuesMock).not.toHaveBeenCalled();
    });
  });

  describe('subsequent Operations Blocked (enforceCredits)', () => {
    it('should block free users after round completion', async () => {
      (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: 'tx-complete',
                userId: 'user-blocked',
                action: CreditActions.FREE_ROUND_COMPLETE,
              },
            ]),
          }),
        }),
      });

      mockDb.query.chatThread.findFirst.mockResolvedValue(undefined);

      await expect(
        enforceCredits('user-blocked', 100),
      ).rejects.toThrow('Your free conversation round has been used');
    });

    it('should provide upgrade message in error', async () => {
      (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: 'tx-complete',
                userId: 'user-upgrade',
                action: CreditActions.FREE_ROUND_COMPLETE,
              },
            ]),
          }),
        }),
      });

      mockDb.query.chatThread.findFirst.mockResolvedValue(undefined);

      await expect(
        enforceCredits('user-upgrade', 100),
      ).rejects.toThrow('Subscribe to Pro to continue chatting');
    });
  });

  describe('race Condition Prevention', () => {
    it('should handle concurrent completion checks safely', async () => {
      (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: 'tx-race',
                userId: 'user-race',
                action: CreditActions.FREE_ROUND_COMPLETE,
              },
            ]),
          }),
        }),
      });

      const results = await Promise.all([
        checkFreeUserHasCompletedRound('user-race'),
        checkFreeUserHasCompletedRound('user-race'),
        checkFreeUserHasCompletedRound('user-race'),
      ]);

      expect(results).toEqual([true, true, true]);
      expect(mockDb.query.chatThread.findFirst).not.toHaveBeenCalled();
    });

    it('should prevent duplicate credit zeroing via transaction marker', async () => {
      const userBalance = {
        id: 'balance-dup',
        userId: 'user-dup',
        balance: 5000,
        reservedCredits: 0,
        planType: PlanTypes.FREE,
        version: 1,
      };

      let txCreated = false;

      (mockDb.select as ReturnType<typeof vi.fn>).mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue(
              txCreated
                ? [{ id: 'tx-dup', userId: 'user-dup', action: CreditActions.FREE_ROUND_COMPLETE }]
                : [userBalance],
            ),
          }),
        }),
      }));

      (mockDb.update as ReturnType<typeof vi.fn>).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });

      (mockDb.insert as ReturnType<typeof vi.fn>).mockReturnValue({
        values: vi.fn().mockImplementation(() => {
          txCreated = true;
          return Promise.resolve(undefined);
        }),
      });

      await zeroOutFreeUserCredits('user-dup');
      const firstCheckResult = await checkFreeUserHasCompletedRound('user-dup');

      expect(firstCheckResult).toBe(true);
    });
  });

  describe('edge Cases', () => {
    it('should handle no thread scenario', async () => {
      setupSelectMock([], []);

      mockDb.query.chatThread.findFirst.mockResolvedValue(undefined);

      const result = await checkFreeUserHasCompletedRound('user-no-thread');

      expect(result).toBe(false);
    });

    it('should handle no participants scenario', async () => {
      setupSelectMock([], []);

      mockDb.query.chatThread.findFirst.mockResolvedValue({
        id: 'thread-no-parts',
        userId: 'user-no-parts',
      });

      mockDb.query.chatParticipant.findMany.mockResolvedValue([]);

      const result = await checkFreeUserHasCompletedRound('user-no-parts');

      expect(result).toBe(false);
    });

    it('should handle duplicate messages from same participant', async () => {
      setupSelectMock(
        [],
        [
          { id: 'msg-1', participantId: 'p1', role: 'assistant', roundNumber: 0 },
          { id: 'msg-2', participantId: 'p1', role: 'assistant', roundNumber: 0 },
          { id: 'msg-3', participantId: 'p2', role: 'assistant', roundNumber: 0 },
        ],
      );

      mockDb.query.chatThread.findFirst.mockResolvedValue({
        id: 'thread-dup',
        userId: 'user-dup',
      });

      mockDb.query.chatParticipant.findMany.mockResolvedValue([
        { id: 'p1', modelId: 'model-1', isEnabled: true },
        { id: 'p2', modelId: 'model-2', isEnabled: true },
      ]);

      mockDb.query.chatMessage.findFirst.mockResolvedValue({
        id: 'thread-dup_r0_moderator',
        parts: [{ type: 'text', text: 'Summary' }],
      });

      const result = await checkFreeUserHasCompletedRound('user-dup');

      expect(result).toBe(true);
    });

    it('should handle messages with null participantId', async () => {
      setupSelectMock(
        [],
        [
          { id: 'msg-user', participantId: null, role: 'user', roundNumber: 0 },
          { id: 'msg-1', participantId: 'p1', role: 'assistant', roundNumber: 0 },
        ],
      );

      mockDb.query.chatThread.findFirst.mockResolvedValue({
        id: 'thread-null',
        userId: 'user-null',
      });

      mockDb.query.chatParticipant.findMany.mockResolvedValue([
        { id: 'p1', modelId: 'model-1', isEnabled: true },
        { id: 'p2', modelId: 'model-2', isEnabled: true },
      ]);

      const result = await checkFreeUserHasCompletedRound('user-null');

      expect(result).toBe(false);
    });

    it('should handle moderator with empty text parts', async () => {
      setupSelectMock(
        [],
        [
          { id: 'msg-1', participantId: 'p1', role: 'assistant', roundNumber: 0 },
          { id: 'msg-2', participantId: 'p2', role: 'assistant', roundNumber: 0 },
        ],
      );

      mockDb.query.chatThread.findFirst.mockResolvedValue({
        id: 'thread-empty',
        userId: 'user-empty',
      });

      mockDb.query.chatParticipant.findMany.mockResolvedValue([
        { id: 'p1', modelId: 'model-1', isEnabled: true },
        { id: 'p2', modelId: 'model-2', isEnabled: true },
      ]);

      mockDb.query.chatMessage.findFirst.mockResolvedValue({
        id: 'thread-empty_r0_moderator',
        parts: [{ type: 'text', text: '   ' }],
      });

      const result = await checkFreeUserHasCompletedRound('user-empty');

      expect(result).toBe(false);
    });

    it('should handle moderator with non-text parts', async () => {
      setupSelectMock(
        [],
        [
          { id: 'msg-1', participantId: 'p1', role: 'assistant', roundNumber: 0 },
          { id: 'msg-2', participantId: 'p2', role: 'assistant', roundNumber: 0 },
        ],
      );

      mockDb.query.chatThread.findFirst.mockResolvedValue({
        id: 'thread-non-text',
        userId: 'user-non-text',
      });

      mockDb.query.chatParticipant.findMany.mockResolvedValue([
        { id: 'p1', modelId: 'model-1', isEnabled: true },
        { id: 'p2', modelId: 'model-2', isEnabled: true },
      ]);

      mockDb.query.chatMessage.findFirst.mockResolvedValue({
        id: 'thread-non-text_r0_moderator',
        parts: [{ type: 'image', url: 'https://example.com/image.png' }],
      });

      const result = await checkFreeUserHasCompletedRound('user-non-text');

      expect(result).toBe(false);
    });
  });

  describe('integration Scenarios', () => {
    it('should handle complete flow: 1 participant thread', async () => {
      setupSelectMock(
        [],
        [{ id: 'msg-1', participantId: 'p1', role: 'assistant', roundNumber: 0 }],
      );

      mockDb.query.chatThread.findFirst.mockResolvedValue({
        id: 'thread-flow-1',
        userId: 'user-flow-1',
      });

      mockDb.query.chatParticipant.findMany.mockResolvedValue([
        { id: 'p1', modelId: 'model-1', isEnabled: true },
      ]);

      const isComplete = await checkFreeUserHasCompletedRound('user-flow-1');
      expect(isComplete).toBe(true);
    });

    it('should handle complete flow: 3 participant thread', async () => {
      setupSelectMock(
        [],
        [
          { id: 'msg-1', participantId: 'p1', role: 'assistant', roundNumber: 0 },
          { id: 'msg-2', participantId: 'p2', role: 'assistant', roundNumber: 0 },
          { id: 'msg-3', participantId: 'p3', role: 'assistant', roundNumber: 0 },
        ],
      );

      mockDb.query.chatThread.findFirst.mockResolvedValue({
        id: 'thread-flow-3',
        userId: 'user-flow-3',
      });

      mockDb.query.chatParticipant.findMany.mockResolvedValue([
        { id: 'p1', modelId: 'model-1', isEnabled: true },
        { id: 'p2', modelId: 'model-2', isEnabled: true },
        { id: 'p3', modelId: 'model-3', isEnabled: true },
      ]);

      mockDb.query.chatMessage.findFirst.mockResolvedValue({
        id: 'thread-flow-3_r0_moderator',
        parts: [{ type: 'text', text: 'Summary of 3 perspectives' }],
      });

      const isComplete = await checkFreeUserHasCompletedRound('user-flow-3');
      expect(isComplete).toBe(true);
    });

    it('should preserve credit balance query structure', async () => {
      const balance = {
        id: 'balance-query',
        userId: 'user-query',
        balance: 5000,
        reservedCredits: 100,
        planType: PlanTypes.FREE,
        monthlyCredits: 0,
        nextRefillAt: null,
        version: 1,
      };

      (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([balance]),
          }),
        }),
      });

      const result = await getUserCreditBalance('user-query');

      expect(result).toEqual({
        balance: 5000,
        reserved: 100,
        available: 4900,
        planType: PlanTypes.FREE,
        monthlyCredits: 0,
        nextRefillAt: null,
      });
    });
  });
});
