import { z } from '@hono/zod-openapi';
import { CreditActionSchema, CreditTransactionTypeSchema, PlanTypeSchema, UsageStatusSchema } from '@roundtable/shared/enums';

import { createApiResponseSchema, PaginationQuerySchema } from '@/core/schemas';

// ============================================================================
// Credit Balance API Schemas
// ============================================================================

export const CreditBalancePayloadSchema = z.object({
  available: z.number().openapi({
    description: 'Credits available for use (balance - reserved)',
    example: 8400,
  }),
  balance: z.number().openapi({
    description: 'Current available credit balance',
    example: 8500,
  }),
  percentage: z.number().openapi({
    description: 'Percentage of credits used (from monthly allocation)',
    example: 15,
  }),
  plan: z.object({
    monthlyCredits: z.number().openapi({
      description: 'Monthly credit allocation (0 for free tier - one-time signup credits only)',
      example: 0,
    }),
    nextRefillAt: z.string().datetime().nullable().openapi({
      description: 'Next monthly refill date (null for free tier - no renewals)',
      example: null,
    }),
    type: PlanTypeSchema.openapi({
      description: 'Current plan type',
      example: 'free',
    }),
  }).openapi({
    description: 'Plan information',
  }),
  reserved: z.number().openapi({
    description: 'Credits reserved for in-progress operations',
    example: 100,
  }),
  status: UsageStatusSchema.openapi({
    description: 'Visual status indicator (default/warning/critical)',
    example: 'default',
  }),
}).openapi('CreditBalancePayload');

export const CreditBalanceResponseSchema = createApiResponseSchema(
  CreditBalancePayloadSchema,
).openapi('CreditBalanceResponse');

// ============================================================================
// Credit Transaction API Schemas
// ============================================================================

export const CreditTransactionSchema = z.object({
  action: CreditActionSchema.nullable().openapi({
    description: 'Action that triggered this transaction',
    example: 'ai_response',
  }),
  amount: z.number().openapi({
    description: 'Credit amount (positive = credit in, negative = deduction)',
    example: -5,
  }),
  balanceAfter: z.number().openapi({
    description: 'Balance after this transaction',
    example: 8495,
  }),
  createdAt: z.coerce.date().openapi({
    description: 'Transaction timestamp',
    example: '2025-01-15T10:30:00Z',
  }),
  description: z.string().nullable().openapi({
    description: 'Human-readable description',
    example: 'AI response tokens: 1500 input, 800 output',
  }),
  id: z.string().openapi({
    description: 'Transaction ID',
    example: '01JARW8VXNQH1234567890ABC',
  }),
  inputTokens: z.number().nullable().openapi({
    description: 'Input tokens consumed (if applicable)',
    example: 1500,
  }),
  outputTokens: z.number().nullable().openapi({
    description: 'Output tokens consumed (if applicable)',
    example: 800,
  }),
  threadId: z.string().nullable().openapi({
    description: 'Associated thread ID',
    example: '01JARW8VXNQH1234567890XYZ',
  }),
  type: z.string().openapi({
    description: 'Transaction type',
    example: 'deduction',
  }),
}).openapi('CreditTransaction');

export const CreditTransactionsPayloadSchema = z.object({
  items: z.array(CreditTransactionSchema).openapi({
    description: 'List of credit transactions',
  }),
  pagination: z.object({
    hasMore: z.boolean().openapi({
      description: 'Whether more items exist',
      example: true,
    }),
    limit: z.number().openapi({
      description: 'Items per page',
      example: 20,
    }),
    offset: z.number().openapi({
      description: 'Current offset',
      example: 0,
    }),
    total: z.number().openapi({
      description: 'Total number of transactions',
      example: 150,
    }),
  }),
}).openapi('CreditTransactionsPayload');

export const CreditTransactionsResponseSchema = createApiResponseSchema(
  CreditTransactionsPayloadSchema,
).openapi('CreditTransactionsResponse');

export const CreditTransactionsQuerySchema = PaginationQuerySchema.extend({
  action: CreditActionSchema.optional().openapi({
    description: 'Filter by action',
    example: 'ai_response',
  }),
  type: CreditTransactionTypeSchema.optional().openapi({
    description: 'Filter by transaction type',
    example: 'deduction',
  }),
}).openapi('CreditTransactionsQuery');

// ============================================================================
// Credit Estimate API Schemas
// ============================================================================

export const CreditEstimateRequestSchema = z.object({
  action: CreditActionSchema.openapi({
    description: 'Action to estimate cost for',
    example: 'ai_response',
  }),
  params: z.object({
    estimatedInputTokens: z.number().optional().openapi({
      description: 'Estimated input tokens',
      example: 1000,
    }),
    estimatedOutputTokens: z.number().optional().openapi({
      description: 'Estimated output tokens',
      example: 2000,
    }),
    participantCount: z.number().optional().openapi({
      description: 'Number of AI participants (for streaming)',
      example: 2,
    }),
  }).optional().openapi({
    description: 'Parameters for estimation',
  }),
}).openapi('CreditEstimateRequest');

export const CreditEstimatePayloadSchema = z.object({
  balanceAfter: z.number().openapi({
    description: 'Estimated balance after action',
    example: 8397,
  }),
  canAfford: z.boolean().openapi({
    description: 'Whether user has enough credits',
    example: true,
  }),
  currentBalance: z.number().openapi({
    description: 'Current available balance',
    example: 8400,
  }),
  estimatedCredits: z.number().openapi({
    description: 'Estimated credit cost',
    example: 3,
  }),
}).openapi('CreditEstimatePayload');

export const CreditEstimateResponseSchema = createApiResponseSchema(
  CreditEstimatePayloadSchema,
).openapi('CreditEstimateResponse');

// ============================================================================
// Type Exports
// ============================================================================

export type CreditBalancePayload = z.infer<typeof CreditBalancePayloadSchema>;
export type CreditTransaction = z.infer<typeof CreditTransactionSchema>;
export type CreditTransactionsPayload = z.infer<typeof CreditTransactionsPayloadSchema>;
export type CreditEstimateRequest = z.infer<typeof CreditEstimateRequestSchema>;
export type CreditEstimatePayload = z.infer<typeof CreditEstimatePayloadSchema>;
