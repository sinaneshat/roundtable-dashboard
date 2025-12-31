/**
 * Web Search Cache Service
 *
 * **BACKEND SERVICE**: KV caching layer for web search to achieve 10-50x performance improvement
 * Following backend-patterns.md: Service layer for business logic, external integrations
 *
 * **PURPOSE**:
 * - Intelligent KV caching for search results to avoid redundant API calls
 * - Cache key strategy with query normalization for higher hit rates
 * - Separate TTLs for different data types (search results, images, answers)
 * - Cache analytics for monitoring performance improvements
 *
 * **PERFORMANCE TARGETS**:
 * - Cache hits: < 50ms response time (10-50x faster than fresh search)
 * - Cost reduction: ~70-90% reduction for repeated queries
 * - Better UX: Near-instant results for cached queries
 *
 * @module api/services/web-search-cache
 */

import type { WebSearchResult } from '@/api/routes/chat/schema';
import type { ApiEnv } from '@/api/types';
import type { TypedLogger } from '@/api/types/logger';
import type { CachedSearchResult } from '@/api/types/web-search-cache';
import { parseCachedSearchResult } from '@/api/types/web-search-cache';

// ============================================================================
// Cache TTLs (in seconds)
// ============================================================================

/**
 * Cache TTL configuration
 * Different content types have different freshness requirements
 */
export const CACHE_TTL = {
  /** Search results: 24 hours (balance freshness vs cost) */
  SEARCH_RESULTS: 60 * 60 * 24,
  /** Image descriptions: 7 days (images rarely change) */
  IMAGE_DESCRIPTIONS: 60 * 60 * 24 * 7,
  /** Answer summaries: 12 hours (answers may need updates) */
  ANSWER_SUMMARIES: 60 * 60 * 12,
  /** Cache analytics: 30 days (long-term tracking) */
  ANALYTICS: 60 * 60 * 24 * 30,
} as const;

// ============================================================================
// Cache Key Generation
// ============================================================================

/**
 * Simple hash function for cache keys
 * Creates consistent, short cache keys from query strings
 *
 * @param str - String to hash
 * @returns Hash string in base36 format
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Normalize search query for better cache hit rate
 * Applies consistent transformations to reduce cache misses
 *
 * @param query - Raw search query
 * @returns Normalized query string
 */
function normalizeQuery(query: string): string {
  return query
    .toLowerCase() // Case-insensitive
    .trim() // Remove leading/trailing whitespace
    .replace(/\s+/g, ' ') // Collapse multiple spaces
    .replace(/[^\w\s-]/g, ''); // Remove special characters except spaces and hyphens
}

/**
 * Generate cache key for search query
 * Creates deterministic cache key from query parameters
 *
 * @param query - Search query string
 * @param maxResults - Maximum results requested
 * @param searchDepth - Search depth (basic/advanced)
 * @returns Cache key for KV storage
 */
export function generateSearchCacheKey(
  query: string,
  maxResults: number,
  searchDepth: string,
): string {
  // Normalize query for better hit rate
  const normalized = normalizeQuery(query);

  // Hash for consistent key length (prevents key size issues)
  const hash = simpleHash(normalized);

  return `search:${hash}:${maxResults}:${searchDepth}`;
}

/**
 * Generate cache key for image description
 *
 * @param imageUrl - Image URL to cache description for
 * @returns Cache key for KV storage
 */
export function generateImageCacheKey(imageUrl: string): string {
  const hash = simpleHash(imageUrl);
  return `image:desc:${hash}`;
}

// ============================================================================
// Cache Operations - Search Results
// ============================================================================
// ✅ TYPE-SAFE: CacheMetadata and CachedSearchResult imported from @/api/types/web-search-cache

/**
 * Get cached search result from KV
 * Returns null on cache miss or error (graceful degradation)
 *
 * @param query - Search query string
 * @param maxResults - Maximum results requested
 * @param searchDepth - Search depth (basic/advanced)
 * @param env - Cloudflare environment bindings
 * @param logger - Optional logger for tracking
 * @returns Cached search result or null
 */
