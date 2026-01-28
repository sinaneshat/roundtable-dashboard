import type { MessageStatus } from '@roundtable/shared';
import { FinishReasons, isAvailableSource, isCompletionFinishReason, MessagePartTypes, MessageRoles, MessageStatuses, MODERATOR_NAME, MODERATOR_PARTICIPANT_INDEX } from '@roundtable/shared';
import type { UIMessage } from 'ai';
import { memo, useMemo, useRef } from 'react';
import Markdown from 'react-markdown';

import type { MessageAttachment } from '@/components/chat/message-attachment-preview';
import { MessageAttachmentPreview } from '@/components/chat/message-attachment-preview';
import { ModelMessageCard } from '@/components/chat/model-message-card';
import { ParticipantHeader } from '@/components/chat/participant-header';
import { PreSearchCard } from '@/components/chat/pre-search-card';
import { LazyStreamdown } from '@/components/markdown/lazy-streamdown';
import { streamdownComponents } from '@/components/markdown/unified-markdown-components';
import { ScrollAwareParticipant, ScrollAwareUserMessage, ScrollFromTop } from '@/components/ui/motion';
import { BRAND } from '@/constants';
import { useModelLookup } from '@/hooks/utils';
import { useTranslations } from '@/lib/i18n';
import type { FilePart, MessagePart } from '@/lib/schemas/message-schemas';
import { getUploadIdFromFilePart, isFilePart } from '@/lib/schemas/message-schemas';
import { cn } from '@/lib/ui/cn';
import { allParticipantsHaveVisibleContent, buildParticipantMessageMaps, getAvailableSources, getAvatarPropsFromModelId, getEnabledParticipants, getMessageMetadata, getMessageStatus, getModeratorMetadata, getParticipantMessageFromMaps, getRoundNumber, getUserMetadata, isModeratorMessage, isPreSearch as isPreSearchMessage, isPreSearchFast, participantHasVisibleContent } from '@/lib/utils';
import { rlog } from '@/lib/utils/dev-logger';
import type { ApiParticipant, AvailableSource, DbMessageMetadata, Model, StoredPreSearch } from '@/services/api';
import { isAssistantMessageMetadata } from '@/services/api';

const EMPTY_PARTICIPANTS: ApiParticipant[] = [];
const EMPTY_PRE_SEARCHES: StoredPreSearch[] = [];

type ParticipantInfo = {
  participantIndex: number | undefined;
  modelId: string | undefined;
  role: string | null | undefined;
  isStreaming: boolean;
};

type MessageGroup
  = | {
    type: 'user-group';
    messages: { message: UIMessage; index: number }[];
    headerInfo: {
      avatarSrc: string;
      avatarName: string;
      displayName: string;
    };
  }
  | {
    type: 'assistant-group';
    participantKey: string;
    messages: {
      message: UIMessage;
      index: number;
      participantInfo: ParticipantInfo;
    }[];
    headerInfo: {
      avatarSrc: string;
      avatarName: string;
      displayName: string;
      role: string | null;
      requiredTierName?: string;
      isAccessible: boolean;
    };
  };

type ParticipantMessageWrapperProps = {
  participant?: ApiParticipant;
  participantIndex: number;
  model: Model | undefined;
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
  /** Hide action buttons (for moderator where council actions handle it) */
  hideActions?: boolean;
  /**
   * Fallback sources from other participants in the round
   * Used during streaming when this participant's metadata isn't populated yet
   */
  groupAvailableSources?: AvailableSource[];
  /** Skip opacity transitions for SSR/read-only pages to prevent hydration delay */
  skipTransitions?: boolean;
};

const ParticipantMessageWrapper = memo(({
  avatarName: avatarNameOverride,
  avatarSrc: avatarSrcOverride,
  displayName: displayNameOverride,
  groupAvailableSources,
  hideActions = false,
  isAccessible,
  loadingText,
  maxContentHeight,
  messageId,
  metadata,
  model,
  participant,
  participantIndex,
  parts,
  skipTransitions = false,
  status,
}: ParticipantMessageWrapperProps) => {
  const defaultAvatarProps = participant
    ? getAvatarPropsFromModelId(MessageRoles.ASSISTANT, participant.modelId, null, 'AI')
    : { name: 'AI', src: '' };

  const avatarSrc = avatarSrcOverride ?? defaultAvatarProps.src;
  const avatarName = avatarNameOverride ?? defaultAvatarProps.name;
  const displayName = displayNameOverride ?? model?.name ?? participant?.modelId ?? 'AI Assistant';
  const isStreaming = status === MessageStatuses.STREAMING || status === MessageStatuses.PENDING;
  const assistantMetadata = metadata && isAssistantMessageMetadata(metadata) ? metadata : null;
  const hasError = status === MessageStatuses.FAILED || assistantMetadata?.hasError;

  return (
    <div className="flex justify-start min-w-0">
      <div className="w-full min-w-0">
        <ParticipantHeader
          avatarSrc={avatarSrc}
          avatarName={avatarName}
          displayName={displayName}
          role={participant?.role}
          requiredTierName={model?.required_tier_name ?? undefined}
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
          hideActions={hideActions}
          loadingText={loadingText}
          maxContentHeight={maxContentHeight}
          groupAvailableSources={groupAvailableSources}
          skipTransitions={skipTransitions}
        />
      </div>
    </div>
  );
});

