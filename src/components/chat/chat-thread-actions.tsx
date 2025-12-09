'use client';

import { Globe, Loader2, MoreVertical, Pin, Share, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import type { ChatThread } from '@/api/routes/chat/schema';
import { ShareDialog } from '@/components/chat/share-dialog';
import { SocialShareButton } from '@/components/chat/social-share-button';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useToggleFavoriteMutation, useTogglePublicMutation } from '@/hooks/mutations/chat-mutations';
import { useMediaQuery } from '@/hooks/utils';
import { cn } from '@/lib/ui/cn';

type ChatThreadActionsProps = {
  thread: ChatThread | (Omit<ChatThread, 'createdAt' | 'updatedAt' | 'lastMessageAt'> & { createdAt: string | Date; updatedAt: string | Date; lastMessageAt: string | Date | null });
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

  // Optimistic display states
  const displayIsFavorite = toggleFavoriteMutation.isSuccess && toggleFavoriteMutation.data?.success
    ? toggleFavoriteMutation.data.data.thread.isFavorite
    : toggleFavoriteMutation.isPending && toggleFavoriteMutation.variables
      ? toggleFavoriteMutation.variables.isFavorite
      : thread.isFavorite;

  const displayIsPublic = togglePublicMutation.isSuccess && togglePublicMutation.data?.success
    ? togglePublicMutation.data.data.thread.isPublic
    : togglePublicMutation.isPending && togglePublicMutation.variables
      ? togglePublicMutation.variables.isPublic
      : thread.isPublic;

  const shareUrl = `${process.env.NEXT_PUBLIC_APP_URL || (typeof window !== 'undefined' ? window.location.origin : '')}/public/chat/${slug}`;

  // Handlers
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
  };

  const handleMakePrivate = () => {
    togglePublicMutation.mutate({
      threadId: thread.id,
      isPublic: false,
      slug,
    });
  };

  const handleOpenShareDialog = () => {
    setIsMenuOpen(false);
    setIsShareDialogOpen(true);
  };

  // ==========================================================================
  // PUBLIC MODE: Copy link button only (for public thread view page)
  // ==========================================================================
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

  // ==========================================================================
  // DESKTOP VIEW: Individual icon buttons with tooltips
  // ==========================================================================
  if (isDesktop) {
    return (
      <TooltipProvider>
        <div className="flex items-center gap-2">
          {/* Share button - prominent action */}
          <Button
            variant="ghost"
            size="sm"
            aria-label={displayIsPublic ? t('shareThread') : t('makePublicAndShare')}
            onClick={handleOpenShareDialog}
            disabled={togglePublicMutation.isPending}
            className="gap-1.5 transition-all duration-200"
          >
            {togglePublicMutation.isPending
              ? <Loader2 className="size-5 animate-spin" />
              : displayIsPublic
                ? <Globe className="size-5 text-green-500" />
                : <Share className="size-5" />}
            <span>{t('share')}</span>
          </Button>

          {/* Favorite button */}
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={displayIsFavorite ? t('unpin') : t('pin')}
                onClick={handleToggleFavorite}
                disabled={toggleFavoriteMutation.isPending}
                className={cn(
                  'transition-all duration-200',
                  displayIsFavorite && 'text-amber-500',
                )}
              >
                {toggleFavoriteMutation.isPending
                  ? <Loader2 className="size-5 animate-spin" />
                  : (
                      <Pin
                        className={cn(
                          'size-5',
                          displayIsFavorite && 'fill-current',
                        )}
                      />
                    )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p className="text-sm">
                {displayIsFavorite ? t('unpin') : t('pin')}
              </p>
            </TooltipContent>
          </Tooltip>

          {/* Delete button */}
          {onDeleteClick && (
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t('deleteThread')}
                  onClick={onDeleteClick}
                  className="transition-all duration-200 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p className="text-sm">{t('deleteThread')}</p>
              </TooltipContent>
            </Tooltip>
          )}

          {/* Share Dialog */}
          <ShareDialog
            open={isShareDialogOpen}
            onOpenChange={setIsShareDialogOpen}
            slug={slug}
            threadTitle={thread.title}
            threadMode={thread.mode}
            isPublic={displayIsPublic}
            isLoading={togglePublicMutation.isPending}
            onMakePublic={handleMakePublic}
            onMakePrivate={handleMakePrivate}
          />
        </div>
      </TooltipProvider>
    );
  }

  // ==========================================================================
  // MOBILE VIEW: Three-dot menu with all actions
  // ==========================================================================
  return (
    <TooltipProvider>
      <div className="flex items-center gap-1">
        {/* Public status indicator (visible when public) */}
        {displayIsPublic && (
          <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-green-500/10 text-green-600 dark:text-green-400">
            <Globe className="size-3" />
            <span className="text-xs font-medium">{t('shareDialog.publicStatus')}</span>
          </div>
        )}

        <DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t('moreOptions')}
              className="transition-all duration-200"
            >
              <MoreVertical className="size-4 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="bottom" align="end" className="w-56">
            {/* Share */}
            <DropdownMenuItem
              onClick={handleOpenShareDialog}
              className="cursor-pointer"
            >
              {displayIsPublic
                ? <Globe className="size-4 text-green-500" />
                : <Share className="size-4" />}
              <span>{displayIsPublic ? t('shareThread') : t('makePublicAndShare')}</span>
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            {/* Favorite */}
            <DropdownMenuItem
              onClick={handleToggleFavorite}
              disabled={toggleFavoriteMutation.isPending}
              className={cn(
                'cursor-pointer',
                displayIsFavorite && 'text-amber-500',
              )}
            >
              {toggleFavoriteMutation.isPending
                ? <Loader2 className="size-4 animate-spin" />
                : (
                    <Pin
                      className={cn(
                        'size-4',
                        displayIsFavorite && 'fill-current',
                      )}
                    />
                  )}
              <span>{displayIsFavorite ? t('unpin') : t('pin')}</span>
            </DropdownMenuItem>

            {/* Delete */}
            {onDeleteClick && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={onDeleteClick}
                  variant="destructive"
                  className="cursor-pointer"
                >
                  <Trash2 className="size-4" />
                  <span>{t('deleteThread')}</span>
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Share Dialog */}
        <ShareDialog
          open={isShareDialogOpen}
          onOpenChange={setIsShareDialogOpen}
          slug={slug}
          threadTitle={thread.title}
          threadMode={thread.mode}
          isPublic={displayIsPublic}
          isLoading={togglePublicMutation.isPending}
          onMakePublic={handleMakePublic}
          onMakePrivate={handleMakePrivate}
        />
      </div>
    </TooltipProvider>
  );
}
