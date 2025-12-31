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
  MessageRoles,
  TEXT_EXTRACTABLE_MIME_TYPES,
  UIMessageRoles,
} from '@/api/core/enums';
import {
  loadAttachmentContent,
  loadMessageAttachments,
  uint8ArrayToBase64,
} from '@/api/services/attachment-content.service';
import { buildCitableContext } from '@/api/services/citation-context-builder';
import {
  buildAttachmentCitationPrompt,
  buildParticipantSystemPrompt,
  PARTICIPANT_ROSTER_PLACEHOLDER,
} from '@/api/services/prompts.service';
import { buildSearchContext } from '@/api/services/search-context-builder';
import { getFile } from '@/api/services/storage.service';
import type {
  AttachmentCitationInfo,
  CitableSource,
  CitationSourceMap,
  ThreadAttachmentContextResult,
  ThreadAttachmentWithContent,
} from '@/api/types/citations';
import type { TypedLogger } from '@/api/types/logger';
import { isModelFilePartWithData } from '@/api/types/uploads';
import type { getDbAsync } from '@/db';
import * as tables from '@/db';
import type { ChatMessage, ChatParticipant, ChatThread } from '@/db/validation';
import {
  extractTextFromMessage,
  getFilenameFromPart,
  getMimeTypeFromPart,
  getUploadIdFromFilePart,
  getUrlFromPart,
  isFilePart,
} from '@/lib/schemas/message-schemas';
import { filterNonEmptyMessages, getRoundNumber } from '@/lib/utils';

import { chatMessagesToUIMessages } from '../routes/chat/handlers/helpers';

// ============================================================================
// Type Definitions
// ============================================================================

export type LoadParticipantConfigParams = {
  threadId: string;
  participantIndex: number;
  hasPersistedParticipants?: boolean;
  thread: ChatThread & { participants: ChatParticipant[] };
  db: Awaited<ReturnType<typeof getDbAsync>>;
  logger?: TypedLogger;
};

export type LoadParticipantConfigResult = {
  participants: ChatParticipant[];
  participant: ChatParticipant;
};

export type BuildSystemPromptParams = {
  participant: ChatParticipant;
  allParticipants: ChatParticipant[];
  thread: Pick<ChatThread, 'id' | 'projectId' | 'enableWebSearch' | 'mode'>;
  userQuery: string;
  previousDbMessages: ChatMessage[];
  currentRoundNumber: number;
  env: { AI?: Ai; UPLOADS_R2_BUCKET?: R2Bucket };
  db: Awaited<ReturnType<typeof getDbAsync>>;
  logger?: TypedLogger;
  attachmentIds?: string[];
};

export type BuildSystemPromptResult = {
  systemPrompt: string;
  citationSourceMap: CitationSourceMap;
  citableSources: CitableSource[];
};

export type PrepareValidatedMessagesParams = {
  previousDbMessages: ChatMessage[];
  newMessage: UIMessage;
  logger?: TypedLogger;
  r2Bucket?: R2Bucket;
  db?: Awaited<ReturnType<typeof getDbAsync>>;
  attachmentIds?: string[];
};

export type PrepareValidatedMessagesResult = {
  modelMessages: CoreMessage[];
  attachmentErrors?: Array<{ uploadId: string; error: string }>;
};

// ============================================================================
// Thread Attachment Context Functions
// ============================================================================

const TEXT_EXTRACTABLE_SET: Set<string> = new Set(TEXT_EXTRACTABLE_MIME_TYPES);

function generateAttachmentCitationId(uploadId: string): string {
  return `${CitationSourcePrefixes[CitationSourceTypes.ATTACHMENT]}_${uploadId.slice(0, 8)}`;
}

