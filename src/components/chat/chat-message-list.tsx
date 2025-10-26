'use client';
import type { UIMessage } from 'ai';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { memo, useMemo } from 'react';

import type { ChatParticipant } from '@/api/routes/chat/schema';
import { canAccessModelByPricing } from '@/api/services/product-logic.service';
import { Message, MessageAvatar, MessageContent } from '@/components/ai-elements/message';
import { Response } from '@/components/ai-elements/response';
import { ModelMessageCard } from '@/components/chat/model-message-card';
import { useModelsQuery } from '@/hooks/queries/models';
import { useUsageStatsQuery } from '@/hooks/queries/usage';
import type { MessagePart, MessageStatus } from '@/lib/schemas/message-schemas';
import { getAvatarPropsFromModelId } from '@/lib/utils/ai-display';
import { getMessageMetadata } from '@/lib/utils/message-transforms';

const EMPTY_PARTICIPANTS: ChatParticipant[] = [];
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
};
export const ChatMessageList = memo(({
  messages,
  user = null,
  participants = EMPTY_PARTICIPANTS,
  hideMetadata = false,
  isLoading = false,
  isStreaming = false,
  currentStreamingParticipant = null,
  currentParticipantIndex = 0,
  userAvatar,
}: ChatMessageListProps) => {
  const isCurrentlyLoading = isLoading || isStreaming;
  const t = useTranslations();
  const { data: modelsData } = useModelsQuery();
  const { data: usageData } = useUsageStatsQuery();
  const allModels = modelsData?.data?.items || [];
  const userTier = usageData?.data?.subscription?.tier || 'free';
  const userInfo = user || { name: 'User', image: null };
  const userAvatarSrc = userAvatar?.src || userInfo.image || '/avatars/user.png';
  const userAvatarName = userAvatar?.name || userInfo.name;

  // ✅ DEDUPLICATION: Focus on user messages to prevent duplicate triggers
  // According to FLOW_DOCUMENTATION: One user message → All participants respond → One analysis
  // Also filters out participant trigger messages (created when orchestrating sequential responses)
  const deduplicatedMessages = useMemo(() => {
    const seenRounds = new Map<number, UIMessage>(); // roundNumber -> first user message
    const result: UIMessage[] = [];

    for (const message of messages) {
      // For user messages, deduplicate by round number and filter participant triggers
      if (message.role === 'user') {
        const metadata = message.metadata as Record<string, unknown> | undefined;
        const roundNumber = metadata?.roundNumber as number | undefined;
        const isParticipantTrigger = metadata?.isParticipantTrigger === true;

        // Skip participant trigger duplicates completely
        if (isParticipantTrigger) {
          continue;
        }

        // For regular user messages, keep only first per round
        if (roundNumber !== undefined) {
          if (!seenRounds.has(roundNumber)) {
            seenRounds.set(roundNumber, message);
            result.push(message);
          }
        } else {
          // Messages without round numbers (shouldn't happen, but keep them)
          result.push(message);
        }
      } else {
        // For assistant/system messages, keep all (participants can have multiple messages)
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

  return (
    <>
      {deduplicatedMessages.map((message, index) => {
        const messageKey = keyForMessage(message, index);
        if (message.role === 'user') {
          return (
            <Message from="user" key={messageKey}>
              <MessageContent>
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
              </MessageContent>
              <MessageAvatar
                src={userAvatarSrc}
                name={userAvatarName}
              />
            </Message>
          );
        }
        const metadata = getMessageMetadata(message.metadata);
        const hasSavedMetadata = !!metadata?.model;
        const participantIndex = hasSavedMetadata
          ? (metadata?.participantIndex ?? 0)
          : (metadata?.participantIndex ?? currentParticipantIndex);
        const participant = !hasSavedMetadata
          ? (participantIndex !== undefined && participants[participantIndex])
              ? participants[participantIndex]
              : currentStreamingParticipant
          : undefined;
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
        const hasTextContent = message.parts.some(p => p.type === 'text' && p.text.trim().length > 0);
        const hasToolCalls = message.parts.some(p => p.type === 'tool-call');
        const hasAnyContent = hasTextContent || hasToolCalls;
        const messageStatus: MessageStatus = hasError
          ? 'error'
          : isCurrentlyStreaming && !hasAnyContent
            ? 'thinking'
            : isCurrentlyStreaming
              ? 'streaming'
              : 'completed';
        const filteredParts = message.parts
          .filter(p =>
            p.type === 'text'
            || p.type === 'reasoning'
            || p.type === 'tool-call'
            || p.type === 'tool-result',
          )
          .map(p => p as MessagePart);
        const sourceParts = message.parts.filter(p =>
          'type' in p && (p.type === 'source-url' || p.type === 'source-document'),
        );
        return (
          <div key={messageKey}>
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
});
