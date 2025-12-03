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
 *
 * @see /src/api/types/citations.ts for citation type definitions
 */

import { and, asc, eq } from 'drizzle-orm';
import { revalidateTag } from 'next/cache';
import { ulid } from 'ulid';
import type { z } from 'zod';

import {
  AnalysisStatuses,
  ChatModeSchema,
  MessagePartTypes,
  MessageRoles,
} from '@/api/core/enums';
import type { ErrorMetadata } from '@/api/services/error-metadata.service';
import ErrorMetadataService from '@/api/services/error-metadata.service';
import { filterDbToParticipantMessages } from '@/api/services/message-type-guards';
import {
  getUserUsageStats,
  incrementMessageUsage,
} from '@/api/services/usage-tracking.service';
import type { AvailableSource, CitationSourceMap } from '@/api/types/citations';
import type { getDbAsync } from '@/db';
import * as tables from '@/db/schema';
import type { ChatMessage } from '@/db/validation';
import type { MessagePartSchema, StreamingFinishResult } from '@/lib/schemas/message-schemas';
import { extractTextFromParts } from '@/lib/schemas/message-schemas';
import {
  hasCitations,
  parseCitations,
  toDbCitations,
} from '@/lib/utils/citation-parser';
import { hasError } from '@/lib/utils/metadata';
import { createParticipantMetadata } from '@/lib/utils/metadata-builder';
import { isObject, isTextPart, safeParse } from '@/lib/utils/type-guards';

// Type inference from schema
type MessagePart = z.infer<typeof MessagePartSchema>;

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Parameters for saving AI message to database
 * ✅ TYPE-SAFE: Uses StreamingFinishResult schema instead of inline type
 */
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
  /** ✅ SCHEMA-BASED: Uses StreamingFinishResult from @/lib/schemas/message-messages */
  finishResult: StreamingFinishResult;
  userId: string;
  participants: Array<{ id: string }>;
  threadMode: string;
  db: Awaited<ReturnType<typeof getDbAsync>>;
  /** Citation source map for resolving [source_id] markers in AI response */
  citationSourceMap?: CitationSourceMap;
  /** Available sources (files/context available to AI, for "Sources" UI even without inline citations) */
  availableSources?: AvailableSource[];
};

// ============================================================================
// Reasoning Extraction
// ============================================================================

/**
 * Extract reasoning from multiple sources
 *
 * Priority:
 * 1. Accumulated reasoning deltas from stream chunks (extractReasoningMiddleware output)
 * 2. finishResult.reasoning as string (some models)
 * 3. finishResult.reasoning as array (Claude extended thinking, AI SDK v5)
 * 4. finishResult.reasoningText (Claude 4 models)
 * 5. providerMetadata reasoning fields
 *
 * ✅ AI SDK v5 FIX: Handle array format for Claude models with extended thinking
 * Claude models return reasoning as an array of parts: { type: 'thinking' | 'redacted', text: string }[]
 * Reference: https://sdk.vercel.ai/docs/ai-sdk-core/generating-text#reasoning
 */
