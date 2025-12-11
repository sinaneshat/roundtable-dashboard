'use client';

/**
 * ChatView - Unified Chat Content Component
 *
 * Single source of truth for chat content rendering.
 * Used by both ChatOverviewScreen and ChatThreadScreen to ensure
 * consistent behavior, loading states, and round continuation flows.
 *
 * ARCHITECTURE:
 * - Reads all state from Zustand store (single source of truth)
 * - Handles message rendering via ThreadTimeline
 * - Manages analysis streaming and completion
 * - Provides unified input with toolbar and modals
 * - Consistent loading indicators and scroll behavior
 */

import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';

import type { ChatMode, FeedbackType } from '@/api/core/enums';
import { AnalysisStatuses, ChatModeSchema } from '@/api/core/enums';
import { ModeratorAnalysisPayloadSchema } from '@/api/routes/chat/schema';
import { ChatInput } from '@/components/chat/chat-input';
import { ChatInputToolbarMenu } from '@/components/chat/chat-input-toolbar-menu';
import { ChatScrollButton } from '@/components/chat/chat-scroll-button';
import { ConversationModeModal } from '@/components/chat/conversation-mode-modal';
import { ModelSelectionModal } from '@/components/chat/model-selection-modal';
import { ThreadTimeline } from '@/components/chat/thread-timeline';
import { UnifiedErrorBoundary } from '@/components/chat/unified-error-boundary';
import { useChatStore } from '@/components/providers/chat-store-provider';
import { useCustomRolesQuery, useThreadChangelogQuery, useThreadFeedbackQuery } from '@/hooks/queries/chat';
import { useModelsQuery } from '@/hooks/queries/models';
import type { TimelineItem, UseChatAttachmentsReturn } from '@/hooks/utils';
import {
  useBoolean,
  useChatScroll,
  useOrderedModels,
  useSortedParticipants,
  useThreadTimeline,
  useVisualViewportPosition,
} from '@/hooks/utils';
import { getDefaultChatMode } from '@/lib/config/chat-modes';
import { queryKeys } from '@/lib/data/query-keys';
import { getIncompatibleModelIds } from '@/lib/utils/file-capability';
import {
  AnalysisTimeouts,
  useChatFormActions,
  useFeedbackActions,
  useFlowLoading,
  useRecommendedActions,
  useThreadActions,
} from '@/stores/chat';

export type ChatViewProps = {
  /** Current user info for message display */
  user: {
    name: string;
    image: string | null;
  };
  /** Thread slug for navigation/actions (optional for overview before thread exists) */
  slug?: string;
  /** Screen mode - affects some behavior differences */
  mode: 'overview' | 'thread';
  /** Callback when form is submitted (for overview: creates thread, for thread: sends message) */
  onSubmit: (e: React.FormEvent) => Promise<void>;
  /** Chat attachments state from parent screen - ensures single source of truth */
  chatAttachments: UseChatAttachmentsReturn;
};

