/**
 * Cache Warming Service
 *
 * Pre-populates KV cache with frequently accessed data to ensure
 * fast retrieval on first requests. Designed to run during:
 * - Application startup
 * - Scheduled jobs (cron)
 * - After deployments
 *
 * @see /src/db/cache/cloudflare-kv-cache.ts - Cache implementation
 * @see /src/db/cache/cache-tags.ts - Cache tag definitions
 */

import { and, eq } from 'drizzle-orm';

import { ThreadStatusSchema } from '@/api/core/enums';
import * as tables from '@/db';
import { getDbAsync } from '@/db';
import {
  MessageCacheTags,
  PublicSlugsListCacheTags,
  PublicThreadCacheTags,
  ThreadCacheTags,
} from '@/db/cache/cache-tags';

// ============================================================================
// CACHE WARMING FUNCTIONS
// ============================================================================

/**
 * Warm cache for public thread slugs list
 * Critical for SSG build performance
 */
export async function warmPublicSlugsCache(): Promise<{ count: number }> {
  const db = await getDbAsync();

  const publicThreads = await db
    .select()
    .from(tables.chatThread)
    .where(and(
      eq(tables.chatThread.isPublic, true),
      eq(tables.chatThread.status, ThreadStatusSchema.enum.active),
    ))
    .limit(1000)
    .$withCache({
      config: { ex: 3600 }, // 1 hour cache
      tag: PublicSlugsListCacheTags.list,
    });

  return { count: publicThreads.length };
}

/**
 * Warm cache for a specific public thread
 * Call this after a thread is made public
 */
export async function warmPublicThreadCache(slug: string): Promise<boolean> {
  const db = await getDbAsync();

  const threads = await db
    .select()
    .from(tables.chatThread)
    .where(eq(tables.chatThread.slug, slug))
    .limit(1)
    .$withCache({
      config: { ex: 3600 }, // 1 hour cache
      tag: PublicThreadCacheTags.single(slug),
    });

  const thread = threads[0];
  if (!thread)
    return false;

  // Warm participants cache
  await db
    .select()
    .from(tables.chatParticipant)
    .where(and(
      eq(tables.chatParticipant.threadId, thread.id),
      eq(tables.chatParticipant.isEnabled, true),
    ))
    .orderBy(tables.chatParticipant.priority, tables.chatParticipant.id)
    .$withCache({
      config: { ex: 3600 }, // 1 hour cache
      tag: ThreadCacheTags.participants(thread.id),
    });

  // Warm messages cache
  await db
    .select()
    .from(tables.chatMessage)
    .where(eq(tables.chatMessage.threadId, thread.id))
    .orderBy(
      tables.chatMessage.roundNumber,
      tables.chatMessage.createdAt,
      tables.chatMessage.id,
    )
    .$withCache({
      config: { ex: 3600 }, // 1 hour cache
      tag: MessageCacheTags.byThread(thread.id),
    });

  return true;
}

/**
 * Warm cache for user's thread list
 * Call this after user login for faster dashboard load
 */
export async function warmUserThreadsCache(userId: string): Promise<{ count: number }> {
  const db = await getDbAsync();

  const threads = await db
    .select()
    .from(tables.chatThread)
    .where(and(
      eq(tables.chatThread.userId, userId),
      eq(tables.chatThread.status, ThreadStatusSchema.enum.active),
    ))
    .orderBy(tables.chatThread.updatedAt)
    .limit(50)
    .$withCache({
      config: { ex: 60 }, // 1 minute cache
      tag: ThreadCacheTags.list(userId),
    });

  return { count: threads.length };
}

/**
 * Warm cache for a specific thread (private)
 * Call this when user opens a thread for first time
 */
export async function warmThreadCache(threadId: string): Promise<boolean> {
  const db = await getDbAsync();

  const threads = await db
    .select()
    .from(tables.chatThread)
    .where(eq(tables.chatThread.id, threadId))
    .limit(1)
    .$withCache({
      config: { ex: 300 }, // 5 minutes cache
      tag: ThreadCacheTags.single(threadId),
    });

  const thread = threads[0];
  if (!thread)
    return false;

  // Warm participants cache
  await db
    .select()
    .from(tables.chatParticipant)
    .where(and(
      eq(tables.chatParticipant.threadId, threadId),
      eq(tables.chatParticipant.isEnabled, true),
    ))
    .orderBy(tables.chatParticipant.priority, tables.chatParticipant.id)
    .$withCache({
      config: { ex: 300 }, // 5 minutes cache
      tag: ThreadCacheTags.participants(threadId),
    });

  // Warm messages cache (shorter TTL since messages change)
  await db
    .select()
    .from(tables.chatMessage)
    .where(eq(tables.chatMessage.threadId, threadId))
    .orderBy(
      tables.chatMessage.roundNumber,
      tables.chatMessage.createdAt,
      tables.chatMessage.id,
    )
    .$withCache({
      config: { ex: 60 }, // 1 minute cache
      tag: MessageCacheTags.byThread(threadId),
    });

  return true;
}

/**
 * Warm all critical caches
 * Run on application startup or after deployment
 */
export async function warmAllCriticalCaches(): Promise<{
  publicSlugs: number;
}> {
  const results = await Promise.allSettled([
    warmPublicSlugsCache(),
  ]);

  return {
    publicSlugs: results[0].status === 'fulfilled' ? results[0].value.count : 0,
  };
}

// ============================================================================
// CACHE WARMING TYPES
// ============================================================================

export type CacheWarmingResult = {
  success: boolean;
  warmedCount: number;
  errors?: string[];
};
