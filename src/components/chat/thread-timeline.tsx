/**
 * Thread Timeline Component
 *
 * Virtualized timeline using TanStack Virtual - following official docs exactly.
 * Uses useWindowVirtualizer for window-level scrolling.
 *
 * Official TanStack Virtual pattern:
 * - Container with position: relative and height: getTotalSize()
 * - Items with position: absolute, top: 0, left: 0
 * - Transform: translateY(item.start - scrollMargin)
 * - data-index attribute for measurement
 * - ref={measureElement} for dynamic sizing
 */

'use client';

import type { FeedbackType } from '@/api/core/enums';
import { AnalysisStatuses } from '@/api/core/enums';
import type { ArticleRecommendation, ChatParticipant, ModeratorAnalysisPayload, StoredPreSearch } from '@/api/routes/chat/schema';
import { Actions } from '@/components/ai-elements/actions';
import { DbMessageMetadataSchema } from '@/db/schemas/chat-metadata';
import type { TimelineItem } from '@/hooks/utils';
import { useVirtualizedTimeline } from '@/hooks/utils';
import { messageHasError } from '@/lib/schemas/message-metadata';
import { DEFAULT_ROUND_NUMBER, extractRoundNumber } from '@/lib/schemas/round-schemas';

import { ChatMessageList } from './chat-message-list';
import { ConfigurationChangesGroup } from './configuration-changes-group';
import type { DemoSectionOpenStates } from './moderator/moderator-analysis-panel';
import { RoundAnalysisCard } from './moderator/round-analysis-card';
import { PreSearchCard } from './pre-search-card';
import { RoundCopyAction } from './round-copy-action';
import { RoundFeedback } from './round-feedback';
import { UnifiedErrorBoundary } from './unified-error-boundary';

// Stable constants to prevent render loops
const EMPTY_FEEDBACK_MAP = new Map<number, FeedbackType>();
const EMPTY_PRE_SEARCHES: StoredPreSearch[] = [];

type ThreadTimelineProps = {
  timelineItems: TimelineItem[];
  user: {
    name: string;
    image: string | null;
  };
  participants: ChatParticipant[];
  threadId: string;
  threadTitle?: string;

  // Streaming state
  isStreaming?: boolean;
  currentParticipantIndex?: number;
  currentStreamingParticipant?: ChatParticipant | null;
  streamingRoundNumber?: number | null;

  // Feedback handlers
  feedbackByRound?: Map<number, FeedbackType>;
  pendingFeedback?: { roundNumber: number; type: FeedbackType } | null;
  getFeedbackHandler?: (roundNumber: number) => (type: FeedbackType | null) => void;

  // Analysis handlers
  onAnalysisStreamStart?: (roundNumber: number) => void;
  onAnalysisStreamComplete?: (roundNumber: number, data?: ModeratorAnalysisPayload | null, error?: unknown) => void;
  onActionClick?: (action: ArticleRecommendation) => void;

  // Error retry
  onRetry?: () => void;

  // View mode
  isReadOnly?: boolean;

  // Pre-search state
  preSearches?: StoredPreSearch[];

  // Demo mode
  demoPreSearchOpen?: boolean;
  demoAnalysisOpen?: boolean;
  demoAnalysisSectionStates?: DemoSectionOpenStates;

  // Data readiness
  isDataReady?: boolean;
};

