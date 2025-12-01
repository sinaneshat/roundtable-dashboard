'use client';

import { Download, FileText, Paperclip } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/ui/cn';

// ============================================================================
// Types
// ============================================================================

export type AvailableSource = {
  id: string;
  sourceType: string;
  title: string;
  downloadUrl?: string;
  filename?: string;
  mimeType?: string;
  fileSize?: number;
};

type MessageSourcesProps = {
  sources: AvailableSource[];
  className?: string;
};

// ============================================================================
// Helper Functions
// ============================================================================

function formatFileSize(bytes?: number): string {
  if (!bytes)
    return '';
  if (bytes < 1024)
    return `${bytes} B`;
  if (bytes < 1024 * 1024)
    return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Note: Currently using FileText icon directly in SourceCard.
// Could extend to use different icons based on mime type if needed.

// ============================================================================
// Component
// ============================================================================

/**
 * MessageSources - Displays sources/files available to an AI response
 *
 * Shows a collapsible "Sources" section below AI responses when files
 * were available to the AI, even if no inline citations were generated.
 * This ensures users always know what files the AI had access to.
 */
export function MessageSources({ sources, className }: MessageSourcesProps) {
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
          <Paperclip className="size-3.5" />
          <span>
            Sources (
            {sources.length}
            )
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

// ============================================================================
// Source Card
// ============================================================================

type SourceCardProps = {
  source: AvailableSource;
  index: number;
};

function SourceCard({ source, index }: SourceCardProps) {
  const fileSize = formatFileSize(source.fileSize);

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/30 px-3 py-2 text-sm">
      {/* Index badge */}
      <Badge
        variant="secondary"
        className="flex size-5 shrink-0 items-center justify-center rounded-full p-0 text-[10px] font-medium"
      >
        {index}
      </Badge>

      {/* File icon - using FileText directly to avoid component-during-render issue */}
      <FileText className="size-4 shrink-0 text-muted-foreground" />

      {/* File info */}
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-xs font-medium">
          {source.filename || source.title}
        </span>
        {(source.mimeType || fileSize) && (
          <span className="text-[10px] text-muted-foreground">
            {source.mimeType && <span>{source.mimeType}</span>}
            {source.mimeType && fileSize && <span> · </span>}
            {fileSize && <span>{fileSize}</span>}
          </span>
        )}
      </div>

      {/* Download button */}
      {source.downloadUrl && (
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto size-6 shrink-0"
          asChild
        >
          <a
            href={source.downloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            title={`Download ${source.filename || source.title}`}
          >
            <Download className="size-3.5" />
          </a>
        </Button>
      )}
    </div>
  );
}

export default MessageSources;
