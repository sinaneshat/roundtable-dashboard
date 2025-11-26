'use client';
import type { UIMessage } from 'ai';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { memo, useEffect, useMemo, useState } from 'react';
import { Streamdown } from 'streamdown';

import { MessagePartTypes, MessageRoles, UIMessageRoles } from '@/api/core/enums';
import type { ChatParticipant, StoredPreSearch } from '@/api/routes/chat/schema';
import type { EnhancedModelResponse } from '@/api/routes/models/schema';
import type { SubscriptionTier } from '@/api/services/product-logic.service';
import { canAccessModelByPricing, subscriptionTierSchema } from '@/api/services/product-logic.service';
import { ModelMessageCard } from '@/components/chat/model-message-card';
import { PreSearchCard } from '@/components/chat/pre-search-card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { isAssistantMessageMetadata } from '@/db/schemas/chat-metadata';
import { useUsageStatsQuery } from '@/hooks/queries/usage';
import { useAutoScroll, useModelLookup } from '@/hooks/utils';
import type { MessagePart, MessageStatus } from '@/lib/schemas/message-schemas';
import { extractColorFromImage } from '@/lib/ui';
import { cn } from '@/lib/ui/cn';
import { getAvatarPropsFromModelId } from '@/lib/utils/ai-display';
import { getMessageStatus } from '@/lib/utils/message-status';
import { getMessageMetadata } from '@/lib/utils/message-transforms';
import { getRoundNumber, getUserMetadata, isPreSearch as isPreSearchMessage } from '@/lib/utils/metadata';
import { getRoleBadgeStyle } from '@/lib/utils/role-colors';

const EMPTY_PARTICIPANTS: ChatParticipant[] = [];
const EMPTY_PRE_SEARCHES: StoredPreSearch[] = [];

// Type definitions for message groups
type ParticipantInfo = {
  participantIndex: number;
  modelId: string | undefined;
  role: string | null;
  isStreaming: boolean;
};

type MessageGroup
  = | {
    type: 'user-group';
    messages: Array<{ message: UIMessage; index: number }>;
    headerInfo: {
      avatarSrc: string;
      avatarName: string;
      displayName: string;
    };
  }
  | {
    type: 'assistant-group';
    participantKey: string;
    messages: Array<{
      message: UIMessage;
      index: number;
      participantInfo: ParticipantInfo;
    }>;
    headerInfo: {
      avatarSrc: string;
      avatarName: string;
      displayName: string;
      role: string | null;
      requiredTierName?: string;
      isAccessible: boolean;
    };
  };

/**
 * Assistant Group Component with Header
 * Displays assistant messages with header inside message box
 */
