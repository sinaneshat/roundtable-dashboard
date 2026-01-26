/**
 * Streamdown Content Component
 *
 * This component is lazy-loaded by LazyStreamdown.
 * It contains the actual react-markdown imports and mermaid detection logic.
 *
 * DO NOT import this directly in components - use LazyStreamdown instead.
 */

import type { ComponentPropsWithoutRef } from 'react';
import { lazy, memo, Suspense, useMemo } from 'react';
import type { Components } from 'react-markdown';
import ReactMarkdown from 'react-markdown';
import { z } from 'zod';

import { cn } from '@/lib/ui/cn';

// Lazy-load mermaid renderer only when mermaid blocks are detected
const LazyMermaid = lazy(() => import('./lazy-mermaid'));

// ============================================================================
// MERMAID CODE ELEMENT SCHEMA - Zod-based validation
// ============================================================================

/**
 * Schema for React element with mermaid code block props
 * Used to safely extract mermaid chart content from pre > code structure
 */
const MermaidCodeElementSchema = z.object({
  props: z.object({
    children: z.string(),
    className: z.string().refine(c => c.includes('language-mermaid'), {
      message: 'Must be a mermaid language code block',
    }),
  }),
});

/**
 * Detect if markdown contains mermaid code blocks
 */
function hasMermaidBlocks(content: string): boolean {
  return /```mermaid/i.test(content);
}

/**
 * Extract mermaid chart content from code element using Zod validation
 * Returns null if not a valid mermaid code block
 */
function extractMermaidChart(children: unknown): string | null {
  const result = MermaidCodeElementSchema.safeParse(children);
  if (!result.success) {
    return null;
  }
  return result.data.props.children;
}

/**
 * Custom pre component that detects mermaid and renders it lazily
 * Falls back to native <pre> for all other code blocks
 */
function MermaidAwarePre(props: ComponentPropsWithoutRef<'pre'>) {
  const { children, ...rest } = props;

  // Use Zod-based validation to safely extract mermaid chart content
  const mermaidChart = extractMermaidChart(children);
  if (mermaidChart) {
    return (
      <Suspense fallback={<div className="animate-pulse bg-muted/30 border border-border/50 rounded-xl h-32 my-4" />}>
        <LazyMermaid chart={mermaidChart} />
      </Suspense>
    );
  }

  return <pre {...rest}>{children}</pre>;
}

// ============================================================================
// STREAMDOWN CONTENT COMPONENT
// ============================================================================

type StreamdownContentProps = {
  children: string;
  className?: string;
  components?: Components;
};

function StreamdownContentComponent({ children, className, components }: StreamdownContentProps) {
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
    <div className={cn('min-w-0', className)}>
      <ReactMarkdown components={enhancedComponents}>
        {children}
      </ReactMarkdown>
    </div>
  );
}

export default memo(StreamdownContentComponent);
