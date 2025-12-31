'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';

import type { ChatMode } from '@/api/core/enums';
import { MessageRoles } from '@/api/core/enums';
import { toCreateThreadRequest } from '@/components/chat/chat-form-schemas';
import { useChatStore } from '@/components/providers';
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

export type AttachmentInfo = {
  uploadId: string;
  filename: string;
  mimeType: string;
  previewUrl?: string;
};

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

  const formState = useChatStore(useShallow(s => ({
    inputValue: s.inputValue,
    selectedMode: s.selectedMode,
    selectedParticipants: s.selectedParticipants,
    enableWebSearch: s.enableWebSearch,
  })));

  const threadState = useChatStore(useShallow(s => ({
    thread: s.thread,
    participants: s.participants,
    messages: s.messages,
    pendingAttachments: s.pendingAttachments,
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
    setHasEarlyOptimisticMessage: s.setHasEarlyOptimisticMessage,
    clearAttachments: s.clearAttachments,
    setThread: s.setThread,
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
      actions.setNextParticipantToTrigger(0);
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

    let pendingRoundNumber = calculateNextRoundNumber(threadState.messages);
    if (pendingRoundNumber === 0 && threadState.messages.length > 0) {
      const round0AssistantMessages = threadState.messages.filter(
        m => m.role === MessageRoles.ASSISTANT && getRoundNumber(m.metadata) === 0,
      );
      if (round0AssistantMessages.length > 0) {
        const userMessages = threadState.messages.filter(m => m.role === MessageRoles.USER);
        pendingRoundNumber = userMessages.length;
      }
    }

    try {
      const nextRoundNumber = pendingRoundNumber;

      actions.setStreamingRoundNumber(nextRoundNumber);

      if (formState.enableWebSearch) {
        actions.addPreSearch(createPlaceholderPreSearch({
          threadId,
          roundNumber: nextRoundNumber,
          userQuery: trimmed,
        }));
      }

      const fileParts: ExtendedFilePart[] = attachmentInfos && attachmentInfos.length > 0
        ? attachmentInfos.map(att => ({
            type: 'file' as const,
            url: att.previewUrl || '',
            filename: att.filename,
            mediaType: att.mimeType,
            uploadId: att.uploadId,
          }))
        : [];

      const optimisticUserMessage = createOptimisticUserMessage({
        roundNumber: nextRoundNumber,
        text: trimmed,
        fileParts,
      });
      actions.setMessages(currentMessages => [...currentMessages, optimisticUserMessage]);

      actions.setHasEarlyOptimisticMessage(true);

      const { updateResult, updatePayloads, optimisticParticipants } = prepareParticipantUpdate(
        threadState.participants,
        formState.selectedParticipants,
        threadId,
      );

      const currentModeId = threadState.thread?.mode || null;
      const currentWebSearch = threadState.thread?.enableWebSearch || false;
      const modeChanged = currentModeId !== formState.selectedMode;
      const webSearchChanged = currentWebSearch !== formState.enableWebSearch;

      const hasAnyChanges = shouldUpdateParticipantConfig(updateResult) || modeChanged || webSearchChanged;

      if (hasAnyChanges) {
        const previousParticipants = threadState.participants;

        actions.updateParticipants(optimisticParticipants);

        const needsWait = updateResult.hasTemporaryIds || webSearchChanged || modeChanged || formState.enableWebSearch;
        if (needsWait) {
          const response = await updateThreadMutation.mutateAsync({
            param: { id: threadId },
            json: {
              participants: updatePayloads,
              mode: formState.selectedMode,
              enableWebSearch: formState.enableWebSearch,
            },
          });

          if (response?.data?.participants) {
            const participantsWithDates = transformChatParticipants(response.data.participants);

            actions.updateParticipants(participantsWithDates);
            actions.setExpectedParticipantIds(getParticipantModelIds(participantsWithDates));

            const syncedParticipantConfigs = chatParticipantsToConfig(participantsWithDates);
            actions.setSelectedParticipants(syncedParticipantConfigs);

            actions.setHasPendingConfigChanges(false);
          }

          if (response?.data?.thread) {
            actions.setThread(transformChatThread(response.data.thread));
          }
        } else {
          updateThreadMutation.mutateAsync({
            param: { id: threadId },
            json: {
              participants: updatePayloads,
              mode: formState.selectedMode,
              enableWebSearch: formState.enableWebSearch,
            },
          }).then((response) => {
            if (response?.data?.participants) {
              const participantsWithDates = transformChatParticipants(response.data.participants);
              actions.updateParticipants(participantsWithDates);
              const syncedParticipantConfigs = chatParticipantsToConfig(participantsWithDates);
              actions.setSelectedParticipants(syncedParticipantConfigs);
            }
            if (response?.data?.thread) {
              actions.setThread(transformChatThread(response.data.thread));
            }
            actions.setHasPendingConfigChanges(false);
          }).catch((error) => {
            console.error('[handleUpdateThreadAndSend] Failed to save configuration changes:', error);
            actions.updateParticipants(previousParticipants);
            showApiErrorToast('Failed to save configuration changes', error);
          });

          actions.setExpectedParticipantIds(getParticipantModelIds(optimisticParticipants));
        }
      } else {
        actions.setExpectedParticipantIds(getParticipantModelIds(threadState.participants));
      }

      actions.prepareForNewMessage(
        trimmed,
        [],
        attachmentIds,
        fileParts,
      );

      actions.setNextParticipantToTrigger(0);

      actions.setInputValue('');

      actions.clearAttachments();
    } catch (error) {
      console.error('[handleUpdateThreadAndSend] Error updating thread:', error);

      actions.setHasEarlyOptimisticMessage(false);
      actions.setStreamingRoundNumber(null);

      const currentMessages = threadState.messages;
      const originalMessages = currentMessages.filter((m) => {
        const metadata = m.metadata;
        return !(metadata && typeof metadata === 'object' && 'isOptimistic' in metadata && metadata.isOptimistic === true);
      });
      actions.setMessages(originalMessages);

      showApiErrorToast('Error updating thread', error);
    }
  }, [
    formState,
    threadState,
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
   */
  const handleModeChange = useCallback((mode: ChatMode) => {
    actions.setSelectedMode(mode);
    actions.setHasPendingConfigChanges(true);
  }, [actions]);

  /**
   * Toggle web search on/off
   * Used by ChatOverviewScreen
   */
  const handleWebSearchToggle = useCallback((enabled: boolean) => {
    actions.setEnableWebSearch(enabled);
  }, [actions]);

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
