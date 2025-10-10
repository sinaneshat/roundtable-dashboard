'use client';

import type { UIMessage } from 'ai';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';

// ============================================================================
// Types - ✅ Inferred from Backend Schema (Zero Hardcoding)
// ============================================================================
import type { ChatMemory, ChatMessage, ChatParticipant, ChatThread, ChatThreadChangelog } from '@/api/routes/chat/schema';
import { Conversation, ConversationContent, ConversationScrollButton } from '@/components/ai-elements/conversation';
import { Loader } from '@/components/ai-elements/loader';
import { Message, MessageAvatar, MessageContent } from '@/components/ai-elements/message';
import { Response } from '@/components/ai-elements/response';
import { ChatDeleteDialog } from '@/components/chat/chat-delete-dialog';
import { ChatInput } from '@/components/chat/chat-input';
import { ChatMemoriesList } from '@/components/chat/chat-memories-list';
import { ChatModeSelector } from '@/components/chat/chat-mode-selector';
import { ChatParticipantsList, ParticipantsPreview } from '@/components/chat/chat-participants-list';
import { ChatThreadActions } from '@/components/chat/chat-thread-actions';
import { ConfigurationChangeCard } from '@/components/chat/configuration-change-card';
import { ModelMessageCard } from '@/components/chat/model-message-card';
import { useThreadHeader } from '@/components/chat/thread-header-context';
import { useChatStreaming } from '@/hooks/utils/use-chat-streaming';
import { getAvatarPropsFromModelId } from '@/lib/ai/avatar-helpers';
import type { MessageMetadata } from '@/lib/ai/message-helpers';
import { chatMessagesToUIMessages } from '@/lib/ai/message-helpers';
import { getModelById } from '@/lib/ai/models-config';
import { useSession } from '@/lib/auth/client';
import type { ChatModeId } from '@/lib/config/chat-modes';
import type { ParticipantConfig } from '@/lib/schemas/chat-forms';

type ChatThreadScreenProps = {
  thread: ChatThread;
  participants: ChatParticipant[];
  initialMessages: ChatMessage[];
  memories: ChatMemory[];
  changelog: ChatThreadChangelog[];
  slug: string;
};

// ============================================================================
// Main Component - ✅ OFFICIAL AI SDK PATTERN
// ============================================================================

/**
 * ChatThreadScreen - Following OFFICIAL AI SDK Elements Pattern
 *
 * ✅ Simple message mapping - no complex grouping
 * ✅ Messages appear immediately as they're added to state
 * ✅ Direct rendering following AI SDK docs exactly
 *
 * See: https://ai-sdk.dev/elements/components/message
 */
