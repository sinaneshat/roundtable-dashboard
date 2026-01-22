import { apiKeyClient, magicLinkClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

import { BASE_URL_CONFIG, getApiBaseUrl, isPrerender, WebAppEnvs } from '@/lib/config/base-urls';

/**
 * Get base URL for auth client
 *
 * ARCHITECTURE (TanStack Start + Vite Proxy):
 * - Web app runs on port 5173 (Vite)
 * - API (including Better Auth) runs on port 8787 (Wrangler)
 * - In LOCAL development: Use relative URL through Vite proxy (same-origin for cookies)
 * - In production/preview: Use full API server URL
 * - During prerender/SSG: Use local env URL to avoid DNS failures
 *
 * The API base URL includes /api/v1, but Better Auth is at /api/auth,
 * so we extract just the origin from the API URL (or use empty string for proxy).
 */
export function getAuthBaseUrl(): string {
  // During prerender, use local env URL to avoid DNS failures for external domains
  // Static pages shouldn't make auth API calls anyway (handled by isStaticRoute check)
  if (isPrerender()) {
    const localApiUrl = BASE_URL_CONFIG[WebAppEnvs.LOCAL].api;
    return localApiUrl.replace('/api/v1', '');
  }

  const apiUrl = getApiBaseUrl();

  // Check if running in local development (client-side)
  // Use relative URL through Vite proxy to avoid cross-origin cookie issues
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      // Empty string = relative URL = goes through Vite proxy
      return '';
    }
  }

  // Production/preview: use full API origin
  try {
    const url = new URL(apiUrl);
    return url.origin;
  } catch {
    // Fallback for SSR or invalid URL
    return apiUrl.replace(/\/api\/v1$/, '');
  }
}

/**
 * Better Auth Client Configuration - Simple User Authentication
 * No organizations, just basic user auth
 *
 * IMPORTANT: credentials: 'include' is required for cross-origin cookie handling
 * (web on 5173, API on 8787 in local dev)
 */
export const authClient = createAuthClient({
  baseURL: getAuthBaseUrl(),

  // Required for cross-origin cookie handling (TanStack Start architecture)
  fetchOptions: {
    credentials: 'include',
  },

  plugins: [
    magicLinkClient(),
    apiKeyClient(),
  ],
});

// Export Better Auth hooks and methods directly
export const {
  // Session management
  useSession,
  getSession,

  // Authentication methods
  signIn,
  signUp,
  signOut,

  // User management
  updateUser,
  deleteUser,
} = authClient;

// Types are exported from @/lib/auth/types for consistency
