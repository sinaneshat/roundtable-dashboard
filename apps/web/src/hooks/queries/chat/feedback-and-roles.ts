/**
 * Thread Feedback & Custom Roles Query Hooks
 *
 * TanStack Query hooks for thread feedback and custom role template operations
 * Following patterns from TanStack Query v5 infinite query documentation
 *
 * Merged from chat-feedback.ts and chat-roles.ts for better organization
 * Both are small (~50-100 lines each) and related to user interactions
 */

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { useAuthCheck } from '@/hooks/utils';
import { queryKeys } from '@/lib/data/query-keys';
import { STALE_TIME_PRESETS, STALE_TIMES } from '@/lib/data/stale-times';
import {
  getCustomRoleService,
  getThreadFeedbackService,
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
 * @param threadId - Thread ID
 * @param enabled - Optional control over whether to fetch (default: true)
 */
export function useThreadFeedbackQuery(threadId: string, enabled = true) {
  const { isAuthenticated } = useAuthCheck();

  return useQuery({
    queryKey: queryKeys.threads.feedback(threadId),
    queryFn: () => getThreadFeedbackService({ param: { id: threadId } }),
    staleTime: STALE_TIMES.threadFeedback, // Never stale - invalidated only on mutation
    gcTime: Infinity, // Match staleTime: Infinity pattern
    placeholderData: previousData => previousData,
    enabled: isAuthenticated && !!threadId && enabled,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
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
    queryKey: queryKeys.customRoles.lists(),
    queryFn: ({ pageParam }) =>
      listCustomRolesService({
        query: { cursor: pageParam },
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage: unknown) => {
      // Return nextCursor from pagination metadata, or undefined if no more pages
      // Defensive check: ensure success, data, and pagination all exist
      if (!lastPage || typeof lastPage !== 'object' || !('success' in lastPage))
        return undefined;
      const page = lastPage as { success: boolean; data?: unknown };
      if (!page.success || !page.data || typeof page.data !== 'object')
        return undefined;
      const data = page.data as { pagination?: { nextCursor?: string } };
      return data.pagination?.nextCursor;
    },
    staleTime: STALE_TIME_PRESETS.medium,
    gcTime: 5 * 60 * 1000, // 5 minutes
    retry: false,
    enabled: isAuthenticated && enabled, // Only fetch when authenticated and explicitly enabled
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
    queryKey: queryKeys.customRoles.detail(roleId),
    queryFn: () => getCustomRoleService({ param: { id: roleId } }),
    staleTime: STALE_TIME_PRESETS.long,
    gcTime: 5 * 60 * 1000, // 5 minutes
    enabled: isAuthenticated && !!roleId && enabled, // Only fetch when authenticated and roleId exists
    retry: false,
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
    queryKey: queryKeys.userPresets.lists(),
    queryFn: ({ pageParam }) =>
      listUserPresetsService({
        query: { cursor: pageParam },
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage: unknown) => {
      if (!lastPage || typeof lastPage !== 'object' || !('success' in lastPage))
        return undefined;
      const page = lastPage as { success: boolean; data?: unknown };
      if (!page.success || !page.data || typeof page.data !== 'object')
        return undefined;
      const data = page.data as { pagination?: { nextCursor?: string } };
      return data.pagination?.nextCursor;
    },
    staleTime: STALE_TIME_PRESETS.medium,
    gcTime: 5 * 60 * 1000, // 5 minutes
    retry: false,
    enabled: isAuthenticated && enabled,
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
    queryKey: queryKeys.userPresets.detail(presetId),
    queryFn: () => getUserPresetService({ param: { id: presetId } }),
    staleTime: STALE_TIME_PRESETS.long,
    gcTime: 5 * 60 * 1000, // 5 minutes
    enabled: isAuthenticated && !!presetId && enabled,
    retry: false,
    throwOnError: false,
  });
}
