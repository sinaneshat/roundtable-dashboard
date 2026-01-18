import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';

import { getUserUsageStatsService } from '@/services/api';

/**
 * Fetch usage stats for SSR.
 * Protected endpoint - forwards cookies for authentication.
 * Returns FULL API response to match client queryFn (prevents hydration refetch).
 */
export const getUsageStats = createServerFn({ method: 'GET' }).handler(
  async () => {
    try {
      const request = getRequest();
      const cookie = request.headers.get('cookie') || '';

      return await getUserUsageStatsService({ cookieHeader: cookie });
    } catch {
      return { success: false, data: null };
    }
  },
);
