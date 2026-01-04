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
 * CACHE SYSTEMS:
 * 1. Cloudflare KV Cache (db.$cache) - Database-level caching via Drizzle
 * 2. Next.js 'use cache' (revalidateTag) - Server-side rendering cache
 *
 * @see /src/db/cache/cache-tags.ts - Cloudflare KV cache tag definitions
 * @see /src/lib/cache/thread-cache.ts - Next.js 'use cache' tag definitions
 * @see /src/api/routes/chat/handlers/thread.handler.ts - Original invalidation patterns
 */

import { revalidateTag } from 'next/cache';

import type { getDbAsync } from '@/db';
import { ThreadCacheTags } from '@/db/cache/cache-tags';
import { THREAD_CACHE_TAGS } from '@/lib/cache/thread-cache';

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
  // Invalidate Cloudflare KV cache
  if (db.$cache?.invalidate) {
    const tags = ThreadCacheTags.all(userId, threadId, slug);
    await db.$cache.invalidate({ tags });
  }

  // Invalidate Next.js unstable_cache for public thread (if slug provided)
  // Uses the bulk tag since unstable_cache doesn't support dynamic per-slug tags
  // This invalidates ALL public thread caches - necessary for ISR pattern
  if (slug) {
    revalidateTag(THREAD_CACHE_TAGS.allPublicThreads, 'max');
  }

  // Invalidate thread messages cache (if threadId provided)
  if (threadId) {
    revalidateTag(THREAD_CACHE_TAGS.threadMessages(threadId), 'max');
  }
}

/**
 * Invalidate public thread cache only (Next.js unstable_cache)
 *
 * Use this when you only need to invalidate the public thread SSR cache
 * without affecting Cloudflare KV cache.
 *
 * Note: Uses bulk tag - invalidates ALL public thread caches
 * since unstable_cache doesn't support per-slug dynamic tags.
 *
 * @param _slug - Thread slug (unused, kept for API compatibility)
 *
 * @example
 * ```ts
 * // When thread visibility changes
 * invalidatePublicThreadCache(thread.slug);
 * ```
 */
export function invalidatePublicThreadCache(_slug: string): void {
  revalidateTag(THREAD_CACHE_TAGS.allPublicThreads, 'max');
}

/**
 * Invalidate thread messages cache only (Next.js 'use cache')
 *
 * Use this when new messages are added to a thread.
 *
 * @param threadId - Thread ID to invalidate messages for
 *
 * @example
 * ```ts
 * // After saving new messages
 * invalidateThreadMessagesCache(threadId);
 * ```
 */
export function invalidateThreadMessagesCache(threadId: string): void {
  revalidateTag(THREAD_CACHE_TAGS.threadMessages(threadId), 'max');
}

// ============================================================================
// USER CACHE INVALIDATION
// ============================================================================
