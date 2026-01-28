import { UploadStatuses } from '@roundtable/shared';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { ChatThreadActions } from '@/components/chat/chat-thread-actions';
import { useThreadHeader } from '@/components/chat/thread-header-context';
import { useChatStore, useModelPreferencesStore } from '@/components/providers';
import { useModelsQuery } from '@/hooks/queries';
import { useBoolean, useChatAttachments } from '@/hooks/utils';
import { useTranslations } from '@/lib/i18n';
import type { ParticipantConfig } from '@/lib/schemas/participant-schemas';
import { toastManager } from '@/lib/toast';
import {
  chatMessagesToUIMessages,
  getCurrentRoundNumber,
  getDetailedIncompatibleModelIds,
  isDocumentFile,
  isImageFile,
  threadHasDocumentFiles,
  threadHasImageFiles,
} from '@/lib/utils';
import { rlog } from '@/lib/utils/dev-logger';
import dynamic from '@/lib/utils/dynamic';
import type { ApiMessage, ApiParticipant, ChangelogItem, ChatThread, Model, StoredPreSearch, ThreadDetailData } from '@/services/api';
import {
  getModeratorMessageForRound,
  useChatFormActions,
  useSyncHydrateStore,
} from '@/stores/chat';

import { ChatView } from './ChatView';

const ChatDeleteDialog = dynamic(
  () => import('@/components/chat/chat-delete-dialog').then(m => ({ default: m.ChatDeleteDialog })),
  { ssr: false },
);

type ChatThreadScreenProps = {
  thread: ChatThread;
  participants: ApiParticipant[];
  initialMessages: ApiMessage[];
  slug: string;
  user: ThreadDetailData['user'];
  /** Pre-searched data prefetched on server for SSR hydration */
  initialPreSearches?: StoredPreSearch[];
  /** Changelog items prefetched on server for SSR hydration */
  initialChangelog?: ChangelogItem[];
};

function useThreadHeaderUpdater({
  onDeleteClick,
  slug,
  thread,
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
    return () => setThreadActions(null);
  }, [threadActions, setThreadActions]);
}

