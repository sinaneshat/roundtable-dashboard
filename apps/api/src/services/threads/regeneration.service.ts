import { and, eq } from 'drizzle-orm';

import type { getDbAsync } from '@/db';
import * as tables from '@/db';

import { validateRegenerateRound } from './round.service';

type DbClient = Awaited<ReturnType<typeof getDbAsync>>;

type RegenerateRoundParams = {
  threadId: string;
  regenerateRound: number;
  participantIndex: number;
  db: DbClient;
};

type RegenerateRoundResult = {
  deletedMessagesCount: number;
};

export async function handleRoundRegeneration(
  params: RegenerateRoundParams,
): Promise<RegenerateRoundResult> {
  const { db, participantIndex, regenerateRound, threadId } = params;

  if (participantIndex !== 0) {
    return {
      deletedMessagesCount: 0,
    };
  }

  await validateRegenerateRound(threadId, regenerateRound, db);

  let deletedMessagesCount = 0;

  try {
    const deletedMessages = await db
      .delete(tables.chatMessage)
      .where(
        and(
          eq(tables.chatMessage.threadId, threadId),
          eq(tables.chatMessage.roundNumber, regenerateRound),
        ),
      )
      .returning();

    deletedMessagesCount = deletedMessages.length;

    await db.delete(tables.chatThreadChangelog).where(
      and(
        eq(tables.chatThreadChangelog.threadId, threadId),
        eq(tables.chatThreadChangelog.roundNumber, regenerateRound),
      ),
    );
  } catch (error) {
    if (error instanceof Error && error.name === 'AppError') {
      throw error;
    }
  }

  return {
    deletedMessagesCount,
  };
}

export function resetParticipantIndex(
  participantIndex: number,
  isRegeneration: boolean,
): number {
  if (isRegeneration) {
    return 0;
  }
  return participantIndex;
}
