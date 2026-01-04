'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';

import { FileIconNames, UploadStatuses } from '@/api/core/enums';
import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import type { PendingAttachment } from '@/hooks/utils';
import { getFileIconName } from '@/hooks/utils';
import { formatFileSize } from '@/lib/format';
import { cn } from '@/lib/ui/cn';

type ChatInputAttachmentsProps = {
  attachments: PendingAttachment[];
  onRemove?: (id: string) => void;
  isDragging?: boolean;
  onDrop?: (files: File[]) => void;
};

type FileTypeIconProps = {
  mimeType: string;
  className?: string;
};

function FileTypeIcon({ mimeType, className }: FileTypeIconProps) {
  const iconName = getFileIconName(mimeType);
  const iconClass = cn('size-4 text-muted-foreground', className);

  switch (iconName) {
    case FileIconNames.IMAGE:
      return <Icons.fileImage className={iconClass} />;
    case FileIconNames.FILE_CODE:
      return <Icons.fileCode className={iconClass} />;
    case FileIconNames.FILE_TEXT:
      return <Icons.fileText className={iconClass} />;
    default:
      return <Icons.file className={iconClass} />;
  }
}

type AttachmentChipProps = {
  attachment: PendingAttachment;
  onRemove?: () => void;
};

function AttachmentChip({ attachment, onRemove }: AttachmentChipProps) {
  const { file, preview, status, uploadItem } = attachment;
  const isImage = file.type.startsWith('image/');
  const isUploading = status === UploadStatuses.UPLOADING;
  const isFailed = status === UploadStatuses.FAILED;
  const uploadProgress = uploadItem?.progress.percent ?? 0;

  // Truncate filename for display
  const displayName = file.name.length > 12
    ? `${file.name.slice(0, 8)}...${file.name.slice(-4)}`
    : file.name;

  // Build native title text
  const titleText = `${file.name} (${formatFileSize(file.size)})`;

  // Use native title instead of Radix Tooltip to avoid React 19 compose-refs infinite loop
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9, x: -10 }}
      animate={{ opacity: 1, scale: 1, x: 0 }}
      exit={{ opacity: 0, scale: 0.9, x: -10 }}
      transition={{ duration: 0.15 }}
      title={titleText}
      className={cn(
        'relative group flex items-center gap-1.5 shrink-0',
        'h-8 px-1.5 pr-1 rounded-xl',
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
            'hover:bg-destructive/20 hover:text-destructive',
            'transition-all duration-150',
          )}
          disabled={isUploading}
        >
          <Icons.x className="size-2.5" />
        </Button>
      )}
    </motion.div>
  );
}

type ChatInputDropzoneOverlayProps = {
  isDragging: boolean;
};

export function ChatInputDropzoneOverlay({ isDragging }: ChatInputDropzoneOverlayProps) {
  const t = useTranslations();
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
            <Icons.upload className="size-8 text-primary" />
          </div>

          {/* Text content */}
          <div className="text-center">
            <p className="text-sm font-medium text-white">{t('chat.attachments.dropHere')}</p>
            <p className="text-xs text-white/50 mt-0.5">{t('chat.attachments.dropDescription')}</p>
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
  );
}
