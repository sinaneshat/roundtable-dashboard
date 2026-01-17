/**
 * Message Persistence Service
 *
 * Following backend-patterns.md: Service layer for business logic
 *
 * Saves AI assistant messages after streaming completes:
 * - Extracts reasoning from multiple sources (deltas, finishResult, providerMetadata)
 * - Resolves citations from RAG sources
 * - Builds type-safe message parts with error handling
 */

import { eq } from 'drizzle-orm';
import { ulid } from 'ulid';
import { z } from 'zod';

import { invalidateMessagesCache } from '@/api/common/cache-utils';
import { FinishReasons, FinishReasonSchema, MessagePartTypes, MessageRoles } from '@/api/core/enums';
import { CoreSchemas } from '@/api/core/schemas';
import { extractErrorMetadata } from '@/api/services/errors';
import type { AvailableSource, CitationSourceMap } from '@/api/types/citations';
import type { getDbAsync } from '@/db';
import * as tables from '@/db';
import type { DbMessageParts } from '@/db/schemas/chat-metadata';
import type { MessagePart, StreamingFinishResult } from '@/lib/schemas/message-schemas';
import { cleanCitationExcerpt, createParticipantMetadata, hasCitations, isObject, parseCitations, toDbCitations } from '@/lib/utils';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Schema for saveStreamedMessage parameters
 * Following type-inference-patterns.md: Zod-first type inference
 */
export const SaveMessageParamsSchema = z.object({
  messageId: CoreSchemas.id(),
  threadId: CoreSchemas.id(),
  participantId: CoreSchemas.id(),
  participantIndex: z.number().int().nonnegative(),
  participantRole: z.string().nullable(),
  modelId: z.string().min(1),
  roundNumber: z.number().int().nonnegative(),
  text: z.string(),
  reasoningDeltas: z.array(z.string()),
  finishResult: z.custom<StreamingFinishResult>(),
  db: z.custom<Awaited<ReturnType<typeof getDbAsync>>>(),
  citationSourceMap: z.custom<CitationSourceMap>().optional(),
  availableSources: z.array(z.custom<AvailableSource>()).optional(),
  reasoningDuration: z.number().nonnegative().optional(),
  emptyResponseError: z.string().nullable().optional(),
});

export type SaveMessageParams = z.infer<typeof SaveMessageParamsSchema>;

// ============================================================================
// Reasoning Extraction
// ============================================================================

/**
 * Extract reasoning from finishResult with priority order:
 * 1. Accumulated reasoning deltas from stream chunks
 * 2. finishResult.reasoning (string or array)
 * 3. finishResult.reasoningText (Claude 4 models)
 * 4. providerMetadata reasoning fields
 */
function extractReasoning(reasoningDeltas: string[], finishResult: StreamingFinishResult): string | null {
  if (reasoningDeltas.length > 0) {
    return reasoningDeltas.join('');
  }

  if (typeof finishResult.reasoning === 'string' && finishResult.reasoning.trim()) {
    return finishResult.reasoning.trim();
  }

  if (Array.isArray(finishResult.reasoning) && finishResult.reasoning.length > 0) {
    const reasoningTexts: string[] = [];
    for (const part of finishResult.reasoning) {
      if (part && typeof part === 'object' && 'text' in part && typeof part.text === 'string' && part.text.trim()) {
        if ('type' in part && part.type === 'redacted')
          continue;
        reasoningTexts.push(part.text.trim());
      }
    }
    if (reasoningTexts.length > 0)
      return reasoningTexts.join('\n\n');
  }

  if (typeof finishResult.reasoningText === 'string' && finishResult.reasoningText.trim()) {
    return finishResult.reasoningText.trim();
  }

  const metadata = finishResult.providerMetadata;
  if (!metadata || !isObject(metadata))
    return null;

  const getNested = (obj: unknown, path: string[]): unknown => {
    let current = obj;
    for (const key of path) {
      if (!isObject(current))
        return undefined;
      current = current[key];
    }
    return current;
  };

  const fields = [
    getNested(metadata, ['openai', 'reasoning']),
    metadata.reasoning,
    metadata.thinking,
    metadata.thought,
    metadata.thoughts,
    metadata.chain_of_thought,
    metadata.internal_reasoning,
    metadata.scratchpad,
  ];

  for (const field of fields) {
    if (typeof field === 'string' && field.trim())
      return field.trim();
    if (isObject(field)) {
      if (typeof field.content === 'string' && field.content.trim())
        return field.content.trim();
      if (typeof field.text === 'string' && field.text.trim())
        return field.text.trim();
    }
  }

  return null;
}

// ============================================================================
// Message Persistence
// ============================================================================

/**
 * Save AI assistant message to database after streaming completes
 *
 * Process:
 * 1. Extract reasoning from multiple sources
 * 2. Detect and categorize errors
 * 3. Build parts[] array (text + reasoning + tool-calls)
 * 4. Resolve citations from RAG sources
 * 5. Save message with metadata
 * 6. Invalidate cache
 */
