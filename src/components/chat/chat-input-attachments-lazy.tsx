'use client';

import dynamic from 'next/dynamic';
import type { ComponentType } from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import type { PendingAttachment } from '@/hooks/utils';

type ChatInputAttachmentsProps = {
  attachments: PendingAttachment[];
  onRemove?: (id: string) => void;
};

function ChatInputAttachmentsSkeleton() {
  return (
    <div className="px-3 sm:px-4 py-2 border-b border-border/30">
      <div className="flex items-center gap-1.5">
        <Skeleton className="h-8 w-24 rounded-xl" />
        <Skeleton className="h-8 w-20 rounded-xl" />
        <Skeleton className="h-8 w-28 rounded-xl" />
      </div>
    </div>
  );
}

const ChatInputAttachmentsInternal = dynamic(
  () => import('@/components/chat/chat-input-attachments').then(m => ({
    default: m.ChatInputAttachments,
  })),
  {
    ssr: false,
    loading: () => <ChatInputAttachmentsSkeleton />,
  },
) as ComponentType<ChatInputAttachmentsProps>;

export function ChatInputAttachments(props: ChatInputAttachmentsProps) {
  // Only render if there are attachments
  if (props.attachments.length === 0) {
    return null;
  }

  return <ChatInputAttachmentsInternal {...props} />;
}

// Re-export overlay for use in ChatInput
export { ChatInputDropzoneOverlay } from '@/components/chat/chat-input-attachments';
