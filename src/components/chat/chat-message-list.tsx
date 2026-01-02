'use client';
import type { UIMessage } from 'ai';
import { useTranslations } from 'next-intl';
import { memo, useEffect, useMemo, useState } from 'react';
import { Streamdown } from 'streamdown';

import type { MessageStatus } from '@/api/core/enums';
import { FinishReasons, isCompletionFinishReason, MessagePartTypes, MessageRoles, MessageStatuses, MODERATOR_NAME, MODERATOR_PARTICIPANT_INDEX, UIMessageRoles } from '@/api/core/enums';
import type { StoredPreSearch } from '@/api/routes/chat/schema';
import type { EnhancedModelResponse } from '@/api/routes/models/schema';
import type { MessageAttachment } from '@/components/chat/message-attachment-preview';
import { MessageAttachmentPreview } from '@/components/chat/message-attachment-preview';
import { ModelMessageCard } from '@/components/chat/model-message-card';
import { PreSearchCard } from '@/components/chat/pre-search-card';
import { streamdownComponents } from '@/components/markdown/unified-markdown-components';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollAwareParticipant, ScrollAwareUserMessage, ScrollFromTop } from '@/components/ui/motion';
import { BRAND } from '@/constants/brand';
import type { DbMessageMetadata } from '@/db/schemas/chat-metadata';
import { isAssistantMessageMetadata } from '@/db/schemas/chat-metadata';
import { useModelLookup } from '@/hooks/utils';
import type { FilePart, MessagePart } from '@/lib/schemas/message-schemas';
import { getUploadIdFromFilePart, isFilePart } from '@/lib/schemas/message-schemas';
import type { ChatParticipantWithSettings } from '@/lib/schemas/participant-schemas';
import { extractColorFromImage, getCachedImageColor, hasColorCached } from '@/lib/ui';
import { cn } from '@/lib/ui/cn';
import { allParticipantsHaveVisibleContent, buildParticipantMessageMaps, getAvatarPropsFromModelId, getEnabledParticipants, getMessageMetadata, getMessageStatus, getModeratorMetadata, getParticipantMessageFromMaps, getRoleBadgeStyle, getRoundNumber, getUserMetadata, isModeratorMessage, isPreSearch as isPreSearchMessage, participantHasVisibleContent } from '@/lib/utils';

const EMPTY_PARTICIPANTS: ChatParticipantWithSettings[] = [];
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
// MODERATOR INLINE RENDERING
// ============================================================================
// Moderator messages render inline via standard ModelMessageCard after all participants
// - Detection: isModeratorMessage(metadata) checks for isModerator flag
// - Participant Index: MODERATOR_PARTICIPANT_INDEX (-99) for sort order
// - Avatar: BRAND.logos.main (brand logo)
// - Display Name: MODERATOR_NAME ("Roundtable")
// - Role Badge: null (no role badge displayed)
// - Tier Requirement: undefined (no tier restriction)
// - Pending Cards: SHOWN when isModeratorStreaming=true (placeholder during streaming)
// - Skip Logic: Moderator messages never skipped during streaming round
//
// Moderator renders AFTER all participant responses complete, using same
// header/card structure as participants but with moderator-specific styling.
// When isModeratorStreaming=true and no moderator message exists, a placeholder card
// is shown with "Gathering thoughts..." text, exactly like participant pending cards.

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
 * ✅ OPTIMIZATION: Memoized to prevent re-renders when parent updates
 */
