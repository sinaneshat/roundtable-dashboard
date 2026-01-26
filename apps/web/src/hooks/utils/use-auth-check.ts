/**
 * Shared Authentication Check Hook
 *
 * SINGLE SOURCE OF TRUTH for checking authentication status in query hooks.
 * Eliminates duplicated authentication check pattern across 21+ query files.
 *
 * Location: /src/hooks/utils/use-auth-check.ts
 */

import { useNavigate } from '@tanstack/react-router';
import { useCallback, useMemo } from 'react';
import { z } from 'zod';

import { getSession, signOut, useSession } from '@/lib/auth/client';

/**
 * Schema for validating error objects with statusCode
 * Used for type-safe 401 error detection
 */
const ErrorWithStatusCodeSchema = z.object({
  statusCode: z.number(),
});

export type UseAuthCheckReturn = {
  /** Whether the user is authenticated */
  isAuthenticated: boolean;
  /** Whether the session is still loading */
  isPending: boolean;
  /** The user's ID if authenticated */
  userId: string | undefined;
  /** Handle 401 errors by verifying session and signing out if invalid */
  handleAuthError: (error: unknown) => Promise<void>;
};

/**
 * Check if an error is a 401 Unauthorized response
 * Supports Hono client DetailedError format
 * ✅ TYPE-SAFE: Uses Zod validation instead of type casting
 */
function is401Error(error: unknown): boolean {
  // Validate error object with Zod schema
  const statusCodeResult = ErrorWithStatusCodeSchema.safeParse(error);
  if (statusCodeResult.success) {
    return statusCodeResult.data.statusCode === 401;
  }
  // Fallback: check Error message format
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return msg.startsWith('401 ') || msg === 'unauthorized';
  }
  return false;
}

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
  const navigate = useNavigate();

  /**
   * Handle 401 authentication errors
   *
   * When an API returns 401, this verifies if the session is truly invalid
   * by fetching fresh session data. If invalid, signs out and redirects.
   */
  const handleAuthError = useCallback(async (error: unknown) => {
    if (!is401Error(error)) {
      return;
    }

    // Verify session is actually invalid by fetching fresh data
    const freshSession = await getSession();

    if (!freshSession?.data?.user) {
      // Session is truly invalid - sign out and redirect
      await signOut({
        fetchOptions: {
          onSuccess: () => {
            navigate({ to: '/auth/sign-in' });
          },
        },
      });
    }
  }, [navigate]);

  // ✅ SSR HYDRATION: On server, assume authenticated since beforeLoad already validated session
  // Protected routes can't be accessed without valid auth (beforeLoad redirects to sign-in)
  // On client, use normal auth check with session data
  const isServer = typeof window === 'undefined';

  return useMemo(() => ({
    handleAuthError,
    // Server: always true (beforeLoad already validated), Client: check session
    isAuthenticated: isServer || (!isPending && !!session?.user?.id),
    isPending: isServer ? false : isPending,
    userId: session?.user?.id,
  }), [session?.user?.id, isPending, handleAuthError, isServer]);
}