function AssistantGroupCard({
  group,
  groupIndex: _groupIndex,
  findModel,
  userTier,
  hideMetadata,
  t,
  keyForMessage,
}: {
  group: Extract<MessageGroup, { type: 'assistant-group' }>;
  groupIndex: number;
  findModel: (modelId?: string) => EnhancedModelResponse | undefined;
  userTier: SubscriptionTier;
  hideMetadata: boolean;
  t: (key: string) => string;
  keyForMessage: (message: UIMessage, index: number) => string;
}) {
  const [colorClass, setColorClass] = useState<string>('muted-foreground');

  // Determine if any message in group is streaming or has error
  const hasStreamingMessage = group.messages.some(({ participantInfo }) => participantInfo.isStreaming);
  const hasErrorMessage = group.messages.some(({ message }) => {
    const metadata = getMessageMetadata(message.metadata);
    const assistantMetadata = metadata && isAssistantMessageMetadata(metadata) ? metadata : null;
    return assistantMetadata?.hasError;
  });

  useEffect(() => {
    let mounted = true;
    extractColorFromImage(group.headerInfo.avatarSrc, false)
      .then((color: string) => {
        if (mounted) {
          setColorClass(color);
        }
      })
      .catch(() => {
        if (mounted) {
          setColorClass('muted-foreground');
        }
      });
    return () => {
      mounted = false;
    };
  }, [group.headerInfo.avatarSrc]);

  return (
    <div
      key={`assistant-group-${group.participantKey}-${group.messages[0]?.index}`}
      className="mb-4 flex justify-start"
    >
      <div className="w-full">
        {/* Header at top of message box */}
        <div className="flex items-center gap-3 mb-6">
          <Avatar className={cn(
            'size-8',
            `drop-shadow-[0_0_12px_hsl(var(--${colorClass})/0.3)]`,
          )}
          >
            <AvatarImage
              src={group.headerInfo.avatarSrc}
              alt={group.headerInfo.avatarName}
              className="object-contain p-0.5"
            />
            <AvatarFallback className="text-[8px] bg-muted">
              {group.headerInfo.avatarName?.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
            <span className="text-xl font-semibold text-muted-foreground">
              {group.headerInfo.displayName}
            </span>
            {group.headerInfo.role && (
              <span
                className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border"
                style={getRoleBadgeStyle(group.headerInfo.role)}
              >
                {String(group.headerInfo.role)}
              </span>
            )}
            {!group.headerInfo.isAccessible && group.headerInfo.requiredTierName && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-muted/50 text-muted-foreground border-border/50">
                {group.headerInfo.requiredTierName}
                {' '}
                required
              </span>
            )}
            {hasStreamingMessage && (
              <span className={cn('ml-1 size-1.5 rounded-full animate-pulse flex-shrink-0', `bg-${colorClass}`)} />
            )}
            {hasErrorMessage && (
              <span className="ml-1 size-1.5 rounded-full bg-destructive/80 flex-shrink-0" />
            )}
          </div>
        </div>
        {/* Message content */}
        <div className="space-y-2">
          {group.messages.map(({ message, index, participantInfo }) => {
            const messageKey = keyForMessage(message, index);
            const metadata = getMessageMetadata(message.metadata);
            const model = findModel(participantInfo.modelId);
            const isAccessible = model ? canAccessModelByPricing(userTier, model) : true;

            // ✅ DEFENSIVE CHECK: Log when parts structure is unexpected
            if (!message.parts || !Array.isArray(message.parts)) {
              console.error('[ChatMessageList] Message has invalid parts structure:', {
                messageId: message.id,
                role: message.role,
                participantIndex: participantInfo.participantIndex,
                parts: message.parts,
              });
            }

            // ✅ DEFENSIVE CHECK: Log when trying to access parts that might have undefined elements
            const safeParts = message.parts || [];
            if (safeParts.some(p => !p || typeof p !== 'object')) {
              console.error('[ChatMessageList] Message has undefined or invalid parts:', {
                messageId: message.id,
                role: message.role,
                participantIndex: participantInfo.participantIndex,
                parts: safeParts,
                invalidPartIndices: safeParts.map((p, idx) => (!p || typeof p !== 'object') ? idx : null).filter(idx => idx !== null),
              });
            }

            const hasTextContent = safeParts.some(p => p && p.type === MessagePartTypes.TEXT && p.text?.trim().length > 0);
            const hasToolCalls = safeParts.some(p => p && p.type === MessagePartTypes.TOOL_CALL);
            const hasAnyContent = hasTextContent || hasToolCalls;

            const messageStatus: MessageStatus = getMessageStatus({
              message,
              isStreaming: participantInfo.isStreaming,
              hasAnyContent,
            });
            const filteredParts = safeParts
              .filter(p =>
                p && (p.type === MessagePartTypes.TEXT
                  || p.type === MessagePartTypes.REASONING
                  || p.type === MessagePartTypes.TOOL_CALL
                  || p.type === MessagePartTypes.TOOL_RESULT),
              )
              .map(p => p as MessagePart);
            const sourceParts = safeParts.filter(p =>
              p && 'type' in p && (p.type === 'source-url' || p.type === 'source-document'),
            );

            return (
              <div key={messageKey}>
                <ModelMessageCard
                  messageId={message.id}
                  model={model}
                  role={participantInfo.role || ''}
                  participantIndex={participantInfo.participantIndex}
                  status={messageStatus}
                  parts={filteredParts}
                  avatarSrc={group.headerInfo.avatarSrc}
                  avatarName={group.headerInfo.avatarName}
                  metadata={hideMetadata ? null : (metadata ?? null)}
                  isAccessible={isAccessible}
                  hideInlineHeader={true}
                  hideAvatar={true}
                />
                {sourceParts.length > 0 && (
                  <div className="mt-2 ml-12 space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">{t('chat.sources.title')}</p>
                    <div className="space-y-1">
                      {sourceParts.map((sourcePart) => {
                        if ('type' in sourcePart && sourcePart.type === 'source-url' && 'url' in sourcePart) {
                          return (
                            <div key={`${message.id}-source-${sourcePart.url}`} className="text-xs">
                              <a
                                href={sourcePart.url as string}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline flex items-center gap-1"
                              >
                                <span>{('title' in sourcePart && sourcePart.title) || sourcePart.url}</span>
                                <svg
                                  className="w-3 h-3"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                                  />
                                </svg>
                              </a>
                            </div>
                          );
                        }
                        return null;
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * AI SDK v5 Pattern: Determine participant info from message metadata
 *
 * Messages flow through 3 states:
 * 1. Streaming (no metadata yet) - use current participant index
 * 2. Complete (has model metadata) - use saved metadata only
 * 3. Error (has error metadata) - use saved metadata or fallback
 *
 * CRITICAL: Messages are complete once they have metadata.model set by onFinish
 * The AI SDK adds metadata during onFinish callback, AFTER streaming completes.
 * We check for metadata.model to determine if a message has been finalized.
 */
function getParticipantInfoForMessage({
  message,
  messageIndex,
  totalMessages,
  isGlobalStreaming,
  currentParticipantIndex,
  participants,
  currentStreamingParticipant,
}: {
  message: UIMessage;
  messageIndex: number;
  totalMessages: number;
  isGlobalStreaming: boolean;
  currentParticipantIndex: number;
  participants: ChatParticipant[];
  currentStreamingParticipant: ChatParticipant | null;
}): {
  participantIndex: number;
  modelId: string | undefined;
  role: string | null;
  isStreaming: boolean;
} {
  const metadata = getMessageMetadata(message.metadata);

  // ✅ STRICT TYPING: Use type guard to access assistant-specific fields
  const assistantMetadata = metadata && isAssistantMessageMetadata(metadata) ? metadata : null;

  // AI SDK v5 Pattern: A message is complete once it has model metadata
  // The onFinish callback in useMultiParticipantChat adds metadata.model via mergeParticipantMetadata
  // This happens AFTER streaming completes and BEFORE the next participant starts (via flushSync)
  const isComplete = !!assistantMetadata?.model;

  if (isComplete && assistantMetadata) {
    // ✅ CRITICAL FIX: Use saved metadata for completed messages
    // Once a message has metadata.model, it should NEVER revert to streaming state
    // This prevents the first participant's message from "disappearing" when the second starts
    return {
      participantIndex: assistantMetadata.participantIndex,
      modelId: assistantMetadata.model,
      role: assistantMetadata.participantRole,
      isStreaming: false,
    };
  }

  // AI SDK v5 Pattern: Only messages WITHOUT metadata.model can be streaming
  // This means the message is currently being generated by the AI SDK
  const isLastMessage = messageIndex === totalMessages - 1;
  const isThisMessageStreaming = !isComplete && isGlobalStreaming && isLastMessage && message.role === MessageRoles.ASSISTANT;

  if (isThisMessageStreaming) {
    // Use current participant for actively streaming message
    const participant = participants[currentParticipantIndex] || currentStreamingParticipant;
    return {
      participantIndex: currentParticipantIndex,
      modelId: participant?.modelId || assistantMetadata?.model,
      role: participant?.role || assistantMetadata?.participantRole || null,
      isStreaming: true,
    };
  }

  // Fallback for messages that haven't finished yet but aren't actively streaming
  // This can happen briefly during state transitions
  const fallbackParticipantIndex = assistantMetadata?.participantIndex ?? currentParticipantIndex;
  const fallbackParticipant = participants[fallbackParticipantIndex];

  return {
    participantIndex: fallbackParticipantIndex,
    modelId: assistantMetadata?.model || fallbackParticipant?.modelId,
    role: assistantMetadata?.participantRole || fallbackParticipant?.role || null,
    isStreaming: false,
  };
}

type ChatMessageListProps = {
  messages: UIMessage[];
  user?: {
    name: string;
    image: string | null;
  } | null;
  participants?: ChatParticipant[];
  hideMetadata?: boolean;
  isLoading?: boolean;
  isStreaming?: boolean;
  currentStreamingParticipant?: ChatParticipant | null;
  currentParticipantIndex?: number;
  userAvatar?: { src: string; name: string };
  threadId?: string | null; // Optional threadId for pre-search hydration
  preSearches?: StoredPreSearch[]; // Pre-searches from store
  streamingRoundNumber?: number | null; // Pass through from ThreadTimeline
  demoPreSearchOpen?: boolean; // Demo mode controlled accordion state
};
export const ChatMessageList = memo(
  ({
    messages,
    user = null,
    participants = EMPTY_PARTICIPANTS,
    hideMetadata = false,
    isLoading: _isLoading = false,
    isStreaming = false,
    currentStreamingParticipant = null,
    currentParticipantIndex = 0,
    userAvatar,
    threadId: _threadId,
    preSearches: _preSearches = EMPTY_PRE_SEARCHES,
    streamingRoundNumber: _streamingRoundNumber = null,
    demoPreSearchOpen,
  }: ChatMessageListProps) => {
    const t = useTranslations();
    // Consolidated model lookup hook
    const { findModel } = useModelLookup();
    const { data: usageData } = useUsageStatsQuery();
    // ✅ TYPE-SAFE: Use Zod validation instead of type casting
    const tierResult = subscriptionTierSchema.safeParse(usageData?.data?.subscription?.tier);
    const userTier: SubscriptionTier = tierResult.success ? tierResult.data : 'free';
    const userInfo = useMemo(() => user || { name: 'User', image: null }, [user]);
    const userAvatarSrc = userAvatar?.src || userInfo.image || '';
    const userAvatarName = userAvatar?.name || userInfo.name;

    // ✅ AI SDK ELEMENTS PATTERN: Auto-scroll during streaming to keep messages in view
    const bottomRef = useAutoScroll(isStreaming);

    // ✅ DEDUPLICATION: Prevent duplicate message IDs and filter participant trigger messages
    // Note: Component supports grouping multiple consecutive user messages for UI flexibility
    const deduplicatedMessages = useMemo(() => {
      const seenMessageIds = new Set<string>(); // Track message IDs to prevent actual duplicates
      const result: UIMessage[] = [];

      for (const message of messages) {
        // Skip if we've already processed this exact message ID (prevents duplicates)
        if (seenMessageIds.has(message.id)) {
          continue;
        }

        // For user messages, filter out participant trigger messages
        if (message.role === MessageRoles.USER) {
          const userMeta = getUserMetadata(message.metadata);

          // ✅ TYPE-SAFE: Check isParticipantTrigger using validated metadata schema
          const isParticipantTrigger = userMeta?.isParticipantTrigger === true;

          // Skip participant trigger duplicates completely
          if (isParticipantTrigger) {
            continue;
          }

          // Add all non-trigger user messages (allow multiple in same round for grouping)
          seenMessageIds.add(message.id);
          result.push(message);
        } else {
          // For assistant/system messages, keep all (participants can have multiple messages)
          seenMessageIds.add(message.id);
          result.push(message);
        }
      }

      return result;
    }, [messages]);

    // Create safe React keys even with potential duplicate IDs
    const seenIds = new Set<string>();
    const keyForMessage = (message: UIMessage, index: number): string => {
      if (seenIds.has(message.id)) {
      // Fallback key for duplicate IDs
        return `${message.id}-${index}`;
      }
      seenIds.add(message.id);
      return message.id;
    };

    // Memoize participant info per message to prevent recalculation on every render
    // This is critical because getParticipantInfoForMessage is expensive and runs for ALL messages
    //
    // ✅ CRITICAL FIX: Only recalculate when messages actually change, not when participants change
    // Completed messages have frozen metadata and should NEVER be affected by current participant state
    const messagesWithParticipantInfo = useMemo(() => {
      return deduplicatedMessages.map((message, index) => {
        if (message.role === MessageRoles.USER) {
          return { message, index, participantInfo: null };
        }

        const metadata = getMessageMetadata(message.metadata);
        // ✅ STRICT TYPING: Use type guard to access assistant-specific fields
        const assistantMetadata = metadata && isAssistantMessageMetadata(metadata) ? metadata : null;
        const isComplete = !!assistantMetadata?.model;

        // ✅ For completed messages, return frozen metadata immediately without dependencies
        // This prevents re-rendering with wrong participant info when participants change
        if (isComplete && assistantMetadata) {
          return {
            message,
            index,
            participantInfo: {
              participantIndex: assistantMetadata.participantIndex,
              modelId: assistantMetadata.model,
              role: assistantMetadata.participantRole,
              isStreaming: false,
            },
          };
        }

        // Only for streaming messages, calculate participant info from current state
        const participantInfo = getParticipantInfoForMessage({
          message,
          messageIndex: index,
          totalMessages: deduplicatedMessages.length,
          isGlobalStreaming: isStreaming,
          currentParticipantIndex,
          participants,
          currentStreamingParticipant,
        });

        return { message, index, participantInfo };
      });
    }, [deduplicatedMessages, isStreaming, currentParticipantIndex, participants, currentStreamingParticipant]);

    // Group consecutive messages by participant for sticky headers
    const messageGroups = useMemo((): MessageGroup[] => {
      const groups: MessageGroup[] = [];
      let currentAssistantGroup: Extract<MessageGroup, { type: 'assistant-group' }> | null = null;
      let currentUserGroup: Extract<MessageGroup, { type: 'user-group' }> | null = null;

      for (const { message, index, participantInfo } of messagesWithParticipantInfo) {
        // ✅ DEDUPLICATION FIX: Skip pre-search messages entirely
        // Pre-searches are rendered in ThreadTimeline based on preSearches store array
        // to avoid duplicate rendering
        const isPreSearch = isPreSearchMessage(message.metadata);
        if (isPreSearch) {
          continue;
        }

        if (message.role === MessageRoles.USER) {
          // Close any open assistant group
          if (currentAssistantGroup) {
            groups.push(currentAssistantGroup);
            currentAssistantGroup = null;
          }

          // Group consecutive user messages with shared header
          if (!currentUserGroup) {
            currentUserGroup = {
              type: 'user-group',
              messages: [{ message, index }],
              headerInfo: {
                avatarSrc: userAvatarSrc,
                avatarName: userAvatarName,
                displayName: userAvatarName,
              },
            };
          } else {
            // Add to existing user group
            currentUserGroup.messages.push({ message, index });
          }
          continue;
        }

        // Assistant message
        if (!participantInfo) {
          continue;
        }

        // Close any open user group
        if (currentUserGroup) {
          groups.push(currentUserGroup);
          currentUserGroup = null;
        }

        const metadata = getMessageMetadata(message.metadata);
        const avatarProps = getAvatarPropsFromModelId(
          message.role === UIMessageRoles.SYSTEM ? MessageRoles.ASSISTANT : message.role,
          participantInfo.modelId,
          userInfo.image,
          userInfo.name,
        );
        const model = findModel(participantInfo.modelId);
        const isAccessible = model ? canAccessModelByPricing(userTier, model) : true;

        const assistantMetadata = metadata && isAssistantMessageMetadata(metadata) ? metadata : null;
        const displayName = model?.name || assistantMetadata?.model || 'AI Assistant';
        const requiredTierName = model?.required_tier_name;

        // Create participant key for grouping
        const participantKey = `${participantInfo.participantIndex}-${participantInfo.modelId || 'unknown'}`;

        if (
          currentAssistantGroup
          && currentAssistantGroup.participantKey === participantKey
        ) {
          // Same participant, add to current group
          currentAssistantGroup.messages.push({
            message,
            index,
            participantInfo,
          });
        } else {
          // Different participant or first assistant message
          if (currentAssistantGroup) {
            groups.push(currentAssistantGroup);
          }

          currentAssistantGroup = {
            type: 'assistant-group',
            participantKey,
            messages: [{ message, index, participantInfo }],
            headerInfo: {
              avatarSrc: avatarProps.src,
              avatarName: avatarProps.name,
              displayName,
              role: participantInfo.role,
              requiredTierName,
              isAccessible,
            },
          };
        }
      }

      // Push any remaining groups
      if (currentUserGroup) {
        groups.push(currentUserGroup);
      }
      if (currentAssistantGroup) {
        groups.push(currentAssistantGroup);
      }

      return groups;
    }, [messagesWithParticipantInfo, findModel, userTier, userInfo, userAvatarSrc, userAvatarName]);

    // Group messages by round for pre-search injection
    const messageGroupsByRound = new Map<number, MessageGroup[]>();
    messageGroups.forEach((group) => {
      const roundNumber = group.type === 'user-group'
        ? getRoundNumber(group.messages[0]?.message.metadata) ?? 0
        : group.type === 'assistant-group'
          ? getRoundNumber(group.messages[0]?.message.metadata) ?? 0
          : 0;

      if (!messageGroupsByRound.has(roundNumber)) {
        messageGroupsByRound.set(roundNumber, []);
      }
      messageGroupsByRound.get(roundNumber)!.push(group);
    });

    return (
      <div className="touch-pan-y">
        {messageGroups.map((group, groupIndex) => {
          const roundNumber = group.type === 'user-group'
            ? getRoundNumber(group.messages[0]?.message.metadata) ?? 0
            : group.type === 'assistant-group'
              ? getRoundNumber(group.messages[0]?.message.metadata) ?? 0
              : 0;

          // Check if this is the user message group for this round
          const isUserGroupForRound = group.type === 'user-group';
          const preSearch = isUserGroupForRound && _threadId
            ? _preSearches.find(ps => ps.roundNumber === roundNumber)
            : null;

          // User message group with header inside message box
          if (group.type === 'user-group') {
            return (
              <div key={`user-group-wrapper-${group.messages[0]?.index}`}>
                <div
                  key={`user-group-${group.messages[0]?.index}`}
                  className="mb-4 flex justify-end"
                >
                  <div className="w-full">
                    {/* Header at top of message box */}
                    <div className="flex items-center gap-3 mb-6 flex-row-reverse">
                      <div className="relative flex-shrink-0 drop-shadow-[0_0_12px_hsl(var(--white)/0.3)]">
                        <Avatar className="size-8">
                          <AvatarImage alt="" className="mt-0 mb-0" src={group.headerInfo.avatarSrc} />
                          <AvatarFallback>{group.headerInfo.avatarName?.slice(0, 2) || 'ME'}</AvatarFallback>
                        </Avatar>
                      </div>
                      <span className="text-xl font-semibold text-muted-foreground">
                        {group.headerInfo.displayName}
                      </span>
                    </div>
                    {/* Message content */}
                    <div className="space-y-3">
                      {group.messages.map(({ message, index }) => {
                        const messageKey = keyForMessage(message, index);
                        return (
                          <div key={messageKey} className="text-foreground text-sm leading-relaxed whitespace-pre-wrap">
                            {message.parts.map((part) => {
                              if (part.type === MessagePartTypes.TEXT) {
                                return (
                                  <Streamdown
                                    key={`${message.id}-text-${part.text.substring(0, 20)}`}
                                    className="size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
                                  >
                                    {part.text}
                                  </Streamdown>
                                );
                              }
                              if (part.type === 'file' && part.mediaType?.startsWith('image/')) {
                                return (
                                  <div key={`${message.id}-image-${part.url}`} className="my-2 relative max-w-full max-h-[400px]">
                                    <Image
                                      src={part.url}
                                      alt={part.filename || 'Attachment'}
                                      className="rounded-lg border border-border object-contain"
                                      width={800}
                                      height={400}
                                      style={{ maxWidth: '100%', height: 'auto' }}
                                      unoptimized
                                    />
                                    {part.filename && (
                                      <p className="mt-1 text-xs text-muted-foreground">{part.filename}</p>
                                    )}
                                  </div>
                                );
                              }
                              if (part.type === 'file') {
                                return (
                                  <div key={`${message.id}-file-${part.filename || part.url}`} className="my-2 p-3 border border-border rounded-lg">
                                    <div className="flex items-center gap-2">
                                      <div className="flex-1">
                                        <p className="text-sm font-medium">{part.filename || 'File'}</p>
                                        {part.mediaType && (
                                          <p className="text-xs text-muted-foreground">{part.mediaType}</p>
                                        )}
                                      </div>
                                      <a
                                        href={part.url}
                                        download={part.filename}
                                        className="text-xs text-primary hover:underline"
                                      >
                                        {t('actions.download')}
                                      </a>
                                    </div>
                                  </div>
                                );
                              }
                              return null;
                            })}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* CRITICAL FIX: Render PreSearchCard immediately after user message, before assistant messages */}
                {preSearch && (
                  <PreSearchCard
                    key={`pre-search-${roundNumber}`}
                    threadId={_threadId!}
                    preSearch={preSearch}
                    isLatest={roundNumber === (() => {
                      const lastGroup = messageGroups[messageGroups.length - 1];
                      if (!lastGroup)
                        return 0;
                      return lastGroup.type === 'user-group'
                        ? getRoundNumber(lastGroup.messages[0]?.message.metadata) ?? 0
                        : lastGroup.type === 'assistant-group'
                          ? getRoundNumber(lastGroup.messages[0]?.message.metadata) ?? 0
                          : 0;
                    })()}
                    streamingRoundNumber={_streamingRoundNumber}
                    demoOpen={demoPreSearchOpen}
                    demoShowContent={demoPreSearchOpen ? preSearch.searchData !== undefined : undefined}
                  />
                )}
              </div>
            );
          }

          // Assistant group with header inside message box
          if (group.type === 'assistant-group') {
            return (
              <AssistantGroupCard
                key={`assistant-group-${group.participantKey}-${group.messages[0]?.index}`}
                group={group}
                groupIndex={groupIndex}
                findModel={findModel}
                userTier={userTier}
                hideMetadata={hideMetadata}
                t={t}
                keyForMessage={keyForMessage}
              />
            );
          }

          return null;
        })}
        {/* ✅ AI SDK ELEMENTS PATTERN: Scroll anchor for auto-scroll during streaming */}
        <div ref={bottomRef} />
      </div>
    );
  },
  // Custom comparison function to optimize re-renders
  // Only re-render if critical props actually change
  (prevProps, nextProps) => {
    // Always re-render if streaming state changes
    if (prevProps.isStreaming !== nextProps.isStreaming) {
      return false;
    }

    // Always re-render if messages array reference changes OR content changes
    if (
      prevProps.messages !== nextProps.messages
      || prevProps.messages.length !== nextProps.messages.length
    ) {
      return false;
    }

    // Only re-render if currentParticipantIndex changes AND we're currently streaming
    // If not streaming, completed messages don't care about currentParticipantIndex
    if (
      prevProps.currentParticipantIndex !== nextProps.currentParticipantIndex
      && nextProps.isStreaming
    ) {
      return false;
    }

    // Re-render if participants reference changes (shouldn't happen often)
    if (prevProps.participants !== nextProps.participants) {
      return false;
    }

    // Re-render if currentStreamingParticipant changes AND we're streaming
    if (
      prevProps.currentStreamingParticipant !== nextProps.currentStreamingParticipant
      && nextProps.isStreaming
    ) {
      return false;
    }

    // Skip re-render - no meaningful changes
    return true;
  },
);
