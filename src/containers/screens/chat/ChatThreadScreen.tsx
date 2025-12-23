'use client';

/**
 * ChatThreadScreen - Thread Detail Page
 *
 * Receives thread data from server props, initializes the store, and delegates
 * all rendering to ChatView for consistent behavior with the overview screen.
 *
 * ARCHITECTURE:
 * - Server data initialization via useScreenInitialization
 * - Store sync from SSR props
 * - Delete dialog (thread-specific action)
 * - ChatView handles all content rendering (same as overview screen)
 */

import { useCallback, useEffect, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';

import type { ChatMode } from '@/api/core/enums';
import { UploadStatuses } from '@/api/core/enums';
import type { ChatMessage, ChatParticipant, ChatThread, ThreadStreamResumptionState } from '@/api/routes/chat/schema';
import { ChatDeleteDialog } from '@/components/chat/chat-delete-dialog';
import { ChatThreadActions } from '@/components/chat/chat-thread-actions';
import { useThreadHeader } from '@/components/chat/thread-header-context';
import { useChatStore } from '@/components/providers';
import { useBoolean, useChatAttachments } from '@/hooks/utils';
import { chatMessagesToUIMessages } from '@/lib/utils';
import {
  useChatFormActions,
  useScreenInitialization,
} from '@/stores/chat';

import { ChatView } from './ChatView';

type ChatThreadScreenProps = {
  thread: ChatThread;
  participants: ChatParticipant[];
  initialMessages: ChatMessage[];
  slug: string;
  user: {
    name: string;
    image: string | null;
  };
  /** Stream resumption state from server-side KV check (for Zustand pre-fill) */
  streamResumptionState?: ThreadStreamResumptionState | null;
};

/**
 * Memoized thread header updater to prevent infinite render loops
 * ✅ ZUSTAND PATTERN: Thread title comes from store - only set threadActions here
 * ✅ REACT 19: Effect is valid - syncing with context (external to this component)
 */
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

  // Memoize to prevent unnecessary context updates
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

  // Sync to context - valid effect per React 19 (external system synchronization)
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
  // Delete dialog
  const isDeleteDialogOpen = useBoolean(false);

  // Chat attachments
  const chatAttachments = useChatAttachments();

  // Thread header
  useThreadHeaderUpdater({
    thread,
    slug,
    onDeleteClick: isDeleteDialogOpen.onTrue,
  });

  // ============================================================================
  // STORE STATE
  // ============================================================================

  // ✅ ZUSTAND v5: Batch all store selectors with useShallow
  const {
    isStreaming,
    isModeratorStreaming,
    pendingMessage,
    selectedMode,
    inputValue,
    selectedParticipants,
    prefillStreamResumptionState,
  } = useChatStore(
    useShallow(s => ({
      isStreaming: s.isStreaming,
      isModeratorStreaming: s.isModeratorStreaming,
      pendingMessage: s.pendingMessage,
      selectedMode: s.selectedMode,
      inputValue: s.inputValue,
      selectedParticipants: s.selectedParticipants,
      prefillStreamResumptionState: s.prefillStreamResumptionState,
    })),
  );

  useEffect(() => {
    if (streamResumptionState && thread?.id) {
      prefillStreamResumptionState(thread.id, streamResumptionState);
    }
  }, [streamResumptionState, thread?.id, prefillStreamResumptionState]);

  // ============================================================================
  // MEMOIZED DATA
  // ============================================================================

  // Transform initial messages once
  const uiMessages = useMemo(
    () => chatMessagesToUIMessages(initialMessages, participants),
    [initialMessages, participants],
  );

  // ============================================================================
  // HOOKS
  // ============================================================================

  const formActions = useChatFormActions();

  // ✅ ZUSTAND v5: Batch regeneration state selectors with useShallow
  const { isRegenerating, regeneratingRoundNumber } = useChatStore(
    useShallow(s => ({
      isRegenerating: s.isRegenerating,
      regeneratingRoundNumber: s.regeneratingRoundNumber,
    })),
  );

  // ✅ TEXT STREAMING: isModeratorStreaming flag tracks moderator streaming
  useScreenInitialization({
    mode: 'thread',
    thread,
    participants,
    initialMessages: uiMessages,
    chatMode: selectedMode || (thread.mode as ChatMode),
    isRegeneration: regeneratingRoundNumber !== null,
    regeneratingRoundNumber,
    enableOrchestrator: !isRegenerating && !isModeratorStreaming,
  });

  // Input blocking for submit guard only (ChatView handles its own input state)
  const isSubmitBlocked = isStreaming || isModeratorStreaming || Boolean(pendingMessage);

  // ✅ SIMPLIFIED: Removed duplicate initialization useEffect
  // All state setup now happens in initializeThread (called by useScreenInitialization)

  // ============================================================================
  // CALLBACKS
  // ============================================================================

  const handlePromptSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      // Guard: prevent double submission
      if (!inputValue.trim() || selectedParticipants.length === 0 || isSubmitBlocked) {
        return;
      }

      // Wait for all uploads to complete before sending
      if (!chatAttachments.allUploaded) {
        return;
      }

      const attachmentIds = chatAttachments.getUploadIds();
      // Build attachment info for optimistic message file parts
      const attachmentInfos = chatAttachments.attachments
        .filter(att => att.status === UploadStatuses.COMPLETED && att.uploadId)
        .map(att => ({
          uploadId: att.uploadId!,
          filename: att.file.name,
          mimeType: att.file.type,
          previewUrl: att.preview?.url,
        }));
      await formActions.handleUpdateThreadAndSend(thread.id, attachmentIds, attachmentInfos);
      // ✅ Clear store attachments is called inside handleUpdateThreadAndSend
      // ✅ Clear hook local state AFTER message is sent (keeps UI consistent with overview)
      chatAttachments.clearAttachments();
    },
    [inputValue, selectedParticipants, formActions, thread.id, isSubmitBlocked, chatAttachments],
  );

  // ============================================================================
  // RENDER
  // ============================================================================

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
