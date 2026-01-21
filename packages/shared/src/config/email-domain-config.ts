/**
 * Email Domain Configuration
 *
 * ✅ SINGLE SOURCE OF TRUTH: Email domain restrictions for local/preview environments
 * ✅ CLIENT-SAFE: No server-only dependencies
 *
 * Configuration for email domain restrictions in non-production environments.
 */

/**
 * Authentication paths that require email domain validation
 * Following better-auth route patterns
 */
const PROTECTED_AUTH_PATHS: readonly string[] = [
  '/sign-up/email',
  '/sign-in/email',
  '/sign-in/magic-link',
];

/**
 * Specific email addresses allowed in local/preview environments
 * These are exceptions to the domain restriction
 */
const ALLOWED_EMAIL_EXCEPTIONS: readonly string[] = [
  'e2e-free-test@roundtable.now',
  'e2e-pro-test@roundtable.now',
  'e2e-admin-test@roundtable.now',
];

/**
 * Configuration for email domain restrictions
 */
export const EMAIL_DOMAIN_CONFIG = {
  ALLOWED_DOMAIN: '@deadpixel.ai',
  ALLOWED_EXCEPTIONS: ALLOWED_EMAIL_EXCEPTIONS,
  ERROR_MESSAGE: 'Access restricted: Only @deadpixel.ai email addresses are allowed in preview environments',
  PROTECTED_PATHS: PROTECTED_AUTH_PATHS,
} as const;
