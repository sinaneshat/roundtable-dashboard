'use client';

/**
 * CodeBlock - Official AI Elements Pattern
 *
 * Syntax-highlighted code display with copy functionality.
 * Based on the official AI SDK AI Elements code-block component.
 *
 * @see https://ai-sdk.dev/elements/components/code-block
 */

import { CheckIcon, CopyIcon } from 'lucide-react';
import type { ComponentProps, HTMLAttributes } from 'react';
import { createContext, memo, use, useEffect, useMemo, useRef, useState } from 'react';
import type { BundledLanguage, ShikiTransformer } from 'shiki';
import { codeToHtml } from 'shiki';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/ui/cn';

type CodeBlockProps = HTMLAttributes<HTMLDivElement> & {
  code: string;
  language: BundledLanguage | string;
  showLineNumbers?: boolean;
};

type CodeBlockContextType = {
  code: string;
};

const CodeBlockContext = createContext<CodeBlockContextType>({
  code: '',
});

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

// eslint-disable-next-line react-refresh/only-export-components -- Utility function closely related to CodeBlock component
export async function highlightCode(
  code: string,
  language: BundledLanguage | string,
  showLineNumbers = false,
): Promise<[string, string]> {
  const transformers: ShikiTransformer[] = showLineNumbers
    ? [lineNumberTransformer]
    : [];

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
    // Fallback for unsupported languages
    const escapedCode = code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const fallbackHtml = `<pre><code>${escapedCode}</code></pre>`;
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
          'group relative w-full overflow-hidden rounded-md border bg-background text-foreground',
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

export type CodeBlockCopyButtonProps = ComponentProps<typeof Button> & {
  onCopy?: () => void;
  onError?: (error: Error) => void;
  timeout?: number;
};

export function CodeBlockCopyButton({
  onCopy,
  onError,
  timeout = 2000,
  children,
  className,
  ...props
}: CodeBlockCopyButtonProps) {
  const [isCopied, setIsCopied] = useState(false);
  const { code } = use(CodeBlockContext);
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
      onError?.(error as Error);
    }
  };

  const Icon = isCopied ? CheckIcon : CopyIcon;

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

/**
 * InlineCode - Styled inline code element
 *
 * For use within paragraphs and other text content.
 * Matches AI SDK AI Elements inline code styling.
 */
export type InlineCodeProps = HTMLAttributes<HTMLElement>;

export function InlineCode({ className, children, ...props }: InlineCodeProps) {
  return (
    <code
      className={cn(
        'bg-muted px-1.5 py-0.5 rounded-md text-sm font-mono text-foreground/90',
        className,
      )}
      {...props}
    >
      {children}
    </code>
  );
}
