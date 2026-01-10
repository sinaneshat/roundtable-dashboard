'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { ComponentSizes, ComponentVariants } from '@/api/core/enums';
import type { ChatThread, ChatThreadFlexible } from '@/api/routes/chat/schema';
import { ChatRenameDialog } from '@/components/chat/chat-rename-dialog';
import { ChatThreadMenuItems } from '@/components/chat/chat-thread-menu-items';
import { ShareDialog } from '@/components/chat/share-dialog';
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

type ChatThreadActionsProps = {
  thread: ChatThread | ChatThreadFlexible;
  slug: string;
  onDeleteClick?: () => void;
  isPublicMode?: boolean;
};

export function ChatThreadActions({ thread, slug, onDeleteClick, isPublicMode = false }: ChatThreadActionsProps) {
  const t = useTranslations('chat');
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const toggleFavoriteMutation = useToggleFavoriteMutation();
  const togglePublicMutation = useTogglePublicMutation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);

  const { data: cachedThreadData } = useThreadQuery(thread.id, !isPublicMode);

  const threadIsPublic = cachedThreadData?.success
    ? cachedThreadData.data.thread.isPublic
    : thread.isPublic;

  const { storeThreadId, storeThreadTitle, isBusy } = useChatStore(useShallow(s => ({
    storeThreadId: s.thread?.id,
    storeThreadTitle: s.thread?.title,
    isBusy: s.isStreaming
      || s.waitingToStartStreaming
      || s.isCreatingThread
      || s.streamingRoundNumber !== null
      || s.preSearches.some(ps => ps.status === 'pending' || ps.status === 'streaming'),
  })));
  const currentTitle = (storeThreadTitle && thread.id === storeThreadId)
    ? storeThreadTitle
    : thread.title;

  const displayIsFavorite = toggleFavoriteMutation.isSuccess && toggleFavoriteMutation.data?.success
    ? toggleFavoriteMutation.data.data.thread.isFavorite
    : toggleFavoriteMutation.isPending && toggleFavoriteMutation.variables
      ? toggleFavoriteMutation.variables.isFavorite
      : thread.isFavorite;

  // Derived value: use optimistic mutation value when pending, otherwise use cache
  const displayIsPublic = togglePublicMutation.isPending && togglePublicMutation.variables
    ? togglePublicMutation.variables.isPublic
    : threadIsPublic;

  const shareUrl = `${process.env.NEXT_PUBLIC_APP_URL || (typeof window !== 'undefined' ? window.location.origin : '')}/public/chat/${slug}`;

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
              <span className="text-xs font-medium">{t('shareDialog.publicStatus')}</span>
            </div>
          )}

          <Tooltip delayDuration={800}>
            <TooltipTrigger asChild>
              <Button
                variant={ComponentVariants.GHOST}
                size={ComponentSizes.SM}
                aria-label={t('share')}
                onClick={handleOpenShareDialog}
                disabled={togglePublicMutation.isPending || isBusy}
                className="gap-2"
              >
                {togglePublicMutation.isPending
                  ? <Icons.loader className="size-4 animate-spin" />
                  : <Icons.share className="size-4" />}
                <span>{t('share')}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p className="text-sm">{isBusy ? t('waitForStreamingToComplete') : t('share')}</p>
            </TooltipContent>
          </Tooltip>

          <DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                variant={ComponentVariants.GHOST}
                size={ComponentSizes.ICON}
                aria-label={t('moreOptions')}
                className="size-9"
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
            isPublic={displayIsPublic}
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
            <span className="text-xs font-medium hidden xs:inline">{t('shareDialog.publicStatus')}</span>
          </div>
        )}

        <DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              variant={ComponentVariants.GHOST}
              size={ComponentSizes.ICON}
              aria-label={t('moreOptions')}
              className="size-9"
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
          isPublic={displayIsPublic}
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
