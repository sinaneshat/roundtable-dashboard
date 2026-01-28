import type { MessagePartType, MessageStatus } from '@roundtable/shared';
import { getRoleBadgeStyle, MessagePartTypes, MessageStatuses, ReasoningPartTypes, TextPartStates } from '@roundtable/shared';
import { memo, useEffect, useRef } from 'react';
import Markdown from 'react-markdown';

import { Actions } from '@/components/ai-elements/actions';
import { Message, MessageAvatar, MessageContent } from '@/components/ai-elements/message';
import { Reasoning, ReasoningContent, ReasoningTrigger } from '@/components/ai-elements/reasoning';
import { TextShimmer } from '@/components/ai-elements/shimmer';
import { CitedMessageContent } from '@/components/chat/cited-message-content';
import { MessageCopyAction } from '@/components/chat/copy-actions';
import { CustomDataPart } from '@/components/chat/custom-data-part';
import { MessageErrorDetails } from '@/components/chat/message-error-details';
import { ToolCallPart } from '@/components/chat/tool-call-part';
import { ToolResultPart } from '@/components/chat/tool-result-part';
import { LazyStreamdown } from '@/components/markdown/lazy-streamdown';
import { streamdownComponents } from '@/components/markdown/unified-markdown-components';
import { useChatStoreOptional } from '@/components/providers';
import { Badge } from '@/components/ui/badge';
import { StreamingMessageContent } from '@/components/ui/motion';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useIsMounted } from '@/hooks/utils';
import { useTranslations } from '@/lib/i18n';
import type { MessagePart } from '@/lib/schemas';
import { isDataPart } from '@/lib/schemas/data-part-schema';
import { cn } from '@/lib/ui/cn';
import { hasCitations, hasProperty, isNonEmptyString } from '@/lib/utils';
import { rlog } from '@/lib/utils/dev-logger';
import type { AvailableSource, DbMessageMetadata, Model } from '@/services/api';
import { isAssistantMessageMetadata } from '@/services/api';

function isNonRenderableReasoningPart(part: MessagePart): boolean {
  if (part.type !== MessagePartTypes.REASONING) {
    return false;
  }
  if (hasProperty(part, 'reasoningType', isNonEmptyString) && part.reasoningType === ReasoningPartTypes.REDACTED) {
    return true;
  }
  const text = part.text?.trim() ?? '';
  return !text || /^\[REDACTED\]$/i.test(text);
}

type ModelMessageCardProps = {
  model?: Model | undefined;
  role?: string | null | undefined;
  participantIndex: number;
  status: MessageStatus;
  parts?: MessagePart[] | undefined;
  avatarSrc: string;
  avatarName: string;
  className?: string | undefined;
  messageId?: string | undefined;
  metadata?: DbMessageMetadata | null | undefined;
  isAccessible?: boolean | undefined;
  hideInlineHeader?: boolean | undefined;
  hideAvatar?: boolean | undefined;
  /** Hide the copy action (used for moderator where council actions handle it) */
  hideActions?: boolean | undefined;
  /** Custom loading text to display instead of "Generating response from {model}..." */
  loadingText?: string | undefined;
  /** Max height for scrollable content area. When set, wraps content in ScrollArea */
  maxContentHeight?: number | undefined;
  /**
   * Fallback sources from group messages for streaming citation display
   * When streaming, message metadata isn't populated yet, so we use sources
   * collected from all messages in the same group as fallback.
   */
  groupAvailableSources?: AvailableSource[] | undefined;
  /** Skip opacity transitions for SSR/read-only pages to prevent hydration delay */
  skipTransitions?: boolean | undefined;
};
const DEFAULT_PARTS: MessagePart[] = [];

