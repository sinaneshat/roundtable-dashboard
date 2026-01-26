/**
 * Admin Mutation Hooks
 *
 * TanStack Query hooks for admin operations
 */

import { useMutation, useQuery } from '@tanstack/react-query';

import { adminClearUserCacheService, adminSearchUserService } from '@/services/api';

/**
 * Hook to search for users by name or email (admin only)
 * Uses useQuery with enabled flag for debounced search
 * @param query - Search query (min 3 characters to trigger search)
 * @param limit - Max results (default 5)
 */
export function useAdminSearchUsers(query: string, limit = 5) {
  return useQuery({
    enabled: query.length >= 3,
    gcTime: 60_000,
    queryFn: () => adminSearchUserService({ query: { limit, q: query } }),
    queryKey: ['admin', 'users', 'search', query, limit],
    staleTime: 30_000,
  });
}

/**
 * Hook to clear all server-side caches for a user (admin only)
 * Used during impersonation to ensure fresh data
 */
export function useAdminClearUserCacheMutation() {
  return useMutation({
    mutationFn: (userId: string) => adminClearUserCacheService({ json: { userId } }),
  });
}
