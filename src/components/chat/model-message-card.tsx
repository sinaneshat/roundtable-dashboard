'use client';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { memo, useLayoutEffect, useRef } from 'react';
import { Streamdown } from 'streamdown';

import { MessagePartTypes, MessageStatuses } from '@/api/core/enums';
import type { EnhancedModelResponse } from '@/api/routes/models/schema';
import { Message, MessageAvatar, MessageContent } from '@/components/ai-elements/message';
import { Reasoning, ReasoningContent, ReasoningTrigger } from '@/components/ai-elements/reasoning';
import { CustomDataPart } from '@/components/chat/custom-data-part';
import { MessageErrorDetails } from '@/components/chat/message-error-details';
import { ToolCallPart } from '@/components/chat/tool-call-part';
import { ToolResultPart } from '@/components/chat/tool-result-part';
import { streamdownComponents } from '@/components/markdown/streamdown-components';
import { useChatStore } from '@/components/providers/chat-store-provider';
import { Badge } from '@/components/ui/badge';
import { LoaderFive } from '@/components/ui/loader';
import { ANIMATION_DURATION, ANIMATION_EASE } from '@/components/ui/motion';
import type { DbMessageMetadata } from '@/db/schemas/chat-metadata';
import { isAssistantMessageMetadata } from '@/db/schemas/chat-metadata';
import { isDataPart } from '@/lib/schemas/data-part-schema';
import type { MessagePart, MessageStatus } from '@/lib/schemas/message-schemas';
import { getRoleBadgeStyle } from '@/lib/utils/role-colors';

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
}: ModelMessageCardProps) => {
  const t = useTranslations('chat.participant');
  const modelIsAccessible = model ? (isAccessible ?? model.is_accessible_to_user) : true;
  const showStatusIndicator = status === MessageStatuses.PENDING || status === MessageStatuses.STREAMING;
  const isPendingWithNoParts = showStatusIndicator && parts.length === 0;
  const isError = status === MessageStatuses.FAILED;
  const isStreaming = status === MessageStatuses.STREAMING;

  // Animation tracking for sequential participant streaming
  const registerAnimation = useChatStore(s => s.registerAnimation);
  const completeAnimation = useChatStore(s => s.completeAnimation);
  const hasRegisteredRef = useRef(false);
  const prevStatusRef = useRef(status);

  // ✅ FIX: Use useLayoutEffect for synchronous animation registration
  // This ensures animations are registered BEFORE any callbacks fire
  // useLayoutEffect runs synchronously after DOM mutations, before browser paint
  useLayoutEffect(() => {
    if (isStreaming && !hasRegisteredRef.current && participantIndex >= 0) {
      registerAnimation(participantIndex);
      hasRegisteredRef.current = true;
    }
  }, [isStreaming, participantIndex, registerAnimation]);

  // ✅ CRITICAL: Cleanup animation on unmount
  // If component unmounts while animation is registered (e.g., navigation during streaming),
  // complete the animation to prevent orphaned entries blocking handleComplete
  useLayoutEffect(() => {
    const index = participantIndex;
    return () => {
      if (hasRegisteredRef.current && index >= 0) {
        completeAnimation(index);
        hasRegisteredRef.current = false;
      }
    };
  }, [participantIndex, completeAnimation]);

  // ✅ FIX: Use requestAnimationFrame instead of setTimeout for deterministic timing
  // RAF aligns with browser paint cycle, more reliable than arbitrary 16ms delay
  useLayoutEffect(() => {
    const wasStreaming = prevStatusRef.current === MessageStatuses.STREAMING;
    const nowComplete = status !== MessageStatuses.STREAMING && status !== MessageStatuses.PENDING;

    if (wasStreaming && nowComplete && hasRegisteredRef.current && participantIndex >= 0) {
      // Use RAF to complete animation on next frame
      // This is more deterministic than setTimeout and aligns with browser rendering
      const rafId = requestAnimationFrame(() => {
        completeAnimation(participantIndex);
        hasRegisteredRef.current = false;
      });

      prevStatusRef.current = status;
      return () => cancelAnimationFrame(rafId);
    }

    prevStatusRef.current = status;
    return undefined;
  }, [status, participantIndex, completeAnimation]);

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
              <div className="flex items-center gap-3 mb-6 flex-wrap">
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
            {/* ✅ SMOOTH TRANSITION: AnimatePresence prevents flash between loader and content */}
            <AnimatePresence mode="wait" initial={false}>
              {isPendingWithNoParts
                ? (
                    <motion.div
                      key="loader"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{
                        duration: ANIMATION_DURATION.fast,
                        ease: ANIMATION_EASE.standard,
                      }}
                      className="py-2 text-muted-foreground text-sm"
                    >
                      <LoaderFive text={t('generating', { model: modelName })} />
                    </motion.div>
                  )
                : parts.length > 0
                  ? (
                      <motion.div
                        key="content"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{
                          duration: ANIMATION_DURATION.normal,
                          ease: ANIMATION_EASE.enter,
                        }}
                      >
                        {parts.map((part, partIndex) => {
                          if (part.type === MessagePartTypes.TEXT) {
                            return (
                              <Streamdown
                                key={messageId ? `${messageId}-text-${partIndex}` : `text-${partIndex}`}
                                className="text-foreground text-sm leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
                                components={streamdownComponents}
                              >
                                {part.text}
                              </Streamdown>
                            );
                          }
                          if (part.type === MessagePartTypes.REASONING) {
                            return (
                              <Reasoning
                                key={messageId ? `${messageId}-reasoning-${partIndex}` : `reasoning-${partIndex}`}
                                isStreaming={status === MessageStatuses.STREAMING}
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
                        })}
                      </motion.div>
                    )
                  : null}
            </AnimatePresence>
          </>
        </MessageContent>
        {!hideAvatar && <MessageAvatar src={avatarSrc} name={avatarName} />}
      </Message>
    </div>
  );
});
