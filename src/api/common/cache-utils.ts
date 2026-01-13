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

import { SUBSCRIPTION_TIERS } from '@/api/core/enums/billing';
import { deleteOgImageFromCache } from '@/api/services/og-cache';
import type { getDbAsync } from '@/db';
import {
  CreditCacheTags,
  MessageCacheTags,
  ModelsCacheTags,
  PublicSlugsListCacheTags,
  PublicThreadCacheTags,
  ThreadCacheTags,
} from '@/db/cache/cache-tags';
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

  if (slug) {
    revalidateTag(THREAD_CACHE_TAGS.allPublicThreads, 'max');
  }

  if (threadId) {
    revalidateTag(THREAD_CACHE_TAGS.threadMessages(threadId), 'max');
  }
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
// MESSAGE CACHE INVALIDATION
// ============================================================================

/**
 * Invalidate message-related caches for a thread
 *
 * Invalidates both KV cache and Next.js cache for messages.
 *
 * @param db - Database instance with cache support
 * @param threadId - Thread ID to invalidate messages for
 */
export async function invalidateMessagesCache(
  db: Awaited<ReturnType<typeof getDbAsync>>,
  threadId: string,
): Promise<void> {
  if (db.$cache?.invalidate) {
    await db.$cache.invalidate({
      tags: MessageCacheTags.all(threadId),
    });
  }
  revalidateTag(THREAD_CACHE_TAGS.threadMessages(threadId), 'max');
}

// ============================================================================
// PUBLIC THREAD CACHE INVALIDATION
// ============================================================================

/**
 * Invalidate public thread caches
 *
 * Use when thread visibility changes or public thread content updates.
 * Also invalidates the public slugs list cache for SSG regeneration.
 * Optionally clears cached OG images from R2.
 *
 * CRITICAL: Must pass threadId to invalidate ALL cached data including:
 * - Messages (MessageCacheTags.byThread)
 * - Participants (ThreadCacheTags.participants)
 * - Owner, changelog, feedback, preSearch (PublicThreadCacheTags)
 *
 * @param db - Database instance with cache support
 * @param slug - Thread slug to invalidate
 * @param threadId - Thread ID to invalidate (required for complete cache invalidation)
 * @param r2Bucket - Optional R2 bucket for OG image cache cleanup
 */
export async function invalidatePublicThreadCache(
  db: Awaited<ReturnType<typeof getDbAsync>>,
  slug: string,
  threadId: string,
  r2Bucket?: R2Bucket,
): Promise<void> {
  if (db.$cache?.invalidate) {
    await db.$cache.invalidate({
      tags: [
        ...PublicThreadCacheTags.all(slug, threadId),
        ...PublicSlugsListCacheTags.all(),
        ...MessageCacheTags.all(threadId),
        ThreadCacheTags.participants(threadId),
      ],
    });
  }
  revalidateTag(THREAD_CACHE_TAGS.publicThread(slug), 'max');
  revalidateTag(THREAD_CACHE_TAGS.allPublicThreads, 'max');
  revalidateTag(THREAD_CACHE_TAGS.threadMessages(threadId), 'max');

  if (r2Bucket) {
    await deleteOgImageFromCache(r2Bucket, 'public-thread', slug).catch(() => {});
  }
}

// ============================================================================
// MODELS CACHE INVALIDATION
// ============================================================================

/**
 * Invalidate models cache for all tiers
 *
 * Use when subscription tier logic changes.
 *
 * @param db - Database instance with cache support
 */
export async function invalidateModelsCache(
  db: Awaited<ReturnType<typeof getDbAsync>>,
): Promise<void> {
  if (db.$cache?.invalidate) {
    const tierTags = SUBSCRIPTION_TIERS.map(tier => ModelsCacheTags.byTier(tier));
    await db.$cache.invalidate({
      tags: [ModelsCacheTags.static, ...tierTags],
    });
  }
}

// ============================================================================
// CREDIT BALANCE CACHE INVALIDATION
// ============================================================================

/**
 * Invalidate credit balance cache for a user
 *
 * CRITICAL: Must be called after any operation that changes:
 * - planType (FREE -> PAID upgrade)
 * - balance (credit grants, refills)
 * - subscription status changes
 *
 * Without this, users may see stale planType after subscription upgrades,
 * causing incorrect enforcement of free user limits (e.g., one thread limit).
 *
 * @param db - Database instance with cache support
 * @param userId - User ID to invalidate credit cache for
 */
export async function invalidateCreditBalanceCache(
  db: Awaited<ReturnType<typeof getDbAsync>>,
  userId: string,
): Promise<void> {
  if (db.$cache?.invalidate) {
    await db.$cache.invalidate({
      tags: CreditCacheTags.all(userId),
    });
  }
}

// ============================================================================
// USER CACHE INVALIDATION
// ============================================================================
