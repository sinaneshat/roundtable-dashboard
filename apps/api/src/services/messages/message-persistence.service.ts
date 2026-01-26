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

import { FinishReasons, FinishReasonSchema, MessagePartTypes, MessageRoles } from '@roundtable/shared/enums';
import { eq } from 'drizzle-orm';
import { ulid } from 'ulid';
import * as z from 'zod';

import { invalidateMessagesCache } from '@/common/cache-utils';
import { CoreSchemas } from '@/core/schemas';
import type { getDbAsync } from '@/db';
import * as tables from '@/db';
import type { DbMessageParts } from '@/db/schemas/chat-metadata';
import type { MessagePart, StreamingFinishResult } from '@/lib/schemas/message-schemas';
import { cleanCitationExcerpt, createParticipantMetadata, hasCitations, isObject, parseCitations, toDbCitations } from '@/lib/utils';
import type { UsageStats } from '@/services/errors';
import { extractErrorMetadata } from '@/services/errors';
import type { CitationSourceMap } from '@/types/citations';
import { AvailableSourceSchema } from '@/types/citations';

// ============================================================================
// Helper Functions for Safe Property Access
// ============================================================================

/**
 * Safely access a property from a Record<string, unknown> using bracket notation.
 * This helper avoids TS4111 index signature access errors while keeping code readable.
 */
function getMetadataProp<T>(obj: Record<string, unknown>, key: string): T | undefined {
  const value = obj[key];
  return value as T | undefined;
}

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Schema for saveStreamedMessage parameters
 * Following type-inference-patterns.md: Zod-first type inference
 */
