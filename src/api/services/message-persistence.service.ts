/**
 * Message Persistence Service - Save AI responses to database
 *
 * Following backend-patterns.md: Service layer for business logic
 * Extracted from streaming.handler.ts onFinish callback
 *
 * This service handles:
 * - Saving AI assistant messages after streaming completes
 * - Extracting reasoning from multiple sources (deltas, finishResult, providerMetadata)
 * - Creating pending analysis records for completed rounds
 */

import { and, asc, eq } from 'drizzle-orm';
import { revalidateTag } from 'next/cache';
import { ulid } from 'ulid';
import type { z } from 'zod';

import {
  checkAnalysisQuota,
  incrementMessageUsage,
} from '@/api/services/usage-tracking.service';
import type { getDbAsync } from '@/db';
import * as tables from '@/db/schema';
import type { ChatMessage } from '@/db/validation';
import { ErrorCategorySchema, FinishReasonSchema } from '@/lib/schemas/error-schemas';
import type { MessagePartSchema } from '@/lib/schemas/message-schemas';
import { extractTextFromParts } from '@/lib/schemas/message-schemas';

// Type inference from schema
type MessagePart = z.infer<typeof MessagePartSchema>;

// ============================================================================
// Type Definitions
// ============================================================================

export type SaveMessageParams = {
  messageId: string;
  threadId: string;
  participantId: string;
  participantIndex: number;
  participantRole: string | null;
  modelId: string;
  roundNumber: number;
  text: string;
  reasoningDeltas: string[];
  finishResult: {
    text: string;
    usage?: {
      inputTokens?: number;
      outputTokens?: number;
    };
    finishReason: string;
    providerMetadata?: unknown;
    response?: unknown;
    reasoning?: string | unknown[]; // Can be string or ReasoningPart[]
    [key: string]: unknown; // Allow additional fields from AI SDK
  };
  userId: string;
  participants: Array<{ id: string }>;
  threadMode: string;
  db: Awaited<ReturnType<typeof getDbAsync>>;
};

type ErrorMetadata = {
  openRouterError?: string;
  errorCategory?: string;
  errorMessage?: string;
  providerMessage?: string;
  isTransientError: boolean;
  isPartialResponse: boolean;
};

// ============================================================================
// Reasoning Extraction
// ============================================================================

/**
 * Extract reasoning from multiple sources
 *
 * Priority:
 * 1. Accumulated reasoning deltas from stream chunks
 * 2. finishResult.reasoning (OpenAI o1/o3)
 * 3. providerMetadata reasoning fields
 *
 * Reference: streaming.handler.ts lines 1146-1204
 */
function extractReasoning(
  reasoningDeltas: string[],
  finishResult: SaveMessageParams['finishResult'],
): string | null {
  // Priority 1: Use accumulated reasoning deltas from stream chunks
  if (reasoningDeltas.length > 0) {
    return reasoningDeltas.join('');
  }

  // Priority 2: Extract reasoning from finishResult directly (for OpenAI o1/o3)
  const finishResultWithReasoning = finishResult as typeof finishResult & { reasoning?: string };
  if (typeof finishResultWithReasoning.reasoning === 'string') {
    return finishResultWithReasoning.reasoning;
  }

  // Priority 3: Extract from providerMetadata
  const metadata = finishResult.providerMetadata;
  if (!metadata || typeof metadata !== 'object') {
    return null;
  }

  const meta = metadata as Record<string, unknown>;

  // Helper to safely navigate nested paths
  const getNested = (obj: unknown, path: string[]): unknown => {
    let current = obj;
    for (const key of path) {
      if (!current || typeof current !== 'object') {
        return undefined;
      }
      current = (current as Record<string, unknown>)[key];
    }
    return current;
  };

  // Check all possible reasoning field locations
  const fields = [
    getNested(meta, ['openai', 'reasoning']), // OpenAI o1/o3
    meta.reasoning,
    meta.thinking,
    meta.thought,
    meta.thoughts,
    meta.chain_of_thought,
    meta.internal_reasoning,
    meta.scratchpad,
  ];

  for (const field of fields) {
    if (typeof field === 'string' && field.trim()) {
      return field.trim();
    }
    if (field && typeof field === 'object') {
      const obj = field as Record<string, unknown>;
      if (typeof obj.content === 'string' && obj.content.trim()) {
        return obj.content.trim();
      }
      if (typeof obj.text === 'string' && obj.text.trim()) {
        return obj.text.trim();
      }
    }
  }

  return null;
}

