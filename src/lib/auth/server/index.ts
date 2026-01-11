import 'server-only';

import { getCloudflareContext } from '@opennextjs/cloudflare';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { createAuthMiddleware } from 'better-auth/api';
import { nextCookies } from 'better-auth/next-js';
import { apiKey, magicLink } from 'better-auth/plugins';

import { db } from '@/db';
import * as authSchema from '@/db/tables/auth';
import { getAppBaseUrl } from '@/lib/config/base-urls';
import { isLegacyPaidUser } from '@/lib/config/legacy-users';

import { isAllowedEmailDomain, isRestrictedEnvironment, validateEmailDomain } from '../utils';

/**
 * Get auth secret from available sources.
 *
 * ⚠️ CRITICAL: This function is called during lazy auth initialization.
 * At that point, getCloudflareContext() should be available (inside a request).
 *
 * Priority:
 * 1. Build phase placeholder (Next.js build - secret not needed)
 * 2. Cloudflare runtime env (getCloudflareContext) - production/preview
 * 3. process.env - local dev (.env files)
 *
 * @throws Error if no secret is available at runtime (prevents insecure fallback)
 */
function getAuthSecret(): string {
  // 0. During Next.js build phase, return placeholder (secret only needed at runtime)
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    return 'build-time-placeholder-not-used-at-runtime';
  }

  // 1. Try Cloudflare runtime context (production/preview)
  try {
    const { env } = getCloudflareContext();
    if (env.BETTER_AUTH_SECRET) {
      return env.BETTER_AUTH_SECRET as string;
    }
  } catch {
    // Context not available - continue to fallback
  }

  // 2. Fall back to process.env (local dev .env)
  if (process.env.BETTER_AUTH_SECRET) {
    return process.env.BETTER_AUTH_SECRET;
  }

  // 3. NO FALLBACK - throw error to prevent insecure operation
  // This is better than silently using a placeholder that causes 401 errors
  throw new Error(
    'BETTER_AUTH_SECRET not found. Set it via wrangler secret (production) or .env (local dev).',
  );
}

/**
 * Get Google OAuth credentials from available sources.
 * Priority: Cloudflare runtime → process.env fallback → empty string
 */
function getGoogleOAuthCredentials(): { clientId: string; clientSecret: string } {
  // 1. Try Cloudflare runtime context
  try {
    const { env } = getCloudflareContext();
    if (env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET) {
      return {
        clientId: env.AUTH_GOOGLE_ID as string,
        clientSecret: env.AUTH_GOOGLE_SECRET as string,
      };
    }
  } catch {
    // Context not available - continue to fallback
  }

  // 2. Fall back to process.env
  return {
    clientId: process.env.AUTH_GOOGLE_ID || '',
    clientSecret: process.env.AUTH_GOOGLE_SECRET || '',
  };
}

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
    // Disable transactions entirely - D1 doesn't support traditional transactions
    // and Better Auth's transaction callback pattern conflicts with async operations
    // Session operations are atomic at the row level which is sufficient
    transaction: false,
  });
}

/**
 * Create Better Auth instance with runtime configuration.
 *
 * This function creates the auth instance when called, allowing
 * access to Cloudflare context for secrets.
 */
