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
import { z } from 'zod';

import {
  creditTransaction,
  userCreditBalance,
} from '../tables/credits';
import { Refinements } from './refinements';

// ============================================================================
// Credit Transaction Metadata Schema - Single Source of Truth
// ============================================================================

/**
 * Credit Transaction Metadata Zod schema
 *
 * SINGLE SOURCE OF TRUTH for credit transaction metadata type
 * Replaces Record<string, unknown> with strictly typed fields
 */
export const CreditTransactionMetadataSchema = z.object({
  // Error context (for failed transactions)
  errorCode: z.string().optional(),
  errorMessage: z.string().optional(),

  // Reservation tracking
  reservationId: z.string().optional(),
  reservationExpiry: z.string().datetime().optional(),

  // Stream context
  streamStartedAt: z.string().datetime().optional(),
  streamCompletedAt: z.string().datetime().optional(),

  // Admin context (for adjustments)
  adjustedBy: z.string().optional(),
  adjustmentReason: z.string().optional(),

  // Purchase context
  stripePaymentIntentId: z.string().optional(),
  stripePriceId: z.string().optional(),
}).strict();

export type CreditTransactionMetadata = z.infer<typeof CreditTransactionMetadataSchema>;

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
