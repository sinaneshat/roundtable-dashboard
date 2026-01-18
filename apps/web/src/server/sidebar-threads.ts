import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';

import { LIMITS } from '@/constants';
import { listSidebarThreadsService } from '@/services/api';

/**
 * Fetch sidebar threads for SSR.
 * This enables initial data hydration for the sidebar on protected routes.
 * Returns FULL API response to match client queryFn (prevents hydration refetch).
 */
export const getSidebarThreads = createServerFn({ method: 'GET' }).handler(
  async () => {
    try {
      const request = getRequest();
      const cookie = request.headers.get('cookie') || '';

      const result = await listSidebarThreadsService(
        { query: { limit: LIMITS.INITIAL_PAGE } },
        { cookieHeader: cookie },
      );

      return result;
    } catch {
      return { success: false, data: null };
    }
  },
);
