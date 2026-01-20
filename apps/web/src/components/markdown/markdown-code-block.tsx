import type { ReactNode } from 'react';
import { isValidElement } from 'react';

import { InlineCode } from '@/components/ai-elements/code-block';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/ui/cn';
import { isObject } from '@/lib/utils';
import dynamic from '@/lib/utils/dynamic';

// Dynamic import CodeBlock to defer shiki (~800KB) until code is rendered
const CodeBlock = dynamic(
  () => import('@/components/ai-elements/code-block').then(mod => ({ default: mod.CodeBlock })),
  {
    ssr: false,
    loading: () => <Skeleton className="h-32 w-full rounded-xl" />,
  },
);

const CodeBlockCopyButton = dynamic(
  () => import('@/components/ai-elements/code-block').then(mod => ({ default: mod.CodeBlockCopyButton })),
  { ssr: false },
);

function extractLanguage(className: string | undefined): string {
  if (!className)
    return 'text';
  const match = className.match(/language-(\w+)/);
  return match?.[1] ?? 'text';
}

function isReactNodeWithChildren(node: ReactNode): node is React.ReactElement<{ children: ReactNode }> {
  return isValidElement(node) && isObject(node.props) && 'children' in node.props;
}

function extractTextContent(children: ReactNode): string {
  if (typeof children === 'string')
    return children;

  if (Array.isArray(children))
    return children.map(extractTextContent).join('');

  if (isReactNodeWithChildren(children)) {
    return extractTextContent(children.props.children);
  }

  return '';
}

type MarkdownCodeProps = {
  readonly inline?: boolean;
  readonly className?: string;
  readonly children?: ReactNode;
};

export function MarkdownCode({ inline, className, children }: MarkdownCodeProps) {
  // Only handle inline code - block code is handled by MarkdownPre
  // This prevents double-wrapping when ReactMarkdown processes <pre><code>...</code></pre>
  if (inline) {
    return <InlineCode className={className}>{children}</InlineCode>;
  }

  // For block code, return a native code element - MarkdownPre will wrap it in CodeBlock
  return <code className={className}>{children}</code>;
}

type MarkdownPreProps = {
  readonly className?: string;
  readonly children?: ReactNode;
};

function isCodeElement(child: ReactNode): child is React.ReactElement<{ className?: string; children?: ReactNode }> {
  return isValidElement(child) && child.type === 'code' && isObject(child.props);
}

export function MarkdownPre({ children, className }: MarkdownPreProps) {
  const child = Array.isArray(children) ? children[0] : children;

  if (isValidElement(child) && child.type === CodeBlock)
    return child;

  if (isCodeElement(child)) {
    const codeClassName = typeof child.props.className === 'string' ? child.props.className : undefined;
    const language = extractLanguage(codeClassName);
    const code = extractTextContent('children' in child.props ? child.props.children : undefined).trim();

    return (
      <CodeBlock code={code} language={language} showLineNumbers={code.split('\n').length > 3}>
        <CodeBlockCopyButton />
      </CodeBlock>
    );
  }

  return (
    <pre className={cn('bg-muted/30 border border-border/50 min-w-0 rounded-xl overflow-hidden overflow-x-auto my-4 first:mt-0 last:mb-0 p-4 text-sm font-mono', className)}>
      {children}
    </pre>
  );
}
