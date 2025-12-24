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
import type { ChatParticipant, StoredPreSearch } from '@/api/routes/chat/schema';
import { Actions } from '@/components/ai-elements/actions';
import { ScrollFadeEntrance, ScrollFromTop } from '@/components/ui/motion';
import { DbMessageMetadataSchema } from '@/db/schemas/chat-metadata';
import type { TimelineItem } from '@/hooks/utils';
import { useVirtualizedTimeline } from '@/hooks/utils';
import { messageHasError } from '@/lib/schemas/message-metadata';
import { getModeratorMetadata, isModeratorMessage } from '@/lib/utils';

import { ChatMessageList } from './chat-message-list';
import { ConfigurationChangesGroup } from './configuration-changes-group';
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

  // Error retry
  onRetry?: () => void;

  // View mode
  isReadOnly?: boolean;

  // Pre-search state
  preSearches?: StoredPreSearch[];

  // Demo mode
  demoPreSearchOpen?: boolean;

  // Data readiness
  isDataReady?: boolean;

  // Message content scrolling (demo mode)
  maxContentHeight?: number;

  // Skip all entrance animations (for demo that has already completed)
  skipEntranceAnimations?: boolean;

  // ✅ BUG FIX: Set of round numbers that have complete summaries
  // Used to prevent showing pending cards for rounds that already completed
  completedRoundNumbers?: Set<number>;

  // ✅ MODERATOR FLAG: Indicates moderator is streaming (for input blocking)
  // Moderator message now renders via normal message flow
  isModeratorStreaming?: boolean;

  // Demo mode - forces all models to be accessible (hides tier badges)
  demoMode?: boolean;

  // ✅ RACE CONDITION FIX: Getter to read streaming state directly from store
  // Bypasses React batching to get latest value immediately
  getIsStreamingFromStore?: () => boolean;
};

// Stable empty set to prevent render loops
const EMPTY_COMPLETED_ROUNDS = new Set<number>();

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
  onRetry,
  isReadOnly = false,
  preSearches = EMPTY_PRE_SEARCHES,
  demoPreSearchOpen,
  isDataReady = true,
  maxContentHeight,
  skipEntranceAnimations = false,
  completedRoundNumbers = EMPTY_COMPLETED_ROUNDS,
  isModeratorStreaming = false,
  demoMode = false,
  getIsStreamingFromStore,
}: ThreadTimelineProps) {
  // ✅ SCROLL FIX: Track active streaming for virtualizer and measurement
  // This prevents scroll jumps and viewport shifts during content generation
  const isActivelyStreaming = isStreaming || isModeratorStreaming;

  // TanStack Virtual hook - official pattern
  // ✅ SCROLL FIX: Pass isStreaming to stabilize totalSize during streaming
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
    isStreaming: isActivelyStreaming, // Prevents container height changes during streaming
    getIsStreamingFromStore, // ✅ RACE CONDITION FIX: Bypasses React batching
  });

  // ✅ SCROLL FIX: During active streaming, skip measurement to prevent scroll jumps
  // When streaming ends, remeasurement will occur naturally on next scroll
  const stableMeasureElement = isActivelyStreaming ? undefined : measureElement;

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
          // - ref={measureElement} (disabled during streaming to prevent scroll jumps)
          // - position: absolute, top: 0, left: 0
          // - transform: translateY(item.start - scrollMargin)
          <div
            key={virtualItem.key}
            data-index={virtualItem.index}
            ref={stableMeasureElement}
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
                      isModeratorStreaming={isModeratorStreaming}
                      roundNumber={item.roundNumber}
                      demoMode={demoMode}
                    />
                  </UnifiedErrorBoundary>

                  {/* Round feedback and copy actions - shown after moderator message completes */}
                  {!isStreaming && !isReadOnly && (() => {
                    // Find moderator message in this round using type-safe utility
                    const moderatorMessage = item.data.find(msg => isModeratorMessage(msg));

                    // Only show feedback/copy after moderator finishes
                    if (!moderatorMessage)
                      return null;
                    const moderatorMeta = getModeratorMetadata(moderatorMessage.metadata);
                    if (!moderatorMeta?.finishReason)
                      return null;

                    const hasRoundError = item.data.some((msg) => {
                      const parseResult = DbMessageMetadataSchema.safeParse(msg.metadata);
                      return parseResult.success && messageHasError(parseResult.data);
                    });

                    // Get moderator text for copy action
                    const moderatorText = moderatorMessage.parts
                      ?.filter(part => part.type === 'text')
                      .map(part => (part as { text: string }).text)
                      .join('\n');

                    return (
                      <Actions className="mt-3 mb-2">
                        {!hasRoundError && (
                          <RoundFeedback
                            key={`feedback-${threadId}-${item.roundNumber}`}
                            threadId={threadId}
                            roundNumber={item.roundNumber}
                            currentFeedback={feedbackByRound.get(item.roundNumber) ?? null}
                            onFeedbackChange={
                              !getFeedbackHandler
                                ? () => {}
                                : getFeedbackHandler(item.roundNumber)
                            }
                            disabled={isStreaming}
                            isPending={pendingFeedback?.roundNumber === item.roundNumber}
                            pendingType={
                              pendingFeedback?.roundNumber === item.roundNumber
                                ? pendingFeedback?.type ?? null
                                : null
                            }
                          />
                        )}
                        <RoundCopyAction
                          key={`copy-${threadId}-${item.roundNumber}`}
                          messages={item.data}
                          participants={participants}
                          roundNumber={item.roundNumber}
                          threadTitle={threadTitle}
                          moderatorText={moderatorText}
                        />
                      </Actions>
                    );
                  })()}
                </div>
              </ScrollFadeEntrance>
            )}
          </div>
        );
      })}
    </div>
  );
}