export function ChatView({
  user,
  slug,
  mode,
  onSubmit,
  chatAttachments,
}: ChatViewProps) {
  const queryClient = useQueryClient();
  const t = useTranslations('chat');

  // Modal state
  const isModeModalOpen = useBoolean(false);
  const isModelModalOpen = useBoolean(false);

  // ✅ SIMPLIFIED: Ref-based attachment click (no registration callback needed)
  const attachmentClickRef = useRef<(() => void) | null>(null);
  const handleAttachmentClick = useCallback(() => {
    attachmentClickRef.current?.();
  }, []);

  // ============================================================================
  // STORE STATE
  // ============================================================================

  const messages = useChatStore(s => s.messages);
  const isStreaming = useChatStore(s => s.isStreaming);
  const currentParticipantIndex = useChatStore(s => s.currentParticipantIndex);
  // ✅ AI SDK RESUME PATTERN: No stop selector - streams always complete
  const contextParticipants = useChatStore(s => s.participants);
  const preSearches = useChatStore(s => s.preSearches);
  const analyses = useChatStore(s => s.analyses);

  const { thread, createdThreadId } = useChatStore(
    useShallow(s => ({
      thread: s.thread,
      createdThreadId: s.createdThreadId,
    })),
  );

  const { streamingRoundNumber, isCreatingAnalysis, waitingToStartStreaming, isCreatingThread, pendingMessage, hasInitiallyLoaded } = useChatStore(
    useShallow(s => ({
      streamingRoundNumber: s.streamingRoundNumber,
      isCreatingAnalysis: s.isCreatingAnalysis,
      waitingToStartStreaming: s.waitingToStartStreaming,
      isCreatingThread: s.isCreatingThread,
      pendingMessage: s.pendingMessage,
      hasInitiallyLoaded: s.hasInitiallyLoaded,
    })),
  );

  // Form state
  const selectedMode = useChatStore(s => s.selectedMode);
  const selectedParticipants = useChatStore(s => s.selectedParticipants);
  const inputValue = useChatStore(s => s.inputValue);
  const setInputValue = useChatStore(s => s.setInputValue);
  const setSelectedParticipants = useChatStore(s => s.setSelectedParticipants);
  const removeParticipant = useChatStore(s => s.removeParticipant);
  const enableWebSearch = useChatStore(s => s.enableWebSearch);
  const modelOrder = useChatStore(s => s.modelOrder);
  const setModelOrder = useChatStore(s => s.setModelOrder);
  const setHasPendingConfigChanges = useChatStore(s => s.setHasPendingConfigChanges);

  // Analysis actions
  const updateAnalysisData = useChatStore(s => s.updateAnalysisData);
  const updateAnalysisStatus = useChatStore(s => s.updateAnalysisStatus);
  const updateAnalysisError = useChatStore(s => s.updateAnalysisError);

  // ============================================================================
  // DERIVED STATE
  // ============================================================================

  const effectiveThreadId = thread?.id || createdThreadId || '';
  const sortedContextParticipants = useSortedParticipants(contextParticipants);
  const currentStreamingParticipant = sortedContextParticipants[currentParticipantIndex] || null;

  // ============================================================================
  // QUERIES
  // ============================================================================

  const { data: modelsData } = useModelsQuery();
  const { data: customRolesData } = useCustomRolesQuery(isModelModalOpen.value && !isStreaming);

  // Changelog query (for any screen with valid threadId - needed for round 1+ on both screens)
  const { data: changelogResponse, isFetching: isChangelogFetching } = useThreadChangelogQuery(
    effectiveThreadId,
    Boolean(effectiveThreadId),
  );

  // Feedback query (only for thread mode with valid threadId)
  const { data: feedbackData, isSuccess: feedbackSuccess } = useThreadFeedbackQuery(
    effectiveThreadId,
    mode === 'thread' && Boolean(effectiveThreadId),
  );

  // ============================================================================
  // MEMOIZED DATA
  // ============================================================================

  const allEnabledModels = useMemo(
    () => modelsData?.data?.items || [],
    [modelsData?.data?.items],
  );

  const customRoles = useMemo(
    () => customRolesData?.pages?.flatMap(page =>
      (page?.success && page.data?.items) ? page.data.items : [],
    ) ?? [],
    [customRolesData?.pages],
  );

  const userTierConfig = modelsData?.data?.user_tier_config || {
    tier: 'free' as const,
    tier_name: 'Free',
    max_models: 2,
    can_upgrade: true,
  };

  const changelog = useMemo(() => {
    if (!changelogResponse?.success)
      return [];
    const items = changelogResponse.data.items || [];
    const seen = new Set<string>();
    const filtered = items.filter((item) => {
      if (seen.has(item.id))
        return false;
      seen.add(item.id);
      return true;
    });
    return filtered;
  }, [changelogResponse]);

  // Model ordering for modal - stable references for Motion Reorder
  const orderedModels = useOrderedModels({
    selectedParticipants,
    allEnabledModels,
    modelOrder,
  });

  // File capability: Compute incompatible models based on attachments
  const incompatibleModelIds = useMemo(() => {
    if (chatAttachments.attachments.length === 0) {
      return new Set<string>();
    }

    // Convert attachments to file capability check format
    const files = chatAttachments.attachments.map(att => ({
      mimeType: att.file.type,
    }));

    return getIncompatibleModelIds(allEnabledModels, files);
  }, [chatAttachments.attachments, allEnabledModels]);

  // Timeline with messages, analyses, changelog, and pre-searches
  // ✅ RESUMPTION FIX: Include preSearches for timeline-level rendering
  // This enables rendering pre-search cards even when user message
  // hasn't been persisted yet (e.g., page refresh during web search phase)
  const timelineItems: TimelineItem[] = useThreadTimeline({
    messages,
    analyses,
    changelog,
    preSearches,
  });

  // ============================================================================
  // HOOKS
  // ============================================================================

  // ✅ NOTE: Model order initialization happens in ChatOverviewScreen only
  // ChatView receives already-initialized modelOrder from store

  // Feedback management
  const feedbackByRound = useChatStore(s => s.feedbackByRound);
  const pendingFeedback = useChatStore(s => s.pendingFeedback);
  const feedbackActions = useFeedbackActions({ threadId: effectiveThreadId });

  // Load feedback from server
  const lastLoadedFeedbackRef = useRef<string>('');
  useEffect(() => {
    if (feedbackSuccess && feedbackData) {
      const feedbackArray = feedbackData.success && Array.isArray(feedbackData.data) ? feedbackData.data : [];
      const feedbackKey = feedbackArray.map(f => `${f.roundNumber}:${f.feedbackType}`).join(',');
      if (feedbackKey !== lastLoadedFeedbackRef.current) {
        lastLoadedFeedbackRef.current = feedbackKey;
        feedbackActions.loadFeedback(feedbackArray);
      }
    }
  }, [feedbackData, feedbackSuccess, feedbackActions]);

  // Recommended actions
  const inputContainerRef = useRef<HTMLDivElement | null>(null);
  const hasActiveConversation = Boolean(thread || createdThreadId);

  const recommendedActions = useRecommendedActions({
    inputContainerRef,
    enableScroll: mode === 'thread',
    markConfigChanged: mode === 'thread',
    // ✅ PRESERVE THREAD STATE: Don't reset state when there's an active conversation
    // On thread screen: always preserve (stay on thread)
    // On overview screen with active thread: preserve (stay in conversation view)
    preserveThreadState: mode === 'thread' || hasActiveConversation,
  });

  // Thread actions (for both screens - manages changelog waiting flag)
  const threadActions = useThreadActions({
    slug: slug || '',
    isRoundInProgress: isStreaming || isCreatingAnalysis,
    isChangelogFetching,
  });

  // Form actions
  const formActions = useChatFormActions();

  // Loading state - needed before scroll hook
  const { showLoader } = useFlowLoading({ mode });

  // Scroll management - minimal hook for tracking scroll position
  // Initial scroll and virtualization handled by useVirtualizedTimeline
  const isStoreReady = mode === 'thread' ? (hasInitiallyLoaded && messages.length > 0) : true;

  useChatScroll({
    messages,
    analyses,
    enableNearBottomDetection: true,
  });

  // Input blocking - unified calculation for both screens
  // Blocks input during streaming, thread creation, or when loading indicator is visible
  const isInputBlocked = isStreaming
    || isCreatingThread
    || waitingToStartStreaming
    || showLoader
    || isCreatingAnalysis
    || Boolean(pendingMessage);

  // Mobile keyboard handling
  const keyboardOffset = useVisualViewportPosition();

  // Stuck analysis cleanup - timer-based cleanup for analyses that get stuck streaming
  // React 19: Valid effect for timer (external system)
  // Uses interval to periodically check for stuck analyses
  useEffect(() => {
    const checkStuckAnalyses = () => {
      const stuckAnalyses = analyses.filter((analysis) => {
        if (analysis.status !== AnalysisStatuses.STREAMING)
          return false;
        const createdTime = analysis.createdAt instanceof Date
          ? analysis.createdAt.getTime()
          : new Date(analysis.createdAt).getTime();
        const elapsed = Date.now() - createdTime;
        return elapsed > AnalysisTimeouts.STUCK_THRESHOLD_MS;
      });

      if (stuckAnalyses.length > 0) {
        stuckAnalyses.forEach((analysis) => {
          updateAnalysisStatus(analysis.roundNumber, AnalysisStatuses.COMPLETE);
        });
      }
    };

    // Check immediately and set up interval
    checkStuckAnalyses();
    const intervalId = setInterval(checkStuckAnalyses, AnalysisTimeouts.CHECK_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [analyses, updateAnalysisStatus]);

  // ============================================================================
  // CALLBACKS
  // ============================================================================

  const handleModeSelect = useCallback((newMode: ChatMode) => {
    if (mode === 'thread') {
      threadActions.handleModeChange(newMode);
    } else {
      formActions.handleModeChange(newMode);
    }
    isModeModalOpen.onFalse();
  }, [mode, threadActions, formActions, isModeModalOpen]);

  const handleWebSearchToggle = useCallback((enabled: boolean) => {
    if (mode === 'thread') {
      threadActions.handleWebSearchToggle(enabled);
    } else {
      formActions.handleWebSearchToggle(enabled);
    }
  }, [mode, threadActions, formActions]);

  const handleModelReorder = useCallback((reordered: typeof orderedModels) => {
    // Extract model IDs and deduplicate to prevent corruption
    const seen = new Set<string>();
    const newModelOrder = reordered
      .map(om => om.model.id)
      .filter((id) => {
        if (seen.has(id))
          return false;
        seen.add(id);
        return true;
      });

    setModelOrder(newModelOrder);

    // Recalculate participants from current state using new order
    // This ensures we use fresh data instead of potentially stale references
    const reorderedParticipants = newModelOrder
      .map((modelId, visualIndex) => {
        const participant = selectedParticipants.find(p => p.modelId === modelId);
        return participant ? { ...participant, priority: visualIndex } : null;
      })
      .filter((p): p is NonNullable<typeof p> => p !== null)
      // Re-index priorities to be sequential (0, 1, 2...) for selected models only
      .map((p, idx) => ({ ...p, priority: idx }));

    if (mode === 'thread') {
      threadActions.handleParticipantsChange(reorderedParticipants);
    } else {
      setSelectedParticipants(reorderedParticipants);
    }
  }, [mode, threadActions, setModelOrder, setSelectedParticipants, selectedParticipants]);

  const handleModelToggle = useCallback((modelId: string) => {
    const orderedModel = orderedModels.find(om => om.model.id === modelId);
    if (!orderedModel)
      return;

    let updatedParticipants;
    if (orderedModel.participant) {
      const filtered = selectedParticipants.filter(p => p.id !== orderedModel.participant!.id);
      const sortedByVisualOrder = filtered.sort((a, b) => {
        const aIdx = modelOrder.indexOf(a.modelId);
        const bIdx = modelOrder.indexOf(b.modelId);
        return aIdx - bIdx;
      });
      updatedParticipants = sortedByVisualOrder.map((p, index) => ({ ...p, priority: index }));
    } else {
      // ✅ FIX: Use modelId as unique participant ID (each model = one participant)
      const newParticipant = {
        id: modelId,
        modelId,
        role: '',
        priority: selectedParticipants.length,
      };
      const updated = [...selectedParticipants, newParticipant].sort((a, b) => {
        const aIdx = modelOrder.indexOf(a.modelId);
        const bIdx = modelOrder.indexOf(b.modelId);
        return aIdx - bIdx;
      });
      updatedParticipants = updated.map((p, index) => ({ ...p, priority: index }));
    }

    if (mode === 'thread') {
      threadActions.handleParticipantsChange(updatedParticipants);
    } else {
      setSelectedParticipants(updatedParticipants);
    }
  }, [orderedModels, selectedParticipants, modelOrder, mode, threadActions, setSelectedParticipants]);

  const handleModelRoleChange = useCallback((modelId: string, role: string, customRoleId?: string) => {
    const updated = selectedParticipants.map(p =>
      p.modelId === modelId ? { ...p, role, customRoleId } : p,
    );
    if (mode === 'thread') {
      threadActions.handleParticipantsChange(updated);
    } else {
      setSelectedParticipants(updated);
    }
  }, [selectedParticipants, mode, threadActions, setSelectedParticipants]);

  const handleModelRoleClear = useCallback((modelId: string) => {
    const updated = selectedParticipants.map(p =>
      p.modelId === modelId ? { ...p, role: '', customRoleId: undefined } : p,
    );
    if (mode === 'thread') {
      threadActions.handleParticipantsChange(updated);
    } else {
      setSelectedParticipants(updated);
    }
  }, [selectedParticipants, mode, threadActions, setSelectedParticipants]);

  const handleRemoveParticipant = useCallback((participantId: string) => {
    // Allow removing all - validation shown in UI
    removeParticipant(participantId);
    if (mode === 'thread') {
      setHasPendingConfigChanges(true);
    }
  }, [removeParticipant, mode, setHasPendingConfigChanges]);

  const handleAnalysisStreamStart = useCallback((roundNumber: number) => {
    updateAnalysisStatus(roundNumber, AnalysisStatuses.STREAMING);
    queryClient.invalidateQueries({ queryKey: queryKeys.usage.stats() });
  }, [updateAnalysisStatus, queryClient]);

  const handleAnalysisStreamComplete = useCallback((roundNumber: number, completedData?: unknown, error?: unknown) => {
    if (completedData) {
      // ✅ TYPE-SAFE: Validate with Zod schema instead of unsafe cast
      const parseResult = ModeratorAnalysisPayloadSchema.safeParse(completedData);
      if (parseResult.success) {
        updateAnalysisData(roundNumber, parseResult.data);
      } else {
        updateAnalysisError(roundNumber, 'Invalid analysis data received. Please try again.');
      }
    } else if (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : 'Analysis failed. Please try again.';
      updateAnalysisError(roundNumber, errorMessage);
    } else {
      // ✅ CRITICAL FIX: No data and no error is an inconsistent state
      // This should be treated as a failure, not a success
      // This can happen if streaming completed but validation failed silently
      updateAnalysisError(roundNumber, 'Analysis completed without data. Please try again.');
    }
  }, [updateAnalysisData, updateAnalysisError]);

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <>
      <UnifiedErrorBoundary context="chat">
        <div className="flex flex-col relative flex-1 min-h-full">
          <div className="container max-w-3xl mx-auto px-2 sm:px-4 md:px-6 pt-16 pb-4">
            <ThreadTimeline
              timelineItems={timelineItems}
              user={user}
              participants={contextParticipants}
              threadId={effectiveThreadId}
              threadTitle={thread?.title}
              isStreaming={isStreaming}
              currentParticipantIndex={currentParticipantIndex}
              currentStreamingParticipant={
                isStreaming && currentStreamingParticipant
                  ? currentStreamingParticipant
                  : null
              }
              streamingRoundNumber={streamingRoundNumber}
              feedbackByRound={new Map(
                Array.from(feedbackByRound.entries())
                  .filter(([, value]) => value !== null) as Array<[number, FeedbackType]>,
              )}
              pendingFeedback={pendingFeedback}
              getFeedbackHandler={feedbackActions.getFeedbackHandler}
              onAnalysisStreamStart={handleAnalysisStreamStart}
              onAnalysisStreamComplete={handleAnalysisStreamComplete}
              onActionClick={recommendedActions.handleActionClick}
              preSearches={preSearches}
              isDataReady={isStoreReady}
            />
          </div>

          {/* Chat input - sticky at bottom */}
          <div
            ref={inputContainerRef}
            className="sticky z-30 mt-auto bg-gradient-to-t from-background via-background to-transparent pt-6 relative"
            style={{ bottom: `${keyboardOffset + 16}px` }}
          >
            <div className="w-full max-w-3xl mx-auto px-2 sm:px-4 md:px-6">
              {/* Scroll to bottom button - positioned above input */}
              <ChatScrollButton variant="input" />
              {/* ✅ AI SDK RESUME PATTERN: No onStop prop - streams always complete
                  Per AI SDK docs, resume: true is incompatible with abort/stop.
                  Streams continue in background via waitUntil() and can be resumed.
                  ✅ HYDRATION FIX: Pass isHydrating to suppress "no models" error flash */}
              <ChatInput
                value={inputValue}
                onChange={setInputValue}
                onSubmit={onSubmit}
                status={isInputBlocked ? 'submitted' : 'ready'}
                placeholder={t('input.placeholder')}
                participants={selectedParticipants}
                quotaCheckType={mode === 'overview' ? 'threads' : 'messages'}
                onRemoveParticipant={isInputBlocked ? undefined : handleRemoveParticipant}
                attachments={chatAttachments.attachments}
                onAddAttachments={chatAttachments.addFiles}
                onRemoveAttachment={chatAttachments.removeAttachment}
                enableAttachments={!isInputBlocked}
                attachmentClickRef={attachmentClickRef}
                isUploading={chatAttachments.isUploading}
                isHydrating={mode === 'thread' && !hasInitiallyLoaded}
                toolbar={(
                  <ChatInputToolbarMenu
                    selectedParticipants={selectedParticipants}
                    allModels={allEnabledModels}
                    onOpenModelModal={isModelModalOpen.onTrue}
                    selectedMode={selectedMode || ChatModeSchema.catch(getDefaultChatMode()).parse(thread?.mode)}
                    onOpenModeModal={isModeModalOpen.onTrue}
                    enableWebSearch={enableWebSearch}
                    onWebSearchToggle={handleWebSearchToggle}
                    onAttachmentClick={handleAttachmentClick}
                    attachmentCount={chatAttachments.attachments.length}
                    enableAttachments={!isInputBlocked}
                    disabled={isInputBlocked}
                  />
                )}
              />
            </div>
            {/* Bottom fill */}
            <div className="-z-10 absolute inset-x-0 top-full h-4 bg-background pointer-events-none" />
          </div>
        </div>
      </UnifiedErrorBoundary>

      {/* Modals */}
      <ConversationModeModal
        open={isModeModalOpen.value}
        onOpenChange={isModeModalOpen.setValue}
        selectedMode={selectedMode || ChatModeSchema.catch(getDefaultChatMode()).parse(thread?.mode)}
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
        maxModels={userTierConfig.max_models}
        userTierInfo={{
          tier_name: userTierConfig.tier_name,
          max_models: userTierConfig.max_models,
          current_tier: userTierConfig.tier,
          can_upgrade: userTierConfig.can_upgrade,
        }}
        incompatibleModelIds={incompatibleModelIds}
      />
    </>
  );
}
