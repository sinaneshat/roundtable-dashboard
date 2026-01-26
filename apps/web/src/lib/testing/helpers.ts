/**
 * Common test utilities and helpers
 *
 * Message creation helpers, translation mocks, and async utilities.
 */

import type { UIMessageRole } from '@roundtable/shared';
import { FinishReasons, MessagePartTypes, MessageRoles, ModelIds, UIMessageRoles } from '@roundtable/shared';
import type { UIMessage } from 'ai';

import type { AbstractIntlMessages } from '@/lib/i18n';
import { getRoundNumber } from '@/lib/utils';
import type { DbAssistantMessageMetadata, DbUserMessageMetadata } from '@/services/api';

// Type aliases for test messages - these are UIMessage with specific metadata shapes
export type TestUserMessage = UIMessage;
export type TestAssistantMessage = UIMessage;

export function createUserMetadata(roundNumber: number): DbUserMessageMetadata {
  return {
    role: MessageRoles.USER,
    roundNumber,
  };
}

export function createAssistantMetadata(
  roundNumber: number,
  participantId: string,
  participantIndex: number,
): DbAssistantMessageMetadata {
  return {
    finishReason: FinishReasons.STOP,
    hasError: false,
    isPartialResponse: false,
    isTransient: false,
    model: 'gpt-4',
    participantId,
    participantIndex,
    participantRole: null,
    role: MessageRoles.ASSISTANT,
    roundNumber,
    usage: {
      completionTokens: 50,
      promptTokens: 100,
      totalTokens: 150,
    },
  };
}

export function createTestUIMessage(data: {
  id: string;
  role: UIMessageRole;
  content: string;
  metadata: DbUserMessageMetadata | DbAssistantMessageMetadata;
  parts?: { type: 'text'; text: string }[];
}): UIMessage {
  return {
    id: data.id,
    metadata: data.metadata,
    parts: data.parts ?? [{ text: data.content, type: MessagePartTypes.TEXT }],
    role: data.role,
  };
}

export function createTestUserMessage(data: {
  id: string;
  content: string;
  roundNumber: number;
  createdAt?: string;
  parts?: { type: 'text'; text: string }[];
}): UIMessage {
  return {
    id: data.id,
    metadata: {
      role: MessageRoles.USER,
      roundNumber: data.roundNumber,
      ...(data.createdAt !== undefined && { createdAt: data.createdAt }),
    },
    parts: data.parts ?? [{ text: data.content, type: MessagePartTypes.TEXT }],
    role: UIMessageRoles.USER,
  };
}

export function createTestAssistantMessage(data: {
  id: string;
  content: string;
  roundNumber: number;
  participantId: string;
  participantIndex: number;
  model?: string;
  finishReason?: DbAssistantMessageMetadata['finishReason'];
  hasError?: boolean;
  createdAt?: string;
  parts?: { type: 'text'; text: string }[];
}): UIMessage {
  return {
    id: data.id,
    metadata: {
      finishReason: data.finishReason ?? FinishReasons.STOP,
      hasError: data.hasError ?? false,
      isPartialResponse: false,
      isTransient: false,
      model: data.model ?? 'gpt-4',
      participantId: data.participantId,
      participantIndex: data.participantIndex,
      participantRole: null,
      role: MessageRoles.ASSISTANT,
      roundNumber: data.roundNumber,
      usage: {
        completionTokens: 50,
        promptTokens: 100,
        totalTokens: 150,
      },
      ...(data.createdAt !== undefined && { createdAt: data.createdAt }),
    },
    parts: data.parts ?? [{ text: data.content, type: MessagePartTypes.TEXT }],
    role: UIMessageRoles.ASSISTANT,
  };
}

