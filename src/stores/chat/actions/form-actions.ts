'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { z } from 'zod';
import { useShallow } from 'zustand/react/shallow';

import type { ChatMode } from '@/api/core/enums';
import { MessageRoles } from '@/api/core/enums';
import { toCreateThreadRequest } from '@/components/chat/chat-form-schemas';
import { useChatStore, useChatStoreApi } from '@/components/providers/chat-store-provider/context';
import {
  useCreateThreadMutation,
  useUpdateThreadMutation,
} from '@/hooks/mutations';
import { queryKeys } from '@/lib/data/query-keys';
import type { ExtendedFilePart } from '@/lib/schemas/message-schemas';
import { showApiErrorToast } from '@/lib/toast';
import { calculateNextRoundNumber, chatMessagesToUIMessages, chatParticipantsToConfig, getParticipantModelIds, getRoundNumber, prepareParticipantUpdate, shouldUpdateParticipantConfig, transformChatMessages, transformChatParticipants, transformChatThread, useMemoizedReturn } from '@/lib/utils';

import { createOptimisticUserMessage, createPlaceholderPreSearch } from '../utils/placeholder-factories';
import { validateInfiniteQueryCache } from './types';

// ============================================================================
// Zod Schemas - Single Source of Truth
// ============================================================================

export const AttachmentInfoSchema = z.object({
  uploadId: z.string(),
  filename: z.string(),
  mimeType: z.string(),
  previewUrl: z.string().optional(),
});

export type AttachmentInfo = z.infer<typeof AttachmentInfoSchema>;

