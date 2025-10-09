'use client';

import type { UIMessage } from 'ai';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';

// ============================================================================
// Types - ✅ Inferred from Backend Schema (Zero Hardcoding)
// ============================================================================
import type { ChatMessage, ChatParticipant, ChatThread } from '@/api/routes/chat/schema';
import { Loader } from '@/components/ai-elements/loader';
import { Message, MessageAvatar, MessageContent } from '@/components/ai-elements/message';
import { Response } from '@/components/ai-elements/response';
import { ChatInput } from '@/components/chat/chat-input';
import { ChatMemoriesList } from '@/components/chat/chat-memories-list';
import { ChatModeSelector } from '@/components/chat/chat-mode-selector';
import { ChatParticipantsList, ParticipantsPreview } from '@/components/chat/chat-participants-list';
import { ModelMessageCard } from '@/components/chat/model-message-card';
import { useChatStreaming } from '@/hooks/utils/use-chat-streaming';
import { getAvatarPropsFromModelId } from '@/lib/ai/avatar-helpers';
import { chatMessagesToUIMessages } from '@/lib/ai/message-helpers';
import { getModelById } from '@/lib/ai/models-config';
import { useSession } from '@/lib/auth/client';
import type { ChatModeId } from '@/lib/config/chat-modes';
import type { ParticipantConfig } from '@/lib/schemas/chat-forms';
import { toastManager } from '@/lib/toast/toast-manager';

type ChatThreadScreenProps = {
  thread: ChatThread;
  participants: ChatParticipant[];
  initialMessages: ChatMessage[];
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
}: ChatThreadScreenProps) {
  const t = useTranslations('chat');
  const { data: session } = useSession();

  // ✅ Transform backend ChatMessage to AI SDK format using helper
  const [messages, setMessages] = useState<UIMessage[]>(() => chatMessagesToUIMessages(initialMessages));

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

  const [selectedMemoryIds, setSelectedMemoryIds] = useState<string[]>([]);
  const [selectedMode, setSelectedMode] = useState<ChatModeId>(thread.mode as ChatModeId);
  const [inputValue, setInputValue] = useState('');

  // ✅ Simplified streaming hook - Following AI SDK patterns
  const { status, streamingState, streamMessage, stopStreaming } = useChatStreaming(
    {
      threadId: thread.id,
      selectedMode,
      selectedParticipants,
      selectedMemoryIds,
      onError: (error) => {
        toastManager.error(t('error.generic'), error.message);
      },
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
      };

      setInputValue('');
      setMessages(prev => [...prev, userMessage]);
      await streamMessage([...messages, userMessage]);
    },
    [inputValue, messages, status, streamMessage],
  );

  return (
    <div className="relative flex flex-1 flex-col">
      {/* ✅ Message list - Center-based chat layout */}
      <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 md:px-8 pt-4 space-y-4">
        {/* ✅ OFFICIAL AI SDK PATTERN: Simple message mapping */}
        {messages.map((message) => {
          if (message.role === 'user') {
            // ✅ User message
            return (
              <Message from="user" key={message.id}>
                <MessageContent>
                  {message.parts.map((part, partIndex) => {
                    if (part.type === 'text') {
                      return (
                        <Response key={`${message.id}-${partIndex}`}>
                          {part.text}
                        </Response>
                      );
                    }
                    return null;
                  })}
                </MessageContent>
                <MessageAvatar
                  src={session?.user?.image || ''}
                  name={session?.user?.name || 'User'}
                />
              </Message>
            );
          }

          // ✅ Assistant message: Extract participant data from message metadata
          // CRITICAL: Use stored model/role from metadata (NOT current participants)
          // Historical messages must remain independent of current participant configuration
          const metadata = message.metadata as Record<string, unknown> | undefined;
          const participantIndex = metadata?.participantIndex as number | undefined;
          const storedModelId = metadata?.model as string | undefined; // ✅ Matches DB schema
          const storedRole = metadata?.role as string | undefined; // ✅ Matches DB schema

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
      </div>

      {/* ✅ STICKY INPUT - Stays at bottom, no background wrapper */}
      <div className="sticky bottom-0 left-0 right-0 z-50 mt-auto">
        <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 md:px-8 py-4">
          {/* Participants Preview - shows status during streaming */}
          {selectedParticipants.length > 0 && (
            <ParticipantsPreview
              participants={selectedParticipants}
              isStreaming={status === 'streaming'}
              currentParticipantIndex={streamingState.participantIndex ?? undefined}
              chatMessages={messages as unknown as Array<{ participantId?: string | null; [key: string]: unknown }>}
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
    </div>
  );
}
