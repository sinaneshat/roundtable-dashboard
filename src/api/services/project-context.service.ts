/**
 * Project Context Service
 *
 * Following backend-patterns.md: Service layer for business logic
 *
 * This service handles:
 * - Aggregating project memories for RAG context
 * - Fetching relevant messages from other threads in the project
 * - Fetching pre-search results from project threads
 * - Fetching moderator analyses from project threads
 * - Building comprehensive project context for AI participants
 *
 * OpenAI ChatGPT Projects Pattern:
 * - Cross-chat memory: Conversations reference info from other chats in same project
 * - File auto-referencing: Files are automatically referenced when relevant
 * - Search history: Previous searches inform current conversations
 * - Analysis context: Past moderator analyses provide insights
 */

import { and, desc, eq, inArray, ne } from 'drizzle-orm';

import { ModeratorAnalysisPayloadSchema, PreSearchDataPayloadSchema } from '@/api/routes/chat/schema';
import type { getDbAsync } from '@/db';
import * as tables from '@/db/schema';
import { extractTextFromParts } from '@/lib/schemas/message-schemas';

// ============================================================================
// Type Definitions
// ============================================================================

export type ProjectContextParams = {
  projectId: string;
  currentThreadId: string; // Exclude current thread from context
  userQuery: string;
  maxMemories?: number;
  maxMessagesPerThread?: number;
  maxSearchResults?: number;
  maxAnalyses?: number;
  db: Awaited<ReturnType<typeof getDbAsync>>;
};

export type ProjectMemoryContext = {
  memories: Array<{
    id: string;
    content: string;
    summary: string | null;
    source: string;
    importance: number;
    sourceThreadId: string | null;
  }>;
  totalCount: number;
};

export type ProjectChatContext = {
  threads: Array<{
    id: string;
    title: string;
    messages: Array<{
      role: string;
      content: string;
      roundNumber: number;
    }>;
  }>;
  totalThreads: number;
};

export type ProjectSearchContext = {
  searches: Array<{
    threadId: string;
    threadTitle: string;
    roundNumber: number;
    userQuery: string;
    analysis: string | null;
    results: Array<{
      query: string;
      answer: string | null;
    }>;
  }>;
  totalCount: number;
};

export type ProjectAnalysisContext = {
  analyses: Array<{
    threadId: string;
    threadTitle: string;
    roundNumber: number;
    userQuestion: string;
    summary: string;
    recommendations: string[];
    keyThemes: string | null;
  }>;
  totalCount: number;
};

export type ProjectAttachmentContext = {
  attachments: Array<{
    id: string;
    filename: string;
    mimeType: string;
    fileSize: number;
    r2Key: string;
    threadId: string | null;
    threadTitle: string | null;
  }>;
  totalCount: number;
};

export type AggregatedProjectContext = {
  memories: ProjectMemoryContext;
  chats: ProjectChatContext;
  searches: ProjectSearchContext;
  analyses: ProjectAnalysisContext;
  attachments: ProjectAttachmentContext;
};

// ============================================================================
// Memory Context
// ============================================================================

/**
 * Fetch active project memories ordered by importance
 */
