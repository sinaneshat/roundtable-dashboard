/**
 * Thread Changelog Service
 *
 * Tracks configuration changes to chat threads (participants, memories, mode)
 * Following backend patterns from docs/backend-patterns.md
 */

import { desc, eq } from 'drizzle-orm';
import { ulid } from 'ulid';
import { z } from 'zod';

import { getDbAsync } from '@/db';
import * as tables from '@/db/schema';

/**
 * Change types for thread configuration
 */
export type ChangelogType =
  | 'mode_change'
  | 'participant_added'
  | 'participant_removed'
  | 'participant_updated'
  | 'participants_reordered'
  | 'memory_added'
  | 'memory_removed';

/**
 * Zod schema for changelog creation parameters
 */
export const createChangelogParamsSchema = z.object({
  threadId: z.string().min(1),
  changeType: z.enum([
    'mode_change',
    'participant_added',
    'participant_removed',
    'participant_updated',
    'participants_reordered',
    'memory_added',
    'memory_removed',
  ]),
  changeSummary: z.string().min(1).max(500),
  changeData: z.record(z.string(), z.unknown()).optional(),
});

export type CreateChangelogParams = z.infer<typeof createChangelogParamsSchema>;

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
 *   changeType: 'participant_added',
 *   changeSummary: 'Added Claude 3.5 Sonnet as The Ideator',
 *   changeData: {
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

  // Insert changelog entry
  await db.insert(tables.chatThreadChangelog).values({
    id: changelogId,
    threadId: params.threadId,
    changeType: params.changeType,
    changeSummary: params.changeSummary,
    changeData: params.changeData,
    createdAt: now,
  });

  // Update thread.updatedAt to trigger ISR revalidation for public pages
  // This ensures sitemap reflects changelog updates and ISR revalidates public pages
  await db.update(tables.chatThread)
    .set({ updatedAt: now })
    .where(eq(tables.chatThread.id, params.threadId));

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
): Promise<Array<typeof tables.chatThreadChangelog.$inferSelect>> {
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
  oldMode: string,
  newMode: string,
): Promise<string> {
  return createChangelogEntry({
    threadId,
    changeType: 'mode_change',
    changeSummary: `Changed conversation mode from ${oldMode} to ${newMode}`,
    changeData: {
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
    changeType: 'participant_added',
    changeSummary: summary,
    changeData: {
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
    changeType: 'participant_removed',
    changeSummary: summary,
    changeData: {
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
  participantId: string,
  modelId: string,
  oldRole: string | null,
  newRole: string | null,
): Promise<string> {
  const modelName = modelId.split('/').pop() || modelId;
  const summary = `Updated ${modelName} role from ${oldRole || 'none'} to ${newRole || 'none'}`;

  return createChangelogEntry({
    threadId,
    changeType: 'participant_updated',
    changeSummary: summary,
    changeData: {
      participantId,
      modelId,
      oldRole,
      newRole,
    },
  });
}

/**
 * Helper: Create changelog entry for memory addition
 */
export async function logMemoryAdded(
  threadId: string,
  memoryId: string,
  memoryTitle: string,
): Promise<string> {
  return createChangelogEntry({
    threadId,
    changeType: 'memory_added',
    changeSummary: `Attached memory: ${memoryTitle}`,
    changeData: {
      memoryId,
      memoryTitle,
    },
  });
}

/**
 * Helper: Create changelog entry for memory removal
 */
export async function logMemoryRemoved(
  threadId: string,
  memoryId: string,
  memoryTitle: string,
): Promise<string> {
  return createChangelogEntry({
    threadId,
    changeType: 'memory_removed',
    changeSummary: `Removed memory: ${memoryTitle}`,
    changeData: {
      memoryId,
      memoryTitle,
    },
  });
}

/**
 * Helper: Create changelog entry for participants reordering
 */
export async function logParticipantsReordered(
  threadId: string,
  participants: Array<{
    id: string;
    modelId: string;
    role: string | null;
    order: number;
  }>,
): Promise<string> {
  const participantNames = participants
    .map(p => p.modelId.split('/').pop() || p.modelId)
    .join(', ');

  return createChangelogEntry({
    threadId,
    changeType: 'participants_reordered',
    changeSummary: `Reordered participants: ${participantNames}`,
    changeData: {
      participants,
    },
  });
}
