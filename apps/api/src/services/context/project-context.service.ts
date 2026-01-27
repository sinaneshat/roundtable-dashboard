/**
 * Project Context Service
 *
 * Following backend-patterns.md: Service layer for business logic
 *
 * This service handles:
 * - Aggregating project memories for RAG context
 * - Fetching relevant messages from other threads in the project
 * - Fetching pre-search results from project threads
 * - Fetching moderator summaries from project threads
 * - Building comprehensive project context for AI participants
 *
 * OpenAI ChatGPT Projects Pattern:
 * - Cross-chat memory: Conversations reference info from other chats in same project
 * - File auto-referencing: Files are automatically referenced when relevant
 * - Search history: Previous searches inform current conversations
 * - Moderator context: Past moderator analyses provide insights
 */

import {
  CLOUDFLARE_AI_SEARCH_COST_PER_QUERY,
  CLOUDFLARE_VECTORIZE_COST_PER_MILLION_DIMENSIONS,
  CLOUDFLARE_WORKERS_AI_COST_PER_1K_NEURONS,
} from '@roundtable/shared/constants';
import { CitationSourcePrefixes, CitationSourceTypes, MessagePartTypes, MessageRoles, PreSearchStatuses } from '@roundtable/shared/enums';
import { and, desc, eq, inArray, ne } from 'drizzle-orm';

import type {
  AggregatedProjectContext,
  ProjectAttachmentContext,
  ProjectChatContext,
  ProjectContextParams,
  ProjectMemoryContext,
  ProjectModeratorContext,
  ProjectRagContextParams,
  ProjectSearchContext,
} from '@/common/schemas/project-context';
import * as tables from '@/db';
import type { UploadMetadata } from '@/db/validation/upload';
import { extractTextFromParts } from '@/lib/schemas/message-schemas';
import { getExtractedText } from '@/lib/utils/metadata';
import { PreSearchDataPayloadSchema } from '@/routes/chat/schema';
import { deductCreditsForAction } from '@/services/billing/credit.service';
import { generateTraceId, trackSpan } from '@/services/errors/posthog-llm-tracking.service';
import { getFile } from '@/services/uploads';
import type { CitableSource, CitationSourceMap } from '@/types/citations';

// ============================================================================
// Memory Context
// ============================================================================

/**
 * Fetch active project memories ordered by importance
 */
export async function getProjectMemories(
  params: Pick<ProjectContextParams, 'projectId' | 'maxMemories' | 'db'>,
): Promise<ProjectMemoryContext> {
  const { db, maxMemories = 10, projectId } = params;

  const memories = await db.query.projectMemory.findMany({
    columns: {
      content: true,
      id: true,
      importance: true,
      source: true,
      sourceThreadId: true,
      summary: true,
    },
    limit: maxMemories,
    orderBy: [desc(tables.projectMemory.importance), desc(tables.projectMemory.createdAt)],
    where: and(
      eq(tables.projectMemory.projectId, projectId),
      eq(tables.projectMemory.isActive, true),
    ),
  });

  // Get total count for pagination info
  const allMemories = await db.query.projectMemory.findMany({
    columns: { id: true },
    where: and(
      eq(tables.projectMemory.projectId, projectId),
      eq(tables.projectMemory.isActive, true),
    ),
  });

  return {
    memories,
    totalCount: allMemories.length,
  };
}

// ============================================================================
// Cross-Chat Context
// ============================================================================

/**
 * Fetch recent messages from other threads in the same project
 */
