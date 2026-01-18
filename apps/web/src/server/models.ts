import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';

import { listModelsService } from '@/services/api';

/**
 * Fetch AI models for SSR.
 * Protected endpoint - forwards cookies for authentication.
 * Returns FULL API response to match client queryFn (prevents hydration refetch).
 */
export const getModels = createServerFn({ method: 'GET' }).handler(
  async () => {
    try {
      const headers = getRequestHeaders();
      const cookie = headers.cookie || headers.Cookie;

      return await listModelsService({ cookieHeader: cookie });
    } catch {
      return { success: false, data: null };
    }
  },
);
