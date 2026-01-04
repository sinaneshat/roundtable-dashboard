/**
 * Products Cache - Server-side caching for Stripe products
 *
 * Uses unstable_cache for server-side caching since cacheComponents is disabled.
 * Cache duration: 1 hour (products rarely change, SSG-like pattern)
 *
 * @see https://nextjs.org/docs/app/api-reference/functions/unstable_cache
 */

import { unstable_cache } from 'next/cache';

import type { GetProductsResponse } from '@/services/api/products';
import { getProductsService } from '@/services/api/products';

// ============================================================================
// Cache Duration Constants
// ============================================================================

/**
 * Cache durations in seconds
 * SSG-like pattern: Long cache for pricing/product data
 */
export const PRODUCTS_CACHE_DURATIONS = {
  /** Products list: 24 hours (static pricing data, SSG-like) */
  list: 86400,
} as const;

// ============================================================================
// Cache Tag Constants
// ============================================================================

export const PRODUCTS_CACHE_TAGS = {
  /** All products list */
  list: 'products-list',
  /** Single product by ID */
  product: (id: string) => `product:${id}`,
} as const;

// ============================================================================
// Cached Data Functions
// ============================================================================

/**
 * Get all products with server-side caching
 * SSG-like: 1 hour cache with tag-based invalidation
 */
export const getCachedProducts = unstable_cache(
  async (): Promise<GetProductsResponse> => {
    return getProductsService();
  },
  ['products-list'],
  {
    revalidate: PRODUCTS_CACHE_DURATIONS.list,
    tags: [PRODUCTS_CACHE_TAGS.list],
  },
);
