/**
 * Streaming Orchestration Service
 *
 * Following backend-patterns.md: Service layer for business logic
 * Extracted from streaming.handler.ts to reduce handler complexity
 *
 * This service handles:
 * - Loading and validating participants
 * - Building system prompts with RAG context
 * - Preparing and validating messages for streaming
 * - Orchestrating participant streaming flow
 *
 * Reference: streaming.handler.ts lines 195-650
 */

import type { CoreMessage, UIMessage } from 'ai';
import { convertToModelMessages, validateUIMessages } from 'ai';
import { asc, eq } from 'drizzle-orm';
import { ulid } from 'ulid';

import { createError } from '@/api/common/error-handling';
import { buildParticipantSystemPrompt } from '@/api/services/prompts.service';
import { buildSearchContext } from '@/api/services/search-context-builder';
import type { TypedLogger } from '@/api/types/logger';
import type { getDbAsync } from '@/db';
import * as tables from '@/db/schema';
import type { ChatMessage, ChatParticipant, ChatThread } from '@/db/validation';
import { extractTextFromParts } from '@/lib/schemas/message-schemas';
import { filterNonEmptyMessages } from '@/lib/utils/message-transforms';

import { chatMessagesToUIMessages } from '../routes/chat/handlers/helpers';

// ============================================================================
// Type Definitions
// ============================================================================

export type LoadParticipantConfigParams = {
  threadId: string;
  participantIndex: number;
  providedParticipants?: unknown;
  thread: ChatThread & { participants: ChatParticipant[] };
  db: Awaited<ReturnType<typeof getDbAsync>>;
  logger?: TypedLogger;
};

export type LoadParticipantConfigResult = {
  participants: ChatParticipant[];
  participant: ChatParticipant;
};

/**
 * Cloudflare AI binding interface
 *
 * TYPE SAFETY NOTE:
 * - Cloudflare AI binding is declared in cloudflare-env.d.ts as `Ai` type
 * - AutoRAG is a Cloudflare AI feature for retrieval-augmented generation
 * - This interface matches the runtime API without importing internal Cloudflare types
 *
 * JUSTIFICATION:
 * - Cloudflare `Ai` type doesn't expose autorag() in public type definitions
 * - Runtime API exists and works correctly in production
 * - Defining interface here avoids dependency on internal Cloudflare types
 * - Safe because:
 *   1. AutoRAG is a documented Cloudflare AI feature
 *   2. Interface only used when env.AI exists (runtime check)
 *   3. Errors caught and handled gracefully in try-catch blocks
 *
 * REFERENCE: Cloudflare Workers AI documentation
 */
export type CloudflareAiBinding = {
  autorag: (instanceId: string) => {
    aiSearch: (params: {
      query: string;
      max_num_results: number;
      rewrite_query: boolean;
      stream: boolean;
      filters?: {
        type: string;
        filters: Array<{
          key: string;
          type: string;
          value: string;
        }>;
      };
    }) => Promise<{ response?: string }>;
  };
};

export type BuildSystemPromptParams = {
  participant: ChatParticipant;
  thread: Pick<ChatThread, 'projectId' | 'enableWebSearch'>;
  userQuery: string;
  previousDbMessages: ChatMessage[];
  currentRoundNumber: number;
  env: { AI?: CloudflareAiBinding };
  db: Awaited<ReturnType<typeof getDbAsync>>;
  logger?: TypedLogger;
};

export type PrepareValidatedMessagesParams = {
  previousDbMessages: ChatMessage[];
  newMessage: UIMessage;
  logger?: TypedLogger;
};

export type PrepareValidatedMessagesResult = {
  modelMessages: CoreMessage[];
};

// ============================================================================
// Participant Configuration
// ============================================================================

/**
 * Load participant configuration after persistence
 *
 * OPTIMIZATION: Only reload participants when participant 0 persisted changes
 * This prevents redundant database queries for subsequent participants (1, 2, 3...)
 *
 * RELOAD STRATEGY:
 * - Participant 0 with providedParticipants: MUST reload (just persisted changes)
 * - Participants 1+ with providedParticipants: Use initial thread.participants (no persistence)
 * - Any participant without providedParticipants: Use initial thread.participants
 *
 * Reference: streaming.handler.ts lines 195-235
 *
 * @param params - Configuration parameters
 * @returns Loaded participants and selected participant
 */
