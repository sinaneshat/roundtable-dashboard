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

import type { MessageStatus } from '@/api/core/enums';
import { MESSAGE_STATUSES, MessagePartTypes, ReasoningPartTypeSchema } from '@/api/core/enums';

// ============================================================================
// FILE PART SCHEMA (extracted for reuse)
// ============================================================================

/**
 * ✅ FILE PART: For multi-modal messages (images, PDFs, etc.)
 * AI SDK v6 format for file attachments in messages.
 *
 * SINGLE SOURCE OF TRUTH for file parts used by:
 * - MessagePartSchema (discriminated union member)
 * - Store PendingFileParts (form-actions.ts attachment handling)
 * - Chat hooks (use-chat-attachments.ts)
 *
 * Reference: https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot#multi-modal-messages
 */
export const FilePartSchema = z.object({
  type: z.literal('file'),
  url: z.string().openapi({
    description: 'URL to the file (can be data URL or HTTP URL)',
    example: 'https://example.com/image.png',
  }),
  mediaType: z.string().openapi({
    description: 'MIME type of the file',
    example: 'image/png',
  }),
  filename: z.string().optional().openapi({
    description: 'Original filename for display',
    example: 'screenshot.png',
  }),
});

/**
 * File part TypeScript type
 * ✅ ZOD INFERENCE: Type automatically derived from schema
 */
export type FilePart = z.infer<typeof FilePartSchema>;

/**
 * Extended file part schema for internal use (includes uploadId)
 *
 * ✅ SINGLE SOURCE OF TRUTH: Extends FilePartSchema with internal tracking fields
 * Used when file parts need to reference the original upload for:
 * - Fallback file loading (extract uploadId from URL)
 * - Message-upload junction table lookups
 * - Citation source mapping
 */
export const ExtendedFilePartSchema = FilePartSchema.extend({
  uploadId: z.string().optional().openapi({
    description: 'Internal upload ID for file tracking',
    example: '01HXYZ123ABC',
  }),
});

export type ExtendedFilePart = z.infer<typeof ExtendedFilePartSchema>;

// ============================================================================
// FILE PART TYPE GUARDS
// ============================================================================

/**
 * Type guard: Check if a message part is a file part
 * ✅ TYPE-SAFE: Uses Zod schema validation, no forced casts
 */
export function isFilePart(part: unknown): part is FilePart {
  return FilePartSchema.safeParse(part).success;
}

/**
 * Type guard: Check if a file part has uploadId
 * ✅ TYPE-SAFE: Uses Zod schema validation for ExtendedFilePart
 */
export function hasUploadId(
  part: FilePart,
): part is ExtendedFilePart & { uploadId: string } {
  const result = ExtendedFilePartSchema.safeParse(part);
  if (!result.success)
    return false;
  return (
    typeof result.data.uploadId === 'string' && result.data.uploadId.length > 0
  );
}

/**
 * Extract uploadId from file part URL if present
 * Pattern: /api/v1/uploads/{uploadId}/download
 * ✅ TYPE-SAFE: Returns string or null, no unsafe casts
 */
