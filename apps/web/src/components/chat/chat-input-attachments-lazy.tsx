import { Suspense } from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import type { PendingAttachment } from '@/hooks/utils';
import { dynamic } from '@/lib/compat';

type ChatInputAttachmentsProps = {
  attachments: PendingAttachment[];
  onRemove?: (id: string) => void;
};

const ATTACHMENT_SKELETON_WIDTHS = ['w-24', 'w-20', 'w-28', 'w-22', 'w-26', 'w-18', 'w-30', 'w-20', 'w-24', 'w-22'] as const;

type ChatInputAttachmentsSkeletonProps = {
  count: number;
};

function ChatInputAttachmentsSkeleton({ count }: ChatInputAttachmentsSkeletonProps) {
  return (
    <div className="px-3 sm:px-4 py-2 border-b border-border/30">
      <div className="flex items-center gap-1.5">
        {Array.from({ length: count }, (_, i) => (
          <Skeleton
            key={`attachment-skeleton-${i}`}
            className={`h-8 ${ATTACHMENT_SKELETON_WIDTHS[i % ATTACHMENT_SKELETON_WIDTHS.length]} rounded-xl`}
          />
        ))}
      </div>
    </div>
  );
}

const ChatInputAttachmentsInternal = dynamic<ChatInputAttachmentsProps>(
  () => import('@/components/chat/chat-input-attachments').then(m => ({
    default: m.ChatInputAttachments,
  })),
  { ssr: false },
);

export function ChatInputAttachments(props: ChatInputAttachmentsProps) {
  if (props.attachments.length === 0) {
    return null;
  }

  return (
    <Suspense fallback={<ChatInputAttachmentsSkeleton count={props.attachments.length} />}>
      <ChatInputAttachmentsInternal {...props} />
    </Suspense>
  );
}
