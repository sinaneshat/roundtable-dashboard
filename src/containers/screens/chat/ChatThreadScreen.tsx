'use client';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';

import type { ChatMessage, ChatParticipant, ChatThread, ModeratorAnalysisPayload } from '@/api/routes/chat/schema';
import { ChatDeleteDialog } from '@/components/chat/chat-delete-dialog';
import { ChatInput } from '@/components/chat/chat-input';
import { ChatModeSelector } from '@/components/chat/chat-mode-selector';
import { ChatParticipantsList } from '@/components/chat/chat-participants-list';
import { ChatThreadActions } from '@/components/chat/chat-thread-actions';
import { clearTriggeredAnalysesForRound } from '@/components/chat/moderator/moderator-analysis-stream';
import { StreamingParticipantsLoader } from '@/components/chat/streaming-participants-loader';
import { useThreadHeader } from '@/components/chat/thread-header-context';
import { ThreadTimeline } from '@/components/chat/thread-timeline';
import { UnifiedErrorBoundary } from '@/components/chat/unified-error-boundary';
import { useChatStore } from '@/components/providers/chat-store-provider';
import { useThreadChangelogQuery, useThreadFeedbackQuery } from '@/hooks/queries/chat';
import type { TimelineItem } from '@/hooks/utils';
import {
  useBoolean,
  useChatScroll,
  useStreamingLoaderState,
  useThreadTimeline,
} from '@/hooks/utils';
import type { ChatModeId } from '@/lib/config/chat-modes';
import { queryKeys } from '@/lib/data/query-keys';
import { chatMessagesToUIMessages } from '@/lib/utils/message-transforms';
import {
  useChatFormActions,
  useFeedbackActions,
  useRecommendedActions,
  useScreenInitialization,
  useThreadActions,
} from '@/stores/chat';

