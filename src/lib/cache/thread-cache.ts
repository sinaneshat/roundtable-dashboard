/**
 * Thread Cache - Server-side caching with Next.js 16+ use cache
 *
 * Provides cached data fetching for thread data with proper cache tags
 * for on-demand revalidation via revalidateTag().
 *
 * CACHE STRATEGY:
 * - Public threads: 'use cache: remote' for shared caching across serverless instances
 * - Messages: Tagged for on-demand revalidation when new messages are added
 *
 * @see https://nextjs.org/docs/app/api-reference/directives/use-cache
 * @see https://nextjs.org/docs/app/api-reference/directives/use-cache-remote
 */

import { cacheLife, cacheTag } from 'next/cache';

import type { GetPublicThreadResponse } from '@/services/api/chat-threads';
import { getPublicThreadService } from '@/services/api/chat-threads';

// ============================================================================
// Cache Tag Constants
// ============================================================================

/**
 * Cache tag patterns for thread data
 * IMPORTANT: These must match revalidateTag() calls in mutation handlers
 */
export const THREAD_CACHE_TAGS = {
  /** Public thread data by slug */
  publicThread: (slug: string) => `public-thread:${slug}`,
  /** Thread messages by thread ID */
  threadMessages: (threadId: string) => `thread:${threadId}:messages`,
  /** Thread detail by ID */
  threadDetail: (threadId: string) => `thread:${threadId}`,
} as const;

// ============================================================================
// Cached Data Functions
// ============================================================================

/**
 * Get public thread data with remote caching
 *
 * Uses 'use cache: remote' because:
 * - Public threads are shared across ALL users (no user-specific data)
 * - Cloudflare Workers have ephemeral memory (serverless)
 * - High cache hit rates expected for popular public threads
 * - Reduces load on database for frequently accessed threads
 *
 * Cache invalidation: Call revalidateTag(THREAD_CACHE_TAGS.publicThread(slug))
 * when thread is updated or deleted.
 *
 * @param slug - Thread slug
 * @returns Thread data with participants and messages
 */
export async function getCachedPublicThread(
  slug: string,
): Promise<GetPublicThreadResponse> {
  'use cache: remote';
  cacheTag(THREAD_CACHE_TAGS.publicThread(slug));
  cacheLife('hours'); // 1 hour default, revalidated on-demand

  return getPublicThreadService({ param: { slug } });
}

/**
 * Get public thread data for metadata generation
 *
 * Separate cached function for metadata to allow independent caching.
 * Uses same cache tag as main data fetch for consistency.
 *
 * @param slug - Thread slug
 * @returns Thread data for metadata generation
 */
export async function getCachedPublicThreadForMetadata(
  slug: string,
): Promise<GetPublicThreadResponse> {
  'use cache: remote';
  cacheTag(THREAD_CACHE_TAGS.publicThread(slug));
  cacheLife('hours');

  return getPublicThreadService({ param: { slug } });
}
