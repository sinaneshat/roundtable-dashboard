'use client';

/**
 * ChatOverviewScreen - Initial Chat Landing Page
 *
 * Shows the initial UI (logo, tagline, suggestions) and handles thread creation.
 * Once a thread is created, delegates all rendering to ChatView for consistent
 * behavior with the thread screen.
 *
 * ARCHITECTURE:
 * - Initial UI: Logo, tagline, quick start suggestions
 * - Thread creation: handleCreateThread via form actions
 * - Post-creation: ChatView handles all rendering (same as thread screen)
 */

import { AnimatePresence, motion } from 'motion/react';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { ChatModeSchema, MessageStatuses } from '@/api/core/enums';
import type { BaseModelResponse } from '@/api/routes/models/schema';
import { ChatInput } from '@/components/chat/chat-input';
import { ChatInputToolbarMenu } from '@/components/chat/chat-input-toolbar-menu';
import { ChatQuickStart } from '@/components/chat/chat-quick-start';
import { ChatThreadActions } from '@/components/chat/chat-thread-actions';
import { ConversationModeModal } from '@/components/chat/conversation-mode-modal';
import { ModelSelectionModal } from '@/components/chat/model-selection-modal';
import { useThreadHeader } from '@/components/chat/thread-header-context';
import { UnifiedErrorBoundary } from '@/components/chat/unified-error-boundary';
import { useChatStore, useChatStoreApi } from '@/components/providers/chat-store-provider';
import { RadialGlow } from '@/components/ui/radial-glow';
import { BRAND } from '@/constants/brand';
import { useCustomRolesQuery } from '@/hooks/queries/chat';
import { useModelsQuery } from '@/hooks/queries/models';
import {
  useBoolean,
  useChatAttachments,
  useIsMobile,
  useModelLookup,
  useOrderedModels,
} from '@/hooks/utils';
import { useSession } from '@/lib/auth/client';
import { getDefaultChatMode } from '@/lib/config/chat-modes';
import type { ParticipantConfig } from '@/lib/schemas/participant-schemas';
import { showApiErrorToast, toastManager } from '@/lib/toast';
import { getIncompatibleModelIds } from '@/lib/utils/file-capability';
import {
  useChatFormActions,
  useOverviewActions,
  useScreenInitialization,
} from '@/stores/chat';
import { useModelPreferencesStore } from '@/stores/preferences';

import { ChatView } from './ChatView';

