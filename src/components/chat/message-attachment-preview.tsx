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
 * - Automatic signed URL fetching for invalid URLs
 */

import { FileCode, File as FileIcon, FileText, ImageIcon, Loader2 } from 'lucide-react';

import { SmartImage } from '@/components/ui/smart-image';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useDownloadUrlQuery } from '@/hooks/queries';
import { getFileIconName, getFileTypeLabel } from '@/hooks/utils';
import { cn } from '@/lib/ui/cn';

export type MessageAttachment = {
  url: string;
  filename?: string;
  mediaType?: string;
  /** Upload ID for fetching signed URL if url is invalid (blob/empty) */
  uploadId?: string;
};

/**
 * Check if a URL is valid for display (not blob, not empty)
 * Blob URLs are temporary and tied to browser session
 */
function isValidDisplayUrl(url: string | undefined): boolean {
  if (!url || url === '')
    return false;
  if (url.startsWith('blob:'))
    return false;
  return true;
}

/**
 * Check if a URL is a data URL (base64 encoded)
 */
function isDataUrl(url: string | undefined): boolean {
  return url?.startsWith('data:') ?? false;
}

type MessageAttachmentPreviewProps = {
  attachments: MessageAttachment[];
  messageId: string;
};

/**
 * Map centralized icon name to component icon type
 * Uses single source of truth from @/hooks/utils/use-file-preview
 */
type IconType = 'image' | 'code' | 'text' | 'file';

function getIconType(mimeType?: string): IconType {
  if (!mimeType)
    return 'file';
  const iconName = getFileIconName(mimeType);
  switch (iconName) {
    case 'image':
      return 'image';
    case 'file-code':
      return 'code';
    case 'file-text':
      return 'text';
    default:
      return 'file';
  }
}

/**
 * Single attachment thumbnail with signed URL fetching
 */
function AttachmentThumbnail({
  attachment,
  messageId: _messageId,
}: {
  attachment: MessageAttachment;
  messageId: string;
}) {
  const { url: originalUrl, filename, mediaType, uploadId } = attachment;
  const isImage = mediaType?.startsWith('image/');
  const iconType = getIconType(mediaType);
  const displayName = filename || 'Attachment';

  // Determine if we need to fetch a signed URL
  const needsFetch = !isValidDisplayUrl(originalUrl) && !isDataUrl(originalUrl) && !!uploadId;

  // ✅ TYPE-SAFE: Use query hook instead of direct service call
  const { data: downloadUrlResult, isLoading, isError: fetchError } = useDownloadUrlQuery(
    uploadId || '',
    needsFetch,
  );

  // Extract resolved URL from query result
  const resolvedUrl = downloadUrlResult?.data?.url ?? null;

  // Determine the best URL to use
  const effectiveUrl = resolvedUrl || originalUrl;
  const hasValidUrl = isValidDisplayUrl(effectiveUrl) || isDataUrl(effectiveUrl);
  const canShowImage = isImage && hasValidUrl;

  // For invalid URLs without uploadId, don't make it a download link
  const WrapperComponent = hasValidUrl ? 'a' : 'div';
  const wrapperProps = hasValidUrl
    ? {
        href: effectiveUrl,
        download: filename,
        target: '_blank' as const,
        rel: 'noopener noreferrer',
      }
    : {};

  // Determine tooltip status message
  const getStatusMessage = () => {
    if (isLoading)
      return 'Loading preview...';
    if (fetchError)
      return 'Preview unavailable';
    if (!hasValidUrl)
      return 'Preview unavailable';
    return null;
  };

  const statusMessage = getStatusMessage();

  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>
        <WrapperComponent
          {...wrapperProps}
          className={cn(
            'group relative flex-shrink-0',
            'size-12 rounded-lg overflow-hidden',
            'bg-muted/60 border border-border/50',
            'hover:border-border hover:bg-muted',
            'transition-all duration-150',
            'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
            !hasValidUrl && !isLoading && 'cursor-default opacity-70',
          )}
          // Query auto-fetches when enabled; no manual trigger needed
        >
          {isLoading
            ? (
                <div className="size-full flex items-center justify-center">
                  <Loader2 className="size-4 text-muted-foreground animate-spin" />
                </div>
              )
            : canShowImage
              ? (
                  <SmartImage
                    src={effectiveUrl}
                    alt={displayName}
                    fill
                    sizes="48px"
                    unoptimized
                    containerClassName="size-full"
                    fallback={(
                      <div className="size-full flex items-center justify-center">
                        <ImageIcon className="size-5 text-muted-foreground" />
                      </div>
                    )}
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
        </WrapperComponent>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[200px]">
        <div className="space-y-1">
          <p className="text-xs font-medium break-all">{displayName}</p>
          <p className="text-xs text-muted-foreground">{mediaType ? getFileTypeLabel(mediaType) : 'File'}</p>
          {statusMessage && (
            <p className={cn(
              'text-xs',
              fetchError ? 'text-red-500' : 'text-amber-500',
            )}
            >
              {statusMessage}
            </p>
          )}
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
