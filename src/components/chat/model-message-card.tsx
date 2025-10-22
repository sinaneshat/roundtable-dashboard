'use client';

// ✅ ZERO HARDCODING: Import all types from proper schema locations
import type { EnhancedModelResponse } from '@/api/routes/models/schema';
import { Message, MessageAvatar, MessageContent } from '@/components/ai-elements/message';
import { Reasoning, ReasoningContent, ReasoningTrigger } from '@/components/ai-elements/reasoning';
import { Response } from '@/components/ai-elements/response';
import { MessageErrorDetails } from '@/components/chat/message-error-details';
import type { UIMessageMetadata } from '@/lib/schemas/message-metadata';
import type { MessagePart, MessageStatus } from '@/lib/schemas/message-schemas';

/**
 * ✅ ZOD-INFERRED TYPES: All types imported from RPC schemas
 * Single source of truth from backend schemas
 */
type ModelMessageCardProps = {
  model?: EnhancedModelResponse; // ✅ RPC type from models schema (optional for streaming fallback)
  role?: string | null;
  participantIndex: number;
  status: MessageStatus; // ✅ RPC type from chat schema
  parts?: MessagePart[]; // ✅ RPC type from chat schema
  avatarSrc: string;
  avatarName: string;
  className?: string;
  /** Message ID for generating stable React keys */
  messageId?: string;
  /** Message metadata with error information */
  metadata?: UIMessageMetadata | null;
  /** Whether user can access this model at their current tier */
  isAccessible?: boolean;
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
  metadata,
  isAccessible,
}: ModelMessageCardProps) {
  // ✅ FALLBACK HANDLING: Handle missing model during streaming
  const modelIsAccessible = model ? (isAccessible ?? model.is_accessible_to_user) : true;
  const showStatusIndicator = status === 'thinking' || status === 'streaming';
  const isError = status === 'error';
  const hasError = isError || metadata?.hasError || metadata?.error;
  const modelName = model?.name || metadata?.model || 'AI Assistant';
  const requiredTierName = model?.required_tier_name;

  return (
    <div className={`space-y-1 ${className || ''}`}>
      {/* ✅ OFFICIAL AI SDK PATTERN: ALWAYS render message once created */}
      <Message from="assistant">
        <MessageContent className={hasError ? 'text-destructive' : undefined}>
          {/* ✅ MODEL HEADER: Always visible */}
          <>
            <div className="flex items-center gap-2 mb-2 -mt-1 flex-wrap">
              {/* Model Name - subtle, no special color */}
              <span className="text-sm font-medium text-foreground/90">
                {modelName}
              </span>

              {/* Role - subtle differentiation */}
              {role && (
                <>
                  <span className="text-muted-foreground/50 text-xs">•</span>
                  <span className="text-muted-foreground/70 text-xs">
                    {String(role)}
                  </span>
                </>
              )}

              {/* ✅ BACKEND-COMPUTED TIER: Show tier requirement if model not accessible */}
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

              {/* Status Indicator - very subtle, no text */}
              {showStatusIndicator && (
                <span className="ml-1 size-1.5 rounded-full bg-primary/60 animate-pulse" />
              )}

              {/* Error Indicator - subtle red dot */}
              {hasError && (
                <span className="ml-1 size-1.5 rounded-full bg-destructive/80" />
              )}
            </div>

            {/* ✅ ERROR DETAILS: Show comprehensive error information */}
            {hasError && (
              <MessageErrorDetails
                metadata={metadata}
                className="mb-2"
              />
            )}

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
          </>
        </MessageContent>
        <MessageAvatar src={avatarSrc} name={avatarName} />
      </Message>
    </div>
  );
}
