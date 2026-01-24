/**
 * Cache Invalidation Utilities
 *
 * Centralized cache management for Cloudflare KV (db.$cache).
 * TanStack Start handles client-side caching via TanStack Query.
 */

import type { getDbAsync } from '@/db';
import {
  CreditCacheTags,
  MessageCacheTags,
  ProjectCacheTags,
  PublicSlugsListCacheTags,
  PublicThreadCacheTags,
  ThreadCacheTags,
} from '@/db/cache/cache-tags';
import { deleteOgImageFromCache } from '@/services/og-cache';

// ============================================================================
// Hash Utilities
// ============================================================================

/**
 * Simple hash function for cache key generation
 * Produces deterministic, short hash strings for KV key deduplication
 */
export function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

// ============================================================================
// Cache Tag Management
// ============================================================================

export async function invalidateThreadCache(
  db: Awaited<ReturnType<typeof getDbAsync>>,
  userId: string,
  threadId?: string,
  slug?: string,
): Promise<void> {
  if (db.$cache?.invalidate) {
    await db.$cache.invalidate({ tags: ThreadCacheTags.all(userId, threadId, slug) });
  }
}

export async function invalidateMessagesCache(
  db: Awaited<ReturnType<typeof getDbAsync>>,
  threadId: string,
): Promise<void> {
  if (db.$cache?.invalidate) {
    await db.$cache.invalidate({ tags: MessageCacheTags.all(threadId) });
  }
}

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

  if (r2Bucket) {
    await deleteOgImageFromCache(r2Bucket, 'public-thread', slug).catch(() => {});
  }
}

export async function invalidateCreditBalanceCache(
  db: Awaited<ReturnType<typeof getDbAsync>>,
  userId: string,
): Promise<void> {
  if (db.$cache?.invalidate) {
    await db.$cache.invalidate({ tags: CreditCacheTags.all(userId) });
  }
}

export async function invalidateSidebarCache(
  db: Awaited<ReturnType<typeof getDbAsync>>,
  userId: string,
): Promise<void> {
  if (db.$cache?.invalidate) {
    await db.$cache.invalidate({ tags: [ThreadCacheTags.sidebar(userId)] });
  }
}

export async function invalidateProjectCache(
  db: Awaited<ReturnType<typeof getDbAsync>>,
  projectId: string,
): Promise<void> {
  if (db.$cache?.invalidate) {
    await db.$cache.invalidate({ tags: ProjectCacheTags.all(projectId) });
  }
}

/**
 * Invalidate ALL user-specific caches for impersonation or session switch
 * Clears: threads, credits, subscriptions, sidebar, user tier/usage
 */
export async function invalidateAllUserCaches(
  db: Awaited<ReturnType<typeof getDbAsync>>,
  userId: string,
): Promise<void> {
  if (!db.$cache?.invalidate)
    return;

  const { UserCacheTags, SubscriptionCacheTags, CustomerCacheTags } = await import('@/db/cache/cache-tags');

  const tags = [
    // Thread-related caches
    ...ThreadCacheTags.all(userId),
    // Credit balance and subscription status
    ...CreditCacheTags.all(userId),
    // User tier and usage
    ...UserCacheTags.all(userId),
    // Subscription data
    ...SubscriptionCacheTags.all(userId),
    // Customer data
    ...CustomerCacheTags.all(userId),
  ];

  await db.$cache.invalidate({ tags });
}
