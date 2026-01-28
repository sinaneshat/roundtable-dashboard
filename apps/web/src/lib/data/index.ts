/**
 * Data Layer Barrel Export
 *
 * Centralized exports for TanStack Query utilities:
 * - Query client singleton
 * - Query key factories
 * - Stale time configuration
 */

// Query client (singleton pattern for SSR)
export { getQueryClient } from './query-client';

// Query keys and invalidation patterns
export { invalidationPatterns, queryKeys } from './query-keys';

// Stale time configuration
export type { StaleTimeKey } from './stale-times';
export { GC_TIMES, getStaleTime, STALE_TIME_PRESETS, STALE_TIMES } from './stale-times';

// Shared query options (for SSR hydration consistency)
export {
  adminJobsInfiniteQueryOptions,
  adminJobsQueryOptions,
  modelsQueryOptions,
  productsQueryOptions,
  projectAttachmentsQueryOptions,
  projectMemoriesQueryOptions,
  projectQueryOptions,
  projectThreadsQueryOptions,
  sessionQueryOptions,
  sidebarProjectsQueryOptions,
  sidebarThreadsQueryOptions,
  subscriptionsQueryOptions,
  threadBySlugQueryOptions,
  threadChangelogQueryOptions,
  threadPreSearchesQueryOptions,
  usageQueryOptions,
} from './query-options';
