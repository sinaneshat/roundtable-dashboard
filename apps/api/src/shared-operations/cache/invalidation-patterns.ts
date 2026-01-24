/**
 * Cache Invalidation Patterns
 *
 * Consolidated patterns for common mutation cache invalidations.
 * Wraps lower-level cache-utils for common handler patterns.
 */

import {
  invalidateCreditBalanceCache,
  invalidateMessagesCache,
  invalidatePublicThreadCache,
  invalidateSidebarCache,
  invalidateThreadCache,
} from '@/common/cache-utils';
import type { getDbAsync } from '@/db';

type DbInstance = Awaited<ReturnType<typeof getDbAsync>>;

/**
 * Cache invalidation patterns for common mutations
 */
export const CachePatterns = {
  /**
   * Invalidate caches after project mutation (create/update/delete)
   *
   * @example
   * ```ts
   * await CachePatterns.projectMutation(db, userId);
   * ```
   */
  async projectMutation(db: DbInstance, userId: string): Promise<void> {
    await invalidateSidebarCache(db, userId);
  },

  /**
   * Invalidate caches after thread mutation (create/update/delete)
   *
   * @example
   * ```ts
   * await CachePatterns.threadMutation(db, userId, threadId, slug);
   * ```
   */
  async threadMutation(
    db: DbInstance,
    userId: string,
    threadId?: string,
    slug?: string,
  ): Promise<void> {
    await Promise.all([
      invalidateThreadCache(db, userId, threadId, slug),
      invalidateSidebarCache(db, userId),
    ]);
  },

  /**
   * Invalidate caches after public thread state change (publish/unpublish)
   *
   * @example
   * ```ts
   * await CachePatterns.publicThreadMutation(db, slug, threadId, r2Bucket, previousSlug);
   * ```
   */
  async publicThreadMutation(
    db: DbInstance,
    slug: string,
    threadId: string,
    r2Bucket?: R2Bucket,
    previousSlug?: string,
  ): Promise<void> {
    const tasks = [invalidatePublicThreadCache(db, slug, threadId, r2Bucket)];
    if (previousSlug) {
      tasks.push(invalidatePublicThreadCache(db, previousSlug, threadId, r2Bucket));
    }
    await Promise.all(tasks);
  },

  /**
   * Invalidate caches after message mutation (send/edit/delete)
   *
   * @example
   * ```ts
   * await CachePatterns.messageMutation(db, threadId);
   * ```
   */
  async messageMutation(db: DbInstance, threadId: string): Promise<void> {
    await invalidateMessagesCache(db, threadId);
  },

  /**
   * Invalidate caches after credit balance change (purchase/usage)
   *
   * @example
   * ```ts
   * await CachePatterns.creditMutation(db, userId);
   * ```
   */
  async creditMutation(db: DbInstance, userId: string): Promise<void> {
    await invalidateCreditBalanceCache(db, userId);
  },
};

/**
 * Non-blocking cache invalidation for use with waitUntil
 *
 * @example
 * ```ts
 * if (c.executionCtx) {
 *   c.executionCtx.waitUntil(
 *     deferredCacheInvalidation(() => CachePatterns.threadMutation(db, userId, threadId))
 *   );
 * }
 * ```
 */
export function deferredCacheInvalidation(fn: () => Promise<void>): Promise<void> {
  return fn().catch((err) => {
    console.error('[Cache] Deferred invalidation failed:', err);
  });
}
