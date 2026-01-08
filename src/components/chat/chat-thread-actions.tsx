'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import { ComponentSizes, ComponentVariants } from '@/api/core/enums';
import type { ChatThread, ChatThreadFlexible } from '@/api/routes/chat/schema';
import { ChatRenameDialog } from '@/components/chat/chat-rename-dialog';
import { ChatThreadMenuItems } from '@/components/chat/chat-thread-menu-items';
import { ShareDialog } from '@/components/chat/share-dialog';
import { SocialShareButton } from '@/components/chat/social-share-button';
import { Icons } from '@/components/icons';
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

  // Track pre-mutation isPublic state for dialog display
  // This prevents dialog from switching during mutation (optimistic updates affect thread.isPublic)
  const preMutationIsPublicRef = useRef(thread.isPublic);

  // Update ref only when not in a pending state (captures the stable pre-mutation value)
  useEffect(() => {
    if (!togglePublicMutation.isPending) {
      preMutationIsPublicRef.current = thread.isPublic;
    }
  }, [thread.isPublic, togglePublicMutation.isPending]);

  const displayIsFavorite = toggleFavoriteMutation.isSuccess && toggleFavoriteMutation.data?.success
    ? toggleFavoriteMutation.data.data.thread.isFavorite
    : toggleFavoriteMutation.isPending && toggleFavoriteMutation.variables
      ? toggleFavoriteMutation.variables.isFavorite
      : thread.isFavorite;

  // For dialog display: use pre-mutation state during pending to prevent premature view switch
  // Only switch to new state after mutation succeeds
  const dialogIsPublic = togglePublicMutation.isSuccess && togglePublicMutation.data?.success
    ? togglePublicMutation.data.data.thread.isPublic
    : togglePublicMutation.isPending
      ? preMutationIsPublicRef.current // Stay on current view during loading
      : thread.isPublic;

  // For other UI elements (badges, etc): use optimistic updates for better UX
  const displayIsPublic = togglePublicMutation.isPending && togglePublicMutation.variables
    ? togglePublicMutation.variables.isPublic
    : dialogIsPublic;

  const shareUrl = `${process.env.NEXT_PUBLIC_APP_URL || (typeof window !== 'undefined' ? window.location.origin : '')}/public/chat/${slug}`;

  const handleToggleFavorite = () => {
    toggleFavoriteMutation.mutate({
      threadId: thread.id,
      isFavorite: !displayIsFavorite,
      slug,
    });
  };

  const handleMakePublic = () => {
    togglePublicMutation.mutate({
      threadId: thread.id,
      isPublic: true,
      slug,
    });
    // Dialog stays open after success so user sees share options
  };

  const handleMakePrivate = () => {
    togglePublicMutation.mutate({
      threadId: thread.id,
      isPublic: false,
      slug,
    }, {
      onSuccess: () => {
        // Close dialog after successfully making private
        setIsShareDialogOpen(false);
      },
    });
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
          <Tooltip delayDuration={800}>
            <TooltipTrigger asChild>
              <Button
                variant={ComponentVariants.GHOST}
                size={ComponentSizes.SM}
                aria-label={t('share')}
                onClick={handleOpenShareDialog}
                disabled={togglePublicMutation.isPending}
                className="gap-2"
              >
                {togglePublicMutation.isPending
                  ? <Icons.loader className="size-4 animate-spin" />
                  : <Icons.share className="size-4" />}
                <span>{t('share')}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p className="text-sm">{t('share')}</p>
            </TooltipContent>
          </Tooltip>

          <DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                variant={ComponentVariants.GHOST}
                size={ComponentSizes.ICON}
                aria-label={t('moreOptions')}
                className="size-9"
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
            onOpenChange={setIsShareDialogOpen}
            slug={slug}
            threadTitle={thread.title}
            isPublic={dialogIsPublic}
            isLoading={togglePublicMutation.isPending}
            onMakePublic={handleMakePublic}
            onMakePrivate={handleMakePrivate}
          />

          <ChatRenameDialog
            open={isRenameDialogOpen}
            onOpenChange={setIsRenameDialogOpen}
            threadId={thread.id}
            currentTitle={thread.title}
          />
        </div>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <div className="flex items-center gap-2">
        {displayIsPublic && (
          <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-green-500/10 text-green-600 dark:text-green-400">
            <Icons.globe className="size-3" />
            <span className="text-xs font-medium">{t('shareDialog.publicStatus')}</span>
          </div>
        )}

        <DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              variant={ComponentVariants.GHOST}
              size={ComponentSizes.ICON}
              aria-label={t('moreOptions')}
              className="size-9"
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
          onOpenChange={setIsShareDialogOpen}
          slug={slug}
          threadTitle={thread.title}
          isPublic={dialogIsPublic}
          isLoading={togglePublicMutation.isPending}
          onMakePublic={handleMakePublic}
          onMakePrivate={handleMakePrivate}
        />

        <ChatRenameDialog
          open={isRenameDialogOpen}
          onOpenChange={setIsRenameDialogOpen}
          threadId={thread.id}
          currentTitle={thread.title}
        />
      </div>
    </TooltipProvider>
  );
}
