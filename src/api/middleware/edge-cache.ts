/**
 * Cloudflare Edge Cache Middleware
 *
 * Uses Cloudflare's Cache API to cache responses at the edge
 * for near-instant response times on public endpoints.
 *
 * Performance impact:
 * - Cache HIT: ~5-10ms response time (served from edge)
 * - Cache MISS: ~100-500ms (fetched from origin, then cached)
 *
 * @see https://developers.cloudflare.com/workers/runtime-apis/cache/
 */

import type { Context, MiddlewareHandler } from 'hono';

import type { ApiEnv } from '@/api/types';

export type EdgeCacheConfig = {
  ttl?: number;
  cacheKeyFn?: (c: Context<ApiEnv>) => string;
  shouldCache?: (c: Context<ApiEnv>) => boolean;
};

const DEFAULT_TTL = 3600;

type CacheStorageWithDefault = CacheStorage & { default: Cache };

function hasDefaultCache(storage: CacheStorage): storage is CacheStorageWithDefault {
  return 'default' in storage && storage.default instanceof Cache;
}

function getEdgeCache(): Cache | null {
  if (typeof caches === 'undefined') {
    return null;
  }
  return hasDefaultCache(caches) ? caches.default : null;
}

/**
 * Creates edge cache middleware for public API endpoints
 *
 * @example
 * ```ts
 * // Apply to public routes
 * app.use('/chat/public/*', edgeCache({ ttl: 86400 }));
 * ```
 */
export function edgeCache(config: EdgeCacheConfig = {}): MiddlewareHandler<ApiEnv> {
  const { ttl = DEFAULT_TTL, cacheKeyFn, shouldCache } = config;

  return async (c, next) => {
    // Only cache GET requests
    if (c.req.method !== 'GET') {
      return next();
    }

    // Check if we should cache this request
    if (shouldCache && !shouldCache(c)) {
      return next();
    }

    // Get the Cloudflare Cache API (only available in Workers environment)
    const cache = getEdgeCache();
    if (!cache) {
      return next();
    }

    // Generate cache key
    const cacheKey = cacheKeyFn
      ? new Request(cacheKeyFn(c), c.req.raw)
      : c.req.raw;

    try {
      // Try to get cached response
      const cachedResponse = await cache.match(cacheKey);

      if (cachedResponse) {
        // Cache HIT - return cached response with indicator header
        const response = new Response(cachedResponse.body, cachedResponse);
        response.headers.set('X-Cache', 'HIT');
        response.headers.set('X-Cache-Age', cachedResponse.headers.get('Age') ?? '0');
        return response;
      }
    } catch {
      // Cache API not available (local dev) - continue to origin
    }

    // Cache MISS - fetch from origin
    await next();

    // Only cache successful responses
    if (!c.res || c.res.status !== 200) {
      return;
    }

    try {
      // Clone response for caching
      const responseToCache = c.res.clone();

      // Create cacheable response with proper headers
      const cacheableResponse = new Response(responseToCache.body, {
        status: responseToCache.status,
        statusText: responseToCache.statusText,
        headers: new Headers(responseToCache.headers),
      });

      // Set cache control headers for edge caching
      cacheableResponse.headers.set('Cache-Control', `public, max-age=${ttl}, s-maxage=${ttl}`);

      // Store in edge cache (don't await - fire and forget)
      c.executionCtx.waitUntil(cache.put(cacheKey, cacheableResponse));

      // Add cache status header to response
      c.res.headers.set('X-Cache', 'MISS');
    } catch {
      // Cache API not available - silently continue
    }
  };
}

type UserAwareCacheOptions = {
  ttl?: number;
};

const PUBLIC_THREAD_TTL = 86400;
const AUTH_ROUTE_DEFAULT_TTL = 300;
const THREAD_CACHE_TTL = 300;
const CREDIT_BALANCE_TTL = 60;

export function publicThreadEdgeCache(): MiddlewareHandler<ApiEnv> {
  return edgeCache({
    ttl: PUBLIC_THREAD_TTL,
    cacheKeyFn: c => c.req.url,
    shouldCache: c => c.req.method === 'GET' && c.req.path.startsWith('/chat/public/'),
  });
}

export function userAwareEdgeCache(options: UserAwareCacheOptions = {}): MiddlewareHandler<ApiEnv> {
  const { ttl = AUTH_ROUTE_DEFAULT_TTL } = options;

  return edgeCache({
    ttl,
    cacheKeyFn: (c) => {
      const user = c.get('user');
      const userId = user?.id;
      if (!userId) {
        return c.req.url;
      }
      const url = new URL(c.req.url);
      url.searchParams.set('_uid', userId);
      return url.toString();
    },
    shouldCache: (c) => {
      const user = c.get('user');
      return c.req.method === 'GET' && Boolean(user?.id);
    },
  });
}

export function threadEdgeCache(): MiddlewareHandler<ApiEnv> {
  return userAwareEdgeCache({ ttl: THREAD_CACHE_TTL });
}

export function creditBalanceEdgeCache(): MiddlewareHandler<ApiEnv> {
  return userAwareEdgeCache({ ttl: CREDIT_BALANCE_TTL });
}
