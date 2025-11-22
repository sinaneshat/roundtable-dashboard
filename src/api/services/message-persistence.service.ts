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
import { z } from 'zod';

import { AnalysisStatuses, MessageRoles } from '@/api/core/enums';
import type { ErrorMetadata } from '@/api/services/error-metadata.service';
import ErrorMetadataService from '@/api/services/error-metadata.service';
import { filterDbToParticipantMessages } from '@/api/services/message-type-guards';
import {
  getUserUsageStats,
  incrementMessageUsage,
} from '@/api/services/usage-tracking.service';
import type { getDbAsync } from '@/db';
import * as tables from '@/db/schema';
import type { ChatMessage } from '@/db/validation';
import type { MessagePartSchema } from '@/lib/schemas/message-schemas';
import { extractTextFromParts } from '@/lib/schemas/message-schemas';
import { createParticipantMetadata } from '@/lib/utils/metadata-builder';
import { isObject, isTextPart, safeParse } from '@/lib/utils/type-guards';

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

  // ✅ TYPE-SAFE: Use type guard from @/lib/utils
  if (!isObject(metadata)) {
    return null;
  }

  // Helper to safely navigate nested paths
  const getNested = (obj: unknown, path: string[]): unknown => {
    let current = obj;
    for (const key of path) {
      if (!isObject(current)) {
        return undefined;
      }
      current = current[key];
    }
    return current;
  };

  // Check all possible reasoning field locations
  const fields = [
    getNested(metadata, ['openai', 'reasoning']), // OpenAI o1/o3
    metadata.reasoning,
    metadata.thinking,
    metadata.thought,
    metadata.thoughts,
    metadata.chain_of_thought,
    metadata.internal_reasoning,
    metadata.scratchpad,
  ];

  for (const field of fields) {
    if (typeof field === 'string' && field.trim()) {
      return field.trim();
    }
    // ✅ TYPE-SAFE: Use type guard instead of cast
    if (isObject(field)) {
      if (typeof field.content === 'string' && field.content.trim()) {
        return field.content.trim();
      }
      if (typeof field.text === 'string' && field.text.trim()) {
        return field.text.trim();
      }
    }
  }

  return null;
}

// ============================================================================
// Error Detection
// ============================================================================

/**
 * Extract error metadata from AI provider response
 *
 * ✅ DELEGATED: Uses ErrorMetadataService for all error detection and categorization
 * ✅ SINGLE SOURCE OF TRUTH: No duplicate error handling logic
 *
 * This function maintains the original signature for backward compatibility
 * but delegates to the centralized error metadata service.
 *
 * @see ErrorMetadataService.extractErrorMetadata - Service implementation
 * @see /docs/backend-patterns.md - Service delegation pattern
 */
