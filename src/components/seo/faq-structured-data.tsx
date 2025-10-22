import { createFaqJsonLd } from '@/utils/metadata';

/**
 * Props for the FaqStructuredData component
 */
type FaqStructuredDataProps = {
  /** Array of FAQ items */
  faqs: Array<{
    question: string;
    answer: string;
  }>;
};

/**
 * FaqStructuredData component that injects FAQ JSON-LD into the page
 *
 * Helps your FAQ content appear as rich results in Google Search.
 * Can improve visibility and click-through rates for support pages.
 *
 * @example
 * ```tsx
 * <FaqStructuredData
 *   faqs={[
 *     {
 *       question: 'How do I get started?',
 *       answer: 'Sign up for a free account and follow the onboarding guide.',
 *     },
 *     {
 *       question: 'What payment methods do you accept?',
 *       answer: 'We accept all major credit cards and PayPal.',
 *     },
 *   ]}
 * />
 * ```
 *
 * @param props - FAQ items configuration
 * @param props.faqs - Array of FAQ items with questions and answers
 * @returns JSX script element with JSON-LD content
 */
export function FaqStructuredData({ faqs }: FaqStructuredDataProps) {
  const structuredData = createFaqJsonLd(faqs);

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(structuredData).replace(/</g, '\u003C'),
      }}
    />
  );
}
