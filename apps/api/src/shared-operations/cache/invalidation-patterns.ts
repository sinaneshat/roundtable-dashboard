/**
 * Cache Invalidation Patterns
 *
 * Consolidated patterns for common mutation cache invalidations.
 * Wraps lower-level cache-utils for common handler patterns.
 *
 * Frontend equivalent: apps/web/src/lib/data/query-keys.ts (invalidationPatterns)
 */

import {
  invalidateAllUserCaches,
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
  // ============================================================================
  // Billing Operations
  // ============================================================================

  /**
   * Invalidate caches after billing/subscription change
   * Use for checkout, subscription switch, cancellation
   *
   * @example
   * ```ts
   * await CachePatterns.billingMutation(db, userId);
   * ```
   */
  async billingMutation(db: DbInstance, userId: string): Promise<void> {
    // Credit balance and subscription status are tied to billing
    await invalidateCreditBalanceCache(db, userId);
    // User tier/usage changes with subscription
    await invalidateAllUserCaches(db, userId);
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

  // ============================================================================
  // Session Operations
  // ============================================================================

  /**
   * Invalidate ALL user caches after session change
   * Use for logout, impersonation start/stop
   *
   * Frontend equivalent: invalidationPatterns.sessionChange
   *
   * @example
   * ```ts
   * await CachePatterns.sessionChange(db, userId);
   * ```
   */
  async sessionChange(db: DbInstance, userId: string): Promise<void> {
    await invalidateAllUserCaches(db, userId);
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
export async function deferredCacheInvalidation(fn: () => Promise<void>): Promise<void> {
  return await fn().catch((err) => {
    console.error('[Cache] Deferred invalidation failed:', err);
  });
}
