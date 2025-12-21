'use client';
import { useTranslations } from 'next-intl';
import { memo, useLayoutEffect, useRef } from 'react';
import { Streamdown } from 'streamdown';

import type { MessageStatus } from '@/api/core/enums';
import { MessagePartTypes, MessageStatuses } from '@/api/core/enums';
import type { EnhancedModelResponse } from '@/api/routes/models/schema';
import { Message, MessageAvatar, MessageContent } from '@/components/ai-elements/message';
import { Reasoning, ReasoningContent, ReasoningTrigger } from '@/components/ai-elements/reasoning';
import { TextShimmer } from '@/components/ai-elements/shimmer';
import { CitedMessageContent } from '@/components/chat/cited-message-content';
import { CustomDataPart } from '@/components/chat/custom-data-part';
import { MessageErrorDetails } from '@/components/chat/message-error-details';
import { MessageSources } from '@/components/chat/message-sources';
import { ToolCallPart } from '@/components/chat/tool-call-part';
import { ToolResultPart } from '@/components/chat/tool-result-part';
import { streamdownComponents } from '@/components/markdown/streamdown-components';
import { useChatStore } from '@/components/providers/chat-store-provider';
import { Badge } from '@/components/ui/badge';
import { StreamingMessageContent } from '@/components/ui/motion';
import { ScrollArea } from '@/components/ui/scroll-area';
// StreamingCursor removed - typing effect disabled per user request
import type { DbMessageMetadata } from '@/db/schemas/chat-metadata';
import { isAssistantMessageMetadata } from '@/db/schemas/chat-metadata';
import { isDataPart } from '@/lib/schemas/data-part-schema';
import type { MessagePart } from '@/lib/schemas/message-schemas';
import { cn } from '@/lib/ui/cn';
import { hasCitations } from '@/lib/utils/citation-parser';
import { getRoleBadgeStyle } from '@/lib/utils/role-colors';

/**
 * ✅ MODEL NORMALIZATION: Filter non-renderable reasoning parts
 *
 * Different AI models have quirks during streaming that cause layout shifts:
 * - Grok (xAI): Sends `[REDACTED]` encrypted reasoning that disappears on completion
 * - Claude: Native `type: 'redacted'` parts for encrypted thinking content
 * - DeepSeek: Uses <think> tags handled by extractReasoningMiddleware
 * - Gemini: Native reasoning with `type: 'redacted'` for encrypted content
 *
 * This unified filter prevents layout shifts from:
 * 1. Empty or whitespace-only reasoning text
 * 2. Placeholder content like `[REDACTED]`
 * 3. Parts with `type: 'redacted'` (AI SDK native redacted reasoning)
 * 4. Any reasoning that would render as blank/invisible
 *
 * @see AI SDK docs: Reasoning Detail Object supports 'text' and 'redacted' types
 * @see OpenRouter docs: "Encrypted reasoning content might appear as [REDACTED] in streaming"
 * @see message-persistence.service.ts:extractReasoning() for backend normalization
 */