export async function loadThreadAttachmentContext(params: {
  threadId: string;
  r2Bucket: R2Bucket | undefined;
  db: Awaited<ReturnType<typeof getDbAsync>>;
  logger?: TypedLogger;
  maxAttachments?: number;
  extractContent?: boolean;
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
    const roundByMessageId = new Map(
      threadMessages.map(m => [m.id, m.roundNumber]),
    );

    const messageUploadsRaw = await db
      .select()
      .from(tables.messageUpload)
      .innerJoin(
        tables.upload,
        eq(tables.messageUpload.uploadId, tables.upload.id),
      )
      .where(
        and(
          inArray(tables.messageUpload.messageId, messageIds),
          eq(tables.upload.status, 'uploaded'),
        ),
      )
      .orderBy(asc(tables.messageUpload.createdAt))
      .limit(maxAttachments);

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
          roundNumber: roundNumber ?? undefined,
          downloadUrl,
          mimeType: upload.mimeType,
          fileSize: upload.fileSize,
        },
      });
    }

    const unprocessedAttachmentIds = currentAttachmentIds.filter(
      id => !processedUploadIds.has(id),
    );

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
              logger?.warn(
                'Failed to extract content from current attachment',
                {
                  logType: 'operation',
                  operationName: 'loadThreadAttachmentContext',
                  uploadId: upload.id,
                  error:
                    error instanceof Error ? error.message : 'Unknown error',
                },
              );
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
          messageId: null,
          roundNumber: null,
          textContent,
          citationId,
        };

        attachments.push(attachment);

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
            roundNumber: undefined,
            downloadUrl,
            mimeType: upload.mimeType,
            fileSize: upload.fileSize,
          },
        });
      }
    }

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

