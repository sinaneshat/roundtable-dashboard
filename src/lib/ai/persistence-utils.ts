/**
 * AI SDK v5 Persistence Utilities
 *
 * Helpers for saving UIMessage to database with proper type safety.
 * Reduces boilerplate code for common persistence patterns.
 *
 * Key Patterns:
 * - UIMessage → Database format conversion
 * - Metadata preservation
 * - Batch operations for performance
 * - Transaction safety
 *
 * @module lib/ai/persistence-utils
 * @see https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot-message-persistence
 * @see /docs/backend-patterns.md - Database patterns
 */

import type { UIMessage } from 'ai';
import { ulid } from 'ulid';

import type { UIMessageMetadata } from './types';

// ============================================================================
// Database Message Format
// ============================================================================

/**
 * Database message format
 *
 * Represents how messages are stored in the chat_message table.
 * Matches the Drizzle schema in src/db/tables/chat.ts.
 *
 * @example
 * ```typescript
 * const dbMessage: DatabaseMessage = {
 *   id: ulid(),
 *   threadId: 'thread_123',
 *   role: 'assistant',
 *   parts: [{ type: 'text', text: 'Hello!' }],
 *   participantId: 'part_456',
 *   metadata: { model: 'gpt-4o-mini' },
 *   roundNumber: 1,
 *   createdAt: new Date()
 * };
 * ```
 */
export type DatabaseMessage = {
  id: string;
  threadId: string;
  role: 'user' | 'assistant';
  parts: Array<{ type: 'text'; text: string } | { type: 'reasoning'; text: string }>;
  participantId?: string | null;
  metadata?: UIMessageMetadata | null;
  roundNumber?: number | null;
  createdAt: Date;
};

/**
 * Message persistence options
 *
 * Configuration for how messages are saved to database.
 *
 * @example
 * ```typescript
 * const options: MessagePersistenceOptions = {
 *   generateId: true,
 *   validateBeforeSave: true,
 *   includeMetadata: true
 * };
 * ```
 */
export type MessagePersistenceOptions = {
  /**
   * Generate new ULID if message doesn't have ID
   * @default true
   */
  generateId?: boolean;

  /**
   * Validate message structure before saving
   * @default false
   */
  validateBeforeSave?: boolean;

  /**
   * Include metadata in database record
   * @default true
   */
  includeMetadata?: boolean;

  /**
   * Override createdAt timestamp
   */
  createdAt?: Date;
};

// ============================================================================
// Message Conversion
// ============================================================================

/**
 * Convert UIMessage to database format
 *
 * Transforms AI SDK UIMessage to database-compatible format.
 * Handles metadata extraction, ID generation, and field mapping.
 *
 * Pattern from src/api/routes/chat/handler.ts:113-123
 *
 * @param message - UIMessage from AI SDK
 * @param threadId - Thread the message belongs to
 * @param options - Persistence configuration
 * @returns Database-ready message object
 *
 * @example
 * ```typescript
 * const uiMessage: UIMessage = {
 *   id: ulid(),
 *   role: 'assistant',
 *   parts: [{ type: 'text', text: 'Hello!' }],
 *   metadata: { participantId: 'part_123' }
 * };
 *
 * const dbMessage = convertUIMessageToDatabase(uiMessage, 'thread_456');
 * await db.insert(tables.chatMessage).values(dbMessage);
 * ```
 */
export function convertUIMessageToDatabase(
  message: UIMessage,
  threadId: string,
  options: MessagePersistenceOptions = {},
): DatabaseMessage {
  const {
    generateId = true,
    includeMetadata = true,
    createdAt = new Date(),
  } = options;

  // Extract metadata
  const metadata = message.metadata as UIMessageMetadata | undefined;

  // Generate ID if needed
  const id = message.id || (generateId ? ulid() : undefined);
  if (!id) {
    throw new Error('Message ID is required. Set generateId: true or provide message.id');
  }

  return {
    id,
    threadId,
    role: message.role as 'user' | 'assistant',
    parts: message.parts as Array<{ type: 'text'; text: string } | { type: 'reasoning'; text: string }>,
    participantId: metadata?.participantId || null,
    metadata: includeMetadata ? (metadata || null) : null,
    roundNumber: metadata?.roundNumber || null,
    createdAt,
  };
}

