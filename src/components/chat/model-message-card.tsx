'use client';
import { memo } from 'react';
import { Streamdown } from 'streamdown';

import { MessagePartTypes, MessageStatuses } from '@/api/core/enums';
import type { EnhancedModelResponse } from '@/api/routes/models/schema';
import { Message, MessageAvatar, MessageContent } from '@/components/ai-elements/message';
import { Reasoning, ReasoningContent, ReasoningTrigger } from '@/components/ai-elements/reasoning';
import { CustomDataPart } from '@/components/chat/custom-data-part';
import { MessageErrorDetails } from '@/components/chat/message-error-details';
import { ToolCallPart } from '@/components/chat/tool-call-part';
import { ToolResultPart } from '@/components/chat/tool-result-part';
import { Badge } from '@/components/ui/badge';
import type { DbMessageMetadata } from '@/db/schemas/chat-metadata';
import { isAssistantMessageMetadata } from '@/db/schemas/chat-metadata';
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
  const showStatusIndicator = status === MessageStatuses.PENDING || status === MessageStatuses.STREAMING;
  const isError = status === MessageStatuses.FAILED;

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
                    className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border"
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
            {parts.map((part, partIndex) => {
              if (part.type === MessagePartTypes.TEXT) {
                return (
                  <Streamdown
                    key={messageId ? `${messageId}-text-${partIndex}` : `text-${partIndex}`}
                    className="size-full text-foreground text-sm leading-relaxed whitespace-pre-wrap [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
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
