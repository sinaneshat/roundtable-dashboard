/**
 * Type-safe metadata interfaces for SEO and structured data
 * Following Context7 Hono best practices
 *
 * Restored from commit a24d1f67 and adapted for Stripe billing
 */

import { z } from 'zod';

import { OgTypeSchema, SubscriptionPlanTypeSchema } from '@/api/core/enums';
import { subscriptionTierSchema } from '@/api/services/product-logic.service';

// ============================================================================
// Base Metadata Schema
// ============================================================================

export const BaseMetadataSchema = z.object({
  createdBy: z.string().optional(),
  createdAt: z.string().datetime().optional(),
  updatedBy: z.string().optional(),
  updatedAt: z.string().datetime().optional(),
  version: z.number().int().positive().optional(),
  tags: z.array(z.string()).optional(),
});

// ============================================================================
// Domain-Specific Metadata Schemas
// ============================================================================

/**
 * Product metadata for Stripe products
 * Used for SEO, structured data, and product catalog
 */
export const ProductMetadataSchema = BaseMetadataSchema.extend({
  features: z.array(z.string()).optional(),
  tier: subscriptionTierSchema.optional(),
  popular: z.boolean().optional(),
  monthlyCredits: z.number().int().nonnegative().optional(),
  category: z.string().optional(),
  seoTitle: z.string().optional(),
  seoDescription: z.string().optional(),
  ogImage: z.string().url().optional(),
});

/**
 * Subscription metadata for Stripe subscriptions
 * Tracks subscription lifecycle and billing information
 */
export const SubscriptionMetadataSchema = BaseMetadataSchema.extend({
  planType: SubscriptionPlanTypeSchema.optional(),
  autoRenewal: z.boolean().optional(),
  trialEnd: z.string().datetime().optional(),
  promotionCode: z.string().optional(),
  discountAmount: z.number().nonnegative().optional(),
  nextBillingDate: z.string().datetime().optional(),
  planChangeHistory: z.array(z.object({
    fromProductId: z.string(),
    toProductId: z.string(),
    fromPrice: z.number(),
    toPrice: z.number(),
    changedAt: z.string().datetime(),
    effectiveDate: z.string().datetime(),
  })).optional(),
});

/**
 * User metadata for preferences and tracking
 * Used for personalization and analytics
 */
export const UserMetadataSchema = BaseMetadataSchema.extend({
  preferences: z.object({
    language: z.string().length(2),
    timezone: z.string(),
    notifications: z.boolean(),
  }).optional(),
  lastLogin: z.string().datetime().optional(),
  loginCount: z.number().int().nonnegative().optional(),
  referredBy: z.string().optional(),
});

/**
 * SEO metadata for pages and routes
 * Used for dynamic Open Graph and meta tags
 */
export const SeoMetadataSchema = z.object({
  title: z.string().max(60),
  description: z.string().max(160),
  keywords: z.array(z.string()),
  ogImage: z.string().url(),
  ogType: OgTypeSchema,
  canonicalUrl: z.string().url().optional(),
  noindex: z.boolean().optional(),
  publishedTime: z.string().datetime().optional(),
  modifiedTime: z.string().datetime().optional(),
  author: z.string().optional(),
});

// ============================================================================
// Type Inference
// ============================================================================

export type BaseMetadata = z.infer<typeof BaseMetadataSchema>;
export type ProductMetadata = z.infer<typeof ProductMetadataSchema>;
export type SubscriptionMetadata = z.infer<typeof SubscriptionMetadataSchema>;
export type UserMetadata = z.infer<typeof UserMetadataSchema>;
export type SeoMetadata = z.infer<typeof SeoMetadataSchema>;

/**
 * Union type for all metadata types
 * Enables type-safe metadata handling across domains
 */
export type TypedMetadata
  = | ProductMetadata
    | SubscriptionMetadata
    | UserMetadata
    | SeoMetadata
    | BaseMetadata;

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validate product metadata with Zod
 * Throws descriptive error if validation fails
 */
export function validateProductMetadata(data: unknown): ProductMetadata {
  const result = ProductMetadataSchema.safeParse(data);
  if (!result.success) {
    throw new Error(`Product metadata validation failed: ${result.error.message}`);
  }
  return result.data;
}

/**
 * Validate subscription metadata with Zod
 * Throws descriptive error if validation fails
 */
export function validateSubscriptionMetadata(data: unknown): SubscriptionMetadata {
  const result = SubscriptionMetadataSchema.safeParse(data);
  if (!result.success) {
    throw new Error(`Subscription metadata validation failed: ${result.error.message}`);
  }
  return result.data;
}

/**
 * Validate user metadata with Zod
 * Throws descriptive error if validation fails
 */
export function validateUserMetadata(data: unknown): UserMetadata {
  const result = UserMetadataSchema.safeParse(data);
  if (!result.success) {
    throw new Error(`User metadata validation failed: ${result.error.message}`);
  }
  return result.data;
}

/**
 * Validate SEO metadata with Zod
 * Throws descriptive error if validation fails
 */
export function validateSeoMetadata(data: unknown): SeoMetadata {
  const result = SeoMetadataSchema.safeParse(data);
  if (!result.success) {
    throw new Error(`SEO metadata validation failed: ${result.error.message}`);
  }
  return result.data;
}

/**
 * Safe metadata parsing with fallback
 * Returns null instead of throwing on validation failure
 *
 * @param data - Unknown data to parse
 * @param schema - Zod schema to validate against
 * @returns Parsed data or null
 */
export function parseTypedMetadata<T extends TypedMetadata>(
  data: unknown,
  schema: z.ZodSchema<T>,
): T | null {
  const result = schema.safeParse(data);
  return result.success ? result.data : null;
}
