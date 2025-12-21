/**
 * AI SDK Related Enums
 *
 * Defines schemas based on Vercel AI SDK v5 conventions
 * Reference: https://github.com/vercel/ai
 *
 * @see packages/ai/src/ui/chat.ts - ChatStatus
 * @see packages/provider/src/language-model/v3/language-model-v3-finish-reason.ts
 */

import { z } from '@hono/zod-openapi';

// ============================================================================
// AI SDK STATUS (AI SDK v5 useChat hook status values)
// ============================================================================

export const AI_SDK_STATUSES = ['ready', 'submitted', 'streaming', 'error'] as const;

export const AiSdkStatusSchema = z.enum(AI_SDK_STATUSES).openapi({
  description: 'AI SDK v5 ChatStatus values - matches AI SDK exactly',
  example: 'streaming',
});

export type AiSdkStatus = z.infer<typeof AiSdkStatusSchema>;

export const AiSdkStatuses = {
  READY: 'ready' as const,
  SUBMITTED: 'submitted' as const,
  STREAMING: 'streaming' as const,
  ERROR: 'error' as const,
} as const;

// ============================================================================
// FINISH REASON (AI SDK Response Completion Status)
// ============================================================================

export const FINISH_REASONS = [
  'stop',
  'length',
  'tool-calls',
  'content-filter',
  'error',
  'failed',
  'other',
  'unknown',
] as const;

export const FinishReasonSchema = z.enum(FINISH_REASONS).openapi({
  description: 'AI SDK finish reason indicating how/why completion ended',
  example: 'stop',
});

export type FinishReason = z.infer<typeof FinishReasonSchema>;

export const FinishReasons = {
  STOP: 'stop' as const,
  LENGTH: 'length' as const,
  TOOL_CALLS: 'tool-calls' as const,
  CONTENT_FILTER: 'content-filter' as const,
  ERROR: 'error' as const,
  FAILED: 'failed' as const,
  OTHER: 'other' as const,
  UNKNOWN: 'unknown' as const,
} as const;

export function isCompletionFinishReason(
  finishReason: FinishReason | null | undefined,
): finishReason is 'stop' | 'length' | 'tool-calls' | 'content-filter' {
  if (!finishReason) {
    return false;
  }
  return (['stop', 'length', 'tool-calls', 'content-filter'] as const).includes(finishReason as 'stop' | 'length' | 'tool-calls' | 'content-filter');
}

// ============================================================================
// UI MESSAGE ROLE (AI SDK v5 - only 'user', 'assistant', 'system')
// ============================================================================

export const UI_MESSAGE_ROLES = ['user', 'assistant', 'system'] as const;

export const UIMessageRoleSchema = z.enum(UI_MESSAGE_ROLES).openapi({
  description: 'AI SDK UIMessage role (user, assistant, or system)',
  example: 'assistant',
});

export type UIMessageRole = z.infer<typeof UIMessageRoleSchema>;

export const UIMessageRoles = {
  USER: 'user' as const,
  ASSISTANT: 'assistant' as const,
  SYSTEM: 'system' as const,
} as const;

// ============================================================================
// MESSAGE PART TYPE (AI SDK v5 message part types)
// ============================================================================

export const MESSAGE_PART_TYPES = ['text', 'reasoning', 'tool-call', 'tool-result', 'file', 'step-start'] as const;

export const MessagePartTypeSchema = z.enum(MESSAGE_PART_TYPES).openapi({
  description: 'Types of message content parts',
  example: 'text',
});

export type MessagePartType = z.infer<typeof MessagePartTypeSchema>;

export const MessagePartTypes = {
  TEXT: 'text' as const,
  REASONING: 'reasoning' as const,
  TOOL_CALL: 'tool-call' as const,
  TOOL_RESULT: 'tool-result' as const,
  FILE: 'file' as const,
  STEP_START: 'step-start' as const,
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

export const ReasoningPartTypes = {
  REASONING: 'reasoning' as const,
  THINKING: 'thinking' as const,
  REDACTED: 'redacted' as const,
  TEXT: 'text' as const,
} as const;
