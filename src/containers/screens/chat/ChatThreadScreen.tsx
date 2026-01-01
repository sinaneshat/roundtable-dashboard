'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { ChatModeSchema, UploadStatuses } from '@/api/core/enums';
import type { ChatMessage, ChatThread, ThreadStreamResumptionState } from '@/api/routes/chat/schema';
import { ChatDeleteDialog } from '@/components/chat/chat-delete-dialog';
import { ChatThreadActions } from '@/components/chat/chat-thread-actions';
import { useThreadHeader } from '@/components/chat/thread-header-context';
import { useChatStore, useModelPreferencesStore } from '@/components/providers';
import { useModelsQuery } from '@/hooks/queries';
import { useBoolean, useChatAttachments } from '@/hooks/utils';
import type { ChatParticipantWithSettings } from '@/lib/schemas/participant-schemas';
import { toastManager } from '@/lib/toast';
import {
  chatMessagesToUIMessages,
  getCurrentRoundNumber,
  getIncompatibleModelIds,
  isVisionRequiredMimeType,
  threadHasVisionRequiredFiles,
} from '@/lib/utils';
import {
  useChatFormActions,
  useScreenInitialization,
} from '@/stores/chat';
import {
  areAllParticipantsCompleteForRound,
  getModeratorMessageForRound,
} from '@/stores/chat/utils/participant-completion-gate';

import { ChatView } from './ChatView';

type ChatThreadScreenProps = {
  thread: ChatThread;
  participants: ChatParticipantWithSettings[];
  initialMessages: ChatMessage[];
  slug: string;
  user: {
    name: string;
    image: string | null;
  };
  /** Stream resumption state from server-side KV check (for Zustand pre-fill) */
  streamResumptionState?: ThreadStreamResumptionState | null;
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
  const { setThreadActions } = useThreadHeader();

  const threadActions = useMemo(
    () => (
      <ChatThreadActions
        thread={thread}
        slug={slug}
        onDeleteClick={onDeleteClick}
      />
    ),
    [thread, slug, onDeleteClick],
  );

  useEffect(() => {
    setThreadActions(threadActions);
  }, [threadActions, setThreadActions]);
}