function extractErrorMetadata(
  providerMetadata: unknown,
  response: unknown,
  finishReason: string,
  usage?: { inputTokens?: number; outputTokens?: number },
  text?: string,
  reasoning?: string,
): ErrorMetadata {
  return ErrorMetadataService.extractErrorMetadata({
    providerMetadata,
    response,
    finishReason,
    usage,
    text,
    reasoning,
  });
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

    // ✅ CRITICAL FIX: Use totalUsage as fallback for usage
    // AI SDK v5 provides both usage (final step) and totalUsage (cumulative across all steps)
    // Some models (DeepSeek) only populate totalUsage, not usage
    // Reference: https://sdk.vercel.ai/docs/ai-sdk-core/generating-text#onFinish
    const usageData = finishResult.usage || (finishResult as { totalUsage?: { inputTokens?: number; outputTokens?: number } }).totalUsage;

    // Extract error metadata
    // ✅ CRITICAL FIX: Pass reasoning to error detection for o1/o3 models
    // These models output content as reasoning instead of text, which was causing
    // false empty_response errors when text was empty but reasoning had content
    const errorMetadata = extractErrorMetadata(
      finishResult.providerMetadata,
      finishResult.response,
      finishResult.finishReason,
      usageData,
      text,
      reasoningText || undefined,
    );

    // Build parts[] array (AI SDK v5 pattern)
    // ✅ CRITICAL: AI SDK v5 requires tool results in separate tool messages
    // Using text, reasoning, tool-call part types for assistant message
    const parts: MessagePart[] = [];

    if (text) {
      parts.push({ type: 'text', text });
    }

    if (reasoningText) {
      parts.push({ type: 'reasoning', text: reasoningText });
    }

    // Add tool calls if present (from AI SDK v5 finishResult)
    const toolCalls = finishResult.toolCalls && Array.isArray(finishResult.toolCalls)
      ? finishResult.toolCalls
      : [];

    for (const toolCall of toolCalls) {
      parts.push({
        type: 'tool-call',
        toolCallId: toolCall.toolCallId,
        toolName: toolCall.toolName,
        args: toolCall.args,
      });
    }

    // Collect tool results for separate tool message (AI SDK v5 pattern)
    const toolResults = finishResult.toolResults && Array.isArray(finishResult.toolResults)
      ? finishResult.toolResults
      : [];

    // Ensure at least one part exists (empty text for error messages)
    if (parts.length === 0) {
      parts.push({ type: 'text', text: '' });
    }

    // ✅ CRITICAL FIX: Check for existing message with same ID before insert
    // If message already exists, it's likely a duplicate ID from backend
    // This prevents silent failures with onConflictDoNothing()
    const existingMessage = await db.query.chatMessage.findFirst({
      where: eq(tables.chatMessage.id, messageId),
    });

    if (existingMessage) {
      // Message with this ID already exists - log warning but continue
      // This should never happen with ULIDs, but handle gracefully
      return;
    }

    // ✅ FIX: Create usage metadata with fallback when usage data is missing
    // Uses usageData which already checks totalUsage as fallback
    // If both are missing, estimate from text length (1 token ≈ 4 characters)
    const usageMetadata = usageData
      ? {
          promptTokens: usageData.inputTokens ?? 0,
          completionTokens: usageData.outputTokens ?? 0,
          totalTokens: (usageData.inputTokens ?? 0) + (usageData.outputTokens ?? 0),
        }
      : text.trim().length > 0
        ? {
            promptTokens: 0, // Can't estimate input without usage data
            completionTokens: Math.ceil(text.length / 4), // Rough estimate
            totalTokens: Math.ceil(text.length / 4),
          }
        : {
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
          };

    // ✅ TYPE-SAFE METADATA: Use builder to ensure all required fields
    // Compile-time guarantee that metadata matches ParticipantMessageMetadataSchema
    const messageMetadata = createParticipantMetadata({
      roundNumber,
      participantId,
      participantIndex,
      participantRole,
      model: modelId,
      finishReason: finishResult.finishReason as 'stop' | 'length' | 'content-filter' | 'tool-calls' | 'failed' | 'other' | 'unknown',
      usage: usageMetadata,
      hasError: errorMetadata.hasError,
      errorType: errorMetadata.errorCategory as 'rate_limit' | 'context_length' | 'api_error' | 'network' | 'timeout' | 'model_unavailable' | 'empty_response' | 'unknown' | undefined,
      errorMessage: errorMetadata.errorMessage,
      isTransient: errorMetadata.isTransientError,
      isPartialResponse: errorMetadata.isPartialResponse,
      providerMessage: errorMetadata.providerMessage,
      openRouterError: errorMetadata.openRouterError ? { message: errorMetadata.openRouterError } : undefined,
    });

    // Save message to database
    await db.insert(tables.chatMessage)
      .values({
        id: messageId,
        threadId,
        participantId,
        role: MessageRoles.ASSISTANT,
        parts,
        roundNumber,
        metadata: messageMetadata,
        createdAt: new Date(),
      })
      .returning();

    // ✅ AI SDK v5 PATTERN: Save tool results in separate tool message
    // Tool results must be in their own message with role='tool'
    if (toolResults.length > 0) {
      const toolMessageId = ulid();
      const toolParts: MessagePart[] = toolResults.map(toolResult => ({
        type: 'tool-result',
        toolCallId: toolResult.toolCallId,
        toolName: toolResult.toolName,
        result: toolResult.result,
        isError: toolResult.isError,
      }));

      // Check for existing tool message
      const existingToolMessage = await db.query.chatMessage.findFirst({
        where: eq(tables.chatMessage.id, toolMessageId),
      });

      if (!existingToolMessage) {
        // ✅ CRITICAL: Tool messages don't use discriminated metadata
        // They store minimal info since they're just tool results
        await db.insert(tables.chatMessage)
          .values({
            id: toolMessageId,
            threadId,
            participantId,
            role: MessageRoles.TOOL,
            parts: toolParts,
            roundNumber,
            metadata: null, // Tool messages have no metadata (just parts with tool-result type)
            createdAt: new Date(),
          });
      }
    }

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
  } catch {
    // Non-blocking error - allow round to continue
    // This allows the next participant to respond even if this one failed to save
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
    // Check analysis quota first (silent return if quota exceeded)
    const stats = await getUserUsageStats(userId);
    if (stats.analysis.remaining === 0) {
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

      // ✅ TYPE-SAFE FILTERING: Use consolidated utility for participant message filtering
      // Replaces inline logic with Zod-validated type guard from message-type-guards.ts
      // Pre-search messages have role: 'assistant' but are NOT actual participant responses
      // They should be excluded from analysis to prevent ID inconsistency when web search is enabled
      assistantMessages = filterDbToParticipantMessages(roundMessages);

      // Check if we have all expected participant messages
      if (assistantMessages.length >= participants.length) {
        break; // Found all messages, exit retry loop
      }

      // If not last attempt, continue polling
      if (attempt < maxRetries - 1) {
        continue;
      }

      // Final attempt failed - return
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
    const userMessage = roundMessages.find(m => m.role === MessageRoles.USER);

    // ✅ TYPE GUARD: Validate and extract text parts from message
    const textParts = userMessage?.parts?.filter(isTextPart) ?? [];
    const userQuestion = textParts.length > 0
      ? extractTextFromParts(textParts)
      : 'No user question found';

    // ✅ TYPE GUARD: Validate thread mode with Zod
    const validatedMode = safeParse(
      z.enum(['analyzing', 'brainstorming', 'debating', 'solving']),
      threadMode,
    );

    if (!validatedMode) {
      // Invalid mode - skip analysis creation
      return;
    }

    // Create pending analysis record
    const analysisId = ulid();
    await db
      .insert(tables.chatModeratorAnalysis)
      .values({
        id: analysisId,
        threadId,
        roundNumber,
        mode: validatedMode,
        userQuestion,
        status: AnalysisStatuses.PENDING,
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