export const SaveMessageParamsSchema = z.object({
  availableSources: z.array(AvailableSourceSchema).optional(),
  citationSourceMap: z.custom<CitationSourceMap>().optional(),
  db: z.custom<Awaited<ReturnType<typeof getDbAsync>>>(),
  emptyResponseError: z.string().nullable().optional(),
  finishResult: z.custom<StreamingFinishResult>(),
  messageId: CoreSchemas.id(),
  modelId: z.string().min(1),
  participantId: CoreSchemas.id(),
  participantIndex: z.number().int().nonnegative(),
  participantRole: z.string().nullable(),
  reasoningDeltas: z.array(z.string()),
  reasoningDuration: z.number().nonnegative().optional(),
  roundNumber: z.number().int().nonnegative(),
  text: z.string(),
  threadId: CoreSchemas.id(),
}).strict();

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
        if ('type' in part && part.type === 'redacted') {
          continue;
        }
        reasoningTexts.push(part.text.trim());
      }
    }
    if (reasoningTexts.length > 0) {
      return reasoningTexts.join('\n\n');
    }
  }

  if (typeof finishResult.reasoningText === 'string' && finishResult.reasoningText.trim()) {
    return finishResult.reasoningText.trim();
  }

  const metadata = finishResult.providerMetadata;
  if (!metadata || !isObject(metadata)) {
    return null;
  }

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

  const fields = [
    getNested(metadata, ['openai', 'reasoning']),
    getMetadataProp<unknown>(metadata, 'reasoning'),
    getMetadataProp<unknown>(metadata, 'thinking'),
    getMetadataProp<unknown>(metadata, 'thought'),
    getMetadataProp<unknown>(metadata, 'thoughts'),
    getMetadataProp<unknown>(metadata, 'chain_of_thought'),
    getMetadataProp<unknown>(metadata, 'internal_reasoning'),
    getMetadataProp<unknown>(metadata, 'scratchpad'),
  ];

  for (const field of fields) {
    if (typeof field === 'string' && field.trim()) {
      return field.trim();
    }
    if (isObject(field)) {
      const content = getMetadataProp<unknown>(field, 'content');
      if (typeof content === 'string' && content.trim()) {
        return content.trim();
      }
      const text = getMetadataProp<unknown>(field, 'text');
      if (typeof text === 'string' && text.trim()) {
        return text.trim();
      }
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
    availableSources,
    citationSourceMap,
    db,
    emptyResponseError,
    finishResult,
    messageId,
    modelId,
    participantId,
    participantIndex,
    participantRole,
    reasoningDeltas,
    reasoningDuration,
    roundNumber,
    text,
    threadId,
  } = params;

  try {
    const reasoningText = extractReasoning(reasoningDeltas, finishResult);

    const getTotalUsage = (): { inputTokens?: number; outputTokens?: number } | undefined => {
      if (
        !('totalUsage' in finishResult)
        || !finishResult.totalUsage
        || typeof finishResult.totalUsage !== 'object'
      ) {
        return undefined;
      }
      const tu = finishResult.totalUsage;
      const inputTokens = 'inputTokens' in tu && typeof tu.inputTokens === 'number' ? tu.inputTokens : null;
      const outputTokens = 'outputTokens' in tu && typeof tu.outputTokens === 'number' ? tu.outputTokens : null;

      // Conditionally build object to satisfy exactOptionalPropertyTypes
      if (inputTokens !== null && outputTokens !== null) {
        return { inputTokens, outputTokens };
      }
      if (inputTokens !== null) {
        return { inputTokens };
      }
      if (outputTokens !== null) {
        return { outputTokens };
      }
      return {};
    };
    const usageData = finishResult.usage || getTotalUsage();

    // Build extractErrorMetadata params conditionally to satisfy exactOptionalPropertyTypes
    const errorMetadataParams: {
      finishReason: string;
      providerMetadata: unknown;
      response: unknown;
      text?: string;
      usage?: UsageStats;
      reasoning?: string;
    } = {
      finishReason: finishResult.finishReason,
      providerMetadata: finishResult.providerMetadata,
      response: finishResult.response,
      text,
    };
    // Conditionally add usage to avoid exactOptionalPropertyTypes issues
    if (usageData) {
      const normalizedUsage: UsageStats = {};
      if (usageData.inputTokens !== undefined) {
        normalizedUsage.inputTokens = usageData.inputTokens;
      }
      if (usageData.outputTokens !== undefined) {
        normalizedUsage.outputTokens = usageData.outputTokens;
      }
      errorMetadataParams.usage = normalizedUsage;
    }
    if (reasoningText) {
      errorMetadataParams.reasoning = reasoningText;
    }
    const errorMetadata = extractErrorMetadata(errorMetadataParams);

    const parts: MessagePart[] = [];

    if (emptyResponseError) {
      parts.push({ text: emptyResponseError, type: MessagePartTypes.TEXT });
    } else if (text) {
      parts.push({ text, type: MessagePartTypes.TEXT });
    }

    const isRedactedOnlyReasoning = reasoningText && /^\[REDACTED\]$/i.test(reasoningText.trim());
    if (reasoningText && !isRedactedOnlyReasoning) {
      parts.push({ text: reasoningText, type: MessagePartTypes.REASONING });
    }

    const toolCalls = finishResult.toolCalls && Array.isArray(finishResult.toolCalls) ? finishResult.toolCalls : [];
    for (const toolCall of toolCalls) {
      parts.push({
        args: toolCall.args,
        toolCallId: toolCall.toolCallId,
        toolName: toolCall.toolName,
        type: 'tool-call',
      });
    }

    const toolResults = finishResult.toolResults && Array.isArray(finishResult.toolResults) ? finishResult.toolResults : [];

    if (parts.length === 0) {
      parts.push({ text: '', type: MessagePartTypes.TEXT });
    }

    const existingMessage = await db.query.chatMessage.findFirst({
      where: eq(tables.chatMessage.id, messageId),
    });

    if (existingMessage) {
      return;
    }

    const usageMetadata = usageData
      ? {
          completionTokens: usageData.outputTokens ?? 0,
          promptTokens: usageData.inputTokens ?? 0,
          totalTokens:
            (usageData.inputTokens ?? 0) + (usageData.outputTokens ?? 0),
        }
      : text.trim().length > 0
        ? {
            completionTokens: Math.ceil(text.length / 4),
            promptTokens: 0,
            totalTokens: Math.ceil(text.length / 4),
          }
        : {
            completionTokens: 0,
            promptTokens: 0,
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
            if (!source) {
              return undefined;
            }
            // Build result conditionally to satisfy exactOptionalPropertyTypes
            // Only include properties that have defined values
            type SourceDataResult = {
              title?: string;
              excerpt?: string;
              url?: string;
              threadId?: string;
              threadTitle?: string;
              roundNumber?: number;
              downloadUrl?: string;
              filename?: string;
              mimeType?: string;
              fileSize?: number;
            };
            const result: SourceDataResult = {
              // Clean and format the excerpt for better display
              excerpt: cleanCitationExcerpt(source.content, 200),
              title: source.title,
            };
            if (source.metadata.downloadUrl !== undefined) {
              result.downloadUrl = source.metadata.downloadUrl;
            }
            if (source.metadata.filename !== undefined) {
              result.filename = source.metadata.filename;
            }
            if (source.metadata.fileSize !== undefined) {
              result.fileSize = source.metadata.fileSize;
            }
            if (source.metadata.mimeType !== undefined) {
              result.mimeType = source.metadata.mimeType;
            }
            if (source.metadata.roundNumber !== undefined) {
              result.roundNumber = source.metadata.roundNumber;
            }
            if (source.metadata.threadId !== undefined) {
              result.threadId = source.metadata.threadId;
            }
            if (source.metadata.threadTitle !== undefined) {
              result.threadTitle = source.metadata.threadTitle;
            }
            if (source.metadata.url !== undefined) {
              result.url = source.metadata.url;
            }
            return result;
          },
        );
      }
    }

    const finalHasError = errorMetadata.hasError || !!emptyResponseError;
    const finalErrorMessage = emptyResponseError || errorMetadata.errorMessage;

    // Parse and validate finish reason
    // If stream completed with content but invalid finishReason, infer 'stop' (successful completion)
    // 'unknown' is reserved for truly interrupted/aborted streams with no content
    const finishReasonResult = FinishReasonSchema.safeParse(finishResult.finishReason);
    const validatedFinishReason = finishReasonResult.success
      ? finishReasonResult.data
      : (text || reasoningText) ? FinishReasons.STOP : FinishReasons.UNKNOWN;

    const messageMetadata = createParticipantMetadata({
      availableSources,
      citations: resolvedCitations,
      errorCategory: errorMetadata.errorCategory,
      errorMessage: finalErrorMessage,
      finishReason: validatedFinishReason,
      hasError: finalHasError,
      isPartialResponse: errorMetadata.isPartialResponse,
      isTransient: errorMetadata.isTransientError,
      model: modelId,
      openRouterError: errorMetadata.openRouterError
        ? { message: errorMetadata.openRouterError }
        : undefined,
      participantId,
      participantIndex,
      participantRole,
      providerMessage: errorMetadata.providerMessage,
      reasoningDuration,
      roundNumber,
      usage: usageMetadata,
    });

    await db
      .insert(tables.chatMessage)
      .values({
        createdAt: new Date(),
        id: messageId,
        metadata: messageMetadata,
        participantId,
        // TYPE BRIDGE: MessagePart[] and DbMessageParts are structurally identical
        // Zod schemas. Cast needed because TypeScript treats them as separate types.
        parts: parts as DbMessageParts,
        role: MessageRoles.ASSISTANT,
        roundNumber,
        threadId,
      })
      .returning();

    if (toolResults.length > 0) {
      const toolMessageId = ulid();
      const toolParts: MessagePart[] = toolResults.map(toolResult => ({
        isError: toolResult.isError,
        result: toolResult.result,
        toolCallId: toolResult.toolCallId,
        toolName: toolResult.toolName,
        type: 'tool-result',
      }));

      const existingToolMessage = await db.query.chatMessage.findFirst({
        where: eq(tables.chatMessage.id, toolMessageId),
      });

      if (!existingToolMessage) {
        await db.insert(tables.chatMessage).values({
          createdAt: new Date(),
          id: toolMessageId,
          metadata: null,
          participantId,
          // TYPE BRIDGE: Same as above - MessagePart[] to DbMessageParts
          parts: toolParts as DbMessageParts,
          role: MessageRoles.TOOL,
          roundNumber,
          threadId,
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
