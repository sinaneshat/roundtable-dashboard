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
  id: z.string(),
  name: z.string(),
  pricing: z.object({
    prompt: z.string(),
    completion: z.string(),
  }),
  pricing_display: z.object({
    input: z.string().nullable(),
    output: z.string().nullable(),
  }).nullable().optional(),
  context_length: z.number(),
  created: z.number().nullable().optional(),
  provider: z.string().optional(),
  capabilities: z.object({
    vision: z.boolean(),
    file: z.boolean(),
    reasoning: z.boolean(),
    streaming: z.boolean(),
    tools: z.boolean(),
  }).optional(),
});

export type ModelForPricing = z.infer<typeof ModelForPricingSchema>;
