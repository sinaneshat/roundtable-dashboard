/**
 * AI SDK v5 Message Utilities
 *
 * Provides helper functions for working with UIMessage and ModelMessage formats.
 * Reduces code duplication by centralizing common message transformation patterns.
 *
 * Key Patterns from AI SDK v5:
 * - UIMessage: Frontend/UI representation of messages (rich format with parts, metadata)
 * - ModelMessage (CoreMessage): Backend/LLM representation (simplified format for providers)
 * - Message conversion: convertToModelMessages() for sending to LLMs
 * - Message validation: validateUIMessages() for runtime safety
 *
 * @module lib/ai/message-utils
 * @see https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot-message-persistence
 * @see https://sdk.vercel.ai/docs/reference/ai-sdk-core/convert-to-model-messages
 * @see https://sdk.vercel.ai/docs/reference/ai-sdk-core/validate-ui-messages
 */

import type { CoreMessage, TypeValidationError, UIMessage } from 'ai';
import { convertToModelMessages, validateUIMessages } from 'ai';

import type { MessageValidationResult } from './types';

// ============================================================================
// Message Format Conversion
// ============================================================================

/**
 * Convert UIMessage array to ModelMessage (CoreMessage) array
 *
 * Wrapper around AI SDK's convertToModelMessages() with additional type safety.
 * Required before passing messages to streamText() or generateText().
 *
 * AI SDK v5 Pattern:
 * - UIMessage: Rich format with parts, metadata, tools
 * - CoreMessage: Simplified format for LLM providers
 *
 * @param messages - Array of UIMessages from frontend or database
 * @returns Array of CoreMessages ready for LLM providers
 *
 * @example
 * ```typescript
 * // Convert messages before sending to LLM
 * const uiMessages = [...previousMessages, newMessage];
 * const modelMessages = convertUIToModelMessages(uiMessages);
 *
 * const result = await streamText({
 *   model,
 *   messages: modelMessages, // ✅ Correct format
 * });
 * ```
 *
 * @see https://sdk.vercel.ai/docs/reference/ai-sdk-core/convert-to-model-messages
 */
export function convertUIToModelMessages(messages: UIMessage[]): CoreMessage[] {
  return convertToModelMessages(messages);
}

/**
 * Validate UIMessage array for correctness
 *
 * Wrapper around AI SDK's validateUIMessages() with typed result.
 * Ensures messages follow proper structure before processing.
 *
 * AI SDK v5 Pattern:
 * - Validates message structure (role, parts, etc.)
 * - Returns validation errors with detailed descriptions
 * - Prevents runtime errors from malformed messages
 * - Note: validateUIMessages is async in AI SDK v5
 *
 * @param messages - Array of UIMessages to validate
 * @returns Promise resolving to validation result with errors if invalid
 *
 * @example
 * ```typescript
 * const result = await validateMessages(messages);
 *
 * if (!result.valid) {
 *   console.error('Invalid messages:', result.errors);
 *   throw new Error('Message validation failed');
 * }
 *
 * // Safe to use validated messages
 * const modelMessages = convertUIToModelMessages(result.validatedMessages!);
 * ```
 *
 * @see https://sdk.vercel.ai/docs/reference/ai-sdk-core/validate-ui-messages
 */
export async function validateMessages(messages: UIMessage[]): Promise<MessageValidationResult> {
  try {
    // AI SDK v5: validateUIMessages takes an object with { messages } and returns Promise
    const validatedMessages = await validateUIMessages({ messages });
    return {
      valid: true,
      validatedMessages,
    };
  } catch (error) {
    const validationErrors = error as { errors?: TypeValidationError[] };
    return {
      valid: false,
      errors: validationErrors.errors,
    };
  }
}

// ============================================================================
// Message Filtering and Deduplication
// ============================================================================

/**
 * Re-exported from @/lib/utils/message-transforms for backward compatibility
 * and centralized message transformation utilities.
 *
 * These functions handle:
 * - Message deduplication by ID (Phase 1)
 * - Consecutive user message deduplication by text content
 * - Empty message filtering
 *
 * @see src/lib/utils/message-transforms.ts for implementations
 */
export {
  deduplicateConsecutiveUserMessages,
  deduplicateMessages,
  filterNonEmptyMessages,
} from '@/lib/utils/message-transforms';

// ============================================================================
// Message Text Extraction
// ============================================================================

/**
 * Extract text content from message parts
 *
 * Filters text parts and concatenates their content.
 * Ignores non-text parts (reasoning, tool-call, etc.).
 *
 * Pattern from src/lib/utils/message-transforms.ts:49-56
 *
 * @param parts - Message parts array
 * @returns Concatenated text content
 *
 * @example
 * ```typescript
 * const text = extractTextFromParts(message.parts);
 * console.log('Message text:', text);
 * ```
 */
export function extractTextFromParts(
  parts: Array<{ type: 'text'; text: string } | { type: 'reasoning'; text: string }>,
): string {
  return parts
    .filter(part => part.type === 'text')
    .map(part => (part as { type: 'text'; text: string }).text)
    .join(' ');
}

/**
 * Extract text content from UIMessage safely
 *
 * Handles null/undefined messages and empty parts arrays.
 * Returns empty string for invalid input.
 *
 * Pattern from src/lib/utils/message-transforms.ts:64-68
 *
 * @param message - UIMessage to extract text from
 * @returns Text content or empty string
 *
 * @example
 * ```typescript
 * const text = extractTextFromMessage(lastMessage);
 * if (text.length > 0) {
 *   console.log('Last message:', text);
 * }
 * ```
 */
export function extractTextFromMessage(message: UIMessage | undefined | null): string {
  if (!message?.parts || !Array.isArray(message.parts))
    return '';
  return extractTextFromParts(message.parts as Array<{ type: 'text'; text: string } | { type: 'reasoning'; text: string }>);
}

// ============================================================================
// Error Message Creation
// ============================================================================

/**
 * Re-exported from @/lib/utils/message-transforms for backward compatibility
 * and centralized message transformation utilities.
 *
 * These functions handle:
 * - Error message creation with structured metadata
 * - Participant metadata merging for multi-model chat
 *
 * @see src/lib/utils/message-transforms.ts for implementations
 */
export {
  createErrorUIMessage,
  mergeParticipantMetadata,
} from '@/lib/utils/message-transforms';