function formatThreadAttachmentPrompt(
  attachments: ThreadAttachmentWithContent[],
): string {
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

export async function loadParticipantConfiguration(
  params: LoadParticipantConfigParams,
): Promise<LoadParticipantConfigResult> {
  const {
    threadId,
    participantIndex,
    hasPersistedParticipants,
    thread,
    db,
    logger,
  } = params;

  let participants: ChatParticipant[];

  if (hasPersistedParticipants && participantIndex === 0) {
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
    participants = thread.participants;
  }

  if (participants.length === 0) {
    throw createError.badRequest('No enabled participants in this thread');
  }

  const participant = participants[participantIndex];
  if (!participant) {
    throw createError.badRequest(
      `Participant at index ${participantIndex} not found`,
    );
  }

  return { participants, participant };
}

// ============================================================================
// System Prompt Building
// ============================================================================

export async function buildSystemPromptWithContext(
  params: BuildSystemPromptParams,
): Promise<BuildSystemPromptResult> {
  const {
    participant,
    allParticipants,
    thread,
    userQuery,
    previousDbMessages,
    currentRoundNumber,
    env,
    db,
    logger,
    attachmentIds,
  } = params;

  let citationSourceMap: CitationSourceMap = new Map();
  let citableSources: CitableSource[] = [];

  let systemPrompt
    = participant.settings?.systemPrompt
      || buildParticipantSystemPrompt(participant.role, thread.mode);

  const participantRoster = allParticipants
    .map(p => p.role || p.modelId.split('/').pop() || 'Unknown')
    .join(', ');
  systemPrompt = systemPrompt.replace(PARTICIPANT_ROSTER_PLACEHOLDER, participantRoster);

  if (thread.projectId && userQuery.trim()) {
    try {
      const project = await db.query.chatProject.findFirst({
        where: eq(tables.chatProject.id, thread.projectId),
      });

      if (project) {
        if (project.customInstructions) {
          systemPrompt = `${systemPrompt}\n\n## Project Instructions\n\n${project.customInstructions}`;
        }

        if (project.autoragInstanceId && env.AI) {
          try {
            const ragResponse = await env.AI.autorag(
              project.autoragInstanceId,
            ).aiSearch({
              query: userQuery,
              max_num_results: 5,
              rewrite_query: true,
              stream: false,
              reranking: {
                enabled: true,
                model: '@cf/baai/bge-reranker-base',
              },
              ranking_options: {
                score_threshold: 0.3,
              },
              filters: {
                type: 'and',
                filters: [
                  {
                    key: 'folder',
                    type: 'gt',
                    value: `${project.r2FolderPrefix}//`,
                  },
                  {
                    key: 'folder',
                    type: 'lte',
                    value: `${project.r2FolderPrefix}/z`,
                  },
                ],
              },
            });

            if (ragResponse.data && ragResponse.data.length > 0) {
              const sourceFiles = ragResponse.data
                .map((result) => {
                  const contentText = result.content
                    .filter(c => c.type === 'text')
                    .map(c => c.text)
                    .join('\n');
                  const score = (result.score * 100).toFixed(1);
                  const citationId = `${CitationSourcePrefixes[CitationSourceTypes.RAG]}_${result.file_id.slice(0, 8)}`;

                  const ragSource: CitableSource = {
                    id: citationId,
                    type: CitationSourceTypes.RAG,
                    sourceId: result.file_id,
                    title: result.filename,
                    content:
                      contentText.slice(0, 500)
                      + (contentText.length > 500 ? '...' : ''),
                    metadata: {
                      filename: result.filename,
                    },
                  };
                  citableSources.push(ragSource);
                  citationSourceMap.set(citationId, ragSource);

                  return `[${citationId}] **${result.filename}** (${score}% match):\n${contentText}`;
                })
                .join('\n\n---\n\n');

              const ragContext = ragResponse.response
                ? `### AI Analysis\n${ragResponse.response}\n\n### Source Files\n${sourceFiles}`
                : `### Relevant Files\n${sourceFiles}`;

              systemPrompt = `${systemPrompt}\n\n## Project Knowledge (Indexed Files)\n\n${ragContext}\n\n---\n\nUse the above knowledge from indexed project files when relevant. Cite sources using [rag_xxxxx] markers when referencing specific files.`;

              logger?.info('AutoRAG retrieved context', {
                logType: 'operation',
                operationName: 'buildSystemPromptWithContext',
                projectId: thread.projectId,
                resultCount: ragResponse.data.length,
                hasAiResponse: !!ragResponse.response,
                citableSourcesAdded: ragResponse.data.length,
              });
            } else if (ragResponse.response) {
              systemPrompt = `${systemPrompt}\n\n## Project Knowledge (Files)\n\n${ragResponse.response}\n\n---\n\nUse the above knowledge from uploaded project files when relevant to the conversation.`;
            }
          } catch (error) {
            logger?.warn('AutoRAG retrieval failed', {
              logType: 'operation',
              operationName: 'buildSystemPromptWithContext',
              projectId: thread.projectId,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }

        try {
          const citableContext = await buildCitableContext({
            projectId: thread.projectId,
            currentThreadId: thread.id,
            userQuery,
            maxMemories: 10,
            maxMessagesPerThread: 3,
            maxSearchResults: 5,
            maxModerators: 3,
            db,
          });

          citationSourceMap = citableContext.sourceMap;
          citableSources = citableContext.sources;

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

  try {
    const threadAttachmentContext = await loadThreadAttachmentContext({
      threadId: thread.id,
      r2Bucket: env.UPLOADS_R2_BUCKET,
      db,
      logger,
      maxAttachments: 20,
      extractContent: true,
      currentAttachmentIds: attachmentIds,
    });

    if (threadAttachmentContext.attachments.length > 0) {
      systemPrompt = `${systemPrompt}${threadAttachmentContext.formattedPrompt}`;

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

type FileDataEntry = {
  data: Uint8Array;
  mimeType: string;
  filename?: string;
};

function collectFileDataFromMessages(
  messages: UIMessage[],
): Map<string, FileDataEntry> {
  const fileDataMap = new Map<string, FileDataEntry>();

  for (const msg of messages) {
    if (!Array.isArray(msg.parts))
      continue;

    for (const part of msg.parts) {
      if (isModelFilePartWithData(part)) {
        const key
          = part.filename || `file_${part.mimeType}_${fileDataMap.size}`;

        fileDataMap.set(key, {
          data: part.data,
          mimeType: part.mimeType,
          filename: part.filename,
        });
      }
    }
  }

  return fileDataMap;
}

function injectFileDataIntoModelMessages(
  modelMessages: CoreMessage[],
  fileDataMap: Map<string, FileDataEntry>,
): CoreMessage[] {
  if (fileDataMap.size === 0) {
    return modelMessages;
  }

  return modelMessages.map((msg) => {
    if (msg.role !== MessageRoles.USER || !Array.isArray(msg.content)) {
      return msg;
    }

    let fileIndex = 0;
    const newContent = msg.content
      .map((part) => {
        if (part.type !== 'file') {
          return part;
        }

        let fileData: FileDataEntry | undefined;

        const partFilename = getFilenameFromPart(part);
        if (partFilename && fileDataMap.has(partFilename)) {
          fileData = fileDataMap.get(partFilename);
        }

        if (!fileData) {
          const mimeType = getMimeTypeFromPart(part);
          const fallbackKey = `file_${mimeType}_${fileIndex}`;
          fileData = fileDataMap.get(fallbackKey);

          if (!fileData) {
            const entries = Array.from(fileDataMap.values());
            if (fileIndex < entries.length) {
              fileData = entries[fileIndex];
            }
          }
        }

        fileIndex++;

        if (fileData) {
          const base64 = uint8ArrayToBase64(fileData.data);
          return {
            type: 'file' as const,
            data: fileData.data,
            url: `data:${fileData.mimeType};base64,${base64}`,
            mediaType: fileData.mimeType,
            mimeType: fileData.mimeType,
            filename: fileData.filename,
          };
        }

        const partUrl = getUrlFromPart(part);
        const hasValidUrl
          = partUrl
            && (partUrl.startsWith('data:')
              || partUrl.startsWith('http://')
              || partUrl.startsWith('https://'));

        if (!hasValidUrl) {
          const logFilename = getFilenameFromPart(part) ?? 'unknown';
          console.error(
            '[AI Streaming] Filtering out file part with invalid URL:',
            {
              filename: logFilename,
              url: partUrl || '(empty)',
              reason:
                'File parts must have data URLs or valid HTTP(S) URLs for AI providers',
            },
          );
          return null;
        }

        return part;
      })
      .filter((part): part is NonNullable<typeof part> => part !== null);

    return {
      ...msg,
      content: newContent,
    };
  });
}

export async function prepareValidatedMessages(
  params: PrepareValidatedMessagesParams,
): Promise<PrepareValidatedMessagesResult> {
  const {
    previousDbMessages,
    newMessage,
    logger,
    r2Bucket,
    db,
    attachmentIds,
  } = params;

  const previousMessages = await chatMessagesToUIMessages(previousDbMessages);

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
        const existingParts = Array.isArray(newMessage.parts)
          ? newMessage.parts
          : [];

        const nonFileParts = existingParts.filter(
          part => part.type !== 'file',
        );

        messageWithAttachments = {
          ...newMessage,
          parts: [...fileParts, ...nonFileParts],
        };

        logger?.info('Injected file parts into message for AI model', {
          logType: 'operation',
          operationName: 'prepareValidatedMessages',
          filePartsCount: fileParts.length,
          stats,
        });
      }

      if (errors.length > 0) {
        console.error('[Streaming] Some attachments failed to load:', {
          errorCount: errors.length,
          errors: errors.slice(0, 5),
          attachmentIds,
        });
        logger?.warn('Some attachments failed to load', {
          logType: 'operation',
          operationName: 'prepareValidatedMessages',
          errors,
        });
      }
    } catch (error) {
      console.error('[Streaming] Failed to load attachment content:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        attachmentIds,
        stack: error instanceof Error ? error.stack : undefined,
      });
      logger?.error('Failed to load attachment content', {
        logType: 'operation',
        operationName: 'prepareValidatedMessages',
        error: error instanceof Error ? error.message : 'Unknown error',
        attachmentIds,
      });
    }
  }

  if ((!attachmentIds || attachmentIds.length === 0) && db) {
    const existingParts = Array.isArray(newMessage.parts)
      ? newMessage.parts
      : [];

    // Helper to extract URL from parts (custom extension to AI SDK - file parts with URL property)
    function extractUrlFromFilePart(part: unknown): string | null {
      if (
        typeof part === 'object'
        && part !== null
        && 'type' in part
        && part.type === 'file'
        && 'url' in part
        && typeof part.url === 'string'
      ) {
        return part.url;
      }
      return null;
    }

    const httpUrlFileParts = existingParts.filter((part) => {
      const url = extractUrlFromFilePart(part);
      return (
        url
        && (url.startsWith('http://') || url.startsWith('https://'))
        && url.includes('/uploads/')
      );
    });

    if (httpUrlFileParts.length > 0) {
      const uploadIdsFromUrls = httpUrlFileParts
        .map((part) => {
          const url = extractUrlFromFilePart(part);
          if (!url)
            return null;
          const match = url.match(/\/uploads\/([A-Z0-9]+)\//i);
          return match?.[1] ?? null;
        })
        .filter((id): id is string => id !== null && id !== undefined);

      if (uploadIdsFromUrls.length > 0) {
        logger?.debug(
          'Participant 1+ detected HTTP URLs in newMessage, extracting uploadIds',
          {
            logType: 'operation',
            operationName: 'prepareValidatedMessages',
            uploadIdsCount: uploadIdsFromUrls.length,
            uploadIds: uploadIdsFromUrls,
          },
        );

        try {
          const { fileParts, stats, errors: loadErrors } = await loadAttachmentContent({
            attachmentIds: uploadIdsFromUrls,
            r2Bucket,
            db,
            logger,
          });

          if (fileParts.length > 0) {
            const nonFileParts = existingParts.filter(
              part => part.type !== 'file',
            );

            messageWithAttachments = {
              ...newMessage,
              parts: [...fileParts, ...nonFileParts],
            };

            logger?.info(
              'Converted HTTP URL file parts to base64 for participant 1+',
              {
                logType: 'operation',
                operationName: 'prepareValidatedMessages',
                filePartsCount: fileParts.length,
                stats,
              },
            );
          }

          if (loadErrors.length > 0) {
            console.error(
              '[Streaming] Some participant 1+ attachments failed to load:',
              {
                errorCount: loadErrors.length,
                errors: loadErrors.slice(0, 5),
                uploadIds: uploadIdsFromUrls,
              },
            );
          }
        } catch (error) {
          console.error(
            '[Streaming] Failed to load participant 1+ attachment content:',
            {
              error: error instanceof Error ? error.message : 'Unknown error',
              uploadIds: uploadIdsFromUrls,
            },
          );
          logger?.error(
            'Failed to load participant 1+ attachment content',
            {
              error: error instanceof Error ? error.message : 'Unknown error',
              uploadIds: uploadIdsFromUrls,
            },
          );
        }
      }
    }

    if (messageWithAttachments === newMessage) {
      const uploadIdsFromParts: string[] = [];

      for (const part of existingParts) {
        if (!isFilePart(part)) {
          continue;
        }
        const uploadId = getUploadIdFromFilePart(part);
        if (uploadId) {
          uploadIdsFromParts.push(uploadId);
        }
      }

      if (uploadIdsFromParts.length > 0) {
        logger?.debug(
          'Participant 1+ detected uploadId on file parts, loading content directly',
          {
            logType: 'operation',
            operationName: 'prepareValidatedMessages',
            uploadIdsCount: uploadIdsFromParts.length,
            uploadIds: uploadIdsFromParts,
          },
        );

        try {
          const { fileParts, stats, errors: loadErrors } = await loadAttachmentContent({
            attachmentIds: uploadIdsFromParts,
            r2Bucket,
            db,
            logger,
          });

          if (fileParts.length > 0) {
            const nonFileParts = existingParts.filter(
              part => part.type !== 'file',
            );

            messageWithAttachments = {
              ...newMessage,
              parts: [...fileParts, ...nonFileParts],
            };

            logger?.info(
              'Converted uploadId file parts to base64 for participant 1+',
              {
                logType: 'operation',
                operationName: 'prepareValidatedMessages',
                filePartsCount: fileParts.length,
                stats,
              },
            );
          }

          if (loadErrors.length > 0) {
            console.error(
              '[Streaming] Some participant 1+ uploadId attachments failed to load:',
              {
                errorCount: loadErrors.length,
                errors: loadErrors.slice(0, 5),
                uploadIds: uploadIdsFromParts,
              },
            );
          }
        } catch (error) {
          console.error(
            '[Streaming] Failed to load participant 1+ uploadId attachment content:',
            {
              error: error instanceof Error ? error.message : 'Unknown error',
              uploadIds: uploadIdsFromParts,
            },
          );
          logger?.error(
            'Failed to load participant 1+ uploadId attachment content',
            {
              error: error instanceof Error ? error.message : 'Unknown error',
              uploadIds: uploadIdsFromParts,
            },
          );
        }
      }
    }
  }

  let messagesWithBase64 = previousMessages;

  if (db) {
    try {
      // Helper to extract URL from parts (reused from above)
      function extractUrlFromFilePart(part: unknown): string | null {
        if (
          typeof part === 'object'
          && part !== null
          && 'type' in part
          && part.type === 'file'
          && 'url' in part
          && typeof part.url === 'string'
        ) {
          return part.url;
        }
        return null;
      }

      const messageIdsToCheck = previousMessages
        .filter((msg) => {
          if (msg.role === MessageRoles.USER) {
            return true;
          }

          if (!Array.isArray(msg.parts))
            return false;
          return msg.parts.some((part) => {
            const url = extractUrlFromFilePart(part);
            return (
              url
              && !url.startsWith('data:')
              && (url.startsWith('http://') || url.startsWith('https://'))
            );
          });
        })
        .map(msg => msg.id);

      logger?.debug('Checking messages for attachment conversion', {
        logType: 'operation',
        operationName: 'prepareValidatedMessages',
        messageIdsToCheck,
        totalPreviousMessages: previousMessages.length,
        userMessages: previousMessages
          .filter(m => m.role === MessageRoles.USER)
          .map(m => ({
            id: m.id,
            hasFileParts:
              Array.isArray(m.parts) && m.parts.some(p => p.type === 'file'),
            filePartUrls: Array.isArray(m.parts)
              ? m.parts
                  .map(extractUrlFromFilePart)
                  .filter((url): url is string => url !== null)
                  .map(url => url.substring(0, 50))
              : [],
          })),
      });

      if (messageIdsToCheck.length > 0) {
        const { filePartsByMessageId, errors, stats }
          = await loadMessageAttachments({
            messageIds: messageIdsToCheck,
            r2Bucket,
            db,
            logger,
          });

        if (filePartsByMessageId.size > 0) {
          messagesWithBase64 = previousMessages.map((msg) => {
            const base64Parts = filePartsByMessageId.get(msg.id);
            if (!base64Parts || base64Parts.length === 0) {
              return msg;
            }

            const currentParts = Array.isArray(msg.parts) ? msg.parts : [];

            const hasFileParts = currentParts.some(
              part => part.type === 'file',
            );

            if (!hasFileParts) {
              return {
                ...msg,
                parts: [...base64Parts, ...currentParts],
              };
            }

            const nonFileParts = currentParts.filter(
              part => part.type !== 'file',
            );

            const existingDataUrlParts = currentParts.filter((part) => {
              if (part.type !== 'file') {
                return false;
              }
              const partUrl = 'url' in part ? part.url : '';
              return typeof partUrl === 'string' && partUrl.startsWith('data:');
            });

            return {
              ...msg,
              parts: [...base64Parts, ...existingDataUrlParts, ...nonFileParts],
            };
          });

          logger?.info(
            'Converted HTTP file URLs to base64 for previous messages',
            {
              logType: 'operation',
              operationName: 'prepareValidatedMessages',
              messagesConverted: filePartsByMessageId.size,
              stats,
            },
          );
        }

        if (errors.length > 0) {
          logger?.warn('Some previous message attachments failed to load', {
            logType: 'operation',
            operationName: 'prepareValidatedMessages',
            errors: errors.slice(0, 5),
          });
        }
      }
    } catch (error) {
      logger?.warn('Failed to load previous message attachments', {
        logType: 'operation',
        operationName: 'prepareValidatedMessages',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  const newMessageRoundNumber = getRoundNumber(newMessage?.metadata);
  const newMessageRole = newMessage?.role;

  const isDuplicateUserMessage
    = newMessageRoundNumber !== null
      && newMessageRole === UIMessageRoles.USER
      && messagesWithBase64.some((dbMsg) => {
        const dbRound = getRoundNumber(dbMsg.metadata);
        return (
          dbMsg.role === UIMessageRoles.USER && dbRound === newMessageRoundNumber
        );
      });

  const allMessages = isDuplicateUserMessage
    ? messagesWithBase64
    : [...messagesWithBase64, messageWithAttachments];

  if (isDuplicateUserMessage) {
    logger?.debug(
      'Skipping duplicate user message with potentially invalid URLs',
      {
        logType: 'operation',
        operationName: 'prepareValidatedMessages',
        roundNumber: newMessageRoundNumber,
        reason: 'DB already has user message with proper signed URLs',
      },
    );
  }

  const fileDataFromNewMessage = collectFileDataFromMessages([
    messageWithAttachments,
  ]);
  const fileDataFromHistory = collectFileDataFromMessages(allMessages);

  const newMessageFileParts = Array.isArray(messageWithAttachments.parts)
    ? messageWithAttachments.parts.filter(p => p.type === 'file')
    : [];

  if (
    newMessageFileParts.length > 0
    && fileDataFromNewMessage.size === 0
    && fileDataFromHistory.size === 0
  ) {
    logger?.warn('File parts detected but no file data collected', {
      logType: 'operation',
      operationName: 'prepareValidatedMessages',
      filePartsCount: newMessageFileParts.length,
      isDuplicateUserMessage,
      attachmentIdsCount: attachmentIds?.length ?? 0,
    });
  }

  const needsFallback
    = fileDataFromHistory.size === 0 && fileDataFromNewMessage.size === 0 && db;

  if (needsFallback) {
    const uploadIdsFromFileParts: string[] = [];

    const messagesToCheck = [...allMessages];
    if (!allMessages.includes(messageWithAttachments)) {
      messagesToCheck.push(messageWithAttachments);
    }

    for (const msg of messagesToCheck) {
      if (!Array.isArray(msg.parts)) {
        continue;
      }
      for (const part of msg.parts) {
        if (isFilePart(part)) {
          const uploadId = getUploadIdFromFilePart(part);
          if (uploadId) {
            uploadIdsFromFileParts.push(uploadId);
          }
        }
      }
    }

    if (uploadIdsFromFileParts.length > 0) {
      try {
        const { fileParts: loadedParts } = await loadAttachmentContent({
          attachmentIds: uploadIdsFromFileParts,
          r2Bucket,
          db,
          logger,
        });

        for (const part of loadedParts) {
          if (
            'data' in part
            && part.data instanceof Uint8Array
            && 'mimeType' in part
          ) {
            // Type guard for parts with filename property
            const filename = ('filename' in part && typeof part.filename === 'string')
              ? part.filename
              : undefined;
            const key
              = filename || `file_${part.mimeType}_${fileDataFromHistory.size}`;
            fileDataFromHistory.set(key, {
              data: part.data,
              mimeType: part.mimeType,
              filename,
            });
          }
        }

        logger?.info('Loaded file data via uploadId fallback', {
          logType: 'operation',
          operationName: 'prepareValidatedMessages',
          uploadIdsCount: uploadIdsFromFileParts.length,
          loadedCount: fileDataFromHistory.size,
        });
      } catch (error) {
        logger?.warn('Fallback file data loading failed', {
          logType: 'operation',
          operationName: 'prepareValidatedMessages',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }

  const fileDataMap = new Map([
    ...fileDataFromHistory,
    ...fileDataFromNewMessage,
  ]);

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

  const nonEmptyMessages = filterNonEmptyMessages(typedMessages);

  if (nonEmptyMessages.length === 0) {
    throw createError.badRequest('No valid messages to send to AI model');
  }

  if (fileDataMap.size > 0) {
    logger?.debug('Collected file data for post-processing', {
      logType: 'operation',
      operationName: 'prepareValidatedMessages',
      fileCount: fileDataMap.size,
      filenames: Array.from(fileDataMap.keys()),
    });
  }

  let modelMessages;
  try {
    modelMessages = convertToModelMessages(nonEmptyMessages);
  } catch (error) {
    throw createError.badRequest(
      `Failed to convert messages for model: ${error instanceof Error ? error.message : 'Unknown error'}`,
      { errorType: 'validation' },
    );
  }

  modelMessages = injectFileDataIntoModelMessages(modelMessages, fileDataMap);

  // ✅ AI SDK v5 PATTERN: Filter out ALL messages with empty content arrays
  // convertToModelMessages() filters out reasoning/step-start parts from UIMessage
  // This can result in assistant messages with empty content (e.g., reasoning-only responses)
  // Reference: https://ai-sdk.dev/docs/reference/ai-sdk-ui/convert-to-model-messages
  //
  // Providers like Gemini will reject requests with empty content, so we filter here.
  modelMessages = modelMessages.filter((msg) => {
    if (!Array.isArray(msg.content)) {
      return true;
    }
    if (msg.content.length === 0) {
      logger?.info('Filtering out message with empty content after SDK conversion', {
        logType: 'validation',
        operationName: 'prepareValidatedMessages',
        role: msg.role,
      });
      return false;
    }
    return true;
  });

  if (fileDataMap.size > 0) {
    logger?.debug('Injected file data into model messages', {
      logType: 'operation',
      operationName: 'prepareValidatedMessages',
      processedMessageCount: modelMessages.length,
    });
  }

  const lastModelMessage = modelMessages[modelMessages.length - 1];
  if (!lastModelMessage || lastModelMessage.role !== UIMessageRoles.USER) {
    const lastUserMessage = nonEmptyMessages.findLast(
      m => m.role === UIMessageRoles.USER,
    );
    if (!lastUserMessage) {
      throw createError.badRequest(
        'No valid user message found in conversation history',
      );
    }

    const lastUserText = lastUserMessage.parts?.find(
      p => p.type === 'text' && 'text' in p,
    );
    if (!lastUserText || !('text' in lastUserText)) {
      throw createError.badRequest(
        'Last user message has no valid text content',
      );
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

export function extractUserQuery(messages: UIMessage[]): string {
  const lastUserMessage = messages.findLast(
    m => m.role === UIMessageRoles.USER,
  );
  if (!lastUserMessage)
    return '';

  return extractTextFromMessage(lastUserMessage);
}
