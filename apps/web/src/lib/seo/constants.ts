import { BRAND } from '@roundtable/shared';

import { getAppBaseUrl } from '@/lib/config/base-urls';

export const SEO_DEFAULTS = {
  siteName: BRAND.name,
  description: BRAND.description,
  twitterHandle: BRAND.social.twitterHandle,
  ogType: 'website',
  ogImagePath: '/static/og-image.png',
  ogImageWidth: '1200',
  ogImageHeight: '630',
  themeColor: '#000000',
  colorScheme: 'dark',
  robots: 'index, follow',
} as const;

export const PAGE_SEO = {
  home: {
    title: BRAND.name,
    description: BRAND.description,
    path: '/',
  },
  pricing: {
    title: `Pricing - ${BRAND.name}`,
    description: `Choose your ${BRAND.name} plan - collaborative AI brainstorming with multiple AI models working together.`,
    path: '/pricing',
  },
  signIn: {
    title: `Sign In - ${BRAND.name}`,
    description: `Sign in to ${BRAND.name} - the collaborative AI brainstorming platform where multiple AI models work together to solve problems and generate ideas.`,
    path: '/auth/sign-in',
  },
  chat: {
    title: `Chat - ${BRAND.name}`,
    description: `Start a conversation with multiple AI models on ${BRAND.name}.`,
    path: '/chat',
  },
  chatPricing: {
    title: `Pricing & Plans - ${BRAND.name}`,
    description: `Choose the perfect plan for your AI collaboration needs. Compare features, credits, and pricing for ${BRAND.name} - from free tier to enterprise.`,
    path: '/chat/pricing',
  },
  terms: {
    title: `Terms of Service - ${BRAND.name}`,
    description: `Terms of Service for ${BRAND.name} - Read our terms and conditions for using the platform.`,
    path: '/legal/terms',
  },
  privacy: {
    title: `Privacy Policy - ${BRAND.name}`,
    description: `Privacy Policy for ${BRAND.name} - Learn how we collect, use, and protect your data.`,
    path: '/legal/privacy',
  },
} as const;

export type PageSeoKey = keyof typeof PAGE_SEO;

export function getPageUrl(path: string): string {
  return `${getAppBaseUrl()}${path}`;
}

export function getOgImageUrl(path?: string): string {
  return `${getAppBaseUrl()}${path || SEO_DEFAULTS.ogImagePath}`;
}

export type HeadMeta
  = | { title: string } // Title tag
    | { charSet: string } // Charset
    | { name: string; content: string } // Meta name
    | { property: string; content: string }; // Meta property (OG/Twitter)

export type HeadLink = {
  rel: string;
  href: string;
  type?: string;
  sizes?: string;
  as?: string;
  crossorigin?: string;
};

export type HeadConfig = {
  meta: HeadMeta[];
  links: HeadLink[];
};

export function createPageHead(
  pageKey: PageSeoKey,
  overrides?: { title?: string; description?: string; ogImage?: string },
): HeadConfig {
  const page = PAGE_SEO[pageKey];
  const siteUrl = getAppBaseUrl();
  const title = overrides?.title || page.title;
  const description = overrides?.description || page.description;
  const ogImage = overrides?.ogImage || getOgImageUrl();

  return {
    meta: [
      { title },
      { name: 'description', content: description },
      { property: 'og:title', content: title },
      { property: 'og:description', content: description },
      { property: 'og:type', content: SEO_DEFAULTS.ogType },
      { property: 'og:url', content: `${siteUrl}${page.path}` },
      { property: 'og:image', content: ogImage },
      { property: 'og:image:width', content: SEO_DEFAULTS.ogImageWidth },
      { property: 'og:image:height', content: SEO_DEFAULTS.ogImageHeight },
      { property: 'og:site_name', content: SEO_DEFAULTS.siteName },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:site', content: SEO_DEFAULTS.twitterHandle },
      { name: 'twitter:title', content: title },
      { name: 'twitter:description', content: description },
      { name: 'twitter:image', content: ogImage },
      { name: 'robots', content: SEO_DEFAULTS.robots },
    ],
    links: [
      { rel: 'canonical', href: `${siteUrl}${page.path}` },
    ],
  };
}

export const CACHE_HEADERS = {
  static: 'public, max-age=604800, s-maxage=604800, stale-while-revalidate=2592000, immutable',
  daily: 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
  hourly: 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
  noCache: 'no-store, no-cache, must-revalidate',
} as const;
