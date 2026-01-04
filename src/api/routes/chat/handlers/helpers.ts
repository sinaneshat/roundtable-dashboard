import type { UIMessage } from 'ai';
import { TypeValidationError, validateUIMessages } from 'ai';

import { createError } from '@/api/common/error-handling';
import { MessageRoles, UIMessageRoles } from '@/api/core/enums';
import type { ChatMessage } from '@/db/validation';

/**
 * Convert database chat messages to UI Message format
 *
 * ✅ AI SDK V6 OFFICIAL PATTERN - Database Message Validation
 * Reference: https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot-message-persistence#validating-messages-from-database
 *
 * Transforms messages from database format to the UIMessage format expected by the AI SDK.
 * Uses AI SDK's validateUIMessages() for robust validation instead of custom Zod schemas.
 *
 * Validation Flow:
 * 1. Load messages from database (Drizzle query)
 * 2. Transform to UIMessage format (with parts, metadata, createdAt)
 * 3. Validate with AI SDK validateUIMessages() (ensures compliance)
 * 4. Return validated UIMessage[] ready for conversion or streaming
 *
 * IMPORTANT: This function now uses async AI SDK validation.
 * Callers must handle Promise resolution (await or .then()).
 *
 * @param dbMessages - Array of chat messages from database
 * @returns Promise resolving to validated UIMessage array
 * @throws Error if messages fail AI SDK validation (fail-fast approach)
 *
 * @example
 * ```typescript
 * const dbMessages = await db.query.chatMessage.findMany({ ... });
 * const uiMessages = await chatMessagesToUIMessages(dbMessages);
 * const modelMessages = convertToModelMessages(uiMessages);
 * ```
 */
export async function chatMessagesToUIMessages(
  dbMessages: ChatMessage[],
): Promise<UIMessage[]> {
  // Transform database messages to UIMessage format
  // ✅ TYPE-SAFE: Use UIMessage type directly to avoid type assertion
  const messages: UIMessage[] = dbMessages.map((msg) => {
    // Ensure parts is an array and properly typed
    const parts = Array.isArray(msg.parts) ? msg.parts : [];

    // ✅ AI SDK V6 PATTERN: metadata is optional (metadata?: METADATA)
    // When null/undefined in database, we should omit it entirely
    // Reference: https://sdk.vercel.ai/docs/reference/ai-sdk-core/ui-message

    // ✅ TYPE-SAFE ROLE MAPPING: Convert 'tool' to 'assistant' for UI compatibility
    // UI SDK only accepts 'user' | 'assistant' | 'system', not 'tool'
    const uiRole: UIMessage['role'] = msg.role === MessageRoles.TOOL
      ? UIMessageRoles.ASSISTANT
      : msg.role === MessageRoles.USER
        ? UIMessageRoles.USER
        : UIMessageRoles.ASSISTANT;

    const result: UIMessage & { createdAt?: Date } = {
      id: msg.id,
      role: uiRole,
      parts: parts as UIMessage['parts'],
    };

    // Only include metadata and createdAt if they exist in the database
    // Don't pass null - omit fields entirely when missing
    if (msg.metadata) {
      result.metadata = msg.metadata;
    }

    if (msg.createdAt) {
      result.createdAt = msg.createdAt;
    }

    return result;
  });

  // ✅ AI SDK V6 VALIDATION: Use official validateUIMessages() instead of custom Zod
  // Reference: https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot-message-persistence
  //
  // NOTE: We don't validate metadata here because:
  // - User messages in DB may not have metadata (e.g., initial thread creation)
  // - Metadata validation would require ALL messages to have metadata
  // - UIMessage allows optional metadata (metadata?: METADATA)
  // - Validation happens later in the streaming handler when metadata is present
  try {
    return await validateUIMessages({
      messages,
      // Don't validate metadata - allow messages with or without metadata
      // metadataSchema validation requires all messages to have metadata
    });
  } catch (error) {
    // ✅ AI SDK V6 PATTERN: Handle TypeValidationError gracefully
    // Reference: https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot-message-persistence#validating-messages-from-database
    if (TypeValidationError.isInstance(error)) {
      // Re-throw with more context for debugging
      throw createError.internal(
        `Database message validation failed: ${error.message}. `
        + `This usually means messages in the database have invalid structure. `
        + `Check the logs above for the problematic messages.`,
        {
          errorType: 'validation',
          field: 'messages',
        },
      );
    }

    // Re-throw non-validation errors
    throw createError.internal(
      `Invalid message format from database: ${error instanceof Error ? error.message : 'Unknown validation error'}`,
      {
        errorType: 'validation',
        field: 'messages',
      },
    );
  }
}
