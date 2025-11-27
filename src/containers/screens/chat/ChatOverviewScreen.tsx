'use client';

// ✅ REMOVED: useQueryClient - no longer invalidating queries on completion
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
import { ChatMessageList } from '@/components/chat/chat-message-list';
import { ChatQuickStart } from '@/components/chat/chat-quick-start';
import { ConversationModeModal } from '@/components/chat/conversation-mode-modal';
import type { OrderedModel } from '@/components/chat/model-item';
import { ModelSelectionModal } from '@/components/chat/model-selection-modal';
import { RoundAnalysisCard } from '@/components/chat/moderator/round-analysis-card';
import { useThreadHeader } from '@/components/chat/thread-header-context';
import { UnifiedErrorBoundary } from '@/components/chat/unified-error-boundary';
import { UnifiedLoadingIndicator } from '@/components/chat/unified-loading-indicator';
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
  useSortedParticipants,
  useVisualViewportPosition,
} from '@/hooks/utils';
import { useSession } from '@/lib/auth/client';
import { getDefaultChatMode } from '@/lib/config/chat-modes';
// ✅ REMOVED: queryKeys - no longer invalidating queries on completion
import { showApiErrorToast } from '@/lib/toast';
// ✅ REMOVED: getAvatarPropsFromModelId, getParticipantIndex, getRoleBadgeStyle - no longer needed after consolidating pending cards to ChatMessageList
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
  const { showInitialUI, isCreatingThread, createdThreadId, waitingToStartStreaming } = useChatStore(
    useShallow(s => ({
      showInitialUI: s.showInitialUI,
      isCreatingThread: s.isCreatingThread,
      createdThreadId: s.createdThreadId,
      waitingToStartStreaming: s.waitingToStartStreaming,
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

  // Data state - streamingRoundNumber needed for ChatMessageList pending cards logic
  const streamingRoundNumber = useChatStore(s => s.streamingRoundNumber);

  // Analysis actions
  const updateAnalysisData = useChatStore(s => s.updateAnalysisData);
  const updateAnalysisStatus = useChatStore(s => s.updateAnalysisStatus);
  const updateAnalysisError = useChatStore(s => s.updateAnalysisError);

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

  const customRoles = customRolesData?.pages?.flatMap(page =>
    (page?.success && page.data?.items) ? page.data.items : [],
  ) ?? [];

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
      // ✅ FIX: Sort by visual order, then reindex priorities to 0, 1, 2, ...
      // BUG FIX: Previously used modelOrder.indexOf() which gave model list position (21, 25, 29)
      // instead of selection order (0, 1, 2). This caused backend to create participants with
      // wrong priorities, leading to duplicate participants when priorities were reindexed later.
      const sortedByVisualOrder = filtered.sort((a, b) => {
        const aIdx = modelOrder.indexOf(a.modelId);
        const bIdx = modelOrder.indexOf(b.modelId);
        return aIdx - bIdx;
      });
      const reindexed = sortedByVisualOrder.map((p, index) => ({ ...p, priority: index }));
      setSelectedParticipants(reindexed);
    } else {
      // Add model
      participantIdCounterRef.current += 1;
      const newParticipant: ParticipantConfig = {
        id: `participant-${participantIdCounterRef.current}`,
        modelId,
        role: '',
        priority: selectedParticipants.length, // Temp priority, will be reindexed below
      };
      // ✅ FIX: Sort by visual order, then reindex priorities to 0, 1, 2, ...
      const updated = [...selectedParticipants, newParticipant].sort((a, b) => {
        const aIdx = modelOrder.indexOf(a.modelId);
        const bIdx = modelOrder.indexOf(b.modelId);
        return aIdx - bIdx;
      });
      const reindexed = updated.map((p, index) => ({ ...p, priority: index }));
      setSelectedParticipants(reindexed);
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
  // ✅ FIX: Only count analyses that are actually streaming/analyzing (have participant messages)
  // Placeholder analyses (created for eager rendering) have empty participantMessageIds
  // and should NOT block the orchestrator from running
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

  // Streaming loader state calculation - must be before isInputBlocked usage
  const { showLoader, loadingDetails } = useFlowLoading({ mode: 'overview' });

  // ✅ FIX: Comprehensive input blocking check
  // Prevents race condition where user can submit during the gap between
  // isCreatingThread=false and isStreaming=true
  // Also blocks input when the unified loading indicator (3-dot matrix) is visible
  const isInputBlocked = isStreaming || isCreatingThread || waitingToStartStreaming || showLoader;

  // Handle form submission
  const handlePromptSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      // ✅ FIX: Include waitingToStartStreaming and showLoader in guard to prevent double submission
      // showLoader ensures input is blocked when 3-dot matrix loading is visible
      if (!inputValue.trim() || selectedParticipants.length === 0 || isCreatingThread || isStreaming || waitingToStartStreaming || showLoader) {
        return;
      }

      try {
        await formActions.handleCreateThread();
        hasSentInitialPromptRef.current = true;
      } catch (error) {
        showApiErrorToast('Error creating thread', error);
      }
    },
    [inputValue, selectedParticipants, isCreatingThread, isStreaming, waitingToStartStreaming, showLoader, formActions],
  );

  // Check if first round is incomplete
  // ✅ CRITICAL FIX: Sort participants by priority before indexing
  // currentParticipantIndex is set based on priority-sorted array in use-multi-participant-chat.ts
  // So we must sort here to match that same ordering
  // ✅ REFACTOR: Use useSortedParticipants hook (single source of truth for priority sorting)
  const sortedContextParticipants = useSortedParticipants(contextParticipants);
  const currentStreamingParticipant = sortedContextParticipants[currentParticipantIndex] || null;

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
      // ✅ UNIFIED RESET: Clear local refs to day 0
      hasSentInitialPromptRef.current = false;

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
      // ✅ UNIFIED RESET: Clear local refs to day 0
      hasSentInitialPromptRef.current = false;

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

  // ✅ FIX: Prevent scrolling when showing initial UI
  // Content should only be scrollable after submission and chat animations start
  // This prevents premature scrolling on the overview landing page
  useLayoutEffect(() => {
    if (showInitialUI) {
      // Prevent scrolling on initial UI - lock html element to prevent all scroll
      document.documentElement.classList.add('overflow-hidden');
    } else {
      // Allow scrolling when chat UI is shown
      document.documentElement.classList.remove('overflow-hidden');
    }

    // Cleanup on unmount - restore default scroll behavior
    return () => {
      document.documentElement.classList.remove('overflow-hidden');
    };
  }, [showInitialUI]);

  // Scroll management for window-level scrolling
  // bottomOffset accounts for: sticky input (pt-10 + ~80px input) + shadow gradient (h-8) + bottom margin (16px)
  // ✅ FIX: Removed preSearches - auto-scroll only during participant streaming
  useChatScroll({
    messages,
    analyses,
    isStreaming,
    scrollContainerId: 'main-scroll-container',
    enableNearBottomDetection: true,
    currentParticipantIndex,
    bottomOffset: 180,
  });

  const inputContainerRef = useRef<HTMLDivElement | null>(null);

  // Visual viewport positioning for mobile keyboard handling
  // Returns bottom offset to adjust for keyboard (0 when no keyboard, >0 when keyboard open)
  const keyboardOffset = useVisualViewportPosition();

  return (
    <>
      <UnifiedErrorBoundary context="chat">
        <div className="flex flex-col relative flex-1 min-h-full">
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

          {/* Initial UI - standard layout without scroll wrapper */}
          {showInitialUI && (
            <div className="container max-w-3xl mx-auto px-2 sm:px-4 md:px-6 flex-1 relative !flex !flex-col !items-center pt-6 sm:pt-8">
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

              {/* Chat input - positioned below suggested chats with regular spacing */}
              <motion.div
                className="w-full mt-6 sm:mt-8 pb-4"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ delay: 0.55, duration: 0.4, ease: 'easeOut' }}
              >
                <ChatInput
                  value={inputValue}
                  onChange={setInputValue}
                  onSubmit={handlePromptSubmit}
                  status={isInputBlocked ? 'submitted' : 'ready'}
                  onStop={stopStreaming}
                  placeholder={t('chat.input.placeholder')}
                  participants={selectedParticipants}
                  quotaCheckType="threads"
                  onRemoveParticipant={isInputBlocked ? undefined : removeParticipant}
                  toolbar={(
                    <ChatInputToolbarMenu
                      selectedParticipants={selectedParticipants}
                      allModels={allEnabledModels}
                      onOpenModelModal={() => modelModal.onTrue()}
                      selectedMode={selectedMode || getDefaultChatMode()}
                      onOpenModeModal={() => modeModal.onTrue()}
                      enableWebSearch={enableWebSearch}
                      onWebSearchToggle={setEnableWebSearch}
                      disabled={isInputBlocked}
                    />
                  )}
                />
              </motion.div>
            </div>
          )}

          {/* Chat UI with body-based scrolling */}
          {!showInitialUI && currentThread && (
            <>
              <div
                className="container max-w-3xl mx-auto px-2 sm:px-4 md:px-6 pt-0 pb-4"
              >
                <UnifiedErrorBoundary context="message-list">
                  {/* ✅ UNIFIED RENDERING: Single ChatMessageList with ALL messages
                      This eliminates duplicate pending participant cards by:
                      1. Passing ALL messages instead of split user/assistant
                      2. Passing streamingRoundNumber so pending cards logic works correctly
                      3. REMOVED duplicate pending cards section that was here before

                      The ChatMessageList handles:
                      - User messages with header
                      - PreSearchCard after user messages (from preSearches prop)
                      - Pending participant cards (when streaming round and pre-search active)
                      - Assistant messages with streaming state

                      NOTE: Pending participant cards are now ONLY rendered inside ChatMessageList
                      to prevent 2x duplication that occurred when both ChatMessageList AND
                      this screen rendered them independently.
                  */}
                  <ChatMessageList
                    messages={messages}
                    user={{
                      name: sessionUser?.name || 'You',
                      image: sessionUser?.image || null,
                    }}
                    participants={contextParticipants}
                    isStreaming={isStreaming}
                    currentParticipantIndex={currentParticipantIndex}
                    currentStreamingParticipant={currentStreamingParticipant}
                    threadId={createdThreadId}
                    preSearches={preSearches}
                    streamingRoundNumber={streamingRoundNumber}
                  />
                </UnifiedErrorBoundary>

                {/* ✅ REVISED: Only filter out PENDING placeholder analyses
                    STREAMING/COMPLETE/FAILED analyses should ALWAYS render for proper stream resumption
                    Placeholder states (PENDING + empty participantMessageIds) are handled by participant cards */}
                {createdThreadId && analyses[0] && !(
                  analyses[0].status === AnalysisStatuses.PENDING
                  && (!analyses[0].participantMessageIds || analyses[0].participantMessageIds.length === 0)
                ) && (() => {
                  const firstAnalysis = analyses[0];
                  return (
                    <div className="mt-4 sm:mt-6">
                      <RoundAnalysisCard
                        analysis={firstAnalysis}
                        threadId={createdThreadId}
                        isLatest={true}
                        onStreamStart={() => {
                          updateAnalysisStatus(firstAnalysis.roundNumber, AnalysisStatuses.STREAMING);
                        }}
                        onStreamComplete={(completedData, error) => {
                          const roundNumber = firstAnalysis.roundNumber;

                          // ✅ FIX: Update store with completed analysis data and status
                          // This immediately unblocks navigation logic without waiting for server
                          if (completedData) {
                            updateAnalysisData(
                              roundNumber,
                              completedData,
                            );
                          } else if (error) {
                            // ✅ CRITICAL FIX: Handle streaming errors (schema validation failures)
                            // Server may return error when LLM response doesn't match schema
                            // Must set status=FAILED with error message, not COMPLETE
                            const errorMessage = error instanceof Error
                              ? error.message
                              : 'Analysis failed. Please try again.';
                            updateAnalysisError(roundNumber, errorMessage);
                          } else {
                            // ✅ Edge case: No data and no error - still mark complete to unblock UI
                            updateAnalysisStatus(roundNumber, AnalysisStatuses.COMPLETE);
                          }

                          // ✅ PROPER FIX: Don't invalidate query on overview screen
                          // The orchestrator merge logic already prefers higher-priority client status
                          // ('failed' priority 4 > 'complete' priority 3 > 'streaming' priority 2)
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

              </div>

              {/* Unified loading indicator - sticky positioned above input */}
              <UnifiedLoadingIndicator
                showLoader={showLoader}
                loadingDetails={loadingDetails}
                preSearches={preSearches}
              />

              {/* Chat input - sticky at bottom, mt-auto pushes to bottom when content is small */}
              <div
                ref={inputContainerRef}
                className="sticky z-30 mt-auto bg-gradient-to-t from-background via-background to-transparent pt-10 relative"
                style={{ bottom: `${keyboardOffset + 16}px` }}
              >
                <div className="w-full max-w-3xl mx-auto px-2 sm:px-4 md:px-6">
                  <ChatInput
                    value={inputValue}
                    onChange={setInputValue}
                    onSubmit={handlePromptSubmit}
                    status={isInputBlocked ? 'submitted' : 'ready'}
                    onStop={stopStreaming}
                    placeholder={t('chat.input.placeholder')}
                    participants={selectedParticipants}
                    quotaCheckType="threads"
                    onRemoveParticipant={isInputBlocked ? undefined : removeParticipant}
                    toolbar={(
                      <ChatInputToolbarMenu
                        selectedParticipants={selectedParticipants}
                        allModels={allEnabledModels}
                        onOpenModelModal={() => modelModal.onTrue()}
                        selectedMode={selectedMode || getDefaultChatMode()}
                        onOpenModeModal={() => modeModal.onTrue()}
                        enableWebSearch={enableWebSearch}
                        onWebSearchToggle={setEnableWebSearch}
                        disabled={isInputBlocked}
                      />
                    )}
                  />
                </div>
                {/* Bottom fill - covers gap to screen bottom */}
                <div className="-z-10 absolute inset-x-0 top-full h-4 bg-background pointer-events-none" />
              </div>
            </>
          )}

        </div>
      </UnifiedErrorBoundary>

      {/* Conversation Mode Modal - Outside error boundary to match thread screen pattern */}
      <ConversationModeModal
        open={modeModal.value}
        onOpenChange={modeModal.setValue}
        selectedMode={selectedMode || getDefaultChatMode()}
        onModeSelect={(mode) => {
          setSelectedMode(mode);
          modeModal.onFalse();
        }}
      />

      {/* Model Selection Modal - Outside error boundary to match thread screen pattern */}
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
