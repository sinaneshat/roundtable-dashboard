/**
 * Thread Cache - Server-side caching for metadata generation
 *
 * Uses simple in-memory caching with TTL for server functions.
 * TanStack Start handles most caching via route loaders.
 */

import type { GetPublicThreadResponse } from '@/services/api';
import { getPublicThreadService } from '@/services/api';

// ============================================================================
// Cache Tag Constants
// ============================================================================

/**
 * Cache tag patterns for thread data
 * Used for cache invalidation
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
// Simple In-Memory Cache
// ============================================================================

type CacheEntry<T> = {
  data: T;
  timestamp: number;
  ttl: number;
};

const cache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string): T | null {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (!entry)
    return null;

  const isExpired = Date.now() - entry.timestamp > entry.ttl;
  if (isExpired) {
    cache.delete(key);
    return null;
  }

  return entry.data;
}

function setCache<T>(key: string, data: T, ttl: number): void {
  cache.set(key, { data, timestamp: Date.now(), ttl });
}

// ============================================================================
// Cached Data Functions (Metadata Only)
// ============================================================================

const ONE_DAY_MS = 86400 * 1000;

/**
 * Get public thread data for metadata generation
 * Uses simple in-memory cache with 24h TTL.
 */
export async function getCachedPublicThreadForMetadata(slug: string): Promise<GetPublicThreadResponse> {
  const cacheKey = `public-thread-metadata:${slug}`;

  const cached = getCached<GetPublicThreadResponse>(cacheKey);
  if (cached)
    return cached;

  const result = await getPublicThreadService({ param: { slug } });
  setCache(cacheKey, result, ONE_DAY_MS);

  return result;
}

/**
 * Invalidate thread cache by slug
 */
export function invalidateThreadCache(slug: string): void {
  const cacheKey = `public-thread-metadata:${slug}`;
  cache.delete(cacheKey);
}

/**
 * Clear all thread caches
 */
export function clearThreadCache(): void {
  for (const key of cache.keys()) {
    if (key.startsWith('public-thread-metadata:')) {
      cache.delete(key);
    }
  }
}
