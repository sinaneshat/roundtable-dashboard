import { createServerFn } from '@tanstack/react-start';

import { LIMITS } from '@/constants';
import type { ListSidebarThreadsResponse } from '@/services/api';
import { listSidebarThreadsService } from '@/services/api';

import type { ServerFnErrorResponse } from './schemas';

type GetSidebarThreadsResult = ListSidebarThreadsResponse | ServerFnErrorResponse;

export const getSidebarThreads = createServerFn({ method: 'GET' }).handler(
  async ({ context }): Promise<GetSidebarThreadsResult> => {
    return await listSidebarThreadsService(
      { query: { limit: LIMITS.INITIAL_PAGE } },
      { cookieHeader: context.cookieHeader },
    );
  },
);
