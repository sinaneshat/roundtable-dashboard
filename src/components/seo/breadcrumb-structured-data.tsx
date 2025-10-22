import { createBreadcrumbJsonLd } from '@/utils/metadata';

/**
 * Props for the BreadcrumbStructuredData component
 */
type BreadcrumbStructuredDataProps = {
  /** Array of breadcrumb items */
  items: Array<{
    name: string;
    url: string;
  }>;
};

/**
 * BreadcrumbStructuredData component that injects breadcrumb JSON-LD into the page
 *
 * Helps search engines understand your site's navigation hierarchy.
 * Can result in breadcrumb rich results in Google Search.
 *
 * @example
 * ```tsx
 * <BreadcrumbStructuredData
 *   items={[
 *     { name: 'Home', url: '/' },
 *     { name: 'Chat', url: '/chat' },
 *     { name: 'Settings', url: '/chat/settings' },
 *   ]}
 * />
 * ```
 *
 * @param props - Breadcrumb items configuration
 * @param props.items - Array of breadcrumb items
 * @returns JSX script element with JSON-LD content
 */
export function BreadcrumbStructuredData({ items }: BreadcrumbStructuredDataProps) {
  const structuredData = createBreadcrumbJsonLd(items);

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(structuredData).replace(/</g, '\u003C'),
      }}
    />
  );
}