export function extractUploadIdFromUrl(url: string): string | null {
  const match = url.match(/\/uploads\/([A-Z0-9]+)\//i);
  return match?.[1] ?? null;
}

/**
 * Get uploadId from file part (direct property or extracted from URL)
 * ✅ TYPE-SAFE: Combines both extraction methods
 */
export function getUploadIdFromFilePart(part: FilePart): string | null {
  // First try direct uploadId property
  if (hasUploadId(part)) {
    return part.uploadId;
  }
  // Fallback: extract from URL
  return extractUploadIdFromUrl(part.url);
}

/**
 * Safely extract filename from a part object
 * ✅ TYPE-SAFE: Uses Zod validation, no force casting
 *
 * @param part - Part object that may have a filename property
 * @returns filename string or undefined
 */
export function getFilenameFromPart(part: unknown): string | undefined {
  const parseResult = FilePartSchema.safeParse(part);
  if (parseResult.success && parseResult.data.filename) {
    return parseResult.data.filename;
  }
  return undefined;
}

/**
 * Safely extract mimeType from a part object
 * ✅ TYPE-SAFE: Uses Zod validation, checks both mimeType and mediaType (AI SDK v6 uses mediaType)
 *
 * @param part - Part object that may have a mimeType or mediaType property
 * @returns mimeType string or default
 */
export function getMimeTypeFromPart(part: unknown, defaultType = 'application/octet-stream'): string {
  const parseResult = FilePartSchema.safeParse(part);
  if (parseResult.success) {
    return parseResult.data.mediaType;
  }
  return defaultType;
}

/**
 * Safely extract URL from a part object
 * ✅ TYPE-SAFE: Uses Zod validation, no force casting
 *
 * @param part - Part object that may have a url property
 * @returns url string or undefined
 */
export function getUrlFromPart(part: unknown): string | undefined {
  const parseResult = FilePartSchema.safeParse(part);
  if (parseResult.success) {
    return parseResult.data.url;
  }
  return undefined;
}

/**
 * Zod schema for valid file part for transmission
 * ✅ SINGLE SOURCE OF TRUTH: Schema-based validation for transmission readiness
 */
const ValidFilePartForTransmissionSchema = z
  .object({
    type: z.literal('file'),
    url: z.string().optional(),
    mediaType: z.string().optional(),
    filename: z.string().optional(),
    uploadId: z.string().optional(),
  })
  .refine(
    data =>
      (data.url && data.url.length > 0)
      || (data.uploadId && data.uploadId.length > 0),
    { message: 'File part must have either URL or uploadId' },
  );

/**
 * Type guard: Check if part is a valid file part for AI SDK transmission
 *
 * A file part is valid for transmission if it has:
 * - type === 'file' AND
 * - Either a non-empty URL (HTTP/data URL) OR uploadId for backend fallback
 *
 * ✅ TYPE-SAFE: Uses Zod schema validation, no forced casts
 * ✅ SINGLE SOURCE OF TRUTH: Used by all file part extraction logic
 * - use-multi-participant-chat.ts (triggerNextParticipantWithRefs, startRound, retry)
 * - prepareSendMessagesRequest sanitization filter
 */
export function isValidFilePartForTransmission(
  part: unknown,
): part is ExtendedFilePart {
  return ValidFilePartForTransmissionSchema.safeParse(part).success;
}

/**
 * Extract valid file parts from message parts array
 *
 * ✅ SINGLE SOURCE OF TRUTH: Reusable utility for extracting file parts
 * Used in multi-participant streaming, retry, and message reconstruction
 *
 * @param parts - Array of message parts (can be any shape)
 * @returns Array of valid ExtendedFilePart objects
 */
export function extractValidFileParts(
  parts: unknown[] | undefined,
): ExtendedFilePart[] {
  if (!Array.isArray(parts))
    return [];
  return parts.filter(isValidFilePartForTransmission);
}

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
export const MessagePartSchema = z
  .discriminatedUnion('type', [
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
    // ✅ AI SDK v6 FILE PART: Reuse extracted FilePartSchema
    // Reference: https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot#multi-modal-messages
    FilePartSchema,
    // ✅ AI SDK v6 STEP-START PART: Marks beginning of a step in streaming
    z.object({
      type: z.literal('step-start'),
    }),
  ])
  .openapi('MessagePart');

/**
 * Message part TypeScript type
 * ✅ ZOD INFERENCE: Type automatically derived from schema
 */
export type MessagePart = z.infer<typeof MessagePartSchema>;

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
  if (typeof value !== 'string')
    return false;
  return MESSAGE_STATUSES.includes(value as MessageStatus);
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
    .filter(
      (part): part is Extract<MessagePart, { type: 'text' }> =>
        part.type === MessagePartTypes.TEXT,
    )
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
    .filter(
      (part): part is Extract<MessagePart, { type: 'reasoning' }> =>
        part.type === MessagePartTypes.REASONING,
    )
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
    .filter(
      (part): part is Extract<MessagePart, { type: 'text' | 'reasoning' }> =>
        part.type === MessagePartTypes.TEXT
        || part.type === MessagePartTypes.REASONING,
    )
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
 * textParts.forEach(p => { const text = p.text; }); // TypeScript knows p.text exists
 *
 * // Get only reasoning parts with type safety
 * const reasoningParts = filterPartsByType(parts, 'reasoning');
 * reasoningParts.forEach(p => { const text = p.text; });
 *
 * // Get tool calls
 * const toolCalls = filterPartsByType(parts, 'tool-call');
 * toolCalls.forEach(call => { const toolName = call.toolName; });
 *
 * @see extractTextFromParts - For extracting text content directly
 * @see extractReasoningFromParts - For extracting reasoning content directly
 * @see getPartsByType - Alias with more intuitive naming
 */
export function filterPartsByType<T extends MessagePart['type']>(
  parts: MessagePart[],
  type: T,
): Extract<MessagePart, { type: T }>[] {
  return parts.filter(
    (part): part is Extract<MessagePart, { type: T }> => part.type === type,
  );
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
  return parts.some(part => part.type === MessagePartTypes.REASONING);
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
  return parts.some(part => part.type === MessagePartTypes.TEXT);
}

/**
 * ✅ UTILITY: Check if text content is renderable (not placeholder/encrypted)
 *
 * AI SDK v6 Pattern: Some reasoning models (GPT-5 Nano, o3-mini, etc.) output
 * encrypted reasoning as `[REDACTED]` which should not be considered renderable content.
 *
 * Use this utility to consistently filter out non-renderable text across:
 * - Backend: streaming.handler.ts (empty response detection)
 * - Frontend: use-multi-participant-chat.ts (content validation)
 * - UI: model-message-card.tsx (rendering filter)
 *
 * @param text - Text content to check
 * @returns True if text has renderable content (not empty or [REDACTED])
 *
 * @example
 * if (isRenderableContent('[REDACTED]')) // false - encrypted reasoning
 * if (isRenderableContent('Hello!')) // true - actual content
 * if (isRenderableContent('   ')) // false - whitespace only
 */
export function isRenderableContent(text: string): boolean {
  const trimmed = text.trim();
  // Empty or only [REDACTED] placeholder = not renderable
  return trimmed.length > 0 && !/^\[REDACTED\]$/i.test(trimmed);
}

/**
 * ✅ UTILITY: Check if message parts have renderable content
 *
 * Combines hasText/hasReasoning with isRenderableContent check.
 * Returns true only if there's actual content to display (not just [REDACTED]).
 *
 * AI SDK v6 Pattern: Use this for determining if a response was successful
 * and has content worth displaying to the user.
 *
 * @param parts - Array of message parts
 * @returns True if parts contain actual renderable text or reasoning
 *
 * @example
 * if (hasRenderableContent(message.parts)) {
 *   // Show message normally
 * } else {
 *   // Show error or loading state
 * }
 */
export function hasRenderableContent(parts: MessagePart[]): boolean {
  return parts.some((part) => {
    if (part.type !== MessagePartTypes.TEXT && part.type !== MessagePartTypes.REASONING) {
      // Tool calls and other parts are considered renderable
      return part.type === MessagePartTypes.TOOL_CALL;
    }
    return 'text' in part && typeof part.text === 'string' && isRenderableContent(part.text);
  });
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
 *   const toolName = part.toolName;
 * }
 */
export function isToolCallPart(
  part: MessagePart,
): part is Extract<MessagePart, { type: 'tool-call' }> {
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
 *   const result = part.result;
 * }
 */
export function isToolResultPart(
  part: MessagePart,
): part is Extract<MessagePart, { type: 'tool-result' }> {
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
 *   const toolName = call.toolName;
 * });
 */
