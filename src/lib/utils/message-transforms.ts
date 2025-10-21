/**
 * Message Transformation Utilities
 *
 * ✅ AI SDK v5 OFFICIAL PATTERN: Transforms between API types and AI SDK types
 *
 * Reference: https://sdk.vercel.ai/docs/ai-sdk-core/validate-ui-messages
 *
 * These transforms are necessary for AI SDK v5 compatibility:
 * - ChatMessage (from schema) → UIMessage (AI SDK format)
 * - Metadata validation using AI SDK patterns
 */

import type { UIMessage } from 'ai';

import type { ChatMessage, UIMessageMetadata } from '@/api/routes/chat/schema';
import { UIMessageMetadataSchema } from '@/api/routes/chat/schema';

// ============================================================================
// METADATA VALIDATION (AI SDK v5 Official Pattern)
// ============================================================================

/**
 * ✅ AI SDK v5 PATTERN: Runtime-safe metadata extraction with Zod validation
 * Uses safeParse for graceful handling of invalid data
 *
 * Reference: https://sdk.vercel.ai/docs/ai-sdk-core/validate-ui-messages
 *
 * @param metadata - UIMessage metadata field (unknown - from AI SDK UIMessage type)
 * @returns Validated and typed metadata, or undefined if invalid/missing
 */
export function getMessageMetadata(
  metadata: unknown,
): UIMessageMetadata | undefined {
  if (!metadata) {
    return undefined;
  }

  const result = UIMessageMetadataSchema.safeParse(metadata);

  if (!result.success) {
    // Return raw metadata as fallback to prevent data loss
    return metadata as UIMessageMetadata;
  }

  return result.data;
}

// ============================================================================
// MESSAGE TRANSFORMATIONS
// ============================================================================

/**
 * Convert backend ChatMessage to AI SDK UIMessage format
 *
 * ✅ AI SDK v5 ALIGNMENT: Direct pass-through of parts[] array
 * - Database schema now stores parts[] in UIMessage format
 * - No transformation overhead - direct mapping
 * - Supports text, reasoning, and tool-result parts natively
 *
 * @param message - ChatMessage from RPC response (dates can be ISO strings or Date objects)
 * @returns UIMessage in AI SDK format with properly typed metadata
 */
export function chatMessageToUIMessage(message: ChatMessage | (Omit<ChatMessage, 'createdAt'> & { createdAt: string | Date })): UIMessage {
  // ✅ AI SDK v5 PATTERN: Direct pass-through of parts[] from database
  // Database now stores parts in UIMessage format - no transformation needed
  const parts = message.parts || [];

  // Build properly typed metadata
  // ✅ Include createdAt from message
  // Handle null metadata from database by using empty object as base
  const baseMetadata = (message.metadata || {}) as Record<string, unknown>;

  // ✅ Ensure createdAt is a string (convert Date to ISO string if needed)
  const createdAtString = message.createdAt instanceof Date
    ? message.createdAt.toISOString()
    : message.createdAt;

  const metadata: UIMessageMetadata = {
    ...baseMetadata, // Spread metadata from backend
    participantId: message.participantId || undefined, // Override with top-level participantId (convert null to undefined)
    createdAt: createdAtString, // Add timestamp for timeline sorting (as string)
    roundNumber: message.roundNumber, // ✅ EVENT-BASED ROUND TRACKING: Include roundNumber for frontend grouping
  };

  return {
    id: message.id,
    role: message.role,
    parts,
    metadata,
  };
}

/**
 * Convert array of backend ChatMessages to AI SDK UIMessage format
 *
 * @param messages - Array of ChatMessage from RPC response (dates can be ISO strings or Date objects)
 * @returns Array of UIMessages in AI SDK format
 */
export function chatMessagesToUIMessages(messages: (ChatMessage | (Omit<ChatMessage, 'createdAt'> & { createdAt: string | Date }))[]): UIMessage[] {
  return messages.map(chatMessageToUIMessage);
}

// ============================================================================
// HELPER UTILITIES
// ============================================================================

/**
 * ✅ AI SDK v5 HELPER: Extract text content from message parts
 *
 * Concatenates all text parts from a UIMessage or ChatMessage.
 * Useful for:
 * - Displaying message preview/summaries
 * - Extracting content for analysis
 * - Title generation
 *
 * @param parts - Array of message parts (text, reasoning)
 * @returns Concatenated text content, or empty string if no text parts
 */
