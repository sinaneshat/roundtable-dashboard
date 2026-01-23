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
    queryKey: ['admin', 'users', 'search', query, limit],
    queryFn: () => adminSearchUserService({ query: { q: query, limit } }),
    enabled: query.length >= 3,
    staleTime: 30_000,
    gcTime: 60_000,
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