function isNonRenderableReasoningPart(part: MessagePart): boolean {
  if (part.type !== MessagePartTypes.REASONING) {
    return false;
  }
  // Filter reasoning parts with type: 'redacted' (AI SDK native redacted reasoning)
  // This handles Gemini, Claude, and other models that use native redacted reasoning
  const reasoningType = (part as { reasoningType?: string }).reasoningType;
  if (reasoningType === 'redacted') {
    return true;
  }
  const text = part.text?.trim() ?? '';
  // Filter: empty, whitespace-only, or known placeholder patterns
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
  loadingText,
  maxContentHeight,
}: ModelMessageCardProps) => {
  const t = useTranslations('chat.participant');
  const modelIsAccessible = model ? (isAccessible ?? model.is_accessible_to_user) : true;

  // ✅ FIX: Subscribe to PARTICIPANT streaming state (NOT moderator)
  const globalIsStreaming = useChatStore(s => s.isStreaming);

  // Check if parts have streaming state (only trust when PARTICIPANTS actively streaming)
  const hasActualStreamingParts = globalIsStreaming && parts.some(
    p => 'state' in p && p.state === 'streaming',
  );

  // ✅ MODEL NORMALIZATION: Filter non-renderable reasoning to prevent layout shifts
  const renderableParts = parts.filter(part => !isNonRenderableReasoningPart(part));

  // ✅ FLASH FIX: Shimmer must stay visible until content arrives
  // Previous bug: When status changed from PENDING→STREAMING before parts arrived,
  // both shimmer AND content were hidden (opacity 0) causing a flash.
  // Fix: Show shimmer whenever no content AND expecting content (pending/streaming)
  const isExpectingContent = status === MessageStatuses.PENDING || status === MessageStatuses.STREAMING;
  const showShimmer = renderableParts.length === 0 && isExpectingContent;

  // Pulsating indicator: pending with no parts OR actively streaming parts
  const showStatusIndicator = (status === MessageStatuses.PENDING && parts.length === 0)
    || hasActualStreamingParts;

  const isError = status === MessageStatuses.FAILED;

  // eslint-disable-next-line no-console
  console.log('[CARD]', JSON.stringify({ idx: participantIndex, shim: showShimmer ? 1 : 0, p: renderableParts.length, st: status.slice(0, 4) }));

  // ✅ FIX: isStreaming requires PARTICIPANT streaming active AND parts streaming
  const isStreaming = hasActualStreamingParts;

  // Animation tracking for sequential participant streaming
  const registerAnimation = useChatStore(s => s.registerAnimation);
  const completeAnimation = useChatStore(s => s.completeAnimation);
  const hasRegisteredRef = useRef(false);
  const prevStatusRef = useRef(status);

  // ✅ CONSOLIDATED: Animation lifecycle - registration and completion
  // Handles: register when streaming starts, complete when streaming ends
  useLayoutEffect(() => {
    const wasStreaming = prevStatusRef.current === MessageStatuses.STREAMING;
    const nowComplete = status !== MessageStatuses.STREAMING && status !== MessageStatuses.PENDING;

    // Register animation when streaming starts
    if (isStreaming && !hasRegisteredRef.current && participantIndex >= 0) {
      registerAnimation(participantIndex);
      hasRegisteredRef.current = true;
    }

    // Complete animation when streaming ends (use RAF for deterministic timing)
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

  // ✅ CLEANUP: Complete animation on unmount (prevents orphaned entries)
  useLayoutEffect(() => {
    const index = participantIndex;
    return () => {
      if (hasRegisteredRef.current && index >= 0) {
        completeAnimation(index);
        hasRegisteredRef.current = false;
      }
    };
  }, [participantIndex, completeAnimation]);

  // ✅ STRICT TYPING: Only assistant messages have error fields
  const assistantMetadata = metadata && isAssistantMessageMetadata(metadata) ? metadata : null;
  const hasError = isError || assistantMetadata?.hasError;
  const modelName = model?.name || assistantMetadata?.model || 'AI Assistant';
  const requiredTierName = model?.required_tier_name;

  return (
    <div className={`space-y-1 ${className || ''}`}>
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
                    {requiredTierName}
                    {' '}
                    required
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
            {/* ✅ FLASH FIX v3: CSS Grid overlay + shimmer stays until content arrives
                Previous bug: shimmer hid when status=STREAMING before parts arrived
                Now shimmer stays visible until renderableParts.length > 0 */}
            <div className="grid" style={{ gridTemplateColumns: '1fr' }}>
              {/* Shimmer - stays visible until content actually arrives */}
              <div
                style={{ gridArea: '1/1' }}
                className={cn(
                  'py-2 text-muted-foreground text-base transition-opacity duration-200 ease-out',
                  showShimmer ? 'opacity-100' : 'opacity-0 pointer-events-none',
                )}
              >
                <TextShimmer>{loadingText ?? t('generating', { model: modelName })}</TextShimmer>
              </div>
              {/* Content - hidden initially, fades in when parts arrive
                  Always render wrapper to prevent mount/unmount flashing */}
              <div
                style={{ gridArea: '1/1' }}
                className={cn(
                  'transition-opacity duration-200 ease-out',
                  renderableParts.length > 0 ? 'opacity-100' : 'opacity-0 pointer-events-none',
                )}
              >
                <StreamingMessageContent
                  isStreaming={isStreaming}
                  layoutId={messageId ? `msg-content-${messageId}` : undefined}
                >
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

            {/* ✅ SOURCES: Show files/context available to AI */}
            {/* Displayed even when AI doesn't cite inline, so users know what files were used */}
            {assistantMetadata?.availableSources && assistantMetadata.availableSources.length > 0 && (
              <MessageSources sources={assistantMetadata.availableSources} />
            )}
          </>
        </MessageContent>
        {!hideAvatar && <MessageAvatar src={avatarSrc} name={avatarName} />}
      </Message>
    </div>
  );

  // ✅ Helper function to render content parts (extracted for ScrollArea wrapping)
  function renderContentParts() {
    // ✅ MODEL NORMALIZATION: Uses pre-filtered renderableParts (non-renderable reasoning excluded)
    const sortedParts = [...renderableParts].sort((a, b) => {
      const order = { 'reasoning': 0, 'text': 1, 'tool-call': 2, 'tool-result': 3 };
      const aOrder = order[a.type as keyof typeof order] ?? 4;
      const bOrder = order[b.type as keyof typeof order] ?? 4;
      return aOrder - bOrder;
    });

    return sortedParts.map((part, partIndex) => {
      if (part.type === MessagePartTypes.TEXT) {
        const textHasCitations = hasCitations(part.text);
        const resolvedCitations = assistantMetadata?.citations;

        if (textHasCitations) {
          return (
            <div key={messageId ? `${messageId}-text-${partIndex}` : `text-${partIndex}`}>
              <CitedMessageContent
                text={part.text}
                citations={resolvedCitations}
                isStreaming={isStreaming}
                className="text-foreground [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
              />
              {/* ✅ REMOVED: StreamingCursor typing effect per user request */}
            </div>
          );
        }

        return (
          <div key={messageId ? `${messageId}-text-${partIndex}` : `text-${partIndex}`}>
            <Streamdown
              className="text-foreground [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
              components={streamdownComponents}
            >
              {part.text}
            </Streamdown>
            {/* ✅ REMOVED: StreamingCursor typing effect per user request */}
          </div>
        );
      }
      if (part.type === MessagePartTypes.REASONING) {
        const reasoningMetadata = metadata && isAssistantMessageMetadata(metadata) ? metadata : null;
        const storedDuration = reasoningMetadata?.reasoningDuration;

        // ✅ FIX: Use the reasoning part's own state, not the message's overall status
        // When text is still streaming but reasoning is done, reasoning animation should stop
        // part.state can be 'streaming' | 'done' | undefined (undefined = historical/complete)
        const reasoningPartState = 'state' in part ? part.state : undefined;
        const isReasoningStreaming = reasoningPartState === 'streaming';

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
