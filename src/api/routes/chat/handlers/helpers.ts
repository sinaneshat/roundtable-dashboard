import type { UIMessage } from 'ai';
import { TypeValidationError, validateUIMessages } from 'ai';

import { createError } from '@/api/common/error-handling';
import type { ChatMessage } from '@/db/validation';

/**
 * Convert database chat messages to UI Message format
 *
 * ✅ AI SDK V5 OFFICIAL PATTERN - Database Message Validation
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
  const messages = dbMessages.map((msg) => {
    // Ensure parts is an array and properly typed
    const parts = Array.isArray(msg.parts) ? msg.parts : [];

    // ✅ AI SDK V5 PATTERN: metadata is optional (metadata?: METADATA)
    // When null/undefined in database, we should omit it entirely
    // Reference: https://sdk.vercel.ai/docs/reference/ai-sdk-core/ui-message
    const result: {
      id: string;
      role: typeof msg.role;
      parts: typeof parts;
      metadata?: unknown;
      createdAt: Date;
    } = {
      id: msg.id,
      role: msg.role,
      parts,
      createdAt: msg.createdAt,
    };

    // Only include metadata if it exists in the database
    // Don't pass null - omit the field entirely when missing
    if (msg.metadata) {
      result.metadata = msg.metadata;
    }

    return result;
  });

  // ✅ AI SDK V5 VALIDATION: Use official validateUIMessages() instead of custom Zod
  // Reference: https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot-message-persistence
  //
  // NOTE: We don't validate metadata here because:
  // - User messages in DB may not have metadata (e.g., initial thread creation)
  // - Metadata validation would require ALL messages to have metadata
  // - UIMessage allows optional metadata (metadata?: METADATA)
  // - Validation happens later in the streaming handler when metadata is present
  try {
    return await validateUIMessages({
      messages: messages as UIMessage[],
      // Don't validate metadata - allow messages with or without metadata
      // metadataSchema validation requires all messages to have metadata
    });
  } catch (error) {
    // ✅ AI SDK V5 PATTERN: Handle TypeValidationError gracefully
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