export async function getCachedSearch(
  query: string,
  maxResults: number,
  searchDepth: string,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<WebSearchResult | null> {
  try {
    const key = generateSearchCacheKey(query, maxResults, searchDepth);
    const cached = await env.KV.get(key, 'json');

    if (!cached) {
      // Cache miss - track for analytics
      await trackCacheMiss(env, logger);
      return null;
    }

    // ✅ TYPE-SAFE: Use safe parser instead of force casting
    const result = parseCachedSearchResult(cached);
    if (!result) {
      // Invalid cache data format - treat as cache miss
      logger?.warn('Invalid cache data format, treating as cache miss', {
        logType: 'edge_case',
        scenario: 'invalidCacheDataFormat',
        query: query.substring(0, 50),
      });
      await trackCacheMiss(env, logger);
      return null;
    }

    // Cache hit - track for analytics
    await trackCacheHit(env, logger);

    // Return without internal cache metadata
    const { _cache, ...searchResult } = result;

    if (logger) {
      const cacheAge = Date.now() - new Date(_cache.cachedAt).getTime();
      logger.info('Cache hit for search query', {
        logType: 'performance',
        query: query.substring(0, 50),
        cacheAge,
        expiresIn: new Date(_cache.expiresAt).getTime() - Date.now(),
      });
    }

    return searchResult;
  } catch (error) {
    // Cache read failure - don't fail the search
    if (logger) {
      logger.warn('KV cache read failed', {
        logType: 'edge_case',
        scenario: 'kvCacheReadFailed',
        error: error instanceof Error ? error.message : 'Unknown error',
        query: query.substring(0, 50),
      });
    }
    return null;
  }
}

/**
 * Store search result in cache
 * Fails silently on error (cache write shouldn't break requests)
 *
 * @param query - Search query string
 * @param maxResults - Maximum results requested
 * @param searchDepth - Search depth (basic/advanced)
 * @param result - Search result to cache
 * @param env - Cloudflare environment bindings
 * @param logger - Optional logger for tracking
 */
export async function cacheSearchResult(
  query: string,
  maxResults: number,
  searchDepth: string,
  result: WebSearchResult,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<void> {
  try {
    const key = generateSearchCacheKey(query, maxResults, searchDepth);

    // Add cache metadata
    const now = new Date();
    const expiresAt = new Date(now.getTime() + CACHE_TTL.SEARCH_RESULTS * 1000);

    const cacheEntry: CachedSearchResult = {
      ...result,
      _cache: {
        cachedAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
      },
    };

    await env.KV.put(
      key,
      JSON.stringify(cacheEntry),
      { expirationTtl: CACHE_TTL.SEARCH_RESULTS },
    );

    if (logger) {
      logger.info('Cached search result', {
        logType: 'performance',
        query: query.substring(0, 50),
        ttl: CACHE_TTL.SEARCH_RESULTS,
        resultCount: result.results.length,
      });
    }
  } catch (error) {
    // Cache write failure shouldn't break the request
    if (logger) {
      logger.warn('KV cache write failed', {
        logType: 'edge_case',
        scenario: 'kvCacheWriteFailed',
        error: error instanceof Error ? error.message : 'Unknown error',
        query: query.substring(0, 50),
      });
    }
  }
}

// ============================================================================
// Cache Operations - Image Descriptions
// ============================================================================

/**
 * Get cached image description from KV
 * Returns null on cache miss or error
 *
 * @param imageUrl - Image URL to get description for
 * @param env - Cloudflare environment bindings
 * @param logger - Optional logger
 * @returns Cached description or null
 */
export async function getCachedImageDescription(
  imageUrl: string,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<string | null> {
  try {
    const key = generateImageCacheKey(imageUrl);
    const cached = await env.KV.get(key, 'text');

    if (cached && logger) {
      logger.info('Image description cache hit', {
        logType: 'performance',
        url: imageUrl.substring(0, 100),
      });
    }

    return cached;
  } catch (error) {
    if (logger) {
      logger.warn('Image cache read failed', {
        logType: 'edge_case',
        scenario: 'imageCacheReadFailed',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
    return null;
  }
}

/**
 * Cache image description in KV
 * Fails silently on error
 *
 * @param imageUrl - Image URL
 * @param description - AI-generated description
 * @param env - Cloudflare environment bindings
 * @param logger - Optional logger
 */
export async function cacheImageDescription(
  imageUrl: string,
  description: string,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<void> {
  try {
    const key = generateImageCacheKey(imageUrl);
    await env.KV.put(
      key,
      description,
      { expirationTtl: CACHE_TTL.IMAGE_DESCRIPTIONS },
    );

    if (logger) {
      logger.info('Cached image description', {
        logType: 'performance',
        url: imageUrl.substring(0, 100),
        ttl: CACHE_TTL.IMAGE_DESCRIPTIONS,
      });
    }
  } catch (error) {
    if (logger) {
      logger.warn('Image cache write failed', {
        logType: 'edge_case',
        scenario: 'imageCacheWriteFailed',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}

// ============================================================================
// Cache Analytics
// ============================================================================

/**
 * Increment cache hit counter
 * Used for tracking cache performance
 *
 * @param env - Cloudflare environment bindings
 * @param logger - Optional logger
 */
async function trackCacheHit(env: ApiEnv['Bindings'], logger?: TypedLogger): Promise<void> {
  try {
    const current = await env.KV.get('stats:cache:hits', 'text');
    const count = Number.parseInt(current || '0', 10) + 1;
    await env.KV.put('stats:cache:hits', count.toString(), {
      expirationTtl: CACHE_TTL.ANALYTICS,
    });
  } catch (error) {
    // Ignore analytics errors - shouldn't affect core functionality
    if (logger) {
      logger.debug('Cache hit tracking failed', {
        logType: 'edge_case',
        scenario: 'cacheHitTrackingFailed',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}

/**
 * Increment cache miss counter
 * Used for tracking cache performance
 *
 * @param env - Cloudflare environment bindings
 * @param logger - Optional logger
 */
async function trackCacheMiss(env: ApiEnv['Bindings'], logger?: TypedLogger): Promise<void> {
  try {
    const current = await env.KV.get('stats:cache:misses', 'text');
    const count = Number.parseInt(current || '0', 10) + 1;
    await env.KV.put('stats:cache:misses', count.toString(), {
      expirationTtl: CACHE_TTL.ANALYTICS,
    });
  } catch (error) {
    // Ignore analytics errors
    if (logger) {
      logger.debug('Cache miss tracking failed', {
        logType: 'edge_case',
        scenario: 'cacheMissTrackingFailed',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}

/**
 * Get cache performance statistics
 * Returns hit/miss counts and hit rate
 *
 * @param env - Cloudflare environment bindings
 * @returns Cache statistics
 */
export async function getCacheStats(
  env: ApiEnv['Bindings'],
): Promise<{
  hits: number;
  misses: number;
  hitRate: number;
}> {
  try {
    const hits = await env.KV.get('stats:cache:hits', 'text');
    const misses = await env.KV.get('stats:cache:misses', 'text');

    const hitsNum = Number.parseInt(hits || '0', 10);
    const missesNum = Number.parseInt(misses || '0', 10);
    const total = hitsNum + missesNum;

    return {
      hits: hitsNum,
      misses: missesNum,
      hitRate: total > 0 ? hitsNum / total : 0,
    };
  } catch {
    return { hits: 0, misses: 0, hitRate: 0 };
  }
}

/**
 * Reset cache statistics
 * Useful for testing or starting fresh tracking periods
 *
 * @param env - Cloudflare environment bindings
 */
export async function resetCacheStats(env: ApiEnv['Bindings']): Promise<void> {
  try {
    await env.KV.delete('stats:cache:hits');
    await env.KV.delete('stats:cache:misses');
  } catch {
    // Ignore errors
  }
}

// ============================================================================
// Cache Invalidation
// ============================================================================

/**
 * Invalidate cache for specific query
 * Useful for admin/debug operations
 *
 * @param query - Search query to invalidate
 * @param maxResults - Maximum results parameter
 * @param searchDepth - Search depth parameter
 * @param env - Cloudflare environment bindings
 */
export async function invalidateSearchCache(
  query: string,
  maxResults: number,
  searchDepth: string,
  env: ApiEnv['Bindings'],
): Promise<void> {
  const key = generateSearchCacheKey(query, maxResults, searchDepth);
  await env.KV.delete(key);
}

/**
 * Invalidate all search caches
 * Use sparingly - clears all cached search results
 *
 * @param env - Cloudflare environment bindings
 * @returns Number of cache entries deleted
 */
export async function invalidateAllSearchCaches(
  env: ApiEnv['Bindings'],
): Promise<number> {
  let deletedCount = 0;

  // List all keys with search: prefix
  const { keys } = await env.KV.list({ prefix: 'search:' });

  for (const key of keys) {
    await env.KV.delete(key.name);
    deletedCount++;
  }

  return deletedCount;
}

/**
 * Invalidate all image description caches
 * Use sparingly - clears all cached image descriptions
 *
 * @param env - Cloudflare environment bindings
 * @returns Number of cache entries deleted
 */
export async function invalidateAllImageCaches(
  env: ApiEnv['Bindings'],
): Promise<number> {
  let deletedCount = 0;

  // List all keys with image:desc: prefix
  const { keys } = await env.KV.list({ prefix: 'image:desc:' });

  for (const key of keys) {
    await env.KV.delete(key.name);
    deletedCount++;
  }

  return deletedCount;
}

// ============================================================================
// Cache Warming
// ============================================================================

/**
 * Warm cache with common queries
 * Pre-populates cache for frequently searched queries
 *
 * @param commonQueries - Array of common search queries
 * @param env - Cloudflare environment bindings
 * @param performSearch - Function to perform actual search
 * @param logger - Optional logger
 */
export async function warmSearchCache(
  commonQueries: string[],
  env: ApiEnv['Bindings'],
  performSearch: (query: string) => Promise<WebSearchResult>,
  logger?: TypedLogger,
): Promise<void> {
  if (logger) {
    logger.info('Starting cache warming', {
      logType: 'operation',
      operationName: 'startCacheWarming',
      count: commonQueries.length,
    });
  }

  for (const query of commonQueries) {
    try {
      // Check if already cached
      const cached = await getCachedSearch(query, 5, 'basic', env, logger);
      if (cached) {
        if (logger) {
          logger.info('Query already cached, skipping', {
            logType: 'operation',
            operationName: 'cacheWarming_queryAlreadyCached',
            query: query.substring(0, 50),
          });
        }
        continue;
      }

      // Perform search and cache
      const result = await performSearch(query);

      // Cache the result
      await cacheSearchResult(query, 5, 'basic', result, env, logger);

      if (logger) {
        logger.info('Cache warmed for query', {
          logType: 'operation',
          operationName: 'cacheWarming_queryWarmed',
          query: query.substring(0, 50),
        });
      }

      // Rate limit to avoid overwhelming APIs
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      if (logger) {
        logger.warn('Failed to warm cache for query', {
          logType: 'edge_case',
          scenario: 'cacheWarming_failed',
          query: query.substring(0, 50),
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }

  if (logger) {
    logger.info('Cache warming complete', {
      logType: 'operation',
      operationName: 'cacheWarming_complete',
    });
  }
}
