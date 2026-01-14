'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { z } from 'zod';
import { useShallow } from 'zustand/react/shallow';

import type { ChatMode } from '@/api/core/enums';
import { MessagePartTypes, MessageRoles } from '@/api/core/enums';
import { toCreateThreadRequest } from '@/components/chat/chat-form-schemas';
import { useChatStore, useChatStoreApi } from '@/components/providers/chat-store-provider/context';
import {
  useCreateThreadMutation,
  useUpdateThreadMutation,
} from '@/hooks/mutations';
import { queryKeys } from '@/lib/data/query-keys';
import type { ExtendedFilePart } from '@/lib/schemas/message-schemas';
import { showApiErrorToast } from '@/lib/toast';
import { calculateNextRoundNumber, chatMessagesToUIMessages, chatParticipantsToConfig, getEnabledParticipantModelIds, getRoundNumber, prepareParticipantUpdate, shouldUpdateParticipantConfig, transformChatMessages, transformChatParticipants, transformChatThread, useMemoizedReturn } from '@/lib/utils';
import { rlog } from '@/lib/utils/dev-logger';

import { createOptimisticUserMessage, createPlaceholderPreSearch } from '../utils/placeholder-factories';
import { validateInfiniteQueryCache } from './types';

/**
 * Attachment metadata passed from file upload handling
 */
export const AttachmentInfoSchema = z.object({
  uploadId: z.string(),
  filename: z.string(),
  mimeType: z.string(),
  previewUrl: z.string().optional(),
});

export type AttachmentInfo = z.infer<typeof AttachmentInfoSchema>;

/**
 * Return type for useChatFormActions hook
 */
export type UseChatFormActionsReturn = {
  handleCreateThread: (attachmentIds?: string[], attachmentInfos?: AttachmentInfo[]) => Promise<void>;
  handleUpdateThreadAndSend: (threadId: string, attachmentIds?: string[], attachmentInfos?: AttachmentInfo[]) => Promise<void>;
  handleResetForm: () => void;
  handleModeChange: (mode: ChatMode) => void;
  handleWebSearchToggle: (enabled: boolean) => void;
  isFormValid: boolean;
  isSubmitting: boolean;
};

/**
 * Form action handlers for chat thread creation and updates
 *
 * Handles:
 * - Thread creation with optimistic UI
 * - Thread updates with config change detection
 * - Form state management and validation
 *
 * Uses storeApi.getState() for fresh state access to avoid stale closures
 */
