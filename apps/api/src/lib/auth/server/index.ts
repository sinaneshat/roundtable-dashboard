import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { createAuthMiddleware } from 'better-auth/api';
import { apiKey, magicLink } from 'better-auth/plugins';
import { env as workersEnv } from 'cloudflare:workers';

import { db } from '@/db';
import * as authSchema from '@/db/tables/auth';
import { getApiServerOrigin, getAppBaseUrl } from '@/lib/config/base-urls';

import { EMAIL_DOMAIN_CONFIG, isAllowedEmailDomain, isRestrictedEnvironment, validateEmailDomain } from '../utils';

/**
 * Check if running in production mode (NODE_ENV === 'production')
 * Priority: Cloudflare Workers env > process.env
 */
function isProductionMode(): boolean {
  try {
    if (workersEnv.NODE_ENV) {
      return workersEnv.NODE_ENV === 'production';
    }
  } catch {
    // Workers env not available
  }
  return process.env.NODE_ENV === 'production';
}

/**
 * Check if running in development mode (NODE_ENV === 'development')
 * Priority: Cloudflare Workers env > process.env
 */
function isDevelopmentMode(): boolean {
  try {
    if (workersEnv.NODE_ENV) {
      return workersEnv.NODE_ENV === 'development';
    }
  } catch {
    // Workers env not available
  }
  return process.env.NODE_ENV === 'development';
}

/**
 * Get auth secret from Cloudflare Workers bindings or process.env.
 *
 * Priority:
 * 1. Cloudflare Workers env - production/preview
 * 2. process.env - local dev (.env files)
 *
 * @throws Error if no secret is available at runtime (prevents insecure fallback)
 */
function getAuthSecret(): string {
  // 1. Try Cloudflare Workers bindings
  try {
    if (workersEnv.BETTER_AUTH_SECRET) {
      return workersEnv.BETTER_AUTH_SECRET;
    }
  } catch {
    // Workers env not available - continue to fallback
  }

  // 2. Fall back to process.env (local dev .env)
  if (process.env.BETTER_AUTH_SECRET) {
    return process.env.BETTER_AUTH_SECRET;
  }

  // 3. NO FALLBACK - throw error to prevent insecure operation
  throw new Error(
    'BETTER_AUTH_SECRET not found. Set it via wrangler secret (production) or .env (local dev).',
  );
}

/**
 * Get Google OAuth credentials from Cloudflare Workers bindings or process.env.
 */
function getGoogleOAuthCredentials(): { clientId: string; clientSecret: string } {
  // 1. Try Cloudflare Workers bindings
  try {
    if (workersEnv.AUTH_GOOGLE_ID && workersEnv.AUTH_GOOGLE_SECRET) {
      return {
        clientId: workersEnv.AUTH_GOOGLE_ID,
        clientSecret: workersEnv.AUTH_GOOGLE_SECRET,
      };
    }
  } catch {
    // Workers env not available - continue to fallback
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
 * This pattern ensures no connection reuse while working within Better Auth's
 * initialization constraints.
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
 * Get Better Auth base URL from Cloudflare Workers env or process.env.
 * Priority: Cloudflare Workers env > process.env > fallback to API origin
 */
function getBetterAuthUrl(): string {
  // 1. Try Cloudflare Workers bindings (production/preview)
  try {
    if (workersEnv.BETTER_AUTH_URL) {
      return workersEnv.BETTER_AUTH_URL;
    }
  } catch {
    // Workers env not available - continue to fallback
  }

  // 2. Fall back to process.env (local dev)
  if (process.env.BETTER_AUTH_URL) {
    return process.env.BETTER_AUTH_URL;
  }

  // 3. Derive from API server origin
  return getApiServerOrigin();
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
    baseURL: getBetterAuthUrl(),
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
              throw new Error(EMAIL_DOMAIN_CONFIG.ERROR_MESSAGE);
            }
          },
        },
      },
      // Session validation removed for performance
      // Email domain is already validated at user creation time
      // No need to re-validate on every session - users can't change their email
    },

    // Session configuration
    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7 days
      updateAge: 60 * 60 * 24, // 1 day
      cookieCache: {
        enabled: true,
        maxAge: 60 * 15, // 15 minutes cache
        strategy: 'compact', // Base64url + HMAC-SHA256 - smallest, best perf
        refreshCache: true, // Stateless refresh without DB lookup
      },
    },

    // Security configuration
    advanced: {
      crossSubDomainCookies: {
        enabled: false,
      },
      // Use secure cookies only in production (HTTPS)
      // Localhost/development requires non-secure cookies for HTTP
      useSecureCookies: isProductionMode(),
      // Cookie configuration for cross-origin (TanStack Start: web on 5173, API on 8787)
      // SameSite=Lax for OAuth redirects (works without Secure flag)
      // In production with HTTPS, we use 'none' for cross-origin requests
      defaultCookieAttributes: {
        sameSite: isProductionMode() ? 'none' : 'lax',
        secure: isProductionMode(),
        path: '/', // Ensure cookies are sent for all paths
      },
      database: {
        generateId: () => crypto.randomUUID(),
      },
    },

    // Trusted origins (TanStack Start: web on 5173, API on 8787)
    trustedOrigins: [
      getAppBaseUrl(),
      ...(isDevelopmentMode()
        ? [
            'http://localhost:5173',
            'http://localhost:5174',
            'http://localhost:5175',
            'http://localhost:5176',
            'http://localhost:5177',
            'http://127.0.0.1:5173',
            'http://127.0.0.1:5174',
            'http://127.0.0.1:5175',
            'http://127.0.0.1:5176',
            'http://127.0.0.1:5177',
          ]
        : []),
    ],

    user: {
      changeEmail: {
        enabled: false, // Disabled for security
      },
      deleteUser: {
        enabled: true,
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
 * For per-request auth handling, we use createAuth() directly since
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
 * (e.g., Hono auth route handler)
 */
export { createAuth };
