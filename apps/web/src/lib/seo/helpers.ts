import { getAppBaseUrl } from '@/lib/config/base-urls';

import { PAGE_SEO_METADATA, SEO_DEFAULTS } from './constants';
import type { HeadConfig, PageType, SeoOverrides } from './schemas';

/**
 * SEO Helpers - Generate TanStack Start head config objects
 */

// ============================================================================
// URL HELPERS
// ============================================================================

export function getPageUrl(path: string): string {
  return `${getAppBaseUrl()}${path}`;
}

export function getOgImageUrl(path?: string): string {
  return `${getAppBaseUrl()}${path || SEO_DEFAULTS.ogImagePath}`;
}

// ============================================================================
// HEAD CONFIG GENERATOR
// ============================================================================

/**
 * Generate TanStack Start head config for a page type
 * Use in route head() functions:
 * ```tsx
 * head: () => getSeoHead(PAGE_TYPES.PRICING)
 * head: ({ loaderData }) => getSeoHead(PAGE_TYPES.CHAT_THREAD, { title: loaderData.title })
 * ```
 */
export function getSeoHead(pageType: PageType, overrides?: SeoOverrides): HeadConfig {
  const page = PAGE_SEO_METADATA[pageType];
  const siteUrl = getAppBaseUrl();

  const title = overrides?.title || page.title;
  const description = overrides?.description || page.description;
  const ogImage = overrides?.ogImage || getOgImageUrl();
  const robots = overrides?.noindex ? 'noindex, nofollow' : page.robots;

  return {
    meta: [
      { title },
      { name: 'description', content: description },
      // Open Graph
      { property: 'og:title', content: title },
      { property: 'og:description', content: description },
      { property: 'og:type', content: SEO_DEFAULTS.ogType },
      { property: 'og:url', content: `${siteUrl}${page.path}` },
      { property: 'og:image', content: ogImage },
      { property: 'og:image:width', content: SEO_DEFAULTS.ogImageWidth },
      { property: 'og:image:height', content: SEO_DEFAULTS.ogImageHeight },
      { property: 'og:site_name', content: SEO_DEFAULTS.siteName },
      // Twitter Card
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:site', content: SEO_DEFAULTS.twitterHandle },
      { name: 'twitter:title', content: title },
      { name: 'twitter:description', content: description },
      { name: 'twitter:image', content: ogImage },
      // SEO
      { name: 'robots', content: robots },
    ],
    links: [
      { rel: 'canonical', href: `${siteUrl}${page.path}` },
    ],
  };
}

/**
 * Get cache control header for a page type
 */
export function getCacheControl(pageType: PageType): string | undefined {
  return PAGE_SEO_METADATA[pageType].cacheControl;
}

/**
 * Generate headers function for a route
 */
export function getSeoHeaders(pageType: PageType): (() => Record<string, string>) | undefined {
  const cacheControl = getCacheControl(pageType);
  if (!cacheControl)
    return undefined;

  return () => ({ 'Cache-Control': cacheControl });
}
