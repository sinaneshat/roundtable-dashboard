/**
 * Shared Authentication Check Hook
 *
 * SINGLE SOURCE OF TRUTH for checking authentication status in query hooks.
 * Eliminates duplicated authentication check pattern across 21+ query files.
 *
 * Location: /src/hooks/utils/use-auth-check.ts
 */

'use client';

import { useMemo } from 'react';

import { useSession } from '@/lib/auth/client';

export type UseAuthCheckReturn = {
  /** Whether the user is authenticated */
  isAuthenticated: boolean;
  /** Whether the session is still loading */
  isPending: boolean;
  /** The user's ID if authenticated */
  userId: string | undefined;
};

/**
 * Hook for checking authentication status - SINGLE SOURCE OF TRUTH
 *
 * Replaces the duplicated pattern:
 * ```typescript
 * const { data: session, isPending } = useSession();
 * const isAuthenticated = !isPending && !!session?.user?.id;
 * ```
 *
 * @example
 * ```typescript
 * // Before (duplicated 21+ times):
 * const { data: session, isPending } = useSession();
 * const isAuthenticated = !isPending && !!session?.user?.id;
 * return useQuery({
 *   enabled: isAuthenticated,
 *   // ...
 * });
 *
 * // After:
 * const { isAuthenticated } = useAuthCheck();
 * return useQuery({
 *   enabled: isAuthenticated,
 *   // ...
 * });
 * ```
 */
export function useAuthCheck(): UseAuthCheckReturn {
  const { data: session, isPending } = useSession();

  return useMemo(() => ({
    isAuthenticated: !isPending && !!session?.user?.id,
    isPending,
    userId: session?.user?.id,
  }), [session?.user?.id, isPending]);
}
