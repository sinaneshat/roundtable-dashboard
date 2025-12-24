/**
 * Credit System Validation Schemas
 *
 * ✅ DATABASE-ONLY: Pure Drizzle-Zod schemas derived from database tables
 * ❌ NO CUSTOM LOGIC: No business logic, API schemas, or computed fields
 *
 * For API-specific schemas (credit balance response, transaction history), see:
 * @/api/routes/credits/schema.ts
 */

import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-zod';
import type { z } from 'zod';

import {
  creditTransaction,
  userCreditBalance,
} from '../tables/credits';
import { Refinements } from './refinements';

// ============================================================================
// User Credit Balance Schemas
// ============================================================================

export const userCreditBalanceSelectSchema = createSelectSchema(userCreditBalance);
export const userCreditBalanceInsertSchema = createInsertSchema(userCreditBalance, {
  balance: Refinements.nonNegativeInt(),
  reservedCredits: Refinements.nonNegativeInt(),
  monthlyCredits: Refinements.nonNegativeInt(),
});
export const userCreditBalanceUpdateSchema = createUpdateSchema(userCreditBalance, {
  balance: Refinements.nonNegativeIntOptional(),
  reservedCredits: Refinements.nonNegativeIntOptional(),
  monthlyCredits: Refinements.nonNegativeIntOptional(),
});

export type UserCreditBalance = z.infer<typeof userCreditBalanceSelectSchema>;
export type UserCreditBalanceInsert = z.infer<typeof userCreditBalanceInsertSchema>;
export type UserCreditBalanceUpdate = z.infer<typeof userCreditBalanceUpdateSchema>;

// ============================================================================
// Credit Transaction Schemas
// ============================================================================

export const creditTransactionSelectSchema = createSelectSchema(creditTransaction);
export const creditTransactionInsertSchema = createInsertSchema(creditTransaction, {
  inputTokens: Refinements.nonNegativeIntOptional(),
  outputTokens: Refinements.nonNegativeIntOptional(),
  totalTokens: Refinements.nonNegativeIntOptional(),
  creditsUsed: Refinements.nonNegativeIntOptional(),
});

export type CreditTransaction = z.infer<typeof creditTransactionSelectSchema>;
export type CreditTransactionInsert = z.infer<typeof creditTransactionInsertSchema>;
