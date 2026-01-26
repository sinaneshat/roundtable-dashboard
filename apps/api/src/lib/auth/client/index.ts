import { adminClient, apiKeyClient, magicLinkClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

import { getAppBaseUrl } from '@/lib/config/base-urls';

/**
 * Get base URL for auth client
 * Uses centralized config, with client-side origin fallback
 */
function getAuthBaseUrl(): string {
  // Client-side: use current origin (ensures cookies work correctly)
  if (typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.host}`;
  }
  // Server-side: use centralized config
  return getAppBaseUrl();
}

/**
 * Better Auth Client Configuration - Simple User Authentication
 * No organizations, just basic user auth
 */
export const authClient = createAuthClient({
  baseURL: getAuthBaseUrl(),

  plugins: [
    magicLinkClient(),
    apiKeyClient(),
    adminClient(),
  ],
});

// Export Better Auth hooks and methods directly
export const {
  deleteUser,
  getSession,

  // Authentication methods
  signIn,
  signOut,
  signUp,

  // User management
  updateUser,
  // Session management
  useSession,
} = authClient;

// Types are exported from @/lib/auth/types for consistency
