'use client';

import type { UIMessage } from 'ai';
import { RefreshCcwIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { ChatMemory, ChatMessage, ChatParticipant, ChatThread, ChatThreadChangelog } from '@/api/routes/chat/schema';
import { Action, Actions } from '@/components/ai-elements/actions';
import { Conversation, ConversationContent, ConversationScrollButton } from '@/components/ai-elements/conversation';
import { Message, MessageAvatar, MessageContent } from '@/components/ai-elements/message';
import { Response } from '@/components/ai-elements/response';
import { ChatDeleteDialog } from '@/components/chat/chat-delete-dialog';
import { ChatInput } from '@/components/chat/chat-input';
import { ChatMemoriesList } from '@/components/chat/chat-memories-list';
import { ChatModeSelector } from '@/components/chat/chat-mode-selector';
import { ChatParticipantsList, ParticipantsPreview } from '@/components/chat/chat-participants-list';
import { ChatThreadActions } from '@/components/chat/chat-thread-actions';
import { ConfigurationChangesGroup } from '@/components/chat/configuration-changes-group';
import { ModelMessageCard } from '@/components/chat/model-message-card';
import { RoundBranchSelector } from '@/components/chat/round-branch-selector';
import { StreamingParticipantsLoader } from '@/components/chat/streaming-participants-loader';
import { useThreadHeader } from '@/components/chat/thread-header-context';
import { useChatStreaming } from '@/hooks/utils/use-chat-streaming';
import { getAvatarPropsFromModelId } from '@/lib/ai/avatar-helpers';
import { groupChangelogByTime } from '@/lib/ai/changelog-helpers';
import {
  chatMessagesToUIMessages,
  detectConversationRounds,
  enrichRoundsWithVariants,
  getMessageMetadata,
  getRoundForMessage,
  isLastMessageInRound,
} from '@/lib/ai/message-helpers';
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

  // ✅ Detect conversation rounds and enrich with variant information from message metadata
  // Variant data is pre-loaded from server, no separate state needed
  const rounds = useMemo(() => {
    const baseRounds = detectConversationRounds(messages);
    // Extract variant info directly from message metadata
    const variantsMap = new Map(
      messages
        .filter(m => m.role === 'assistant')
        .map((m) => {
          const metadata = getMessageMetadata(m.metadata);
          return [
            m.id,
            {
              totalVariants: metadata?.totalVariants ?? 1,
              activeVariantIndex: metadata?.activeVariantIndex ?? 0,
            },
          ];
        }),
    );
    return enrichRoundsWithVariants(baseRounds, variantsMap);
  }, [messages]);

  // ✅ Create a merged timeline of messages and grouped changelog entries
  // Sort by creation time to show configuration changes at the right points
  // ✅ CRITICAL: Use stable timestamps to prevent React reconciliation issues
  const timeline = useMemo(() => {
    const messageItems = messages.map((msg, index) => {
      const metadata = getMessageMetadata(msg.metadata);
      return {
        type: 'message' as const,
        data: msg,
        index, // Store original index for round detection
        // Use index as fallback to ensure stable ordering for new messages
        timestamp: metadata?.createdAt
          ? new Date(metadata.createdAt)
          : new Date(Date.now() + index), // Stable fallback using index
      };
    });

    // Group changelog entries by timestamp
    const changelogGroups = groupChangelogByTime(changelog);
    const changelogItems = changelogGroups.map(group => ({
      type: 'changelog_group' as const,
      data: group,
      timestamp: group.timestamp,
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

  // ✅ Removed fetchedVariantsRef - no longer needed since variants are pre-loaded

  // ✅ Refetch messages from backend after streaming completes
  // This ensures we get real backend message IDs, participantIds, and parentMessageIds for variant support
  const previousStatusRef = useRef<typeof status>('ready');
  useEffect(() => {
    const didJustFinishStreaming = previousStatusRef.current === 'streaming' && status === 'ready';
    previousStatusRef.current = status;

    if (!didJustFinishStreaming) {
      return;
    }

    // Streaming just completed - refetch messages from backend to get real data
    console.warn('[ChatThreadScreen] Streaming completed - refetching messages from backend');

    const refetchMessages = async () => {
      try {
        const { getThreadService } = await import('@/services/api/chat-threads');
        const result = await getThreadService(thread.id);

        if (result.success && result.data?.messages) {
          console.warn('[ChatThreadScreen] Refetched', result.data.messages.length, 'messages from backend');
          // Transform backend messages to UI messages
          const { chatMessagesToUIMessages } = await import('@/lib/ai/message-helpers');
          setMessages(chatMessagesToUIMessages(result.data.messages));

          // Variants are already included in message metadata from server
        }
      } catch (error) {
        console.error('[ChatThreadScreen] Failed to refetch messages after streaming:', error);
      }
    };

    refetchMessages();
  }, [status, thread.id]);

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

  // ✅ Handle regenerating a conversation round
  // Creates a new variant when regenerating - backend handles variant tracking automatically
  const handleRegenerateRound = useCallback(
    async (roundIndex: number) => {
      const round = rounds[roundIndex];
      if (!round || status !== 'ready')
        return;

      // Remove all messages from this round onwards
      // Keep the user message that started the round
      const messagesToKeep = messages.slice(0, round.userMessageIndex + 1);

      // Reset messages to just before this round's responses
      // This causes the backend to create new variant messages automatically
      setMessages(messagesToKeep);

      // Re-stream from the user message
      // Backend's saveAssistantMessageWithVariants() will:
      // 1. Find the parent user message (last user message)
      // 2. Check existing variants for this parent
      // 3. Create new messages with incremented variantIndex
      // 4. Mark previous variants as inactive
      await streamMessage(messagesToKeep);
    },
    [rounds, messages, status, streamMessage],
  );

  // ✅ CLIENT-SIDE variant switching (no API calls - uses pre-loaded variant data)
  const handleRoundBranchChange = useCallback(
    (roundIndex: number, newVariantIndex: number) => {
      const round = rounds[roundIndex];
      if (!round)
        return;

      console.log('[Variant Switch] Starting branch change', {
        roundIndex,
        newVariantIndex,
        roundParticipants: round.participantMessages.length,
        roundParticipantIds: round.participantMessages.map((pm) => {
          const meta = getMessageMetadata(pm.metadata);
          return meta?.participantId;
        }),
      });

      // Update messages by swapping to the selected variant
      setMessages((prevMessages) => {
        console.log('[Variant Switch] Current messages before switch', {
          totalMessages: prevMessages.length,
          assistantMessages: prevMessages.filter(m => m.role === 'assistant').length,
          messageIds: prevMessages.map(m => m.id),
        });

        // ✅ STEP 1: Collect variant group IDs from the round's participant messages
        // These identify which variant groups we need to switch
        const variantGroupsToSwitch = new Set<string>();

        round.participantMessages.forEach((msg) => {
          const metadata = getMessageMetadata(msg.metadata);
          const variantGroupId = metadata?.variantGroupId;

          if (variantGroupId && typeof variantGroupId === 'string') {
            variantGroupsToSwitch.add(variantGroupId);
          }
        });

        console.log('[Variant Switch] Variant groups to switch', {
          variantGroups: Array.from(variantGroupsToSwitch),
        });

        // ✅ STEP 2: Build map of target variant messages to insert
        const targetVariants = new Map<string, UIMessage>(); // participantId -> target variant message

        round.participantMessages.forEach((msg) => {
          const metadata = getMessageMetadata(msg.metadata);
          const participantId = metadata?.participantId;

          if (!participantId)
            return;

          const variants = metadata?.variants || [];
          const targetVariant = variants.find(v => v.variantIndex === newVariantIndex);

          if (!targetVariant) {
            console.warn('[Variant Switch] Target variant not found', {
              participantId,
              requestedIndex: newVariantIndex,
              availableVariants: variants.length,
            });
            return;
          }

          console.log('[Variant Switch] Preparing target variant for participant', {
            participantId,
            targetVariantId: targetVariant.id,
            targetVariantIndex: newVariantIndex,
          });

          // Create the target variant message
          const switchedMessage: UIMessage = {
            id: targetVariant.id,
            role: 'assistant',
            parts: [
              { type: 'text', text: targetVariant.content },
              ...(targetVariant.reasoning ? [{ type: 'reasoning' as const, text: targetVariant.reasoning }] : []),
            ],
            metadata: {
              ...metadata,
              variants, // Preserve ALL variant data
              activeVariantIndex: newVariantIndex,
              currentVariantIndex: newVariantIndex,
              participantId,
            },
          };

          targetVariants.set(participantId, switchedMessage);
        });

        // ✅ STEP 3: Filter messages to remove ALL variants from this round
        // Then add back only the selected variants
        const filteredMessages = prevMessages.filter((msg) => {
          if (msg.role !== 'assistant')
            return true; // Keep all user messages

          const metadata = getMessageMetadata(msg.metadata);
          const participantId = metadata?.participantId;
          const variantGroupId = metadata?.variantGroupId;

          // If this message belongs to a variant group we're switching, filter it out
          // We'll add back the selected variant separately
          if (variantGroupId && typeof variantGroupId === 'string' && variantGroupsToSwitch.has(variantGroupId)) {
            console.log('[Variant Switch] Filtering out variant message', {
              messageId: msg.id,
              participantId,
              variantGroupId,
            });
            return false; // Remove this variant message
          }

          return true; // Keep messages not part of variant switching
        });

        // ✅ STEP 4: Insert target variants at the correct position
        // Find the position where the round starts and insert after the user message
        const userMessageIndex = prevMessages.findIndex(
          (m, idx) => idx === round.userMessageIndex,
        );

        if (userMessageIndex === -1) {
          console.error('[Variant Switch] Could not find user message for round', roundIndex);
          return prevMessages;
        }

        // Build the final message array
        const messagesBeforeRound = filteredMessages.slice(0, userMessageIndex + 1);
        const messagesAfterRound = filteredMessages.slice(userMessageIndex + 1);

        const targetVariantMessages = Array.from(targetVariants.values());

        console.log('[Variant Switch] Building final message array', {
          messagesBeforeRound: messagesBeforeRound.length,
          targetVariants: targetVariantMessages.length,
          messagesAfterRound: messagesAfterRound.length,
        });

        const updatedMessages = [
          ...messagesBeforeRound,
          ...targetVariantMessages,
          ...messagesAfterRound,
        ];

        console.log('[Variant Switch] Messages after switch', {
          totalMessages: updatedMessages.length,
          assistantMessages: updatedMessages.filter(m => m.role === 'assistant').length,
          messageIds: updatedMessages.map(m => m.id),
        });

        return updatedMessages;
      });
    },
    [rounds],
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
      <Conversation>
        <ConversationContent className="w-full max-w-full sm:max-w-3xl lg:max-w-4xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 pt-4 pb-4 space-y-4">
          {/* ✅ Timeline: Messages and grouped configuration changes sorted by time */}
          {timeline.map((item, _index) => {
            // Render grouped configuration changes
            if (item.type === 'changelog_group') {
              return (
                <ConfigurationChangesGroup
                  key={`changelog-group-${item.data.timestamp.getTime()}`}
                  group={item.data}
                />
              );
            }

            // Render message (existing logic)
            const message = item.data;
            const messageIndex = 'index' in item ? item.index : -1;
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
            // CRITICAL: Use stored model/role from participants array (NOT just metadata)
            // Look up participant to get model and role information
            const metadata = getMessageMetadata(message.metadata);

            // Get participantId from metadata (where chatMessageToUIMessage puts it)
            const participantId = metadata?.participantId;

            // Find the participant in the participants array
            const participant = participants.find(p => p.id === participantId);

            // Get model ID from participant (primary) or metadata (fallback)
            const storedModelId = participant?.modelId || metadata?.model;

            // Get role from participant
            const storedRole = participant?.role;

            // Calculate participant index (0-based position in enabled participants sorted by priority)
            const participantIndex = participant
              ? participants
                  .filter(p => p.isEnabled)
                  .sort((a, b) => a.priority - b.priority)
                  .findIndex(p => p.id === participant.id)
              : 0;

            // ✅ CRITICAL: Use stored modelId directly for avatar (independent of current participants)
            const avatarProps = getAvatarPropsFromModelId(
              message.role === 'system' ? 'assistant' : message.role,
              storedModelId,
              session?.user?.image,
              session?.user?.name,
            );

            // Use stored modelId from participant or metadata
            const model = storedModelId ? getModelById(storedModelId) : undefined;

            if (!model) {
              console.warn('[ChatThreadScreen] Skipping message - no model found:', {
                messageId: message.id,
                storedModelId,
                participantId,
                hasParticipant: !!participant,
                metadataModel: metadata?.model,
              });
              // Skip rendering messages without valid model reference
              // This can happen with deleted participants or invalid model IDs
              return null;
            }

            // ✅ Check for error using typed metadata (already declared above)
            // Type-safe error detection following AI SDK error handling pattern
            const hasError = metadata?.hasError === true || !!metadata?.error;
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

            // ✅ Check if this is the last message in a round
            const isLastInRound = messageIndex !== -1 && isLastMessageInRound(messageIndex, rounds);
            const roundForMessage = messageIndex !== -1 ? getRoundForMessage(messageIndex, rounds) : undefined;
            const roundIndex = roundForMessage ? rounds.indexOf(roundForMessage) : -1;
            const currentRound = rounds[roundIndex];

            // ✅ Check if this round has multiple variants (for branch navigation)
            const hasRoundVariants = currentRound && (currentRound.totalVariants ?? 0) > 1;

            return (
              <div key={message.id}>
                <ModelMessageCard
                  messageId={message.id}
                  model={model}
                  role={storedRole || ''} // ✅ Use stored role from metadata
                  participantIndex={participantIndex ?? 0}
                  status={messageStatus}
                  parts={filteredParts}
                  avatarSrc={avatarProps.src}
                  avatarName={avatarProps.name}
                />

                {/* ✅ Show round actions (regenerate + branch selector) after the last message in a round */}
                {isLastInRound && roundIndex !== -1 && status === 'ready' && (
                  <div className="flex items-center gap-3 mt-1 ml-12">
                    {/* Regenerate action */}
                    <Actions className="flex-shrink-0">
                      <Action
                        onClick={() => handleRegenerateRound(roundIndex)}
                        label={t('actions.regenerateRound')}
                      >
                        <RefreshCcwIcon className="size-3" />
                      </Action>
                    </Actions>

                    {/* Branch selector - only show if multiple variants exist */}
                    {hasRoundVariants && currentRound && (
                      <RoundBranchSelector
                        roundIndex={roundIndex}
                        activeBranchIndex={currentRound.activeVariantIndex ?? 0}
                        totalBranches={currentRound.totalVariants ?? 1}
                        onBranchChange={async (newBranchIndex) => {
                          await handleRoundBranchChange(roundIndex, newBranchIndex);
                        }}
                        from="assistant"
                        className="py-0"
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* ✅ Enhanced streaming loader with participant queue and thinking messages */}
          {status === 'streaming' && (
            <StreamingParticipantsLoader
              participants={selectedParticipants}
              currentParticipantIndex={streamingState.participantIndex}
            />
          )}
        </ConversationContent>
        <ConversationScrollButton aria-label={t('actions.scrollToBottom')} />
      </Conversation>

      {/* ✅ STICKY INPUT - Relative to dashboard content, not viewport - Glass design */}
      <div className="sticky bottom-0 left-0 right-0 z-10 mt-auto backdrop-blur-xl bg-background/10 border-t border-white/30">
        <div className="w-full max-w-full sm:max-w-3xl lg:max-w-4xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-4">
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
