'use client';

import type { ComponentProps } from 'react';
import { createContext, memo, use, useEffect, useMemo, useRef, useState } from 'react';
import type { BundledLanguage, ShikiTransformer } from 'shiki';
import { codeToHtml } from 'shiki';

import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/ui/cn';

type CodeBlockProps = {
  readonly code: string;
  readonly language: BundledLanguage | string;
  readonly showLineNumbers?: boolean;
  readonly className?: string;
  readonly children?: React.ReactNode;
} & Omit<ComponentProps<'div'>, 'className' | 'children'>;

type CodeBlockContextType = {
  readonly code: string;
};

const CodeBlockContext = createContext<CodeBlockContextType | null>(null);

const lineNumberTransformer: ShikiTransformer = {
  name: 'line-numbers',
  line(node, line) {
    node.children.unshift({
      type: 'element',
      tagName: 'span',
      properties: {
        className: [
          'inline-block',
          'min-w-10',
          'mr-4',
          'text-right',
          'select-none',
          'text-muted-foreground',
        ],
      },
      children: [{ type: 'text', value: String(line) }],
    });
  },
};

async function highlightCode(
  code: string,
  language: BundledLanguage | string,
  showLineNumbers = false,
): Promise<[string, string]> {
  const transformers: ShikiTransformer[] = showLineNumbers ? [lineNumberTransformer] : [];

  const escapeHtml = (text: string): string =>
    text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  try {
    const [light, dark] = await Promise.all([
      codeToHtml(code, {
        lang: language as BundledLanguage,
        theme: 'one-light',
        transformers,
      }),
      codeToHtml(code, {
        lang: language as BundledLanguage,
        theme: 'one-dark-pro',
        transformers,
      }),
    ]);
    return [light, dark];
  } catch {
    const fallbackHtml = `<pre><code>${escapeHtml(code)}</code></pre>`;
    return [fallbackHtml, fallbackHtml];
  }
}

function CodeBlockComponent({
  code,
  language,
  showLineNumbers = false,
  className,
  children,
  ...props
}: CodeBlockProps) {
  const [html, setHtml] = useState<string>('');
  const [darkHtml, setDarkHtml] = useState<string>('');
  const contextValue = useMemo(() => ({ code }), [code]);

  useEffect(() => {
    let ignore = false;

    highlightCode(code, language, showLineNumbers).then(([light, dark]) => {
      if (!ignore) {
        setHtml(light);
        setDarkHtml(dark);
      }
    });

    return () => {
      ignore = true;
    };
  }, [code, language, showLineNumbers]);

  return (
    <CodeBlockContext value={contextValue}>
      <div
        className={cn(
          'group relative w-full overflow-hidden rounded-2xl border bg-background text-foreground',
          className,
        )}
        {...props}
      >
        <div className="relative">
          <div
            className="overflow-hidden dark:hidden [&>pre]:m-0 [&>pre]:bg-background! [&>pre]:p-4 [&>pre]:text-foreground! [&>pre]:text-sm [&_code]:font-mono [&_code]:text-sm"
            // eslint-disable-next-line react-dom/no-dangerously-set-innerhtml -- Required for Shiki syntax highlighting output
            dangerouslySetInnerHTML={{ __html: html }}
          />
          <div
            className="hidden overflow-hidden dark:block [&>pre]:m-0 [&>pre]:bg-background! [&>pre]:p-4 [&>pre]:text-foreground! [&>pre]:text-sm [&_code]:font-mono [&_code]:text-sm"
            // eslint-disable-next-line react-dom/no-dangerously-set-innerhtml -- Required for Shiki syntax highlighting output
            dangerouslySetInnerHTML={{ __html: darkHtml }}
          />
          {children && (
            <div className="absolute top-2 right-2 flex items-center gap-2">
              {children}
            </div>
          )}
        </div>
      </div>
    </CodeBlockContext>
  );
}

export const CodeBlock = memo(CodeBlockComponent);

type CodeBlockCopyButtonProps = {
  readonly onCopy?: () => void;
  readonly onError?: (error: Error) => void;
  readonly timeout?: number;
  readonly children?: React.ReactNode;
  readonly className?: string;
} & Omit<ComponentProps<typeof Button>, 'onClick' | 'size' | 'variant' | 'className' | 'children'>;

export function CodeBlockCopyButton({
  onCopy,
  onError,
  timeout = 2000,
  children,
  className,
  ...props
}: CodeBlockCopyButtonProps) {
  const [isCopied, setIsCopied] = useState(false);
  const context = use(CodeBlockContext);
  if (!context) {
    throw new Error('CodeBlockCopyButton must be used within CodeBlock');
  }
  const { code } = context;
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const copyToClipboard = async () => {
    if (typeof window === 'undefined' || !navigator?.clipboard?.writeText) {
      onError?.(new Error('Clipboard API not available'));
      return;
    }

    try {
      await navigator.clipboard.writeText(code);
      setIsCopied(true);
      onCopy?.();
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => setIsCopied(false), timeout);
    } catch (error) {
      onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  };

  const Icon = isCopied ? Icons.check : Icons.copy;

  return (
    <Button
      className={cn('shrink-0', className)}
      onClick={copyToClipboard}
      size="icon"
      variant="ghost"
      {...props}
    >
      {children ?? <Icon size={14} />}
    </Button>
  );
}

type InlineCodeProps = {
  readonly className?: string;
  readonly children?: React.ReactNode;
} & Omit<ComponentProps<'code'>, 'className' | 'children'>;

export function InlineCode({ className, children, ...props }: InlineCodeProps) {
  return (
    <code
      className={cn('bg-muted px-1.5 py-0.5 rounded-md text-sm font-mono text-foreground/90', className)}
      {...props}
    >
      {children}
    </code>
  );
}
