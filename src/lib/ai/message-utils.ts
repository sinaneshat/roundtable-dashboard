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

import type { AIErrorType, MessageValidationResult, UIMessageWithMetadata } from './types';

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
 * Filter out empty user messages while preserving assistant messages
 *
 * Used to clean message history before sending to LLMs.
 * Prevents context pollution from empty messages.
 *
 * Pattern from src/lib/utils/message-transforms.ts:70-84
 *
 * @param messages - Array of UIMessages
 * @returns Filtered array with non-empty messages
 *
 * @example
 * ```typescript
 * const cleanMessages = filterNonEmptyMessages(allMessages);
 * // Only messages with actual text content remain
 * ```
 */
export function filterNonEmptyMessages(messages: UIMessage[]): UIMessage[] {
  return messages.filter((message) => {
    // Always keep assistant messages
    if (message.role === 'assistant')
      return true;

    // For user messages, check for non-empty text parts
    if (message.role === 'user') {
      const textParts = message.parts?.filter(
        part => part.type === 'text' && 'text' in part && part.text.trim().length > 0,
      );
      return textParts && textParts.length > 0;
    }

    return false;
  });
}

/**
 * ✅ PHASE 1: Global message deduplication by ID
 *
 * PRIMARY DEDUPLICATION POINT - Apply this BEFORE setting messages in any context.
 * Removes duplicate messages by unique ID, preserving first occurrence.
 *
 * Architecture:
 * - Phase 1 (this function): Global deduplication at message array level
 * - Phase 2 (round grouping): Safety net during message grouping
 *
 * Apply at ALL message update points:
 * - ChatContext.initializeThread()
 * - useMultiParticipantChat.onFinish()
 * - useMultiParticipantChat.onError()
 * - useMultiParticipantChat.retry()
 *
 * Pattern from src/lib/utils/message-transforms.ts:109-117
 *
 * @param messages - Messages array (may contain duplicates)
 * @returns Deduplicated messages array (unique by ID)
 *
 * @example
 * ```typescript
 * // Apply BEFORE setting messages
 * const uniqueMessages = deduplicateMessages([...prev, newMessage]);
 * setMessages(uniqueMessages);
 * ```
 */
export function deduplicateMessages(messages: UIMessage[]): UIMessage[] {
  const seen = new Set<string>();
  return messages.filter((msg) => {
    if (seen.has(msg.id))
      return false;
    seen.add(msg.id);
    return true;
  });
}

/**
 * ✅ COMPLEMENTARY: Deduplicate consecutive user messages by text content
 *
 * This handles a DIFFERENT case than deduplicateMessages():
 * - deduplicateMessages() removes duplicate IDs (Phase 1)
 * - This function removes consecutive user messages with same text (edge case)
 *
 * Use case: When startRound() or retry creates consecutive user messages
 * with same text but different IDs.
 *
 * Pattern from src/lib/utils/message-transforms.ts:132-152
 *
 * @param messages - Messages array (may have consecutive duplicate text)
 * @returns Messages with consecutive duplicate user text removed
 *
 * @example
 * ```typescript
 * const cleaned = deduplicateConsecutiveUserMessages(messages);
 * // No consecutive user messages with identical text
 * ```
 */
export function deduplicateConsecutiveUserMessages(messages: UIMessage[]): UIMessage[] {
  const result: UIMessage[] = [];
  let lastUserMessageText: string | null = null;

  for (const message of messages) {
    if (message.role === 'user') {
      const textPart = message.parts?.find(p => p.type === 'text' && 'text' in p);
      const text = textPart && 'text' in textPart ? textPart.text.trim() : '';

      if (text && text === lastUserMessageText)
        continue;
      lastUserMessageText = text;
    } else {
      lastUserMessageText = null;
    }

    result.push(message);
  }

  return result;
}

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
 * Create error UIMessage with structured metadata
 *
 * Used to represent AI errors in the message stream.
 * Includes detailed error context for debugging and user messaging.
 *
 * Pattern from src/lib/utils/message-transforms.ts:166-202
 *
 * @param participant - Participant that encountered the error
 * @param currentIndex - Participant index in multi-model chat
 * @param errorMessage - Human-readable error message
 * @param errorType - Categorized error type
 * @param errorMetadata - Additional error context
 * @param roundNumber - Conversation round number
 * @returns UIMessage representing the error
 *
 * @example
 * ```typescript
 * const errorMessage = createErrorUIMessage(
 *   participant,
 *   0,
 *   'Model rate limit exceeded',
 *   'provider_rate_limit',
 *   { statusCode: 429 },
 *   1
 * );
 *
 * setMessages(prev => [...prev, errorMessage]);
 * ```
 */
