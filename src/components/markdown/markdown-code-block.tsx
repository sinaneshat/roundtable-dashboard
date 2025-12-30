'use client';

import type { HTMLAttributes, ReactNode } from 'react';
import { isValidElement } from 'react';

import { CodeBlock, CodeBlockCopyButton, InlineCode } from '@/components/ai-elements/code-block';
import { cn } from '@/lib/ui/cn';
import { isObject } from '@/lib/utils/type-guards';

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
    // ✅ TYPE-SAFE: Use isObject to safely access props
    const elementProps = isObject(children.props) ? children.props : {};
    if ('children' in elementProps) {
      return extractTextContent(elementProps.children as ReactNode);
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
    // ✅ TYPE-SAFE: Use isObject to safely access props
    const codeProps = isObject(child.props) ? child.props : {};
    const codeClassName = typeof codeProps.className === 'string' ? codeProps.className : undefined;
    const language = extractLanguage(codeClassName);
    const code = extractTextContent('children' in codeProps ? (codeProps.children as ReactNode) : undefined).trim();

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