export async function getProjectChatContext(
  params: Pick<ProjectContextParams, 'projectId' | 'currentThreadId' | 'maxMessagesPerThread' | 'db'>,
): Promise<ProjectChatContext> {
  const { currentThreadId, db, maxMessagesPerThread = 5, projectId } = params;

  // Get other threads in this project (excluding current)
  const projectThreads = await db.query.chatThread.findMany({
    columns: {
      id: true,
      title: true,
    },
    limit: 5, // Only get 5 most recently active threads
    orderBy: [desc(tables.chatThread.lastMessageAt)],
    where: and(
      eq(tables.chatThread.projectId, projectId),
      ne(tables.chatThread.id, currentThreadId),
    ),
  });

  if (projectThreads.length === 0) {
    return { threads: [], totalThreads: 0 };
  }

  // Get recent messages from each thread
  const threadsWithMessages = await Promise.all(
    projectThreads.map(async (thread) => {
      const messages = await db.query.chatMessage.findMany({
        columns: {
          parts: true,
          role: true,
          roundNumber: true,
        },
        limit: maxMessagesPerThread,
        orderBy: [desc(tables.chatMessage.roundNumber), desc(tables.chatMessage.createdAt)],
        where: eq(tables.chatMessage.threadId, thread.id),
      });

      return {
        id: thread.id,
        messages: messages.map(msg => ({
          content: extractTextFromParts(msg.parts),
          role: msg.role,
          roundNumber: msg.roundNumber,
        })).filter(msg => msg.content.trim().length > 0),
        title: thread.title,
      };
    }),
  );

  // Filter out threads with no messages
  const nonEmptyThreads = threadsWithMessages.filter(t => t.messages.length > 0);

  return {
    threads: nonEmptyThreads,
    totalThreads: projectThreads.length,
  };
}

// ============================================================================
// Search Context
// ============================================================================

/**
 * Fetch pre-search results from other threads in the project
 */
export async function getProjectSearchContext(
  params: Pick<ProjectContextParams, 'projectId' | 'currentThreadId' | 'maxSearchResults' | 'db'>,
): Promise<ProjectSearchContext> {
  const { currentThreadId, db, maxSearchResults = 5, projectId } = params;

  // Get other threads in this project
  const projectThreads = await db.query.chatThread.findMany({
    columns: { id: true, title: true },
    where: and(
      eq(tables.chatThread.projectId, projectId),
      ne(tables.chatThread.id, currentThreadId),
    ),
  });

  if (projectThreads.length === 0) {
    return { searches: [], totalCount: 0 };
  }

  const threadIds = projectThreads.map(t => t.id);
  const threadTitleMap = new Map(projectThreads.map(t => [t.id, t.title]));

  // Get completed pre-searches from project threads
  const preSearches = await db.query.chatPreSearch.findMany({
    columns: {
      roundNumber: true,
      searchData: true,
      threadId: true,
      userQuery: true,
    },
    limit: maxSearchResults,
    orderBy: [desc(tables.chatPreSearch.createdAt)],
    where: and(
      inArray(tables.chatPreSearch.threadId, threadIds),
      eq(tables.chatPreSearch.status, PreSearchStatuses.COMPLETE),
    ),
  });

  const searches = preSearches.map((search) => {
    const parseResult = PreSearchDataPayloadSchema.safeParse(search.searchData);
    const searchData = parseResult.success ? parseResult.data : null;

    return {
      results: searchData?.results?.slice(0, 3).map(r => ({
        answer: r.answer,
        query: r.query,
      })) || [],
      roundNumber: search.roundNumber,
      summary: searchData?.summary || null,
      threadId: search.threadId,
      threadTitle: threadTitleMap.get(search.threadId) || 'Unknown',
      userQuery: search.userQuery,
    };
  });

  return {
    searches,
    totalCount: preSearches.length,
  };
}

// ============================================================================
// Moderator Context
// ============================================================================

/**
 * Fetch moderators from other threads in the project
 */
