/**
 * Thread Cache - Server-side caching for metadata generation
 *
 * Uses unstable_cache for generateMetadata() which doesn't need React Query hydration.
 * Page data fetching uses direct services with prefetchQuery for proper hydration.
 *
 * @see https://nextjs.org/docs/app/api-reference/functions/unstable_cache
 */

import { unstable_cache } from 'next/cache';

import type { GetPublicThreadResponse } from '@/services/api';
import { getPublicThreadService } from '@/services/api';

// ============================================================================
// Cache Tag Constants
// ============================================================================

/**
 * Cache tag patterns for thread data
 * Used by revalidateTag() in mutation handlers for ISR invalidation
 */
export const THREAD_CACHE_TAGS = {
  /** Public thread data by slug */
  publicThread: (slug: string) => `public-thread:${slug}`,
  /** Thread messages by thread ID */
  threadMessages: (threadId: string) => `thread:${threadId}:messages`,
  /** All public threads (for bulk invalidation) */
  allPublicThreads: 'public-threads',
} as const;

// ============================================================================
// Cached Data Functions (Metadata Only)
// ============================================================================

/**
 * Get public thread data for generateMetadata()
 * Uses unstable_cache since metadata generation doesn't need React Query hydration.
 * Page content uses prefetchQuery with getPublicThreadService directly.
 */
export async function getCachedPublicThreadForMetadata(slug: string): Promise<GetPublicThreadResponse> {
  const cachedFn = unstable_cache(
    async (): Promise<GetPublicThreadResponse> => {
      return getPublicThreadService({ param: { slug } });
    },
    ['public-thread-metadata', slug],
    {
      revalidate: 86400, // 1 day
      tags: [THREAD_CACHE_TAGS.publicThread(slug), THREAD_CACHE_TAGS.allPublicThreads],
    },
  );
  return cachedFn();
}