export function createTestModeratorMessage(data: {
  id: string;
  content: string;
  roundNumber: number;
  model?: string;
  finishReason?: DbAssistantMessageMetadata['finishReason'];
  hasError?: boolean;
  createdAt?: string;
  parts?: { type: 'text'; text: string }[];
}): UIMessage {
  const parts: { type: 'text'; text: string }[] = data.parts ?? [{ text: data.content, type: MessagePartTypes.TEXT }];
  return {
    id: data.id,
    metadata: {
      finishReason: data.finishReason ?? FinishReasons.STOP,
      hasError: data.hasError ?? false,
      isModerator: true,
      model: data.model ?? ModelIds.GOOGLE_GEMINI_3_FLASH_PREVIEW,
      role: MessageRoles.ASSISTANT,
      roundNumber: data.roundNumber,
      usage: {
        completionTokens: 50,
        promptTokens: 100,
        totalTokens: 150,
      },
      ...(data.createdAt !== undefined && { createdAt: data.createdAt }),
    },
    parts,
    role: UIMessageRoles.ASSISTANT,
  };
}

export function createMockMessages(customMessages?: AbstractIntlMessages): AbstractIntlMessages {
  const defaultMessages: AbstractIntlMessages = {
    chat: {
      modelLabel: 'Model',
      newThread: 'New Chat',
      participantLabel: 'Participant',
      sendMessage: 'Send Message',
    },
    common: {
      cancel: 'Cancel',
      close: 'Close',
      confirm: 'Confirm',
      create: 'Create',
      delete: 'Delete',
      edit: 'Edit',
      error: 'Error',
      loading: 'Loading...',
      no: 'No',
      save: 'Save',
      submit: 'Submit',
      update: 'Update',
      yes: 'Yes',
    },
  };

  return customMessages ? { ...defaultMessages, ...customMessages } : defaultMessages;
}

export async function waitForAsync(ms = 0): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function createMockDate(dateString = '2024-01-01T00:00:00.000Z'): Date {
  return new Date(dateString);
}

// ============================================================================
// Type-Safe Metadata Test Helpers
// ============================================================================
// SINGLE SOURCE OF TRUTH: Import metadata utilities directly from @/lib/utils/metadata
// DO NOT re-export here - violates barrel export ground rule

/**
 * Type-safe filter for messages by round number
 * REPLACES: `messages.filter(m => (m.metadata as { roundNumber: number }).roundNumber === N)`
 */
export function filterMessagesByRound(messages: UIMessage[], roundNumber: number): UIMessage[] {
  return messages.filter((m) => {
    const round = getRoundNumber(m.metadata);
    return round === roundNumber;
  });
}

/**
 * Type-safe filter for user messages by round
 * REPLACES: `messages.filter(m => m.role === 'user' && (m.metadata as {...}).roundNumber === N)`
 */
export function filterUserMessagesByRound(messages: UIMessage[], roundNumber: number): UIMessage[] {
  return messages.filter((m) => {
    if (m.role !== UIMessageRoles.USER) {
      return false;
    }
    const round = getRoundNumber(m.metadata);
    return round === roundNumber;
  });
}

/**
 * Type-safe filter for assistant messages by round
 * REPLACES: `messages.filter(m => m.role === 'assistant' && (m.metadata as {...}).roundNumber === N)`
 */
export function filterAssistantMessagesByRound(messages: UIMessage[], roundNumber: number): UIMessage[] {
  return messages.filter((m) => {
    if (m.role !== UIMessageRoles.ASSISTANT) {
      return false;
    }
    const round = getRoundNumber(m.metadata);
    return round === roundNumber;
  });
}

/**
 * Count user messages in a specific round
 * REPLACES: `messages.filter(m => m.role === 'user' && (m.metadata as {...}).roundNumber === N).length`
 */
export function countUserMessagesInRound(messages: UIMessage[], roundNumber: number): number {
  return filterUserMessagesByRound(messages, roundNumber).length;
}

/**
 * Count assistant messages in a specific round
 * REPLACES: `messages.filter(m => m.role === 'assistant' && (m.metadata as {...}).roundNumber === N).length`
 */
export function countAssistantMessagesInRound(messages: UIMessage[], roundNumber: number): number {
  return filterAssistantMessagesByRound(messages, roundNumber).length;
}