// ============================================================================
// Error Detection
// ============================================================================

/**
 * Extract OpenRouter error details from provider metadata and response
 *
 * Reference: streaming.handler.ts lines 1209-1239
 */
function extractErrorMetadata(
  providerMetadata: unknown,
  response: unknown,
  finishReason: string,
  usage?: { inputTokens?: number; outputTokens?: number },
  text?: string,
): ErrorMetadata {
  let openRouterError: string | undefined;
  let errorCategory: string | undefined;

  // Check providerMetadata for OpenRouter-specific errors
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
    // Check for moderation/content filter errors
    if (metadata.moderation || metadata.contentFilter) {
      errorCategory = ErrorCategorySchema.enum.content_filter;
      openRouterError = openRouterError || 'Content was filtered by safety systems';
    }
  }

  // Check response object for errors
  if (!openRouterError && response && typeof response === 'object') {
    const resp = response as Record<string, unknown>;
    if (resp.error) {
      openRouterError = typeof resp.error === 'string'
        ? resp.error
        : JSON.stringify(resp.error);
    }
  }

  const outputTokens = usage?.outputTokens || 0;
  const inputTokens = usage?.inputTokens || 0;
  const isEmptyResponse = outputTokens === 0;
  const hasError = isEmptyResponse || !!openRouterError;

  let errorMessage: string | undefined;
  let providerMessage: string | undefined;

  if (hasError) {
    if (openRouterError) {
      providerMessage = openRouterError;
      errorMessage = openRouterError;

      // Categorize based on error content
      const errorLower = openRouterError.toLowerCase();
      if (errorLower.includes('not found') || errorLower.includes('does not exist')) {
        errorCategory = ErrorCategorySchema.enum.model_not_found;
      } else if (errorLower.includes('filter') || errorLower.includes('safety') || errorLower.includes('moderation')) {
        errorCategory = ErrorCategorySchema.enum.content_filter;
      } else if (errorLower.includes('rate limit') || errorLower.includes('quota')) {
        errorCategory = ErrorCategorySchema.enum.rate_limit;
      } else if (errorLower.includes('timeout') || errorLower.includes('connection')) {
        errorCategory = ErrorCategorySchema.enum.network;
      } else {
        errorCategory = errorCategory || ErrorCategorySchema.enum.provider_error;
      }
    } else if (outputTokens === 0) {
      // Build context-aware error messages
      const baseStats = `Input: ${inputTokens} tokens, Output: 0 tokens, Status: ${finishReason}`;

      if (finishReason === FinishReasonSchema.enum.stop) {
        providerMessage = `Model completed but returned no content. ${baseStats}. This may indicate content filtering, safety constraints, or the model chose not to respond.`;
        errorMessage = 'Returned empty response - possible content filtering or safety block';
        errorCategory = ErrorCategorySchema.enum.content_filter;
      } else if (finishReason === FinishReasonSchema.enum.length) {
        providerMessage = `Model hit token limit before generating content. ${baseStats}. Try reducing the conversation history or input length.`;
        errorMessage = 'Exceeded token limit without generating content';
        errorCategory = ErrorCategorySchema.enum.provider_error;
      } else if (finishReason === FinishReasonSchema.enum['content-filter']) {
        providerMessage = `Content was filtered by safety systems. ${baseStats}`;
        errorMessage = 'Blocked by content filter';
        errorCategory = ErrorCategorySchema.enum.content_filter;
      } else if (finishReason === FinishReasonSchema.enum.error || finishReason === FinishReasonSchema.enum.other) {
        providerMessage = `Provider error prevented response generation. ${baseStats}. This may be a temporary issue with the model provider.`;
        errorMessage = 'Encountered a provider error';
        errorCategory = ErrorCategorySchema.enum.provider_error;
      } else {
        providerMessage = `Model returned empty response. ${baseStats}`;
        errorMessage = `Returned empty response (reason: ${finishReason})`;
        errorCategory = ErrorCategorySchema.enum.empty_response;
      }
    }
  }

  // Detect partial response: error occurred but some content was generated
  const isPartialResponse = hasError && ((text?.length || 0) > 0 || outputTokens > 0);

  // Determine if error is transient (worth retrying)
  const isTransientError = hasError && (
    errorCategory === ErrorCategorySchema.enum.provider_error
    || errorCategory === ErrorCategorySchema.enum.network
    || errorCategory === ErrorCategorySchema.enum.rate_limit
    || (errorCategory === ErrorCategorySchema.enum.empty_response && finishReason !== FinishReasonSchema.enum.stop)
  );

  return {
    openRouterError,
    errorCategory,
    errorMessage,
    providerMessage,
    isTransientError,
    isPartialResponse,
  };
}

