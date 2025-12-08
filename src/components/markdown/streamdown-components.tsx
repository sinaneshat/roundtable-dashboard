/**
 * Streamdown Components Configuration
 *
 * Custom React components for Streamdown markdown rendering.
 * Typography matches AI SDK AI Elements Response component exactly:
 * - text-base (16px) body text
 * - leading-7 (28px / 1.75 line-height)
 * - Proper semantic heading hierarchy
 * - Generous spacing between elements
 *
 * Features:
 * - Shiki syntax highlighting for code blocks
 * - Copy-to-clipboard buttons on code blocks
 * - Proper dark/light theme support
 * - Clean table styling with borders
 *
 * @see https://ai-sdk.dev/elements/overview
 * @see https://www.aisdkagents.com/docs/ai/ai-elements
 */

import { ExternalLink } from 'lucide-react';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';

import { MarkdownCode, MarkdownPre } from '@/components/markdown/markdown-code-block';
import { cn } from '@/lib/ui/cn';

type BaseProps = {
  children?: ReactNode;
  className?: string;
};

type LinkProps = BaseProps & ComponentPropsWithoutRef<'a'>;

/**
 * AI Elements-aligned Streamdown component overrides
 *
 * Typography specs (matching AI SDK AI Elements):
 * - Body: text-base (16px), leading-7 (28px line-height = 1.75)
 * - H1: text-2xl (24px), font-semibold, tracking-tight
 * - H2: text-xl (20px), font-semibold
 * - H3: text-lg (18px), font-semibold
 * - H4: text-base (16px), font-semibold
 * - Code: text-sm (14px), font-mono
 */
