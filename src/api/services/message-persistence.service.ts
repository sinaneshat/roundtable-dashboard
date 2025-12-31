/**
 * Message Persistence Service - Save AI responses to database
 *
 * Following backend-patterns.md: Service layer for business logic
 * Extracted from streaming.handler.ts onFinish callback
 *
 * This service handles:
 * - Saving AI assistant messages after streaming completes
 * - Extracting reasoning from multiple sources (deltas, finishResult, providerMetadata)
 * - Citation resolution for RAG sources
 *
 * Note: Moderators are saved as chatMessage entries with metadata.isModerator: true
 * by the moderator handler, not this service. This service only persists participant messages.
 */

import { eq } from 'drizzle-orm';
import { revalidateTag } from 'next/cache';
import { ulid } from 'ulid';

import {
  MessagePartTypes,
  MessageRoles,
} from '@/api/core/enums';
import ErrorMetadataService from '@/api/services/error-metadata.service';
import type { AvailableSource, CitationSourceMap } from '@/api/types/citations';
import type { getDbAsync } from '@/db';
import * as tables from '@/db';
import type { MessagePart, StreamingFinishResult } from '@/lib/schemas/message-schemas';
import {
  createParticipantMetadata,
  hasCitations,
  isObject,
  parseCitations,
  toDbCitations,
} from '@/lib/utils';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Parameters for saving AI message to database
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
  finishResult: StreamingFinishResult;
  userId: string;
  db: Awaited<ReturnType<typeof getDbAsync>>;
  citationSourceMap?: CitationSourceMap;
  availableSources?: AvailableSource[];
  reasoningDuration?: number;
  /** Error message when response has no renderable content (e.g., only [REDACTED] reasoning) */
  emptyResponseError?: string | null;
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
 * 3. finishResult.reasoning as array (Claude extended thinking, AI SDK v6)
 * 4. finishResult.reasoningText (Claude 4 models)
 * 5. providerMetadata reasoning fields
 */
function extractReasoning(
  reasoningDeltas: string[],
  finishResult: SaveMessageParams['finishResult'],
): string | null {
  if (reasoningDeltas.length > 0) {
    return reasoningDeltas.join('');
  }

  if (
    typeof finishResult.reasoning === 'string'
    && finishResult.reasoning.trim()
  ) {
    return finishResult.reasoning.trim();
  }

  if (
    Array.isArray(finishResult.reasoning)
    && finishResult.reasoning.length > 0
  ) {
    const reasoningTexts: string[] = [];
    for (const part of finishResult.reasoning) {
      if (part && typeof part === 'object') {
        if (
          'text' in part
          && typeof part.text === 'string'
          && part.text.trim()
        ) {
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

  if (
    typeof finishResult.reasoningText === 'string'
    && finishResult.reasoningText.trim()
  ) {
    return finishResult.reasoningText.trim();
  }

  const metadata = finishResult.providerMetadata;
  if (!metadata || typeof metadata !== 'object') {
    return null;
  }

  if (!isObject(metadata)) {
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
// Message Persistence
// ============================================================================

/**
 * Save AI assistant message to database after streaming completes
 *
 * This function:
 * 1. Extracts reasoning from multiple sources
 * 2. Detects and categorizes errors
 * 3. Builds parts[] array (text + reasoning + tool-calls)
 * 4. Resolves citations from RAG sources
 * 5. Saves message with metadata
 * 6. Increments usage quotas
 *
 * Note: This service only persists participant messages. Moderators
 * are persisted by the moderator handler as chatMessage entries with
 * metadata.isModerator: true.
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
    userId: _userId, // ✅ CREDITS: Now handled in streaming handler
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

    const errorMetadata = ErrorMetadataService.extractErrorMetadata({
      providerMetadata: finishResult.providerMetadata,
      response: finishResult.response,
      finishReason: finishResult.finishReason,
      usage: usageData,
      text,
      reasoning: reasoningText || undefined,
    });

    const parts: MessagePart[] = [];

    // ✅ EMPTY RESPONSE ERROR: When model produces no renderable content,
    // add the error as a text part so something displays in the UI
    if (emptyResponseError) {
      parts.push({ type: MessagePartTypes.TEXT, text: emptyResponseError });
    } else if (text) {
      parts.push({ type: MessagePartTypes.TEXT, text });
    }

    // ✅ FIX: Don't add [REDACTED]-only reasoning to parts (will render as empty)
    // Only add reasoning if it has actual content beyond [REDACTED]
    const isRedactedOnlyReasoning = reasoningText && /^\[REDACTED\]$/i.test(reasoningText.trim());
    if (reasoningText && !isRedactedOnlyReasoning) {
      parts.push({ type: MessagePartTypes.REASONING, text: reasoningText });
    }

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

    const toolResults
      = finishResult.toolResults && Array.isArray(finishResult.toolResults)
        ? finishResult.toolResults
        : [];

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

    // ✅ EMPTY RESPONSE ERROR: Override error metadata when we have an empty response
    // This ensures the UI shows an error state for messages with no renderable content
    const finalHasError = errorMetadata.hasError || !!emptyResponseError;
    const finalErrorType = emptyResponseError
      ? 'empty_response'
      : (errorMetadata.errorCategory as
      | 'rate_limit'
      | 'context_length'
      | 'api_error'
      | 'network'
      | 'timeout'
      | 'model_unavailable'
      | 'empty_response'
      | 'unknown'
      | undefined);
    const finalErrorMessage = emptyResponseError || errorMetadata.errorMessage;

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
      hasError: finalHasError,
      errorType: finalErrorType,
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
        parts,
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
          parts: toolParts,
          roundNumber,
          metadata: null,
          createdAt: new Date(),
        });
      }
    }

    revalidateTag(`thread:${threadId}:messages`, 'max');
    // ✅ CREDITS: Message credits handled in streaming handler's finalizeCredits()
  } catch {
    // Non-blocking error - allow round to continue
  }
}
