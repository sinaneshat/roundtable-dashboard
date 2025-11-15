'use client';

// ✅ REMOVED: useQueryClient - no longer invalidating queries on completion
import type { UIMessage } from 'ai';
import { AnimatePresence, motion } from 'motion/react';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { MessageRoles } from '@/api/core/enums';
import type { ModeratorAnalysisPayload } from '@/api/routes/chat/schema';
import { AvatarGroup } from '@/components/chat/avatar-group';
import type { ParticipantConfig } from '@/components/chat/chat-form-schemas';
import { ChatInput } from '@/components/chat/chat-input';
import { ChatMessageList } from '@/components/chat/chat-message-list';
import { ChatQuickStart } from '@/components/chat/chat-quick-start';
import { ConversationModeModal } from '@/components/chat/conversation-mode-modal';
import { ModelSelectionModal } from '@/components/chat/model-selection-modal';
import { RoundAnalysisCard } from '@/components/chat/moderator/round-analysis-card';
import { StreamingParticipantsLoader } from '@/components/chat/streaming-participants-loader';
import { useThreadHeader } from '@/components/chat/thread-header-context';
import { UnifiedErrorBoundary } from '@/components/chat/unified-error-boundary';
import { WebSearchToggle } from '@/components/chat/web-search-toggle';
import { useChatStore } from '@/components/providers/chat-store-provider';
import { Button } from '@/components/ui/button';
import { RadialGlow } from '@/components/ui/radial-glow';
import { BRAND } from '@/constants/brand';
import { useCustomRolesQuery } from '@/hooks/queries/chat';
import { useModelsQuery } from '@/hooks/queries/models';
import {
  useBoolean,
  useChatScroll,
  useFlowLoading,
  useModelLookup,
} from '@/hooks/utils';
import { useSession } from '@/lib/auth/client';
import { getChatModeById, getDefaultChatMode } from '@/lib/config/chat-modes';
// ✅ REMOVED: queryKeys - no longer invalidating queries on completion
import { showApiErrorToast } from '@/lib/toast';
// ✅ REMOVED: waitForIdleOrRender - was a timeout workaround (2s) for race conditions
import { isRoundIncomplete } from '@/lib/utils/analysis-utils';
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
  const { retry: retryRound, stop: stopStreaming } = useChatStore(
    useShallow(s => ({
      retry: s.retry,
      stop: s.stop,
    })),
  );

  // Form actions - direct setters (non-consolidated)
  const { setInputValue, setSelectedMode, setSelectedParticipants, removeParticipant } = useChatStore(
    useShallow(s => ({
      setInputValue: s.setInputValue,
      setSelectedMode: s.setSelectedMode,
      setSelectedParticipants: s.setSelectedParticipants,
      removeParticipant: s.removeParticipant,
    })),
  );

  // Overview reset operation
  const resetToOverview = useChatStore(s => s.resetToOverview);

  // Regeneration action
  const retry = useChatStore(s => s.retry);

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

  const orderedModels = useMemo(() => {
    if (allEnabledModels.length === 0)
      return [];

    const selectedModels = selectedParticipants
      .sort((a, b) => a.priority - b.priority)
      .flatMap((p, index) => {
        const model = allEnabledModels.find(m => m.id === p.modelId);
        return model ? [{ model, participant: p, order: index }] : [];
      });

    const selectedIds = new Set(selectedParticipants.map(p => p.modelId));
    const unselectedModels = allEnabledModels
      .filter(m => !selectedIds.has(m.id))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((m, index) => ({
        model: m,
        participant: null,
        order: selectedModels.length + index,
      }));

    return [...selectedModels, ...unselectedModels];
  }, [selectedParticipants, allEnabledModels]);

  const handleToggleModel = useCallback((modelId: string) => {
    const orderedModel = orderedModels.find(om => om.model.id === modelId);
    if (!orderedModel)
      return;

    if (orderedModel.participant) {
      // Remove model
      const filtered = selectedParticipants.filter(p => p.id !== orderedModel.participant!.id);
      const reindexed = filtered.map((p, index) => ({ ...p, priority: index }));
      setSelectedParticipants(reindexed);
    } else {
      // Add model
      participantIdCounterRef.current += 1;
      const newParticipant: ParticipantConfig = {
        id: `participant-${participantIdCounterRef.current}`,
        modelId,
        role: '',
        priority: selectedParticipants.length,
      };
      setSelectedParticipants([...selectedParticipants, newParticipant]);
    }
  }, [orderedModels, selectedParticipants, setSelectedParticipants]);

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
    const reorderedParticipants = newOrder
      .filter(om => om.participant !== null)
      .map((om, index) => ({
        ...om.participant!,
        priority: index,
      }));
    setSelectedParticipants(reorderedParticipants);
  }, [setSelectedParticipants]);

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

  useScreenInitialization({
    mode: 'overview',
    thread: shouldInitializeThread ? currentThread : null,
    participants: shouldInitializeThread ? contextParticipants : [],
    chatMode: selectedMode,
    enableOrchestrator: !isStreaming && !isCreatingAnalysis && shouldInitializeThread,
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
  // ✅ 0-BASED: First round is round 0
  const firstRoundIncomplete = useMemo(() => {
    if (!analyses[0] || analyses[0].roundNumber !== 0) {
      return false;
    }
    return isRoundIncomplete(messages, contextParticipants, 0);
  }, [messages, contextParticipants, analyses]);

  // Handle retry for incomplete/failed rounds
  const handleRetryRound = useCallback((_roundNumber: number) => {
    // For overview mode, retry is same as regenerating round 1
    retry?.();
  }, [retry]);

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
  useChatScroll({
    messages,
    analyses,
    isStreaming,
    scrollContainerId: 'chat-scroll-container',
    enableNearBottomDetection: !showInitialUI, // Only enable detection when chat is visible
  });

  // Streaming loader state calculation
  const { showLoader, loadingDetails } = useFlowLoading({ mode: 'overview' });
  const isAnalyzing = loadingDetails.isStreamingAnalysis;

  const inputContainerRef = useRef<HTMLDivElement | null>(null);

  return (
    <UnifiedErrorBoundary context="chat">
      <div className={`flex flex-col relative ${showInitialUI ? '' : 'min-h-screen'}`}>
        {/* Radial glow - fixed positioning, doesn't affect layout */}
        <AnimatePresence>
          {showInitialUI && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="fixed inset-0 pointer-events-none overflow-hidden"
              style={{ zIndex: 0 }}
            >
              {/* Position at logo center: pt-4 (1rem mobile) + logo half (2rem mobile, 3.5rem sm, 4rem md, 4.5rem lg) */}
              <div
                className="absolute left-1/2 -translate-x-1/2"
                style={{
                  top: 'calc(1rem + 2rem)', // Mobile: pt-4 + half of h-16
                }}
              >
                <RadialGlow
                  size={800}
                  offsetY={40}
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
          className={`container max-w-3xl mx-auto px-3 sm:px-4 md:px-6 flex-1 relative z-10 ${
            showInitialUI
              ? '!flex !flex-col !justify-start !items-center pt-4'
              : 'pt-0 pb-32 sm:pb-36'
          }`}
        >
          <AnimatePresence>
            {showInitialUI && (
              <motion.div
                key="initial-ui"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="w-full"
              >
                <div className="flex flex-col items-center gap-3 sm:gap-4 md:gap-6 text-center relative">

                  <motion.div
                    className="relative h-16 w-16 xs:h-20 xs:w-20 sm:h-28 sm:w-28 md:h-32 md:w-32 lg:h-36 lg:w-36 z-10"
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.5, opacity: 0, y: -50 }}
                    transition={{ delay: 0.1, duration: 0.4 }}
                  >
                    <Image
                      src={BRAND.logos.main}
                      alt={BRAND.name}
                      fill
                      className="object-contain relative z-10"
                      priority
                    />
                  </motion.div>

                  <motion.h1
                    className="text-xl xs:text-2xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 dark:text-white px-4"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, y: -30 }}
                    transition={{ delay: 0.2, duration: 0.3 }}
                  >
                    {BRAND.name}
                  </motion.h1>

                  <motion.p
                    className="text-sm xs:text-base sm:text-xl md:text-2xl text-gray-600 dark:text-gray-300 max-w-2xl px-4"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, y: -30 }}
                    transition={{ delay: 0.3, duration: 0.3 }}
                  >
                    {BRAND.tagline}
                  </motion.p>

                  <motion.div
                    className="w-full mt-3 sm:mt-4 md:mt-8"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ delay: 0.4, duration: 0.3 }}
                  >
                    <ChatQuickStart onSuggestionClick={overviewActions.handleSuggestionClick} />
                  </motion.div>

                  {/* Chat input - positioned below suggestions in initial UI */}
                  <motion.div
                    className="w-full mt-6 sm:mt-8"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ delay: 0.5, duration: 0.3 }}
                  >
                    <ChatInput
                      value={inputValue}
                      onChange={setInputValue}
                      onSubmit={handlePromptSubmit}
                      status={isCreatingThread || isStreaming ? 'submitted' : 'ready'}
                      onStop={stopStreaming}
                      placeholder={t('chat.input.placeholder')}
                      participants={selectedParticipants}
                      currentParticipantIndex={currentParticipantIndex}
                      quotaCheckType="threads"
                      onRemoveParticipant={isStreaming ? undefined : removeParticipant}
                      toolbar={(
                        <>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={isStreaming}
                            onClick={() => modelModal.onTrue()}
                            className="h-9 rounded-2xl gap-1.5 text-xs px-3"
                          >
                            <span>{t('chat.models.aiModels')}</span>
                            <AvatarGroup participants={selectedParticipants} allModels={allEnabledModels} size="sm" maxVisible={3} />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={isStreaming}
                            onClick={() => modeModal.onTrue()}
                            className="h-9 rounded-2xl gap-1.5 text-xs px-3"
                          >
                            {(() => {
                              const currentMode = getChatModeById(selectedMode || getDefaultChatMode());
                              const ModeIcon = currentMode?.icon;
                              return (
                                <>
                                  {ModeIcon && <ModeIcon className="size-4" />}
                                  <span>{currentMode?.label || t('chat.modes.mode')}</span>
                                </>
                              );
                            })()}
                          </Button>
                          <WebSearchToggle
                            enabled={enableWebSearch}
                            onToggle={isStreaming ? undefined : formActions.handleWebSearchToggle}
                            disabled={isStreaming}
                          />
                        </>
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
              >
                <UnifiedErrorBoundary context="message-list" onReset={retryRound}>
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
                        onRetry={handleRetryRound}
                        isRoundIncomplete={firstRoundIncomplete}
                      />
                    </div>
                  );
                })()}

                {streamError && !isStreaming && (
                  <div className="flex justify-center mt-4">
                    <button
                      type="button"
                      onClick={retryRound}
                      className="px-4 py-2 text-sm font-medium rounded-lg bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 transition-colors touch-manipulation active:scale-95"
                    >
                      {t('chat.errors.retry')}
                    </button>
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

        {/* Chat input - sticky at bottom when chat has started */}
        <AnimatePresence>
          {!showInitialUI && (
            <motion.div
              ref={inputContainerRef}
              initial={{ opacity: 0, y: 100 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 100 }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
              className="sticky bottom-0 z-50 bg-gradient-to-t from-background via-background to-transparent pt-4 sm:pt-6 pb-3 sm:pb-4 mt-auto"
            >
              <div className="container max-w-3xl mx-auto px-3 sm:px-4 md:px-6">
                <ChatInput
                  value={inputValue}
                  onChange={setInputValue}
                  onSubmit={handlePromptSubmit}
                  status={isCreatingThread || isStreaming ? 'submitted' : 'ready'}
                  onStop={stopStreaming}
                  placeholder={t('chat.input.placeholder')}
                  participants={selectedParticipants}
                  currentParticipantIndex={currentParticipantIndex}
                  quotaCheckType="threads"
                  onRemoveParticipant={isStreaming ? undefined : removeParticipant}
                  toolbar={(
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isStreaming}
                        onClick={() => modelModal.onTrue()}
                        className="h-9 rounded-2xl gap-1.5 text-xs px-3"
                      >
                        <span>{t('chat.models.aiModels')}</span>
                        <AvatarGroup participants={selectedParticipants} allModels={allEnabledModels} size="sm" maxVisible={3} />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isStreaming}
                        onClick={() => modeModal.onTrue()}
                        className="h-9 rounded-2xl gap-1.5 text-xs px-3"
                      >
                        {(() => {
                          const currentMode = getChatModeById(selectedMode || getDefaultChatMode());
                          const ModeIcon = currentMode?.icon;
                          return (
                            <>
                              {ModeIcon && <ModeIcon className="size-4" />}
                              <span>{currentMode?.label || t('chat.modes.mode')}</span>
                            </>
                          );
                        })()}
                      </Button>
                      <WebSearchToggle
                        enabled={enableWebSearch}
                        onToggle={isStreaming ? undefined : formActions.handleWebSearchToggle}
                        disabled={isStreaming}
                      />
                    </>
                  )}
                />
              </div>
            </motion.div>
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
