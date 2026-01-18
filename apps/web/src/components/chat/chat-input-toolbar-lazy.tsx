import type { ChatMode } from '@roundtable/shared';

import { Icons } from '@/components/icons';
import { Skeleton } from '@/components/ui/skeleton';
import { dynamic } from '@/lib/compat';
import type { ParticipantConfig } from '@/lib/schemas/participant-schemas';
import { cn } from '@/lib/ui/cn';
import type { EnhancedModelResponse } from '@/types/api';

export type ChatInputToolbarMenuProps = {
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
  autoMode?: boolean;
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

const ChatInputToolbarMenuInternal = dynamic<ChatInputToolbarMenuProps>(
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
);

export function ChatInputToolbarMenu(props: ChatInputToolbarMenuProps) {
  return <ChatInputToolbarMenuInternal {...props} />;
}