function extractReasoning(
  reasoningDeltas: string[],
  finishResult: SaveMessageParams['finishResult'],
): string | null {
  // Priority 1: Use accumulated reasoning deltas from stream chunks
  // This captures reasoning from extractReasoningMiddleware (DeepSeek, models with <think> tags)
  if (reasoningDeltas.length > 0) {
    return reasoningDeltas.join('');
  }

  // Priority 2: Extract reasoning from finishResult directly (string format)
  if (
    typeof finishResult.reasoning === 'string'
    && finishResult.reasoning.trim()
  ) {
    return finishResult.reasoning.trim();
  }

  // Priority 3: Extract reasoning from finishResult as array (Claude extended thinking, AI SDK v5)
  // Claude models return: { type: 'thinking' | 'redacted', text: string }[]
  // Other models may return: { text: string }[]
  if (
    Array.isArray(finishResult.reasoning)
    && finishResult.reasoning.length > 0
  ) {
    const reasoningTexts: string[] = [];
    for (const part of finishResult.reasoning) {
      if (part && typeof part === 'object') {
        // Handle ReasoningPart with text property
        if (
          'text' in part
          && typeof part.text === 'string'
          && part.text.trim()
        ) {
          // Skip redacted reasoning parts (Claude can redact sensitive thinking)
          if ('type' in part && part.type === 'redacted') {
            continue;
          }
          reasoningTexts.push(part.text.trim());
        }
      }
    }
    if (reasoningTexts.length > 0) {
      return reasoningTexts.join('\n\n');
    }
  }

  // Priority 4: Extract from reasoningText (Claude 4 models via AI SDK)
  // Claude 4 with interleaved thinking returns reasoningText as a separate property
  // ✅ TYPE-SAFE: reasoningText is now part of StreamingFinishResult schema
  if (
    typeof finishResult.reasoningText === 'string'
    && finishResult.reasoningText.trim()
  ) {
    return finishResult.reasoningText.trim();
  }

  // Priority 5: Extract from providerMetadata
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
    citationSourceMap,
    availableSources,
  } = params;

  try {
    // Extract reasoning from multiple sources
    const reasoningText = extractReasoning(reasoningDeltas, finishResult);

    // ✅ CRITICAL FIX: Use totalUsage as fallback for usage
    // AI SDK v5 provides both usage (final step) and totalUsage (cumulative across all steps)
    // Some models (DeepSeek) only populate totalUsage, not usage
    // Reference: https://sdk.vercel.ai/docs/ai-sdk-core/generating-text#onFinish
    // Type-safe extraction of totalUsage from finishResult
    const getTotalUsage = () => {
      if (
        !('totalUsage' in finishResult)
        || !finishResult.totalUsage
        || typeof finishResult.totalUsage !== 'object'
      ) {
        return undefined;
      }
      const tu = finishResult.totalUsage;
      const inputTokens
        = 'inputTokens' in tu && typeof tu.inputTokens === 'number'
          ? tu.inputTokens
          : undefined;
      const outputTokens
        = 'outputTokens' in tu && typeof tu.outputTokens === 'number'
          ? tu.outputTokens
          : undefined;
      return { inputTokens, outputTokens };
    };
    const usageData = finishResult.usage || getTotalUsage();

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
      parts.push({ type: MessagePartTypes.TEXT, text });
    }

    if (reasoningText) {
      parts.push({ type: MessagePartTypes.REASONING, text: reasoningText });
    }

    // Add tool calls if present (from AI SDK v5 finishResult)
    const toolCalls
      = finishResult.toolCalls && Array.isArray(finishResult.toolCalls)
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
    const toolResults
      = finishResult.toolResults && Array.isArray(finishResult.toolResults)
        ? finishResult.toolResults
        : [];

    // Ensure at least one part exists (empty text for error messages)
    if (parts.length === 0) {
      parts.push({ type: MessagePartTypes.TEXT, text: '' });
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
          totalTokens:
            (usageData.inputTokens ?? 0) + (usageData.outputTokens ?? 0),
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

    // ✅ CITATION RESOLUTION: Parse and resolve citations from AI response text
    // Citations appear as [source_id] markers (e.g., [att_abc12345], [mem_xyz789])
    // Convert to DbCitation objects with full source metadata for UI rendering
    let resolvedCitations;
    if (text && citationSourceMap && hasCitations(text)) {
      const parsedResult = parseCitations(text);
      if (parsedResult.citations.length > 0) {
        // Resolve parsed citations to full DbCitation objects using source map
        resolvedCitations = toDbCitations(
          parsedResult.citations,
          (sourceId) => {
            const source = citationSourceMap.get(sourceId);
            if (!source)
              return undefined;
            return {
              title: source.title,
              excerpt: source.content.slice(0, 300),
              url: source.metadata.url,
              threadId: source.metadata.threadId,
              threadTitle: source.metadata.threadTitle,
              roundNumber: source.metadata.roundNumber,
              downloadUrl: source.metadata.downloadUrl,
              filename: source.metadata.filename,
              mimeType: source.metadata.mimeType,
              fileSize: source.metadata.fileSize,
            };
          },
        );
      }
    }

    // ✅ TYPE-SAFE METADATA: Use builder to ensure all required fields
    // Compile-time guarantee that metadata matches ParticipantMessageMetadataSchema
    const messageMetadata = createParticipantMetadata({
      roundNumber,
      participantId,
      participantIndex,
      participantRole,
      model: modelId,
      finishReason: finishResult.finishReason as
      | 'stop'
      | 'length'
      | 'content-filter'
      | 'tool-calls'
      | 'failed'
      | 'other'
      | 'unknown',
      usage: usageMetadata,
      hasError: errorMetadata.hasError,
      errorType: errorMetadata.errorCategory as
      | 'rate_limit'
      | 'context_length'
      | 'api_error'
      | 'network'
      | 'timeout'
      | 'model_unavailable'
      | 'empty_response'
      | 'unknown'
      | undefined,
      errorMessage: errorMetadata.errorMessage,
      isTransient: errorMetadata.isTransientError,
      isPartialResponse: errorMetadata.isPartialResponse,
      providerMessage: errorMetadata.providerMessage,
      openRouterError: errorMetadata.openRouterError
        ? { message: errorMetadata.openRouterError }
        : undefined,
      // ✅ CITATIONS: Include resolved citations if AI referenced sources
      citations: resolvedCitations,
      // ✅ AVAILABLE SOURCES: Include files/context available to AI for "Sources" UI
      availableSources,
    });

    // Save message to database
    await db
      .insert(tables.chatMessage)
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
        await db.insert(tables.chatMessage).values({
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
  const { threadId, roundNumber, threadMode, userId, participants, db }
    = params;

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

    // Check for messages with errors using type-safe metadata extraction
    const messagesWithErrors = assistantMessages.filter(msg =>
      hasError(msg.metadata),
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
    const userQuestion
      = textParts.length > 0
        ? extractTextFromParts(textParts)
        : 'No user question found';

    // ✅ TYPE GUARD: Validate thread mode with Zod - using canonical ChatModeSchema
    const validatedMode = safeParse(ChatModeSchema, threadMode);

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
