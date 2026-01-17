/**
 * AI SDK Related Enums
 *
 * Defines schemas based on Vercel AI SDK v6 conventions
 * Reference: https://github.com/vercel/ai
 *
 * @see packages/ai/src/ui/chat.ts - ChatStatus
 * @see packages/provider/src/language-model/v3/language-model-v3-finish-reason.ts
 */

import { z } from '@hono/zod-openapi';

// ============================================================================
// AI SDK STATUS (AI SDK v6 useChat hook status values)
// ============================================================================

export const AI_SDK_STATUSES = ['ready', 'submitted', 'streaming', 'error'] as const;

export const AiSdkStatusSchema = z.enum(AI_SDK_STATUSES).openapi({
  description: 'AI SDK v6 ChatStatus values - matches AI SDK exactly',
  example: 'streaming',
});

export type AiSdkStatus = z.infer<typeof AiSdkStatusSchema>;

export const DEFAULT_AI_SDK_STATUS: AiSdkStatus = 'ready';

export const AiSdkStatuses = {
  READY: 'ready' as const,
  SUBMITTED: 'submitted' as const,
  STREAMING: 'streaming' as const,
  ERROR: 'error' as const,
} as const;

// ============================================================================
// FINISH REASON (AI SDK Response Completion Status)
// ============================================================================
//
// ⚠️ AI SDK v6 MIGRATION NOTE:
// The AI SDK v6 merged 'unknown' into 'other' for model responses.
// However, THIS CODEBASE uses 'unknown' as an APPLICATION-LEVEL concept
// to indicate interrupted/incomplete streams (not an AI SDK return value).
// See: stream-buffer.service.ts (synthetic finish events for interrupted streams)
//
// Summary:
// - AI SDK models return: 'stop' | 'length' | 'tool-calls' | 'content-filter' | 'error' | 'other'
// - Application adds: 'unknown' (interrupted stream) | 'failed' (application-level failure)
//

export const FINISH_REASONS = [
  'stop',
  'length',
  'tool-calls',
  'content-filter',
  'error',
  'failed',
  'other',
  'unknown', // ⚠️ APPLICATION-LEVEL: indicates interrupted stream, NOT an AI SDK return value
] as const;

export const FinishReasonSchema = z.enum(FINISH_REASONS).openapi({
  description: 'AI SDK finish reason indicating how/why completion ended',
  example: 'stop',
});

export type FinishReason = z.infer<typeof FinishReasonSchema>;

export const DEFAULT_FINISH_REASON: FinishReason = 'stop';

export const FinishReasons = {
  STOP: 'stop' as const,
  LENGTH: 'length' as const,
  TOOL_CALLS: 'tool-calls' as const,
  CONTENT_FILTER: 'content-filter' as const,
  ERROR: 'error' as const,
  FAILED: 'failed' as const,
  OTHER: 'other' as const,
  UNKNOWN: 'unknown' as const, // ⚠️ Application-level: interrupted stream (not AI SDK return value)
} as const;

// Subset schema for completion finish reasons (successful completions)
const COMPLETION_FINISH_REASONS = ['stop', 'length', 'tool-calls', 'content-filter'] as const;
const CompletionFinishReasonSchema = z.enum(COMPLETION_FINISH_REASONS);
export type CompletionFinishReason = z.infer<typeof CompletionFinishReasonSchema>;

export function isCompletionFinishReason(
  finishReason: unknown,
): finishReason is CompletionFinishReason {
  return CompletionFinishReasonSchema.safeParse(finishReason).success;
}

// ============================================================================
// UI MESSAGE ROLE (AI SDK v6 - only 'user', 'assistant', 'system')
// ============================================================================

export const UI_MESSAGE_ROLES = ['user', 'assistant', 'system'] as const;

export const UIMessageRoleSchema = z.enum(UI_MESSAGE_ROLES).openapi({
  description: 'AI SDK UIMessage role (user, assistant, or system)',
  example: 'assistant',
});

