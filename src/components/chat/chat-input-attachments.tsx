'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';

import { FileIconNames, getFileTypeColorClass, UploadStatuses } from '@/api/core/enums';
import { Icons } from '@/components/icons';
import { ScrollArea } from '@/components/ui/scroll-area';
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
  const iconClass = cn('size-5 text-white', className);

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

function getFileExtension(filename: string): string {
  const ext = filename.split('.').pop()?.toUpperCase() || '';
  return ext.length <= 5 ? ext : ext.slice(0, 4);
}

type AttachmentChipProps = {
  attachment: PendingAttachment;
  onRemove?: () => void;
};

function AttachmentChip({ attachment, onRemove }: AttachmentChipProps) {
  const { file, preview, status } = attachment;
  const isImage = file.type.startsWith('image/');
  const isPending = status === UploadStatuses.PENDING;
  const isUploading = status === UploadStatuses.UPLOADING;
  const isProcessing = isPending || isUploading;
  const isFailed = status === UploadStatuses.FAILED;

  // Truncate filename for display - show more characters now
  const displayName = file.name.length > 24
    ? `${file.name.slice(0, 20)}...`
    : file.name;

  // Get file extension for display
  const fileExtension = getFileExtension(file.name);

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
        'relative group flex items-center gap-2.5 shrink-0',
        'h-12 pl-1.5 pr-8 rounded-lg overflow-hidden',
        'bg-muted/60 border border-border/40',
        'hover:bg-muted hover:border-border/60',
        'transition-colors duration-150',
        isFailed && 'border-destructive/40 bg-destructive/5',
      )}
    >
      {/* Larger icon area with colored background */}
      <div className={cn(
        'size-9 shrink-0 rounded-md flex items-center justify-center',
        isImage && preview?.url ? 'bg-transparent' : getFileTypeColorClass(file.type),
      )}
      >
        {isProcessing
          ? (
              <Icons.loader className="size-4 text-white animate-spin" />
            )
          : isImage && preview?.url
            ? (
                /* eslint-disable-next-line next/no-img-element -- Object URL from local file */
                <img
                  src={preview.url}
                  alt={file.name}
                  className="object-cover size-full rounded-md"
                />
              )
            : (
                <FileTypeIcon mimeType={file.type} />
              )}
      </div>

      {/* Text content - filename and extension */}
      <div className="flex flex-col items-start min-w-0 gap-0.5">
        <span className="text-sm font-medium text-foreground/90 max-w-[140px] truncate leading-tight">
          {displayName}
        </span>
        <span className="text-xs text-muted-foreground uppercase leading-tight">
          {fileExtension}
        </span>
      </div>

      {/* Remove/Cancel button - positioned in corner */}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRemove();
          }}
          className={cn(
            'absolute top-1 right-1',
            'size-5 shrink-0 rounded-full p-0',
            'inline-flex items-center justify-center',
            'text-muted-foreground/60 bg-background/80',
            'opacity-0 group-hover:opacity-100',
            'hover:bg-destructive/20 hover:text-destructive',
            'transition-all duration-150',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:opacity-100',
          )}
          aria-label="Remove attachment"
        >
          <Icons.x className="size-3" />
        </button>
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
      <ScrollArea orientation="horizontal" className="w-full">
        <div className="flex items-center gap-2 px-3 sm:px-4 py-2 border-b border-border/30">
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
      </ScrollArea>
    </motion.div>
  );
}