export type UseChatFormActionsReturn = {
  handleCreateThread: (attachmentIds?: string[], attachmentInfos?: AttachmentInfo[]) => Promise<void>;
  handleUpdateThreadAndSend: (threadId: string, attachmentIds?: string[], attachmentInfos?: AttachmentInfo[]) => Promise<void>;
  handleResetForm: () => void;
  handleModeChange: (mode: ChatMode) => void;
  handleWebSearchToggle: (enabled: boolean) => void;
  isFormValid: boolean;
  isSubmitting: boolean;
};
export function useChatFormActions(): UseChatFormActionsReturn {
  const queryClient = useQueryClient();
  const storeApi = useChatStoreApi();

  const formState = useChatStore(useShallow(s => ({
    inputValue: s.inputValue,
    selectedMode: s.selectedMode,
    selectedParticipants: s.selectedParticipants,
    enableWebSearch: s.enableWebSearch,
  })));

  // Note: We intentionally use storeApi.getState() instead of a subscribed threadState
  // to avoid stale closure issues where closure captures old values after state updates
  // from previous rounds. See handleUpdateThreadAndSend for the pattern.

  const actions = useChatStore(useShallow(s => ({
    setInputValue: s.setInputValue,
    resetForm: s.resetForm,
    setSelectedMode: s.setSelectedMode,
    setSelectedParticipants: s.setSelectedParticipants,
    setEnableWebSearch: s.setEnableWebSearch,
    setShowInitialUI: s.setShowInitialUI,
    setIsCreatingThread: s.setIsCreatingThread,
    setWaitingToStartStreaming: s.setWaitingToStartStreaming,
    setCreatedThreadId: s.setCreatedThreadId,
    setHasPendingConfigChanges: s.setHasPendingConfigChanges,
    prepareForNewMessage: s.prepareForNewMessage,
    setExpectedParticipantIds: s.setExpectedParticipantIds,
    initializeThread: s.initializeThread,
    updateParticipants: s.updateParticipants,
    addPreSearch: s.addPreSearch,
    setStreamingRoundNumber: s.setStreamingRoundNumber,
    setNextParticipantToTrigger: s.setNextParticipantToTrigger,
    setMessages: s.setMessages,
    clearAttachments: s.clearAttachments,
    setThread: s.setThread,
    // ✅ CHANGELOG: Actions for config change tracking
    setIsWaitingForChangelog: s.setIsWaitingForChangelog,
    setConfigChangeRoundNumber: s.setConfigChangeRoundNumber,
  })));

  const createThreadMutation = useCreateThreadMutation();
  const updateThreadMutation = useUpdateThreadMutation();

  const isFormValid = Boolean(
    formState.inputValue.trim()
    && formState.selectedParticipants.length > 0
    && formState.selectedMode,
  );
  const handleCreateThread = useCallback(async (attachmentIds?: string[], _attachmentInfos?: AttachmentInfo[]) => {
    const prompt = formState.inputValue.trim();

    if (!prompt || formState.selectedParticipants.length === 0 || !formState.selectedMode) {
      return;
    }

    try {
      actions.setIsCreatingThread(true);

      const createThreadRequest = toCreateThreadRequest({
        message: prompt,
        mode: formState.selectedMode,
        participants: formState.selectedParticipants,
        enableWebSearch: formState.enableWebSearch,
      }, attachmentIds);

      const response = await createThreadMutation.mutateAsync({
        json: createThreadRequest,
      });

      const { thread, participants, messages: initialMessages } = response.data;

      const threadWithDates = transformChatThread(thread);
      const participantsWithDates = transformChatParticipants(participants);
      const messagesWithDates = transformChatMessages(initialMessages);

      actions.setShowInitialUI(false);
      actions.setCreatedThreadId(thread.id);

      const uiMessages = chatMessagesToUIMessages(messagesWithDates);

      actions.initializeThread(threadWithDates, participantsWithDates, uiMessages);

      const syncedParticipantConfigs = chatParticipantsToConfig(participantsWithDates);
      actions.setSelectedParticipants(syncedParticipantConfigs);

      queryClient.setQueriesData(
        {
          queryKey: queryKeys.threads.all,
          predicate: (query) => {
            return query.queryKey.length >= 2 && query.queryKey[1] === 'list';
          },
        },
        (old: unknown) => {
          const parsedQuery = validateInfiniteQueryCache(old);
          if (!parsedQuery)
            return old;

          const threadItem = {
            id: thread.id,
            title: thread.title,
            slug: thread.slug,
            mode: thread.mode,
            status: thread.status,
            isFavorite: thread.isFavorite,
            isPublic: thread.isPublic,
            isAiGeneratedTitle: thread.isAiGeneratedTitle,
            enableWebSearch: thread.enableWebSearch,
            createdAt: thread.createdAt,
            updatedAt: thread.updatedAt,
            lastMessageAt: thread.lastMessageAt,
          };

          return {
            ...parsedQuery,
            pages: parsedQuery.pages.map((page, index) => {
              if (index !== 0 || !page.success || !page.data?.items)
                return page;

              return {
                ...page,
                data: {
                  ...page.data,
                  items: [threadItem, ...page.data.items],
                },
              };
            }),
          };
        },
      );

      queueMicrotask(() => {
        window.history.replaceState(
          window.history.state,
          '',
          `/chat/${thread.slug}`,
        );
      });

      actions.setInputValue('');
      actions.clearAttachments();

      if (formState.enableWebSearch) {
        actions.addPreSearch(createPlaceholderPreSearch({
          threadId: thread.id,
          roundNumber: 0,
          userQuery: prompt,
        }));
      }

      actions.prepareForNewMessage(prompt, getParticipantModelIds(participants), attachmentIds);
      actions.setStreamingRoundNumber(0);
      actions.setWaitingToStartStreaming(true);
      // ✅ TYPE-SAFE: Include participant ID for validation against config changes
      const firstParticipant = participantsWithDates[0];
      if (firstParticipant) {
        actions.setNextParticipantToTrigger({ index: 0, participantId: firstParticipant.id });
      }
    } catch (error) {
      console.error('[handleCreateThread] Error creating thread:', error);
      showApiErrorToast('Error creating thread', error);
      actions.setShowInitialUI(true);
    } finally {
      actions.setIsCreatingThread(false);
    }
  }, [
    formState.inputValue,
    formState.selectedMode,
    formState.selectedParticipants,
    formState.enableWebSearch,
    createThreadMutation,
    actions,
    queryClient,
  ]);

  /**
   * Update existing thread and send message
   * Used by ChatThreadScreen
   * @param threadId - The thread ID to update
   * @param attachmentIds - Optional upload IDs to attach to the message
   * @param attachmentInfos - Optional attachment metadata for building optimistic file parts
   */
  const handleUpdateThreadAndSend = useCallback(async (threadId: string, attachmentIds?: string[], attachmentInfos?: AttachmentInfo[]) => {
    const trimmed = formState.inputValue.trim();

    if (!trimmed || formState.selectedParticipants.length === 0 || !formState.selectedMode) {
      return;
    }

    // ✅ FIX: Get FRESH state at execution time, not stale closure values
    // This prevents bugs where closure-captured values are stale after previous rounds
    // Example bug: thread.enableWebSearch=true after round 1, but stale closure has false
    // → webSearchChanged incorrectly calculated as false → changelog not triggered
    // CRITICAL: Get ALL values that are used for comparison or payload from fresh state
    const freshState = storeApi.getState();
    const freshThread = freshState.thread;
    const freshParticipants = freshState.participants;
    const freshMessages = freshState.messages;
    const freshHasPendingConfigChanges = freshState.hasPendingConfigChanges;
    // ✅ FIX: Also get form values from fresh state to avoid stale closure issues
    const freshSelectedMode = freshState.selectedMode;
    const freshEnableWebSearch = freshState.enableWebSearch;
    const freshSelectedParticipants = freshState.selectedParticipants;

    // Calculate round number FIRST using FRESH messages state
    let nextRoundNumber = calculateNextRoundNumber(freshMessages);
    if (nextRoundNumber === 0 && freshMessages.length > 0) {
      const round0AssistantMessages = freshMessages.filter(
        m => m.role === MessageRoles.ASSISTANT && getRoundNumber(m.metadata) === 0,
      );
      if (round0AssistantMessages.length > 0) {
        const userMessages = freshMessages.filter(m => m.role === MessageRoles.USER);
        nextRoundNumber = userMessages.length;
      }
    }

    // Prepare config change detection using FRESH state for BOTH sides of comparison
    const { updateResult, updatePayloads, optimisticParticipants } = prepareParticipantUpdate(
      freshParticipants,
      freshSelectedParticipants,
      threadId,
    );

    const currentModeId = freshThread?.mode || null;
    const currentWebSearch = freshThread?.enableWebSearch || false;
    // ✅ FIX: Use fresh form values for comparison to avoid stale closure issues
    const modeChanged = currentModeId !== freshSelectedMode;
    const webSearchChanged = currentWebSearch !== freshEnableWebSearch;

    const hasParticipantChanges = shouldUpdateParticipantConfig(updateResult);
    // ✅ FIX: Only trigger changelog sync when there are ACTUAL config changes
    // This prevents unnecessary changelog fetches when user just sends a message
    // Uses freshHasPendingConfigChanges from fresh state to ensure accurate detection
    const hasAnyChanges = hasParticipantChanges || modeChanged || webSearchChanged || freshHasPendingConfigChanges;

    // ✅ IMMEDIATE UI FEEDBACK: Add optimistic user message BEFORE any async operations
    // This ensures the streaming trigger sees the correct round when it runs
    const fileParts: ExtendedFilePart[] = attachmentInfos && attachmentInfos.length > 0
      ? attachmentInfos.map(att => ({
          type: 'file' as const,
          url: att.previewUrl || '',
          filename: att.filename,
          mediaType: att.mimeType,
          uploadId: att.uploadId,
        }))
      : [];

    const optimisticMessage = createOptimisticUserMessage({
      roundNumber: nextRoundNumber,
      text: trimmed,
      fileParts,
    });

    // Add optimistic message to store IMMEDIATELY
    actions.setMessages((currentMessages) => {
      return [...currentMessages, optimisticMessage];
    });
    actions.setStreamingRoundNumber(nextRoundNumber);
    // ✅ FIX: Use optimistic participants when config changed, otherwise use fresh
    // This ensures expectedParticipantIds matches what will actually stream
    const effectiveParticipants = hasParticipantChanges ? optimisticParticipants : freshParticipants;
    actions.setExpectedParticipantIds(getParticipantModelIds(effectiveParticipants));

    // Optimistically update participants in store if changes exist
    if (hasParticipantChanges) {
      actions.updateParticipants(optimisticParticipants);
    }

    // ✅ CRITICAL ORDER FIX: Set blocking flag BEFORE any state that triggers effects
    // configChangeRoundNumber MUST be set BEFORE addPreSearch to prevent race condition:
    // - addPreSearch triggers usePendingMessage effect
    // - Effect checks configChangeRoundNumber for blocking
    // - If flag not set, pre-search executes before PATCH completes
    // Order: block flag → pre-search placeholder → waitingToStart → PATCH → changelog → execute pre-search → streams
    // ⚠️ ONLY set if there are actual config changes - prevents unnecessary changelog fetches
    if (hasAnyChanges) {
      actions.setConfigChangeRoundNumber(nextRoundNumber);
    }

    // ✅ FIX: Create pre-search placeholder AFTER blocking flag is set
    // This ensures effects see configChangeRoundNumber and block appropriately
    // Use fresh enableWebSearch value to avoid stale closure issues
    if (freshEnableWebSearch) {
      actions.addPreSearch(createPlaceholderPreSearch({
        threadId,
        roundNumber: nextRoundNumber,
        userQuery: trimmed,
      }));
    }

    // NOW set waitingToStartStreaming - trigger will see correct round from optimistic message
    actions.setWaitingToStartStreaming(true);
    // ✅ TYPE-SAFE: Include participant ID for validation against config changes
    const firstParticipant = freshParticipants[0];
    if (firstParticipant) {
      actions.setNextParticipantToTrigger({ index: 0, participantId: firstParticipant.id });
    }

    // Clear input immediately for fast UI feedback
    actions.setInputValue('');
    actions.clearAttachments();

    try {
      // ✅ PATCH in background: Persist message to DB
      // Use fresh form values to ensure payload reflects current user selections
      const response = await updateThreadMutation.mutateAsync({
        param: { id: threadId },
        json: {
          // Config changes (if any) - use fresh values to avoid stale closure issues
          participants: hasParticipantChanges ? updatePayloads : undefined,
          mode: modeChanged && freshSelectedMode ? freshSelectedMode : undefined,
          enableWebSearch: webSearchChanged ? freshEnableWebSearch : undefined,
          // ALWAYS include the user message
          newMessage: {
            content: trimmed,
            roundNumber: nextRoundNumber,
            attachmentIds: attachmentIds?.length ? attachmentIds : undefined,
          },
        },
      });

      // ✅ UPDATE MESSAGE WITH PERSISTED ID: Replace optimistic message with persisted one
      if (response?.data?.message) {
        const persistedMessage = response.data.message;
        const persistedUIMessage = chatMessagesToUIMessages([persistedMessage])[0];
        if (persistedUIMessage) {
          // Replace optimistic message with persisted message (same round, different ID)
          actions.setMessages(currentMessages => currentMessages.map(m =>
            m.id === optimisticMessage.id ? persistedUIMessage : m,
          ));
        }
      }

      // Update participants from response if config changed
      if (response?.data?.participants) {
        const participantsWithDates = transformChatParticipants(response.data.participants);
        actions.updateParticipants(participantsWithDates);
        actions.setExpectedParticipantIds(getParticipantModelIds(participantsWithDates));

        const syncedParticipantConfigs = chatParticipantsToConfig(participantsWithDates);
        actions.setSelectedParticipants(syncedParticipantConfigs);
      }

      // ✅ UNIFIED FIX: Clear hasPendingConfigChanges BEFORE setThread
      // This allows setThread to sync form values (selectedMode, enableWebSearch) from thread
      // Order matters: clear flag → setThread syncs form values → set changelog flag
      actions.setHasPendingConfigChanges(false);

      // Update thread from response - this now syncs form values since hasPendingConfigChanges is false
      if (response?.data?.thread) {
        actions.setThread(transformChatThread(response.data.thread));
      }

      // ✅ FIX: Set isWaitingForChangelog AFTER PATCH completes (only if config changed)
      // This ensures changelog entries exist on server before query runs
      // use-changelog-sync will:
      // - See both isWaitingForChangelog AND configChangeRoundNumber set
      // - Fetch changelog for this round
      // - Merge it into cache
      // - Clear BOTH flags atomically
      // Pre-search and streaming wait for BOTH flags to clear
      // ⚠️ ONLY set if there are actual config changes - prevents unnecessary changelog fetches
      if (hasAnyChanges) {
        actions.setIsWaitingForChangelog(true);
      }

      // ✅ NOTE: NOT calling prepareForNewMessage here
      // That function resets isStreaming=false which would break already-started streaming
      // Streaming is triggered BEFORE PATCH via optimistic message + waitingToStartStreaming
      // The streaming hooks extract user text from messages, not pendingMessage
    } catch (error) {
      console.error('[handleUpdateThreadAndSend] Error updating thread:', error);

      // ✅ ROLLBACK: Remove optimistic message on error
      actions.setMessages(currentMessages => currentMessages.filter(m => m.id !== optimisticMessage.id));

      // Reset streaming state on error
      actions.setWaitingToStartStreaming(false);
      actions.setStreamingRoundNumber(null);
      actions.setNextParticipantToTrigger(null);
      // ✅ FIX: Clear BOTH changelog flags on error to prevent deadlock
      // If either flag remains set, streaming will be blocked forever
      actions.setConfigChangeRoundNumber(null);
      actions.setIsWaitingForChangelog(false);

      showApiErrorToast('Error updating thread', error);
    }
  }, [
    formState,
    storeApi,
    updateThreadMutation,
    actions,
  ]);

  /**
   * Reset form to initial state
   */
  const handleResetForm = useCallback(() => {
    actions.resetForm();
  }, [actions]);

  /**
   * Change mode and mark as having pending changes
   * Used by ChatThreadScreen
   *
   * ✅ CRITICAL: Set hasPendingConfigChanges FIRST to prevent race condition
   */
  const handleModeChange = useCallback((mode: ChatMode) => {
    // Set flag FIRST to prevent initializeThread from resetting the change
    actions.setHasPendingConfigChanges(true);
    actions.setSelectedMode(mode);
  }, [actions]);

  /**
   * Toggle web search on/off
   * Used by ChatOverviewScreen
   *
   * ✅ FIX: When a thread already exists (after creation but before screenMode transitions),
   * set hasPendingConfigChanges so the system waits for changelog before streaming.
   * For truly new threads (no thread yet), don't set the flag since there's nothing to compare against.
   *
   * ✅ CRITICAL: Set hasPendingConfigChanges FIRST to prevent race condition
   * If initializeThread is called between setEnableWebSearch and setHasPendingConfigChanges,
   * it would see hasPendingConfigChanges=false and reset enableWebSearch to thread value.
   *
   * ✅ FIX: Use fresh state to check for thread existence
   * Closure values can be stale after state updates from previous rounds
   */
  const handleWebSearchToggle = useCallback((enabled: boolean) => {
    // Set flag FIRST to prevent initializeThread from resetting the change
    // Use fresh state to avoid stale closure issues
    const freshThread = storeApi.getState().thread;
    const freshCreatedThreadId = storeApi.getState().createdThreadId;
    if (freshThread || freshCreatedThreadId) {
      actions.setHasPendingConfigChanges(true);
    }
    actions.setEnableWebSearch(enabled);
  }, [actions, storeApi]);

  // ✅ SUBMIT STATE: Track whether any submission is in progress
  // This enables immediate UI feedback (loading spinner) on submit button
  const isSubmitting = createThreadMutation.isPending || updateThreadMutation.isPending;

  // Memoize return object to prevent unnecessary re-renders
  return useMemoizedReturn({
    handleCreateThread,
    handleUpdateThreadAndSend,
    handleResetForm,
    handleModeChange,
    handleWebSearchToggle,
    isFormValid,
    isSubmitting,
  }, [handleCreateThread, handleUpdateThreadAndSend, handleResetForm, handleModeChange, handleWebSearchToggle, isFormValid, isSubmitting]);
}
