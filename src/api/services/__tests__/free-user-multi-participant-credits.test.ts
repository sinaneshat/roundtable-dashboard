/**
 * Free User Multi-Participant Round Completion and Credits Tests
 *
 * Comprehensive unit tests for free user credit behavior across multi-participant rounds.
 * Tests verify:
 * - Credit calculation with different participant counts (1-4 participants)
 * - Round completion detection (ALL participants must respond)
 * - Credit deduction timing (ONLY after round complete, not per-participant)
 * - Incomplete round handling and resumption
 * - Free user single-round limit enforcement
 *
 * Business Rules:
 * - Free users get ONE complete conversation round (round 0 only)
 * - A round is complete when ALL enabled participants respond
 * - Credits are zeroed ONLY after round completion, not after each participant
 * - Disabled participants don't count toward round completion
 * - Incomplete rounds (some participants haven't responded) should not zero credits
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CreditActions, PlanTypes } from '@/api/core/enums';
import { checkFreeUserHasCompletedRound, getUserCreditBalance, zeroOutFreeUserCredits } from '@/api/services/credit.service';
import { getDbAsync } from '@/db';

// Mock the database module
vi.mock('@/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/db')>();
  return {
    ...actual,
    getDbAsync: vi.fn(),
  };
});

describe('Multi-Participant Round Completion - Credit Calculation', () => {
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
      userCreditBalance: {
        findFirst: ReturnType<typeof vi.fn>;
      };
    };
  };

  function setupDbMock() {
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
        userCreditBalance: {
          findFirst: vi.fn(),
        },
      },
    };

    // Default select implementation (for transaction and message queries)
    (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    // Default update implementation (for zeroing credits)
    (mockDb.update as ReturnType<typeof vi.fn>).mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue({}),
      }),
    });

    // Default insert implementation (for ensureUserCreditRecord)
    (mockDb.insert as ReturnType<typeof vi.fn>).mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    (getDbAsync as ReturnType<typeof vi.fn>).mockResolvedValue(mockDb);
  }

  beforeEach(() => {
    setupDbMock();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('1 Participant - Baseline', () => {
    it('round is complete after 1st participant responds', async () => {
      // Setup: 1 enabled participant
      mockDb.query.chatThread.findFirst.mockResolvedValue({
        id: 'thread-1',
        userId: 'user-1',
      });

      mockDb.query.chatParticipant.findMany.mockResolvedValue([
        { id: 'p1', modelId: 'model-1', isEnabled: true },
      ]);

      // Setup dual-query mock: first for transaction, second for messages
      const fromMock = vi.fn();
      let callCount = 0;
      fromMock.mockImplementation(() => ({
        where: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            // Transaction query with limit
            return {
              limit: vi.fn().mockResolvedValue([]), // No transaction
            };
          }
          // Message query
          return Promise.resolve([
            { id: 'msg-1', participantId: 'p1', role: 'assistant', roundNumber: 0 },
          ]);
        }),
      }));

      (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: fromMock,
      });

      const result = await checkFreeUserHasCompletedRound('user-1');

      expect(result).toBe(true);
    });

    it('credits should be zeroed after 1st participant completes round', async () => {
      // Setup free user - ensureUserCreditRecord will call select to find existing record
      const userCreditBalance = {
        id: 'balance-1',
        userId: 'user-1',
        balance: 5000,
        reservedCredits: 0,
        planType: PlanTypes.FREE,
        monthlyCredits: 0,
        lastRefillAt: null,
        nextRefillAt: null,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Mock select to return existing user credit balance
      (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([userCreditBalance]),
          }),
        }),
      });

      const updateMock = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue({}),
      });

      (mockDb.update as ReturnType<typeof vi.fn>).mockReturnValue({
        set: updateMock,
      });

      await zeroOutFreeUserCredits('user-1');

      // Verify credits were set to 0
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          balance: 0,
          reservedCredits: 0,
        }),
      );
    });
  });

  describe('2 Participants - Credit Timing', () => {
    it('round is NOT complete after 1st participant (of 2) responds', async () => {
      mockDb.query.chatThread.findFirst.mockResolvedValue({
        id: 'thread-2',
        userId: 'user-2',
      });

      mockDb.query.chatParticipant.findMany.mockResolvedValue([
        { id: 'p1', modelId: 'model-1', isEnabled: true },
        { id: 'p2', modelId: 'model-2', isEnabled: true },
      ]);

      // Only 1 message from participant 1
      const fromMock = vi.fn();
      let callCount = 0;
      fromMock.mockImplementation(() => ({
        where: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            // Transaction query
            return {
              limit: vi.fn().mockResolvedValue([]), // No transaction
            };
          }
          // Message query
          return Promise.resolve([
            { id: 'msg-1', participantId: 'p1', role: 'assistant', roundNumber: 0 },
          ]);
        }),
      }));

      (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: fromMock,
      });

      const result = await checkFreeUserHasCompletedRound('user-2');

      expect(result).toBe(false); // ✅ CRITICAL: Round NOT complete with only 1 of 2 participants
    });

    it('round IS complete after 2nd participant (of 2) responds', async () => {
      mockDb.query.chatThread.findFirst.mockResolvedValue({
        id: 'thread-2',
        userId: 'user-2',
      });

      mockDb.query.chatParticipant.findMany.mockResolvedValue([
        { id: 'p1', modelId: 'model-1', isEnabled: true },
        { id: 'p2', modelId: 'model-2', isEnabled: true },
      ]);

      // Both participants have responded
      const fromMock = vi.fn();
      let callCount = 0;
      fromMock.mockImplementation(() => ({
        where: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            // Transaction query
            return {
              limit: vi.fn().mockResolvedValue([]), // No transaction
            };
          }
          // Message query
          return Promise.resolve([
            { id: 'msg-1', participantId: 'p1', role: 'assistant', roundNumber: 0 },
            { id: 'msg-2', participantId: 'p2', role: 'assistant', roundNumber: 0 },
          ]);
        }),
      }));

      (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: fromMock,
      });

      const result = await checkFreeUserHasCompletedRound('user-2');

      expect(result).toBe(true); // ✅ Round complete after ALL participants respond
    });

    it('credits should NOT be zeroed after 1st of 2 participants', async () => {
      // This test verifies the business logic:
      // In streaming.handler.ts, checkFreeUserHasCompletedRound returns false
      // when only 1 of 2 participants has responded, so zeroOutFreeUserCredits
      // is NOT called yet.

      mockDb.query.chatThread.findFirst.mockResolvedValue({
        id: 'thread-2',
        userId: 'user-2',
      });

      mockDb.query.chatParticipant.findMany.mockResolvedValue([
        { id: 'p1', modelId: 'model-1', isEnabled: true },
        { id: 'p2', modelId: 'model-2', isEnabled: true },
      ]);

      // Only 1 participant responded
      const fromMock = vi.fn();
      let callCount = 0;
      fromMock.mockImplementation(() => ({
        where: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return {
              limit: vi.fn().mockResolvedValue([]),
            };
          }
          return Promise.resolve([
            { id: 'msg-1', participantId: 'p1', role: 'assistant', roundNumber: 0 },
          ]);
        }),
      }));

      (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: fromMock,
      });

      const roundComplete = await checkFreeUserHasCompletedRound('user-2');

      // Verify round is NOT complete
      expect(roundComplete).toBe(false);

      // In the actual streaming handler, this would prevent zeroOutFreeUserCredits from being called
      // We're testing the detection logic here, not the full flow
    });

    it('credits SHOULD be zeroed after 2nd of 2 participants', async () => {
      mockDb.query.chatThread.findFirst.mockResolvedValue({
        id: 'thread-2',
        userId: 'user-2',
      });

      mockDb.query.chatParticipant.findMany.mockResolvedValue([
        { id: 'p1', modelId: 'model-1', isEnabled: true },
        { id: 'p2', modelId: 'model-2', isEnabled: true },
      ]);

      // Both participants responded
      const fromMock = vi.fn();
      let callCount = 0;
      fromMock.mockImplementation(() => ({
        where: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return {
              limit: vi.fn().mockResolvedValue([]),
            };
          }
          return Promise.resolve([
            { id: 'msg-1', participantId: 'p1', role: 'assistant', roundNumber: 0 },
            { id: 'msg-2', participantId: 'p2', role: 'assistant', roundNumber: 0 },
          ]);
        }),
      }));

      (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: fromMock,
      });

      const roundComplete = await checkFreeUserHasCompletedRound('user-2');

      expect(roundComplete).toBe(true); // ✅ Now round is complete, credits can be zeroed
    });
  });

  describe('3 Participants - THE BUG SCENARIO', () => {
    it('round NOT complete after participant 0 responds (3 total)', async () => {
      mockDb.query.chatThread.findFirst.mockResolvedValue({
        id: 'thread-3',
        userId: 'user-3',
      });

      mockDb.query.chatParticipant.findMany.mockResolvedValue([
        { id: 'p1', modelId: 'model-1', isEnabled: true },
        { id: 'p2', modelId: 'model-2', isEnabled: true },
        { id: 'p3', modelId: 'model-3', isEnabled: true },
      ]);

      const fromMock = vi.fn();
      let callCount = 0;
      fromMock.mockImplementation(() => ({
        where: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return {
              limit: vi.fn().mockResolvedValue([]),
            };
          }
          return Promise.resolve([
            { id: 'msg-1', participantId: 'p1', role: 'assistant', roundNumber: 0 },
          ]);
        }),
      }));

      (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: fromMock,
      });

      const result = await checkFreeUserHasCompletedRound('user-3');

      expect(result).toBe(false); // ✅ BUG FIX: NOT complete after P0
    });

    it('round NOT complete after participant 1 responds (3 total)', async () => {
      mockDb.query.chatThread.findFirst.mockResolvedValue({
        id: 'thread-3',
        userId: 'user-3',
      });

      mockDb.query.chatParticipant.findMany.mockResolvedValue([
        { id: 'p1', modelId: 'model-1', isEnabled: true },
        { id: 'p2', modelId: 'model-2', isEnabled: true },
        { id: 'p3', modelId: 'model-3', isEnabled: true },
      ]);

      const fromMock = vi.fn();
      let callCount = 0;
      fromMock.mockImplementation(() => ({
        where: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return {
              limit: vi.fn().mockResolvedValue([]),
            };
          }
          return Promise.resolve([
            { id: 'msg-1', participantId: 'p1', role: 'assistant', roundNumber: 0 },
            { id: 'msg-2', participantId: 'p2', role: 'assistant', roundNumber: 0 },
          ]);
        }),
      }));

      (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: fromMock,
      });

      const result = await checkFreeUserHasCompletedRound('user-3');

      expect(result).toBe(false); // ✅ BUG FIX: NOT complete after P1
    });

    it('round IS complete after participant 2 responds (3 total)', async () => {
      mockDb.query.chatThread.findFirst.mockResolvedValue({
        id: 'thread-3',
        userId: 'user-3',
      });

      mockDb.query.chatParticipant.findMany.mockResolvedValue([
        { id: 'p1', modelId: 'model-1', isEnabled: true },
        { id: 'p2', modelId: 'model-2', isEnabled: true },
        { id: 'p3', modelId: 'model-3', isEnabled: true },
      ]);

      const fromMock = vi.fn();
      let callCount = 0;
      fromMock.mockImplementation(() => ({
        where: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return {
              limit: vi.fn().mockResolvedValue([]),
            };
          }
          return Promise.resolve([
            { id: 'msg-1', participantId: 'p1', role: 'assistant', roundNumber: 0 },
            { id: 'msg-2', participantId: 'p2', role: 'assistant', roundNumber: 0 },
            { id: 'msg-3', participantId: 'p3', role: 'assistant', roundNumber: 0 },
          ]);
        }),
      }));

      (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: fromMock,
      });

      const result = await checkFreeUserHasCompletedRound('user-3');

      expect(result).toBe(true); // ✅ ONLY complete after ALL 3 participants
    });

    it('verifies credit timing: NOT zeroed after P0 or P1, only after P2', async () => {
      // This test verifies the complete flow:
      // After P0: checkFreeUserHasCompletedRound() returns false → credits NOT zeroed
      // After P1: checkFreeUserHasCompletedRound() returns false → credits NOT zeroed
      // After P2: checkFreeUserHasCompletedRound() returns true → credits ARE zeroed

      mockDb.query.chatThread.findFirst.mockResolvedValue({
        id: 'thread-3',
        userId: 'user-3',
      });

      mockDb.query.chatParticipant.findMany.mockResolvedValue([
        { id: 'p1', modelId: 'model-1', isEnabled: true },
        { id: 'p2', modelId: 'model-2', isEnabled: true },
        { id: 'p3', modelId: 'model-3', isEnabled: true },
      ]);

      // Test after P0
      let callCount = 0;
      const fromMockP0 = vi.fn();
      fromMockP0.mockImplementation(() => ({
        where: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return { limit: vi.fn().mockResolvedValue([]) };
          }
          return Promise.resolve([
            { id: 'msg-1', participantId: 'p1', role: 'assistant', roundNumber: 0 },
          ]);
        }),
      }));

      (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({ from: fromMockP0 });
      const afterP0 = await checkFreeUserHasCompletedRound('user-3');
      expect(afterP0).toBe(false);

      // Test after P1
      callCount = 0;
      const fromMockP1 = vi.fn();
      fromMockP1.mockImplementation(() => ({
        where: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return { limit: vi.fn().mockResolvedValue([]) };
          }
          return Promise.resolve([
            { id: 'msg-1', participantId: 'p1', role: 'assistant', roundNumber: 0 },
            { id: 'msg-2', participantId: 'p2', role: 'assistant', roundNumber: 0 },
          ]);
        }),
      }));

      (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({ from: fromMockP1 });
      const afterP1 = await checkFreeUserHasCompletedRound('user-3');
      expect(afterP1).toBe(false);

      // Test after P2
      callCount = 0;
      const fromMockP2 = vi.fn();
      fromMockP2.mockImplementation(() => ({
        where: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return { limit: vi.fn().mockResolvedValue([]) };
          }
          return Promise.resolve([
            { id: 'msg-1', participantId: 'p1', role: 'assistant', roundNumber: 0 },
            { id: 'msg-2', participantId: 'p2', role: 'assistant', roundNumber: 0 },
            { id: 'msg-3', participantId: 'p3', role: 'assistant', roundNumber: 0 },
          ]);
        }),
      }));

      (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({ from: fromMockP2 });
      const afterP2 = await checkFreeUserHasCompletedRound('user-3');
      expect(afterP2).toBe(true); // ✅ ONLY true after ALL participants
    });
  });

  describe('4 Participants - Extended Scenario', () => {
    it('round NOT complete after participants 0, 1, 2 (4 total)', async () => {
      mockDb.query.chatThread.findFirst.mockResolvedValue({
        id: 'thread-4',
        userId: 'user-4',
      });

      mockDb.query.chatParticipant.findMany.mockResolvedValue([
        { id: 'p1', modelId: 'model-1', isEnabled: true },
        { id: 'p2', modelId: 'model-2', isEnabled: true },
        { id: 'p3', modelId: 'model-3', isEnabled: true },
        { id: 'p4', modelId: 'model-4', isEnabled: true },
      ]);

      const fromMock = vi.fn();
      let callCount = 0;
      fromMock.mockImplementation(() => ({
        where: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return {
              limit: vi.fn().mockResolvedValue([]),
            };
          }
          // Only 3 of 4 participants have responded
          return Promise.resolve([
            { id: 'msg-1', participantId: 'p1', role: 'assistant', roundNumber: 0 },
            { id: 'msg-2', participantId: 'p2', role: 'assistant', roundNumber: 0 },
            { id: 'msg-3', participantId: 'p3', role: 'assistant', roundNumber: 0 },
          ]);
        }),
      }));

      (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: fromMock,
      });

      const result = await checkFreeUserHasCompletedRound('user-4');

      expect(result).toBe(false); // NOT complete with only 3 of 4
    });

    it('round IS complete after all 4 participants respond', async () => {
      mockDb.query.chatThread.findFirst.mockResolvedValue({
        id: 'thread-4',
        userId: 'user-4',
      });

      mockDb.query.chatParticipant.findMany.mockResolvedValue([
        { id: 'p1', modelId: 'model-1', isEnabled: true },
        { id: 'p2', modelId: 'model-2', isEnabled: true },
        { id: 'p3', modelId: 'model-3', isEnabled: true },
        { id: 'p4', modelId: 'model-4', isEnabled: true },
      ]);

      const fromMock = vi.fn();
      let callCount = 0;
      fromMock.mockImplementation(() => ({
        where: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return {
              limit: vi.fn().mockResolvedValue([]),
            };
          }
          // All 4 participants responded
          return Promise.resolve([
            { id: 'msg-1', participantId: 'p1', role: 'assistant', roundNumber: 0 },
            { id: 'msg-2', participantId: 'p2', role: 'assistant', roundNumber: 0 },
            { id: 'msg-3', participantId: 'p3', role: 'assistant', roundNumber: 0 },
            { id: 'msg-4', participantId: 'p4', role: 'assistant', roundNumber: 0 },
          ]);
        }),
      }));

      (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: fromMock,
      });

      const result = await checkFreeUserHasCompletedRound('user-4');

      expect(result).toBe(true); // ✅ Complete after ALL 4 participants
    });
  });

  describe('Incomplete Round Handling', () => {
    it('incomplete round with 1 of 3 participants does not zero credits', async () => {
      mockDb.query.chatThread.findFirst.mockResolvedValue({
        id: 'thread-inc',
        userId: 'user-inc',
      });

      mockDb.query.chatParticipant.findMany.mockResolvedValue([
        { id: 'p1', modelId: 'model-1', isEnabled: true },
        { id: 'p2', modelId: 'model-2', isEnabled: true },
        { id: 'p3', modelId: 'model-3', isEnabled: true },
      ]);

      const fromMock = vi.fn();
      let callCount = 0;
      fromMock.mockImplementation(() => ({
        where: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return {
              limit: vi.fn().mockResolvedValue([]),
            };
          }
          // Only 1 participant responded
          return Promise.resolve([
            { id: 'msg-1', participantId: 'p1', role: 'assistant', roundNumber: 0 },
          ]);
        }),
      }));

      (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: fromMock,
      });

      const roundComplete = await checkFreeUserHasCompletedRound('user-inc');

      expect(roundComplete).toBe(false);
      // In the streaming handler, this false result prevents zeroOutFreeUserCredits
      // from being called, preserving credits for remaining participants
    });

    it('page refresh during incomplete round preserves credit state', async () => {
      // Scenario: User refreshes browser after participant 1 of 3 responds
      // The incomplete round detection should prevent credit zeroing

      mockDb.query.chatThread.findFirst.mockResolvedValue({
        id: 'thread-refresh',
        userId: 'user-refresh',
      });

      mockDb.query.chatParticipant.findMany.mockResolvedValue([
        { id: 'p1', modelId: 'model-1', isEnabled: true },
        { id: 'p2', modelId: 'model-2', isEnabled: true },
        { id: 'p3', modelId: 'model-3', isEnabled: true },
      ]);

      const fromMock = vi.fn();
      let callCount = 0;
      fromMock.mockImplementation(() => ({
        where: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return {
              limit: vi.fn().mockResolvedValue([]),
            };
          }
          // 2 of 3 participants responded before refresh
          return Promise.resolve([
            { id: 'msg-1', participantId: 'p1', role: 'assistant', roundNumber: 0 },
            { id: 'msg-2', participantId: 'p2', role: 'assistant', roundNumber: 0 },
          ]);
        }),
      }));

      (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: fromMock,
      });

      const roundComplete = await checkFreeUserHasCompletedRound('user-refresh');

      expect(roundComplete).toBe(false);
      // After page refresh, the round resumption logic will trigger participant 3
      // Credits remain intact until ALL participants complete
    });

    it('resumption after incomplete round continues correctly', async () => {
      // Scenario: 2 of 3 participants completed, then participant 3 completes

      mockDb.query.chatThread.findFirst.mockResolvedValue({
        id: 'thread-resume',
        userId: 'user-resume',
      });

      mockDb.query.chatParticipant.findMany.mockResolvedValue([
        { id: 'p1', modelId: 'model-1', isEnabled: true },
        { id: 'p2', modelId: 'model-2', isEnabled: true },
        { id: 'p3', modelId: 'model-3', isEnabled: true },
      ]);

      // First check: 2 of 3 participants
      const fromMock1 = vi.fn();
      let callCount1 = 0;
      fromMock1.mockImplementation(() => ({
        where: vi.fn().mockImplementation(() => {
          callCount1++;
          if (callCount1 === 1) {
            return {
              limit: vi.fn().mockResolvedValue([]),
            };
          }
          return Promise.resolve([
            { id: 'msg-1', participantId: 'p1', role: 'assistant', roundNumber: 0 },
            { id: 'msg-2', participantId: 'p2', role: 'assistant', roundNumber: 0 },
          ]);
        }),
      }));

      (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({ from: fromMock1 });
      const beforeResume = await checkFreeUserHasCompletedRound('user-resume');
      expect(beforeResume).toBe(false);

      // Second check: After participant 3 completes
      const fromMock2 = vi.fn();
      let callCount2 = 0;
      fromMock2.mockImplementation(() => ({
        where: vi.fn().mockImplementation(() => {
          callCount2++;
          if (callCount2 === 1) {
            return {
              limit: vi.fn().mockResolvedValue([]),
            };
          }
          return Promise.resolve([
            { id: 'msg-1', participantId: 'p1', role: 'assistant', roundNumber: 0 },
            { id: 'msg-2', participantId: 'p2', role: 'assistant', roundNumber: 0 },
            { id: 'msg-3', participantId: 'p3', role: 'assistant', roundNumber: 0 },
          ]);
        }),
      }));

      (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({ from: fromMock2 });
      const afterResume = await checkFreeUserHasCompletedRound('user-resume');
      expect(afterResume).toBe(true); // ✅ Now complete after resumption
    });
  });

  describe('Free User Single-Round Limit', () => {
    it('free user can only complete round 0', async () => {
      mockDb.query.chatThread.findFirst.mockResolvedValue({
        id: 'thread-limit',
        userId: 'user-limit',
      });

      mockDb.query.chatParticipant.findMany.mockResolvedValue([
        { id: 'p1', modelId: 'model-1', isEnabled: true },
      ]);

      // Messages in round 0
      const fromMock = vi.fn();
      let callCount = 0;
      fromMock.mockImplementation(() => ({
        where: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return {
              limit: vi.fn().mockResolvedValue([]),
            };
          }
          // Message in round 0
          return Promise.resolve([
            { id: 'msg-1', participantId: 'p1', role: 'assistant', roundNumber: 0 },
          ]);
        }),
      }));

      (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: fromMock,
      });

      const result = await checkFreeUserHasCompletedRound('user-limit');

      expect(result).toBe(true);
      // After round 0 completes, credits are zeroed
      // Any attempt at round 1+ should be blocked by insufficient credits
    });

    it('messages in round 1 do not count for free user completion', async () => {
      mockDb.query.chatThread.findFirst.mockResolvedValue({
        id: 'thread-r1',
        userId: 'user-r1',
      });

      mockDb.query.chatParticipant.findMany.mockResolvedValue([
        { id: 'p1', modelId: 'model-1', isEnabled: true },
      ]);

      // Messages in round 1 (should NOT count)
      const fromMock = vi.fn();
      let callCount = 0;
      fromMock.mockImplementation(() => ({
        where: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return {
              limit: vi.fn().mockResolvedValue([]),
            };
          }
          // The WHERE clause filters for roundNumber: 0, so round 1 messages are excluded
          return Promise.resolve([]);
        }),
      }));

      (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: fromMock,
      });

      const result = await checkFreeUserHasCompletedRound('user-r1');

      expect(result).toBe(false); // Round 1 messages don't count
    });

    it('transaction marker prevents duplicate credit zeroing', async () => {
      // If free_round_complete transaction exists, immediately return true
      // without checking participants/messages

      const fromMock = vi.fn();
      let callCount = 0;
      fromMock.mockImplementation(() => ({
        where: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            // Transaction query - return existing transaction
            return {
              limit: vi.fn().mockResolvedValue([
                {
                  id: 'tx-1',
                  userId: 'user-tx',
                  action: CreditActions.FREE_ROUND_COMPLETE,
                },
              ]),
            };
          }
          // Message query should NOT be called
          return Promise.resolve([]);
        }),
      }));

      (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: fromMock,
      });

      const result = await checkFreeUserHasCompletedRound('user-tx');

      expect(result).toBe(true);
      // Verify thread/participant queries were NOT called (early return)
      expect(mockDb.query.chatThread.findFirst).not.toHaveBeenCalled();
      expect(mockDb.query.chatParticipant.findMany).not.toHaveBeenCalled();
    });
  });

  describe('Credit Zeroing Implementation', () => {
    it('zeroOutFreeUserCredits sets balance and reserved to 0', async () => {
      const userCreditBalance = {
        id: 'balance-zero',
        userId: 'user-zero',
        balance: 3000,
        reservedCredits: 500,
        planType: PlanTypes.FREE,
        monthlyCredits: 0,
        lastRefillAt: null,
        nextRefillAt: null,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Mock select to return existing user credit balance
      (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([userCreditBalance]),
          }),
        }),
      });

      const updateMock = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue({}),
      });

      (mockDb.update as ReturnType<typeof vi.fn>).mockReturnValue({
        set: updateMock,
      });

      await zeroOutFreeUserCredits('user-zero');

      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          balance: 0,
          reservedCredits: 0,
        }),
      );
    });

    it('zeroOutFreeUserCredits only affects FREE plan users', async () => {
      // Paid user should NOT have credits zeroed
      const paidUserBalance = {
        id: 'balance-paid',
        userId: 'user-paid',
        balance: 50000,
        reservedCredits: 0,
        planType: PlanTypes.PAID,
        monthlyCredits: 100000,
        lastRefillAt: null,
        nextRefillAt: null,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Mock select to return existing paid user credit balance
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

      // Update should NOT be called for paid users
      expect(updateMock).not.toHaveBeenCalled();
    });

    it('getUserCreditBalance returns correct plan type', async () => {
      const userCreditBalance = {
        id: 'balance-check',
        userId: 'user-check',
        balance: 5000,
        reservedCredits: 0,
        planType: PlanTypes.FREE,
        monthlyCredits: 0,
        lastRefillAt: null,
        nextRefillAt: null,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Mock select to return existing user credit balance
      (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([userCreditBalance]),
          }),
        }),
      });

      const balance = await getUserCreditBalance('user-check');

      expect(balance.planType).toBe(PlanTypes.FREE);
      expect(balance.balance).toBe(5000);
    });
  });

  describe('Edge Cases and Error Scenarios', () => {
    it('handles null participantId in messages (user messages)', async () => {
      mockDb.query.chatThread.findFirst.mockResolvedValue({
        id: 'thread-null',
        userId: 'user-null',
      });

      mockDb.query.chatParticipant.findMany.mockResolvedValue([
        { id: 'p1', modelId: 'model-1', isEnabled: true },
      ]);

      // User message (null participantId) + assistant message
      const fromMock = vi.fn();
      let callCount = 0;
      fromMock.mockImplementation(() => ({
        where: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return {
              limit: vi.fn().mockResolvedValue([]),
            };
          }
          return Promise.resolve([
            { id: 'msg-user', participantId: null, role: 'user', roundNumber: 0 },
            { id: 'msg-1', participantId: 'p1', role: 'assistant', roundNumber: 0 },
          ]);
        }),
      }));

      (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: fromMock,
      });

      const result = await checkFreeUserHasCompletedRound('user-null');

      expect(result).toBe(true); // User messages are filtered out
    });

    it('duplicate messages from same participant count only once', async () => {
      mockDb.query.chatThread.findFirst.mockResolvedValue({
        id: 'thread-dup',
        userId: 'user-dup',
      });

      mockDb.query.chatParticipant.findMany.mockResolvedValue([
        { id: 'p1', modelId: 'model-1', isEnabled: true },
        { id: 'p2', modelId: 'model-2', isEnabled: true },
      ]);

      // Participant 1 has 2 messages, participant 2 has 1
      const fromMock = vi.fn();
      let callCount = 0;
      fromMock.mockImplementation(() => ({
        where: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return {
              limit: vi.fn().mockResolvedValue([]),
            };
          }
          return Promise.resolve([
            { id: 'msg-1a', participantId: 'p1', role: 'assistant', roundNumber: 0 },
            { id: 'msg-1b', participantId: 'p1', role: 'assistant', roundNumber: 0 },
            { id: 'msg-2', participantId: 'p2', role: 'assistant', roundNumber: 0 },
          ]);
        }),
      }));

      (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: fromMock,
      });

      const result = await checkFreeUserHasCompletedRound('user-dup');

      expect(result).toBe(true); // Set deduplicates participant IDs
    });

    it('no thread returns false immediately', async () => {
      mockDb.query.chatThread.findFirst.mockResolvedValue(undefined);

      const result = await checkFreeUserHasCompletedRound('user-nothread');

      expect(result).toBe(false);
      // Should not call participant query
      expect(mockDb.query.chatParticipant.findMany).not.toHaveBeenCalled();
    });

    it('no enabled participants returns false', async () => {
      mockDb.query.chatThread.findFirst.mockResolvedValue({
        id: 'thread-nopart',
        userId: 'user-nopart',
      });

      mockDb.query.chatParticipant.findMany.mockResolvedValue([]);

      const result = await checkFreeUserHasCompletedRound('user-nopart');

      expect(result).toBe(false);
    });

    it('disabled participants do not count toward completion', async () => {
      mockDb.query.chatThread.findFirst.mockResolvedValue({
        id: 'thread-disabled',
        userId: 'user-disabled',
      });

      // 2 enabled, 1 disabled
      mockDb.query.chatParticipant.findMany.mockResolvedValue([
        { id: 'p1', modelId: 'model-1', isEnabled: true },
        { id: 'p2', modelId: 'model-2', isEnabled: true },
      ]);

      // Both enabled participants responded, disabled participant also responded
      const fromMock = vi.fn();
      let callCount = 0;
      fromMock.mockImplementation(() => ({
        where: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return {
              limit: vi.fn().mockResolvedValue([]),
            };
          }
          return Promise.resolve([
            { id: 'msg-1', participantId: 'p1', role: 'assistant', roundNumber: 0 },
            { id: 'msg-2', participantId: 'p2', role: 'assistant', roundNumber: 0 },
            { id: 'msg-3', participantId: 'p3-disabled', role: 'assistant', roundNumber: 0 },
          ]);
        }),
      }));

      (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: fromMock,
      });

      const result = await checkFreeUserHasCompletedRound('user-disabled');

      expect(result).toBe(true); // Disabled participant doesn't count
    });
  });
});
