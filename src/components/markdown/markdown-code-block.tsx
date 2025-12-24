'use client';

import type { HTMLAttributes, ReactNode } from 'react';
import { isValidElement } from 'react';

import { CodeBlock, CodeBlockCopyButton, InlineCode } from '@/components/ai-elements/code-block';
import { cn } from '@/lib/ui/cn';

function extractLanguage(className?: string): string {
  if (!className)
    return 'text';

  const match = className.match(/language-(\w+)/);
  return match?.[1] ?? 'text';
}

function extractTextContent(children: ReactNode): string {
  if (typeof children === 'string') {
    return children;
  }

  if (Array.isArray(children)) {
    return children.map(extractTextContent).join('');
  }

  if (isValidElement(children)) {
    const elementProps = children.props as { children?: ReactNode };
    if (elementProps.children !== undefined) {
      return extractTextContent(elementProps.children);
    }
  }

  return '';
}

type MarkdownCodeProps = HTMLAttributes<HTMLElement> & {
  inline?: boolean;
};

export function MarkdownCode({
  inline,
  className,
  children,
  ...props
}: MarkdownCodeProps) {
  if (inline) {
    return (
      <InlineCode className={className} {...props}>
        {children}
      </InlineCode>
    );
  }

  const language = extractLanguage(className);
  const code = extractTextContent(children).trim();

  return (
    <CodeBlock code={code} language={language} showLineNumbers={code.split('\n').length > 3}>
      <CodeBlockCopyButton />
    </CodeBlock>
  );
}

type MarkdownPreProps = HTMLAttributes<HTMLPreElement>;

export function MarkdownPre({ children, className, ...props }: MarkdownPreProps) {
  const child = Array.isArray(children) ? children[0] : children;

  if (isValidElement(child) && child.type === CodeBlock) {
    return child;
  }

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
