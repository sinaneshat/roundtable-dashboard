/**
 * Unified Markdown Components
 *
 * Single source of truth for markdown rendering across the application.
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
 *
 * @module components/markdown
 */

import { ExternalLink } from 'lucide-react';
import type { Components } from 'react-markdown';

import type { MarkdownPreset } from '@/api/core/enums';
import { MarkdownPresets } from '@/api/core/enums';
import { MarkdownCode, MarkdownPre } from '@/components/markdown/markdown-code-block';
import { cn } from '@/lib/ui/cn';

/**
 * Markdown components for AI-generated and web content
 * Following AI SDK AI Elements patterns for consistent text rendering
 *
 * Typography specs (matching AI SDK AI Elements):
 * - Body: text-base (16px), leading-7 (28px line-height = 1.75)
 * - H1: text-2xl (24px), font-semibold, tracking-tight
 * - H2: text-xl (20px), font-semibold
 * - H3: text-lg (18px), font-semibold
 * - H4: text-base (16px), font-semibold
 * - Code: text-sm (14px), font-mono with Shiki syntax highlighting
 *
 * @param preset - Component style preset
 * @returns React Markdown components configuration
 */
export function createMarkdownComponents(preset: MarkdownPreset = MarkdownPresets.DEFAULT): Partial<Components> {
  const isCompact = preset === MarkdownPresets.COMPACT;
  const isWebContent = preset === MarkdownPresets.WEB_CONTENT;

  return {
    // Links - always open in new tab with security attributes
    a: ({ href, children, ...props }: { href?: string; children?: React.ReactNode }) => (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          'text-primary hover:text-primary/80',
          'underline decoration-primary/40 underline-offset-4',
          'transition-colors inline-flex items-center gap-1',
        )}
        {...props}
      >
        {children}
        <ExternalLink className="size-3.5 opacity-60 shrink-0" />
      </a>
    ),

    // Paragraphs - AI Elements: text-base leading-7 mb-4
    p: ({ children }: { children?: React.ReactNode }) => (
      <p
        className={cn(
          'last:mb-0',
          isCompact
            ? 'text-sm leading-6 mb-3'
            : isWebContent
              ? 'text-sm leading-6 mb-3'
              : 'text-base leading-7 mb-4',
        )}
      >
        {children}
      </p>
    ),

    // Unordered lists - AI Elements: proper nesting, mb-4
    ul: ({ children }: { children?: React.ReactNode }) => (
      <ul
        className={cn(
          'list-disc last:mb-0 [&_ul]:mt-2 [&_ul]:mb-0',
          isCompact
            ? 'pl-5 mb-3 space-y-1.5'
            : isWebContent
              ? 'pl-5 mb-3 space-y-1.5'
              : 'pl-6 mb-4 space-y-2',
        )}
      >
        {children}
      </ul>
    ),

    // Ordered lists - AI Elements: proper nesting, mb-4
    ol: ({ children }: { children?: React.ReactNode }) => (
      <ol
        className={cn(
          'list-decimal last:mb-0 [&_ol]:mt-2 [&_ol]:mb-0',
          isCompact
            ? 'pl-5 mb-3 space-y-1.5'
            : isWebContent
              ? 'pl-5 mb-3 space-y-1.5'
              : 'pl-6 mb-4 space-y-2',
        )}
      >
        {children}
      </ol>
    ),

    // List items - AI Elements: text-base leading-7
    li: ({ children }: { children?: React.ReactNode }) => (
      <li
        className={cn(
          isCompact
            ? 'text-sm leading-6'
            : isWebContent
              ? 'text-sm leading-6'
              : 'text-base leading-7',
        )}
      >
        {children}
      </li>
    ),

    // Code blocks and inline code - Shiki syntax highlighting with copy button
    code: MarkdownCode as Components['code'],

    // Preformatted text / code blocks with syntax highlighting
    pre: MarkdownPre as Components['pre'],

    // Blockquotes - AI Elements: left border, italic, proper spacing
    blockquote: ({ children }: { children?: React.ReactNode }) => (
      <blockquote
        className={cn(
          'border-l-4 border-border pl-4 py-1 my-4',
          'text-base leading-7 italic text-muted-foreground',
        )}
      >
        {children}
      </blockquote>
    ),

    // Bold/strong text
    strong: ({ children }: { children?: React.ReactNode }) => (
      <strong className="font-semibold">{children}</strong>
    ),

    // Emphasis/italic
    em: ({ children }: { children?: React.ReactNode }) => (
      <em className="italic">{children}</em>
    ),

    // Headings - AI Elements semantic sizing with proper margins
    // H1: text-2xl (24px), font-semibold, tracking-tight
    h1: ({ children }: { children?: React.ReactNode }) => (
      <h1
        className={cn(
          'font-semibold first:mt-0',
          isCompact
            ? 'text-lg mt-4 mb-2'
            : isWebContent
              ? 'text-lg mt-4 mb-2'
              : 'text-2xl tracking-tight mt-8 mb-4',
        )}
      >
        {children}
      </h1>
    ),

    // H2: text-xl (20px), font-semibold
    h2: ({ children }: { children?: React.ReactNode }) => (
      <h2
        className={cn(
          'font-semibold first:mt-0',
          isCompact
            ? 'text-base mt-4 mb-2'
            : isWebContent
              ? 'text-base mt-4 mb-2'
              : 'text-xl mt-8 mb-4',
        )}
      >
        {children}
      </h2>
    ),

    // H3: text-lg (18px), font-semibold
    h3: ({ children }: { children?: React.ReactNode }) => (
      <h3
        className={cn(
          'font-semibold first:mt-0',
          isCompact
            ? 'text-sm mt-3 mb-1.5'
            : isWebContent
              ? 'text-sm mt-3 mb-1.5'
              : 'text-lg mt-6 mb-3',
        )}
      >
        {children}
      </h3>
    ),

    // H4: text-base (16px), font-semibold
    h4: ({ children }: { children?: React.ReactNode }) => (
      <h4 className="text-base font-semibold mt-6 mb-2 first:mt-0">{children}</h4>
    ),

    // H5: text-base, font-medium
    h5: ({ children }: { children?: React.ReactNode }) => (
      <h5 className="text-base font-medium mt-4 mb-2 first:mt-0">{children}</h5>
    ),

    // H6: text-sm, font-medium, muted
    h6: ({ children }: { children?: React.ReactNode }) => (
      <h6 className="text-sm font-medium mt-4 mb-2 first:mt-0 text-muted-foreground">
        {children}
      </h6>
    ),

    // Tables - AI Elements: clean, readable tables with borders
    table: ({ children }: { children?: React.ReactNode }) => (
      <div className="overflow-x-auto my-6 rounded-2xl border border-border">
        <table className="min-w-full border-collapse text-sm">
          {children}
        </table>
      </div>
    ),

    thead: ({ children }: { children?: React.ReactNode }) => (
      <thead className="bg-muted/60">{children}</thead>
    ),

    tbody: ({ children }: { children?: React.ReactNode }) => (
      <tbody className="divide-y divide-border bg-background">{children}</tbody>
    ),

    tr: ({ children }: { children?: React.ReactNode }) => (
      <tr className="transition-colors hover:bg-muted/30">{children}</tr>
    ),

    th: ({ children }: { children?: React.ReactNode }) => (
      <th className={cn(
        'px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider',
        'text-muted-foreground border-b border-border',
      )}
      >
        {children}
      </th>
    ),

    td: ({ children }: { children?: React.ReactNode }) => (
      <td className="px-4 py-3 text-sm text-foreground">{children}</td>
    ),

    // Horizontal rule
    hr: () => <hr className="my-6 border-border" />,

    // Images
    img: ({ src, alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => (
      // eslint-disable-next-line next/no-img-element -- markdown images don't benefit from next/image optimization
      <img
        src={src}
        alt={alt || ''}
        className="max-w-full h-auto rounded-2xl my-4"
        loading="lazy"
        referrerPolicy="no-referrer"
        {...props}
      />
    ),
  };
}

/**
 * Default markdown components
 * Use for AI responses and general content
 */
export const defaultMarkdownComponents = createMarkdownComponents('default');

/**
 * Compact markdown components
 * Use for inline summaries and previews
 */
export const compactMarkdownComponents = createMarkdownComponents('compact');

/**
 * Web content markdown components
 * Use for web search results and scraped content
 */
export const webContentMarkdownComponents = createMarkdownComponents('web-content');
