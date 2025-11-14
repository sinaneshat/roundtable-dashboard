import type { UIMessage } from 'ai';
import type { AbstractIntlMessages } from 'next-intl';

import { MessageRoles } from '@/api/core/enums';
import type { DbAssistantMessageMetadata, DbUserMessageMetadata } from '@/db/schemas/chat-metadata';

/**
 * Common test utilities and helpers
 */

// ============================================================================
// Message Creation Helpers (Following Production Patterns)
// ============================================================================

/**
 * Type alias for test messages with user metadata
 * Follows pattern from src/lib/utils/message-transforms.ts
 */
export type TestUserMessage = UIMessage & { metadata: DbUserMessageMetadata };

/**
 * Type alias for test messages with assistant metadata
 * Follows pattern from src/lib/utils/message-transforms.ts
 */
export type TestAssistantMessage = UIMessage & { metadata: DbAssistantMessageMetadata };

/**
 * Creates user message metadata
 * ✅ ENUM PATTERN: Uses MessageRoles.USER constant
 */
export function createUserMetadata(roundNumber: number): DbUserMessageMetadata {
  return {
    role: MessageRoles.USER,
    roundNumber,
  };
}

/**
 * Creates assistant message metadata
 * ✅ ENUM PATTERN: Uses MessageRoles.ASSISTANT constant
 */
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

/**
 * Creates a test UIMessage with flexible metadata
 * ✅ ENUM PATTERN: Uses MessageRole type from established enums
 */
export function createTestUIMessage(data: {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata: DbUserMessageMetadata | DbAssistantMessageMetadata;
}): UIMessage {
  return {
    id: data.id,
    role: data.role,
    parts: [{ type: 'text', text: data.content }],
    metadata: data.metadata,
  };
}

/**
 * Creates a properly typed UIMessage for testing with user metadata
 * ✅ ENUM PATTERN: Uses MessageRoles.USER constant
 * Pattern from: src/lib/utils/message-transforms.ts:57
 */
export function createTestUserMessage(data: {
  id: string;
  content: string;
  roundNumber: number;
  createdAt?: string;
}): TestUserMessage {
  return {
    id: data.id,
    role: MessageRoles.USER,
    parts: [{ type: 'text', text: data.content }],
    metadata: {
      role: MessageRoles.USER,
      roundNumber: data.roundNumber,
      createdAt: data.createdAt,
    },
  };
}

/**
 * Creates a properly typed UIMessage for testing with assistant metadata
 * ✅ ENUM PATTERN: Uses MessageRoles.ASSISTANT constant
 * Pattern from: src/lib/utils/message-transforms.ts:57
 */
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
}): TestAssistantMessage {
  return {
    id: data.id,
    role: MessageRoles.ASSISTANT,
    parts: [{ type: 'text', text: data.content }],
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
      createdAt: data.createdAt,
    },
  };
}

/**
 * Creates mock translation messages for testing
 */
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

  // Deep merge custom messages with defaults
  return {
    ...defaultMessages,
    ...customMessages,
  };
}

/**
 * Wait for async operations to complete
 */
export async function waitForAsync(ms = 0): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Creates a mock date for consistent testing
 */
export function createMockDate(dateString = '2024-01-01T00:00:00.000Z'): Date {
  return new Date(dateString);
}

/**
 * Mock localStorage for testing
 */
export const mockLocalStorage = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (index: number) => {
      const keys = Object.keys(store);
      return keys[index] || null;
    },
  };
})();

/**
 * Setup localStorage mock before tests
 */
export function setupLocalStorageMock(): void {
  Object.defineProperty(window, 'localStorage', {
    value: mockLocalStorage,
    writable: true,
  });
}
