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
    role: MessageRoles.ASSISTANT,
    roundNumber,
    participantId,
    participantIndex,
    participantRole: null,
    model: 'gpt-4',
    finishReason: FinishReasons.STOP,
    usage: {
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
    },
    hasError: false,
    isTransient: false,
    isPartialResponse: false,
  };
}

export function createTestUIMessage(data: {
  id: string;
  role: UIMessageRole;
  content: string;
  metadata: DbUserMessageMetadata | DbAssistantMessageMetadata;
  parts?: Array<{ type: 'text'; text: string }>;
}): UIMessage {
  return {
    id: data.id,
    role: data.role,
    parts: data.parts ?? [{ type: MessagePartTypes.TEXT, text: data.content }],
    metadata: data.metadata,
  };
}

export function createTestUserMessage(data: {
  id: string;
  content: string;
  roundNumber: number;
  createdAt?: string;
  parts?: Array<{ type: 'text'; text: string }>;
}): UIMessage {
  return {
    id: data.id,
    role: UIMessageRoles.USER,
    parts: data.parts ?? [{ type: MessagePartTypes.TEXT, text: data.content }],
    metadata: {
      role: MessageRoles.USER,
      roundNumber: data.roundNumber,
      ...(data.createdAt !== undefined && { createdAt: data.createdAt }),
    },
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
  parts?: Array<{ type: 'text'; text: string }>;
}): UIMessage {
  return {
    id: data.id,
    role: UIMessageRoles.ASSISTANT,
    parts: data.parts ?? [{ type: MessagePartTypes.TEXT, text: data.content }],
    metadata: {
      role: MessageRoles.ASSISTANT,
      roundNumber: data.roundNumber,
      participantId: data.participantId,
      participantIndex: data.participantIndex,
      participantRole: null,
      model: data.model ?? 'gpt-4',
      finishReason: data.finishReason ?? FinishReasons.STOP,
      usage: {
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
      },
      hasError: data.hasError ?? false,
      isTransient: false,
      isPartialResponse: false,
      ...(data.createdAt !== undefined && { createdAt: data.createdAt }),
    },
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
  parts?: Array<{ type: 'text'; text: string }>;
}): UIMessage {
  const parts: Array<{ type: 'text'; text: string }> = data.parts ?? [{ type: MessagePartTypes.TEXT, text: data.content }];
  return {
    id: data.id,
    role: UIMessageRoles.ASSISTANT,
    parts,
    metadata: {
      role: MessageRoles.ASSISTANT,
      isModerator: true,
      roundNumber: data.roundNumber,
      model: data.model ?? ModelIds.GOOGLE_GEMINI_3_FLASH_PREVIEW,
      finishReason: data.finishReason ?? FinishReasons.STOP,
      usage: {
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
      },
      hasError: data.hasError ?? false,
      ...(data.createdAt !== undefined && { createdAt: data.createdAt }),
    },
  };
}

export function createMockMessages(customMessages?: AbstractIntlMessages): AbstractIntlMessages {
  const defaultMessages: AbstractIntlMessages = {
    common: {
      loading: 'Loading...',
      error: 'Error',
      save: 'Save',
      cancel: 'Cancel',
      submit: 'Submit',
      close: 'Close',
      delete: 'Delete',
      edit: 'Edit',
      create: 'Create',
      update: 'Update',
      confirm: 'Confirm',
      yes: 'Yes',
      no: 'No',
    },
    chat: {
      newThread: 'New Chat',
      sendMessage: 'Send Message',
      participantLabel: 'Participant',
      modelLabel: 'Model',
    },
  };

  return customMessages ? { ...defaultMessages, ...customMessages } : defaultMessages;
}

export async function waitForAsync(ms = 0): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
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