export default function ChatThreadScreen({
  thread,
  participants,
  initialMessages,
  slug,
  user,
  streamResumptionState,
}: ChatThreadScreenProps) {
  const t = useTranslations();
  const isDeleteDialogOpen = useBoolean(false);
  const chatAttachments = useChatAttachments();

  useThreadHeaderUpdater({
    thread,
    slug,
    onDeleteClick: isDeleteDialogOpen.onTrue,
  });

  const { setSelectedModelIds } = useModelPreferencesStore(useShallow(s => ({
    setSelectedModelIds: s.setSelectedModelIds,
  })));

  const {
    isStreaming,
    isModeratorStreaming,
    pendingMessage,
    selectedMode,
    inputValue,
    selectedParticipants,
    prefillStreamResumptionState,
    messages,
    setSelectedParticipants,
  } = useChatStore(
    useShallow(s => ({
      isStreaming: s.isStreaming,
      isModeratorStreaming: s.isModeratorStreaming,
      pendingMessage: s.pendingMessage,
      selectedMode: s.selectedMode,
      inputValue: s.inputValue,
      selectedParticipants: s.selectedParticipants,
      prefillStreamResumptionState: s.prefillStreamResumptionState,
      messages: s.messages,
      setSelectedParticipants: s.setSelectedParticipants,
    })),
  );

  useEffect(() => {
    if (streamResumptionState && thread?.id) {
      prefillStreamResumptionState(thread.id, streamResumptionState);
    }
  }, [streamResumptionState, thread?.id, prefillStreamResumptionState]);

  const uiMessages = useMemo(
    () => chatMessagesToUIMessages(initialMessages, participants),
    [initialMessages, participants],
  );

  const { data: modelsData } = useModelsQuery();
  const allEnabledModels = useMemo(
    () => modelsData?.data?.items || [],
    [modelsData?.data?.items],
  );

  const incompatibleModelIds = useMemo(() => {
    const existingVisionFiles = threadHasVisionRequiredFiles(messages);
    const newVisionFiles = chatAttachments.attachments.some(att =>
      isVisionRequiredMimeType(att.file.type),
    );

    if (!existingVisionFiles && !newVisionFiles) {
      return new Set<string>();
    }

    const files = [{ mimeType: 'image/png' }];
    return getIncompatibleModelIds(allEnabledModels, files);
  }, [messages, chatAttachments.attachments, allEnabledModels]);

  useEffect(() => {
    if (incompatibleModelIds.size === 0)
      return;

    const incompatibleSelected = selectedParticipants.filter(
      p => incompatibleModelIds.has(p.modelId),
    );

    if (incompatibleSelected.length === 0)
      return;

    const incompatibleModelNames = incompatibleSelected
      .map(p => allEnabledModels.find(m => m.id === p.modelId)?.name)
      .filter((name): name is string => Boolean(name));

    const compatibleParticipants = selectedParticipants.filter(
      p => !incompatibleModelIds.has(p.modelId),
    );

    const reindexed = compatibleParticipants.map((p, index) => ({
      ...p,
      priority: index,
    }));

    setSelectedParticipants(reindexed);
    setSelectedModelIds(reindexed.map(p => p.modelId));

    if (incompatibleModelNames.length > 0) {
      const modelList = incompatibleModelNames.length <= 2
        ? incompatibleModelNames.join(' and ')
        : `${incompatibleModelNames.slice(0, 2).join(', ')} and ${incompatibleModelNames.length - 2} more`;

      toastManager.warning(
        t('chat.models.modelsDeselected'),
        t('chat.models.modelsDeselectedDescription', { models: modelList }),
      );
    }
  }, [incompatibleModelIds, selectedParticipants, setSelectedParticipants, setSelectedModelIds, allEnabledModels, t]);

  const formActions = useChatFormActions();

  const { isRegenerating, regeneratingRoundNumber } = useChatStore(
    useShallow(s => ({
      isRegenerating: s.isRegenerating,
      regeneratingRoundNumber: s.regeneratingRoundNumber,
    })),
  );

  const chatMode = useMemo(() => {
    if (selectedMode)
      return selectedMode;
    const parsed = ChatModeSchema.safeParse(thread.mode);
    return parsed.success ? parsed.data : undefined;
  }, [selectedMode, thread.mode]);

  useScreenInitialization({
    mode: 'thread',
    thread,
    participants,
    initialMessages: uiMessages,
    chatMode,
    isRegeneration: regeneratingRoundNumber !== null,
    regeneratingRoundNumber,
    enableOrchestrator: !isRegenerating && !isModeratorStreaming,
  });

  const isAwaitingModerator = useMemo(() => {
    if (messages.length === 0 || participants.length === 0)
      return false;

    const currentRound = getCurrentRoundNumber(messages);
    const allParticipantsComplete = areAllParticipantsCompleteForRound(messages, participants, currentRound);
    const moderatorExists = getModeratorMessageForRound(messages, currentRound) !== undefined;

    // Block if all participants are done but moderator hasn't been created yet
    return allParticipantsComplete && !moderatorExists;
  }, [messages, participants]);

  const isSubmitBlocked = isStreaming || isModeratorStreaming || Boolean(pendingMessage) || isAwaitingModerator;

  const handlePromptSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (!inputValue.trim() || selectedParticipants.length === 0 || isSubmitBlocked) {
        return;
      }

      if (!chatAttachments.allUploaded) {
        return;
      }

      const attachmentIds = chatAttachments.getUploadIds();
      const attachmentInfos = chatAttachments.attachments
        .filter(att => att.status === UploadStatuses.COMPLETED && att.uploadId)
        .map(att => ({
          uploadId: att.uploadId!,
          filename: att.file.name,
          mimeType: att.file.type,
          previewUrl: att.preview?.url,
        }));
      await formActions.handleUpdateThreadAndSend(thread.id, attachmentIds, attachmentInfos);
      chatAttachments.clearAttachments();
    },
    [inputValue, selectedParticipants, formActions, thread.id, isSubmitBlocked, chatAttachments],
  );

  return (
    <>
      <ChatView
        user={user}
        slug={slug}
        mode="thread"
        onSubmit={handlePromptSubmit}
        chatAttachments={chatAttachments}
        threadId={thread.id}
      />

      <ChatDeleteDialog
        isOpen={isDeleteDialogOpen.value}
        onOpenChange={isDeleteDialogOpen.setValue}
        threadId={thread.id}
        threadSlug={slug}
      />
    </>
  );
}
