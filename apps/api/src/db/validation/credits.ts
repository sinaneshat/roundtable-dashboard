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
import * as z from 'zod';

import {
  creditTransaction,
  userCreditBalance,
} from '../tables/credits';

// ============================================================================
// Credit Transaction Metadata Schema - Single Source of Truth
// ============================================================================

/**
 * Credit Transaction Metadata Zod schema
 *
 * SINGLE SOURCE OF TRUTH for credit transaction metadata type
 */
export const CreditTransactionMetadataSchema = z.object({
  // Admin context (for adjustments)
  adjustedBy: z.string().optional(),
  adjustmentReason: z.string().optional(),

  // Error context (for failed transactions)
  errorCode: z.string().optional(),
  errorMessage: z.string().optional(),

  reservationExpiry: z.string().datetime().optional(),
  // Reservation tracking
  reservationId: z.string().optional(),

  streamCompletedAt: z.string().datetime().optional(),
  // Stream context
  streamStartedAt: z.string().datetime().optional(),

  // Purchase context
  stripePaymentIntentId: z.string().optional(),
  stripePriceId: z.string().optional(),
}).strict();

export type CreditTransactionMetadata = z.infer<typeof CreditTransactionMetadataSchema>;

// ============================================================================
// User Credit Balance Schemas
// ============================================================================

// Note: Field validation applied at API layer
export const userCreditBalanceSelectSchema = createSelectSchema(userCreditBalance);
export const userCreditBalanceInsertSchema = createInsertSchema(userCreditBalance);
export const userCreditBalanceUpdateSchema = createUpdateSchema(userCreditBalance);

export type UserCreditBalance = z.infer<typeof userCreditBalanceSelectSchema>;
export type UserCreditBalanceInsert = z.infer<typeof userCreditBalanceInsertSchema>;
export type UserCreditBalanceUpdate = z.infer<typeof userCreditBalanceUpdateSchema>;

// ============================================================================
// Credit Transaction Schemas
// ============================================================================

// Note: Field validation applied at API layer
export const creditTransactionSelectSchema = createSelectSchema(creditTransaction);
export const creditTransactionInsertSchema = createInsertSchema(creditTransaction);

export type CreditTransaction = z.infer<typeof creditTransactionSelectSchema>;
export type CreditTransactionInsert = z.infer<typeof creditTransactionInsertSchema>;
