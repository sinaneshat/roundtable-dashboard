/**
 * Authentication Utilities
 *
 * Reusable helper functions for authentication and email domain validation
 */

import { BETTER_AUTH_SESSION_COOKIE_NAME, EMAIL_DOMAIN_CONFIG } from '@roundtable/shared';
import { WebAppEnvs, WebAppEnvSchema } from '@roundtable/shared/enums';
import { APIError } from 'better-auth/api';
import { env as workersEnv } from 'cloudflare:workers';
import { z } from 'zod';

import { createError } from '@/common/error-handling';

// ============================================================================
// SCHEMAS
// ============================================================================

/**
 * Schema for auth request body with optional email field
 * Used by Better Auth middleware for email-based operations
 */
const AuthRequestBodySchema = z.object({
  email: z.string().email().optional(),
}).passthrough();

type AuthRequestBody = z.infer<typeof AuthRequestBodySchema>;

/**
 * Better-auth middleware context type
 * Represents the context passed to auth hooks
 */
type AuthContext = {
  path: string;
  body?: AuthRequestBody;
};

export function isRestrictedEnvironment(): boolean {
  // 1. Try Cloudflare Workers env
  try {
    const cfEnvResult = WebAppEnvSchema.safeParse(workersEnv.WEBAPP_ENV);
    if (cfEnvResult.success) {
      // Only restrict PREVIEW - LOCAL/localhost should allow any email
      return cfEnvResult.data === WebAppEnvs.PREVIEW;
    }
  } catch {
    // Workers env not available
  }

  // 2. Try process.env
  const processEnvResult = WebAppEnvSchema.safeParse(process.env.WEBAPP_ENV);
  if (processEnvResult.success) {
    // Only restrict PREVIEW - LOCAL/localhost should allow any email
    return processEnvResult.data === WebAppEnvs.PREVIEW;
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

// ============================================================================
// ADMIN AUTHORIZATION
// ============================================================================

/**
 * User type for admin authorization
 * Using Zod for schema validation
 */
export const AdminUserSchema = z.object({
  id: z.string(),
  role: z.string().nullable().optional(),
});

export type AdminUser = z.infer<typeof AdminUserSchema>;

/**
 * Require admin role for protected operations
 * Throws unauthorized error if user is not an admin
 *
 * @param {AdminUser} user - User object with role property
 * @throws {Error} Unauthorized error if user.role !== 'admin'
 */
export function requireAdmin(user: AdminUser): void {
  if (user.role !== 'admin') {
    throw createError.unauthorized('Admin access required', {
      errorType: 'authorization',
      resource: 'admin',
      userId: user.id,
    });
  }
}
