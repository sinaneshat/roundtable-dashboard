'use client';
import type { UIMessage } from 'ai';
import { useTranslations } from 'next-intl';
import { memo, useEffect, useMemo, useState } from 'react';
import { Streamdown } from 'streamdown';

import { AnalysisStatuses, MessagePartTypes, MessageRoles, MessageStatuses, UIMessageRoles } from '@/api/core/enums';
import type { ChatParticipant, StoredPreSearch } from '@/api/routes/chat/schema';
import type { EnhancedModelResponse } from '@/api/routes/models/schema';
import type { SubscriptionTier } from '@/api/services/product-logic.service';
import { canAccessModelByPricing, subscriptionTierSchema } from '@/api/services/product-logic.service';
import type { MessageAttachment } from '@/components/chat/message-attachment-preview';
import { MessageAttachmentPreview } from '@/components/chat/message-attachment-preview';
import { ModelMessageCard } from '@/components/chat/model-message-card';
import { PreSearchCard } from '@/components/chat/pre-search-card';
import { streamdownComponents } from '@/components/markdown/streamdown-components';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { DbMessageMetadata } from '@/db/schemas/chat-metadata';
import { isAssistantMessageMetadata } from '@/db/schemas/chat-metadata';
import { useUsageStatsQuery } from '@/hooks/queries/usage';
import { useModelLookup } from '@/hooks/utils';
import type { FilePart, MessagePart, MessageStatus } from '@/lib/schemas/message-schemas';
import { isFilePart } from '@/lib/schemas/message-schemas';
import { extractColorFromImage } from '@/lib/ui';
import { cn } from '@/lib/ui/cn';
import { getAvatarPropsFromModelId } from '@/lib/utils/ai-display';
import { getMessageStatus } from '@/lib/utils/message-status';
import { getMessageMetadata, getRoundNumber, getUserMetadata, isPreSearch as isPreSearchMessage } from '@/lib/utils/metadata';
import { sortByPriority } from '@/lib/utils/participant';
import {
  allParticipantsHaveVisibleContent,
  buildParticipantMessageMaps,
  getParticipantMessageFromMaps,
  participantHasVisibleContent,
} from '@/lib/utils/participant-message-lookup';
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

// ============================================================================
// Reusable Participant Header Component
// ============================================================================

type ParticipantHeaderProps = {
  avatarSrc: string;
  avatarName: string;
  displayName: string;
  role?: string | null;
  requiredTierName?: string;
  isAccessible?: boolean;
  isStreaming?: boolean;
  hasError?: boolean;
};

/**
 * Reusable header component for participant messages
 * Shows avatar, name, role badge, tier requirement, and status indicators
 */
