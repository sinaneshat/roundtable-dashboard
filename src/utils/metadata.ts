import type { Metadata } from 'next';

import { BRAND } from '@/constants/brand';
import { getAppBaseUrl } from '@/lib/config/base-urls';

export type CreateMetadataProps = {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
  type?: 'website' | 'article';
  siteName?: string;
  robots?: string;
  canonicalUrl?: string;
  keywords?: string[];
  author?: string;
  publishedTime?: string;
  modifiedTime?: string;
};

// Generate JSON-LD structured data for SEO
// Enhanced with Article support and additional fields
// ✅ FIX: Accept baseUrl to prevent hydration mismatch from getBaseUrl() using window.location
export function createJsonLd(props: {
  type?: 'WebApplication' | 'Organization' | 'Product' | 'Article';
  name?: string;
  description?: string;
  url?: string;
  baseUrl?: string;
  logo?: string;
  image?: string;
  sameAs?: string[];
  author?: string;
  datePublished?: string;
  dateModified?: string;
  price?: number;
  currency?: string;
}) {
  const {
    type = 'WebApplication',
    name = BRAND.fullName,
    description = BRAND.description,
    baseUrl: providedBaseUrl,
    url = providedBaseUrl || getAppBaseUrl(),
    logo = `${providedBaseUrl || getAppBaseUrl()}/static/logo.png`,
    image = `${providedBaseUrl || getAppBaseUrl()}/static/og-image.png`,
    sameAs = [
      BRAND.social.twitter,
      BRAND.social.linkedin,
      BRAND.social.github,
    ],
    author,
    datePublished,
    dateModified,
    price,
    currency = 'USD',
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

  if (type === 'Product') {
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

  if (type === 'Article') {
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
        'name': BRAND.fullName,
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
 * Generate breadcrumb structured data for navigation SEO
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
 * Generate FAQ structured data for rich snippets
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

export function createMetadata({
  title = BRAND.fullName,
  description = BRAND.description,
  image = '/static/og-image.png', // Use the new OpenGraph image
  url = '/',
  type = 'website',
  siteName = BRAND.fullName,
  robots = 'index, follow',
  canonicalUrl,
  keywords = ['AI collaboration', 'dashboard', 'brainstorming', 'multiple models', 'Roundtable'],
  author = BRAND.name,
  publishedTime,
  modifiedTime,
}: CreateMetadataProps = {}): Metadata {
  const baseUrl = getAppBaseUrl();
  const fullUrl = url.startsWith('http') ? url : `${baseUrl}${url}`;
  const fullImage = image.startsWith('http') ? image : `${baseUrl}${image}`;

  const openGraph: Metadata['openGraph'] = {
    title,
    description,
    url: fullUrl,
    siteName,
    images: [
      {
        url: fullImage,
        width: 1200,
        height: 630,
        alt: title,
      },
    ],
    locale: 'en_US',
    type,
    ...(publishedTime && { publishedTime }),
    ...(modifiedTime && { modifiedTime }),
  };

  const twitter: Metadata['twitter'] = {
    card: 'summary_large_image',
    title,
    description,
    images: [fullImage],
    creator: '@roundtablenow',
    site: '@roundtablenow',
  };

  return {
    metadataBase: new URL(baseUrl),
    title,
    description,
    keywords: keywords.join(', '),
    authors: [{ name: author }],
    openGraph,
    twitter,
    robots,
    alternates: {
      canonical: canonicalUrl || fullUrl,
    },
    icons: {
      icon: [
        { url: '/favicon.ico', sizes: '32x32', type: 'image/x-icon' },
      ],
      apple: [
        { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
      ],
    },
    // Manifest auto-generated by Next.js from src/app/manifest.ts
    other: {
      'theme-color': BRAND.colors.primary,
      'msapplication-TileColor': BRAND.colors.primary,
      'mobile-web-app-capable': 'yes',
      'apple-mobile-web-app-status-bar-style': 'default',
      'format-detection': 'telephone=no',
    },
  };
}