export function useChatFormActions(): UseChatFormActionsReturn {
  const queryClient = useQueryClient();
  const storeApi = useChatStoreApi();

  const formState = useChatStore(useShallow(s => ({
    inputValue: s.inputValue,
    selectedMode: s.selectedMode,
    selectedParticipants: s.selectedParticipants,
    enableWebSearch: s.enableWebSearch,
  })));

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
    setIsWaitingForChangelog: s.setIsWaitingForChangelog,
    setConfigChangeRoundNumber: s.setConfigChangeRoundNumber,
    setIsPatchInProgress: s.setIsPatchInProgress,
    clearStreamResumption: s.clearStreamResumption,
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

      actions.prepareForNewMessage(prompt, getEnabledParticipantModelIds(participants), attachmentIds);
      actions.setStreamingRoundNumber(0);
      actions.setWaitingToStartStreaming(true);
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

  const handleUpdateThreadAndSend = useCallback(async (threadId: string, attachmentIds?: string[], attachmentInfos?: AttachmentInfo[]) => {
    const trimmed = formState.inputValue.trim();

    if (!trimmed || formState.selectedParticipants.length === 0 || !formState.selectedMode) {
      return;
    }

    // ✅ CRITICAL FIX: Clear stale resumption state from previous rounds
    // Without this, currentResumptionPhase='complete' from round N persists into round N+1
    // This causes initializeThread to wipe pendingMessage because preserveStreamingState=false
    actions.clearStreamResumption();

    const freshState = storeApi.getState();
    const freshThread = freshState.thread;
    const freshParticipants = freshState.participants;
    const freshMessages = freshState.messages;
    const freshHasPendingConfigChanges = freshState.hasPendingConfigChanges;
    const freshSelectedMode = freshState.selectedMode;
    const freshEnableWebSearch = freshState.enableWebSearch;
    const freshSelectedParticipants = freshState.selectedParticipants;

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

    const { updateResult, updatePayloads, optimisticParticipants } = prepareParticipantUpdate(
      freshParticipants,
      freshSelectedParticipants,
      threadId,
    );

    const currentModeId = freshThread?.mode || null;
    const currentWebSearch = freshThread?.enableWebSearch || false;
    const modeChanged = currentModeId !== freshSelectedMode;
    const webSearchChanged = currentWebSearch !== freshEnableWebSearch;

    const hasParticipantChanges = shouldUpdateParticipantConfig(updateResult);
    const hasAnyChanges = hasParticipantChanges || modeChanged || webSearchChanged || freshHasPendingConfigChanges;

    rlog.submit('changes-detected', `r${nextRoundNumber} hasAny=${hasAnyChanges} participants=${hasParticipantChanges} mode=${modeChanged}(${currentModeId}→${freshSelectedMode}) webSearch=${webSearchChanged}(${currentWebSearch}→${freshEnableWebSearch}) pending=${freshHasPendingConfigChanges} files=${attachmentIds?.length || 0}`);

    const fileParts: ExtendedFilePart[] = attachmentInfos && attachmentInfos.length > 0
      ? attachmentInfos.map(att => ({
          type: MessagePartTypes.FILE,
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

    actions.setMessages((currentMessages) => {
      return [...currentMessages, optimisticMessage];
    });
    actions.setStreamingRoundNumber(nextRoundNumber);
    const effectiveParticipants = hasParticipantChanges ? optimisticParticipants : freshParticipants;
    actions.setExpectedParticipantIds(getEnabledParticipantModelIds(effectiveParticipants));

    if (hasParticipantChanges) {
      actions.updateParticipants(optimisticParticipants);
    }

    if (hasAnyChanges) {
      rlog.submit('pre-patch-flag', `r${nextRoundNumber} setting configChangeRoundNumber`);
      actions.setConfigChangeRoundNumber(nextRoundNumber);
    }

    if (freshEnableWebSearch) {
      actions.addPreSearch(createPlaceholderPreSearch({
        threadId,
        roundNumber: nextRoundNumber,
        userQuery: trimmed,
      }));
    }

    // CRITICAL: Set isPatchInProgress BEFORE setWaitingToStartStreaming to prevent race condition
    // The streaming trigger effect checks isPatchInProgress - must be true before effect runs
    actions.setIsPatchInProgress(true);

    actions.setWaitingToStartStreaming(true);
    const firstParticipant = freshParticipants[0];
    if (firstParticipant) {
      actions.setNextParticipantToTrigger({ index: 0, participantId: firstParticipant.id });
    }

    actions.setInputValue('');
    actions.clearAttachments();

    try {
      const response = await updateThreadMutation.mutateAsync({
        param: { id: threadId },
        json: {
          participants: hasParticipantChanges ? updatePayloads : undefined,
          mode: modeChanged && freshSelectedMode ? freshSelectedMode : undefined,
          enableWebSearch: webSearchChanged ? freshEnableWebSearch : undefined,
          newMessage: {
            id: optimisticMessage.id,
            content: trimmed,
            roundNumber: nextRoundNumber,
            attachmentIds: attachmentIds?.length ? attachmentIds : undefined,
          },
        },
      });

      if (response?.data?.message) {
        const persistedMessage = response.data.message;
        const persistedUIMessage = chatMessagesToUIMessages([persistedMessage])[0];
        if (persistedUIMessage) {
          actions.setMessages(currentMessages => currentMessages.map(m =>
            m.id === optimisticMessage.id ? persistedUIMessage : m,
          ));
        }
      }

      if (response?.data?.participants) {
        const participantsWithDates = transformChatParticipants(response.data.participants);
        actions.updateParticipants(participantsWithDates);
        actions.setExpectedParticipantIds(getEnabledParticipantModelIds(participantsWithDates));

        const syncedParticipantConfigs = chatParticipantsToConfig(participantsWithDates);
        actions.setSelectedParticipants(syncedParticipantConfigs);

        const newFirstParticipant = participantsWithDates[0];
        if (newFirstParticipant) {
          actions.setNextParticipantToTrigger({ index: 0, participantId: newFirstParticipant.id });
        }
      }

      actions.setHasPendingConfigChanges(false);

      if (response?.data?.thread) {
        actions.setThread(transformChatThread(response.data.thread));
      }

      if (hasAnyChanges) {
        rlog.submit('post-patch-flag', `r${nextRoundNumber} setting isWaitingForChangelog=true (PATCH complete, triggering changelog fetch)`);
        actions.setIsWaitingForChangelog(true);
      } else {
        rlog.submit('no-changelog', `r${nextRoundNumber} skipping changelog (no config changes)`);
      }

      actions.setIsPatchInProgress(false);
    } catch (error) {
      console.error('[handleUpdateThreadAndSend] Error updating thread:', error);

      actions.setMessages(currentMessages => currentMessages.filter(m => m.id !== optimisticMessage.id));

      actions.setWaitingToStartStreaming(false);
      actions.setStreamingRoundNumber(null);
      actions.setNextParticipantToTrigger(null);
      actions.setConfigChangeRoundNumber(null);
      actions.setIsWaitingForChangelog(false);
      actions.setIsPatchInProgress(false);

      showApiErrorToast('Error updating thread', error);
    }
  }, [
    formState,
    storeApi,
    updateThreadMutation,
    actions,
  ]);

  const handleResetForm = useCallback(() => {
    actions.resetForm();
  }, [actions]);

  const handleModeChange = useCallback((mode: ChatMode) => {
    actions.setHasPendingConfigChanges(true);
    actions.setSelectedMode(mode);
  }, [actions]);

  const handleWebSearchToggle = useCallback((enabled: boolean) => {
    const freshThread = storeApi.getState().thread;
    const freshCreatedThreadId = storeApi.getState().createdThreadId;
    if (freshThread || freshCreatedThreadId) {
      actions.setHasPendingConfigChanges(true);
    }
    actions.setEnableWebSearch(enabled);
  }, [actions, storeApi]);

  const isSubmitting = createThreadMutation.isPending || updateThreadMutation.isPending;

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
