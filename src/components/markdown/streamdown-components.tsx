/**
 * Streamdown Components Configuration
 *
 * Custom React components for Streamdown markdown rendering.
 * Aligned with shadcn/ui design system and optimized for AI streaming content.
 * Fixes spacing/height issues with proper margins and typography.
 *
 * @see https://streamdown.ai/docs/styling
 */

import { ExternalLink } from 'lucide-react';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';

import { cn } from '@/lib/ui/cn';

type BaseProps = {
  children?: ReactNode;
  className?: string;
};

type LinkProps = BaseProps & ComponentPropsWithoutRef<'a'>;
type CodeProps = BaseProps & { inline?: boolean };

/**
 * Streamdown component overrides for consistent shadcn styling
 */
export const streamdownComponents = {
  // Paragraphs - tight spacing for streaming content
  p: ({ children, className }: BaseProps) => (
    <p className={cn('text-sm leading-relaxed mb-3 last:mb-0', className)}>
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
        'underline decoration-primary/30 underline-offset-2',
        'transition-colors inline-flex items-center gap-0.5',
        className,
      )}
      {...props}
    >
      {children}
      <ExternalLink className="size-3 opacity-50 shrink-0" />
    </a>
  ),

  // Unordered lists - proper nesting and spacing
  ul: ({ children, className }: BaseProps) => (
    <ul className={cn('list-disc pl-5 my-2 space-y-1 [&_ul]:mt-1 [&_ul]:mb-0', className)}>
      {children}
    </ul>
  ),

  // Ordered lists - proper nesting and spacing
  ol: ({ children, className }: BaseProps) => (
    <ol className={cn('list-decimal pl-5 my-2 space-y-1 [&_ol]:mt-1 [&_ol]:mb-0', className)}>
      {children}
    </ol>
  ),

  // List items - consistent typography
  li: ({ children, className }: BaseProps) => (
    <li className={cn('text-sm leading-relaxed text-foreground/90 pl-1', className)}>
      {children}
    </li>
  ),

  // Headings - semantic sizing with proper margins
  h1: ({ children, className }: BaseProps) => (
    <h1 className={cn('text-lg font-semibold mt-4 mb-2 first:mt-0 text-foreground', className)}>
      {children}
    </h1>
  ),

  h2: ({ children, className }: BaseProps) => (
    <h2 className={cn('text-base font-semibold mt-3 mb-2 first:mt-0 text-foreground', className)}>
      {children}
    </h2>
  ),

  h3: ({ children, className }: BaseProps) => (
    <h3 className={cn('text-sm font-semibold mt-3 mb-1.5 first:mt-0 text-foreground', className)}>
      {children}
    </h3>
  ),

  h4: ({ children, className }: BaseProps) => (
    <h4 className={cn('text-sm font-medium mt-2 mb-1 first:mt-0 text-foreground', className)}>
      {children}
    </h4>
  ),

  h5: ({ children, className }: BaseProps) => (
    <h5 className={cn('text-xs font-medium mt-2 mb-1 first:mt-0 text-foreground', className)}>
      {children}
    </h5>
  ),

  h6: ({ children, className }: BaseProps) => (
    <h6 className={cn('text-xs font-medium mt-2 mb-1 first:mt-0 text-muted-foreground', className)}>
      {children}
    </h6>
  ),

  // Code - inline and block variants
  code: ({ children, inline, className, ...props }: CodeProps) => {
    if (inline) {
      return (
        <code
          className={cn('bg-muted px-1.5 py-0.5 rounded text-xs font-mono', className)}
          {...props}
        >
          {children}
        </code>
      );
    }
    return (
      <code
        className={cn('block bg-muted p-3 rounded-lg text-xs font-mono overflow-x-auto my-2', className)}
        {...props}
      >
        {children}
      </code>
    );
  },

  // Preformatted text / code blocks
  pre: ({ children, className }: BaseProps) => (
    <pre className={cn('bg-muted rounded-lg overflow-x-auto my-2 text-xs', className)}>
      {children}
    </pre>
  ),

  // Blockquotes
  blockquote: ({ children, className }: BaseProps) => (
    <blockquote
      className={cn(
        'border-l-2 border-primary/30 pl-3 py-0.5 my-2',
        'text-sm italic text-foreground/80',
        className,
      )}
    >
      {children}
    </blockquote>
  ),

  // Strong/bold
  strong: ({ children, className }: BaseProps) => (
    <strong className={cn('font-semibold text-foreground', className)}>{children}</strong>
  ),

  // Emphasis/italic
  em: ({ children, className }: BaseProps) => (
    <em className={cn('italic', className)}>{children}</em>
  ),

  // Horizontal rule
  hr: ({ className }: { className?: string }) => (
    <hr className={cn('my-3 border-border', className)} />
  ),

  // Tables
  table: ({ children, className }: BaseProps) => (
    <div className={cn('overflow-x-auto my-3', className)}>
      <table className="min-w-full border-collapse text-sm">
        {children}
      </table>
    </div>
  ),

  thead: ({ children, className }: BaseProps) => (
    <thead className={cn('bg-muted/50', className)}>{children}</thead>
  ),

  tbody: ({ children, className }: BaseProps) => (
    <tbody className={cn('divide-y divide-border', className)}>{children}</tbody>
  ),

  tr: ({ children, className }: BaseProps) => (
    <tr className={cn('border-b border-border last:border-0', className)}>{children}</tr>
  ),

  th: ({ children, className }: BaseProps) => (
    <th className={cn('px-3 py-2 text-left text-xs font-semibold text-foreground', className)}>
      {children}
    </th>
  ),

  td: ({ children, className }: BaseProps) => (
    <td className={cn('px-3 py-2 text-sm', className)}>{children}</td>
  ),

  // Images
  img: ({ src, alt, className, ...props }: ComponentPropsWithoutRef<'img'>) => (
    // eslint-disable-next-line next/no-img-element
    <img
      src={src}
      alt={alt || ''}
      className={cn('max-w-full h-auto rounded-lg my-2', className)}
      loading="lazy"
      referrerPolicy="no-referrer"
      {...props}
    />
  ),
};

/**
 * Compact variant for smaller UI contexts (previews, summaries)
 */
export const streamdownCompactComponents = {
  ...streamdownComponents,
  p: ({ children, className }: BaseProps) => (
    <p className={cn('text-xs leading-relaxed mb-2 last:mb-0', className)}>
      {children}
    </p>
  ),
  ul: ({ children, className }: BaseProps) => (
    <ul className={cn('list-disc pl-4 my-1.5 space-y-0.5 text-xs', className)}>
      {children}
    </ul>
  ),
  ol: ({ children, className }: BaseProps) => (
    <ol className={cn('list-decimal pl-4 my-1.5 space-y-0.5 text-xs', className)}>
      {children}
    </ol>
  ),
  li: ({ children, className }: BaseProps) => (
    <li className={cn('text-xs leading-relaxed', className)}>{children}</li>
  ),
};
