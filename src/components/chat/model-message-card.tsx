'use client';

import { Message, MessageAvatar, MessageContent } from '@/components/ai-elements/message';
import { Reasoning, ReasoningContent, ReasoningTrigger } from '@/components/ai-elements/reasoning';
import { Response } from '@/components/ai-elements/response';
import type { AIModel } from '@/lib/ai/models-config';

/**
 * ✅ OFFICIAL AI SDK PATTERN: Message part types
 * See: https://github.com/vercel/ai/blob/main/content/docs/04-ai-sdk-ui/02-chatbot.mdx
 */
type MessagePart =
  | { type: 'text'; text: string }
  | { type: 'reasoning'; text: string };

type ModelStatus = 'thinking' | 'streaming' | 'completed' | 'error';

type ModelMessageCardProps = {
  model: AIModel;
  role?: string | null;
  participantIndex: number;
  status: ModelStatus;
  parts?: MessagePart[];
  avatarSrc: string;
  avatarName: string;
  className?: string;
  /** Message ID for generating stable React keys */
  messageId?: string;
};

/**
 * ModelMessageCard - Unified component for all model message states
 *
 * ✅ OFFICIAL AI SDK PATTERN: Consistent display for all message states
 * - Thinking: Show model header with "thinking..." status
 * - Streaming: Show model header with "streaming..." status + parts
 * - Completed: Show model header + all parts
 * - Error: Show model header + error styling
 *
 * Handles both text and reasoning parts as per AI SDK documentation.
 */
const DEFAULT_PARTS: MessagePart[] = [];

export function ModelMessageCard({
  model,
  role,
  participantIndex: _participantIndex,
  status,
  parts = DEFAULT_PARTS,
  avatarSrc,
  avatarName,
  className,
  messageId,
}: ModelMessageCardProps) {
  const showStatusIndicator = status === 'thinking' || status === 'streaming';
  const isError = status === 'error';

  return (
    <div className={`space-y-1 ${className || ''}`}>
      {/* ✅ OFFICIAL AI SDK PATTERN: ALWAYS render message once created */}
      <Message from="assistant">
        <MessageContent className={isError ? 'text-destructive' : undefined}>
          {/* ✅ MODEL HEADER: Always visible */}
          <div className="flex items-center gap-2 mb-2 -mt-1">
            {/* Model Name - subtle, no special color */}
            <span className="text-sm font-medium text-foreground/90">
              {model.name}
            </span>

            {/* Role - subtle differentiation */}
            {role && (
              <>
                <span className="text-muted-foreground/50 text-xs">•</span>
                <span className="text-muted-foreground/70 text-xs">
                  {role}
                </span>
              </>
            )}

            {/* Status Indicator - very subtle, no text */}
            {showStatusIndicator && (
              <span className="ml-1 size-1.5 rounded-full bg-primary/60 animate-pulse" />
            )}

            {/* Error Indicator - subtle red dot */}
            {isError && (
              <span className="ml-1 size-1.5 rounded-full bg-destructive/80" />
            )}
          </div>

          {/* ✅ OFFICIAL AI SDK PATTERN: Just render parts directly, NO placeholder logic */}
          {parts.map((part, partIndex) => {
            if (part.type === 'text') {
              // ✅ OFFICIAL AI SDK: Always render Response, even with empty text
              // Use stable key combining messageId and partIndex
              return (
                <Response key={messageId ? `${messageId}-text-${partIndex}` : `text-${partIndex}`}>
                  {part.text}
                </Response>
              );
            }

            if (part.type === 'reasoning') {
              // ✅ OFFICIAL AI SDK: Always render reasoning if part exists
              // Following AI Elements pattern from chatbot example
              return (
                <Reasoning
                  key={messageId ? `${messageId}-reasoning-${partIndex}` : `reasoning-${partIndex}`}
                  isStreaming={status === 'streaming'}
                  className="w-full"
                >
                  <ReasoningTrigger />
                  <ReasoningContent>{part.text}</ReasoningContent>
                </Reasoning>
              );
            }

            return null;
          })}
        </MessageContent>
        <MessageAvatar src={avatarSrc} name={avatarName} />
      </Message>
    </div>
  );
}
