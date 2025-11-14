'use client';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';

import type { FeedbackType } from '@/api/core/enums';
import { AnalysisStatuses } from '@/api/core/enums';
import type { ChatMessage, ChatParticipant, ChatThread, ModeratorAnalysisPayload } from '@/api/routes/chat/schema';
import { AvatarGroup } from '@/components/chat/avatar-group';
import { ChatDeleteDialog } from '@/components/chat/chat-delete-dialog';
import { ChatInput } from '@/components/chat/chat-input';
import { ChatThreadActions } from '@/components/chat/chat-thread-actions';
import { ConversationModeModal } from '@/components/chat/conversation-mode-modal';
import { ModelSelectionModal } from '@/components/chat/model-selection-modal';
import { clearTriggeredAnalysesForRound } from '@/components/chat/moderator/moderator-analysis-stream';
import { StreamingParticipantsLoader } from '@/components/chat/streaming-participants-loader';
import { useThreadHeader } from '@/components/chat/thread-header-context';
import { ThreadTimeline } from '@/components/chat/thread-timeline';
import { UnifiedErrorBoundary } from '@/components/chat/unified-error-boundary';
import { UnifiedQuotaWarning } from '@/components/chat/unified-quota-warning';
import { WebSearchToggle } from '@/components/chat/web-search-toggle';
import { useChatStore } from '@/components/providers/chat-store-provider';
import { Button } from '@/components/ui/button';
import { useUsageStatsQuery } from '@/hooks/queries';
import { useCustomRolesQuery, useThreadChangelogQuery, useThreadFeedbackQuery } from '@/hooks/queries/chat';
import { useModelsQuery } from '@/hooks/queries/models';
import type { TimelineItem } from '@/hooks/utils';
import {
  useBoolean,
  useChatScroll,
  useFlowLoading,
  useThreadTimeline,
} from '@/hooks/utils';
import type { ChatModeId } from '@/lib/config/chat-modes';
import { getChatModeById } from '@/lib/config/chat-modes';
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

/**
 * ✅ FIX: Memoize ChatThreadActions JSX to prevent infinite render loops
 *
 * Problem: page.tsx creates new Date objects every render → thread object always new reference →
 * useEffect runs constantly → setThreadActions() with new JSX → Button refs reset → infinite loop
 *
 * Solution: Only depend on primitive values that ChatThreadActions actually needs
 * ChatThreadActions needs: thread.id, thread.title, thread.isPublic, slug
 */
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

  // ✅ Extract only the primitive values needed by ChatThreadActions
  // This prevents recreation when Date objects change but data doesn't
  const threadId = thread.id;
  const threadTitle = thread.title;
  const isPublic = thread.isPublic;

  // ✅ Memoize the actions JSX with only primitive deps
  const threadActions = useMemo(
    () => (
      <ChatThreadActions
        thread={thread}
        slug={slug}
        onDeleteClick={onDeleteClick}
      />
    ),
    // Only depend on primitive values that actually change
    // thread object excluded: Date objects recreated each render but data unchanged
    // threadId/threadTitle/isPublic track the actual changes we care about
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [threadId, threadTitle, isPublic, slug, onDeleteClick],
  );

  useEffect(() => {
    setThreadTitle(threadTitle);
    setThreadActions(threadActions);
  }, [threadTitle, threadActions, setThreadTitle, setThreadActions]);
}