export async function loadParticipantConfiguration(
  params: LoadParticipantConfigParams,
): Promise<LoadParticipantConfigResult> {
  const { threadId, participantIndex, providedParticipants, thread, db, logger } = params;

  let participants: ChatParticipant[];

  if (providedParticipants && participantIndex === 0) {
    // PARTICIPANT 0 ONLY: Reload from database after persistence
    logger?.info('Reloading participants after persistence', {
      logType: 'operation',
      operationName: 'loadParticipantConfiguration',
      threadId,
      participantIndex,
    });

    const reloadedThread = await db.query.chatThread.findFirst({
      where: eq(tables.chatThread.id, threadId),
      with: {
        participants: {
          where: eq(tables.chatParticipant.isEnabled, true),
          orderBy: [asc(tables.chatParticipant.priority)],
        },
      },
    });

    if (!reloadedThread || reloadedThread.participants.length === 0) {
      throw createError.badRequest('No enabled participants after persistence');
    }

    participants = reloadedThread.participants;
  } else {
    // SUBSEQUENT PARTICIPANTS (1, 2, 3...) OR NO CONFIG: Use initial thread.participants
    participants = thread.participants;
  }

  if (participants.length === 0) {
    throw createError.badRequest('No enabled participants in this thread');
  }

  // Get SINGLE Participant (frontend orchestration)
  const participant = participants[participantIndex];
  if (!participant) {
    throw createError.badRequest(`Participant at index ${participantIndex} not found`);
  }

  return { participants, participant };
}

// ============================================================================
// System Prompt Building
// ============================================================================

/**
 * Build system prompt with RAG context
 *
 * This function:
 * 1. Starts with participant's base system prompt
 * 2. Adds project custom instructions if applicable
 * 3. Retrieves AutoRAG context if configured
 * 4. Adds web search context if enabled
 *
 * Reference: streaming.handler.ts lines 440-642
 *
 * @param params - Prompt building parameters
 * @returns Complete system prompt with RAG context
 */
export async function buildSystemPromptWithContext(
  params: BuildSystemPromptParams,
): Promise<string> {
  const { participant, thread, userQuery, previousDbMessages, currentRoundNumber, env, db, logger } = params;

  // Start with base system prompt
  let systemPrompt = participant.settings?.systemPrompt
    || buildParticipantSystemPrompt(participant.role);

  // Add project-based context
  if (thread.projectId && userQuery.trim()) {
    try {
      const project = await db.query.chatProject.findFirst({
        where: eq(tables.chatProject.id, thread.projectId),
      });

      if (project) {
        // Add custom instructions
        if (project.customInstructions) {
          systemPrompt = `${systemPrompt}\n\n## Project Instructions\n\n${project.customInstructions}`;
        }

        // Add AutoRAG context
        if (project.autoragInstanceId && env.AI) {
          try {
            /**
             * Cloudflare AI AutoRAG retrieval
             *
             * TYPE SAFETY:
             * - env.AI is typed as CloudflareAiBinding (defined above)
             * - autorag() and aiSearch() are now fully typed
             * - No type assertion needed - interface provides compile-time safety
             */
            const ragResponse = await env.AI.autorag(project.autoragInstanceId).aiSearch({
              query: userQuery,
              max_num_results: 5,
              rewrite_query: true,
              stream: false,
              filters: {
                type: 'and',
                filters: [
                  { key: 'folder', type: 'gte', value: project.r2FolderPrefix },
                  { key: 'folder', type: 'lte', value: `${project.r2FolderPrefix}~` },
                ],
              },
            });

            if (ragResponse.response) {
              systemPrompt = `${systemPrompt}\n\n## Project Knowledge\n\n${ragResponse.response}\n\n---\n\nUse the above knowledge from the project when relevant to the conversation. Provide natural, coherent responses.`;
            }
          } catch (error) {
            logger?.warn('AutoRAG retrieval failed', {
              logType: 'operation',
              operationName: 'buildSystemPromptWithContext',
              projectId: thread.projectId,
              error,
            });
          }
        }
      }
    } catch (error) {
      logger?.warn('Project context loading failed', {
        logType: 'operation',
        operationName: 'buildSystemPromptWithContext',
        projectId: thread.projectId,
        error,
      });
    }
  }

  // Add web search context
  if (thread.enableWebSearch) {
    try {
      const searchContext = buildSearchContext(previousDbMessages, {
        currentRoundNumber,
        includeFullResults: true,
      });

      if (searchContext) {
        systemPrompt = `${systemPrompt}${searchContext}`;
      }
    } catch (error) {
      logger?.warn('Search context building failed', {
        logType: 'operation',
        operationName: 'buildSystemPromptWithContext',
        error,
      });
    }
  }

  return systemPrompt;
}