export const streamdownComponents = {
  // Paragraphs - AI Elements: text-base leading-7 mb-4
  p: ({ children, className }: BaseProps) => (
    <p className={cn('text-base leading-7 mb-4 last:mb-0', className)}>
      {children}
    </p>
  ),

  // Links - open externally with indicator
  a: ({ href, children, className, ...props }: LinkProps) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'text-primary hover:text-primary/80',
        'underline decoration-primary/40 underline-offset-4',
        'transition-colors inline-flex items-center gap-1',
        className,
      )}
      {...props}
    >
      {children}
      <ExternalLink className="size-3.5 opacity-60 shrink-0" />
    </a>
  ),

  // Unordered lists - AI Elements: proper nesting, mb-4
  ul: ({ children, className }: BaseProps) => (
    <ul className={cn('list-disc pl-6 mb-4 last:mb-0 space-y-2 [&_ul]:mt-2 [&_ul]:mb-0', className)}>
      {children}
    </ul>
  ),

  // Ordered lists - AI Elements: proper nesting, mb-4
  ol: ({ children, className }: BaseProps) => (
    <ol className={cn('list-decimal pl-6 mb-4 last:mb-0 space-y-2 [&_ol]:mt-2 [&_ol]:mb-0', className)}>
      {children}
    </ol>
  ),

  // List items - AI Elements: text-base leading-7
  li: ({ children, className }: BaseProps) => (
    <li className={cn('text-base leading-7', className)}>
      {children}
    </li>
  ),

  // Headings - AI Elements semantic sizing with proper margins
  // H1: text-2xl (24px), font-semibold, tracking-tight
  h1: ({ children, className }: BaseProps) => (
    <h1 className={cn('text-2xl font-semibold tracking-tight mt-8 mb-4 first:mt-0', className)}>
      {children}
    </h1>
  ),

  // H2: text-xl (20px), font-semibold
  h2: ({ children, className }: BaseProps) => (
    <h2 className={cn('text-xl font-semibold mt-8 mb-4 first:mt-0', className)}>
      {children}
    </h2>
  ),

  // H3: text-lg (18px), font-semibold
  h3: ({ children, className }: BaseProps) => (
    <h3 className={cn('text-lg font-semibold mt-6 mb-3 first:mt-0', className)}>
      {children}
    </h3>
  ),

  // H4: text-base (16px), font-semibold
  h4: ({ children, className }: BaseProps) => (
    <h4 className={cn('text-base font-semibold mt-6 mb-2 first:mt-0', className)}>
      {children}
    </h4>
  ),

  // H5: text-base, font-medium
  h5: ({ children, className }: BaseProps) => (
    <h5 className={cn('text-base font-medium mt-4 mb-2 first:mt-0', className)}>
      {children}
    </h5>
  ),

  // H6: text-sm, font-medium, muted
  h6: ({ children, className }: BaseProps) => (
    <h6 className={cn('text-sm font-medium mt-4 mb-2 first:mt-0 text-muted-foreground', className)}>
      {children}
    </h6>
  ),

  // Code - inline and block variants with Shiki syntax highlighting
  // AI Elements: text-sm for code, with proper backgrounds and copy buttons
  code: MarkdownCode,

  // Preformatted text / code blocks with syntax highlighting
  pre: MarkdownPre,

  // Blockquotes - AI Elements: left border, italic, proper spacing
  blockquote: ({ children, className }: BaseProps) => (
    <blockquote
      className={cn(
        'border-l-4 border-border pl-4 py-1 my-4',
        'text-base leading-7 italic text-muted-foreground',
        className,
      )}
    >
      {children}
    </blockquote>
  ),

  // Strong/bold
  strong: ({ children, className }: BaseProps) => (
    <strong className={cn('font-semibold', className)}>{children}</strong>
  ),

  // Emphasis/italic
  em: ({ children, className }: BaseProps) => (
    <em className={cn('italic', className)}>{children}</em>
  ),

  // Horizontal rule
  hr: ({ className }: { className?: string }) => (
    <hr className={cn('my-6 border-border', className)} />
  ),

  // Tables - AI Elements: clean, readable tables with borders
  table: ({ children, className }: BaseProps) => (
    <div className={cn('overflow-x-auto my-6 rounded-lg border border-border', className)}>
      <table className="min-w-full border-collapse text-sm">
        {children}
      </table>
    </div>
  ),

  thead: ({ children, className }: BaseProps) => (
    <thead className={cn('bg-muted/60', className)}>{children}</thead>
  ),

  tbody: ({ children, className }: BaseProps) => (
    <tbody className={cn('divide-y divide-border bg-background', className)}>{children}</tbody>
  ),

  tr: ({ children, className }: BaseProps) => (
    <tr className={cn('transition-colors hover:bg-muted/30', className)}>{children}</tr>
  ),

  th: ({ children, className }: BaseProps) => (
    <th className={cn(
      'px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider',
      'text-muted-foreground border-b border-border',
      className,
    )}
    >
      {children}
    </th>
  ),

  td: ({ children, className }: BaseProps) => (
    <td className={cn('px-4 py-3 text-sm text-foreground', className)}>{children}</td>
  ),

  // Images
  img: ({ src, alt, className, ...props }: ComponentPropsWithoutRef<'img'>) => (
    // eslint-disable-next-line next/no-img-element
    <img
      src={src}
      alt={alt || ''}
      className={cn('max-w-full h-auto rounded-lg my-4', className)}
      loading="lazy"
      referrerPolicy="no-referrer"
      {...props}
    />
  ),
};

/**
 * Compact variant for smaller UI contexts (previews, summaries)
 * Scales down proportionally from the main components
 */
export const streamdownCompactComponents = {
  ...streamdownComponents,
  p: ({ children, className }: BaseProps) => (
    <p className={cn('text-sm leading-6 mb-3 last:mb-0', className)}>
      {children}
    </p>
  ),
  ul: ({ children, className }: BaseProps) => (
    <ul className={cn('list-disc pl-5 mb-3 last:mb-0 space-y-1.5 text-sm', className)}>
      {children}
    </ul>
  ),
  ol: ({ children, className }: BaseProps) => (
    <ol className={cn('list-decimal pl-5 mb-3 last:mb-0 space-y-1.5 text-sm', className)}>
      {children}
    </ol>
  ),
  li: ({ children, className }: BaseProps) => (
    <li className={cn('text-sm leading-6', className)}>{children}</li>
  ),
  h1: ({ children, className }: BaseProps) => (
    <h1 className={cn('text-lg font-semibold mt-4 mb-2 first:mt-0', className)}>
      {children}
    </h1>
  ),
  h2: ({ children, className }: BaseProps) => (
    <h2 className={cn('text-base font-semibold mt-4 mb-2 first:mt-0', className)}>
      {children}
    </h2>
  ),
  h3: ({ children, className }: BaseProps) => (
    <h3 className={cn('text-sm font-semibold mt-3 mb-1.5 first:mt-0', className)}>
      {children}
    </h3>
  ),
};
