/**
 * Message Schemas - Shared between Frontend and Backend
 *
 * ✅ SINGLE SOURCE OF TRUTH: Message structure schemas
 *
 * Consolidates message schemas used by:
 * - Backend API (/src/api/routes/chat/schema.ts)
 * - Frontend components (chat UI, streaming hooks)
 * - AI SDK integration (message parts, status)
 *
 * Pattern: Zod-first with shared validation for type safety across stack.
 *
 * @see /docs/backend-patterns.md - Schema consolidation patterns
 */

import { z } from '@hono/zod-openapi';

import { MESSAGE_PART_TYPES, MESSAGE_STATUSES, MessageStatusSchema } from '@/api/core/enums';

// ============================================================================
// MESSAGE PART SCHEMAS
// ============================================================================

/**
 * ✅ SHARED: Message part schema for AI SDK message parts
 * Used for rendering different types of content in messages
 *
 * Discriminated union pattern for type-safe message content:
 * - `text`: Regular message content
 * - `reasoning`: Model internal reasoning (e.g., Claude extended thinking)
 *
 * Used by:
 * - Backend: /src/api/routes/chat/schema.ts - Message validation
 * - Frontend: Chat message rendering components
 * - AI SDK: Message part conversion and streaming
 *
 * @example
 * // Text content part
 * { type: 'text', text: 'This is a regular message' }
 *
 * // Reasoning content part (extended thinking)
 * { type: 'reasoning', text: 'Let me think about this step by step...' }
 */
export const MessagePartSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('text'),
    text: z.string().openapi({
      description: 'Regular text content',
      example: 'This is a response to your question',
    }),
  }),
  z.object({
    type: z.literal('reasoning'),
    text: z.string().openapi({
      description: 'Model internal reasoning content',
      example: 'Let me analyze this step by step...',
    }),
  }),
]).openapi('MessagePart');

/**
 * Message part TypeScript type
 * ✅ ZOD INFERENCE: Type automatically derived from schema
 */
export type MessagePart = z.infer<typeof MessagePartSchema>;

// ============================================================================
// MESSAGE STATUS (re-export from enums for convenience)
// ============================================================================

/**
 * ✅ RE-EXPORT: Message status for UI rendering states
 * Represents the current state of a message during streaming
 *
 * Possible values:
 * - `thinking`: AI is processing the request
 * - `streaming`: Actively streaming response tokens
 * - `completed`: Response fully streamed and saved
 * - `error`: An error occurred during generation
 *
 * Used by:
 * - Frontend: Message UI components (loading states, error display)
 * - Backend: Streaming event emission
 *
 * @see /src/api/core/enums.ts - MessageStatusSchema definition
 */
export { MESSAGE_PART_TYPES, MESSAGE_STATUSES, MessageStatusSchema };

/**
 * Message status TypeScript type
 * ✅ RE-EXPORT: From centralized enums
 */
export type MessageStatus = z.infer<typeof MessageStatusSchema>;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * ✅ TYPE GUARD: Check if an object is a valid MessagePart
 *
 * @param value - Value to check
 * @returns True if value matches MessagePart schema
 *
 * @example
 * if (isMessagePart(data)) {
 *   // TypeScript knows data is MessagePart
 *   console.log(data.type, data.text);
 * }
 */
export function isMessagePart(value: unknown): value is MessagePart {
  return MessagePartSchema.safeParse(value).success;
}

/**
 * ✅ TYPE GUARD: Check if a value is a valid MessageStatus
 *
 * @param value - Value to check
 * @returns True if value is a valid message status
 *
 * @example
 * if (isMessageStatus(status)) {
 *   // TypeScript knows status is MessageStatus
 *   switch (status) {
 *     case 'streaming': ...
 *     case 'completed': ...
 *   }
 * }
 */
export function isMessageStatus(value: unknown): value is MessageStatus {
  return typeof value === 'string' && MESSAGE_STATUSES.includes(value as MessageStatus);
}

/**
 * ✅ UTILITY: Extract all text content from message parts
 *
 * @param parts - Array of message parts
 * @returns Concatenated text from all parts
 *
 * @example
 * const parts = [
 *   { type: 'text', text: 'Hello ' },
 *   { type: 'text', text: 'world!' }
 * ];
 * extractTextFromParts(parts); // 'Hello world!'
 */
export function extractTextFromParts(parts: MessagePart[]): string {
  return parts.map(part => part.text).join('');
}

/**
 * ✅ UTILITY: Filter message parts by type
 *
 * @param parts - Array of message parts
 * @param type - Part type to filter by
 * @returns Filtered array of parts
 *
 * @example
 * const textParts = filterPartsByType(parts, 'text');
 * const reasoningParts = filterPartsByType(parts, 'reasoning');
 */
export function filterPartsByType<T extends MessagePart['type']>(
  parts: MessagePart[],
  type: T,
): Extract<MessagePart, { type: T }>[] {
  return parts.filter((part): part is Extract<MessagePart, { type: T }> => part.type === type);
}

/**
 * ✅ UTILITY: Check if message parts contain reasoning
 *
 * @param parts - Array of message parts
 * @returns True if any part is of type 'reasoning'
 *
 * @example
 * if (hasReasoning(message.parts)) {
 *   // Show reasoning UI
 * }
 */
export function hasReasoning(parts: MessagePart[]): boolean {
  return parts.some(part => part.type === 'reasoning');
}

/**
 * ✅ UTILITY: Create a text message part
 *
 * @param text - Text content
 * @returns Text message part object
 *
 * @example
 * const part = createTextPart('Hello world!');
 * // { type: 'text', text: 'Hello world!' }
 */
export function createTextPart(text: string): MessagePart {
  return { type: 'text', text };
}

/**
 * ✅ UTILITY: Create a reasoning message part
 *
 * @param text - Reasoning content
 * @returns Reasoning message part object
 *
 * @example
 * const part = createReasoningPart('Let me think...');
 * // { type: 'reasoning', text: 'Let me think...' }
 */
export function createReasoningPart(text: string): MessagePart {
  return { type: 'reasoning', text };
}

// ============================================================================
// NOTE: All exports are done inline above where each type is defined
// This ensures better tree-shaking and clearer code organization
// ============================================================================
