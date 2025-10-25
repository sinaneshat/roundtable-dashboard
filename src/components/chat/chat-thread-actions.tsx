'use client';
import { Loader2, Lock, Share2, Star, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { ChatThread } from '@/api/routes/chat/schema';
import { SocialShareButton } from '@/components/chat/social-share-button';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useToggleFavoriteMutation, useTogglePublicMutation } from '@/hooks/mutations/chat-mutations';
import { cn } from '@/lib/ui/cn';

type ChatThreadActionsProps = {
  thread: ChatThread | (Omit<ChatThread, 'createdAt' | 'updatedAt' | 'lastMessageAt'> & { createdAt: string | Date; updatedAt: string | Date; lastMessageAt: string | Date | null });
  slug: string;
  onDeleteClick?: () => void;
  isPublicMode?: boolean;
};
export function ChatThreadActions({ thread, slug, onDeleteClick, isPublicMode = false }: ChatThreadActionsProps) {
  const t = useTranslations('chat');
  const toggleFavoriteMutation = useToggleFavoriteMutation();
  const togglePublicMutation = useTogglePublicMutation();
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
  return (
    <TooltipProvider>
      {!isPublicMode && (
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                toggleFavoriteMutation.mutate({
                  threadId: thread.id,
                  isFavorite: !displayIsFavorite,
                  slug,
                });
              }}
              disabled={toggleFavoriteMutation.isPending}
              aria-label={displayIsFavorite ? t('removeFromFavorites') : t('addToFavorites')}
              className={cn('transition-all duration-200')}
            >
              {toggleFavoriteMutation.isPending
                ? (
                    <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  )
                : (
                    <Star
                      className={cn(
                        'size-4 transition-all duration-200',
                        displayIsFavorite
                          ? 'fill-current text-muted-foreground'
                          : 'text-muted-foreground hover:text-foreground hover:scale-110',
                      )}
                    />
                  )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p className="text-sm">
              {toggleFavoriteMutation.isPending
                ? (displayIsFavorite ? t('removingFromFavorites') : t('addingToFavorites'))
                : (displayIsFavorite ? t('removeFromFavorites') : t('addToFavorites'))}
            </p>
          </TooltipContent>
        </Tooltip>
      )}
      {!isPublicMode && (
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                togglePublicMutation.mutate({
                  threadId: thread.id,
                  isPublic: !displayIsPublic,
                  slug,
                });
              }}
              disabled={togglePublicMutation.isPending}
              aria-label={displayIsPublic ? t('makePrivate') : t('makePublic')}
              className={cn('transition-all duration-200')}
            >
              {togglePublicMutation.isPending
                ? (
                    <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  )
                : displayIsPublic
                  ? (
                      <Lock className="size-4 text-muted-foreground transition-all duration-200 hover:text-foreground hover:scale-110" />
                    )
                  : (
                      <Share2 className="size-4 text-muted-foreground transition-all duration-200 hover:text-foreground hover:scale-110" />
                    )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p className="text-sm">
              {togglePublicMutation.isPending
                ? (displayIsPublic ? t('makingPrivate') : t('makingPublic'))
                : (displayIsPublic ? t('makePrivate') : t('makePublic'))}
            </p>
          </TooltipContent>
        </Tooltip>
      )}
      {displayIsPublic && (
        <SocialShareButton
          url={`${process.env.NEXT_PUBLIC_APP_URL || (typeof window !== 'undefined' ? window.location.origin : '')}/public/chat/${slug}`}
          title={thread.title}
          description={`Check out this AI collaboration on ${thread.title}`}
          showTextOnLargeScreens={isPublicMode}
        />
      )}
      {!isPublicMode && onDeleteClick && (
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={onDeleteClick}
              aria-label={t('deleteThread')}
              className="transition-all duration-200 hover:text-destructive"
            >
              <Trash2 className="size-4 text-muted-foreground transition-all duration-200" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p className="text-sm">{t('deleteThread')}</p>
          </TooltipContent>
        </Tooltip>
      )}
    </TooltipProvider>
  );
}
