'use client';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { ChatMessage, ChatParticipant, ChatThread } from '@/api/routes/chat/schema';
import { Actions } from '@/components/ai-elements/actions';
import { ChatDeleteDialog } from '@/components/chat/chat-delete-dialog';
import type { ParticipantConfig } from '@/components/chat/chat-form-schemas';
import { ChatInput } from '@/components/chat/chat-input';
import { ChatMessageList } from '@/components/chat/chat-message-list';
import { ChatModeSelector } from '@/components/chat/chat-mode-selector';
import { ChatParticipantsList } from '@/components/chat/chat-participants-list';
import { ChatThreadActions } from '@/components/chat/chat-thread-actions';
import { ConfigurationChangesGroup } from '@/components/chat/configuration-changes-group';
import { clearTriggeredAnalysesForRound } from '@/components/chat/moderator/moderator-analysis-stream';
import { RoundAnalysisCard } from '@/components/chat/moderator/round-analysis-card';
import { RoundFeedback } from '@/components/chat/round-feedback';
import { StreamingParticipantsLoader } from '@/components/chat/streaming-participants-loader';
import { useThreadHeader } from '@/components/chat/thread-header-context';
import { UnifiedErrorBoundary } from '@/components/chat/unified-error-boundary';
import { useSharedChatContext } from '@/contexts/chat-context';
import { useChatThreadDispatch, useChatThreadState } from '@/contexts/chat-thread-state-context';
import { useSetRoundFeedbackMutation, useUpdateThreadMutation } from '@/hooks/mutations/chat-mutations';
import { useThreadChangelogQuery, useThreadFeedbackQuery } from '@/hooks/queries/chat';
import {
  useAnalysisCreation,
  useAnalysisDeduplication,
  useBoolean,
  useChatAnalysis,
  useChatScroll,
  useSelectedParticipants,
  useStreamingLoaderState,
  useSyncedMessageRefs,
} from '@/hooks/utils';
import type { ChatModeId } from '@/lib/config/chat-modes';
import { queryKeys } from '@/lib/data/query-keys';
import { messageHasError, MessageMetadataSchema } from '@/lib/schemas/message-metadata';
import { chatMessagesToUIMessages } from '@/lib/utils/message-transforms';
import { calculateNextRoundNumber, getRoundNumberFromMetadata, groupMessagesByRound } from '@/lib/utils/round-utils';

