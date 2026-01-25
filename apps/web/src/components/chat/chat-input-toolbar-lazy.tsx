import type { ChatMode } from '@roundtable/shared';

import { Icons } from '@/components/icons';
import { Skeleton } from '@/components/ui/skeleton';
import type { ParticipantConfig } from '@/lib/schemas/participant-schemas';
import dynamic from '@/lib/utils/dynamic';
import type { Model } from '@/services/api';

export type ChatInputToolbarMenuProps = {
  selectedParticipants: ParticipantConfig[];
  allModels: Model[];
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
      <Skeleton className="h-10 sm:h-9 w-24 rounded-xl" />
      <Skeleton className="h-10 sm:h-9 w-20 rounded-xl" />
      <Skeleton className="size-10 sm:size-9 rounded-xl" />
      <Skeleton className="size-10 sm:size-9 rounded-xl" />
    </div>
  );
}

function ChatInputToolbarMobileSkeleton() {
  return (
    <button
      type="button"
      disabled
      className="flex items-center justify-center size-8 rounded-xl bg-white/5 opacity-50"
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
