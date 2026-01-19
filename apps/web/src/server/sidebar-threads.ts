import { createServerFn } from '@tanstack/react-start';

import { LIMITS } from '@/constants';
import { listSidebarThreadsService } from '@/services/api';
import { cookieMiddleware } from '@/start';

export const getSidebarThreads = createServerFn({ method: 'GET' })
  .middleware([cookieMiddleware])
  .handler(async ({ context }) => {
    try {
      return await listSidebarThreadsService(
        { query: { limit: LIMITS.INITIAL_PAGE } },
        { cookieHeader: context.cookieHeader },
      );
    } catch {
      return { success: false, data: null };
    }
  });
