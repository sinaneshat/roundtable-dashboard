/**
 * Authentication Utilities
 *
 * Reusable helper functions for authentication and email domain validation
 */

import { BETTER_AUTH_SESSION_COOKIE_NAME } from '@roundtable/shared/enums';
import { APIError } from 'better-auth/api';
import { env as workersEnv } from 'cloudflare:workers';
import { z } from 'zod';

import { isWebappEnv, WEBAPP_ENVS } from '@/lib/config/base-urls';

// ============================================================================
// SCHEMAS
// ============================================================================

/**
 * Schema for auth request body with optional email field
 * Used by Better Auth middleware for email-based operations
 */
const AuthRequestBodySchema = z.object({
  email: z.string().email().optional(),
}).passthrough(); // Allow additional Better Auth fields

type AuthRequestBody = z.infer<typeof AuthRequestBodySchema>;

/**
 * Better-auth middleware context type
 * Represents the context passed to auth hooks
 */
type AuthContext = {
  path: string;
  body?: AuthRequestBody;
};

/**
 * Authentication paths that require email domain validation
 * Following better-auth route patterns
 */
const PROTECTED_AUTH_PATHS: readonly string[] = [
  '/sign-up/email', // Email/password registration
  '/sign-in/email', // Email/password sign-in (may auto-register)
  '/sign-in/magic-link', // Magic link authentication (may auto-register)
];

/**
 * Specific email addresses allowed in local/preview environments
 * These are exceptions to the domain restriction
 * @see e2e/fixtures/test-users.ts for E2E test user definitions
 */
const ALLOWED_EMAIL_EXCEPTIONS: readonly string[] = [
  // E2E test users - required for Playwright tests
  'e2e-free-test@roundtable.now',
  'e2e-pro-test@roundtable.now',
  'e2e-admin-test@roundtable.now',
];

/**
 * Configuration for email domain restrictions
 */
export const EMAIL_DOMAIN_CONFIG = {
  /**
   * Allowed email domain for local and preview environments
   */
  ALLOWED_DOMAIN: '@deadpixel.ai',

  /**
   * Specific email addresses allowed as exceptions
   */
  ALLOWED_EXCEPTIONS: ALLOWED_EMAIL_EXCEPTIONS,

  /**
   * Error message for domain restriction violations
   */
  ERROR_MESSAGE: 'Access restricted: Only @deadpixel.ai email addresses are allowed in preview environments',

  /**
   * Authentication paths that require email domain validation
   */
  PROTECTED_PATHS: PROTECTED_AUTH_PATHS,
} as const;

export function isRestrictedEnvironment(): boolean {
  try {
    if (workersEnv.WEBAPP_ENV && isWebappEnv(workersEnv.WEBAPP_ENV)) {
      // Only restrict PREVIEW - LOCAL/localhost should allow any email
      return workersEnv.WEBAPP_ENV === WEBAPP_ENVS.PREVIEW;
    }
  } catch {
    // Workers env not available
  }

  const processEnv = process.env.WEBAPP_ENV;
  if (processEnv && isWebappEnv(processEnv)) {
    // Only restrict PREVIEW - LOCAL/localhost should allow any email
    return processEnv === WEBAPP_ENVS.PREVIEW;
  }

  // Default: no restriction for local development
  return false;
}

/**
 * Check if email is in the exceptions list
 *
 * @param {string} email - The email address to check
 * @returns {boolean} True if email is in exceptions list
 */
export function isExceptionEmail(email: string): boolean {
  return EMAIL_DOMAIN_CONFIG.ALLOWED_EXCEPTIONS.includes(email.toLowerCase());
}

/**
 * Validate if an email address matches the allowed domain or is an exception
 *
 * @param {string} email - The email address to validate
 * @returns {boolean} True if email ends with allowed domain or is in exceptions list
 */
export function isAllowedEmailDomain(email: string): boolean {
  // Check if email matches the allowed domain
  if (email.endsWith(EMAIL_DOMAIN_CONFIG.ALLOWED_DOMAIN)) {
    return true;
  }

  // Check if email is in the exceptions list
  return isExceptionEmail(email);
}

/**
 * Check if the request path requires email domain validation
 *
 * @param {string} path - The request path from better-auth context
 * @returns {boolean} True if path requires validation
 */
export function isProtectedAuthPath(path: string): boolean {
  return EMAIL_DOMAIN_CONFIG.PROTECTED_PATHS.includes(path);
}

/**
 * Validate email domain for protected auth paths in restricted environments
 * Throws APIError if validation fails
 *
 * Following official better-auth pattern:
 * @see https://better-auth.com/docs/concepts/hooks
 *
 * @param {AuthContext} ctx - Better-auth context object
 * @throws {APIError} BAD_REQUEST if email domain is not allowed
 */
export function validateEmailDomain(ctx: AuthContext): void {
  // Skip validation in production environment
  if (!isRestrictedEnvironment()) {
    return;
  }

  // Only validate protected auth paths
  if (!isProtectedAuthPath(ctx.path)) {
    return;
  }

  // Validate and extract email from request body using Zod
  const bodyParse = AuthRequestBodySchema.safeParse(ctx.body);
  if (!bodyParse.success || !bodyParse.data.email) {
    return; // Let better-auth handle missing/invalid email
  }

  // Validate email domain
  if (!isAllowedEmailDomain(bodyParse.data.email)) {
    throw new APIError('BAD_REQUEST', {
      message: EMAIL_DOMAIN_CONFIG.ERROR_MESSAGE,
    });
  }
}

/**
 * Extract session token from cookie header
 * Used for queue-based operations that need to authenticate with Better Auth
 *
 * @param {string | undefined} cookieHeader - The Cookie header string
 * @returns {string} The session token value, or empty string if not found
 */
export function extractSessionToken(cookieHeader: string | undefined): string {
  if (!cookieHeader) {
    return '';
  }

  const sessionTokenMatch = cookieHeader.match(new RegExp(`${BETTER_AUTH_SESSION_COOKIE_NAME.replace(/\./g, '\\.')}=([^;]+)`));
  return sessionTokenMatch?.[1] || '';
}
