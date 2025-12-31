'use client';

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

/* eslint-disable simple-import-sort/imports -- circular conflict with alias */
import { FileCode, File as FileIcon, FileText, ImageIcon, Loader2 } from 'lucide-react';
/* eslint-enable simple-import-sort/imports */
import { useTranslations } from 'next-intl';
import { z } from 'zod';

import type { IconType } from '@/api/core/enums';
import { IconTypes } from '@/api/core/enums';
import { SmartImage } from '@/components/ui/smart-image';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useDownloadUrlQuery } from '@/hooks/queries';
import { getFileIconName, getFileTypeLabel } from '@/hooks/utils';
import { cn } from '@/lib/ui/cn';

// ============================================================================
// TYPE-SAFE SCHEMA DEFINITIONS
// ============================================================================

/**
 * Message attachment schema with Zod validation
 * Single source of truth for attachment type safety
 */
export const MessageAttachmentSchema = z.object({
  url: z.string(),
  filename: z.string().optional(),
  mediaType: z.string().optional(),
  uploadId: z.string().optional(),
});

export type MessageAttachment = z.infer<typeof MessageAttachmentSchema>;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Check if a URL is valid for display (not blob, not empty)
 * Blob URLs are temporary and tied to browser session
 */
function isValidDisplayUrl(url: string | undefined): boolean {
  return Boolean(url && url !== '' && !url.startsWith('blob:'));
}

/**
 * Map centralized icon name to component icon type
 * Uses single source of truth from @/hooks/utils/use-file-preview
 */
function getIconType(mimeType?: string): IconType {
  if (!mimeType) {
    return IconTypes.FILE;
  }

  const iconName = getFileIconName(mimeType);

  if (iconName === 'image') {
    return IconTypes.IMAGE;
  }
  if (iconName === 'file-code') {
    return IconTypes.CODE;
  }
  if (iconName === 'file-text') {
    return IconTypes.TEXT;
  }

  return IconTypes.FILE;
}

// ============================================================================
// ATTACHMENT PREVIEW COMPONENT
// ============================================================================

type MessageAttachmentPreviewProps = {
  attachments: MessageAttachment[];
  messageId: string;
};

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
  const t = useTranslations('chat.attachments');
  const { url: originalUrl, filename, mediaType, uploadId } = attachment;
  const isImage = Boolean(mediaType?.startsWith('image/'));
  const iconType = getIconType(mediaType);
  const displayName = filename ?? t('defaultName');

  const needsFetch = !isValidDisplayUrl(originalUrl) && Boolean(uploadId);

  const { data: downloadUrlResult, isLoading, isError: fetchError } = useDownloadUrlQuery(
    uploadId ?? '',
    needsFetch,
  );

  const resolvedUrl = downloadUrlResult?.data?.url ?? null;
  const effectiveUrl = resolvedUrl ?? originalUrl;
  const hasValidUrl = isValidDisplayUrl(effectiveUrl);
  const canShowImage = isImage && hasValidUrl;

  const WrapperComponent = hasValidUrl ? 'a' : 'div';
  const wrapperProps = hasValidUrl
    ? {
        href: effectiveUrl,
        download: filename,
        target: '_blank' as const,
        rel: 'noopener noreferrer',
      }
    : {};

  const statusMessage = (() => {
    if (isLoading) {
      return t('loadingPreview');
    }
    if (fetchError || !hasValidUrl) {
      return t('previewUnavailable');
    }
    return null;
  })();

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
                    {iconType === IconTypes.IMAGE && <ImageIcon className="size-5 text-muted-foreground" />}
                    {iconType === IconTypes.CODE && <FileCode className="size-5 text-muted-foreground" />}
                    {iconType === IconTypes.TEXT && <FileText className="size-5 text-muted-foreground" />}
                    {iconType === IconTypes.FILE && <FileIcon className="size-5 text-muted-foreground" />}
                  </div>
                )}

          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
        </WrapperComponent>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[200px]">
        <div className="space-y-1">
          <p className="text-xs font-medium break-all">{displayName}</p>
          <p className="text-xs text-muted-foreground">
            {mediaType ? getFileTypeLabel(mediaType) : t('defaultFileType')}
          </p>
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
  if (!attachments?.length) {
    return null;
  }

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