type ChatThreadScreenProps = {
  thread: ChatThread;
  participants: ChatParticipant[];
  initialMessages: ChatMessage[];
  slug: string;
  user: {
    name: string;
    image: string | null;
  };
};
function useThreadHeaderUpdater({
  thread,
  slug,
  onDeleteClick,
}: {
  thread: ChatThread;
  slug: string;
  onDeleteClick: () => void;
}) {
  const { setThreadActions, setThreadTitle } = useThreadHeader();
  useEffect(() => {
    setThreadTitle(thread.title);
    setThreadActions(
      <ChatThreadActions
        thread={thread}
        slug={slug}
        onDeleteClick={onDeleteClick}
      />,
    );
  }, [thread, slug, onDeleteClick, setThreadTitle, setThreadActions]);
}
export default function ChatThreadScreen({
  thread,
  participants,
  initialMessages,
  slug,
  user,
}: ChatThreadScreenProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const t = useTranslations('chat');
  const isDeleteDialogOpen = useBoolean(false);
  useThreadHeaderUpdater({
    thread,
    slug,
    onDeleteClick: isDeleteDialogOpen.onTrue,
  });
  const messages = useChatStore(s => s.messages);
  const isStreaming = useChatStore(s => s.isStreaming);
  const currentParticipantIndex = useChatStore(s => s.currentParticipantIndex);
  const retryRound = useChatStore(s => s.retry);
  const stopStreaming = useChatStore(s => s.stop);
  const setOnRetry = useChatStore(s => s.setOnRetry);
  const contextParticipants = useChatStore(s => s.participants);

  // ✅ ZUSTAND V5 PATTERN: Use useShallow for object selectors to prevent re-renders
  // Object selectors without useShallow create new references each render causing infinite loops
  const state = {
    flags: useChatStore(useShallow(s => ({
      hasInitiallyLoaded: s.hasInitiallyLoaded,
      isRegenerating: s.isRegenerating,
      isCreatingAnalysis: s.isCreatingAnalysis,
      isWaitingForChangelog: s.isWaitingForChangelog,
      hasPendingConfigChanges: s.hasPendingConfigChanges,
      hasRefetchedMessages: s.hasRefetchedMessages,
    }))),
    data: useChatStore(useShallow(s => ({
      regeneratingRoundNumber: s.regeneratingRoundNumber,
      pendingMessage: s.pendingMessage,
      expectedParticipantIds: s.expectedParticipantIds,
      streamingRoundNumber: s.streamingRoundNumber,
      currentRoundNumber: s.currentRoundNumber,
    }))),
  };

  // ✅ ZUSTAND V5 PATTERN: Use useShallow for actions object to prevent re-renders
  const actions = useChatStore(useShallow(s => ({
    setShowInitialUI: s.setShowInitialUI,
    setHasInitiallyLoaded: s.setHasInitiallyLoaded,
    setIsRegenerating: s.setIsRegenerating,
    setIsCreatingAnalysis: s.setIsCreatingAnalysis,
    setIsWaitingForChangelog: s.setIsWaitingForChangelog,
    setHasPendingConfigChanges: s.setHasPendingConfigChanges,
    setHasRefetchedMessages: s.setHasRefetchedMessages,
    setRegeneratingRoundNumber: s.setRegeneratingRoundNumber,
    setPendingMessage: s.setPendingMessage,
    setExpectedParticipantIds: s.setExpectedParticipantIds,
    setStreamingRoundNumber: s.setStreamingRoundNumber,
    setCurrentRoundNumber: s.setCurrentRoundNumber,
    setHasSentPendingMessage: s.setHasSentPendingMessage,
    resetThreadState: s.resetThreadState,
    resetHookState: s.resetHookState,
    updateParticipants: s.updateParticipants,
    prepareForNewMessage: s.prepareForNewMessage,
    completeStreaming: s.completeStreaming,
    startRegeneration: s.startRegeneration,
    completeRegeneration: s.completeRegeneration,
  })));

  // ✅ CRITICAL FIX: Keep changelog query always enabled so it refetches when invalidated
  // Previously disabled after initial load, preventing real-time changelog updates
  const { data: changelogResponse, isFetching: isChangelogFetching } = useThreadChangelogQuery(thread.id, true);

  // ✅ Use changelog data directly from query instead of client state
  // This ensures real-time updates when the query is invalidated by mutations
  const changelog = useMemo(() => {
    if (!changelogResponse?.success) {
      return [];
    }
    const items = changelogResponse.data.items || [];
    const seen = new Set<string>();
    return items.filter((item) => {
      if (seen.has(item.id))
        return false;
      seen.add(item.id);
      return true;
    });
  }, [changelogResponse]);
  // Feedback management via store
  const feedbackByRound = useChatStore(s => s.feedbackByRound);
  const hasLoadedFeedback = useChatStore(s => s.hasLoadedFeedback);
  const pendingFeedback = useChatStore(s => s.pendingFeedback);
  const { data: feedbackData, isSuccess: feedbackSuccess } = useThreadFeedbackQuery(thread.id, !state.flags.hasInitiallyLoaded);

  // Feedback actions hook
  const feedbackActions = useFeedbackActions({ threadId: thread.id });

  // Refs for input container (used by recommended actions hook)
  const inputContainerRef = useRef<HTMLDivElement | null>(null);

  // Recommended actions hook (with scroll + config change tracking)
  const recommendedActions = useRecommendedActions({
    inputContainerRef,
    enableScroll: true,
    markConfigChanged: true,
  });

  // Transform initial messages once (memoized to prevent re-creation)
  // ✅ CRITICAL FIX: Pass participants to enrich messages with model metadata
  // This ensures backend messages are "complete" and never need participant lookups from current state
  const uiMessages = useMemo(() => chatMessagesToUIMessages(initialMessages, participants), [initialMessages, participants]);

  // Load feedback from server once
  useEffect(() => {
    if (!hasLoadedFeedback && feedbackSuccess && feedbackData) {
      const feedbackArray = feedbackData.success && Array.isArray(feedbackData.data) ? feedbackData.data : [];
      feedbackActions.loadFeedback(feedbackArray);
    }
  }, [feedbackData, feedbackSuccess, hasLoadedFeedback, feedbackActions]);

  // ✅ CRITICAL FIX: Refetch messages after initial load to catch any race condition
  // When navigating from overview screen, messages might still be saving to DB when SSR fetch happens
  // This one-time refetch ensures we get all messages even if there was a timing issue
  // See: ChatOverviewScreen.tsx redirect timing and message-persistence.service.ts
  // ✅ REACT 19 PATTERN: Use context state instead of scattered useState
  const { isCreatingAnalysis } = state.flags;

  // ✅ DISABLE EDITS: Disable participant/mode changes during entire round lifecycle
  // Round is in progress when participants are streaming OR analysis is being created
  const isRoundInProgress = isStreaming || isCreatingAnalysis;

  // Analyses from store (already deduplicated by orchestrator)
  const analyses = useChatStore(s => s.analyses);

  // Analysis actions
  const updateAnalysisData = useChatStore(s => s.updateAnalysisData);
  const updateAnalysisStatus = useChatStore(s => s.updateAnalysisStatus);
  const removePendingAnalysis = useChatStore(s => s.removeAnalysis);

  // ✅ FIX: Declare selectedMode early so it can be used in useScreenInitialization
  const selectedMode = useChatStore(s => s.selectedMode);

  useEffect(() => {
    if (!state.flags.hasInitiallyLoaded && changelogResponse && feedbackSuccess) {
      // ✅ REACT 19 PATTERN: Use actions helper for semantic state updates
      actions.setHasInitiallyLoaded(true);
    }
  }, [changelogResponse, feedbackSuccess, state.flags.hasInitiallyLoaded, actions]);

  // Message refetch and pending message send now handled by useThreadActions hook

  // Unified screen initialization with regeneration support
  useScreenInitialization({
    mode: 'thread',
    thread,
    participants,
    initialMessages: uiMessages,
    // ✅ FIX: Use selectedMode (current form state) if available, otherwise use thread.mode
    // This ensures analysis is created with the CURRENT mode, not the stale SSR mode
    chatMode: selectedMode || (thread.mode as ChatModeId),
    isRegeneration: state.data.regeneratingRoundNumber !== null,
    regeneratingRoundNumber: state.data.regeneratingRoundNumber,
    // ✅ CRITICAL FIX: Don't disable orchestrator during isCreatingAnalysis
    // Orchestrator must stay enabled to complete analysis streaming
    // Previously: disabling during analysis creation caused circular dependency where:
    // 1. Analysis starts → isCreatingAnalysis = true → orchestrator disabled
    // 2. Orchestrator can't complete streaming while disabled
    // 3. isCreatingAnalysis stuck at true → input permanently disabled after refresh
    enableOrchestrator: state.flags.hasInitiallyLoaded && !isStreaming && !state.flags.isRegenerating,
    onBeforeAnalysisCreate: () => {
      actions.setIsCreatingAnalysis(true);
    },
    onAfterAnalysisCreate: (roundNumber) => {
      // Router refresh for "New Conversation" threads (updates title in header)
      if (thread.title === 'New Conversation') {
        router.refresh();
      }

      // Complete regeneration if active
      if (state.data.regeneratingRoundNumber === roundNumber) {
        actions.completeRegeneration(roundNumber);
      }
      actions.setStreamingRoundNumber(null);
      actions.setIsCreatingAnalysis(false);

      // ✅ CRITICAL FIX: Do NOT invalidate query here!
      // Query invalidation moved to onStreamComplete to avoid race conditions.
      // Invalidating here causes refetch BEFORE analysis streaming completes,
      // leading to "Controller is already closed" errors and data loss.
    },
    onAllParticipantsFailed: (roundNumber) => {
      // Complete regeneration if active
      if (state.data.regeneratingRoundNumber === roundNumber) {
        actions.completeRegeneration(roundNumber);
      }
      actions.setStreamingRoundNumber(null);
    },
  });

  /**
   * SIMPLIFIED ROUND MANAGEMENT
   * - Backend provides round numbers in message metadata
   * - Frontend trusts backend as source of truth
   * - Removed complex client-side round tracking
   * - Round numbers extracted from messages using getRoundNumberFromMetadata()
   * ✅ REACT 19 PATTERN: Use context state and refs exclusively
   * Note: regeneratingRoundNumber accessed via state.data.regeneratingRoundNumber in useMemo deps
   */
  const { streamingRoundNumber } = state.data;

  // Form state from store (selectedMode declared earlier for useScreenInitialization)
  const selectedParticipants = useChatStore(s => s.selectedParticipants);
  const inputValue = useChatStore(s => s.inputValue);
  const setInputValue = useChatStore(s => s.setInputValue);
  const removeParticipant = useChatStore(s => s.removeParticipant);

  // Form actions hook
  const formActions = useChatFormActions();

  // Thread-specific actions (participant sync, message refetch, pending message orchestration)
  const threadActions = useThreadActions({
    slug,
    isRoundInProgress,
    isChangelogFetching,
  });

  // Unified scroll management using useChatScroll hook
  const { scrolledToAnalysesRef } = useChatScroll({
    messages,
    analyses,
    isStreaming,
    scrollContainerId: 'chat-scroll-container',
    enableNearBottomDetection: true,
  });

  // Streaming loader state calculation
  // Use contextParticipants (actual thread participants) not selectedParticipants (form state)
  const { showLoader, isAnalyzing } = useStreamingLoaderState({
    analyses,
    isStreaming,
    messages,
    selectedParticipants: contextParticipants.map(p => ({
      id: p.id,
      modelId: p.modelId,
      role: p.role,
      priority: p.priority,
    })),
  });

  // Get setSelectedMode for thread initialization
  const setSelectedMode = useChatStore(s => s.setSelectedMode);

  // AI SDK v5 Pattern: Initialize thread on mount and when thread ID changes
  // Following crash course Exercise 01.07, 04.02, 04.03:
  // - Server provides initialMessages via props
  // - Call initializeThread once when thread.id changes
  // - useChat handles state management from there
  // Reset state on thread change
  useEffect(() => {
    actions.resetThreadState();
    scrolledToAnalysesRef.current.clear();

    if (thread?.mode) {
      setSelectedMode(thread.mode as ChatModeId);
    }

    // ✅ CRITICAL FIX: Set showInitialUI to false on thread screen
    // If we navigated from overview screen, showInitialUI would be true
    // This causes the timeline to not render and analysis requests to get cancelled
    actions.setShowInitialUI(false);
    actions.setHasInitiallyLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.id]);

  // Register retry handler (stable, no infinite loop)
  useEffect(() => {
    setOnRetry(() => (roundNumber: number) => {
      // AI SDK v5 Pattern: Immediate state cleanup before streaming starts
      actions.startRegeneration(roundNumber);
      removePendingAnalysis(roundNumber);
      clearTriggeredAnalysesForRound(roundNumber);
      feedbackActions.clearRoundFeedback(roundNumber);
      actions.setStreamingRoundNumber(null);
    });

    return () => {
      setOnRetry(undefined);
    };
    // Only re-register when thread ID changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.id]);

  // ✅ REMOVED: Virtualization removed, so streamingRoundNumber management not needed
  // Components stay mounted regardless of streaming state
  const handlePromptSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!inputValue.trim() || selectedParticipants.length === 0) {
        return;
      }
      await formActions.handleUpdateThreadAndSend(thread.id);
    },
    [inputValue, selectedParticipants, formActions, thread.id],
  );
  const activeParticipants = contextParticipants;

  // Timeline grouping
  const messagesWithAnalysesAndChangelog: TimelineItem[] = useThreadTimeline({
    messages,
    analyses,
    changelog,
  });

  const getFeedbackHandler = feedbackActions.getFeedbackHandler;

  return (
    <>
      <UnifiedErrorBoundary context="chat">
        <div className="flex flex-col min-h-screen relative">
          <div
            id="chat-scroll-container"
            className="container max-w-3xl mx-auto px-4 sm:px-6 pt-0 pb-32 flex-1"
          >
            <ThreadTimeline
              timelineItems={messagesWithAnalysesAndChangelog}
              scrollContainerId="chat-scroll-container"
              user={user}
              participants={activeParticipants}
              threadId={thread.id}
              isStreaming={isStreaming}
              currentParticipantIndex={currentParticipantIndex}
              currentStreamingParticipant={
                isStreaming && activeParticipants[currentParticipantIndex]
                  ? activeParticipants[currentParticipantIndex]
                  : null
              }
              streamingRoundNumber={streamingRoundNumber}
              feedbackByRound={new Map([...feedbackByRound].filter(([, value]) => value !== null) as [number, 'like' | 'dislike'][])}
              pendingFeedback={pendingFeedback}
              getFeedbackHandler={getFeedbackHandler}
              onAnalysisStreamStart={(roundNumber) => {
                updateAnalysisStatus(roundNumber, 'streaming');

                // ✅ Invalidate usage quota immediately when analysis streaming starts
                queryClient.invalidateQueries({ queryKey: queryKeys.usage.stats() });
              }}
              onAnalysisStreamComplete={(roundNumber, completedData) => {
                if (completedData) {
                  updateAnalysisData(
                    roundNumber,
                    completedData as ModeratorAnalysisPayload,
                  );
                }

                queryClient.invalidateQueries({
                  queryKey: queryKeys.threads.analyses(thread.id),
                });
              }}
              onActionClick={recommendedActions.handleActionClick}
              onRetry={retryRound}
            />

            {showLoader && (
              <div className="mt-12">
                <StreamingParticipantsLoader
                  participants={contextParticipants.map(p => ({
                    id: p.id,
                    modelId: p.modelId,
                    role: p.role,
                    priority: p.priority,
                  }))}
                  currentParticipantIndex={currentParticipantIndex}
                  isAnalyzing={isAnalyzing}
                />
              </div>
            )}
          </div>
          <div
            ref={inputContainerRef}
            className="sticky bottom-0 z-50 bg-gradient-to-t from-background via-background to-transparent pt-6 pb-4 mt-auto"
          >
            <div className="container max-w-3xl mx-auto px-4 sm:px-6">
              <ChatInput
                value={inputValue}
                onChange={setInputValue}
                onSubmit={handlePromptSubmit}
                status={isRoundInProgress ? 'submitted' : 'ready'}
                onStop={stopStreaming}
                placeholder={t('input.placeholder')}
                participants={selectedParticipants}
                currentParticipantIndex={currentParticipantIndex}
                onRemoveParticipant={isRoundInProgress
                  ? undefined
                  : (participantId) => {
                      if (selectedParticipants.length <= 1)
                        return;
                      removeParticipant(participantId);
                      // ✅ REACT 19 PATTERN: Mark config changes
                      actions.setHasPendingConfigChanges(true);
                    }}
                toolbar={(
                  <>
                    <ChatParticipantsList
                      participants={selectedParticipants}
                      onParticipantsChange={threadActions.handleParticipantsChange}
                      isStreaming={isRoundInProgress}
                      disabled={isRoundInProgress}
                    />
                    <ChatModeSelector
                      selectedMode={selectedMode || (thread.mode as ChatModeId)}
                      onModeChange={threadActions.handleModeChange}
                      disabled={isRoundInProgress}
                    />
                  </>
                )}
              />
            </div>
          </div>
        </div>
      </UnifiedErrorBoundary>
      <ChatDeleteDialog
        isOpen={isDeleteDialogOpen.value}
        onOpenChange={isDeleteDialogOpen.setValue}
        threadId={thread.id}
        threadSlug={slug}
      />
    </>
  );
}
