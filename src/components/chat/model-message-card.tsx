'use client';
import { memo } from 'react';
import { Streamdown } from 'streamdown';

import { MessageStatuses } from '@/api/core/enums';
import type { EnhancedModelResponse } from '@/api/routes/models/schema';
import { Message, MessageAvatar, MessageContent } from '@/components/ai-elements/message';
import { Reasoning, ReasoningContent, ReasoningTrigger } from '@/components/ai-elements/reasoning';
import { CustomDataPart } from '@/components/chat/custom-data-part';
import { MessageErrorDetails } from '@/components/chat/message-error-details';
import { ToolCallPart } from '@/components/chat/tool-call-part';
import { ToolResultPart } from '@/components/chat/tool-result-part';
import type { UIMessageMetadata } from '@/lib/schemas/message-metadata';
import { isAssistantMetadata } from '@/lib/schemas/message-metadata';
import type { MessagePart, MessageStatus } from '@/lib/schemas/message-schemas';

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
  metadata?: UIMessageMetadata | null;
  isAccessible?: boolean;
  hideInlineHeader?: boolean;
  hideAvatar?: boolean;
};
const DEFAULT_PARTS: MessagePart[] = [];
export const ModelMessageCard = memo(({
  model,
  role,
  participantIndex: _participantIndex,
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
  const modelIsAccessible = model ? (isAccessible ?? model.is_accessible_to_user) : true;
  const showStatusIndicator = status === MessageStatuses.THINKING || status === MessageStatuses.STREAMING;
  const isError = status === MessageStatuses.ERROR;

  // ✅ STRICT TYPING: Only assistant messages have error fields
  const assistantMetadata = metadata && isAssistantMetadata(metadata) ? metadata : null;
  const hasError = isError || assistantMetadata?.hasError || assistantMetadata?.error;
  const modelName = model?.name || assistantMetadata?.model || 'AI Assistant';
  const requiredTierName = model?.required_tier_name;

  return (
    <div className={`space-y-1 ${className || ''}`}>
      <Message from="assistant">
        <MessageContent className={hasError ? 'text-destructive' : undefined}>
          <>
            {!hideInlineHeader && (
              <div className="flex items-center gap-2 mb-2 -mt-1 flex-wrap">
                <span className="text-sm font-medium text-foreground/90">
                  {modelName}
                </span>
                {role && (
                  <>
                    <span className="text-muted-foreground/50 text-xs">•</span>
                    <span className="text-muted-foreground/70 text-xs">
                      {String(role)}
                    </span>
                  </>
                )}
                {!modelIsAccessible && requiredTierName && (
                  <>
                    <span className="text-muted-foreground/50 text-xs">•</span>
                    <span className="text-muted-foreground/70 text-xs">
                      {requiredTierName}
                      {' '}
                      required
                    </span>
                  </>
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
            {parts.map((part, partIndex) => {
              if (part.type === 'text') {
                return (
                  <Streamdown
                    key={messageId ? `${messageId}-text-${partIndex}` : `text-${partIndex}`}
                    className="size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
                  >
                    {part.text}
                  </Streamdown>
                );
              }
              if (part.type === 'reasoning') {
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
              if (part.type === 'tool-call') {
                return (
                  <ToolCallPart
                    key={messageId ? `${messageId}-tool-call-${partIndex}` : `tool-call-${partIndex}`}
                    part={part}
                    className="my-2"
                  />
                );
              }
              if (part.type === 'tool-result') {
                return (
                  <ToolResultPart
                    key={messageId ? `${messageId}-tool-result-${partIndex}` : `tool-result-${partIndex}`}
                    part={part}
                    className="my-2"
                  />
                );
              }
              // Type guard for custom data parts
              const isCustomDataPart = (p: unknown): p is { type: string; data: unknown } =>
                typeof p === 'object'
                && p !== null
                && 'type' in p
                && typeof p.type === 'string'
                && p.type.startsWith('data-')
                && 'data' in p;

              if (isCustomDataPart(part)) {
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
          </>
        </MessageContent>
        {!hideAvatar && <MessageAvatar src={avatarSrc} name={avatarName} />}
      </Message>
    </div>
  );
});
