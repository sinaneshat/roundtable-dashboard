import { createServerFn } from '@tanstack/react-start';

import type { GetUsageStatsResponse } from '@/services/api';
import { getUserUsageStatsService } from '@/services/api';

import type { ServerFnErrorResponse } from './schemas';

type GetUsageStatsResult = GetUsageStatsResponse | ServerFnErrorResponse;

export const getUsageStats = createServerFn({ method: 'GET' }).handler(
  async ({ context }): Promise<GetUsageStatsResult> => {
    return await getUserUsageStatsService({ cookieHeader: context.cookieHeader });
  },
);
