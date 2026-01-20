import { ComponentSizes, ComponentVariants, MessageStatuses } from '@roundtable/shared';
import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

import type { ChatRenameDialogProps } from '@/components/chat/chat-rename-dialog';
import { ChatThreadMenuItems } from '@/components/chat/chat-thread-menu-items';
import type { ShareDialogProps } from '@/components/chat/share-dialog';
import { SocialShareButton } from '@/components/chat/social-share-button';
import { Icons } from '@/components/icons';
import { useChatStore } from '@/components/providers';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useToggleFavoriteMutation, useTogglePublicMutation } from '@/hooks/mutations';
import { useThreadQuery } from '@/hooks/queries';
import { useMediaQuery } from '@/hooks/utils';
import { getAppBaseUrl } from '@/lib/config/base-urls';
import { useTranslations } from '@/lib/i18n';
import dynamic from '@/lib/utils/dynamic';
import type { ChatThread, ChatThreadFlexible } from '@/services/api';

const ShareDialog = dynamic<ShareDialogProps>(
  () => import('@/components/chat/share-dialog').then(m => ({ default: m.ShareDialog })),
  { ssr: false },
);

const ChatRenameDialog = dynamic<ChatRenameDialogProps>(
  () => import('@/components/chat/chat-rename-dialog').then(m => ({ default: m.ChatRenameDialog })),
  { ssr: false },
);

type ChatThreadActionsProps = {
  thread: ChatThread | ChatThreadFlexible;
  slug: string;
  onDeleteClick?: () => void;
  isPublicMode?: boolean;
  /** Skip fetching thread data - use when data is already available (e.g., from Zustand store) */
  skipFetch?: boolean;
};