function ParticipantHeader({
  avatarSrc,
  avatarName,
  displayName,
  role,
  requiredTierName,
  isAccessible = true,
  isStreaming = false,
  hasError = false,
}: ParticipantHeaderProps) {
  const [colorClass, setColorClass] = useState<string>('muted-foreground');

  useEffect(() => {
    let mounted = true;
    extractColorFromImage(avatarSrc, false)
      .then((color: string) => {
        if (mounted)
          setColorClass(color);
      })
      .catch(() => {
        if (mounted)
          setColorClass('muted-foreground');
      });
    return () => {
      mounted = false;
    };
  }, [avatarSrc]);

  return (
    <div className="flex items-center gap-3 mb-6">
      <Avatar className={cn('size-8', `drop-shadow-[0_0_12px_hsl(var(--${colorClass})/0.3)]`)}>
        <AvatarImage src={avatarSrc} alt={avatarName} className="object-contain p-0.5" />
        <AvatarFallback className="text-[8px] bg-muted">
          {avatarName?.slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
        <span className="text-xl font-semibold text-muted-foreground">{displayName}</span>
        {role && (
          <span
            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border"
            style={getRoleBadgeStyle(role)}
          >
            {String(role)}
          </span>
        )}
        {!isAccessible && requiredTierName && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-muted/50 text-muted-foreground border-border/50">
            {requiredTierName}
            {' '}
            required
          </span>
        )}
        {isStreaming && (
          <span className="ml-1 size-1.5 rounded-full bg-primary/60 animate-pulse flex-shrink-0" />
        )}
        {hasError && (
          <span className="ml-1 size-1.5 rounded-full bg-destructive/80 flex-shrink-0" />
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Reusable Participant Message Wrapper
// ============================================================================

type ParticipantMessageWrapperProps = {
  participant: ChatParticipant;
  participantIndex: number;
  model: EnhancedModelResponse | undefined;
  status: MessageStatus;
  parts: MessagePart[];
  isAccessible: boolean;
  messageId?: string;
  metadata?: DbMessageMetadata | null;
  /** Custom loading text for pending state */
  loadingText?: string;
};

/**
 * Reusable wrapper that renders a participant message with consistent header
 * Used by both AssistantGroupCard (for completed messages) and pending cards (for streaming)
 */
function ParticipantMessageWrapper({
  participant,
  participantIndex,
  model,
  status,
  parts,
  isAccessible,
  messageId,
  metadata,
  loadingText,
}: ParticipantMessageWrapperProps) {
  const avatarProps = getAvatarPropsFromModelId(
    MessageRoles.ASSISTANT,
    participant.modelId,
    null,
    'AI',
  );
  const displayName = model?.name || participant.modelId || 'AI Assistant';
  const isStreaming = status === MessageStatuses.STREAMING || status === MessageStatuses.PENDING;
  const assistantMetadata = metadata && isAssistantMessageMetadata(metadata) ? metadata : null;
  const hasError = status === MessageStatuses.FAILED || assistantMetadata?.hasError;

  return (
    <div className="flex justify-start">
      <div className="w-full">
        <ParticipantHeader
          avatarSrc={avatarProps.src}
          avatarName={avatarProps.name}
          displayName={displayName}
          role={participant.role}
          requiredTierName={model?.required_tier_name}
          isAccessible={isAccessible}
          isStreaming={isStreaming}
          hasError={!!hasError}
        />
        <ModelMessageCard
          messageId={messageId}
          model={model}
          role={participant.role}
          participantIndex={participantIndex}
          status={status}
          parts={parts}
          avatarSrc={avatarProps.src}
          avatarName={avatarProps.name}
          metadata={metadata}
          isAccessible={isAccessible}
          hideInlineHeader
          hideAvatar
          loadingText={loadingText}
        />
      </div>
    </div>
  );
}

// ============================================================================
// Assistant Group Card Component
// ============================================================================

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
  // Determine if any message in group is streaming or has error
  const hasStreamingMessage = group.messages.some(({ participantInfo }) => participantInfo.isStreaming);
  const hasErrorMessage = group.messages.some(({ message }) => {
    const metadata = getMessageMetadata(message.metadata);
    const assistantMetadata = metadata && isAssistantMessageMetadata(metadata) ? metadata : null;
    return assistantMetadata?.hasError;
  });

  return (
    <div
      key={`assistant-group-${group.participantKey}-${group.messages[0]?.index}`}
      className="flex justify-start"
    >
      <div className="w-full">
        <ParticipantHeader
          avatarSrc={group.headerInfo.avatarSrc}
          avatarName={group.headerInfo.avatarName}
          displayName={group.headerInfo.displayName}
          role={group.headerInfo.role}
          requiredTierName={group.headerInfo.requiredTierName}
          isAccessible={group.headerInfo.isAccessible}
          isStreaming={hasStreamingMessage}
          hasError={hasErrorMessage}
        />
        {/* Message content */}
        <div className="space-y-4">
          {group.messages.map(({ message, index, participantInfo }) => {
            const messageKey = keyForMessage(message, index);
            const metadata = getMessageMetadata(message.metadata);
            const model = findModel(participantInfo.modelId);
            const isAccessible = model ? canAccessModelByPricing(userTier, model) : true;

            const safeParts = message.parts || [];
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
                  hideInlineHeader
                  hideAvatar
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
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

  // ✅ SIMPLIFIED: Check for visible content to determine if message has received data
  const hasVisibleContent = message.parts?.some(
    p =>
      (p.type === MessagePartTypes.TEXT && 'text' in p && (p.text as string)?.trim().length > 0)
      || p.type === MessagePartTypes.TOOL_CALL
      || p.type === MessagePartTypes.REASONING,
  ) ?? false;

  // ✅ CRITICAL FIX: Messages with visible content should show content, not shimmer
  // Even if model metadata hasn't arrived yet, the content is already there to display.
  // This ensures the shimmer is replaced with actual text as soon as it arrives.
  if (hasVisibleContent) {
    // ✅ REFACTOR: Use sortByPriority (single source of truth for priority sorting)
    const sortedParticipants = sortByPriority(participants);
    const fallbackParticipant = sortedParticipants[currentParticipantIndex];
    return {
      participantIndex: assistantMetadata?.participantIndex ?? currentParticipantIndex,
      modelId: assistantMetadata?.model || fallbackParticipant?.modelId,
      role: assistantMetadata?.participantRole || fallbackParticipant?.role || null,
      isStreaming: false, // Has content = not showing shimmer
    };
  }

  // AI SDK v5 Pattern: Only messages WITHOUT visible content can be considered streaming
  // This means the message is still waiting for actual text from the AI
  const isLastMessage = messageIndex === totalMessages - 1;
  const isThisMessageStreaming = !hasVisibleContent && isGlobalStreaming && isLastMessage && message.role === MessageRoles.ASSISTANT;

  if (isThisMessageStreaming) {
    // ✅ CRITICAL FIX: Sort participants by priority before indexing
    // currentParticipantIndex is based on priority-sorted array in use-multi-participant-chat.ts
    // ✅ REFACTOR: Use sortByPriority (single source of truth for priority sorting)
    const sortedParticipants = sortByPriority(participants);
    const participant = sortedParticipants[currentParticipantIndex] || currentStreamingParticipant;
    return {
      participantIndex: currentParticipantIndex,
      modelId: participant?.modelId || assistantMetadata?.model,
      role: participant?.role || assistantMetadata?.participantRole || null,
      isStreaming: true,
    };
  }

  // Fallback for messages that haven't finished yet but aren't actively streaming
  // This can happen briefly during state transitions
  // ✅ REFACTOR: Use sortByPriority (single source of truth for priority sorting)
  const sortedParticipants = sortByPriority(participants);
  const fallbackParticipantIndex = assistantMetadata?.participantIndex ?? currentParticipantIndex;
  const fallbackParticipant = sortedParticipants[fallbackParticipantIndex];

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
    const tParticipant = useTranslations('chat.participant');
    // Consolidated model lookup hook
    const { findModel } = useModelLookup();
    const { data: usageData } = useUsageStatsQuery();
    // ✅ TYPE-SAFE: Use Zod validation instead of type casting
    const tierResult = subscriptionTierSchema.safeParse(usageData?.data?.subscription?.tier);
    const userTier: SubscriptionTier = tierResult.success ? tierResult.data : 'free';
    const userInfo = useMemo(() => user || { name: 'User', image: null }, [user]);
    const userAvatarSrc = userAvatar?.src || userInfo.image || '';
    const userAvatarName = userAvatar?.name || userInfo.name;

    // ✅ SCROLL MANAGEMENT: Handled by useChatScroll in parent (ChatThreadScreen)
    // Removed redundant useAutoScroll to prevent dual scroll systems fighting
    // when changelogs cause virtualization remeasurement

    // ✅ DEDUPLICATION: Prevent duplicate message IDs and filter participant trigger messages
    // Note: Component supports grouping multiple consecutive user messages for UI flexibility
    // ✅ CRITICAL FIX: Also deduplicate assistant messages by (roundNumber, participantIndex/modelId)
    // On page refresh with resumed streams, we may have:
    // 1. DB message with deterministic ID: thread_r1_p0
    // 2. AI SDK resumed message with temp ID: gen-abc123
    // Both represent the same participant response and should be deduplicated
    const deduplicatedMessages = useMemo(() => {
      const seenMessageIds = new Set<string>(); // Track message IDs to prevent actual duplicates
      // ✅ NEW: Track assistant messages by roundNumber+participantIndex to prevent duplicate rendering
      const seenAssistantMessages = new Set<string>();
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
          // For assistant messages, deduplicate by (roundNumber, participantIndex OR modelId)
          // This handles the case where resumed streams create messages with different IDs
          const meta = getMessageMetadata(message.metadata);
          const assistantMeta = meta && isAssistantMessageMetadata(meta) ? meta : null;

          if (assistantMeta) {
            const roundNum = assistantMeta.roundNumber;
            const participantIdx = assistantMeta.participantIndex;
            const participantId = assistantMeta.participantId;
            const modelId = assistantMeta.model;

            // Create a unique key for this participant's response in this round
            // Try participantId first (most reliable), then participantIndex, then modelId
            let dedupeKey: string | null = null;
            if (roundNum !== undefined && roundNum !== null) {
              if (participantId) {
                dedupeKey = `r${roundNum}_pid${participantId}`;
              } else if (participantIdx !== undefined && participantIdx !== null) {
                dedupeKey = `r${roundNum}_p${participantIdx}`;
              } else if (modelId) {
                dedupeKey = `r${roundNum}_m${modelId}`;
              }
            }

            // Skip if we've already seen a message for this participant in this round
            if (dedupeKey && seenAssistantMessages.has(dedupeKey)) {
              // ✅ PREFER: Keep the message with the deterministic ID (contains _r{N}_p{M})
              // and skip the temp ID message (gen-xxxxx)
              const isDeterministicId = message.id.includes('_r') && message.id.includes('_p');
              if (!isDeterministicId) {
                // This is a temp ID message, skip it in favor of the DB message
                continue;
              }
              // This is a deterministic ID message - find and replace the temp ID message
              const existingTempIdx = result.findIndex((m) => {
                const mMeta = getMessageMetadata(m.metadata);
                const mAssistantMeta = mMeta && isAssistantMessageMetadata(mMeta) ? mMeta : null;
                if (!mAssistantMeta)
                  return false;
                const mRound = mAssistantMeta.roundNumber;
                const mPid = mAssistantMeta.participantId;
                const mIdx = mAssistantMeta.participantIndex;
                const mModel = mAssistantMeta.model;
                // Check if it's the same participant in the same round
                return mRound === roundNum
                  && ((participantId && mPid === participantId)
                    || (participantIdx !== undefined && mIdx === participantIdx)
                    || (modelId && mModel === modelId));
              });
              if (existingTempIdx !== -1) {
                // Replace temp ID message with deterministic ID message
                result[existingTempIdx] = message;
                seenMessageIds.add(message.id);
                continue;
              }
            }

            if (dedupeKey) {
              seenAssistantMessages.add(dedupeKey);
            }
          }

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

    // ✅ CRITICAL FIX: Pre-calculate if all participants have content for the streaming round
    // This is needed to decide whether to skip messages from messageGroups or render them there
    // When all participants have content, we should NOT skip messages (render in messageGroups)
    // When not all have content, we SHOULD skip messages (render in pending cards section)
    const allStreamingRoundParticipantsHaveContent = useMemo(() => {
      if (!isStreaming || _streamingRoundNumber === null || participants.length === 0) {
        return false;
      }

      // Get assistant messages for the streaming round
      const streamingRoundMessages = deduplicatedMessages.filter((m) => {
        if (m.role === MessageRoles.USER)
          return false;
        const roundNum = getRoundNumber(m.metadata);
        return roundNum === _streamingRoundNumber;
      });

      // ✅ Use reusable utility for multi-strategy participant message lookup
      const participantMaps = buildParticipantMessageMaps(streamingRoundMessages);
      // ✅ CRITICAL FIX: Filter by isEnabled BEFORE sorting
      // Only check enabled participants for content completeness
      const enabledParticipants = participants.filter(p => p.isEnabled);
      const sortedParticipants = sortByPriority(enabledParticipants);

      return allParticipantsHaveVisibleContent(participantMaps, sortedParticipants);
    }, [deduplicatedMessages, isStreaming, _streamingRoundNumber, participants]);

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

        // ✅ CRITICAL FIX: Skip ALL assistant messages for the CURRENT streaming round
        // These should be rendered in the pending cards section to maintain stable positioning.
        // The pending cards section renders ALL participants in priority order, replacing shimmer
        // with actual content as it arrives. This prevents completed messages from appearing
        // at the bottom (after pending cards) instead of in their priority position.
        //
        // EXCEPTION: When ALL participants have content, DON'T skip - render in messageGroups
        // This prevents messages from disappearing when all complete but isStreaming is still true
        const messageMetadata = getMessageMetadata(message.metadata);
        const messageRoundNumber = getRoundNumber(messageMetadata);
        const isCurrentStreamingRound = messageRoundNumber === _streamingRoundNumber;

        // ✅ FIX: Skip messages for streaming round when pending cards will handle them
        // Removed `isStreaming` requirement - during resumption, isStreaming can be false
        // but isCurrentStreamingRound is true (streamingRoundNumber is set from local calculation)
        if (isCurrentStreamingRound && !allStreamingRoundParticipantsHaveContent) {
          continue; // Let pending cards section handle ALL participants for streaming round
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
    }, [messagesWithParticipantInfo, findModel, userTier, userInfo, userAvatarSrc, userAvatarName, allStreamingRoundParticipantsHaveContent, _streamingRoundNumber]);

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
      <div className="touch-pan-y space-y-8">
        {messageGroups.map((group, groupIndex) => {
          const roundNumber = group.type === 'user-group'
            ? getRoundNumber(group.messages[0]?.message.metadata) ?? 0
            : group.type === 'assistant-group'
              ? getRoundNumber(group.messages[0]?.message.metadata) ?? 0
              : 0;

          // Check if this is the user message group for this round
          const isUserGroupForRound = group.type === 'user-group';
          // ✅ DEFENSIVE GUARD: Ensure _preSearches is an array before calling .find()
          const preSearch = isUserGroupForRound && _threadId && Array.isArray(_preSearches)
            ? _preSearches.find(ps => ps.roundNumber === roundNumber)
            : null;

          // User message group with header inside message box
          if (group.type === 'user-group') {
            return (
              <div key={`user-group-wrapper-${group.messages[0]?.index}`} className="mb-8">
                {/* User messages - right-aligned bubbles, no avatar/name */}
                <div className="flex flex-col items-end gap-2">
                  {group.messages.map(({ message, index }) => {
                    const messageKey = keyForMessage(message, index);

                    // Extract file attachments and text parts separately
                    // ✅ TYPE-SAFE: Use isFilePart type guard for proper narrowing
                    const fileAttachments: MessageAttachment[] = message.parts
                      .filter((part): part is FilePart => isFilePart(part))
                      .map(filePart => ({
                        url: filePart.url,
                        filename: filePart.filename,
                        mediaType: filePart.mediaType,
                      }));

                    const textParts = message.parts.filter(
                      part => part.type === MessagePartTypes.TEXT,
                    );

                    return (
                      <div
                        key={messageKey}
                        className={cn(
                          'max-w-[85%]',
                          'bg-card text-card-foreground',
                          'border border-border/50',
                          'rounded-2xl rounded-br-md px-4 py-3',
                          'text-base leading-relaxed',
                        )}
                      >
                        {/* Attachments displayed above text */}
                        {fileAttachments.length > 0 && (
                          <MessageAttachmentPreview
                            attachments={fileAttachments}
                            messageId={message.id}
                          />
                        )}

                        {/* Text content */}
                        {textParts.map((part) => {
                          if (part.type === MessagePartTypes.TEXT) {
                            return (
                              <Streamdown
                                key={`${message.id}-text-${part.text.substring(0, 20)}`}
                                className="[&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
                                components={streamdownComponents}
                              >
                                {part.text}
                              </Streamdown>
                            );
                          }
                          return null;
                        })}
                      </div>
                    );
                  })}
                </div>

                {/* CRITICAL FIX: Render PreSearchCard immediately after user message, before assistant messages */}
                {/* ✅ mt-8 provides consistent spacing from user message content to PreSearchCard */}
                {preSearch && (
                  <div className="mt-8">
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
                  </div>
                )}

                {/* ✅ EAGER RENDERING: Show pending participant placeholders when waiting for pre-search or streaming
                    This provides immediate visual feedback showing all participants with "Waiting for response..."
                    The shimmer loading shows until each participant begins streaming and receives content */}
                {(() => {
                  // ✅ CRITICAL FIX: Determine if we should show pending cards
                  // Show pending cards when:
                  // 1. Pre-search is active (PENDING or STREAMING)
                  // 2. Streaming is active
                  // 3. Pre-search just completed but streaming hasn't started yet (waitForStream phase)
                  const preSearchActive = preSearch
                    && (preSearch.status === AnalysisStatuses.PENDING || preSearch.status === AnalysisStatuses.STREAMING);
                  const preSearchComplete = preSearch && preSearch.status === AnalysisStatuses.COMPLETE;

                  // ✅ FIX: Check if this is the round that's about to stream
                  // After pre-search completes, there's a brief gap before isStreaming becomes true
                  // During this gap, we still want to show pending cards
                  const isStreamingRound = roundNumber === _streamingRoundNumber;
                  const isLatestRound = isStreamingRound || preSearchActive || preSearchComplete;

                  if (!isLatestRound || participants.length === 0) {
                    return null;
                  }

                  // Get assistant messages for this round and build participant message maps
                  const assistantMessagesForRound = messages.filter((m) => {
                    if (m.role === MessageRoles.USER)
                      return false;
                    const msgRound = getRoundNumber(m.metadata);
                    return msgRound === roundNumber;
                  });

                  // ✅ CRITICAL FIX: Filter by isEnabled BEFORE sorting
                  // Only show enabled participants in pending cards
                  // Disabled participants from previous configurations should not render
                  const enabledParticipants = participants.filter(p => p.isEnabled);
                  const sortedParticipants = sortByPriority(enabledParticipants);

                  // ✅ Use reusable utility for multi-strategy participant message lookup
                  // Handles DB messages, resumed streams with partial metadata, and AI SDK temp IDs
                  const participantMaps = buildParticipantMessageMaps(assistantMessagesForRound);

                  // ✅ Check if ALL participants have complete messages with visible content
                  // If so, don't show pending cards - the regular AssistantGroupCard rendering will handle it
                  const allParticipantsHaveContentForRound = allParticipantsHaveVisibleContent(participantMaps, sortedParticipants);

                  // ✅ Show pending cards during these phases ONLY if not all participants have content:
                  // - Pre-search PENDING/STREAMING: Show all participants as pending
                  // - Pre-search COMPLETE but not streaming yet: Keep showing pending (transition phase)
                  // - Streaming: Show participants who haven't started streaming yet
                  // - Stream resumption: isStreamingRound is true but isStreaming may be false during AI SDK resumption
                  const shouldShowPendingCards = !allParticipantsHaveContentForRound && (preSearchActive || preSearchComplete || isStreaming || isStreamingRound);

                  if (!shouldShowPendingCards) {
                    return null;
                  }

                  // ✅ UNIFIED RENDERING: Render ALL participants in priority order
                  // Each participant shows either their actual content or shimmer, maintaining stable positions.
                  // ✅ FIX: Handle null currentParticipantIndex during stream resumption
                  const effectiveParticipantIndex = currentParticipantIndex ?? 0;
                  const currentStreamingParticipantForRound = sortedParticipants[effectiveParticipantIndex];

                  return (
                    // ✅ mt-8 provides consistent 2rem spacing from user message (matches space-y-8 between participants)
                    <div className="mt-8 space-y-8">
                      {sortedParticipants.map((participant, participantIdx) => {
                        const model = findModel(participant.modelId);
                        const isAccessible = model ? canAccessModelByPricing(userTier, model) : true;

                        // ✅ Use reusable utility for multi-strategy lookup
                        const participantMessage = getParticipantMessageFromMaps(participantMaps, participant, participantIdx);
                        const hasContent = participantHasVisibleContent(participantMaps, participant, participantIdx);

                        // Determine status and parts based on message state
                        // ✅ FIX: Include isStreamingRound to show streaming status during AI SDK resumption
                        const isCurrentlyStreaming = (isStreaming || isStreamingRound)
                          && currentStreamingParticipantForRound
                          && participant.id === currentStreamingParticipantForRound.id;

                        let status: MessageStatus;
                        let parts: MessagePart[] = [];

                        if (hasContent && participantMessage) {
                          // Has completed content - show it
                          status = MessageStatuses.COMPLETE;
                          parts = (participantMessage.parts || [])
                            .filter(p =>
                              p && (p.type === MessagePartTypes.TEXT
                                || p.type === MessagePartTypes.REASONING
                                || p.type === MessagePartTypes.TOOL_CALL
                                || p.type === MessagePartTypes.TOOL_RESULT),
                            )
                            .map(p => p as MessagePart);
                        } else if (isCurrentlyStreaming) {
                          // Currently streaming but no content yet
                          status = MessageStatuses.STREAMING;
                        } else {
                          // Waiting for turn
                          status = MessageStatuses.PENDING;
                        }

                        // ✅ Compute context-aware loading text for pending participants
                        let loadingText: string | undefined;
                        if (!hasContent) {
                          // ✅ FIX: Handle null currentParticipantIndex during stream resumption
                          // During early resumption phase, currentParticipantIndex may still be null
                          // In this case, assume first participant (index 0) is current
                          const effectiveCurrentIndex = currentParticipantIndex ?? 0;

                          // Check if it's this participant's turn
                          const isTheirTurn = participantIdx <= effectiveCurrentIndex;

                          if (isTheirTurn) {
                            // It's their turn - check pre-search status for first participant
                            if (participantIdx === 0 && preSearchActive) {
                              loadingText = tParticipant('waitingForWebResults');
                            } else {
                              // Their turn but no content yet - "Gathering thoughts"
                              loadingText = tParticipant('gatheringThoughts');
                            }
                          } else {
                            // Not their turn yet - show who they're waiting for
                            const currentSpeaker = sortedParticipants[effectiveCurrentIndex];
                            const currentSpeakerModel = currentSpeaker ? findModel(currentSpeaker.modelId) : null;
                            const currentSpeakerName = currentSpeakerModel?.name || currentSpeaker?.modelId || 'AI';
                            loadingText = tParticipant('waitingNamed', { name: currentSpeakerName });
                          }
                        }

                        // ✅ Use ParticipantMessageWrapper for consistent header rendering
                        return (
                          <ParticipantMessageWrapper
                            key={`participant-${participant.id}`}
                            participant={participant}
                            participantIndex={participantIdx}
                            model={model}
                            status={status}
                            parts={parts}
                            isAccessible={isAccessible}
                            messageId={participantMessage?.id}
                            loadingText={loadingText}
                          />
                        );
                      })}
                    </div>
                  );
                })()}
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

    // ✅ CRITICAL FIX: During streaming, check if last message content changed
    // This ensures pending cards properly transition to streaming content
    // Without this check, the memo might skip re-renders when streaming updates
    // the same message's parts array, causing pending cards to remain visible
    if (nextProps.isStreaming && nextProps.messages.length > 0) {
      const prevLast = prevProps.messages[prevProps.messages.length - 1];
      const nextLast = nextProps.messages[nextProps.messages.length - 1];

      // Check if parts array reference changed (indicates content update)
      if (prevLast?.parts !== nextLast?.parts) {
        return false;
      }

      // Deep check: if parts reference is same but content differs
      // This handles edge cases where the array is mutated in place
      if (prevLast?.parts && nextLast?.parts) {
        // Calculate total text length for comparison without type predicates
        const getTextLength = (parts: typeof prevLast.parts): number => {
          let length = 0;
          for (const p of parts) {
            // ✅ ENUM PATTERN: Use MessagePartTypes enum for type narrowing
            if (p.type === MessagePartTypes.TEXT && 'text' in p) {
              // Type narrowing ensures p.text exists after the check
              length += p.text?.length || 0;
            }
          }
          return length;
        };

        if (getTextLength(prevLast.parts) !== getTextLength(nextLast.parts)) {
          return false;
        }
      }
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

    // Re-render if preSearches change (for pending participant cards and PreSearchCard)
    if (prevProps.preSearches !== nextProps.preSearches) {
      return false;
    }

    // Re-render if streamingRoundNumber changes
    if (prevProps.streamingRoundNumber !== nextProps.streamingRoundNumber) {
      return false;
    }

    // Skip re-render - no meaningful changes
    return true;
  },
);
