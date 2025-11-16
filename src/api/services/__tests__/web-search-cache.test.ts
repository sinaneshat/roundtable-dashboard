/**
 * Web Search Cache Service Tests
 *
 * **TEST SUITE**: Comprehensive tests for KV caching layer
 *
 * **COVERAGE**:
 * - Cache key generation and normalization
 * - Cache operations (get, set, invalidate)
 * - TTL management
 * - Cache analytics (hit/miss tracking)
 * - Cache warming utilities
 * - Error handling and graceful degradation
 *
 * @module api/services/__tests__/web-search-cache
 */

import type { KVNamespace } from '@cloudflare/workers-types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TypedLogger } from '@/api/types/logger';
import type { CloudflareEnv } from '@/cloudflare-env';

import {
  CACHE_TTL,
  cacheImageDescription,
  cacheSearchResult,
  generateImageCacheKey,
  generateSearchCacheKey,
  getCachedImageDescription,
  getCachedSearch,
  getCacheStats,
  invalidateAllImageCaches,
  invalidateAllSearchCaches,
  invalidateSearchCache,
  resetCacheStats,
  warmSearchCache,
} from '../web-search-cache.service';

// ============================================================================
// Mock Setup
// ============================================================================

/**
 * Create mock KV namespace for testing
 * Simulates Cloudflare KV API
 */
function createMockKV(): KVNamespace {
  const store = new Map<string, { value: string; expiration?: number }>();

  return {
    get: vi.fn(async (key: string, type?: string) => {
      const entry = store.get(key);
      if (!entry)
        return null;

      if (type === 'json') {
        return JSON.parse(entry.value);
      }
      return entry.value;
    }),
    put: vi.fn(async (key: string, value: string, options?: { expirationTtl?: number }) => {
      store.set(key, {
        value,
        expiration: options?.expirationTtl,
      });
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key);
    }),
    list: vi.fn(async (options?: { prefix?: string }) => {
      const keys = Array.from(store.keys())
        .filter(k => !options?.prefix || k.startsWith(options.prefix))
        .map(name => ({ name }));
      return { keys, list_complete: true, cursor: '' };
    }),
  } as unknown as KVNamespace;
}

/**
 * Create mock environment bindings
 */
function createMockEnv(kv: KVNamespace): Pick<CloudflareEnv, 'KV'> {
  return {
    KV: kv,
  };
}

/**
 * Create mock logger
 */
function createMockLogger(): TypedLogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  } as TypedLogger;
}

// ============================================================================
// Tests: Cache Key Generation
// ============================================================================

describe('cache Key Generation', () => {
  it('should generate consistent cache keys for same query', () => {
    const key1 = generateSearchCacheKey('test query', 5, 'basic');
    const key2 = generateSearchCacheKey('test query', 5, 'basic');

    expect(key1).toBe(key2);
    expect(key1).toMatch(/^search:[a-z0-9]+:5:basic$/);
  });

  it('should normalize queries for better hit rate', () => {
    const key1 = generateSearchCacheKey('test query', 5, 'basic');
    const key2 = generateSearchCacheKey('TEST QUERY', 5, 'basic'); // Uppercase
    const key3 = generateSearchCacheKey('  test   query  ', 5, 'basic'); // Extra spaces

    // All should generate same key due to normalization
    expect(key1).toBe(key2);
    expect(key1).toBe(key3);
  });

  it('should generate different keys for different parameters', () => {
    const baseKey = generateSearchCacheKey('test', 5, 'basic');
    const diffQuery = generateSearchCacheKey('different', 5, 'basic');
    const diffResults = generateSearchCacheKey('test', 10, 'basic');
    const diffDepth = generateSearchCacheKey('test', 5, 'advanced');

    expect(baseKey).not.toBe(diffQuery);
    expect(baseKey).not.toBe(diffResults);
    expect(baseKey).not.toBe(diffDepth);
  });

  it('should generate consistent image cache keys', () => {
    const url = 'https://example.com/image.jpg';
    const key1 = generateImageCacheKey(url);
    const key2 = generateImageCacheKey(url);

    expect(key1).toBe(key2);
    expect(key1).toMatch(/^image:desc:[a-z0-9]+$/);
  });
});

// ============================================================================
// Tests: Cache Operations - Search Results
// ============================================================================

