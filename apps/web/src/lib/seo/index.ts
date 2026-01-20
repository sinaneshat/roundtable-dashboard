/**
 * SEO Module - Centralized SEO configuration using TanStack Start native patterns
 *
 * Usage in routes:
 * ```tsx
 * import { getSeoHead, getSeoHeaders, PAGE_TYPES } from '@/lib/seo';
 *
 * export const Route = createFileRoute('/pricing')({
 *   head: () => getSeoHead(PAGE_TYPES.PRICING),
 *   headers: getSeoHeaders(PAGE_TYPES.PRICING),
 *   component: PricingPage,
 * });
 *
 * // With dynamic title
 * export const Route = createFileRoute('/chat/$slug')({
 *   head: ({ loaderData }) => getSeoHead(PAGE_TYPES.CHAT_THREAD, {
 *     title: `${loaderData.threadTitle} - Roundtable`
 *   }),
 * });
 * ```
 */

// Constants
export {
  CACHE_HEADERS,
  PAGE_SEO_METADATA,
  SEO_DEFAULTS,
} from './constants';

// Helpers
export {
  getCacheControl,
  getOgImageUrl,
  getPageUrl,
  getSeoHead,
  getSeoHeaders,
} from './helpers';

// Schemas (single source of truth for types)
export type {
  HeadConfig,
  HeadLink,
  HeadMeta,
  PageType,
  SeoMetadata,
  SeoOverrides,
} from './schemas';
export {
  headConfigSchema,
  headLinkSchema,
  headMetaSchema,
  PAGE_TYPES,
  pageTypeSchema,
  seoMetadataSchema,
  seoOverridesSchema,
} from './schemas';
