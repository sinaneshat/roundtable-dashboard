import { MessagePartTypes, TextPartStates } from '@roundtable/shared';
import { useEffect, useMemo, useRef } from 'react';

import { Actions } from '@/components/ai-elements/actions';
import { ScrollFadeEntrance, ScrollFromTop } from '@/components/ui/motion';
import type { TimelineItem } from '@/hooks/utils';
import { useVirtualizedTimeline } from '@/hooks/utils';
import { extractTextFromMessage } from '@/lib/schemas/message-schemas';
import { getModeratorMetadata, isModeratorMessage } from '@/lib/utils';
import { rlog } from '@/lib/utils/dev-logger';
import type { ApiParticipant, StoredPreSearch } from '@/services/api';

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
  participants: ApiParticipant[];
  threadId: string;
  threadTitle?: string;

  isStreaming?: boolean;
  currentParticipantIndex?: number;
  currentStreamingParticipant?: ApiParticipant | null;
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
  /**
   * Disable virtualization and render content in normal document flow.
   * Use this for read-only pages (like public threads) where SSR hydration
   * can cause measurement issues with virtualization.
   */
  disableVirtualization?: boolean;
  /**
   * Start scrolled to the bottom on initial render.
   * Used for thread pages to show latest messages first on SSR hydration.
   */
  initialScrollToBottom?: boolean;
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
  disableVirtualization = false,
  initialScrollToBottom = false,
}: ThreadTimelineProps) {
  const isActivelyStreaming = isStreaming || isModeratorStreaming;
  const mountTimeRef = useRef(Date.now());

  // ✅ Official TanStack Virtual pattern: listRef for scrollMargin calculation
  // scrollMargin: listRef.current?.offsetTop ?? 0
  const listRef = useRef<HTMLDivElement>(null);

  // ✅ PERF: Track actual data changes vs re-renders
  const prevDataRef = useRef({ items: 0, msgs: 0 });
  useEffect(() => {
    const msgCount = timelineItems.filter(i => i.type === 'messages').reduce((sum, i) => sum + i.data.length, 0);
    const hasDataChanged = prevDataRef.current.items !== timelineItems.length || prevDataRef.current.msgs !== msgCount;
    if (hasDataChanged) {
      rlog.init('timeline-data', `items=${timelineItems.length} msgs=${msgCount} virt=${disableVirtualization ? 0 : 1} ready=${isDataReady ? 1 : 0} elapsed=${Date.now() - mountTimeRef.current}ms`);
      prevDataRef.current = { items: timelineItems.length, msgs: msgCount };
    }
  }, [timelineItems, disableVirtualization, isDataReady]);

  // Collect all messages from timeline for thread-level copy action
  const allMessages = useMemo(() => {
    return timelineItems
      .filter((item): item is Extract<TimelineItem, { type: 'messages' }> => item.type === 'messages')
      .flatMap(item => item.data);
  }, [timelineItems]);

  // Official TanStack Virtual pattern: get virtualizer, call methods directly in render
  const {
    virtualizer,
    measureElement,
    isVirtualizationEnabled,
  } = useVirtualizedTimeline({
    timelineItems,
    listRef,
    estimateSize: 200,
    overscan: 5,
    // paddingEnd: 0 for virtualized mode - CSS pb-[20rem] on wrapper handles bottom spacing
    // demoMode uses small padding for compact embedded layout
    paddingEnd: demoMode ? 24 : 0,
    isDataReady: disableVirtualization ? false : isDataReady,
    isStreaming: isActivelyStreaming,
    getIsStreamingFromStore,
    // SSR: Start scrolled to bottom for thread pages
    initialScrollToBottom: !disableVirtualization && initialScrollToBottom,
  });

  const animatedItemsRef = useRef<Set<string>>(new Set());
  const isInitialLoadRef = useRef(true);

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

  // Helper to render a single timeline item's content
  const renderTimelineItemContent = (item: TimelineItem, index: number) => {
    if (item.type === 'changelog' && item.data.length > 0) {
      return (
        <ScrollFadeEntrance
          index={index}
          skipAnimation={!shouldAnimate(item.key)}
          enableScrollEffect
          scrollIntensity={0.08}
        >
          <div className="mb-6">
            <UnifiedErrorBoundary context="configuration">
              <ConfigurationChangesGroup
                group={{
                  timestamp: item.data[0] && typeof item.data[0].createdAt === 'string' ? item.data[0].createdAt : (item.data[0] ? new Date(item.data[0].createdAt).toISOString() : new Date().toISOString()),
                  changes: item.data,
                }}
                isReadOnly={isReadOnly}
              />
            </UnifiedErrorBoundary>
          </div>
        </ScrollFadeEntrance>
      );
    }

    if (item.type === 'pre-search') {
      return (
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
      );
    }

    if (item.type === 'messages') {
      return (
        <ScrollFadeEntrance
          index={index}
          skipAnimation={!shouldAnimate(item.key)}
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

            {streamingRoundNumber !== item.roundNumber && !isReadOnly && (() => {
              const moderatorMessage = item.data.find(msg => isModeratorMessage(msg));

              if (!moderatorMessage) {
                return null;
              }

              const moderatorMeta = getModeratorMetadata(moderatorMessage.metadata);
              const finishReason = moderatorMeta && typeof moderatorMeta === 'object' && 'finishReason' in moderatorMeta ? (moderatorMeta as { finishReason?: string }).finishReason : undefined;
              if (!finishReason) {
                return null;
              }

              // ✅ FIX: Check if moderator message still has streaming text parts
              const hasStreamingTextParts = moderatorMessage.parts?.some(
                p => p.type === MessagePartTypes.TEXT && 'state' in p && p.state === TextPartStates.STREAMING,
              );
              if (hasStreamingTextParts) {
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
      );
    }

    return null;
  };

  // Non-virtualized render: normal document flow, no absolute positioning
  // Use this for:
  // 1. Read-only pages where SSR hydration causes measurement issues
  // 2. SSR - window virtualizer requires window object, so render content normally on server
  // After hydration, isVirtualizationEnabled becomes true and switches to virtualized render
  if (disableVirtualization || !isVirtualizationEnabled) {
    return (
      <div data-timeline-container className="w-full">
        {timelineItems.map((item, index) => (
          <div key={item.key} data-index={index}>
            {renderTimelineItemContent(item, index)}
          </div>
        ))}
      </div>
    );
  }

  // Virtualized render: absolute positioning with measured heights
  // Following TanStack Virtual official pattern exactly:
  // https://tanstack.com/virtual/latest/docs/framework/react/examples/window
  // - Container: ref={listRef} for scrollMargin calculation
  // - Container: height = getTotalSize() - called DIRECTLY in render
  // - Items: getVirtualItems() called DIRECTLY in render - never stale
  // - Items: position absolute, transform translateY(start - scrollMargin)

  // OFFICIAL PATTERN: Call getVirtualItems() and getTotalSize() directly in render
  // This ensures positions are ALWAYS current, never stale during streaming
  const virtualItems = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  // Track animated items on first render for entrance animations
  if (isInitialLoadRef.current && virtualItems.length > 0) {
    isInitialLoadRef.current = false;
    virtualItems.forEach((vi) => {
      animatedItemsRef.current.add(String(vi.key));
    });
  }

  return (
    <div
      ref={listRef}
      data-virtualized-timeline
      className="bg-transparent"
      style={{
        // OFFICIAL PATTERN: Always use height, not minHeight
        // getTotalSize() updates as items are measured, so height naturally grows
        // Using minHeight caused layout recalculations when streaming stopped
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
            ref={measureElement}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              // NO height set - let content determine height for dynamic measurement
              // measureElement will capture actual height and update virtualItem.size
              transform: `translateY(${virtualItem.start - virtualizer.options.scrollMargin}px)`,
            }}
          >
            {renderTimelineItemContent(item, virtualItem.index)}
          </div>
        );
      })}
    </div>
  );
}
