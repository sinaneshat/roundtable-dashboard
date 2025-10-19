'use client';

import { Loader2, ThumbsDown, ThumbsUp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { memo } from 'react';

import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/ui/cn';

/**
 * Round Feedback Component
 *
 * Displays like/dislike buttons for a conversation round.
 * Following AI Elements pattern - always visible for better discoverability.
 *
 * Features:
 * - Like button (thumbs up)
 * - Dislike button (thumbs down)
 * - Always visible (AI Elements pattern)
 * - Visual feedback for current state
 * - Loading state during mutation
 * - Tooltips for accessibility
 * - Toggle behavior (click again to remove)
 */
type RoundFeedbackProps = {
  threadId: string;
  roundNumber: number;
  currentFeedback: 'like' | 'dislike' | null;
  onFeedbackChange: (feedbackType: 'like' | 'dislike' | null) => void;
  disabled?: boolean;
  isPending?: boolean;
  pendingType?: 'like' | 'dislike' | null;
  className?: string;
};

function RoundFeedbackComponent({
  currentFeedback,
  onFeedbackChange,
  disabled = false,
  isPending = false,
  pendingType = null,
  className,
}: RoundFeedbackProps) {
  const t = useTranslations('chat.feedback');

  const handleLike = () => {
    // Toggle: if already liked, remove feedback; otherwise set to like
    onFeedbackChange(currentFeedback === 'like' ? null : 'like');
  };

  const handleDislike = () => {
    // Toggle: if already disliked, remove feedback; otherwise set to dislike
    onFeedbackChange(currentFeedback === 'dislike' ? null : 'dislike');
  };

  // Determine which button should show loading state
  const isLikePending = isPending && pendingType === 'like';
  const isDislikePending = isPending && pendingType === 'dislike';

  return (
    <>
      {/* Like Button */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLike}
            disabled={disabled || isPending}
            className={cn(
              'h-7 w-7 p-0 rounded-md transition-colors',
              currentFeedback === 'like'
                ? 'bg-green-500/20 text-green-600 hover:bg-green-500/30 hover:text-green-700'
                : 'text-muted-foreground hover:text-green-600 hover:bg-green-500/10',
              className,
            )}
          >
            {isLikePending
              ? (
                  <Loader2 className="size-3 animate-spin" />
                )
              : (
                  <ThumbsUp className={cn('size-3', currentFeedback === 'like' && 'fill-current')} />
                )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{t('like')}</p>
        </TooltipContent>
      </Tooltip>

      {/* Dislike Button */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDislike}
            disabled={disabled || isPending}
            className={cn(
              'h-7 w-7 p-0 rounded-md transition-colors',
              currentFeedback === 'dislike'
                ? 'bg-red-500/20 text-red-600 hover:bg-red-500/30 hover:text-red-700'
                : 'text-muted-foreground hover:text-red-600 hover:bg-red-500/10',
              className,
            )}
          >
            {isDislikePending
              ? (
                  <Loader2 className="size-3 animate-spin" />
                )
              : (
                  <ThumbsDown className={cn('size-3', currentFeedback === 'dislike' && 'fill-current')} />
                )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{t('dislike')}</p>
        </TooltipContent>
      </Tooltip>
    </>
  );
}

export const RoundFeedback = memo(RoundFeedbackComponent);