export function ThreadTimeline({
  timelineItems,
  user,
  participants,
  threadId,
  threadTitle,
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
  demoAnalysisSectionStates,
  isDataReady = true,
}: ThreadTimelineProps) {
  // TanStack Virtual hook - official pattern
  const {
    virtualItems,
    totalSize,
    scrollMargin,
    measureElement,
  } = useVirtualizedTimeline({
    timelineItems,
    estimateSize: 200, // Realistic estimate for chat messages
    overscan: 5, // Official docs recommend 5
    paddingEnd: 200, // Space for sticky chat input
    isDataReady,
  });

  return (
    // Container with data attribute for scroll margin measurement
    <div
      data-virtualized-timeline
      style={{
        // Official pattern: height = getTotalSize()
        height: `${totalSize}px`,
        width: '100%',
        position: 'relative',
      }}
    >
      {virtualItems.map((virtualItem) => {
        const item = timelineItems[virtualItem.index];
        if (!item)
          return null;

        // Extract round number for feedback logic
        const roundNumber = item.type === 'messages'
          ? extractRoundNumber(item.data[0]?.metadata)
          : item.type === 'analysis'
            ? item.data.roundNumber
            : item.type === 'changelog'
              ? item.data[0]?.roundNumber ?? DEFAULT_ROUND_NUMBER
              : item.type === 'pre-search'
                ? item.data.roundNumber
                : DEFAULT_ROUND_NUMBER;

        return (
          // Official TanStack Virtual pattern:
          // - key={virtualItem.key}
          // - data-index={virtualItem.index}
          // - ref={measureElement}
          // - position: absolute, top: 0, left: 0
          // - transform: translateY(item.start - scrollMargin)
          <div
            key={virtualItem.key}
            data-index={virtualItem.index}
            ref={measureElement}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              // Official pattern: translateY(item.start - scrollMargin)
              transform: `translateY(${virtualItem.start - scrollMargin}px)`,
            }}
          >
            {/* Changelog items */}
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

            {/* Pre-search items */}
            {item.type === 'pre-search' && (
              <div className="mb-6">
                <UnifiedErrorBoundary context="pre-search">
                  <PreSearchCard
                    threadId={threadId}
                    preSearch={item.data}
                    isLatest={virtualItem.index === timelineItems.length - 1}
                    streamingRoundNumber={streamingRoundNumber}
                    demoOpen={demoPreSearchOpen}
                    demoShowContent={demoPreSearchOpen ? item.data.searchData !== undefined : undefined}
                  />
                </UnifiedErrorBoundary>
              </div>
            )}

            {/* Message items */}
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

                {/* Round feedback and copy actions */}
                {!isStreaming && !isReadOnly && (() => {
                  const hasRoundError = item.data.some((msg) => {
                    const parseResult = DbMessageMetadataSchema.safeParse(msg.metadata);
                    return parseResult.success && messageHasError(parseResult.data);
                  });

                  // Only show feedback after analysis is complete
                  const roundAnalysis = timelineItems.find(
                    ti => ti.type === 'analysis' && ti.data.roundNumber === roundNumber,
                  );
                  const isRoundComplete = roundAnalysis
                    && roundAnalysis.type === 'analysis'
                    && roundAnalysis.data.status === AnalysisStatuses.COMPLETE;

                  if (!isRoundComplete)
                    return null;

                  return (
                    <Actions className="mt-3 mb-2">
                      {!hasRoundError && (
                        <RoundFeedback
                          key={`feedback-${threadId}-${roundNumber}`}
                          threadId={threadId}
                          roundNumber={roundNumber}
                          currentFeedback={feedbackByRound.get(roundNumber) ?? null}
                          onFeedbackChange={
                            !getFeedbackHandler
                              ? () => {}
                              : getFeedbackHandler(roundNumber)
                          }
                          disabled={isStreaming}
                          isPending={pendingFeedback?.roundNumber === roundNumber}
                          pendingType={
                            pendingFeedback?.roundNumber === roundNumber
                              ? pendingFeedback?.type ?? null
                              : null
                          }
                        />
                      )}
                      <RoundCopyAction
                        key={`copy-${threadId}-${roundNumber}`}
                        messages={item.data}
                        participants={participants}
                        roundNumber={roundNumber}
                        threadTitle={threadTitle}
                      />
                    </Actions>
                  );
                })()}
              </div>
            )}

            {/* Analysis items */}
            {item.type === 'analysis' && (
              <div className="mb-4">
                <RoundAnalysisCard
                  analysis={item.data}
                  threadId={threadId}
                  isLatest={virtualItem.index === timelineItems.length - 1}
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
                  demoSectionStates={demoAnalysisSectionStates}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