const ParticipantHeader = memo(({
  avatarSrc,
  avatarName,
  displayName,
  role,
  requiredTierName,
  isAccessible = true,
  isStreaming = false,
  hasError = false,
}: ParticipantHeaderProps) => {
  const t = useTranslations();
  // ✅ REACT 19: Sync initial render from cache, effect only populates cache if needed
  const [colorClass, setColorClass] = useState<string>(() => getCachedImageColor(avatarSrc));

  // ✅ REACT 19: Only run effect if not already cached (external system sync for image processing)
  useEffect(() => {
    // Skip if already cached - no async work needed
    if (hasColorCached(avatarSrc))
      return;

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
            {t('chat.participant.tierRequired', { tier: requiredTierName })}
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
});

// ============================================================================
// Reusable Participant Message Wrapper
// ============================================================================

type ParticipantMessageWrapperProps = {
  participant?: ChatParticipantWithSettings;
  participantIndex: number;
  model: EnhancedModelResponse | undefined;
  status: MessageStatus;
  parts: MessagePart[];
  isAccessible: boolean;
  messageId?: string;
  metadata?: DbMessageMetadata | null;
  /** Custom loading text for pending state */
  loadingText?: string;
  /** Max height for scrollable content */
  maxContentHeight?: number;
  /** Override avatar (for moderator) */
  avatarSrc?: string;
  /** Override avatar name (for moderator) */
  avatarName?: string;
  /** Override display name (for moderator) */
  displayName?: string;
};

/**
 * Reusable wrapper that renders a participant message with consistent header
 * Used by both AssistantGroupCard (for completed messages) and pending cards (for streaming)
 * Also used for moderator messages with avatar/name overrides
 * ✅ OPTIMIZATION: Memoized to prevent re-renders when sibling messages update
 */
const ParticipantMessageWrapper = memo(({
  participant,
  participantIndex,
  model,
  status,
  parts,
  isAccessible,
  messageId,
  metadata,
  loadingText,
  maxContentHeight,
  avatarSrc: avatarSrcOverride,
  avatarName: avatarNameOverride,
  displayName: displayNameOverride,
}: ParticipantMessageWrapperProps) => {
  const defaultAvatarProps = participant
    ? getAvatarPropsFromModelId(MessageRoles.ASSISTANT, participant.modelId, null, 'AI')
    : { src: '', name: 'AI' };

  const avatarSrc = avatarSrcOverride ?? defaultAvatarProps.src;
  const avatarName = avatarNameOverride ?? defaultAvatarProps.name;
  const displayName = displayNameOverride ?? model?.name ?? participant?.modelId ?? 'AI Assistant';
  const isStreaming = status === MessageStatuses.STREAMING || status === MessageStatuses.PENDING;
  const assistantMetadata = metadata && isAssistantMessageMetadata(metadata) ? metadata : null;
  const hasError = status === MessageStatuses.FAILED || assistantMetadata?.hasError;

  return (
    <div className="flex justify-start">
      <div className="w-full">
        <ParticipantHeader
          avatarSrc={avatarSrc}
          avatarName={avatarName}
          displayName={displayName}
          role={participant?.role}
          requiredTierName={model?.required_tier_name}
          isAccessible={isAccessible}
          isStreaming={isStreaming}
          hasError={!!hasError}
        />
        <ModelMessageCard
          messageId={messageId}
          model={model}
          role={participant?.role}
          participantIndex={participantIndex}
          status={status}
          parts={parts}
          avatarSrc={avatarSrc}
          avatarName={avatarName}
          metadata={metadata}
          isAccessible={isAccessible}
          hideInlineHeader
          hideAvatar
          loadingText={loadingText}
          maxContentHeight={maxContentHeight}
        />
      </div>
    </div>
  );
});

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
  demoMode,
  hideMetadata,
  t,
  keyForMessage,
  maxContentHeight,
}: {
  group: Extract<MessageGroup, { type: 'assistant-group' }>;
  groupIndex: number;
  findModel: (modelId?: string) => EnhancedModelResponse | undefined;
  demoMode: boolean;
  hideMetadata: boolean;
  t: (key: string) => string;
  keyForMessage: (message: UIMessage, index: number) => string;
  maxContentHeight?: number;
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
            // ✅ Use backend-computed is_accessible_to_user (respects actual tier)
            // In demo mode, all models are accessible
            const isAccessible = demoMode || (model?.is_accessible_to_user ?? true);

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
                !!p && (p.type === MessagePartTypes.TEXT
                  || p.type === MessagePartTypes.REASONING
                  || p.type === MessagePartTypes.TOOL_CALL
                  || p.type === MessagePartTypes.TOOL_RESULT),
              ) as MessagePart[];
            const sourceParts = safeParts.filter(p =>
              p && 'type' in p && (p.type === 'source-url' || p.type === 'source-document'),
            );

            // Check if this is a moderator message for custom loading text
            const isModerator = participantInfo.participantIndex === MODERATOR_PARTICIPANT_INDEX;

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
                  maxContentHeight={maxContentHeight}
                  loadingText={isModerator ? t('chat.participant.moderatorObserving') : undefined}
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
 * AI SDK v6 Pattern: Determine participant info from message metadata
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
  isModeratorStreaming = false,
}: {
  message: UIMessage;
  messageIndex: number;
  totalMessages: number;
  isGlobalStreaming: boolean;
  currentParticipantIndex: number;
  participants: ChatParticipantWithSettings[];
  currentStreamingParticipant: ChatParticipantWithSettings | null;
  isModeratorStreaming?: boolean;
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
  // AI SDK v6 Pattern: Reasoning parts count as visible for UI (model-message-card handles rendering)
  const hasVisibleContent = message.parts?.some(
    p =>
      (p.type === MessagePartTypes.TEXT && 'text' in p && (p.text as string)?.trim().length > 0)
      || p.type === MessagePartTypes.TOOL_CALL
      || p.type === MessagePartTypes.REASONING,
  ) ?? false;

  // Check if this is a moderator message (used for shimmer/loading state below)
  const isModerator = isModeratorMessage(message);

  // Messages with visible content should show content, not shimmer
  // Store guarantees participants are sorted by priority
  if (hasVisibleContent) {
    const fallbackParticipant = participants[currentParticipantIndex];
    // Show streaming cursor until finishReason indicates actual completion
    // 'unknown' is a placeholder during streaming - NOT a completion reason
    // Only 'stop', 'length', 'content-filter', 'tool-calls' indicate actual completion
    const finishReason = assistantMetadata?.finishReason;
    const hasActuallyFinished = isCompletionFinishReason(finishReason);
    return {
      participantIndex: assistantMetadata?.participantIndex ?? currentParticipantIndex,
      modelId: assistantMetadata?.model || fallbackParticipant?.modelId,
      role: assistantMetadata?.participantRole || fallbackParticipant?.role || null,
      isStreaming: !hasActuallyFinished,
    };
  }

  // AI SDK v6 Pattern: Only messages WITHOUT visible content can be considered streaming
  const isLastMessage = messageIndex === totalMessages - 1;
  const isThisMessageStreaming = !hasVisibleContent && isGlobalStreaming && isLastMessage && message.role === MessageRoles.ASSISTANT;

  if (isThisMessageStreaming) {
    const participant = participants[currentParticipantIndex] || currentStreamingParticipant;
    return {
      participantIndex: currentParticipantIndex,
      modelId: participant?.modelId || assistantMetadata?.model,
      role: participant?.role || assistantMetadata?.participantRole || null,
      isStreaming: true,
    };
  }

  // ✅ MODERATOR STREAMING: When moderator is streaming and message has no content
  // Treat it as streaming so shimmer/loading state shows
  if (isModerator && isModeratorStreaming && !hasVisibleContent) {
    return {
      participantIndex: MODERATOR_PARTICIPANT_INDEX,
      modelId: assistantMetadata?.model,
      role: null,
      isStreaming: true,
    };
  }

  // Fallback for messages during state transitions
  const fallbackParticipantIndex = assistantMetadata?.participantIndex ?? currentParticipantIndex;
  const fallbackParticipant = participants[fallbackParticipantIndex];

  return {
    participantIndex: fallbackParticipantIndex,
    modelId: assistantMetadata?.model || fallbackParticipant?.modelId,
    role: assistantMetadata?.participantRole || fallbackParticipant?.role || null,
    isStreaming: false,
  };
}

// Stable empty set to prevent render loops
const EMPTY_COMPLETED_ROUNDS = new Set<number>();

