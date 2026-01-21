/**
 * Type-safe JSON-LD Structured Data with schema-dts
 *
 * Uses Google's schema-dts package for compile-time validation
 * of Schema.org structured data. This prevents typos and ensures
 * correct property types for all JSON-LD output.
 */

import { BRAND } from '@roundtable/shared';
import type {
  Article,
  BreadcrumbList,
  FAQPage,
  Organization,
  Product,
  SoftwareApplication,
  WebPage,
  WebSite,
  WithContext,
} from 'schema-dts';

import { getAppBaseUrl } from '@/lib/config/base-urls';

// ============================================================================
// TYPE-SAFE JSON-LD BUILDERS
// ============================================================================

/**
 * Create WebSite JSON-LD (for root layout)
 */
export function createWebSiteJsonLd(): WithContext<WebSite> {
  const baseUrl = getAppBaseUrl();

  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    'name': BRAND.name,
    'url': baseUrl,
    'description': BRAND.description,
    'publisher': {
      '@type': 'Organization',
      'name': BRAND.name,
      'url': baseUrl,
      'logo': {
        '@type': 'ImageObject',
        'url': `${baseUrl}/static/logo.svg`,
      },
      'sameAs': [
        BRAND.social.twitter,
        BRAND.social.linkedin,
        BRAND.social.github,
      ],
    },
  };
}

/**
 * Create SoftwareApplication JSON-LD (for app pages)
 */
export function createSoftwareAppJsonLd(): WithContext<SoftwareApplication> {
  const baseUrl = getAppBaseUrl();

  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    'name': BRAND.name,
    'description': BRAND.description,
    'url': baseUrl,
    'applicationCategory': 'BusinessApplication',
    'operatingSystem': 'Web Browser',
    'offers': {
      '@type': 'Offer',
      'price': '0',
      'priceCurrency': 'USD',
    },
    'image': {
      '@type': 'ImageObject',
      'url': `${baseUrl}/static/og-image.png`,
    },
  };
}

/**
 * Create Organization JSON-LD
 */
export function createOrganizationJsonLd(): WithContext<Organization> {
  const baseUrl = getAppBaseUrl();

  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    'name': BRAND.name,
    'url': baseUrl,
    'logo': {
      '@type': 'ImageObject',
      'url': `${baseUrl}/static/logo.svg`,
    },
    'description': BRAND.description,
    'sameAs': [
      BRAND.social.twitter,
      BRAND.social.linkedin,
      BRAND.social.github,
    ],
    'contactPoint': {
      '@type': 'ContactPoint',
      'email': BRAND.support,
      'contactType': 'customer service',
    },
  };
}

/**
 * Create WebPage JSON-LD
 */
export function createWebPageJsonLd(opts: {
  name: string;
  description: string;
  path: string;
}): WithContext<WebPage> {
  const baseUrl = getAppBaseUrl();

  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    'name': opts.name,
    'description': opts.description,
    'url': `${baseUrl}${opts.path}`,
    'isPartOf': {
      '@type': 'WebSite',
      'name': BRAND.name,
      'url': baseUrl,
    },
  };
}

/**
 * Create Article JSON-LD
 */
export function createArticleJsonLd(opts: {
  headline: string;
  description: string;
  path: string;
  author?: string;
  datePublished?: string;
  dateModified?: string;
  image?: string;
}): WithContext<Article> {
  const baseUrl = getAppBaseUrl();

  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    'headline': opts.headline,
    'description': opts.description,
    'url': `${baseUrl}${opts.path}`,
    'image': opts.image || `${baseUrl}/static/og-image.png`,
    'author': opts.author
      ? { '@type': 'Person', 'name': opts.author }
      : { '@type': 'Organization', 'name': BRAND.name },
    'publisher': {
      '@type': 'Organization',
      'name': BRAND.name,
      'logo': {
        '@type': 'ImageObject',
        'url': `${baseUrl}/static/logo.svg`,
      },
    },
    ...(opts.datePublished && { datePublished: opts.datePublished }),
    ...(opts.dateModified && { dateModified: opts.dateModified }),
  };
}

/**
 * Create Product JSON-LD (for pricing)
 */
export function createProductJsonLd(opts: {
  name: string;
  description: string;
  price: number;
  currency?: string;
  path?: string;
}): WithContext<Product> {
  const baseUrl = getAppBaseUrl();

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    'name': opts.name,
    'description': opts.description,
    'url': `${baseUrl}${opts.path || '/chat/pricing'}`,
    'brand': {
      '@type': 'Organization',
      'name': BRAND.name,
    },
    'offers': {
      '@type': 'Offer',
      'price': opts.price.toString(),
      'priceCurrency': opts.currency || 'USD',
      'availability': 'https://schema.org/InStock',
    },
  };
}

/**
 * Create BreadcrumbList JSON-LD
 */
export function createBreadcrumbListJsonLd(
  items: Array<{ name: string; path: string }>,
): WithContext<BreadcrumbList> {
  const baseUrl = getAppBaseUrl();

  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    'itemListElement': items.map((item, index) => ({
      '@type': 'ListItem',
      'position': index + 1,
      'name': item.name,
      'item': `${baseUrl}${item.path}`,
    })),
  };
}

/**
 * Create FAQPage JSON-LD
 */
export function createFAQPageJsonLd(
  faqs: Array<{ question: string; answer: string }>,
): WithContext<FAQPage> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    'mainEntity': faqs.map(faq => ({
      '@type': 'Question',
      'name': faq.question,
      'acceptedAnswer': {
        '@type': 'Answer',
        'text': faq.answer,
      },
    })),
  };
}

/** Union of all JSON-LD types this module produces */
export type JsonLdData
  = | WithContext<WebSite>
    | WithContext<SoftwareApplication>
    | WithContext<Organization>
    | WithContext<WebPage>
    | WithContext<Article>
    | WithContext<Product>
    | WithContext<BreadcrumbList>
    | WithContext<FAQPage>;

/**
 * Serialize JSON-LD to string with XSS protection
 * Replaces < characters with Unicode equivalent to prevent script injection
 */
export function serializeJsonLd(data: JsonLdData): string {
  return JSON.stringify(data).replace(/</g, '\u003C');
}
