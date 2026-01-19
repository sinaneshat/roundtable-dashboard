import { createServerFn } from '@tanstack/react-start';

import { LIMITS } from '@/constants';
import type { ListSidebarThreadsResponse } from '@/services/api';
import { listSidebarThreadsService } from '@/services/api';
import { cookieMiddleware } from '@/start';

type ServerFnErrorResponse = { success: false; data: null };
type GetSidebarThreadsResult = ListSidebarThreadsResponse | ServerFnErrorResponse;

export const getSidebarThreads = createServerFn({ method: 'GET' })
  .middleware([cookieMiddleware])
  .handler(async ({ context }): Promise<GetSidebarThreadsResult> => {
    try {
      return await listSidebarThreadsService(
        { query: { limit: LIMITS.INITIAL_PAGE } },
        { cookieHeader: context.cookieHeader },
      );
    } catch {
      return { success: false as const, data: null };
    }
  });
