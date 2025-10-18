'use client';

import { ThumbsDown, ThumbsUp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/ui/cn';

/**
 * Round Feedback Component
 *
 * Displays like/dislike buttons for a conversation round.
 * Only shown on hover to keep the UI clean.
 *
 * Features:
 * - Like button (thumbs up)
 * - Dislike button (thumbs down)
 * - Appears only on hover
 * - Visual feedback for current state
 * - Tooltips for accessibility
 * - Toggle behavior (click again to remove)
 */
type RoundFeedbackProps = {
  threadId: string;
  roundNumber: number;
  currentFeedback: 'like' | 'dislike' | null;
  onFeedbackChange: (feedbackType: 'like' | 'dislike' | null) => void;
  disabled?: boolean;
  className?: string;
};

export function RoundFeedback({
  currentFeedback,
  onFeedbackChange,
  disabled = false,
  className,
}: RoundFeedbackProps) {
  const t = useTranslations('chat.feedback');
  const [isHovered, setIsHovered] = useState(false);

  const handleLike = () => {
    // Toggle: if already liked, remove feedback; otherwise set to like
    onFeedbackChange(currentFeedback === 'like' ? null : 'like');
  };

  const handleDislike = () => {
    // Toggle: if already disliked, remove feedback; otherwise set to dislike
    onFeedbackChange(currentFeedback === 'dislike' ? null : 'dislike');
  };

  // Show if hovered OR if there's existing feedback
  const shouldShow = isHovered || currentFeedback !== null;

  return (
    <div
      className={cn('flex items-center gap-1 transition-opacity', className)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{ opacity: shouldShow ? 1 : 0, pointerEvents: shouldShow ? 'auto' : 'none' }}
    >
      <TooltipProvider>
        {/* Like Button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLike}
              disabled={disabled}
              className={cn(
                'h-8 w-8 p-0 rounded-full transition-colors',
                currentFeedback === 'like'
                  ? 'bg-green-500/20 text-green-600 hover:bg-green-500/30 hover:text-green-700'
                  : 'text-muted-foreground hover:text-green-600 hover:bg-green-500/10',
              )}
            >
              <ThumbsUp className={cn('h-4 w-4', currentFeedback === 'like' && 'fill-current')} />
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
              disabled={disabled}
              className={cn(
                'h-8 w-8 p-0 rounded-full transition-colors',
                currentFeedback === 'dislike'
                  ? 'bg-red-500/20 text-red-600 hover:bg-red-500/30 hover:text-red-700'
                  : 'text-muted-foreground hover:text-red-600 hover:bg-red-500/10',
              )}
            >
              <ThumbsDown className={cn('h-4 w-4', currentFeedback === 'dislike' && 'fill-current')} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{t('dislike')}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
