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
import { and, asc, eq, inArray } from 'drizzle-orm';
import { ulid } from 'ulid';

import { createError } from '@/api/common/error-handling';
import {
  CitationSourcePrefixes,
  CitationSourceTypes,
  MAX_TEXT_CONTENT_SIZE,
  TEXT_EXTRACTABLE_MIME_TYPES,
  UIMessageRoles,
} from '@/api/core/enums';
import { loadAttachmentContent } from '@/api/services/attachment-content.service';
import type { CitableSource, CitationSourceMap } from '@/api/services/citation-context-builder';
import { buildCitableContext } from '@/api/services/citation-context-builder';
import type { AttachmentCitationInfo } from '@/api/services/prompts.service';
import { buildAttachmentCitationPrompt, buildParticipantSystemPrompt } from '@/api/services/prompts.service';
import { buildSearchContext } from '@/api/services/search-context-builder';
import { getFile } from '@/api/services/storage.service';
import type { TypedLogger } from '@/api/types/logger';
import type { getDbAsync } from '@/db';
import * as tables from '@/db/schema';
import type { ChatMessage, ChatParticipant, ChatThread } from '@/db/validation';
import { extractTextFromParts } from '@/lib/schemas/message-schemas';
import { filterNonEmptyMessages } from '@/lib/utils/message-transforms';

import { chatMessagesToUIMessages } from '../routes/chat/handlers/helpers';

// ============================================================================
// Thread Attachment Context Types
// ============================================================================

/**
 * Attachment with extracted content for RAG
 */
export type ThreadAttachmentWithContent = {
  id: string;
  filename: string;
  mimeType: string;
  fileSize: number;
  r2Key: string;
  messageId: string | null;
  roundNumber: number | null;
  /** Extracted text content (for text/code files) */
  textContent: string | null;
  /** Citation ID for referencing in AI responses */
  citationId: string;
};

/**
 * Thread attachment context result
 */
export type ThreadAttachmentContextResult = {
  attachments: ThreadAttachmentWithContent[];
  /** Formatted prompt section for system prompt */
  formattedPrompt: string;
  /** Citable sources for citation resolution */
  citableSources: CitableSource[];
  stats: {
    total: number;
    withContent: number;
    skipped: number;
  };
};

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
  thread: Pick<ChatThread, 'id' | 'projectId' | 'enableWebSearch' | 'mode'>;
  userQuery: string;
  previousDbMessages: ChatMessage[];
  currentRoundNumber: number;
  env: { AI?: CloudflareAiBinding; UPLOADS_R2_BUCKET?: R2Bucket };
  db: Awaited<ReturnType<typeof getDbAsync>>;
  logger?: TypedLogger;
  /** Upload IDs for attachments in the current user message */
  attachmentIds?: string[];
};

/**
 * Result from building system prompt with citation context
 */
export type BuildSystemPromptResult = {
  /** Complete system prompt with RAG context and citation instructions */
  systemPrompt: string;
  /** Source map for citation resolution (maps source IDs to full source data) */
  citationSourceMap: CitationSourceMap;
  /** Array of citable sources included in context */
  citableSources: CitableSource[];
};

export type PrepareValidatedMessagesParams = {
  previousDbMessages: ChatMessage[];
  newMessage: UIMessage;
  logger?: TypedLogger;
  /** R2 bucket for fetching attachment content (optional - enables multi-modal) */
  r2Bucket?: R2Bucket;
  /** Database instance for loading attachment metadata */
  db?: Awaited<ReturnType<typeof getDbAsync>>;
  /** Upload IDs for attachments to include in the message */
  attachmentIds?: string[];
};

export type PrepareValidatedMessagesResult = {
  modelMessages: CoreMessage[];
};

// ============================================================================
// Thread Attachment Context Functions
// ============================================================================

/** Set for efficient MIME type lookup - typed as Set<string> for runtime checks */
const TEXT_EXTRACTABLE_SET: Set<string> = new Set(TEXT_EXTRACTABLE_MIME_TYPES);

/**
 * Generate citation ID for attachment
 */
function generateAttachmentCitationId(uploadId: string): string {
  return `${CitationSourcePrefixes[CitationSourceTypes.ATTACHMENT]}_${uploadId.slice(0, 8)}`;
}

