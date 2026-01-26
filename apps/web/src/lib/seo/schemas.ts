import { z } from 'zod';

/**
 * SEO Schemas - Zod schemas for SEO configuration
 * All types are inferred from these schemas (single source of truth)
 */

// ============================================================================
// PAGE TYPE ENUM
// ============================================================================

export const PAGE_TYPES = {
  CHAT: 'chat',
  CHAT_THREAD: 'chat-thread',
  HOME: 'home',
  PRICING: 'pricing',
  PRIVACY: 'privacy',
  SIGN_IN: 'sign-in',
  TERMS: 'terms',
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
  cacheControl: z.string().optional(),
  description: z.string(),
  path: z.string(),
  robots: z.enum(['index, follow', 'noindex, nofollow']).default('index, follow'),
  title: z.string(),
});

export type SeoMetadata = z.infer<typeof seoMetadataSchema>;

// ============================================================================
// HEAD CONFIG SCHEMA (TanStack Start compatible)
// ============================================================================

export const headMetaSchema = z.union([
  z.object({ title: z.string() }),
  z.object({ charSet: z.string() }),
  z.object({ content: z.string(), name: z.string() }),
  z.object({ content: z.string(), property: z.string() }),
]);

export type HeadMeta = z.infer<typeof headMetaSchema>;

export const headLinkSchema = z.object({
  as: z.string().optional(),
  href: z.string(),
  rel: z.string(),
  sizes: z.string().optional(),
  type: z.string().optional(),
});

export type HeadLink = z.infer<typeof headLinkSchema>;

export const headConfigSchema = z.object({
  links: z.array(headLinkSchema).optional(),
  meta: z.array(headMetaSchema),
});

export type HeadConfig = z.infer<typeof headConfigSchema>;

// ============================================================================
// DYNAMIC SEO OVERRIDES
// ============================================================================

export const seoOverridesSchema = z.object({
  description: z.string().optional(),
  noindex: z.boolean().optional(),
  ogImage: z.string().optional(),
  title: z.string().optional(),
});

export type SeoOverrides = z.infer<typeof seoOverridesSchema>;
