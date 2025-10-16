'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ChatDeleteDialog } from '@/components/chat/chat-delete-dialog';
import { ChatInput } from '@/components/chat/chat-input';
import { ChatMessageList } from '@/components/chat/chat-message-list';
import { ChatModeSelector } from '@/components/chat/chat-mode-selector';
import { ChatParticipantsList } from '@/components/chat/chat-participants-list';
import { ChatThreadActions } from '@/components/chat/chat-thread-actions';
import { ConfigurationChangesGroup } from '@/components/chat/configuration-changes-group';
import { ModeratorRoundTrigger } from '@/components/chat/moderator/moderator-round-trigger';
import { StreamingParticipantsLoader } from '@/components/chat/streaming-participants-loader';
import { useThreadHeader } from '@/components/chat/thread-header-context';
import { useThreadAnalysesQuery, useThreadChangelogQuery } from '@/hooks/queries/chat-threads';
import { useMultiParticipantChat } from '@/hooks/use-multi-participant-chat';
import { useBoolean } from '@/hooks/utils';
import type { ChatModeId } from '@/lib/config/chat-modes';
import type { ParticipantConfig } from '@/lib/schemas/chat-forms';
import { chatMessagesToUIMessages } from '@/lib/utils/message-transforms';
import type { ChatMessage, Participant, Thread } from '@/types/chat';

type ChatThreadScreenProps = {
  thread: Thread;
  participants: Participant[];
  initialMessages: ChatMessage[];
  slug: string;
  user: {
    name: string;
    image: string | null;
  };
};

