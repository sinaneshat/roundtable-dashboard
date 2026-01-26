/**
 * Model Pricing Schemas
 *
 * Centralized Zod schemas for model pricing contracts.
 * Single source of truth for model pricing tier calculations.
 */

import * as z from 'zod';

// ============================================================================
// Model For Pricing Schema
// ============================================================================

/**
 * Model schema for pricing calculations
 * Used by product-logic.service.ts for tier determination and credit calculations
 */
export const ModelForPricingSchema = z.object({
  capabilities: z.object({
    file: z.boolean(),
    reasoning: z.boolean(),
    streaming: z.boolean(),
    tools: z.boolean(),
    vision: z.boolean(),
  }).optional(),
  context_length: z.number(),
  created: z.number().nullable().optional(),
  id: z.string(),
  name: z.string(),
  pricing: z.object({
    completion: z.string(),
    prompt: z.string(),
  }),
  pricing_display: z.object({
    input: z.string().nullable(),
    output: z.string().nullable(),
  }).nullable().optional(),
  provider: z.string().optional(),
});

export type ModelForPricing = z.infer<typeof ModelForPricingSchema>;
