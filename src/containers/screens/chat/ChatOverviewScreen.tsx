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

import { AnalysisStatuses } from '@/api/core/enums';
import type { ParticipantConfig } from '@/components/chat/chat-form-schemas';
import { ChatInput } from '@/components/chat/chat-input';
import { ChatInputToolbarMenu } from '@/components/chat/chat-input-toolbar-menu';
import { ChatQuickStart } from '@/components/chat/chat-quick-start';
import { ConversationModeModal } from '@/components/chat/conversation-mode-modal';
import type { OrderedModel } from '@/components/chat/model-item';
import { ModelSelectionModal } from '@/components/chat/model-selection-modal';
import { useThreadHeader } from '@/components/chat/thread-header-context';
import { UnifiedErrorBoundary } from '@/components/chat/unified-error-boundary';
import { useChatStore } from '@/components/providers/chat-store-provider';
import { RadialGlow } from '@/components/ui/radial-glow';
import { BRAND } from '@/constants/brand';
import { useCustomRolesQuery } from '@/hooks/queries/chat';
import { useModelsQuery } from '@/hooks/queries/models';
import {
  useBoolean,
  useChatAttachments,
  useModelLookup,
} from '@/hooks/utils';
import { useSession } from '@/lib/auth/client';
import { getDefaultChatMode } from '@/lib/config/chat-modes';
import { showApiErrorToast } from '@/lib/toast';
import {
  useChatFormActions,
  useOverviewActions,
  useScreenInitialization,
} from '@/stores/chat';
import {
  useModelPreferencesHydrated,
  useModelPreferencesStore,
} from '@/stores/preferences';

import { ChatView } from './ChatView';

