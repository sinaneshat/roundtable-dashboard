/**
 * Auth Types - Zod-first pattern
 *
 * Following type-inference-patterns.md:
 * - All types inferred from Zod schemas (single source of truth)
 * - No manual type definitions
 * - Better Auth response validation at runtime
 *
 * Note: These schemas mirror Better Auth's response types for validation
 * and type inference. They match the API's auth schema structure.
 */

import { z } from 'zod';

/**
 * User schema - matches Better Auth user response
 * Validates user data from authentication endpoints
 */
export const userSchema = z.object({
  createdAt: z.coerce.date(),
  email: z.string().email().optional(),
  emailVerified: z.boolean(),
  id: z.string().min(1),
  image: z.string().nullable().optional(),
  name: z.string().min(1),
  role: z.string().nullable().optional(),
  updatedAt: z.coerce.date(),
});

export type User = z.infer<typeof userSchema>;

/**
 * Session schema - matches Better Auth session response
 * Validates session metadata from authentication endpoints
 */
export const sessionSchema = z.object({
  createdAt: z.coerce.date(),
  expiresAt: z.coerce.date(),
  id: z.string().min(1),
  impersonatedBy: z.string().nullable().optional(),
  ipAddress: z.string().nullable().optional(),
  token: z.string().min(1),
  updatedAt: z.coerce.date(),
  userAgent: z.string().nullable().optional(),
  userId: z.string().min(1),
});

export type Session = z.infer<typeof sessionSchema>;

/**
 * Full session data schema - matches Better Auth's getSession() response
 * Contains both session metadata and user information
 */
export const sessionDataSchema = z.object({
  session: sessionSchema,
  user: userSchema,
});

export type SessionData = z.infer<typeof sessionDataSchema>;
