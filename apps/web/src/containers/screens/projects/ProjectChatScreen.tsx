import {
  ChatModeSchema,
  DEFAULT_PROJECT_COLOR,
  DEFAULT_PROJECT_ICON,
  PROJECT_LIMITS,
  ScreenModes,
  UploadStatuses,
} from '@roundtable/shared';
import { Link } from '@tanstack/react-router';
import type { ChatStatus } from 'ai';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { ChatInput } from '@/components/chat/chat-input';
import { ChatInputContainer } from '@/components/chat/chat-input-container';
import { ChatInputHeader } from '@/components/chat/chat-input-header';
import { ChatInputToolbarMenu } from '@/components/chat/chat-input-toolbar-menu';
import { ConversationModeModal } from '@/components/chat/conversation-mode-modal';
import type { ModelSelectionModalProps } from '@/components/chat/model-selection-modal';
import { useThreadHeader } from '@/components/chat/thread-header-context';
import { LimitReachedDialog, ProjectIconBadge } from '@/components/projects';
import { useChatStore, useChatStoreApi, useModelPreferencesStore } from '@/components/providers';
import { Button } from '@/components/ui/button';
import { useCustomRolesQuery, useModelsQuery } from '@/hooks/queries';
import {
  useBoolean,
  useChatAttachments,
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
import { MIN_PARTICIPANTS_REQUIRED } from '@/lib/config/participant-limits';
import { useTranslations } from '@/lib/i18n';
import type { ParticipantConfig } from '@/lib/schemas/participant-schemas';
import { showApiErrorToast, toastManager } from '@/lib/toast';
import {
  getApiErrorDetails,
  getDetailedIncompatibleModelIds,
  isDocumentFile,
  isImageFile,
  threadHasDocumentFiles,
  threadHasImageFiles,
} from '@/lib/utils';
import dynamic from '@/lib/utils/dynamic';
import type { GetProjectResponse, Model } from '@/services/api';
import { useAutoModeAnalysis, useChatFormActions, useOverviewActions, useScreenInitialization } from '@/stores/chat';

import { ChatView } from '../chat/ChatView';

const ModelSelectionModal = dynamic<ModelSelectionModalProps>(
  () => import('@/components/chat/model-selection-modal').then(m => ({ default: m.ModelSelectionModal })),
  { ssr: false },
);

type ProjectChatScreenProps = {
  projectId: string;
  project: GetProjectResponse['data'] | null;
};

export default function ProjectChatScreen({ projectId, project }: ProjectChatScreenProps) {
  const t = useTranslations();
  const { data: session } = useSession();
  const sessionUser = session?.user;
  const storeApi = useChatStoreApi();
  const { setThreadActions } = useThreadHeader();
  const isMobile = useIsMobile();
  const [isThreadLimitDialogOpen, setIsThreadLimitDialogOpen] = useState(false);

  // Check if thread limit is reached for this project
  const threadCount = project?.threadCount ?? 0;
  const isThreadLimitReached = threadCount >= PROJECT_LIMITS.MAX_THREADS_PER_PROJECT;

  const { defaultModelId } = useModelLookup();
  const incompatibleModelIdsRef = useRef<Set<string>>(new Set());
  const initStateRef = useRef({
    reset: false,
    modelOrder: false,
    participants: false,
    sync: false,
    threadActions: false,
  });

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

  const {
    inputValue,
    selectedMode,
    selectedParticipants,
    enableWebSearch,
    messages,
    autoMode,
    isAnalyzingPrompt,
    modelOrder,
    setInputValue,
    setSelectedMode,
    setSelectedParticipants,
    addParticipant,
    removeParticipant,
    updateParticipant,
    setEnableWebSearch,
    setAutoMode,
    setModelOrder,
    resetToOverview,
    isStreaming,
    isCreatingThread,
    waitingToStartStreaming,
    showInitialUI,
    createdThreadId,
  } = useChatStore(
    useShallow(s => ({
      inputValue: s.inputValue,
      selectedMode: s.selectedMode,
      selectedParticipants: s.selectedParticipants,
      enableWebSearch: s.enableWebSearch,
      messages: s.messages,
      autoMode: s.autoMode,
      isAnalyzingPrompt: s.isAnalyzingPrompt,
      modelOrder: s.modelOrder,
      setInputValue: s.setInputValue,
      setSelectedMode: s.setSelectedMode,
      setSelectedParticipants: s.setSelectedParticipants,
      addParticipant: s.addParticipant,
      removeParticipant: s.removeParticipant,
      updateParticipant: s.updateParticipant,
      setEnableWebSearch: s.setEnableWebSearch,
      setAutoMode: s.setAutoMode,
      setModelOrder: s.setModelOrder,
      resetToOverview: s.resetToOverview,
      isStreaming: s.isStreaming,
      isCreatingThread: s.isCreatingThread,
      waitingToStartStreaming: s.waitingToStartStreaming,
      showInitialUI: s.showInitialUI,
      createdThreadId: s.createdThreadId,
    })),
  );

  const showChatView = !showInitialUI && createdThreadId;

  const modeModal = useBoolean(false);
  const modelModal = useBoolean(false);

  const chatAttachments = useChatAttachments();
  const attachmentClickRef = useRef<(() => void) | null>(null);

  const { data: modelsData, isLoading: isModelsLoading } = useModelsQuery();
  const { data: customRolesData } = useCustomRolesQuery(modelModal.value && !isStreaming);
  const { analyzeAndApply } = useAutoModeAnalysis(false); // Don't sync to preferences for project chats
  const formActions = useChatFormActions();

  // ✅ FLOW CONTROL: Initialize screen mode and handle URL updates
  useScreenInitialization({ mode: ScreenModes.OVERVIEW });
  useOverviewActions({ projectId });

  const allEnabledModels = useMemo(() => {
    if (!modelsData?.success)
      return [];
    return modelsData.data.items;
  }, [modelsData]);

  const customRoles = useMemo(() => {
    if (!customRolesData?.pages)
      return [];
    return customRolesData.pages.flatMap((page) => {
      if (!page?.success)
        return [];
      return page.data.items;
    });
  }, [customRolesData?.pages]);

  const userTierConfig = useMemo(() => {
    if (!modelsData?.success)
      return undefined;
    return modelsData.data.user_tier_config;
  }, [modelsData]);

  const accessibleModelIds = useMemo(() => {
    if (allEnabledModels.length === 0)
      return [];
    return allEnabledModels
      .filter((m: Model) => m.is_accessible_to_user)
      .map((m: Model) => m.id);
  }, [allEnabledModels]);

  const initialParticipants = useMemo<ParticipantConfig[]>(() => {
    const firstPreset = MODEL_PRESETS[0];
    if (!preferencesHydrated || accessibleModelIds.length === 0)
      return [];

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
      if (presetParticipants.length > 0)
        return presetParticipants;
    }

    const defaultIds = accessibleModelIds.slice(0, 3);
    if (defaultIds.length > 0) {
      return defaultIds.map((modelId: string, index: number) => ({
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

  const { incompatibleModelIds, visionIncompatibleModelIds, fileIncompatibleModelIds } = useMemo(() => {
    const incompatible = new Set<string>();
    const visionIncompatible = new Set<string>();
    const fileIncompatible = new Set<string>();

    for (const model of allEnabledModels) {
      if (!model.is_accessible_to_user) {
        incompatible.add(model.id);
      }
    }

    const existingImageFiles = threadHasImageFiles(messages);
    const newImageFiles = chatAttachments.attachments.some(att => isImageFile(att.file.type));
    const hasImageFiles = existingImageFiles || newImageFiles;

    const existingDocFiles = threadHasDocumentFiles(messages);
    const newDocFiles = chatAttachments.attachments.some(att => isDocumentFile(att.file.type));
    const hasDocumentFiles = existingDocFiles || newDocFiles;

    const filesToCheck: { mimeType: string }[] = [];
    if (hasImageFiles)
      filesToCheck.push({ mimeType: 'image/png' });
    if (hasDocumentFiles)
      filesToCheck.push({ mimeType: 'application/pdf' });

    if (filesToCheck.length > 0) {
      const modelsWithCapabilities = allEnabledModels.map((m: Model) => ({
        id: m.id,
        capabilities: {
          vision: m.supports_vision,
          file: m.supports_file,
        },
      }));
      const detailed = getDetailedIncompatibleModelIds(modelsWithCapabilities, filesToCheck);
      for (const id of detailed.incompatibleIds) {
        incompatible.add(id);
      }
      for (const id of detailed.visionIncompatibleIds) {
        visionIncompatible.add(id);
      }
      for (const id of detailed.fileIncompatibleIds) {
        fileIncompatible.add(id);
      }
    }

    return { incompatibleModelIds: incompatible, visionIncompatibleModelIds: visionIncompatible, fileIncompatibleModelIds: fileIncompatible };
  }, [messages, chatAttachments.attachments, allEnabledModels]);

  useEffect(() => {
    incompatibleModelIdsRef.current = incompatibleModelIds;
  }, [incompatibleModelIds]);

  // Reset store on mount (once only)
  useEffect(() => {
    if (!initStateRef.current.reset) {
      initStateRef.current.reset = true;
      resetToOverview();
    }
  }, [resetToOverview]);

  // Initialize state progressively as data becomes available
  useEffect(() => {
    const init = initStateRef.current;

    // Initialize model order
    if (
      !init.modelOrder
      && allEnabledModels.length > 0
      && modelOrder.length === 0
      && preferencesHydrated
    ) {
      init.modelOrder = true;
      let fullOrder: string[];
      if (persistedModelOrder.length > 0) {
        const availableIds = new Set(allEnabledModels.map((m: Model) => m.id));
        const validPersistedOrder = persistedModelOrder.filter((id: string) => availableIds.has(id));
        const newModelIds = allEnabledModels
          .filter((m: Model) => !validPersistedOrder.includes(m.id))
          .map((m: Model) => m.id);
        fullOrder = [...validPersistedOrder, ...newModelIds];
      } else {
        fullOrder = allEnabledModels.map((m: Model) => m.id);
      }
      setModelOrder(fullOrder);
    }

    // Initialize participants
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

    // Sync accessible models
    if (
      !init.sync
      && preferencesHydrated
      && accessibleModelIds.length > 0
    ) {
      init.sync = true;
      syncWithAccessibleModels(accessibleModelIds);
    }

    // Clear thread actions for project new chat screen
    if (!init.threadActions) {
      init.threadActions = true;
      setThreadActions(null);
    }
  }, [
    allEnabledModels,
    modelOrder.length,
    persistedModelOrder,
    setModelOrder,
    preferencesHydrated,
    selectedParticipants.length,
    defaultModelId,
    initialParticipants,
    setSelectedParticipants,
    selectedMode,
    persistedMode,
    setSelectedMode,
    persistedWebSearch,
    setEnableWebSearch,
    accessibleModelIds,
    syncWithAccessibleModels,
    setThreadActions,
  ]);

  const isOperationBlocked = isStreaming || isCreatingThread || waitingToStartStreaming || formActions.isSubmitting || isAnalyzingPrompt;
  const isToggleDisabled = isOperationBlocked;

  const handleAttachmentClick = useCallback(() => {
    attachmentClickRef.current?.();
  }, []);

  const handlePromptSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    if (!inputValue.trim() || isOperationBlocked)
      return;

    // Check thread limit before proceeding
    if (isThreadLimitReached) {
      setIsThreadLimitDialogOpen(true);
      return;
    }

    if (!chatAttachments.allUploaded)
      return;

    if (autoMode && inputValue.trim()) {
      const hasImageFiles = chatAttachments.attachments.some(att => isImageFile(att.file.type));
      const hasDocumentFiles = chatAttachments.attachments.some(att => isDocumentFile(att.file.type));
      const accessibleSet = new Set<string>(accessibleModelIds);

      await analyzeAndApply({
        prompt: inputValue.trim(),
        hasImageFiles,
        hasDocumentFiles,
        accessibleModelIds: accessibleSet,
      });
    }

    const currentParticipants = storeApi.getState().selectedParticipants;
    if (currentParticipants.length < MIN_PARTICIPANTS_REQUIRED)
      return;

    try {
      const attachmentIds = chatAttachments.getUploadIds();
      const attachmentInfos = chatAttachments.attachments
        .filter(att => att.status === UploadStatuses.COMPLETED && att.uploadId)
        .map((att) => {
          if (!att.uploadId)
            throw new Error('Upload ID required');
          return {
            uploadId: att.uploadId,
            filename: att.file.name,
            mimeType: att.file.type,
            previewUrl: att.preview?.url,
          };
        });

      await formActions.handleCreateThread(attachmentIds, attachmentInfos, projectId);
      chatAttachments.clearAttachments();
    } catch (error) {
      // Check if this is a thread limit error from the API
      const errorDetails = getApiErrorDetails(error);
      const isLimitError = errorDetails.message.toLowerCase().includes('thread limit')
        || errorDetails.message.toLowerCase().includes('limit reached');
      if (isLimitError) {
        setIsThreadLimitDialogOpen(true);
      } else {
        showApiErrorToast('Error creating thread', error);
      }
    }
  }, [inputValue, isOperationBlocked, isThreadLimitReached, chatAttachments, autoMode, accessibleModelIds, analyzeAndApply, storeApi, formActions, projectId]);

  const handleToggleModel = useCallback((modelId: string) => {
    const orderedModel = orderedModels.find(om => om.model.id === modelId);
    if (!orderedModel)
      return;

    if (orderedModel.participant) {
      removeParticipant(modelId);
      const currentParticipants = storeApi.getState().selectedParticipants;
      setPersistedModelIds(currentParticipants.map(p => p.modelId));
    } else {
      const latestIncompatible = incompatibleModelIdsRef.current;
      if (latestIncompatible.has(modelId)) {
        toastManager.warning(t('chat.models.cannotSelectModel'), t('chat.models.modelIncompatibleWithFiles'));
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
      .filter((om): om is typeof om & { participant: NonNullable<typeof om.participant> } => om.participant !== null)
      .map((om, index) => ({ ...om.participant, priority: index }));
    setSelectedParticipants(reorderedParticipants);

    setPersistedModelOrder(newModelOrder);
    setPersistedModelIds(reorderedParticipants.map(p => p.modelId));
  }, [setSelectedParticipants, setModelOrder, setPersistedModelOrder, setPersistedModelIds]);

  const handleWebSearchToggle = useCallback((enabled: boolean) => {
    setEnableWebSearch(enabled);
    setPersistedWebSearch(enabled);
  }, [setEnableWebSearch, setPersistedWebSearch]);

  const handlePresetSelect = useCallback(async (preset: ModelPreset) => {
    const result = await filterPresetParticipants(
      preset,
      incompatibleModelIdsRef.current,
      t,
      ToastNamespaces.CHAT_MODELS,
    );

    if (!result.success)
      return;

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
      enableAttachments={!isOperationBlocked}
      disabled={isOperationBlocked}
      autoMode={autoMode}
      isModelsLoading={isModelsLoading}
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
    isOperationBlocked,
    isModelsLoading,
    autoMode,
  ]);

  const sharedChatInputProps = useMemo(() => {
    const status: ChatStatus = isOperationBlocked ? 'submitted' : 'ready';
    return {
      value: inputValue,
      onChange: setInputValue,
      onSubmit: handlePromptSubmit,
      status,
      placeholder: t('chat.input.placeholder'),
      participants: selectedParticipants,
      onRemoveParticipant: isOperationBlocked ? undefined : removeParticipant,
      attachments: chatAttachments.attachments,
      onAddAttachments: chatAttachments.addFiles,
      onRemoveAttachment: chatAttachments.removeAttachment,
      enableAttachments: !isOperationBlocked,
      attachmentClickRef,
      toolbar: chatInputToolbar,
      isSubmitting: formActions.isSubmitting,
      isUploading: chatAttachments.isUploading,
      isModelsLoading,
      autoMode,
    };
  }, [
    inputValue,
    setInputValue,
    handlePromptSubmit,
    isOperationBlocked,
    isModelsLoading,
    t,
    selectedParticipants,
    removeParticipant,
    chatAttachments.attachments,
    chatAttachments.addFiles,
    chatAttachments.removeAttachment,
    chatInputToolbar,
    formActions.isSubmitting,
    chatAttachments.isUploading,
    autoMode,
  ]);

  if (!project) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-destructive">{t('projects.notFound')}</h1>
          <p className="text-muted-foreground mt-2">
            {t('projects.notFoundDescription')}
          </p>
          <Button asChild className="mt-4">
            <Link to="/chat">{t('projects.backToChat')}</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col relative flex-1">
        {showInitialUI && (
          <>
            {/* Center content area */}
            <div className="flex-1 relative flex flex-col items-center justify-center">
              <div className="container max-w-4xl mx-auto px-5 md:px-6 relative flex flex-col items-center">
                <div className="w-full">
                  <div className="flex flex-col items-center gap-3 text-center relative">
                    {/* Project icon */}
                    <ProjectIconBadge
                      icon={project.icon ?? DEFAULT_PROJECT_ICON}
                      color={project.color ?? DEFAULT_PROJECT_COLOR}
                      size="xl"
                      className="size-16 sm:size-20 rounded-xl"
                      iconClassName="size-8 sm:size-10"
                    />

                    {/* Project name + helper text */}
                    <div className="flex flex-col items-center gap-1">
                      <h1 className="text-xl sm:text-2xl font-semibold text-foreground px-4 leading-tight">
                        {project.name}
                      </h1>
                      <p className="text-sm text-muted-foreground max-w-2xl px-4">
                        {t('projects.startConversation')}
                      </p>
                    </div>

                    {/* Desktop: Input in center */}
                    {!isMobile && (
                      <div className="w-full mt-8">
                        <ChatInputContainer
                          participants={selectedParticipants}
                          inputValue={inputValue}
                          isModelsLoading={isModelsLoading}
                          autoMode={autoMode}
                        >
                          <ChatInputHeader
                            autoMode={autoMode}
                            onAutoModeChange={setAutoMode}
                            isAnalyzing={isAnalyzingPrompt}
                            disabled={isToggleDisabled && !isAnalyzingPrompt}
                            className="border-0 rounded-none"
                          />
                          <ChatInput {...sharedChatInputProps} className="border-0 shadow-none rounded-none" hideInternalAlerts />
                        </ChatInputContainer>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Mobile: Sticky bottom input */}
            {isMobile && (
              <div className="sticky bottom-0 z-30 bg-gradient-to-t from-background via-background to-transparent pt-4">
                <div className="container max-w-4xl mx-auto px-5 pb-4">
                  <ChatInputContainer
                    participants={selectedParticipants}
                    inputValue={inputValue}
                    isModelsLoading={isModelsLoading}
                    autoMode={autoMode}
                  >
                    <ChatInputHeader
                      autoMode={autoMode}
                      onAutoModeChange={setAutoMode}
                      isAnalyzing={isAnalyzingPrompt}
                      disabled={isToggleDisabled && !isAnalyzingPrompt}
                      className="border-0 rounded-none"
                    />
                    <ChatInput {...sharedChatInputProps} className="border-0 shadow-none rounded-none" hideInternalAlerts />
                  </ChatInputContainer>
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
            threadId={createdThreadId || undefined}
          />
        )}
      </div>

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
          visionIncompatibleModelIds={visionIncompatibleModelIds}
          fileIncompatibleModelIds={fileIncompatibleModelIds}
        />
      )}

      {/* Thread Limit Dialog */}
      <LimitReachedDialog
        open={isThreadLimitDialogOpen}
        onOpenChange={setIsThreadLimitDialogOpen}
        type="thread"
        max={PROJECT_LIMITS.MAX_THREADS_PER_PROJECT}
      />
    </>
  );
}
