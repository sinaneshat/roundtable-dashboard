import { createServerFn } from '@tanstack/react-start';

import type { GetUsageStatsResponse } from '@/services/api';
import { getUserUsageStatsService } from '@/services/api';
import { cookieMiddleware } from '@/start';

type ServerFnErrorResponse = { success: false; data: null };
type GetUsageStatsResult = GetUsageStatsResponse | ServerFnErrorResponse;

export const getUsageStats = createServerFn({ method: 'GET' })
  .middleware([cookieMiddleware])
  .handler(async ({ context }): Promise<GetUsageStatsResult> => {
    return await getUserUsageStatsService({ cookieHeader: context.cookieHeader });
  });
