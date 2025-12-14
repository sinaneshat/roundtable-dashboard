'use client';

import type { HTMLAttributes, ReactNode } from 'react';
import { Children, isValidElement } from 'react';

import { CodeBlock, CodeBlockCopyButton, InlineCode } from '@/components/ai-elements/code-block';
import { cn } from '@/lib/ui/cn';

/**
 * Extract language from className like "language-typescript" or "language-tsx"
 */
function extractLanguage(className?: string): string {
  if (!className)
    return 'text';

  const match = className.match(/language-(\w+)/);
  return match?.[1] ?? 'text';
}

/**
 * Extract text content from React children (handles nested elements)
 */
function extractTextContent(children: ReactNode): string {
  if (typeof children === 'string') {
    return children;
  }

  if (Array.isArray(children)) {
    return children.map(extractTextContent).join('');
  }

  if (isValidElement(children)) {
    const props = children.props as Record<string, unknown>;
    if (props && 'children' in props) {
      return extractTextContent(props.children as ReactNode);
    }
  }

  return '';
}

type MarkdownCodeProps = HTMLAttributes<HTMLElement> & {
  inline?: boolean;
  node?: unknown;
};

/**
 * MarkdownCode - Code component for react-markdown and streamdown
 *
 * Automatically detects inline vs block code and renders appropriately:
 * - Inline code: Simple styled <code> element
 * - Block code: Full CodeBlock with syntax highlighting and copy button
 *
 * Language is extracted from className (e.g., "language-typescript")
 */
export function MarkdownCode({
  inline,
  className,
  children,
  ...props
}: MarkdownCodeProps) {
  // Handle inline code
  if (inline) {
    return (
      <InlineCode className={className} {...props}>
        {children}
      </InlineCode>
    );
  }

  // Block code - extract language and render with CodeBlock
  const language = extractLanguage(className);
  const code = extractTextContent(children).trim();

  return (
    <CodeBlock code={code} language={language} showLineNumbers={code.split('\n').length > 3}>
      <CodeBlockCopyButton />
    </CodeBlock>
  );
}

type MarkdownPreProps = HTMLAttributes<HTMLPreElement> & {
  node?: unknown;
};

/**
 * MarkdownPre - Pre element for markdown that works with MarkdownCode
 *
 * When used with react-markdown, code blocks come as:
 * <pre><code className="language-xxx">...</code></pre>
 *
 * This component extracts the code element and renders it properly.
 * If the child is already a CodeBlock (from MarkdownCode), it passes through.
 */
export function MarkdownPre({ children, className, ...props }: MarkdownPreProps) {
  // Check if child is a code element that needs processing
  // eslint-disable-next-line react/no-children-to-array -- Required to safely extract single code child from markdown pre element
  const childArray = Children.toArray(children);

  if (childArray.length === 1) {
    const child = childArray[0];

    // If it's already processed by MarkdownCode, just return it
    if (isValidElement(child) && child.type === CodeBlock) {
      return child;
    }

    // If it's a code element, extract and process
    if (isValidElement(child) && child.type === 'code') {
      const codeProps = child.props as {
        className?: string;
        children?: ReactNode;
      };
      const language = extractLanguage(codeProps.className);
      const code = extractTextContent(codeProps.children).trim();

      return (
        <CodeBlock code={code} language={language} showLineNumbers={code.split('\n').length > 3}>
          <CodeBlockCopyButton />
        </CodeBlock>
      );
    }
  }

  // Fallback: render as regular pre
  return (
    <pre
      className={cn(
        'bg-muted rounded-2xl overflow-x-auto my-4 p-4 text-sm font-mono',
        className,
      )}
      {...props}
    >
      {children}
    </pre>
  );
}
