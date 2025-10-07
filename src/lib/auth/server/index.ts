import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { createAuthMiddleware } from 'better-auth/api';
import { nextCookies } from 'better-auth/next-js';
import { apiKey, magicLink } from 'better-auth/plugins';

import { db } from '@/db';
import * as authSchema from '@/db/tables/auth';
import { getBaseUrl } from '@/utils/helpers';

import { validateEmailDomain } from '../utils';

/**
 * Create Better Auth database adapter
 *
 * IMPORTANT: Better Auth is initialized at module load time (not per-request),
 * so we cannot use getCloudflareContext() here. Instead, we use the global `db`
 * Proxy which creates a new database instance on each property access.
 *
 * This pattern follows OpenNext.js best practices by ensuring no connection reuse
 * while working within Better Auth's initialization constraints.
 *
 * @see src/db/index.ts - The Proxy pattern implementation
 */
function createAuthAdapter() {
  const isNextDev = process.env.NODE_ENV === 'development' && !process.env.CLOUDFLARE_ENV;
  const isLocal = process.env.NEXT_PUBLIC_WEBAPP_ENV === 'local';

  // For local development: use the db proxy with transactions enabled
  // For Cloudflare Workers: use the db proxy with transactions disabled (D1 limitation)
  return drizzleAdapter(db, {
    provider: 'sqlite',
    schema: {
      ...authSchema,
      // Explicitly map apiKey table for Better Auth API key plugin
      // Better Auth expects "apikey" (lowercase, no underscore) in the schema object
      apikey: authSchema.apiKey,
    },
    // Disable transactions for Cloudflare Workers (D1 doesn't support BEGIN/COMMIT)
    // Keep enabled for local SQLite development
    transaction: isNextDev || isLocal,
  });
}

/**
 * Better Auth Configuration - Simple User Authentication
 * No organizations, just basic user auth
 */
export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL || `${getBaseUrl()}/api/auth`,
  database: createAuthAdapter(),

  // Email domain restriction for local and preview environments
  // Following official better-auth pattern: https://better-auth.com/docs/concepts/hooks
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      // Validate email domain using reusable utility
      // Handles: /sign-up/email, /sign-in/email, /sign-in/magic-link
      validateEmailDomain(ctx);
    }),
  },

  // Session configuration
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day
    cookieCache: {
      enabled: true,
      maxAge: 60 * 15, // 15 minutes cache
    },
  },

  // Security configuration
  advanced: {
    crossSubDomainCookies: {
      enabled: false,
    },
    useSecureCookies: true,
    database: {
      generateId: () => crypto.randomUUID(),
    },
  },

  // Trusted origins
  trustedOrigins: [
    getBaseUrl(),
    ...(process.env.NODE_ENV === 'development' ? ['http://localhost:3000'] : []),
  ],

  user: {
    changeEmail: {
      enabled: false, // Disabled for security
    },
  },

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },

  socialProviders: {
    google: {
      clientId: process.env.AUTH_GOOGLE_ID || '',
      clientSecret: process.env.AUTH_GOOGLE_SECRET || '',
      /**
       * IMPORTANT: For local/preview OAuth domain restriction:
       * Configure Google Cloud Console to restrict OAuth to @roundtable.now domain
       * 1. Go to Google Cloud Console > APIs & Services > Credentials
       * 2. Edit OAuth 2.0 Client ID
       * 3. Under "Authorized domains", add: roundtable.now
       * 4. This enforces domain restriction at the OAuth provider level
       *
       * This is the recommended approach per better-auth OAuth best practices
       */
    },
  },

  plugins: [
    nextCookies(),
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        const { emailService } = await import('@/lib/email/ses-service');
        await emailService.sendMagicLink(email, url);
      },
    }),
    apiKey({
      // CRITICAL: Sessions from API keys feature
      // By default, API keys can create sessions. Use disableSessionForAPIKeys: true to disable.
      // This allows getSession() to recognize and validate API keys automatically
      // @see https://www.better-auth.com/docs/plugins/api-key#sessions-from-api-keys
      // NOTE: In Better Auth v1.3.11, this is enabled by default

      // Custom prefix for API keys
      defaultPrefix: 'rpnd_', // roundtable prefix

      // Key configuration
      defaultKeyLength: 64,
      requireName: true,

      // Metadata support
      enableMetadata: true,

      // Expiration settings
      keyExpiration: {
        defaultExpiresIn: null, // No expiration by default
        disableCustomExpiresTime: false,
        minExpiresIn: 1, // Minimum 1 day
        maxExpiresIn: 365, // Maximum 1 year
      },

      // Rate limiting configuration
      rateLimit: {
        enabled: true,
        timeWindow: 1000 * 60 * 60 * 24, // 24 hours
        maxRequests: 1000, // 1000 requests per day by default
      },
    }),
  ],
});

// Auth types are exported from @/lib/auth/types for consistency
