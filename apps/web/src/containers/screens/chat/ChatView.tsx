import type { ChatMode, ScreenMode } from '@roundtable/shared';
import { ChatModeSchema, ErrorBoundaryContexts, MessageStatuses, RoundPhases, ScreenModes, SidebarStates } from '@roundtable/shared';
import type { UIMessage } from 'ai';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { ChatInput } from '@/components/chat/chat-input';
import { ChatInputContainer } from '@/components/chat/chat-input-container';
import { ChatInputHeader } from '@/components/chat/chat-input-header';
import type { ChatInputToolbarMenuProps } from '@/components/chat/chat-input-toolbar-lazy';
import { ChatScrollButton } from '@/components/chat/chat-scroll-button';
import type { ConversationModeModalProps } from '@/components/chat/conversation-mode-modal';
import type { ModelSelectionModalProps } from '@/components/chat/model-selection-modal';
import { ThreadTimeline } from '@/components/chat/thread-timeline';
import { UnifiedErrorBoundary } from '@/components/chat/unified-error-boundary';
import { useChatStore, useChatStoreApi } from '@/components/providers';
import { useSidebarOptional } from '@/components/ui/sidebar';
import { useCustomRolesQuery, useModelsQuery, useThreadChangelogQuery, useThreadFeedbackQuery } from '@/hooks/queries';
import type { TimelineItem, UseChatAttachmentsReturn } from '@/hooks/utils';
import {
  useBoolean,
  useChatScroll,
  useFreeTrialState,
  useMediaQuery,
  useOrderedModels,
  useThreadTimeline,
  useVisualViewportPosition,
} from '@/hooks/utils';
import { getDefaultChatMode } from '@/lib/config/chat-modes';
import type { ModelPreset } from '@/lib/config/model-presets';
import { filterPresetParticipants, ToastNamespaces } from '@/lib/config/model-presets';
import { useTranslations } from '@/lib/i18n';
import { isFilePart } from '@/lib/schemas/message-schemas';
import type { ParticipantConfig } from '@/lib/schemas/participant-schemas';
import { toastManager } from '@/lib/toast';
import {
  getDetailedIncompatibleModelIds,
  getModeratorMetadata,
  getRoundNumber,
  isDocumentFile,
  isImageFile,
  isModeratorMessage,
  isVisionRequiredMimeType,
} from '@/lib/utils';
import { rlog } from '@/lib/utils/dev-logger';
import dynamic from '@/lib/utils/dynamic';
import type { ApiChangelog, ApiParticipant, Model, RoundFeedbackData, StoredPreSearch } from '@/services/api';
import {
  useAutoModeAnalysis,
  useChatFormActions,
  useFeedbackActions,
  useFlowLoading,
  useThreadActions,
} from '@/stores/chat';

const ModelSelectionModal = dynamic<ModelSelectionModalProps>(
  () => import('@/components/chat/model-selection-modal').then(m => ({ default: m.ModelSelectionModal })),
  { ssr: false },
);
const ConversationModeModal = dynamic<ConversationModeModalProps>(
  () => import('@/components/chat/conversation-mode-modal').then(m => ({ default: m.ConversationModeModal })),
  { ssr: false },
);
const ChatInputToolbarMenu = dynamic<ChatInputToolbarMenuProps>(
  () => import('@/components/chat/chat-input-toolbar-lazy').then(m => ({ default: m.ChatInputToolbarMenu })),
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
  /**
   * SSR: Initial messages from route loader for first paint
   * Store may be empty during SSR - use these for immediate content render
   */
  initialMessages?: UIMessage[];
  /**
   * SSR: Initial participants from route loader for first paint
   */
  initialParticipants?: ApiParticipant[];
  /**
   * SSR: Initial pre-searches from route loader for first paint
   * Store may be empty during SSR - use these for immediate content render
   */
  initialPreSearches?: StoredPreSearch[];
  /**
   * SSR: Initial changelog from route loader for first paint
   * Ensures changelog accordion shows on SSR without waiting for client-side query
   */
  initialChangelog?: ApiChangelog[];
};