describe('search Result Caching', () => {
  let kv: KVNamespace;
  let env: Pick<CloudflareEnv, 'KV'>;
  let logger: TypedLogger;

  beforeEach(() => {
    kv = createMockKV();
    env = createMockEnv(kv);
    logger = createMockLogger();
  });

  it('should return null on cache miss', async () => {
    const result = await getCachedSearch('test query', 5, 'basic', env, logger);

    expect(result).toBeNull();
  });

  it('should cache and retrieve search results', async () => {
    const mockResult = {
      query: 'test query',
      answer: 'test answer',
      results: [
        {
          title: 'Test Result',
          url: 'https://example.com',
          content: 'test content',
          excerpt: 'test excerpt',
          score: 0.9,
          publishedDate: null,
          domain: 'example.com',
        },
      ],
      responseTime: 100,
      requestId: 'test-123',
    };

    // Cache the result
    await cacheSearchResult('test query', 5, 'basic', mockResult, env, logger);

    // Retrieve from cache
    const cached = await getCachedSearch('test query', 5, 'basic', env, logger);

    expect(cached).not.toBeNull();
    expect(cached?.query).toBe(mockResult.query);
    expect(cached?.results.length).toBe(1);
    expect(cached?.results[0].title).toBe('Test Result');
  });

  it('should set correct TTL when caching', async () => {
    const mockResult = {
      query: 'test',
      answer: null,
      results: [],
      responseTime: 50,
    };

    await cacheSearchResult('test', 5, 'basic', mockResult, env, logger);

    expect(kv.put).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      { expirationTtl: CACHE_TTL.SEARCH_RESULTS },
    );
  });

  it('should handle cache read errors gracefully', async () => {
    const errorKV = {
      get: vi.fn().mockRejectedValue(new Error('KV Error')),
    } as unknown as KVNamespace;

    const errorEnv = createMockEnv(errorKV);

    const result = await getCachedSearch('test', 5, 'basic', errorEnv, logger);

    expect(result).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(
      'KV cache read failed',
      expect.objectContaining({
        logType: 'edge_case',
      }),
    );
  });

  it('should handle cache write errors gracefully', async () => {
    const errorKV = {
      put: vi.fn().mockRejectedValue(new Error('KV Error')),
    } as unknown as KVNamespace;

    const errorEnv = createMockEnv(errorKV);
    const mockResult = { query: 'test', answer: null, results: [], responseTime: 50 };

    // Should not throw
    await expect(
      cacheSearchResult('test', 5, 'basic', mockResult, errorEnv, logger),
    ).resolves.not.toThrow();

    expect(logger.warn).toHaveBeenCalledWith(
      'KV cache write failed',
      expect.objectContaining({
        logType: 'edge_case',
      }),
    );
  });
});

// ============================================================================
// Tests: Cache Operations - Image Descriptions
// ============================================================================

describe('image Description Caching', () => {
  let kv: KVNamespace;
  let env: Pick<CloudflareEnv, 'KV'>;
  let logger: TypedLogger;

  beforeEach(() => {
    kv = createMockKV();
    env = createMockEnv(kv);
    logger = createMockLogger();
  });

  it('should return null on cache miss', async () => {
    const result = await getCachedImageDescription('https://example.com/image.jpg', env, logger);

    expect(result).toBeNull();
  });

  it('should cache and retrieve image descriptions', async () => {
    const imageUrl = 'https://example.com/image.jpg';
    const description = 'A beautiful sunset over the ocean';

    await cacheImageDescription(imageUrl, description, env, logger);

    const cached = await getCachedImageDescription(imageUrl, env, logger);

    expect(cached).toBe(description);
  });

  it('should set correct TTL for image descriptions', async () => {
    await cacheImageDescription('https://example.com/image.jpg', 'test', env, logger);

    expect(kv.put).toHaveBeenCalledWith(
      expect.any(String),
      'test',
      { expirationTtl: CACHE_TTL.IMAGE_DESCRIPTIONS },
    );
  });
});

// ============================================================================
// Tests: Cache Analytics
// ============================================================================

describe('cache Analytics', () => {
  let kv: KVNamespace;
  let env: Pick<CloudflareEnv, 'KV'>;

  beforeEach(async () => {
    kv = createMockKV();
    env = createMockEnv(kv);
    await resetCacheStats(env);
  });

  it('should track cache hits and misses', async () => {
    const mockResult = { query: 'test', answer: null, results: [], responseTime: 50 };

    // First call - cache miss
    await getCachedSearch('test', 5, 'basic', env);
    let stats = await getCacheStats(env);
    expect(stats.misses).toBe(1);
    expect(stats.hits).toBe(0);

    // Cache the result
    await cacheSearchResult('test', 5, 'basic', mockResult, env);

    // Second call - cache hit
    await getCachedSearch('test', 5, 'basic', env);
    stats = await getCacheStats(env);
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
  });

  it('should calculate hit rate correctly', async () => {
    const mockResult = { query: 'test', answer: null, results: [], responseTime: 50 };
    await cacheSearchResult('test', 5, 'basic', mockResult, env);

    // 1 hit, 2 misses = 33% hit rate
    await getCachedSearch('test', 5, 'basic', env); // hit
    await getCachedSearch('other1', 5, 'basic', env); // miss
    await getCachedSearch('other2', 5, 'basic', env); // miss

    const stats = await getCacheStats(env);
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(2);
    expect(stats.hitRate).toBeCloseTo(1 / 3);
  });

  it('should reset cache stats', async () => {
    const mockResult = { query: 'test', answer: null, results: [], responseTime: 50 };
    await cacheSearchResult('test', 5, 'basic', mockResult, env);

    await getCachedSearch('test', 5, 'basic', env); // hit
    await getCachedSearch('other', 5, 'basic', env); // miss

    let stats = await getCacheStats(env);
    expect(stats.hits).toBeGreaterThan(0);

    await resetCacheStats(env);

    stats = await getCacheStats(env);
    expect(stats.hits).toBe(0);
    expect(stats.misses).toBe(0);
    expect(stats.hitRate).toBe(0);
  });
});

