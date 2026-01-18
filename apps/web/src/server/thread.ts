import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';

import { getThreadBySlugService } from '@/services/api';

/**
 * Fetch thread by slug for SSR.
 * Protected endpoint - forwards cookies for authentication.
 * Returns FULL API response to match client queryFn (prevents hydration refetch).
 */
export const getThreadBySlug = createServerFn({ method: 'GET' })
  .inputValidator((slug: string) => slug)
  .handler(async ({ data: slug }) => {
    try {
      const request = getRequest();
      const cookie = request.headers.get('cookie') || '';

      return await getThreadBySlugService(
        { param: { slug } },
        { cookieHeader: cookie },
      );
    } catch {
      return { success: false, data: null };
    }
  });
