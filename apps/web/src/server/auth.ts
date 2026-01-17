import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8787/api/v1';

// Better Auth base URL (API origin, not /api/v1)
function getAuthBaseUrl(): string {
  try {
    const url = new URL(API_URL);
    return url.origin;
  } catch {
    return API_URL.replace(/\/api\/v1$/, '');
  }
}

/**
 * Get the current session from the API.
 * This should be called during SSR to check auth status.
 * Forwards cookies from the original request to authenticate with the API.
 */
export const getSession = createServerFn({ method: 'GET' }).handler(
  async () => {
    try {
      // Get headers from the incoming request to forward cookies
      const headers = getRequestHeaders();
      const cookie = headers.cookie || headers.Cookie;

      const response = await fetch(`${API_URL}/auth/me`, {
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

/**
 * Sign out the current user.
 * Calls Better Auth's sign-out endpoint (at /api/auth, not /api/v1).
 */
export const signOut = createServerFn({ method: 'POST' }).handler(async () => {
  try {
    // Get headers from the incoming request to forward cookies
    const headers = getRequestHeaders();
    const cookie = headers.cookie || headers.Cookie;

    // Better Auth sign-out is at /api/auth/sign-out, not /api/v1/auth/sign-out
    const authBaseUrl = getAuthBaseUrl();
    const response = await fetch(`${authBaseUrl}/api/auth/sign-out`, {
      method: 'POST',
      headers: cookie ? { Cookie: cookie } : {},
    });

    return response.ok;
  } catch {
    return false;
  }
});
