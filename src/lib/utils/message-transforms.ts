/**
 * Message Transformation Utilities
 *
 * Transforms between backend ChatMessage and AI SDK UIMessage format.
 */

import type { UIMessage } from 'ai';

import type { ChatMessage } from '@/api/routes/chat/schema';
import type { UIMessageMetadata } from '@/lib/schemas/message-metadata';
import { UIMessageMetadataSchema } from '@/lib/schemas/message-metadata';

export function getMessageMetadata(metadata: unknown): UIMessageMetadata | undefined {
  if (!metadata)
    return undefined;

  const result = UIMessageMetadataSchema.safeParse(metadata);
  return result.success ? result.data : (metadata as UIMessageMetadata);
}

export function chatMessageToUIMessage(
  message: ChatMessage | (Omit<ChatMessage, 'createdAt'> & { createdAt: string | Date }),
): UIMessage {
  const createdAt = message.createdAt instanceof Date
    ? message.createdAt.toISOString()
    : message.createdAt;

  const metadata: UIMessageMetadata = {
    ...(message.metadata || {}),
    participantId: message.participantId || undefined,
    createdAt,
    roundNumber: message.roundNumber,
  };

  return {
    id: message.id,
    role: message.role,
    // ✅ TYPE ASSERTION: Database stores simplified tool parts, but they're compatible with UIMessage
    // AI SDK v5 expects tool parts to have 'state' field, but our DB schema is a valid subset
    parts: (message.parts || []) as UIMessage['parts'],
    metadata,
  };
}

export function chatMessagesToUIMessages(
  messages: (ChatMessage | (Omit<ChatMessage, 'createdAt'> & { createdAt: string | Date }))[],
): UIMessage[] {
  return messages.map(chatMessageToUIMessage);
}

export function filterNonEmptyMessages(messages: UIMessage[]): UIMessage[] {
  return messages.filter((message) => {
    if (message.role === 'assistant')
      return true;

    if (message.role === 'user') {
      const textParts = message.parts?.filter(
        part => part.type === 'text' && 'text' in part && part.text.trim().length > 0,
      );
      return textParts && textParts.length > 0;
    }

    return false;
  });
}

/**
 * ✅ PHASE 1: Global message deduplication by ID
 *
 * PRIMARY DEDUPLICATION POINT - Apply this BEFORE setting messages in any context
 *
 * USAGE:
 * - Remove duplicate messages by unique ID
 * - Preserves message order (first occurrence wins)
 * - O(n) performance using Set
 *
 * ARCHITECTURE:
 * - This is Phase 1 (global deduplication at message array level)
 * - PASS 4 in groupMessagesByRound() is Phase 2 (safety net during grouping)
 *
 * Apply at ALL message update points:
 * - ChatContext.initializeThread()
 * - useMultiParticipantChat.onFinish()
 * - useMultiParticipantChat.onError()
 * - useMultiParticipantChat.retry()
 *
 * @param messages - Messages array (may contain duplicates)
 * @returns Deduplicated messages array (unique by ID)
 */
export function deduplicateMessages(messages: UIMessage[]): UIMessage[] {
  const seen = new Set<string>();
  const duplicates: Array<{ id: string; role: string; roundNumber?: number }> = [];

  const deduplicated = messages.filter((msg) => {
    if (seen.has(msg.id)) {
      // ✅ LOGGING: Track duplicates found for debugging
      const metadata = msg.metadata as Record<string, unknown> | undefined;
      duplicates.push({
        id: msg.id,
        role: msg.role,
        roundNumber: typeof metadata?.roundNumber === 'number' ? metadata.roundNumber : undefined,
      });
      return false;
    }
    seen.add(msg.id);
    return true;
  });

  // ✅ LOGGING: Log when duplicates are found to help debug round ordering
  if (duplicates.length > 0) {
    console.warn('[deduplicateMessages] Found and removed duplicate messages:', {
      count: duplicates.length,
      duplicates,
      totalMessages: messages.length,
      afterDeduplication: deduplicated.length,
    });
  }

  return deduplicated;
}

