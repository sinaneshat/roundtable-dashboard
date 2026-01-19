import { createServerFn } from '@tanstack/react-start';

import { getUserUsageStatsService } from '@/services/api';
import { cookieMiddleware } from '@/start';

export const getUsageStats = createServerFn({ method: 'GET' })
  .middleware([cookieMiddleware])
  .handler(async ({ context }) => {
    try {
      return await getUserUsageStatsService({ cookieHeader: context.cookieHeader });
    } catch {
      return { success: false, data: null };
    }
  });
