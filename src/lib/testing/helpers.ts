/**
 * Common test utilities and helpers
 *
 * Message creation helpers, translation mocks, and async utilities.
 */

import type { UIMessage } from 'ai';
import type { AbstractIntlMessages } from 'next-intl';

import { MessageRoles, UIMessageRoles } from '@/api/core/enums';
import type { DbAssistantMessageMetadata, DbUserMessageMetadata } from '@/db/schemas/chat-metadata';

export type TestUserMessage = UIMessage & {
  role: 'user';
  metadata: DbUserMessageMetadata;
  parts: Array<{ type: 'text'; text: string }>;
};

export type TestAssistantMessage = UIMessage & {
  role: 'assistant';
  metadata: DbAssistantMessageMetadata;
  parts: Array<{ type: 'text'; text: string }>;
};

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
    finishReason: 'stop',
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
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata: DbUserMessageMetadata | DbAssistantMessageMetadata;
  parts?: Array<{ type: 'text'; text: string }>;
}): UIMessage {
  return {
    id: data.id,
    role: data.role,
    parts: data.parts ?? [{ type: 'text', text: data.content }],
    metadata: data.metadata,
  };
}

export function createTestUserMessage(data: {
  id: string;
  content: string;
  roundNumber: number;
  createdAt?: string;
  parts?: Array<{ type: 'text'; text: string }>;
}): TestUserMessage {
  const parts: Array<{ type: 'text'; text: string }> = data.parts ?? [{ type: 'text', text: data.content }];
  return {
    id: data.id,
    role: UIMessageRoles.USER,
    parts,
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
}): TestAssistantMessage {
  const parts: Array<{ type: 'text'; text: string }> = data.parts ?? [{ type: 'text', text: data.content }];
  return {
    id: data.id,
    role: UIMessageRoles.ASSISTANT,
    parts,
    metadata: {
      role: MessageRoles.ASSISTANT,
      roundNumber: data.roundNumber,
      participantId: data.participantId,
      participantIndex: data.participantIndex,
      participantRole: null,
      model: data.model ?? 'gpt-4',
      finishReason: data.finishReason ?? 'stop',
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
  const parts: Array<{ type: 'text'; text: string }> = data.parts ?? [{ type: 'text', text: data.content }];
  return {
    id: data.id,
    role: UIMessageRoles.ASSISTANT,
    parts,
    metadata: {
      role: MessageRoles.ASSISTANT,
      isModerator: true,
      roundNumber: data.roundNumber,
      model: data.model ?? 'gemini-2.0-flash-thinking-exp-1219',
      finishReason: data.finishReason ?? 'stop',
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

  if (!customMessages) {
    return defaultMessages;
  }

  return {
    ...defaultMessages,
    ...customMessages,
  };
}

export async function waitForAsync(ms = 0): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function createMockDate(dateString = '2024-01-01T00:00:00.000Z'): Date {
  return new Date(dateString);
}