export async function getProjectModeratorContext(
  params: Pick<ProjectContextParams, 'projectId' | 'currentThreadId' | 'maxModerators' | 'db'>,
): Promise<ProjectModeratorContext> {
  const { currentThreadId, db, maxModerators = 3, projectId } = params;

  // Get other threads in this project
  const projectThreads = await db.query.chatThread.findMany({
    columns: { id: true, title: true },
    where: and(
      eq(tables.chatThread.projectId, projectId),
      ne(tables.chatThread.id, currentThreadId),
    ),
  });

  if (projectThreads.length === 0) {
    return { moderators: [], totalCount: 0 };
  }

  const threadIds = projectThreads.map(t => t.id);
  const threadTitleMap = new Map(projectThreads.map(t => [t.id, t.title]));

  // ✅ TEXT STREAMING: Query chatMessage for moderator messages
  // Moderator messages have role: MessageRoles.ASSISTANT and metadata.isModerator: true
  const allMessages = await db.query.chatMessage.findMany({
    columns: {
      metadata: true,
      parts: true,
      roundNumber: true,
      threadId: true,
    },
    orderBy: [desc(tables.chatMessage.createdAt)],
    where: and(
      inArray(tables.chatMessage.threadId, threadIds),
      eq(tables.chatMessage.role, MessageRoles.ASSISTANT),
    ),
  });

  // Filter for moderator messages and extract text
  const moderatorMessages = allMessages.filter((msg) => {
    const metadata = msg.metadata;
    return metadata && typeof metadata === 'object' && 'isModerator' in metadata && metadata.isModerator === true;
  });

  // Get user questions for each round
  const userMessages = await db.query.chatMessage.findMany({
    columns: {
      parts: true,
      roundNumber: true,
      threadId: true,
    },
    where: and(
      inArray(tables.chatMessage.threadId, threadIds),
      eq(tables.chatMessage.role, MessageRoles.USER),
    ),
  });

  // Map user questions by thread+round
  const userQuestionMap = new Map<string, string>();
  for (const msg of userMessages) {
    const key = `${msg.threadId}_${msg.roundNumber}`;
    const textParts = (msg.parts || []).filter(
      (p): p is { type: 'text'; text: string } => p && typeof p === 'object' && 'type' in p && p.type === MessagePartTypes.TEXT,
    );
    if (textParts.length > 0) {
      userQuestionMap.set(key, textParts.map(p => p.text).join(' '));
    }
  }

  const moderators = moderatorMessages.slice(0, maxModerators).map((msg) => {
    // Extract text from parts
    const textParts = (msg.parts || []).filter(
      (p): p is { type: 'text'; text: string } => p && typeof p === 'object' && 'type' in p && p.type === MessagePartTypes.TEXT,
    );
    const moderatorText = textParts.map(p => p.text).join('\n');

    const userQuestion = userQuestionMap.get(`${msg.threadId}_${msg.roundNumber}`) || '';

    return {
      keyThemes: null,
      moderator: moderatorText,
      recommendations: [],
      roundNumber: msg.roundNumber,
      threadId: msg.threadId,
      threadTitle: threadTitleMap.get(msg.threadId) || 'Unknown',
      userQuestion,
    };
  });

  return {
    moderators,
    totalCount: moderatorMessages.length,
  };
}

// ============================================================================
// Attachment Context
// ============================================================================

// Max text content size for context (50KB per file)
const MAX_ATTACHMENT_TEXT_SIZE = 50 * 1024;

// Text file MIME types that can be decoded directly
const TEXT_MIME_TYPES = new Set([
  'text/plain',
  'text/markdown',
  'text/csv',
  'text/html',
  'text/css',
  'text/javascript',
  'application/json',
  'application/xml',
  'text/xml',
  'text/x-python',
  'text/x-java',
  'text/x-c',
  'text/x-c++',
  'text/x-typescript',
]);

/**
 * Load text content for an attachment
 * - PDFs: use pre-extracted text from metadata
 * - Text files: fetch from R2 and decode
 */