export function extractTextFromParts(
  parts: Array<
    | { type: 'text'; text: string }
    | { type: 'reasoning'; text: string }
  >,
): string {
  return parts
    .filter(part => part.type === 'text' && 'text' in part)
    .map(part => (part as { type: 'text'; text: string }).text)
    .join(' ');
}

// ============================================================================
// MESSAGE FILTERING
// ============================================================================

/**
 * ✅ SHARED UTILITY: Filter out empty user messages
 *
 * Filters out user messages that have no non-empty text parts.
 * This is necessary for UI display and AI model consumption.
 *
 * Used in:
 * - Frontend: chat-message-list.tsx (UI display)
 * - Backend: chat handler (before sending to AI model)
 *
 * @param messages - Array of UIMessages to filter
 * @returns Filtered array with only non-empty messages
 */
export function filterNonEmptyMessages(messages: UIMessage[]): UIMessage[] {
  return messages.filter((message) => {
    // Keep all assistant messages
    if (message.role === 'assistant') {
      return true;
    }

    // For user messages, only keep if they have non-empty text parts
    if (message.role === 'user') {
      const textParts = message.parts?.filter(part =>
        part.type === 'text' && 'text' in part && part.text.trim().length > 0,
      );
      return textParts && textParts.length > 0;
    }

    return false;
  });
}

/**
 * ✅ DEDUPLICATION UTILITY: Remove duplicate consecutive user messages
 *
 * When startRound() is called, it may create a duplicate user message
 * because the AI SDK always adds a new message when calling sendMessage().
 * This utility removes consecutive user messages with identical content.
 *
 * @param messages - Array of UIMessages to deduplicate
 * @returns Filtered array without consecutive duplicate user messages
 */
export function deduplicateConsecutiveUserMessages(messages: UIMessage[]): UIMessage[] {
  const result: UIMessage[] = [];
  let lastUserMessageText: string | null = null;

  for (const message of messages) {
    if (message.role === 'user') {
      // Extract text from user message
      const textPart = message.parts?.find(p => p.type === 'text' && 'text' in p);
      const text = textPart && 'text' in textPart ? textPart.text.trim() : '';

      // Skip if this is a duplicate of the last user message
      if (text && text === lastUserMessageText) {
        continue;
      }

      lastUserMessageText = text;
    } else {
      // Reset on non-user messages (so we only check consecutive user messages)
      lastUserMessageText = null;
    }

    result.push(message);
  }

  return result;
}

// ============================================================================
// ERROR MESSAGE CREATION (Multi-Participant Chat Support)
// ============================================================================

/**
 * Error type for UI message errors
 * Maps to backend AI provider error categories
 */
export type UIMessageErrorType
  = | 'provider_rate_limit'
    | 'provider_network'
    | 'model_not_found'
    | 'model_content_filter'
    | 'authentication'
    | 'validation'
    | 'silent_failure'
    | 'empty_response'
    | 'error'
    | 'unknown';

/**
 * ✅ ERROR MESSAGE CREATION: Create error UIMessage for failed AI responses
 *
 * PATTERN: Shared utility for consistent error message creation across the codebase
 * REFERENCE: frontend-patterns.md:1458-1524 (Utility Libraries & Helpers)
 *
 * This utility consolidates error message creation logic that was duplicated
 * 3 times in use-multi-participant-chat.ts (onError, onFinish no-message, onFinish validation).
 *
 * Used in:
 * - use-multi-participant-chat.ts: Create error messages for failed AI streaming
 * - Future: Any component that needs to display AI provider errors
 *
 * @param participant - Participant that encountered the error
 * @param participant.id - Participant ID
 * @param participant.modelId - Model ID being used
 * @param participant.role - Role description (nullable)
 * @param currentIndex - Current participant index in the round
 * @param errorMessage - User-facing error message
 * @param errorType - Category of error (provider, model, validation, etc.)
 * @param errorMetadata - Optional structured error metadata from backend
 * @returns UIMessage with error metadata for display
 *
 * @example
 * ```typescript
 * const errorMsg = createErrorUIMessage(
 *   { id: 'p1', modelId: 'claude-3', role: 'Developer' },
 *   0,
 *   'Rate limit exceeded',
 *   'provider_rate_limit',
 *   { statusCode: 429, openRouterCode: 'rate_limit_exceeded' }
 * );
 * setMessages(prev => [...prev, errorMsg]);
 * ```
 */
