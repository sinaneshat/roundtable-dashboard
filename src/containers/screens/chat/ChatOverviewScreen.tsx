'use client';

import type { ChatStatus } from 'ai';
import { motion } from 'motion/react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';

import {
  ChatModeSchema,
  ErrorBoundaryContexts,
  MessageStatuses,
  ScreenModes,
  UploadStatuses,
} from '@/api/core/enums';
import { ChatInput } from '@/components/chat/chat-input';
import { ChatInputHeader } from '@/components/chat/chat-input-header';
import { ChatInputToolbarMenu } from '@/components/chat/chat-input-toolbar-menu';
import { ChatInputUpgradeBanner } from '@/components/chat/chat-input-upgrade-banner';
import { ChatQuickStart } from '@/components/chat/chat-quick-start';
import { ChatThreadActions } from '@/components/chat/chat-thread-actions';
import { ConversationModeModal } from '@/components/chat/conversation-mode-modal';
import { ModelSelectionModal } from '@/components/chat/model-selection-modal';
import { useThreadHeader } from '@/components/chat/thread-header-context';
import { UnifiedErrorBoundary } from '@/components/chat/unified-error-boundary';
import {
  useChatStore,
  useChatStoreApi,
  useModelPreferencesStore,
} from '@/components/providers';
import { LogoGlow } from '@/components/ui/logo-glow';
import { BRAND } from '@/constants/brand';
import { useCustomRolesQuery, useModelsQuery } from '@/hooks/queries';
import {
  useAnalyzePromptStream,
  useBoolean,
  useChatAttachments,
  useFreeTrialState,
  useIsMobile,
  useModelLookup,
  useOrderedModels,
} from '@/hooks/utils';
import { useSession } from '@/lib/auth/client';
import { getDefaultChatMode } from '@/lib/config/chat-modes';
import type { ModelPreset } from '@/lib/config/model-presets';
import {
  filterPresetParticipants,
  MODEL_PRESETS,
  ToastNamespaces,
} from '@/lib/config/model-presets';
import type { ParticipantConfig } from '@/lib/schemas/participant-schemas';
import { showApiErrorToast, toastManager } from '@/lib/toast';
import {
  getIncompatibleModelIds,
  isVisionRequiredMimeType,
  threadHasVisionRequiredFiles,
} from '@/lib/utils';
import {
  useChatFormActions,
  useOverviewActions,
  useScreenInitialization,
} from '@/stores/chat';

import { ChatView } from './ChatView';

const ChatDeleteDialog = dynamic(
  () => import('@/components/chat/chat-delete-dialog').then(m => m.ChatDeleteDialog),
  { ssr: false },
);