async function loadAttachmentTextContent(
  upload: { r2Key: string; mimeType: string; fileSize: number; metadata: UploadMetadata | null },
  r2Bucket: R2Bucket,
): Promise<string | null> {
  // 1. Check for pre-extracted text (PDFs and processed docs)
  const extractedText = getExtractedText(upload.metadata);
  if (extractedText) {
    return extractedText.length > MAX_ATTACHMENT_TEXT_SIZE
      ? `${extractedText.slice(0, MAX_ATTACHMENT_TEXT_SIZE)}... (truncated)`
      : extractedText;
  }

  // 2. For text files, fetch and decode
  if (TEXT_MIME_TYPES.has(upload.mimeType) && upload.fileSize <= MAX_ATTACHMENT_TEXT_SIZE) {
    try {
      const { data } = await getFile(r2Bucket, upload.r2Key);
      if (data) {
        const text = new TextDecoder().decode(data);
        return text.length > MAX_ATTACHMENT_TEXT_SIZE
          ? `${text.slice(0, MAX_ATTACHMENT_TEXT_SIZE)}... (truncated)`
          : text;
      }
    } catch {
      // Failed to load - return null
    }
  }

  return null;
}

/**
 * Fetch uploads linked to the project
 * Includes both project-level attachments and thread-level uploads
 * Project attachments take priority over thread uploads when deduplicating
 * When r2Bucket is provided, loads file text content for AI consumption
 */
export async function getProjectAttachmentContext(
  params: Pick<ProjectContextParams, 'projectId' | 'db' | 'r2Bucket'> & { maxAttachments?: number },
): Promise<ProjectAttachmentContext> {
  const { db, maxAttachments = 10, projectId, r2Bucket } = params;

  // 1. Get project-level attachments (directly attached to project)
  const projectAttachmentsRaw = await db
    .select()
    .from(tables.projectAttachment)
    .innerJoin(tables.upload, eq(tables.projectAttachment.uploadId, tables.upload.id))
    .where(
      and(
        eq(tables.projectAttachment.projectId, projectId),
        inArray(tables.upload.status, ['uploaded', 'ready']),
      ),
    )
    .orderBy(desc(tables.upload.createdAt))
    .limit(maxAttachments);

  // Track uploadIds from project attachments for deduplication
  const projectUploadIds = new Set(projectAttachmentsRaw.map(row => row.upload.id));

  // 2. Get thread-level uploads
  const projectThreads = await db.query.chatThread.findMany({
    columns: { id: true, title: true },
    where: eq(tables.chatThread.projectId, projectId),
  });

  const threadTitleMap = new Map(projectThreads.map(t => [t.id, t.title]));

  let threadUploadsRaw: {
    thread_upload: { threadId: string; uploadId: string };
    upload: { id: string; filename: string; mimeType: string; fileSize: number; r2Key: string; metadata: UploadMetadata | null };
  }[] = [];

  if (projectThreads.length > 0) {
    const threadIds = projectThreads.map(t => t.id);
    threadUploadsRaw = await db
      .select()
      .from(tables.threadUpload)
      .innerJoin(tables.upload, eq(tables.threadUpload.uploadId, tables.upload.id))
      .where(
        and(
          inArray(tables.threadUpload.threadId, threadIds),
          inArray(tables.upload.status, ['uploaded', 'ready']),
        ),
      )
      .orderBy(desc(tables.upload.createdAt))
      .limit(maxAttachments);
  }

  // 3. Load text content for attachments in parallel when r2Bucket available
  const loadContent = async (
    upload: { id: string; filename: string; mimeType: string; fileSize: number; r2Key: string; metadata: UploadMetadata | null },
    threadId: string | null,
    threadTitle: string | null,
    source: 'project' | 'thread',
  ) => {
    let textContent: string | null = null;
    if (r2Bucket) {
      textContent = await loadAttachmentTextContent(upload, r2Bucket);
    }
    return {
      filename: upload.filename,
      fileSize: upload.fileSize,
      id: upload.id,
      mimeType: upload.mimeType,
      r2Key: upload.r2Key,
      source,
      textContent,
      threadId,
      threadTitle,
    };
  };

  // 4. Process project attachments
  const projectAttachmentPromises = projectAttachmentsRaw.map(async row =>
    await loadContent(row.upload, null, null, 'project'),
  );

  // 5. Process thread uploads (excluding duplicates)
  const filteredThreadUploads = threadUploadsRaw.filter(row => !projectUploadIds.has(row.upload.id));
  const threadAttachmentPromises = filteredThreadUploads.map(async row =>
    await loadContent(
      row.upload,
      row.thread_upload.threadId,
      threadTitleMap.get(row.thread_upload.threadId) || null,
      'thread',
    ),
  );

  // 6. Await all in parallel and merge
  const [projectAttachments, threadAttachments] = await Promise.all([
    Promise.all(projectAttachmentPromises),
    Promise.all(threadAttachmentPromises),
  ]);

  const attachments = [...projectAttachments, ...threadAttachments].slice(0, maxAttachments);

  return {
    attachments,
    totalCount: attachments.length,
  };
}

