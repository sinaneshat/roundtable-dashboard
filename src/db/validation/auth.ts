/**
 * Auth Validation Schemas
 *
 * ✅ DATABASE-ONLY: Pure Drizzle-Zod schemas derived from database tables
 * ❌ NO CUSTOM LOGIC: No form schemas or UI-specific validations
 *
 * For form-specific schemas (authEmailSchema, profileUpdateSchema), see:
 * @/components/auth/ or relevant form components
 */

import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-zod';
import type { z } from 'zod';

import {
  account,
  session,
  user,
  verification,
} from '../tables/auth';
import { Refinements } from './refinements';

// ============================================================================
// User Schemas
// ============================================================================

export const userSelectSchema = createSelectSchema(user);
export const userInsertSchema = createInsertSchema(user, {
  email: Refinements.email(),
  image: Refinements.urlOptional(),
});
export const userUpdateSchema = createUpdateSchema(user, {
  email: Refinements.emailOptional(),
  image: Refinements.urlOptional(),
});

// ============================================================================
// Session Schemas
// ============================================================================

export const sessionSelectSchema = createSelectSchema(session);
export const sessionInsertSchema = createInsertSchema(session);

// ============================================================================
// Account Schemas
// ============================================================================

export const accountSelectSchema = createSelectSchema(account);
export const accountInsertSchema = createInsertSchema(account);

// ============================================================================
// Verification Schemas
// ============================================================================

export const verificationSelectSchema = createSelectSchema(verification);
export const verificationInsertSchema = createInsertSchema(verification);

// ============================================================================
// Type Exports
// ============================================================================

export type User = z.infer<typeof userSelectSchema>;
export type UserInsert = z.infer<typeof userInsertSchema>;
export type UserUpdate = z.infer<typeof userUpdateSchema>;

export type Session = z.infer<typeof sessionSelectSchema>;
export type SessionInsert = z.infer<typeof sessionInsertSchema>;

export type Account = z.infer<typeof accountSelectSchema>;
export type AccountInsert = z.infer<typeof accountInsertSchema>;

export type Verification = z.infer<typeof verificationSelectSchema>;
export type VerificationInsert = z.infer<typeof verificationInsertSchema>;