export default function ChatThreadScreen({
  thread,
  participants,
  initialMessages,
  slug,
  user,
}: ChatThreadScreenProps) {
  const queryClient = useQueryClient();
  const t = useTranslations('chat');
  const isDeleteDialogOpen = useBoolean(false);
  const isModeModalOpen = useBoolean(false);
  const isModelModalOpen = useBoolean(false);

  // ✅ useBoolean now returns stable callbacks via useCallback
  useThreadHeaderUpdater({
    thread,
    slug,
    onDeleteClick: isDeleteDialogOpen.onTrue,
  });

  // Query for models and custom roles (for modals)
  const { data: modelsData } = useModelsQuery();
  const { data: customRolesData } = useCustomRolesQuery(isModelModalOpen.value);
  const { data: statsData } = useUsageStatsQuery();
  const messages = useChatStore(s => s.messages);
  const isStreaming = useChatStore(s => s.isStreaming);
  const currentParticipantIndex = useChatStore(s => s.currentParticipantIndex);
  const retryRound = useChatStore(s => s.retry);
  const stopStreaming = useChatStore(s => s.stop);
  const setOnRetry = useChatStore(s => s.setOnRetry);
  const contextParticipants = useChatStore(s => s.participants);
  const preSearches = useChatStore(s => s.preSearches);

  // ✅ ZUSTAND V5 PATTERN: Use useShallow for object selectors to prevent re-renders
  // Object selectors without useShallow create new references each render causing infinite loops
  const state = {
    flags: useChatStore(useShallow(s => ({
      hasInitiallyLoaded: s.hasInitiallyLoaded,
      isRegenerating: s.isRegenerating,
      isCreatingAnalysis: s.isCreatingAnalysis,
      isWaitingForChangelog: s.isWaitingForChangelog,
      hasPendingConfigChanges: s.hasPendingConfigChanges,
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
    setRegeneratingRoundNumber: s.setRegeneratingRoundNumber,
    setPendingMessage: s.setPendingMessage,
    setExpectedParticipantIds: s.setExpectedParticipantIds,
    setStreamingRoundNumber: s.setStreamingRoundNumber,
    setCurrentRoundNumber: s.setCurrentRoundNumber,
    setHasSentPendingMessage: s.setHasSentPendingMessage,
    resetThreadState: s.resetThreadState,
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
  const pendingFeedback = useChatStore(s => s.pendingFeedback);
  // ✅ FIX: Keep feedback query always enabled so it refetches on page refresh
  // Previously disabled after initial load, preventing feedback from reloading
  const { data: feedbackData, isSuccess: feedbackSuccess } = useThreadFeedbackQuery(thread.id, true);

  // Feedback actions hook
  const feedbackActions = useFeedbackActions({ threadId: thread.id });

  // Refs for input container (used by recommended actions hook)
  const inputContainerRef = useRef<HTMLDivElement | null>(null);

  // ✅ FIX: Track initial mount to prevent state reset on page refresh
  // resetThreadState() clears flags and tracking state (but preserves analyses/messages)
  // We only want to reset when navigating between threads, not on initial hydration
  // The orchestrator now runs immediately on mount to sync prefetched analyses
  const isInitialMount = useRef(true);

  // ✅ FIX: Track last loaded feedback to prevent infinite loops
  const lastLoadedFeedbackRef = useRef<string>('');

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

  // Load feedback from server (syncs on mount and after refetch)
  // ✅ FIX: Use ref to prevent infinite loops - only load if data actually changed
  useEffect(() => {
    if (feedbackSuccess && feedbackData) {
      const feedbackArray = feedbackData.success && Array.isArray(feedbackData.data) ? feedbackData.data : [];
      // Create stable key from feedback data to detect changes
      const feedbackKey = feedbackArray.map(f => `${f.roundNumber}:${f.feedbackType}`).join(',');

      // Only load if data changed
      if (feedbackKey !== lastLoadedFeedbackRef.current) {
        lastLoadedFeedbackRef.current = feedbackKey;
        feedbackActions.loadFeedback(feedbackArray);
      }
    }
  }, [feedbackData, feedbackSuccess, feedbackActions]);

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

  // ✅ SAFETY MECHANISM: Auto-complete stuck analyses after timeout
  // Prevents analyses stuck at 'streaming' from blocking new rounds
  // ✅ Enum Pattern: Use AnalysisStatuses constants instead of string literals
  useEffect(() => {
    const ANALYSIS_TIMEOUT_MS = 90000; // 90 seconds
    const stuckAnalyses = analyses.filter((analysis) => {
      // ✅ Enum Pattern: Use AnalysisStatuses.STREAMING constant
      if (analysis.status !== AnalysisStatuses.STREAMING)
        return false;
      const createdTime = analysis.createdAt instanceof Date
        ? analysis.createdAt.getTime()
        : new Date(analysis.createdAt).getTime();
      const elapsed = Date.now() - createdTime;
      return elapsed > ANALYSIS_TIMEOUT_MS;
    });

    if (stuckAnalyses.length > 0) {
      stuckAnalyses.forEach((analysis) => {
        // ✅ Enum Pattern: Use AnalysisStatuses.COMPLETE constant
        // Mark as complete even without data to unblock the UI
        updateAnalysisStatus(analysis.roundNumber, AnalysisStatuses.COMPLETE);
      });
    }

    // Check every 10 seconds
    const interval = setInterval(() => {
      const currentStuck = analyses.filter((analysis) => {
        // ✅ Enum Pattern: Use AnalysisStatuses.STREAMING constant
        if (analysis.status !== AnalysisStatuses.STREAMING)
          return false;
        const createdTime = analysis.createdAt instanceof Date
          ? analysis.createdAt.getTime()
          : new Date(analysis.createdAt).getTime();
        const elapsed = Date.now() - createdTime;
        return elapsed > ANALYSIS_TIMEOUT_MS;
      });

      if (currentStuck.length > 0) {
        currentStuck.forEach((analysis) => {
          // ✅ Enum Pattern: Use AnalysisStatuses.COMPLETE constant
          updateAnalysisStatus(analysis.roundNumber, AnalysisStatuses.COMPLETE);
        });
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [analyses, updateAnalysisStatus]);

  // ✅ FIX: Declare selectedMode early so it can be used in useScreenInitialization
  const selectedMode = useChatStore(s => s.selectedMode);

  // ✅ REMOVED: Redundant hasInitiallyLoaded effect
  // Previously set hasInitiallyLoaded when changelog + feedback queries completed
  // Now set unconditionally in thread.id effect (line 331) to enable orchestrator immediately
  // Orchestrator's enablement no longer depends on hasInitiallyLoaded, allowing prefetch hydration

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
    // ✅ CRITICAL FIX: Enable orchestrator immediately on mount to hydrate prefetched analyses
    // Previously: Waiting for hasInitiallyLoaded prevented prefetched data from syncing to store
    // On page refresh: Server prefetches analyses → query cache populated → orchestrator disabled
    // Result: Prefetched analyses never appeared in UI until orchestrator enabled later
    // Solution: Enable orchestrator immediately, only disable during active streaming/regeneration
    // The orchestrator's merge logic (analysis-orchestrator.ts) handles both:
    // 1. Initial hydration: Syncs prefetched analyses from query cache to store
    // 2. Real-time updates: Syncs new analyses as they're created/completed
    enableOrchestrator: !isStreaming && !state.flags.isRegenerating,
    // ✅ REMOVED: Analysis callbacks (onBeforeAnalysisCreate, onAfterAnalysisCreate, onAllParticipantsFailed)
    // These are now handled automatically by store subscriptions in store.ts
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

  // Prepare data for ModelSelectionModal
  const allEnabledModels = useMemo(() => modelsData?.data?.items || [], [modelsData?.data?.items]);
  const customRoles = useMemo(() => customRolesData?.pages.flatMap(page =>
    (page?.success && page.data?.items) ? page.data.items : [],
  ) || [], [customRolesData?.pages]);

  const userTierInfo = useMemo(() => {
    const userTierConfig = modelsData?.data?.user_tier_config || {
      tier: 'free' as const,
      tier_name: 'Free',
      max_models: 2,
      can_upgrade: true,
    };

    return {
      tier_name: userTierConfig.tier_name,
      max_models: userTierConfig.max_models,
      current_tier: userTierConfig.tier,
      can_upgrade: userTierConfig.can_upgrade,
    };
  }, [modelsData?.data?.user_tier_config]);

  // Create orderedModels for ModelSelectionModal
  const orderedModels = useMemo(() => {
    if (allEnabledModels.length === 0)
      return [];

    const selectedModels = selectedParticipants
      .sort((a, b) => a.priority - b.priority)
      .flatMap((p, index) => {
        const model = allEnabledModels.find(m => m.id === p.modelId);
        return model ? [{ model, participant: p, order: index }] : [];
      });

    const selectedIds = new Set(selectedParticipants.map(p => p.modelId));
    const unselectedModels = allEnabledModels
      .filter(m => !selectedIds.has(m.id))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((m, index) => ({ model: m, participant: null, order: selectedModels.length + index }));

    return [...selectedModels, ...unselectedModels];
  }, [selectedParticipants, allEnabledModels]);

  // Form actions hook
  const formActions = useChatFormActions();

  // Thread-specific actions (participant sync, message refetch, pending message orchestration)
  const threadActions = useThreadActions({
    slug,
    isRoundInProgress,
    isChangelogFetching,
  });

  // Modal callbacks for ConversationModeModal
  const handleModeSelect = useCallback((mode: ChatModeId) => {
    threadActions.handleModeChange(mode);
    isModeModalOpen.onFalse();
  }, [threadActions, isModeModalOpen]);

  // Modal callbacks for ModelSelectionModal
  const handleModelReorder = useCallback((reordered: typeof orderedModels) => {
    const reorderedParticipants = reordered
      .filter(om => om.participant !== null)
      .map((om, index) => ({ ...om.participant!, priority: index }));
    threadActions.handleParticipantsChange(reorderedParticipants);
  }, [threadActions]);

  const handleModelToggle = useCallback((modelId: string) => {
    const orderedModel = orderedModels.find(om => om.model.id === modelId);
    if (!orderedModel)
      return;

    if (orderedModel.participant) {
      // Remove participant
      const filtered = selectedParticipants.filter(p => p.id !== orderedModel.participant!.id);
      const reindexed = filtered.map((p, index) => ({ ...p, priority: index }));
      threadActions.handleParticipantsChange(reindexed);
    } else {
      // Add participant
      const newParticipant = {
        id: `participant-${Date.now()}`,
        modelId,
        role: '',
        priority: selectedParticipants.length,
      };
      threadActions.handleParticipantsChange([...selectedParticipants, newParticipant]);
    }
  }, [orderedModels, selectedParticipants, threadActions]);

  const handleModelRoleChange = useCallback((modelId: string, role: string, customRoleId?: string) => {
    const updated = selectedParticipants.map(p =>
      p.modelId === modelId ? { ...p, role, customRoleId } : p,
    );
    threadActions.handleParticipantsChange(updated);
  }, [selectedParticipants, threadActions]);

  const handleModelRoleClear = useCallback((modelId: string) => {
    const updated = selectedParticipants.map(p =>
      p.modelId === modelId ? { ...p, role: '', customRoleId: undefined } : p,
    );
    threadActions.handleParticipantsChange(updated);
  }, [selectedParticipants, threadActions]);

  // Unified scroll management using useChatScroll hook
  const { scrolledToAnalysesRef } = useChatScroll({
    messages,
    analyses,
    isStreaming,
    scrollContainerId: 'chat-scroll-container',
    enableNearBottomDetection: true,
  });

  // Streaming loader state calculation
  const { showLoader, loadingDetails } = useFlowLoading({ mode: 'thread' });
  const isAnalyzing = loadingDetails.isStreamingAnalysis;

  // Get setSelectedMode and setEnableWebSearch for thread initialization
  const setSelectedMode = useChatStore(s => s.setSelectedMode);
  const setEnableWebSearch = useChatStore(s => s.setEnableWebSearch);

  // Get web search toggle state from store (form state, not DB)
  const enableWebSearch = useChatStore(s => s.enableWebSearch);

  // Check message quota (thread screen sends messages in existing threads)
  const isQuotaExceeded = statsData?.success ? statsData.data.messages.remaining === 0 : false;

  // AI SDK v5 Pattern: Initialize thread on mount and when thread ID changes
  // Following crash course Exercise 01.07, 04.02, 04.03:
  // - Server provides initialMessages via props
  // - Call initializeThread once when thread.id changes
  // - useChat handles state management from there
  // Reset state on thread change
  useEffect(() => {
    // ✅ FIX: Don't reset on initial mount to preserve orchestrator state
    // Only reset when navigating between different threads
    // resetThreadState() clears flags and tracking (preserves analyses/messages)
    // Orchestrator runs immediately on mount to sync prefetched analyses from query cache
    if (!isInitialMount.current) {
      actions.resetThreadState();
      // ✅ FIX: Reset feedback ref when navigating to different thread
      lastLoadedFeedbackRef.current = '';
    }
    isInitialMount.current = false;

    scrolledToAnalysesRef.current.clear();

    if (thread?.mode) {
      setSelectedMode(thread.mode as ChatModeId);
    }

    setEnableWebSearch(thread.enableWebSearch || false);

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
            className="container max-w-3xl mx-auto px-3 sm:px-4 md:px-6 pt-0 pb-32 sm:pb-36 flex-1"
          >
            <ThreadTimeline
              timelineItems={messagesWithAnalysesAndChangelog}
              scrollContainerId="chat-scroll-container"
              user={user}
              participants={contextParticipants}
              threadId={thread.id}
              isStreaming={isStreaming}
              currentParticipantIndex={currentParticipantIndex}
              currentStreamingParticipant={
                isStreaming && contextParticipants[currentParticipantIndex]
                  ? contextParticipants[currentParticipantIndex]
                  : null
              }
              streamingRoundNumber={streamingRoundNumber}
              feedbackByRound={new Map(Array.from(feedbackByRound.entries()).filter(([, value]) => value !== null) as Array<[number, FeedbackType]>)}
              pendingFeedback={pendingFeedback}
              getFeedbackHandler={getFeedbackHandler}
              onAnalysisStreamStart={(roundNumber) => {
                updateAnalysisStatus(roundNumber, 'streaming');

                // ✅ Invalidate usage quota immediately when analysis streaming starts
                queryClient.invalidateQueries({ queryKey: queryKeys.usage.stats() });
              }}
              onAnalysisStreamComplete={(roundNumber, completedData) => {
                // ✅ FIX: Update store with completed analysis (includes status update to 'complete')
                if (completedData) {
                  updateAnalysisData(
                    roundNumber,
                    completedData as ModeratorAnalysisPayload,
                  );
                } else {
                  // ✅ CRITICAL FIX: Handle error case where no data returned
                  // Mark analysis as failed to show error badge and unblock UI
                  // This happens when streaming fails with validation errors, network errors, etc.
                  // ✅ Enum Pattern: Use AnalysisStatuses.FAILED constant
                  updateAnalysisStatus(roundNumber, AnalysisStatuses.FAILED);
                }

                // ✅ PROPER FIX: Don't invalidate immediately - let orchestrator handle merge
                // The orchestrator's merge logic prefers higher-priority client status
                // ('complete' priority 3 > 'streaming' priority 2)
                // Re-enabling the orchestrator below will trigger natural data refresh
                // This eliminates race condition with server DB commit
              }}
              onActionClick={recommendedActions.handleActionClick}
              onRetry={retryRound}
              preSearches={preSearches}
            />

            {showLoader && (
              <div className="mt-8 sm:mt-12">
                <StreamingParticipantsLoader
                  participants={contextParticipants.map(p => ({
                    id: p.id,
                    modelId: p.modelId,
                    role: p.role,
                    customRoleId: p.customRoleId ?? undefined,
                    priority: p.priority,
                    settings: p.settings ?? undefined,
                  }))}
                  currentParticipantIndex={currentParticipantIndex}
                  isAnalyzing={isAnalyzing}
                />
              </div>
            )}
          </div>
          <div
            ref={inputContainerRef}
            className="sticky bottom-0 z-50 bg-gradient-to-t from-background via-background to-transparent pt-4 sm:pt-6 pb-3 sm:pb-4 mt-auto"
          >
            <div className="container max-w-3xl mx-auto px-3 sm:px-4 md:px-6">
              <UnifiedQuotaWarning checkType="messages" />
              <ChatInput
                value={inputValue}
                onChange={setInputValue}
                onSubmit={handlePromptSubmit}
                status={isRoundInProgress ? 'submitted' : 'ready'}
                onStop={stopStreaming}
                placeholder={isQuotaExceeded ? t('chat.input.placeholderQuotaExceeded') : t('chat.input.placeholder')}
                disabled={isQuotaExceeded}
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
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isRoundInProgress}
                      onClick={isModelModalOpen.onTrue}
                      className="h-9 rounded-2xl gap-1.5 text-xs relative px-3"
                    >
                      <span className="hidden xs:inline sm:inline">{t('models.aiModels')}</span>
                      {selectedParticipants.length > 0 && (
                        <AvatarGroup
                          participants={selectedParticipants}
                          allModels={allEnabledModels}
                          maxVisible={3}
                          size="sm"
                        />
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isRoundInProgress}
                      onClick={isModeModalOpen.onTrue}
                      className="h-9 rounded-2xl gap-1.5 text-xs relative px-3"
                    >
                      {(() => {
                        const currentMode = getChatModeById(selectedMode || (thread.mode as ChatModeId));
                        const ModeIcon = currentMode?.icon;
                        return (
                          <>
                            {ModeIcon && <ModeIcon className="size-4" />}
                            <span className="hidden xs:inline sm:inline">
                              {currentMode?.label || t('modes.mode')}
                            </span>
                          </>
                        );
                      })()}
                    </Button>
                    <WebSearchToggle
                      enabled={enableWebSearch}
                      onToggle={threadActions.handleWebSearchToggle}
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
      <ConversationModeModal
        open={isModeModalOpen.value}
        onOpenChange={isModeModalOpen.setValue}
        selectedMode={selectedMode || (thread.mode as ChatModeId)}
        onModeSelect={handleModeSelect}
      />
      <ModelSelectionModal
        open={isModelModalOpen.value}
        onOpenChange={isModelModalOpen.setValue}
        orderedModels={orderedModels}
        onReorder={handleModelReorder}
        allParticipants={selectedParticipants}
        customRoles={customRoles}
        onToggle={handleModelToggle}
        onRoleChange={handleModelRoleChange}
        onClearRole={handleModelRoleClear}
        selectedCount={selectedParticipants.length}
        maxModels={userTierInfo.max_models}
        userTierInfo={userTierInfo}
      />
    </>
  );
}
