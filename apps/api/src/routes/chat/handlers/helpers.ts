import { MessageRoles, UIMessageRoles } from '@roundtable/shared/enums';
import type { UIMessage } from 'ai';

import { createError } from '@/common/error-handling';
import type { ChatMessage } from '@/db/validation';

import type { StreamChatRequest } from '../schema';

// ============================================================================
// LAZY AI SDK LOADING
// ============================================================================

// Cache the AI SDK module to avoid repeated dynamic imports
// This is critical for Cloudflare Workers which have a 400ms startup limit
let aiSdkModule: typeof import('ai') | null = null;

async function getAiSdk() {
  if (!aiSdkModule) {
    aiSdkModule = await import('ai');
  }
  return aiSdkModule;
}

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
      // TYPE BRIDGE: DbMessageParts and UIMessage['parts'] are structurally compatible but
      // TypeScript cannot verify this due to external AI SDK type definitions.
      // Validation occurs via validateUIMessages() below to ensure runtime safety.
      parts: parts as UIMessage['parts'],
      role: uiRole,
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
    // ✅ LAZY LOAD AI SDK: Load at function invocation, not module startup
    const { validateUIMessages } = await getAiSdk();

    return await validateUIMessages({
      messages,
      // Don't validate metadata - allow messages with or without metadata
      // metadataSchema validation requires all messages to have metadata
    });
  } catch (error) {
    // ✅ AI SDK V6 PATTERN: Handle TypeValidationError gracefully
    // Reference: https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot-message-persistence#validating-messages-from-database
    // ✅ LAZY LOAD: TypeValidationError.isInstance is a static method - load dynamically
    const { TypeValidationError } = await getAiSdk();
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

/**
 * Validate and convert a Zod-validated request message to AI SDK UIMessage type
 *
 * TYPE BRIDGE: StreamChatRequest['message'] from Zod validation is structurally
 * compatible with AI SDK UIMessage, but TypeScript cannot verify this due to
 * nominal typing differences. This function uses AI SDK's validateUIMessages()
 * to ensure runtime safety and returns a properly typed UIMessage.
 *
 * NOTE: AI SDK v6 UIMessage does NOT have a createdAt field - that's a database
 * extension used in chatMessagesToUIMessages. This function only handles the
 * core UIMessage fields: id, role, parts, and optional metadata.
 *
 * @param message - Message from StreamChatRequest validation (Zod-inferred type)
 * @returns Promise resolving to validated UIMessage
 * @throws Error if message fails AI SDK validation
 */
export async function validateRequestMessage(
  message: StreamChatRequest['message'],
): Promise<UIMessage> {
  const { validateUIMessages } = await getAiSdk();

  // Build the message object with required fields
  // AI SDK v6 UIMessage: { id, role, parts, metadata? }
  const messageToValidate: UIMessage = {
    id: message.id,
    parts: message.parts,
    role: message.role,
  };

  // Only include optional metadata if it exists
  if (message.metadata !== undefined) {
    messageToValidate.metadata = message.metadata;
  }

  // NOTE: createdAt from request schema is NOT part of AI SDK UIMessage type
  // It's used for DB storage but not needed for AI SDK validation

  try {
    const validated = await validateUIMessages({
      messages: [messageToValidate],
    });
    // validateUIMessages returns array same length as input
    const result = validated[0];
    if (!result) {
      throw createError.badRequest('Message validation returned empty result', {
        errorType: 'validation',
        field: 'message',
      });
    }
    return result;
  } catch (error) {
    const { TypeValidationError } = await getAiSdk();
    if (TypeValidationError.isInstance(error)) {
      throw createError.badRequest(
        `Invalid message format: ${error.message}`,
        {
          errorType: 'validation',
          field: 'message',
        },
      );
    }
    throw createError.badRequest(
      `Invalid message format: ${error instanceof Error ? error.message : 'Unknown validation error'}`,
      {
        errorType: 'validation',
        field: 'message',
      },
    );
  }
}
