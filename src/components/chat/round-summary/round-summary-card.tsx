'use client';

import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

import type { FeedbackType, MessageStatus } from '@/api/core/enums';
import { MessagePartTypes, MessageStatuses } from '@/api/core/enums';
import type { RoundSummaryAIContent, StoredRoundSummary } from '@/api/routes/chat/schema';
import { ModelMessageCard } from '@/components/chat/model-message-card';
import { BRAND } from '@/constants/brand';
import type { MessagePart } from '@/lib/schemas/message-schemas';
import { cn } from '@/lib/ui/cn';
import { hasSummaryData } from '@/lib/utils/summary-utils';

import { MODERATOR_NAME, MODERATOR_PARTICIPANT_INDEX } from './moderator-constants';
import { ModeratorHeader } from './moderator-header';
import { RoundSummaryStream } from './round-summary-stream';

type RoundSummaryCardProps = {
  summary: StoredRoundSummary;
  threadId: string;
  className?: string;
  onStreamStart?: () => void;
  onStreamComplete?: (completedSummaryData?: RoundSummaryAIContent | null, error?: Error | null) => void;
  /** Optional: Round feedback props for displaying like/dislike buttons inline */
  feedbackProps?: {
    currentFeedback: FeedbackType | null;
    onFeedbackChange: (feedbackType: FeedbackType | null) => void;
    disabled?: boolean;
    isPending?: boolean;
    pendingType?: FeedbackType | null;
  };
};

/**
 * RoundSummaryCard - Uses ModelMessageCard for consistent participant-style display
 *
 * Displays round summary exactly like a participant message with:
 * - Roundtable logo as avatar (left side with glow)
 * - "Council Moderator" as the name
 * - Summary text as message content with markdown
 */
export function RoundSummaryCard({
  summary,
  threadId,
  className,
  onStreamStart,
  onStreamComplete,
  feedbackProps,
}: RoundSummaryCardProps) {
  const t = useTranslations('moderator');

  // Map summary status to MessageStatus
  const status: MessageStatus = summary.status as MessageStatus;

  // Check if streaming/pending - show stream component
  const isStreamingOrPending = status === MessageStatuses.STREAMING || status === MessageStatuses.PENDING;

  // Build message parts from summary data
  const parts: MessagePart[] = useMemo(() => {
    if (!hasSummaryData(summary.summaryData)) {
      return [];
    }
    return [{
      type: MessagePartTypes.TEXT,
      text: summary.summaryData.summary,
    }];
  }, [summary.summaryData]);

  // For streaming state, render the stream component
  if (isStreamingOrPending) {
    return (
      <div className={cn('w-full', className)}>
        <RoundSummaryStream
          threadId={threadId}
          summary={summary}
          onStreamStart={onStreamStart}
          onStreamComplete={onStreamComplete}
        />
      </div>
    );
  }

  const isError = status === MessageStatuses.FAILED;

  // For failed state with no data
  if (isError || (status === MessageStatuses.COMPLETE && !hasSummaryData(summary.summaryData))) {
    return (
      <div className={cn('w-full', className)}>
        <div className="flex justify-start">
          <div className="w-full">
            <ModeratorHeader hasError />
            <ModelMessageCard
              avatarSrc={BRAND.logos.main}
              avatarName={MODERATOR_NAME}
              participantIndex={MODERATOR_PARTICIPANT_INDEX}
              status={MessageStatuses.FAILED}
              parts={[{
                type: MessagePartTypes.TEXT,
                text: t('errorSummarizing'),
              }]}
              loadingText={t('analyzing')}
              hideInlineHeader
              hideAvatar
            />
          </div>
        </div>
      </div>
    );
  }

  // For complete state with data
  return (
    <div className={cn('w-full', className)}>
      <div className="flex justify-start">
        <div className="w-full">
          <ModeratorHeader />
          <ModelMessageCard
            avatarSrc={BRAND.logos.main}
            avatarName={MODERATOR_NAME}
            participantIndex={MODERATOR_PARTICIPANT_INDEX}
            status={status}
            parts={parts}
            loadingText={t('analyzing')}
            hideInlineHeader
            hideAvatar
            showActions
            feedbackProps={feedbackProps
              ? {
                  threadId,
                  roundNumber: summary.roundNumber,
                  currentFeedback: feedbackProps.currentFeedback,
                  onFeedbackChange: feedbackProps.onFeedbackChange,
                  disabled: feedbackProps.disabled,
                  isPending: feedbackProps.isPending,
                  pendingType: feedbackProps.pendingType,
                }
              : undefined}
          />
        </div>
      </div>
    </div>
  );
}
