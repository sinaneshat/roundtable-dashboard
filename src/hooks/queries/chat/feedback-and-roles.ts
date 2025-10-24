/**
 * Thread Feedback & Custom Roles Query Hooks
 *
 * TanStack Query hooks for thread feedback and custom role template operations
 * Following patterns from TanStack Query v5 infinite query documentation
 *
 * Merged from chat-feedback.ts and chat-roles.ts for better organization
 * Both are small (~50-100 lines each) and related to user interactions
 */

'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { useSession } from '@/lib/auth/client';
import { queryKeys } from '@/lib/data/query-keys';
import { STALE_TIME_PRESETS } from '@/lib/data/stale-times';
import {
  getCustomRoleService,
  getThreadFeedbackService,
  listCustomRolesService,
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
  return useQuery({
    queryKey: queryKeys.threads.feedback(threadId),
    queryFn: async () => {
      const response = await getThreadFeedbackService({
        param: { id: threadId },
      });

      if (!response.success) {
        throw new Error('Failed to fetch feedback');
      }

      return response.data;
    },
    staleTime: STALE_TIME_PRESETS.medium,
    enabled,
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
  const { data: session, isPending } = useSession();
  const isAuthenticated = !isPending && !!session?.user?.id;

  return useInfiniteQuery({
    queryKey: queryKeys.customRoles.lists(),
    queryFn: ({ pageParam }) =>
      listCustomRolesService({
        query: { cursor: pageParam },
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => {
      // Return nextCursor from pagination metadata, or undefined if no more pages
      // Defensive check: ensure success, data, and pagination all exist
      if (lastPage?.success && lastPage.data?.pagination?.nextCursor) {
        return lastPage.data.pagination.nextCursor;
      }
      return undefined;
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
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
  const { data: session, isPending } = useSession();
  const isAuthenticated = !isPending && !!session?.user?.id;

  return useQuery({
    queryKey: queryKeys.customRoles.detail(roleId),
    queryFn: () => getCustomRoleService({ param: { id: roleId } }),
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: isAuthenticated && !!roleId && enabled, // Only fetch when authenticated and roleId exists
    retry: false,
    throwOnError: false,
  });
}
