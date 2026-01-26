/**
 * Lazy Markdown Renderer
 *
 * PERFORMANCE: Defers loading of react-markdown (116KB raw, 36KB gzipped)
 * and its dependencies until markdown content needs to be rendered.
 *
 * This prevents loading 92KB of unused markdown processing code on initial page load (78% waste).
 *
 * NO SKELETON: Uses null fallback to prevent flicker during SSR hydration.
 * Markdown content is pre-rendered on server, so no loading state is needed.
 *
 * Usage:
 * ```tsx
 * <LazyMarkdownRenderer content={markdownText} />
 * ```
 */

import type { ComponentPropsWithoutRef } from 'react';
import { lazy, memo, Suspense } from 'react';

// ============================================================================
// LAZY-LOADED MARKDOWN COMPONENTS
// ============================================================================

/**
 * Lazy-load the entire markdown rendering module
 * This defers react-markdown, remark, rehype, and unified until needed
 */
const LazyMarkdownContent = lazy(() => import('./markdown-content'));

// ============================================================================
// LAZY MARKDOWN RENDERER WRAPPER
// ============================================================================

type LazyMarkdownRendererProps = {
  /** Markdown content to render */
  content: string;
  /** Additional className for the wrapper */
  className?: string;
  /** Custom React Markdown components (optional) */
  components?: ComponentPropsWithoutRef<typeof LazyMarkdownContent>['components'];
};

/**
 * Lazy-loaded markdown renderer with automatic suspense boundary
 *
 * NO SKELETON: Uses null fallback. SSR pre-renders markdown content, so
 * no loading state is visible to users. This prevents skeleton flash.
 *
 * @example
 * ```tsx
 * // Simple usage - Suspense is automatic
 * <LazyMarkdownRenderer content="# Hello\nWorld" />
 *
 * // With custom components
 * <LazyMarkdownRenderer
 *   content={text}
 *   components={customComponents}
 * />
 * ```
 */
function LazyMarkdownRendererComponent({
  className,
  components,
  content,
}: LazyMarkdownRendererProps) {
  // NO SKELETON: SSR pre-renders content, null fallback prevents flash
  return (
    <Suspense fallback={null}>
      <LazyMarkdownContent content={content} className={className} components={components} />
    </Suspense>
  );
}

export const LazyMarkdownRenderer = memo(LazyMarkdownRendererComponent);

// ============================================================================
// EXPORTS
// ============================================================================

/**
 * Re-export for consumers who want manual Suspense control
 */
export { LazyMarkdownContent };