/**
 * ✅ COMPLEMENTARY: Deduplicate consecutive user messages by text content
 *
 * This handles a DIFFERENT case than deduplicateMessages():
 * - deduplicateMessages() removes duplicate IDs (Phase 1)
 * - This function removes consecutive user messages with same text (edge case)
 *
 * Use case: When startRound() or retry creates consecutive user messages
 * with same text but different IDs
 *
 * @param messages - Messages array (may have consecutive duplicate text)
 * @returns Messages with consecutive duplicate user text removed
 */
export function deduplicateConsecutiveUserMessages(messages: UIMessage[]): UIMessage[] {
  const result: UIMessage[] = [];
  let lastUserMessageText: string | null = null;

  for (const message of messages) {
    if (message.role === 'user') {
      const textPart = message.parts?.find(p => p.type === 'text' && 'text' in p);
      const text = textPart && 'text' in textPart ? textPart.text.trim() : '';

      if (text && text === lastUserMessageText)
        continue;
      lastUserMessageText = text;
    } else {
      lastUserMessageText = null;
    }

    result.push(message);
  }

  return result;
}

export type UIMessageErrorType
  = | 'provider_rate_limit'
    | 'provider_network'
    | 'model_not_found'
    | 'model_content_filter'
    | 'authentication'
    | 'validation'
    | 'silent_failure'
    | 'empty_response'
    | 'error'
    | 'unknown';

export function createErrorUIMessage(
  participant: { id: string; modelId: string; role: string | null },
  currentIndex: number,
  errorMessage: string,
  errorType: UIMessageErrorType = 'error',
  errorMetadata?: {
    errorCategory?: string;
    statusCode?: number;
    rawErrorMessage?: string;
    openRouterError?: string;
    openRouterCode?: string;
    providerMessage?: string;
  },
  roundNumber?: number,
): UIMessage {
  return {
    id: `error-${crypto.randomUUID()}-${currentIndex}`,
    role: 'assistant',
    parts: [{ type: 'text', text: '' }],
    metadata: {
      participantId: participant.id,
      participantIndex: currentIndex,
      ...(participant.role && { participantRole: participant.role }),
      model: participant.modelId,
      hasError: true,
      errorType,
      errorMessage,
      errorCategory: errorMetadata?.errorCategory || errorType,
      statusCode: errorMetadata?.statusCode,
      rawErrorMessage: errorMetadata?.rawErrorMessage,
      providerMessage: errorMetadata?.providerMessage || errorMetadata?.rawErrorMessage || errorMessage,
      openRouterError: errorMetadata?.openRouterError,
      openRouterCode: errorMetadata?.openRouterCode,
      roundNumber,
    },
  };
}

export function mergeParticipantMetadata(
  message: UIMessage,
  participant: { id: string; modelId: string; role: string | null },
  currentIndex: number,
): Record<string, unknown> {
  const metadata = message.metadata as Record<string, unknown> | undefined;
  const hasBackendError = metadata?.hasError === true || !!metadata?.error || !!metadata?.errorMessage;

  const textParts = message.parts?.filter(p => p.type === 'text') || [];
  const hasTextContent = textParts.some(
    part => 'text' in part && typeof part.text === 'string' && part.text.trim().length > 0,
  );

  const isEmptyResponse = textParts.length === 0 || !hasTextContent;
  const hasError = hasBackendError || isEmptyResponse;

  let errorMessage = metadata?.errorMessage as string | undefined;
  if (isEmptyResponse && !errorMessage) {
    errorMessage = `The model (${participant.modelId}) did not generate a response. This can happen due to content filtering, model limitations, or API issues.`;
  }

  return {
    ...(metadata || {}),
    participantId: participant.id,
    participantIndex: currentIndex,
    ...(participant.role && { participantRole: participant.role }),
    model: participant.modelId,
    // ✅ Explicitly preserve critical metadata fields
    ...(metadata?.roundNumber !== undefined && { roundNumber: metadata.roundNumber }),
    ...(hasError && {
      hasError: true,
      errorType: metadata?.errorType || (isEmptyResponse ? 'empty_response' : 'unknown'),
      errorMessage,
      providerMessage: metadata?.providerMessage || metadata?.openRouterError || errorMessage,
      openRouterError: metadata?.openRouterError,
    }),
  };
}
