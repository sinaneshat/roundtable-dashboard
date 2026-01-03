'use client';

import dynamic from 'next/dynamic';
import type { ComponentType } from 'react';

import type { ChatMode } from '@/api/core/enums';
import type { EnhancedModelResponse } from '@/api/routes/models/schema';
import { Icons } from '@/components/icons';
import { Skeleton } from '@/components/ui/skeleton';
import type { ParticipantConfig } from '@/lib/schemas/participant-schemas';
import { cn } from '@/lib/ui/cn';

type ChatInputToolbarMenuProps = {
  selectedParticipants: ParticipantConfig[];
  allModels: EnhancedModelResponse[];
  onOpenModelModal: () => void;
  selectedMode: ChatMode;
  onOpenModeModal: () => void;
  enableWebSearch: boolean;
  onWebSearchToggle?: (enabled: boolean) => void;
  onAttachmentClick?: () => void;
  attachmentCount?: number;
  enableAttachments?: boolean;
  isListening?: boolean;
  onToggleSpeech?: () => void;
  isSpeechSupported?: boolean;
  disabled?: boolean;
  isModelsLoading?: boolean;
};

function ChatInputToolbarSkeleton() {
  return (
    <div className="flex items-center gap-2">
      <Skeleton className="h-9 w-24 rounded-2xl" />
      <Skeleton className="h-9 w-20 rounded-2xl" />
      <Skeleton className="h-9 w-9 rounded-lg" />
      <Skeleton className="h-9 w-9 rounded-lg" />
    </div>
  );
}

function ChatInputToolbarMobileSkeleton() {
  return (
    <button
      type="button"
      disabled
      className={cn(
        'flex items-center justify-center size-8 rounded-full',
        'bg-white/5 opacity-50',
      )}
    >
      <Icons.moreHorizontal className="size-4" />
    </button>
  );
}

const ChatInputToolbarMenuInternal = dynamic(
  () => import('@/components/chat/chat-input-toolbar-menu').then(m => ({
    default: m.ChatInputToolbarMenu,
  })),
  {
    ssr: false,
    loading: () => (
      <>
        <ChatInputToolbarSkeleton />
        <ChatInputToolbarMobileSkeleton />
      </>
    ),
  },
) as ComponentType<ChatInputToolbarMenuProps>;

export function ChatInputToolbarMenu(props: ChatInputToolbarMenuProps) {
  return <ChatInputToolbarMenuInternal {...props} />;
}
