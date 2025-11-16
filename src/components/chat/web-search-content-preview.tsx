'use client';

import { motion } from 'framer-motion';
import {
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  FileText,
  Hash,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { Components } from 'react-markdown';
import ReactMarkdown from 'react-markdown';

import type { WebSearchResultItem } from '@/api/routes/chat/schema';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/ui/cn';

type WebSearchContentPreviewProps = {
  result: WebSearchResultItem;
  className?: string;
  defaultExpanded?: boolean;
};

// Custom markdown components for content rendering
const markdownComponents: Partial<Components> = {
  a: ({ href, children, ...props }: { href?: string; children?: React.ReactNode }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary hover:text-primary/80 underline decoration-primary/30 underline-offset-2 transition-colors inline-flex items-center gap-0.5"
      {...props}
    >
      {children}
      <ExternalLink className="size-2.5 opacity-50" />
    </a>
  ),
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="leading-relaxed mb-3 last:mb-0 text-sm">
      {children}
    </p>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="list-disc list-inside space-y-1 my-2 ml-2">
      {children}
    </ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="list-decimal list-inside space-y-1 my-2 ml-2">
      {children}
    </ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li className="text-sm text-foreground/90">
      {children}
    </li>
  ),
  code: ({ inline, children, ...props }: { inline?: boolean; children?: React.ReactNode }) => {
    if (inline) {
      return (
        <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono" {...props}>
          {children}
        </code>
      );
    }
    return (
      <code className="block bg-muted p-3 rounded-lg text-xs font-mono my-2 overflow-x-auto" {...props}>
        {children}
      </code>
    );
  },
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote className="border-l-4 border-primary/30 pl-4 py-1 my-3 italic text-foreground/80">
      {children}
    </blockquote>
  ),
  h1: ({ children }: { children?: React.ReactNode }) => <h1 className="text-lg font-bold mt-4 mb-2 first:mt-0">{children}</h1>,
  h2: ({ children }: { children?: React.ReactNode }) => <h2 className="text-base font-semibold mt-3 mb-2 first:mt-0">{children}</h2>,
  h3: ({ children }: { children?: React.ReactNode }) => <h3 className="text-sm font-semibold mt-2 mb-1 first:mt-0">{children}</h3>,
  table: ({ children }: { children?: React.ReactNode }) => (
    <div className="overflow-x-auto my-3">
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
    <td className="border border-border px-3 py-2 text-sm">
      {children}
    </td>
  ),
};

export function WebSearchContentPreview({
  result,
  className,
  defaultExpanded = false,
}: WebSearchContentPreviewProps) {
  const t = useTranslations('chat.tools.webSearch.contentPreview');
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [copied, setCopied] = useState(false);

  // Prefer fullContent over rawContent over content
  const content = result.fullContent || result.rawContent || result.content;
  const isMarkdown = !!result.rawContent || !!result.fullContent;
  const wordCount = result.metadata?.wordCount;
  const readingTime = result.metadata?.readingTime;

  if (!content) {
    return null;
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Generate table of contents from headings (if markdown)
  const headings: Array<{ text: string; level: number }> = [];
  if (isMarkdown && content) {
    // ✅ FIX: Atomic regex to avoid backtracking - split by lines first
    const lines = content.split('\n');
    for (const line of lines) {
      // Match heading markers at start, then capture rest of line
      if (line.startsWith('#')) {
        const match = /^(#{1,3})(.*)$/.exec(line);
        if (match && match[1] && match[2]) {
          headings.push({
            level: match[1].length,
            text: match[2].trim(),
          });
        }
      }
    }
  }

  return (
    <div className={cn('space-y-2', className)}>
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <div className="flex items-center justify-between gap-2">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="flex-1 justify-start px-3 py-2 h-auto">
              <FileText className="size-4 mr-2 text-primary" />
              <span className="text-sm font-medium">{t('title')}</span>
              {wordCount && (
                <Badge variant="secondary" className="ml-2 text-xs">
                  {wordCount.toLocaleString()}
                  {' '}
                  words
                </Badge>
              )}
              {readingTime && (
                <Badge variant="outline" className="ml-1.5 text-xs">
                  {readingTime}
                  {' '}
                  min
                </Badge>
              )}
              {isExpanded
                ? <ChevronUp className="size-4 ml-auto text-muted-foreground" />
                : <ChevronDown className="size-4 ml-auto text-muted-foreground" />}
            </Button>
          </CollapsibleTrigger>

          <div className="flex items-center gap-1">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCopy}
                    className="size-8 p-0"
                  >
                    <Copy className={cn('size-3.5', copied && 'text-green-600 dark:text-green-400')} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">{copied ? t('copied') : t('copy')}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    asChild
                    className="size-8 p-0"
                  >
                    <a
                      href={result.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="size-3.5" />
                    </a>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">{t('openSource')}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        <CollapsibleContent>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="pt-3"
          >
            {/* Table of Contents */}
            {headings.length > 0 && (
              <div className="mb-4 p-3 rounded-lg bg-muted/30 border border-border/40">
                <div className="flex items-center gap-1.5 mb-2">
                  <Hash className="size-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground">{t('tableOfContents')}</span>
                </div>
                <ul className="space-y-1">
                  {headings.map(heading => (
                    <li
                      key={`${heading.level}-${heading.text}`}
                      className={cn(
                        'text-xs text-foreground/80',
                        heading.level === 1 && 'font-medium',
                        heading.level === 2 && 'ml-3',
                        heading.level === 3 && 'ml-6',
                      )}
                    >
                      {heading.text}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <Separator className="mb-4" />

            {/* Content Display */}
            <div className="p-4 rounded-lg bg-muted/10 border border-border/30 max-h-[500px] overflow-y-auto">
              {isMarkdown
                ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <ReactMarkdown components={markdownComponents}>
                        {content}
                      </ReactMarkdown>
                    </div>
                  )
                : (
                    <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">
                      {content}
                    </p>
                  )}
            </div>
          </motion.div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