/**
 * Convert multiple UIMessages to database format
 *
 * Batch conversion helper for message arrays.
 * Maintains message order and applies same options to all messages.
 *
 * @param messages - Array of UIMessages
 * @param threadId - Thread the messages belong to
 * @param options - Persistence configuration
 * @returns Array of database-ready message objects
 *
 * @example
 * ```typescript
 * const messages = [userMessage, assistantMessage];
 * const dbMessages = convertUIMessagesToDatabase(messages, threadId);
 *
 * await db.batch([
 *   db.insert(tables.chatMessage).values(dbMessages[0]),
 *   db.insert(tables.chatMessage).values(dbMessages[1])
 * ]);
 * ```
 */
export function convertUIMessagesToDatabase(
  messages: UIMessage[],
  threadId: string,
  options: MessagePersistenceOptions = {},
): DatabaseMessage[] {
  return messages.map(message =>
    convertUIMessageToDatabase(message, threadId, options),
  );
}

// ============================================================================
// Message Creation Helpers
// ============================================================================

/**
 * Create database message for user input
 *
 * Helper for creating user messages with proper metadata.
 *
 * @param content - User message text
 * @param threadId - Thread the message belongs to
 * @param roundNumber - Optional round number
 * @returns Database-ready user message
 *
 * @example
 * ```typescript
 * const userMessage = createUserMessage(
 *   'Hello!',
 *   'thread_123',
 *   1
 * );
 *
 * await db.insert(tables.chatMessage).values(userMessage);
 * ```
 */
export function createUserMessage(
  content: string,
  threadId: string,
  roundNumber?: number,
): DatabaseMessage {
  return {
    id: ulid(),
    threadId,
    role: 'user',
    parts: [{ type: 'text', text: content }],
    participantId: null,
    metadata: roundNumber ? { roundNumber } : null,
    roundNumber: roundNumber || null,
    createdAt: new Date(),
  };
}

/**
 * Create database message for assistant response
 *
 * Helper for creating assistant messages with proper metadata.
 *
 * @param content - Assistant message text
 * @param threadId - Thread the message belongs to
 * @param participantId - AI participant that generated the message
 * @param metadata - Additional metadata
 * @param roundNumber - Optional round number
 * @returns Database-ready assistant message
 *
 * @example
 * ```typescript
 * const assistantMessage = createAssistantMessage(
 *   'Hello! How can I help?',
 *   'thread_123',
 *   'part_456',
 *   { model: 'gpt-4o-mini' },
 *   1
 * );
 *
 * await db.insert(tables.chatMessage).values(assistantMessage);
 * ```
 */
export function createAssistantMessage(
  content: string,
  threadId: string,
  participantId: string,
  metadata?: Partial<UIMessageMetadata>,
  roundNumber?: number,
): DatabaseMessage {
  return {
    id: ulid(),
    threadId,
    role: 'assistant',
    parts: [{ type: 'text', text: content }],
    participantId,
    metadata: {
      participantId,
      ...(metadata || {}),
      ...(roundNumber && { roundNumber }),
    },
    roundNumber: roundNumber || null,
    createdAt: new Date(),
  };
}

// ============================================================================
// Batch Persistence Helpers
// ============================================================================

/**
 * Create batch insert values for multiple messages
 *
 * Prepares message values for Cloudflare D1 batch operations.
 * Follows batch-first pattern from backend-patterns.md.
 *
 * Pattern from /docs/backend-patterns.md:990-1005
 *
 * @param messages - Array of UIMessages
 * @param threadId - Thread the messages belong to
 * @returns Array of database-ready message objects for batch insert
 *
 * @example
 * ```typescript
 * // Using with db.batch() (REQUIRED for Cloudflare D1)
 * const messages = [userMessage, assistantMessage];
 * const batchValues = prepareBatchInsert(messages, threadId);
 *
 * await db.batch([
 *   db.insert(tables.chatMessage).values(batchValues[0]),
 *   db.insert(tables.chatMessage).values(batchValues[1])
 * ]);
 * ```
 */
export function prepareBatchInsert(
  messages: UIMessage[],
  threadId: string,
  options: MessagePersistenceOptions = {},
): DatabaseMessage[] {
  return convertUIMessagesToDatabase(messages, threadId, options);
}

/**
 * Create batch insert statements for handler with batch
 *
 * Returns array of insert statements ready for batch.db operations.
 * Used with createHandlerWithBatch pattern.
 *
 * Pattern from /docs/backend-patterns.md:1007-1045
 *
 * @param messages - Array of UIMessages
 * @param threadId - Thread the messages belong to
 * @param dbTable - Drizzle table reference
 * @returns Array of objects for batch.db.insert() operations
 *
 * @example
 * ```typescript
 * import * as tables from '@/db/schema';
 *
 * export const handler = createHandlerWithBatch(
 *   { auth: 'session' },
 *   async (c, batch) => {
 *     const messages = [userMessage, assistantMessage];
 *
 *     // Prepare inserts
 *     const inserts = prepareBatchInsertStatements(
 *       messages,
 *       threadId,
 *       tables.chatMessage
 *     );
 *
 *     // Execute in batch
 *     for (const insert of inserts) {
 *       await batch.db.insert(insert.table).values(insert.values);
 *     }
 *   }
 * );
 * ```
 */