export function extractToolCalls(
  parts: MessagePart[],
): Extract<MessagePart, { type: 'tool-call' }>[] {
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
export function extractToolResults(
  parts: MessagePart[],
): Extract<MessagePart, { type: 'tool-result' }>[] {
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
 *   const toolResult = result.result;
 * }
 */
export function findToolResult(
  parts: MessagePart[],
  toolCallId: string,
): Extract<MessagePart, { type: 'tool-result' }> | undefined {
  return extractToolResults(parts).find(
    part => part.toolCallId === toolCallId,
  );
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
// Type for text/reasoning parts only (subset of MessagePart)
type TextOrReasoningPart = Extract<
  z.infer<typeof MessagePartSchema>,
  { type: 'text' } | { type: 'reasoning' }
>;

export function convertUIMessagesToText(parts: TextOrReasoningPart[]): string {
  return parts
    .filter(
      (part): part is { type: 'text'; text: string } =>
        part.type === MessagePartTypes.TEXT,
    )
    .map(part => part.text)
    .join(' ');
}

// ============================================================================
// AI SDK STREAMING RESULT SCHEMAS
// ============================================================================

/**
 * ✅ SCHEMA: Token usage from AI SDK streaming
 *
 * Replaces inline `usage?: { inputTokens?: number; outputTokens?: number }`
 * Used by: streaming.handler.ts, message-persistence.service.ts
 *
 * @see https://sdk.vercel.ai/docs/reference/ai-sdk-core/language-model-usage
 */
export const StreamingUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
  totalTokens: z.number().int().nonnegative().optional(),
});

