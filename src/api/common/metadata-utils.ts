/**
 * Type-safe metadata handling utilities
 * Restored from commit a24d1f67 and enhanced for SEO/OG metadata
 *
 * Provides discriminated union pattern for maximum type safety
 * replacing generic Record<string, unknown>
 */

import { z } from 'zod';

import type { SubscriptionTier } from '@/api/services/product-logic.service';
import { subscriptionTierSchema } from '@/api/services/product-logic.service';

/**
 * Discriminated union for metadata types (Context7 Pattern)
 * Maximum type safety for different metadata contexts
 */
const MetadataSchema = z.discriminatedUnion('type', [
  // Subscription metadata
  z.object({
    type: z.literal('subscription'),
    planChangeHistory: z.array(z.object({
      fromProductId: z.string(),
      toProductId: z.string(),
      fromPrice: z.number(),
      toPrice: z.number(),
      changedAt: z.string().datetime(),
      effectiveDate: z.string().datetime(),
    })).optional(),
    autoRenewal: z.boolean().optional(),
    trialEnd: z.string().datetime().optional(),
    promotionCode: z.string().optional(),
    discountAmount: z.number().optional(),
  }),

  // Product metadata
  z.object({
    type: z.literal('product'),
    features: z.array(z.string()).optional(),
    category: z.string().optional(),
    tags: z.array(z.string()).optional(),
    tier: subscriptionTierSchema.optional(),
    popular: z.boolean().optional(),
    seoTitle: z.string().optional(),
    seoDescription: z.string().optional(),
    ogImage: z.string().url().optional(),
  }),

  // User metadata
  z.object({
    type: z.literal('user'),
    preferences: z.record(z.string(), z.boolean()).optional(),
    lastLogin: z.string().datetime().optional(),
    timezone: z.string().optional(),
    language: z.string().optional(),
    referredBy: z.string().optional(),
  }),

  // SEO/Page metadata
  z.object({
    type: z.literal('seo'),
    title: z.string().max(60),
    description: z.string().max(160),
    keywords: z.array(z.string()),
    ogImage: z.string().url(),
    ogType: z.enum(['website', 'article', 'product']),
    canonicalUrl: z.string().url().optional(),
    noindex: z.boolean().optional(),
    publishedTime: z.string().datetime().optional(),
    modifiedTime: z.string().datetime().optional(),
    author: z.string().optional(),
  }),
]);

export type TypedMetadata = z.infer<typeof MetadataSchema>;

/**
 * Parse and validate metadata with proper error handling
 * Returns discriminated union for type safety - no casting required
 *
 * @param metadata - Unknown metadata to validate
 * @returns Success result with typed data or error result
 */
export function parseMetadata(
  metadata: unknown,
): { success: true; data: TypedMetadata } | { success: false; error: string } {
  const result = MetadataSchema.safeParse(metadata);
  if (!result.success) {
    return {
      success: false,
      error: `Invalid metadata structure: ${result.error.message}`,
    };
  }
  return { success: true, data: result.data };
}

/**
 * Create SEO metadata for Open Graph and meta tags
 * Ensures all required fields are present
 *
 * @param data - SEO metadata fields
 * @param data.title - Page title
 * @param data.description - Page description
 * @param data.keywords - SEO keywords
 * @param data.ogImage - Open Graph image URL
 * @param data.ogType - Open Graph type
 * @param data.canonicalUrl - Canonical URL
 * @param data.noindex - Whether to prevent indexing
 * @param data.publishedTime - Publication timestamp
 * @param data.modifiedTime - Last modification timestamp
 * @param data.author - Content author
 * @returns Typed SEO metadata object
 */
export function createSeoMetadata(data: {
  title: string;
  description: string;
  keywords: string[];
  ogImage: string;
  ogType?: 'website' | 'article' | 'product';
  canonicalUrl?: string;
  noindex?: boolean;
  publishedTime?: string;
  modifiedTime?: string;
  author?: string;
}): TypedMetadata {
  return {
    type: 'seo',
    title: data.title.slice(0, 60), // Enforce max length
    description: data.description.slice(0, 160), // Enforce max length
    keywords: data.keywords,
    ogImage: data.ogImage,
    ogType: data.ogType || 'website',
    canonicalUrl: data.canonicalUrl,
    noindex: data.noindex,
    publishedTime: data.publishedTime,
    modifiedTime: data.modifiedTime,
    author: data.author,
  };
}

/**
 * Create product metadata for catalog and SEO
 *
 * @param data - Product metadata fields
 * @param data.features - Product features list
 * @param data.category - Product category
 * @param data.tags - Product tags
 * @param data.tier - Pricing tier
 * @param data.popular - Whether product is popular
 * @param data.seoTitle - SEO optimized title
 * @param data.seoDescription - SEO optimized description
 * @param data.ogImage - Open Graph image URL
 * @returns Typed product metadata object
 */
export function createProductMetadata(data: {
  features?: string[];
  category?: string;
  tags?: string[];
  tier?: SubscriptionTier;
  popular?: boolean;
  seoTitle?: string;
  seoDescription?: string;
  ogImage?: string;
}): TypedMetadata {
  return {
    type: 'product',
    ...data,
  };
}

/**
 * Create subscription metadata for billing tracking
 *
 * @param data - Subscription metadata fields
 * @param data.autoRenewal - Whether subscription auto-renews
 * @param data.trialEnd - Trial end date
 * @param data.promotionCode - Applied promotion code
 * @param data.discountAmount - Discount amount applied
 * @param data.planChangeHistory - History of plan changes
 * @returns Typed subscription metadata object
 */
export function createSubscriptionMetadata(data: {
  autoRenewal?: boolean;
  trialEnd?: string;
  promotionCode?: string;
  discountAmount?: number;
  planChangeHistory?: Array<{
    fromProductId: string;
    toProductId: string;
    fromPrice: number;
    toPrice: number;
    changedAt: string;
    effectiveDate: string;
  }>;
}): TypedMetadata {
  return {
    type: 'subscription',
    ...data,
  };
}

/**
 * Extract SEO metadata from typed metadata
 * Type guard ensures safe access to SEO fields
 *
 * @param metadata - Typed metadata object
 * @returns SEO metadata or null
 */
export function extractSeoMetadata(
  metadata: TypedMetadata,
): Extract<TypedMetadata, { type: 'seo' }> | null {
  if (metadata.type === 'seo') {
    return metadata;
  }
  return null;
}

/**
 * Extract product metadata from typed metadata
 * Type guard ensures safe access to product fields
 *
 * @param metadata - Typed metadata object
 * @returns Product metadata or null
 */
export function extractProductMetadata(
  metadata: TypedMetadata,
): Extract<TypedMetadata, { type: 'product' }> | null {
  if (metadata.type === 'product') {
    return metadata;
  }
  return null;
}
