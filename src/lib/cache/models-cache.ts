/**
 * Models Cache - Server-side caching for AI models
 *
 * Uses unstable_cache for server-side caching since cacheComponents is disabled.
 * Cache duration: 24 hours (models are static configuration - SSG-like)
 *
 * @see https://nextjs.org/docs/app/api-reference/functions/unstable_cache
 */

import { unstable_cache } from 'next/cache';

import type { ListModelsResponse } from '@/services/api/models';
import { listModelsPublicService, listModelsService } from '@/services/api/models';

// ============================================================================
// Cache Duration Constants
// ============================================================================

/**
 * Cache durations in seconds
 * SSG-like pattern: Long cache for static configuration data
 */
export const MODELS_CACHE_DURATIONS = {
  /** Models list: 24 hours (static config, rarely changes) */
  list: 86400,
  /** Public models: 24 hours (same as authenticated list) */
  publicList: 86400,
} as const;

// ============================================================================
// Cache Tag Constants
// ============================================================================

export const MODELS_CACHE_TAGS = {
  /** All models list */
  list: 'models-list',
  /** Public models list (no auth required) */
  publicList: 'models-public-list',
} as const;

// ============================================================================
// Cached Data Functions
// ============================================================================

/**
 * Get all models with server-side caching (authenticated)
 * SSG-like: 24 hour cache with tag-based invalidation
 */
export const getCachedModels = unstable_cache(
  async (bypassCache?: boolean): Promise<ListModelsResponse> => {
    return listModelsService({ bypassCache });
  },
  ['models-list'],
  {
    revalidate: MODELS_CACHE_DURATIONS.list,
    tags: [MODELS_CACHE_TAGS.list],
  },
);

/**
 * Get public models with server-side caching (no auth required)
 * SSG-like: 24 hour cache with tag-based invalidation
 * Safe for use in SSG/ISR pages (no auth cookies accessed)
 */
export const getCachedPublicModels = unstable_cache(
  async (): Promise<ListModelsResponse> => {
    return listModelsPublicService();
  },
  ['models-public-list'],
  {
    revalidate: MODELS_CACHE_DURATIONS.publicList,
    tags: [MODELS_CACHE_TAGS.publicList],
  },
);
