/**
 * Cache Module - Barrel Export
 *
 * Server-side cache functions for data fetching.
 *
 * TanStack Start Caching Pattern:
 * - Route loaders: Server-side data fetching with automatic hydration
 * - TanStack Query: Client-side caching with staleTime
 * - Service layer: Direct API calls via Hono RPC client
 *
 * Cache Hierarchy:
 * 1. Static data (products, public models): Route loaders + long staleTime
 * 2. User-specific data: TanStack Query with appropriate staleTime
 * 3. Real-time data: Polling or invalidation patterns
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
