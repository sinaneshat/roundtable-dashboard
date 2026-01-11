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
export { getStaleTime, STALE_TIME_PRESETS, STALE_TIMES } from './stale-times';
