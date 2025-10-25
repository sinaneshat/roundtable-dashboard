/**
 * Model Info Caching Service
 *
 * Implements in-memory LRU caching for OpenRouter model metadata.
 * Following backend-patterns.md: Service layer patterns
 *
 * Performance Goals:
 * - Cache model metadata for 1 hour (models rarely change)
 * - Save 20-100ms per cached model lookup
 * - Reduce OpenRouter API calls and rate limit pressure
 *
 * Cache Strategy:
 * - LRU eviction with configurable max entries
 * - TTL-based expiration (1 hour default)
 * - Model ID as cache key
 * - Automatic cleanup of expired entries
 *
 * Reference: /docs/analysis/backend-performance-issues.md:769-809
 */

import type { BaseModelResponse } from '@/api/routes/models/schema';

/**
 * Cache entry with expiration timestamp
 */
type CacheEntry = {
  data: BaseModelResponse;
  expiresAt: number; // Unix timestamp in milliseconds
};

/**
 * Cache configuration
 */
export type ModelCacheConfig = {
  /** TTL in seconds (default: 3600 = 1 hour) */
  ttl?: number;
  /** Maximum number of cached entries (default: 500) */
  maxEntries?: number;
};

/**
 * Model Info Cache Service
 *
 * Implements LRU cache with TTL for OpenRouter model metadata.
 * Reduces redundant API calls to OpenRouter for model context_length and pricing.
 *
 * Usage:
 * ```typescript
 * const cache = new ModelCacheService({ ttl: 3600, maxEntries: 500 });
 *
 * // Try to get cached result
 * const cached = cache.get(modelId);
 * if (cached) {
 *   return cached; // Cache hit - save 20-100ms
 * }
 *
 * // Cache miss - perform API call
 * const modelInfo = await openRouterModelsService.getModelById(modelId);
 * if (modelInfo) {
 *   cache.set(modelId, modelInfo); // Store for next request
 * }
 * ```
 */
export class ModelCacheService {
  private cache: Map<string, CacheEntry>;
  private accessOrder: string[]; // LRU tracking
  private readonly ttl: number;
  private readonly maxEntries: number;

  constructor(config: ModelCacheConfig = {}) {
    this.cache = new Map();
    this.accessOrder = [];
    this.ttl = (config.ttl ?? 3600) * 1000; // Convert to milliseconds (default: 1 hour)
    this.maxEntries = config.maxEntries ?? 500;
  }

  /**
   * Get cached model info
   *
   * Returns cached model metadata if:
   * 1. Entry exists in cache
   * 2. Entry has not expired (TTL check)
   *
   * Automatically removes expired entries during lookup.
   *
   * @param modelId - OpenRouter model ID (e.g., "openai/gpt-4o")
   * @returns Cached model info or null if miss/expired
   */
  get(modelId: string): BaseModelResponse | null {
    const entry = this.cache.get(modelId);

    // Cache miss
    if (!entry) {
      return null;
    }

    // Check expiration
    if (Date.now() > entry.expiresAt) {
      // Expired - remove and return null
      this.cache.delete(modelId);
      this.accessOrder = this.accessOrder.filter(k => k !== modelId);
      return null;
    }

    // Cache hit - update LRU order
    this.updateAccessOrder(modelId);

    return entry.data;
  }

  /**
   * Store model info in cache
   *
   * Implements LRU eviction when maxEntries is reached.
   * Sets expiration timestamp based on TTL configuration.
   *
   * @param modelId - OpenRouter model ID
   * @param data - Model metadata to cache
   */
  set(modelId: string, data: BaseModelResponse): void {
    // Check if we need to evict (LRU)
    if (this.cache.size >= this.maxEntries && !this.cache.has(modelId)) {
      // Evict least recently used entry
      const lruKey = this.accessOrder[0];
      if (lruKey) {
        this.cache.delete(lruKey);
        this.accessOrder.shift();
      }
    }

    // Store with expiration timestamp
    this.cache.set(modelId, {
      data,
      expiresAt: Date.now() + this.ttl,
    });

    // Update LRU order
    this.updateAccessOrder(modelId);
  }

  /**
   * Invalidate specific model from cache
   *
   * Useful when model metadata is known to have changed
   * (e.g., after OpenRouter updates pricing or context limits)
   *
   * @param modelId - Model ID to invalidate
   */
  invalidate(modelId: string): void {
    this.cache.delete(modelId);
    this.accessOrder = this.accessOrder.filter(k => k !== modelId);
  }

  /**
   * Clear all cached entries
   *
   * Useful for testing, manual cache invalidation, or after OpenRouter updates
   */
  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
  }

  /**
   * Get cache statistics
   *
   * Useful for monitoring cache performance and hit rates
   *
   * @returns Cache stats object
   */
  getStats(): {
    size: number;
    maxEntries: number;
    ttlSeconds: number;
    hitRate?: number;
  } {
    return {
      size: this.cache.size,
      maxEntries: this.maxEntries,
      ttlSeconds: this.ttl / 1000,
    };
  }

  /**
   * Update LRU access order
   *
   * Moves key to end of array (most recently used)
   *
   * @param key - Cache key (model ID)
   */
  private updateAccessOrder(key: string): void {
    // Remove from current position
    this.accessOrder = this.accessOrder.filter(k => k !== key);

    // Add to end (most recently used)
    this.accessOrder.push(key);
  }

  /**
   * Clean up expired entries
   *
   * Should be called periodically (e.g., every 30 minutes)
   * to prevent memory growth from expired entries.
   *
   * Not strictly necessary due to TTL checks in get(),
   * but useful for long-running processes.
   */
  cleanup(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    // Find expired entries
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        expiredKeys.push(key);
      }
    }

    // Remove expired entries
    for (const key of expiredKeys) {
      this.cache.delete(key);
      this.accessOrder = this.accessOrder.filter(k => k !== key);
    }
  }

  /**
   * Warm up cache with frequently used models
   *
   * Pre-loads commonly used models to improve initial request performance.
   * Should be called during application startup or after cache clear.
   *
   * @param models - Array of model metadata to pre-load
   */
  warmUp(models: BaseModelResponse[]): void {
    for (const model of models) {
      this.set(model.id, model);
    }
  }
}

/**
 * Singleton instance for global use
 *
 * Default configuration:
 * - TTL: 3600 seconds (1 hour)
 * - Max entries: 500 (covers most OpenRouter models)
 */
export const modelCache = new ModelCacheService({
  ttl: 3600, // 1 hour (models rarely change)
  maxEntries: 500, // Large enough for all models user might access
});
