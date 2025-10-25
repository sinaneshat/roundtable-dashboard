import type { UIMessage } from 'ai';
import { eq } from 'drizzle-orm';

import { ErrorContextBuilders } from '@/api/common/error-contexts';
import { createError } from '@/api/common/error-handling';
import type { getDbAsync } from '@/db';
import * as tables from '@/db/schema';

// ============================================================================
// ERROR CATEGORIZATION HELPERS
// ============================================================================

/**
 * Categorize error based on error message content
 */
export function categorizeError(errorMessage: string): string {
  const errorLower = errorMessage.toLowerCase();

  if (errorLower.includes('not found') || errorLower.includes('does not exist')) {
    return 'model_not_found';
  }
  if (errorLower.includes('filter') || errorLower.includes('safety') || errorLower.includes('moderation')) {
    return 'content_filter';
  }
  if (errorLower.includes('rate limit') || errorLower.includes('quota')) {
    return 'rate_limit';
  }
  if (errorLower.includes('timeout') || errorLower.includes('connection')) {
    return 'network';
  }
  return 'provider_error';
}

/**
 * Build structured error message from streaming response
 */
export function buildStreamErrorMessage(options: {
  openRouterError?: string;
  outputTokens: number;
  inputTokens: number;
  finishReason: string;
  modelId: string;
}): { errorMessage: string; providerMessage: string; errorCategory: string } | null {
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

    if (finishReason === 'stop') {
      return {
        providerMessage: `Model completed but returned no content. ${baseStats}. This may indicate content filtering, safety constraints, or the model chose not to respond.`,
        errorMessage: `${modelId} returned empty response - possible content filtering or safety block`,
        errorCategory: 'content_filter',
      };
    }
    if (finishReason === 'length') {
      return {
        providerMessage: `Model hit token limit before generating content. ${baseStats}. Try reducing the conversation history or input length.`,
        errorMessage: `${modelId} exceeded token limit without generating content`,
        errorCategory: 'provider_error',
      };
    }
    if (finishReason === 'content-filter') {
      return {
        providerMessage: `Content was filtered by safety systems. ${baseStats}`,
        errorMessage: `${modelId} blocked by content filter`,
        errorCategory: 'content_filter',
      };
    }
    if (finishReason === 'error' || finishReason === 'other') {
      return {
        providerMessage: `Provider error prevented response generation. ${baseStats}. This may be a temporary issue with the model provider.`,
        errorMessage: `${modelId} encountered a provider error`,
        errorCategory: 'provider_error',
      };
    }

    return {
      providerMessage: `Model returned empty response. ${baseStats}`,
      errorMessage: `${modelId} returned empty response (reason: ${finishReason})`,
      errorCategory: 'empty_response',
    };
  }

  return null;
}

/**
 * Extract OpenRouter error details from provider metadata or response
 */
export function extractOpenRouterError(
  providerMetadata: unknown,
  response: unknown,
): { openRouterError?: string; errorCategory?: string } {
  let openRouterError: string | undefined;
  let errorCategory: string | undefined;

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
      errorCategory = 'content_filter';
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

export function chatMessagesToUIMessages(
  dbMessages: Array<typeof tables.chatMessage.$inferSelect>,
): UIMessage[] {
  return dbMessages.map(msg => ({
    id: msg.id,
    role: msg.role as 'user' | 'assistant',
    parts: msg.parts as unknown as Array<{ type: 'text'; text: string } | { type: 'reasoning'; text: string }>,
    ...(msg.metadata && { metadata: msg.metadata }),
    createdAt: msg.createdAt,
  })) as UIMessage[];
}
export async function verifyThreadOwnership(
  threadId: string,
  userId: string,
  db: Awaited<ReturnType<typeof getDbAsync>>,
): Promise<typeof tables.chatThread.$inferSelect>;
export async function verifyThreadOwnership(
  threadId: string,
  userId: string,
  db: Awaited<ReturnType<typeof getDbAsync>>,
  options: { includeParticipants: true },
): Promise<typeof tables.chatThread.$inferSelect & {
  participants: Array<typeof tables.chatParticipant.$inferSelect>;
}>;
export async function verifyThreadOwnership(
  threadId: string,
  userId: string,
  db: Awaited<ReturnType<typeof getDbAsync>>,
  options?: { includeParticipants?: boolean },
) {
  const thread = await db.query.chatThread.findFirst({
    where: eq(tables.chatThread.id, threadId),
    with: options?.includeParticipants
      ? {
          participants: {
            where: eq(tables.chatParticipant.isEnabled, true),
            orderBy: [tables.chatParticipant.priority, tables.chatParticipant.id],
          },
        }
      : undefined,
  });
  if (!thread) {
    throw createError.notFound('Thread not found', ErrorContextBuilders.resourceNotFound('thread', threadId));
  }
  if (thread.userId !== userId) {
    throw createError.unauthorized(
      'Not authorized to access this thread',
      ErrorContextBuilders.authorization('thread', threadId),
    );
  }
  if (options?.includeParticipants) {
    const threadWithParticipants = thread as typeof thread & {
      participants: Array<typeof tables.chatParticipant.$inferSelect>;
    };
    if (threadWithParticipants.participants.length === 0) {
      throw createError.badRequest(
        'No enabled participants in this thread. Please add or enable at least one AI model to continue the conversation.',
        { errorType: 'validation' },
      );
    }
  }
  return thread;
}
