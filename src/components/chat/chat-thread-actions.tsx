'use client';

import { Globe, Loader2, Lock, Star, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { ChatThread } from '@/api/routes/chat/schema';
import { HeaderScrollButton } from '@/components/chat/header-scroll-button';
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

/**
 * Shared Thread Actions Component
 *
 * Renders thread-specific action buttons:
 * - Toggle favorite status
 * - Toggle public/private visibility
 * - Copy public link (when public)
 * - Delete thread
 *
 * Used by both ChatThreadScreen (via context) and potentially other thread views
 *
 * NOTE: Uses local optimistic state to reflect changes immediately while mutations are pending
 */
type ChatThreadActionsProps = {
  thread: ChatThread;
  slug: string;
  onDeleteClick?: () => void;
  /**
   * Public mode - hides favorite, public/private toggle, and delete button
   * Only shows copy link button when thread is public
   */
  isPublicMode?: boolean;
};

export function ChatThreadActions({ thread, slug, onDeleteClick, isPublicMode = false }: ChatThreadActionsProps) {
  const t = useTranslations('chat');
  const toggleFavoriteMutation = useToggleFavoriteMutation();
  const togglePublicMutation = useTogglePublicMutation();

  // Determine current display state with proper priority:
  // 1. If mutation succeeded, use the response data (most accurate)
  // 2. If mutation is pending, use the optimistic variables
  // 3. Otherwise, fall back to thread prop
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
      {/* Header Scroll Button - shown for both public and private modes */}
      <HeaderScrollButton ariaLabel={t('actions.scrollToBottom')} />

      {/* Favorite/Unfavorite Button - hidden in public mode */}
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

      {/* Public/Private Toggle Button - hidden in public mode */}
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
                      <Globe className="size-4 text-muted-foreground transition-all duration-200 hover:text-foreground hover:scale-110" />
                    )
                  : (
                      <Lock className="size-4 text-muted-foreground transition-all duration-200 hover:text-foreground hover:scale-110" />
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

      {/* Social Share Button (only shown when public) - uses optimistic state */}
      {displayIsPublic && (
        <SocialShareButton
          url={`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/public/chat/${slug}`}
          title={thread.title}
          description={`Check out this AI collaboration on ${thread.title}`}
          showTextOnLargeScreens={isPublicMode}
        />
      )}

      {/* Delete Button - hidden in public mode */}
      {!isPublicMode && onDeleteClick && (
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={onDeleteClick}
              aria-label={t('deleteThread')}
              className="transition-all duration-200"
            >
              <Trash2 className="size-4 text-muted-foreground transition-all duration-200 hover:text-foreground hover:scale-110" />
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
