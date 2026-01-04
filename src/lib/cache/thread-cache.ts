/**
 * Thread Cache - Server-side data fetching with caching
 *
 * Uses unstable_cache for server-side caching since cacheComponents is disabled.
 * Cache duration: 1 day for public threads (ISR pattern - revalidate on visibility change)
 *
 * @see https://nextjs.org/docs/app/api-reference/functions/unstable_cache
 */

import { unstable_cache } from 'next/cache';

import type { GetPublicThreadResponse } from '@/services/api/chat-threads';
import { getPublicThreadService } from '@/services/api/chat-threads';

// ============================================================================
// Cache Duration Constants
// ============================================================================

/**
 * Cache durations in seconds
 * ISR pattern: Long cache with on-demand revalidation via tags
 */
export const THREAD_CACHE_DURATIONS = {
  /** Public threads: 1 day (revalidated on visibility change via revalidateTag) */
  publicThread: 86400,
  /** Thread metadata: 1 day (same as public thread for consistency) */
  publicThreadMetadata: 86400,
} as const;

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
  /** All public threads (for bulk invalidation) */
  allPublicThreads: 'public-threads',
} as const;

// ============================================================================
// Cached Data Functions
// ============================================================================

/**
 * Get public thread data with server-side caching
 * ISR pattern: 1 day cache with tag-based invalidation on visibility change
 */
export const getCachedPublicThread = unstable_cache(
  async (slug: string): Promise<GetPublicThreadResponse> => {
    return getPublicThreadService({ param: { slug } });
  },
  ['public-thread'],
  {
    revalidate: THREAD_CACHE_DURATIONS.publicThread,
    tags: [THREAD_CACHE_TAGS.allPublicThreads],
  },
);

/**
 * Get public thread data for metadata generation
 * Shares cache duration with getCachedPublicThread for consistency
 */
export const getCachedPublicThreadForMetadata = unstable_cache(
  async (slug: string): Promise<GetPublicThreadResponse> => {
    return getPublicThreadService({ param: { slug } });
  },
  ['public-thread-metadata'],
  {
    revalidate: THREAD_CACHE_DURATIONS.publicThreadMetadata,
    tags: [THREAD_CACHE_TAGS.allPublicThreads],
  },
);
