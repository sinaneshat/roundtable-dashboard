/**
 * Cache Invalidation Utilities
 *
 * Centralized cache management for Cloudflare KV (db.$cache) and Next.js (revalidateTag).
 */

import { revalidateTag } from 'next/cache';

import { SUBSCRIPTION_TIERS } from '@/api/core/enums';
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

export async function invalidateThreadCache(
  db: Awaited<ReturnType<typeof getDbAsync>>,
  userId: string,
  threadId?: string,
  slug?: string,
): Promise<void> {
  if (db.$cache?.invalidate) {
    await db.$cache.invalidate({ tags: ThreadCacheTags.all(userId, threadId, slug) });
  }

  if (slug) {
    revalidateTag(THREAD_CACHE_TAGS.allPublicThreads, 'max');
  }

  if (threadId) {
    revalidateTag(THREAD_CACHE_TAGS.threadMessages(threadId), 'max');
  }
}

export function invalidateThreadMessagesCache(threadId: string): void {
  revalidateTag(THREAD_CACHE_TAGS.threadMessages(threadId), 'max');
}

export async function invalidateMessagesCache(
  db: Awaited<ReturnType<typeof getDbAsync>>,
  threadId: string,
): Promise<void> {
  if (db.$cache?.invalidate) {
    await db.$cache.invalidate({ tags: MessageCacheTags.all(threadId) });
  }
  revalidateTag(THREAD_CACHE_TAGS.threadMessages(threadId), 'max');
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
  revalidateTag(THREAD_CACHE_TAGS.publicThread(slug), 'max');
  revalidateTag(THREAD_CACHE_TAGS.allPublicThreads, 'max');
  revalidateTag(THREAD_CACHE_TAGS.threadMessages(threadId), 'max');

  if (r2Bucket) {
    await deleteOgImageFromCache(r2Bucket, 'public-thread', slug).catch(() => {});
  }
}

export async function invalidateModelsCache(
  db: Awaited<ReturnType<typeof getDbAsync>>,
): Promise<void> {
  if (db.$cache?.invalidate) {
    await db.$cache.invalidate({
      tags: [
        ModelsCacheTags.static,
        ...SUBSCRIPTION_TIERS.map(tier => ModelsCacheTags.byTier(tier)),
      ],
    });
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
