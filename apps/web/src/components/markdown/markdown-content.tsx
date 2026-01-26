/**
 * Markdown Content Component
 *
 * This component is lazy-loaded by LazyMarkdownRenderer.
 * It contains the actual react-markdown imports and rendering logic.
 *
 * DO NOT import this directly in components - use LazyMarkdownRenderer instead.
 */

import { memo } from 'react';
import type { Components } from 'react-markdown';
import ReactMarkdown from 'react-markdown';

import { streamdownComponents } from '@/components/markdown/unified-markdown-components';
import { cn } from '@/lib/ui/cn';

type MarkdownContentProps = {
  content: string;
  className?: string;
  components?: Components;
};

function MarkdownContentComponent({ className, components, content }: MarkdownContentProps) {
  return (
    <div className={cn('min-w-0', className)}>
      <ReactMarkdown components={components ?? streamdownComponents}>
        {content}
      </ReactMarkdown>
    </div>
  );
}

export default memo(MarkdownContentComponent);
