'use client';

import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';

import type { ChatMode, ScreenMode } from '@/api/core/enums';
import { ChatModeSchema, ErrorBoundaryContexts, MessageStatuses, ScreenModes } from '@/api/core/enums';
import { ChatInput } from '@/components/chat/chat-input';
import { ChatInputHeader } from '@/components/chat/chat-input-header';
import { ChatInputUpgradeBanner } from '@/components/chat/chat-input-upgrade-banner';
import { ChatScrollButton } from '@/components/chat/chat-scroll-button';
import { ThreadTimeline } from '@/components/chat/thread-timeline';
import { UnifiedErrorBoundary } from '@/components/chat/unified-error-boundary';
import { useChatStore, useChatStoreApi } from '@/components/providers';
import { useCustomRolesQuery, useModelsQuery, useThreadChangelogQuery, useThreadFeedbackQuery } from '@/hooks/queries';
import type { TimelineItem, UseChatAttachmentsReturn } from '@/hooks/utils';
import {
  useAnalyzePromptStream,
  useBoolean,
  useChatScroll,
  useFreeTrialState,
  useOrderedModels,
  useThreadTimeline,
  useVisualViewportPosition,
} from '@/hooks/utils';
import { getDefaultChatMode } from '@/lib/config/chat-modes';
import type { ModelPreset } from '@/lib/config/model-presets';
import { filterPresetParticipants, ToastNamespaces } from '@/lib/config/model-presets';
import { isFilePart } from '@/lib/schemas/message-schemas';
import { toastManager } from '@/lib/toast';
import { getIncompatibleModelIds, getModeratorMetadata, getRoundNumber, isModeratorMessage, isVisionRequiredMimeType } from '@/lib/utils';
import {
  useChatFormActions,
  useFeedbackActions,
  useFlowLoading,
  useThreadActions,
} from '@/stores/chat';

const ModelSelectionModal = dynamic(
  () => import('@/components/chat/model-selection-modal').then(m => m.ModelSelectionModal),
  { ssr: false },
);
const ConversationModeModal = dynamic(
  () => import('@/components/chat/conversation-mode-modal').then(m => m.ConversationModeModal),
  { ssr: false },
);
const ChatInputToolbarMenu = dynamic(
  () => import('@/components/chat/chat-input-toolbar-lazy').then(m => m.ChatInputToolbarMenu),
  { ssr: false },
);

export type ChatViewProps = {
  user: {
    name: string;
    image: string | null;
  };
  slug?: string;
  mode: ScreenMode;
  onSubmit: (e: React.FormEvent) => Promise<void>;
  chatAttachments: UseChatAttachmentsReturn;
  threadId?: string;
};