export default function ChatThreadScreen({
  thread,
  participants,
  initialMessages,
  memories,
  changelog,
  slug,
}: ChatThreadScreenProps) {
  const t = useTranslations('chat');
  const { data: session } = useSession();
  const { setThreadActions, setThreadTitle } = useThreadHeader();

  // ✅ Thread action state
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  // ✅ Transform backend ChatMessage to AI SDK format using helper
  const [messages, setMessages] = useState<UIMessage[]>(() => chatMessagesToUIMessages(initialMessages));

  // ✅ Create a merged timeline of messages and changelog entries
  // Sort by creation time to show configuration changes at the right points
  // ✅ CRITICAL: Use stable timestamps to prevent React reconciliation issues
  const timeline = useMemo(() => {
    const messageItems = messages.map((msg, index) => ({
      type: 'message' as const,
      data: msg,
      // Use index as fallback to ensure stable ordering for new messages
      timestamp: (msg.metadata as MessageMetadata)?.createdAt
        ? new Date((msg.metadata as MessageMetadata).createdAt!)
        : new Date(Date.now() + index), // Stable fallback using index
    }));

    const changelogItems = changelog.map(change => ({
      type: 'changelog' as const,
      data: change,
      timestamp: new Date(change.createdAt),
    }));

    return [...messageItems, ...changelogItems].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
    );
  }, [messages, changelog]);

  // ✅ Participants state
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

  // ✅ Initialize memory IDs from attached memories
  const [selectedMemoryIds, setSelectedMemoryIds] = useState<string[]>(() => memories.map(m => m.id));
  const [selectedMode, setSelectedMode] = useState<ChatModeId>(thread.mode as ChatModeId);
  const [inputValue, setInputValue] = useState('');

  // ✅ Simplified streaming hook - Following AI SDK patterns
  const { status, streamingState, streamMessage, stopStreaming } = useChatStreaming(
    {
      threadId: thread.id,
      selectedMode,
      selectedParticipants,
      selectedMemoryIds,
    },
    setMessages,
    setSelectedParticipants,
  );

  // ✅ Handle sending new message
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!inputValue.trim() || status !== 'ready')
        return;

      const userMessage: UIMessage = {
        id: `temp-${Date.now()}`,
        role: 'user',
        parts: [{ type: 'text', text: inputValue }],
        metadata: {
          participantId: null, // User messages have no participant
          createdAt: new Date().toISOString(), // ✅ Required for timeline sorting
        },
      };

      setInputValue('');
      setMessages(prev => [...prev, userMessage]);
      await streamMessage([...messages, userMessage]);
    },
    [inputValue, messages, status, streamMessage],
  );

  // ✅ Use shared thread actions component
  const threadActions = useMemo(
    () => (
      <ChatThreadActions
        thread={thread}
        slug={slug}
        onDeleteClick={() => setIsDeleteDialogOpen(true)}
      />
    ),
    [thread, slug],
  );

  // ✅ Set thread actions in header context - minimal dependencies
  useEffect(() => {
    setThreadActions(threadActions);
    setThreadTitle(thread.title);

    // Clear on unmount
    return () => {
      setThreadActions(null);
      setThreadTitle(null);
    };
    // Only depend on the memoized actions and title, not the setters (they're stable context functions)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadActions, thread.title]);

  return (
    <div className="relative flex flex-1 flex-col min-h-0">
      {/* ✅ AI Elements Conversation - Official pattern with auto-scroll */}
      <Conversation className="flex-1 overflow-y-auto">
        {/* ✅ Scroll to bottom button - positioned in header area, aligned with header actions */}
        <ConversationScrollButton
          placement="header"
          className="fixed top-[4.5rem] right-4 z-50 sm:right-6 md:right-8 lg:top-20"
          aria-label={t('actions.scrollToBottom')}
        />
        <ConversationContent className="w-full max-w-4xl mx-auto px-4 sm:px-6 md:px-8 pt-4 pb-4 space-y-4">
          {/* ✅ Timeline: Messages and configuration changes sorted by time */}
          {timeline.map((item, _index) => {
            // Render configuration change card
            if (item.type === 'changelog') {
              return (
                <ConfigurationChangeCard
                  key={`changelog-${item.data.id}`}
                  change={item.data}
                />
              );
            }

            // Render message (existing logic)
            const message = item.data;
            if (message.role === 'user') {
              // ✅ User message
              return (
                <Message from="user" key={message.id}>
                  <MessageContent>
                    {message.parts.map((part, partIndex) => {
                      if (part.type === 'text') {
                        return (
                          // eslint-disable-next-line react/no-array-index-key -- Parts are stable content segments within a message
                          <Response key={`${message.id}-${partIndex}`}>
                            {part.text}
                          </Response>
                        );
                      }
                      return null;
                    })}
                  </MessageContent>
                  <MessageAvatar
                    src={session?.user?.image ?? ''}
                    name={session?.user?.name ?? t('user.defaultName')}
                  />
                </Message>
              );
            }

            // ✅ Assistant message: Extract participant data from message metadata
            // CRITICAL: Use stored model/role from metadata (NOT current participants)
            // Historical messages must remain independent of current participant configuration
            const metadata = message.metadata as MessageMetadata | undefined;
            const participantIndex = metadata?.participantIndex;
            const storedModelId = metadata?.model; // ✅ Matches DB schema
            const storedRole = metadata?.role; // ✅ Matches DB schema

            // ✅ CRITICAL: Use stored modelId directly for avatar (independent of current participants)
            const avatarProps = getAvatarPropsFromModelId(
              message.role === 'system' ? 'assistant' : message.role,
              storedModelId,
              session?.user?.image,
              session?.user?.name,
            );

            // Use stored modelId from metadata, not current participants array
            const model = storedModelId ? getModelById(storedModelId) : undefined;

            if (!model) {
              return null;
            }

            const hasError = message.metadata && typeof message.metadata === 'object' && 'error' in message.metadata;
            const isCurrentlyStreaming = streamingState.messageId === message.id;
            const hasContent = message.parts.some(p => p.type === 'text' && p.text.trim().length > 0);

            const messageStatus: 'thinking' | 'streaming' | 'completed' | 'error' = hasError
              ? 'error'
              : isCurrentlyStreaming && !hasContent
                ? 'thinking'
                : isCurrentlyStreaming
                  ? 'streaming'
                  : 'completed';

            // Filter message parts to only text and reasoning (ModelMessageCard types)
            const filteredParts = message.parts.filter(
              (p): p is { type: 'text'; text: string } | { type: 'reasoning'; text: string } =>
                p.type === 'text' || p.type === 'reasoning',
            );

            return (
              <ModelMessageCard
                key={message.id}
                messageId={message.id}
                model={model}
                role={storedRole || ''} // ✅ Use stored role from metadata
                participantIndex={participantIndex ?? 0}
                status={messageStatus}
                parts={filteredParts}
                avatarSrc={avatarProps.src}
                avatarName={avatarProps.name}
              />
            );
          })}

          {/* ✅ OFFICIAL AI SDK PATTERN: Show loader during streaming */}
          {status === 'streaming' && <Loader />}
        </ConversationContent>
      </Conversation>

      {/* ✅ STICKY INPUT - Relative to dashboard content, not viewport */}
      <div className="sticky bottom-0 left-0 right-0 z-10 mt-auto">
        <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 md:px-8 py-4">
          {/* Participants Preview - shows status during streaming */}
          {selectedParticipants.length > 0 && (
            <ParticipantsPreview
              participants={selectedParticipants}
              isStreaming={status === 'streaming'}
              currentParticipantIndex={streamingState.participantIndex ?? undefined}
              chatMessages={messages}
              className="mb-4"
            />
          )}

          {/* ✅ Chat input with mode selector in toolbar - Glass design */}
          <ChatInput
            value={inputValue}
            onChange={setInputValue}
            onSubmit={handleSubmit}
            onStop={stopStreaming}
            status={status === 'streaming' ? 'streaming' : status === 'error' ? 'error' : 'ready'}
            placeholder={t('input.placeholder')}
            toolbar={(
              <>
                <ChatParticipantsList
                  participants={selectedParticipants}
                  onParticipantsChange={setSelectedParticipants}
                />
                <ChatMemoriesList
                  selectedMemoryIds={selectedMemoryIds}
                  onMemoryIdsChange={setSelectedMemoryIds}
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

      {/* Delete confirmation dialog */}
      <ChatDeleteDialog
        isOpen={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        threadId={thread.id}
        threadSlug={slug}
        redirectIfCurrent={true}
      />
    </div>
  );
}
