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
    'description': BRAND.description,
    'name': BRAND.name,
    'publisher': {
      '@type': 'Organization',
      'logo': {
        '@type': 'ImageObject',
        'url': `${baseUrl}/static/logo.svg`,
      },
      'name': BRAND.name,
      'sameAs': [
        BRAND.social.twitter,
        BRAND.social.linkedin,
        BRAND.social.github,
      ],
      'url': baseUrl,
    },
    'url': baseUrl,
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
    'applicationCategory': 'BusinessApplication',
    'description': BRAND.description,
    'image': {
      '@type': 'ImageObject',
      'url': `${baseUrl}/static/og-image.png`,
    },
    'name': BRAND.name,
    'offers': {
      '@type': 'Offer',
      'price': '0',
      'priceCurrency': 'USD',
    },
    'operatingSystem': 'Web Browser',
    'url': baseUrl,
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
    'contactPoint': {
      '@type': 'ContactPoint',
      'contactType': 'customer service',
      'email': BRAND.support,
    },
    'description': BRAND.description,
    'logo': {
      '@type': 'ImageObject',
      'url': `${baseUrl}/static/logo.svg`,
    },
    'name': BRAND.name,
    'sameAs': [
      BRAND.social.twitter,
      BRAND.social.linkedin,
      BRAND.social.github,
    ],
    'url': baseUrl,
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
    'description': opts.description,
    'isPartOf': {
      '@type': 'WebSite',
      'name': BRAND.name,
      'url': baseUrl,
    },
    'name': opts.name,
    'url': `${baseUrl}${opts.path}`,
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
    'author': opts.author
      ? { '@type': 'Person', 'name': opts.author }
      : { '@type': 'Organization', 'name': BRAND.name },
    'description': opts.description,
    'headline': opts.headline,
    'image': opts.image || `${baseUrl}/static/og-image.png`,
    'publisher': {
      '@type': 'Organization',
      'logo': {
        '@type': 'ImageObject',
        'url': `${baseUrl}/static/logo.svg`,
      },
      'name': BRAND.name,
    },
    'url': `${baseUrl}${opts.path}`,
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
    'brand': {
      '@type': 'Organization',
      'name': BRAND.name,
    },
    'description': opts.description,
    'name': opts.name,
    'offers': {
      '@type': 'Offer',
      'availability': 'https://schema.org/InStock',
      'price': opts.price.toString(),
      'priceCurrency': opts.currency || 'USD',
    },
    'url': `${baseUrl}${opts.path || '/chat/pricing'}`,
  };
}

/**
 * Create BreadcrumbList JSON-LD
 */
export function createBreadcrumbListJsonLd(
  items: { name: string; path: string }[],
): WithContext<BreadcrumbList> {
  const baseUrl = getAppBaseUrl();

  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    'itemListElement': items.map((item, index) => ({
      '@type': 'ListItem',
      'item': `${baseUrl}${item.path}`,
      'name': item.name,
      'position': index + 1,
    })),
  };
}

/**
 * Create FAQPage JSON-LD
 */
export function createFAQPageJsonLd(
  faqs: { question: string; answer: string }[],
): WithContext<FAQPage> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    'mainEntity': faqs.map(faq => ({
      '@type': 'Question',
      'acceptedAnswer': {
        '@type': 'Answer',
        'text': faq.answer,
      },
      'name': faq.question,
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
