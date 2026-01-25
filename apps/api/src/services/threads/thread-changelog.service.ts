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
      id: changelogId,
      threadId: params.threadId,
      roundNumber: params.roundNumber,
      changeType: params.changeType,
      changeSummary: params.changeSummary,
      changeData: params.changeData,
      createdAt: now,
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
): Promise<Array<ChatThreadChangelog>> {
  const db = await getDbAsync();

  return db.query.chatThreadChangelog
    .findMany({
      where: eq(tables.chatThreadChangelog.threadId, threadId),
      orderBy: [desc(tables.chatThreadChangelog.createdAt)],
      limit,
    });
}

export async function getThreadChangelogByRound(
  threadId: string,
  roundNumber: number,
): Promise<Array<ChatThreadChangelog>> {
  const db = await getDbAsync();

  return db.query.chatThreadChangelog
    .findMany({
      where: and(
        eq(tables.chatThreadChangelog.threadId, threadId),
        eq(tables.chatThreadChangelog.roundNumber, roundNumber),
      ),
      orderBy: [desc(tables.chatThreadChangelog.createdAt)],
    });
}

export async function logModeChange(
  threadId: string,
  roundNumber: number,
  oldMode: ChatMode,
  newMode: ChatMode,
): Promise<string> {
  return createChangelogEntry({
    threadId,
    roundNumber,
    changeType: ChangelogTypes.MODIFIED,
    changeSummary: `Changed conversation mode from ${oldMode} to ${newMode}`,
    changeData: {
      type: ChangelogChangeTypes.MODE_CHANGE,
      oldMode,
      newMode,
    },
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

  return createChangelogEntry({
    threadId,
    roundNumber,
    changeType: ChangelogTypes.ADDED,
    changeSummary: summary,
    changeData: {
      type: ChangelogChangeTypes.PARTICIPANT,
      participantId,
      modelId,
      role,
    },
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

  return createChangelogEntry({
    threadId,
    roundNumber,
    changeType: ChangelogTypes.REMOVED,
    changeSummary: summary,
    changeData: {
      type: ChangelogChangeTypes.PARTICIPANT,
      participantId,
      modelId,
      role,
    },
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

  return createChangelogEntry({
    threadId,
    roundNumber,
    changeType: ChangelogTypes.MODIFIED,
    changeSummary: summary,
    changeData: {
      type: ChangelogChangeTypes.PARTICIPANT_ROLE,
      participantId,
      modelId,
      oldRole,
      newRole,
    },
  });
}

export async function logParticipantsReordered(
  threadId: string,
  roundNumber: number,
  participants: Array<{
    id: string;
    modelId: string;
    role: string | null;
    priority: number;
  }>,
): Promise<string> {
  const participantNames = participants
    .map(p => p.modelId.split('/').pop() || p.modelId)
    .join(', ');

  return createChangelogEntry({
    threadId,
    roundNumber,
    changeType: ChangelogTypes.MODIFIED,
    changeSummary: `Reordered participants: ${participantNames}`,
    changeData: {
      type: ChangelogChangeTypes.PARTICIPANT_REORDER,
      participants,
    },
  });
}

export async function logWebSearchToggle(
  threadId: string,
  roundNumber: number,
  enabled: boolean,
): Promise<string> {
  return createChangelogEntry({
    threadId,
    roundNumber,
    changeType: ChangelogTypes.MODIFIED,
    changeSummary: enabled ? 'Enabled web search' : 'Disabled web search',
    changeData: {
      type: ChangelogChangeTypes.WEB_SEARCH,
      enabled,
    },
  });
}

export async function logMemoriesCreated(
  threadId: string,
  roundNumber: number,
  projectId: string,
  memories: Array<{ id: string; summary: string }>,
): Promise<string> {
  const memoryCount = memories.length;
  const summary = memoryCount === 1
    ? `Saved 1 memory: ${memories[0]?.summary.slice(0, 50)}...`
    : `Saved ${memoryCount} memories`;

  return createChangelogEntry({
    threadId,
    roundNumber,
    changeType: ChangelogTypes.ADDED,
    changeSummary: summary,
    changeData: {
      type: ChangelogChangeTypes.MEMORY_CREATED,
      memoryCount,
      memories: memories.map(m => ({ id: m.id, summary: m.summary })),
      projectId,
    },
  });
}