export default function ChatOverviewScreen() {
  const t = useTranslations();
  const pathname = usePathname();
  const { data: session } = useSession();
  const sessionUser = session?.user;

  // Model lookup for defaults
  const { defaultModelId } = useModelLookup();

  // ============================================================================
  // PREFERENCES STORE (Cookie-persisted model selection)
  // ============================================================================
  const preferencesHydrated = useModelPreferencesHydrated();
  const {
    modelOrder: persistedModelOrder,
    setSelectedModelIds: setPersistedModelIds,
    setModelOrder: setPersistedModelOrder,
    getInitialModelIds,
  } = useModelPreferencesStore();

  // ============================================================================
  // STORE STATE
  // ============================================================================

  const { isStreaming, error: streamError, isCreatingAnalysis } = useChatStore(
    useShallow(s => ({
      isStreaming: s.isStreaming,
      error: s.error,
      isCreatingAnalysis: s.isCreatingAnalysis,
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

  const analyses = useChatStore(s => s.analyses);
  const preSearches = useChatStore(s => s.preSearches);

  // Store actions
  // ✅ AI SDK RESUME PATTERN: No stop selector - streams always complete
  const { setInputValue, setSelectedMode, setSelectedParticipants, removeParticipant, setEnableWebSearch } = useChatStore(
    useShallow(s => ({
      setInputValue: s.setInputValue,
      setSelectedMode: s.setSelectedMode,
      setSelectedParticipants: s.setSelectedParticipants,
      removeParticipant: s.removeParticipant,
      setEnableWebSearch: s.setEnableWebSearch,
    })),
  );
  const resetToOverview = useChatStore(s => s.resetToOverview);

  // ============================================================================
  // LOCAL STATE & REFS
  // ============================================================================

  const hasSentInitialPromptRef = useRef(false);
  const { setThreadTitle, setThreadActions } = useThreadHeader();

  // Modal state
  const modeModal = useBoolean(false);
  const modelModal = useBoolean(false);

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

  const [modelOrder, setModelOrder] = useChatStore(
    useShallow(s => [s.modelOrder, s.setModelOrder]),
  );

  // ============================================================================
  // INITIAL PARTICIPANTS (centralized in preferences store)
  // - User's persisted selection takes priority (even if 1-2 models)
  // - Defaults to first 3 accessible models if no persisted selection
  // ============================================================================
  const initialParticipants = useMemo<ParticipantConfig[]>(() => {
    // Wait for preferences to hydrate and models to load
    if (!preferencesHydrated || allEnabledModels.length === 0) {
      return [];
    }

    // Get accessible model IDs (user can use these)
    const accessibleModelIds = allEnabledModels
      .filter(m => m.is_accessible_to_user)
      .map(m => m.id);

    // Use centralized store method (handles persisted vs defaults)
    const modelIds = getInitialModelIds(accessibleModelIds);

    if (modelIds.length > 0) {
      return modelIds.map((modelId, index) => ({
        id: modelId,
        modelId,
        role: '',
        priority: index,
      }));
    }

    // Fallback to default model if no accessible models
    if (defaultModelId) {
      return [{
        id: defaultModelId,
        modelId: defaultModelId,
        role: '',
        priority: 0,
      }];
    }

    return [];
  }, [preferencesHydrated, allEnabledModels, defaultModelId, getInitialModelIds]);

  const orderedModels = useMemo<OrderedModel[]>(() => {
    if (allEnabledModels.length === 0)
      return [];

    const participantMap = new Map(selectedParticipants.map(p => [p.modelId, p]));
    const modelMap = new Map(allEnabledModels.map(m => [m.id, m]));
    const orderedIds = modelOrder.length > 0 ? modelOrder : allEnabledModels.map(m => m.id);

    const result: OrderedModel[] = [];
    for (const modelId of orderedIds) {
      const model = modelMap.get(modelId);
      if (model) {
        result.push({
          model,
          participant: participantMap.get(modelId) ?? null,
          order: orderedIds.indexOf(modelId),
        });
      }
    }
    return result;
  }, [selectedParticipants, allEnabledModels, modelOrder]);

  // ============================================================================
  // HOOKS
  // ============================================================================

  const formActions = useChatFormActions();
  const overviewActions = useOverviewActions();

  // Initialize model order when models first load (use persisted order if available)
  useEffect(() => {
    if (allEnabledModels.length > 0 && modelOrder.length === 0 && preferencesHydrated) {
      // Use persisted order if available and valid
      if (persistedModelOrder.length > 0) {
        // Validate that all persisted IDs exist in available models
        const availableIds = new Set(allEnabledModels.map(m => m.id));
        const validPersistedOrder = persistedModelOrder.filter(id => availableIds.has(id));
        // Add any new models not in persisted order
        const newModelIds = allEnabledModels
          .filter(m => !validPersistedOrder.includes(m.id))
          .map(m => m.id);
        const fullOrder = [...validPersistedOrder, ...newModelIds];
        setModelOrder(fullOrder);
      } else {
        setModelOrder(allEnabledModels.map(m => m.id));
      }
    }
  }, [allEnabledModels, modelOrder.length, setModelOrder, preferencesHydrated, persistedModelOrder]);

  // Screen initialization for orchestrator
  const shouldInitializeThread = Boolean(createdThreadId && currentThread);
  const hasActivePreSearch = preSearches.some(
    ps => ps.status === AnalysisStatuses.PENDING || ps.status === AnalysisStatuses.STREAMING,
  );
  const hasStreamingAnalysis = analyses.some(
    a => (a.status === AnalysisStatuses.PENDING || a.status === AnalysisStatuses.STREAMING)
      && a.participantMessageIds && a.participantMessageIds.length > 0,
  );

  useScreenInitialization({
    mode: 'overview',
    thread: shouldInitializeThread ? currentThread : null,
    participants: shouldInitializeThread ? contextParticipants : [],
    chatMode: selectedMode,
    enableOrchestrator: (
      !isStreaming
      && !isCreatingAnalysis
      && !hasActivePreSearch
      && !hasStreamingAnalysis
      && shouldInitializeThread
    ),
  });

  // Input blocking state
  // For initial UI (no thread): block during thread creation
  // For existing thread (reusing thread screen flow): block during streaming/analysis
  const pendingMessage = useChatStore(s => s.pendingMessage);
  const isInitialUIInputBlocked = isStreaming || isCreatingThread || waitingToStartStreaming;
  const isSubmitBlocked = isStreaming || isCreatingAnalysis || Boolean(pendingMessage);

  // ============================================================================
  // EFFECTS
  // ============================================================================

  // Thread header management
  useEffect(() => {
    if (currentThread?.isAiGeneratedTitle && currentThread?.title) {
      setThreadTitle(currentThread.title);
    } else {
      setThreadTitle(null);
    }
    setThreadActions(null);
  }, [currentThread?.isAiGeneratedTitle, currentThread?.title, setThreadTitle, setThreadActions]);

  // ✅ SIMPLIFIED: Reset on navigation to /chat
  // Single ref tracks last reset pathname to prevent duplicate resets
  const lastResetPathRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    // Only reset when navigating TO /chat from elsewhere (or on initial mount at /chat)
    if (pathname === '/chat' && lastResetPathRef.current !== '/chat') {
      lastResetPathRef.current = '/chat';
      resetToOverview();
      hasSentInitialPromptRef.current = false;
      chatAttachments.clearAttachments();

      if (defaultModelId && initialParticipants.length > 0) {
        setSelectedMode(getDefaultChatMode());
        setSelectedParticipants(initialParticipants);
      }
    } else {
      lastResetPathRef.current = pathname;
    }
  }, [pathname, resetToOverview, defaultModelId, initialParticipants, setSelectedMode, setSelectedParticipants, chatAttachments]);

  // Initialize defaults when defaultModelId becomes available
  useEffect(() => {
    if (
      selectedParticipants.length === 0
      && defaultModelId
      && initialParticipants.length > 0
    ) {
      setSelectedParticipants(initialParticipants);
      if (!selectedMode) {
        setSelectedMode(getDefaultChatMode());
      }
    }
  }, [defaultModelId, initialParticipants, selectedParticipants.length, selectedMode, setSelectedParticipants, setSelectedMode]);

  // ✅ AI SDK RESUME PATTERN: Do NOT stop streaming when returning to initial UI
  // Per AI SDK docs, resume: true is incompatible with abort/stop.
  // Streams continue in background via waitUntil() and can be resumed.

  // Prevent scrolling on initial UI
  useLayoutEffect(() => {
    if (showInitialUI) {
      document.documentElement.classList.add('overflow-hidden');
    } else {
      document.documentElement.classList.remove('overflow-hidden');
    }

    return () => {
      document.documentElement.classList.remove('overflow-hidden');
    };
  }, [showInitialUI]);

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
  const handleToggleModel = useCallback((modelId: string) => {
    const orderedModel = orderedModels.find(om => om.model.id === modelId);
    if (!orderedModel)
      return;

    if (orderedModel.participant) {
      // Allow deselecting all - validation shown in UI
      const filtered = selectedParticipants.filter(p => p.id !== orderedModel.participant!.id);
      const sortedByVisualOrder = filtered.sort((a, b) => {
        const aIdx = modelOrder.indexOf(a.modelId);
        const bIdx = modelOrder.indexOf(b.modelId);
        return aIdx - bIdx;
      });
      const reindexed = sortedByVisualOrder.map((p, index) => ({ ...p, priority: index }));
      setSelectedParticipants(reindexed);

      // Persist to cookie storage
      setPersistedModelIds(reindexed.map(p => p.modelId));
    } else {
      // ✅ FIX: Use modelId as unique participant ID (each model = one participant)
      const newParticipant: ParticipantConfig = {
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
      const reindexed = updated.map((p, index) => ({ ...p, priority: index }));
      setSelectedParticipants(reindexed);

      // Persist to cookie storage
      setPersistedModelIds(reindexed.map(p => p.modelId));
    }
  }, [orderedModels, selectedParticipants, setSelectedParticipants, modelOrder, setPersistedModelIds]);

  const handleRoleChange = useCallback((modelId: string, role: string, customRoleId?: string) => {
    setSelectedParticipants(
      selectedParticipants.map(p =>
        p.modelId === modelId ? { ...p, role, customRoleId } : p,
      ),
    );
  }, [selectedParticipants, setSelectedParticipants]);

  const handleClearRole = useCallback((modelId: string) => {
    setSelectedParticipants(
      selectedParticipants.map(p =>
        p.modelId === modelId ? { ...p, role: '', customRoleId: undefined } : p,
      ),
    );
  }, [selectedParticipants, setSelectedParticipants]);

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
            <div className="container max-w-3xl mx-auto px-2 sm:px-4 md:px-6 relative flex flex-col items-center pt-6 sm:pt-8 pb-8">
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
                </div>
              </motion.div>

              {/* Initial UI input */}
              <motion.div
                className="w-full mt-6 sm:mt-8 pb-4"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ delay: 0.55, duration: 0.4, ease: 'easeOut' }}
              >
                {/* ✅ AI SDK RESUME PATTERN: No onStop prop - streams always complete
                    Per AI SDK docs, resume: true is incompatible with abort/stop.
                    Streams continue in background via waitUntil() and can be resumed. */}
                <ChatInput
                  value={inputValue}
                  onChange={setInputValue}
                  onSubmit={handlePromptSubmit}
                  status={isInitialUIInputBlocked ? 'submitted' : 'ready'}
                  placeholder={t('chat.input.placeholder')}
                  participants={selectedParticipants}
                  quotaCheckType="threads"
                  onRemoveParticipant={isInitialUIInputBlocked ? undefined : removeParticipant}
                  attachments={chatAttachments.attachments}
                  onAddAttachments={chatAttachments.addFiles}
                  onRemoveAttachment={chatAttachments.removeAttachment}
                  enableAttachments={!isInitialUIInputBlocked}
                  attachmentClickRef={attachmentClickRef}
                  toolbar={(
                    <ChatInputToolbarMenu
                      selectedParticipants={selectedParticipants}
                      allModels={allEnabledModels}
                      onOpenModelModal={() => modelModal.onTrue()}
                      selectedMode={selectedMode || getDefaultChatMode()}
                      onOpenModeModal={() => modeModal.onTrue()}
                      enableWebSearch={enableWebSearch}
                      onWebSearchToggle={setEnableWebSearch}
                      onAttachmentClick={handleAttachmentClick}
                      attachmentCount={chatAttachments.attachments.length}
                      enableAttachments={!isInitialUIInputBlocked}
                      disabled={isInitialUIInputBlocked}
                    />
                  )}
                />
              </motion.div>
            </div>
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
        selectedCount={selectedParticipants.length}
        maxModels={userTierConfig.max_models}
        userTierInfo={{
          tier_name: userTierConfig.tier_name,
          max_models: userTierConfig.max_models,
          current_tier: userTierConfig.tier,
          can_upgrade: userTierConfig.can_upgrade,
        }}
      />
    </>
  );
}
