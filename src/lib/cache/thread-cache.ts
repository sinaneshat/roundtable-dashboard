/**
 * Thread Cache - Server-side data fetching for thread data
 *
 * NOTE: cacheComponents is currently disabled, so these are regular async functions.
 * TODO: Re-enable 'use cache: remote' when PPR is properly configured.
 *
 * @see https://nextjs.org/docs/app/api-reference/directives/use-cache
 */

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
// Data Functions
// ============================================================================

/**
 * Get public thread data
 *
 * @param slug - Thread slug
 * @returns Thread data with participants and messages
 */
export async function getCachedPublicThread(
  slug: string,
): Promise<GetPublicThreadResponse> {
  return getPublicThreadService({ param: { slug } });
}

/**
 * Get public thread data for metadata generation
 *
 * @param slug - Thread slug
 * @returns Thread data for metadata generation
 */
export async function getCachedPublicThreadForMetadata(
  slug: string,
): Promise<GetPublicThreadResponse> {
  return getPublicThreadService({ param: { slug } });
}
