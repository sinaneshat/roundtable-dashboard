import { createServerFn } from '@tanstack/react-start';

import { getSession as clientGetSession, signOut as clientSignOut } from '@/lib/auth/client';
import type { SessionData } from '@/lib/auth/types';
import { cookieMiddleware } from '@/start';

export const getSession = createServerFn({ method: 'GET' })
  .middleware([cookieMiddleware])
  .handler(async ({ context }): Promise<SessionData | null> => {
    const result = await clientGetSession({
      fetchOptions: {
        headers: {
          cookie: context.cookieHeader,
        },
      },
    });

    return result.data ?? null;
  });

export const signOut = createServerFn({ method: 'POST' })
  .middleware([cookieMiddleware])
  .handler(async ({ context }) => {
    await clientSignOut({
      fetchOptions: {
        headers: {
          cookie: context.cookieHeader,
        },
      },
    });

    return true;
  });
