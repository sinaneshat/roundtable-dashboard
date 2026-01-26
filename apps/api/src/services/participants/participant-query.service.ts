/**
 * Participant Query Service
 *
 * Centralized database queries for chat participants to eliminate
 * duplicate query patterns across handlers.
 */

import { and, eq } from 'drizzle-orm';

import type { getDbAsync } from '@/db';
import * as tables from '@/db';
import type { chatParticipant } from '@/db/tables/chat';

// ============================================================================
// TYPES
// ============================================================================

type DbInstance = Awaited<ReturnType<typeof getDbAsync>>;

// Use Drizzle's inferred type for participant records
export type ParticipantRecord = typeof chatParticipant.$inferSelect;

// ============================================================================
// QUERY FUNCTIONS
// ============================================================================

/**
 * Get all enabled participants for a thread, ordered by priority.
 *
 * @param threadId - The thread ID to query participants for
 * @param db - Database instance
 * @returns Array of enabled participants ordered by priority, then id
 */
export async function getEnabledParticipants(
  threadId: string,
  db: DbInstance,
): Promise<ParticipantRecord[]> {
  return await db.query.chatParticipant.findMany({
    orderBy: [tables.chatParticipant.priority, tables.chatParticipant.id],
    where: and(
      eq(tables.chatParticipant.threadId, threadId),
      eq(tables.chatParticipant.isEnabled, true),
    ),
  });
}

/**
 * Get all participants for a thread (enabled and disabled), ordered by priority.
 *
 * Use this when you need access to all participant info, including disabled ones
 * (e.g., for displaying messages from participants that were later disabled).
 *
 * @param threadId - The thread ID to query participants for
 * @param db - Database instance
 * @returns Array of all participants ordered by priority, then id
 */
export async function getAllParticipants(
  threadId: string,
  db: DbInstance,
): Promise<ParticipantRecord[]> {
  return await db.query.chatParticipant.findMany({
    orderBy: [tables.chatParticipant.priority, tables.chatParticipant.id],
    where: eq(tables.chatParticipant.threadId, threadId),
  });
}

/**
 * Get only the IDs of enabled participants for a thread.
 *
 * Use this for lightweight checks where you only need to know which participants
 * are enabled (e.g., stream resumption checks).
 *
 * @param threadId - The thread ID to query participants for
 * @param db - Database instance
 * @returns Array of participant IDs
 */
export async function getEnabledParticipantIds(
  threadId: string,
  db: DbInstance,
): Promise<string[]> {
  const participants = await db.query.chatParticipant.findMany({
    columns: { id: true },
    where: and(
      eq(tables.chatParticipant.threadId, threadId),
      eq(tables.chatParticipant.isEnabled, true),
    ),
  });
  return participants.map(p => p.id);
}

/**
 * Get enabled participant count for a thread.
 *
 * Use this for tier limit checks where you only need the count.
 *
 * @param threadId - The thread ID to count participants for
 * @param db - Database instance
 * @returns Number of enabled participants
 */
export async function getEnabledParticipantCount(
  threadId: string,
  db: DbInstance,
): Promise<number> {
  const participants = await db.query.chatParticipant.findMany({
    columns: { id: true },
    where: and(
      eq(tables.chatParticipant.threadId, threadId),
      eq(tables.chatParticipant.isEnabled, true),
    ),
  });
  return participants.length;
}