export function createErrorUIMessage(
  participant: { id: string; modelId: string; role: string | null },
  currentIndex: number,
  errorMessage: string,
  errorType: AIErrorType = 'error',
  errorMetadata?: {
    errorCategory?: string;
    statusCode?: number;
    rawErrorMessage?: string;
    openRouterError?: string;
    openRouterCode?: string;
    providerMessage?: string;
  },
  roundNumber?: number,
): UIMessageWithMetadata {
  return {
    id: `error-${crypto.randomUUID()}-${currentIndex}`,
    role: 'assistant',
    parts: [{ type: 'text', text: '' }],
    metadata: {
      participantId: participant.id,
      participantIndex: currentIndex,
      ...(participant.role && { participantRole: participant.role }),
      model: participant.modelId,
      hasError: true,
      errorType,
      errorMessage,
      errorCategory: errorMetadata?.errorCategory || errorType,
      statusCode: errorMetadata?.statusCode,
      rawErrorMessage: errorMetadata?.rawErrorMessage,
      providerMessage: errorMetadata?.providerMessage || errorMetadata?.rawErrorMessage || errorMessage,
      openRouterError: errorMetadata?.openRouterError,
      openRouterCode: errorMetadata?.openRouterCode,
      roundNumber,
    },
  };
}

/**
 * Merge participant metadata into existing message
 *
 * Enriches messages with participant context and error detection.
 * Used when processing streamed messages from multiple AI models.
 *
 * Pattern from src/lib/utils/message-transforms.ts:204-239
 *
 * @param message - Original UIMessage
 * @param participant - Participant information
 * @param currentIndex - Participant index
 * @returns Metadata object with merged fields
 *
 * @example
 * ```typescript
 * const enrichedMetadata = mergeParticipantMetadata(
 *   streamedMessage,
 *   participant,
 *   participantIndex
 * );
 *
 * const finalMessage = {
 *   ...streamedMessage,
 *   metadata: enrichedMetadata
 * };
 * ```
 */
export function mergeParticipantMetadata(
  message: UIMessage,
  participant: { id: string; modelId: string; role: string | null },
  currentIndex: number,
): Record<string, unknown> {
  const metadata = message.metadata as Record<string, unknown> | undefined;
  const hasBackendError = metadata?.hasError === true || !!metadata?.error || !!metadata?.errorMessage;

  const textParts = message.parts?.filter(p => p.type === 'text') || [];
  const hasTextContent = textParts.some(
    part => 'text' in part && typeof part.text === 'string' && part.text.trim().length > 0,
  );

  const isEmptyResponse = textParts.length === 0 || !hasTextContent;
  const hasError = hasBackendError || isEmptyResponse;

  let errorMessage = metadata?.errorMessage as string | undefined;
  if (isEmptyResponse && !errorMessage) {
    errorMessage = `The model (${participant.modelId}) did not generate a response. This can happen due to content filtering, model limitations, or API issues.`;
  }

  return {
    ...(metadata || {}),
    participantId: participant.id,
    participantIndex: currentIndex,
    ...(participant.role && { participantRole: participant.role }),
    model: participant.modelId,
    ...(hasError && {
      hasError: true,
      errorType: metadata?.errorType || (isEmptyResponse ? 'empty_response' : 'unknown'),
      errorMessage,
      providerMessage: metadata?.providerMessage || metadata?.openRouterError || errorMessage,
      openRouterError: metadata?.openRouterError,
    }),
  };
}
