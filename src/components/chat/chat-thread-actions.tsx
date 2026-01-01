'use client';

import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import type { ChatThread } from '@/api/routes/chat/schema';
import { SocialShareButton } from '@/components/chat/social-share-button';
import { Icons } from '@/components/icons';
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
import { useToggleFavoriteMutation, useTogglePublicMutation } from '@/hooks/mutations';
import { useMediaQuery } from '@/hooks/utils';
import { getAppBaseUrl } from '@/lib/config/base-urls';
import { cn } from '@/lib/ui/cn';

// Lazy-loaded - ShareDialog contains heavy next-share library (~200KB)
const ShareDialog = dynamic(
  () => import('@/components/chat/share-dialog').then(m => m.ShareDialog),
  { ssr: false },
);

// Flexible thread type that accepts both Date and string dates (for RPC responses)
type FlexibleThread = Omit<ChatThread, 'createdAt' | 'updatedAt' | 'lastMessageAt'> & {
  createdAt: Date | string;
  updatedAt: Date | string;
  lastMessageAt: Date | string | null;
};

type ChatThreadActionsProps = {
  thread: FlexibleThread;
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

  const shareUrl = `${getAppBaseUrl()}/public/chat/${slug}`;

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
        <div className="flex items-center gap-0.5">
          <Tooltip delayDuration={800}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('share')}
                onClick={handleOpenShareDialog}
                disabled={togglePublicMutation.isPending}
                className="transition-all duration-200"
              >
                {togglePublicMutation.isPending
                  ? <Icons.loader className="size-4 animate-spin" />
                  : <Icons.share className="size-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p className="text-sm">{t('share')}</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip delayDuration={800}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={displayIsFavorite ? t('unpin') : t('pin')}
                onClick={handleToggleFavorite}
                disabled={toggleFavoriteMutation.isPending}
                className={cn(
                  'transition-all duration-200',
                  displayIsFavorite && 'text-primary',
                )}
              >
                {toggleFavoriteMutation.isPending
                  ? <Icons.loader className="size-4 animate-spin" />
                  : (
                      <Icons.pin
                        className={cn(
                          'size-4',
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

          {onDeleteClick && (
            <Tooltip delayDuration={800}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t('deleteThread')}
                  onClick={onDeleteClick}
                  className="transition-all duration-200 text-muted-foreground hover:text-destructive"
                >
                  <Icons.trash className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p className="text-sm">{t('deleteThread')}</p>
              </TooltipContent>
            </Tooltip>
          )}

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

  return (
    <TooltipProvider>
      <div className="flex items-center gap-1">
        {displayIsPublic && (
          <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-green-500/10 text-green-600 dark:text-green-400">
            <Icons.globe className="size-3" />
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
              <Icons.moreVertical className="size-4 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="bottom" align="end" className="w-56">
            <DropdownMenuItem
              onClick={handleOpenShareDialog}
              className="cursor-pointer"
            >
              <Icons.share className="size-4" />
              <span>{t('share')}</span>
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <DropdownMenuItem
              onClick={handleToggleFavorite}
              disabled={toggleFavoriteMutation.isPending}
              className={cn(
                'cursor-pointer',
                displayIsFavorite && 'text-primary',
              )}
            >
              {toggleFavoriteMutation.isPending
                ? <Icons.loader className="size-4 animate-spin" />
                : (
                    <Icons.pin
                      className={cn(
                        'size-4',
                        displayIsFavorite && 'fill-current',
                      )}
                    />
                  )}
              <span>{displayIsFavorite ? t('unpin') : t('pin')}</span>
            </DropdownMenuItem>

            {onDeleteClick && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={onDeleteClick}
                  variant="destructive"
                  className="cursor-pointer"
                >
                  <Icons.trash className="size-4" />
                  <span>{t('deleteThread')}</span>
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

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
