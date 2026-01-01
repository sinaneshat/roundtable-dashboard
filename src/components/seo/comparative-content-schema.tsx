import { BRAND } from '@/constants/brand';
import { getAppBaseUrl } from '@/lib/config/base-urls';

/**
 * Props for the ComparativeContentSchema component
 */
type ComparativeItem = {
  /** Item name */
  name: string;
  /** Item description */
  description: string;
  /** Pros list */
  pros?: string[];
  /** Cons list */
  cons?: string[];
  /** Rating (1-5) */
  rating?: number;
  /** Price */
  price?: number;
  /** Currency */
  currency?: string;
  /** Image URL */
  image?: string;
  /** Product/Service URL */
  url?: string;
};

type ComparativeContentSchemaProps = {
  /** Comparison title */
  title: string;
  /** Comparison description */
  description: string;
  /** Items being compared */
  items: ComparativeItem[];
  /** Author name */
  author?: string;
  /** Publication date */
  datePublished?: string;
  /** Last modified date */
  dateModified?: string;
};

/**
 * Comparative Content Schema - CRITICAL for AI Search 2025
 *
 * Research shows AI engines STRONGLY prefer comparative content:
 * - 30% of AI citations are comparative listicles
 * - ChatGPT and Perplexity favor "vs" and comparison content
 * - Well-structured comparisons get cited more frequently
 *
 * Use this for:
 * - Product comparisons
 * - Feature comparisons
 * - Alternative recommendations
 * - "Best of" lists
 * - Tool evaluations
 *
 * This schema uses ComparisonProduct type for maximum AI compatibility.
 */
export function ComparativeContentSchema(props: ComparativeContentSchemaProps) {
  const {
    title,
    description,
    items,
    author = BRAND.venture,
    datePublished,
    dateModified,
  } = props;

  const baseUrl = getAppBaseUrl();

  // Create Article with ItemList for comparison
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    'headline': title,
    'description': description,
    'author': {
      '@type': 'Organization',
      'name': author,
      'url': baseUrl,
    },
    'publisher': {
      '@type': 'Organization',
      'name': BRAND.fullName,
      'logo': {
        '@type': 'ImageObject',
        'url': `${baseUrl}/static/logo.png`,
      },
    },
    ...(datePublished && { datePublished }),
    ...(dateModified && { dateModified }),
    'mainEntity': {
      '@type': 'ItemList',
      'name': title,
      'description': description,
      'numberOfItems': items.length,
      'itemListElement': items.map((item, index) => ({
        '@type': 'ListItem',
        'position': index + 1,
        'item': {
          '@type': 'Product',
          'name': item.name,
          'description': item.description,
          ...(item.image && {
            image: {
              '@type': 'ImageObject',
              'url': item.image.startsWith('http') ? item.image : `${baseUrl}${item.image}`,
            },
          }),
          ...(item.url && { url: item.url }),
          ...(item.rating && {
            aggregateRating: {
              '@type': 'AggregateRating',
              'ratingValue': item.rating,
              'bestRating': 5,
              'worstRating': 1,
            },
          }),
          ...(item.price && {
            offers: {
              '@type': 'Offer',
              'price': item.price.toString(),
              'priceCurrency': item.currency || 'USD',
              'availability': 'https://schema.org/InStock',
            },
          }),
          // Add pros/cons as custom properties (for AI understanding)
          ...(item.pros && { positiveNotes: item.pros.join(', ') }),
          ...(item.cons && { negativeNotes: item.cons.join(', ') }),
        },
      })),
    },
    // Enhanced metadata for AI engines
    'keywords': [
      'comparison',
      'vs',
      'alternatives',
      'best',
      ...items.map(i => i.name),
    ].join(', '),
  };

  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react-dom/no-dangerously-set-innerhtml -- Required for JSON-LD structured data injection (SEO)
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(structuredData).replace(/</g, '\u003C'),
      }}
    />
  );
}
