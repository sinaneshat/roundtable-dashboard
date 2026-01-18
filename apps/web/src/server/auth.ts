/**
 * Server-side Auth Functions for TanStack Start
 *
 * Uses getRequest() to access the full Request object with headers/cookies.
 * This is the correct approach for TanStack Start server functions.
 *
 * For client-side auth, use useSession/getSession from @/lib/auth/client
 *
 * @see https://www.better-auth.com/docs/integrations/tanstack
 */

import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';

import { getSession as clientGetSession, signOut as clientSignOut } from '@/lib/auth/client';
import type { SessionData } from '@/lib/auth/types';

/**
 * Get the current session from Better Auth.
 * Server-side function for SSR auth checks.
 * Uses getRequest() to access the full Request object with cookies.
 */
export const getSession = createServerFn({ method: 'GET' }).handler(
  async (): Promise<SessionData | null> => {
    try {
      const request = getRequest();
      const cookieHeader = request.headers.get('cookie') || '';

      // Better Auth pattern: pass headers through fetchOptions
      // @see https://www.better-auth.com/docs/integrations/tanstack
      const result = await clientGetSession({
        fetchOptions: {
          headers: {
            cookie: cookieHeader,
          },
        },
      });

      return result.data ?? null;
    } catch (error) {
      if (import.meta.env.MODE === 'development') {
        console.error('[Auth] getSession error:', error);
      }
      return null;
    }
  },
);

/**
 * Sign out the current user.
 * Uses getRequest() to access cookies for signout.
 */
export const signOut = createServerFn({ method: 'POST' }).handler(async () => {
  try {
    const request = getRequest();
    const cookieHeader = request.headers.get('cookie') || '';

    await clientSignOut({
      fetchOptions: {
        headers: {
          cookie: cookieHeader,
        },
      },
    });

    return true;
  } catch {
    return false;
  }
});
