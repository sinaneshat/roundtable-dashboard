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
    parts: message.parts || [],
    metadata,
  };
}

export function chatMessagesToUIMessages(
  messages: (ChatMessage | (Omit<ChatMessage, 'createdAt'> & { createdAt: string | Date }))[],
): UIMessage[] {
  return messages.map(chatMessageToUIMessage);
}

export function extractTextFromParts(
  parts: Array<{ type: 'text'; text: string } | { type: 'reasoning'; text: string }>,
): string {
  return parts
    .filter(part => part.type === 'text')
    .map(part => (part as { type: 'text'; text: string }).text)
    .join(' ');
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
    ...(hasError && {
      hasError: true,
      errorType: metadata?.errorType || (isEmptyResponse ? 'empty_response' : 'unknown'),
      errorMessage,
      providerMessage: metadata?.providerMessage || metadata?.openRouterError || errorMessage,
      openRouterError: metadata?.openRouterError,
    }),
  };
}