export default function ChatThreadScreen({
  initialChangelog,
  initialMessages,
  initialPreSearches,
  participants,
  slug,
  thread,
  user,
}: ChatThreadScreenProps) {
  const t = useTranslations();
  const isDeleteDialogOpen = useBoolean(false);
  const chatAttachments = useChatAttachments();
  // Track initial mount to skip showing "models deselected" toast on page load
  const hasCompletedInitialMountRef = useRef(false);

  // ✅ SSR HYDRATION: Compute uiMessages early for sync hydration
  const uiMessages = useMemo(
    () => chatMessagesToUIMessages(initialMessages, participants),
    [initialMessages, participants],
  );

  // ✅ SSR HYDRATION: Hydrate store synchronously BEFORE any useChatStore calls
  // This ensures first paint has content - no loading flash
  useSyncHydrateStore({
    initialChangelog,
    initialMessages: uiMessages,
    initialPreSearches,
    participants,
    thread,
  });

  // 🔍 DEBUG: Log props vs what useSyncHydrateStore received
  rlog.init('screen-props', `t=${thread.id?.slice(-8)} slug=${thread.slug} msgs=${uiMessages.length} parts=${participants.length}`);

  useThreadHeaderUpdater({ onDeleteClick: isDeleteDialogOpen.onTrue, slug, thread });

  const { setSelectedModelIds } = useModelPreferencesStore(useShallow(s => ({
    setSelectedModelIds: s.setSelectedModelIds,
  })));

  const {
    inputValue,
    isModeratorStreaming,
    isStreaming,
    messages,
    pendingMessage,
    selectedParticipants,
    setSelectedParticipants,
    waitingToStartStreaming,
  } = useChatStore(
    useShallow(s => ({
      inputValue: s.inputValue,
      isModeratorStreaming: s.isModeratorStreaming,
      isStreaming: s.isStreaming,
      messages: s.messages,
      pendingMessage: s.pendingMessage,
      selectedParticipants: s.selectedParticipants,
      setSelectedParticipants: s.setSelectedParticipants,
      waitingToStartStreaming: s.waitingToStartStreaming,
    })),
  );

  const { data: modelsData } = useModelsQuery();
  const allEnabledModels = useMemo(() => {
    if (!modelsData?.success || !modelsData.data?.items) {
      return [];
    }
    return modelsData.data.items;
  }, [modelsData]);

  // ✅ GRANULAR: Track vision (image) and file (document) incompatibilities separately
  const { fileIncompatibleModelIds, incompatibleModelIds, visionIncompatibleModelIds } = useMemo(() => {
    const incompatible = new Set<string>();

    // Add inaccessible models (tier restrictions)
    for (const model of allEnabledModels) {
      if (!model.is_accessible_to_user) {
        incompatible.add(model.id);
      }
    }

    // Check for images in thread and attachments
    const existingImageFiles = threadHasImageFiles(messages);
    const newImageFiles = chatAttachments.attachments.some(att =>
      isImageFile(att.file.type),
    );
    const hasImages = existingImageFiles || newImageFiles;

    // Check for documents in thread and attachments
    const existingDocumentFiles = threadHasDocumentFiles(messages);
    const newDocumentFiles = chatAttachments.attachments.some(att =>
      isDocumentFile(att.file.type),
    );
    const hasDocuments = existingDocumentFiles || newDocumentFiles;

    // Build file list for capability checking
    const files: { mimeType: string }[] = [];
    if (hasImages) {
      files.push({ mimeType: 'image/png' }); // Representative image type
    }
    if (hasDocuments) {
      files.push({ mimeType: 'application/pdf' }); // Representative document type
    }

    // Get detailed incompatibility info
    // Map models to the shape expected by getDetailedIncompatibleModelIds
    const modelsWithCapabilities = allEnabledModels.map((m: Model) => ({
      capabilities: {
        file: m.supports_file,
        vision: m.supports_vision,
      },
      id: m.id,
    }));
    const {
      fileIncompatibleIds,
      incompatibleIds,
      visionIncompatibleIds,
    } = getDetailedIncompatibleModelIds(modelsWithCapabilities, files);

    // Merge with tier-restricted models
    for (const id of incompatibleIds) {
      incompatible.add(id);
    }

    return {
      fileIncompatibleModelIds: fileIncompatibleIds,
      incompatibleModelIds: incompatible,
      visionIncompatibleModelIds: visionIncompatibleIds,
    };
  }, [messages, chatAttachments.attachments, allEnabledModels]);

  useEffect(() => {
    // Mark initial mount as complete after first run
    // This prevents showing toast on page load for pre-existing incompatible models
    const isInitialMount = !hasCompletedInitialMountRef.current;
    if (isInitialMount) {
      hasCompletedInitialMountRef.current = true;
    }

    if (incompatibleModelIds.size === 0) {
      return;
    }

    const incompatibleSelected = selectedParticipants.filter(
      p => incompatibleModelIds.has(p.modelId),
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

    const compatibleParticipants = selectedParticipants.filter(
      p => !incompatibleModelIds.has(p.modelId),
    );

    const reindexed = compatibleParticipants.map((p, index) => ({
      ...p,
      priority: index,
    }));

    setSelectedParticipants(reindexed);
    setSelectedModelIds(reindexed.map(p => p.modelId));

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
  }, [incompatibleModelIds, visionIncompatibleModelIds, fileIncompatibleModelIds, selectedParticipants, setSelectedParticipants, setSelectedModelIds, allEnabledModels, t]);

  const formActions = useChatFormActions();

  // Check if waiting for moderator (no moderator message for current round)
  // Backend-first architecture: subscriptions will update UI when moderator streams
  const isAwaitingModerator = useMemo(() => {
    if (messages.length === 0 || participants.length === 0) {
      return false;
    }
    const currentRound = getCurrentRoundNumber(messages);
    const moderatorExists = getModeratorMessageForRound(messages, currentRound) !== undefined;
    return !moderatorExists;
  }, [messages, participants]);

  const isSubmitBlocked = isStreaming || isModeratorStreaming || Boolean(pendingMessage) || isAwaitingModerator || waitingToStartStreaming;

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
        .map((att) => {
          if (!att.uploadId) {
            throw new Error('Upload ID is required for completed attachments');
          }
          return {
            filename: att.file.name,
            mimeType: att.file.type,
            previewUrl: att.preview?.url,
            uploadId: att.uploadId,
          };
        });
      await formActions.handleUpdateThreadAndSend(thread.id, attachmentIds, attachmentInfos);
      chatAttachments.clearAttachments();
    },
    [inputValue, selectedParticipants, formActions, thread.id, isSubmitBlocked, chatAttachments],
  );

  return (
    <>
      <h1 className="sr-only">{thread.title || t('chat.thread.conversationTitle')}</h1>
      <ChatView
        user={user}
        slug={slug}
        mode="thread"
        onSubmit={handlePromptSubmit}
        chatAttachments={chatAttachments}
        threadId={thread.id}
        initialMessages={uiMessages}
        initialParticipants={participants}
        initialPreSearches={initialPreSearches}
        initialChangelog={initialChangelog}
        skipEntranceAnimations={uiMessages.length > 0}
      />

      <ChatDeleteDialog
        isOpen={isDeleteDialogOpen.value}
        onOpenChange={isDeleteDialogOpen.setValue}
        threadId={thread.id}
        threadSlug={slug}
        projectId={thread.projectId ?? undefined}
        redirectIfCurrent
      />
    </>
  );
}
