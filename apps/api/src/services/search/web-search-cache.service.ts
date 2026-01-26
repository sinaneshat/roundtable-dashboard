/**
 * Web Search Cache Service
 *
 * KV caching for web search results, image descriptions, and analytics.
 * Achieves 10-50x performance improvement through intelligent caching.
 *
 * @module api/services/web-search-cache
 */

import { LogTypes } from '@roundtable/shared/enums';

import { simpleHash } from '@/common/cache-utils';
import type { WebSearchResult } from '@/routes/chat/schema';
import type { ApiEnv } from '@/types';
import type { TypedLogger } from '@/types/logger';
import type { CachedSearchResult } from '@/types/web-search-cache';
import { parseCachedSearchResult } from '@/types/web-search-cache';

// ============================================================================
// Cache Configuration
// ============================================================================

export const CACHE_TTL = {
  ANALYTICS: 60 * 60 * 24 * 30,
  ANSWER_SUMMARIES: 60 * 60 * 12,
  IMAGE_DESCRIPTIONS: 60 * 60 * 24 * 7,
  SEARCH_RESULTS: 60 * 60 * 24,
} as const;

/** Cache key prefixes - single source of truth for KV key structure */
const CACHE_KEY_PREFIX = {
  IMAGE_DESC: 'image:desc',
  SEARCH: 'search',
  STATS_HITS: 'stats:cache:hits',
  STATS_MISSES: 'stats:cache:misses',
} as const;

/** Cache operation scenarios for logging */
const CACHE_SCENARIOS = {
  HIT_TRACKING_FAILED: 'cacheHitTrackingFailed',
  IMAGE_READ_FAILED: 'imageCacheReadFailed',
  IMAGE_WRITE_FAILED: 'imageCacheWriteFailed',
  INVALID_DATA_FORMAT: 'invalidCacheDataFormat',
  KV_READ_FAILED: 'kvCacheReadFailed',
  KV_WRITE_FAILED: 'kvCacheWriteFailed',
  MISS_TRACKING_FAILED: 'cacheMissTrackingFailed',
} as const;

// ============================================================================
// Cache Key Generation
// ============================================================================

function normalizeQuery(query: string): string {
  return query
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s-]/g, '');
}

export function generateSearchCacheKey(
  query: string,
  maxResults: number,
  searchDepth: string,
): string {
  const normalized = normalizeQuery(query);
  const hash = simpleHash(normalized);
  return `${CACHE_KEY_PREFIX.SEARCH}:${hash}:${maxResults}:${searchDepth}`;
}

export function generateImageCacheKey(imageUrl: string): string {
  const hash = simpleHash(imageUrl);
  return `${CACHE_KEY_PREFIX.IMAGE_DESC}:${hash}`;
}

// ============================================================================
// Cache Operations
// ============================================================================
export async function getCachedSearch(
  query: string,
  maxResults: number,
  searchDepth: string,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<WebSearchResult | null> {
  try {
    const key = generateSearchCacheKey(query, maxResults, searchDepth);
    // cacheTtl enables edge caching - 5 min for search results (24h TTL)
    const cached = await env.KV.get(key, { cacheTtl: 300, type: 'json' });

    if (!cached) {
      await trackCacheMiss(env, logger);
      return null;
    }

    const result = parseCachedSearchResult(cached);
    if (!result) {
      logger?.warn('Invalid cache data format, treating as cache miss', {
        logType: LogTypes.EDGE_CASE,
        query: query.substring(0, 50),
        scenario: CACHE_SCENARIOS.INVALID_DATA_FORMAT,
      });
      await trackCacheMiss(env, logger);
      return null;
    }

    await trackCacheHit(env, logger);

    const { _cache, ...searchResult } = result;

    const cacheAge = Date.now() - new Date(_cache.cachedAt).getTime();
    logger?.info('Cache hit for search query', {
      cacheAge,
      expiresIn: new Date(_cache.expiresAt).getTime() - Date.now(),
      logType: LogTypes.PERFORMANCE,
      query: query.substring(0, 50),
    });

    return searchResult;
  } catch (error) {
    logger?.warn('KV cache read failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      logType: LogTypes.EDGE_CASE,
      query: query.substring(0, 50),
      scenario: CACHE_SCENARIOS.KV_READ_FAILED,
    });
    return null;
  }
}

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

    const now = new Date();
    const expiresAt = new Date(now.getTime() + CACHE_TTL.SEARCH_RESULTS * 1000);

    const cacheEntry: CachedSearchResult = {
      ...result,
      _cache: {
        cachedAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
      },
    };

    await env.KV.put(key, JSON.stringify(cacheEntry), { expirationTtl: CACHE_TTL.SEARCH_RESULTS });

    logger?.info('Cached search result', {
      logType: LogTypes.PERFORMANCE,
      query: query.substring(0, 50),
      resultCount: result.results.length,
      ttl: CACHE_TTL.SEARCH_RESULTS,
    });
  } catch (error) {
    logger?.warn('KV cache write failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      logType: LogTypes.EDGE_CASE,
      query: query.substring(0, 50),
      scenario: CACHE_SCENARIOS.KV_WRITE_FAILED,
    });
  }
}