type ChatMessageListProps = {
  messages: UIMessage[];
  user?: {
    name: string;
    image: string | null;
  } | null;
  participants?: ChatParticipantWithSettings[];
  hideMetadata?: boolean;
  isLoading?: boolean;
  isStreaming?: boolean;
  currentStreamingParticipant?: ChatParticipantWithSettings | null;
  currentParticipantIndex?: number;
  userAvatar?: { src: string; name: string };
  threadId?: string | null; // Optional threadId for pre-search hydration
  preSearches?: StoredPreSearch[]; // Pre-searches from store
  streamingRoundNumber?: number | null; // Pass through from ThreadTimeline
  demoPreSearchOpen?: boolean; // Demo mode controlled accordion state
  /** Max height for scrollable content in message cards. Used in demo mode. */
  maxContentHeight?: number;
  /** Skip all entrance animations (for demo that has already completed) */
  skipEntranceAnimations?: boolean;
  /**
   * ✅ BUG FIX: Set of round numbers that have complete summaries.
   * Rounds in this set should NEVER show pending cards.
   */
  completedRoundNumbers?: Set<number>;
  /**
   * ✅ MODERATOR FLAG: Indicates moderator is currently streaming.
   * Used to block input during moderator streaming.
   * Moderator message now renders via normal message flow (added to messages array).
   */
  isModeratorStreaming?: boolean;
  /**
   * Current round number for this message list instance.
   */
  roundNumber?: number;
  /**
   * Demo mode - forces all models to be accessible (hides tier badges).
   */
  demoMode?: boolean;
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
    maxContentHeight,
    skipEntranceAnimations = false,
    completedRoundNumbers = EMPTY_COMPLETED_ROUNDS,
    isModeratorStreaming = false,
    roundNumber: _roundNumber,
    demoMode = false,
  }: ChatMessageListProps) => {
    const t = useTranslations();
    const tParticipant = useTranslations('chat.participant');
    // Consolidated model lookup hook
    const { findModel } = useModelLookup();
    const userInfo = useMemo(() => user || { name: 'User', image: null }, [user]);
    const userAvatarSrc = userAvatar?.src || userInfo.image || '';
    const userAvatarName = userAvatar?.name || userInfo.name;

    // ✅ ANIMATION: Using whileInView for scroll-triggered animations
    // The viewport={{ once: true }} in motion components handles "don't re-animate"
    // So we always return true here unless explicitly disabled
    const shouldAnimateMessage = (_messageId: string): boolean => {
      // Skip all animations when explicitly requested (e.g., demo already completed)
      if (skipEntranceAnimations) {
        return false;
      }
      // Always animate - whileInView with once:true handles scroll trigger
      return true;
    };

    // ✅ SCROLL MANAGEMENT: Handled by useChatScroll in parent (ChatThreadScreen)
    // Prevents dual scroll systems from conflicting when changelogs cause virtualization remeasurement

    // ✅ DEDUPLICATION: Prevent duplicate message IDs and filter participant trigger messages
    // Note: Component supports grouping multiple consecutive user messages for UI flexibility
    // ✅ CRITICAL FIX: Also deduplicate assistant messages by (roundNumber, participantIndex/modelId)
    // On page refresh with resumed streams, we may have:
    // 1. DB message with deterministic ID: thread_r1_p0
    // 2. AI SDK resumed message with temp ID: gen-abc123
    // Both represent the same participant response and should be deduplicated
    //
    // ✅ BUG FIX: Special handling for moderator messages
    // Moderator messages are identified by isModerator=true, not by participantIndex
    // They should be deduplicated by (roundNumber, isModerator) key
    const deduplicatedMessages = useMemo(() => {
      const seenMessageIds = new Set<string>(); // Track message IDs to prevent actual duplicates
      // ✅ PERF FIX: Track position indices in Maps for O(1) replacement lookups
      // Previously used findIndex() which caused O(n²) complexity
      const assistantKeyToIdx = new Map<string, number>(); // dedupeKey -> result index
      const moderatorRoundToIdx = new Map<number, number>(); // roundNumber -> result index
      const userRoundToIdx = new Map<number, number>(); // roundNumber -> result index
      const result: UIMessage[] = [];

      for (const message of messages) {
        // Skip if we've already processed this exact message ID (prevents duplicates)
        if (seenMessageIds.has(message.id)) {
          continue;
        }

        // For user messages, filter out participant trigger messages and deduplicate by round
        if (message.role === MessageRoles.USER) {
          const userMeta = getUserMetadata(message.metadata);

          // ✅ TYPE-SAFE: Check isParticipantTrigger using validated metadata schema
          const isParticipantTrigger = userMeta?.isParticipantTrigger === true;

          // Skip participant trigger duplicates completely
          if (isParticipantTrigger) {
            continue;
          }

          // ✅ BUG FIX: Deduplicate user messages by round (prevents optimistic + DB duplicates)
          // ✅ PERF FIX: Use Map for O(1) lookup instead of O(n) findIndex
          const roundNum = userMeta?.roundNumber;
          if (roundNum !== undefined && roundNum !== null) {
            const existingIdx = userRoundToIdx.get(roundNum);
            if (existingIdx !== undefined) {
              // Prefer deterministic IDs over optimistic IDs
              const isDeterministicId = message.id.includes('_r') && message.id.includes('_user');
              const isOptimistic = message.id.startsWith('optimistic-');
              if (isOptimistic) {
                // This is an optimistic message, skip it in favor of the DB message
                continue;
              }
              if (isDeterministicId) {
                // This is a deterministic DB message - replace the optimistic message via O(1) lookup
                result[existingIdx] = message;
                seenMessageIds.add(message.id);
                continue;
              }
              // Skip this duplicate
              continue;
            }
            userRoundToIdx.set(roundNum, result.length); // Track index before push
          }

          seenMessageIds.add(message.id);
          result.push(message);
        } else {
          // ✅ BUG FIX: Check if this is a moderator message FIRST
          // Moderator messages use different deduplication logic (by round only)
          const isModerator = isModeratorMessage(message);

          if (isModerator) {
            const roundNum = getRoundNumber(message.metadata);

            // ✅ PERF FIX: Use Map for O(1) lookup instead of O(n) findIndex
            if (roundNum !== null) {
              const existingIdx = moderatorRoundToIdx.get(roundNum);
              if (existingIdx !== undefined) {
                // Prefer deterministic IDs over temp IDs
                const isDeterministicId = message.id.includes('_r') && message.id.includes('_moderator');
                if (!isDeterministicId) {
                  // This is a temp ID message, skip it in favor of the DB message
                  continue;
                }
                // This is a deterministic ID message - replace via O(1) lookup
                result[existingIdx] = message;
                seenMessageIds.add(message.id);
                continue;
              }
              moderatorRoundToIdx.set(roundNum, result.length); // Track index before push
            }
            seenMessageIds.add(message.id);
            result.push(message);
            continue;
          }

          // For assistant messages (participants only, not moderator), deduplicate by (roundNumber, participantIndex OR modelId)
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

            // ✅ PERF FIX: Use Map for O(1) lookup instead of O(n) findIndex
            if (dedupeKey) {
              const existingIdx = assistantKeyToIdx.get(dedupeKey);
              if (existingIdx !== undefined) {
                // ✅ PREFER: Keep the message with the deterministic ID (contains _r{N}_p{M})
                // and skip the temp ID message (gen-xxxxx)
                const isDeterministicId = message.id.includes('_r') && message.id.includes('_p');
                if (!isDeterministicId) {
                  // This is a temp ID message, skip it in favor of the DB message
                  continue;
                }
                // This is a deterministic ID message - replace via O(1) lookup
                result[existingIdx] = message;
                seenMessageIds.add(message.id);
                continue;
              }
              assistantKeyToIdx.set(dedupeKey, result.length); // Track index before push
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
    //
    // ✅ BUG FIX: Dependencies optimization
    // - Completed messages (with finishReason) should NEVER depend on current participant state
    // - Only streaming messages need current participant info
    // - Moderator messages are identified early and use frozen metadata when complete
    const messagesWithParticipantInfo = useMemo(() => {
      return deduplicatedMessages.map((message, index) => {
        if (message.role === MessageRoles.USER) {
          return { message, index, participantInfo: null };
        }

        // ✅ MODERATOR DETECTION: Messages with isModerator metadata flag
        // Detected via isModeratorMessage(metadata) utility
        // Moderator uses special MODERATOR_PARTICIPANT_INDEX (-99) for sorting
        // Renders inline via ModelMessageCard after all participant responses
        if (isModeratorMessage(message)) {
          const moderatorMeta = getModeratorMetadata(message.metadata);
          // ✅ BUG FIX: Check finishReason for ACTUAL completion, not just presence
          // 'unknown' is a placeholder during streaming - NOT a completion reason
          const finishReason = moderatorMeta?.finishReason;
          const hasActuallyFinished = isCompletionFinishReason(finishReason);
          return {
            message,
            index,
            participantInfo: {
              participantIndex: MODERATOR_PARTICIPANT_INDEX, // -99 for sort order
              modelId: moderatorMeta?.model, // Uses its own model ID from metadata
              role: null, // No role badge displayed for moderator
              isStreaming: !hasActuallyFinished,
            },
          };
        }

        const metadata = getMessageMetadata(message.metadata);
        // ✅ STRICT TYPING: Use type guard to access assistant-specific fields
        const assistantMetadata = metadata && isAssistantMessageMetadata(metadata) ? metadata : null;

        // ✅ BUG FIX: Check BOTH model AND ACTUAL finishReason to determine completion
        // A message is complete when it has:
        // 1. model (set during onFinish callback)
        // 2. finishReason that indicates ACTUAL completion (not 'unknown' placeholder)
        // 'unknown' is set during streaming before actual completion
        const finishReason = assistantMetadata?.finishReason;
        const hasActualFinishReason = isCompletionFinishReason(finishReason);
        const isComplete = !!(assistantMetadata?.model && hasActualFinishReason);

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
          isModeratorStreaming,
        });

        return { message, index, participantInfo };
      });
    }, [deduplicatedMessages, isStreaming, currentParticipantIndex, participants, currentStreamingParticipant, isModeratorStreaming]);

    // ✅ CRITICAL FIX: Pre-calculate if all participants have content for the streaming round
    // This is needed to decide whether to skip messages from messageGroups or render them there
    // When all participants have content, we should NOT skip messages (render in messageGroups)
    // When not all have content, we SHOULD skip messages (render in pending cards section)
    //
    // ✅ BUG FIX: Must check content even when isStreaming=false but streamingRoundNumber is set
    // After page refresh with completed round, isStreaming=false but streamingRoundNumber may still
    // be set (not cleared). If we return false here, messages get skipped incorrectly.
    const allStreamingRoundParticipantsHaveContent = useMemo(() => {
      if (_streamingRoundNumber === null || participants.length === 0) {
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
      // Filter to enabled only - store guarantees sorted order
      const enabledParticipants = getEnabledParticipants(participants);

      return allParticipantsHaveVisibleContent(participantMaps, enabledParticipants);
    }, [deduplicatedMessages, _streamingRoundNumber, participants]);

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

        // ✅ STREAMING ROUND LOGIC: Skip participant messages for current streaming round
        // Participants render via pending cards section to maintain stable priority positioning
        // Pending cards section shows ALL participants in sort order, replacing shimmer
        // with actual content as it streams in. This prevents completed messages from
        // appearing at bottom (after pending cards) instead of in their priority position.
        //
        // EXCEPTION 1: When ALL participants have content, DON'T skip - render in messageGroups
        // This prevents messages from disappearing when all complete but isStreaming is still true
        //
        // EXCEPTION 2: MODERATOR MESSAGES ARE NEVER SKIPPED
        // - Moderator has no pending card placeholder
        // - Moderator renders inline after all participants complete
        // - Never included in participant pending card logic
        const messageMetadata = getMessageMetadata(message.metadata);
        const messageRoundNumber = getRoundNumber(messageMetadata);
        const isCurrentStreamingRound = messageRoundNumber === _streamingRoundNumber;
        const messageIsModerator = isModeratorMessage(message);

        // Skip participants for streaming round (pending cards handle them)
        // ✅ BUG FIX: Only skip when isStreaming is true
        // When streaming ends, isStreaming becomes false BEFORE streamingRoundNumber is cleared
        // (due to useStateSync running before completeStreaming callback)
        // Without the isStreaming check, messages get skipped but pending cards don't render,
        // causing a flash where all participants briefly disappear.
        // Always allow moderator through - it renders inline, not via pending cards
        if (isStreaming && isCurrentStreamingRound && !allStreamingRoundParticipantsHaveContent && !messageIsModerator) {
          continue; // Let pending cards section handle participants for streaming round
        }

        // Close any open user group
        if (currentUserGroup) {
          groups.push(currentUserGroup);
          currentUserGroup = null;
        }

        // ✅ MODERATOR DISPLAY: Check if this is a moderator message
        // Moderator is identified by MODERATOR_PARTICIPANT_INDEX (-99)
        const isModerator = participantInfo.participantIndex === MODERATOR_PARTICIPANT_INDEX;

        const metadata = getMessageMetadata(message.metadata);
        const model = findModel(participantInfo.modelId);
        // ✅ Use backend-computed is_accessible_to_user (respects actual tier)
        // In demo mode, all models are accessible
        const isAccessible = demoMode || (model?.is_accessible_to_user ?? true);

        // ✅ MODERATOR RENDERING: Uses BRAND.logos.main avatar and MODERATOR_NAME
        // Moderator has no role badge (role: null)
        // Moderator has no tier requirement (requiredTierName: undefined)
        let avatarSrc: string;
        let avatarName: string;
        let displayName: string;
        let requiredTierName: string | undefined;

        if (isModerator) {
          avatarSrc = BRAND.logos.main; // Brand logo for moderator avatar
          avatarName = MODERATOR_NAME; // "Roundtable" fallback text
          displayName = MODERATOR_NAME; // "Roundtable" header text
          requiredTierName = undefined; // No tier badge for moderator
        } else {
          const avatarProps = getAvatarPropsFromModelId(
            message.role === UIMessageRoles.SYSTEM ? MessageRoles.ASSISTANT : message.role,
            participantInfo.modelId,
            userInfo.image,
            userInfo.name,
          );
          avatarSrc = avatarProps.src;
          avatarName = avatarProps.name;
          const assistantMetadata = metadata && isAssistantMessageMetadata(metadata) ? metadata : null;
          displayName = model?.name || assistantMetadata?.model || 'AI Assistant';
          requiredTierName = model?.required_tier_name;
        }

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
              avatarSrc,
              avatarName,
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
    }, [messagesWithParticipantInfo, findModel, demoMode, userInfo, userAvatarSrc, userAvatarName, allStreamingRoundParticipantsHaveContent, _streamingRoundNumber, isStreaming]);

    // ✅ UNIFIED RENDERING: Moderator now renders through normal messageGroups path
    // No special placeholder needed - useModeratorStream adds message to messages array during streaming
    // and it flows through the same rendering path as participant messages

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
              <div key={`user-group-wrapper-${group.messages[0]?.index}`} className="mb-4">
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
                        uploadId: getUploadIdFromFilePart(filePart) ?? undefined,
                      }));

                    const textParts = message.parts.filter(
                      part => part.type === MessagePartTypes.TEXT,
                    );

                    return (
                      <ScrollAwareUserMessage
                        key={messageKey}
                        skipAnimation={!shouldAnimateMessage(message.id)}
                        enableScrollEffect
                        className="w-full"
                      >
                        <div
                          className={cn(
                            'max-w-[85%] ml-auto w-fit',
                            'bg-secondary text-secondary-foreground',
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
                      </ScrollAwareUserMessage>
                    );
                  })}
                </div>

                {/* CRITICAL FIX: Render PreSearchCard immediately after user message, before assistant messages */}
                {/* ✅ mt-8 provides consistent spacing from user message content to PreSearchCard */}
                {/* ✅ ScrollFromTop wraps card for scroll-triggered slide-down animation */}
                {preSearch && (
                  <ScrollFromTop
                    skipAnimation={skipEntranceAnimations}
                    className="mt-8"
                  >
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
                  </ScrollFromTop>
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
                    && (preSearch.status === MessageStatuses.PENDING || preSearch.status === MessageStatuses.STREAMING);
                  const preSearchComplete = preSearch && preSearch.status === MessageStatuses.COMPLETE;

                  // ✅ FIX: Check if this is the round that's about to stream
                  // After pre-search completes, there's a brief gap before isStreaming becomes true
                  // During this gap, we still want to show pending cards
                  const isStreamingRound = roundNumber === _streamingRoundNumber;

                  // ✅ BUG FIX: Only show pending cards for the ACTUAL latest round
                  // Previous logic: `isLatestRound = isStreamingRound || preSearchActive || preSearchComplete`
                  // Bug: ANY round with complete pre-search would show pending cards!
                  // Fix: Check if this round is >= the maximum round number in messages
                  // ✅ BUG FIX 2: Include _streamingRoundNumber in max calculation
                  // Bug: streamingRoundNumber is set BEFORE optimistic user message is added
                  // This caused previous round to see maxRound=N-1 and think it's latest
                  // while streamingRoundNumber was already N. By including streamingRoundNumber,
                  // previous rounds correctly see they're not latest even before message arrives.
                  const maxRoundInMessages = Math.max(
                    0,
                    _streamingRoundNumber ?? 0,
                    ...messages.map(m => getRoundNumber(m.metadata) ?? 0),
                  );
                  const isActuallyLatestRound = roundNumber >= maxRoundInMessages;
                  const isLatestRound = isActuallyLatestRound && (isStreamingRound || preSearchActive || preSearchComplete);

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

                  // Filter to enabled participants only (store guarantees sorted order)
                  const enabledParticipants = getEnabledParticipants(participants);

                  // ✅ Use reusable utility for multi-strategy participant message lookup
                  // Handles DB messages, resumed streams with partial metadata, and AI SDK temp IDs
                  const participantMaps = buildParticipantMessageMaps(assistantMessagesForRound);

                  // ✅ FLASH FIX: Keep rendering pending cards until round is COMPLETE
                  // Previously: Stopped when allParticipantsHaveVisibleContent() became true
                  // Problem: This caused a transition to messageGroups with different keys,
                  // which caused React to unmount/remount components = FLASH
                  //
                  // New approach:
                  // 1. Pending cards render ALL participants during streaming round
                  // 2. They keep rendering even when all have content (just show content instead of shimmer)
                  // 3. Only stop when round is marked COMPLETE
                  // 4. MessageGroups skips rendering assistant messages from streaming round
                  //
                  // ✅ MODERATOR TRANSITION FIX: Include isModeratorStreaming in condition
                  // When participants finish (isStreaming=false) but moderator is starting
                  // (isModeratorStreaming=true), we must keep rendering the pending cards section
                  // Otherwise everything disappears during the transition!
                  //
                  // ✅ PLACEHOLDER TIMING FIX: Include isStreamingRound in condition
                  // RACE CONDITION BUG: When streamingRoundNumber is set (handleUpdateThreadAndSend line 437)
                  // but isStreaming is still false (waiting for AI SDK to start), the moderator placeholder
                  // would show immediately (because its condition includes isStreamingRound) but participant
                  // pending cards wouldn't show (because this condition didn't include isStreamingRound).
                  // FIX: Both participant and moderator sections now use same isAnyStreamingActive logic.
                  //
                  // This keeps the same component mounted throughout streaming -> no flash
                  const isRoundComplete = completedRoundNumbers.has(roundNumber);
                  const isAnyStreamingActive = isStreaming || isModeratorStreaming || isStreamingRound;
                  const shouldShowPendingCards = !isRoundComplete && (preSearchActive || preSearchComplete || isAnyStreamingActive);

                  // ✅ FLASH FIX: Keep component mounted but hidden instead of return null
                  // Previously returning null caused React to unmount/remount when transitioning
                  // from pending cards to messageGroups, triggering animation replays (FLASH).
                  // Now we use opacity + pointer-events to hide without unmounting.

                  // Render ALL enabled participants in priority order (store guarantees sort)
                  // Each participant shows either their actual content or shimmer, maintaining stable positions.

                  return (
                    // mt-8 provides consistent 2rem spacing from user message (matches space-y-8 between participants)
                    // ✅ FLASH FIX: Use opacity transition instead of conditional rendering
                    // ✅ POSITION FIX: Use visibility+height instead of absolute positioning
                    // absolute -z-10 caused layout jumps when content became visible
                    <div
                      className={cn(
                        'space-y-8 transition-all duration-150 overflow-hidden',
                        shouldShowPendingCards ? 'mt-8 opacity-100' : 'h-0 opacity-0 pointer-events-none',
                      )}
                      aria-hidden={!shouldShowPendingCards}
                    >
                      {enabledParticipants.map((participant, participantIdx) => {
                        const model = findModel(participant.modelId);
                        // ✅ Use backend-computed is_accessible_to_user (respects actual tier)
                        // In demo mode, all models are accessible
                        const isAccessible = demoMode || (model?.is_accessible_to_user ?? true);

                        // ✅ Use reusable utility for multi-strategy lookup
                        const participantMessage = getParticipantMessageFromMaps(participantMaps, participant, participantIdx);
                        const hasContent = participantHasVisibleContent(participantMaps, participant, participantIdx);

                        let status: MessageStatus;
                        let parts: MessagePart[] = [];

                        if (hasContent && participantMessage) {
                          // ✅ FIX: Use multiple signals to determine if streaming is done
                          // Some models (DeepSeek R1, etc.) return finishReason='unknown' even on success
                          const messageMeta = getMessageMetadata(participantMessage.metadata);
                          const assistantMeta = messageMeta && isAssistantMessageMetadata(messageMeta) ? messageMeta : null;
                          const finishReason = assistantMeta?.finishReason;

                          // Signal 1: Standard finish reasons
                          const hasStandardFinishReason = isCompletionFinishReason(finishReason);

                          // Signal 2: Backend marked success with tokens generated
                          const backendMarkedSuccess = assistantMeta?.hasError === false
                            && (assistantMeta?.usage?.completionTokens ?? 0) > 0;

                          // Signal 3: NOT explicitly failed
                          const isExplicitError = finishReason === FinishReasons.FAILED || assistantMeta?.hasError === true;

                          // Signal 4: Participant streaming stopped (moderator started or all done)
                          // If isStreaming is false, all participants are definitely complete
                          // This handles models like DeepSeek R1 that return finishReason='unknown'
                          const participantStreamingStopped = !isStreaming;

                          // ✅ MULTI-SIGNAL: Complete if streaming stopped OR standard finish OR backend success
                          const hasActuallyFinished = (participantStreamingStopped || hasStandardFinishReason || backendMarkedSuccess) && !isExplicitError;

                          // ✅ ANIMATION FIX: Still streaming if content exists but not finished
                          // This keeps the pulsating animation showing during active streaming
                          status = hasActuallyFinished ? MessageStatuses.COMPLETE : MessageStatuses.STREAMING;
                          // Type boundary: AI SDK parts → MessagePart schema
                          parts = (participantMessage.parts || [])
                            .filter(p =>
                              p && (p.type === MessagePartTypes.TEXT
                                || p.type === MessagePartTypes.REASONING
                                || p.type === MessagePartTypes.TOOL_CALL
                                || p.type === MessagePartTypes.TOOL_RESULT),
                            ) as MessagePart[];
                        } else {
                          status = MessageStatuses.PENDING;
                        }

                        let loadingText: string | undefined;
                        if (!hasContent) {
                          const effectiveCurrentIndex = currentParticipantIndex ?? 0;
                          const isTheirTurn = participantIdx <= effectiveCurrentIndex;

                          if (isTheirTurn) {
                            if (participantIdx === 0 && preSearchActive) {
                              loadingText = tParticipant('waitingForWebResults');
                            } else {
                              loadingText = tParticipant('gatheringThoughts');
                            }
                          } else {
                            const currentSpeaker = enabledParticipants[effectiveCurrentIndex];
                            const currentSpeakerModel = currentSpeaker ? findModel(currentSpeaker.modelId) : null;
                            const currentSpeakerName = currentSpeakerModel?.name || currentSpeaker?.modelId || 'AI';
                            loadingText = tParticipant('waitingNamed', { name: currentSpeakerName });
                          }
                        }

                        return (
                          <ScrollAwareParticipant
                            key={`participant-${participant.id}`}
                            index={participantIdx}
                            skipAnimation={!shouldAnimateMessage(`participant-${participant.id}-${roundNumber}`)}
                            enableScrollEffect
                          >
                            <ParticipantMessageWrapper
                              participant={participant}
                              participantIndex={participantIdx}
                              model={model}
                              status={status}
                              parts={parts}
                              isAccessible={isAccessible}
                              messageId={participantMessage?.id}
                              loadingText={loadingText}
                              maxContentHeight={maxContentHeight}
                            />
                          </ScrollAwareParticipant>
                        );
                      })}

                    </div>
                  );
                })()}

                {(() => {
                  const maxRoundInMessages = Math.max(
                    0,
                    _streamingRoundNumber ?? 0,
                    ...messages.map(m => getRoundNumber(m.metadata) ?? 0),
                  );
                  const isActuallyLatestRound = roundNumber >= maxRoundInMessages;
                  const isRoundComplete = completedRoundNumbers.has(roundNumber);
                  // ✅ FIX: Check if this is the active streaming round
                  const isStreamingRound = roundNumber === _streamingRoundNumber;

                  const moderatorMessage = messages.find((m) => {
                    const meta = m.metadata;
                    return meta && typeof meta === 'object' && 'isModerator' in meta
                      && meta.isModerator === true
                      && getRoundNumber(meta) === roundNumber;
                  });
                  const moderatorHasContent = moderatorMessage?.parts?.some(p =>
                    p.type === MessagePartTypes.TEXT && 'text' in p && (p.text as string)?.trim().length > 0,
                  ) ?? false;

                  // ✅ IMMEDIATE PLACEHOLDER: Show moderator placeholder immediately when streaming round starts
                  // This provides visual feedback that moderator will summarize after participants complete.
                  // Flow:
                  // - Submit pressed → isStreamingRound becomes true → moderator placeholder shows immediately
                  // - Participants stream one by one
                  // - All participants complete → moderator streams (same placeholder, content fills in)
                  // - After streaming ends (_streamingRoundNumber cleared), messageGroups handles rendering
                  // - DUPLICATE FIX: isStreamingRound ensures IIFE only renders during active round
                  const shouldShowModerator = isActuallyLatestRound
                    && !isRoundComplete
                    && isStreamingRound; // Show immediately when streaming round starts

                  const enabledParticipants = getEnabledParticipants(participants);

                  const moderatorParts = moderatorHasContent && moderatorMessage
                    ? (moderatorMessage.parts || [])
                        .filter(p =>
                          !!p && (p.type === MessagePartTypes.TEXT
                            || p.type === MessagePartTypes.REASONING
                            || p.type === MessagePartTypes.TOOL_CALL
                            || p.type === MessagePartTypes.TOOL_RESULT),
                        ) as MessagePart[]
                    : [];

                  // Determine status: pending → streaming → complete
                  const moderatorStatus = moderatorHasContent
                    ? (isModeratorStreaming ? MessageStatuses.STREAMING : MessageStatuses.COMPLETE)
                    : MessageStatuses.PENDING;

                  // ✅ SMART LOADING TEXT: Different message based on participant streaming status
                  // - When participants still streaming: "Waiting to summarize..."
                  // - When participants done, moderator starting: "Observing discussion..."
                  const moderatorLoadingText = moderatorParts.length === 0
                    ? (isStreaming ? tParticipant('waitingToSummarize') : tParticipant('moderatorObserving'))
                    : undefined;

                  // ✅ FLASH FIX: Keep component mounted but hidden instead of return null
                  // ✅ POSITION FIX: Use visibility+height instead of absolute positioning
                  // absolute -z-10 caused layout jumps when moderator became visible
                  // Now we keep it in flow but visually hidden with h-0
                  return (
                    <div
                      className={cn(
                        'transition-all duration-150 overflow-hidden',
                        shouldShowModerator ? 'mt-8 opacity-100' : 'h-0 opacity-0 pointer-events-none',
                      )}
                      aria-hidden={!shouldShowModerator}
                    >
                      <ScrollAwareParticipant
                        key={`moderator-${roundNumber}`}
                        index={enabledParticipants.length}
                        skipAnimation={!shouldAnimateMessage(`moderator-${roundNumber}`)}
                        enableScrollEffect
                      >
                        <ParticipantMessageWrapper
                          participantIndex={MODERATOR_PARTICIPANT_INDEX}
                          model={undefined}
                          status={moderatorStatus}
                          parts={moderatorParts}
                          isAccessible={true}
                          messageId={moderatorMessage?.id}
                          loadingText={moderatorLoadingText}
                          maxContentHeight={maxContentHeight}
                          avatarSrc={BRAND.logos.main}
                          avatarName={MODERATOR_NAME}
                          displayName={MODERATOR_NAME}
                        />
                      </ScrollAwareParticipant>
                    </div>
                  );
                })()}
              </div>
            );
          }

          // Assistant group with header inside message box
          if (group.type === 'assistant-group') {
            // ✅ FLASH FIX: Skip rendering assistant groups from current streaming round
            // They're rendered by the pending cards section to maintain key stability
            // Only render assistant groups from COMPLETED rounds
            const groupRoundNumber = getRoundNumber(group.messages[0]?.message.metadata) ?? -1;
            const isStreamingRoundGroup = groupRoundNumber === _streamingRoundNumber;
            const isGroupRoundComplete = completedRoundNumbers.has(groupRoundNumber);

            // Skip if this is the streaming round (pending cards handles it)
            // Exception: If round is marked complete, render it here
            if (isStreamingRoundGroup && !isGroupRoundComplete) {
              return null;
            }

            const firstMessageId = group.messages[0]?.message.id || `group-${groupIndex}`;
            return (
              <ScrollAwareParticipant
                key={`assistant-group-${group.participantKey}-${group.messages[0]?.index}`}
                index={0}
                skipAnimation={!shouldAnimateMessage(firstMessageId)}
              >
                <AssistantGroupCard
                  group={group}
                  groupIndex={groupIndex}
                  findModel={findModel}
                  demoMode={demoMode}
                  hideMetadata={hideMetadata}
                  t={t}
                  keyForMessage={keyForMessage}
                  maxContentHeight={maxContentHeight}
                />
              </ScrollAwareParticipant>
            );
          }

          return null;
        })}

        {/* ✅ MODERATOR PLACEHOLDER: Show after all messageGroups when waiting for moderator
            This renders OUTSIDE the user-group to maintain correct order:
            User → Participants (messageGroups) → Moderator Placeholder
            The placeholder stays visible until moderator stream starts sending chunks

            ✅ FIX: Check for "all have visible content" instead of "all have finished"
            When participants have content, they render via messageGroups (not pending cards).
            The inside-user-group placeholder is hidden at that point, so we need to show
            this placeholder to maintain visibility during the transition. */}
        {(() => {
          // Find the latest round number
          const latestRound = Math.max(
            0,
            _streamingRoundNumber ?? 0,
            ...messages.map(m => getRoundNumber(m.metadata) ?? 0),
          );

          // Check if moderator message already exists for this round WITH CONTENT
          // Empty moderator placeholder (parts.length === 0 or only step-start) doesn't count
          // This ensures placeholder stays visible until moderator actually starts streaming content
          const hasModeratorWithContent = messages.some((m) => {
            const round = getRoundNumber(m.metadata);
            const isMod = m.metadata && typeof m.metadata === 'object'
              && 'isModerator' in m.metadata && m.metadata.isModerator === true;
            if (!isMod || round !== latestRound)
              return false;
            // Check if moderator has actual text content (not just step-start)
            const hasContent = m.parts?.some(p =>
              p.type === MessagePartTypes.TEXT && 'text' in p && (p.text as string)?.trim().length > 0,
            );
            return hasContent;
          });

          // ✅ FIX: Check if all participants have VISIBLE CONTENT (not finished)
          // This matches the inside-user-group placeholder logic at lines 1410-1414
          // When all have content, participants render via messageGroups, so this
          // placeholder should be visible to avoid a gap.
          const roundParticipantMessages = messages.filter((m) => {
            const round = getRoundNumber(m.metadata);
            const isMod = m.metadata && typeof m.metadata === 'object'
              && 'isModerator' in m.metadata && m.metadata.isModerator === true;
            return round === latestRound && m.role === MessageRoles.ASSISTANT && !isMod;
          });

          const enabledParticipants = getEnabledParticipants(participants);
          const participantMaps = buildParticipantMessageMaps(roundParticipantMessages);
          const allParticipantsHaveContent = allParticipantsHaveVisibleContent(participantMaps, enabledParticipants);

          // Show placeholder when:
          // 1. All participants have visible content (they render via messageGroups, not pending cards)
          // 2. Moderator doesn't have actual text content yet (even if streaming has started)
          // 3. Round isn't marked complete
          // 4. Moderator has been triggered (message exists in store)
          //
          // ✅ PLACEHOLDER TIMING FIX: This section coordinates with inside-user-group section
          // The inside-user-group handles moderator when: moderator message exists OR is streaming
          // This section handles the edge case where:
          // - Participants finished (render via messageGroups)
          // - Moderator hasn't been triggered yet (no message in store)
          // - Round not complete
          //
          // In practice, this section rarely renders because useModeratorTrigger adds the
          // moderator message placeholder as soon as participants complete, which triggers
          // the inside-user-group section to render it.
          const isRoundComplete = completedRoundNumbers.has(latestRound);

          // Check if moderator message exists for this round (with or without content)
          const hasModeratorMessage = messages.some((m) => {
            const round = getRoundNumber(m.metadata);
            const isMod = m.metadata && typeof m.metadata === 'object'
              && 'isModerator' in m.metadata && m.metadata.isModerator === true;
            return isMod && round === latestRound;
          });

          // ✅ DUPLICATE FIX: Don't render if inside-user-group is handling the moderator
          // Inside user-group handles moderator when: streaming round OR moderator message exists OR isModeratorStreaming
          // So this section only renders when inside-user-group isn't active
          const isStreamingRound = latestRound === _streamingRoundNumber;
          const insideUserGroupHandlesModerator = isStreamingRound || hasModeratorMessage || isModeratorStreaming;

          const shouldShowPlaceholder = !insideUserGroupHandlesModerator
            && allParticipantsHaveContent
            && !hasModeratorWithContent
            && !isRoundComplete
            && enabledParticipants.length > 0;

          if (!shouldShowPlaceholder) {
            return null;
          }

          return (
            <div className="mt-8">
              <ScrollAwareParticipant
                key={`moderator-pending-after-groups-${latestRound}`}
                index={enabledParticipants.length}
                skipAnimation={!shouldAnimateMessage(`moderator-pending-${latestRound}`)}
                enableScrollEffect
              >
                <ParticipantMessageWrapper
                  participantIndex={MODERATOR_PARTICIPANT_INDEX}
                  model={undefined}
                  status={MessageStatuses.PENDING}
                  parts={[]}
                  isAccessible={true}
                  loadingText={tParticipant('moderatorObserving')}
                  maxContentHeight={maxContentHeight}
                  avatarSrc={BRAND.logos.main}
                  avatarName={MODERATOR_NAME}
                  displayName={MODERATOR_NAME}
                />
              </ScrollAwareParticipant>
            </div>
          );
        })()}
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
    // ✅ MODERATOR FIX: Also check during moderator streaming for gradual UI updates
    const isAnyStreaming = nextProps.isStreaming || nextProps.isModeratorStreaming;
    if (isAnyStreaming && nextProps.messages.length > 0) {
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

    // ✅ BUG FIX: Re-render if completedRoundNumbers changes (new summaries completed)
    if (prevProps.completedRoundNumbers !== nextProps.completedRoundNumbers) {
      return false;
    }

    // ✅ MODERATOR FLAG: Re-render if moderator streaming state changes
    // Moderator now renders through normal messageGroups path via messages array
    if (prevProps.isModeratorStreaming !== nextProps.isModeratorStreaming) {
      return false;
    }

    // Re-render if roundNumber changes
    if (prevProps.roundNumber !== nextProps.roundNumber) {
      return false;
    }

    // Skip re-render - no meaningful changes
    return true;
  },
);

ChatMessageList.displayName = 'ChatMessageList';
ParticipantHeader.displayName = 'ParticipantHeader';
ParticipantMessageWrapper.displayName = 'ParticipantMessageWrapper';
