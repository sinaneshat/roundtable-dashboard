import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';

import { getSubscriptionsService } from '@/services/api';

/**
 * Fetch user subscriptions for SSR.
 * Protected endpoint - forwards cookies for authentication.
 * Returns FULL API response to match client queryFn (prevents hydration refetch).
 */
export const getSubscriptions = createServerFn({ method: 'GET' }).handler(
  async () => {
    try {
      const headers = getRequestHeaders();
      const cookie = headers.cookie || headers.Cookie;

      return await getSubscriptionsService({ cookieHeader: cookie });
    } catch {
      return { success: false, data: null };
    }
  },
);
