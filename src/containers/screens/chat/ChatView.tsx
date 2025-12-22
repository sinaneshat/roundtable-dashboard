'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';

import type { ChatMode, FeedbackType } from '@/api/core/enums';
import { ChatModeSchema, MessageStatuses, ScreenModes } from '@/api/core/enums';
import type { BaseModelResponse } from '@/api/routes/models/schema';
import { ChatInput } from '@/components/chat/chat-input';
import { ChatInputToolbarMenu } from '@/components/chat/chat-input-toolbar-menu';
import { ChatScrollButton } from '@/components/chat/chat-scroll-button';
import { ConversationModeModal } from '@/components/chat/conversation-mode-modal';
import { ModelSelectionModal } from '@/components/chat/model-selection-modal';
import { ThreadTimeline } from '@/components/chat/thread-timeline';
import { UnifiedErrorBoundary } from '@/components/chat/unified-error-boundary';
import { useChatStore } from '@/components/providers/chat-store-provider';
import { useCustomRolesQuery, useModelsQuery, useThreadChangelogQuery, useThreadFeedbackQuery } from '@/hooks/queries';
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
import { toastManager } from '@/lib/toast';
import { getIncompatibleModelIds, isVisionRequiredMimeType } from '@/lib/utils/file-capability';
import { getModeratorMetadata, getRoundNumber, isModeratorMessage } from '@/lib/utils/metadata';
import {
  useChatFormActions,
  useFeedbackActions,
  useFlowLoading,
  useThreadActions,
} from '@/stores/chat';

export type ChatViewProps = {
  user: {
    name: string;
    image: string | null;
  };
  slug?: string;
  mode: 'overview' | 'thread';
  onSubmit: (e: React.FormEvent) => Promise<void>;
  chatAttachments: UseChatAttachmentsReturn;
};

