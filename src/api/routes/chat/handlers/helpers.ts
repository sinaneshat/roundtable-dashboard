import type { UIMessage } from 'ai';
import { validateUIMessages } from 'ai';

import type * as tables from '@/db/schema';
import type { ErrorCategory } from '@/lib/schemas/error-schemas';
import { categorizeErrorMessage, ErrorCategorySchema, FinishReasonSchema } from '@/lib/schemas/error-schemas';
import { UIMessageMetadataSchema } from '@/lib/schemas/message-metadata';

// ============================================================================
// ERROR CATEGORIZATION HELPERS
// ============================================================================

/**
 * Categorize error based on error message content
 * ✅ Now using Zod-inferred ErrorCategory type from error-schemas
 */
export function categorizeError(errorMessage: string): ErrorCategory {
  return categorizeErrorMessage(errorMessage);
}

/**
 * Build structured error message from streaming response
 * ✅ Now using ErrorCategory type from error-schemas
 */
export function buildStreamErrorMessage(options: {
  openRouterError?: string;
  outputTokens: number;
  inputTokens: number;
  finishReason: string;
  modelId: string;
}): { errorMessage: string; providerMessage: string; errorCategory: ErrorCategory } | null {
  const { openRouterError, outputTokens, inputTokens, finishReason, modelId } = options;

  if (openRouterError) {
    const errorCategory = categorizeError(openRouterError);
    return {
      providerMessage: openRouterError,
      errorMessage: `OpenRouter Error for ${modelId}: ${openRouterError}`,
      errorCategory,
    };
  }

  if (outputTokens === 0) {
    const baseStats = `Input: ${inputTokens} tokens, Output: 0 tokens, Status: ${finishReason}`;

    if (finishReason === FinishReasonSchema.enum.stop) {
      return {
        providerMessage: `Model completed but returned no content. ${baseStats}. This may indicate content filtering, safety constraints, or the model chose not to respond.`,
        errorMessage: `${modelId} returned empty response - possible content filtering or safety block`,
        errorCategory: ErrorCategorySchema.enum.content_filter,
      };
    }
    if (finishReason === FinishReasonSchema.enum.length) {
      return {
        providerMessage: `Model hit token limit before generating content. ${baseStats}. Try reducing the conversation history or input length.`,
        errorMessage: `${modelId} exceeded token limit without generating content`,
        errorCategory: ErrorCategorySchema.enum.provider_error,
      };
    }
    if (finishReason === FinishReasonSchema.enum['content-filter']) {
      return {
        providerMessage: `Content was filtered by safety systems. ${baseStats}`,
        errorMessage: `${modelId} blocked by content filter`,
        errorCategory: ErrorCategorySchema.enum.content_filter,
      };
    }
    if (finishReason === FinishReasonSchema.enum.error || finishReason === FinishReasonSchema.enum.other) {
      return {
        providerMessage: `Provider error prevented response generation. ${baseStats}. This may be a temporary issue with the model provider.`,
        errorMessage: `${modelId} encountered a provider error`,
        errorCategory: ErrorCategorySchema.enum.provider_error,
      };
    }

    return {
      providerMessage: `Model returned empty response. ${baseStats}`,
      errorMessage: `${modelId} returned empty response (reason: ${finishReason})`,
      errorCategory: ErrorCategorySchema.enum.empty_response,
    };
  }

  return null;
}

/**
 * Extract OpenRouter error details from provider metadata or response
 * ✅ Now using ErrorCategory type from error-schemas
 */
export function extractOpenRouterError(
  providerMetadata: unknown,
  response: unknown,
): { openRouterError?: string; errorCategory?: ErrorCategory } {
  let openRouterError: string | undefined;
  let errorCategory: ErrorCategory | undefined;

  // Check providerMetadata
  if (providerMetadata && typeof providerMetadata === 'object') {
    const metadata = providerMetadata as Record<string, unknown>;
    if (metadata.error) {
      openRouterError = typeof metadata.error === 'string'
        ? metadata.error
        : JSON.stringify(metadata.error);
    }
    if (!openRouterError && metadata.errorMessage) {
      openRouterError = String(metadata.errorMessage);
    }
    if (metadata.moderation || metadata.contentFilter) {
      errorCategory = ErrorCategorySchema.enum.content_filter;
      openRouterError = openRouterError || 'Content was filtered by safety systems';
    }
  }

  // Check response object
  if (!openRouterError && response && typeof response === 'object') {
    const resp = response as Record<string, unknown>;
    if (resp.error) {
      openRouterError = typeof resp.error === 'string'
        ? resp.error
        : JSON.stringify(resp.error);
    }
  }

  return { openRouterError, errorCategory };
}

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
  dbMessages: Array<typeof tables.chatMessage.$inferSelect>,
): Promise<UIMessage[]> {
  // Transform database messages to UIMessage format
  const messages = dbMessages.map((msg) => {
    // Ensure parts is an array and properly typed
    const parts = Array.isArray(msg.parts) ? msg.parts : [];

    return {
      id: msg.id,
      role: msg.role,
      parts,
      metadata: msg.metadata || null,
      createdAt: msg.createdAt,
    };
  });

  // ✅ AI SDK V5 VALIDATION: Use official validateUIMessages() instead of custom Zod
  // Benefits:
  // - Official AI SDK validation (more robust than custom schemas)
  // - Catches format issues early (before streaming)
  // - Better error messages from AI SDK
  // - Consistent with streaming handler validation patterns
  try {
    return await validateUIMessages({
      messages: messages as UIMessage[],
      metadataSchema: UIMessageMetadataSchema, // Custom metadata validation for participant tracking
    });
  } catch (error) {
    // ✅ FAIL-FAST: Throw error instead of silent fallback
    // This ensures invalid database data is caught early rather than causing
    // downstream issues in message conversion or streaming
    throw new Error(
      `Invalid message format from database: ${error instanceof Error ? error.message : 'Unknown validation error'}`,
    );
  }
}

// ============================================================================
// NOTE: verifyThreadOwnership has been moved to /src/api/common/permissions.ts
// Import from there instead: import { verifyThreadOwnership } from '@/api/common/permissions'
// ============================================================================
