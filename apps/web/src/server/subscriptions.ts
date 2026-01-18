import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';

import { getSubscriptionsService } from '@/services/api';

/**
 * Fetch user subscriptions for SSR.
 * Protected endpoint - forwards cookies for authentication.
 * Returns FULL API response to match client queryFn (prevents hydration refetch).
 */
export const getSubscriptions = createServerFn({ method: 'GET' }).handler(
  async () => {
    try {
      const request = getRequest();
      const cookie = request.headers.get('cookie') || '';

      return await getSubscriptionsService({ cookieHeader: cookie });
    } catch {
      return { success: false, data: null };
    }
  },
);
