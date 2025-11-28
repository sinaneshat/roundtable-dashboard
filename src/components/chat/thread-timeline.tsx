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
import type { ChatParticipant, ModeratorAnalysisPayload, Recommendation, StoredPreSearch } from '@/api/routes/chat/schema';
import { Actions } from '@/components/ai-elements/actions';
import { DbMessageMetadataSchema } from '@/db/schemas/chat-metadata';
import type { TimelineItem } from '@/hooks/utils';
import { useVirtualizedTimeline } from '@/hooks/utils';
import { messageHasError } from '@/lib/schemas/message-metadata';
import { DEFAULT_ROUND_NUMBER, extractRoundNumber } from '@/lib/schemas/round-schemas';

import { ChatMessageList } from './chat-message-list';
import { ConfigurationChangesGroup } from './configuration-changes-group';
import { RoundAnalysisCard } from './moderator/round-analysis-card';
import { PreSearchCard } from './pre-search-card';
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
  onActionClick?: (action: Recommendation) => void;

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

  // Add analysis and pre-search streaming rounds (check for streaming/pending status in timeline items)
  // Include PENDING state to protect items that are about to stream
  timelineItems.forEach((item) => {
    if (
      item.type === 'analysis'
      && (item.data.status === AnalysisStatuses.STREAMING || item.data.status === AnalysisStatuses.PENDING)
    ) {
      streamingRounds.add(item.data.roundNumber);
    }
    // ✅ RESUMPTION FIX: Also protect pre-search timeline items
    if (
      item.type === 'pre-search'
      && (item.data.status === AnalysisStatuses.STREAMING || item.data.status === AnalysisStatuses.PENDING)
    ) {
      streamingRounds.add(item.data.roundNumber);
    }
  });

  // ✅ VIRTUALIZATION: Window-level virtualization with streaming protection
  // Reduces DOM nodes from ~100+ messages to ~10-15 visible items for performance
  // ✅ MOBILE OPTIMIZED: Hook automatically increases overscan to 25+ on touch devices
  // ✅ HEIGHT FIX: Zero estimates/padding - height matches content exactly
  const ESTIMATE_SIZE = 1; // Near-zero - forces immediate measurement
  const { virtualItems, totalSize, scrollMargin, measureElement } = useVirtualizedTimeline({
    timelineItems,
    scrollContainerId,
    estimateSize: ESTIMATE_SIZE,
    overscan: 15, // Desktop: 15 items | Mobile: 25+ (auto-adjusted by hook)
    paddingEnd: 0, // Zero padding - content fits exactly
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
        // ✅ SCROLL FIX: Disable browser scroll anchoring to prevent snap-back
        // When virtualized items change position, browser tries to maintain anchor
        // This causes unwanted scroll jumping when changelogs/content changes
        overflowAnchor: 'none',
      }}
    >
      {virtualItems.map((virtualItem) => {
        const item = timelineItems[virtualItem.index];
        const itemIndex = virtualItem.index;
        if (!item)
          return null;

        // ✅ RESUMPTION FIX: Handle all timeline item types including 'pre-search'
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

            {/* ✅ RESUMPTION FIX: Pre-search rendered at timeline level
                This enables rendering pre-search cards even when user message
                hasn't been persisted yet (e.g., page refresh during web search phase) */}
            {item.type === 'pre-search' && (
              <div className="mb-6">
                <UnifiedErrorBoundary context="pre-search">
                  <PreSearchCard
                    threadId={threadId}
                    preSearch={item.data}
                    isLatest={itemIndex === timelineItems.length - 1}
                    streamingRoundNumber={streamingRoundNumber}
                    demoOpen={demoPreSearchOpen}
                    demoShowContent={demoPreSearchOpen ? item.data.searchData !== undefined : undefined}
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

                {!isStreaming && !isReadOnly && (() => {
                  const hasRoundError = item.data.some((msg) => {
                    const parseResult = DbMessageMetadataSchema.safeParse(msg.metadata);
                    return parseResult.success && messageHasError(parseResult.data);
                  });

                  // ✅ CRITICAL FIX: Only show feedback after the round's analysis is COMPLETE
                  // This ensures consistent behavior between first round and subsequent rounds
                  // Previously, feedback appeared immediately when participants finished streaming
                  // but before the analysis was complete, which was inconsistent with first round behavior
                  const roundAnalysis = timelineItems.find(
                    ti => ti.type === 'analysis' && ti.data.roundNumber === roundNumber,
                  );
                  const isRoundComplete = roundAnalysis
                    && roundAnalysis.type === 'analysis'
                    && roundAnalysis.data.status === AnalysisStatuses.COMPLETE;

                  // Don't show feedback if round is not complete (analysis still pending/streaming)
                  if (!isRoundComplete) {
                    return null;
                  }

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
                    </Actions>
                  );
                })()}
              </div>
            )}

            {item.type === 'analysis' && (
              <div className="mb-4">
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
