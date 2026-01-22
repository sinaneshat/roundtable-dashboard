/**
 * Admin Mutation Hooks
 *
 * TanStack Mutation hooks for admin operations
 */

import { useMutation } from '@tanstack/react-query';

import { adminSearchUserService } from '@/services/api';

/**
 * Hook to search for a user by email (admin only)
 * Protected endpoint - requires admin role
 */
export function useAdminSearchUserMutation() {
  return useMutation({
    mutationFn: adminSearchUserService,
    retry: false,
    throwOnError: false,
  });
}
