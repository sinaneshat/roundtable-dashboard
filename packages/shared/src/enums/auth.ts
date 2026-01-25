/**
 * Authentication Enums
 *
 * Enums for authentication modes, steps, and related patterns.
 */

import { z } from '@hono/zod-openapi';

// ============================================================================
// AUTH MODE (Handler Configuration)
// ============================================================================

export const AUTH_MODES = ['session', 'session-optional', 'public', 'api-key'] as const;

export const DEFAULT_AUTH_MODE: AuthMode = 'session';

export const AuthModeSchema = z.enum(AUTH_MODES).openapi({
  description: 'Authentication mode for handler configuration',
  example: 'session',
});

export type AuthMode = z.infer<typeof AuthModeSchema>;

export const AuthModes = {
  SESSION: 'session' as const,
  SESSION_OPTIONAL: 'session-optional' as const,
  PUBLIC: 'public' as const,
  API_KEY: 'api-key' as const,
} as const;

// ============================================================================
// AUTH STEP (UI Flow)
// ============================================================================

export const AUTH_STEPS = ['method', 'email', 'sent'] as const;

export const DEFAULT_AUTH_STEP: AuthStep = 'method';

export const AuthStepSchema = z.enum(AUTH_STEPS).openapi({
  description: 'Authentication form step',
  example: 'method',
});

export type AuthStep = z.infer<typeof AuthStepSchema>;

export const AuthSteps = {
  METHOD: 'method' as const,
  EMAIL: 'email' as const,
  SENT: 'sent' as const,
} as const;

// ============================================================================
// AUTH STEP LABELS (UI Display)
// ============================================================================

export const AUTH_STEP_LABELS: Record<AuthStep, string> = {
  [AuthSteps.METHOD]: 'Choose Method',
  [AuthSteps.EMAIL]: 'Enter Email',
  [AuthSteps.SENT]: 'Check Email',
} as const;

// ============================================================================
// AUTH ERROR TYPE (NextAuth/Better Auth Error Codes)
// ============================================================================

export const AUTH_ERROR_TYPES = [
  'configuration',
  'accessdenied',
  'verification',
  'oauthsignin',
  'oauthcallback',
  'oauthcreateaccount',
  'emailcreateaccount',
  'callback',
  'please_restart_the_process',
  'domain_restricted',
  'unable_to_create_user',
  'default',
] as const;

export const DEFAULT_AUTH_ERROR_TYPE: AuthErrorType = 'default';

export const AuthErrorTypeSchema = z.enum(AUTH_ERROR_TYPES).openapi({
  description: 'Authentication error type code',
  example: 'verification',
});

export type AuthErrorType = z.infer<typeof AuthErrorTypeSchema>;

export const AuthErrorTypes = {
  CONFIGURATION: 'configuration' as const,
  ACCESS_DENIED: 'accessdenied' as const,
  VERIFICATION: 'verification' as const,
  OAUTH_SIGNIN: 'oauthsignin' as const,
  OAUTH_CALLBACK: 'oauthcallback' as const,
  OAUTH_CREATE_ACCOUNT: 'oauthcreateaccount' as const,
  EMAIL_CREATE_ACCOUNT: 'emailcreateaccount' as const,
  CALLBACK: 'callback' as const,
  PLEASE_RESTART_PROCESS: 'please_restart_the_process' as const,
  DOMAIN_RESTRICTED: 'domain_restricted' as const,
  UNABLE_TO_CREATE_USER: 'unable_to_create_user' as const,
  DEFAULT: 'default' as const,
} as const;

// ============================================================================
// BETTER AUTH CONSTANTS
// ============================================================================

/**
 * Better Auth session cookie name
 * Used for extracting session token from cookies in queue-based operations
 *
 * @see src/api/routes/chat/handlers/streaming.handler.ts
 * @see src/api/routes/chat/handlers/stream-resume.handler.ts
 * @see src/workers/round-orchestration-queue.ts
 */
export const BETTER_AUTH_SESSION_COOKIE_NAME = 'better-auth.session_token' as const;

// ============================================================================
// VALIDATION HELPER
// ============================================================================

export function isValidAuthErrorType(value: unknown): value is AuthErrorType {
  return AuthErrorTypeSchema.safeParse(value).success;
}

// ============================================================================
// USER ROLE (Authorization Level)
// ============================================================================

// 1. Array of valid values
export const USER_ROLES = ['admin', 'user'] as const;

// 2. Default value
export const DEFAULT_USER_ROLE: UserRole = 'user';

// 3. Zod schema
export const UserRoleSchema = z.enum(USER_ROLES);

// 4. TypeScript type (inferred from schema)
export type UserRole = z.infer<typeof UserRoleSchema>;

// 5. Constant object for accessing values
export const UserRoles = {
  ADMIN: 'admin',
  USER: 'user',
} as const;
