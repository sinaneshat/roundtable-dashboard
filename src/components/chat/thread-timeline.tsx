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

import { useRef } from 'react';

import type { FeedbackType } from '@/api/core/enums';
import { MessageStatuses } from '@/api/core/enums';
import type { ChatParticipant, RoundSummaryAIContent, StoredPreSearch } from '@/api/routes/chat/schema';
import { ScrollFadeEntrance, ScrollFromBottom, ScrollFromTop } from '@/components/ui/motion';
import { DbMessageMetadataSchema } from '@/db/schemas/chat-metadata';
import type { TimelineItem } from '@/hooks/utils';
import { useVirtualizedTimeline } from '@/hooks/utils';
import { messageHasError } from '@/lib/schemas/message-metadata';

import { ChatMessageList } from './chat-message-list';
import { ConfigurationChangesGroup } from './configuration-changes-group';
import { PreSearchCard } from './pre-search-card';
import { RoundSummaryCard } from './round-summary/round-summary-card';
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

  // Summary handlers
  onSummaryStreamStart?: (roundNumber: number) => void;
  onSummaryStreamComplete?: (roundNumber: number, data?: RoundSummaryAIContent | null, error?: unknown) => void;

  // Error retry
  onRetry?: () => void;

  // View mode
  isReadOnly?: boolean;

  // Pre-search state
  preSearches?: StoredPreSearch[];

  // Demo mode
  demoPreSearchOpen?: boolean;
  demoSummaryOpen?: boolean;

  // Data readiness
  isDataReady?: boolean;

  // Message content scrolling (demo mode)
  maxContentHeight?: number;

  // Skip all entrance animations (for demo that has already completed)
  skipEntranceAnimations?: boolean;

  // ✅ BUG FIX: Set of round numbers that have complete summaries
  // Used to prevent showing pending cards for rounds that already completed
  completedRoundNumbers?: Set<number>;
};

// Stable empty set to prevent render loops
const EMPTY_COMPLETED_ROUNDS = new Set<number>();

export function ThreadTimeline({
  timelineItems,
  user,
  participants,
  threadId,
  threadTitle: _threadTitle,
  isStreaming = false,
  currentParticipantIndex = 0,
  currentStreamingParticipant = null,
  streamingRoundNumber = null,
  feedbackByRound = EMPTY_FEEDBACK_MAP,
  pendingFeedback = null,
  getFeedbackHandler,
  onSummaryStreamStart,
  onSummaryStreamComplete,
  onRetry,
  isReadOnly = false,
  preSearches = EMPTY_PRE_SEARCHES,
  demoPreSearchOpen,
  demoSummaryOpen: _demoSummaryOpen,
  isDataReady = true,
  maxContentHeight,
  skipEntranceAnimations = false,
  completedRoundNumbers = EMPTY_COMPLETED_ROUNDS,
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

  // ✅ ANIMATION: Track items already animated to prevent re-animation on scroll
  // Items that existed on initial load should NOT animate (skipInitialAnimation)
  const animatedItemsRef = useRef<Set<string>>(new Set());
  const isInitialLoadRef = useRef(true);

  // Mark initial items as "already animated" on first render
  if (isInitialLoadRef.current && virtualItems.length > 0) {
    isInitialLoadRef.current = false;
    // Skip animation for items present on initial load
    virtualItems.forEach((vi) => {
      animatedItemsRef.current.add(String(vi.key));
    });
  }

  // Helper to check if item should animate
  const shouldAnimate = (itemKey: React.Key): boolean => {
    // Skip all animations when explicitly requested (e.g., demo already completed)
    if (skipEntranceAnimations) {
      return false;
    }
    const key = String(itemKey);
    if (animatedItemsRef.current.has(key)) {
      return false; // Already animated
    }
    // Mark as animated and return true (should animate)
    animatedItemsRef.current.add(key);
    return true;
  };

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
              <ScrollFadeEntrance
                index={virtualItem.index}
                skipAnimation={!shouldAnimate(virtualItem.key)}
                enableScrollEffect
                scrollIntensity={0.08}
              >
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
              </ScrollFadeEntrance>
            )}

            {/* Pre-search items - slides DOWN from top */}
            {/* ✅ FIX: Don't use shouldAnimate - let whileInView handle scroll-triggered animation */}
            {item.type === 'pre-search' && (
              <ScrollFromTop
                skipAnimation={skipEntranceAnimations}
              >
                <div className="w-full mb-6">
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
              </ScrollFromTop>
            )}

            {/* Message items */}
            {/* Note: Scroll effect disabled here - ChatMessageList has its own
                ScrollAwareUserMessage and ScrollAwareParticipant wrappers that
                handle scroll effects at the individual message level */}
            {item.type === 'messages' && (
              <ScrollFadeEntrance
                index={virtualItem.index}
                skipAnimation={!shouldAnimate(virtualItem.key)}
                enableScrollEffect={false}
              >
                <div className="space-y-6 pb-4">
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
                      maxContentHeight={maxContentHeight}
                      skipEntranceAnimations={skipEntranceAnimations}
                      completedRoundNumbers={completedRoundNumbers}
                      feedbackByRound={feedbackByRound}
                      pendingFeedback={pendingFeedback}
                      getFeedbackHandler={getFeedbackHandler}
                      isReadOnly={isReadOnly}
                    />
                  </UnifiedErrorBoundary>
                </div>
              </ScrollFadeEntrance>
            )}

            {/* Round Summary items - slides UP from bottom */}
            {/* ✅ FIX: Don't use shouldAnimate - let whileInView handle scroll-triggered animation */}
            {item.type === 'summary' && (
              <ScrollFromBottom
                skipAnimation={skipEntranceAnimations}
              >
                <div className="w-full mt-12 mb-4">
                  <RoundSummaryCard
                    summary={item.data}
                    threadId={threadId}
                    onStreamStart={() => {
                      onSummaryStreamStart?.(item.data.roundNumber);
                    }}
                    onStreamComplete={(completedData, error) => {
                      onSummaryStreamComplete?.(item.data.roundNumber, completedData, error);
                    }}
                    feedbackProps={(() => {
                      // Only show feedback after summary completes, not streaming, not read-only
                      if (isStreaming || isReadOnly || item.data.status !== MessageStatuses.COMPLETE) {
                        return undefined;
                      }

                      // Check if round has errors
                      const messagesItem = timelineItems.find(
                        ti => ti.type === 'messages' && ti.roundNumber === item.data.roundNumber,
                      );
                      if (!messagesItem || messagesItem.type !== 'messages') {
                        return undefined;
                      }

                      const messages = messagesItem.data;
                      const hasRoundError = messages.some((msg) => {
                        const parseResult = DbMessageMetadataSchema.safeParse(msg.metadata);
                        return parseResult.success && messageHasError(parseResult.data);
                      });

                      if (hasRoundError) {
                        return undefined;
                      }

                      return {
                        currentFeedback: feedbackByRound.get(item.data.roundNumber) ?? null,
                        onFeedbackChange: !getFeedbackHandler
                          ? () => {}
                          : getFeedbackHandler(item.data.roundNumber),
                        disabled: isStreaming,
                        isPending: pendingFeedback?.roundNumber === item.data.roundNumber,
                        pendingType: pendingFeedback?.roundNumber === item.data.roundNumber
                          ? pendingFeedback?.type ?? null
                          : null,
                      };
                    })()}
                  />
                </div>
              </ScrollFromBottom>
            )}
          </div>
        );
      })}
    </div>
  );
}