// ============================================================================
// Aggregated Context
// ============================================================================

/**
 * Aggregate all project context for RAG
 */
export async function getAggregatedProjectContext(
  params: ProjectContextParams,
): Promise<AggregatedProjectContext> {
  const [memories, chats, searches, moderators, attachments] = await Promise.all([
    getProjectMemories(params),
    getProjectChatContext(params),
    getProjectSearchContext(params),
    getProjectModeratorContext(params),
    getProjectAttachmentContext(params),
  ]);

  return {
    attachments,
    chats,
    memories,
    moderators,
    searches,
  };
}

// ============================================================================
// Context Formatting for System Prompt
// ============================================================================

/**
 * Format aggregated project context into a system prompt section
 */
export function formatProjectContextForPrompt(
  context: AggregatedProjectContext,
) {
  const sections: string[] = [];

  // Format memories
  if (context.memories.memories.length > 0) {
    const memoryLines = context.memories.memories.map((m) => {
      const label = m.summary || m.content.slice(0, 100);
      return `- ${label}${m.content.length > 100 ? '...' : ''}`;
    });
    sections.push(`### Project Memories\n${memoryLines.join('\n')}`);
  }

  // Format chat context (key insights from other threads)
  if (context.chats.threads.length > 0) {
    const chatLines = context.chats.threads.map((thread) => {
      const lastMessages = thread.messages.slice(0, 2);
      const excerpt = lastMessages.map(m => `${m.role}: ${m.content.slice(0, 150)}...`).join('\n  ');
      return `- **${thread.title}**:\n  ${excerpt}`;
    });
    sections.push(`### Related Conversations in Project\n${chatLines.join('\n')}`);
  }

  // Format search context
  if (context.searches.searches.length > 0) {
    const searchLines = context.searches.searches.map((s) => {
      const answers = s.results.filter(r => r.answer).map(r => r.answer).slice(0, 1);
      return `- "${s.userQuery}": ${answers[0] || s.summary || 'No summary'}`;
    });
    sections.push(`### Previous Research in Project\n${searchLines.join('\n')}`);
  }

  // Format moderator context
  if (context.moderators.moderators.length > 0) {
    const moderatorLines = context.moderators.moderators.map((m) => {
      const recs = m.recommendations.slice(0, 2).join(', ');
      return `- **${m.userQuestion}**: ${m.moderator.slice(0, 150)}${recs ? ` (Recommendations: ${recs})` : ''}`;
    });
    sections.push(`### Key Insights from Project Moderators\n${moderatorLines.join('\n')}`);
  }

  if (sections.length === 0) {
    return '';
  }

  return `\n\n## Project Context\n\nThe following context is from other conversations, research, and moderator analyses within this project. Use this information to provide more informed and coherent responses.\n\n${sections.join('\n\n')}`;
}

// ============================================================================
// Project RAG Context for Moderator/Pre-search
// ============================================================================

/**
 * RAG search result item from Cloudflare AutoRAG
 */
type RagSearchResultItem = {
  file_id: string;
  filename: string;
  score: number;
  content: { type: string; text: string }[];
};