function AssistantGroupCard({
  demoMode,
  findModel,
  group,
  groupIndex: _groupIndex,
  hideMetadata,
  isReadOnly = false,
  keyForMessage,
  maxContentHeight,
  roundAvailableSources,
  skipTransitions = false,
  t,
}: {
  group: Extract<MessageGroup, { type: 'assistant-group' }>;
  groupIndex: number;
  findModel: (modelId?: string) => Model | undefined;
  demoMode: boolean;
  hideMetadata: boolean;
  t: (key: string) => string;
  keyForMessage: (message: UIMessage, index: number) => string;
  maxContentHeight?: number;
  roundAvailableSources?: AvailableSource[];
  skipTransitions?: boolean;
  isReadOnly?: boolean;
}) {
  const hasStreamingMessage = group.messages.some(({ participantInfo }) => participantInfo.isStreaming);
  const hasErrorMessage = group.messages.some(({ message }) => {
    const metadata = getMessageMetadata(message.metadata);
    const assistantMetadata = metadata && isAssistantMessageMetadata(metadata) ? metadata : null;
    return assistantMetadata?.hasError;
  });

  const groupAvailableSources = useMemo((): AvailableSource[] | undefined => {
    const allSources = new Map<string, AvailableSource>();
    for (const { message } of group.messages) {
      const availableSourcesFromMsg = getAvailableSources(message.metadata);
      if (availableSourcesFromMsg) {
        for (const source of availableSourcesFromMsg) {
          // ✅ ZOD VALIDATION: Use type guard instead of cast
          if (source.id && !allSources.has(source.id) && isAvailableSource(source)) {
            allSources.set(source.id, source);
          }
        }
      }
    }
    return allSources.size > 0 ? Array.from(allSources.values()) : roundAvailableSources;
  }, [group.messages, roundAvailableSources]);

  return (
    <div
      key={`assistant-group-${group.participantKey}-${group.messages[0]?.index}`}
      className="flex justify-start min-w-0"
    >
      <div className="w-full min-w-0">
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
          {group.messages.map(({ index, message, participantInfo }) => {
            const messageKey = keyForMessage(message, index);
            const metadata = getMessageMetadata(message.metadata);
            const model = findModel(participantInfo.modelId);
            const isAccessible = demoMode || (model?.is_accessible_to_user ?? true);

            const safeParts = message.parts || [];
            // ✅ V8 FIX: Include REASONING type for models like Gemini Flash
            const hasTextContent = safeParts.some(p => p && (p.type === MessagePartTypes.TEXT || p.type === MessagePartTypes.REASONING) && p.text?.trim().length > 0);
            const hasToolCalls = safeParts.some(p => p && p.type === MessagePartTypes.TOOL_CALL);
            const hasAnyContent = hasTextContent || hasToolCalls;

            const messageStatus: MessageStatus = getMessageStatus({
              hasAnyContent,
              isStreaming: participantInfo.isStreaming,
              message,
            });

            /**
             * ✅ AI SDK INTEROP CAST - Required for UIMessage part filtering
             *
             * WHY CAST IS NECESSARY:
             * - AI SDK's UIMessagePart includes dynamic-tool, step-start, and other types
             * - Our MessagePart schema covers only the subset we render
             * - Filter reduces to matching types, but TypeScript can't narrow array element types
             * - Components downstream expect MessagePart[], not UIMessagePart[]
             */
            const filteredParts = safeParts
              .filter(p =>
                !!p && (p.type === MessagePartTypes.TEXT
                  || p.type === MessagePartTypes.REASONING
                  || p.type === MessagePartTypes.TOOL_CALL
                  || p.type === MessagePartTypes.TOOL_RESULT),
              ) as MessagePart[];
            const sourceParts = safeParts.filter(p =>
              p
              && 'type' in p
              && (p.type === MessagePartTypes.SOURCE_URL || p.type === MessagePartTypes.SOURCE_DOCUMENT),
            );
            const isModerator = participantInfo.participantIndex === MODERATOR_PARTICIPANT_INDEX;

            return (
              <div key={messageKey}>
                <ModelMessageCard
                  messageId={message.id}
                  model={model}
                  role={participantInfo.role || ''}
                  participantIndex={participantInfo.participantIndex ?? 0}
                  status={messageStatus}
                  parts={filteredParts}
                  avatarSrc={group.headerInfo.avatarSrc}
                  avatarName={group.headerInfo.avatarName}
                  metadata={hideMetadata ? null : (metadata ?? null)}
                  isAccessible={isAccessible}
                  hideInlineHeader
                  hideAvatar
                  hideActions={isModerator || demoMode || isReadOnly}
                  maxContentHeight={maxContentHeight}
                  loadingText={isModerator ? t('chat.participant.moderatorObserving') : undefined}
                  groupAvailableSources={groupAvailableSources}
                  skipTransitions={skipTransitions}
                />
                {sourceParts.length > 0 && (
                  <div className="mt-2 ml-12 space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">{t('chat.sources.title')}</p>
                    <div className="space-y-1">
                      {sourceParts.map((sourcePart) => {
                        if ('type' in sourcePart && sourcePart.type === MessagePartTypes.SOURCE_URL && 'url' in sourcePart && typeof sourcePart.url === 'string') {
                          return (
                            <div key={`${message.id}-source-${sourcePart.url}`} className="text-xs">
                              <a
                                href={sourcePart.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline flex items-center gap-1"
                              >
                                <span>{('title' in sourcePart && typeof sourcePart.title === 'string' ? sourcePart.title : null) || sourcePart.url}</span>
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
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

function getParticipantInfoForMessage({
  currentParticipantIndex,
  currentStreamingParticipant,
  isGlobalStreaming,
  isModeratorStreaming = false,
  message,
  messageIndex,
  participants,
  totalMessages,
}: {
  message: UIMessage;
  messageIndex: number;
  totalMessages: number;
  isGlobalStreaming: boolean;
  currentParticipantIndex: number;
  participants: ApiParticipant[];
  currentStreamingParticipant: ApiParticipant | null;
  isModeratorStreaming?: boolean;
}): {
  participantIndex: number;
  modelId: string | undefined;
  role: string | null;
  isStreaming: boolean;
} {
  const metadata = getMessageMetadata(message.metadata);
  const assistantMetadata = metadata && isAssistantMessageMetadata(metadata) ? metadata : null;

  const hasVisibleContent = message.parts?.some(
    p =>
      (p.type === MessagePartTypes.TEXT && 'text' in p && typeof p.text === 'string' && p.text.trim().length > 0)
      || p.type === MessagePartTypes.TOOL_CALL
      || p.type === MessagePartTypes.REASONING,
  ) ?? false;

  const isModerator = isModeratorMessage(message);

  if (hasVisibleContent) {
    const fallbackParticipant = participants[currentParticipantIndex];
    const finishReason = assistantMetadata?.finishReason;
    const hasActuallyFinished = isCompletionFinishReason(finishReason);
    return {
      isStreaming: !hasActuallyFinished,
      modelId: assistantMetadata?.model || fallbackParticipant?.modelId,
      participantIndex: assistantMetadata?.participantIndex ?? currentParticipantIndex,
      role: assistantMetadata?.participantRole || fallbackParticipant?.role || null,
    };
  }

  const isLastMessage = messageIndex === totalMessages - 1;
  const isThisMessageStreaming = !hasVisibleContent && isGlobalStreaming && isLastMessage && message.role === MessageRoles.ASSISTANT;

  if (isThisMessageStreaming) {
    const participant = participants[currentParticipantIndex] || currentStreamingParticipant;
    return {
      isStreaming: true,
      modelId: participant?.modelId || assistantMetadata?.model,
      participantIndex: currentParticipantIndex,
      role: participant?.role || assistantMetadata?.participantRole || null,
    };
  }

  if (isModerator && isModeratorStreaming && !hasVisibleContent) {
    return {
      isStreaming: true,
      modelId: assistantMetadata?.model,
      participantIndex: MODERATOR_PARTICIPANT_INDEX,
      role: null,
    };
  }

  const fallbackParticipantIndex = assistantMetadata?.participantIndex ?? currentParticipantIndex;
  const fallbackParticipant = participants[fallbackParticipantIndex];

  return {
    isStreaming: false,
    modelId: assistantMetadata?.model || fallbackParticipant?.modelId,
    participantIndex: fallbackParticipantIndex,
    role: assistantMetadata?.participantRole || fallbackParticipant?.role || null,
  };
}

const EMPTY_COMPLETED_ROUNDS = new Set<number>();

type ChatMessageListProps = {
  messages: UIMessage[];
  user?: {
    name: string;
    image: string | null;
  } | null;
  participants?: ApiParticipant[];
  hideMetadata?: boolean;
  isLoading?: boolean;
  isStreaming?: boolean;
  currentStreamingParticipant?: ApiParticipant | null;
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
  /**
   * Read-only mode - skips models API call. Used for public/shared threads.
   */
  isReadOnly?: boolean;
};
export const ChatMessageList = memo(
  ({
    completedRoundNumbers = EMPTY_COMPLETED_ROUNDS,
    currentParticipantIndex = 0,
    currentStreamingParticipant = null,
    demoMode = false,
    demoPreSearchOpen,
    hideMetadata = false,
    isLoading: _isLoading = false,
    isModeratorStreaming = false,
    isReadOnly = false,
    isStreaming = false,
    maxContentHeight,
    messages,
    participants = EMPTY_PARTICIPANTS,
    preSearches: _preSearches = EMPTY_PRE_SEARCHES,
    roundNumber: _roundNumber,
    skipEntranceAnimations = false,
    streamingRoundNumber: _streamingRoundNumber = null,
    threadId: _threadId,
    user = null,
    userAvatar,
  }: ChatMessageListProps) => {
    const t = useTranslations();
    const { findModel } = useModelLookup({ enabled: !isReadOnly });
    const userInfo = useMemo(() => user || { image: null, name: 'User' }, [user]);
    const userAvatarSrc = userAvatar?.src || userInfo.image || '';
    const userAvatarName = userAvatar?.name || userInfo.name;

    // Debug logging for message list render
    rlog.msg('list-render', `round=${_roundNumber ?? '-'} msgs=${messages.length} parts=${participants.length} readonly=${isReadOnly ? 1 : 0}`);

    // ✅ POST-MODERATOR FLASH FIX: Track rounds that were visible during streaming
    // When content transitions from pending cards to messageGroups, we must skip
    // entrance animations because the content was already visible.
    // Track which rounds have been rendered (their content was visible to user)
    const renderedRoundsRef = useRef<Set<number>>(new Set());

    // Mark current streaming round as "rendered" (content is visible via pending cards)
    if (_streamingRoundNumber !== null) {
      renderedRoundsRef.current.add(_streamingRoundNumber);
    }

    // ✅ ANIMATION: Using whileInView for scroll-triggered animations
    // The viewport={{ once: true }} in motion components handles "don't re-animate"
    // So we always return true here unless explicitly disabled
    //
    // ✅ OPTIMISTIC MESSAGE FIX: Skip animation for optimistic user messages
    // Optimistic messages are added when user submits a new round. Since there's
    // no auto-scroll (by design), the new message may be outside the viewport.
    // whileInView animation wouldn't trigger, leaving the message at opacity:0.
    // By skipping animation for optimistic messages, they appear immediately.
    const shouldAnimateMessage = (messageId: string): boolean => {
      // Skip all animations when explicitly requested (e.g., demo already completed)
      if (skipEntranceAnimations) {
        return false;
      }
      // ✅ FIX: Skip animation for optimistic messages (appear immediately)
      // Optimistic messages have IDs starting with 'optimistic-'
      // These are user messages just submitted - they should be visible immediately
      if (messageId.startsWith('optimistic-')) {
        return false;
      }
      // Always animate - whileInView with once:true handles scroll trigger
      return true;
    };

    // Deduplication: Prevent duplicate message IDs, filter participant triggers, deduplicate by (roundNumber, participantIndex/modelId)
    const deduplicatedMessages = useMemo(() => {
      const seenMessageIds = new Set<string>();
      const assistantKeyToIdx = new Map<string, number>();
      const moderatorRoundToIdx = new Map<number, number>();
      const userRoundToIdx = new Map<number, number>();
      const result: UIMessage[] = [];

      for (const message of messages) {
        if (seenMessageIds.has(message.id)) {
          continue;
        }

        if (message.role === MessageRoles.USER) {
          const userMeta = getUserMetadata(message.metadata);
          const isParticipantTrigger = userMeta && typeof userMeta === 'object' && 'isParticipantTrigger' in userMeta && (userMeta as { isParticipantTrigger?: boolean }).isParticipantTrigger === true;

          if (isParticipantTrigger) {
            continue;
          }
          const roundNum = userMeta?.roundNumber;
          if (roundNum !== undefined && roundNum !== null) {
            const existingIdx = userRoundToIdx.get(roundNum);
            if (existingIdx !== undefined) {
              // ✅ FIX: Also prefer messages WITH file parts over text-only duplicates
              // This handles AI SDK creating duplicate user messages with random IDs
              const existingMsg = result[existingIdx];
              const existingHasFiles = existingMsg?.parts?.some(p => p.type === 'file');
              const currentHasFiles = message.parts?.some(p => p.type === 'file');

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
              // ✅ FIX: If current has files but existing doesn't, replace
              // This ensures file attachments are preserved even with random IDs
              if (currentHasFiles && !existingHasFiles) {
                result[existingIdx] = message;
                seenMessageIds.add(message.id);
                continue;
              }
              // Skip this duplicate (existing has files or neither has files)
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

    // ============================================================================
    // PERFORMANCE OPTIMIZATION: Split message processing into stable vs dynamic
    // ============================================================================
    //
    // Previously, ALL messages recalculated when transient state changed (37-70×/round).
    // Now we use a cache for completed messages (frozen metadata) and only recalculate
    // streaming messages when their state changes.
    //
    // Cache key: message.id + finishReason (stable once complete)
    // Cache invalidation: Only when message content actually changes

    // ✅ PERF: Cache for completed message participant info (frozen once set)
    const completedMessageCacheRef = useRef<Map<string, {
      isStreaming: boolean;
      modelId: string | undefined;
      participantIndex: number;
      role: string | null | undefined;
    } | null>>(new Map());

    // ✅ PERF: Track which message IDs we've logged for raw detection (avoid spam)
    const loggedRawDetectRef = useRef<Set<string>>(new Set());

    // ✅ PERF: Stable memo for completed messages - ONLY depends on deduplicatedMessages
    // Completed messages have frozen metadata and never change
    const completedMessageInfo = useMemo(() => {
      const cache = completedMessageCacheRef.current;
      const results = new Map<string, {
        isStreaming: boolean;
        modelId: string | undefined;
        participantIndex: number;
        role: string | null | undefined;
      } | null>();

      for (const message of deduplicatedMessages) {
        // User messages - always null, cache it
        if (message.role === MessageRoles.USER) {
          results.set(message.id, null);
          continue;
        }

        // Check if already cached with finishReason (fully complete)
        const cacheKey = message.id;
        const cached = cache.get(cacheKey);
        if (cached !== undefined) {
          // Verify it's still complete (has finishReason in cache means it won't change)
          const metadata = getMessageMetadata(message.metadata);
          const assistantMetadata = metadata && isAssistantMessageMetadata(metadata) ? metadata : null;
          if (assistantMetadata?.finishReason && isCompletionFinishReason(assistantMetadata.finishReason)) {
            results.set(message.id, cached);
            continue;
          }
        }

        // Check raw metadata for moderator
        const rawMeta = message.metadata as Record<string, unknown> | null | undefined;
        const isModeratorRaw = rawMeta && typeof rawMeta === 'object' && 'isModerator' in rawMeta && rawMeta.isModerator === true;

        if (isModeratorRaw || isModeratorMessage(message)) {
          const moderatorMeta = getModeratorMetadata(message.metadata);
          const finishReason = moderatorMeta && typeof moderatorMeta === 'object' && 'finishReason' in moderatorMeta
            ? (moderatorMeta as { finishReason?: string }).finishReason
            : undefined;
          const hasActuallyFinished = isCompletionFinishReason(finishReason);

          if (hasActuallyFinished) {
            // Completed moderator - cache it
            const modelId = moderatorMeta && typeof moderatorMeta === 'object' && 'model' in moderatorMeta
              ? (moderatorMeta as { model?: string }).model
              : (rawMeta && 'model' in rawMeta ? String(rawMeta.model) : undefined);

            const info = {
              isStreaming: false,
              modelId,
              participantIndex: MODERATOR_PARTICIPANT_INDEX,
              role: null as string | null,
            };
            cache.set(cacheKey, info);
            results.set(message.id, info);
            continue;
          }
          // Streaming moderator - mark as needing dynamic calculation
          results.set(message.id, undefined as unknown as null); // undefined = needs dynamic calc
          continue;
        }

        // Check for completed participant message
        const metadata = getMessageMetadata(message.metadata);
        const assistantMetadata = metadata && isAssistantMessageMetadata(metadata) ? metadata : null;
        const finishReason = assistantMetadata?.finishReason;
        const hasActualFinishReason = isCompletionFinishReason(finishReason);
        const isComplete = !!(assistantMetadata?.model && hasActualFinishReason);

        if (isComplete && assistantMetadata) {
          const info = {
            isStreaming: false,
            modelId: assistantMetadata.model,
            participantIndex: assistantMetadata.participantIndex,
            role: assistantMetadata.participantRole,
          };
          cache.set(cacheKey, info);
          results.set(message.id, info);
          continue;
        }

        // Not complete - needs dynamic calculation
        results.set(message.id, undefined as unknown as null);
      }

      return results;
    }, [deduplicatedMessages]);

    // ✅ PERF: Dynamic memo for streaming messages - depends on transient state
    // Only recalculates for messages that aren't in completedMessageInfo
    const messagesWithParticipantInfo = useMemo(() => {
      return deduplicatedMessages.map((message, index) => {
        // Check if we have cached info for this message
        const cachedInfo = completedMessageInfo.get(message.id);

        // User messages
        if (message.role === MessageRoles.USER) {
          return { index, message, participantInfo: null };
        }

        // Completed messages - use cached info
        if (cachedInfo !== undefined && cachedInfo !== null) {
          return { index, message, participantInfo: cachedInfo };
        }

        // ============================================================
        // DYNAMIC CALCULATION - Only for streaming/incomplete messages
        // ============================================================

        const rawMeta = message.metadata as Record<string, unknown> | null | undefined;
        const isModeratorRaw = rawMeta && typeof rawMeta === 'object' && 'isModerator' in rawMeta && rawMeta.isModerator === true;

        if (isModeratorRaw || isModeratorMessage(message)) {
          const moderatorMeta = getModeratorMetadata(message.metadata);
          const finishReason = moderatorMeta && typeof moderatorMeta === 'object' && 'finishReason' in moderatorMeta
            ? (moderatorMeta as { finishReason?: string }).finishReason
            : undefined;
          const hasActuallyFinished = isCompletionFinishReason(finishReason);
          const modelId = moderatorMeta && typeof moderatorMeta === 'object' && 'model' in moderatorMeta
            ? (moderatorMeta as { model?: string }).model
            : (rawMeta && 'model' in rawMeta ? String(rawMeta.model) : undefined);

          const isStillStreaming = isModeratorStreaming && !hasActuallyFinished;

          // ✅ PERF: Only log once per message ID to avoid spam
          if (isModeratorRaw && !isModeratorMessage(message) && !loggedRawDetectRef.current.has(message.id)) {
            loggedRawDetectRef.current.add(message.id);
            const roundNum = rawMeta && 'roundNumber' in rawMeta ? rawMeta.roundNumber : '?';
            rlog.moderator('UI-raw-detect', `r${roundNum} - streaming placeholder detected via raw metadata`);
          }

          return {
            index,
            message,
            participantInfo: {
              isStreaming: isStillStreaming,
              modelId,
              participantIndex: MODERATOR_PARTICIPANT_INDEX,
              role: null,
            },
          };
        }

        // Streaming participant message - needs dynamic info
        const participantInfo = getParticipantInfoForMessage({
          currentParticipantIndex,
          currentStreamingParticipant,
          isGlobalStreaming: isStreaming,
          isModeratorStreaming,
          message,
          messageIndex: index,
          participants,
          totalMessages: deduplicatedMessages.length,
        });

        return { index, message, participantInfo };
      });
    }, [deduplicatedMessages, completedMessageInfo, isStreaming, currentParticipantIndex, participants, currentStreamingParticipant, isModeratorStreaming]);

    const allStreamingRoundParticipantsHaveContent = useMemo(() => {
      if (_streamingRoundNumber === null || participants.length === 0) {
        return false;
      }

      // Get assistant messages for the streaming round
      const streamingRoundMessages = deduplicatedMessages.filter((m) => {
        if (m.role === MessageRoles.USER) {
          return false;
        }
        const roundNum = getRoundNumber(m.metadata);
        return roundNum === _streamingRoundNumber;
      });

      const participantMaps = buildParticipantMessageMaps(streamingRoundMessages);
      const enabledParticipants = getEnabledParticipants(participants);

      return allParticipantsHaveVisibleContent(participantMaps, enabledParticipants);
    }, [deduplicatedMessages, _streamingRoundNumber, participants]);

    // ✅ PERF: Track logged group calculations to avoid spam
    const loggedGroupCalcRef = useRef<{ round: number | null; count: number }>({ count: 0, round: null });

    const messageGroups = useMemo((): MessageGroup[] => {
      const groups: MessageGroup[] = [];
      let currentAssistantGroup: Extract<MessageGroup, { type: 'assistant-group' }> | null = null;
      let currentUserGroup: Extract<MessageGroup, { type: 'user-group' }> | null = null;

      // ✅ PERF: Only log once per round change, not on every recalculation
      const streamingMsgs = messagesWithParticipantInfo.filter((m) => {
        const raw = m.message.metadata as Record<string, unknown> | null | undefined;
        return raw && 'isStreaming' in raw && raw.isStreaming === true;
      });
      if (streamingMsgs.length > 0) {
        const shouldLog = loggedGroupCalcRef.current.round !== _streamingRoundNumber
          || loggedGroupCalcRef.current.count < 2; // Log first 2 calcs per round only
        if (shouldLog) {
          loggedGroupCalcRef.current = {
            count: loggedGroupCalcRef.current.round === _streamingRoundNumber
              ? loggedGroupCalcRef.current.count + 1
              : 1,
            round: _streamingRoundNumber,
          };
          rlog.phase('UI-groups-in', `r=${_streamingRoundNumber} total=${messagesWithParticipantInfo.length} streamingPlaceholders=${streamingMsgs.length} hasParticipantInfo=${streamingMsgs.filter(m => m.participantInfo !== null).length}`);
        }
      }

      for (const { index, message, participantInfo } of messagesWithParticipantInfo) {
        // BUG FIX: Use BOTH Zod validation AND fast check for pre-search detection
        // Fast check handles cases where Zod validation fails due to partial/mismatched metadata
        const isPreSearch = isPreSearchMessage(message.metadata) || isPreSearchFast(message);
        if (isPreSearch) {
          continue;
        }

        if (message.role === MessageRoles.USER) {
          if (currentAssistantGroup) {
            groups.push(currentAssistantGroup);
            currentAssistantGroup = null;
          }

          if (!currentUserGroup) {
            currentUserGroup = {
              headerInfo: {
                avatarName: userAvatarName,
                avatarSrc: userAvatarSrc,
                displayName: userAvatarName,
              },
              messages: [{ index, message }],
              type: 'user-group',
            };
          } else {
            currentUserGroup.messages.push({ index, message });
          }
          continue;
        }

        // Check for streaming placeholder - use RAW metadata, not parsed
        // getMessageMetadata uses schema parsing which fails for streaming placeholders
        // because isStreaming isn't in DbMessageMetadataSchema
        const rawMeta = message.metadata as Record<string, unknown> | null | undefined;
        const isStreamingPlaceholder = rawMeta && typeof rawMeta === 'object' && 'isStreaming' in rawMeta && rawMeta.isStreaming === true;

        // ✅ FIX: For streaming placeholders without participantInfo (stale props issue),
        // create fallback participantInfo from raw message metadata
        let effectiveParticipantInfo = participantInfo;
        if (!participantInfo && isStreamingPlaceholder && rawMeta) {
          // Extract participant info from streaming placeholder raw metadata
          const pIdx = typeof rawMeta.participantIndex === 'number' ? rawMeta.participantIndex : undefined;
          const modelId = typeof rawMeta.model === 'string' ? rawMeta.model : undefined;
          const role = typeof rawMeta.participantRole === 'string' ? rawMeta.participantRole : null;
          const roundNum = typeof rawMeta.roundNumber === 'number' ? rawMeta.roundNumber : undefined;

          if (pIdx !== undefined) {
            effectiveParticipantInfo = {
              isStreaming: true,
              modelId,
              participantIndex: pIdx,
              role,
            };
            rlog.phase('UI-fallback', `r${roundNum} pIdx=${pIdx} model=${modelId?.slice(-15)} - created fallback participantInfo from raw metadata`);
          }
        }

        if (!effectiveParticipantInfo) {
          continue;
        }

        const messageMetadata = getMessageMetadata(message.metadata);
        const messageRoundNumber = getRoundNumber(messageMetadata);
        const isCurrentStreamingRound = messageRoundNumber === _streamingRoundNumber;
        const messageIsModerator = isModeratorMessage(message);

        // ✅ FIX: Don't skip messages that already have visible content
        // During P0→P1 handoff, P0's completed message should stay visible
        // Only skip empty placeholder messages, not completed participant responses
        const messageHasContent = message.parts?.some(p =>
          (p.type === 'text' && 'text' in p && typeof p.text === 'string' && p.text.trim().length > 0)
          || p.type === 'reasoning',
        ) ?? false;

        // Don't skip streaming placeholders - they should show with shimmer
        // isStreamingPlaceholder already computed above
        if (isStreaming && isCurrentStreamingRound && !allStreamingRoundParticipantsHaveContent && !messageIsModerator && !messageHasContent && !isStreamingPlaceholder) {
          continue;
        }

        if (currentUserGroup) {
          groups.push(currentUserGroup);
          currentUserGroup = null;
        }

        const isModerator = effectiveParticipantInfo.participantIndex === MODERATOR_PARTICIPANT_INDEX;
        const metadata = getMessageMetadata(message.metadata);
        const model = findModel(effectiveParticipantInfo.modelId);
        const isAccessible = demoMode || (model?.is_accessible_to_user ?? true);

        let avatarSrc: string;
        let avatarName: string;
        let displayName: string;
        let requiredTierName: string | undefined;

        if (isModerator) {
          avatarSrc = BRAND.logos.main;
          avatarName = MODERATOR_NAME;
          displayName = MODERATOR_NAME;
          requiredTierName = undefined;
        } else {
          const avatarProps = getAvatarPropsFromModelId(
            MessageRoles.ASSISTANT,
            effectiveParticipantInfo.modelId,
            userInfo.image,
            userInfo.name,
          );
          avatarSrc = avatarProps.src;
          avatarName = avatarProps.name;
          const assistantMetadata = metadata && isAssistantMessageMetadata(metadata) ? metadata : null;
          displayName = model?.name || assistantMetadata?.model || 'AI Assistant';
          requiredTierName = model?.required_tier_name ?? undefined;
        }

        const participantKey = `${effectiveParticipantInfo.participantIndex}-${effectiveParticipantInfo.modelId || 'unknown'}`;

        if (
          currentAssistantGroup
          && currentAssistantGroup.participantKey === participantKey
        ) {
          // Same participant, add to current group
          currentAssistantGroup.messages.push({
            index,
            message,
            participantInfo: effectiveParticipantInfo,
          });
        } else {
          // Different participant or first assistant message
          if (currentAssistantGroup) {
            groups.push(currentAssistantGroup);
          }

          currentAssistantGroup = {
            headerInfo: {
              avatarName,
              avatarSrc,
              displayName,
              isAccessible,
              requiredTierName,
              role: effectiveParticipantInfo.role ?? null,
            },
            messages: [{ index, message, participantInfo: effectiveParticipantInfo }],
            participantKey,
            type: 'assistant-group',
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
      const roundGroups = messageGroupsByRound.get(roundNumber);
      if (roundGroups) {
        roundGroups.push(group);
      }
    });

    return (
      <div className="touch-pan-y space-y-14">
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
              <div key={`user-group-wrapper-${group.messages[0]?.index}`}>
                {/* User messages - right-aligned bubbles, no avatar/name */}
                <div className="flex flex-col items-end gap-2">
                  {group.messages.map(({ index, message }) => {
                    const messageKey = keyForMessage(message, index);

                    // Extract file attachments and text parts separately
                    // ✅ TYPE-SAFE: Use isFilePart type guard for proper narrowing
                    const fileAttachments: MessageAttachment[] = message.parts
                      .filter((part): part is FilePart => isFilePart(part))
                      .map((filePart) => {
                        // Conditionally build object to satisfy exactOptionalPropertyTypes
                        const attachment: MessageAttachment = { url: filePart.url };
                        if (filePart.filename !== undefined) {
                          attachment.filename = filePart.filename;
                        }
                        if (filePart.mediaType !== undefined) {
                          attachment.mediaType = filePart.mediaType;
                        }
                        const uploadId = getUploadIdFromFilePart(filePart);
                        if (uploadId !== null) {
                          attachment.uploadId = uploadId;
                        }
                        return attachment;
                      });

                    const textParts = message.parts.filter(
                      part => part.type === MessagePartTypes.TEXT,
                    );

                    // ✅ FIX: Skip animation for ALL user messages in non-initial rounds
                    // Not just optimistic messages - because when the DB ID replaces the
                    // optimistic ID, we don't want the component to remount with opacity:0
                    const skipUserMsgAnimation = roundNumber > 0 || !shouldAnimateMessage(message.id);

                    return (
                      <ScrollAwareUserMessage
                        key={messageKey}
                        skipAnimation={skipUserMsgAnimation}
                        enableScrollEffect
                        className="w-full"
                      >
                        <div
                          dir="auto"
                          className={cn(
                            'max-w-[85%] ml-auto w-fit min-w-0 overflow-hidden',
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

                          {/* Text content - use ReactMarkdown for SSR/read-only, Streamdown for interactive */}
                          {textParts.map((part) => {
                            if (part.type === MessagePartTypes.TEXT) {
                              return (isReadOnly || skipEntranceAnimations)
                                ? (
                                    // SSR: Direct import renders synchronously - no hydration flash
                                    <Markdown
                                      key={`${message.id}-text-${part.text.substring(0, 20)}`}
                                      components={streamdownComponents}
                                    >
                                      {part.text}
                                    </Markdown>
                                  )
                                : (
                                    <LazyStreamdown
                                      key={`${message.id}-text-${part.text.substring(0, 20)}`}
                                      className="[&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
                                      components={streamdownComponents}
                                    >
                                      {part.text}
                                    </LazyStreamdown>
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
                {/* ✅ mt-14 provides consistent spacing from user message content to PreSearchCard */}
                {/* ✅ ScrollFromTop wraps card for scroll-triggered slide-down animation */}
                {preSearch && _threadId && (
                  <ScrollFromTop
                    skipAnimation={skipEntranceAnimations}
                    className="mt-14"
                  >
                    <PreSearchCard
                      key={`pre-search-${roundNumber}`}
                      threadId={_threadId}
                      preSearch={preSearch}
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
                  // ✅ BUG FIX 3: If isStreamingRound is true, ALWAYS consider this the latest round
                  // This is a defensive fix for race conditions where preSearch lookup might fail
                  // during state synchronization (e.g., orchestrator refetch after pre-search completes).
                  // The streamingRoundNumber is the authoritative signal for which round is active.
                  const isLatestRound = isStreamingRound || (isActuallyLatestRound && (preSearchActive || preSearchComplete));

                  if (!isLatestRound || participants.length === 0) {
                    return null;
                  }

                  // Get assistant messages for this round and build participant message maps
                  const assistantMessagesForRound = messages.filter((m) => {
                    if (m.role === MessageRoles.USER) {
                      return false;
                    }
                    const msgRound = getRoundNumber(m.metadata);
                    return msgRound === roundNumber;
                  });

                  // Filter to enabled participants only (store guarantees sorted order)
                  const enabledParticipants = getEnabledParticipants(participants);

                  // ✅ Use reusable utility for multi-strategy participant message lookup
                  // Handles DB messages, resumed streams with partial metadata, and AI SDK temp IDs
                  const participantMaps = buildParticipantMessageMaps(assistantMessagesForRound);

                  // ✅ FIX: Collect availableSources from ALL messages in the round (streaming-safe)
                  // During streaming, some participants have finished (with availableSources in metadata)
                  // while others are still streaming (no availableSources yet).
                  // We collect sources from finished participants to share with streaming ones.
                  // All participants in a round share the same pre-search results.
                  // Uses getAvailableSources() which extracts sources even when full schema validation fails
                  // (handles streaming metadata that has sources but is missing finishReason/usage)
                  const roundAvailableSources = ((): AvailableSource[] | undefined => {
                    const allSources = new Map<string, AvailableSource>();
                    for (const msg of assistantMessagesForRound) {
                      // ✅ STREAMING-SAFE: Use getAvailableSources which handles incomplete streaming metadata
                      const availableSourcesFromMsg = getAvailableSources(msg.metadata);

                      if (availableSourcesFromMsg) {
                        for (const source of availableSourcesFromMsg) {
                          const sourceId = source.id;
                          // ✅ ZOD VALIDATION: Use type guard instead of cast
                          if (sourceId && !allSources.has(sourceId) && isAvailableSource(source)) {
                            allSources.set(sourceId, source);
                          }
                        }
                      }
                    }
                    // Only log if we found sources
                    if (allSources.size > 0) {
                      rlog.msg('cite-round', `r${roundNumber} sources=${allSources.size}`);
                    }
                    return allSources.size > 0 ? Array.from(allSources.values()) : undefined;
                  })();

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

                  // ✅ POST-MODERATOR FLASH FIX: When round completes, hide INSTANTLY (no transition)
                  // The transition was causing a 150ms fadeout that overlapped with messageGroups fadein
                  const wasRenderedDuringStreaming = renderedRoundsRef.current.has(roundNumber);

                  return (
                    // mt-14 provides consistent spacing from user message (matches space-y-14 between participants)
                    // ✅ FLASH FIX: Use opacity transition instead of conditional rendering
                    // ✅ POSITION FIX: Use visibility+height instead of absolute positioning
                    // absolute -z-10 caused layout jumps when content became visible
                    // ✅ POST-MODERATOR FLASH FIX: No transition when hiding (instant) to prevent overlap with messageGroups
                    <div
                      className={cn(
                        'space-y-14 overflow-hidden',
                        // Only transition when showing, not when hiding (prevents flash)
                        shouldShowPendingCards && 'transition-all duration-150',
                        shouldShowPendingCards ? 'mt-14 opacity-100' : 'h-0 opacity-0 pointer-events-none',
                        // Force instant hide when round was already rendered (prevents flash)
                        wasRenderedDuringStreaming && !shouldShowPendingCards && 'transition-none',
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
                          // Some models return finishReason='unknown' even on success
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
                          // This handles models that return finishReason='unknown'
                          const participantStreamingStopped = !isStreaming;

                          // ✅ MULTI-SIGNAL: Complete if streaming stopped OR standard finish OR backend success
                          const hasActuallyFinished = (participantStreamingStopped || hasStandardFinishReason || backendMarkedSuccess) && !isExplicitError;

                          // ✅ ANIMATION FIX: Still streaming if content exists but not finished
                          // This keeps the pulsating animation showing during active streaming
                          status = hasActuallyFinished ? MessageStatuses.COMPLETE : MessageStatuses.STREAMING;
                          // ✅ AI SDK INTEROP CAST - see filteredParts comment above
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
                              loadingText = t('chat.participant.waitingForWebResults');
                            } else {
                              loadingText = t('chat.participant.gatheringThoughts');
                            }
                          } else {
                            const currentSpeaker = enabledParticipants[effectiveCurrentIndex];
                            const currentSpeakerModel = currentSpeaker ? findModel(currentSpeaker.modelId) : null;
                            const currentSpeakerName = currentSpeakerModel?.name || currentSpeaker?.modelId || 'AI';
                            loadingText = t('chat.participant.waitingNamed', { name: currentSpeakerName });
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
                              hideActions={demoMode || isReadOnly}
                              groupAvailableSources={roundAvailableSources}
                              skipTransitions={isReadOnly || skipEntranceAnimations}
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
                    p.type === MessagePartTypes.TEXT && 'text' in p && typeof p.text === 'string' && p.text.trim().length > 0,
                  ) ?? false;

                  // ✅ FIX: Collect availableSources from ALL assistant messages in the round (streaming-safe)
                  // Moderator needs access to sources from participants for citation display
                  // Uses getAvailableSources() which extracts sources even when full schema validation fails
                  const assistantMessagesForRound = messages.filter((m) => {
                    if (m.role === MessageRoles.USER) {
                      return false;
                    }
                    const msgRound = getRoundNumber(m.metadata);
                    return msgRound === roundNumber;
                  });
                  const roundAvailableSources = ((): AvailableSource[] | undefined => {
                    const allSources = new Map<string, AvailableSource>();
                    for (const msg of assistantMessagesForRound) {
                      // ✅ STREAMING-SAFE: Use getAvailableSources which handles incomplete streaming metadata
                      const availableSourcesFromMsg = getAvailableSources(msg.metadata);
                      if (availableSourcesFromMsg) {
                        for (const source of availableSourcesFromMsg) {
                          const sourceId = source.id;
                          // ✅ ZOD VALIDATION: Use type guard instead of cast
                          if (sourceId && !allSources.has(sourceId) && isAvailableSource(source)) {
                            allSources.set(sourceId, source);
                          }
                        }
                      }
                    }
                    return allSources.size > 0 ? Array.from(allSources.values()) : undefined;
                  })();

                  // ✅ IMMEDIATE PLACEHOLDER: Show moderator placeholder immediately when streaming round starts
                  // This provides visual feedback that moderator will synthesize after participants complete.
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

                  // ✅ AI SDK INTEROP CAST - see filteredParts comment in AssistantGroupCard
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
                  // - When participants still streaming: "Waiting to synthesize..."
                  // - When participants done, moderator starting: "Observing discussion..."
                  const moderatorLoadingText = moderatorParts.length === 0
                    ? (isStreaming ? t('chat.participant.waitingToSynthesize') : t('chat.participant.moderatorObserving'))
                    : undefined;

                  // ✅ FLASH FIX: Keep component mounted but hidden instead of return null
                  // ✅ POSITION FIX: Use visibility+height instead of absolute positioning
                  // absolute -z-10 caused layout jumps when moderator became visible
                  // Now we keep it in flow but visually hidden with h-0
                  // ✅ POST-MODERATOR FLASH FIX: When hiding, use instant transition to prevent overlap
                  const wasRenderedDuringStreaming = renderedRoundsRef.current.has(roundNumber);

                  return (
                    <div
                      className={cn(
                        'overflow-hidden',
                        // Only transition when showing, not when hiding (prevents flash)
                        shouldShowModerator && 'transition-all duration-150',
                        shouldShowModerator ? 'mt-14 opacity-100' : 'h-0 opacity-0 pointer-events-none',
                        // Force instant hide when round was already rendered (prevents flash)
                        wasRenderedDuringStreaming && !shouldShowModerator && 'transition-none',
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
                          isAccessible
                          messageId={moderatorMessage?.id}
                          loadingText={moderatorLoadingText}
                          maxContentHeight={maxContentHeight}
                          avatarSrc={BRAND.logos.main}
                          avatarName={MODERATOR_NAME}
                          displayName={MODERATOR_NAME}
                          hideActions
                          groupAvailableSources={roundAvailableSources}
                          skipTransitions={isReadOnly || skipEntranceAnimations}
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

            // ✅ POST-MODERATOR FLASH FIX: Skip animation for rounds that were rendered during streaming
            // Content was already visible via pending cards - don't replay entrance animation
            const wasRenderedDuringStreaming = renderedRoundsRef.current.has(groupRoundNumber);
            const shouldSkipAnimation = !shouldAnimateMessage(firstMessageId) || wasRenderedDuringStreaming;

            // ✅ MODERATOR CITATION FIX: Collect sources from ALL messages in this round
            // Moderator groups don't have their own availableSources - they cite participant sources
            // We collect from all assistant messages in the same round to provide as fallback
            const roundSourcesMap = new Map<string, AvailableSource>();
            for (const msg of messages) {
              if (msg.role !== MessageRoles.ASSISTANT) {
                continue;
              }
              const msgRound = getRoundNumber(msg.metadata);
              if (msgRound !== groupRoundNumber) {
                continue;
              }
              const meta = getMessageMetadata(msg.metadata);
              const assistantMeta = meta && isAssistantMessageMetadata(meta) ? meta : null;
              if (assistantMeta?.availableSources) {
                for (const source of assistantMeta.availableSources) {
                  const sourceId = source.id;
                  // ✅ ZOD VALIDATION: Use type guard instead of cast
                  if (sourceId && !roundSourcesMap.has(sourceId) && isAvailableSource(source)) {
                    roundSourcesMap.set(sourceId, source);
                  }
                }
              }
            }
            const roundSources = roundSourcesMap.size > 0 ? Array.from(roundSourcesMap.values()) : undefined;

            return (
              <ScrollAwareParticipant
                key={`assistant-group-${group.participantKey}-${group.messages[0]?.index}`}
                index={0}
                skipAnimation={shouldSkipAnimation}
              >
                <AssistantGroupCard
                  group={group}
                  groupIndex={groupIndex}
                  findModel={findModel}
                  demoMode={demoMode}
                  hideMetadata={hideMetadata}
                  t={t as (key: string) => string}
                  keyForMessage={keyForMessage}
                  maxContentHeight={maxContentHeight}
                  roundAvailableSources={roundSources}
                  skipTransitions={isReadOnly || skipEntranceAnimations}
                  isReadOnly={isReadOnly}
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
            if (!isMod || round !== latestRound) {
              return false;
            }
            // Check if moderator has actual text content (not just step-start)
            const hasContent = m.parts?.some(p =>
              p.type === MessagePartTypes.TEXT && 'text' in p && typeof p.text === 'string' && p.text.trim().length > 0,
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
            <div className="mt-14">
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
                  isAccessible
                  loadingText={t('chat.participant.moderatorObserving')}
                  maxContentHeight={maxContentHeight}
                  avatarSrc={BRAND.logos.main}
                  avatarName={MODERATOR_NAME}
                  displayName={MODERATOR_NAME}
                  hideActions
                  skipTransitions={isReadOnly || skipEntranceAnimations}
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
    // ✅ PERF FIX: Do shallow Set comparison, not just reference equality
    // Even with stable refs from ChatView, verify contents are actually equal
    const prevCompleted = prevProps.completedRoundNumbers;
    const nextCompleted = nextProps.completedRoundNumbers;
    if (prevCompleted !== nextCompleted) {
      // Handle undefined cases
      if (!prevCompleted || !nextCompleted) {
        return false;
      }
      // Quick size check first
      if (prevCompleted.size !== nextCompleted.size) {
        return false;
      }
      // Content check - only re-render if contents actually differ
      for (const num of nextCompleted) {
        if (!prevCompleted.has(num)) {
          return false;
        }
      }
      // Contents are equal despite different references - skip re-render
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
