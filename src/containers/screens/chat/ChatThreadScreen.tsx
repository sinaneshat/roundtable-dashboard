'use client';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';

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
import { useChatStore } from '@/components/providers/chat-store-provider';
import { useThreadChangelogQuery, useThreadFeedbackQuery } from '@/hooks/queries/chat';
import type { TimelineItem } from '@/hooks/utils';
import {
  useBoolean,
  useChatScroll,
  useStreamingLoaderState,
  useThreadTimeline,
} from '@/hooks/utils';
import type { ChatModeId } from '@/lib/config/chat-modes';
import { queryKeys } from '@/lib/data/query-keys';
import { messageHasError, MessageMetadataSchema } from '@/lib/schemas/message-metadata';
import { chatMessagesToUIMessages } from '@/lib/utils/message-transforms';
import { calculateNextRoundNumber, getRoundNumberFromMetadata } from '@/lib/utils/round-utils';
import {
  useChatFormActions,
  useFeedbackActions,
  useScreenInitialization,
} from '@/stores/chat';

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
  const messages = useChatStore(s => s.messages);
  const sendMessage = useChatStore(s => s.sendMessage);
  const isStreaming = useChatStore(s => s.isStreaming);
  const currentParticipantIndex = useChatStore(s => s.currentParticipantIndex);
  const retryRound = useChatStore(s => s.retry);
  const stopStreaming = useChatStore(s => s.stop);
  const setOnRetry = useChatStore(s => s.setOnRetry);
  const contextParticipants = useChatStore(s => s.participants);
  // ✅ FIX: Use chatSetMessages (from useChat) instead of store's setMessages
  // This updates useChat's state, which then syncs to store via provider
  const chatSetMessages = useChatStore(s => s.chatSetMessages);

  // ✅ ZUSTAND V5 PATTERN: Use useShallow for object selectors to prevent re-renders
  // Object selectors without useShallow create new references each render causing infinite loops
  const state = {
    flags: useChatStore(useShallow(s => ({
      hasInitiallyLoaded: s.hasInitiallyLoaded,
      isRegenerating: s.isRegenerating,
      isCreatingAnalysis: s.isCreatingAnalysis,
      isWaitingForChangelog: s.isWaitingForChangelog,
      hasPendingConfigChanges: s.hasPendingConfigChanges,
      hasRefetchedMessages: s.hasRefetchedMessages,
    }))),
    data: useChatStore(useShallow(s => ({
      regeneratingRoundNumber: s.regeneratingRoundNumber,
      pendingMessage: s.pendingMessage,
      expectedParticipantIds: s.expectedParticipantIds,
      streamingRoundNumber: s.streamingRoundNumber,
      currentRoundNumber: s.currentRoundNumber,
    }))),
  };
  const hasSentPendingMessage = useChatStore(s => s.hasSentPendingMessage);

  // ✅ ZUSTAND V5 PATTERN: Use useShallow for actions object to prevent re-renders
  const actions = useChatStore(useShallow(s => ({
    setHasInitiallyLoaded: s.setHasInitiallyLoaded,
    setIsRegenerating: s.setIsRegenerating,
    setIsCreatingAnalysis: s.setIsCreatingAnalysis,
    setIsWaitingForChangelog: s.setIsWaitingForChangelog,
    setHasPendingConfigChanges: s.setHasPendingConfigChanges,
    setHasRefetchedMessages: s.setHasRefetchedMessages,
    setRegeneratingRoundNumber: s.setRegeneratingRoundNumber,
    setPendingMessage: s.setPendingMessage,
    setExpectedParticipantIds: s.setExpectedParticipantIds,
    setStreamingRoundNumber: s.setStreamingRoundNumber,
    setCurrentRoundNumber: s.setCurrentRoundNumber,
    setHasSentPendingMessage: s.setHasSentPendingMessage,
    resetThreadState: s.resetThreadState,
    resetHookState: s.resetHookState,
    updateParticipants: s.updateParticipants,
    prepareForNewMessage: s.prepareForNewMessage,
    completeStreaming: s.completeStreaming,
    startRegeneration: s.startRegeneration,
    completeRegeneration: s.completeRegeneration,
  })));

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
  // Feedback management via store
  const feedbackByRound = useChatStore(s => s.feedbackByRound);
  const hasLoadedFeedback = useChatStore(s => s.hasLoadedFeedback);
  const pendingFeedback = useChatStore(s => s.pendingFeedback);
  const { data: feedbackData, isSuccess: feedbackSuccess } = useThreadFeedbackQuery(thread.id, !state.flags.hasInitiallyLoaded);

  // Feedback actions hook
  const feedbackActions = useFeedbackActions({ threadId: thread.id });

  // Transform initial messages once (memoized to prevent re-creation)
  // ✅ CRITICAL FIX: Pass participants to enrich messages with model metadata
  // This ensures backend messages are "complete" and never need participant lookups from current state
  const uiMessages = useMemo(() => chatMessagesToUIMessages(initialMessages, participants), [initialMessages, participants]);

  // Load feedback from server once
  useEffect(() => {
    if (!hasLoadedFeedback && feedbackSuccess && feedbackData) {
      const feedbackArray = Array.isArray(feedbackData) ? feedbackData : [];
      feedbackActions.loadFeedback(feedbackArray);
    }
  }, [feedbackData, feedbackSuccess, hasLoadedFeedback, feedbackActions]);

  // ✅ CRITICAL FIX: Refetch messages after initial load to catch any race condition
  // When navigating from overview screen, messages might still be saving to DB when SSR fetch happens
  // This one-time refetch ensures we get all messages even if there was a timing issue
  // See: ChatOverviewScreen.tsx redirect timing and message-persistence.service.ts
  // ✅ REACT 19 PATTERN: Use context state instead of local useState
  const hasRefetchedMessages = state.flags.hasRefetchedMessages;
  // ✅ REACT 19 PATTERN: Use context state instead of scattered useState
  // All regeneration, analysis, and changelog flags now managed by reducer
  const { isWaitingForChangelog, hasPendingConfigChanges } = state.flags;

  // Analyses from store (already deduplicated by orchestrator)
  const analyses = useChatStore(s => s.analyses);

  // Analysis actions
  const updateAnalysisData = useChatStore(s => s.updateAnalysisData);
  const updateAnalysisStatus = useChatStore(s => s.updateAnalysisStatus);
  const removePendingAnalysis = useChatStore(s => s.removeAnalysis);

  // ✅ FIX: Declare selectedMode early so it can be used in useScreenInitialization
  const selectedMode = useChatStore(s => s.selectedMode);

  useEffect(() => {
    if (!state.flags.hasInitiallyLoaded && changelogResponse && feedbackSuccess) {
      // ✅ REACT 19 PATTERN: Use actions helper for semantic state updates
      actions.setHasInitiallyLoaded(true);
    }
  }, [changelogResponse, feedbackSuccess, state.flags.hasInitiallyLoaded, actions]);

  // ✅ CRITICAL FIX: One-time message refetch to handle race condition
  // After initial load completes, use requestIdleCallback to refetch when browser is idle
  // This ensures all participant messages are displayed without blocking UI
  // ✅ FIX: Skip refetch during streaming or config changes to prevent message duplication
  useEffect(() => {
    if (
      state.flags.hasInitiallyLoaded
      && !hasRefetchedMessages
      && messages.length > 0
      && !isStreaming
      && !hasPendingConfigChanges
    ) {
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
            // ✅ CRITICAL FIX: Pass participants to enrich messages
            const uiMessages = await import('@/lib/utils/message-transforms').then(
              mod => mod.chatMessagesToUIMessages(freshMessages, result.data.participants),
            );

            // ✅ FIX: Update useChat's messages (not store directly)
            // chatSetMessages updates useChat state, which syncs to store via provider
            chatSetMessages?.(uiMessages);
          }
        } catch {
          // Silently fail - this is just a safety net
        } finally {
          // ✅ REACT 19 PATTERN: Use actions helper for semantic state updates
          actions.setHasRefetchedMessages(true);
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
  }, [
    state.flags.hasInitiallyLoaded,
    hasRefetchedMessages,
    messages.length,
    isStreaming,
    hasPendingConfigChanges,
    slug,
    chatSetMessages,
    actions,
  ]);

  // Unified screen initialization with regeneration support
  useScreenInitialization({
    mode: 'thread',
    thread,
    participants,
    initialMessages: uiMessages,
    // ✅ FIX: Use selectedMode (current form state) if available, otherwise use thread.mode
    // This ensures analysis is created with the CURRENT mode, not the stale SSR mode
    chatMode: selectedMode || (thread.mode as ChatModeId),
    isRegeneration: state.data.regeneratingRoundNumber !== null,
    regeneratingRoundNumber: state.data.regeneratingRoundNumber,
    enableOrchestrator: state.flags.hasInitiallyLoaded && !isStreaming && !state.flags.isRegenerating && !state.flags.isCreatingAnalysis,
    onBeforeAnalysisCreate: () => {
      actions.setIsCreatingAnalysis(true);
    },
    onAfterAnalysisCreate: (roundNumber) => {
      // Router refresh for "New Conversation" threads (updates title in header)
      if (thread.title === 'New Conversation') {
        router.refresh();
      }

      // Complete regeneration if active
      if (state.data.regeneratingRoundNumber === roundNumber) {
        actions.completeRegeneration(roundNumber);
      }
      actions.setStreamingRoundNumber(null);
      actions.setIsCreatingAnalysis(false);

      // Invalidate analyses query to trigger refetch
      queryClient.invalidateQueries({
        queryKey: queryKeys.threads.analyses(thread.id),
      });
    },
    onAllParticipantsFailed: (roundNumber) => {
      // Complete regeneration if active
      if (state.data.regeneratingRoundNumber === roundNumber) {
        actions.completeRegeneration(roundNumber);
      }
      actions.setStreamingRoundNumber(null);
    },
  });

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

  // Form state from store (selectedMode declared earlier for useScreenInitialization)
  const selectedParticipants = useChatStore(s => s.selectedParticipants);
  const inputValue = useChatStore(s => s.inputValue);
  const setSelectedParticipants = useChatStore(s => s.setSelectedParticipants);
  const setInputValue = useChatStore(s => s.setInputValue);
  const removeParticipant = useChatStore(s => s.removeParticipant);

  // Form actions hook
  const formActions = useChatFormActions();

  // ✅ REACT 19 PATTERN: Use context state instead of local useState (hasPendingConfigChanges declared earlier)
  const { pendingMessage, expectedParticipantIds } = state.data;

  // Unified scroll management using useChatScroll hook
  const { scrolledToAnalysesRef } = useChatScroll({
    messages,
    analyses,
    isStreaming,
    scrollContainerId: 'chat-scroll-container',
    enableNearBottomDetection: true,
  });

  // Streaming loader state calculation
  // Use contextParticipants (actual thread participants) not selectedParticipants (form state)
  const { showLoader, isAnalyzing } = useStreamingLoaderState({
    analyses,
    isStreaming,
    messages,
    selectedParticipants: contextParticipants.map(p => ({
      id: p.id,
      modelId: p.modelId,
      role: p.role,
      priority: p.priority,
    })),
  });

  const handleModeChange = useCallback(async (newMode: ChatModeId) => {
    if (isStreaming)
      return;
    formActions.handleModeChange(newMode);
  }, [isStreaming, formActions]);

  const handleParticipantsChange = useCallback(async (newParticipants: ParticipantConfig[]) => {
    if (isStreaming)
      return;
    setSelectedParticipants(newParticipants);
    actions.setHasPendingConfigChanges(true);
  }, [isStreaming, setSelectedParticipants, actions]);

  // Keep ref of the last synced context to prevent infinite loops
  const lastSyncedContextRef = useRef<string>('');

  // ✅ REMOVED: Thread mode sync effect was causing double updates
  // The SSR thread.mode would overwrite user's selectedMode after form submission,
  // triggering a second update mutation that changed mode back to original value.
  // Mode is now initialized once by screen initialization and controlled by user.

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
  // Reset state on thread change
  useEffect(() => {
    // Reset all thread state and refs
    actions.resetThreadState();

    // Reset UI state for new thread (local refs not managed by context)
    scrolledToAnalysesRef.current.clear();
    lastSyncedContextRef.current = '';

    actions.setHasInitiallyLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.id]);

  // Register retry handler (stable, no infinite loop)
  useEffect(() => {
    setOnRetry(() => (roundNumber: number) => {
      // AI SDK v5 Pattern: Immediate state cleanup before streaming starts
      actions.startRegeneration(roundNumber);
      removePendingAnalysis(roundNumber);
      clearTriggeredAnalysesForRound(roundNumber);
      feedbackActions.clearRoundFeedback(roundNumber);
      actions.setStreamingRoundNumber(null);
    });

    return () => {
      setOnRetry(undefined);
    };
    // Only re-register when thread ID changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.id]);
  useEffect(() => {
    const wasStreaming = isStreaming;
    if (wasStreaming && !isStreaming) {
      actions.setStreamingRoundNumber(null);
    }
  }, [isStreaming, actions]);
  useEffect(() => {
    if (!pendingMessage || !expectedParticipantIds || hasSentPendingMessage) {
      return;
    }

    // ✅ CRITICAL FIX: Prevent sending during streaming to avoid race conditions
    if (isStreaming) {
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

    // ✅ REACT 19 PATTERN: Clear waiting flag
    if (isWaitingForChangelog) {
      actions.setIsWaitingForChangelog(false);
    }

    // ✅ CRITICAL FIX: Set flag BEFORE any async operations to prevent re-entry
    actions.setHasSentPendingMessage(true);

    // AI SDK v5 Pattern: Calculate round number for the NEW user message
    const newRoundNumber = calculateNextRoundNumber(messages);

    // ✅ REACT 19 PATTERN: Set streaming round number (handles currentRoundNumberRef internally)
    actions.setStreamingRoundNumber(newRoundNumber);

    // AI SDK v5 Pattern: Use sendMessage() to add user message AND trigger streaming
    sendMessage?.(pendingMessage);

    // ✅ REACT 19 PATTERN: Reset pending changes flag after message is sent
    actions.setHasPendingConfigChanges(false);
  }, [
    pendingMessage,
    expectedParticipantIds,
    hasSentPendingMessage,
    contextParticipants,
    sendMessage,
    messages,
    isWaitingForChangelog,
    isChangelogFetching,
    isStreaming,
    actions,
  ]);
  const handlePromptSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!inputValue.trim() || selectedParticipants.length === 0) {
        return;
      }
      await formActions.handleUpdateThreadAndSend(thread.id);
    },
    [inputValue, selectedParticipants, formActions, thread.id],
  );
  const activeParticipants = contextParticipants;

  // ✅ CONSOLIDATED: Timeline grouping logic moved to useThreadTimeline hook
  // Replaces 76 lines of inline logic with clean, reusable hook
  const messagesWithAnalysesAndChangelog: TimelineItem[] = useThreadTimeline({
    messages,
    analyses,
    changelog,
  });

  // Use feedback actions for handler generation
  const getFeedbackHandler = feedbackActions.getFeedbackHandler;
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
                                isPending={pendingFeedback?.roundNumber === roundNumber}
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
                  participants={contextParticipants.map(p => ({
                    id: p.id,
                    modelId: p.modelId,
                    role: p.role,
                    priority: p.priority,
                  }))}
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
                      // ✅ REACT 19 PATTERN: Mark config changes
                      actions.setHasPendingConfigChanges(true);
                    }}
                toolbar={(
                  <>
                    <ChatParticipantsList
                      participants={selectedParticipants}
                      onParticipantsChange={handleParticipantsChange}
                      isStreaming={isStreaming}
                    />
                    <ChatModeSelector
                      selectedMode={selectedMode || (thread.mode as ChatModeId)}
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
