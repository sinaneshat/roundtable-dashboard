'use client';

import { useRef } from 'react';

import type { FeedbackType } from '@/api/core/enums';
import type { StoredPreSearch } from '@/api/routes/chat/schema';
import { Actions } from '@/components/ai-elements/actions';
import { ScrollFadeEntrance, ScrollFromTop } from '@/components/ui/motion';
import { DbMessageMetadataSchema } from '@/db/schemas/chat-metadata';
import type { TimelineItem } from '@/hooks/utils';
import { useVirtualizedTimeline } from '@/hooks/utils';
import { messageHasError } from '@/lib/schemas/message-metadata';
import { extractTextFromMessage } from '@/lib/schemas/message-schemas';
import type { ChatParticipantWithSettings } from '@/lib/schemas/participant-schemas';
import { getModeratorMetadata, isModeratorMessage } from '@/lib/utils';

import { ChatMessageList } from './chat-message-list';
import { ConfigurationChangesGroup } from './configuration-changes-group';
import { PreSearchCard } from './pre-search-card';
import { RoundCopyAction } from './round-copy-action';
import { RoundFeedback } from './round-feedback';
import { UnifiedErrorBoundary } from './unified-error-boundary';

const EMPTY_FEEDBACK_MAP = new Map<number, FeedbackType>();
const EMPTY_PRE_SEARCHES: StoredPreSearch[] = [];
const EMPTY_COMPLETED_ROUNDS = new Set<number>();

type ThreadTimelineProps = {
  timelineItems: TimelineItem[];
  user: {
    name: string;
    image: string | null;
  };
  participants: ChatParticipantWithSettings[];
  threadId: string;
  threadTitle?: string;

  isStreaming?: boolean;
  currentParticipantIndex?: number;
  currentStreamingParticipant?: ChatParticipantWithSettings | null;
  streamingRoundNumber?: number | null;
  feedbackByRound?: Map<number, FeedbackType>;
  pendingFeedback?: { roundNumber: number; type: FeedbackType } | null;
  getFeedbackHandler?: (roundNumber: number) => (type: FeedbackType | null) => void;
  onRetry?: () => void;
  isReadOnly?: boolean;
  preSearches?: StoredPreSearch[];
  demoPreSearchOpen?: boolean;
  isDataReady?: boolean;
  maxContentHeight?: number;
  skipEntranceAnimations?: boolean;
  completedRoundNumbers?: Set<number>;
  isModeratorStreaming?: boolean;
  demoMode?: boolean;
  getIsStreamingFromStore?: () => boolean;
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
  const isActivelyStreaming = isStreaming || isModeratorStreaming;

  const {
    virtualItems,
    totalSize,
    scrollMargin,
    measureElement,
  } = useVirtualizedTimeline({
    timelineItems,
    estimateSize: 200,
    overscan: 5,
    paddingEnd: 200,
    isDataReady,
    isStreaming: isActivelyStreaming,
    getIsStreamingFromStore,
  });

  const stableMeasureElement = measureElement;

  const animatedItemsRef = useRef<Set<string>>(new Set());
  const isInitialLoadRef = useRef(true);

  if (isInitialLoadRef.current && virtualItems.length > 0) {
    isInitialLoadRef.current = false;
    virtualItems.forEach((vi) => {
      animatedItemsRef.current.add(String(vi.key));
    });
  }

  const shouldAnimate = (itemKey: React.Key): boolean => {
    if (skipEntranceAnimations) {
      return false;
    }
    const key = String(itemKey);
    if (animatedItemsRef.current.has(key)) {
      return false;
    }
    animatedItemsRef.current.add(key);
    return true;
  };

  return (
    <div
      data-virtualized-timeline
      style={{
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
          <div
            key={virtualItem.key}
            data-index={virtualItem.index}
            ref={stableMeasureElement}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virtualItem.start - scrollMargin}px)`,
            }}
          >
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

            {item.type === 'pre-search' && (
              <ScrollFromTop skipAnimation={skipEntranceAnimations}>
                <div className="w-full mb-6">
                  <UnifiedErrorBoundary context="pre-search">
                    <PreSearchCard
                      threadId={threadId}
                      preSearch={item.data}
                      streamingRoundNumber={streamingRoundNumber}
                      demoOpen={demoPreSearchOpen}
                      demoShowContent={demoPreSearchOpen ? item.data.searchData !== undefined : undefined}
                    />
                  </UnifiedErrorBoundary>
                </div>
              </ScrollFromTop>
            )}

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

                  {!isStreaming && !isReadOnly && (() => {
                    const moderatorMessage = item.data.find(msg => isModeratorMessage(msg));

                    if (!moderatorMessage) {
                      return null;
                    }

                    const moderatorMeta = getModeratorMetadata(moderatorMessage.metadata);
                    if (!moderatorMeta?.finishReason) {
                      return null;
                    }

                    const hasRoundError = item.data.some((msg) => {
                      const parseResult = DbMessageMetadataSchema.safeParse(msg.metadata);
                      return parseResult.success && messageHasError(parseResult.data);
                    });

                    const moderatorText = extractTextFromMessage(moderatorMessage);

                    return (
                      <Actions className="mt-3 mb-2">
                        {!hasRoundError && (
                          <RoundFeedback
                            key={`feedback-${threadId}-${item.roundNumber}`}
                            threadId={threadId}
                            roundNumber={item.roundNumber}
                            currentFeedback={feedbackByRound.get(item.roundNumber) ?? null}
                            onFeedbackChange={
                              getFeedbackHandler
                                ? getFeedbackHandler(item.roundNumber)
                                : () => {}
                            }
                            disabled={isStreaming}
                            isPending={pendingFeedback?.roundNumber === item.roundNumber}
                            pendingType={
                              pendingFeedback?.roundNumber === item.roundNumber
                                ? pendingFeedback.type ?? null
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