export default function ChatOverviewScreen() {
  const t = useTranslations();
  const pathname = usePathname();
  const { data: session } = useSession();
  const sessionUser = session?.user;

  // Model lookup for defaults
  const { defaultModelId } = useModelLookup();

  // ============================================================================
  // PREFERENCES STORE (Cookie-persisted model selection + mode/webSearch)
  // ============================================================================
  // ✅ FIX: Read _hasHydrated directly from store state instead of useModelPreferencesHydrated hook
  // The hook uses useState(false) + useEffect which creates a timing gap on first render.
  // Reading from store state ensures we see the true hydration status immediately.
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

  // ============================================================================
  // STORE STATE
  // ============================================================================

  const { isStreaming, error: streamError, isCreatingSummary } = useChatStore(
    useShallow(s => ({
      isStreaming: s.isStreaming,
      error: s.error,
      isCreatingSummary: s.isCreatingSummary,
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

  const { inputValue, selectedMode, selectedParticipants, enableWebSearch } = useChatStore(
    useShallow(s => ({
      inputValue: s.inputValue,
      selectedMode: s.selectedMode,
      selectedParticipants: s.selectedParticipants,
      enableWebSearch: s.enableWebSearch,
    })),
  );

  const summaries = useChatStore(s => s.summaries);
  const preSearches = useChatStore(s => s.preSearches);

  // Store actions
  // ✅ AI SDK RESUME PATTERN: No stop selector - streams always complete
  const { setInputValue, setSelectedMode, setSelectedParticipants, addParticipant, removeParticipant, updateParticipant, setEnableWebSearch } = useChatStore(
    useShallow(s => ({
      setInputValue: s.setInputValue,
      setSelectedMode: s.setSelectedMode,
      setSelectedParticipants: s.setSelectedParticipants,
      addParticipant: s.addParticipant,
      removeParticipant: s.removeParticipant,
      updateParticipant: s.updateParticipant,
      setEnableWebSearch: s.setEnableWebSearch,
    })),
  );
  const resetToOverview = useChatStore(s => s.resetToOverview);

  // Store API for imperative access (getState)
  const storeApi = useChatStoreApi();

  // ============================================================================
  // LOCAL STATE & REFS
  // ============================================================================

  const hasSentInitialPromptRef = useRef(false);
  const hasInitializedModelsRef = useRef(false);
  // ✅ ZUSTAND PATTERN: Thread title comes from store - only manage threadActions here
  const { setThreadActions } = useThreadHeader();

  // Modal state
  const modeModal = useBoolean(false);
  const modelModal = useBoolean(false);

  // Responsive breakpoint - use hook pattern instead of CSS for SSR safety
  const isMobile = useIsMobile();

  // Chat attachments
  const chatAttachments = useChatAttachments();

  // ✅ SIMPLIFIED: Ref-based attachment click (no registration callback needed)
  const attachmentClickRef = useRef<(() => void) | null>(null);
  const handleAttachmentClick = useCallback(() => {
    attachmentClickRef.current?.();
  }, []);

  // ============================================================================
  // QUERIES
  // ============================================================================

  const { data: modelsData } = useModelsQuery();
  const { data: customRolesData } = useCustomRolesQuery(modelModal.value && !isStreaming);

  // ============================================================================
  // MEMOIZED DATA
  // ============================================================================

  const allEnabledModels = useMemo(
    () => modelsData?.data?.items || [],
    [modelsData?.data?.items],
  );

  const customRoles = customRolesData?.pages?.flatMap(page =>
    (page?.success && page.data?.items) ? page.data.items : [],
  ) ?? [];

  const userTierConfig = modelsData?.data?.user_tier_config || {
    tier: 'free' as const,
    tier_name: 'Free',
    max_models: 2,
    can_upgrade: true,
  };

  // ✅ REACT 19: Separate selectors instead of array (avoids new array on every render)
  const modelOrder = useChatStore(s => s.modelOrder);
  const setModelOrder = useChatStore(s => s.setModelOrder);

  // ============================================================================
  // ACCESSIBLE MODELS (computed from enabled models)
  // ============================================================================
  const accessibleModelIds = useMemo(() => {
    if (allEnabledModels.length === 0)
      return [];
    return allEnabledModels
      .filter(m => m.is_accessible_to_user)
      .map(m => m.id);
  }, [allEnabledModels]);

  // ============================================================================
  // INITIAL PARTICIPANTS (pure computation - NO side effects)
  // - Uses persisted selection if valid models exist
  // - Otherwise uses first 3 accessible models
  // - Side effect (persisting defaults) handled in useEffect below
  // ============================================================================
  const initialParticipants = useMemo<ParticipantConfig[]>(() => {
    // Wait for preferences to hydrate and models to load
    if (!preferencesHydrated || accessibleModelIds.length === 0) {
      return [];
    }

    // PRIORITY 1: Use persisted selection if valid models exist
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

    // PRIORITY 2: Use first 3 accessible models as defaults
    const defaultIds = accessibleModelIds.slice(0, 3);
    if (defaultIds.length > 0) {
      return defaultIds.map((modelId, index) => ({
        id: modelId,
        modelId,
        role: '',
        priority: index,
      }));
    }

    // Fallback to default model
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

  // ============================================================================
  // FILE CAPABILITY: Compute incompatible models based on attachments
  // Models without vision capability cannot process images/PDFs
  // ============================================================================
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

  // ============================================================================
  // HOOKS
  // ============================================================================

  const formActions = useChatFormActions();
  const overviewActions = useOverviewActions();

  // ============================================================================
  // CONSOLIDATED INITIALIZATION EFFECT
  // React 19: Single effect for all initialization that requires external sync
  // Combines previously scattered effects into one with proper state tracking
  // ============================================================================

  // Track what has been initialized to prevent re-running
  const initStateRef = useRef({
    persistedDefaults: false,
    syncedModels: false,
    modelOrder: false,
    participants: false,
    threadActions: false,
  });

  useEffect(() => {
    const init = initStateRef.current;

    // INIT 1: Persist defaults when no saved selection
    if (
      !init.persistedDefaults
      && preferencesHydrated
      && accessibleModelIds.length > 0
      && persistedModelIds.length === 0
    ) {
      init.persistedDefaults = true;
      const defaultIds = accessibleModelIds.slice(0, 3);
      if (defaultIds.length > 0) {
        setPersistedModelIds(defaultIds);
      }
    }

    // INIT 2: Sync models with accessible list (one-time when models load)
    if (
      !init.syncedModels
      && preferencesHydrated
      && accessibleModelIds.length > 0
    ) {
      init.syncedModels = true;
      syncWithAccessibleModels(accessibleModelIds);
    }

    // INIT 3: Model order initialization
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

    // INIT 4: Initialize participants when models available
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
        setSelectedMode(modeResult.success ? modeResult.data : getDefaultChatMode());
      }
      setEnableWebSearch(persistedWebSearch);
    }

    // INIT 5: Clear thread actions for overview
    if (!init.threadActions) {
      init.threadActions = true;
      setThreadActions(null);
    }
  }, [
    preferencesHydrated,
    accessibleModelIds,
    persistedModelIds.length,
    setPersistedModelIds,
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

  // ============================================================================
  // AUTO-DESELECT INCOMPATIBLE MODELS
  // When files are uploaded that require vision, auto-deselect models without vision
  // ============================================================================
  useEffect(() => {
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

    // Remove incompatible participants
    const compatibleParticipants = selectedParticipants.filter(
      p => !incompatibleModelIds.has(p.modelId),
    );

    // Re-index priorities
    const reindexed = compatibleParticipants.map((p, index) => ({
      ...p,
      priority: index,
    }));

    setSelectedParticipants(reindexed);
    setPersistedModelIds(reindexed.map(p => p.modelId));

    // Show toast notification
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

  // ============================================================================
  // THREAD ACTIONS SYNC (for header when thread is active on overview)
  // ============================================================================
  // When a thread is created from overview, set thread actions for the header
  // This mirrors what ChatThreadScreen does via useThreadHeaderUpdater
  // ✅ REACT 19: Effect is valid - syncing with context (external to this component)
  const threadActions = useMemo(
    () => currentThread && !showInitialUI
      ? <ChatThreadActions thread={currentThread} slug={currentThread.slug} />
      : null,
    [currentThread, showInitialUI],
  );

  useEffect(() => {
    setThreadActions(threadActions);
  }, [threadActions, setThreadActions]);

  // Screen initialization for orchestrator
  const shouldInitializeThread = Boolean(createdThreadId && currentThread);
  const hasActivePreSearch = preSearches.some(
    ps => ps.status === MessageStatuses.PENDING || ps.status === MessageStatuses.STREAMING,
  );
  const hasStreamingSummary = summaries.some(
    s => (s.status === MessageStatuses.PENDING || s.status === MessageStatuses.STREAMING)
      && s.participantMessageIds && s.participantMessageIds.length > 0,
  );

  useScreenInitialization({
    mode: 'overview',
    thread: shouldInitializeThread ? currentThread : null,
    participants: shouldInitializeThread ? contextParticipants : [],
    chatMode: selectedMode,
    enableOrchestrator: (
      !isStreaming
      && !isCreatingSummary
      && !hasActivePreSearch
      && !hasStreamingSummary
      && shouldInitializeThread
    ),
  });

  // Input blocking state
  // For initial UI (no thread): block during thread creation
  // For existing thread (reusing thread screen flow): block during streaming/analysis
  const pendingMessage = useChatStore(s => s.pendingMessage);
  const isInitialUIInputBlocked = isStreaming || isCreatingThread || waitingToStartStreaming;
  const isSubmitBlocked = isStreaming || isCreatingSummary || Boolean(pendingMessage);

  // ============================================================================
  // LAYOUT EFFECTS (external system sync only - DOM, scroll, navigation)
  // ============================================================================

  // ✅ SIMPLIFIED: Reset on navigation to /chat
  // Single ref tracks last reset pathname to prevent duplicate resets
  const lastResetPathRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    // Only reset when navigating TO /chat from elsewhere (or on initial mount at /chat)
    if (pathname === '/chat' && lastResetPathRef.current !== '/chat') {
      // ✅ FIX: Check for active conversation/streaming state before resetting
      // This prevents wiping state when user clicks recommended models from round summary
      // and submits - the ref check can fail due to re-renders but state should be preserved
      const currentState = storeApi.getState();
      const hasActiveConversation = currentState.messages.length > 0
        || currentState.thread !== null
        || currentState.createdThreadId !== null;
      const isFormSubmitting = currentState.pendingMessage !== null && !currentState.hasSentPendingMessage;
      const isStreamingActive = currentState.isStreaming || currentState.streamingRoundNumber !== null;
      const hasActivePreSearch = currentState.preSearches.some(
        ps => ps.status === 'pending' || ps.status === 'streaming',
      );

      if (hasActiveConversation || isFormSubmitting || isStreamingActive || hasActivePreSearch) {
        // Update ref but don't reset - preserve active conversation state
        lastResetPathRef.current = '/chat';
        return;
      }

      lastResetPathRef.current = '/chat';
      resetToOverview();
      hasSentInitialPromptRef.current = false;
      hasInitializedModelsRef.current = false; // Reset so we can re-initialize
      chatAttachments.clearAttachments();

      // ✅ RACE CONDITION FIX: Reset initialization state to allow re-initialization
      // When navigating back to /chat, the consolidated init effect needs to run again
      // Previously, init.participants stayed true which blocked re-initialization
      initStateRef.current = {
        persistedDefaults: false,
        syncedModels: false,
        modelOrder: false,
        participants: false,
        threadActions: false,
      };

      // ✅ SIMPLIFIED: Don't try to set participants here - let the consolidated useEffect handle it
      // The useEffect has proper guards for preferencesHydrated and initialParticipants
      // Setting participants here created a race condition where preferences weren't hydrated yet
    } else {
      lastResetPathRef.current = pathname;
    }
  }, [pathname, resetToOverview, chatAttachments, storeApi]);

  // ✅ AI SDK RESUME PATTERN: Do NOT stop streaming when returning to initial UI
  // Per AI SDK docs, resume: true is incompatible with abort/stop.
  // Streams continue in background via waitUntil() and can be resumed.

  // ✅ MOBILE FIX: Removed overflow-hidden to allow scrolling on small screens
  // Previously prevented scrolling which caused content to be cut off on small mobile devices

  // ============================================================================
  // CALLBACKS
  // ============================================================================

  const handlePromptSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      // Check if thread already exists (reuse thread screen flow)
      const existingThreadId = currentThread?.id || createdThreadId;

      if (existingThreadId) {
        // Thread exists: use thread screen flow (handleUpdateThreadAndSend)
        if (!inputValue.trim() || selectedParticipants.length === 0 || isSubmitBlocked) {
          return;
        }

        // Wait for all uploads to complete before sending
        if (!chatAttachments.allUploaded) {
          return;
        }

        try {
          const attachmentIds = chatAttachments.getUploadIds();
          // Build attachment info for optimistic message file parts
          const attachmentInfos = chatAttachments.attachments
            .filter(att => att.status === 'completed' && att.uploadId)
            .map(att => ({
              uploadId: att.uploadId!,
              filename: att.file.name,
              mimeType: att.file.type,
              previewUrl: att.preview?.url,
            }));
          await formActions.handleUpdateThreadAndSend(existingThreadId, attachmentIds, attachmentInfos);
          // ✅ Clear store attachments is called inside handleUpdateThreadAndSend
          // ✅ Clear hook local state AFTER thread is created (user request)
          chatAttachments.clearAttachments();
        } catch (error) {
          showApiErrorToast('Error sending message', error);
        }
      } else {
        // No thread: create new thread (original overview flow)
        if (!inputValue.trim() || selectedParticipants.length === 0 || isInitialUIInputBlocked) {
          return;
        }

        // Wait for all uploads to complete before creating thread
        if (!chatAttachments.allUploaded) {
          return;
        }

        try {
          const attachmentIds = chatAttachments.getUploadIds();
          // Build attachment info for optimistic message file parts (for handleCreateThread if needed)
          const attachmentInfos = chatAttachments.attachments
            .filter(att => att.status === 'completed' && att.uploadId)
            .map(att => ({
              uploadId: att.uploadId!,
              filename: att.file.name,
              mimeType: att.file.type,
              previewUrl: att.preview?.url,
            }));
          await formActions.handleCreateThread(attachmentIds, attachmentInfos);
          hasSentInitialPromptRef.current = true;
          // ✅ Clear store attachments is called inside handleCreateThread
          // ✅ Clear hook local state AFTER thread is created (user request)
          chatAttachments.clearAttachments();
        } catch (error) {
          showApiErrorToast('Error creating thread', error);
        }
      }
    },
    [inputValue, selectedParticipants, isInitialUIInputBlocked, isSubmitBlocked, formActions, currentThread?.id, createdThreadId, chatAttachments],
  );

  // Model modal callbacks
  // ✅ STALE CLOSURE FIX: Use store actions instead of closure-based state manipulation
  const handleToggleModel = useCallback((modelId: string) => {
    const orderedModel = orderedModels.find(om => om.model.id === modelId);
    if (!orderedModel)
      return;

    if (orderedModel.participant) {
      // Use store action to remove - avoids stale closure
      removeParticipant(modelId);
      // Get current state from store API for persistence
      const currentParticipants = storeApi.getState().selectedParticipants;
      setPersistedModelIds(currentParticipants.map(p => p.modelId));
    } else {
      // Use store action to add - avoids stale closure
      const newParticipant: ParticipantConfig = {
        id: modelId,
        modelId,
        role: '',
        priority: 0, // Will be reindexed by store action
      };
      addParticipant(newParticipant);
      // Get current state from store API for persistence
      const currentParticipants = storeApi.getState().selectedParticipants;
      setPersistedModelIds(currentParticipants.map(p => p.modelId));
    }
  }, [orderedModels, removeParticipant, addParticipant, setPersistedModelIds, storeApi]);

  // ✅ STALE CLOSURE FIX: Use store action instead of closure-based map
  // The old pattern captured selectedParticipants in closure, causing deselection bugs
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

    // Persist to cookie storage
    setPersistedModelOrder(newModelOrder);
    setPersistedModelIds(reorderedParticipants.map(p => p.modelId));
  }, [setSelectedParticipants, setModelOrder, setPersistedModelOrder, setPersistedModelIds]);

  // Web search toggle with persistence
  const handleWebSearchToggle = useCallback((enabled: boolean) => {
    setEnableWebSearch(enabled);
    setPersistedWebSearch(enabled); // Persist to cookie
  }, [setEnableWebSearch, setPersistedWebSearch]);

  // Preset selection - replaces all selected models with preset's models
  const handlePresetSelect = useCallback((models: BaseModelResponse[]) => {
    // Convert models to participant configs
    const newParticipants: ParticipantConfig[] = models.map((model, index) => ({
      id: model.id,
      modelId: model.id,
      role: '',
      priority: index,
    }));

    // Update store and persist
    setSelectedParticipants(newParticipants);
    const modelIds = newParticipants.map(p => p.modelId);
    setPersistedModelIds(modelIds);
    setModelOrder(modelIds);
    setPersistedModelOrder(modelIds);
  }, [setSelectedParticipants, setPersistedModelIds, setModelOrder, setPersistedModelOrder]);

  // ============================================================================
  // MEMOIZED CHAT INPUT PROPS (DRY - shared between desktop and mobile)
  // ============================================================================

  // ✅ REACT 19: Memoize toolbar to prevent recreation on every render
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
  ]);

  // ✅ REACT 19: Shared ChatInput props (DRY - prevents duplicate prop lists)
  const sharedChatInputProps = useMemo(() => ({
    value: inputValue,
    onChange: setInputValue,
    onSubmit: handlePromptSubmit,
    status: isInitialUIInputBlocked ? 'submitted' as const : 'ready' as const,
    placeholder: t('chat.input.placeholder'),
    participants: selectedParticipants,
    quotaCheckType: 'threads' as const,
    onRemoveParticipant: isInitialUIInputBlocked ? undefined : removeParticipant,
    attachments: chatAttachments.attachments,
    onAddAttachments: chatAttachments.addFiles,
    onRemoveAttachment: chatAttachments.removeAttachment,
    enableAttachments: !isInitialUIInputBlocked,
    attachmentClickRef,
    toolbar: chatInputToolbar,
  }), [
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
  ]);

  // ============================================================================
  // RENDER
  // ============================================================================

  // Show ChatView after thread creation for unified behavior
  const showChatView = !showInitialUI && (currentThread || createdThreadId);

  return (
    <>
      <UnifiedErrorBoundary context="chat">
        <div className="flex flex-col relative flex-1 min-h-dvh">
          {/* Radial glow - fixed positioning */}
          <AnimatePresence mode="wait">
            {showInitialUI && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
                className="fixed inset-0 pointer-events-none overflow-hidden"
                style={{ zIndex: 0, willChange: 'opacity' }}
              >
                <div
                  className="absolute"
                  style={{
                    top: '-100px',
                    left: '63%',
                    transform: 'translateX(-50%)',
                    willChange: 'transform',
                  }}
                >
                  <RadialGlow
                    size={500}
                    offsetY={0}
                    duration={18}
                    animate={true}
                    useLogoColors={true}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Initial UI - logo, tagline, suggestions */}
          {showInitialUI && (
            <>
              {/* Scrollable content area */}
              <div className="flex-1 overflow-y-auto">
                <div className="container max-w-3xl mx-auto px-2 sm:px-4 md:px-6 relative flex flex-col items-center pt-6 sm:pt-8 pb-4">
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
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.5, opacity: 0, y: -50 }}
                        transition={{ delay: 0.1, duration: 0.5, ease: 'easeOut' }}
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

                      <div className="flex flex-col items-center gap-1.5">
                        <motion.h1
                          className="text-3xl sm:text-4xl font-semibold text-white px-4 leading-tight"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -30 }}
                          transition={{ delay: 0.25, duration: 0.4, ease: 'easeOut' }}
                        >
                          {BRAND.name}
                        </motion.h1>

                        <motion.p
                          className="text-sm sm:text-base text-gray-300 max-w-2xl px-4 leading-relaxed"
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

                      {/* Desktop: Chat input inline under suggestions */}
                      {!isMobile && (
                        <motion.div
                          className="w-full mt-6"
                          initial={{ opacity: 0, y: 15 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          transition={{ delay: 0.55, duration: 0.4, ease: 'easeOut' }}
                        >
                          <ChatInput {...sharedChatInputProps} />
                        </motion.div>
                      )}
                    </div>
                  </motion.div>
                </div>
              </div>

              {/* Mobile: Sticky input at bottom */}
              {isMobile && (
                <div className="sticky bottom-0 z-30 bg-gradient-to-t from-background via-background to-transparent pt-4">
                  <div className="container max-w-3xl mx-auto px-2 sm:px-4 pb-4">
                    <motion.div
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ delay: 0.55, duration: 0.4, ease: 'easeOut' }}
                    >
                      <ChatInput {...sharedChatInputProps} />
                    </motion.div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Chat UI - unified with thread screen via ChatView */}
          {showChatView && (
            <ChatView
              user={{
                name: sessionUser?.name || 'You',
                image: sessionUser?.image || null,
              }}
              mode="overview"
              onSubmit={handlePromptSubmit}
              chatAttachments={chatAttachments}
            />
          )}

          {/* Error display */}
          {streamError && !isStreaming && !showInitialUI && (
            <div className="flex justify-center mt-4">
              <div className="px-4 py-2 text-sm text-destructive">
                {streamError instanceof Error ? streamError.message : String(streamError)}
              </div>
            </div>
          )}
        </div>
      </UnifiedErrorBoundary>

      {/* Modals */}
      <ConversationModeModal
        open={modeModal.value}
        onOpenChange={modeModal.setValue}
        selectedMode={selectedMode || getDefaultChatMode()}
        onModeSelect={(mode) => {
          setSelectedMode(mode);
          setPersistedMode(mode); // Persist to cookie
          modeModal.onFalse();
        }}
      />

      <ModelSelectionModal
        open={modelModal.value}
        onOpenChange={modelModal.setValue}
        orderedModels={orderedModels}
        onReorder={handleReorderModels}
        allParticipants={selectedParticipants}
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
    </>
  );
}
