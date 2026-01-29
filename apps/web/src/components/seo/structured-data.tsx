import { z } from 'zod';

import type { JsonLdData } from '@/lib/seo';
import {
  createArticleJsonLd,
  createOrganizationJsonLd,
  createProductJsonLd,
  createSoftwareAppJsonLd,
  createWebPageJsonLd,
  serializeJsonLd,
} from '@/lib/seo';

/**
 * Props for the StructuredData component
 * Uses discriminated union for type-safe props based on schema type
 */
const BasePropsSchema = z.object({
  /** Schema.org type for the structured data */
  type: z.enum(['WebApplication', 'Organization', 'Product', 'Article', 'WebPage']).optional(),
});

/**
 * Schema for Article structured data props
 */
const ArticlePropsSchema = BasePropsSchema.extend({
  /** Author name */
  author: z.string().optional(),
  /** Last modified date */
  dateModified: z.string().optional(),
  /** Publication date */
  datePublished: z.string().optional(),
  /** Description of the article */
  description: z.string(),
  /** Headline for the article */
  headline: z.string(),
  /** Image URL */
  image: z.string().optional(),
  /** Path to the article */
  path: z.string(),
  type: z.literal('Article'),
});

/**
 * Schema for Product structured data props
 */
const ProductPropsSchema = BasePropsSchema.extend({
  /** Currency code */
  currency: z.string().optional(),
  /** Product description */
  description: z.string(),
  /** Product name */
  name: z.string(),
  /** Path to product page */
  path: z.string().optional(),
  /** Price */
  price: z.number(),
  type: z.literal('Product'),
});

/**
 * Schema for WebPage structured data props
 */
const WebPagePropsSchema = BasePropsSchema.extend({
  /** Description of the page */
  description: z.string(),
  /** Page name/title */
  name: z.string(),
  /** Path to the page */
  path: z.string(),
  type: z.literal('WebPage'),
});

/**
 * Discriminated union schema for StructuredData props
 */
const _StructuredDataPropsSchema = z.union([
  z.object({ type: z.literal('WebApplication').optional() }),
  z.object({ type: z.literal('Organization') }),
  ArticlePropsSchema,
  ProductPropsSchema,
  WebPagePropsSchema,
]);
type StructuredDataProps = z.infer<typeof _StructuredDataPropsSchema>;

/**
 * StructuredData component that injects JSON-LD structured data into the page
 *
 * Uses type-safe schema-dts builders for Schema.org structured data:
 * - WebApplication: For the main application (default)
 * - Organization: For company/brand information
 * - Product: For pricing plans and products
 * - Article: For blog posts and content
 * - WebPage: For generic pages (legal, about, etc.)
 */
export function StructuredData(props: StructuredDataProps) {
  let structuredData: JsonLdData;

  switch (props.type) {
    case 'Organization':
      structuredData = createOrganizationJsonLd();
      break;
    case 'Article':
      structuredData = createArticleJsonLd({
        author: props.author,
        dateModified: props.dateModified,
        datePublished: props.datePublished,
        description: props.description,
        headline: props.headline,
        image: props.image,
        path: props.path,
      });
      break;
    case 'Product':
      structuredData = createProductJsonLd({
        currency: props.currency,
        description: props.description,
        name: props.name,
        path: props.path,
        price: props.price,
      });
      break;
    case 'WebPage':
      structuredData = createWebPageJsonLd({
        description: props.description,
        name: props.name,
        path: props.path,
      });
      break;
    case 'WebApplication':
    default:
      structuredData = createSoftwareAppJsonLd();
      break;
  }

  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react-dom/no-dangerously-set-innerhtml -- Required for JSON-LD structured data injection (SEO)
      dangerouslySetInnerHTML={{
        __html: serializeJsonLd(structuredData),
      }}
    />
  );
}