export function prepareBatchInsertStatements<TTable>(
  messages: UIMessage[],
  threadId: string,
  dbTable: TTable,
  options: MessagePersistenceOptions = {},
): Array<{ table: TTable; values: DatabaseMessage }> {
  const dbMessages = convertUIMessagesToDatabase(messages, threadId, options);

  return dbMessages.map(message => ({
    table: dbTable,
    values: message,
  }));
}

// ============================================================================
// Message Filtering for Persistence
// ============================================================================

/**
 * Filter messages that need to be saved
 *
 * Removes messages that shouldn't be persisted (e.g., empty, error-only).
 * Used before batch insert operations.
 *
 * @param messages - Array of UIMessages
 * @returns Filtered array of messages to persist
 *
 * @example
 * ```typescript
 * const allMessages = [...previousMessages, newMessage, errorMessage];
 * const toPersist = filterMessagesForPersistence(allMessages);
 *
 * const dbMessages = convertUIMessagesToDatabase(toPersist, threadId);
 * await saveBatch(dbMessages);
 * ```
 */
export function filterMessagesForPersistence(
  messages: UIMessage[],
): UIMessage[] {
  return messages.filter((message) => {
    // Always save user messages
    if (message.role === 'user')
      return true;

    // For assistant messages, check for content
    const metadata = message.metadata as UIMessageMetadata | undefined;
    const hasError = metadata?.hasError === true;
    const hasContent = message.parts?.some(
      part => part.type === 'text' && 'text' in part && part.text.trim().length > 0,
    );

    // Save if has content OR has error (for debugging)
    return hasContent || hasError;
  });
}

/**
 * Deduplicate messages before persistence
 *
 * Removes duplicate messages by ID before saving to database.
 * Prevents duplicate key errors in batch operations.
 *
 * @param messages - Array of UIMessages
 * @returns Deduplicated array of messages
 *
 * @example
 * ```typescript
 * const messages = [...previousMessages, newMessages];
 * const unique = deduplicateMessagesForPersistence(messages);
 *
 * await saveBatch(convertUIMessagesToDatabase(unique, threadId));
 * ```
 */
export function deduplicateMessagesForPersistence(
  messages: UIMessage[],
): UIMessage[] {
  const seen = new Set<string>();

  return messages.filter((message) => {
    if (seen.has(message.id))
      return false;
    seen.add(message.id);
    return true;
  });
}

// ============================================================================
// Usage Example Pattern (Reference)
// ============================================================================

/**
 * Example: Persisting messages in streaming handler
 *
 * Demonstrates proper message persistence with AI SDK v5 and Cloudflare D1.
 *
 * @example
 * ```typescript
 * import { streamText } from 'ai';
 * import { createHandlerWithBatch } from '@/api/core';
 * import * as tables from '@/db/schema';
 * import {
 *   createUserMessage,
 *   createAssistantMessage,
 *   prepareBatchInsert
 * } from '@/lib/ai/persistence-utils';
 *
 * export const streamChatHandler = createHandlerWithBatch(
 *   {
 *     auth: 'session',
 *     validateBody: StreamChatRequestSchema,
 *   },
 *   async (c, batch) => {
 *     const { threadId, content } = c.validated.body;
 *
 *     // Save user message
 *     const userMessage = createUserMessage(content, threadId, roundNumber);
 *     await batch.db.insert(tables.chatMessage).values(userMessage);
 *
 *     // Stream AI response
 *     let assistantText = '';
 *     const result = await streamText({
 *       model,
 *       messages: convertUIToModelMessages(previousMessages),
 *       onFinish: async ({ text }) => {
 *         assistantText = text;
 *
 *         // Save assistant message in batch
 *         const assistantMessage = createAssistantMessage(
 *           text,
 *           threadId,
 *           participantId,
 *           { model: 'gpt-4o-mini' },
 *           roundNumber
 *         );
 *
 *         await batch.db.insert(tables.chatMessage).values(assistantMessage);
 *       }
 *     });
 *
 *     return result.toUIMessageStreamResponse();
 *   }
 * );
 * ```
 */
