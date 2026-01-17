import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8787/api/v1';

/**
 * Get user subscriptions from the API.
 * This should be called during SSR to prefetch subscription data.
 * Forwards cookies from the original request to authenticate with the API.
 */
export const getSubscriptions = createServerFn({ method: 'GET' }).handler(
  async () => {
    try {
      const headers = getRequestHeaders();
      const cookie = headers.cookie || headers.Cookie;

      const response = await fetch(`${API_URL}/billing/subscriptions`, {
        headers: cookie ? { Cookie: cookie } : {},
      });

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