/**
 * Load all attachments from a thread with content extraction for RAG
 *
 * This function:
 * 1. Loads all uploads linked to messages in the thread
 * 2. Extracts text content from supported file types
 * 3. Formats attachments for citation in AI responses
 * 4. Returns formatted prompt section and citable sources
 *
 * Unlike per-message attachment loading, this provides THREAD-WIDE context
 * allowing AI to reference documents from any previous message in the conversation.
 */
export async function loadThreadAttachmentContext(params: {
  threadId: string;
  r2Bucket: R2Bucket | undefined;
  db: Awaited<ReturnType<typeof getDbAsync>>;
  logger?: TypedLogger;
  /** Max number of attachments to include */
  maxAttachments?: number;
  /** Whether to extract text content from files */
  extractContent?: boolean;
  /** Upload IDs for current message attachments (not yet linked via messageUpload) */
  currentAttachmentIds?: string[];
}): Promise<ThreadAttachmentContextResult> {
  const {
    threadId,
    r2Bucket,
    db,
    logger,
    maxAttachments = 20,
    extractContent = true,
    currentAttachmentIds = [],
  } = params;

  const attachments: ThreadAttachmentWithContent[] = [];
  const citableSources: CitableSource[] = [];
  let withContent = 0;
  let skipped = 0;

  try {
    // Load all messages in the thread to get their IDs
    const threadMessages = await db.query.chatMessage.findMany({
      where: eq(tables.chatMessage.threadId, threadId),
      orderBy: [asc(tables.chatMessage.roundNumber)],
      columns: {
        id: true,
        roundNumber: true,
      },
    });

    if (threadMessages.length === 0) {
      return {
        attachments: [],
        formattedPrompt: '',
        citableSources: [],
        stats: { total: 0, withContent: 0, skipped: 0 },
      };
    }

    const messageIds = threadMessages.map(m => m.id);
    const roundByMessageId = new Map(threadMessages.map(m => [m.id, m.roundNumber]));

    // Load all message-upload links for this thread's messages
    const messageUploadsRaw = await db
      .select()
      .from(tables.messageUpload)
      .innerJoin(tables.upload, eq(tables.messageUpload.uploadId, tables.upload.id))
      .where(
        and(
          inArray(tables.messageUpload.messageId, messageIds),
          eq(tables.upload.status, 'uploaded'),
        ),
      )
      .orderBy(asc(tables.messageUpload.createdAt))
      .limit(maxAttachments);

    // Track which upload IDs we've already processed to avoid duplicates
    const processedUploadIds = new Set<string>();

    logger?.info('Loading thread attachment context', {
      logType: 'operation',
      operationName: 'loadThreadAttachmentContext',
      threadId,
      messageCount: threadMessages.length,
      attachmentCount: messageUploadsRaw.length,
      currentAttachmentCount: currentAttachmentIds.length,
    });

    for (const row of messageUploadsRaw) {
      processedUploadIds.add(row.upload.id);
      const upload = row.upload;
      const messageId = row.message_upload.messageId;
      const roundNumber = roundByMessageId.get(messageId) ?? null;
      const citationId = generateAttachmentCitationId(upload.id);

      let textContent: string | null = null;

      // Extract text content for supported file types
      if (extractContent && TEXT_EXTRACTABLE_SET.has(upload.mimeType)) {
        if (upload.fileSize <= MAX_TEXT_CONTENT_SIZE) {
          try {
            const { data } = await getFile(r2Bucket, upload.r2Key);
            if (data) {
              textContent = new TextDecoder().decode(data);
              // Truncate if too long (shouldn't happen due to size check, but safety)
              if (textContent.length > MAX_TEXT_CONTENT_SIZE) {
                textContent = `${textContent.slice(0, MAX_TEXT_CONTENT_SIZE)}\n... (truncated)`;
              }
              withContent++;
            }
          } catch (error) {
            logger?.warn('Failed to extract content from attachment', {
              logType: 'operation',
              operationName: 'loadThreadAttachmentContext',
              uploadId: upload.id,
              error: error instanceof Error ? error.message : 'Unknown error',
            });
          }
        } else {
          skipped++;
          logger?.debug('Skipping large file for content extraction', {
            logType: 'operation',
            operationName: 'loadThreadAttachmentContext',
            uploadId: upload.id,
            fileSize: upload.fileSize,
            maxSize: MAX_TEXT_CONTENT_SIZE,
          });
        }
      }

      const attachment: ThreadAttachmentWithContent = {
        id: upload.id,
        filename: upload.filename,
        mimeType: upload.mimeType,
        fileSize: upload.fileSize,
        r2Key: upload.r2Key,
        messageId,
        roundNumber,
        textContent,
        citationId,
      };

      attachments.push(attachment);

      // Create citable source for citation resolution
      // Include download URL so frontend can show download button
      const contentPreview = textContent
        ? textContent.slice(0, 500) + (textContent.length > 500 ? '...' : '')
        : `File: ${upload.filename} (${upload.mimeType}, ${(upload.fileSize / 1024).toFixed(1)}KB)`;

      // Build download URL for the attachment
      const downloadUrl = `/api/v1/uploads/${upload.id}/download`;

      citableSources.push({
        id: citationId,
        type: CitationSourceTypes.ATTACHMENT,
        sourceId: upload.id,
        title: upload.filename,
        content: contentPreview,
        metadata: {
          filename: upload.filename,
          roundNumber: roundNumber ?? undefined,
          downloadUrl,
          mimeType: upload.mimeType,
          fileSize: upload.fileSize,
        },
      });
    }

    // ✅ TIMING FIX: Load current message attachments directly by IDs
    // These are NOT yet linked via messageUpload (that happens AFTER streaming completes)
    // Without this, current round's attachments wouldn't be in citation sources
    const unprocessedAttachmentIds = currentAttachmentIds.filter(id => !processedUploadIds.has(id));

    if (unprocessedAttachmentIds.length > 0) {
      const currentUploads = await db.query.upload.findMany({
        where: and(
          inArray(tables.upload.id, unprocessedAttachmentIds),
          eq(tables.upload.status, 'uploaded'),
        ),
      });

      logger?.info('Loading current message attachments for citation context', {
        logType: 'operation',
        operationName: 'loadThreadAttachmentContext',
        currentAttachmentIds: unprocessedAttachmentIds,
        foundUploads: currentUploads.length,
      });

      for (const upload of currentUploads) {
        const citationId = generateAttachmentCitationId(upload.id);

        let textContent: string | null = null;

        // Extract text content for supported file types
        if (extractContent && TEXT_EXTRACTABLE_SET.has(upload.mimeType)) {
          if (upload.fileSize <= MAX_TEXT_CONTENT_SIZE) {
            try {
              const { data } = await getFile(r2Bucket, upload.r2Key);
              if (data) {
                textContent = new TextDecoder().decode(data);
                if (textContent.length > MAX_TEXT_CONTENT_SIZE) {
                  textContent = `${textContent.slice(0, MAX_TEXT_CONTENT_SIZE)}\n... (truncated)`;
                }
                withContent++;
              }
            } catch (error) {
              logger?.warn('Failed to extract content from current attachment', {
                logType: 'operation',
                operationName: 'loadThreadAttachmentContext',
                uploadId: upload.id,
                error: error instanceof Error ? error.message : 'Unknown error',
              });
            }
          } else {
            skipped++;
          }
        }

        const attachment: ThreadAttachmentWithContent = {
          id: upload.id,
          filename: upload.filename,
          mimeType: upload.mimeType,
          fileSize: upload.fileSize,
          r2Key: upload.r2Key,
          messageId: null, // Not yet linked to a message
          roundNumber: null, // Will be set when message is persisted
          textContent,
          citationId,
        };

        attachments.push(attachment);

        // Create citable source
        const contentPreview = textContent
          ? textContent.slice(0, 500) + (textContent.length > 500 ? '...' : '')
          : `File: ${upload.filename} (${upload.mimeType}, ${(upload.fileSize / 1024).toFixed(1)}KB)`;

        const downloadUrl = `/api/v1/uploads/${upload.id}/download`;

        citableSources.push({
          id: citationId,
          type: CitationSourceTypes.ATTACHMENT,
          sourceId: upload.id,
          title: upload.filename,
          content: contentPreview,
          metadata: {
            filename: upload.filename,
            roundNumber: undefined, // Current round, not yet persisted
            downloadUrl,
            mimeType: upload.mimeType,
            fileSize: upload.fileSize,
          },
        });
      }
    }

    // Format prompt section
    const formattedPrompt = formatThreadAttachmentPrompt(attachments);

    logger?.info('Thread attachment context loaded', {
      logType: 'operation',
      operationName: 'loadThreadAttachmentContext',
      threadId,
      stats: { total: attachments.length, withContent, skipped },
    });

    return {
      attachments,
      formattedPrompt,
      citableSources,
      stats: { total: attachments.length, withContent, skipped },
    };
  } catch (error) {
    logger?.error('Failed to load thread attachment context', {
      logType: 'operation',
      operationName: 'loadThreadAttachmentContext',
      threadId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return {
      attachments: [],
      formattedPrompt: '',
      citableSources: [],
      stats: { total: 0, withContent: 0, skipped: 0 },
    };
  }
}

/**
 * Format thread attachments into a prompt section
 * ✅ REFACTORED: Delegates to centralized buildAttachmentCitationPrompt
 *
 * @param attachments - Thread attachments with extracted content
 * @returns Formatted prompt section with citation instructions
 */
function formatThreadAttachmentPrompt(attachments: ThreadAttachmentWithContent[]): string {
  // Map to centralized AttachmentCitationInfo format
  const citationInfos: AttachmentCitationInfo[] = attachments.map(att => ({
    filename: att.filename,
    citationId: att.citationId,
    mimeType: att.mimeType,
    fileSize: att.fileSize,
    roundNumber: att.roundNumber,
    textContent: att.textContent,
  }));

  return buildAttachmentCitationPrompt(citationInfos);
}

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
 * Build system prompt with RAG context and citation support
 *
 * This function:
 * 1. Starts with participant's base system prompt
 * 2. Adds project custom instructions if applicable
 * 3. Retrieves AutoRAG context if configured
 * 4. Adds citable project context with source IDs for citations
 * 5. Adds web search context if enabled
 *
 * Reference: streaming.handler.ts lines 440-642
 *
 * @param params - Prompt building parameters
 * @returns Complete system prompt with RAG context and citation source map
 */
export async function buildSystemPromptWithContext(
  params: BuildSystemPromptParams,
): Promise<BuildSystemPromptResult> {
  const { participant, thread, userQuery, previousDbMessages, currentRoundNumber, env, db, logger, attachmentIds } = params;

  // Initialize citation tracking
  let citationSourceMap: CitationSourceMap = new Map();
  let citableSources: CitableSource[] = [];

  // Start with base system prompt (pass mode for mode-specific interaction styles)
  let systemPrompt = participant.settings?.systemPrompt
    || buildParticipantSystemPrompt(participant.role, thread.mode);

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
              systemPrompt = `${systemPrompt}\n\n## Project Knowledge (Files)\n\n${ragResponse.response}\n\n---\n\nUse the above knowledge from uploaded project files when relevant to the conversation. Provide natural, coherent responses.`;
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

        // Add citable project context with source IDs for citations
        // OpenAI ChatGPT Projects Pattern: Conversations reference info from other chats in same project
        // Enhanced: Each source has a unique ID for AI to cite (e.g., [mem_abc123])
        try {
          const citableContext = await buildCitableContext({
            projectId: thread.projectId,
            currentThreadId: thread.id,
            userQuery,
            maxMemories: 10,
            maxMessagesPerThread: 3,
            maxSearchResults: 5,
            maxAnalyses: 3,
            db,
          });

          // Store citation data for later resolution
          citationSourceMap = citableContext.sourceMap;
          citableSources = citableContext.sources;

          // Add formatted context with citation instructions to prompt
          if (citableContext.formattedPrompt) {
            systemPrompt = `${systemPrompt}${citableContext.formattedPrompt}`;
          }

          logger?.info('Built citable project context', {
            logType: 'operation',
            operationName: 'buildSystemPromptWithContext',
            projectId: thread.projectId,
            sourceCount: citableContext.sources.length,
            stats: citableContext.stats,
          });
        } catch (error) {
          logger?.warn('Citable project context loading failed', {
            logType: 'operation',
            operationName: 'buildSystemPromptWithContext',
            projectId: thread.projectId,
            error,
          });
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

  // ✅ THREAD-LEVEL ATTACHMENT CONTEXT: Include ALL uploaded files from this conversation
  // This enables RAG across the entire thread, not just the current message
  // AI participants can reference and cite documents from any previous message
  // ✅ FIX: Also include current message's attachments (via attachmentIds) since messageUpload
  // records aren't created yet at this point in the request cycle
  try {
    const threadAttachmentContext = await loadThreadAttachmentContext({
      threadId: thread.id,
      r2Bucket: env.UPLOADS_R2_BUCKET,
      db,
      logger,
      maxAttachments: 20,
      extractContent: true,
      currentAttachmentIds: attachmentIds, // Include current message's attachments
    });

    if (threadAttachmentContext.attachments.length > 0) {
      // Add formatted prompt to system prompt
      systemPrompt = `${systemPrompt}${threadAttachmentContext.formattedPrompt}`;

      // Add attachment citable sources to the citation tracking
      // This enables citation resolution for [att_ID] references
      for (const source of threadAttachmentContext.citableSources) {
        citableSources.push(source);
        citationSourceMap.set(source.id, source);
      }

      logger?.info('Added thread attachment context for RAG', {
        logType: 'operation',
        operationName: 'buildSystemPromptWithContext',
        threadId: thread.id,
        attachmentStats: threadAttachmentContext.stats,
        citableSourcesAdded: threadAttachmentContext.citableSources.length,
      });
    }
  } catch (error) {
    logger?.warn('Thread attachment context loading failed', {
      logType: 'operation',
      operationName: 'buildSystemPromptWithContext',
      threadId: thread.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }

  return {
    systemPrompt,
    citationSourceMap,
    citableSources,
  };
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
  const { previousDbMessages, newMessage, logger, r2Bucket, db, attachmentIds } = params;

  // Convert database messages to UIMessage format
  const previousMessages = await chatMessagesToUIMessages(previousDbMessages);

  // ✅ MULTI-MODAL: Inject file parts from attachments into the new message
  // This conversion happens entirely on the backend - frontend never sees base64 data
  let messageWithAttachments = newMessage;

  if (attachmentIds && attachmentIds.length > 0 && db) {
    try {
      const { fileParts, errors, stats } = await loadAttachmentContent({
        attachmentIds,
        r2Bucket,
        db,
        logger,
      });

      if (fileParts.length > 0) {
        // Inject file parts at the beginning of the message parts
        // This ensures images are seen by the model before the text prompt
        const existingParts = Array.isArray(newMessage.parts) ? newMessage.parts : [];
        messageWithAttachments = {
          ...newMessage,
          parts: [...fileParts, ...existingParts],
        };

        logger?.info('Injected file parts into message for AI model', {
          logType: 'operation',
          operationName: 'prepareValidatedMessages',
          filePartsCount: fileParts.length,
          stats,
        });
      }

      if (errors.length > 0) {
        logger?.warn('Some attachments failed to load', {
          logType: 'operation',
          operationName: 'prepareValidatedMessages',
          errors,
        });
      }
    } catch (error) {
      // Don't fail the entire request if attachment loading fails
      // The AI can still respond without the images
      logger?.error('Failed to load attachment content', {
        logType: 'operation',
        operationName: 'prepareValidatedMessages',
        error: error instanceof Error ? error.message : 'Unknown error',
        attachmentIds,
      });
    }
  }

  // Validate all messages
  const allMessages = [...previousMessages, messageWithAttachments];
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
  if (!lastModelMessage || lastModelMessage.role !== UIMessageRoles.USER) {
    const lastUserMessage = nonEmptyMessages.findLast(m => m.role === UIMessageRoles.USER);
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
        role: UIMessageRoles.USER,
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
  const lastUserMessage = messages.findLast(m => m.role === UIMessageRoles.USER);
  if (!lastUserMessage)
    return '';

  return extractTextFromParts(
    lastUserMessage.parts as Array<{ type: 'text'; text: string } | { type: 'reasoning'; text: string }>,
  );
}
