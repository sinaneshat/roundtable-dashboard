'use client';

// ✅ REMOVED: useQueryClient - no longer invalidating queries on completion
import type { UIMessage } from 'ai';
import { AnimatePresence, motion } from 'motion/react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { AnalysisStatuses, MessageRoles } from '@/api/core/enums';
import type { ModeratorAnalysisPayload } from '@/api/routes/chat/schema';
import type { ParticipantConfig } from '@/components/chat/chat-form-schemas';
import { ChatInput } from '@/components/chat/chat-input';
import { ChatInputEnhancedToolbar } from '@/components/chat/chat-input-enhanced-toolbar';
import { ChatMessageList } from '@/components/chat/chat-message-list';
import { ChatQuickStart } from '@/components/chat/chat-quick-start';
import { ConversationModeModal } from '@/components/chat/conversation-mode-modal';
import type { OrderedModel } from '@/components/chat/model-item';
import { ModelSelectionModal } from '@/components/chat/model-selection-modal';
import { RoundAnalysisCard } from '@/components/chat/moderator/round-analysis-card';
import { StreamingParticipantsLoader } from '@/components/chat/streaming-participants-loader';
import { useThreadHeader } from '@/components/chat/thread-header-context';
import { UnifiedErrorBoundary } from '@/components/chat/unified-error-boundary';
import { useChatStore } from '@/components/providers/chat-store-provider';
import { RadialGlow } from '@/components/ui/radial-glow';
import { BRAND } from '@/constants/brand';
import { useCustomRolesQuery } from '@/hooks/queries/chat';
import { useModelsQuery } from '@/hooks/queries/models';
import {
  useBoolean,
  useChatScroll,
  useFlowLoading,
  useModelLookup,
  useVisualViewportPosition,
} from '@/hooks/utils';
import { useSession } from '@/lib/auth/client';
import { getDefaultChatMode } from '@/lib/config/chat-modes';
// ✅ REMOVED: queryKeys - no longer invalidating queries on completion
import { showApiErrorToast } from '@/lib/toast';
// ✅ REMOVED: waitForIdleOrRender - was a timeout workaround (2s) for race conditions
import {
  useChatFormActions,
  useOverviewActions,
  useRecommendedActions,
  useScreenInitialization,
} from '@/stores/chat';

