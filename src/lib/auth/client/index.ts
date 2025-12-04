import { apiKeyClient, magicLinkClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

/**
 * Better Auth Client Configuration - Simple User Authentication
 * No organizations, just basic user auth
 */
export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL
    || (typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.host}` : 'http://localhost:3000'),

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

  // Password management
  requestPasswordReset,
  resetPassword,

  // Email verification
  sendVerificationEmail,
  verifyEmail,
} = authClient;

// Types are exported from @/lib/auth/types for consistency
