'use client';
import { Loader2, ThumbsDown, ThumbsUp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { memo } from 'react';

import type { FeedbackType } from '@/api/core/enums';
import { FeedbackTypes } from '@/api/core/enums';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/ui/cn';

type RoundFeedbackProps = {
  threadId: string;
  roundNumber: number;
  currentFeedback: FeedbackType | null;
  onFeedbackChange: (feedbackType: FeedbackType | null) => void;
  disabled?: boolean;
  isPending?: boolean;
  pendingType?: FeedbackType | null;
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
    onFeedbackChange(currentFeedback === FeedbackTypes.LIKE ? null : FeedbackTypes.LIKE);
  };
  const handleDislike = () => {
    onFeedbackChange(currentFeedback === FeedbackTypes.DISLIKE ? null : FeedbackTypes.DISLIKE);
  };
  const isLikePending = isPending && pendingType === FeedbackTypes.LIKE;
  const isDislikePending = isPending && pendingType === FeedbackTypes.DISLIKE;
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLike}
            disabled={disabled || isPending}
            aria-label={t('like')}
            className={cn(
              'h-7 w-7 p-0 rounded-full transition-colors',
              currentFeedback === FeedbackTypes.LIKE
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
                  <ThumbsUp className={cn('size-3', currentFeedback === FeedbackTypes.LIKE && 'fill-current')} />
                )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{t('like')}</p>
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDislike}
            disabled={disabled || isPending}
            aria-label={t('dislike')}
            className={cn(
              'h-7 w-7 p-0 rounded-full transition-colors',
              currentFeedback === FeedbackTypes.DISLIKE
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
                  <ThumbsDown className={cn('size-3', currentFeedback === FeedbackTypes.DISLIKE && 'fill-current')} />
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
export const RoundFeedback = memo(
  RoundFeedbackComponent,
  (prevProps, nextProps) => {
    return (
      prevProps.threadId === nextProps.threadId
      && prevProps.roundNumber === nextProps.roundNumber
      && prevProps.currentFeedback === nextProps.currentFeedback
      && prevProps.disabled === nextProps.disabled
      && prevProps.isPending === nextProps.isPending
      && prevProps.pendingType === nextProps.pendingType
      && prevProps.className === nextProps.className
    );
  },
);

RoundFeedback.displayName = 'RoundFeedback';