export type StreamingUsage = z.infer<typeof StreamingUsageSchema>;

/**
 * ✅ SCHEMA: AI SDK reasoning part structure
 *
 * Claude models with extended thinking return reasoning as array of parts.
 * The AI SDK uses 'reasoning' type, while Claude-specific types include 'thinking' and 'redacted'.
 *
 * @see https://sdk.vercel.ai/docs/ai-sdk-core/generating-text#reasoning
 */
export const ReasoningPartSchema = z.object({
  // AI SDK uses 'reasoning' type; Claude models also use 'thinking' and 'redacted'
  // ✅ Uses centralized ReasoningPartTypeSchema from @/api/core/enums
  type: ReasoningPartTypeSchema.optional(),
  text: z.string(),
});

export type ReasoningPart = z.infer<typeof ReasoningPartSchema>;

/**
 * ✅ SCHEMA: AI SDK tool call structure
 *
 * Matches the AI SDK ToolCallPart structure for streaming results.
 * args is optional because DynamicToolCall may not have it.
 * @see https://sdk.vercel.ai/docs/reference/ai-sdk-core/tool-call-part
 */
export const StreamingToolCallSchema = z.object({
  type: z.literal('tool-call').optional(),
  toolCallId: z.string(),
  toolName: z.string(),
  args: z.unknown().optional(),
});

export type StreamingToolCall = z.infer<typeof StreamingToolCallSchema>;

/**
 * ✅ SCHEMA: AI SDK streamText onFinish result
 *
 * Provides type-safe structure for the finish result from AI SDK streaming.
 * Replaces inline types with `[key: string]: unknown` index signatures.
 *
 * Note: `providerMetadata` and `response` remain unknown because they
 * vary by provider - use type guards (isObject) for runtime access.
 *
 * @see streaming.handler.ts onFinish callback
 * @see message-persistence.service.ts extractReasoning
 */
export const StreamingFinishResultSchema = z.object({
  text: z.string(),
  usage: StreamingUsageSchema.optional(),
  finishReason: z.string(),
  // Provider-specific data - use type guards for access
  providerMetadata: z.unknown().optional(),
  response: z.unknown().optional(),
  // Reasoning can be string or array of parts
  reasoning: z.union([
    z.string(),
    z.array(ReasoningPartSchema),
  ]).optional(),
  // Claude 4 models with interleaved thinking
  reasoningText: z.string().optional(),
  // Tool calls from AI SDK
  toolCalls: z.array(StreamingToolCallSchema).optional(),
  toolResults: z.unknown().optional(),
});

export type StreamingFinishResult = z.infer<typeof StreamingFinishResultSchema>;

/**
 * ✅ TYPE GUARD: Check if value is a ReasoningPart
 *
 * @param value - Value to check
 * @returns True if value matches ReasoningPart structure
 */
export function isReasoningPart(value: unknown): value is ReasoningPart {
  return ReasoningPartSchema.safeParse(value).success;
}

/**
 * ✅ TYPE GUARD: Check if reasoning is an array of parts
 *
 * @param reasoning - Reasoning value to check
 * @returns True if reasoning is array of ReasoningPart
 */
export function isReasoningPartArray(reasoning: unknown): reasoning is ReasoningPart[] {
  return Array.isArray(reasoning) && reasoning.every(isReasoningPart);
}

// ============================================================================
// NOTE: All exports are done inline above where each type is defined
// This ensures better tree-shaking and clearer code organization
// ============================================================================