export const ModelMessageCard = memo(({
  avatarName,
  avatarSrc,
  className,
  groupAvailableSources,
  hideActions = false,
  hideAvatar = false,
  hideInlineHeader = false,
  isAccessible,
  loadingText,
  maxContentHeight,
  messageId,
  metadata,
  model,
  participantIndex,
  parts = DEFAULT_PARTS,
  role,
  skipTransitions = false,
  status,
}: ModelMessageCardProps) => {
  const t = useTranslations();
  const isMounted = useIsMounted();
  const modelIsAccessible = model ? (isAccessible ?? model.is_accessible_to_user) : true;

  // Use optional store hook - returns undefined on public pages without ChatStoreProvider
  const globalIsStreaming = useChatStoreOptional(s => s.isStreaming) ?? false;

  const hasActualStreamingParts = globalIsStreaming && parts.some(
    p => 'state' in p && p.state === TextPartStates.STREAMING,
  );

  const renderableParts = parts.filter(part => !isNonRenderableReasoningPart(part));

  const hasFilteredReasoningParts = parts.some(
    part => part.type === MessagePartTypes.REASONING && isNonRenderableReasoningPart(part),
  );

  // Compute error state early so we can use it for shimmer and status indicator
  const isError = status === MessageStatuses.FAILED;
  const assistantMetadata = metadata && isAssistantMessageMetadata(metadata) ? metadata : null;
  const hasError = isError || assistantMetadata?.hasError;

  const isExpectingContent = status === MessageStatuses.PENDING || status === MessageStatuses.STREAMING;
  const showShimmer = !hasError && renderableParts.length === 0 && isExpectingContent;

  // ✅ DEBUG: Track skeleton flashes - detect rapid shimmer on/off
  const shimmerStartRef = useRef<number | null>(null);
  useEffect(() => {
    if (showShimmer && !shimmerStartRef.current) {
      shimmerStartRef.current = Date.now();
    } else if (!showShimmer && shimmerStartRef.current) {
      const duration = Date.now() - shimmerStartRef.current;
      if (duration < 200) {
        rlog.msg('skeleton-flash', `p${participantIndex} duration=${duration}ms FLASH`);
      }
      shimmerStartRef.current = null;
    }
  }, [showShimmer, participantIndex]);

  const showStatusIndicator = !hasError && (
    (status === MessageStatuses.PENDING && parts.length === 0)
    || hasActualStreamingParts
  );

  const isStreaming = hasActualStreamingParts;

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
                    {t('chat.participant.tierRequired', { tier: requiredTierName })}
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
            <div className="grid w-full min-w-0" dir="auto" data-message-content>
              <div
                style={{ gridArea: '1/1' }}
                className={cn(
                  'py-2 text-muted-foreground text-base',
                  !skipTransitions && isMounted && 'transition-opacity duration-200 ease-out',
                  showShimmer ? 'opacity-100' : 'opacity-0 pointer-events-none',
                )}
              >
                <TextShimmer>{loadingText ?? t('chat.participant.generating', { model: modelName })}</TextShimmer>
              </div>
              {!showShimmer && renderableParts.length === 0 && parts.length > 0 && !hasError && (
                <div
                  style={{ gridArea: '1/1' }}
                  className="py-2 text-muted-foreground text-sm italic opacity-100"
                >
                  {hasFilteredReasoningParts
                    ? t('chat.participant.reasoningOnlyResponse', { model: modelName })
                    : t('chat.participant.emptyResponse', { model: modelName })}
                </div>
              )}
              <div
                style={{ gridArea: '1/1' }}
                className={cn(
                  'min-w-0',
                  !skipTransitions && isMounted && 'transition-opacity duration-200 ease-out',
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

            {!hideActions && (() => {
              const isComplete = status === MessageStatuses.COMPLETE;
              // ✅ FIX: Also check text parts don't have streaming state
              // finishReason can be set before all text chunks are received
              const hasStreamingTextParts = renderableParts.some(
                p => p.type === MessagePartTypes.TEXT && 'state' in p && p.state === TextPartStates.STREAMING,
              );
              const textContent = renderableParts
                .filter(p => p.type === MessagePartTypes.TEXT)
                .map(p => p.text)
                .join('\n\n')
                .trim();
              const hasText = textContent.length > 0;

              if (!isComplete || !hasText || hasStreamingTextParts) {
                return null;
              }

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
    const MESSAGE_PART_ORDER: Readonly<Record<MessagePartType, number>> = {
      [MessagePartTypes.FILE]: 4,
      [MessagePartTypes.REASONING]: 0,
      [MessagePartTypes.SOURCE_DOCUMENT]: 7,
      [MessagePartTypes.SOURCE_URL]: 6,
      [MessagePartTypes.STEP_START]: 5,
      [MessagePartTypes.TEXT]: 1,
      [MessagePartTypes.TOOL_CALL]: 2,
      [MessagePartTypes.TOOL_RESULT]: 3,
    };
    const sortedParts = [...renderableParts].sort((a, b) => {
      return MESSAGE_PART_ORDER[a.type] - MESSAGE_PART_ORDER[b.type];
    });
    return sortedParts.map((part, partIndex) => {
      if (part.type === MessagePartTypes.TEXT) {
        const textHasCitations = hasCitations(part.text);
        const resolvedCitations = assistantMetadata?.citations;

        if (textHasCitations) {
          // ✅ FIX: Use groupAvailableSources as fallback when metadata.availableSources is empty
          // During streaming, AI SDK doesn't populate message.metadata until stream finishes
          // So we use sources collected from all messages in the same group
          const effectiveSources = assistantMetadata?.availableSources?.length
            ? assistantMetadata.availableSources
            : groupAvailableSources;

          return (
            <div key={messageId ? `${messageId}-text-${partIndex}` : `text-${partIndex}`} dir="auto" className="min-w-0">
              <CitedMessageContent
                text={part.text}
                citations={resolvedCitations}
                availableSources={effectiveSources}
                isStreaming={isStreaming}
                className="text-foreground [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
                skipTransitions={skipTransitions}
              />
            </div>
          );
        }

        // Use ReactMarkdown for SSR/read-only pages, LazyStreamdown for interactive streaming
        return (
          <div
            key={messageId ? `${messageId}-text-${partIndex}` : `text-${partIndex}`}
            dir="auto"
            className="min-w-0 text-foreground [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
          >
            {skipTransitions
              ? (
                  // SSR: Direct import renders synchronously - no hydration flash
                  <Markdown components={streamdownComponents}>{part.text}</Markdown>
                )
              : (
                  // Client-side streaming: Use lazy-loaded streamdown
                  <LazyStreamdown
                    className="text-foreground [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
                    components={streamdownComponents}
                  >
                    {part.text}
                  </LazyStreamdown>
                )}
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
