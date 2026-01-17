import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';

import { LIMITS } from '@/constants';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8787/api/v1';

/**
 * Fetch sidebar threads for SSR.
 * This enables initial data hydration for the sidebar on protected routes.
 * Forwards cookies from the incoming request to authenticate with the API.
 */
export const getSidebarThreads = createServerFn({ method: 'GET' }).handler(
  async () => {
    try {
      // Get headers from the incoming request to forward cookies for auth
      const headers = getRequestHeaders();
      const cookie = headers.cookie || headers.Cookie;

      // Fetch initial page of sidebar threads
      const params = new URLSearchParams({
        limit: LIMITS.INITIAL_PAGE.toString(),
      });

      const response = await fetch(
        `${API_URL}/chat/threads/sidebar?${params.toString()}`,
        {
          headers: cookie ? { Cookie: cookie } : {},
        },
      );

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      return data.success ? data.data : null;
    } catch {
      return null;
    }
  },
);
