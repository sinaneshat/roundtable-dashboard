import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8787/api/v1';

/**
 * Fetch models from API during SSR.
 * Forwards cookies from the request to authenticate with the API.
 * Returns curated AI models with tier-based access control.
 */
export const getModels = createServerFn({ method: 'GET' }).handler(async () => {
  try {
    const headers = getRequestHeaders();
    const cookie = headers.cookie || headers.Cookie;

    const response = await fetch(`${API_URL}/models`, {
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
});
