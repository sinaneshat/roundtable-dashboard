import { BRAND } from '@roundtable/shared';

import type { PageType, SeoMetadata } from './schemas';
import { PAGE_TYPES } from './schemas';

/**
 * SEO Constants - Centralized SEO configuration
 * Uses BRAND constant for consistent branding
 */

// ============================================================================
// DEFAULT SEO VALUES
// ============================================================================

export const SEO_DEFAULTS = {
  colorScheme: 'dark',
  description: BRAND.description,
  ogImageHeight: '630',
  ogImagePath: '/static/og-image.png',
  ogImageWidth: '1200',
  ogType: 'website',
  siteName: BRAND.name,
  themeColor: '#000000',
  twitterHandle: BRAND.social.twitterHandle,
} as const;

// ============================================================================
// CACHE CONTROL PRESETS
// ============================================================================

export const CACHE_HEADERS = {
  /** Daily refresh content - 1 day at CDN, stale for 7 days */
  daily: 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
  /** Hourly refresh content - 1 hour at CDN, stale for 1 day */
  hourly: 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
  /** No cache - always revalidate */
  noCache: 'no-store, no-cache, must-revalidate',
  /** Static content - 7 days at CDN, stale for 30 days */
  static: 'public, max-age=604800, s-maxage=604800, stale-while-revalidate=2592000, immutable',
} as const;

// ============================================================================
// PAGE SEO METADATA MAP
// ============================================================================

/**
 * SEO metadata for each page type
 * Single source of truth for all page SEO configuration
 */
export const PAGE_SEO_METADATA: Record<PageType, SeoMetadata> = {
  [PAGE_TYPES.CHAT]: {
    description: `Start a conversation with multiple AI models on ${BRAND.name}.`,
    path: '/chat',
    robots: 'noindex, nofollow',
    title: `Chat - ${BRAND.name}`,
  },
  [PAGE_TYPES.CHAT_THREAD]: {
    description: `AI conversation on ${BRAND.name}.`,
    path: '/chat',
    robots: 'noindex, nofollow',
    title: `Chat - ${BRAND.name}`,
  },
  [PAGE_TYPES.HOME]: {
    description: BRAND.description,
    path: '/',
    robots: 'index, follow',
    title: BRAND.name,
  },
  [PAGE_TYPES.PRICING]: {
    cacheControl: CACHE_HEADERS.daily,
    description: `Choose your ${BRAND.name} plan - collaborative AI brainstorming with multiple AI models working together.`,
    path: '/chat/pricing',
    robots: 'index, follow',
    title: `Pricing - ${BRAND.name}`,
  },
  [PAGE_TYPES.PRIVACY]: {
    cacheControl: CACHE_HEADERS.static,
    description: `Privacy Policy for ${BRAND.name} - Learn how we collect, use, and protect your data.`,
    path: '/legal/privacy',
    robots: 'index, follow',
    title: `Privacy Policy - ${BRAND.name}`,
  },
  [PAGE_TYPES.SIGN_IN]: {
    cacheControl: CACHE_HEADERS.hourly,
    description: `Sign in to ${BRAND.name} - the collaborative AI brainstorming platform where multiple AI models work together to solve problems and generate ideas.`,
    path: '/auth/sign-in',
    robots: 'index, follow',
    title: `Sign In - ${BRAND.name}`,
  },
  [PAGE_TYPES.TERMS]: {
    cacheControl: CACHE_HEADERS.static,
    description: `Terms of Service for ${BRAND.name} - Read our terms and conditions for using the platform.`,
    path: '/legal/terms',
    robots: 'index, follow',
    title: `Terms of Service - ${BRAND.name}`,
  },
};