export function ChatView({
  user,
  slug,
  mode,
  onSubmit,
  chatAttachments,
  threadId: serverThreadId,
}: ChatViewProps) {
  const t = useTranslations('chat');

  const isModeModalOpen = useBoolean(false);
  const isModelModalOpen = useBoolean(false);

  const attachmentClickRef = useRef<(() => void) | null>(null);
  const handleAttachmentClick = useCallback(() => {
    attachmentClickRef.current?.();
  }, []);

  const {
    messages,
    isStreaming,
    currentParticipantIndex,
    contextParticipants,
    preSearches,
    thread,
    createdThreadId,
    isModeratorStreaming,
    streamingRoundNumber,
    waitingToStartStreaming,
    isCreatingThread,
    pendingMessage,
    hasInitiallyLoaded,
    preSearchResumption,
    moderatorResumption,
    selectedMode,
    selectedParticipants,
    inputValue,
    setInputValue,
    setSelectedParticipants,
    enableWebSearch,
    modelOrder,
    setModelOrder,
    autoMode,
    setAutoMode,
    isAnalyzingPrompt,
    setIsAnalyzingPrompt,
    setSelectedMode,
    setEnableWebSearch,
  } = useChatStore(
    useShallow(s => ({
      messages: s.messages,
      isStreaming: s.isStreaming,
      currentParticipantIndex: s.currentParticipantIndex,
      contextParticipants: s.participants,
      preSearches: s.preSearches,
      thread: s.thread,
      createdThreadId: s.createdThreadId,
      isModeratorStreaming: s.isModeratorStreaming,
      streamingRoundNumber: s.streamingRoundNumber,
      waitingToStartStreaming: s.waitingToStartStreaming,
      isCreatingThread: s.isCreatingThread,
      pendingMessage: s.pendingMessage,
      hasInitiallyLoaded: s.hasInitiallyLoaded,
      preSearchResumption: s.preSearchResumption,
      moderatorResumption: s.moderatorResumption,
      selectedMode: s.selectedMode,
      selectedParticipants: s.selectedParticipants,
      inputValue: s.inputValue,
      setInputValue: s.setInputValue,
      setSelectedParticipants: s.setSelectedParticipants,
      enableWebSearch: s.enableWebSearch,
      modelOrder: s.modelOrder,
      setModelOrder: s.setModelOrder,
      autoMode: s.autoMode,
      setAutoMode: s.setAutoMode,
      isAnalyzingPrompt: s.isAnalyzingPrompt,
      setIsAnalyzingPrompt: s.setIsAnalyzingPrompt,
      setSelectedMode: s.setSelectedMode,
      setEnableWebSearch: s.setEnableWebSearch,
    })),
  );

  const storeApi = useChatStoreApi();
  const getIsStreamingFromStore = useCallback(() => {
    const state = storeApi.getState();
    return state.isStreaming || state.isModeratorStreaming;
  }, [storeApi]);

  const effectiveThreadId = serverThreadId || thread?.id || createdThreadId || '';
  const currentStreamingParticipant = contextParticipants[currentParticipantIndex] || null;

  const { data: modelsData, isLoading: isModelsLoading } = useModelsQuery();
  const { data: customRolesData } = useCustomRolesQuery(isModelModalOpen.value && !isStreaming);
  const { borderVariant, isFreeUser } = useFreeTrialState();

  const { data: changelogResponse } = useThreadChangelogQuery(
    effectiveThreadId,
    mode === ScreenModes.THREAD && Boolean(effectiveThreadId),
  );

  const { data: feedbackData, isSuccess: feedbackSuccess } = useThreadFeedbackQuery(
    effectiveThreadId,
    mode === ScreenModes.THREAD && Boolean(effectiveThreadId),
  );

  const allEnabledModels = useMemo(
    () => modelsData?.data?.items || [],
    [modelsData?.data?.items],
  );

  const customRoles = useMemo(
    () => customRolesData?.pages?.flatMap((page) => {
      if (!page || typeof page !== 'object' || !('success' in page) || !page.success) {
        return [];
      }
      return page.data?.items || [];
    }) ?? [],
    [customRolesData?.pages],
  );

  const userTierConfig = modelsData?.data?.user_tier_config;

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

  const completedRoundNumbers = useMemo(() => {
    const completed = new Set<number>();
    messages.forEach((msg) => {
      if (isModeratorMessage(msg)) {
        const moderatorMeta = getModeratorMetadata(msg.metadata);
        if (moderatorMeta?.finishReason) {
          const roundNum = getRoundNumber(msg.metadata);
          if (roundNum !== null) {
            completed.add(roundNum);
          }
        }
      }
    });
    return completed;
  }, [messages]);

  const orderedModels = useOrderedModels({
    selectedParticipants,
    allEnabledModels,
    modelOrder,
  });

  const incompatibleModelIds = useMemo(() => {
    const incompatible = new Set<string>();

    for (const model of allEnabledModels) {
      if (!model.is_accessible_to_user) {
        incompatible.add(model.id);
      }
    }

    const existingVisionFiles = messages.some((msg) => {
      if (!msg.parts)
        return false;
      return msg.parts.some((part) => {
        if (!isFilePart(part))
          return false;
        return isVisionRequiredMimeType(part.mediaType);
      });
    });

    const newVisionFiles = chatAttachments.attachments.some(att =>
      isVisionRequiredMimeType(att.file.type),
    );

    if (existingVisionFiles || newVisionFiles) {
      const files = [{ mimeType: 'image/png' }];
      const visionIncompatible = getIncompatibleModelIds(allEnabledModels, files);
      for (const id of visionIncompatible) {
        incompatible.add(id);
      }
    }

    return incompatible;
  }, [messages, chatAttachments.attachments, allEnabledModels]);

  const incompatibleModelIdsRef = useRef(incompatibleModelIds);
  useEffect(() => {
    incompatibleModelIdsRef.current = incompatibleModelIds;
  }, [incompatibleModelIds]);

  const timelineItems: TimelineItem[] = useThreadTimeline({
    messages,
    changelog,
    preSearches,
  });

  const feedbackActions = useFeedbackActions({ threadId: effectiveThreadId });

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

  const inputContainerRef = useRef<HTMLDivElement | null>(null);

  const threadActions = useThreadActions({
    slug: slug || '',
    isRoundInProgress: isStreaming || isModeratorStreaming,
  });

  useEffect(() => {
    const hasVisionAttachments = chatAttachments.attachments.some(att =>
      isVisionRequiredMimeType(att.file.type),
    );
    if (mode === ScreenModes.OVERVIEW && messages.length === 0 && !hasVisionAttachments)
      return;
    if (incompatibleModelIds.size === 0)
      return;

    const incompatibleSelected = selectedParticipants.filter(p =>
      incompatibleModelIds.has(p.modelId),
    );

    if (incompatibleSelected.length === 0)
      return;

    const incompatibleModelNames = incompatibleSelected
      .map(p => allEnabledModels.find(m => m.id === p.modelId)?.name)
      .filter((name): name is string => Boolean(name));

    const compatibleParticipants = selectedParticipants
      .filter(p => !incompatibleModelIds.has(p.modelId))
      .map((p, index) => ({ ...p, priority: index }));

    if (mode === ScreenModes.THREAD) {
      threadActions.handleParticipantsChange(compatibleParticipants);
    } else {
      setSelectedParticipants(compatibleParticipants);
    }

    if (incompatibleModelNames.length > 0) {
      const modelList = incompatibleModelNames.length <= 2
        ? incompatibleModelNames.join(' and ')
        : `${incompatibleModelNames.slice(0, 2).join(', ')} and ${incompatibleModelNames.length - 2} more`;

      toastManager.warning(
        t('models.modelsDeselected'),
        t('models.modelsDeselectedDescription', { models: modelList }),
      );
    }
  }, [mode, incompatibleModelIds, selectedParticipants, messages.length, threadActions, setSelectedParticipants, allEnabledModels, t, chatAttachments.attachments]);

  const formActions = useChatFormActions();
  const { streamConfig: analyzePromptStream } = useAnalyzePromptStream();

  const { showLoader } = useFlowLoading({ mode });

  const isStoreReady = mode === ScreenModes.THREAD ? (hasInitiallyLoaded && messages.length > 0) : true;

  useChatScroll({
    messages,
    enableNearBottomDetection: true,
  });

  const isResumptionActive = preSearchResumption?.status === MessageStatuses.STREAMING
    || preSearchResumption?.status === MessageStatuses.PENDING
    || moderatorResumption?.status === MessageStatuses.STREAMING
    || moderatorResumption?.status === MessageStatuses.PENDING;

  const isRoundInProgress = streamingRoundNumber !== null;

  const isInputBlocked = isStreaming
    || isCreatingThread
    || waitingToStartStreaming
    || showLoader
    || isModeratorStreaming
    || Boolean(pendingMessage)
    || isModelsLoading
    || isResumptionActive
    || formActions.isSubmitting
    || isRoundInProgress
    || isAnalyzingPrompt;

  const showSubmitSpinner = formActions.isSubmitting || waitingToStartStreaming || isAnalyzingPrompt;

  const handleAutoModeSubmit = useCallback(async (e: React.FormEvent) => {
    if (mode === ScreenModes.OVERVIEW && autoMode && inputValue.trim()) {
      setIsAnalyzingPrompt(true);

      try {
        const result = await analyzePromptStream(inputValue.trim());
        if (result) {
          const { participants, mode: recommendedMode, enableWebSearch: recommendedWebSearch } = result;
          const newParticipants = participants.map((p: { modelId: string; role: string | null }, index: number) => ({
            id: p.modelId,
            modelId: p.modelId,
            role: p.role || '',
            priority: index,
          }));
          setSelectedParticipants(newParticipants);
          setModelOrder(newParticipants.map((p: { modelId: string }) => p.modelId));
          setSelectedMode(recommendedMode);
          setEnableWebSearch(recommendedWebSearch);
        }
      } catch {
      } finally {
        setIsAnalyzingPrompt(false);
      }
    }
    await onSubmit(e);
  }, [
    mode,
    autoMode,
    inputValue,
    setIsAnalyzingPrompt,
    analyzePromptStream,
    setSelectedParticipants,
    setModelOrder,
    setSelectedMode,
    setEnableWebSearch,
    onSubmit,
  ]);

  const keyboardOffset = useVisualViewportPosition();

  const handleModeSelect = useCallback((newMode: ChatMode) => {
    if (mode === ScreenModes.THREAD) {
      threadActions.handleModeChange(newMode);
    } else {
      formActions.handleModeChange(newMode);
    }
    isModeModalOpen.onFalse();
  }, [mode, threadActions, formActions, isModeModalOpen]);

  const handleWebSearchToggle = useCallback((enabled: boolean) => {
    if (mode === ScreenModes.THREAD) {
      threadActions.handleWebSearchToggle(enabled);
    } else {
      formActions.handleWebSearchToggle(enabled);
    }
  }, [mode, threadActions, formActions]);

  const handleModelReorder = useCallback((reordered: typeof orderedModels) => {
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

    const reorderedParticipants = newModelOrder
      .map((modelId, visualIndex) => {
        const participant = selectedParticipants.find(p => p.modelId === modelId);
        return participant ? { ...participant, priority: visualIndex } : null;
      })
      .filter((p): p is NonNullable<typeof p> => p !== null)
      .map((p, idx) => ({ ...p, priority: idx }));

    if (mode === ScreenModes.THREAD) {
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
      const participantToRemove = orderedModel.participant;
      const filtered = selectedParticipants.filter(p => p.id !== participantToRemove.id);
      const sortedByVisualOrder = filtered.sort((a, b) => {
        const aIdx = modelOrder.indexOf(a.modelId);
        const bIdx = modelOrder.indexOf(b.modelId);
        return aIdx - bIdx;
      });
      updatedParticipants = sortedByVisualOrder.map((p, index) => ({ ...p, priority: index }));
    } else {
      const latestIncompatible = incompatibleModelIdsRef.current;
      if (latestIncompatible.has(modelId)) {
        toastManager.warning(
          t('models.cannotSelectModel'),
          t('models.modelIncompatibleWithFiles'),
        );
        return;
      }

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

    if (mode === ScreenModes.THREAD) {
      threadActions.handleParticipantsChange(updatedParticipants);
    } else {
      setSelectedParticipants(updatedParticipants);
    }
  }, [orderedModels, selectedParticipants, modelOrder, mode, threadActions, setSelectedParticipants, t]);

  const handleModelRoleChange = useCallback((modelId: string, role: string, customRoleId?: string) => {
    const updated = selectedParticipants.map(p =>
      p.modelId === modelId ? { ...p, role, customRoleId } : p,
    );
    if (mode === ScreenModes.THREAD) {
      threadActions.handleParticipantsChange(updated);
    } else {
      setSelectedParticipants(updated);
    }
  }, [selectedParticipants, mode, threadActions, setSelectedParticipants]);

  const handleModelRoleClear = useCallback((modelId: string) => {
    const updated = selectedParticipants.map(p =>
      p.modelId === modelId ? { ...p, role: '', customRoleId: undefined } : p,
    );
    if (mode === ScreenModes.THREAD) {
      threadActions.handleParticipantsChange(updated);
    } else {
      setSelectedParticipants(updated);
    }
  }, [selectedParticipants, mode, threadActions, setSelectedParticipants]);

  const handlePresetSelect = useCallback((preset: ModelPreset) => {
    const result = filterPresetParticipants(
      preset,
      incompatibleModelIdsRef.current,
      t,
      ToastNamespaces.MODELS,
    );

    if (!result.success) {
      return;
    }

    if (mode === ScreenModes.THREAD) {
      threadActions.handleParticipantsChange(result.participants);
    } else {
      setSelectedParticipants(result.participants);
    }

    const modelIds = result.participants.map(p => p.modelId);
    setModelOrder(modelIds);

    if (mode === ScreenModes.THREAD) {
      threadActions.handleModeChange(preset.mode);
    } else {
      formActions.handleModeChange(preset.mode);
    }

    const searchEnabled = preset.searchEnabled === 'conditional' ? true : preset.searchEnabled;
    if (mode === ScreenModes.THREAD) {
      threadActions.handleWebSearchToggle(searchEnabled);
    } else {
      formActions.handleWebSearchToggle(searchEnabled);
    }
  }, [mode, threadActions, formActions, setSelectedParticipants, setModelOrder, t]);

  return (
    <>
      <UnifiedErrorBoundary context={ErrorBoundaryContexts.CHAT}>
        <div className="flex flex-col relative flex-1 min-h-full">
          <div className="container max-w-4xl mx-auto px-5 md:px-6 pt-16 pb-44">
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
              preSearches={preSearches}
              isDataReady={isStoreReady}
              completedRoundNumbers={completedRoundNumbers}
              isModeratorStreaming={isModeratorStreaming}
              getIsStreamingFromStore={getIsStreamingFromStore}
            />
          </div>

          <div
            ref={inputContainerRef}
            className="fixed inset-x-0 z-30 md:left-[var(--sidebar-width)]"
            style={{ bottom: `${keyboardOffset}px` }}
          >
            <div className="absolute inset-0 -bottom-4 bg-gradient-to-t from-background from-85% to-transparent pointer-events-none" />
            <div className="w-full max-w-4xl mx-auto px-5 md:px-6 pt-4 pb-4 relative">
              <ChatScrollButton variant="input" />
              <div className="flex flex-col">
                <ChatInputUpgradeBanner />
                {mode === ScreenModes.OVERVIEW && (
                  <ChatInputHeader
                    autoMode={autoMode}
                    onAutoModeChange={setAutoMode}
                    isAnalyzing={isAnalyzingPrompt}
                    disabled={isInputBlocked && !isAnalyzingPrompt}
                    borderVariant={borderVariant}
                  />
                )}
                <ChatInput
                  className={(mode === ScreenModes.OVERVIEW || isFreeUser) ? 'rounded-t-none border-t-0' : undefined}
                  hideInternalAlerts={mode === ScreenModes.OVERVIEW || isFreeUser}
                  borderVariant={(mode === ScreenModes.OVERVIEW || isFreeUser) ? borderVariant : undefined}
                  value={inputValue}
                  onChange={setInputValue}
                  onSubmit={handleAutoModeSubmit}
                  status={isInputBlocked ? 'submitted' : 'ready'}
                  placeholder={t('input.placeholder')}
                  participants={selectedParticipants}
                  showCreditAlert={true}
                  attachments={chatAttachments.attachments}
                  onAddAttachments={chatAttachments.addFiles}
                  onRemoveAttachment={chatAttachments.removeAttachment}
                  enableAttachments={!isInputBlocked}
                  attachmentClickRef={attachmentClickRef}
                  isUploading={chatAttachments.isUploading}
                  isHydrating={mode === ScreenModes.THREAD && !hasInitiallyLoaded}
                  isSubmitting={showSubmitSpinner}
                  isModelsLoading={isModelsLoading}
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
                      isModelsLoading={isModelsLoading}
                      autoMode={mode === ScreenModes.OVERVIEW && autoMode}
                    />
                  )}
                />
              </div>
            </div>
          </div>
        </div>
      </UnifiedErrorBoundary>

      <ConversationModeModal
        open={isModeModalOpen.value}
        onOpenChange={isModeModalOpen.setValue}
        selectedMode={selectedMode || ChatModeSchema.catch(getDefaultChatMode()).parse(thread?.mode)}
        onModeSelect={handleModeSelect}
      />

      {userTierConfig && (
        <ModelSelectionModal
          open={isModelModalOpen.value}
          onOpenChange={isModelModalOpen.setValue}
          orderedModels={orderedModels}
          onReorder={handleModelReorder}
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
      )}
    </>
  );
}
