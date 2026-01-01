import type { ComponentPropsWithoutRef } from 'react';
import type { Components } from 'react-markdown';

import type { MarkdownPreset } from '@/api/core/enums';
import { DEFAULT_MARKDOWN_PRESET, MarkdownPresets } from '@/api/core/enums';
import { Icons } from '@/components/icons';
import { MarkdownCode, MarkdownPre } from '@/components/markdown/markdown-code-block';
import { cn } from '@/lib/ui/cn';

/**
 * Markdown component definitions - SINGLE SOURCE OF TRUTH
 *
 * These components are used by both:
 * - Streamdown (for streaming content)
 * - ReactMarkdown (for completed content)
 *
 * All components accept className prop for flexible styling overrides.
 */
export const streamdownComponents = {
  p: ({ children, className }: ComponentPropsWithoutRef<'p'>) => <p className={cn('text-base leading-7 mb-4 last:mb-0', className)}>{children}</p>,

  a: ({ href, children, className, ...props }: ComponentPropsWithoutRef<'a'>) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cn('text-primary hover:text-primary/80 underline decoration-primary/40 underline-offset-4 transition-colors inline-flex items-center gap-1', className)} {...props}>
      {children}
      <Icons.externalLink className="size-3.5 opacity-60 shrink-0" />
    </a>
  ),

  ul: ({ children, className }: ComponentPropsWithoutRef<'ul'>) => <ul className={cn('list-disc pl-6 mb-4 last:mb-0 space-y-2 [&_ul]:mt-2 [&_ul]:mb-0', className)}>{children}</ul>,
  ol: ({ children, className }: ComponentPropsWithoutRef<'ol'>) => <ol className={cn('list-decimal pl-6 mb-4 last:mb-0 space-y-2 [&_ol]:mt-2 [&_ol]:mb-0', className)}>{children}</ol>,
  li: ({ children, className }: ComponentPropsWithoutRef<'li'>) => <li className={cn('text-base leading-7', className)}>{children}</li>,

  h1: ({ children, className }: ComponentPropsWithoutRef<'h1'>) => <h1 className={cn('text-2xl font-semibold tracking-tight mt-8 mb-4 first:mt-0', className)}>{children}</h1>,
  h2: ({ children, className }: ComponentPropsWithoutRef<'h2'>) => <h2 className={cn('text-xl font-semibold mt-8 mb-4 first:mt-0', className)}>{children}</h2>,
  h3: ({ children, className }: ComponentPropsWithoutRef<'h3'>) => <h3 className={cn('text-lg font-semibold mt-6 mb-3 first:mt-0', className)}>{children}</h3>,
  h4: ({ children, className }: ComponentPropsWithoutRef<'h4'>) => <h4 className={cn('text-base font-semibold mt-6 mb-2 first:mt-0', className)}>{children}</h4>,
  h5: ({ children, className }: ComponentPropsWithoutRef<'h5'>) => <h5 className={cn('text-base font-medium mt-4 mb-2 first:mt-0', className)}>{children}</h5>,
  h6: ({ children, className }: ComponentPropsWithoutRef<'h6'>) => <h6 className={cn('text-sm font-medium mt-4 mb-2 first:mt-0 text-muted-foreground', className)}>{children}</h6>,

  code: MarkdownCode,
  pre: MarkdownPre,
  blockquote: ({ children, className }: ComponentPropsWithoutRef<'blockquote'>) => <blockquote className={cn('border-l-4 border-border pl-4 py-1 my-4 text-base leading-7 italic text-muted-foreground', className)}>{children}</blockquote>,
  strong: ({ children, className }: ComponentPropsWithoutRef<'strong'>) => <strong className={cn('font-semibold', className)}>{children}</strong>,
  em: ({ children, className }: ComponentPropsWithoutRef<'em'>) => <em className={cn('italic', className)}>{children}</em>,
  hr: ({ className }: ComponentPropsWithoutRef<'hr'>) => <hr className={cn('my-6 border-border', className)} />,

  table: ({ children, className }: ComponentPropsWithoutRef<'table'>) => (
    <div className={cn('overflow-x-auto my-6 rounded-2xl border border-border', className)}>
      <table className="min-w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  thead: ({ children, className }: ComponentPropsWithoutRef<'thead'>) => <thead className={cn('bg-muted/60', className)}>{children}</thead>,
  tbody: ({ children, className }: ComponentPropsWithoutRef<'tbody'>) => <tbody className={cn('divide-y divide-border bg-background', className)}>{children}</tbody>,
  tr: ({ children, className }: ComponentPropsWithoutRef<'tr'>) => <tr className={cn('transition-colors hover:bg-muted/30', className)}>{children}</tr>,
  th: ({ children, className }: ComponentPropsWithoutRef<'th'>) => <th className={cn('px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b border-border', className)}>{children}</th>,
  td: ({ children, className }: ComponentPropsWithoutRef<'td'>) => <td className={cn('px-4 py-3 text-sm text-foreground', className)}>{children}</td>,

  img: ({ src, alt, className, ...props }: ComponentPropsWithoutRef<'img'>) => (
    // eslint-disable-next-line next/no-img-element -- markdown images
    <img src={src} alt={alt || ''} className={cn('max-w-full h-auto rounded-2xl my-4', className)} loading="lazy" referrerPolicy="no-referrer" {...props} />
  ),
};

/**
 * Compact variant with smaller typography and spacing
 */
export const streamdownCompactComponents = {
  ...streamdownComponents,
  p: ({ children, className }: ComponentPropsWithoutRef<'p'>) => <p className={cn('text-sm leading-6 mb-3 last:mb-0', className)}>{children}</p>,
  ul: ({ children, className }: ComponentPropsWithoutRef<'ul'>) => <ul className={cn('list-disc pl-5 mb-3 last:mb-0 space-y-1.5 text-sm', className)}>{children}</ul>,
  ol: ({ children, className }: ComponentPropsWithoutRef<'ol'>) => <ol className={cn('list-decimal pl-5 mb-3 last:mb-0 space-y-1.5 text-sm', className)}>{children}</ol>,
  li: ({ children, className }: ComponentPropsWithoutRef<'li'>) => <li className={cn('text-sm leading-6', className)}>{children}</li>,
  h1: ({ children, className }: ComponentPropsWithoutRef<'h1'>) => <h1 className={cn('text-lg font-semibold mt-4 mb-2 first:mt-0', className)}>{children}</h1>,
  h2: ({ children, className }: ComponentPropsWithoutRef<'h2'>) => <h2 className={cn('text-base font-semibold mt-4 mb-2 first:mt-0', className)}>{children}</h2>,
  h3: ({ children, className }: ComponentPropsWithoutRef<'h3'>) => <h3 className={cn('text-sm font-semibold mt-3 mb-1.5 first:mt-0', className)}>{children}</h3>,
};

/**
 * Factory function to create preset-based markdown components
 * Uses streamdownComponents as base and applies preset-specific overrides
 */
export function createMarkdownComponents(preset: MarkdownPreset = DEFAULT_MARKDOWN_PRESET): Partial<Components> {
  if (preset === MarkdownPresets.COMPACT || preset === MarkdownPresets.WEB_CONTENT) {
    return streamdownCompactComponents;
  }
  return streamdownComponents;
}
