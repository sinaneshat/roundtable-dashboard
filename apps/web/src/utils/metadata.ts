import { BRAND } from '@/constants';
import { getAppBaseUrl } from '@/lib/config/base-urls';

/**
 * Metadata type for TanStack Start
 * Replaces Next.js Metadata type
 */
export type Metadata = {
  metadataBase?: URL;
  title?: string;
  description?: string;
  keywords?: string;
  authors?: Array<{ name: string; url?: string }>;
  openGraph?: {
    title?: string;
    description?: string;
    url?: string;
    siteName?: string;
    images?: Array<{
      url: string;
      width?: number;
      height?: number;
      alt?: string;
    }>;
    locale?: string;
    type?: string;
    publishedTime?: string;
    modifiedTime?: string;
  };
  twitter?: {
    card?: 'summary' | 'summary_large_image' | 'app' | 'player';
    title?: string;
    description?: string;
    images?: string[];
    creator?: string;
    site?: string;
  };
  robots?: string;
  alternates?: {
    canonical?: string;
  };
  icons?: {
    icon?: Array<{ url: string; sizes?: string; type?: string }>;
    apple?: Array<{ url: string; sizes?: string; type?: string }>;
  };
  other?: Record<string, string>;
};

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
  image,
  url = '/',
  type = 'website',
  siteName = BRAND.fullName,
  robots = 'index, follow',
  canonicalUrl,
  keywords = ['AI collaboration', 'brainstorming', 'multiple AI models', 'Roundtable'],
  author = BRAND.name,
  publishedTime,
  modifiedTime,
}: CreateMetadataProps = {}): Metadata {
  const baseUrl = getAppBaseUrl();
  const fullUrl = url.startsWith('http') ? url : `${baseUrl}${url}`;

  const fullImage = image
    ? (image.startsWith('http') ? image : `${baseUrl}${image}`)
    : undefined;

  const openGraph: Metadata['openGraph'] = {
    title,
    description,
    url: fullUrl,
    siteName,
    ...(fullImage && {
      images: [
        {
          url: fullImage,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    }),
    locale: 'en_US',
    type,
    ...(publishedTime && { publishedTime }),
    ...(modifiedTime && { modifiedTime }),
  };

  const twitter: Metadata['twitter'] = {
    card: 'summary_large_image',
    title,
    description,
    ...(fullImage && { images: [fullImage] }),
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
    other: {
      'theme-color': BRAND.colors.primary,
      'msapplication-TileColor': BRAND.colors.primary,
      'mobile-web-app-capable': 'yes',
      'apple-mobile-web-app-status-bar-style': 'default',
      'format-detection': 'telephone=no',
    },
  };
}

/**
 * Helper to render metadata as HTML head tags
 * Use this in TanStack Start's root route
 */
export function renderMetadataToHead(metadata: Metadata): string {
  const tags: string[] = [];

  if (metadata.title) {
    tags.push(`<title>${metadata.title}</title>`);
    tags.push(`<meta property="og:title" content="${metadata.title}" />`);
    tags.push(`<meta name="twitter:title" content="${metadata.title}" />`);
  }

  if (metadata.description) {
    tags.push(`<meta name="description" content="${metadata.description}" />`);
    tags.push(`<meta property="og:description" content="${metadata.description}" />`);
    tags.push(`<meta name="twitter:description" content="${metadata.description}" />`);
  }

  if (metadata.keywords) {
    tags.push(`<meta name="keywords" content="${metadata.keywords}" />`);
  }

  if (metadata.robots) {
    tags.push(`<meta name="robots" content="${metadata.robots}" />`);
  }

  if (metadata.openGraph?.url) {
    tags.push(`<meta property="og:url" content="${metadata.openGraph.url}" />`);
  }

  if (metadata.openGraph?.siteName) {
    tags.push(`<meta property="og:site_name" content="${metadata.openGraph.siteName}" />`);
  }

  if (metadata.openGraph?.type) {
    tags.push(`<meta property="og:type" content="${metadata.openGraph.type}" />`);
  }

  if (metadata.openGraph?.images?.[0]) {
    const img = metadata.openGraph.images[0];
    tags.push(`<meta property="og:image" content="${img.url}" />`);
    if (img.width)
      tags.push(`<meta property="og:image:width" content="${img.width}" />`);
    if (img.height)
      tags.push(`<meta property="og:image:height" content="${img.height}" />`);
    if (img.alt)
      tags.push(`<meta property="og:image:alt" content="${img.alt}" />`);
  }

  if (metadata.twitter?.card) {
    tags.push(`<meta name="twitter:card" content="${metadata.twitter.card}" />`);
  }

  if (metadata.twitter?.creator) {
    tags.push(`<meta name="twitter:creator" content="${metadata.twitter.creator}" />`);
  }

  if (metadata.twitter?.site) {
    tags.push(`<meta name="twitter:site" content="${metadata.twitter.site}" />`);
  }

  if (metadata.alternates?.canonical) {
    tags.push(`<link rel="canonical" href="${metadata.alternates.canonical}" />`);
  }

  if (metadata.other) {
    for (const [key, value] of Object.entries(metadata.other)) {
      tags.push(`<meta name="${key}" content="${value}" />`);
    }
  }

  return tags.join('\n');
}
