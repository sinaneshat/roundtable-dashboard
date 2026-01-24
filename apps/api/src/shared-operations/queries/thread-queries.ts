/**
 * Thread Queries
 *
 * Reusable DB operations for chat threads.
 * Provides typed, consistent access patterns.
 */

import { and, desc, eq, ne } from 'drizzle-orm';

import type { getDbAsync } from '@/db';
import * as tables from '@/db';

type DbInstance = Awaited<ReturnType<typeof getDbAsync>>;

// ============================================================================
// Thread Lookup Operations
// ============================================================================

/**
 * Get thread by ID with optional column selection
 */
export async function getThreadById<T extends keyof typeof tables.chatThread.$inferSelect>(
  threadId: string,
  db: DbInstance,
  columns?: T[],
) {
  if (columns && columns.length > 0) {
    const columnSelect = Object.fromEntries(columns.map(c => [c, true]));
    return db.query.chatThread.findFirst({
      where: eq(tables.chatThread.id, threadId),
      columns: columnSelect,
    });
  }

  return db.query.chatThread.findFirst({
    where: eq(tables.chatThread.id, threadId),
  });
}

/**
 * Get threads by project (excluding a specific thread)
 */
export async function getThreadsByProject(
  projectId: string,
  db: DbInstance,
  options?: { excludeId?: string; limit?: number },
) {
  const whereClause = options?.excludeId
    ? and(
        eq(tables.chatThread.projectId, projectId),
        ne(tables.chatThread.id, options.excludeId),
      )
    : eq(tables.chatThread.projectId, projectId);

  return db.query.chatThread.findMany({
    where: whereClause,
    orderBy: [desc(tables.chatThread.lastMessageAt)],
    limit: options?.limit ?? 10,
    columns: {
      id: true,
      title: true,
    },
  });
}

/**
 * Get thread with participant count
 */
export async function getThreadWithParticipantCount(
  threadId: string,
  db: DbInstance,
) {
  const thread = await db.query.chatThread.findFirst({
    where: eq(tables.chatThread.id, threadId),
    with: {
      participants: {
        where: eq(tables.chatParticipant.isEnabled, true),
        columns: { id: true },
      },
    },
  });

  if (!thread)
    return null;

  return {
    ...thread,
    participantCount: thread.participants.length,
  };
}

/**
 * Get threads by user ID
 */
export async function getThreadsByUser(
  userId: string,
  db: DbInstance,
  options?: { limit?: number },
) {
  return db.query.chatThread.findMany({
    where: eq(tables.chatThread.userId, userId),
    orderBy: [desc(tables.chatThread.lastMessageAt)],
    limit: options?.limit ?? 10,
    columns: {
      id: true,
      title: true,
      lastMessageAt: true,
    },
  });
}
