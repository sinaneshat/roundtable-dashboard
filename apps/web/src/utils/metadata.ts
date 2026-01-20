import { BRAND } from '@roundtable/shared';

import { getAppBaseUrl } from '@/lib/config/base-urls';

/**
 * JSON-LD Structured Data Helpers
 * Functions to generate Schema.org structured data for SEO
 */

type JsonLdType = 'WebApplication' | 'Organization' | 'Product' | 'Article';

type BaseJsonLdProps = {
  type?: JsonLdType;
  name?: string;
  description?: string;
  url?: string;
  baseUrl?: string;
  logo?: string;
  image?: string;
  sameAs?: string[];
};

type ArticleJsonLdProps = BaseJsonLdProps & {
  type: 'Article';
  author?: string;
  datePublished?: string;
  dateModified?: string;
};

type ProductJsonLdProps = BaseJsonLdProps & {
  type: 'Product';
  price?: number;
  currency?: string;
};

type JsonLdProps = BaseJsonLdProps | ArticleJsonLdProps | ProductJsonLdProps;

/**
 * Create JSON-LD structured data for Schema.org
 * Used by StructuredData component for SEO
 */
export function createJsonLd(props: JsonLdProps) {
  const {
    type = 'WebApplication',
    name = BRAND.name,
    description = BRAND.description,
    baseUrl: providedBaseUrl,
    url = providedBaseUrl || getAppBaseUrl(),
    logo = `${providedBaseUrl || getAppBaseUrl()}/static/logo.svg`,
    image = `${providedBaseUrl || getAppBaseUrl()}/static/og-image.png`,
    sameAs = [
      BRAND.social.twitter,
      BRAND.social.linkedin,
      BRAND.social.github,
    ],
  } = props;

  const baseStructuredData = {
    '@context': 'https://schema.org',
    '@type': type,
    name,
    description,
    url,
    'image': {
      '@type': 'ImageObject',
      'url': image,
    },
    ...(type === 'Organization' || type === 'WebApplication'
      ? {
          logo: {
            '@type': 'ImageObject',
            'url': logo,
          },
          sameAs,
        }
      : {}),
  };

  if (type === 'WebApplication') {
    return {
      ...baseStructuredData,
      applicationCategory: 'BusinessApplication',
      applicationSubCategory: 'AI Collaboration Platform',
      operatingSystem: 'Any',
      browserRequirements: 'Requires JavaScript. Requires HTML5.',
      permissions: `${url}/terms`,
      offers: {
        '@type': 'Offer',
        'category': 'subscription',
      },
    };
  }

  if (type === 'Organization') {
    return {
      ...baseStructuredData,
      '@type': 'Organization',
      'founder': {
        '@type': 'Person',
        'name': BRAND.venture,
      },
      'contactPoint': {
        '@type': 'ContactPoint',
        'email': BRAND.support,
        'contactType': 'customer service',
      },
    };
  }

  if (type === 'Product' && 'price' in props) {
    const { price, currency = 'USD' } = props;
    return {
      ...baseStructuredData,
      '@type': 'Product',
      ...(price && {
        offers: {
          '@type': 'Offer',
          price,
          'priceCurrency': currency,
          'availability': 'https://schema.org/InStock',
        },
      }),
    };
  }

  if (type === 'Article' && 'author' in props) {
    const { author, datePublished, dateModified } = props;
    return {
      ...baseStructuredData,
      '@type': 'Article',
      'headline': name,
      ...(author && {
        author: {
          '@type': 'Person',
          'name': author,
        },
      }),
      ...(datePublished && { datePublished }),
      ...(dateModified && { dateModified }),
      'publisher': {
        '@type': 'Organization',
        'name': BRAND.name,
        'logo': {
          '@type': 'ImageObject',
          'url': logo,
        },
      },
    };
  }

  return baseStructuredData;
}

/**
 * Create breadcrumb JSON-LD structured data
 */
export function createBreadcrumbJsonLd(items: Array<{
  name: string;
  url: string;
}>) {
  const baseUrl = getAppBaseUrl();

  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    'itemListElement': items.map((item, index) => ({
      '@type': 'ListItem',
      'position': index + 1,
      'name': item.name,
      'item': item.url.startsWith('http') ? item.url : `${baseUrl}${item.url}`,
    })),
  };
}

/**
 * Create FAQ JSON-LD structured data
 */
export function createFaqJsonLd(faqs: Array<{
  question: string;
  answer: string;
}>) {
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
