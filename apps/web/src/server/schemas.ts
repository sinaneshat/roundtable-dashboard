/**
 * Zod validation schemas for server function inputs.
 * Used with @tanstack/zod-adapter for type-safe input validation.
 */
import { BooleanStrings, DEFAULT_WEBAPP_ENV, WebAppEnvSchema } from '@roundtable/shared/enums';
import { z } from 'zod';

/**
 * Schema for thread/resource slug parameter.
 * Validates slug format (lowercase alphanumeric with hyphens).
 */
export const slugSchema = z.string().min(1).max(255);

/**
 * Schema for thread/resource ID parameter.
 * Validates UUID format.
 */
export const threadIdSchema = z.string().uuid();

/**
 * Schema for generic string ID parameter.
 * Validates non-empty string with reasonable max length.
 */
export const idSchema = z.string().min(1).max(255);

/**
 * Schema for server function error response.
 * Used when service calls fail.
 */
export const serverFnErrorResponseSchema = z.object({
  data: z.null(),
  success: z.literal(false),
});

export type ServerFnErrorResponse = z.infer<typeof serverFnErrorResponseSchema>;

/**
 * Schema for public environment variables exposed to client.
 * Uses WebAppEnvSchema from shared for proper type validation.
 * These are already public (in wrangler.jsonc vars) - just passing
 * from server runtime to client.
 */
export const publicEnvSchema = z.object({
  VITE_MAINTENANCE: z.string(),
  VITE_POSTHOG_API_KEY: z.string(),
  VITE_STRIPE_PUBLISHABLE_KEY: z.string(),
  VITE_TURNSTILE_SITE_KEY: z.string(),
  VITE_WEBAPP_ENV: WebAppEnvSchema,
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

/**
 * Default public env values for error boundaries where loader may not have run.
 */
export const DEFAULT_PUBLIC_ENV: PublicEnv = {
  VITE_MAINTENANCE: BooleanStrings.FALSE,
  VITE_POSTHOG_API_KEY: '',
  VITE_STRIPE_PUBLISHABLE_KEY: '',
  VITE_TURNSTILE_SITE_KEY: '',
  VITE_WEBAPP_ENV: DEFAULT_WEBAPP_ENV,
};