export default function ChatOverviewScreen() {
  // ✅ REMOVED: queryClient - no longer invalidating queries on completion
  const t = useTranslations();
  const pathname = usePathname();
  const { data: session } = useSession();
  const sessionUser = session?.user;

  // Consolidated model lookup hook
  const { defaultModelId } = useModelLookup();

  // ============================================================================
  // STORE STATE (Grouped with useShallow for Performance)
  // ============================================================================

  // AI SDK state + orchestrator control flags
  const { messages, isStreaming, currentParticipantIndex, error: streamError, isCreatingAnalysis } = useChatStore(
    useShallow(s => ({
      messages: s.messages,
      isStreaming: s.isStreaming,
      currentParticipantIndex: s.currentParticipantIndex,
      error: s.error,
      isCreatingAnalysis: s.isCreatingAnalysis,
    })),
  );

  // Thread state
  const { thread: currentThread, participants: contextParticipants } = useChatStore(
    useShallow(s => ({
      thread: s.thread,
      participants: s.participants,
    })),
  );

  // UI state
  const { showInitialUI, isCreatingThread, createdThreadId } = useChatStore(
    useShallow(s => ({
      showInitialUI: s.showInitialUI,
      isCreatingThread: s.isCreatingThread,
      createdThreadId: s.createdThreadId,
    })),
  );

  // Form state
  const { inputValue, selectedMode, selectedParticipants, enableWebSearch } = useChatStore(
    useShallow(s => ({
      inputValue: s.inputValue,
      selectedMode: s.selectedMode,
      selectedParticipants: s.selectedParticipants,
      enableWebSearch: s.enableWebSearch,
    })),
  );

  // Analysis state
  const analyses = useChatStore(s => s.analyses);

  // Pre-search state
  const preSearches = useChatStore(s => s.preSearches);

  // Data state
  // ✅ REMOVED: streamingRoundNumber no longer needed after removing duplicate PreSearchCard
  // const _streamingRoundNumber = useChatStore(s => s.streamingRoundNumber);

  // Analysis actions
  const updateAnalysisData = useChatStore(s => s.updateAnalysisData);
  const updateAnalysisStatus = useChatStore(s => s.updateAnalysisStatus);

  // ============================================================================
  // STORE ACTIONS (Grouped with useShallow for Performance)
  // ============================================================================

  // AI SDK actions
  const stopStreaming = useChatStore(s => s.stop);

  // Form actions - direct setters (non-consolidated)
  const { setInputValue, setSelectedMode, setSelectedParticipants, removeParticipant, setEnableWebSearch } = useChatStore(
    useShallow(s => ({
      setInputValue: s.setInputValue,
      setSelectedMode: s.setSelectedMode,
      setSelectedParticipants: s.setSelectedParticipants,
      removeParticipant: s.removeParticipant,
      setEnableWebSearch: s.setEnableWebSearch,
    })),
  );

  // Overview reset operation
  const resetToOverview = useChatStore(s => s.resetToOverview);

  // Refs for tracking
  const hasSentInitialPromptRef = useRef(false);

  const { setThreadTitle, setThreadActions } = useThreadHeader();

  // Modal state management
  const modeModal = useBoolean(false);
  const modelModal = useBoolean(false);

  // Model selection modal data
  const { data: modelsData } = useModelsQuery();
  const { data: customRolesData } = useCustomRolesQuery(modelModal.value && !isStreaming);
  const participantIdCounterRef = useRef(0);

  const allEnabledModels = useMemo(
    () => modelsData?.data?.items || [],
    [modelsData?.data?.items],
  );

  const customRoles = customRolesData?.pages.flatMap(page =>
    (page?.success && page.data?.items) ? page.data.items : [],
  ) || [];

  const userTierConfig = modelsData?.data?.user_tier_config || {
    tier: 'free' as const,
    tier_name: 'Free',
    max_models: 2,
    can_upgrade: true,
  };

  // Track visual order of models independently of selection
  const [modelOrder, setModelOrder] = useChatStore(
    useShallow(s => [s.modelOrder, s.setModelOrder]),
  );

  // Initialize model order when models first load
  useEffect(() => {
    if (allEnabledModels.length > 0 && modelOrder.length === 0) {
      setModelOrder(allEnabledModels.map(m => m.id));
    }
  }, [allEnabledModels, modelOrder.length, setModelOrder]);

  // eslint-disable-next-line react-hooks/preserve-manual-memoization
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

  const handleToggleModel = useCallback((modelId: string) => {
    const orderedModel = orderedModels.find(om => om.model.id === modelId);
    if (!orderedModel)
      return;

    if (orderedModel.participant) {
      // Remove model - update priorities for remaining participants
      const filtered = selectedParticipants.filter(p => p.id !== orderedModel.participant!.id);
      // Recalculate priorities based on visual order
      const reindexed = filtered.map((p) => {
        const visualIndex = modelOrder.indexOf(p.modelId);
        return { ...p, priority: visualIndex };
      }).sort((a, b) => a.priority - b.priority);
      setSelectedParticipants(reindexed);
    } else {
      // Add model - assign priority based on position in visual order
      participantIdCounterRef.current += 1;
      const visualIndex = modelOrder.indexOf(modelId);
      const newParticipant: ParticipantConfig = {
        id: `participant-${participantIdCounterRef.current}`,
        modelId,
        role: '',
        priority: visualIndex,
      };
      // Insert and re-sort all participants by their visual order
      const updated = [...selectedParticipants, newParticipant]
        .map((p) => {
          const idx = modelOrder.indexOf(p.modelId);
          return { ...p, priority: idx };
        })
        .sort((a, b) => a.priority - b.priority);
      setSelectedParticipants(updated);
    }
  }, [orderedModels, selectedParticipants, setSelectedParticipants, modelOrder]);

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
    // Update visual order of all models
    const newModelOrder = newOrder.map(om => om.model.id);
    setModelOrder(newModelOrder);

    // Update participant priorities based on new visual order
    const reorderedParticipants = newOrder
      .filter(om => om.participant !== null)
      .map((om, index) => ({
        ...om.participant!,
        priority: index,
      }));
    setSelectedParticipants(reorderedParticipants);
  }, [setSelectedParticipants, setModelOrder]);

  // Initialize default participants if needed
  const initialParticipants = useMemo<ParticipantConfig[]>(() => {
    if (defaultModelId) {
      return [
        {
          id: 'participant-default',
          modelId: defaultModelId,
          role: '',
          priority: 0,
        },
      ];
    }
    return [];
  }, [defaultModelId]);

  // Form actions hook
  const formActions = useChatFormActions();

  // Overview-specific actions (slug polling, suggestion handling, streaming trigger)
  const overviewActions = useOverviewActions();

  // Recommended actions hook (simple - no scroll, no config tracking)
  const recommendedActions = useRecommendedActions({
    enableScroll: false,
    markConfigChanged: false,
  });

  // Unified screen initialization
  // ✅ CRITICAL FIX: Disable orchestrator during streaming/analysis creation
  // The orchestrator was racing with onStreamComplete callback, overwriting 'complete' status
  // with stale 'streaming' from server. Disabling during active operations prevents race.
  // ✅ FIX: Only pass thread if we have a valid createdThreadId from active flow
  // This prevents re-initializing with stale thread data when navigating to /chat overview
  // When user clicks "New Chat" from thread view, createdThreadId gets reset by resetToOverview()
  const shouldInitializeThread = Boolean(createdThreadId && currentThread);

  // ✅ CRITICAL FIX: Disable orchestrator during ANY active streaming
  // Previously only checked isStreaming & isCreatingAnalysis, but missed:
  // - Pre-search streaming (happens before AI streaming starts)
  // - Analysis streaming (happens after AI streaming completes)
  // This caused unnecessary API calls polling /pre-searches and /analyses during streaming
  const hasActivePreSearch = preSearches.some(
    ps => ps.status === AnalysisStatuses.PENDING || ps.status === AnalysisStatuses.STREAMING,
  );
  const hasStreamingAnalysis = analyses.some(
    a => a.status === AnalysisStatuses.PENDING || a.status === AnalysisStatuses.STREAMING,
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

  // Handle form submission
  const handlePromptSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (!inputValue.trim() || selectedParticipants.length === 0 || isCreatingThread || isStreaming) {
        return;
      }

      try {
        await formActions.handleCreateThread();
        hasSentInitialPromptRef.current = true;
      } catch (error) {
        showApiErrorToast('Error creating thread', error);
      }
    },
    [inputValue, selectedParticipants, isCreatingThread, isStreaming, formActions],
  );

  // Check if first round is incomplete
  const currentStreamingParticipant = contextParticipants[currentParticipantIndex] || null;

  // React 19 Pattern: Initialize thread header on mount, update when title changes
  useEffect(() => {
    // ✅ FIX: Update title when AI-generated title becomes available
    // Show AI-generated title immediately when it arrives during streaming
    if (currentThread?.isAiGeneratedTitle && currentThread?.title) {
      setThreadTitle(currentThread.title);
    } else {
      setThreadTitle(null);
    }
    setThreadActions(null);
  }, [currentThread?.isAiGeneratedTitle, currentThread?.title, setThreadTitle, setThreadActions]);

  // Consolidated: Reset to overview defaults when navigating to /chat
  // IMPORTANT: This resets ALL state when navigating to /chat from anywhere
  // (including from /chat/[slug] back to /chat)
  // This ensures clean state when returning to the overview screen
  // ✅ FIX: Use useLayoutEffect to run synchronously BEFORE other effects
  // Prevents race condition where useOverviewActions navigation effect
  // evaluates with stale thread data before reset completes
  // ✅ FIX: Track pathname changes to detect navigation to /chat
  const prevPathnameRef = useRef<string | null>(null);
  const hasResetOnMount = useRef(false);

  useLayoutEffect(() => {
    // Always reset on first mount when pathname is /chat
    if (!hasResetOnMount.current && pathname === '/chat') {
      hasResetOnMount.current = true;
      resetToOverview();

      // Set initial form values if defaults are available
      if (defaultModelId && initialParticipants.length > 0) {
        setSelectedMode(getDefaultChatMode());
        setSelectedParticipants(initialParticipants);
      }

      prevPathnameRef.current = pathname;
      return;
    }

    // Reset if navigating from different route to /chat
    const isNavigatingToChat = pathname === '/chat' && prevPathnameRef.current !== '/chat';

    if (isNavigatingToChat) {
      // Reset ALL state (form, thread, messages, analyses, etc.)
      // This includes pre-searches and all AI SDK methods
      resetToOverview();

      // Set initial form values if defaults are available
      if (defaultModelId && initialParticipants.length > 0) {
        setSelectedMode(getDefaultChatMode());
        setSelectedParticipants(initialParticipants);
      }
    }

    // Update previous pathname
    prevPathnameRef.current = pathname;
  }, [pathname, resetToOverview, defaultModelId, initialParticipants, setSelectedMode, setSelectedParticipants]);

  // Fallback: Initialize defaults when defaultModelId becomes available (first load)
  // This handles the case where defaultModelId isn't ready on initial mount
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

  // React 19 Pattern: Handle streaming stop when returning to initial UI using queueMicrotask
  const prevShowInitialUIRef = useRef(showInitialUI);
  useEffect(() => {
    if (prevShowInitialUIRef.current !== showInitialUI) {
      prevShowInitialUIRef.current = showInitialUI;
      if (showInitialUI && isStreaming) {
        queueMicrotask(() => {
          stopStreaming?.();
        });
      }
    }
  }, [showInitialUI, isStreaming, stopStreaming]);

  // Scroll management - auto-scroll during streaming (if user is near bottom)
  // Always scroll when analysis appears (regardless of position)
  // ✅ FIX: Pass currentParticipantIndex to trigger auto-scroll on participant turn-taking
  useChatScroll({
    messages,
    analyses,
    isStreaming,
    scrollContainerId: 'chat-scroll-container',
    enableNearBottomDetection: !showInitialUI, // Only enable detection when chat is visible
    currentParticipantIndex,
  });

  // Streaming loader state calculation
  const { showLoader, loadingDetails } = useFlowLoading({ mode: 'overview' });
  const isAnalyzing = loadingDetails.isStreamingAnalysis;

  const inputContainerRef = useRef<HTMLDivElement | null>(null);

  // Visual viewport positioning for mobile keyboard handling
  // Returns bottom offset to adjust for keyboard (0 when no keyboard, >0 when keyboard open)
  const keyboardOffset = useVisualViewportPosition();

  return (
    <UnifiedErrorBoundary context="chat">
      <div className={`flex flex-col relative ${showInitialUI ? '' : 'min-h-dvh'}`}>
        {/* Radial glow - fixed positioning, doesn't affect layout */}
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
              {/* Position behind logo, right of center at top */}
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

        <div
          id="chat-scroll-container"
          className={`container max-w-3xl mx-auto px-2 sm:px-4 md:px-6 flex-1 relative z-10 ${
            showInitialUI
              ? '!flex !flex-col !justify-start !items-center pt-4'
              : 'pt-0 pb-32 sm:pb-36'
          }`}
        >
          <AnimatePresence mode="wait">
            {showInitialUI && (
              <motion.div
                key="initial-ui"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
                className="w-full"
              >
                <div className="flex flex-col items-center gap-8 sm:gap-10 text-center relative">

                  <motion.div
                    className="relative h-24 w-24 sm:h-28 sm:w-28 z-10"
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.5, opacity: 0, y: -50 }}
                    transition={{ delay: 0.1, duration: 0.5, ease: 'easeOut' }}
                  >
                    <img
                      src={BRAND.logos.main}
                      alt={BRAND.name}
                      className="w-full h-full object-contain relative z-10"
                      loading="eager"
                    />
                  </motion.div>

                  <div className="flex flex-col items-center gap-2">
                    <motion.h1
                      className="text-4xl sm:text-5xl font-semibold text-white px-4 leading-tight"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -30 }}
                      transition={{ delay: 0.25, duration: 0.4, ease: 'easeOut' }}
                    >
                      {BRAND.name}
                    </motion.h1>

                    <motion.p
                      className="text-base sm:text-lg text-gray-300 max-w-2xl px-4 leading-relaxed"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -30 }}
                      transition={{ delay: 0.35, duration: 0.4, ease: 'easeOut' }}
                    >
                      {BRAND.tagline}
                    </motion.p>
                  </div>

                  <motion.div
                    className="w-full mt-8 sm:mt-12"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ delay: 0.45, duration: 0.4, ease: 'easeOut' }}
                  >
                    <ChatQuickStart onSuggestionClick={overviewActions.handleSuggestionClick} />
                  </motion.div>

                  {/* Chat input - positioned below suggestions in initial UI */}
                  <motion.div
                    className="w-full mt-6 sm:mt-8"
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ delay: 0.55, duration: 0.4, ease: 'easeOut' }}
                  >
                    <ChatInput
                      value={inputValue}
                      onChange={setInputValue}
                      onSubmit={handlePromptSubmit}
                      status={isCreatingThread || isStreaming ? 'submitted' : 'ready'}
                      onStop={stopStreaming}
                      placeholder={t('chat.input.placeholder')}
                      participants={selectedParticipants}
                      quotaCheckType="threads"
                      onRemoveParticipant={isStreaming ? undefined : removeParticipant}
                      toolbar={(
                        <ChatInputEnhancedToolbar
                          selectedParticipants={selectedParticipants}
                          allModels={allEnabledModels}
                          onOpenModelModal={() => modelModal.onTrue()}
                          selectedMode={selectedMode || getDefaultChatMode()}
                          onOpenModeModal={() => modeModal.onTrue()}
                          enableWebSearch={enableWebSearch}
                          onWebSearchToggle={setEnableWebSearch}
                          disabled={isStreaming}
                        />
                      )}
                    />
                  </motion.div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {!showInitialUI && currentThread && (
              <motion.div
                key="streaming-ui"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="pb-[240px]"
              >
                <UnifiedErrorBoundary context="message-list">
                  {/* Split messages for correct ordering: user → pre-search → assistant */}
                  <ChatMessageList
                    messages={messages.filter((m: UIMessage) => m.role === MessageRoles.USER)}
                    user={{
                      name: sessionUser?.name || 'You',
                      image: sessionUser?.image || null,
                    }}
                    participants={contextParticipants}
                    isStreaming={false}
                    currentParticipantIndex={currentParticipantIndex}
                    currentStreamingParticipant={null}
                    threadId={createdThreadId}
                    preSearches={preSearches}
                  />

                  {/* ✅ CRITICAL FIX: Do NOT pass preSearches to assistant messages list
                      PreSearchCard should only render after user messages (handled by first ChatMessageList).
                      Passing preSearches to both lists was causing duplicate pre-search accordion rendering.
                  */}

                  {/* Assistant messages */}
                  <ChatMessageList
                    messages={messages.filter((m: UIMessage) => m.role !== MessageRoles.USER)}
                    user={{
                      name: sessionUser?.name || 'You',
                      image: sessionUser?.image || null,
                    }}
                    participants={contextParticipants}
                    isStreaming={isStreaming}
                    currentParticipantIndex={currentParticipantIndex}
                    currentStreamingParticipant={currentStreamingParticipant}
                    threadId={createdThreadId}
                  />
                </UnifiedErrorBoundary>

                {createdThreadId && analyses[0] && (() => {
                  const firstAnalysis = analyses[0];
                  return (
                    <div className="mt-4 sm:mt-6">
                      <RoundAnalysisCard
                        analysis={firstAnalysis}
                        threadId={createdThreadId}
                        isLatest={true}
                        onStreamStart={() => {
                          updateAnalysisStatus(firstAnalysis.roundNumber, 'streaming');
                        }}
                        onStreamComplete={(completedData) => {
                          const roundNumber = firstAnalysis.roundNumber;

                          // ✅ FIX: Update store with completed analysis data and status
                          // This immediately unblocks navigation logic without waiting for server
                          if (completedData) {
                            updateAnalysisData(
                              roundNumber,
                              completedData as ModeratorAnalysisPayload,
                            );
                          }
                          updateAnalysisStatus(roundNumber, 'complete');

                          // ✅ PROPER FIX: Don't invalidate query on overview screen
                          // The orchestrator merge logic already prefers higher-priority client status
                          // ('complete' priority 3 > 'streaming' priority 2)
                          // Navigation to thread screen will trigger fresh data load automatically
                          // Removing premature invalidation eliminates race condition with server DB commit

                          // Navigation handled by overview-actions.ts effect
                        }}
                        onActionClick={recommendedActions.handleActionClick}
                      />
                    </div>
                  );
                })()}

                {streamError && !isStreaming && (
                  <div className="flex justify-center mt-4">
                    <div className="px-4 py-2 text-sm text-destructive">
                      {streamError instanceof Error ? streamError.message : String(streamError)}
                    </div>
                  </div>
                )}

                {showLoader && (
                  <StreamingParticipantsLoader
                    className="mt-4"
                    participants={selectedParticipants}
                    currentParticipantIndex={currentParticipantIndex}
                    isAnalyzing={isAnalyzing}
                  />
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Chat input - sticky positioning with visual viewport support for keyboard */}
        <AnimatePresence>
          {!showInitialUI && (
            <div
              ref={inputContainerRef}
              className="sticky z-30 w-full will-change-[bottom] bg-background"
              style={{
                bottom: `${keyboardOffset + 16}px`,
              }}
            >
              <div className="container max-w-3xl mx-auto px-2 sm:px-4 md:px-6">
                <ChatInput
                  value={inputValue}
                  onChange={setInputValue}
                  onSubmit={handlePromptSubmit}
                  status={isCreatingThread || isStreaming ? 'submitted' : 'ready'}
                  onStop={stopStreaming}
                  placeholder={t('chat.input.placeholder')}
                  participants={selectedParticipants}
                  quotaCheckType="threads"
                  onRemoveParticipant={isStreaming ? undefined : removeParticipant}
                  toolbar={(
                    <ChatInputEnhancedToolbar
                      selectedParticipants={selectedParticipants}
                      allModels={allEnabledModels}
                      onOpenModelModal={() => modelModal.onTrue()}
                      selectedMode={selectedMode || getDefaultChatMode()}
                      onOpenModeModal={() => modeModal.onTrue()}
                      enableWebSearch={enableWebSearch}
                      onWebSearchToggle={setEnableWebSearch}
                      disabled={isStreaming}
                    />
                  )}
                />
              </div>
            </div>
          )}
        </AnimatePresence>

        {/* Conversation Mode Modal */}
        <ConversationModeModal
          open={modeModal.value}
          onOpenChange={modeModal.setValue}
          selectedMode={selectedMode || getDefaultChatMode()}
          onModeSelect={(mode) => {
            setSelectedMode(mode);
            modeModal.onFalse();
          }}
        />

        {/* Model Selection Modal */}
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
      </div>
    </UnifiedErrorBoundary>
  );
}
