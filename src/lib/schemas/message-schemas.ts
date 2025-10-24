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
 * - `tool-call`: Tool invocation by the model (function call)
 * - `tool-result`: Result returned from tool execution
 *
 * Used by:
 * - Backend: /src/api/routes/chat/schema.ts - Message validation
 * - Frontend: Chat message rendering components
 * - AI SDK: Message part conversion and streaming
 *
 * @see https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot#message-format - AI SDK message format
 * @see Analysis Agent 5 findings - Tool support requirements
 *
 * @example
 * // Text content part
 * { type: 'text', text: 'This is a regular message' }
 *
 * // Reasoning content part (extended thinking)
 * { type: 'reasoning', text: 'Let me think about this step by step...' }
 *
 * // Tool call part
 * {
 *   type: 'tool-call',
 *   toolCallId: 'call_abc123',
 *   toolName: 'search_web',
 *   args: { query: 'AI SDK documentation' }
 * }
 *
 * // Tool result part
 * {
 *   type: 'tool-result',
 *   toolCallId: 'call_abc123',
 *   toolName: 'search_web',
 *   result: { results: [...] },
 *   isError: false
 * }
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
  z.object({
    type: z.literal('tool-call'),
    toolCallId: z.string().openapi({
      description: 'Unique identifier for this tool call',
      example: 'call_abc123',
    }),
    toolName: z.string().openapi({
      description: 'Name of the tool being called',
      example: 'search_web',
    }),
    args: z.unknown().openapi({
      description: 'Arguments passed to the tool',
      example: { query: 'AI SDK documentation' },
    }),
  }),
  z.object({
    type: z.literal('tool-result'),
    toolCallId: z.string().openapi({
      description: 'Unique identifier matching the original tool call',
      example: 'call_abc123',
    }),
    toolName: z.string().openapi({
      description: 'Name of the tool that was executed',
      example: 'search_web',
    }),
    result: z.unknown().openapi({
      description: 'Result returned from tool execution',
      example: { results: [] },
    }),
    isError: z.boolean().optional().openapi({
      description: 'Whether the tool execution resulted in an error',
      example: false,
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
 *
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
 * ✅ UTILITY: Extract text content from message parts (only 'text' type)
 *
 * Filters message parts to only include 'text' type parts, excluding 'reasoning',
 * 'tool-call', and 'tool-result' parts. This is the correct implementation for
 * extracting user-facing text content.
 *
 * @param parts - Array of message parts
 * @returns Concatenated text from text-type parts only
 *
 * @example
 * const parts = [
 *   { type: 'text', text: 'Hello ' },
 *   { type: 'reasoning', text: 'Let me think...' },
 *   { type: 'text', text: 'world!' }
 * ];
 * extractTextFromParts(parts); // 'Hello world!' (reasoning excluded)
 */
export function extractTextFromParts(parts: MessagePart[]): string {
  return parts
    .filter((part): part is Extract<MessagePart, { type: 'text' }> => part.type === 'text')
    .map(part => part.text)
    .join(' ');
}

/**
 * ✅ UTILITY: Extract text content from a UIMessage safely
 *
 * Convenience wrapper around extractTextFromParts for UIMessage objects.
 * Handles undefined/null messages and invalid parts arrays.
 *
 * @param message - UIMessage to extract text from
 * @returns Text content or empty string if no valid text parts
 *
 * @example
 * const message = {
 *   id: '123',
 *   role: 'assistant',
 *   parts: [
 *     { type: 'text', text: 'Hello!' },
 *     { type: 'reasoning', text: 'Thinking...' }
 *   ]
 * };
 * extractTextFromMessage(message); // 'Hello!'
 */
export function extractTextFromMessage(
  message: { parts?: unknown } | undefined | null,
): string {
  if (!message?.parts || !Array.isArray(message.parts))
    return '';

  // Filter to only valid MessagePart objects
  const validParts = message.parts.filter(isMessagePart);
  return extractTextFromParts(validParts);
}

/**
 * ✅ UTILITY: Extract reasoning content from message parts
 *
 * Extracts only the reasoning parts from a message. Useful for displaying
 * extended thinking or internal model reasoning separately from visible content.
 *
 * @param parts - Array of message parts
 * @returns Space-joined text from all 'reasoning' type parts
 *
 * @example
 * const parts = [
 *   { type: 'text', text: 'Hello' },
 *   { type: 'reasoning', text: 'Let me analyze this...' },
 *   { type: 'reasoning', text: 'After consideration...' }
 * ];
 * extractReasoningFromParts(parts);
 * // 'Let me analyze this... After consideration...'
 *
 * @see hasReasoning - Check if reasoning exists before extraction
 */
export function extractReasoningFromParts(parts: MessagePart[]): string {
  return parts
    .filter((part): part is Extract<MessagePart, { type: 'reasoning' }> => part.type === 'reasoning')
    .map(part => part.text)
    .join(' ');
}

/**
 * ✅ UTILITY: Extract all text content including reasoning
 *
 * Unlike `extractTextFromParts()`, this includes reasoning parts in the output.
 * Use this when you need the complete text content including internal reasoning.
 *
 * @param parts - Array of message parts
 * @returns Space-joined text from text and reasoning parts
 *
 * @example
 * const parts = [
 *   { type: 'text', text: 'Hello' },
 *   { type: 'reasoning', text: 'Let me think...' },
 *   { type: 'text', text: 'world!' }
 * ];
 * extractAllTextFromParts(parts); // 'Hello Let me think... world!'
 *
 * @see extractTextFromParts - For visible text only (excludes reasoning)
 */
export function extractAllTextFromParts(parts: MessagePart[]): string {
  return parts
    .filter((part): part is Extract<MessagePart, { type: 'text' | 'reasoning' }> =>
      part.type === 'text' || part.type === 'reasoning')
    .map(part => part.text)
    .join(' ');
}

/**
 * ✅ UTILITY: Filter message parts by type (generic type-safe filter)
 *
 * Generic utility for filtering message parts by their type discriminator.
 * Provides full type safety with TypeScript's discriminated union inference.
 *
 * @param parts - Array of message parts
 * @param type - Part type to filter by ('text' | 'reasoning' | 'tool-call' | 'tool-result')
 * @returns Filtered array of parts with narrowed type
 *
 * @example
 * // Get only text parts with type safety
 * const textParts = filterPartsByType(parts, 'text');
 * textParts.forEach(p => console.log(p.text)); // TypeScript knows p.text exists
 *
 * // Get only reasoning parts with type safety
 * const reasoningParts = filterPartsByType(parts, 'reasoning');
 * reasoningParts.forEach(p => console.log(p.text));
 *
 * // Get tool calls
 * const toolCalls = filterPartsByType(parts, 'tool-call');
 * toolCalls.forEach(call => console.log(call.toolName, call.args));
 *
 * @see extractTextFromParts - For extracting text content directly
 * @see extractReasoningFromParts - For extracting reasoning content directly
 * @see getPartsByType - Alias with more intuitive naming
 */
export function filterPartsByType<T extends MessagePart['type']>(
  parts: MessagePart[],
  type: T,
): Extract<MessagePart, { type: T }>[] {
  return parts.filter((part): part is Extract<MessagePart, { type: T }> => part.type === type);
}

/**
 * ✅ UTILITY: Get message parts by type (alias for filterPartsByType)
 *
 * Convenience alias with more intuitive naming for retrieving parts.
 * Functionally identical to `filterPartsByType`.
 *
 * @param parts - Array of message parts
 * @param type - Part type to retrieve
 * @returns Array of parts matching the specified type
 *
 * @example
 * const textParts = getPartsByType(message.parts, 'text');
 * const reasoningParts = getPartsByType(message.parts, 'reasoning');
 * const toolCalls = getPartsByType(message.parts, 'tool-call');
 *
 * @see filterPartsByType - Identical functionality with different naming
 */
export function getPartsByType<T extends MessagePart['type']>(
  parts: MessagePart[],
  type: T,
): Extract<MessagePart, { type: T }>[] {
  return filterPartsByType(parts, type);
}

/**
 * ✅ UTILITY: Check if message parts contain reasoning
 *
 * Fast boolean check for the presence of reasoning parts.
 * Use before extracting reasoning to avoid unnecessary processing.
 *
 * @param parts - Array of message parts
 * @returns True if any part is of type 'reasoning'
 *
 * @example
 * if (hasReasoning(message.parts)) {
 *   // Show extended thinking UI
 *   const reasoning = extractReasoningFromParts(message.parts);
 *   renderReasoningPanel(reasoning);
 * }
 *
 * @see extractReasoningFromParts - Extract reasoning content if present
 */
export function hasReasoning(parts: MessagePart[]): boolean {
  return parts.some(part => part.type === 'reasoning');
}

/**
 * ✅ UTILITY: Check if message parts contain text
 *
 * Fast boolean check for the presence of text parts.
 *
 * @param parts - Array of message parts
 * @returns True if any part is of type 'text'
 *
 * @example
 * if (hasText(message.parts)) {
 *   const text = extractTextFromParts(message.parts);
 *   displayMessage(text);
 * }
 */
export function hasText(parts: MessagePart[]): boolean {
  return parts.some(part => part.type === 'text');
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
// TOOL SUPPORT - Type Guards and Utilities
// ============================================================================

/**
 * ✅ TYPE GUARD: Check if a message part is a tool-call
 *
 * @param part - Message part to check
 * @returns True if part is a tool-call part
 *
 * @example
 * if (isToolCallPart(part)) {
 *   console.log(`Calling tool: ${part.toolName}`);
 * }
 */
export function isToolCallPart(part: MessagePart): part is Extract<MessagePart, { type: 'tool-call' }> {
  return part.type === 'tool-call';
}

/**
 * ✅ TYPE GUARD: Check if a message part is a tool-result
 *
 * @param part - Message part to check
 * @returns True if part is a tool-result part
 *
 * @example
 * if (isToolResultPart(part)) {
 *   console.log(`Tool result: ${part.result}`);
 * }
 */
export function isToolResultPart(part: MessagePart): part is Extract<MessagePart, { type: 'tool-result' }> {
  return part.type === 'tool-result';
}

/**
 * ✅ UTILITY: Extract all tool-call parts from message parts
 *
 * @param parts - Array of message parts
 * @returns Array of tool-call parts only
 *
 * @example
 * const toolCalls = extractToolCalls(message.parts);
 * toolCalls.forEach(call => {
 *   console.log(`Tool: ${call.toolName}, Args:`, call.args);
 * });
 */
export function extractToolCalls(parts: MessagePart[]): Extract<MessagePart, { type: 'tool-call' }>[] {
  return parts.filter(isToolCallPart);
}

/**
 * ✅ UTILITY: Extract all tool-result parts from message parts
 *
 * @param parts - Array of message parts
 * @returns Array of tool-result parts only
 *
 * @example
 * const toolResults = extractToolResults(message.parts);
 * const errors = toolResults.filter(r => r.isError);
 */
export function extractToolResults(parts: MessagePart[]): Extract<MessagePart, { type: 'tool-result' }>[] {
  return parts.filter(isToolResultPart);
}

/**
 * ✅ FACTORY: Create a tool-call message part
 *
 * @param toolCallId - Unique identifier for the tool call
 * @param toolName - Name of the tool being called
 * @param args - Arguments to pass to the tool
 * @returns Tool-call message part object
 *
 * @example
 * const part = createToolCallPart('call_123', 'search_web', {
 *   query: 'AI SDK documentation'
 * });
 */
export function createToolCallPart(
  toolCallId: string,
  toolName: string,
  args: unknown,
): Extract<MessagePart, { type: 'tool-call' }> {
  return {
    type: 'tool-call',
    toolCallId,
    toolName,
    args,
  };
}

/**
 * ✅ FACTORY: Create a tool-result message part
 *
 * @param toolCallId - Unique identifier matching the original tool call
 * @param toolName - Name of the tool that was executed
 * @param result - Result returned from tool execution
 * @param isError - Whether the tool execution resulted in an error
 * @returns Tool-result message part object
 *
 * @example
 * const part = createToolResultPart('call_123', 'search_web', {
 *   results: [...]
 * }, false);
 */
export function createToolResultPart(
  toolCallId: string,
  toolName: string,
  result: unknown,
  isError?: boolean,
): Extract<MessagePart, { type: 'tool-result' }> {
  return {
    type: 'tool-result',
    toolCallId,
    toolName,
    result,
    isError,
  };
}

/**
 * ✅ UTILITY: Check if message parts contain any tool calls
 *
 * @param parts - Array of message parts
 * @returns True if any part is a tool-call
 *
 * @example
 * if (hasToolCalls(message.parts)) {
 *   // Show tool execution UI
 * }
 */
export function hasToolCalls(parts: MessagePart[]): boolean {
  return parts.some(isToolCallPart);
}

/**
 * ✅ UTILITY: Check if message parts contain any tool results
 *
 * @param parts - Array of message parts
 * @returns True if any part is a tool-result
 *
 * @example
 * if (hasToolResults(message.parts)) {
 *   // Show tool results UI
 * }
 */
export function hasToolResults(parts: MessagePart[]): boolean {
  return parts.some(isToolResultPart);
}

/**
 * ✅ UTILITY: Find tool result for a specific tool call ID
 *
 * @param parts - Array of message parts
 * @param toolCallId - Tool call ID to find result for
 * @returns Tool result part if found, undefined otherwise
 *
 * @example
 * const result = findToolResult(message.parts, 'call_123');
 * if (result) {
 *   console.log('Tool result:', result.result);
 * }
 */
export function findToolResult(
  parts: MessagePart[],
  toolCallId: string,
): Extract<MessagePart, { type: 'tool-result' }> | undefined {
  return extractToolResults(parts).find(part => part.toolCallId === toolCallId);
}

// ============================================================================
// TEXT CONVERSION UTILITIES
// ============================================================================

/**
 * ✅ UTILITY: Convert UIMessage parts to plain text string
 *
 * Extracts only text parts from UIMessage parts array, excluding reasoning,
 * tool calls, and tool results. This is the standard function for converting
 * message parts to user-facing text content.
 *
 * Type-safe wrapper around extractTextFromParts for explicit UIMessage part handling.
 * Handles partial part objects that may have type and text properties.
 *
 * @param parts - Array of UIMessage parts (may contain text, reasoning, tool parts)
 * @returns Plain text string with spaces between text parts
 *
 * @example
 * const text = convertUIMessagesToText(message.parts);
 * // Returns: "Hello world from user"
 *
 * @example
 * // Handles mixed part types
 * const parts = [
 *   { type: 'text', text: 'Hello' },
 *   { type: 'reasoning', text: 'Let me think...' },
 *   { type: 'text', text: 'world!' }
 * ];
 * convertUIMessagesToText(parts); // 'Hello world!'
 *
 * @see extractTextFromParts - Core text extraction function
 * @see extractTextFromMessage - For extracting text from complete UIMessage objects
 */
export function convertUIMessagesToText(
  parts: Array<{ type: 'text'; text: string } | { type: 'reasoning'; text: string }>,
): string {
  return parts
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map(part => part.text)
    .join(' ');
}

// ============================================================================
// NOTE: All exports are done inline above where each type is defined
// This ensures better tree-shaking and clearer code organization
// ============================================================================
