/**
 * Cache Module - Barrel Export
 *
 * Server-side cache functions for data fetching.
 *
 * NOTE: 'use cache' directive is disabled due to cacheComponents incompatibility
 * with opennextjs-cloudflare. Using ISR + TanStack Query instead.
 *
 * Pattern:
 * - ISR: `export const revalidate` in pages for static/semi-static data
 * - TanStack Query prefetch: For hydration of server-fetched data
 * - unstable_cache: For generateMetadata() (no React Query hydration needed)
 * - Revalidation: Use cache tags with revalidateTag()
 *
 * Cache Hierarchy:
 * 1. Static data (products, public models): ISR with long revalidate times
 * 2. User-specific data: TanStack Query with staleTime
 * 3. Metadata: unstable_cache for generateMetadata()
 */

// Models - Public models (no auth required)
export {
  getCachedPublicModels,
  MODEL_CACHE_TAGS,
} from './models-cache';

// Products - Public product data
export {
  getCachedProduct,
  getCachedProducts,
  PRODUCT_CACHE_TAGS,
} from './products-cache';

// Threads - Metadata caching + ISR revalidation tags
export {
  getCachedPublicThreadForMetadata,
  THREAD_CACHE_TAGS,
} from './thread-cache';
