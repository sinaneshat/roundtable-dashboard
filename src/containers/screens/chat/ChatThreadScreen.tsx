'use client';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';

import type { FeedbackType } from '@/api/core/enums';
import { AnalysisStatuses } from '@/api/core/enums';
import type { ChatMessage, ChatParticipant, ChatThread } from '@/api/routes/chat/schema';
import { ChatDeleteDialog } from '@/components/chat/chat-delete-dialog';
import { ChatInput } from '@/components/chat/chat-input';
import { ChatInputToolbarMenu } from '@/components/chat/chat-input-toolbar-menu';
import { ChatThreadActions } from '@/components/chat/chat-thread-actions';
import { ConversationModeModal } from '@/components/chat/conversation-mode-modal';
import type { OrderedModel } from '@/components/chat/model-item';
import { ModelSelectionModal } from '@/components/chat/model-selection-modal';
import { useThreadHeader } from '@/components/chat/thread-header-context';
import { ThreadTimeline } from '@/components/chat/thread-timeline';
import { UnifiedErrorBoundary } from '@/components/chat/unified-error-boundary';
import { UnifiedLoadingIndicator } from '@/components/chat/unified-loading-indicator';
import { useChatStore } from '@/components/providers/chat-store-provider';
import { useCustomRolesQuery, useThreadChangelogQuery, useThreadFeedbackQuery } from '@/hooks/queries/chat';
import { useModelsQuery } from '@/hooks/queries/models';
import type { TimelineItem } from '@/hooks/utils';
import {
  useBoolean,
  useChatScroll,
  useFlowLoading,
  useSortedParticipants,
  useThreadTimeline,
  useVisualViewportPosition,
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
  const messages = useChatStore(s => s.messages);
  const isStreaming = useChatStore(s => s.isStreaming);
  const currentParticipantIndex = useChatStore(s => s.currentParticipantIndex);
  const stopStreaming = useChatStore(s => s.stop);
  const contextParticipants = useChatStore(s => s.participants);
  const preSearches = useChatStore(s => s.preSearches);

  // ✅ CRITICAL FIX: Sort participants by priority before indexing
  // currentParticipantIndex is set based on priority-sorted array in use-multi-participant-chat.ts
  // So we must sort here to match that same ordering
  // ✅ REFACTOR: Use useSortedParticipants hook (single source of truth for priority sorting)
  const sortedContextParticipants = useSortedParticipants(contextParticipants);

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

  // Refs for input container (used by recommended actions hook + mobile keyboard positioning)
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
  const updateAnalysisError = useChatStore(s => s.updateAnalysisError);

  // ✅ SAFETY MECHANISM: Auto-complete stuck analyses after timeout
  // Prevents analyses stuck at 'streaming' from blocking new rounds
  // ✅ Enum Pattern: Use AnalysisStatuses constants instead of string literals
  // ✅ MEMORY LEAK FIX: Use ref to track interval and ensure cleanup
  const stuckAnalysisIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const ANALYSIS_TIMEOUT_MS = 90000; // 90 seconds

    // ✅ MEMORY LEAK FIX: Clear any existing interval before creating new one
    // Prevents interval accumulation if effect re-runs
    if (stuckAnalysisIntervalRef.current) {
      clearInterval(stuckAnalysisIntervalRef.current);
      stuckAnalysisIntervalRef.current = null;
    }

    const checkStuckAnalyses = () => {
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
    };

    // Check immediately on mount
    checkStuckAnalyses();

    // Check every 10 seconds
    stuckAnalysisIntervalRef.current = setInterval(checkStuckAnalyses, 10000);

    return () => {
      // ✅ MEMORY LEAK FIX: Always clear interval on cleanup
      if (stuckAnalysisIntervalRef.current) {
        clearInterval(stuckAnalysisIntervalRef.current);
        stuckAnalysisIntervalRef.current = null;
      }
    };
  }, [analyses, updateAnalysisStatus]);

  // ✅ FIX: Declare selectedMode early so it can be used in useScreenInitialization
  const selectedMode = useChatStore(s => s.selectedMode);

  // ✅ REMOVED: Redundant hasInitiallyLoaded effect
  // Previously set hasInitiallyLoaded when changelog + feedback queries completed
  // Now set unconditionally in thread.id effect (line 331) to enable orchestrator immediately
  // Orchestrator's enablement no longer depends on hasInitiallyLoaded, allowing prefetch hydration

  // Message refetch and pending message send now handled by useThreadActions hook

  // ✅ CRITICAL FIX: Only disable orchestrator during regeneration
  // Pre-search orchestrator MUST continue polling during participant streaming
  // to detect and sync newly created pre-searches for round 1+
  //
  // BUG FIX: Previously disabled orchestrator when isStreaming=true, preventing
  // round 1+ pre-searches from syncing to store. Backend creates PENDING pre-search
  // during streaming (streaming.handler.ts:166-173) but orchestrator was disabled.
  //
  // CORRECT FLOW:
  // 1. User sends round 1+ message
  // 2. Participants begin streaming (isStreaming=true)
  // 3. Backend creates PENDING pre-search (streaming.handler.ts:166-173)
  // 4. Query invalidated (chat-store-provider.tsx:454-458)
  // 5. Orchestrator MUST poll to sync new pre-search to store
  // 6. PreSearchCard renders with new pre-search
  // 7. Pre-search executes: PENDING → STREAMING → COMPLETE
  //
  // Analysis orchestrator handles analyses separately (different polling intervals)
  const hasStreamingAnalysis = analyses.some(
    a => a.status === AnalysisStatuses.PENDING || a.status === AnalysisStatuses.STREAMING,
  );

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
    // Solution: Enable orchestrator immediately, only disable during regeneration or analysis streaming
    // The orchestrator's merge logic (analysis-orchestrator.ts) handles both:
    // 1. Initial hydration: Syncs prefetched analyses from query cache to store
    // 2. Real-time updates: Syncs new analyses as they're created/completed
    // ✅ REMOVED: !isStreaming and !hasActivePreSearch checks - orchestrator must poll during streaming
    enableOrchestrator: (
      !state.flags.isRegenerating
      && !hasStreamingAnalysis
    ),
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
  const modelOrder = useChatStore(s => s.modelOrder);
  const setModelOrder = useChatStore(s => s.setModelOrder);

  // Prepare data for ModelSelectionModal
  const allEnabledModels = useMemo(() => modelsData?.data?.items || [], [modelsData?.data?.items]);

  // Initialize model order when models first load
  useEffect(() => {
    if (allEnabledModels.length > 0 && modelOrder.length === 0) {
      setModelOrder(allEnabledModels.map(m => m.id));
    }
  }, [allEnabledModels, modelOrder.length, setModelOrder]);
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
  const orderedModels = useMemo((): OrderedModel[] => {
    if (allEnabledModels.length === 0)
      return [];

    // Create maps for quick lookup
    const participantMap = new Map(
      selectedParticipants.map(p => [p.modelId, p]),
    );
    const modelMap = new Map(allEnabledModels.map(m => [m.id, m]));

    // Use modelOrder to determine sequence, fallback to allEnabledModels order
    const orderedIds = modelOrder.length > 0 ? modelOrder : allEnabledModels.map(m => m.id);

    return orderedIds
      .map((modelId) => {
        const model = modelMap.get(modelId);
        if (!model)
          return null;
        return {
          model,
          participant: participantMap.get(modelId) || null,
          order: orderedIds.indexOf(modelId),
        };
      })
      .filter(Boolean) as typeof orderedModels;
  }, [selectedParticipants, allEnabledModels, modelOrder]);

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
    // Update visual order of all models
    const newModelOrder = reordered.map(om => om.model.id);
    setModelOrder(newModelOrder);

    // Update participant priorities based on new visual order
    const reorderedParticipants = reordered
      .filter(om => om.participant !== null)
      .map((om, index) => ({ ...om.participant!, priority: index }));
    threadActions.handleParticipantsChange(reorderedParticipants);
  }, [threadActions, setModelOrder]);

  const handleModelToggle = useCallback((modelId: string) => {
    const orderedModel = orderedModels.find(om => om.model.id === modelId);
    if (!orderedModel)
      return;

    if (orderedModel.participant) {
      // Remove participant - update priorities for remaining participants
      const filtered = selectedParticipants.filter(p => p.id !== orderedModel.participant!.id);
      // ✅ FIX: Sort by visual order, then reindex priorities to 0, 1, 2, ...
      // BUG FIX: Previously used modelOrder.indexOf() which gave model list position (21, 25, 29)
      // instead of selection order (0, 1, 2). This caused backend to create participants with
      // wrong priorities, leading to duplicate participants when priorities were reindexed later.
      const sortedByVisualOrder = filtered.sort((a, b) => {
        const aIdx = modelOrder.indexOf(a.modelId);
        const bIdx = modelOrder.indexOf(b.modelId);
        return aIdx - bIdx;
      });
      const reindexed = sortedByVisualOrder.map((p, index) => ({ ...p, priority: index }));
      threadActions.handleParticipantsChange(reindexed);
    } else {
      // Add participant
      const newParticipant = {
        id: `participant-${Date.now()}`,
        modelId,
        role: '',
        priority: selectedParticipants.length, // Temp priority, will be reindexed below
      };
      // ✅ FIX: Sort by visual order, then reindex priorities to 0, 1, 2, ...
      const updated = [...selectedParticipants, newParticipant].sort((a, b) => {
        const aIdx = modelOrder.indexOf(a.modelId);
        const bIdx = modelOrder.indexOf(b.modelId);
        return aIdx - bIdx;
      });
      const reindexed = updated.map((p, index) => ({ ...p, priority: index }));
      threadActions.handleParticipantsChange(reindexed);
    }
  }, [orderedModels, selectedParticipants, threadActions, modelOrder]);

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
  // bottomOffset accounts for: sticky input (pt-10 + ~80px input) + shadow gradient (h-8) + bottom margin (16px)
  // ✅ FIX: Removed preSearches - auto-scroll only during participant streaming
  const { scrolledToAnalysesRef } = useChatScroll({
    messages,
    analyses,
    isStreaming,
    scrollContainerId: 'main-scroll-container',
    enableNearBottomDetection: true,
    currentParticipantIndex,
    bottomOffset: 180,
  });

  // Streaming loader state calculation
  const { showLoader, loadingDetails } = useFlowLoading({ mode: 'thread' });

  // ✅ FIX: Comprehensive input blocking check
  // Block all interactions when the 3-dot matrix loading indicator is visible
  const isInputBlocked = isRoundInProgress || showLoader;

  // Visual viewport positioning for mobile keyboard handling
  // Returns bottom offset to adjust for keyboard (0 when no keyboard, >0 when keyboard open)
  const keyboardOffset = useVisualViewportPosition();

  // Get setSelectedMode and setEnableWebSearch for thread initialization
  const setSelectedMode = useChatStore(s => s.setSelectedMode);
  const setEnableWebSearch = useChatStore(s => s.setEnableWebSearch);

  // Get web search toggle state from store (form state, not DB)
  const enableWebSearch = useChatStore(s => s.enableWebSearch);

  // ✅ CRITICAL FIX: Track last synced enableWebSearch to prevent stale prop overwrite
  // When user toggles web search and PATCH completes:
  // 1. hasPendingConfigChanges flips to false
  // 2. But thread prop is still stale SSR data (enableWebSearch: false)
  // 3. Without this ref, the sync effect would overwrite form state with stale value
  // This ref ensures we only sync when thread prop actually changes, not when flags change
  const lastSyncedEnableWebSearchRef = useRef<boolean | undefined>(undefined);

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

    // Sync enableWebSearch and update ref for change detection
    const threadEnableWebSearch = thread.enableWebSearch || false;
    setEnableWebSearch(threadEnableWebSearch);
    lastSyncedEnableWebSearchRef.current = threadEnableWebSearch;

    // ✅ CRITICAL FIX: Set showInitialUI to false on thread screen
    // If we navigated from overview screen, showInitialUI would be true
    // This causes the timeline to not render and analysis requests to get cancelled
    actions.setShowInitialUI(false);
    actions.setHasInitiallyLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.id]);

  // ✅ CRITICAL FIX: Sync form state when thread properties update
  // When web search toggle changes mid-conversation and PATCH completes,
  // the thread object updates but form state stays stale
  // This causes subsequent rounds to use old form state instead of DB state
  //
  // ✅ BUG FIX: Use ref to track last synced enableWebSearch to prevent stale overwrite
  // PROBLEM: When user toggles web search and PATCH completes:
  // 1. hasPendingConfigChanges flips to false
  // 2. thread prop is still stale SSR data (enableWebSearch: false)
  // 3. Effect would overwrite correct form state (true) with stale value (false)
  //
  // SOLUTION: Only sync enableWebSearch when thread.enableWebSearch actually changes,
  // not when hasPendingConfigChanges changes. This preserves user's toggle until
  // the thread prop is actually updated (e.g., on page revalidation).
  useEffect(() => {
    // Skip if pending config changes (user is actively editing)
    if (state.flags.hasPendingConfigChanges) {
      return;
    }

    // Sync mode (always safe to sync)
    if (thread?.mode) {
      setSelectedMode(thread.mode as ChatModeId);
    }

    // ✅ CRITICAL: Only sync enableWebSearch if thread prop actually changed
    // This prevents overwriting form state when only hasPendingConfigChanges flipped
    const threadEnableWebSearch = thread.enableWebSearch || false;
    if (lastSyncedEnableWebSearchRef.current !== threadEnableWebSearch) {
      lastSyncedEnableWebSearchRef.current = threadEnableWebSearch;
      setEnableWebSearch(threadEnableWebSearch);
    }
    // Only sync when thread properties change, not on every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.enableWebSearch, thread.mode, state.flags.hasPendingConfigChanges]);

  // ✅ REMOVED: Virtualization removed, so streamingRoundNumber management not needed
  // Components stay mounted regardless of streaming state
  const handlePromptSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      // ✅ FIX: Include comprehensive guards to prevent double submission
      // - isInputBlocked: Streaming, analysis in progress, OR loading indicator visible
      // - pendingMessage: Message already queued for sending
      if (!inputValue.trim() || selectedParticipants.length === 0 || isInputBlocked || state.data.pendingMessage) {
        return;
      }
      await formActions.handleUpdateThreadAndSend(thread.id);
    },
    [inputValue, selectedParticipants, formActions, thread.id, isInputBlocked, state.data.pendingMessage],
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
        <div className="flex flex-col relative flex-1 min-h-full">
          <div
            className="container max-w-3xl mx-auto px-2 sm:px-4 md:px-6 pt-0 pb-4"
          >
            <ThreadTimeline
              timelineItems={messagesWithAnalysesAndChangelog}
              scrollContainerId="main-scroll-container"
              user={user}
              participants={contextParticipants}
              threadId={thread.id}
              isStreaming={isStreaming}
              currentParticipantIndex={currentParticipantIndex}
              currentStreamingParticipant={
                isStreaming && sortedContextParticipants[currentParticipantIndex]
                  ? sortedContextParticipants[currentParticipantIndex]
                  : null
              }
              streamingRoundNumber={streamingRoundNumber}
              feedbackByRound={new Map(Array.from(feedbackByRound.entries()).filter(([, value]) => value !== null) as Array<[number, FeedbackType]>)}
              pendingFeedback={pendingFeedback}
              getFeedbackHandler={getFeedbackHandler}
              onAnalysisStreamStart={(roundNumber) => {
                updateAnalysisStatus(roundNumber, AnalysisStatuses.STREAMING);

                // ✅ Invalidate usage quota immediately when analysis streaming starts
                queryClient.invalidateQueries({ queryKey: queryKeys.usage.stats() });
              }}
              onAnalysisStreamComplete={(roundNumber, completedData, error) => {
                // ✅ FIX: Update store with completed analysis (includes status update to 'complete')
                if (completedData) {
                  updateAnalysisData(
                    roundNumber,
                    completedData,
                  );
                } else {
                  // ✅ CRITICAL FIX: Preserve error message when analysis fails
                  // Use dedicated updateAnalysisError action to atomically update status + error
                  // Pattern: Handle unknown error type with type guard (established pattern from lib/utils/error-handling.ts)
                  const errorMessage = error instanceof Error
                    ? error.message
                    : 'Analysis failed. Please try again.';
                  updateAnalysisError(roundNumber, errorMessage);
                }

                // ✅ PROPER FIX: Don't invalidate immediately - let orchestrator handle merge
                // The orchestrator's merge logic prefers higher-priority client status
                // ('complete' priority 3 > 'streaming' priority 2)
                // Re-enabling the orchestrator below will trigger natural data refresh
                // This eliminates race condition with server DB commit
              }}
              onActionClick={recommendedActions.handleActionClick}
              preSearches={preSearches}
            />
          </div>

          {/* Unified loading indicator - sticky positioned above input */}
          <UnifiedLoadingIndicator
            showLoader={showLoader}
            loadingDetails={loadingDetails}
            preSearches={preSearches}
          />

          {/* Chat input - sticky at bottom, mt-auto pushes to bottom when content is small */}
          <div
            ref={inputContainerRef}
            className="sticky z-30 mt-auto bg-gradient-to-t from-background via-background to-transparent pt-10 relative"
            style={{ bottom: `${keyboardOffset + 16}px` }}
          >
            <div className="w-full max-w-3xl mx-auto px-2 sm:px-4 md:px-6">
              <ChatInput
                value={inputValue}
                onChange={setInputValue}
                onSubmit={handlePromptSubmit}
                status={isInputBlocked ? 'submitted' : 'ready'}
                onStop={stopStreaming}
                placeholder={t('input.placeholder')}
                participants={selectedParticipants}
                quotaCheckType="messages"
                onRemoveParticipant={isInputBlocked
                  ? undefined
                  : (participantId) => {
                      if (selectedParticipants.length <= 1)
                        return;
                      removeParticipant(participantId);
                      // ✅ REACT 19 PATTERN: Mark config changes
                      actions.setHasPendingConfigChanges(true);
                    }}
                toolbar={(
                  <ChatInputToolbarMenu
                    selectedParticipants={selectedParticipants}
                    allModels={allEnabledModels}
                    onOpenModelModal={isModelModalOpen.onTrue}
                    selectedMode={selectedMode || (thread.mode as ChatModeId)}
                    onOpenModeModal={isModeModalOpen.onTrue}
                    enableWebSearch={enableWebSearch}
                    onWebSearchToggle={threadActions.handleWebSearchToggle}
                    disabled={isInputBlocked}
                  />
                )}
              />
            </div>
            {/* Bottom fill - covers gap to screen bottom */}
            <div className="-z-10 absolute inset-x-0 top-full h-4 bg-background pointer-events-none" />
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