// ============================================================================
// Tests: Cache Invalidation
// ============================================================================

describe('cache Invalidation', () => {
  let kv: KVNamespace;
  let env: Pick<CloudflareEnv, 'KV'>;

  beforeEach(() => {
    kv = createMockKV();
    env = createMockEnv(kv);
  });

  it('should invalidate specific search cache', async () => {
    const mockResult = { query: 'test', answer: null, results: [], responseTime: 50 };

    await cacheSearchResult('test', 5, 'basic', mockResult, env);

    let cached = await getCachedSearch('test', 5, 'basic', env);
    expect(cached).not.toBeNull();

    await invalidateSearchCache('test', 5, 'basic', env);

    cached = await getCachedSearch('test', 5, 'basic', env);
    expect(cached).toBeNull();
  });

  it('should invalidate all search caches', async () => {
    const mockResult = { query: 'test', answer: null, results: [], responseTime: 50 };

    await cacheSearchResult('test1', 5, 'basic', mockResult, env);
    await cacheSearchResult('test2', 5, 'basic', mockResult, env);

    const deletedCount = await invalidateAllSearchCaches(env);

    expect(deletedCount).toBe(2);

    const cached1 = await getCachedSearch('test1', 5, 'basic', env);
    const cached2 = await getCachedSearch('test2', 5, 'basic', env);

    expect(cached1).toBeNull();
    expect(cached2).toBeNull();
  });

  it('should invalidate all image caches', async () => {
    await cacheImageDescription('https://example.com/img1.jpg', 'desc1', env);
    await cacheImageDescription('https://example.com/img2.jpg', 'desc2', env);

    const deletedCount = await invalidateAllImageCaches(env);

    expect(deletedCount).toBe(2);

    const cached1 = await getCachedImageDescription('https://example.com/img1.jpg', env);
    const cached2 = await getCachedImageDescription('https://example.com/img2.jpg', env);

    expect(cached1).toBeNull();
    expect(cached2).toBeNull();
  });
});

// ============================================================================
// Tests: Cache Warming
// ============================================================================

describe('cache Warming', () => {
  let kv: KVNamespace;
  let env: Pick<CloudflareEnv, 'KV'>;
  let logger: TypedLogger;

  beforeEach(() => {
    kv = createMockKV();
    env = createMockEnv(kv);
    logger = createMockLogger();
  });

  it('should warm cache with common queries', async () => {
    const commonQueries = ['bitcoin price', 'weather today', 'latest news'];

    const mockSearch = vi.fn().mockResolvedValue({
      query: 'test',
      answer: null,
      results: [],
      responseTime: 100,
    });

    await warmSearchCache(commonQueries, env, mockSearch, logger);

    expect(mockSearch).toHaveBeenCalledTimes(3);

    // Verify all queries are cached
    for (const query of commonQueries) {
      const cached = await getCachedSearch(query, 5, 'basic', env);
      expect(cached).not.toBeNull();
    }
  });

  it('should skip already cached queries during warming', async () => {
    const mockResult = { query: 'test', answer: null, results: [], responseTime: 50 };
    await cacheSearchResult('bitcoin price', 5, 'basic', mockResult, env);

    const commonQueries = ['bitcoin price', 'weather today'];
    const mockSearch = vi.fn().mockResolvedValue(mockResult);

    await warmSearchCache(commonQueries, env, mockSearch, logger);

    // Should only call for 'weather today' (1 call), not 'bitcoin price' (already cached)
    expect(mockSearch).toHaveBeenCalledTimes(1);
  });

  it('should handle warming failures gracefully', async () => {
    const commonQueries = ['query1', 'query2'];

    const mockSearch = vi.fn()
      .mockResolvedValueOnce({ query: 'query1', answer: null, results: [], responseTime: 50 })
      .mockRejectedValueOnce(new Error('Search failed'));

    await expect(
      warmSearchCache(commonQueries, env, mockSearch, logger),
    ).resolves.not.toThrow();

    expect(logger.warn).toHaveBeenCalledWith(
      'Failed to warm cache for query',
      expect.objectContaining({
        logType: 'edge_case',
      }),
    );
  });
});
