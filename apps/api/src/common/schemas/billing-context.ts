/**
 * Billing Context Schemas
 *
 * Centralized Zod schemas for billing service contracts.
 * Single source of truth for billing context, credit balance, and token usage.
 */

import { CreditActionSchema, PlanTypeSchema } from '@roundtable/shared/enums';
import type { ExecutionContext } from 'hono';
import * as z from 'zod';

// ============================================================================
// Billing Context Schemas
// ============================================================================

/**
 * Billing context for AI operations that deduct credits
 */
export const BillingContextSchema = z.object({
  userId: z.string(),
  threadId: z.string(),
});

export type BillingContext = z.infer<typeof BillingContextSchema>;

/**
 * Extended billing context for image analysis operations
 */
export const ImageAnalysisBillingContextSchema = BillingContextSchema.extend({
  executionCtx: z.custom<ExecutionContext>(),
});

export type ImageAnalysisBillingContext = z.infer<typeof ImageAnalysisBillingContextSchema>;

// ============================================================================
// Credit Balance Schemas
// ============================================================================

export const CreditBalanceInfoSchema = z.object({
  balance: z.number(),
  reserved: z.number(),
  available: z.number(),
  planType: PlanTypeSchema,
  monthlyCredits: z.number(),
  nextRefillAt: z.date().nullable(),
});

export type CreditBalanceInfo = z.infer<typeof CreditBalanceInfoSchema>;

// ============================================================================
// Token Usage Schemas
// ============================================================================

export const TokenUsageSchema = z.object({
  inputTokens: z.number(),
  outputTokens: z.number(),
  action: CreditActionSchema,
  threadId: z.string().optional(),
  messageId: z.string().optional(),
  modelId: z.string(),
});

export type TokenUsage = z.infer<typeof TokenUsageSchema>;

// ============================================================================
// Enforce Credits Options
// ============================================================================

export const EnforceCreditsOptionsSchema = z.object({
  skipRoundCheck: z.boolean().optional(),
});

export type EnforceCreditsOptions = z.infer<typeof EnforceCreditsOptionsSchema>;
