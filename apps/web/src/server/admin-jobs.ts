import { createServerFn } from '@tanstack/react-start';

import type { ListJobsResponse } from '@/services/api';
import { listJobsService } from '@/services/api';

import type { ServerFnErrorResponse } from './schemas';

type ListJobsResult = ListJobsResponse | ServerFnErrorResponse;

export const getAdminJobs = createServerFn({ method: 'GET' })
  .handler(async ({ context }): Promise<ListJobsResult> => {
    return await listJobsService({ query: {} }, { cookieHeader: context.cookieHeader });
  });
