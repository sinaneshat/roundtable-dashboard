/**
 * Unified Markdown Components
 *
 * Single source of truth for markdown rendering across the application.
 * Follows AI SDK Elements patterns and provides consistent styling for:
 * - AI responses (streaming and completed)
 * - Analysis content
 * - Web search results
 * - Pre-search summaries
 * - Any other markdown-formatted text
 *
 * @module components/markdown
 */

import { ExternalLink } from 'lucide-react';
import type { Components } from 'react-markdown';

import { cn } from '@/lib/ui/cn';

/**
 * Markdown component configuration presets
 */
export type MarkdownPreset = 'default' | 'compact' | 'web-content';

/**
 * Markdown components for AI-generated and web content
 * Following AI SDK Elements patterns for consistent text rendering
 *
 * Features:
 * - External link indicators
 * - Code block syntax highlighting support
 * - Table rendering
 * - Proper spacing and typography
 * - Dark mode support via Tailwind prose
 *
 * @param preset - Component style preset
 * @returns React Markdown components configuration
 */
export function createMarkdownComponents(preset: MarkdownPreset = 'default'): Partial<Components> {
  const isCompact = preset === 'compact';
  const isWebContent = preset === 'web-content';

  return {
    // Links - always open in new tab with security attributes
    a: ({ href, children, ...props }: { href?: string; children?: React.ReactNode }) => (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          'text-primary hover:text-primary/80',
          'underline decoration-primary/30 underline-offset-2',
          'transition-colors',
          isWebContent && 'inline-flex items-center gap-0.5',
        )}
        {...props}
      >
        {children}
        {isWebContent && <ExternalLink className="size-2.5 opacity-50" />}
      </a>
    ),

    // Paragraphs
    p: ({ children }: { children?: React.ReactNode }) => (
      <p
        className={cn(
          'leading-relaxed last:mb-0',
          isCompact ? 'mb-2' : 'mb-3',
          isWebContent && 'text-sm',
        )}
      >
        {children}
      </p>
    ),

    // Unordered lists
    ul: ({ children }: { children?: React.ReactNode }) => (
      <ul
        className={cn(
          'list-disc list-inside space-y-1.5',
          isCompact ? 'my-2 ml-1' : 'my-3 ml-1',
          isWebContent && 'ml-2',
        )}
      >
        {children}
      </ul>
    ),

    // Ordered lists
    ol: ({ children }: { children?: React.ReactNode }) => (
      <ol
        className={cn(
          'list-decimal list-inside space-y-1.5',
          isCompact ? 'my-2 ml-1' : 'my-3 ml-1',
          isWebContent && 'ml-2',
        )}
      >
        {children}
      </ol>
    ),

    // List items
    li: ({ children }: { children?: React.ReactNode }) => (
      <li className={cn('text-foreground/90', isWebContent && 'text-sm')}>
        {children}
      </li>
    ),

    // Code blocks and inline code
    code: ({ inline, children, ...props }: { inline?: boolean; children?: React.ReactNode }) => {
      if (inline) {
        return (
          <code
            className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono"
            {...props}
          >
            {children}
          </code>
        );
      }
      return (
        <code
          className={cn(
            'block bg-muted p-3 rounded-lg text-xs font-mono overflow-x-auto',
            isWebContent ? 'my-2' : 'my-3',
          )}
          {...props}
        >
          {children}
        </code>
      );
    },

    // Blockquotes
    blockquote: ({ children }: { children?: React.ReactNode }) => (
      <blockquote
        className={cn(
          'border-l-4 border-primary/30 pl-4 py-1 italic text-foreground/80',
          isWebContent ? 'my-2' : 'my-3',
        )}
      >
        {children}
      </blockquote>
    ),

    // Bold/strong text
    strong: ({ children }: { children?: React.ReactNode }) => (
      <strong className="font-semibold text-foreground">{children}</strong>
    ),

    // Headings
    h1: ({ children }: { children?: React.ReactNode }) => (
      <h1
        className={cn(
          'font-bold mt-4 mb-2 first:mt-0',
          isWebContent ? 'text-lg' : 'text-base',
        )}
      >
        {children}
      </h1>
    ),

    h2: ({ children }: { children?: React.ReactNode }) => (
      <h2
        className={cn(
          'font-semibold mt-3 mb-2 first:mt-0',
          isWebContent ? 'text-base' : 'text-sm',
        )}
      >
        {children}
      </h2>
    ),

    h3: ({ children }: { children?: React.ReactNode }) => (
      <h3
        className={cn(
          isWebContent ? 'font-semibold' : 'font-medium',
          'text-sm mt-2 mb-1 first:mt-0',
        )}
      >
        {children}
      </h3>
    ),

    h4: ({ children }: { children?: React.ReactNode }) => (
      <h4 className="text-sm font-medium mt-2 mb-1 first:mt-0">{children}</h4>
    ),

    h5: ({ children }: { children?: React.ReactNode }) => (
      <h5 className="text-xs font-medium mt-2 mb-1 first:mt-0">{children}</h5>
    ),

    h6: ({ children }: { children?: React.ReactNode }) => (
      <h6 className="text-xs font-medium mt-2 mb-1 first:mt-0 text-muted-foreground">
        {children}
      </h6>
    ),

    // Tables (for web content)
    table: ({ children }: { children?: React.ReactNode }) => (
      <div className={cn('overflow-x-auto', isWebContent ? 'my-3' : 'my-4')}>
        <table className="min-w-full border-collapse border border-border">
          {children}
        </table>
      </div>
    ),

    th: ({ children }: { children?: React.ReactNode }) => (
      <th className="border border-border bg-muted px-3 py-2 text-left text-xs font-semibold">
        {children}
      </th>
    ),

    td: ({ children }: { children?: React.ReactNode }) => (
      <td className="border border-border px-3 py-2 text-sm">{children}</td>
    ),

    // Horizontal rule
    hr: () => <hr className="my-4 border-border" />,

    // Images
    img: ({ src, alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => (
      // eslint-disable-next-line next/no-img-element -- markdown images don't benefit from next/image optimization
      <img
        src={src}
        alt={alt || ''}
        className="max-w-full h-auto rounded-lg my-3"
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