export function ChatThreadActions({ thread, slug, onDeleteClick, isPublicMode = false, skipFetch = false }: ChatThreadActionsProps) {
  const t = useTranslations();
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const toggleFavoriteMutation = useToggleFavoriteMutation();
  const togglePublicMutation = useTogglePublicMutation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);

  // Skip query when data is already available (overview screen with active chat)
  const { data: cachedThreadData } = useThreadQuery(thread.id, !isPublicMode && !skipFetch);

  const threadIsPublic = cachedThreadData?.success && cachedThreadData.data && typeof cachedThreadData.data === 'object' && 'thread' in cachedThreadData.data && cachedThreadData.data.thread && typeof cachedThreadData.data.thread === 'object' && 'isPublic' in cachedThreadData.data.thread
    ? (cachedThreadData.data.thread as { isPublic?: boolean }).isPublic
    : thread.isPublic;

  const { storeThreadId, storeThreadTitle, isBusy } = useChatStore(useShallow(s => ({
    storeThreadId: s.thread?.id,
    storeThreadTitle: s.thread?.title,
    isBusy: s.isStreaming
      || s.waitingToStartStreaming
      || s.isCreatingThread
      || s.streamingRoundNumber !== null
      || s.preSearches.some(ps => ps.status === MessageStatuses.PENDING || ps.status === MessageStatuses.STREAMING),
  })));
  const currentTitle = (storeThreadTitle && thread.id === storeThreadId)
    ? storeThreadTitle
    : (thread.title ?? '');

  const displayIsFavorite = (() => {
    if (toggleFavoriteMutation.isSuccess && toggleFavoriteMutation.data) {
      const { data } = toggleFavoriteMutation;
      if (data.success && data.data?.thread?.isFavorite !== undefined) {
        return data.data.thread.isFavorite;
      }
    }
    if (toggleFavoriteMutation.isPending && toggleFavoriteMutation.variables) {
      return toggleFavoriteMutation.variables.isFavorite;
    }
    return thread.isFavorite ?? false;
  })();

  // Derived value: use optimistic mutation value when pending, otherwise use cache
  const displayIsPublic = togglePublicMutation.isPending && togglePublicMutation.variables
    ? togglePublicMutation.variables.isPublic
    : threadIsPublic;

  const shareUrl = `${getAppBaseUrl()}/public/chat/${slug}`;

  const handleToggleFavorite = () => {
    toggleFavoriteMutation.mutate({
      threadId: thread.id,
      isFavorite: !displayIsFavorite,
      slug,
    });
  };

  const handleMakePublic = () => {
    if (threadIsPublic || togglePublicMutation.isPending) {
      return;
    }
    togglePublicMutation.mutate({ threadId: thread.id, isPublic: true, slug });
  };

  const handleMakePrivate = () => {
    if (!threadIsPublic || togglePublicMutation.isPending) {
      setIsShareDialogOpen(false);
      return;
    }
    setIsShareDialogOpen(false);
    togglePublicMutation.mutate({ threadId: thread.id, isPublic: false, slug });
  };

  const handleShareDialogOpenChange = (open: boolean) => {
    if (!open && togglePublicMutation.isPending)
      return;
    setIsShareDialogOpen(open);
  };

  const handleOpenShareDialog = () => {
    setIsMenuOpen(false);
    setIsShareDialogOpen(true);
  };

  const handleOpenRenameDialog = () => {
    setIsMenuOpen(false);
    setIsRenameDialogOpen(true);
  };

  if (isPublicMode) {
    return (
      <TooltipProvider>
        <div className="flex items-center gap-1">
          {displayIsPublic && (
            <SocialShareButton
              url={shareUrl}
              showTextOnLargeScreens={isPublicMode}
            />
          )}
        </div>
      </TooltipProvider>
    );
  }

  if (isDesktop) {
    return (
      <TooltipProvider>
        <div className="flex items-center gap-2">
          {displayIsPublic && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20">
              <Icons.globe className="size-3.5" />
              <span className="text-xs font-medium">{t('chat.shareDialog.publicStatus')}</span>
            </div>
          )}

          <Tooltip delayDuration={800}>
            <TooltipTrigger asChild>
              <Button
                variant={ComponentVariants.GHOST}
                size={ComponentSizes.SM}
                aria-label={t('chat.share')}
                onClick={handleOpenShareDialog}
                disabled={togglePublicMutation.isPending || isBusy}
                className="gap-2"
              >
                {togglePublicMutation.isPending
                  ? <Icons.loader className="size-4 animate-spin" />
                  : <Icons.share className="size-4" />}
                <span>{t('chat.share')}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p className="text-sm">{isBusy ? t('chat.waitForStreamingToComplete') : t('chat.share')}</p>
            </TooltipContent>
          </Tooltip>

          <DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                variant={ComponentVariants.GHOST}
                size={ComponentSizes.ICON}
                aria-label={t('chat.moreOptions')}
                className="min-h-11 min-w-11"
                disabled={isBusy}
              >
                <Icons.moreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="bottom" align="end">
              <ChatThreadMenuItems
                onRename={handleOpenRenameDialog}
                onPin={handleToggleFavorite}
                onDelete={onDeleteClick}
                isFavorite={displayIsFavorite}
                isPinPending={toggleFavoriteMutation.isPending}
              />
            </DropdownMenuContent>
          </DropdownMenu>

          <ShareDialog
            open={isShareDialogOpen}
            onOpenChange={handleShareDialogOpenChange}
            slug={slug}
            threadTitle={currentTitle}
            isPublic={displayIsPublic ?? false}
            isLoading={togglePublicMutation.isPending}
            onMakePublic={handleMakePublic}
            onMakePrivate={handleMakePrivate}
          />

          <ChatRenameDialog
            open={isRenameDialogOpen}
            onOpenChange={setIsRenameDialogOpen}
            threadId={thread.id}
            currentTitle={currentTitle}
          />
        </div>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <div className="flex items-center gap-2">
        {displayIsPublic && (
          <div className="flex items-center gap-1 px-1.5 py-1 rounded-full bg-green-500/10 text-green-600 dark:text-green-400 shrink-0">
            <Icons.globe className="size-3.5" />
            <span className="text-xs font-medium hidden xs:inline">{t('chat.shareDialog.publicStatus')}</span>
          </div>
        )}

        <DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              variant={ComponentVariants.GHOST}
              size={ComponentSizes.ICON}
              aria-label={t('moreOptions')}
              className="min-h-11 min-w-11"
              disabled={isBusy}
            >
              <Icons.moreVertical className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="bottom" align="end">
            <ChatThreadMenuItems
              onRename={handleOpenRenameDialog}
              onPin={handleToggleFavorite}
              onShare={handleOpenShareDialog}
              onDelete={onDeleteClick}
              isFavorite={displayIsFavorite}
              isPinPending={toggleFavoriteMutation.isPending}
            />
          </DropdownMenuContent>
        </DropdownMenu>

        <ShareDialog
          open={isShareDialogOpen}
          onOpenChange={handleShareDialogOpenChange}
          slug={slug}
          threadTitle={currentTitle}
          isPublic={displayIsPublic ?? false}
          isLoading={togglePublicMutation.isPending}
          onMakePublic={handleMakePublic}
          onMakePrivate={handleMakePrivate}
        />

        <ChatRenameDialog
          open={isRenameDialogOpen}
          onOpenChange={setIsRenameDialogOpen}
          threadId={thread.id}
          currentTitle={currentTitle}
        />
      </div>
    </TooltipProvider>
  );
}
