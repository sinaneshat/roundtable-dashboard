/**
 * Lightweight markdown renderer - replaces Streamdown
 *
 * PERFORMANCE: Lazy-loads ReactMarkdown to avoid loading on initial page load:
 * - react-markdown (~116KB raw, 36KB gzipped)
 * - remark/rehype/unified processing chain
 * - shiki code highlighting (lazy-loaded separately)
 * - mermaid diagrams (lazy-loaded only when detected)
 *
 * Code highlighting is handled by our custom code-block-highlighter which
 * only loads 16 common languages on demand.
 *
 * NO SKELETON: Uses null fallback to prevent flicker during SSR hydration.
 * Markdown content is pre-rendered on server, so no loading state is needed.
 */

import { lazy, memo, Suspense } from 'react';
import type { Components } from 'react-markdown';

// ============================================================================
// LAZY-LOADED MARKDOWN WITH MERMAID SUPPORT
// ============================================================================

/**
 * Lazy-load the streamdown content module
 * This defers react-markdown and all markdown processing until needed
 */
const StreamdownContent = lazy(() => import('./streamdown-content'));

// ============================================================================
// LAZY STREAMDOWN COMPONENT
// ============================================================================

type LazyStreamdownProps = {
  children: string;
  className?: string;
  components?: Components;
};

/**
 * Lazy-loaded markdown renderer with mermaid support
 *
 * PERFORMANCE: Defers loading of react-markdown (116KB raw, 36KB gzipped)
 * until the component is rendered. Automatically wraps in Suspense boundary.
 *
 * NO SKELETON: Uses null fallback. SSR pre-renders markdown content, so
 * no loading state is visible to users. This prevents skeleton flash.
 *
 * Use this instead of importing Streamdown directly to avoid
 * loading markdown processing code on initial page load.
 *
 * Mermaid diagrams are lazy-loaded only when detected in content.
 *
 * @example
 * ```tsx
 * <LazyStreamdown components={streamdownComponents}>
 *   {markdownContent}
 * </LazyStreamdown>
 * ```
 */
function LazyStreamdownComponent({
  children,
  className,
  components,
}: LazyStreamdownProps) {
  // NO SKELETON: SSR pre-renders content, null fallback prevents flash
  return (
    <Suspense fallback={null}>
      <StreamdownContent className={className} components={components}>
        {children}
      </StreamdownContent>
    </Suspense>
  );
}

/**
 * Lightweight markdown renderer
 *
 * Use this instead of importing Streamdown directly to avoid
 * loading markdown processing code (~36KB gzipped) on initial page load.
 *
 * Mermaid diagrams are lazy-loaded only when detected in content.
 */
export const LazyStreamdown = memo(LazyStreamdownComponent);
