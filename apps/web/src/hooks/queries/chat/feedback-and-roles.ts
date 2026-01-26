/**
 * Thread Feedback & Custom Roles Query Hooks
 *
 * TanStack Query hooks for thread feedback and custom role template operations
 * Following patterns from TanStack Query v5 infinite query documentation
 *
 * IMPORTANT: Uses shared queryOptions from query-options.ts to ensure
 * SSR prefetch and client useQuery use the SAME configuration.
 * This prevents hydration mismatches and redundant client fetches.
 */

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { useAuthCheck } from '@/hooks/utils';
import { queryKeys } from '@/lib/data/query-keys';
import { threadFeedbackQueryOptions } from '@/lib/data/query-options';
import { GC_TIMES, STALE_TIME_PRESETS } from '@/lib/data/stale-times';
import {
  getCustomRoleService,
  getUserPresetService,
  listCustomRolesService,
  listUserPresetsService,
} from '@/services/api';

// ============================================================================
// THREAD FEEDBACK HOOKS
// ============================================================================

/**
 * Hook to fetch round feedback for a thread
 * Returns feedback submitted by users for each round
 * Protected endpoint - requires authentication
 *
 * ✅ SSR: Uses shared queryOptions for consistent SSR hydration
 *
 * @param threadId - Thread ID
 * @param enabled - Optional control over whether to fetch (default: true)
 */
export function useThreadFeedbackQuery(threadId: string, enabled = true) {
  const { isAuthenticated } = useAuthCheck();

  // ✅ SSR: Use shared queryOptions - MUST match loader prefetch
  const options = threadFeedbackQueryOptions(threadId);

  return useQuery({
    ...options,
    enabled: isAuthenticated && !!threadId && enabled,
    gcTime: GC_TIMES.INFINITE, // Match staleTime: Infinity pattern
    placeholderData: previousData => previousData,
    throwOnError: false,
  });
}

// ============================================================================
// CUSTOM ROLES HOOKS
// ============================================================================

/**
 * Hook to fetch user custom roles with cursor-based infinite scrolling
 * Uses TanStack Query useInfiniteQuery for seamless pagination
 * Protected endpoint - requires authentication
 *
 * Following TanStack Query v5 official patterns:
 * - Cursor-based pagination for infinite scroll
 * - Automatic page management via data.pages
 * - Built-in hasNextPage and fetchNextPage
 *
 * @param enabled - Optional flag to control when the query runs (default: true)
 *
 * @example
 * ```tsx
 * const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useCustomRolesQuery();
 *
 * // Render pages
 * data?.pages.map((page) =>
 *   page.data.items.map((role) => <RoleCard key={role.id} role={role} />)
 * )
 *
 * // Load more button
 * <button onClick={() => fetchNextPage()} disabled={!hasNextPage}>
 *   {isFetchingNextPage ? 'Loading...' : 'Load More'}
 * </button>
 * ```
 *
 * Stale time: 2 minutes (custom roles change infrequently)
 */
export function useCustomRolesQuery(enabled = true) {
  const { isAuthenticated } = useAuthCheck();

  return useInfiniteQuery({
    enabled: isAuthenticated && enabled, // Only fetch when authenticated and explicitly enabled
    gcTime: GC_TIMES.STANDARD, // 5 minutes
    queryFn: ({ pageParam }) =>
      listCustomRolesService({
        query: { cursor: pageParam },
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => {
      if (!lastPage.success) {
        return undefined;
      }
      return lastPage.data.pagination.nextCursor;
    },
    queryKey: queryKeys.customRoles.lists(),
    retry: false,
    staleTime: STALE_TIME_PRESETS.medium,
    throwOnError: false,
  });
}

/**
 * Hook to fetch a specific custom role by ID
 * Returns custom role details including name, description, and default settings
 * Protected endpoint - requires authentication
 *
 * @param roleId - Custom role ID
 * @param enabled - Optional control over whether to fetch (default: true when roleId exists)
 *
 * Stale time: 5 minutes (custom role details change very infrequently)
 */
export function useCustomRoleQuery(roleId: string, enabled = true) {
  const { isAuthenticated } = useAuthCheck();

  return useQuery({
    enabled: isAuthenticated && !!roleId && enabled, // Only fetch when authenticated and roleId exists
    gcTime: GC_TIMES.STANDARD, // 5 minutes
    queryFn: () => getCustomRoleService({ param: { id: roleId } }),
    queryKey: queryKeys.customRoles.detail(roleId),
    retry: false,
    staleTime: STALE_TIME_PRESETS.long,
    throwOnError: false,
  });
}

// ============================================================================
// USER PRESETS HOOKS
// ============================================================================

/**
 * Hook to fetch user presets with cursor-based infinite scrolling
 * Uses TanStack Query useInfiniteQuery for seamless pagination
 * Protected endpoint - requires authentication
 *
 * User presets are saved configurations of model+role combinations
 * that users can quickly apply to new threads.
 *
 * @param enabled - Optional flag to control when the query runs (default: true)
 *
 * Stale time: 2 minutes (user presets change infrequently)
 */
export function useUserPresetsQuery(enabled = true) {
  const { isAuthenticated } = useAuthCheck();

  return useInfiniteQuery({
    enabled: isAuthenticated && enabled,
    gcTime: GC_TIMES.STANDARD, // 5 minutes
    queryFn: ({ pageParam }) =>
      listUserPresetsService({
        query: { cursor: pageParam },
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => {
      if (!lastPage.success) {
        return undefined;
      }
      return lastPage.data.pagination.nextCursor;
    },
    queryKey: queryKeys.userPresets.lists(),
    retry: false,
    staleTime: STALE_TIME_PRESETS.medium,
    throwOnError: false,
  });
}

/**
 * Hook to fetch a specific user preset by ID
 * Protected endpoint - requires authentication
 *
 * @param presetId - User preset ID
 * @param enabled - Optional control over whether to fetch (default: true when presetId exists)
 *
 * Stale time: 5 minutes (user preset details change very infrequently)
 */
export function useUserPresetQuery(presetId: string, enabled = true) {
  const { isAuthenticated } = useAuthCheck();

  return useQuery({
    enabled: isAuthenticated && !!presetId && enabled,
    gcTime: GC_TIMES.STANDARD, // 5 minutes
    queryFn: () => getUserPresetService({ param: { id: presetId } }),
    queryKey: queryKeys.userPresets.detail(presetId),
    retry: false,
    staleTime: STALE_TIME_PRESETS.long,
    throwOnError: false,
  });
}