export async function getProjectMemories(
  params: Pick<ProjectContextParams, 'projectId' | 'maxMemories' | 'db'>,
): Promise<ProjectMemoryContext> {
  const { projectId, maxMemories = 10, db } = params;

  const memories = await db.query.projectMemory.findMany({
    where: and(
      eq(tables.projectMemory.projectId, projectId),
      eq(tables.projectMemory.isActive, true),
    ),
    orderBy: [desc(tables.projectMemory.importance), desc(tables.projectMemory.createdAt)],
    limit: maxMemories,
    columns: {
      id: true,
      content: true,
      summary: true,
      source: true,
      importance: true,
      sourceThreadId: true,
    },
  });

  // Get total count for pagination info
  const allMemories = await db.query.projectMemory.findMany({
    where: and(
      eq(tables.projectMemory.projectId, projectId),
      eq(tables.projectMemory.isActive, true),
    ),
    columns: { id: true },
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
  const { projectId, currentThreadId, maxMessagesPerThread = 5, db } = params;

  // Get other threads in this project (excluding current)
  const projectThreads = await db.query.chatThread.findMany({
    where: and(
      eq(tables.chatThread.projectId, projectId),
      ne(tables.chatThread.id, currentThreadId),
    ),
    orderBy: [desc(tables.chatThread.lastMessageAt)],
    limit: 5, // Only get 5 most recently active threads
    columns: {
      id: true,
      title: true,
    },
  });

  if (projectThreads.length === 0) {
    return { threads: [], totalThreads: 0 };
  }

  // Get recent messages from each thread
  const threadsWithMessages = await Promise.all(
    projectThreads.map(async (thread) => {
      const messages = await db.query.chatMessage.findMany({
        where: eq(tables.chatMessage.threadId, thread.id),
        orderBy: [desc(tables.chatMessage.roundNumber), desc(tables.chatMessage.createdAt)],
        limit: maxMessagesPerThread,
        columns: {
          role: true,
          parts: true,
          roundNumber: true,
        },
      });

      return {
        id: thread.id,
        title: thread.title,
        messages: messages.map(msg => ({
          role: msg.role,
          content: extractTextFromParts(msg.parts),
          roundNumber: msg.roundNumber,
        })).filter(msg => msg.content.trim().length > 0),
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
  const { projectId, currentThreadId, maxSearchResults = 5, db } = params;

  // Get other threads in this project
  const projectThreads = await db.query.chatThread.findMany({
    where: and(
      eq(tables.chatThread.projectId, projectId),
      ne(tables.chatThread.id, currentThreadId),
    ),
    columns: { id: true, title: true },
  });

  if (projectThreads.length === 0) {
    return { searches: [], totalCount: 0 };
  }

  const threadIds = projectThreads.map(t => t.id);
  const threadTitleMap = new Map(projectThreads.map(t => [t.id, t.title]));

  // Get completed pre-searches from project threads
  const preSearches = await db.query.chatPreSearch.findMany({
    where: and(
      inArray(tables.chatPreSearch.threadId, threadIds),
      eq(tables.chatPreSearch.status, 'complete'),
    ),
    orderBy: [desc(tables.chatPreSearch.createdAt)],
    limit: maxSearchResults,
    columns: {
      threadId: true,
      roundNumber: true,
      userQuery: true,
      searchData: true,
    },
  });

  const searches = preSearches.map((search) => {
    // ✅ TYPE-SAFE: Use Zod validation instead of force cast
    const parseResult = PreSearchDataPayloadSchema.safeParse(search.searchData);
    const searchData = parseResult.success ? parseResult.data : null;

    return {
      threadId: search.threadId,
      threadTitle: threadTitleMap.get(search.threadId) || 'Unknown',
      roundNumber: search.roundNumber,
      userQuery: search.userQuery,
      analysis: searchData?.analysis || null,
      results: searchData?.results?.slice(0, 3).map(r => ({
        query: r.query,
        answer: r.answer,
      })) || [],
    };
  });

  return {
    searches,
    totalCount: preSearches.length,
  };
}

// ============================================================================
// Analysis Context
// ============================================================================

/**
 * Fetch moderator analyses from other threads in the project
 */
export async function getProjectAnalysisContext(
  params: Pick<ProjectContextParams, 'projectId' | 'currentThreadId' | 'maxAnalyses' | 'db'>,
): Promise<ProjectAnalysisContext> {
  const { projectId, currentThreadId, maxAnalyses = 3, db } = params;

  // Get other threads in this project
  const projectThreads = await db.query.chatThread.findMany({
    where: and(
      eq(tables.chatThread.projectId, projectId),
      ne(tables.chatThread.id, currentThreadId),
    ),
    columns: { id: true, title: true },
  });

  if (projectThreads.length === 0) {
    return { analyses: [], totalCount: 0 };
  }

  const threadIds = projectThreads.map(t => t.id);
  const threadTitleMap = new Map(projectThreads.map(t => [t.id, t.title]));

  // Get completed analyses from project threads
  const moderatorAnalyses = await db.query.chatModeratorAnalysis.findMany({
    where: and(
      inArray(tables.chatModeratorAnalysis.threadId, threadIds),
      eq(tables.chatModeratorAnalysis.status, 'complete'),
    ),
    orderBy: [desc(tables.chatModeratorAnalysis.createdAt)],
    limit: maxAnalyses,
    columns: {
      threadId: true,
      roundNumber: true,
      userQuestion: true,
      analysisData: true,
    },
  });

  const analyses = moderatorAnalyses.map((analysis) => {
    // ✅ TYPE-SAFE: Use Zod validation instead of force cast
    // Use partial schema since analysisData may not have all required fields
    const parseResult = ModeratorAnalysisPayloadSchema.partial().safeParse(analysis.analysisData);
    const data = parseResult.success ? parseResult.data : null;

    return {
      threadId: analysis.threadId,
      threadTitle: threadTitleMap.get(analysis.threadId) || 'Unknown',
      roundNumber: analysis.roundNumber,
      userQuestion: analysis.userQuestion,
      summary: data?.summary || '',
      recommendations: data?.recommendations?.map(r => r.title) || [],
      keyThemes: data?.roundSummary?.keyThemes || null,
    };
  });

  return {
    analyses,
    totalCount: moderatorAnalyses.length,
  };
}

// ============================================================================
// Attachment Context
// ============================================================================

/**
 * Fetch uploads linked to threads in the project
 * Includes both current thread and other threads for cross-reference
 */
export async function getProjectAttachmentContext(
  params: Pick<ProjectContextParams, 'projectId' | 'db'> & { maxAttachments?: number },
): Promise<ProjectAttachmentContext> {
  const { projectId, maxAttachments = 10, db } = params;

  // Get all threads in this project (including current for attachment citations)
  const projectThreads = await db.query.chatThread.findMany({
    where: eq(tables.chatThread.projectId, projectId),
    columns: { id: true, title: true },
  });

  if (projectThreads.length === 0) {
    return { attachments: [], totalCount: 0 };
  }

  const threadIds = projectThreads.map(t => t.id);
  const threadTitleMap = new Map(projectThreads.map(t => [t.id, t.title]));

  // Get uploads linked to these threads via threadUpload junction
  // innerJoin returns nested objects: { thread_upload: {...}, upload: {...} }
  const threadUploadsRaw = await db
    .select()
    .from(tables.threadUpload)
    .innerJoin(tables.upload, eq(tables.threadUpload.uploadId, tables.upload.id))
    .where(
      and(
        inArray(tables.threadUpload.threadId, threadIds),
        eq(tables.upload.status, 'uploaded'),
      ),
    )
    .orderBy(desc(tables.upload.createdAt))
    .limit(maxAttachments);

  // Map nested result to flat structure
  const attachments = threadUploadsRaw.map(row => ({
    id: row.upload.id,
    filename: row.upload.filename,
    mimeType: row.upload.mimeType,
    fileSize: row.upload.fileSize,
    r2Key: row.upload.r2Key,
    threadId: row.thread_upload.threadId,
    threadTitle: threadTitleMap.get(row.thread_upload.threadId) || null,
  }));

  return {
    attachments,
    totalCount: threadUploadsRaw.length,
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
  const [memories, chats, searches, analyses, attachments] = await Promise.all([
    getProjectMemories(params),
    getProjectChatContext(params),
    getProjectSearchContext(params),
    getProjectAnalysisContext(params),
    getProjectAttachmentContext(params),
  ]);

  return {
    memories,
    chats,
    searches,
    analyses,
    attachments,
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
): string {
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
      return `- "${s.userQuery}": ${answers[0] || s.analysis || 'No summary'}`;
    });
    sections.push(`### Previous Research in Project\n${searchLines.join('\n')}`);
  }

  // Format analysis context
  if (context.analyses.analyses.length > 0) {
    const analysisLines = context.analyses.analyses.map((a) => {
      const recs = a.recommendations.slice(0, 2).join(', ');
      return `- **${a.userQuestion}**: ${a.summary.slice(0, 150)}${recs ? ` (Recommendations: ${recs})` : ''}`;
    });
    sections.push(`### Key Insights from Project Analyses\n${analysisLines.join('\n')}`);
  }

  if (sections.length === 0) {
    return '';
  }

  return `\n\n## Project Context\n\nThe following context is from other conversations, research, and analyses within this project. Use this information to provide more informed and coherent responses.\n\n${sections.join('\n\n')}`;
}
