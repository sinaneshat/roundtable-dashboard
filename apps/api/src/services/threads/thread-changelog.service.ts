import type { ChatMode } from '@roundtable/shared/enums';
import { ChangelogChangeTypes, ChangelogTypes } from '@roundtable/shared/enums';
import { and, desc, eq } from 'drizzle-orm';
import { ulid } from 'ulid';

import { executeBatch } from '@/common/batch-operations';
import { getDbAsync } from '@/db';
import * as tables from '@/db';
import type { ChatThreadChangelog } from '@/db/validation';
import type { CreateChangelogParams } from '@/routes/chat/schema';

export async function createChangelogEntry(params: CreateChangelogParams): Promise<string> {
  const db = await getDbAsync();
  const changelogId = ulid();
  const now = new Date();

  await executeBatch(db, [
    db.insert(tables.chatThreadChangelog).values({
      changeData: params.changeData,
      changeSummary: params.changeSummary,
      changeType: params.changeType,
      createdAt: now,
      id: changelogId,
      roundNumber: params.roundNumber,
      threadId: params.threadId,
    }),
    db.update(tables.chatThread)
      .set({ updatedAt: now })
      .where(eq(tables.chatThread.id, params.threadId)),
  ]);

  return changelogId;
}

export async function getThreadChangelog(
  threadId: string,
  limit?: number,
): Promise<ChatThreadChangelog[]> {
  const db = await getDbAsync();

  return await db.query.chatThreadChangelog
    .findMany({
      limit,
      orderBy: [desc(tables.chatThreadChangelog.createdAt)],
      where: eq(tables.chatThreadChangelog.threadId, threadId),
    });
}

export async function getThreadChangelogByRound(
  threadId: string,
  roundNumber: number,
): Promise<ChatThreadChangelog[]> {
  const db = await getDbAsync();

  return await db.query.chatThreadChangelog
    .findMany({
      orderBy: [desc(tables.chatThreadChangelog.createdAt)],
      where: and(
        eq(tables.chatThreadChangelog.threadId, threadId),
        eq(tables.chatThreadChangelog.roundNumber, roundNumber),
      ),
    });
}

export async function logModeChange(
  threadId: string,
  roundNumber: number,
  oldMode: ChatMode,
  newMode: ChatMode,
): Promise<string> {
  return await createChangelogEntry({
    changeData: {
      newMode,
      oldMode,
      type: ChangelogChangeTypes.MODE_CHANGE,
    },
    changeSummary: `Changed conversation mode from ${oldMode} to ${newMode}`,
    changeType: ChangelogTypes.MODIFIED,
    roundNumber,
    threadId,
  });
}

export async function logParticipantAdded(
  threadId: string,
  roundNumber: number,
  participantId: string,
  modelId: string,
  role: string | null,
): Promise<string> {
  const modelName = modelId.split('/').pop() || modelId;
  const summary = role ? `Added ${modelName} as ${role}` : `Added ${modelName}`;

  return await createChangelogEntry({
    changeData: {
      modelId,
      participantId,
      role,
      type: ChangelogChangeTypes.PARTICIPANT,
    },
    changeSummary: summary,
    changeType: ChangelogTypes.ADDED,
    roundNumber,
    threadId,
  });
}

export async function logParticipantRemoved(
  threadId: string,
  roundNumber: number,
  participantId: string,
  modelId: string,
  role: string | null,
): Promise<string> {
  const modelName = modelId.split('/').pop() || modelId;
  const summary = role ? `Removed ${modelName} (${role})` : `Removed ${modelName}`;

  return await createChangelogEntry({
    changeData: {
      modelId,
      participantId,
      role,
      type: ChangelogChangeTypes.PARTICIPANT,
    },
    changeSummary: summary,
    changeType: ChangelogTypes.REMOVED,
    roundNumber,
    threadId,
  });
}

export async function logParticipantUpdated(
  threadId: string,
  roundNumber: number,
  participantId: string,
  modelId: string,
  oldRole: string | null,
  newRole: string | null,
): Promise<string> {
  const modelName = modelId.split('/').pop() || modelId;
  const summary = `Updated ${modelName} role from ${oldRole || 'none'} to ${newRole || 'none'}`;

  return await createChangelogEntry({
    changeData: {
      modelId,
      newRole,
      oldRole,
      participantId,
      type: ChangelogChangeTypes.PARTICIPANT_ROLE,
    },
    changeSummary: summary,
    changeType: ChangelogTypes.MODIFIED,
    roundNumber,
    threadId,
  });
}

export async function logParticipantsReordered(
  threadId: string,
  roundNumber: number,
  participants: {
    id: string;
    modelId: string;
    role: string | null;
    priority: number;
  }[],
): Promise<string> {
  const participantNames = participants
    .map(p => p.modelId.split('/').pop() || p.modelId)
    .join(', ');

  return await createChangelogEntry({
    changeData: {
      participants,
      type: ChangelogChangeTypes.PARTICIPANT_REORDER,
    },
    changeSummary: `Reordered participants: ${participantNames}`,
    changeType: ChangelogTypes.MODIFIED,
    roundNumber,
    threadId,
  });
}

export async function logWebSearchToggle(
  threadId: string,
  roundNumber: number,
  enabled: boolean,
): Promise<string> {
  return await createChangelogEntry({
    changeData: {
      enabled,
      type: ChangelogChangeTypes.WEB_SEARCH,
    },
    changeSummary: enabled ? 'Enabled web search' : 'Disabled web search',
    changeType: ChangelogTypes.MODIFIED,
    roundNumber,
    threadId,
  });
}
