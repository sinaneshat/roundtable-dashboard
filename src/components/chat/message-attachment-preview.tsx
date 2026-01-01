'use client';

/* eslint-disable simple-import-sort/imports -- Circular fix conflict in ESLint config */
import { useTranslations } from 'next-intl';

import { Icons } from '@/components/icons';
import { z } from 'zod';

import type { IconType } from '@/api/core/enums';
import { FileIconNames, getFileTypeLabelFromMime, IconTypes } from '@/api/core/enums';
import { SmartImage } from '@/components/ui/smart-image';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useDownloadUrlQuery } from '@/hooks/queries';
import { getFileIconName } from '@/hooks/utils';
import { cn } from '@/lib/ui/cn';
/* eslint-enable simple-import-sort/imports */

export const MessageAttachmentSchema = z.object({
  url: z.string(),
  filename: z.string().optional(),
  mediaType: z.string().optional(),
  uploadId: z.string().optional(),
});

export type MessageAttachment = z.infer<typeof MessageAttachmentSchema>;

function isValidDisplayUrl(url: string | undefined): boolean {
  return Boolean(url && url !== '' && !url.startsWith('blob:'));
}

function getIconType(mimeType?: string): IconType {
  if (!mimeType) {
    return IconTypes.FILE;
  }

  const iconName = getFileIconName(mimeType);

  if (iconName === FileIconNames.IMAGE) {
    return IconTypes.IMAGE;
  }
  if (iconName === FileIconNames.FILE_CODE) {
    return IconTypes.CODE;
  }
  if (iconName === FileIconNames.FILE_TEXT) {
    return IconTypes.TEXT;
  }

  return IconTypes.FILE;
}

type MessageAttachmentPreviewProps = {
  attachments: MessageAttachment[];
  messageId: string;
};

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
    <Tooltip delayDuration={800}>
      <TooltipTrigger asChild>
        <WrapperComponent
          {...wrapperProps}
          className={cn(
            'group relative flex-shrink-0',
            'size-12 rounded-lg overflow-hidden',
            'bg-muted/60 border border-border/50',
            'hover:border-border hover:bg-muted',
            'transition-all duration-150',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            !hasValidUrl && !isLoading && 'cursor-default opacity-70',
          )}
        >
          {isLoading
            ? (
                <div className="size-full flex items-center justify-center">
                  <Icons.loader className="size-4 text-muted-foreground animate-spin" />
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
                        <Icons.image className="size-5 text-muted-foreground" />
                      </div>
                    )}
                  />
                )
              : (
                  <div className="size-full flex items-center justify-center">
                    {iconType === IconTypes.IMAGE && <Icons.image className="size-5 text-muted-foreground" />}
                    {iconType === IconTypes.CODE && <Icons.fileCode className="size-5 text-muted-foreground" />}
                    {iconType === IconTypes.TEXT && <Icons.fileText className="size-5 text-muted-foreground" />}
                    {iconType === IconTypes.FILE && <Icons.file className="size-5 text-muted-foreground" />}
                  </div>
                )}

          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
        </WrapperComponent>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[200px]">
        <div className="space-y-1">
          <p className="text-xs font-medium break-all">{displayName}</p>
          <p className="text-xs text-muted-foreground">
            {mediaType ? getFileTypeLabelFromMime(mediaType) : t('defaultFileType')}
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
