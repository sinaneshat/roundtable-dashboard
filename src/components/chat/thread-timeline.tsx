/**
 * Thread Timeline Component
 *
 * Shared timeline rendering component for thread and public screens.
 * Consolidates duplicate virtualized timeline rendering logic.
 *
 * Used by: ChatThreadScreen, PublicChatThreadScreen
 */

'use client';

import type { FeedbackType } from '@/api/core/enums';
import { AnalysisStatuses } from '@/api/core/enums';
import type { ChatParticipant, ModeratorAnalysisPayload, RecommendedAction, StoredPreSearch } from '@/api/routes/chat/schema';
import { Actions } from '@/components/ai-elements/actions';
import { DbMessageMetadataSchema } from '@/db/schemas/chat-metadata';
import type { TimelineItem } from '@/hooks/utils';
import { useVirtualizedTimeline } from '@/hooks/utils';
import { messageHasError } from '@/lib/schemas/message-metadata';
import { DEFAULT_ROUND_NUMBER, extractRoundNumber } from '@/lib/schemas/round-schemas';

import { ChatMessageList } from './chat-message-list';
import { ConfigurationChangesGroup } from './configuration-changes-group';
import { RoundAnalysisCard } from './moderator/round-analysis-card';
import { RoundFeedback } from './round-feedback';
import { UnifiedErrorBoundary } from './unified-error-boundary';

// Stable constant for default empty Map to prevent render loop
const EMPTY_FEEDBACK_MAP = new Map<number, FeedbackType>();
const EMPTY_PRE_SEARCHES: StoredPreSearch[] = [];

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
  feedbackByRound?: Map<number, FeedbackType>;
  pendingFeedback?: { roundNumber: number; type: FeedbackType } | null;
  getFeedbackHandler?: (roundNumber: number) => (type: FeedbackType | null) => void;

  // Analysis handlers (optional - view-only for public)
  onAnalysisStreamStart?: (roundNumber: number) => void;
  onAnalysisStreamComplete?: (roundNumber: number, data?: ModeratorAnalysisPayload | null, error?: unknown) => void;
  onActionClick?: (action: RecommendedAction) => void;

  // Error retry (optional)
  onRetry?: () => void;

  // View mode
  isReadOnly?: boolean;

  // Pre-search state (from store)
  preSearches?: StoredPreSearch[];

  // Demo mode controlled accordion states (optional - for LiveChatDemo only)
  demoPreSearchOpen?: boolean;
  demoAnalysisOpen?: boolean;
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
  preSearches = EMPTY_PRE_SEARCHES,
  demoPreSearchOpen,
  demoAnalysisOpen,
}: ThreadTimelineProps) {
  // ✅ STREAMING SAFETY: Calculate which rounds are currently streaming
  // Prevents virtualization from removing DOM elements during active streaming
  const streamingRounds = new Set<number>();

  // Add participant streaming rounds
  if (isStreaming && streamingRoundNumber !== null) {
    streamingRounds.add(streamingRoundNumber);
  }

  // ✅ ENUM PATTERN: Use AnalysisStatuses constants instead of hardcoded strings
  // Add pre-search active rounds (protect rounds with active web search)
  preSearches.forEach((ps) => {
    if (ps.status === AnalysisStatuses.STREAMING || ps.status === AnalysisStatuses.PENDING) {
      streamingRounds.add(ps.roundNumber);
    }
  });

  // Add analysis streaming rounds (check for streaming/pending status in timeline items)
  // Include PENDING state to protect analyses that are about to stream
  timelineItems.forEach((item) => {
    if (
      item.type === 'analysis'
      && (item.data.status === AnalysisStatuses.STREAMING || item.data.status === AnalysisStatuses.PENDING)
    ) {
      streamingRounds.add(item.data.roundNumber);
    }
  });

  // ✅ VIRTUALIZATION: Window-level virtualization with streaming protection
  // Reduces DOM nodes from ~100+ messages to ~10-15 visible items for performance
  // ✅ MOBILE OPTIMIZED: Hook automatically increases overscan to 25+ on touch devices
  // ✅ OFFICIAL PATTERN: Use paddingEnd option - getTotalSize() includes this automatically
  const ESTIMATE_SIZE = 400; // Estimated height per timeline item
  const { virtualItems, totalSize, scrollMargin, measureElement } = useVirtualizedTimeline({
    timelineItems,
    scrollContainerId,
    estimateSize: ESTIMATE_SIZE,
    overscan: 15, // Desktop: 15 items | Mobile: 25+ (auto-adjusted by hook)
    paddingEnd: 200, // ✅ Built-in padding option (not manual paddingBottom)
    streamingRounds, // Pass streaming rounds to prevent unmounting during streams
  });

  return (
    <div
      style={{
        position: 'relative',
        // ✅ OFFICIAL PATTERN: getTotalSize() already includes paddingEnd
        // No manual padding needed - virtualizer handles this automatically
        height: `${totalSize}px`,
        width: '100%',
        // ✅ MOBILE FIX: Add will-change for better mobile transform performance
        willChange: 'height',
      }}
    >
      {virtualItems.map((virtualItem) => {
        const item = timelineItems[virtualItem.index];
        const itemIndex = virtualItem.index;
        if (!item)
          return null;

        const roundNumber = item.type === 'messages'
          ? extractRoundNumber(item.data[0]?.metadata)
          : item.type === 'analysis'
            ? item.data.roundNumber
            : item.type === 'changelog'
              ? item.data[0]?.roundNumber ?? DEFAULT_ROUND_NUMBER
              : DEFAULT_ROUND_NUMBER;

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
              transform: `translateY(${virtualItem.start - scrollMargin}px)`,
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
                    threadId={threadId}
                    preSearches={preSearches}
                    streamingRoundNumber={streamingRoundNumber}
                    demoPreSearchOpen={demoPreSearchOpen}
                  />
                </UnifiedErrorBoundary>

                {/* PreSearchCard now rendered inside ChatMessageList between user and assistant messages */}

                {!isStreaming && (() => {
                  const hasRoundError = item.data.some((msg) => {
                    const parseResult = DbMessageMetadataSchema.safeParse(msg.metadata);
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
                  onStreamComplete={(completedData, error) => {
                    onAnalysisStreamComplete?.(item.data.roundNumber, completedData, error);
                  }}
                  onActionClick={isReadOnly ? undefined : onActionClick}
                  demoOpen={demoAnalysisOpen}
                  demoShowContent={demoAnalysisOpen ? item.data.analysisData !== undefined : undefined}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