export function ChatView({
  user,
  slug,
  mode,
  onSubmit,
  chatAttachments,
}: ChatViewProps) {
  const t = useTranslations('chat');

  const isModeModalOpen = useBoolean(false);
  const isModelModalOpen = useBoolean(false);

  const attachmentClickRef = useRef<(() => void) | null>(null);
  const handleAttachmentClick = useCallback(() => {
    attachmentClickRef.current?.();
  }, []);

  const messages = useChatStore(s => s.messages);
  const isStreaming = useChatStore(s => s.isStreaming);
  const currentParticipantIndex = useChatStore(s => s.currentParticipantIndex);
  const contextParticipants = useChatStore(s => s.participants);
  const preSearches = useChatStore(s => s.preSearches);

  const { thread, createdThreadId } = useChatStore(
    useShallow(s => ({
      thread: s.thread,
      createdThreadId: s.createdThreadId,
    })),
  );

  const isModeratorStreaming = useChatStore(s => s.isModeratorStreaming);

  const { streamingRoundNumber, waitingToStartStreaming, isCreatingThread, pendingMessage, hasInitiallyLoaded, preSearchResumption, moderatorResumption } = useChatStore(
    useShallow(s => ({
      streamingRoundNumber: s.streamingRoundNumber,
      waitingToStartStreaming: s.waitingToStartStreaming,
      isCreatingThread: s.isCreatingThread,
      pendingMessage: s.pendingMessage,
      hasInitiallyLoaded: s.hasInitiallyLoaded,
      preSearchResumption: s.preSearchResumption,
      moderatorResumption: s.moderatorResumption,
    })),
  );

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

  const effectiveThreadId = thread?.id || createdThreadId || '';
  const currentStreamingParticipant = contextParticipants[currentParticipantIndex] || null;

  const { data: modelsData } = useModelsQuery();
  const { data: customRolesData } = useCustomRolesQuery(isModelModalOpen.value && !isStreaming);

  const { data: changelogResponse, isFetching: isChangelogFetching } = useThreadChangelogQuery(
    effectiveThreadId,
    Boolean(effectiveThreadId),
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
    const existingVisionFiles = messages.some((msg) => {
      if (!msg.parts)
        return false;
      return msg.parts.some((part) => {
        if (part.type !== 'file' || !('mediaType' in part))
          return false;
        return isVisionRequiredMimeType(part.mediaType as string);
      });
    });

    const newVisionFiles = chatAttachments.attachments.some(att =>
      isVisionRequiredMimeType(att.file.type),
    );

    if (!existingVisionFiles && !newVisionFiles) {
      return new Set<string>();
    }

    const files = [{ mimeType: 'image/png' }];

    return getIncompatibleModelIds(allEnabledModels, files);
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

  const feedbackByRound = useChatStore(s => s.feedbackByRound);
  const pendingFeedback = useChatStore(s => s.pendingFeedback);
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
    isChangelogFetching,
  });

  useEffect(() => {
    if (mode === ScreenModes.OVERVIEW && messages.length === 0)
      return;
    if (incompatibleModelIds.size === 0)
      return;

    const incompatibleSelected = selectedParticipants.filter(
      p => incompatibleModelIds.has(p.modelId),
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
  }, [mode, incompatibleModelIds, selectedParticipants, messages.length, threadActions, setSelectedParticipants, allEnabledModels, t]);

  const formActions = useChatFormActions();

  const { showLoader } = useFlowLoading({ mode });

  const isStoreReady = mode === ScreenModes.THREAD ? (hasInitiallyLoaded && messages.length > 0) : true;

  useChatScroll({
    messages,
    enableNearBottomDetection: true,
  });

  const isResumptionActive = (
    preSearchResumption?.status === MessageStatuses.STREAMING
    || preSearchResumption?.status === MessageStatuses.PENDING
    || moderatorResumption?.status === MessageStatuses.STREAMING
    || moderatorResumption?.status === MessageStatuses.PENDING
  );

  const isInputBlocked = isStreaming
    || isCreatingThread
    || waitingToStartStreaming
    || showLoader
    || isModeratorStreaming
    || Boolean(pendingMessage)
    || isResumptionActive
    || formActions.isSubmitting;

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
      const filtered = selectedParticipants.filter(p => p.id !== orderedModel.participant!.id);
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

  const handlePresetSelect = useCallback((models: BaseModelResponse[], preset: ModelPreset) => {
    const latestIncompatible = incompatibleModelIdsRef.current;
    const compatibleModels = latestIncompatible.size > 0
      ? models.filter(m => !latestIncompatible.has(m.id))
      : models;

    const filteredCount = models.length - compatibleModels.length;
    if (filteredCount > 0 && compatibleModels.length > 0) {
      toastManager.warning(
        t('models.presetModelsExcluded'),
        t('models.presetModelsExcludedDescription', { count: filteredCount }),
      );
    }

    if (compatibleModels.length === 0) {
      toastManager.error(
        t('models.presetIncompatible'),
        t('models.presetIncompatibleDescription'),
      );
      return;
    }

    const newParticipants = compatibleModels.map((model, index) => ({
      id: model.id,
      modelId: model.id,
      role: '',
      priority: index,
    }));

    if (mode === ScreenModes.THREAD) {
      threadActions.handleParticipantsChange(newParticipants);
    } else {
      setSelectedParticipants(newParticipants);
    }

    const modelIds = newParticipants.map(p => p.modelId);
    setModelOrder(modelIds);

    if (preset.recommendedMode) {
      if (mode === ScreenModes.THREAD) {
        threadActions.handleModeChange(preset.recommendedMode);
      } else {
        formActions.handleModeChange(preset.recommendedMode);
      }
    }

    if (preset.recommendWebSearch !== undefined) {
      if (mode === ScreenModes.THREAD) {
        threadActions.handleWebSearchToggle(preset.recommendWebSearch);
      } else {
        formActions.handleWebSearchToggle(preset.recommendWebSearch);
      }
    }
  }, [mode, threadActions, formActions, setSelectedParticipants, setModelOrder, t]);

  const handleRemoveParticipant = useCallback((participantId: string) => {
    removeParticipant(participantId);
    if (mode === ScreenModes.THREAD) {
      setHasPendingConfigChanges(true);
    }
  }, [removeParticipant, mode, setHasPendingConfigChanges]);

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
              preSearches={preSearches}
              isDataReady={isStoreReady}
              completedRoundNumbers={completedRoundNumbers}
              isModeratorStreaming={isModeratorStreaming}
            />
          </div>

          <div
            ref={inputContainerRef}
            className="sticky z-30 mt-auto bg-gradient-to-t from-background via-background to-transparent pt-6 relative"
            style={{ bottom: `${keyboardOffset + 16}px` }}
          >
            <div className="w-full max-w-3xl mx-auto px-2 sm:px-4 md:px-6">
              <ChatScrollButton variant="input" />
              <ChatInput
                value={inputValue}
                onChange={setInputValue}
                onSubmit={onSubmit}
                status={isInputBlocked ? 'submitted' : 'ready'}
                placeholder={t('input.placeholder')}
                participants={selectedParticipants}
                quotaCheckType={mode === ScreenModes.OVERVIEW ? 'threads' : 'messages'}
                onRemoveParticipant={isInputBlocked ? undefined : handleRemoveParticipant}
                attachments={chatAttachments.attachments}
                onAddAttachments={chatAttachments.addFiles}
                onRemoveAttachment={chatAttachments.removeAttachment}
                enableAttachments={!isInputBlocked}
                attachmentClickRef={attachmentClickRef}
                isUploading={chatAttachments.isUploading}
                isHydrating={mode === ScreenModes.THREAD && !hasInitiallyLoaded}
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
            <div className="-z-10 absolute inset-x-0 top-full h-4 bg-background pointer-events-none" />
          </div>
        </div>
      </UnifiedErrorBoundary>

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
