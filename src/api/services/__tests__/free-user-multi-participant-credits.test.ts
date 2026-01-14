import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CreditActions, MessageRoles, PlanTypes } from '@/api/core/enums';
import { checkFreeUserHasCompletedRound, zeroOutFreeUserCredits } from '@/api/services/billing';
import { getDbAsync } from '@/db';

vi.mock('@/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/db')>();
  return {
    ...actual,
    getDbAsync: vi.fn(),
  };
});

type MockDb = {
  select: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  query: {
    chatThread: { findFirst: ReturnType<typeof vi.fn> };
    chatParticipant: { findMany: ReturnType<typeof vi.fn> };
    chatMessage: { findFirst: ReturnType<typeof vi.fn> };
  };
};

let mockDb: MockDb;

function withCache<T>(value: T) {
  const promise = Promise.resolve(value) as Promise<T> & { $withCache: ReturnType<typeof vi.fn> };
  promise.$withCache = vi.fn(() => promise);
  return promise;
}

function setupMockDb() {
  mockDb = {
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
    query: {
      chatThread: { findFirst: vi.fn() },
      chatParticipant: { findMany: vi.fn() },
      chatMessage: { findFirst: vi.fn() },
    },
  };

  (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockImplementation(() => withCache(Promise.resolve([]))),
      }),
      innerJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockImplementation(() => withCache(Promise.resolve([]))),
        }),
      }),
    }),
  });

  (mockDb.update as ReturnType<typeof vi.fn>).mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue({}),
    }),
  });

  (mockDb.insert as ReturnType<typeof vi.fn>).mockReturnValue({
    values: vi.fn().mockReturnValue({
      onConflictDoNothing: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
      }),
    }),
  });

  (getDbAsync as ReturnType<typeof vi.fn>).mockResolvedValue(mockDb);
}

function setupSelectMock(transactionResult: unknown[], messageResult: unknown[]) {
  const fromMock = vi.fn();
  let callCount = 0;

  fromMock.mockImplementation(() => {
    callCount++;
    const whereMock = vi.fn();

    if (callCount === 1) {
      whereMock.mockReturnValue({
        limit: vi.fn().mockImplementation(() => withCache(Promise.resolve(transactionResult))),
      });
    } else {
      whereMock.mockResolvedValue(messageResult);
    }

    return {
      where: whereMock,
      innerJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockImplementation(() => withCache(Promise.resolve([]))),
        }),
      }),
    };
  });

  (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({
    from: fromMock,
  });
}

