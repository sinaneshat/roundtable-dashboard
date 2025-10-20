/**
 * Answer Engine Optimization (AEO) Meta Tags
 *
 * 2025 AI Search Optimization:
 * - Optimized for ChatGPT, Perplexity, Gemini, Claude
 * - Helps AI understand content structure
 * - Improves citation chances in AI responses
 * - Entity-rich markup for better comprehension
 *
 * Key Strategies:
 * - Clear, concise answers
 * - Entity-focused keywords
 * - Comparative content structure
 * - Q&A format support
 */

// Stable default values to prevent re-renders
const EMPTY_ENTITIES: string[] = [];
const EMPTY_RELATED_QUESTIONS: string[] = [];

type AeoMetaTagsProps = {
  /** Primary question this page answers */
  primaryQuestion?: string;
  /** Direct answer (concise) */
  primaryAnswer?: string;
  /** Content type for AI engines */
  contentType?: 'how-to' | 'comparison' | 'review' | 'guide' | 'faq' | 'tutorial';
  /** Key entities mentioned in the content */
  entities?: string[];
  /** Related questions */
  relatedQuestions?: string[];
  /** Content difficulty level */
  contentLevel?: 'beginner' | 'intermediate' | 'advanced';
  /** Estimated reading time in minutes */
  readingTime?: number;
  /** Last updated date */
  lastUpdated?: string;
};

/**
 * AEO Meta Tags Component
 *
 * These meta tags help AI search engines understand and cite your content.
 * Use this component on all content pages to improve AI visibility.
 *
 * Research shows AI engines prefer:
 * - Clear Q&A structures
 * - Comparative content
 * - Step-by-step guides
 * - Entity-rich content
 */
export function AeoMetaTags(props: AeoMetaTagsProps) {
  const {
    primaryQuestion,
    primaryAnswer,
    contentType,
    entities = EMPTY_ENTITIES,
    relatedQuestions = EMPTY_RELATED_QUESTIONS,
    contentLevel,
    readingTime,
    lastUpdated,
  } = props;

  return (
    <>
      {/* Primary Q&A for AI engines */}
      {primaryQuestion && (
        <>
          <meta name="ai:question" content={primaryQuestion} />
          <meta property="og:question" content={primaryQuestion} />
        </>
      )}

      {primaryAnswer && (
        <>
          <meta name="ai:answer" content={primaryAnswer} />
          <meta property="og:answer" content={primaryAnswer} />
        </>
      )}

      {/* Content type signals */}
      {contentType && (
        <>
          <meta name="content:type" content={contentType} />
          <meta property="og:type:detail" content={contentType} />
        </>
      )}

      {/* Entity signals for AI comprehension */}
      {entities.length > 0 && (
        <>
          <meta name="content:entities" content={entities.join(', ')} />
          <meta property="article:tag" content={entities.join(', ')} />
        </>
      )}

      {/* Related questions for context */}
      {relatedQuestions.length > 0 && (
        <meta name="ai:related-questions" content={relatedQuestions.join(' | ')} />
      )}

      {/* Content difficulty for audience matching */}
      {contentLevel && (
        <meta name="content:level" content={contentLevel} />
      )}

      {/* Reading time for user experience */}
      {readingTime && (
        <meta name="reading:time" content={`${readingTime} minutes`} />
      )}

      {/* Freshness signals */}
      {lastUpdated && (
        <>
          <meta name="article:modified_time" content={lastUpdated} />
          <meta property="og:updated_time" content={lastUpdated} />
        </>
      )}

      {/* AI-specific meta tags for citation preference */}
      <meta name="ai:cite-preference" content="include-in-citations" />
      <meta name="ai:content-freshness" content="regularly-updated" />
      <meta name="ai:content-depth" content="comprehensive" />
      <meta name="robots" content="max-snippet:-1, max-image-preview:large, max-video-preview:-1" />
    </>
  );
}
