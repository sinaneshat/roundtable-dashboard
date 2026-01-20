import type { JsonLdData } from '@/lib/seo';
import {
  createArticleJsonLd,
  createOrganizationJsonLd,
  createProductJsonLd,
  createSoftwareAppJsonLd,
  serializeJsonLd,
} from '@/lib/seo';

/**
 * Props for the StructuredData component
 * Uses discriminated union for type-safe props based on schema type
 */
type BaseProps = {
  /** Schema.org type for the structured data */
  type?: 'WebApplication' | 'Organization' | 'Product' | 'Article';
};

type ArticleProps = BaseProps & {
  type: 'Article';
  /** Headline for the article */
  headline: string;
  /** Description of the article */
  description: string;
  /** Path to the article */
  path: string;
  /** Author name */
  author?: string;
  /** Publication date */
  datePublished?: string;
  /** Last modified date */
  dateModified?: string;
  /** Image URL */
  image?: string;
};

type ProductProps = BaseProps & {
  type: 'Product';
  /** Product name */
  name: string;
  /** Product description */
  description: string;
  /** Price */
  price: number;
  /** Currency code */
  currency?: string;
  /** Path to product page */
  path?: string;
};

type StructuredDataProps
  = | { type?: 'WebApplication' }
    | { type: 'Organization' }
    | ArticleProps
    | ProductProps;

/**
 * StructuredData component that injects JSON-LD structured data into the page
 *
 * Uses type-safe schema-dts builders for Schema.org structured data:
 * - WebApplication: For the main application (default)
 * - Organization: For company/brand information
 * - Product: For pricing plans and products
 * - Article: For blog posts and content
 */
export function StructuredData(props: StructuredDataProps) {
  let structuredData: JsonLdData;

  switch (props.type) {
    case 'Organization':
      structuredData = createOrganizationJsonLd();
      break;
    case 'Article':
      structuredData = createArticleJsonLd({
        headline: props.headline,
        description: props.description,
        path: props.path,
        author: props.author,
        datePublished: props.datePublished,
        dateModified: props.dateModified,
        image: props.image,
      });
      break;
    case 'Product':
      structuredData = createProductJsonLd({
        name: props.name,
        description: props.description,
        price: props.price,
        currency: props.currency,
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
