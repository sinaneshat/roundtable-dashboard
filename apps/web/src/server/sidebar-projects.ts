import { createServerFn } from '@tanstack/react-start';

import { LIMITS } from '@/constants';
import type { ListProjectsResponse } from '@/services/api';
import { listProjectsService } from '@/services/api';

import type { ServerFnErrorResponse } from './schemas';

type GetSidebarProjectsResult = ListProjectsResponse | ServerFnErrorResponse;

export const getSidebarProjects = createServerFn({ method: 'GET' }).handler(
  async ({ context }): Promise<GetSidebarProjectsResult> => {
    return await listProjectsService(
      { query: { limit: LIMITS.INITIAL_PAGE } },
      { cookieHeader: context.cookieHeader },
    );
  },
);
