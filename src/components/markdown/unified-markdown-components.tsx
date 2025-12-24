import { ExternalLink } from 'lucide-react';
import type { ComponentProps } from 'react';
import type { Components } from 'react-markdown';

import type { MarkdownPreset } from '@/api/core/enums';
import { DEFAULT_MARKDOWN_PRESET, MarkdownPresets } from '@/api/core/enums';
import { MarkdownCode, MarkdownPre } from '@/components/markdown/markdown-code-block';
import { cn } from '@/lib/ui/cn';

export function createMarkdownComponents(preset: MarkdownPreset = DEFAULT_MARKDOWN_PRESET): Partial<Components> {
  const isCompact = preset === MarkdownPresets.COMPACT;
  const isWebContent = preset === MarkdownPresets.WEB_CONTENT;

  return {
    a: ({ href, children, ...props }: ComponentProps<'a'>) => (
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

    p: ({ children }: ComponentProps<'p'>) => (
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

    ul: ({ children }: ComponentProps<'ul'>) => (
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

    ol: ({ children }: ComponentProps<'ol'>) => (
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

    li: ({ children }: ComponentProps<'li'>) => (
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

    code: MarkdownCode as Components['code'],
    pre: MarkdownPre as Components['pre'],

    blockquote: ({ children }: ComponentProps<'blockquote'>) => (
      <blockquote
        className={cn(
          'border-l-4 border-border pl-4 py-1 my-4',
          'text-base leading-7 italic text-muted-foreground',
        )}
      >
        {children}
      </blockquote>
    ),

    strong: ({ children }: ComponentProps<'strong'>) => (
      <strong className="font-semibold">{children}</strong>
    ),

    em: ({ children }: ComponentProps<'em'>) => (
      <em className="italic">{children}</em>
    ),

    h1: ({ children }: ComponentProps<'h1'>) => (
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

    h2: ({ children }: ComponentProps<'h2'>) => (
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

    h3: ({ children }: ComponentProps<'h3'>) => (
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

    h4: ({ children }: ComponentProps<'h4'>) => (
      <h4 className="text-base font-semibold mt-6 mb-2 first:mt-0">{children}</h4>
    ),

    h5: ({ children }: ComponentProps<'h5'>) => (
      <h5 className="text-base font-medium mt-4 mb-2 first:mt-0">{children}</h5>
    ),

    h6: ({ children }: ComponentProps<'h6'>) => (
      <h6 className="text-sm font-medium mt-4 mb-2 first:mt-0 text-muted-foreground">
        {children}
      </h6>
    ),

    table: ({ children }: ComponentProps<'table'>) => (
      <div className="overflow-x-auto my-6 rounded-2xl border border-border">
        <table className="min-w-full border-collapse text-sm">
          {children}
        </table>
      </div>
    ),

    thead: ({ children }: ComponentProps<'thead'>) => (
      <thead className="bg-muted/60">{children}</thead>
    ),

    tbody: ({ children }: ComponentProps<'tbody'>) => (
      <tbody className="divide-y divide-border bg-background">{children}</tbody>
    ),

    tr: ({ children }: ComponentProps<'tr'>) => (
      <tr className="transition-colors hover:bg-muted/30">{children}</tr>
    ),

    th: ({ children }: ComponentProps<'th'>) => (
      <th className={cn(
        'px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider',
        'text-muted-foreground border-b border-border',
      )}
      >
        {children}
      </th>
    ),

    td: ({ children }: ComponentProps<'td'>) => (
      <td className="px-4 py-3 text-sm text-foreground">{children}</td>
    ),

    // Horizontal rule
    hr: () => <hr className="my-6 border-border" />,

    img: ({ src, alt, ...props }: ComponentProps<'img'>) => (
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

export const defaultMarkdownComponents = createMarkdownComponents(MarkdownPresets.DEFAULT);
export const compactMarkdownComponents = createMarkdownComponents(MarkdownPresets.COMPACT);
export const webContentMarkdownComponents = createMarkdownComponents(MarkdownPresets.WEB_CONTENT);
