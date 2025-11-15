/**
 * Thread Changelog Service - Tracks configuration changes to chat threads.
 */

import { desc, eq } from 'drizzle-orm';
import { ulid } from 'ulid';

import { executeBatch } from '@/api/common/batch-operations';
import type { ChatMode } from '@/api/core/enums';
import { ChangelogTypes } from '@/api/core/enums';
import type { CreateChangelogParams } from '@/api/routes/chat/schema';
import { getDbAsync } from '@/db';
import * as tables from '@/db/schema';
import type { ChatThreadChangelog } from '@/db/validation';

/**
 * Create a changelog entry for thread configuration change
 *
 * @param params - Changelog creation parameters (validated via Zod schema)
 * @returns Created changelog entry ID
 *
 * @example
 * ```typescript
 * const changelogId = await createChangelogEntry({
 *   threadId: 'thread_123',
 *   changeType: 'added',
 *   changeSummary: 'Added Claude 3.5 Sonnet as The Ideator',
 *   changeData: {
 *     type: 'participant',
 *     participantId: 'participant_456',
 *     modelId: 'anthropic/claude-3.5-sonnet',
 *     role: 'The Ideator',
 *   },
 * });
 * ```
 */
export async function createChangelogEntry(params: CreateChangelogParams): Promise<string> {
  const db = await getDbAsync();
  const changelogId = ulid();
  const now = new Date();

  // ✅ ATOMIC BATCH: Insert changelog + update thread timestamp
  // Using reusable batch helper from @/api/common/batch-operations
  // changeData is properly typed as DbChangelogData from single source of truth
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
    // Update thread.updatedAt to trigger ISR revalidation for public pages
    db.update(tables.chatThread)
      .set({ updatedAt: now })
      .where(eq(tables.chatThread.id, params.threadId)),
  ]);

  return changelogId;
}

/**
 * Get changelog entries for a thread
 *
 * Returns all configuration changes ordered by creation time (newest first).
 *
 * @param threadId - Thread ID
 * @param limit - Optional limit on number of entries to return
 * @returns List of changelog entries
 */
export async function getThreadChangelog(
  threadId: string,
  limit?: number,
): Promise<Array<ChatThreadChangelog>> {
  const db = await getDbAsync();

  const changelog = await db.query.chatThreadChangelog.findMany({
    where: eq(tables.chatThreadChangelog.threadId, threadId),
    orderBy: [desc(tables.chatThreadChangelog.createdAt)],
    limit,
  });

  return changelog;
}

/**
 * Helper: Create changelog entry for mode change
 */
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
      type: 'mode_change',
      oldMode,
      newMode,
    },
  });
}

/**
 * Helper: Create changelog entry for participant addition
 */
export async function logParticipantAdded(
  threadId: string,
  roundNumber: number,
  participantId: string,
  modelId: string,
  role: string | null,
): Promise<string> {
  const modelName = modelId.split('/').pop() || modelId;
  const summary = role
    ? `Added ${modelName} as ${role}`
    : `Added ${modelName}`;

  return createChangelogEntry({
    threadId,
    roundNumber,
    changeType: ChangelogTypes.ADDED,
    changeSummary: summary,
    changeData: {
      type: 'participant',
      participantId,
      modelId,
      role,
    },
  });
}

/**
 * Helper: Create changelog entry for participant removal
 */
export async function logParticipantRemoved(
  threadId: string,
  roundNumber: number,
  participantId: string,
  modelId: string,
  role: string | null,
): Promise<string> {
  const modelName = modelId.split('/').pop() || modelId;
  const summary = role
    ? `Removed ${modelName} (${role})`
    : `Removed ${modelName}`;

  return createChangelogEntry({
    threadId,
    roundNumber,
    changeType: ChangelogTypes.REMOVED,
    changeSummary: summary,
    changeData: {
      type: 'participant',
      participantId,
      modelId,
      role,
    },
  });
}

/**
 * Helper: Create changelog entry for participant update
 */
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
      type: 'participant_role',
      participantId,
      oldRole,
      newRole,
    },
  });
}

/**
 * Helper: Create changelog entry for participants reordering
 */
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
      type: 'participant_reorder',
      participants,
    },
  });
}

/**
 * Helper: Create changelog entry for web search toggle
 */
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
      type: 'web_search',
      enabled,
    },
  });
}
