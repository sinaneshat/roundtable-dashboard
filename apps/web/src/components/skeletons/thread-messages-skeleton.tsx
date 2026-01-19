import type { SkeletonUsecase } from '@roundtable/shared';
import { SkeletonUsecases } from '@roundtable/shared';
import type { ComponentProps } from 'react';

import { cn } from '@/lib/ui/cn';

import { MessageCardSkeleton } from './message-card-skeleton';
import { ModeratorCardSkeleton } from './moderator-card-skeleton';
import { StickyInputSkeleton } from './sticky-input-skeleton';

type ThreadMessagesSkeletonProps = {
  participantCount?: number;
  showModerator?: boolean;
  showInput?: boolean;
  usecase?: SkeletonUsecase;
} & ComponentProps<'div'>;

/**
 * ThreadMessagesSkeleton - Thread conversation loading skeleton
 *
 * Composes message cards, moderator cards, and input for full thread loading.
 * Used for chat thread loading states.
 */
export function ThreadMessagesSkeleton({
  participantCount = 2,
  showModerator = true,
  showInput = false,
  usecase,
  className,
  ...props
}: ThreadMessagesSkeletonProps) {
  const shouldShowModerator = usecase === SkeletonUsecases.DEMO ? false : showModerator;
  const shouldShowInput = usecase === SkeletonUsecases.DEMO ? false : showInput;

  return (
    <div className={cn('space-y-3', className)} {...props}>
      <MessageCardSkeleton variant="user" />
      {Array.from({ length: participantCount }, (_, i) => (
        <MessageCardSkeleton key={i} variant="assistant" />
      ))}
      {shouldShowModerator && <ModeratorCardSkeleton />}
      {shouldShowInput && <StickyInputSkeleton />}
    </div>
  );
}
