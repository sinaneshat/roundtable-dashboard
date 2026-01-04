/**
 * Cache Module - Barrel Export
 *
 * Centralized exports for all server-side cache functions.
 * Uses unstable_cache for SSG/ISR-like caching patterns.
 *
 * Cache Strategies:
 * - SSG-like: Long cache (24h) for static data (models, config)
 * - ISR-like: Medium cache (1h) with on-demand revalidation (products)
 * - Dynamic ISR: Long cache (1 day) with tag-based invalidation (public threads)
 *
 * @see https://nextjs.org/docs/app/api-reference/functions/unstable_cache
 */

// Models - SSG-like caching (24 hours)
export {
  getCachedModels,
  getCachedPublicModels,
  MODELS_CACHE_DURATIONS,
  MODELS_CACHE_TAGS,
} from './models-cache';

// Products - SSG-like caching (1 hour)
export {
  getCachedProducts,
  PRODUCTS_CACHE_DURATIONS,
  PRODUCTS_CACHE_TAGS,
} from './products-cache';

// Threads - ISR caching (1 day with on-demand revalidation)
export {
  getCachedPublicThread,
  getCachedPublicThreadForMetadata,
  THREAD_CACHE_DURATIONS,
  THREAD_CACHE_TAGS,
} from './thread-cache';
