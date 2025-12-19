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
 * - Manages summary streaming and completion
 * - Provides unified input with toolbar and modals
 * - Consistent loading indicators and scroll behavior
 */

import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';

import type { ChatMode, FeedbackType } from '@/api/core/enums';
import { ChatModeSchema, MessageStatuses } from '@/api/core/enums';
import { RoundSummaryAIContentSchema } from '@/api/routes/chat/schema';
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
  useThreadTimeline,
  useVisualViewportPosition,
} from '@/hooks/utils';
import { getDefaultChatMode } from '@/lib/config/chat-modes';
import type { ModelPreset } from '@/lib/config/model-presets';
import { queryKeys } from '@/lib/data/query-keys';
import { toastManager } from '@/lib/toast';
import { getIncompatibleModelIds, isVisionRequiredMimeType } from '@/lib/utils/file-capability';
import {
  SummaryTimeouts,
  useChatFormActions,
  useFeedbackActions,
  useFlowLoading,
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
  const summaries = useChatStore(s => s.summaries);

  const { thread, createdThreadId } = useChatStore(
    useShallow(s => ({
      thread: s.thread,
      createdThreadId: s.createdThreadId,
    })),
  );

  const { streamingRoundNumber, isCreatingSummary, waitingToStartStreaming, isCreatingThread, pendingMessage, hasInitiallyLoaded, preSearchResumption, summarizerResumption } = useChatStore(
    useShallow(s => ({
      streamingRoundNumber: s.streamingRoundNumber,
      isCreatingSummary: s.isCreatingSummary,
      waitingToStartStreaming: s.waitingToStartStreaming,
      isCreatingThread: s.isCreatingThread,
      pendingMessage: s.pendingMessage,
      hasInitiallyLoaded: s.hasInitiallyLoaded,
      preSearchResumption: s.preSearchResumption,
      summarizerResumption: s.summarizerResumption,
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

  // Summary actions
  const updateSummaryData = useChatStore(s => s.updateSummaryData);
  const updateSummaryStatus = useChatStore(s => s.updateSummaryStatus);
  const updateSummaryError = useChatStore(s => s.updateSummaryError);

  // ============================================================================
  // DERIVED STATE
  // ============================================================================

  const effectiveThreadId = thread?.id || createdThreadId || '';
  // Store guarantees participants are sorted by priority
  const currentStreamingParticipant = contextParticipants[currentParticipantIndex] || null;

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

  // ✅ BUG FIX: Compute completed round numbers from summaries
  // Rounds with complete summaries should NEVER show pending cards,
  // regardless of current participant configuration
  const completedRoundNumbers = useMemo(() => {
    const completed = new Set<number>();
    summaries.forEach((summary) => {
      if (summary.status === MessageStatuses.COMPLETE) {
        completed.add(summary.roundNumber);
      }
    });
    return completed;
  }, [summaries]);

  // Model ordering for modal - stable references for Motion Reorder
  const orderedModels = useOrderedModels({
    selectedParticipants,
    allEnabledModels,
    modelOrder,
  });

  // File capability: Compute incompatible models based on attachments AND existing thread files
  // Models without vision cannot process images/PDFs - disable them proactively
  const incompatibleModelIds = useMemo(() => {
    // Check existing messages for vision-required files (images/PDFs from previous rounds)
    const existingVisionFiles = messages.some((msg) => {
      if (!msg.parts)
        return false;
      return msg.parts.some((part) => {
        if (part.type !== 'file' || !('mediaType' in part))
          return false;
        return isVisionRequiredMimeType(part.mediaType as string);
      });
    });

    // Check new attachments for vision-required files
    const newVisionFiles = chatAttachments.attachments.some(att =>
      isVisionRequiredMimeType(att.file.type),
    );

    // If no vision files anywhere, no models are incompatible
    if (!existingVisionFiles && !newVisionFiles) {
      return new Set<string>();
    }

    // Build file list for capability check (we just need to know vision is required)
    // Using a single placeholder since we already know vision is needed
    const files = [{ mimeType: 'image/png' }];

    return getIncompatibleModelIds(allEnabledModels, files);
  }, [messages, chatAttachments.attachments, allEnabledModels]);

  // ✅ STALE CLOSURE FIX: Track latest incompatibleModelIds in ref for callbacks
  const incompatibleModelIdsRef = useRef(incompatibleModelIds);
  useEffect(() => {
    incompatibleModelIdsRef.current = incompatibleModelIds;
  }, [incompatibleModelIds]);

  // Timeline with messages, summaries, changelog, and pre-searches
  // ✅ RESUMPTION FIX: Include preSearches for timeline-level rendering
  // This enables rendering pre-search cards even when user message
  // hasn't been persisted yet (e.g., page refresh during web search phase)
  const timelineItems: TimelineItem[] = useThreadTimeline({
    messages,
    summaries,
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

  // Input container ref for scrolling behavior
  const inputContainerRef = useRef<HTMLDivElement | null>(null);

  // Thread actions (for both screens - manages changelog waiting flag)
  const threadActions = useThreadActions({
    slug: slug || '',
    isRoundInProgress: isStreaming || isCreatingSummary,
    isChangelogFetching,
  });

  // Auto-deselect incompatible models when vision files are detected
  // For thread mode: always check
  // For overview mode: only when there are existing messages (continuing conversation)
  // Initial overview (no messages) is handled by ChatOverviewScreen's own effect
  useEffect(() => {
    // Skip initial overview state - ChatOverviewScreen handles that
    if (mode === 'overview' && messages.length === 0)
      return;
    if (incompatibleModelIds.size === 0)
      return;

    // Find selected participants that are now incompatible
    const incompatibleSelected = selectedParticipants.filter(
      p => incompatibleModelIds.has(p.modelId),
    );

    if (incompatibleSelected.length === 0)
      return;

    // Get model names for toast message
    const incompatibleModelNames = incompatibleSelected
      .map(p => allEnabledModels.find(m => m.id === p.modelId)?.name)
      .filter((name): name is string => Boolean(name));

    // Remove incompatible participants and re-index priorities
    const compatibleParticipants = selectedParticipants
      .filter(p => !incompatibleModelIds.has(p.modelId))
      .map((p, index) => ({ ...p, priority: index }));

    if (mode === 'thread') {
      threadActions.handleParticipantsChange(compatibleParticipants);
    } else {
      setSelectedParticipants(compatibleParticipants);
    }

    // Show toast notification
    if (incompatibleModelNames.length > 0) {
      const modelList = incompatibleModelNames.length <= 2
        ? incompatibleModelNames.join(' and ')
        : `${incompatibleModelNames.slice(0, 2).join(', ')} and ${incompatibleModelNames.length - 2} more`;

      toastManager.warning(
        t('models.modelsDeselected'),
        t('models.modelsDeselectedDescription', { models: modelList }),
      );
    }
  }, [mode, incompatibleModelIds, selectedParticipants, messages.length, threadActions, setSelectedParticipants, allEnabledModels, t]);

  // Form actions
  const formActions = useChatFormActions();

  // Loading state - needed before scroll hook
  const { showLoader } = useFlowLoading({ mode });

  // Scroll management - minimal hook for tracking scroll position
  // Initial scroll and virtualization handled by useVirtualizedTimeline
  const isStoreReady = mode === 'thread' ? (hasInitiallyLoaded && messages.length > 0) : true;

  useChatScroll({
    messages,
    summaries,
    enableNearBottomDetection: true,
  });

  // Input blocking - unified calculation for both screens
  // Blocks input during streaming, thread creation, resumption, or when loading indicator is visible
  // ✅ RESUMPTION FIX: Only block when resumption is ACTIVELY in progress
  // Don't check currentResumptionPhase directly - it can be stale after round completes
  // Only check actual resumption status states which are properly managed
  const isResumptionActive = (
    preSearchResumption?.status === MessageStatuses.STREAMING
    || preSearchResumption?.status === MessageStatuses.PENDING
    || summarizerResumption?.status === MessageStatuses.STREAMING
    || summarizerResumption?.status === MessageStatuses.PENDING
  );

  const isInputBlocked = isStreaming
    || isCreatingThread
    || waitingToStartStreaming
    || showLoader
    || isCreatingSummary
    || Boolean(pendingMessage)
    || isResumptionActive
    || formActions.isSubmitting;

  // Mobile keyboard handling
  const keyboardOffset = useVisualViewportPosition();

  // Stuck summary cleanup - timer-based cleanup for summaries that get stuck streaming
  // React 19: Valid effect for timer (external system)
  // Uses interval to periodically check for stuck summaries
  useEffect(() => {
    const checkStuckSummaries = () => {
      const stuckSummaries = summaries.filter((summary) => {
        if (summary.status !== MessageStatuses.STREAMING)
          return false;
        const createdTime = summary.createdAt instanceof Date
          ? summary.createdAt.getTime()
          : new Date(summary.createdAt).getTime();
        const elapsed = Date.now() - createdTime;
        return elapsed > SummaryTimeouts.STUCK_THRESHOLD_MS;
      });

      if (stuckSummaries.length > 0) {
        stuckSummaries.forEach((summary) => {
          // Mark as FAILED with error message (not COMPLETE - that's incorrect for stuck streams)
          updateSummaryError(summary.roundNumber, 'Summary timed out. The stream was interrupted. Please try again.');
        });
      }
    };

    // Check immediately and set up interval
    checkStuckSummaries();
    const intervalId = setInterval(checkStuckSummaries, SummaryTimeouts.CHECK_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [summaries, updateSummaryError]);

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
    if (!orderedModel) {
      return;
    }

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
      // ✅ VISION COMPATIBILITY: Block selection if model is incompatible with uploaded files
      const latestIncompatible = incompatibleModelIdsRef.current;
      if (latestIncompatible.has(modelId)) {
        toastManager.warning(
          t('models.cannotSelectModel'),
          t('models.modelIncompatibleWithFiles'),
        );
        return;
      }

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
  }, [orderedModels, selectedParticipants, modelOrder, mode, threadActions, setSelectedParticipants, t]);

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

  // Preset selection - replaces all selected models with preset's models and preferences
  const handlePresetSelect = useCallback((preset: ModelPreset) => {
    // Get model IDs from preset's modelRoles
    const presetModelIds = preset.modelRoles.map(mr => mr.modelId);

    // ✅ VISION COMPATIBILITY: Filter out models incompatible with uploaded files
    const latestIncompatible = incompatibleModelIdsRef.current;
    const compatibleModelIds = latestIncompatible.size > 0
      ? presetModelIds.filter(id => !latestIncompatible.has(id))
      : presetModelIds;

    // Show warning if any models were filtered
    const filteredCount = presetModelIds.length - compatibleModelIds.length;
    if (filteredCount > 0 && compatibleModelIds.length > 0) {
      toastManager.warning(
        t('models.presetModelsExcluded'),
        t('models.presetModelsExcludedDescription', { count: filteredCount }),
      );
    }

    // If ALL models are incompatible, don't apply preset
    if (compatibleModelIds.length === 0) {
      toastManager.error(
        t('models.presetIncompatible'),
        t('models.presetIncompatibleDescription'),
      );
      return;
    }

    // Build participant configs from preset's modelRoles (preserves role assignments)
    const newParticipants = preset.modelRoles
      .filter(mr => compatibleModelIds.includes(mr.modelId))
      .map((mr, index) => ({
        id: mr.modelId,
        modelId: mr.modelId,
        role: mr.role || '',
        priority: index,
      }));

    // Update store based on mode
    if (mode === 'thread') {
      threadActions.handleParticipantsChange(newParticipants);
    } else {
      setSelectedParticipants(newParticipants);
    }

    // Update model order
    const modelIds = newParticipants.map(p => p.modelId);
    setModelOrder(modelIds);

    // Apply preset mode (required field)
    if (mode === 'thread') {
      threadActions.handleModeChange(preset.mode);
    } else {
      formActions.handleModeChange(preset.mode);
    }

    // Apply preset web search setting
    const searchEnabled = preset.searchEnabled === 'conditional' ? true : preset.searchEnabled;
    if (mode === 'thread') {
      threadActions.handleWebSearchToggle(searchEnabled);
    } else {
      formActions.handleWebSearchToggle(searchEnabled);
    }
  }, [mode, threadActions, formActions, setSelectedParticipants, setModelOrder, t]);

  const handleRemoveParticipant = useCallback((participantId: string) => {
    // Allow removing all - validation shown in UI
    removeParticipant(participantId);
    if (mode === 'thread') {
      setHasPendingConfigChanges(true);
    }
  }, [removeParticipant, mode, setHasPendingConfigChanges]);

  const handleSummaryStreamStart = useCallback((roundNumber: number) => {
    updateSummaryStatus(roundNumber, MessageStatuses.STREAMING);
    queryClient.invalidateQueries({ queryKey: queryKeys.usage.stats() });
  }, [updateSummaryStatus, queryClient]);

  const handleSummaryStreamComplete = useCallback((roundNumber: number, completedData?: unknown, error?: unknown) => {
    if (completedData) {
      // Data already validated by AI SDK's useObject with same schema
      // This safeParse is defensive - should always pass if stream component worked correctly
      const parseResult = RoundSummaryAIContentSchema.safeParse(completedData);
      if (parseResult.success) {
        updateSummaryData(roundNumber, parseResult.data);
      } else {
        console.error('[Summary] Validation failed:', parseResult.error.flatten());
        updateSummaryError(roundNumber, 'Invalid summary data received. Please try again.');
      }
    } else if (error) {
      console.error('[Summary] Stream error:', error);
      const errorMessage = error instanceof Error
        ? error.message
        : 'Summary failed. Please try again.';
      updateSummaryError(roundNumber, errorMessage);
    } else {
      updateSummaryError(roundNumber, 'Summary completed without data. Please try again.');
    }
  }, [updateSummaryData, updateSummaryError]);

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
              onSummaryStreamStart={handleSummaryStreamStart}
              onSummaryStreamComplete={handleSummaryStreamComplete}
              preSearches={preSearches}
              isDataReady={isStoreReady}
              completedRoundNumbers={completedRoundNumbers}
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
                isSubmitting={formActions.isSubmitting}
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
        onPresetSelect={handlePresetSelect}
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
