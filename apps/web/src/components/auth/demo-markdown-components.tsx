/**
 * Lightweight markdown renderer for auth demo
 *
 * PERFORMANCE: Doesn't import streamdown/shiki/react-markdown
 * to avoid loading 262KB content-vendor on sign-in page.
 *
 * Only supports: bold (**text**), em (*text*), inline code (`code`)
 */

import type { ReactNode } from 'react';
import { memo, useMemo } from 'react';

import { cn } from '@/lib/ui/cn';

type SimpleMarkdownProps = {
  children: string;
  className?: string;
};

/**
 * Parse simple markdown and return React nodes
 * Supports: **bold**, *italic*, `code`
 */
function parseSimpleMarkdown(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // Match **bold**, *italic*, or `code`
  const regex = /\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  // eslint-disable-next-line no-cond-assign -- Standard regex exec loop pattern
  while ((match = regex.exec(text)) !== null) {
    // Add text before match
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const matched = match[0];
    if (matched.startsWith('**') && matched.endsWith('**')) {
      // Bold
      nodes.push(<strong key={key++} className="font-semibold">{matched.slice(2, -2)}</strong>);
    } else if (matched.startsWith('*') && matched.endsWith('*')) {
      // Italic
      nodes.push(<em key={key++} className="italic">{matched.slice(1, -1)}</em>);
    } else if (matched.startsWith('`') && matched.endsWith('`')) {
      // Inline code
      nodes.push(
        <code key={key++} className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono">
          {matched.slice(1, -1)}
        </code>,
      );
    }

    lastIndex = regex.lastIndex;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

function SimpleMarkdownComponent({ children, className }: SimpleMarkdownProps) {
  const parsed = useMemo(() => parseSimpleMarkdown(children), [children]);

  return (
    <div dir="auto" className={cn('text-base leading-7', className)}>
      {parsed}
    </div>
  );
}

/**
 * Lightweight markdown renderer - no external dependencies
 * Use this instead of Streamdown for simple text with bold/italic/code
 */
export const SimpleMarkdown = memo(SimpleMarkdownComponent);