// ============================================================================
// Message Preparation
// ============================================================================

/**
 * Prepare and validate messages for streaming
 *
 * This function:
 * 1. Converts database messages to UIMessage format
 * 2. Validates all messages with AI SDK
 * 3. Filters out empty messages
 * 4. Converts to model messages format
 * 5. Ensures conversation ends with user message
 *
 * Reference: streaming.handler.ts lines 247-593
 *
 * @param params - Message preparation parameters
 * @returns Validated model messages ready for streaming
 */
export async function prepareValidatedMessages(
  params: PrepareValidatedMessagesParams,
): Promise<PrepareValidatedMessagesResult> {
  const { previousDbMessages, newMessage } = params;

  // Convert database messages to UIMessage format
  const previousMessages = await chatMessagesToUIMessages(previousDbMessages);

  // Validate all messages
  const allMessages = [...previousMessages, newMessage];
  let typedMessages: UIMessage[] = [];

  try {
    typedMessages = await validateUIMessages({
      messages: allMessages,
    });
  } catch (error) {
    throw createError.badRequest(
      `Invalid message format: ${error instanceof Error ? error.message : 'Unknown error'}`,
      { errorType: 'validation' },
    );
  }

  // Filter out empty messages
  const nonEmptyMessages = filterNonEmptyMessages(typedMessages);

  if (nonEmptyMessages.length === 0) {
    throw createError.badRequest('No valid messages to send to AI model');
  }

  // Convert to model messages
  let modelMessages;
  try {
    modelMessages = convertToModelMessages(nonEmptyMessages);
  } catch (error) {
    throw createError.badRequest(
      `Failed to convert messages for model: ${error instanceof Error ? error.message : 'Unknown error'}`,
      { errorType: 'validation' },
    );
  }

  // Ensure conversation ends with user message
  const lastModelMessage = modelMessages[modelMessages.length - 1];
  if (!lastModelMessage || lastModelMessage.role !== 'user') {
    const lastUserMessage = nonEmptyMessages.findLast(m => m.role === 'user');
    if (!lastUserMessage) {
      throw createError.badRequest('No valid user message found in conversation history');
    }

    const lastUserText = lastUserMessage.parts?.find(p => p.type === 'text' && 'text' in p);
    if (!lastUserText || !('text' in lastUserText)) {
      throw createError.badRequest('Last user message has no valid text content');
    }

    modelMessages = convertToModelMessages([
      ...nonEmptyMessages,
      {
        id: `user-continuation-${ulid()}`,
        role: 'user',
        parts: [{ type: 'text', text: lastUserText.text }],
      },
    ]);
  }

  return { modelMessages };
}

/**
 * Extract user query from messages
 *
 * Helper to get the last user message text for RAG context retrieval.
 *
 * @param messages - UI messages array
 * @returns User query text or empty string
 */
export function extractUserQuery(messages: UIMessage[]): string {
  const lastUserMessage = messages.findLast(m => m.role === 'user');
  if (!lastUserMessage)
    return '';

  return extractTextFromParts(
    lastUserMessage.parts as Array<{ type: 'text'; text: string } | { type: 'reasoning'; text: string }>,
  );
}
