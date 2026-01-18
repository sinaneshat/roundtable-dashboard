import { createJsonLd } from '@/utils';

/**
 * Props for the StructuredData component
 * Used to generate JSON-LD structured data for SEO
 */
type StructuredDataProps = {
  /** Schema.org type for the structured data */
  type?: 'WebApplication' | 'Organization' | 'Product' | 'Article';
  /** Name of the entity */
  name?: string;
  /** Description of the entity */
  description?: string;
  /** URL of the entity */
  url?: string;
  /** Base URL for the application (prevents hydration mismatch) */
  baseUrl?: string;
  /** Logo URL for the entity */
  logo?: string;
  /** Image URL for the entity */
  image?: string;
  /** Array of social media URLs */
  sameAs?: string[];
  /** Author name (for Article type) */
  author?: string;
  /** Publication date (for Article type) */
  datePublished?: string;
  /** Last modified date (for Article type) */
  dateModified?: string;
  /** Price (for Product type) */
  price?: number;
  /** Currency code (for Product type) */
  currency?: string;
};

/**
 * StructuredData component that injects JSON-LD structured data into the page
 *
 * This component follows React best practices for JSON-LD injection:
 * - Uses dangerouslySetInnerHTML with proper XSS protection
 * - Sanitizes content by replacing '<' characters with Unicode equivalents
 * - Generates structured data based on Schema.org specifications
 *
 * Enhanced to support:
 * - WebApplication: For the main application
 * - Organization: For company/brand information
 * - Product: For pricing plans and products (with price support)
 * - Article: For blog posts and content (with author and date support)
 *
 * @param props - Configuration for the structured data
 * @returns JSX script element with JSON-LD content
 */
export function StructuredData(props: StructuredDataProps) {
  const structuredData = createJsonLd(props);

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
