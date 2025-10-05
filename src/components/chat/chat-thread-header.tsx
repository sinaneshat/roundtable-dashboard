'use client';

import { Globe, Link2, Loader2, Lock, Star, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/ui/cn';

// ============================================================================
// Types
// ============================================================================

export type ThreadParticipant = {
  id: string;
  threadId: string;
  modelId: string;
  role: string | null;
  customRoleId: string | null;
  priority: number;
  createdAt: string;
};

type ChatThreadHeaderProps = {
  thread: {
    id: string;
    title: string;
    isFavorite: boolean;
    isPublic?: boolean;
    createdAt: string;
  };
  onToggleFavorite?: () => void;
  onTogglePublic?: () => void;
  onCopyLink?: () => void;
  onDelete?: () => void;
  className?: string;
  isFavoriting?: boolean;
  isTogglingPublic?: boolean;
  isDeleting?: boolean;
};

// ============================================================================
// Component
// ============================================================================

/**
 * ChatThreadHeader Component
 *
 * Minimal header with action buttons only:
 * - Favorite toggle (star icon)
 * - Public/Private toggle
 * - Copy link (when public)
 * - Delete thread
 *
 * Configuration (mode, participants, memories) shown in chat input
 *
 * Following patterns from /docs/frontend-patterns.md
 */
export function ChatThreadHeader({
  thread,
  onToggleFavorite,
  onTogglePublic,
  onCopyLink,
  onDelete,
  className,
  isFavoriting = false,
  isTogglingPublic = false,
  isDeleting = false,
}: ChatThreadHeaderProps) {
  const t = useTranslations('chat');

  return (
    <div className={cn('border-b bg-background/50 backdrop-blur-sm', className)}>
      <div className="flex items-center justify-between gap-4 px-4 py-2.5">
        {/* Left: Empty space for alignment */}
        <div className="flex-1" />

        {/* Right: Standalone Action Buttons */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Favorite Button - Star Icon */}
          {onToggleFavorite && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggleFavorite}
              disabled={isFavoriting}
              className="size-8"
              title={thread.isFavorite ? t('removeFromFavorites') : t('addToFavorites')}
            >
              {isFavoriting
                ? (
                    <Loader2 className="size-4 animate-spin" />
                  )
                : (
                    <Star
                      className={cn(
                        'size-4 transition-colors',
                        thread.isFavorite && 'fill-yellow-500 text-yellow-500',
                      )}
                    />
                  )}
            </Button>
          )}

          {/* Public/Private Toggle Button */}
          {onTogglePublic && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onTogglePublic}
              disabled={isTogglingPublic}
              className="size-8"
              title={thread.isPublic ? t('makePrivate') : t('makePublic')}
            >
              {isTogglingPublic
                ? (
                    <Loader2 className="size-4 animate-spin" />
                  )
                : thread.isPublic
                  ? (
                      <Lock className="size-4" />
                    )
                  : (
                      <Globe className="size-4" />
                    )}
            </Button>
          )}

          {/* Copy Link Button - Only show when public */}
          {thread.isPublic && onCopyLink && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onCopyLink}
              className="size-8 text-muted-foreground hover:text-foreground"
              title={t('copyLink')}
            >
              <Link2 className="size-4" />
            </Button>
          )}

          {/* Delete Button */}
          {onDelete && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onDelete}
              disabled={isDeleting}
              className="size-8 text-muted-foreground hover:text-destructive"
              title={t('deleteThread')}
            >
              {isDeleting
                ? (
                    <Loader2 className="size-4 animate-spin" />
                  )
                : (
                    <Trash2 className="size-4" />
                  )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
