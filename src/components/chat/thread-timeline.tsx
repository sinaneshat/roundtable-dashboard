'use client';

import { useMemo, useRef } from 'react';

import type { StoredPreSearch } from '@/api/routes/chat/schema';
import { Actions } from '@/components/ai-elements/actions';
import { ScrollFadeEntrance, ScrollFromTop } from '@/components/ui/motion';
import type { TimelineItem } from '@/hooks/utils';
import { useVirtualizedTimeline } from '@/hooks/utils';
import { extractTextFromMessage } from '@/lib/schemas/message-schemas';
import type { ChatParticipantWithSettings } from '@/lib/schemas/participant-schemas';
import { getModeratorMetadata, isModeratorMessage } from '@/lib/utils';

import { ChatMessageList } from './chat-message-list';
import { ConfigurationChangesGroup } from './configuration-changes-group';
import { ModeratorCopyAction, ThreadSummaryCopyAction } from './copy-actions';
import { PreSearchCard } from './pre-search-card';
import { UnifiedErrorBoundary } from './unified-error-boundary';

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

  // Collect all messages from timeline for thread-level copy action
  const allMessages = useMemo(() => {
    return timelineItems
      .filter((item): item is Extract<TimelineItem, { type: 'messages' }> => item.type === 'messages')
      .flatMap(item => item.data);
  }, [timelineItems]);

  const {
    virtualItems,
    totalSize,
    scrollMargin,
    measureElement,
  } = useVirtualizedTimeline({
    timelineItems,
    estimateSize: 200,
    overscan: 5,
    paddingEnd: demoMode ? 24 : 0,
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
                      isReadOnly={isReadOnly}
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
                      isReadOnly={isReadOnly}
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

                    const moderatorText = extractTextFromMessage(moderatorMessage);

                    return (
                      <Actions className="mt-3 mb-2">
                        <ModeratorCopyAction
                          key={`copy-summary-${threadId}-${item.roundNumber}`}
                          moderatorText={moderatorText}
                        />
                        <ThreadSummaryCopyAction
                          key={`copy-thread-${threadId}`}
                          messages={allMessages}
                          participants={participants}
                          threadTitle={threadTitle}
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
