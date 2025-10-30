/**
 * Thread Timeline Component
 *
 * Shared timeline rendering component for thread and public screens.
 * Consolidates duplicate virtualized timeline rendering logic.
 *
 * Used by: ChatThreadScreen, PublicChatThreadScreen
 */

'use client';

import type { ChatParticipant, ModeratorAnalysisPayload, RecommendedAction } from '@/api/routes/chat/schema';
import { Actions } from '@/components/ai-elements/actions';
import type { TimelineItem } from '@/hooks/utils';
import { useVirtualizedTimeline } from '@/hooks/utils';
import { messageHasError, MessageMetadataSchema } from '@/lib/schemas/message-metadata';
import { getRoundNumberFromMetadata } from '@/lib/utils/round-utils';

import { ChatMessageList } from './chat-message-list';
import { ConfigurationChangesGroup } from './configuration-changes-group';
import { RoundAnalysisCard } from './moderator/round-analysis-card';
import { RoundFeedback } from './round-feedback';
import { UnifiedErrorBoundary } from './unified-error-boundary';

// Stable constant for default empty Map to prevent render loop
const EMPTY_FEEDBACK_MAP = new Map<number, 'like' | 'dislike'>();

type ThreadTimelineProps = {
  timelineItems: TimelineItem[];
  scrollContainerId: string;
  user: {
    name: string;
    image: string | null;
  };
  participants: ChatParticipant[];
  threadId: string;

  // Streaming state (optional - null for public view)
  isStreaming?: boolean;
  currentParticipantIndex?: number;
  currentStreamingParticipant?: ChatParticipant | null;
  streamingRoundNumber?: number | null;

  // Feedback handlers (optional - view-only for public)
  feedbackByRound?: Map<number, 'like' | 'dislike'>;
  pendingFeedback?: { roundNumber: number; type: 'like' | 'dislike' } | null;
  getFeedbackHandler?: (roundNumber: number) => (type: 'like' | 'dislike' | null) => void;

  // Analysis handlers (optional - view-only for public)
  onAnalysisStreamStart?: (roundNumber: number) => void;
  onAnalysisStreamComplete?: (roundNumber: number, data?: ModeratorAnalysisPayload) => void;
  onActionClick?: (action: RecommendedAction) => void;

  // Error retry (optional)
  onRetry?: () => void;

  // View mode
  isReadOnly?: boolean;
};

export function ThreadTimeline({
  timelineItems,
  scrollContainerId,
  user,
  participants,
  threadId,
  isStreaming = false,
  currentParticipantIndex = 0,
  currentStreamingParticipant = null,
  streamingRoundNumber = null,
  feedbackByRound = EMPTY_FEEDBACK_MAP,
  pendingFeedback = null,
  getFeedbackHandler,
  onAnalysisStreamStart,
  onAnalysisStreamComplete,
  onActionClick,
  onRetry,
  isReadOnly = false,
}: ThreadTimelineProps) {
  // ✅ STREAMING SAFETY: Calculate which rounds are currently streaming
  // Prevents virtualization from removing DOM elements during active streaming
  const streamingRounds = new Set<number>();

  // Add participant streaming rounds
  if (isStreaming && streamingRoundNumber !== null) {
    streamingRounds.add(streamingRoundNumber);
  }

  // Add analysis streaming rounds (check for 'streaming' status in timeline items)
  timelineItems.forEach((item) => {
    if (item.type === 'analysis' && item.data.status === 'streaming') {
      streamingRounds.add(item.data.roundNumber);
    }
  });

  // Virtualization for timeline items with streaming awareness
  const { virtualItems, totalSizeWithPadding, measureElement } = useVirtualizedTimeline({
    timelineItems,
    scrollContainerId,
    estimateSize: 400,
    overscan: 5,
    bottomPadding: 200,
    streamingRounds,
  });

  return (
    <div
      style={{
        position: 'relative',
        minHeight: `${totalSizeWithPadding}px`,
      }}
    >
      {virtualItems.map((virtualItem) => {
        const item = timelineItems[virtualItem.index];
        const itemIndex = virtualItem.index;
        if (!item)
          return null;

        const roundNumber = item.type === 'messages'
          ? getRoundNumberFromMetadata(item.data[0]?.metadata, 1)
          : item.type === 'analysis'
            ? item.data.roundNumber
            : item.type === 'changelog'
              ? item.data[0]?.roundNumber ?? 1
              : 1;

        return (
          <div
            key={virtualItem.key}
            data-index={virtualItem.index}
            ref={measureElement}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virtualItem.start}px)`,
            }}
          >
            {item.type === 'changelog' && item.data.length > 0 && (
              <div className="mb-6">
                <UnifiedErrorBoundary context="configuration">
                  <ConfigurationChangesGroup
                    group={{
                      timestamp: new Date(item.data[0]!.createdAt),
                      changes: item.data,
                    }}
                  />
                </UnifiedErrorBoundary>
              </div>
            )}

            {item.type === 'messages' && (
              <div className="space-y-3 pb-2">
                <UnifiedErrorBoundary context="message-list" onReset={onRetry}>
                  <ChatMessageList
                    messages={item.data}
                    user={user}
                    participants={participants}
                    isStreaming={isStreaming}
                    currentParticipantIndex={currentParticipantIndex}
                    currentStreamingParticipant={currentStreamingParticipant}
                  />
                </UnifiedErrorBoundary>

                {!isStreaming && (() => {
                  const hasRoundError = item.data.some((msg) => {
                    const parseResult = MessageMetadataSchema.safeParse(msg.metadata);
                    return parseResult.success && messageHasError(parseResult.data);
                  });

                  return (
                    <Actions className="mt-3 mb-2">
                      {!hasRoundError && (
                        <RoundFeedback
                          key={`feedback-${threadId}-${roundNumber}`}
                          threadId={threadId}
                          roundNumber={roundNumber}
                          currentFeedback={feedbackByRound.get(roundNumber) ?? null}
                          onFeedbackChange={
                            isReadOnly || !getFeedbackHandler
                              ? () => {}
                              : getFeedbackHandler(roundNumber)
                          }
                          disabled={isReadOnly || isStreaming}
                          isPending={pendingFeedback?.roundNumber === roundNumber}
                          pendingType={
                            pendingFeedback?.roundNumber === roundNumber
                              ? pendingFeedback?.type ?? null
                              : null
                          }
                        />
                      )}
                    </Actions>
                  );
                })()}
              </div>
            )}

            {item.type === 'analysis' && (
              <div className="mt-6 mb-4">
                <RoundAnalysisCard
                  analysis={item.data}
                  threadId={threadId}
                  isLatest={itemIndex === timelineItems.length - 1}
                  streamingRoundNumber={streamingRoundNumber}
                  onStreamStart={() => {
                    onAnalysisStreamStart?.(item.data.roundNumber);
                  }}
                  onStreamComplete={(completedData) => {
                    onAnalysisStreamComplete?.(item.data.roundNumber, completedData);
                  }}
                  onActionClick={isReadOnly ? undefined : onActionClick}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
