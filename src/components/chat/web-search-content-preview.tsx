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
import ReactMarkdown from 'react-markdown';

import type { WebSearchResultItem } from '@/api/routes/chat/schema';
import { webContentMarkdownComponents } from '@/components/markdown/unified-markdown-components';
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
                    <ReactMarkdown components={webContentMarkdownComponents}>
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
