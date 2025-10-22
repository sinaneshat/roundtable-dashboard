'use client';

import type { UIMessage } from 'ai';
import Image from 'next/image';
import { useTranslations } from 'next-intl';

import type { ChatParticipant } from '@/api/routes/chat/schema';
import { canAccessModelByPricing } from '@/api/services/product-logic.service';
import { Message, MessageAvatar, MessageContent } from '@/components/ai-elements/message';
import { Response } from '@/components/ai-elements/response';
import { ModelMessageCard } from '@/components/chat/model-message-card';
import { useModelsQuery } from '@/hooks/queries/models';
import { useUsageStatsQuery } from '@/hooks/queries/usage';
import type { MessageStatus } from '@/lib/schemas/message-schemas';
import { getAvatarPropsFromModelId } from '@/lib/utils/ai-display';
import { deduplicateConsecutiveUserMessages, filterNonEmptyMessages, getMessageMetadata } from '@/lib/utils/message-transforms';

// Stable default values to prevent re-renders
const EMPTY_PARTICIPANTS: ChatParticipant[] = [];

type ChatMessageListProps = {
  messages: UIMessage[];
  /** User information for displaying user messages. Optional - defaults to generic user. */
  user?: {
    name: string;
    image: string | null;
  } | null;
  /** List of AI participants. Optional - will be inferred from message metadata if not provided. */
  participants?: ChatParticipant[];
  /** Hide metadata like timestamps and model names */
  hideMetadata?: boolean;
  /** Whether messages are currently being streamed (loading state) */
  isLoading?: boolean;
  /** Whether any participant is currently streaming (alias for isLoading) */
  isStreaming?: boolean;
  /** Currently active streaming participant */
  currentStreamingParticipant?: ChatParticipant | null;
  /** Index of currently active participant */
  currentParticipantIndex?: number;
  /** Optional custom user avatar (overrides user.image) */
  userAvatar?: { src: string; name: string };
};

export function ChatMessageList({
  messages,
  user = null,
  participants = EMPTY_PARTICIPANTS,
  hideMetadata = false,
  isLoading = false,
  isStreaming = false,
  currentStreamingParticipant = null,
  currentParticipantIndex = 0,
  userAvatar,
}: ChatMessageListProps) {
  // Use isStreaming as an alias for isLoading for backward compatibility
  const isCurrentlyLoading = isLoading || isStreaming;
  const t = useTranslations();
  const { data: modelsData } = useModelsQuery();
  const { data: usageData } = useUsageStatsQuery();

  const allModels = modelsData?.data?.items || [];
  const userTier = usageData?.data?.subscription?.tier || 'free';

  // Default user info if not provided
  const userInfo = user || { name: 'User', image: null };
  const userAvatarSrc = userAvatar?.src || userInfo.image || '/avatars/user.png';
  const userAvatarName = userAvatar?.name || userInfo.name;

  // ✅ SHARED UTILITY: Filter out empty user messages (used for triggering subsequent participants)
  // ✅ DEDUPLICATION: Remove consecutive duplicate user messages (caused by startRound)
  const nonEmptyMessages = deduplicateConsecutiveUserMessages(filterNonEmptyMessages(messages));

  return (
    <>
      {nonEmptyMessages.map((message) => {
        // User message
        if (message.role === 'user') {
          return (
            <Message from="user" key={message.id}>
              <MessageContent>
                {/* eslint-disable react/no-array-index-key -- Parts array is stable, order is meaningful, and scoped by message.id */}
                {message.parts.map((part, partIndex) => {
                  if (part.type === 'text') {
                    return (
                      <Response key={`${message.id}-${partIndex}`}>
                        {part.text}
                      </Response>
                    );
                  }

                  if (part.type === 'file' && part.mediaType?.startsWith('image/')) {
                    return (
                      <div key={`${message.id}-${partIndex}`} className="my-2">
                        <Image
                          src={part.url}
                          alt={part.filename || 'Attachment'}
                          className="max-w-full rounded-lg border border-border"
                          style={{ maxHeight: '400px' }}
                          width={800}
                          height={400}
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
                      <div key={`${message.id}-${partIndex}`} className="my-2 p-3 border border-border rounded-lg">
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
                {/* eslint-enable react/no-array-index-key */}
              </MessageContent>
              <MessageAvatar
                src={userAvatarSrc}
                name={userAvatarName}
              />
            </Message>
          );
        }

        // Assistant message
        const metadata = getMessageMetadata(message.metadata);

        // ✅ CRITICAL FIX: Always use metadata for saved messages, participant only for streaming
        // Saved messages have metadata.model set - this is the source of truth
        // Streaming messages don't have metadata yet - use current participant from index

        const hasSavedMetadata = !!metadata?.model;

        // ✅ CRITICAL FIX: For participantIndex, NEVER fallback to currentParticipantIndex for saved messages
        // This prevents historical messages from being re-attributed to current participants
        const participantIndex = hasSavedMetadata
          ? (metadata?.participantIndex ?? 0) // Saved message - use metadata only (fallback to 0 if missing)
          : (metadata?.participantIndex ?? currentParticipantIndex); // Streaming message - can use current index

        // Only lookup participant for streaming messages (no saved metadata yet)
        const participant = !hasSavedMetadata
          ? (participantIndex !== undefined && participants[participantIndex])
              ? participants[participantIndex]
              : currentStreamingParticipant
          : undefined; // Saved message - don't use participant at all

        // ✅ CRITICAL FIX: For saved messages, use ONLY metadata (never look at current participants)
        // For streaming messages: Use participant (metadata not set yet)
        // This ensures historical messages maintain their original model/role attribution
        const storedModelId = hasSavedMetadata ? metadata.model : (participant?.modelId || metadata?.model);
        const storedRole = hasSavedMetadata ? (metadata.participantRole || null) : (participant?.role || metadata?.participantRole || null);

        const avatarProps = getAvatarPropsFromModelId(
          message.role === 'system' ? 'assistant' : message.role,
          storedModelId,
          userInfo.image,
          userInfo.name,
        );

        const model = storedModelId ? allModels.find(m => m.id === storedModelId) : undefined;
        const isAccessible = model ? canAccessModelByPricing(userTier, model) : true;
        const hasError = metadata?.hasError === true || !!metadata?.error;
        const isCurrentlyStreaming = isCurrentlyLoading && participant?.id === currentStreamingParticipant?.id;
        const hasContent = message.parts.some(p => p.type === 'text' && p.text.trim().length > 0);

        const messageStatus: MessageStatus = hasError
          ? 'error'
          : isCurrentlyStreaming && !hasContent
            ? 'thinking'
            : isCurrentlyStreaming
              ? 'streaming'
              : 'completed';

        const filteredParts = message.parts.filter(
          (p): p is { type: 'text'; text: string } | { type: 'reasoning'; text: string } =>
            p.type === 'text' || p.type === 'reasoning',
        );

        const sourceParts = message.parts.filter(p =>
          'type' in p && (p.type === 'source-url' || p.type === 'source-document'),
        );

        return (
          <div key={message.id}>
            <ModelMessageCard
              messageId={message.id}
              model={model}
              role={String(storedRole || '')}
              participantIndex={participantIndex ?? 0}
              status={messageStatus}
              parts={filteredParts}
              avatarSrc={avatarProps.src}
              avatarName={avatarProps.name}
              metadata={hideMetadata ? null : (metadata ?? null)}
              isAccessible={isAccessible}
            />

            {sourceParts.length > 0 && (
              <div className="mt-2 ml-12 space-y-1">
                <p className="text-xs font-medium text-muted-foreground">{t('sources.title')}</p>
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
    </>
  );
}