type ChatThreadScreenProps = {
  thread: ChatThread;
  participants: ChatParticipant[];
  initialMessages: ChatMessage[];
  slug: string;
  user: {
    name: string;
    image: string | null;
  };
};
function useThreadHeaderUpdater({
  thread,
  slug,
  onDeleteClick,
}: {
  thread: ChatThread;
  slug: string;
  onDeleteClick: () => void;
}) {
  const { setThreadActions, setThreadTitle } = useThreadHeader();
  useEffect(() => {
    setThreadTitle(thread.title);
    setThreadActions(
      <ChatThreadActions
        thread={thread}
        slug={slug}
        onDeleteClick={onDeleteClick}
      />,
    );
  }, [thread, slug, onDeleteClick, setThreadTitle, setThreadActions]);
}
export default function ChatThreadScreen({
  thread,
  participants,
  initialMessages,
  slug,
  user,
}: ChatThreadScreenProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const t = useTranslations('chat');
  const isDeleteDialogOpen = useBoolean(false);
  useThreadHeaderUpdater({
    thread,
    slug,
    onDeleteClick: isDeleteDialogOpen.onTrue,
  });
  const {
    messages,
    sendMessage,
    isStreaming,
    currentParticipantIndex,
    error: _streamError,
    retry: retryRound,
    stop: stopStreaming,
    initializeThread,
    setOnComplete,
    setOnRetry,
    participants: contextParticipants,
    updateParticipants,
    setMessages, // ✅ Added for message refetch functionality
  } = useSharedChatContext();
  // ✅ REACT 19 PATTERN: Use context state and dispatch instead of scattered useState
  const state = useChatThreadState();
  const dispatch = useChatThreadDispatch();

  // ✅ CRITICAL FIX: Keep changelog query always enabled so it refetches when invalidated
  // Previously disabled after initial load, preventing real-time changelog updates
  const { data: changelogResponse, isFetching: isChangelogFetching } = useThreadChangelogQuery(thread.id, true);

  // ✅ Use changelog data directly from query instead of client state
  // This ensures real-time updates when the query is invalidated by mutations
  const changelog = useMemo(() => {
    if (!changelogResponse?.success) {
      return [];
    }
    const items = changelogResponse.data.items || [];
    const seen = new Set<string>();
    return items.filter((item) => {
      if (seen.has(item.id))
        return false;
      seen.add(item.id);
      return true;
    });
  }, [changelogResponse]);
  const { data: feedbackData, isSuccess: feedbackSuccess } = useThreadFeedbackQuery(thread.id, !state.flags.hasInitiallyLoaded);

  // ✅ CRITICAL FIX: Refetch messages after initial load to catch any race condition
  // When navigating from overview screen, messages might still be saving to DB when SSR fetch happens
  // This one-time refetch ensures we get all messages even if there was a timing issue
  // See: ChatOverviewScreen.tsx redirect timing and message-persistence.service.ts
  // ✅ REACT 19 PATTERN: Use context state instead of local useState
  const hasRefetchedMessages = state.flags.hasRefetchedMessages;

  // Use lazy initialization to avoid creating Map on every render
  const [clientFeedback, setClientFeedback] = useState<Map<number, 'like' | 'dislike' | null>>(() => new Map());
  const [hasLoadedFeedback, setHasLoadedFeedback] = useState(false);
  useEffect(() => {
    // Load feedback when query succeeds and we haven't loaded it yet
    // feedbackData is the array directly (query hook extracts response.data)
    if (!hasLoadedFeedback && feedbackSuccess && feedbackData) {
      // Ensure it's an array with fallback to empty array
      const feedbackArray = Array.isArray(feedbackData) ? feedbackData : [];

      const initialFeedback = new Map(
        feedbackArray.map(f => [f.roundNumber, f.feedbackType] as const),
      );
      // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect -- Intentional initial data load
      setClientFeedback(initialFeedback);
      // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect -- Intentional flag to prevent re-loading
      setHasLoadedFeedback(true);
    }
  }, [feedbackData, feedbackSuccess, hasLoadedFeedback]);
  const feedbackByRound = clientFeedback;
  // ✅ REACT 19 PATTERN: Use context state instead of scattered useState
  // All regeneration, analysis, and changelog flags now managed by reducer
  const { isWaitingForChangelog } = state.flags;

  const {
    analyses: rawAnalyses,
    createPendingAnalysis,
    updateAnalysisData,
    updateAnalysisStatus,
    removePendingAnalysis,
  } = useChatAnalysis({
    threadId: thread.id,
    mode: thread.mode as ChatModeId,
    // AI SDK v5 Pattern: Simple boolean logic for query enabling
    // Disable during streaming OR regeneration OR analysis creation to prevent refetching
    // Enable only when idle and after initial load
    // ✅ REACT 19 PATTERN: Use context state flags
    enabled: state.flags.hasInitiallyLoaded && !isStreaming && !state.flags.isRegenerating && !state.flags.isCreatingAnalysis,
  });

  // Deduplicate analyses with regeneration filtering
  const analyses = useAnalysisDeduplication(rawAnalyses, {
    regeneratingRoundNumber: state.data.regeneratingRoundNumber,
  });
  const updateThreadMutation = useUpdateThreadMutation();
  const setRoundFeedbackMutation = useSetRoundFeedbackMutation();
  useEffect(() => {
    if (!state.flags.hasInitiallyLoaded && changelogResponse && feedbackSuccess) {
      // ✅ REACT 19 PATTERN: Use dispatch instead of setState
      dispatch({ type: 'SET_HAS_INITIALLY_LOADED', payload: true });
    }
  }, [changelogResponse, feedbackSuccess, state.flags.hasInitiallyLoaded, dispatch]);

  // ✅ CRITICAL FIX: One-time message refetch to handle race condition
  // After initial load completes, use requestIdleCallback to refetch when browser is idle
  // This ensures all participant messages are displayed without blocking UI
  useEffect(() => {
    if (state.flags.hasInitiallyLoaded && !hasRefetchedMessages && messages.length > 0) {
      // AI SDK v5 Pattern: Use requestIdleCallback (with setTimeout fallback)
      const refetchCallback = async () => {
        try {
          // Import the service dynamically to avoid SSR issues
          const { getThreadBySlugService } = await import('@/services/api');
          const result = await getThreadBySlugService({ param: { slug } });

          if (result.success && result.data.messages.length > messages.length) {
            // New messages found - update context with fresh data
            const freshMessages = result.data.messages.map(m => ({
              ...m,
              createdAt: new Date(m.createdAt),
            }));

            // Use setMessages from useChat to update internal state
            const uiMessages = await import('@/lib/utils/message-transforms').then(
              mod => mod.chatMessagesToUIMessages(freshMessages),
            );

            // Update context messages
            setMessages(uiMessages);
          }
        } catch {
          // Silently fail - this is just a safety net
        } finally {
          // ✅ REACT 19 PATTERN: Use dispatch instead of setState
          dispatch({ type: 'SET_HAS_REFETCHED_MESSAGES', payload: true });
        }
      };

      // Use requestIdleCallback with fallback to requestAnimationFrame
      const idleHandle = typeof requestIdleCallback !== 'undefined'
        ? requestIdleCallback(refetchCallback, { timeout: 2000 })
        : (requestAnimationFrame(refetchCallback) as unknown as number);

      return () => {
        if (typeof cancelIdleCallback !== 'undefined') {
          cancelIdleCallback(idleHandle);
        } else {
          cancelAnimationFrame(idleHandle);
        }
      };
    }
    return undefined;
  }, [state.flags.hasInitiallyLoaded, hasRefetchedMessages, messages.length, slug, setMessages, dispatch]);

  // Use synced refs to prevent stale closures in callbacks
  const {
    messagesRef,
    participantsRef: contextParticipantsRef,
  } = useSyncedMessageRefs({
    messages,
    participants: contextParticipants,
    createPendingAnalysis,
  });

  // Use consolidated analysis creation hook with regeneration support
  const { handleComplete: analysisCompleteCallback, createdAnalysisRoundsRef } = useAnalysisCreation({
    createPendingAnalysis,
    messages,
    participants: contextParticipants,
    messagesRef,
    participantsRef: contextParticipantsRef,
    isRegeneration: state.data.regeneratingRoundNumber !== null,
    regeneratingRoundNumber: state.data.regeneratingRoundNumber,
    onBeforeCreate: () => {
      dispatch({ type: 'SET_IS_CREATING_ANALYSIS', payload: true });
    },
    onAfterCreate: (roundNumber) => {
      // Complete regeneration if active
      if (state.data.regeneratingRoundNumber === roundNumber) {
        dispatch({ type: 'COMPLETE_REGENERATION', payload: roundNumber });
      }
      dispatch({ type: 'SET_STREAMING_ROUND_NUMBER', payload: null });
      state.currentRoundNumberRef.current = null;
      dispatch({ type: 'SET_IS_CREATING_ANALYSIS', payload: false });

      // Invalidate analyses query to trigger refetch
      queryClient.invalidateQueries({
        queryKey: queryKeys.threads.analyses(thread.id),
      });
    },
    onAllParticipantsFailed: (roundNumber) => {
      // Complete regeneration if active
      if (state.data.regeneratingRoundNumber === roundNumber) {
        dispatch({ type: 'COMPLETE_REGENERATION', payload: roundNumber });
      }
      dispatch({ type: 'SET_STREAMING_ROUND_NUMBER', payload: null });
      state.currentRoundNumberRef.current = null;
    },
  });

  const { hasSentPendingMessageRef } = state;
  const [pendingFeedback, setPendingFeedback] = useState<{
    roundNumber: number;
    type: 'like' | 'dislike';
  } | null>(null);

  /**
   * SIMPLIFIED ROUND MANAGEMENT
   * - Backend provides round numbers in message metadata
   * - Frontend trusts backend as source of truth
   * - Removed complex client-side round tracking
   * - Round numbers extracted from messages using getRoundNumberFromMetadata()
   * ✅ REACT 19 PATTERN: Use context state and refs exclusively
   * Note: regeneratingRoundNumber accessed via state.data.regeneratingRoundNumber in useMemo deps
   */
  const { streamingRoundNumber } = state.data;
  const { currentRoundNumberRef } = state;

  const initialParticipants = useMemo<ParticipantConfig[]>(() => {
    return contextParticipants
      .filter(p => p.isEnabled)
      .sort((a, b) => a.priority - b.priority)
      .map((p, index) => ({
        id: p.id,
        modelId: p.modelId,
        role: p.role,
        customRoleId: p.customRoleId || undefined,
        priority: index,
      }));
  }, [contextParticipants]);
  const {
    selectedParticipants,
    setSelectedParticipants,
    handleRemoveParticipant: removeParticipant,
  } = useSelectedParticipants(initialParticipants);
  const [selectedMode, setSelectedMode] = useState<ChatModeId>(thread.mode as ChatModeId);
  const [inputValue, setInputValue] = useState('');

  // ✅ REACT 19 PATTERN: Use context state instead of local useState
  const { pendingMessage, expectedParticipantIds } = state.data;
  const hasPendingConfigChanges = state.flags.hasPendingConfigChanges;

  // Unified scroll management using useChatScroll hook
  const { scrolledToAnalysesRef } = useChatScroll({
    messages,
    analyses,
    isStreaming,
    scrollContainerId: 'chat-scroll-container',
    enableNearBottomDetection: true,
  });

  // Streaming loader state calculation
  const { showLoader, isAnalyzing } = useStreamingLoaderState({
    analyses,
    isStreaming,
    messages,
    selectedParticipants,
  });

  const handleModeChange = useCallback(async (newMode: ChatModeId) => {
    if (isStreaming)
      return;
    setSelectedMode(newMode);
    // ✅ REACT 19 PATTERN: Use dispatch instead of setState
    dispatch({ type: 'SET_HAS_PENDING_CONFIG_CHANGES', payload: true });
  }, [isStreaming, dispatch]);

  const handleParticipantsChange = useCallback(async (newParticipants: ParticipantConfig[]) => {
    if (isStreaming)
      return;
    setSelectedParticipants(newParticipants);
    // ✅ REACT 19 PATTERN: Use dispatch instead of setState
    dispatch({ type: 'SET_HAS_PENDING_CONFIG_CHANGES', payload: true });
  }, [isStreaming, setSelectedParticipants, dispatch]);

  // Keep a ref of the last synced context participants to prevent infinite loops
  const lastSyncedContextRef = useRef<string>('');

  // Sync local participants with context ONLY when there are no pending user changes
  // This allows users to modify participants and have changes staged until next message submission
  useEffect(() => {
    // Don't sync if:
    // 1. User is actively streaming
    // 2. User has pending configuration changes (staged for next message)
    if (isStreaming || hasPendingConfigChanges) {
      return;
    }

    // Don't sync if participants have temporary IDs (mid-creation)
    const hasTemporaryIds = contextParticipants.some(p => p.id.startsWith('participant-'));
    if (hasTemporaryIds) {
      return;
    }

    // Create a stable key for context participants
    const contextKey = contextParticipants
      .filter(p => p.isEnabled)
      .sort((a, b) => a.priority - b.priority)
      .map(p => `${p.id}:${p.modelId}:${p.priority}`)
      .join('|');

    // Only sync if context participants actually changed
    if (contextKey === lastSyncedContextRef.current) {
      return;
    }

    // Transform context participants into local format
    const syncedParticipants: ParticipantConfig[] = contextParticipants
      .filter(p => p.isEnabled)
      .sort((a, b) => a.priority - b.priority)
      .map((p, index) => ({
        id: p.id,
        modelId: p.modelId,
        role: p.role,
        customRoleId: p.customRoleId || undefined,
        priority: index,
      }));

    // Update state and ref together
    lastSyncedContextRef.current = contextKey;
    setSelectedParticipants(syncedParticipants);
  }, [contextParticipants, isStreaming, hasPendingConfigChanges, setSelectedParticipants]);
  // AI SDK v5 Pattern: Initialize thread on mount and when thread ID changes
  // Following crash course Exercise 01.07, 04.02, 04.03:
  // - Server provides initialMessages via props
  // - Call initializeThread once when thread.id changes
  // - useChat handles state management from there
  useEffect(() => {
    // ✅ REACT 19 PATTERN: Use dispatch for batch state reset
    dispatch({ type: 'RESET_THREAD_STATE' });

    // Reset UI state for new thread
    scrolledToAnalysesRef.current.clear();
    state.currentRoundNumberRef.current = null;
    state.createdAnalysisRoundsRef.current.clear();
    lastSyncedContextRef.current = '';

    // Set analysis completion callback with router refresh for new conversations
    const wrappedAnalysisCallback = () => {
      if (thread.title === 'New Conversation') {
        router.refresh();
      }
      analysisCompleteCallback();
    };

    setOnComplete(wrappedAnalysisCallback);

    // AI SDK v5 Pattern: Initialize thread with server-provided data
    const uiMessages = chatMessagesToUIMessages(initialMessages);
    initializeThread(thread, participants, uiMessages);

    // ✅ REACT 19 PATTERN: Use dispatch to set initially loaded flag
    dispatch({ type: 'SET_HAS_INITIALLY_LOADED', payload: true });

    return () => {
      setOnComplete(undefined);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.id]);
  useEffect(() => {
    setOnRetry(() => (roundNumber: number) => {
      // AI SDK v5 Pattern: Immediate state cleanup before streaming starts
      // ✅ REACT 19 PATTERN: Use dispatch for batch state updates (no local ref needed)

      // STEP 1: Set regenerate flag to preserve round numbering
      dispatch({ type: 'START_REGENERATION', payload: roundNumber });

      // STEP 2: Remove analysis IMMEDIATELY from cache
      removePendingAnalysis(roundNumber);

      // STEP 3: Clear triggered analysis IDs to prevent infinite loops
      clearTriggeredAnalysesForRound(roundNumber);

      // STEP 4: Clear analysis tracking for this round to allow recreation
      createdAnalysisRoundsRef.current.delete(roundNumber);

      // STEP 5: Clean up feedback for this round
      setClientFeedback((prev) => {
        const updated = new Map(prev);
        updated.delete(roundNumber);
        return updated;
      });

      // STEP 6: Reset streaming round number to trigger fresh UI state
      dispatch({ type: 'SET_STREAMING_ROUND_NUMBER', payload: null });
      currentRoundNumberRef.current = null;
    });
  }, [thread.id, setOnRetry, removePendingAnalysis, dispatch]);
  useEffect(() => {
    const wasStreaming = isStreaming;
    if (wasStreaming && !isStreaming) {
      // ✅ REACT 19 PATTERN: Use dispatch when streaming completes
      dispatch({ type: 'SET_STREAMING_ROUND_NUMBER', payload: null });
    }
  }, [isStreaming, dispatch]);
  useEffect(() => {
    if (!pendingMessage || !expectedParticipantIds || hasSentPendingMessageRef.current) {
      return;
    }
    const currentModelIds = contextParticipants.map(p => p.modelId).sort().join(',');
    const expectedModelIds = expectedParticipantIds.sort().join(',');

    if (currentModelIds !== expectedModelIds) {
      return;
    }

    // ✅ CRITICAL FIX: Wait for changelog query to complete before starting streaming
    // This ensures changelog appears in UI BEFORE participants start streaming
    if (isWaitingForChangelog && isChangelogFetching) {
      return;
    }

    // ✅ REACT 19 PATTERN: Use dispatch to clear waiting flag
    if (isWaitingForChangelog) {
      dispatch({ type: 'SET_IS_WAITING_FOR_CHANGELOG', payload: false });
    }

    hasSentPendingMessageRef.current = true;

    // AI SDK v5 Pattern: Calculate round number for the NEW user message
    const newRoundNumber = calculateNextRoundNumber(messages);

    // ✅ REACT 19 PATTERN: Use dispatch to set streaming round number
    dispatch({ type: 'SET_STREAMING_ROUND_NUMBER', payload: newRoundNumber });
    currentRoundNumberRef.current = newRoundNumber;

    // AI SDK v5 Pattern: Use sendMessage() to add user message AND trigger streaming
    sendMessage(pendingMessage);

    // ✅ REACT 19 PATTERN: Reset pending changes flag after message is sent
    dispatch({ type: 'SET_HAS_PENDING_CONFIG_CHANGES', payload: false });
  }, [pendingMessage, expectedParticipantIds, contextParticipants, sendMessage, messages, isWaitingForChangelog, isChangelogFetching, dispatch]);
  const handlePromptSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = inputValue.trim();
      if (!trimmed || selectedParticipants.length === 0) {
        return;
      }
      try {
        // AI SDK v5 Pattern: Don't add message optimistically
        // Instead, store the pending message and wait for participants to be ready
        // Then call sendMessage() which will add the message AND trigger streaming

        const participantsForUpdate = selectedParticipants.map(p => ({
          id: p.id.startsWith('participant-') ? '' : p.id,
          modelId: p.modelId,
          role: p.role || null,
          customRoleId: p.customRoleId || null,
          priority: p.priority,
          isEnabled: true,
        }));
        const optimisticParticipants = selectedParticipants.map((p, index) => ({
          id: p.id,
          threadId: thread.id,
          modelId: p.modelId,
          role: p.role || null,
          customRoleId: p.customRoleId || null,
          priority: index,
          isEnabled: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        }));
        const hasTemporaryIds = selectedParticipants.some(p => p.id.startsWith('participant-'));
        if (hasTemporaryIds) {
          updateParticipants(optimisticParticipants);
          const response = await updateThreadMutation.mutateAsync({
            param: { id: thread.id },
            json: {
              participants: participantsForUpdate,
              mode: selectedMode,
            },
          });
          if (response?.data?.participants) {
            const participantsWithDates = response.data.participants.map(p => ({
              ...p,
              createdAt: new Date(p.createdAt),
              updatedAt: new Date(p.updatedAt),
            }));

            // AI SDK v5 Pattern: Trust backend as source of truth
            // Backend returns ALL enabled participants for the thread (see backend-patterns.md)
            // No need to merge - backend response is complete and authoritative
            updateParticipants(participantsWithDates);
            // AI SDK v5 Pattern: Use queueMicrotask instead of setTimeout delay
            await new Promise(resolve => queueMicrotask(resolve));
            // ✅ REACT 19 PATTERN: Use dispatch to set expected participant IDs
            dispatch({ type: 'SET_EXPECTED_PARTICIPANT_IDS', payload: participantsWithDates.map(p => p.modelId) });
          } else {
            dispatch({ type: 'SET_EXPECTED_PARTICIPANT_IDS', payload: optimisticParticipants.map(p => p.modelId) });
          }
        } else {
          updateParticipants(optimisticParticipants);
          updateThreadMutation.mutateAsync({
            param: { id: thread.id },
            json: {
              participants: participantsForUpdate,
              mode: selectedMode,
            },
          }).catch(() => {
          });
          // AI SDK v5 Pattern: Use queueMicrotask instead of setTimeout delay
          await new Promise(resolve => queueMicrotask(resolve));
          // ✅ REACT 19 PATTERN: Use dispatch to set expected participant IDs
          dispatch({ type: 'SET_EXPECTED_PARTICIPANT_IDS', payload: optimisticParticipants.map(p => p.modelId) });
        }
        // ✅ REACT 19 PATTERN: Use batch action to prepare for new message
        // This sets: isWaitingForChangelog=true, pendingMessage, and resets hasSentPendingMessageRef
        dispatch({
          type: 'PREPARE_FOR_NEW_MESSAGE',
          payload: { message: trimmed, participantIds: [] }, // participantIds set above via SET_EXPECTED_PARTICIPANT_IDS
        });
        // CRITICAL FIX: Don't reset hasPendingConfigChanges here
        // It will be reset in the useEffect AFTER message is sent
        // This prevents the sync effect from interfering with optimistic updates
      } catch {
        // Error path: send message directly and reset flags
        await sendMessage(trimmed);
        // ✅ REACT 19 PATTERN: Use dispatch to reset flags on error path
        dispatch({ type: 'SET_HAS_PENDING_CONFIG_CHANGES', payload: false });
        dispatch({ type: 'SET_IS_WAITING_FOR_CHANGELOG', payload: false });
      }
      setInputValue('');
    },
    [inputValue, sendMessage, thread.id, selectedParticipants, selectedMode, updateThreadMutation, updateParticipants, dispatch],
  );
  const activeParticipants = contextParticipants;

  const messagesWithAnalysesAndChangelog = useMemo(() => {
    type ItemType
      = | { type: 'messages'; data: typeof messages; key: string; roundNumber: number }
        | { type: 'analysis'; data: (typeof analyses)[number]; key: string; roundNumber: number }
        | { type: 'changelog'; data: (typeof changelog)[number][]; key: string; roundNumber: number };

    // AI SDK v5 Pattern: Simple, straightforward grouping without optimization
    // Trust the messages array and let React handle efficient diffing
    const messagesByRound = groupMessagesByRound(messages);
    const items: ItemType[] = [];

    // Group changelog items by round
    const changelogByRound = new Map<number, (typeof changelog)>();
    changelog.forEach((change) => {
      const roundNumber = change.roundNumber || 1;
      if (!changelogByRound.has(roundNumber)) {
        changelogByRound.set(roundNumber, []);
      }
      const roundChanges = changelogByRound.get(roundNumber)!;
      const exists = roundChanges.some(existing => existing.id === change.id);
      if (!exists) {
        roundChanges.push(change);
      }
    });

    // Get all unique round numbers from messages, changelog, and analyses
    const allRoundNumbers = new Set([
      ...messagesByRound.keys(),
      ...changelogByRound.keys(),
      ...analyses.map(a => a.roundNumber),
    ]);

    // Process rounds in order
    const sortedRounds = Array.from(allRoundNumbers).sort((a, b) => a - b);

    sortedRounds.forEach((roundNumber) => {
      const roundMessages = messagesByRound.get(roundNumber);
      const roundChangelog = changelogByRound.get(roundNumber);
      const roundAnalysis = analyses.find(a => a.roundNumber === roundNumber);

      // Skip rounds without messages
      if (!roundMessages || roundMessages.length === 0) {
        return;
      }

      // Add changelog first (shows before messages in the round)
      if (roundChangelog && roundChangelog.length > 0) {
        items.push({
          type: 'changelog',
          data: roundChangelog,
          key: `round-${roundNumber}-changelog`,
          roundNumber,
        });
      }

      // Add messages for this round
      items.push({
        type: 'messages',
        data: roundMessages,
        key: `round-${roundNumber}-messages`,
        roundNumber,
      });

      // Add analysis after messages (if exists)
      if (roundAnalysis) {
        items.push({
          type: 'analysis',
          data: roundAnalysis,
          key: `round-${roundNumber}-analysis`,
          roundNumber,
        });
      }
    });

    return items;
  }, [messages, analyses, changelog]);

  const feedbackHandlersRef = useRef(new Map<number, (feedbackType: 'like' | 'dislike' | null) => void>());
  const getFeedbackHandler = useCallback((roundNumber: number) => {
    if (!feedbackHandlersRef.current.has(roundNumber)) {
      feedbackHandlersRef.current.set(roundNumber, (feedbackType: 'like' | 'dislike' | null) => {
        setClientFeedback((prev) => {
          const updated = new Map(prev);
          updated.set(roundNumber, feedbackType);
          return updated;
        });
        if (feedbackType) {
          setPendingFeedback({ roundNumber, type: feedbackType });
        }
        setRoundFeedbackMutation.mutate(
          {
            param: {
              threadId: thread.id,
              roundNumber: String(roundNumber),
            },
            json: { feedbackType },
          },
          {
            onSettled: () => {
              setPendingFeedback(null);
            },
          },
        );
      });
    }
    return feedbackHandlersRef.current.get(roundNumber)!;
  }, [setRoundFeedbackMutation, thread.id, setClientFeedback, setPendingFeedback]);
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputContainerRef = useRef<HTMLDivElement | null>(null);

  return (
    <>
      <UnifiedErrorBoundary context="chat">
        <div className="flex flex-col min-h-screen relative">
          <div id="chat-scroll-container" ref={listRef} className="container max-w-3xl mx-auto px-4 sm:px-6 pt-0 pb-32 flex-1">
            {messagesWithAnalysesAndChangelog.map((item, itemIndex) => {
              if (!item)
                return null;
              const roundNumber = item.type === 'messages'
                ? getRoundNumberFromMetadata(item.data[0]?.metadata, 1)
                : item.type === 'analysis'
                  ? item.data.roundNumber
                  : item.type === 'changelog'
                    ? item.data[0]?.roundNumber ?? 1
                    : 1;
              return (
                <div
                  key={item.key}
                >
                  {item.type === 'changelog' && item.data.length > 0 && (
                    <div className="mb-6">
                      <UnifiedErrorBoundary context="configuration">
                        <ConfigurationChangesGroup
                          group={{
                            timestamp: new Date(item.data[0]!.createdAt),
                            changes: item.data,
                          }}
                        />
                      </UnifiedErrorBoundary>
                    </div>
                  )}
                  {item.type === 'messages' && (
                    <div className="space-y-3 pb-2">
                      <UnifiedErrorBoundary context="message-list" onReset={retryRound}>
                        <ChatMessageList
                          messages={item.data}
                          user={user}
                          participants={activeParticipants}
                          isStreaming={isStreaming}
                          currentParticipantIndex={currentParticipantIndex}
                          currentStreamingParticipant={
                            isStreaming && activeParticipants[currentParticipantIndex]
                              ? activeParticipants[currentParticipantIndex]
                              : null
                          }
                        />
                      </UnifiedErrorBoundary>
                      {!isStreaming && (() => {
                        const hasRoundError = item.data.some((msg) => {
                          const parseResult = MessageMetadataSchema.safeParse(msg.metadata);
                          return parseResult.success && messageHasError(parseResult.data);
                        });

                        return (
                          <Actions className="mt-3 mb-2">
                            {!hasRoundError && (
                              <RoundFeedback
                                key={`feedback-${thread.id}-${roundNumber}`}
                                threadId={thread.id}
                                roundNumber={roundNumber}
                                currentFeedback={feedbackByRound.get(roundNumber) ?? null}
                                onFeedbackChange={getFeedbackHandler(roundNumber)}
                                disabled={isStreaming}
                                isPending={
                                  setRoundFeedbackMutation.isPending
                                  && pendingFeedback?.roundNumber === roundNumber
                                }
                                pendingType={
                                  pendingFeedback?.roundNumber === roundNumber
                                    ? pendingFeedback?.type ?? null
                                    : null
                                }
                              />
                            )}
                          </Actions>
                        );
                      })()}
                    </div>
                  )}
                  {item.type === 'analysis' && (
                    <div className="mt-6 mb-4">
                      <RoundAnalysisCard
                        analysis={item.data}
                        threadId={thread.id}
                        isLatest={itemIndex === messagesWithAnalysesAndChangelog.length - 1}
                        streamingRoundNumber={streamingRoundNumber}
                        onStreamStart={() => {
                          updateAnalysisStatus(item.data.roundNumber, 'streaming');
                        }}
                        onStreamComplete={(completedData) => {
                          if (completedData) {
                            updateAnalysisData(
                              item.data.roundNumber,
                              completedData as import('@/api/routes/chat/schema').ModeratorAnalysisPayload,
                            );
                          }
                        }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
            {showLoader && (
              <div
                key="streaming-loader"
                style={{
                  position: 'relative',
                }}
              >
                <StreamingParticipantsLoader
                  className="mt-12"
                  participants={selectedParticipants}
                  currentParticipantIndex={currentParticipantIndex}
                  isAnalyzing={isAnalyzing}
                />
              </div>
            )}
          </div>
          <div
            ref={inputContainerRef}
            className="sticky bottom-0 z-50 bg-gradient-to-t from-background via-background to-transparent pt-6 pb-4 mt-auto"
          >
            <div className="container max-w-3xl mx-auto px-4 sm:px-6">
              <ChatInput
                value={inputValue}
                onChange={setInputValue}
                onSubmit={handlePromptSubmit}
                status={isStreaming ? 'submitted' : 'ready'}
                onStop={stopStreaming}
                placeholder={t('input.placeholder')}
                participants={selectedParticipants}
                currentParticipantIndex={currentParticipantIndex}
                onRemoveParticipant={isStreaming
                  ? undefined
                  : (participantId) => {
                      if (selectedParticipants.length <= 1)
                        return;
                      removeParticipant(participantId);
                      // ✅ REACT 19 PATTERN: Use dispatch instead of setState
                      dispatch({ type: 'SET_HAS_PENDING_CONFIG_CHANGES', payload: true });
                    }}
                toolbar={(
                  <>
                    <ChatParticipantsList
                      participants={selectedParticipants}
                      onParticipantsChange={handleParticipantsChange}
                      isStreaming={isStreaming}
                    />
                    <ChatModeSelector
                      selectedMode={selectedMode}
                      onModeChange={handleModeChange}
                      disabled={isStreaming}
                    />
                  </>
                )}
              />
            </div>
          </div>
        </div>
      </UnifiedErrorBoundary>
      <ChatDeleteDialog
        isOpen={isDeleteDialogOpen.value}
        onOpenChange={isDeleteDialogOpen.setValue}
        threadId={thread.id}
        threadSlug={slug}
      />
    </>
  );
}
