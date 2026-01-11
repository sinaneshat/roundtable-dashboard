'use client';
import { useTranslations } from 'next-intl';
import { memo } from 'react';

import type { FeedbackType } from '@/api/core/enums';
import { FeedbackTypes } from '@/api/core/enums';
import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
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
  // Use native title instead of Radix Tooltip to avoid React 19 compose-refs infinite loop
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleLike}
        disabled={disabled || isPending}
        aria-label={t('like')}
        title={t('like')}
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
              <Icons.loader className="size-3 animate-spin" />
            )
          : (
              <Icons.thumbsUp className={cn('size-3', currentFeedback === FeedbackTypes.LIKE && 'fill-current')} />
            )}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleDislike}
        disabled={disabled || isPending}
        aria-label={t('dislike')}
        title={t('dislike')}
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
              <Icons.loader className="size-3 animate-spin" />
            )
          : (
              <Icons.thumbsDown className={cn('size-3', currentFeedback === FeedbackTypes.DISLIKE && 'fill-current')} />
            )}
      </Button>
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