export default function ChatOverviewScreen() {
  const t = useTranslations();
  const pathname = usePathname();
  const { data: session } = useSession();
  const sessionUser = session?.user;

  const { defaultModelId } = useModelLookup();

  const {
    _hasHydrated: preferencesHydrated,
    modelOrder: persistedModelOrder,
    selectedMode: persistedMode,
    enableWebSearch: persistedWebSearch,
    selectedModelIds: persistedModelIds,
    setSelectedModelIds: setPersistedModelIds,
    setModelOrder: setPersistedModelOrder,
    setSelectedMode: setPersistedMode,
    setEnableWebSearch: setPersistedWebSearch,
    syncWithAccessibleModels,
  } = useModelPreferencesStore(useShallow(s => ({
    _hasHydrated: s._hasHydrated,
    modelOrder: s.modelOrder,
    selectedMode: s.selectedMode,
    enableWebSearch: s.enableWebSearch,
    selectedModelIds: s.selectedModelIds,
    setSelectedModelIds: s.setSelectedModelIds,
    setModelOrder: s.setModelOrder,
    setSelectedMode: s.setSelectedMode,
    setEnableWebSearch: s.setEnableWebSearch,
    syncWithAccessibleModels: s.syncWithAccessibleModels,
  })));

  const { isStreaming, error: streamError, isModeratorStreaming } = useChatStore(
    useShallow(s => ({
      isStreaming: s.isStreaming,
      error: s.error,
      isModeratorStreaming: s.isModeratorStreaming,
    })),
  );

  const { thread: currentThread, participants: contextParticipants } = useChatStore(
    useShallow(s => ({
      thread: s.thread,
      participants: s.participants,
    })),
  );

  const { showInitialUI, isCreatingThread, createdThreadId, waitingToStartStreaming } = useChatStore(
    useShallow(s => ({
      showInitialUI: s.showInitialUI,
      isCreatingThread: s.isCreatingThread,
      createdThreadId: s.createdThreadId,
      waitingToStartStreaming: s.waitingToStartStreaming,
    })),
  );

  const {
    inputValue,
    selectedMode,
    selectedParticipants,
    enableWebSearch,
    preSearches,
    messages,
    autoMode,
    isAnalyzingPrompt,
    setInputValue,
    setSelectedMode,
    setSelectedParticipants,
    addParticipant,
    removeParticipant,
    updateParticipant,
    setEnableWebSearch,
    setAutoMode,
    setIsAnalyzingPrompt,
    resetToOverview,
  } = useChatStore(
    useShallow(s => ({
      inputValue: s.inputValue,
      selectedMode: s.selectedMode,
      selectedParticipants: s.selectedParticipants,
      enableWebSearch: s.enableWebSearch,
      preSearches: s.preSearches,
      messages: s.messages,
      autoMode: s.autoMode,
      isAnalyzingPrompt: s.isAnalyzingPrompt,
      setInputValue: s.setInputValue,
      setSelectedMode: s.setSelectedMode,
      setSelectedParticipants: s.setSelectedParticipants,
      addParticipant: s.addParticipant,
      removeParticipant: s.removeParticipant,
      updateParticipant: s.updateParticipant,
      setEnableWebSearch: s.setEnableWebSearch,
      setAutoMode: s.setAutoMode,
      setIsAnalyzingPrompt: s.setIsAnalyzingPrompt,
      resetToOverview: s.resetToOverview,
    })),
  );

  const storeApi = useChatStoreApi();

  const hasSentInitialPromptRef = useRef(false);
  const hasInitializedModelsRef = useRef(false);
  const { setThreadActions } = useThreadHeader();

  const modeModal = useBoolean(false);
  const modelModal = useBoolean(false);
  const isDeleteDialogOpen = useBoolean(false);

  const isMobile = useIsMobile();

  const chatAttachments = useChatAttachments();

  const attachmentClickRef = useRef<(() => void) | null>(null);
  const handleAttachmentClick = useCallback(() => {
    attachmentClickRef.current?.();
  }, []);

  const { data: modelsData, isLoading: isModelsLoading } = useModelsQuery();
  const { data: customRolesData } = useCustomRolesQuery(modelModal.value && !isStreaming);
  const { streamConfig: analyzePromptStream } = useAnalyzePromptStream();
  const { borderVariant: headerBorderVariant } = useFreeTrialState();

  const allEnabledModels = useMemo(
    () => modelsData?.data?.items || [],
    [modelsData?.data?.items],
  );

  const customRoles = customRolesData?.pages?.flatMap(page =>
    (page?.success && page.data?.items) ? page.data.items : [],
  ) ?? [];

  const userTierConfig = modelsData?.data?.user_tier_config;

  const { modelOrder, setModelOrder } = useChatStore(
    useShallow(s => ({
      modelOrder: s.modelOrder,
      setModelOrder: s.setModelOrder,
    })),
  );

  const accessibleModelIds = useMemo(() => {
    if (allEnabledModels.length === 0)
      return [];
    return allEnabledModels
      .filter(m => m.is_accessible_to_user)
      .map(m => m.id);
  }, [allEnabledModels]);

  // Get the first preset (Quick Perspectives) for default selection
  const initialParticipants = useMemo<ParticipantConfig[]>(() => {
    const firstPreset = MODEL_PRESETS[0];
    if (!preferencesHydrated || accessibleModelIds.length === 0) {
      return [];
    }

    // Use persisted selection if available and valid
    if (persistedModelIds.length > 0) {
      const validIds = persistedModelIds.filter(id => accessibleModelIds.includes(id));
      if (validIds.length > 0) {
        return validIds.map((modelId, index) => ({
          id: modelId,
          modelId,
          role: '',
          priority: index,
        }));
      }
    }

    if (firstPreset) {
      const accessibleSet = new Set(accessibleModelIds);
      const presetParticipants = firstPreset.modelRoles
        .filter(mr => accessibleSet.has(mr.modelId))
        .map((mr, index) => ({
          id: mr.modelId,
          modelId: mr.modelId,
          role: mr.role,
          priority: index,
        }));

      if (presetParticipants.length > 0) {
        return presetParticipants;
      }
    }

    const defaultIds = accessibleModelIds.slice(0, 3);
    if (defaultIds.length > 0) {
      return defaultIds.map((modelId, index) => ({
        id: modelId,
        modelId,
        role: '',
        priority: index,
      }));
    }

    if (defaultModelId) {
      return [{
        id: defaultModelId,
        modelId: defaultModelId,
        role: '',
        priority: 0,
      }];
    }

    return [];
  }, [preferencesHydrated, accessibleModelIds, persistedModelIds, defaultModelId]);

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

    const existingVisionFiles = threadHasVisionRequiredFiles(messages);
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

  const formActions = useChatFormActions();
  const overviewActions = useOverviewActions();

  const initStateRef = useRef({
    persistedDefaults: false,
    syncedModels: false,
    modelOrder: false,
    participants: false,
    threadActions: false,
  });

  useEffect(() => {
    const init = initStateRef.current;

    if (
      !init.persistedDefaults
      && preferencesHydrated
      && accessibleModelIds.length > 0
      && persistedModelIds.length === 0
    ) {
      init.persistedDefaults = true;
      const firstPreset = MODEL_PRESETS[0];
      if (firstPreset) {
        const accessibleSet = new Set(accessibleModelIds);
        const presetModelIds = firstPreset.modelRoles
          .filter(mr => accessibleSet.has(mr.modelId))
          .map(mr => mr.modelId);
        if (presetModelIds.length > 0) {
          setPersistedModelIds(presetModelIds);
          setPersistedMode(firstPreset.mode);
          setPersistedWebSearch(firstPreset.searchEnabled === true);
        } else {
          const defaultIds = accessibleModelIds.slice(0, 3);
          if (defaultIds.length > 0) {
            setPersistedModelIds(defaultIds);
          }
        }
      } else {
        const defaultIds = accessibleModelIds.slice(0, 3);
        if (defaultIds.length > 0) {
          setPersistedModelIds(defaultIds);
        }
      }
    }

    if (
      !init.syncedModels
      && preferencesHydrated
      && accessibleModelIds.length > 0
    ) {
      init.syncedModels = true;
      syncWithAccessibleModels(accessibleModelIds);
    }

    if (
      !init.modelOrder
      && allEnabledModels.length > 0
      && modelOrder.length === 0
      && preferencesHydrated
    ) {
      init.modelOrder = true;
      let fullOrder: string[];
      if (persistedModelOrder.length > 0) {
        const availableIds = new Set(allEnabledModels.map(m => m.id));
        const validPersistedOrder = persistedModelOrder.filter(id => availableIds.has(id));
        const newModelIds = allEnabledModels
          .filter(m => !validPersistedOrder.includes(m.id))
          .map(m => m.id);
        fullOrder = [...validPersistedOrder, ...newModelIds];
      } else {
        fullOrder = allEnabledModels.map(m => m.id);
      }
      setModelOrder(fullOrder);
    }

    if (
      !init.participants
      && selectedParticipants.length === 0
      && defaultModelId
      && initialParticipants.length > 0
    ) {
      init.participants = true;
      setSelectedParticipants(initialParticipants);
      if (!selectedMode) {
        const modeResult = ChatModeSchema.safeParse(persistedMode);
        const firstPreset = MODEL_PRESETS[0];
        const defaultMode = firstPreset?.mode ?? getDefaultChatMode();
        setSelectedMode(modeResult.success ? modeResult.data : defaultMode);
      }
      const firstPreset = MODEL_PRESETS[0];
      const defaultWebSearch = firstPreset?.searchEnabled === true;
      setEnableWebSearch(persistedWebSearch ?? defaultWebSearch);
    }

    if (!init.threadActions) {
      init.threadActions = true;
      setThreadActions(null);
    }
  }, [
    preferencesHydrated,
    accessibleModelIds,
    persistedModelIds.length,
    setPersistedModelIds,
    setPersistedMode,
    setPersistedWebSearch,
    syncWithAccessibleModels,
    allEnabledModels,
    modelOrder.length,
    persistedModelOrder,
    setModelOrder,
    selectedParticipants.length,
    defaultModelId,
    initialParticipants,
    setSelectedParticipants,
    selectedMode,
    persistedMode,
    setSelectedMode,
    persistedWebSearch,
    setEnableWebSearch,
    setThreadActions,
  ]);

  useEffect(() => {
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

    const compatibleParticipants = selectedParticipants.filter(
      p => !incompatibleModelIds.has(p.modelId),
    );

    const reindexed = compatibleParticipants.map((p, index) => ({
      ...p,
      priority: index,
    }));

    setSelectedParticipants(reindexed);
    setPersistedModelIds(reindexed.map(p => p.modelId));

    if (incompatibleModelNames.length > 0) {
      const modelList = incompatibleModelNames.length <= 2
        ? incompatibleModelNames.join(' and ')
        : `${incompatibleModelNames.slice(0, 2).join(', ')} and ${incompatibleModelNames.length - 2} more`;

      toastManager.warning(
        t('chat.models.modelsDeselected'),
        t('chat.models.modelsDeselectedDescription', { models: modelList }),
      );
    }
  }, [incompatibleModelIds, selectedParticipants, setSelectedParticipants, setPersistedModelIds, allEnabledModels, t]);

  const threadActions = useMemo(
    () => currentThread && !showInitialUI
      ? (
          <ChatThreadActions
            thread={currentThread}
            slug={currentThread.slug}
            onDeleteClick={isDeleteDialogOpen.onTrue}
          />
        )
      : null,
    [currentThread, showInitialUI, isDeleteDialogOpen.onTrue],
  );

  useEffect(() => {
    setThreadActions(threadActions);
  }, [threadActions, setThreadActions]);

  const shouldInitializeThread = Boolean(createdThreadId && currentThread);
  const hasActivePreSearch = preSearches.some(
    ps => ps.status === MessageStatuses.PENDING || ps.status === MessageStatuses.STREAMING,
  );

  useScreenInitialization({
    mode: ScreenModes.OVERVIEW,
    thread: shouldInitializeThread ? currentThread : null,
    participants: shouldInitializeThread ? contextParticipants : [],
    chatMode: selectedMode,
    enableOrchestrator: !isStreaming
      && !isModeratorStreaming
      && !hasActivePreSearch
      && shouldInitializeThread,
  });

  const pendingMessage = useChatStore(s => s.pendingMessage);
  const isInitialUIInputBlocked = isStreaming || isCreatingThread || waitingToStartStreaming || formActions.isSubmitting || isModelsLoading || isAnalyzingPrompt;
  const isSubmitBlocked = isStreaming || isModeratorStreaming || Boolean(pendingMessage) || formActions.isSubmitting;

  const lastResetPathRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    if (pathname === '/chat' && lastResetPathRef.current !== '/chat') {
      const currentState = storeApi.getState();
      const hasActiveConversation = currentState.messages.length > 0
        || currentState.thread !== null
        || currentState.createdThreadId !== null;
      const isFormSubmitting = currentState.pendingMessage !== null && !currentState.hasSentPendingMessage;
      const isStreamingActive = currentState.isStreaming || currentState.streamingRoundNumber !== null;
      const hasActivePreSearch = currentState.preSearches.some(
        ps => ps.status === MessageStatuses.PENDING || ps.status === MessageStatuses.STREAMING,
      );

      if (hasActiveConversation || isFormSubmitting || isStreamingActive || hasActivePreSearch) {
        lastResetPathRef.current = '/chat';
        return;
      }

      lastResetPathRef.current = '/chat';
      resetToOverview();
      hasSentInitialPromptRef.current = false;
      hasInitializedModelsRef.current = false;
      chatAttachments.clearAttachments();

      initStateRef.current = {
        persistedDefaults: false,
        syncedModels: false,
        modelOrder: false,
        participants: false,
        threadActions: false,
      };
    } else {
      lastResetPathRef.current = pathname;
    }
  }, [pathname, resetToOverview, chatAttachments, storeApi]);

  const handlePromptSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      const existingThreadId = currentThread?.id || createdThreadId;

      if (existingThreadId) {
        if (!inputValue.trim() || selectedParticipants.length === 0 || isSubmitBlocked) {
          return;
        }

        if (!chatAttachments.allUploaded) {
          return;
        }

        try {
          const attachmentIds = chatAttachments.getUploadIds();
          const attachmentInfos = chatAttachments.attachments
            .filter(att => att.status === UploadStatuses.COMPLETED && att.uploadId)
            .map(att => ({
              uploadId: att.uploadId!,
              filename: att.file.name,
              mimeType: att.file.type,
              previewUrl: att.preview?.url,
            }));
          await formActions.handleUpdateThreadAndSend(existingThreadId, attachmentIds, attachmentInfos);
          chatAttachments.clearAttachments();
        } catch (error) {
          console.error('[ChatOverview] Error sending message:', error);
          showApiErrorToast('Error sending message', error);
        }
      } else {
        if (!inputValue.trim() || isInitialUIInputBlocked) {
          return;
        }

        if (!chatAttachments.allUploaded) {
          return;
        }

        if (autoMode && inputValue.trim()) {
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
              setPersistedModelIds(newParticipants.map((p: { modelId: string }) => p.modelId));
              setPersistedModelOrder(newParticipants.map((p: { modelId: string }) => p.modelId));
              setPersistedMode(recommendedMode);
              setPersistedWebSearch(recommendedWebSearch);
            }
          } catch {
            console.error('[ChatOverview] Auto mode analysis failed, using current config');
          } finally {
            setIsAnalyzingPrompt(false);
          }
        }

        const currentParticipants = storeApi.getState().selectedParticipants;
        if (currentParticipants.length === 0) {
          return;
        }

        try {
          const attachmentIds = chatAttachments.getUploadIds();
          const attachmentInfos = chatAttachments.attachments
            .filter(att => att.status === UploadStatuses.COMPLETED && att.uploadId)
            .map(att => ({
              uploadId: att.uploadId!,
              filename: att.file.name,
              mimeType: att.file.type,
              previewUrl: att.preview?.url,
            }));
          await formActions.handleCreateThread(attachmentIds, attachmentInfos);
          hasSentInitialPromptRef.current = true;
          chatAttachments.clearAttachments();
        } catch (error) {
          console.error('[ChatOverview] Error creating thread:', error);
          showApiErrorToast('Error creating thread', error);
        }
      }
    },
    [inputValue, selectedParticipants, isInitialUIInputBlocked, isSubmitBlocked, formActions, currentThread?.id, createdThreadId, chatAttachments, autoMode, setIsAnalyzingPrompt, analyzePromptStream, setSelectedParticipants, setModelOrder, setSelectedMode, setEnableWebSearch, setPersistedModelIds, setPersistedModelOrder, setPersistedMode, setPersistedWebSearch, storeApi],
  );

  const handleToggleModel = useCallback((modelId: string) => {
    const orderedModel = orderedModels.find(om => om.model.id === modelId);
    if (!orderedModel) {
      return;
    }

    if (orderedModel.participant) {
      removeParticipant(modelId);
      const currentParticipants = storeApi.getState().selectedParticipants;
      setPersistedModelIds(currentParticipants.map(p => p.modelId));
    } else {
      const latestIncompatible = incompatibleModelIdsRef.current;
      if (latestIncompatible.has(modelId)) {
        toastManager.warning(
          t('chat.models.cannotSelectModel'),
          t('chat.models.modelIncompatibleWithFiles'),
        );
        return;
      }

      const newParticipant: ParticipantConfig = {
        id: modelId,
        modelId,
        role: '',
        priority: 0,
      };
      addParticipant(newParticipant);
      const currentParticipants = storeApi.getState().selectedParticipants;
      setPersistedModelIds(currentParticipants.map(p => p.modelId));
    }
  }, [orderedModels, removeParticipant, addParticipant, setPersistedModelIds, storeApi, t]);

  const handleRoleChange = useCallback((modelId: string, role: string, customRoleId?: string) => {
    updateParticipant(modelId, { role, customRoleId });
  }, [updateParticipant]);

  const handleClearRole = useCallback(
    (modelId: string) => updateParticipant(modelId, { role: '', customRoleId: undefined }),
    [updateParticipant],
  );

  const handleReorderModels = useCallback((newOrder: typeof orderedModels) => {
    const newModelOrder = newOrder.map(om => om.model.id);
    setModelOrder(newModelOrder);

    const reorderedParticipants = newOrder
      .filter(om => om.participant !== null)
      .map((om, index) => ({
        ...om.participant!,
        priority: index,
      }));
    setSelectedParticipants(reorderedParticipants);

    setPersistedModelOrder(newModelOrder);
    setPersistedModelIds(reorderedParticipants.map(p => p.modelId));
  }, [setSelectedParticipants, setModelOrder, setPersistedModelOrder, setPersistedModelIds]);

  const handleWebSearchToggle = useCallback((enabled: boolean) => {
    setEnableWebSearch(enabled);
    setPersistedWebSearch(enabled);
  }, [setEnableWebSearch, setPersistedWebSearch]);

  const handlePresetSelect = useCallback((preset: ModelPreset) => {
    const result = filterPresetParticipants(
      preset,
      incompatibleModelIdsRef.current,
      t,
      ToastNamespaces.CHAT_MODELS,
    );

    if (!result.success) {
      return;
    }

    setSelectedParticipants(result.participants);
    const modelIds = result.participants.map(p => p.modelId);
    setPersistedModelIds(modelIds);
    setModelOrder(modelIds);
    setPersistedModelOrder(modelIds);

    setSelectedMode(preset.mode);
    setPersistedMode(preset.mode);

    const searchEnabled = preset.searchEnabled === 'conditional' ? true : preset.searchEnabled;
    setEnableWebSearch(searchEnabled);
    setPersistedWebSearch(searchEnabled);
  }, [setSelectedParticipants, setPersistedModelIds, setModelOrder, setPersistedModelOrder, setSelectedMode, setPersistedMode, setEnableWebSearch, setPersistedWebSearch, t]);

  const chatInputToolbar = useMemo(() => (
    <ChatInputToolbarMenu
      selectedParticipants={selectedParticipants}
      allModels={allEnabledModels}
      onOpenModelModal={() => modelModal.onTrue()}
      selectedMode={selectedMode || getDefaultChatMode()}
      onOpenModeModal={() => modeModal.onTrue()}
      enableWebSearch={enableWebSearch}
      onWebSearchToggle={handleWebSearchToggle}
      onAttachmentClick={handleAttachmentClick}
      attachmentCount={chatAttachments.attachments.length}
      enableAttachments={!isInitialUIInputBlocked}
      disabled={isInitialUIInputBlocked}
      autoMode={autoMode}
    />
  ), [
    selectedParticipants,
    allEnabledModels,
    modelModal,
    selectedMode,
    modeModal,
    enableWebSearch,
    handleWebSearchToggle,
    handleAttachmentClick,
    chatAttachments.attachments.length,
    isInitialUIInputBlocked,
    autoMode,
  ]);

  const sharedChatInputProps = useMemo(() => {
    const status: ChatStatus = isInitialUIInputBlocked ? 'submitted' : 'ready';
    return {
      value: inputValue,
      onChange: setInputValue,
      onSubmit: handlePromptSubmit,
      status,
      placeholder: t('chat.input.placeholder'),
      participants: selectedParticipants,
      onRemoveParticipant: isInitialUIInputBlocked ? undefined : removeParticipant,
      attachments: chatAttachments.attachments,
      onAddAttachments: chatAttachments.addFiles,
      onRemoveAttachment: chatAttachments.removeAttachment,
      enableAttachments: !isInitialUIInputBlocked,
      attachmentClickRef,
      toolbar: chatInputToolbar,
      isSubmitting: formActions.isSubmitting,
      isUploading: chatAttachments.isUploading,
    };
  }, [
    inputValue,
    setInputValue,
    handlePromptSubmit,
    isInitialUIInputBlocked,
    t,
    selectedParticipants,
    removeParticipant,
    chatAttachments.attachments,
    chatAttachments.addFiles,
    chatAttachments.removeAttachment,
    attachmentClickRef,
    chatInputToolbar,
    formActions.isSubmitting,
    chatAttachments.isUploading,
  ]);

  const showChatView = !showInitialUI && (currentThread || createdThreadId);

  return (
    <>
      <UnifiedErrorBoundary context={ErrorBoundaryContexts.CHAT}>
        <div className="flex flex-col relative flex-1">
          {showInitialUI && (
            <>
              <div className="flex-1 relative">
                <div className="container max-w-4xl mx-auto px-5 md:px-6 relative flex flex-col items-center pt-6 sm:pt-8 pb-4">
                  <motion.div
                    key="initial-ui"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.4, ease: 'easeOut' }}
                    className="w-full"
                  >
                    <div className="flex flex-col items-center gap-4 sm:gap-6 text-center relative">
                      <motion.div
                        className="relative h-20 w-20 sm:h-24 sm:w-24"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ scale: 0.5, opacity: 0, y: -50 }}
                        transition={{ delay: 0.1, duration: 0.5, ease: 'easeOut' }}
                      >
                        <LogoGlow />
                        <motion.div
                          className="relative w-full h-full"
                          animate={{
                            rotate: 360,
                            scale: [1, 1.03, 1],
                          }}
                          transition={{
                            rotate: {
                              duration: 60,
                              repeat: Infinity,
                              ease: 'linear',
                            },
                            scale: {
                              duration: 4,
                              repeat: Infinity,
                              ease: 'easeInOut',
                            },
                          }}
                          style={{ willChange: 'transform' }}
                        >
                          <Image
                            src={BRAND.logos.main}
                            alt={BRAND.name}
                            className="w-full h-full object-contain"
                            width={96}
                            height={96}
                            priority
                          />
                        </motion.div>
                      </motion.div>

                      <div className="flex flex-col items-center gap-1.5">
                        <motion.h1
                          className="text-3xl sm:text-4xl font-semibold text-foreground px-4 leading-tight"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -30 }}
                          transition={{ delay: 0.25, duration: 0.4, ease: 'easeOut' }}
                        >
                          {BRAND.name}
                        </motion.h1>

                        <motion.p
                          className="text-sm sm:text-base text-muted-foreground max-w-2xl px-4 leading-relaxed"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -30 }}
                          transition={{ delay: 0.35, duration: 0.4, ease: 'easeOut' }}
                        >
                          {BRAND.tagline}
                        </motion.p>
                      </div>

                      <motion.div
                        className="w-full mt-6 sm:mt-8"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ delay: 0.45, duration: 0.4, ease: 'easeOut' }}
                      >
                        <ChatQuickStart onSuggestionClick={overviewActions.handleSuggestionClick} />
                      </motion.div>

                      {!isMobile && (
                        <motion.div
                          className="w-full mt-14"
                          initial={{ opacity: 0, y: 15 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          transition={{ delay: 0.55, duration: 0.4, ease: 'easeOut' }}
                        >
                          <div className="flex flex-col">
                            <ChatInputUpgradeBanner />
                            <ChatInputHeader
                              autoMode={autoMode}
                              onAutoModeChange={setAutoMode}
                              isAnalyzing={isAnalyzingPrompt}
                              disabled={isInitialUIInputBlocked && !isAnalyzingPrompt}
                              borderVariant={headerBorderVariant}
                            />
                            <ChatInput {...sharedChatInputProps} className="rounded-t-none border-t-0" hideInternalAlerts borderVariant={headerBorderVariant} />
                          </div>
                        </motion.div>
                      )}
                    </div>
                  </motion.div>
                </div>
              </div>

              {isMobile && (
                <div className="sticky bottom-0 z-30 bg-gradient-to-t from-background via-background to-transparent pt-4">
                  <div className="container max-w-4xl mx-auto px-5 pb-4">
                    <motion.div
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ delay: 0.55, duration: 0.4, ease: 'easeOut' }}
                    >
                      <div className="flex flex-col">
                        <ChatInputUpgradeBanner />
                        <ChatInputHeader
                          autoMode={autoMode}
                          onAutoModeChange={setAutoMode}
                          isAnalyzing={isAnalyzingPrompt}
                          disabled={isInitialUIInputBlocked && !isAnalyzingPrompt}
                          borderVariant={headerBorderVariant}
                        />
                        <ChatInput {...sharedChatInputProps} className="rounded-t-none border-t-0" hideInternalAlerts borderVariant={headerBorderVariant} />
                      </div>
                    </motion.div>
                  </div>
                </div>
              )}
            </>
          )}

          {showChatView && (
            <ChatView
              user={{
                name: sessionUser?.name || 'You',
                image: sessionUser?.image || null,
              }}
              mode={ScreenModes.OVERVIEW}
              onSubmit={handlePromptSubmit}
              chatAttachments={chatAttachments}
              threadId={currentThread?.id || createdThreadId || undefined}
            />
          )}

          {streamError && !isStreaming && !showInitialUI && (
            <div className="flex justify-center mt-4">
              <div className="px-4 py-2 text-sm text-destructive">
                {streamError instanceof Error ? streamError.message : String(streamError)}
              </div>
            </div>
          )}
        </div>
      </UnifiedErrorBoundary>

      <ConversationModeModal
        open={modeModal.value}
        onOpenChange={modeModal.setValue}
        selectedMode={selectedMode || getDefaultChatMode()}
        onModeSelect={(mode) => {
          setSelectedMode(mode);
          setPersistedMode(mode);
          modeModal.onFalse();
        }}
      />

      {userTierConfig && (
        <ModelSelectionModal
          open={modelModal.value}
          onOpenChange={modelModal.setValue}
          orderedModels={orderedModels}
          onReorder={handleReorderModels}
          customRoles={customRoles}
          onToggle={handleToggleModel}
          onRoleChange={handleRoleChange}
          onClearRole={handleClearRole}
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

      {currentThread && (
        <ChatDeleteDialog
          isOpen={isDeleteDialogOpen.value}
          onOpenChange={isDeleteDialogOpen.setValue}
          threadId={currentThread.id}
          threadSlug={currentThread.slug}
        />
      )}
    </>
  );
}
