'use client';

import { useTranslations } from 'next-intl';
import { memo, useLayoutEffect, useRef } from 'react';
import { Streamdown } from 'streamdown';
import { useShallow } from 'zustand/react/shallow';

import type { MessageStatus } from '@/api/core/enums';
import { MessagePartTypes, MessageStatuses, TextPartStates } from '@/api/core/enums';
import type { EnhancedModelResponse } from '@/api/routes/models/schema';
import { Actions } from '@/components/ai-elements/actions';
import { Message, MessageAvatar, MessageContent } from '@/components/ai-elements/message';
import { Reasoning, ReasoningContent, ReasoningTrigger } from '@/components/ai-elements/reasoning';
import { TextShimmer } from '@/components/ai-elements/shimmer';
import { CitedMessageContent } from '@/components/chat/cited-message-content';
import { MessageCopyAction } from '@/components/chat/copy-actions';
import { CustomDataPart } from '@/components/chat/custom-data-part';
import { MessageErrorDetails } from '@/components/chat/message-error-details';
import { MessageSources } from '@/components/chat/message-sources';
import { ToolCallPart } from '@/components/chat/tool-call-part';
import { ToolResultPart } from '@/components/chat/tool-result-part';
import { streamdownComponents } from '@/components/markdown/unified-markdown-components';
import { useChatStore } from '@/components/providers';
import { Badge } from '@/components/ui/badge';
import { StreamingMessageContent } from '@/components/ui/motion';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { DbMessageMetadata } from '@/db/schemas/chat-metadata';
import { isAssistantMessageMetadata } from '@/db/schemas/chat-metadata';
import { isDataPart } from '@/lib/schemas/data-part-schema';
import type { MessagePart } from '@/lib/schemas/message-schemas';
import { cn } from '@/lib/ui/cn';
import { getRoleBadgeStyle, hasCitations, hasProperty, isNonEmptyString } from '@/lib/utils';

function isNonRenderableReasoningPart(part: MessagePart): boolean {
  if (part.type !== MessagePartTypes.REASONING) {
    return false;
  }
  if (hasProperty(part, 'reasoningType', isNonEmptyString) && part.reasoningType === 'redacted') {
    return true;
  }
  const text = part.text?.trim() ?? '';
  return !text || text === '[REDACTED]' || /^\[REDACTED\]$/i.test(text);
}

type ModelMessageCardProps = {
  model?: EnhancedModelResponse;
  role?: string | null;
  participantIndex: number;
  status: MessageStatus;
  parts?: MessagePart[];
  avatarSrc: string;
  avatarName: string;
  className?: string;
  messageId?: string;
  metadata?: DbMessageMetadata | null;
  isAccessible?: boolean;
  hideInlineHeader?: boolean;
  hideAvatar?: boolean;
  /** Hide the copy action (used for moderator where council actions handle it) */
  hideActions?: boolean;
  /** Custom loading text to display instead of "Generating response from {model}..." */
  loadingText?: string;
  /** Max height for scrollable content area. When set, wraps content in ScrollArea */
  maxContentHeight?: number;
};
const DEFAULT_PARTS: MessagePart[] = [];

