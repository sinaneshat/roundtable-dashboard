/**
 * Authentication Utilities
 *
 * Reusable helper functions for authentication and email domain validation
 */

import { getCloudflareContext } from '@opennextjs/cloudflare';
import { APIError } from 'better-auth/api';

import { isWebappEnv, WEBAPP_ENVS } from '@/lib/config/base-urls';

/**
 * Better-auth middleware context type (inferred from createAuthMiddleware)
 */
type AuthContext = {
  path: string;
  body?: Record<string, unknown>;
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
 * These are exceptions to the domain restriction (currently empty - only @deadpixel.ai allowed)
 */
const ALLOWED_EMAIL_EXCEPTIONS: readonly string[] = [];

/**
 * Configuration for email domain restrictions
 */
const EMAIL_DOMAIN_CONFIG = {
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
    const { env } = getCloudflareContext();
    const cfEnv = env?.NEXT_PUBLIC_WEBAPP_ENV;
    if (typeof cfEnv === 'string' && isWebappEnv(cfEnv)) {
      return cfEnv === WEBAPP_ENVS.LOCAL || cfEnv === WEBAPP_ENVS.PREVIEW;
    }
  } catch {
  }

  const processEnv = process.env.NEXT_PUBLIC_WEBAPP_ENV;
  if (processEnv && isWebappEnv(processEnv)) {
    return processEnv === WEBAPP_ENVS.LOCAL || processEnv === WEBAPP_ENVS.PREVIEW;
  }

  return process.env.NODE_ENV === 'development';
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

  // Extract email from request body
  const email = ctx.body?.email;
  if (!email || typeof email !== 'string') {
    return; // Let better-auth handle missing email
  }

  // Validate email domain
  if (!isAllowedEmailDomain(email)) {
    throw new APIError('BAD_REQUEST', {
      message: EMAIL_DOMAIN_CONFIG.ERROR_MESSAGE,
    });
  }
}

/**
 * Get the allowed email domain for the current environment
 *
 * @returns {string} The allowed email domain (e.g., '@roundtable.now')
 */
export function getAllowedDomain(): string {
  return EMAIL_DOMAIN_CONFIG.ALLOWED_DOMAIN;
}