export type UIMessageRole = z.infer<typeof UIMessageRoleSchema>;

export const DEFAULT_UI_MESSAGE_ROLE: UIMessageRole = 'user';

export const UIMessageRoles = {
  USER: 'user' as const,
  ASSISTANT: 'assistant' as const,
  SYSTEM: 'system' as const,
} as const;

// ============================================================================
// MESSAGE PART TYPE (AI SDK v6 message part types)
// ============================================================================

export const MESSAGE_PART_TYPES = [
  'text',
  'reasoning',
  'tool-call',
  'tool-result',
  'file',
  'step-start',
  'source-url',
  'source-document',
] as const;

export const MessagePartTypeSchema = z.enum(MESSAGE_PART_TYPES).openapi({
  description: 'Types of message content parts',
  example: 'text',
});

export type MessagePartType = z.infer<typeof MessagePartTypeSchema>;

export const DEFAULT_MESSAGE_PART_TYPE: MessagePartType = 'text';

export const MessagePartTypes = {
  TEXT: 'text' as const,
  REASONING: 'reasoning' as const,
  TOOL_CALL: 'tool-call' as const,
  TOOL_RESULT: 'tool-result' as const,
  FILE: 'file' as const,
  STEP_START: 'step-start' as const,
  SOURCE_URL: 'source-url' as const,
  SOURCE_DOCUMENT: 'source-document' as const,
} as const;

// ============================================================================
// REASONING PART TYPE (Extended AI SDK types for reasoning/thinking content)
// ============================================================================

export const REASONING_PART_TYPES = ['reasoning', 'thinking', 'redacted', 'text'] as const;

export const ReasoningPartTypeSchema = z.enum(REASONING_PART_TYPES).openapi({
  description: 'Type of reasoning/thinking content (reasoning, thinking, redacted, or text)',
  example: 'reasoning',
});

export type ReasoningPartType = z.infer<typeof ReasoningPartTypeSchema>;

export const DEFAULT_REASONING_PART_TYPE: ReasoningPartType = 'reasoning';

export const ReasoningPartTypes = {
  REASONING: 'reasoning' as const,
  THINKING: 'thinking' as const,
  REDACTED: 'redacted' as const,
  TEXT: 'text' as const,
} as const;

// ============================================================================
// TEXT PART STATE (AI SDK v6 streaming state for text/reasoning parts)
// ============================================================================

export const TEXT_PART_STATES = ['streaming', 'done'] as const;

export const TextPartStateSchema = z.enum(TEXT_PART_STATES).openapi({
  description: 'AI SDK v6 streaming state for text and reasoning parts',
  example: 'done',
});

export type TextPartState = z.infer<typeof TextPartStateSchema>;

export const DEFAULT_TEXT_PART_STATE: TextPartState = 'done';

export const TextPartStates = {
  STREAMING: 'streaming' as const,
  DONE: 'done' as const,
} as const;

export function isTextPartStreaming(state: TextPartState | undefined): boolean {
  return state === TextPartStates.STREAMING;
}

// ============================================================================
// STREAM PART TYPE (AI SDK v6 streaming event types)
// ============================================================================

export const STREAM_PART_TYPES = [
  'start',
  'text-delta',
  'reasoning-delta',
  'finish',
  'error',
  'start-step',
  'finish-step',
] as const;

export const StreamPartTypeSchema = z.enum(STREAM_PART_TYPES).openapi({
  description: 'AI SDK v6 streaming event types',
  example: 'text-delta',
});

export type StreamPartType = z.infer<typeof StreamPartTypeSchema>;

export const DEFAULT_STREAM_PART_TYPE: StreamPartType = 'start';

export const StreamPartTypes = {
  START: 'start' as const,
  TEXT_DELTA: 'text-delta' as const,
  REASONING_DELTA: 'reasoning-delta' as const,
  FINISH: 'finish' as const,
  ERROR: 'error' as const,
  START_STEP: 'start-step' as const,
  FINISH_STEP: 'finish-step' as const,
} as const;