export async function saveStreamedMessage(params: SaveMessageParams): Promise<void> {
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
    db,
    citationSourceMap,
    availableSources,
    reasoningDuration,
    emptyResponseError,
  } = params;

  try {
    const reasoningText = extractReasoning(reasoningDeltas, finishResult);

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

    const errorMetadata = extractErrorMetadata({
      providerMetadata: finishResult.providerMetadata,
      response: finishResult.response,
      finishReason: finishResult.finishReason,
      usage: usageData,
      text,
      reasoning: reasoningText || undefined,
    });

    const parts: MessagePart[] = [];

    if (emptyResponseError) {
      parts.push({ type: MessagePartTypes.TEXT, text: emptyResponseError });
    } else if (text) {
      parts.push({ type: MessagePartTypes.TEXT, text });
    }

    const isRedactedOnlyReasoning = reasoningText && /^\[REDACTED\]$/i.test(reasoningText.trim());
    if (reasoningText && !isRedactedOnlyReasoning) {
      parts.push({ type: MessagePartTypes.REASONING, text: reasoningText });
    }

    const toolCalls = finishResult.toolCalls && Array.isArray(finishResult.toolCalls) ? finishResult.toolCalls : [];
    for (const toolCall of toolCalls) {
      parts.push({
        type: 'tool-call',
        toolCallId: toolCall.toolCallId,
        toolName: toolCall.toolName,
        args: toolCall.args,
      });
    }

    const toolResults = finishResult.toolResults && Array.isArray(finishResult.toolResults) ? finishResult.toolResults : [];

    if (parts.length === 0) {
      parts.push({ type: MessagePartTypes.TEXT, text: '' });
    }

    const existingMessage = await db.query.chatMessage.findFirst({
      where: eq(tables.chatMessage.id, messageId),
    });

    if (existingMessage) {
      return;
    }

    const usageMetadata = usageData
      ? {
          promptTokens: usageData.inputTokens ?? 0,
          completionTokens: usageData.outputTokens ?? 0,
          totalTokens:
            (usageData.inputTokens ?? 0) + (usageData.outputTokens ?? 0),
        }
      : text.trim().length > 0
        ? {
            promptTokens: 0,
            completionTokens: Math.ceil(text.length / 4),
            totalTokens: Math.ceil(text.length / 4),
          }
        : {
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
          };

    let resolvedCitations;
    if (text && citationSourceMap && hasCitations(text)) {
      const parsedResult = parseCitations(text);
      if (parsedResult.citations.length > 0) {
        resolvedCitations = toDbCitations(
          parsedResult.citations,
          (sourceId) => {
            const source = citationSourceMap.get(sourceId);
            if (!source)
              return undefined;
            return {
              title: source.title,
              // Clean and format the excerpt for better display
              excerpt: cleanCitationExcerpt(source.content, 200),
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

    const finalHasError = errorMetadata.hasError || !!emptyResponseError;
    const finalErrorMessage = emptyResponseError || errorMetadata.errorMessage;

    // Parse and validate finish reason with fallback to 'unknown'
    const finishReasonResult = FinishReasonSchema.safeParse(finishResult.finishReason);
    const validatedFinishReason = finishReasonResult.success
      ? finishReasonResult.data
      : FinishReasons.UNKNOWN;

    const messageMetadata = createParticipantMetadata({
      roundNumber,
      participantId,
      participantIndex,
      participantRole,
      model: modelId,
      finishReason: validatedFinishReason,
      usage: usageMetadata,
      hasError: finalHasError,
      errorCategory: errorMetadata.errorCategory,
      errorMessage: finalErrorMessage,
      isTransient: errorMetadata.isTransientError,
      isPartialResponse: errorMetadata.isPartialResponse,
      providerMessage: errorMetadata.providerMessage,
      openRouterError: errorMetadata.openRouterError
        ? { message: errorMetadata.openRouterError }
        : undefined,
      citations: resolvedCitations,
      availableSources,
      reasoningDuration,
    });

    await db
      .insert(tables.chatMessage)
      .values({
        id: messageId,
        threadId,
        participantId,
        role: MessageRoles.ASSISTANT,
        // TYPE BRIDGE: MessagePart[] and DbMessageParts are structurally identical
        // Zod schemas. Cast needed because TypeScript treats them as separate types.
        parts: parts as DbMessageParts,
        roundNumber,
        metadata: messageMetadata,
        createdAt: new Date(),
      })
      .returning();

    if (toolResults.length > 0) {
      const toolMessageId = ulid();
      const toolParts: MessagePart[] = toolResults.map(toolResult => ({
        type: 'tool-result',
        toolCallId: toolResult.toolCallId,
        toolName: toolResult.toolName,
        result: toolResult.result,
        isError: toolResult.isError,
      }));

      const existingToolMessage = await db.query.chatMessage.findFirst({
        where: eq(tables.chatMessage.id, toolMessageId),
      });

      if (!existingToolMessage) {
        await db.insert(tables.chatMessage).values({
          id: toolMessageId,
          threadId,
          participantId,
          role: MessageRoles.TOOL,
          // TYPE BRIDGE: Same as above - MessagePart[] to DbMessageParts
          parts: toolParts as DbMessageParts,
          roundNumber,
          metadata: null,
          createdAt: new Date(),
        });
      }
    }

    await invalidateMessagesCache(db, threadId);
  } catch (error) {
    // ✅ DEBUG: Log the error instead of silently swallowing
    console.error(`[PERSIST] FAILED to save message id=${messageId}:`, error);
    // Non-blocking - allow round to continue
  }
}
