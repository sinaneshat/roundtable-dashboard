import type { ComponentProps } from 'react';
import { createContext, memo, use, useEffect, useMemo, useRef, useState } from 'react';
import type { BundledLanguage } from 'shiki';

import { highlightCode } from '@/components/ai-elements/code-block-highlighter';
import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { useTranslations } from '@/lib/i18n';
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

  const isHighlighting = !html;

  useEffect(() => {
    let ignore = false;

    const loadHighlighting = async () => {
      const [light, dark] = await highlightCode(code, language, showLineNumbers);
      if (!ignore) {
        setHtml(light);
        setDarkHtml(dark);
      }
    };

    // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect -- Reset state when code changes
    setHtml('');
    // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect -- Reset state when code changes
    setDarkHtml('');
    void loadHighlighting();

    return () => {
      ignore = true;
    };
  }, [code, language, showLineNumbers]);

  return (
    <CodeBlockContext value={contextValue}>
      <div
        className={cn(
          'group relative min-w-0 w-full my-4 first:mt-0 last:mb-0 rounded-xl border border-border/50 bg-muted/30 text-foreground overflow-hidden',
          className,
        )}
        {...props}
      >
        <div className="relative">
          {isHighlighting && !html
            ? (
                <pre className="m-0 bg-transparent p-4 text-foreground text-sm overflow-x-auto rounded-xl">
                  <code className="font-mono text-sm">{code}</code>
                </pre>
              )
            : (
                <>
                  <div
                    className="dark:hidden [&>pre]:m-0 [&>pre]:overflow-x-auto [&>pre]:p-4 [&>pre]:text-sm [&>pre]:rounded-xl [&_code]:font-mono [&_code]:text-sm [&>pre]:![background:transparent]"
                    // eslint-disable-next-line react-dom/no-dangerously-set-innerhtml -- Required for Shiki syntax highlighting output
                    dangerouslySetInnerHTML={{ __html: html }}
                  />
                  <div
                    className="hidden dark:block [&>pre]:m-0 [&>pre]:overflow-x-auto [&>pre]:p-4 [&>pre]:text-sm [&>pre]:rounded-xl [&_code]:font-mono [&_code]:text-sm [&>pre]:![background:transparent]"
                    // eslint-disable-next-line react-dom/no-dangerously-set-innerhtml -- Required for Shiki syntax highlighting output
                    dangerouslySetInnerHTML={{ __html: darkHtml }}
                  />
                </>
              )}
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
  const t = useTranslations();
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
      aria-label={isCopied ? t('accessibility.copied') : t('accessibility.copyCode')}
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
