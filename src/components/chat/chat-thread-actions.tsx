'use client';

import { Check, Globe, Link2, Loader2, Lock, Star, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import type { ChatThread } from '@/api/routes/chat/schema';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
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
  const [copySuccess, setCopySuccess] = useState(false);

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
                    <Loader2 className="size-4 animate-spin text-yellow-500" />
                  )
                : (
                    <Star
                      className={cn(
                        'size-4 transition-all duration-200',
                        displayIsFavorite
                          ? 'fill-yellow-500 text-yellow-500'
                          : 'text-muted-foreground hover:text-yellow-500/80 hover:scale-110',
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
                    <Loader2 className="size-4 animate-spin text-green-500" />
                  )
                : displayIsPublic
                  ? (
                      <Globe className="size-4 text-green-500 transition-all duration-200 hover:scale-110" />
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

      {/* Copy Link Button (only shown when public) - uses optimistic state */}
      {displayIsPublic && (
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={async () => {
                const publicUrl = `${window.location.origin}/public/chat/${slug}`;
                try {
                  await navigator.clipboard.writeText(publicUrl);
                  setCopySuccess(true);
                  // Reset success state after 2 seconds
                  setTimeout(() => setCopySuccess(false), 2000);
                } catch (error) {
                  // Silently fail - copy might not be supported in this context
                  if (process.env.NODE_ENV === 'development') {
                    console.error('Failed to copy link:', error);
                  }
                }
              }}
              aria-label={t('copyLink')}
              className={cn('transition-all duration-200')}
            >
              {copySuccess
                ? (
                    <Check className="size-4 text-green-500 animate-in zoom-in-75 duration-300" />
                  )
                : (
                    <Link2 className="size-4 text-muted-foreground hover:text-foreground transition-all duration-200 hover:scale-110" />
                  )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p className="text-sm">{copySuccess ? t('linkCopied') : t('copyLink')}</p>
          </TooltipContent>
        </Tooltip>
      )}

      {/* Separator and Delete Button - hidden in public mode */}
      {!isPublicMode && onDeleteClick && (
        <>
          <Separator orientation="vertical" className="h-6 mx-1" />

          {/* Delete Thread Button */}
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={onDeleteClick}
                aria-label={t('deleteThread')}
                className="transition-all duration-200 hover:bg-destructive/10"
              >
                <Trash2 className="size-4 text-destructive transition-all duration-200 hover:scale-110" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p className="text-sm">{t('deleteThread')}</p>
            </TooltipContent>
          </Tooltip>
        </>
      )}
    </TooltipProvider>
  );
}
