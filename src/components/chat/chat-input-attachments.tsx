'use client';

/**
 * Chat Input Attachments Component
 *
 * Displays pending file attachments in the chat input:
 * - Horizontal scrollable list using ScrollArea
 * - Hover tooltips with detailed file info
 * - Compact preview cards with icons/thumbnails
 * - Drag and drop zone overlay
 */

// eslint-disable-next-line simple-import-sort/imports
import { FileCode, File as FileIcon, FileImage, FileText, Upload, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

import { UploadStatuses } from '@/api/core/enums';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { PendingAttachment } from '@/hooks/utils';
import { getFileIconName, getFileTypeLabel } from '@/hooks/utils';
import { cn } from '@/lib/ui/cn';

type ChatInputAttachmentsProps = {
  /** Pending attachments to display */
  attachments: PendingAttachment[];
  /** Callback when an attachment is removed (if undefined, remove buttons are hidden) */
  onRemove?: (id: string) => void;
  /** Whether to show the dropzone overlay */
  isDragging?: boolean;
  /** Callback when files are dropped */
  onDrop?: (files: File[]) => void;
};

/**
 * Format file size for display
 */
function formatFileSize(bytes: number): string {
  if (bytes === 0)
    return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Number.parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
}

/**
 * Format date for display
 */
function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

/**
 * Render the appropriate file icon based on mime type
 */
function FileTypeIcon({ mimeType, className }: { mimeType: string; className?: string }) {
  const iconName = getFileIconName(mimeType);
  const iconClass = cn('size-4 text-muted-foreground', className);

  switch (iconName) {
    case 'image':
      return <FileImage className={iconClass} />;
    case 'file-code':
      return <FileCode className={iconClass} />;
    case 'file-text':
      return <FileText className={iconClass} />;
    default:
      return <FileIcon className={iconClass} />;
  }
}

/**
 * Hover preview content with file details
 */
function AttachmentTooltipContent({
  attachment,
}: {
  attachment: PendingAttachment;
}) {
  const { file, preview, status, uploadItem } = attachment;
  const isImage = file.type.startsWith('image/');
  const isUploading = status === UploadStatuses.UPLOADING;
  const isFailed = status === UploadStatuses.FAILED;

  return (
    <div className="flex flex-col gap-2 max-w-[280px]">
      {/* Large preview for images - use native img for object URLs */}
      {isImage && preview?.url && (
        <div className="relative w-full h-32 rounded-md overflow-hidden bg-muted">
          {/* eslint-disable-next-line next/no-img-element -- Object URL from local file */}
          <img
            src={preview.url}
            alt={file.name}
            className="object-contain size-full"
          />
        </div>
      )}

      {/* File icon for non-images */}
      {!isImage && (
        <div className="flex items-center justify-center w-full h-16 rounded-md bg-muted/50">
          <FileTypeIcon mimeType={file.type} className="size-8 text-muted-foreground/60" />
        </div>
      )}

      {/* File details */}
      <div className="space-y-1">
        <p className="text-sm font-medium break-all line-clamp-2">{file.name}</p>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          <span>{formatFileSize(file.size)}</span>
          <span>{getFileTypeLabel(file.type)}</span>
          <span>{formatDate(new Date(file.lastModified))}</span>
        </div>

        {/* Status indicator */}
        {isUploading && (
          <div className="flex items-center gap-2 text-xs text-primary">
            <div className="size-1.5 rounded-full bg-primary animate-pulse" />
            <span>
              Uploading...
              {' '}
              {uploadItem?.progress.percent ?? 0}
              %
            </span>
          </div>
        )}
        {isFailed && (
          <div className="flex items-center gap-2 text-xs text-destructive">
            <div className="size-1.5 rounded-full bg-destructive" />
            <span>Upload failed</span>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Compact attachment chip with hover preview
 */
function AttachmentChip({
  attachment,
  onRemove,
}: {
  attachment: PendingAttachment;
  onRemove?: () => void;
}) {
  const { file, preview, status, uploadItem } = attachment;
  const isImage = file.type.startsWith('image/');
  const isUploading = status === UploadStatuses.UPLOADING;
  const isFailed = status === UploadStatuses.FAILED;
  const uploadProgress = uploadItem?.progress.percent ?? 0;

  // Truncate filename for display
  const displayName = file.name.length > 12
    ? `${file.name.slice(0, 8)}...${file.name.slice(-4)}`
    : file.name;

  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>
        <motion.div
          layout
          initial={{ opacity: 0, scale: 0.9, x: -10 }}
          animate={{ opacity: 1, scale: 1, x: 0 }}
          exit={{ opacity: 0, scale: 0.9, x: -10 }}
          transition={{ duration: 0.15 }}
          className={cn(
            'relative group flex items-center gap-1.5 shrink-0',
            'h-8 px-1.5 pr-1 rounded-lg',
            'bg-muted/60 border border-border/40',
            'hover:bg-muted hover:border-border/60',
            'transition-colors duration-150',
            isFailed && 'border-destructive/40 bg-destructive/5',
          )}
        >
          {/* Thumbnail/Icon */}
          <div className="relative size-5 shrink-0 rounded overflow-hidden bg-background/50 flex items-center justify-center">
            {isImage && preview?.url
              ? (
                  /* eslint-disable-next-line next/no-img-element -- Object URL from local file */
                  <img
                    src={preview.url}
                    alt={file.name}
                    className="object-cover size-full"
                  />
                )
              : (
                  <FileTypeIcon mimeType={file.type} className="size-3" />
                )}
          </div>

          {/* Filename */}
          <span className="text-xs font-medium text-foreground/80 max-w-[80px] truncate">
            {displayName}
          </span>

          {/* Upload progress indicator */}
          {isUploading && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-b-lg overflow-hidden">
              <Progress value={uploadProgress} className="h-0.5 rounded-none" />
            </div>
          )}

          {/* Remove button - only shown when onRemove is provided */}
          {onRemove && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onRemove();
              }}
              className={cn(
                'size-4 shrink-0 rounded-full p-0',
                'opacity-60 hover:opacity-100',
                'hover:bg-destructive/10 hover:text-destructive',
                'transition-all duration-150',
              )}
              disabled={isUploading}
            >
              <X className="size-2.5" />
            </Button>
          )}
        </motion.div>
      </TooltipTrigger>
      <TooltipContent side="top" align="start" className="p-2">
        <AttachmentTooltipContent attachment={attachment} />
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Dropzone overlay for drag and drop - covers entire chat input
 */
export function ChatInputDropzoneOverlay({ isDragging }: { isDragging: boolean }) {
  return (
    <AnimatePresence>
      {isDragging && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className={cn(
            'absolute inset-0 z-50',
            'flex flex-col items-center justify-center gap-3',
            'bg-black/70 backdrop-blur-lg',
            'border-2 border-dashed border-primary/50',
            'rounded-2xl',
          )}
        >
          {/* Upload icon - static, no animation */}
          <div className="p-3 rounded-full bg-primary/15">
            <Upload className="size-8 text-primary" />
          </div>

          {/* Text content */}
          <div className="text-center">
            <p className="text-sm font-medium text-white">Drop files here</p>
            <p className="text-xs text-white/50 mt-0.5">Upload files to include in your message</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * Attachments row - horizontal scrollable list above the textarea
 * Note: Dropzone overlay is now rendered separately in chat-input.tsx
 */
export function ChatInputAttachments({
  attachments,
  onRemove,
}: Omit<ChatInputAttachmentsProps, 'isDragging' | 'onDrop'>) {
  if (attachments.length === 0) {
    return null;
  }

  return (
    <TooltipProvider>
      <motion.div
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: 'auto', opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="overflow-hidden"
      >
        <ScrollArea className="w-full">
          <div className="flex items-center gap-1.5 px-3 sm:px-4 py-2 border-b border-border/30">
            <AnimatePresence mode="popLayout">
              {attachments.map(attachment => (
                <AttachmentChip
                  key={attachment.id}
                  attachment={attachment}
                  onRemove={onRemove ? () => onRemove(attachment.id) : undefined}
                />
              ))}
            </AnimatePresence>
          </div>
          <ScrollBar orientation="horizontal" className="h-1.5" />
        </ScrollArea>
      </motion.div>
    </TooltipProvider>
  );
}
