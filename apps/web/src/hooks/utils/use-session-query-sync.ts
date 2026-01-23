/**
 * Session Query Sync Hook
 *
 * Automatically invalidates all user-specific query cache when session changes.
 * This ensures cached data from one user doesn't leak to another user.
 *
 * Use Case:
 * - User A logs in, data is cached
 * - User A logs out, User B logs in
 * - Without this hook, User B might see stale data from User A
 *
 * Pattern: Watch userId changes, invalidate on change
 */

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { invalidateUserQueries } from '@/lib/auth/utils';

import { useAuthCheck } from './use-auth-check';

/**
 * Sync query cache with session changes
 *
 * Call this once at the app root level (e.g., in _protected layout or providers).
 * Automatically invalidates all user-specific queries when userId changes.
 */
export function useSessionQuerySync(): void {
  const queryClient = useQueryClient();
  const { userId } = useAuthCheck();
  const previousUserIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const previousUserId = previousUserIdRef.current;

    // Skip on initial mount (no previous userId)
    if (previousUserId === undefined) {
      previousUserIdRef.current = userId;
      return;
    }

    // Skip if userId hasn't changed
    if (previousUserId === userId) {
      return;
    }

    // User changed - invalidate all user-specific queries
    // This handles: logout -> login as different user, impersonation, etc.
    invalidateUserQueries(queryClient);

    // Update ref for next comparison
    previousUserIdRef.current = userId;
  }, [userId, queryClient]);
}