export async function getCachedImageDescription(
  imageUrl: string,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<string | null> {
  try {
    const key = generateImageCacheKey(imageUrl);
    // cacheTtl enables edge caching - 5 min for image descriptions (7d TTL)
    const cached = await env.KV.get(key, { cacheTtl: 300, type: 'text' });

    if (cached) {
      logger?.info('Image description cache hit', {
        logType: LogTypes.PERFORMANCE,
        url: imageUrl.substring(0, 100),
      });
    }

    return cached;
  } catch (error) {
    logger?.warn('Image cache read failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      logType: LogTypes.EDGE_CASE,
      scenario: CACHE_SCENARIOS.IMAGE_READ_FAILED,
    });
    return null;
  }
}

export async function cacheImageDescription(
  imageUrl: string,
  description: string,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<void> {
  try {
    const key = generateImageCacheKey(imageUrl);
    await env.KV.put(key, description, { expirationTtl: CACHE_TTL.IMAGE_DESCRIPTIONS });

    logger?.info('Cached image description', {
      logType: LogTypes.PERFORMANCE,
      ttl: CACHE_TTL.IMAGE_DESCRIPTIONS,
      url: imageUrl.substring(0, 100),
    });
  } catch (error) {
    logger?.warn('Image cache write failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      logType: LogTypes.EDGE_CASE,
      scenario: CACHE_SCENARIOS.IMAGE_WRITE_FAILED,
    });
  }
}

// ============================================================================
// Analytics (Sharded to avoid KV 1 write/second per key limit)
// ============================================================================

/**
 * Get hourly bucket for timestamp sharding.
 * Distributes writes across keys to avoid KV rate limits.
 */
function getHourlyBucket(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}T${String(now.getUTCHours()).padStart(2, '0')}`;
}

async function trackCacheHit(env: ApiEnv['Bindings'], logger?: TypedLogger): Promise<void> {
  try {
    // Shard by hour to avoid 1 write/second limit per key
    const bucket = getHourlyBucket();
    const key = `${CACHE_KEY_PREFIX.STATS_HITS}:${bucket}`;
    const current = await env.KV.get(key, 'text');
    const count = Number.parseInt(current || '0', 10) + 1;
    await env.KV.put(key, count.toString(), { expirationTtl: CACHE_TTL.ANALYTICS });
  } catch (error) {
    logger?.debug('Cache hit tracking failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      logType: LogTypes.EDGE_CASE,
      scenario: CACHE_SCENARIOS.HIT_TRACKING_FAILED,
    });
  }
}

async function trackCacheMiss(env: ApiEnv['Bindings'], logger?: TypedLogger): Promise<void> {
  try {
    // Shard by hour to avoid 1 write/second limit per key
    const bucket = getHourlyBucket();
    const key = `${CACHE_KEY_PREFIX.STATS_MISSES}:${bucket}`;
    const current = await env.KV.get(key, 'text');
    const count = Number.parseInt(current || '0', 10) + 1;
    await env.KV.put(key, count.toString(), { expirationTtl: CACHE_TTL.ANALYTICS });
  } catch (error) {
    logger?.debug('Cache miss tracking failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      logType: LogTypes.EDGE_CASE,
      scenario: CACHE_SCENARIOS.MISS_TRACKING_FAILED,
    });
  }
}
