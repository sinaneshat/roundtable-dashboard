import { z } from 'zod';

/**
 * SEO Schemas - Zod schemas for SEO configuration
 * All types are inferred from these schemas (single source of truth)
 */

// ============================================================================
// PAGE TYPE ENUM
// ============================================================================

export const PAGE_TYPES = {
  HOME: 'home',
  SIGN_IN: 'sign-in',
  PRICING: 'pricing',
  CHAT: 'chat',
  CHAT_THREAD: 'chat-thread',
  TERMS: 'terms',
  PRIVACY: 'privacy',
} as const;

export const pageTypeSchema = z.enum([
  PAGE_TYPES.HOME,
  PAGE_TYPES.SIGN_IN,
  PAGE_TYPES.PRICING,
  PAGE_TYPES.CHAT,
  PAGE_TYPES.CHAT_THREAD,
  PAGE_TYPES.TERMS,
  PAGE_TYPES.PRIVACY,
]);

export type PageType = z.infer<typeof pageTypeSchema>;

// ============================================================================
// SEO CONFIG SCHEMA
// ============================================================================

export const seoMetadataSchema = z.object({
  title: z.string(),
  description: z.string(),
  path: z.string(),
  robots: z.enum(['index, follow', 'noindex, nofollow']).default('index, follow'),
  cacheControl: z.string().optional(),
});

export type SeoMetadata = z.infer<typeof seoMetadataSchema>;

// ============================================================================
// HEAD CONFIG SCHEMA (TanStack Start compatible)
// ============================================================================

export const headMetaSchema = z.union([
  z.object({ title: z.string() }),
  z.object({ charSet: z.string() }),
  z.object({ name: z.string(), content: z.string() }),
  z.object({ property: z.string(), content: z.string() }),
]);

export type HeadMeta = z.infer<typeof headMetaSchema>;

export const headLinkSchema = z.object({
  rel: z.string(),
  href: z.string(),
  type: z.string().optional(),
  sizes: z.string().optional(),
  as: z.string().optional(),
});

export type HeadLink = z.infer<typeof headLinkSchema>;

export const headConfigSchema = z.object({
  meta: z.array(headMetaSchema),
  links: z.array(headLinkSchema).optional(),
});

export type HeadConfig = z.infer<typeof headConfigSchema>;

// ============================================================================
// DYNAMIC SEO OVERRIDES
// ============================================================================

export const seoOverridesSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  ogImage: z.string().optional(),
  noindex: z.boolean().optional(),
});

export type SeoOverrides = z.infer<typeof seoOverridesSchema>;
