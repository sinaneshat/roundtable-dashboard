import { BRAND } from '@/constants/brand';
import { getBaseUrl } from '@/utils/helpers';

// Stable default values to prevent re-renders
const DEFAULT_FEATURES = [
  'Multi-model AI collaboration',
  'Real-time chat interface',
  'Session management',
  'Public sharing',
  'Usage tracking',
];
const DEFAULT_LANGUAGES = ['en-US'];
const DEFAULT_SCREENSHOTS = [`${getBaseUrl()}/static/og-image.png`];

/**
 * Props for the SoftwareApplicationSchema component
 * Enhanced for 2025 AI search optimization
 */
type SoftwareApplicationSchemaProps = {
  /** Application name (defaults to brand name) */
  name?: string;
  /** Application description */
  description?: string;
  /** Application version */
  version?: string;
  /** Price (free or amount) */
  price?: string | number;
  /** Currency code */
  currency?: string;
  /** Rating value (1-5) */
  ratingValue?: number;
  /** Number of ratings */
  ratingCount?: number;
  /** Aggregated reviews count */
  reviewCount?: number;
  /** Release date */
  releaseDate?: string;
  /** Feature list */
  features?: string[];
  /** Supported languages */
  inLanguage?: string[];
  /** Software requirements */
  softwareRequirements?: string;
  /** Support URL */
  supportUrl?: string;
  /** Screenshot URLs */
  screenshots?: string[];
};

/**
 * SoftwareApplication structured data for AI search engines
 *
 * 2025 Best Practices:
 * - Enhanced with SearchAction for voice assistants
 * - Includes aggregateRating for trust signals
 * - Features list for entity recognition
 * - Multiple application categories for better discovery
 * - Offers information for pricing transparency
 *
 * This schema helps:
 * - ChatGPT and Perplexity understand your software
 * - Google display rich results
 * - Voice assistants provide accurate information
 */
export function SoftwareApplicationSchema(props: SoftwareApplicationSchemaProps) {
  const {
    name = BRAND.fullName,
    description = BRAND.description,
    version = '1.0.0',
    price = 0,
    currency = 'USD',
    ratingValue,
    ratingCount,
    reviewCount,
    releaseDate,
    features = DEFAULT_FEATURES,
    inLanguage = DEFAULT_LANGUAGES,
    softwareRequirements = 'Requires JavaScript. Requires HTML5. Works on any modern browser.',
    supportUrl = `${getBaseUrl()}/support`,
    screenshots = DEFAULT_SCREENSHOTS,
  } = props;

  const baseUrl = getBaseUrl();

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    'name': name,
    'description': description,
    'url': baseUrl,
    'applicationCategory': 'BusinessApplication',
    'applicationSubCategory': 'Productivity Software',
    'operatingSystem': 'Any',
    'browserRequirements': softwareRequirements,
    'softwareVersion': version,
    'offers': {
      '@type': 'Offer',
      'price': price.toString(),
      'priceCurrency': currency,
      'availability': 'https://schema.org/InStock',
      'url': baseUrl,
      'priceValidUntil': new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    },
    'provider': {
      '@type': 'Organization',
      'name': BRAND.venture,
      'url': BRAND.website,
      'logo': {
        '@type': 'ImageObject',
        'url': `${baseUrl}/static/logo.png`,
      },
      'sameAs': [
        BRAND.social.twitter,
        BRAND.social.linkedin,
        BRAND.social.github,
      ],
    },
    'creator': {
      '@type': 'Organization',
      'name': BRAND.venture,
    },
    'screenshot': screenshots.map(url => ({
      '@type': 'ImageObject',
      'url': url,
      'contentUrl': url,
    })),
    'featureList': features,
    'inLanguage': inLanguage,
    'potentialAction': {
      '@type': 'SearchAction',
      'target': {
        '@type': 'EntryPoint',
        'urlTemplate': `${baseUrl}/chat?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
    'softwareHelp': {
      '@type': 'CreativeWork',
      'url': supportUrl,
    },
    ...(releaseDate && { datePublished: releaseDate }),
    ...(ratingValue && ratingCount && {
      aggregateRating: {
        '@type': 'AggregateRating',
        'ratingValue': ratingValue,
        'ratingCount': ratingCount,
        'bestRating': 5,
        'worstRating': 1,
      },
    }),
    ...(reviewCount && { reviewCount }),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(structuredData).replace(/</g, '\u003C'),
      }}
    />
  );
}
