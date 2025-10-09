'use client';

import { Message, MessageAvatar, MessageContent } from '@/components/ai-elements/message';
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
}: ModelMessageCardProps) {
  const statusText = {
    thinking: 'thinking...',
    streaming: 'streaming...',
    completed: null,
    error: 'error',
  }[status];

  const showStatusIndicator = status === 'thinking' || status === 'streaming';
  const isError = status === 'error';

  return (
    <div className={`space-y-1 ${className || ''}`}>
      {/* ✅ OFFICIAL AI SDK PATTERN: ALWAYS render message once created */}
      <Message from="assistant">
        <MessageContent className={isError ? 'text-destructive' : undefined}>
          {/* ✅ MODEL HEADER: Always visible */}
          <div className="flex items-center gap-2 mb-2 -mt-1">
            {/* Model Name */}
            <span
              className="text-sm font-semibold"
              style={{ color: model.metadata.color }}
            >
              {model.name}
            </span>

            {/* Role */}
            {role && (
              <>
                <span className="text-muted-foreground text-xs">•</span>
                <span className="text-muted-foreground text-xs">
                  {role}
                </span>
              </>
            )}

            {/* Status Indicator */}
            {showStatusIndicator && statusText && (
              <>
                <span className="text-muted-foreground text-xs">•</span>
                <span className="text-xs text-muted-foreground animate-pulse">
                  {statusText}
                </span>
              </>
            )}

            {/* Error Indicator */}
            {isError && (
              <>
                <span className="text-destructive text-xs">•</span>
                <span className="text-xs text-destructive">
                  {statusText}
                </span>
              </>
            )}
          </div>

          {/* ✅ OFFICIAL AI SDK PATTERN: Just render parts directly, NO placeholder logic */}
          {parts.map((part, partIndex) => {
            if (part.type === 'text') {
              // ✅ OFFICIAL AI SDK: Always render Response, even with empty text
              return (
                <Response key={`text-${partIndex}`}>
                  {part.text}
                </Response>
              );
            }

            if (part.type === 'reasoning') {
              // ✅ OFFICIAL AI SDK: Always render reasoning if part exists
              return (
                <details
                  key={`reasoning-${partIndex}`}
                  className="mt-2 mb-2 rounded-lg border border-border/50 bg-muted/30"
                >
                  <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground">
                    💭 View reasoning process
                  </summary>
                  <pre className="px-3 py-2 text-xs text-muted-foreground whitespace-pre-wrap font-mono overflow-x-auto">
                    {part.text}
                  </pre>
                </details>
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
