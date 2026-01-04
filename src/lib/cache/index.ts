/**
 * Cache Module - Barrel Export
 *
 * Server-side cache functions for generateMetadata() and ISR revalidation tags.
 * Page data fetching uses direct services with React Query prefetchQuery.
 *
 * Pattern:
 * - generateMetadata(): Use unstable_cache (no React Query hydration needed)
 * - Page prefetch: Use direct services with prefetchQuery + HydrationBoundary
 * - Revalidation: Use THREAD_CACHE_TAGS with revalidateTag()
 *
 * @see https://nextjs.org/docs/app/api-reference/functions/unstable_cache
 */

// Threads - Metadata caching + ISR revalidation tags
export {
  getCachedPublicThreadForMetadata,
  THREAD_CACHE_TAGS,
} from './thread-cache';
