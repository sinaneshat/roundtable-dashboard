'use client';

import { useTranslations } from 'next-intl';

import type { AvailableSource } from '@/api/types/citations';
import { Icons } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { formatFileSize } from '@/lib/format';
import { cn } from '@/lib/ui/cn';

type MessageSourcesProps = {
  sources: AvailableSource[];
  className?: string;
};

export function MessageSources({ sources, className }: MessageSourcesProps) {
  const t = useTranslations();

  if (!sources || sources.length === 0) {
    return null;
  }

  return (
    <Collapsible defaultOpen className={cn('mt-3', className)}>
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <Icons.paperclip className="size-3.5" />
          <span>
            {t('chat.message.sources', { count: sources.length })}
          </span>
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2">
        <div className="flex flex-wrap gap-2">
          {sources.map((source, index) => (
            <SourceCard key={source.id || index} source={source} index={index + 1} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

type SourceCardProps = {
  source: AvailableSource;
  index: number;
};

function SourceCard({ source, index }: SourceCardProps) {
  const fileSize = formatFileSize(source.fileSize);
  const isSearchSource = source.sourceType === 'search';
  const isAttachment = source.sourceType === 'attachment';

  // Determine the icon based on source type
  const SourceIcon = isSearchSource ? Icons.globe : Icons.fileText;

  // Get display title - prefer title over filename, truncate long titles
  const displayTitle = source.filename || source.title || source.domain || 'Source';

  // Get clickable URL - search sources have url, attachments have downloadUrl
  const clickableUrl = source.url || source.downloadUrl;

  const cardContent = (
    <>
      <Badge
        variant="secondary"
        className="flex size-5 shrink-0 items-center justify-center rounded-full p-0 text-[10px] font-medium"
      >
        {index}
      </Badge>

      <SourceIcon className="size-4 shrink-0 text-muted-foreground" />

      <div className="flex min-w-0 flex-col">
        <span className="truncate text-xs font-medium max-w-[200px]">
          {displayTitle}
        </span>
        {isSearchSource && source.domain && (
          <span className="text-[10px] text-muted-foreground truncate">
            {source.domain}
          </span>
        )}
        {isAttachment && (source.mimeType || fileSize) && (
          <span className="text-[10px] text-muted-foreground">
            {source.mimeType && <span>{source.mimeType}</span>}
            {source.mimeType && fileSize && <span> · </span>}
            {fileSize && <span>{fileSize}</span>}
          </span>
        )}
      </div>

      {isAttachment && source.downloadUrl && (
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto size-6 shrink-0"
          onClick={e => e.stopPropagation()}
          asChild
        >
          <a
            href={source.downloadUrl}
            download
            aria-label={`Download ${source.filename || source.title}`}
          >
            <Icons.download className="size-3.5" />
          </a>
        </Button>
      )}

      {isSearchSource && (
        <Icons.externalLink className="ml-auto size-3.5 shrink-0 text-muted-foreground" />
      )}
    </>
  );

  // Wrap in link if we have a clickable URL
  if (clickableUrl && isSearchSource) {
    return (
      <a
        href={clickableUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          'flex items-center gap-2 rounded-lg border border-border/50 bg-muted/30 px-3 py-2 text-sm',
          'hover:bg-muted/50 hover:border-border transition-colors cursor-pointer',
        )}
      >
        {cardContent}
      </a>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/30 px-3 py-2 text-sm">
      {cardContent}
    </div>
  );
}