export function ChatView({
  user,
  slug,
  mode,
  onSubmit,
  chatAttachments,
  threadId: serverThreadId,
  initialMessages,
  initialParticipants,
  initialPreSearches,
  initialChangelog,
}: ChatViewProps) {
  const t = useTranslations();

  const isModeModalOpen = useBoolean(false);
  const isModelModalOpen = useBoolean(false);

  const attachmentClickRef = useRef<(() => void) | null>(null);
  // Track initial mount to skip showing "models deselected" toast on page load
  const hasCompletedInitialMountRef = useRef(false);
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
    showInitialUI,
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
    currentResumptionPhase,
    resumptionRoundNumber,
    changelogItems,
    addChangelogItems,
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
      showInitialUI: s.showInitialUI,
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
      currentResumptionPhase: s.currentResumptionPhase,
      resumptionRoundNumber: s.resumptionRoundNumber,
      changelogItems: s.changelogItems,
      addChangelogItems: s.addChangelogItems,
    })),
  );

  const storeApi = useChatStoreApi();
  const getIsStreamingFromStore = useCallback(() => {
    const state = storeApi.getState();
    return state.isStreaming || state.isModeratorStreaming;
  }, [storeApi]);

  const effectiveThreadId = serverThreadId || thread?.id || createdThreadId || '';
  const currentStreamingParticipant = contextParticipants[currentParticipantIndex] || null;

  // ✅ SSR FIX: Compute effective data EARLY for use in completedRoundNumbers
  // Store hydration happens in useLayoutEffect (client-only), so server renders with empty store
  // Fall back to initialMessages/initialParticipants/initialPreSearches for SSR content paint
  const effectiveMessages = useMemo(
    () => messages.length > 0 ? messages : (initialMessages ?? []),
    [messages, initialMessages],
  );
  const effectiveParticipants = useMemo(
    () => contextParticipants.length > 0 ? contextParticipants : (initialParticipants ?? []),
    [contextParticipants, initialParticipants],
  );
  const effectivePreSearches = useMemo(
    () => preSearches.length > 0 ? preSearches : (initialPreSearches ?? []),
    [preSearches, initialPreSearches],
  );

  // ✅ MOVED UP: Need completedRoundNumbers early for shouldSkipAuxiliaryQueries
  // ✅ PERF FIX: Use ref to stabilize Set reference - only create new Set when contents change
  // Previously, useMemo created a new Set on every messages change, causing ChatMessageList
  // memo comparison to always fail (reference inequality) even when contents were identical.
  // This caused unnecessary re-renders and the "round flash" at round completion.
  const completedRoundNumbersRef = useRef<Set<number>>(new Set());
  const completedRoundNumbers = useMemo(() => {
    const completed = new Set<number>();
    effectiveMessages.forEach((msg) => {
      if (isModeratorMessage(msg)) {
        const moderatorMeta = getModeratorMetadata(msg.metadata);
        const roundNum = getRoundNumber(msg.metadata);

        // ✅ CHANGELOG FIX: Count round as complete if moderator has either:
        // 1. finishReason (explicit completion signal from backend), OR
        // 2. Non-streaming text content (message is complete even if finishReason missing)
        // This fixes changelog not showing on SSR when finishReason isn't in metadata
        const hasFinishReason = !!moderatorMeta?.finishReason;
        const hasNonStreamingContent = msg.parts?.some(
          p => p.type === 'text' && 'text' in p && typeof p.text === 'string' && p.text.trim().length > 0
            && (!('state' in p) || p.state !== 'streaming'),
        ) ?? false;

        if ((hasFinishReason || hasNonStreamingContent) && roundNum !== null) {
          completed.add(roundNum);
        }
      }
    });
    // ✅ REFRESH FIX: When server prefills currentResumptionPhase=COMPLETE after SSR refresh,
    // treat that round as complete even before fresh messages load (moderator msg may be absent)
    // This prevents participants from entering "thinking mode" on page refresh
    if (currentResumptionPhase === RoundPhases.COMPLETE && resumptionRoundNumber !== null) {
      completed.add(resumptionRoundNumber);
    }

    // ✅ STABLE REFERENCE: Only return new Set if contents actually changed
    const prevSet = completedRoundNumbersRef.current;
    if (prevSet.size === completed.size && [...prevSet].every(n => completed.has(n))) {
      return prevSet; // Contents unchanged - return stable reference
    }
    completedRoundNumbersRef.current = completed;
    return completed;
  }, [effectiveMessages, currentResumptionPhase, resumptionRoundNumber]);

  // ✅ PERF: Detect when auxiliary queries should be skipped
  // Changelog/feedback data only exists AFTER a round completes, so skip when:
  // 1. Initial creation flow (just created from overview, streaming round 0)
  // 2. First round is currently streaming
  // 3. No completed rounds yet AND not returning to existing thread with data
  const isInitialCreationFlow = Boolean(createdThreadId) && streamingRoundNumber === 0;
  const isFirstRoundStreaming = streamingRoundNumber === 0 && (isStreaming || isModeratorStreaming || waitingToStartStreaming);
  const hasNoCompletedRounds = completedRoundNumbers.size === 0;
  // ✅ FIX: Don't skip when returning to existing thread with initial messages
  // Race condition: effectiveMessages may be empty during first render before hydration
  // If initialMessages exist from loader, we're returning to an existing thread that has data
  const isReturningToExistingThread = mode === ScreenModes.THREAD && effectiveThreadId && initialMessages && initialMessages.length > 0;
  const shouldSkipAuxiliaryQueries = isInitialCreationFlow || isFirstRoundStreaming || (hasNoCompletedRounds && !isReturningToExistingThread);

  // ✅ RESUMPTION DEBUG: Track changelog query enabled state
  useEffect(() => {
    if (mode === ScreenModes.THREAD && effectiveThreadId) {
      rlog.resume('changelog-query', `t=${effectiveThreadId.slice(-8)} skip=${shouldSkipAuxiliaryQueries ? 1 : 0} (create=${isInitialCreationFlow ? 1 : 0} firstStream=${isFirstRoundStreaming ? 1 : 0} noRounds=${hasNoCompletedRounds ? 1 : 0} returning=${isReturningToExistingThread ? 1 : 0}) completed=[${[...completedRoundNumbers]}] msgs=${effectiveMessages.length}`);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, effectiveThreadId, shouldSkipAuxiliaryQueries, completedRoundNumbers.size, effectiveMessages.length]);

  const { data: modelsData, isLoading: isModelsLoading } = useModelsQuery();
  const { data: customRolesData } = useCustomRolesQuery(isModelModalOpen.value && !isStreaming);
  const { borderVariant: _borderVariant } = useFreeTrialState();

  // ✅ PERF: Only fetch changelog/feedback for established threads (not during initial creation)
  // These queries are not needed during the first round - data doesn't exist yet
  const { data: changelogResponse } = useThreadChangelogQuery(
    effectiveThreadId,
    mode === ScreenModes.THREAD && Boolean(effectiveThreadId) && !shouldSkipAuxiliaryQueries,
  );

  const { data: feedbackData, isSuccess: feedbackSuccess } = useThreadFeedbackQuery(
    effectiveThreadId,
    mode === ScreenModes.THREAD && Boolean(effectiveThreadId) && !shouldSkipAuxiliaryQueries,
  );

  const allEnabledModels = useMemo(() => {
    if (!modelsData?.success) {
      return [];
    }
    return modelsData.data.items;
  }, [modelsData]);

  const customRoles = useMemo(() => {
    if (!customRolesData?.pages) {
      return [];
    }
    return customRolesData.pages.flatMap((page) => {
      if (!page?.success)
        return [];
      return page.data.items;
    });
  }, [customRolesData?.pages]);

  const userTierConfig = useMemo(() => {
    if (!modelsData?.success) {
      return undefined;
    }
    return modelsData.data.user_tier_config;
  }, [modelsData]);

  // ✅ FIX: Use store's changelogItems for persistence across navigation
  // Store is hydrated on SSR via useSyncHydrateStore, query syncs new items
  const changelog: ApiChangelog[] = useMemo(() => {
    // Use store data, fall back to initial prop for SSR first paint before hydration
    const items = changelogItems.length > 0 ? changelogItems : (initialChangelog ?? []);

    // Deduplicate by ID
    const seen = new Set<string>();
    return items.filter((item: ApiChangelog) => {
      if (seen.has(item.id))
        return false;
      seen.add(item.id);
      return true;
    });
  }, [changelogItems, initialChangelog]);

  // ✅ FIX: Sync query response to store for persistence across navigation
  useEffect(() => {
    if (changelogResponse?.success && changelogResponse.data?.items?.length) {
      addChangelogItems(changelogResponse.data.items);
    }
  }, [changelogResponse, addChangelogItems]);

  // ✅ RESUMPTION DEBUG: Track changelog data availability and source
  useEffect(() => {
    if (mode === ScreenModes.THREAD && effectiveThreadId) {
      const rounds = [...new Set(changelog.map(c => c.roundNumber))];
      const storeItems = changelogItems.length;
      const queryItems = changelogResponse?.success ? changelogResponse.data?.items?.length ?? 0 : 0;
      const initialItems = initialChangelog?.length ?? 0;
      const source = storeItems > 0 ? 'store' : (queryItems > 0 ? 'query' : (initialItems > 0 ? 'ssr' : 'none'));
      rlog.resume('changelog-data', `t=${effectiveThreadId.slice(-8)} items=${changelog.length} rounds=[${rounds}] src=${source} (store=${storeItems} query=${queryItems} ssr=${initialItems})`);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, effectiveThreadId, changelog.length, changelogItems.length, changelogResponse?.success, initialChangelog?.length]);

  const orderedModels = useOrderedModels({
    selectedParticipants,
    allEnabledModels,
    modelOrder,
  });

  // Sort selected models to top when modal opens (on revisit)
  useEffect(() => {
    if (!isModelModalOpen.value || selectedParticipants.length === 0)
      return;

    // Get selected model IDs sorted by priority
    const selectedModelIds = [...selectedParticipants]
      .sort((a, b) => a.priority - b.priority)
      .map(p => p.modelId);

    // Get unselected model IDs in current order
    const unselectedModelIds = modelOrder.filter(id => !selectedModelIds.includes(id));

    // New order: selected first, then unselected
    const newOrder = [...selectedModelIds, ...unselectedModelIds];

    // Only update if order actually changed
    const orderChanged = newOrder.some((id, i) => modelOrder[i] !== id);
    if (orderChanged) {
      setModelOrder(newOrder);
    }
  // Only run when modal opens, not on every participant/order change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isModelModalOpen.value]);

  // ✅ GRANULAR: Track vision (image) and file (document) incompatibilities separately
  const incompatibleModelData = useMemo(() => {
    const incompatible = new Set<string>();

    // Add inaccessible models (tier restrictions)
    for (const model of allEnabledModels) {
      if (!model.is_accessible_to_user) {
        incompatible.add(model.id);
      }
    }

    // Check for images in thread and attachments
    const existingImageFiles = messages.some((msg) => {
      if (!msg.parts)
        return false;
      return msg.parts.some((part) => {
        if (!isFilePart(part))
          return false;
        return isImageFile(part.mediaType);
      });
    });
    const newImageFiles = chatAttachments.attachments.some(att =>
      isImageFile(att.file.type),
    );
    const hasImages = existingImageFiles || newImageFiles;

    // Check for documents in thread and attachments
    const existingDocumentFiles = messages.some((msg) => {
      if (!msg.parts)
        return false;
      return msg.parts.some((part) => {
        if (!isFilePart(part))
          return false;
        return isDocumentFile(part.mediaType);
      });
    });
    const newDocumentFiles = chatAttachments.attachments.some(att =>
      isDocumentFile(att.file.type),
    );
    const hasDocuments = existingDocumentFiles || newDocumentFiles;

    // Build file list for capability checking
    const files: Array<{ mimeType: string }> = [];
    if (hasImages) {
      files.push({ mimeType: 'image/png' }); // Representative image type
    }
    if (hasDocuments) {
      files.push({ mimeType: 'application/pdf' }); // Representative document type
    }

    // Get detailed incompatibility info
    // Map models to the shape expected by getDetailedIncompatibleModelIds
    const modelsWithCapabilities = allEnabledModels.map((m: Model) => ({
      id: m.id,
      capabilities: {
        vision: m.supports_vision,
        file: m.supports_file,
      },
    }));
    const {
      incompatibleIds,
      visionIncompatibleIds,
      fileIncompatibleIds,
    } = getDetailedIncompatibleModelIds(modelsWithCapabilities, files);

    // Merge with tier-restricted models
    for (const id of incompatibleIds) {
      incompatible.add(id);
    }

    return {
      incompatibleModelIds: incompatible,
      visionIncompatibleModelIds: visionIncompatibleIds,
      fileIncompatibleModelIds: fileIncompatibleIds,
    };
  }, [messages, chatAttachments.attachments, allEnabledModels]);

  const incompatibleModelIds = incompatibleModelData.incompatibleModelIds;
  const visionIncompatibleModelIds = incompatibleModelData.visionIncompatibleModelIds;
  const fileIncompatibleModelIds = incompatibleModelData.fileIncompatibleModelIds;

  const incompatibleModelIdsRef = useRef(incompatibleModelIds);
  useEffect(() => {
    incompatibleModelIdsRef.current = incompatibleModelIds;
  }, [incompatibleModelIds]);

  // ✅ SSR FIX: effectiveMessages/effectiveParticipants/effectivePreSearches computed earlier
  // for use in completedRoundNumbers. Use effectivePreSearches for timeline.
  const timelineItems: TimelineItem[] = useThreadTimeline({
    messages: effectiveMessages,
    changelog,
    preSearches: effectivePreSearches,
  });

  const feedbackActions = useFeedbackActions({ threadId: effectiveThreadId });

  const lastLoadedFeedbackRef = useRef<string>('');
  useEffect(() => {
    if (feedbackSuccess && feedbackData?.success && feedbackData.data && Array.isArray(feedbackData.data)) {
      const feedbackArray: RoundFeedbackData[] = feedbackData.data as RoundFeedbackData[];
      const feedbackKey = feedbackArray.map((feedback) => {
        const fb = feedback as Record<string, unknown>;
        return `${fb.roundNumber as number}:${(fb.feedbackType as string | null) ?? 'none'}`;
      }).join(',');
      if (feedbackKey !== lastLoadedFeedbackRef.current) {
        lastLoadedFeedbackRef.current = feedbackKey;
        feedbackActions.loadFeedback(feedbackArray);
      }
    }
  }, [feedbackData, feedbackSuccess, feedbackActions]);

  const inputContainerRef = useRef<HTMLDivElement | null>(null);

  // Sidebar state for dynamic input positioning
  // FLOATING variant with ICON collapsible: collapsed = 6rem (icon + padding), expanded = 20rem
  const sidebarContext = useSidebarOptional();
  const isSidebarCollapsed = sidebarContext?.state === SidebarStates.COLLAPSED;
  // Desktop-first SSR: default to true on server, hydrate to actual viewport
  const isDesktop = useMediaQuery('(min-width: 768px)', true);

  const threadActions = useThreadActions({
    slug: slug || '',
    isRoundInProgress: isStreaming || isModeratorStreaming,
  });

  useEffect(() => {
    // Mark initial mount as complete after first run
    // This prevents showing toast on page load for pre-existing incompatible models
    const isInitialMount = !hasCompletedInitialMountRef.current;
    if (isInitialMount) {
      hasCompletedInitialMountRef.current = true;
    }

    const hasVisualAttachments = chatAttachments.attachments.some(att =>
      isVisionRequiredMimeType(att.file.type),
    );

    // Skip incompatible filter when autoMode is enabled in OVERVIEW mode
    // Server validates model accessibility in auto mode - trust those results
    // ✅ VISION FIX: ALWAYS check vision incompatibility when files are attached
    // Even in auto mode, we need to filter out non-vision models before submission
    if (mode === ScreenModes.OVERVIEW && autoMode && !hasVisualAttachments) {
      return;
    }

    // Skip in OVERVIEW mode with no messages and no visual files
    if (mode === ScreenModes.OVERVIEW && messages.length === 0 && !hasVisualAttachments) {
      return;
    }
    if (incompatibleModelIds.size === 0) {
      return;
    }

    const incompatibleSelected = selectedParticipants.filter(p =>
      incompatibleModelIds.has(p.modelId),
    );

    if (incompatibleSelected.length === 0) {
      return;
    }

    // ✅ GRANULAR: Track deselected models by reason
    const visionDeselected = incompatibleSelected.filter(
      p => visionIncompatibleModelIds.has(p.modelId),
    );
    const fileDeselected = incompatibleSelected.filter(
      p => fileIncompatibleModelIds.has(p.modelId) && !visionIncompatibleModelIds.has(p.modelId),
    );

    const visionModelNames = visionDeselected
      .map((p: ParticipantConfig) => allEnabledModels.find((m: Model) => m.id === p.modelId)?.name)
      .filter((name): name is string => Boolean(name));

    const fileModelNames = fileDeselected
      .map((p: ParticipantConfig) => allEnabledModels.find((m: Model) => m.id === p.modelId)?.name)
      .filter((name): name is string => Boolean(name));

    const compatibleParticipants = selectedParticipants
      .filter(p => !incompatibleModelIds.has(p.modelId))
      .map((p, index) => ({ ...p, priority: index }));

    if (mode === ScreenModes.THREAD) {
      threadActions.handleParticipantsChange(compatibleParticipants);
    } else {
      setSelectedParticipants(compatibleParticipants);
    }

    // ✅ GRANULAR TOASTS: Show specific reason for deselection (not on initial page load)
    if (!isInitialMount) {
      // Toast for vision (image) incompatibility
      if (visionModelNames.length > 0) {
        const modelList = visionModelNames.length <= 2
          ? visionModelNames.join(' and ')
          : `${visionModelNames.slice(0, 2).join(', ')} and ${visionModelNames.length - 2} more`;

        toastManager.warning(
          t('chat.models.modelsDeselected'),
          t('chat.models.modelsDeselectedDueToImages', { models: modelList }),
        );
      }

      // Toast for file (document) incompatibility - separate from vision
      if (fileModelNames.length > 0) {
        const modelList = fileModelNames.length <= 2
          ? fileModelNames.join(' and ')
          : `${fileModelNames.slice(0, 2).join(', ')} and ${fileModelNames.length - 2} more`;

        toastManager.warning(
          t('chat.models.modelsDeselected'),
          t('chat.models.modelsDeselectedDueToDocuments', { models: modelList }),
        );
      }
    }
  }, [mode, autoMode, incompatibleModelIds, visionIncompatibleModelIds, fileIncompatibleModelIds, selectedParticipants, messages, threadActions, setSelectedParticipants, allEnabledModels, t, chatAttachments.attachments]);

  const formActions = useChatFormActions();
  // syncToPreferences=false for ChatView - overview screen handles preference persistence
  const { analyzeAndApply } = useAutoModeAnalysis(false);

  const { showLoader } = useFlowLoading({ mode });

  // ✅ SSR FIX: Data is ready if store is hydrated OR initial data is available from props
  // This allows SSR to render content immediately using initialMessages
  const hasInitialDataFromProps = (initialMessages?.length ?? 0) > 0;
  // ✅ CREATION FLOW FIX: Detect active creation flow to prevent skeleton flash
  // When createdThreadId is set and showInitialUI is false, we're mid-creation with valid store data
  const isInActiveCreationFlow = Boolean(createdThreadId) && !showInitialUI;
  const isStoreReady = mode === ScreenModes.THREAD
    ? ((hasInitiallyLoaded && messages.length > 0) || hasInitialDataFromProps || isInActiveCreationFlow)
    : true;

  // Chat scroll hook provides manual scrollToBottom for user-initiated actions only
  // NO auto-scroll on page load - user controls their scroll position
  useChatScroll({
    messages,
    enableNearBottomDetection: true,
  });

  const isResumptionActive = preSearchResumption?.status === MessageStatuses.STREAMING
    || preSearchResumption?.status === MessageStatuses.PENDING
    || moderatorResumption?.status === MessageStatuses.STREAMING
    || moderatorResumption?.status === MessageStatuses.PENDING;

  const isRoundInProgress = streamingRoundNumber !== null;

  // Core blocking state for operations in progress
  const isOperationBlocked = isStreaming
    || isCreatingThread
    || waitingToStartStreaming
    || showLoader
    || isModeratorStreaming
    || Boolean(pendingMessage)
    || isResumptionActive
    || formActions.isSubmitting
    || isRoundInProgress
    || isAnalyzingPrompt;

  // Full input blocking includes loading states
  const isInputBlocked = isOperationBlocked || isModelsLoading;

  // Toggle can work even while models load - only block during active operations
  const isToggleDisabled = isOperationBlocked;

  const showSubmitSpinner = formActions.isSubmitting || (waitingToStartStreaming && !isStreaming) || isAnalyzingPrompt;

  const handleAutoModeSubmit = useCallback(async (e: React.FormEvent) => {
    // ✅ FIX: Auto mode analysis should run for BOTH overview (initial) AND thread (mid-conversation)
    // Previously only ran for OVERVIEW, causing mid-conversation submissions to skip AI config
    if (autoMode && inputValue.trim()) {
      // Check for image files to restrict model selection to vision-capable models
      const hasImageFiles = chatAttachments.attachments.some(att =>
        isVisionRequiredMimeType(att.file.type),
      );

      // Build set of accessible model IDs to filter server response
      const accessibleModelIds: Set<string> = new Set(
        allEnabledModels.filter((m: Model) => m.is_accessible_to_user).map((m: Model) => m.id),
      );

      // Consolidated auto mode analysis - updates store directly
      await analyzeAndApply({
        prompt: inputValue.trim(),
        hasImageFiles,
        accessibleModelIds,
      });
    }
    await onSubmit(e);
  }, [autoMode, inputValue, chatAttachments.attachments, allEnabledModels, analyzeAndApply, onSubmit]);

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
          t('chat.models.cannotSelectModel'),
          t('chat.models.modelIncompatibleWithFiles'),
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

  const handlePresetSelect = useCallback(async (preset: ModelPreset) => {
    const result = await filterPresetParticipants(
      preset,
      incompatibleModelIdsRef.current,
      t as (key: string, values?: { count: number }) => string,
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
          <div className="container max-w-4xl mx-auto px-5 md:px-6 pt-16 pb-[20rem]">
            <ThreadTimeline
              timelineItems={timelineItems}
              user={user}
              participants={effectiveParticipants}
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
              initialScrollToBottom={false}
            />
          </div>

          <div
            ref={inputContainerRef}
            className="fixed inset-x-0 z-30"
            style={{
              bottom: `${keyboardOffset}px`,
              // Dynamic left offset for desktop based on sidebar state
              // FLOATING variant: collapsed = icon + padding (6rem), expanded = 20rem
              left: isDesktop
                ? (isSidebarCollapsed ? 'calc(var(--sidebar-width-icon) + 2rem)' : 'var(--sidebar-width)')
                : undefined,
            }}
          >
            <div className="absolute inset-0 -bottom-4 bg-gradient-to-t from-background from-85% to-transparent pointer-events-none" />
            <div className="w-full max-w-4xl mx-auto px-5 md:px-6 pt-4 pb-4 relative">
              <ChatScrollButton variant="input" />
              <ChatInputContainer
                participants={selectedParticipants}
                inputValue={inputValue}
                isHydrating={mode === ScreenModes.THREAD && !hasInitiallyLoaded}
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
                <ChatInput
                  className="border-0 shadow-none rounded-none"
                  hideInternalAlerts
                  value={inputValue}
                  onChange={setInputValue}
                  onSubmit={handleAutoModeSubmit}
                  disabled={isAnalyzingPrompt}
                  status={isInputBlocked ? 'submitted' : 'ready'}
                  placeholder={t('chat.input.placeholder')}
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
                  autoMode={autoMode}
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
                      autoMode={autoMode}
                    />
                  )}
                />
              </ChatInputContainer>
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
          visionIncompatibleModelIds={visionIncompatibleModelIds}
          fileIncompatibleModelIds={fileIncompatibleModelIds}
        />
      )}
    </>
  );
}
