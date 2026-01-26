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
    return await db.query.chatThread.findFirst({
      columns: columnSelect,
      where: eq(tables.chatThread.id, threadId),
    });
  }

  return await db.query.chatThread.findFirst({
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

  return await db.query.chatThread.findMany({
    columns: {
      id: true,
      title: true,
    },
    limit: options?.limit ?? 10,
    orderBy: [desc(tables.chatThread.lastMessageAt)],
    where: whereClause,
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
        columns: { id: true },
        where: eq(tables.chatParticipant.isEnabled, true),
      },
    },
  });

  if (!thread) {
    return null;
  }

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
  return await db.query.chatThread.findMany({
    columns: {
      id: true,
      lastMessageAt: true,
      title: true,
    },
    limit: options?.limit ?? 10,
    orderBy: [desc(tables.chatThread.lastMessageAt)],
    where: eq(tables.chatThread.userId, userId),
  });
}
