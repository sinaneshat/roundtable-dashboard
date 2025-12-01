'use client';
/* eslint-disable simple-import-sort/imports -- Circular fix conflict with antfu config */

/**
 * Message Attachment Preview Component
 *
 * Compact, square-shaped attachment previews for chat messages.
 * Follows ChatGPT-style small thumbnail previews displayed above message text.
 *
 * Features:
 * - Small square thumbnails (48x48px)
 * - Image previews with fallback
 * - File type icons for non-images
 * - Hover tooltip with details
 * - Download on click
 */

import { FileCode, File as FileIcon, FileText, ImageIcon } from 'lucide-react';
import Image from 'next/image';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/ui/cn';

export type MessageAttachment = {
  url: string;
  filename?: string;
  mediaType?: string;
};

type MessageAttachmentPreviewProps = {
  attachments: MessageAttachment[];
  messageId: string;
};

/**
 * Get human-readable file type label
 */
function getFileTypeLabel(mimeType?: string): string {
  if (!mimeType)
    return 'File';

  const typeMap: Record<string, string> = {
    'application/pdf': 'PDF',
    'application/json': 'JSON',
    'application/xml': 'XML',
    'text/plain': 'Text',
    'text/markdown': 'Markdown',
    'text/csv': 'CSV',
    'text/html': 'HTML',
    'text/css': 'CSS',
    'application/javascript': 'JavaScript',
    'application/typescript': 'TypeScript',
    'image/png': 'PNG',
    'image/jpeg': 'JPEG',
    'image/gif': 'GIF',
    'image/webp': 'WebP',
    'image/svg+xml': 'SVG',
  };

  if (typeMap[mimeType])
    return typeMap[mimeType];
  if (mimeType.startsWith('image/'))
    return 'Image';
  if (mimeType.startsWith('text/'))
    return 'Text';
  if (mimeType.startsWith('application/'))
    return 'Document';

  return 'File';
}

/**
 * Get icon name based on mime type
 */
function getIconForType(mimeType?: string): 'image' | 'code' | 'text' | 'file' {
  if (!mimeType)
    return 'file';
  if (mimeType.startsWith('image/'))
    return 'image';
  if (mimeType.includes('javascript') || mimeType.includes('typescript') || mimeType.includes('json') || mimeType.includes('xml') || mimeType.includes('html') || mimeType.includes('css'))
    return 'code';
  if (mimeType.startsWith('text/'))
    return 'text';
  return 'file';
}

/**
 * Single attachment thumbnail
 */
function AttachmentThumbnail({
  attachment,
  messageId: _messageId,
}: {
  attachment: MessageAttachment;
  messageId: string;
}) {
  const { url, filename, mediaType } = attachment;
  const isImage = mediaType?.startsWith('image/');
  const iconType = getIconForType(mediaType);
  const displayName = filename || 'Attachment';

  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>
        <a
          href={url}
          download={filename}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            'group relative flex-shrink-0',
            'size-12 rounded-lg overflow-hidden',
            'bg-muted/60 border border-border/50',
            'hover:border-border hover:bg-muted',
            'transition-all duration-150',
            'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
          )}
        >
          {isImage
            ? (
                <Image
                  src={url}
                  alt={displayName}
                  fill
                  className="object-cover"
                  sizes="48px"
                  unoptimized
                />
              )
            : (
                <div className="size-full flex items-center justify-center">
                  {iconType === 'image' && <ImageIcon className="size-5 text-muted-foreground" />}
                  {iconType === 'code' && <FileCode className="size-5 text-muted-foreground" />}
                  {iconType === 'text' && <FileText className="size-5 text-muted-foreground" />}
                  {iconType === 'file' && <FileIcon className="size-5 text-muted-foreground" />}
                </div>
              )}

          {/* Hover overlay */}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
        </a>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[200px]">
        <div className="space-y-1">
          <p className="text-xs font-medium break-all">{displayName}</p>
          <p className="text-xs text-muted-foreground">{getFileTypeLabel(mediaType)}</p>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Message attachments grid
 * Displays small, square attachment previews above message text
 */
export function MessageAttachmentPreview({
  attachments,
  messageId,
}: MessageAttachmentPreviewProps) {
  if (!attachments || attachments.length === 0)
    return null;

  return (
    <TooltipProvider>
      <div className="flex flex-wrap gap-2 mb-3">
        {attachments.map(attachment => (
          <AttachmentThumbnail
            key={`${messageId}-att-${attachment.url}`}
            attachment={attachment}
            messageId={messageId}
          />
        ))}
      </div>
    </TooltipProvider>
  );
}