beforeEach(() => {
  setupMockDb();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('1 Participant Round', () => {
  it('completes after participant responds', async () => {
    setupSelectMock(
      [],
      [{ id: 'msg-1', participantId: 'p1', role: MessageRoles.ASSISTANT, roundNumber: 0 }],
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

  it('zeros credits after completion', async () => {
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

    (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockImplementation(() => withCache(Promise.resolve([userCreditBalance]))),
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

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        balance: 0,
        reservedCredits: 0,
      }),
    );
  });
});

describe('2 Participants Round', () => {
  it('not complete after 1st participant', async () => {
    setupSelectMock(
      [],
      [{ id: 'msg-1', participantId: 'p1', role: MessageRoles.ASSISTANT, roundNumber: 0 }],
    );

    mockDb.query.chatThread.findFirst.mockResolvedValue({
      id: 'thread-2',
      userId: 'user-2',
    });

    mockDb.query.chatParticipant.findMany.mockResolvedValue([
      { id: 'p1', modelId: 'model-1', isEnabled: true },
      { id: 'p2', modelId: 'model-2', isEnabled: true },
    ]);

    const result = await checkFreeUserHasCompletedRound('user-2');

    expect(result).toBe(false);
  });

  it('complete after both participants and moderator', async () => {
    setupSelectMock(
      [],
      [
        { id: 'msg-1', participantId: 'p1', role: MessageRoles.ASSISTANT, roundNumber: 0 },
        { id: 'msg-2', participantId: 'p2', role: MessageRoles.ASSISTANT, roundNumber: 0 },
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
      threadId: 'thread-2',
      role: MessageRoles.ASSISTANT,
      parts: [{ type: 'text', text: 'Moderator summary' }],
      roundNumber: 0,
    });

    const result = await checkFreeUserHasCompletedRound('user-2');

    expect(result).toBe(true);
  });
});

describe('3 Participants Round', () => {
  it('not complete after 1st participant', async () => {
    setupSelectMock(
      [],
      [{ id: 'msg-1', participantId: 'p1', role: MessageRoles.ASSISTANT, roundNumber: 0 }],
    );

    mockDb.query.chatThread.findFirst.mockResolvedValue({
      id: 'thread-3',
      userId: 'user-3',
    });

    mockDb.query.chatParticipant.findMany.mockResolvedValue([
      { id: 'p1', modelId: 'model-1', isEnabled: true },
      { id: 'p2', modelId: 'model-2', isEnabled: true },
      { id: 'p3', modelId: 'model-3', isEnabled: true },
    ]);

    const result = await checkFreeUserHasCompletedRound('user-3');

    expect(result).toBe(false);
  });

  it('not complete after 2nd participant', async () => {
    setupSelectMock(
      [],
      [
        { id: 'msg-1', participantId: 'p1', role: MessageRoles.ASSISTANT, roundNumber: 0 },
        { id: 'msg-2', participantId: 'p2', role: MessageRoles.ASSISTANT, roundNumber: 0 },
      ],
    );

    mockDb.query.chatThread.findFirst.mockResolvedValue({
      id: 'thread-3',
      userId: 'user-3',
    });

    mockDb.query.chatParticipant.findMany.mockResolvedValue([
      { id: 'p1', modelId: 'model-1', isEnabled: true },
      { id: 'p2', modelId: 'model-2', isEnabled: true },
      { id: 'p3', modelId: 'model-3', isEnabled: true },
    ]);

    const result = await checkFreeUserHasCompletedRound('user-3');

    expect(result).toBe(false);
  });

  it('complete after all participants and moderator', async () => {
    setupSelectMock(
      [],
      [
        { id: 'msg-1', participantId: 'p1', role: MessageRoles.ASSISTANT, roundNumber: 0 },
        { id: 'msg-2', participantId: 'p2', role: MessageRoles.ASSISTANT, roundNumber: 0 },
        { id: 'msg-3', participantId: 'p3', role: MessageRoles.ASSISTANT, roundNumber: 0 },
      ],
    );

    mockDb.query.chatThread.findFirst.mockResolvedValue({
      id: 'thread-3',
      userId: 'user-3',
    });

    mockDb.query.chatParticipant.findMany.mockResolvedValue([
      { id: 'p1', modelId: 'model-1', isEnabled: true },
      { id: 'p2', modelId: 'model-2', isEnabled: true },
      { id: 'p3', modelId: 'model-3', isEnabled: true },
    ]);

    mockDb.query.chatMessage.findFirst.mockResolvedValue({
      id: 'thread-3_r0_moderator',
      threadId: 'thread-3',
      role: MessageRoles.ASSISTANT,
      parts: [{ type: 'text', text: 'Moderator summary' }],
      roundNumber: 0,
    });

    const result = await checkFreeUserHasCompletedRound('user-3');

    expect(result).toBe(true);
  });
});

describe('4 Participants Round', () => {
  it('not complete after 3 of 4 participants', async () => {
    setupSelectMock(
      [],
      [
        { id: 'msg-1', participantId: 'p1', role: MessageRoles.ASSISTANT, roundNumber: 0 },
        { id: 'msg-2', participantId: 'p2', role: MessageRoles.ASSISTANT, roundNumber: 0 },
        { id: 'msg-3', participantId: 'p3', role: MessageRoles.ASSISTANT, roundNumber: 0 },
      ],
    );

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

    const result = await checkFreeUserHasCompletedRound('user-4');

    expect(result).toBe(false);
  });

  it('complete after all 4 participants and moderator', async () => {
    setupSelectMock(
      [],
      [
        { id: 'msg-1', participantId: 'p1', role: MessageRoles.ASSISTANT, roundNumber: 0 },
        { id: 'msg-2', participantId: 'p2', role: MessageRoles.ASSISTANT, roundNumber: 0 },
        { id: 'msg-3', participantId: 'p3', role: MessageRoles.ASSISTANT, roundNumber: 0 },
        { id: 'msg-4', participantId: 'p4', role: MessageRoles.ASSISTANT, roundNumber: 0 },
      ],
    );

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

    mockDb.query.chatMessage.findFirst.mockResolvedValue({
      id: 'thread-4_r0_moderator',
      threadId: 'thread-4',
      role: MessageRoles.ASSISTANT,
      parts: [{ type: 'text', text: 'Moderator summary' }],
      roundNumber: 0,
    });

    const result = await checkFreeUserHasCompletedRound('user-4');

    expect(result).toBe(true);
  });
});

describe('transaction marker', () => {
  it('returns true immediately when transaction exists', async () => {
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
  });
});

describe('disabled participants', () => {
  it('ignores disabled participants', async () => {
    setupSelectMock(
      [],
      [
        { id: 'msg-1', participantId: 'p1', role: MessageRoles.ASSISTANT, roundNumber: 0 },
        { id: 'msg-2', participantId: 'p2', role: MessageRoles.ASSISTANT, roundNumber: 0 },
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
});

describe('edge cases', () => {
  it('handles no thread', async () => {
    setupSelectMock([], []);

    mockDb.query.chatThread.findFirst.mockResolvedValue(undefined);

    const result = await checkFreeUserHasCompletedRound('user-no-thread');

    expect(result).toBe(false);
  });

  it('handles no participants', async () => {
    setupSelectMock([], []);

    mockDb.query.chatThread.findFirst.mockResolvedValue({
      id: 'thread-no-parts',
      userId: 'user-no-parts',
    });

    mockDb.query.chatParticipant.findMany.mockResolvedValue([]);

    const result = await checkFreeUserHasCompletedRound('user-no-parts');

    expect(result).toBe(false);
  });

  it('handles duplicate messages from same participant', async () => {
    setupSelectMock(
      [],
      [
        { id: 'msg-1a', participantId: 'p1', role: MessageRoles.ASSISTANT, roundNumber: 0 },
        { id: 'msg-1b', participantId: 'p1', role: MessageRoles.ASSISTANT, roundNumber: 0 },
        { id: 'msg-2', participantId: 'p2', role: MessageRoles.ASSISTANT, roundNumber: 0 },
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
});