/**
 * Project RAG context result
 */
export type ProjectRagContextResult = {
  instructions: string | null;
  ragContext: string;
  citableSources: CitableSource[];
  citationSourceMap: CitationSourceMap;
};

/**
 * Get project RAG context for moderator/pre-search
 *
 * Centralized helper that:
 * - Fetches project with customInstructions, autoragInstanceId, r2FolderPrefix
 * - Fetches active project memories (including instruction memory)
 * - Queries AutoRAG with folder filtering for multitenancy
 * - Returns formatted context with citation support
 *
 * Used by:
 * - moderator.handler.ts - Council moderator synthesis
 * - pre-search.handler.ts - Web search query generation
 *
 * @param params - Project ID, query, AI binding, database, optional max results
 * @returns Project instructions, RAG context, memories, and citation mappings
 */
export async function getProjectRagContext(
  params: ProjectRagContextParams,
): Promise<ProjectRagContextResult> {
  const { ai, db, maxResults = 5, projectId, query, userId } = params;

  const emptyResult: ProjectRagContextResult = {
    citableSources: [],
    citationSourceMap: new Map(),
    instructions: null,
    ragContext: '',
  };

  // Fetch project with RAG config
  const project = await db.query.chatProject.findFirst({
    columns: {
      autoragInstanceId: true,
      customInstructions: true,
      id: true,
      r2FolderPrefix: true,
    },
    where: eq(tables.chatProject.id, projectId),
  });

  if (!project) {
    return emptyResult;
  }

  const citableSources: CitableSource[] = [];
  const citationSourceMap: CitationSourceMap = new Map();
  let ragContext = '';

  // Include custom instructions if present
  const instructions = project.customInstructions || null;

  // Fetch active project memories (including instruction memory)
  const memories = await db.query.projectMemory.findMany({
    columns: {
      content: true,
      id: true,
      importance: true,
      source: true,
      summary: true,
    },
    limit: 10,
    orderBy: [desc(tables.projectMemory.importance), desc(tables.projectMemory.createdAt)],
    where: and(
      eq(tables.projectMemory.projectId, projectId),
      eq(tables.projectMemory.isActive, true),
    ),
  });

  // Add memories as citable sources
  for (const memory of memories) {
    const citationId = `${CitationSourcePrefixes[CitationSourceTypes.MEMORY]}_${memory.id.slice(0, 8)}`;
    const memorySource: CitableSource = {
      content: memory.content.slice(0, 300) + (memory.content.length > 300 ? '...' : ''),
      id: citationId,
      metadata: {
        importance: memory.importance,
      },
      sourceId: memory.id,
      title: memory.summary || 'Project Memory',
      type: CitationSourceTypes.MEMORY,
    };
    citableSources.push(memorySource);
    citationSourceMap.set(citationId, memorySource);
  }

  // Query AutoRAG if configured
  if (project.autoragInstanceId && ai) {
    const ragStartTime = performance.now();
    const ragTraceId = generateTraceId();

    try {
      const ragResponse = await ai.autorag(project.autoragInstanceId).aiSearch({
        filters: {
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
          type: 'and',
        },
        max_num_results: maxResults,
        query,
        ranking_options: {
          score_threshold: 0.3,
        },
        reranking: {
          enabled: true,
          model: '@cf/baai/bge-reranker-base',
        },
        rewrite_query: true,
        stream: false,
      });

      // Track RAG query span for PostHog analytics
      const ragLatencyMs = performance.now() - ragStartTime;
      const resultsCount = ragResponse.data?.length || 0;

      // AutoRAG cost estimation:
      // - AI Search is free during beta (CLOUDFLARE_AI_SEARCH_COST_PER_QUERY = 0)
      // - Underlying Vectorize: ~768 dimensions per query for bge-base-en embeddings
      // - Underlying Workers AI: reranking uses neurons
      // Note: These are estimates since AutoRAG doesn't expose internal metrics
      const estimatedDimensionsQueried = 768 * maxResults; // bge-base-en-v1.5 uses 768 dims
      const estimatedVectorizeCost = (estimatedDimensionsQueried / 1_000_000) * CLOUDFLARE_VECTORIZE_COST_PER_MILLION_DIMENSIONS;
      const estimatedRerankingNeurons = resultsCount * 100; // rough estimate per result
      const estimatedWorkersAiCost = (estimatedRerankingNeurons / 1000) * CLOUDFLARE_WORKERS_AI_COST_PER_1K_NEURONS;
      const actualCostUsd = CLOUDFLARE_AI_SEARCH_COST_PER_QUERY + estimatedVectorizeCost + estimatedWorkersAiCost;

      trackSpan(
        { userId: userId || 'anonymous' },
        {
          inputState: { maxResults, projectId, query },
          outputState: { resultsCount },
          spanName: 'rag_query',
          traceId: ragTraceId,
        },
        ragLatencyMs,
        {
          additionalProperties: {
            actual_cost_usd: actualCostUsd,
            autorag_instance_id: project.autoragInstanceId,
            estimated_dimensions_queried: estimatedDimensionsQueried,
            estimated_reranking_neurons: estimatedRerankingNeurons,
            operation_type: 'rag_query',
            projectId,
            provider: 'cloudflare',
            vectorize_cost_usd: estimatedVectorizeCost,
            workers_ai_cost_usd: estimatedWorkersAiCost,
          },
        },
      ).catch(() => {}); // Fire and forget

      if (ragResponse.data && ragResponse.data.length > 0) {
        const sourceFiles = ragResponse.data
          .map((result: RagSearchResultItem) => {
            const contentText = result.content
              .filter(c => c.type === 'text')
              .map(c => c.text)
              .join('\n');
            const score = (result.score * 100).toFixed(1);
            const citationId = `${CitationSourcePrefixes[CitationSourceTypes.RAG]}_${result.file_id.slice(0, 8)}`;

            const ragSource: CitableSource = {
              content: contentText.slice(0, 500) + (contentText.length > 500 ? '...' : ''),
              id: citationId,
              metadata: {
                filename: result.filename,
              },
              sourceId: result.file_id,
              title: result.filename,
              type: CitationSourceTypes.RAG,
            };
            citableSources.push(ragSource);
            citationSourceMap.set(citationId, ragSource);

            return `[${citationId}] **${result.filename}** (${score}% match):\n${contentText}`;
          })
          .join('\n\n---\n\n');

        ragContext = ragResponse.response
          ? `### AI Analysis\n${ragResponse.response}\n\n### Source Files\n${sourceFiles}`
          : `### Relevant Files\n${sourceFiles}`;

        // Deduct credits for successful RAG query
        if (userId) {
          try {
            await deductCreditsForAction(userId, 'ragQuery', {
              description: `RAG query: ${ragResponse.data.length} results`,
            });
          } catch {
            // Non-critical - don't fail RAG if billing fails
          }
        }
      } else if (ragResponse.response) {
        ragContext = ragResponse.response;
      }
    } catch {
      // AutoRAG retrieval failed - continue without RAG context
    }
  }

  // Format memories section if present (prepend to ragContext)
  if (memories.length > 0) {
    const memoryLines = memories.map((m) => {
      const citationId = `${CitationSourcePrefixes[CitationSourceTypes.MEMORY]}_${m.id.slice(0, 8)}`;
      const label = m.summary || 'Memory';
      return `[${citationId}] **${label}**: ${m.content}`;
    });
    const memorySection = `### Project Memories\nThese are key facts and instructions from this project. Cite them using [mem_xxx] when referencing.\n\n${memoryLines.join('\n\n')}`;

    ragContext = ragContext
      ? `${memorySection}\n\n${ragContext}`
      : memorySection;
  }

  return {
    citableSources,
    citationSourceMap,
    instructions,
    ragContext,
  };
}