export function createErrorUIMessage(
  participant: {
    id: string;
    modelId: string;
    role: string | null;
  },
  currentIndex: number,
  errorMessage: string,
  errorType: UIMessageErrorType = 'error',
  errorMetadata?: {
    errorCategory?: string;
    statusCode?: number;
    rawErrorMessage?: string;
    openRouterError?: string;
    openRouterCode?: string;
    providerMessage?: string;
  },
): UIMessage {
  // Generate unique error message ID
  const errorMessageId = `error-${crypto.randomUUID()}-${currentIndex}`;

  // Build error UIMessage with comprehensive metadata
  return {
    id: errorMessageId,
    role: 'assistant',
    // ✅ Empty text part ensures message card renders
    // The MessageErrorDetails component displays error from metadata
    parts: [{ type: 'text', text: '' }],
    metadata: {
      participantId: participant.id,
      participantIndex: currentIndex,
      participantRole: participant.role,
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
    },
  };
}

// ============================================================================
// METADATA MERGING (Multi-Participant Chat Support)
// ============================================================================

/**
 * ✅ METADATA MERGE UTILITY: Merge participant info with message metadata
 *
 * PATTERN: Shared utility for consistent metadata merging across codebase
 * REFERENCE: frontend-patterns.md:1458-1524 (Utility Libraries & Helpers)
 *
 * This utility consolidates metadata merging logic that was inline in
 * use-multi-participant-chat.ts onFinish callback (~70 lines).
 *
 * Features:
 * - Merges participant identification (id, role, model)
 * - Detects empty responses and backend errors
 * - Builds comprehensive error metadata
 * - Preserves existing metadata from backend
 *
 * @param message - UIMessage from AI SDK with potential metadata
 * @param participant - Participant info (id, modelId, role)
 * @param currentIndex - Current participant index in round
 * @returns Merged metadata object ready for UIMessage
 *
 * @example
 * ```typescript
 * const updatedMetadata = mergeParticipantMetadata(
 *   data.message,
 *   { id: 'p1', modelId: 'claude-3', role: 'Developer' },
 *   0
 * );
 * setMessages(prev => [...prev, { ...data.message, metadata: updatedMetadata }]);
 * ```
 */
export function mergeParticipantMetadata(
  message: UIMessage,
  participant: {
    id: string;
    modelId: string;
    role: string | null;
  },
  currentIndex: number,
): Record<string, unknown> {
  // ✅ Extract existing metadata from message
  const messageMetadata = message.metadata as Record<string, unknown> | undefined;
  const hasBackendError = messageMetadata?.hasError === true
    || !!messageMetadata?.error
    || !!messageMetadata?.errorMessage;

  // ✅ Detect empty responses (no text content)
  const textParts = message.parts?.filter(p => p.type === 'text') || [];
  const hasTextContent = textParts.some((part) => {
    if ('text' in part && typeof part.text === 'string') {
      return part.text.trim().length > 0;
    }
    return false;
  });

  const isEmptyResponse = textParts.length === 0 || !hasTextContent;
  const hasError = hasBackendError || isEmptyResponse;

  // Build error message for empty responses
  let errorMessage = messageMetadata?.errorMessage as string | undefined;
  if (isEmptyResponse && !errorMessage) {
    errorMessage = `The model (${participant.modelId}) did not generate a response. This can happen due to content filtering, model limitations, or API issues.`;
  }

  // ✅ Merge participant metadata with existing backend metadata
  return {
    // Preserve existing metadata from backend
    ...(typeof message.metadata === 'object' && message.metadata !== null ? message.metadata : {}),
    // Add participant identification
    participantId: participant.id,
    participantIndex: currentIndex,
    participantRole: participant.role,
    model: participant.modelId,
    // Add error fields if error detected
    ...(hasError && {
      hasError: true,
      errorType: messageMetadata?.errorType || (isEmptyResponse ? 'empty_response' : 'unknown'),
      errorMessage,
      providerMessage: messageMetadata?.providerMessage || messageMetadata?.openRouterError || errorMessage,
      openRouterError: messageMetadata?.openRouterError,
    }),
  };
}
