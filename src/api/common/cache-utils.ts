/**
 * Cache Invalidation Utilities - Centralized Cache Management
 *
 * Single source of truth for cache invalidation patterns across handlers.
 * Eliminates duplication of cache invalidation code in individual route handlers.
 *
 * ✅ BENEFITS:
 * - Single source of truth for cache invalidation
 * - Type-safe with async/await patterns
 * - Consistent cache tag usage from cache-tags.ts
 * - Reduces ~24 lines of duplicate cache invalidation code
 * - Centralized null-safety checks
 *
 * ❌ DO NOT:
 * - Duplicate cache invalidation patterns in handlers
 * - Use raw cache invalidation calls in handlers
 * - Create handler-specific cache utilities
 *
 * @see /src/db/cache/cache-tags.ts - Cache tag definitions
 * @see /src/api/routes/chat/handlers/thread.handler.ts - Original invalidation patterns (lines 245, 261, 484, 521)
 */

import type { getDbAsync } from '@/db';
import { ThreadCacheTags, UserCacheTags } from '@/db/cache/cache-tags';

// ============================================================================
// THREAD CACHE INVALIDATION
// ============================================================================

/**
 * Invalidate all cache entries related to a thread
 *
 * Invalidates:
 * - Thread list cache for the user
 * - Individual thread cache
 * - Thread participants cache
 * - Thread slug cache (if provided)
 *
 * @param db - Database instance with cache support
 * @param userId - User ID who owns the thread
 * @param threadId - Thread ID to invalidate
 * @param slug - Optional thread slug to invalidate
 *
 * @example
 * ```ts
 * // After creating a thread
 * await invalidateThreadCache(db, user.id, threadId);
 *
 * // After updating a thread with status change
 * await invalidateThreadCache(db, user.id, threadId, thread.slug);
 *
 * // After deleting a thread
 * await invalidateThreadCache(db, user.id, threadId, thread.slug);
 * ```
 */
export async function invalidateThreadCache(
  db: Awaited<ReturnType<typeof getDbAsync>>,
  userId: string,
  threadId?: string,
  slug?: string,
): Promise<void> {
  if (!db.$cache?.invalidate) {
    return;
  }

  const tags = ThreadCacheTags.all(userId, threadId, slug);
  await db.$cache.invalidate({ tags });
}

// ============================================================================
// USER CACHE INVALIDATION
// ============================================================================

/**
 * Invalidate all cache entries related to a user
 *
 * Invalidates:
 * - User tier cache
 * - User usage statistics cache
 * - User record cache
 *
 * @param db - Database instance with cache support
 * @param userId - User ID to invalidate
 *
 * @example
 * ```ts
 * // After updating user subscription
 * await invalidateUserCache(db, userId);
 *
 * // After incrementing usage counters
 * await invalidateUserCache(db, userId);
 * ```
 */
export async function invalidateUserCache(
  db: Awaited<ReturnType<typeof getDbAsync>>,
  userId: string,
): Promise<void> {
  if (!db.$cache?.invalidate) {
    return;
  }

  const tags = UserCacheTags.all(userId);
  await db.$cache.invalidate({ tags });
}

// ============================================================================
// COMBINED CACHE INVALIDATION
// ============================================================================

/**
 * Invalidate both thread and user caches in a single call
 *
 * Use this for operations that affect both thread data and user usage statistics
 * (e.g., creating threads, creating messages, deleting threads).
 *
 * @param db - Database instance with cache support
 * @param userId - User ID to invalidate
 * @param threadId - Thread ID to invalidate
 * @param slug - Optional thread slug to invalidate
 *
 * @example
 * ```ts
 * // After creating a thread (affects both thread list and user usage)
 * await invalidateThreadAndUserCache(db, user.id, threadId);
 *
 * // After deleting a thread
 * await invalidateThreadAndUserCache(db, user.id, threadId, thread.slug);
 * ```
 */
export async function invalidateThreadAndUserCache(
  db: Awaited<ReturnType<typeof getDbAsync>>,
  userId: string,
  threadId?: string,
  slug?: string,
): Promise<void> {
  if (!db.$cache?.invalidate) {
    return;
  }

  const threadTags = ThreadCacheTags.all(userId, threadId, slug);
  const userTags = UserCacheTags.all(userId);
  const tags = [...threadTags, ...userTags];

  await db.$cache.invalidate({ tags });
}
