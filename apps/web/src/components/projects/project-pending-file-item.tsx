import { getFileTypeColorClass, UploadStatuses } from '@roundtable/shared';
import { useState } from 'react';

import { FileTypeIcon } from '@/components/chat/chat-input-attachments';
import { Icons } from '@/components/icons';
import { Skeleton } from '@/components/ui/skeleton';
import { useDownloadUrlQuery } from '@/hooks/queries';
import type { PendingAttachment } from '@/hooks/utils';
import { formatFileSize } from '@/lib/format';
import { useTranslations } from '@/lib/i18n';
import { cn } from '@/lib/ui/cn';

type ProjectPendingFileItemProps = {
  attachment: PendingAttachment;
  onCancel: () => void;
  onRemove: () => void;
};

export function ProjectPendingFileItem({
  attachment,
  onCancel,
  onRemove,
}: ProjectPendingFileItemProps) {
  const t = useTranslations();
  const { file, preview, status, uploadId } = attachment;
  const isImage = file.type.startsWith('image/');
  const isProcessing = status === UploadStatuses.PENDING || status === UploadStatuses.UPLOADING;
  const isCompleted = status === UploadStatuses.COMPLETED;
  const isFailed = status === UploadStatuses.FAILED;

  const [isImageLoaded, setIsImageLoaded] = useState(false);

  // Fetch download URL only when upload completed and we have uploadId
  const { data: downloadUrlResult, isLoading: isLoadingUrl } = useDownloadUrlQuery(
    uploadId ?? '',
    isCompleted && !!uploadId,
  );
  const downloadUrl = downloadUrlResult?.success ? downloadUrlResult.data.url : null;

  const handleDownload = () => {
    if (downloadUrl) {
      window.open(downloadUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const handleAction = isProcessing ? onCancel : onRemove;
  const ActionIcon = isProcessing ? Icons.x : Icons.trash;

  return (
    <div
      className={cn(
        'flex items-center gap-3 p-3 rounded-lg',
        'bg-muted/40 border border-border/40 hover:bg-muted/60 transition-colors',
        isFailed && 'border-destructive/40 bg-destructive/5',
      )}
    >
      {/* Thumbnail */}
      <div
        className={cn(
          'size-10 rounded-lg flex items-center justify-center shrink-0 overflow-hidden relative',
          !isImage && getFileTypeColorClass(file.type),
        )}
      >
        {isImage && preview?.url
          ? (
              <>
                {!isImageLoaded && <Skeleton className="absolute inset-0 rounded-lg" />}
                <img
                  src={preview.url}
                  alt={file.name}
                  className={cn(
                    'object-cover size-full rounded-lg transition-opacity duration-300',
                    !isImageLoaded && 'opacity-0',
                    isImageLoaded && 'opacity-100',
                  )}
                  onLoad={() => setIsImageLoaded(true)}
                />
              </>
            )
          : (
              <FileTypeIcon mimeType={file.type} className="size-4" />
            )}

        {/* Status overlay during upload */}
        {isProcessing && (
          <div className="absolute inset-0 bg-black/40 rounded-lg flex items-center justify-center">
            <Icons.loader className="size-4 text-white animate-spin" />
          </div>
        )}
      </div>

      {/* File info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{file.name}</p>
        <p className="text-xs text-muted-foreground">
          {formatFileSize(file.size)}
          {isProcessing && ' • Uploading...'}
          {isFailed && ' • Failed'}
        </p>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-1">
        {/* Download button - only show when completed and URL available */}
        {isCompleted && (
          <button
            type="button"
            onClick={handleDownload}
            disabled={!downloadUrl || isLoadingUrl}
            className="p-1.5 rounded-md hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
            title={t('actions.download')}
          >
            {isLoadingUrl
              ? <Icons.loader className="size-4 animate-spin" />
              : <Icons.download className="size-4" />}
          </button>
        )}

        {/* Cancel/Delete button */}
        <button
          type="button"
          onClick={handleAction}
          className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
          title={isProcessing ? t('actions.cancel') : t('actions.remove')}
        >
          <ActionIcon className="size-4" />
        </button>
      </div>
    </div>
  );
}