function createAuth() {
  return betterAuth({
    secret: getAuthSecret(),
    baseURL: process.env.BETTER_AUTH_URL || `${getAppBaseUrl()}/api/auth`,
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

    // Database hooks to validate ALL user creation and session creation
    // This catches Google OAuth and any other social provider signups/signins
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            // Skip validation in production - only restrict preview/local
            if (!isRestrictedEnvironment()) {
              return;
            }

            // Validate email domain for all user creation methods
            if (user.email && !isAllowedEmailDomain(user.email)) {
              throw new Error('Access restricted: Only @deadpixel.ai email addresses are allowed in preview environments');
            }
          },
          after: async (user) => {
            // Check if user is a legacy paid user and activate Pro plan
            if (user.email && isLegacyPaidUser(user.email)) {
              try {
                // Dynamically import to avoid circular dependencies
                const { activateLegacyUserProPlan } = await import('@/api/services/billing/credit.service');
                await activateLegacyUserProPlan(user.id, user.email);
                console.error(`[BetterAuth] Activated legacy user Pro plan for ${user.email}`);
              } catch (error) {
                // Log error but don't fail signup - user can still use free tier
                console.error(`[BetterAuth] Failed to activate legacy user Pro plan for ${user.email}:`, error);
              }
            }
          },
        },
      },
      session: {
        create: {
          before: async (session) => {
            // Skip validation in production - only restrict preview/local
            if (!isRestrictedEnvironment()) {
              return;
            }

            // Fetch user to check email domain for existing users signing in
            const user = await db.query.user.findFirst({
              where: (u, { eq }) => eq(u.id, session.userId),
            });

            if (user?.email && !isAllowedEmailDomain(user.email)) {
              throw new Error('Access restricted: Only @deadpixel.ai email addresses are allowed in preview environments');
            }
          },
        },
      },
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
      // Use secure cookies only in production (HTTPS)
      // Localhost/development requires non-secure cookies for HTTP
      useSecureCookies: process.env.NODE_ENV === 'production',
      database: {
        generateId: () => crypto.randomUUID(),
      },
    },

    // Trusted origins
    trustedOrigins: [
      getAppBaseUrl(),
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
        clientId: getGoogleOAuthCredentials().clientId,
        clientSecret: getGoogleOAuthCredentials().clientSecret,
      },
    },

    plugins: [
      nextCookies(),
      magicLink({
        sendMagicLink: async ({ email, url }) => {
          try {
            const { emailService } = await import('@/lib/email/ses-service');
            await emailService.sendMagicLink(email, url);
          } catch (error) {
            console.error('Failed to send magic link email:', error);
            // Better Auth will show this error to the user
            const errorMessage = error instanceof Error ? error.message : 'Failed to send magic link email';
            throw new Error(`Unable to send login email: ${errorMessage}`);
          }
        },
      }),
      apiKey({
        // API Key Headers - specify which headers to check for API keys
        // Default is 'x-api-key', but can specify multiple headers
        // @see https://www.better-auth.com/docs/plugins/api-key#configure-api-key-headers
        apiKeyHeaders: 'x-api-key', // Can also be array: ['x-api-key', 'authorization']

        // Custom prefix for API keys (e.g., rpnd_abc123...)
        defaultPrefix: 'rpnd_',

        // Key configuration
        defaultKeyLength: 64,
        requireName: true,

        // Metadata support - allows storing custom data with API keys
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

        // Sessions from API keys - enabled by default in Better Auth
        // When a valid API key is found in the specified headers, Better Auth automatically
        // creates a mock session for the user. This allows endpoints using getSession() to
        // work seamlessly with both session cookies and API keys.
        // To disable this behavior, set: disableSessionForAPIKeys: true
        // @see https://www.better-auth.com/docs/plugins/api-key#sessions-from-api-keys
      }),
    ],
  });
}

// Lazy auth instance - created on first access
let _authInstance: ReturnType<typeof createAuth> | null = null;

/**
 * Get the auth instance (lazy initialization).
 *
 * ⚠️ IMPORTANT: This uses lazy initialization to ensure getCloudflareContext()
 * is available when the auth secret is read. The first call to this getter
 * should happen inside a request handler, not at module load time.
 *
 * For the Next.js auth route handler, we use createAuth() directly since
 * it's invoked per-request.
 */
function getAuth() {
  if (!_authInstance) {
    _authInstance = createAuth();
  }
  return _authInstance;
}

/**
 * Auth instance getter - use this for all auth operations.
 *
 * This is a Proxy that lazily initializes the auth instance on first property access.
 * This ensures Cloudflare context is available when reading secrets.
 */
export const auth = new Proxy({} as ReturnType<typeof createAuth>, {
  get(_target, prop) {
    return getAuth()[prop as keyof ReturnType<typeof createAuth>];
  },
});

/**
 * Export createAuth for use cases that need fresh auth per request
 * (e.g., Next.js auth route handler)
 */
export { createAuth };