// ============================================================================
// Message Persistence
// ============================================================================

/**
 * Save AI assistant message to database after streaming completes
 *
 * This function:
 * 1. Extracts reasoning from multiple sources
 * 2. Detects and categorizes errors
 * 3. Builds parts[] array (text + reasoning)
 * 4. Saves message with metadata
 * 5. Stores RAG embeddings for semantic search
 * 6. Triggers analysis creation if round is complete
 *
 * Reference: streaming.handler.ts lines 1143-1631 (onFinish callback)
 */
export async function saveStreamedMessage(
  params: SaveMessageParams,
): Promise<void> {
  const {
    messageId,
    threadId,
    participantId,
    participantIndex,
    participantRole,
    modelId,
    roundNumber,
    text,
    reasoningDeltas,
    finishResult,
    userId,
    participants,
    threadMode,
    db,
  } = params;

  try {
    // Extract reasoning from multiple sources
    const reasoningText = extractReasoning(reasoningDeltas, finishResult);

    // Extract error metadata
    const errorMetadata = extractErrorMetadata(
      finishResult.providerMetadata,
      finishResult.response,
      finishResult.finishReason,
      finishResult.usage,
      text,
    );

    // Build parts[] array (AI SDK v5 pattern)
    // Using text and reasoning part types from MessagePartSchema
    const parts: Array<Extract<MessagePart, { type: 'text' } | { type: 'reasoning' }>> = [];

    if (text) {
      parts.push({ type: 'text', text });
    }

    if (reasoningText) {
      parts.push({ type: 'reasoning', text: reasoningText });
    }

    // Ensure at least one part exists (empty text for error messages)
    if (parts.length === 0) {
      parts.push({ type: 'text', text: '' });
    }

    // Save message to database
    await db.insert(tables.chatMessage)
      .values({
        id: messageId,
        threadId,
        participantId,
        role: 'assistant' as const,
        parts,
        roundNumber,
        metadata: {
          roundNumber,
          model: modelId,
          participantId,
          participantIndex,
          participantRole,
          usage: finishResult.usage
            ? {
                promptTokens: finishResult.usage.inputTokens,
                completionTokens: finishResult.usage.outputTokens,
                totalTokens: (finishResult.usage.inputTokens ?? 0) + (finishResult.usage.outputTokens ?? 0),
              }
            : undefined,
          finishReason: finishResult.finishReason,
          hasError: !!(errorMetadata.errorMessage || errorMetadata.openRouterError),
          errorType: errorMetadata.errorCategory,
          errorMessage: errorMetadata.errorMessage,
          providerMessage: errorMetadata.providerMessage,
          openRouterError: errorMetadata.openRouterError,
          isTransient: errorMetadata.isTransientError,
          isPartialResponse: errorMetadata.isPartialResponse,
        },
        createdAt: new Date(),
      })
      .onConflictDoNothing()
      .returning();

    // Cache invalidation
    revalidateTag(`thread:${threadId}:messages`);

    // RAG REMOVED: AutoRAG now handles knowledge indexing from project files
    // Per-message embeddings are no longer needed - project-based knowledge only

    // Increment message usage quota (charged regardless of stream completion)
    await incrementMessageUsage(userId, 1);

    // ✅ CRITICAL FIX: Trigger analysis creation if last participant
    // Removed savedMessage check because onConflictDoNothing() can return undefined
    // even when the message exists, preventing analysis creation
    if (participantIndex === participants.length - 1) {
      await createPendingAnalysis({
        threadId,
        roundNumber,
        threadMode,
        userId,
        participants,
        db,
      });
    }
  } catch (error) {
    // ✅ IMPROVED ERROR LOGGING: Log error details for debugging
    // Non-blocking error - allow round to continue
    // This allows the next participant to respond even if this one failed to save
    console.error('[saveStreamedMessage] Failed to save message:', {
      messageId,
      threadId,
      participantId,
      participantIndex,
      modelId,
      roundNumber,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
  }
}

// ============================================================================
// Analysis Creation
// ============================================================================

type CreatePendingAnalysisParams = {
  threadId: string;
  roundNumber: number;
  threadMode: string;
  userId: string;
  participants: Array<{ id: string }>;
  db: Awaited<ReturnType<typeof getDbAsync>>;
};

/**
 * Create pending analysis record for completed rounds
 *
 * This runs synchronously after the last participant completes streaming.
 * The frontend will then stream the analysis using the analysis endpoint.
 *
 * ✅ CRITICAL FIX: Removed fire-and-forget pattern to prevent race conditions
 * Previously used IIFE that ran in background, causing database queries to execute
 * before all participant messages were fully visible, resulting in incomplete analysis records.
 *
 * Reference: streaming.handler.ts lines 1524-1621
 */
async function createPendingAnalysis(
  params: CreatePendingAnalysisParams,
): Promise<void> {
  const { threadId, roundNumber, threadMode, userId, participants, db } = params;

  try {
    // Check analysis quota first
    const analysisQuota = await checkAnalysisQuota(userId);
    if (!analysisQuota.canCreate) {
      return;
    }

    // Check if analysis already exists
    const existingAnalysis = await db
      .select()
      .from(tables.chatModeratorAnalysis)
      .where(
        and(
          eq(tables.chatModeratorAnalysis.threadId, threadId),
          eq(tables.chatModeratorAnalysis.roundNumber, roundNumber),
        ),
      )
      .get();

    if (existingAnalysis) {
      return; // Analysis already exists
    }

    // ✅ CRITICAL FIX: Retry logic to ensure all participant messages are visible
    // D1/SQLite has eventual consistency - we need to poll until all messages are found
    // This prevents creating analysis records with incomplete participant message IDs
    let roundMessages: ChatMessage[] = [];
    let assistantMessages: ChatMessage[] = [];
    const maxRetries = 10;
    const retryDelayMs = 150;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      // Add delay before checking (first attempt also waits to give DB time to commit)
      await new Promise(resolve => setTimeout(resolve, retryDelayMs));

      // Query for all messages in this round
      roundMessages = await db.query.chatMessage.findMany({
        where: and(
          eq(tables.chatMessage.threadId, threadId),
          eq(tables.chatMessage.roundNumber, roundNumber),
        ),
        orderBy: [
          asc(tables.chatMessage.roundNumber),
          asc(tables.chatMessage.createdAt),
          asc(tables.chatMessage.id),
        ],
      });

      assistantMessages = roundMessages.filter(msg => msg.role === 'assistant');

      // Check if we have all expected participant messages
      if (assistantMessages.length >= participants.length) {
        break; // Found all messages, exit retry loop
      }

      // If not last attempt, continue polling
      if (attempt < maxRetries - 1) {
        continue;
      }

      // Final attempt failed - log and return
      console.warn('[createPendingAnalysis] Failed to find all participant messages after retries:', {
        threadId,
        roundNumber,
        expectedCount: participants.length,
        foundCount: assistantMessages.length,
        attempts: maxRetries,
      });
      return;
    }

    // Check for messages with errors
    const messagesWithErrors = assistantMessages.filter(
      msg => (msg.metadata as { hasError?: boolean })?.hasError === true,
    );

    if (messagesWithErrors.length > 0) {
      return;
    }

    // Extract participant message IDs
    const participantMessageIds = assistantMessages.map(m => m.id);

    if (participantMessageIds.length === 0) {
      return;
    }

    // Get user question from this round
    const userMessage = roundMessages.find(m => m.role === 'user');
    const userQuestion = userMessage
      ? extractTextFromParts(userMessage.parts as Array<{ type: 'text'; text: string }>)
      : 'No user question found';

    // Create pending analysis record
    const analysisId = ulid();
    await db
      .insert(tables.chatModeratorAnalysis)
      .values({
        id: analysisId,
        threadId,
        roundNumber,
        mode: threadMode as 'analyzing' | 'brainstorming' | 'debating' | 'solving',
        userQuestion,
        status: 'pending' as const,
        participantMessageIds,
        analysisData: null,
        completedAt: null,
        errorMessage: null,
      })
      .run();
  } catch {
    // Analysis creation errors should not break the chat flow
    // Silently fail and let frontend handle analysis creation if needed
  }
}