export default function ChatThreadScreen({
  thread,
  participants,
  initialMessages,
  slug,
  user,
}: ChatThreadScreenProps) {
  const router = useRouter();
  const t = useTranslations('chat');
  const { setThreadActions, setThreadTitle } = useThreadHeader();

  const { data: changelogResponse } = useThreadChangelogQuery(thread.id);
  const changelog = useMemo(
    () => (changelogResponse?.success ? changelogResponse.data.changelog || [] : []),
    [changelogResponse],
  );

  const { data: analysesResponse } = useThreadAnalysesQuery(thread.id, true);
  const analyses = useMemo(
    () => (analysesResponse?.success ? analysesResponse.data.items || [] : []),
    [analysesResponse],
  );

  const isDeleteDialogOpen = useBoolean(false);

  // Chat state
  const [selectedMode, setSelectedMode] = useState<ChatModeId>(thread.mode as ChatModeId);
  const [inputValue, setInputValue] = useState('');
  const [selectedParticipants, setSelectedParticipants] = useState<ParticipantConfig[]>(() => {
    return participants
      .filter(p => p.isEnabled)
      .sort((a, b) => a.priority - b.priority)
      .map((p, index) => ({
        id: p.id,
        modelId: p.modelId,
        role: p.role,
        customRoleId: p.customRoleId || undefined,
        order: index,
      }));
  });

  // ✅ AI SDK v5 COMPATIBLE: Use the consolidated multi-participant chat hook
  const {
    messages,
    isStreaming,
    currentParticipantIndex,
    error: streamError,
    sendMessage: sendMessageToParticipants,
  } = useMultiParticipantChat({
    threadId: thread.id,
    participants,
    initialMessages: chatMessagesToUIMessages(initialMessages),
    onComplete: () => {
      // Refresh to update thread title if needed
      if (thread.title === 'New Conversation') {
        router.refresh();
      }
    },
  });

  // ✅ AUTO-TRIGGER: When thread loads with user message but no assistant responses,
  // automatically trigger streaming for all participants (ChatGPT pattern)
  //
  // NOTE: We check messages.length === initialMessages.length to ensure we only
  // trigger once on mount, not on every message update
  const hasTriggeredRef = useRef(false);
  useEffect(() => {
    // Only trigger once on initial load
    if (hasTriggeredRef.current) {
      return;
    }

    const hasUserMessage = initialMessages.some(m => m.role === 'user');
    const hasAssistantResponse = initialMessages.some(m => m.role === 'assistant');

    // If there's a user message but no assistant response, trigger streaming
    if (hasUserMessage && !hasAssistantResponse && !isStreaming && messages.length === initialMessages.length) {
      hasTriggeredRef.current = true;

      const userMessage = initialMessages.find(m => m.role === 'user');
      if (userMessage && userMessage.content) {
        // Trigger streaming - the hook will handle adding to messages and calling backend
        sendMessageToParticipants(userMessage.content).catch((error) => {
          console.error('Auto-trigger streaming error:', error);
          hasTriggeredRef.current = false; // Allow retry on error
        });
      }
    }
  }, [initialMessages, isStreaming, messages.length, sendMessageToParticipants]);

  // ✅ AI SDK v5 PATTERN: Simple submit handler using the hook
  const handlePromptSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = inputValue.trim();
      if (!trimmed) {
        return;
      }

      // The hook handles all streaming logic
      await sendMessageToParticipants(trimmed);
      setInputValue('');
    },
    [inputValue, sendMessageToParticipants],
  );

  // Update header actions
  useEffect(() => {
    setThreadTitle(thread.title);
    setThreadActions(
      <ChatThreadActions
        thread={thread}
        slug={slug}
        onDeleteClick={isDeleteDialogOpen.onTrue}
      />,
    );
  }, [thread, slug, setThreadTitle, setThreadActions, isDeleteDialogOpen.onTrue]);

  // Determine if moderator can trigger
  const canModeratorTrigger = useMemo(() => {
    const hasUserMessage = messages.some(m => m.role === 'user');
    const hasAtLeastOneAssistantResponse = messages.some(m => m.role === 'assistant');
    return hasUserMessage && hasAtLeastOneAssistantResponse && !isStreaming;
  }, [messages, isStreaming]);

  return (
    <>
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Messages Container */}
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-4 py-6">
            {/* Configuration Changes */}
            {changelog.length > 0 && (
              <div className="mb-6 space-y-4">
                {/* Group changes by timestamp for ConfigurationChangesGroup */}
                {changelog.map(change => (
                  <ConfigurationChangesGroup
                    key={change.id}
                    group={{
                      timestamp: new Date(change.createdAt),
                      changes: [change],
                    }}
                  />
                ))}
              </div>
            )}

            {/* ✅ AI SDK COMPATIBLE: Unified message list component */}
            <ChatMessageList
              messages={messages}
              user={user}
              participants={participants}
              isStreaming={isStreaming}
              currentParticipantIndex={currentParticipantIndex}
            />

            {/* Error display */}
            {streamError && (
              <div className="rounded-lg bg-red-50 p-4 text-red-700 dark:bg-red-900/20 dark:text-red-400 mt-4">
                {streamError.message}
              </div>
            )}

            {/* Streaming participants loader */}
            {isStreaming && selectedParticipants.length > 1 && (
              <div className="mt-4">
                <StreamingParticipantsLoader
                  participants={selectedParticipants}
                  currentParticipantIndex={currentParticipantIndex}
                />
              </div>
            )}

            {/* Moderator Analyses */}
            {canModeratorTrigger && analyses.length > 0 && (
              <div className="mt-6 space-y-4">
                {analyses.map(analysis => (
                  <ModeratorRoundTrigger
                    key={analysis.id}
                    analysis={{
                      ...analysis,
                      // Convert date strings to Date objects
                      createdAt: new Date(analysis.createdAt),
                      completedAt: analysis.completedAt ? new Date(analysis.completedAt) : null,
                    }}
                    startExpanded={false}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Input Area */}

        <div className="mx-auto max-w-3xl w-full px-4 py-4">
          <ChatInput
            value={inputValue}
            onChange={setInputValue}
            onSubmit={handlePromptSubmit}
            status={isStreaming ? 'submitted' : 'ready'}
            placeholder={t('input.placeholder')}
            toolbar={(
              <>
                <ChatParticipantsList
                  participants={selectedParticipants}
                  onParticipantsChange={setSelectedParticipants}
                />
                <ChatModeSelector
                  selectedMode={selectedMode}
                  onModeChange={setSelectedMode}
                />
              </>
            )}
          />
        </div>

      </div>

      {/* Delete Dialog */}
      <ChatDeleteDialog
        isOpen={isDeleteDialogOpen.value}
        onOpenChange={isDeleteDialogOpen.setValue}
        threadId={thread.id}
        threadSlug={slug}
      />
    </>
  );
}
