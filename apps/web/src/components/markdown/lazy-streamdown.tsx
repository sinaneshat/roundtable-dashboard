/**
 * Lightweight markdown renderer - replaces Streamdown
 *
 * PERFORMANCE: Uses ReactMarkdown instead of Streamdown to avoid loading:
 * - shiki full bundle (~3MB of language grammars)
 * - mermaid (~451KB)
 * - cytoscape (~441KB)
 *
 * Code highlighting is handled by our custom code-block-highlighter which
 * only loads 16 common languages on demand.
 *
 * Mermaid diagrams are lazy-loaded only when detected.
 */

import type { ComponentPropsWithoutRef } from 'react';
import { lazy, memo, Suspense, useMemo } from 'react';
import type { Components } from 'react-markdown';
import ReactMarkdown from 'react-markdown';

// Lazy-load mermaid renderer only when mermaid blocks are detected
const LazyMermaid = lazy(() => import('./lazy-mermaid'));

type LazyStreamdownProps = {
  children: string;
  className?: string;
  components?: Components;
};

/**
 * Detect if markdown contains mermaid code blocks
 */
function hasMermaidBlocks(content: string): boolean {
  return /```mermaid/i.test(content);
}

/**
 * Custom pre component that detects mermaid and renders it lazily
 * Falls back to native <pre> for all other code blocks
 */
function MermaidAwarePre(props: ComponentPropsWithoutRef<'pre'>) {
  const { children, ...rest } = props;

  // Check if this is a mermaid code block
  if (children && typeof children === 'object' && 'props' in children) {
    const childProps = children.props as { className?: string; children?: string };
    if (childProps.className?.includes('language-mermaid') && typeof childProps.children === 'string') {
      return (
        <Suspense fallback={<div className="animate-pulse bg-muted rounded-lg h-32" />}>
          <LazyMermaid chart={childProps.children} />
        </Suspense>
      );
    }
  }

  return <pre {...rest}>{children}</pre>;
}

function LazyStreamdownComponent({ children, className, components }: LazyStreamdownProps) {
  // Only add mermaid-aware pre component if content might have mermaid
  const enhancedComponents = useMemo((): Components => {
    if (!hasMermaidBlocks(children)) {
      return components ?? {};
    }
    return {
      ...components,
      pre: MermaidAwarePre,
    };
  }, [children, components]);

  return (
    <div className={className}>
      <ReactMarkdown components={enhancedComponents}>
        {children}
      </ReactMarkdown>
    </div>
  );
}

/**
 * Lightweight markdown renderer
 *
 * Use this instead of importing Streamdown directly to avoid
 * loading ~4MB of shiki languages, mermaid, and cytoscape.
 *
 * Mermaid diagrams are lazy-loaded only when detected in content.
 */
export const LazyStreamdown = memo(LazyStreamdownComponent);