export const ModelMessageCard = memo(({
  model,
  role,
  participantIndex,
  status,
  parts = DEFAULT_PARTS,
  avatarSrc,
  avatarName,
  className,
  messageId,
  metadata,
  isAccessible,
  hideInlineHeader = false,
  hideAvatar = false,
  hideActions = false,
  loadingText,
  maxContentHeight,
}: ModelMessageCardProps) => {
  const t = useTranslations('chat.participant');
  const modelIsAccessible = model ? (isAccessible ?? model.is_accessible_to_user) : true;

  const { globalIsStreaming, registerAnimation, completeAnimation } = useChatStore(
    useShallow(s => ({
      globalIsStreaming: s.isStreaming,
      registerAnimation: s.registerAnimation,
      completeAnimation: s.completeAnimation,
    })),
  );

  const hasActualStreamingParts = globalIsStreaming && parts.some(
    p => 'state' in p && p.state === TextPartStates.STREAMING,
  );

  const renderableParts = parts.filter(part => !isNonRenderableReasoningPart(part));

  const hasFilteredReasoningParts = parts.some(
    part => part.type === MessagePartTypes.REASONING && isNonRenderableReasoningPart(part),
  );

  const isExpectingContent = status === MessageStatuses.PENDING || status === MessageStatuses.STREAMING;
  const showShimmer = renderableParts.length === 0 && isExpectingContent;

  const showStatusIndicator = (status === MessageStatuses.PENDING && parts.length === 0)
    || hasActualStreamingParts;

  const isError = status === MessageStatuses.FAILED;

  const isStreaming = hasActualStreamingParts;
  const hasRegisteredRef = useRef(false);
  const prevStatusRef = useRef(status);

  useLayoutEffect(() => {
    const wasStreaming = prevStatusRef.current === MessageStatuses.STREAMING;
    const nowComplete = status !== MessageStatuses.STREAMING && status !== MessageStatuses.PENDING;

    if (isStreaming && !hasRegisteredRef.current && participantIndex >= 0) {
      registerAnimation(participantIndex);
      hasRegisteredRef.current = true;
    }

    if (wasStreaming && nowComplete && hasRegisteredRef.current && participantIndex >= 0) {
      const rafId = requestAnimationFrame(() => {
        completeAnimation(participantIndex);
        hasRegisteredRef.current = false;
      });
      prevStatusRef.current = status;
      return () => cancelAnimationFrame(rafId);
    }

    prevStatusRef.current = status;
    return undefined;
  }, [status, isStreaming, participantIndex, registerAnimation, completeAnimation]);

  useLayoutEffect(() => {
    const index = participantIndex;
    return () => {
      if (hasRegisteredRef.current && index >= 0) {
        completeAnimation(index);
        hasRegisteredRef.current = false;
      }
    };
  }, [participantIndex, completeAnimation]);

  const assistantMetadata = metadata && isAssistantMessageMetadata(metadata) ? metadata : null;
  const hasError = isError || assistantMetadata?.hasError;
  const modelName = model?.name || assistantMetadata?.model || 'AI Assistant';
  const requiredTierName = model?.required_tier_name;

  return (
    <div className={cn('space-y-1', className)}>
      <Message from="assistant">
        <MessageContent variant="flat" className={hasError ? 'text-destructive' : undefined}>
          <>
            {!hideInlineHeader && (
              <div className="flex items-center gap-3 mb-5 flex-wrap">
                <span className="text-xl font-semibold text-muted-foreground">
                  {modelName}
                </span>
                {role && (
                  <Badge
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border"
                    style={getRoleBadgeStyle(role)}
                  >
                    {String(role)}
                  </Badge>
                )}
                {!modelIsAccessible && requiredTierName && (
                  <Badge variant="outline" className="text-xs text-muted-foreground">
                    {t('tierRequired', { tier: requiredTierName })}
                  </Badge>
                )}
                {showStatusIndicator && (
                  <span className="ml-1 size-1.5 rounded-full bg-primary/60 animate-pulse" />
                )}
                {hasError && (
                  <span className="ml-1 size-1.5 rounded-full bg-destructive/80" />
                )}
              </div>
            )}
            {hasError && (
              <MessageErrorDetails
                metadata={metadata}
                className="mb-2"
              />
            )}
            <div className="grid w-full" dir="auto" data-message-content>
              <div
                style={{ gridArea: '1/1' }}
                className={cn(
                  'py-2 text-muted-foreground text-base transition-opacity duration-200 ease-out',
                  showShimmer ? 'opacity-100' : 'opacity-0 pointer-events-none',
                )}
              >
                <TextShimmer>{loadingText ?? t('generating', { model: modelName })}</TextShimmer>
              </div>
              {!showShimmer && renderableParts.length === 0 && parts.length > 0 && !hasError && (
                <div
                  style={{ gridArea: '1/1' }}
                  className="py-2 text-muted-foreground text-sm italic opacity-100"
                >
                  {hasFilteredReasoningParts
                    ? t('reasoningOnlyResponse', { model: modelName })
                    : t('emptyResponse', { model: modelName })}
                </div>
              )}
              <div
                style={{ gridArea: '1/1' }}
                className={cn(
                  'transition-opacity duration-200 ease-out',
                  renderableParts.length > 0 ? 'opacity-100' : 'opacity-0 pointer-events-none',
                )}
              >
                <StreamingMessageContent>
                  {renderableParts.length > 0 && (
                    maxContentHeight
                      ? (
                          <ScrollArea
                            className="pr-3"
                            style={{ maxHeight: maxContentHeight }}
                          >
                            {renderContentParts()}
                          </ScrollArea>
                        )
                      : renderContentParts()
                  )}
                </StreamingMessageContent>
              </div>
            </div>

            {assistantMetadata?.availableSources && assistantMetadata.availableSources.length > 0 && (
              <MessageSources sources={assistantMetadata.availableSources} />
            )}

            {!hideActions && (() => {
              const isComplete = status === MessageStatuses.COMPLETE;
              const textContent = renderableParts
                .filter(p => p.type === MessagePartTypes.TEXT)
                .map(p => p.text)
                .join('\n\n')
                .trim();
              const hasText = textContent.length > 0;

              if (!isComplete || !hasText)
                return null;

              return (
                <Actions className="mt-4">
                  <MessageCopyAction messageText={textContent} />
                </Actions>
              );
            })()}
          </>
        </MessageContent>
        {!hideAvatar && <MessageAvatar src={avatarSrc} name={avatarName} />}
      </Message>
    </div>
  );

  function renderContentParts() {
    const PART_ORDER: Record<string, number> = {
      [MessagePartTypes.REASONING]: 0,
      [MessagePartTypes.TEXT]: 1,
      [MessagePartTypes.TOOL_CALL]: 2,
      [MessagePartTypes.TOOL_RESULT]: 3,
      [MessagePartTypes.FILE]: 4,
      [MessagePartTypes.STEP_START]: 5,
    };
    const getOrder = (type: string): number => PART_ORDER[type] ?? 6;
    const sortedParts = [...renderableParts].sort((a, b) => {
      return getOrder(a.type) - getOrder(b.type);
    });

    return sortedParts.map((part, partIndex) => {
      if (part.type === MessagePartTypes.TEXT) {
        const textHasCitations = hasCitations(part.text);
        const resolvedCitations = assistantMetadata?.citations;

        if (textHasCitations) {
          return (
            <div key={messageId ? `${messageId}-text-${partIndex}` : `text-${partIndex}`} dir="auto">
              <CitedMessageContent
                text={part.text}
                citations={resolvedCitations}
                isStreaming={isStreaming}
                className="text-foreground [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
              />
            </div>
          );
        }

        return (
          <div key={messageId ? `${messageId}-text-${partIndex}` : `text-${partIndex}`} dir="auto">
            <Streamdown
              className="text-foreground [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
              components={streamdownComponents}
            >
              {part.text}
            </Streamdown>
          </div>
        );
      }
      if (part.type === MessagePartTypes.REASONING) {
        const reasoningMetadata = metadata && isAssistantMessageMetadata(metadata) ? metadata : null;
        const storedDuration = reasoningMetadata?.reasoningDuration;

        const reasoningPartState = 'state' in part ? part.state : undefined;
        const isReasoningStreaming = reasoningPartState === TextPartStates.STREAMING;

        return (
          <Reasoning
            key={messageId ? `${messageId}-reasoning-${partIndex}` : `reasoning-${partIndex}`}
            isStreaming={isReasoningStreaming}
            initialContentLength={!isReasoningStreaming ? part.text.length : 0}
            storedDuration={storedDuration}
            className="w-full"
          >
            <ReasoningTrigger />
            <ReasoningContent>{part.text}</ReasoningContent>
          </Reasoning>
        );
      }
      if (part.type === MessagePartTypes.TOOL_CALL) {
        return (
          <ToolCallPart
            key={messageId ? `${messageId}-tool-call-${partIndex}` : `tool-call-${partIndex}`}
            part={part}
            className="my-2"
          />
        );
      }
      if (part.type === MessagePartTypes.TOOL_RESULT) {
        return (
          <ToolResultPart
            key={messageId ? `${messageId}-tool-result-${partIndex}` : `tool-result-${partIndex}`}
            part={part}
            className="my-2"
          />
        );
      }
      if (isDataPart(part)) {
        return (
          <CustomDataPart
            key={messageId ? `${messageId}-data-${partIndex}` : `data-${partIndex}`}
            part={part}
            className="my-2"
          />
        );
      }
      return null;
    });
  }
});

ModelMessageCard.displayName = 'ModelMessageCard';
