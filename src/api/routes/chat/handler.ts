import type { RouteHandler } from '@hono/zod-openapi';
import { and, eq } from 'drizzle-orm';
import { ulid } from 'ulid';

import { createError } from '@/api/common/error-handling';
import {
  applyCursorPagination,
  buildCursorWhereWithFilters,
  createTimestampCursor,
  getCursorOrderBy,
} from '@/api/common/pagination';
import { buildUIMessages } from '@/api/common/streaming';
import type { ErrorContext } from '@/api/core';
import { createHandler, Responses } from '@/api/core';
import { CursorPaginationQuerySchema } from '@/api/core/schemas';
import { apiLogger } from '@/api/middleware/hono-logger';
import { openRouterService } from '@/api/services/openrouter.service';
import { generateUniqueSlug } from '@/api/services/slug-generator.service';
import { autoGenerateThreadTitle } from '@/api/services/title-generator.service';
import {
  enforceCustomRoleQuota,
  enforceMemoryQuota,
  enforceMessageQuota,
  enforceThreadQuota,
  incrementCustomRoleUsage,
  incrementMemoryUsage,
  incrementMessageUsage,
  incrementThreadUsage,
} from '@/api/services/usage-tracking.service';
import type { ApiEnv } from '@/api/types';
import { getDbAsync } from '@/db';
import * as tables from '@/db/schema';

import type {
  addParticipantRoute,
  createCustomRoleRoute,
  createMemoryRoute,
  createThreadRoute,
  deleteCustomRoleRoute,
  deleteMemoryRoute,
  deleteParticipantRoute,
  deleteThreadRoute,
  getCustomRoleRoute,
  getMemoryRoute,
  getPublicThreadRoute,
  getThreadBySlugRoute,
  getThreadRoute,
  listCustomRolesRoute,
  listMemoriesRoute,
  listThreadsRoute,
  sendMessageRoute,
  streamChatRoute,
  updateCustomRoleRoute,
  updateMemoryRoute,
  updateParticipantRoute,
  updateThreadRoute,
} from './route';
import {
  AddParticipantRequestSchema,
  CreateCustomRoleRequestSchema,
  CreateMemoryRequestSchema,
  CreateThreadRequestSchema,
  CustomRoleIdParamSchema,
  MemoryIdParamSchema,
  ParticipantIdParamSchema,
  SendMessageRequestSchema,
  StreamChatRequestSchema,
  ThreadIdParamSchema,
  ThreadSlugParamSchema,
  UpdateCustomRoleRequestSchema,
  UpdateMemoryRequestSchema,
  UpdateParticipantRequestSchema,
  UpdateThreadRequestSchema,
} from './schema';

// ============================================================================
// Internal Helper Functions (Following 3-file pattern: handler, route, schema)
// ============================================================================

/**
 * Error Context Builders - Following src/api/routes/billing/handler.ts pattern
 */
function createAuthErrorContext(operation?: string): ErrorContext {
  return {
    errorType: 'authentication',
    operation: operation || 'session_required',
  };
}

function createResourceNotFoundContext(
  resource: string,
  resourceId?: string,
): ErrorContext {
  return {
    errorType: 'resource',
    resource,
    resourceId,
  };
}

function createAuthorizationErrorContext(
  resource: string,
  resourceId?: string,
): ErrorContext {
  return {
    errorType: 'authorization',
    resource,
    resourceId,
  };
}

/**
 * Verify thread exists and user owns it
 * Reusable validation pattern used across multiple handlers
 *
 * Overload 1: Without participants
 */
async function verifyThreadOwnership(
  threadId: string,
  userId: string,
  db: Awaited<ReturnType<typeof getDbAsync>>
): Promise<typeof tables.chatThread.$inferSelect>;

/**
 * Overload 2: With participants
 */
async function verifyThreadOwnership(
  threadId: string,
  userId: string,
  db: Awaited<ReturnType<typeof getDbAsync>>,
  options: { includeParticipants: true }
): Promise<typeof tables.chatThread.$inferSelect & {
  participants: Array<typeof tables.chatParticipant.$inferSelect>;
}>;

/**
 * Implementation
 */
async function verifyThreadOwnership(
  threadId: string,
  userId: string,
  db: Awaited<ReturnType<typeof getDbAsync>>,
  options?: { includeParticipants?: boolean },
) {
  const thread = await db.query.chatThread.findFirst({
    where: eq(tables.chatThread.id, threadId),
    with: options?.includeParticipants
      ? {
          participants: {
            where: eq(tables.chatParticipant.isEnabled, true),
            orderBy: [tables.chatParticipant.priority],
          },
        }
      : undefined,
  });

  if (!thread) {
    throw createError.notFound('Thread not found', createResourceNotFoundContext('thread', threadId));
  }

  if (thread.userId !== userId) {
    throw createError.unauthorized(
      'Not authorized to access this thread',
      createAuthorizationErrorContext('thread', threadId),
    );
  }

  return thread;
}

// Removed verifyMemoryOwnership() and verifyCustomRoleOwnership()
// These resources are ALWAYS user-scoped - just query with userId in WHERE clause

// ============================================================================
// Thread Handlers
// ============================================================================

export const listThreadsHandler: RouteHandler<typeof listThreadsRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    operationName: 'listThreads',
  },
  async (c) => {
    // With auth: 'session', c.auth() provides type-safe access to user and session
    const { user } = c.auth();

    // Parse cursor pagination query parameters
    const query = CursorPaginationQuerySchema.parse(c.req.query());
    const db = await getDbAsync();

    // Fetch threads with cursor-based pagination (limit + 1 to check hasMore)
    const threads = await db.query.chatThread.findMany({
      where: buildCursorWhereWithFilters(
        tables.chatThread.updatedAt,
        query.cursor,
        'desc',
        [eq(tables.chatThread.userId, user.id)],
      ),
      orderBy: getCursorOrderBy(tables.chatThread.updatedAt, 'desc'),
      limit: query.limit + 1,
    });

    // Apply cursor pagination and format response
    return Responses.ok(c, applyCursorPagination(
      threads,
      query.limit,
      thread => createTimestampCursor(thread.updatedAt),
    ));
  },
);

export const createThreadHandler: RouteHandler<typeof createThreadRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateBody: CreateThreadRequestSchema,
    operationName: 'createThread',
  },
  async (c) => {
    const { user } = c.auth();

    // Enforce thread and message quotas BEFORE creating anything
    await enforceThreadQuota(user.id);
    await enforceMessageQuota(user.id); // First message will be created

    const body = c.validated.body;
    const db = await getDbAsync();

    // Default title to "New Chat" (will be auto-generated from first message)
    const title = body.title || 'New Chat';

    // Generate unique slug from title
    const slug = await generateUniqueSlug(title);

    const threadId = ulid();
    const now = new Date();

    // Create thread
    const [thread] = await db
      .insert(tables.chatThread)
      .values({
        id: threadId,
        userId: user.id,
        title,
        slug,
        mode: body.mode || 'brainstorming',
        status: 'active',
        isFavorite: false,
        isPublic: false,
        metadata: body.metadata,
        createdAt: now,
        updatedAt: now,
        lastMessageAt: now,
      })
      .returning();

    // Create participants with priority based on array order (immutable)
    // Load custom roles if specified
    const participants = await Promise.all(
      body.participants.map(async (p, index) => {
        let systemPrompt = p.systemPrompt; // Request systemPrompt takes precedence

        // If customRoleId is provided and no systemPrompt override, load custom role
        if (p.customRoleId && !systemPrompt) {
          const customRole = await db.query.chatCustomRole.findFirst({
            where: eq(tables.chatCustomRole.id, p.customRoleId),
          });

          if (customRole) {
            // Verify ownership
            if (customRole.userId !== user.id) {
              throw createError.unauthorized(
                'Not authorized to use this custom role',
                createAuthorizationErrorContext('custom_role', p.customRoleId),
              );
            }
            systemPrompt = customRole.systemPrompt;
          }
        }

        const participantId = ulid();
        const [participant] = await db
          .insert(tables.chatParticipant)
          .values({
            id: participantId,
            threadId,
            modelId: p.modelId,
            customRoleId: p.customRoleId,
            role: p.role,
            priority: index, // Array order determines priority
            isEnabled: true,
            settings: {
              systemPrompt,
              temperature: p.temperature,
              maxTokens: p.maxTokens,
            },
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        return participant;
      }),
    );

    // Create first user message
    const userMessageId = ulid();
    const [userMessage] = await db
      .insert(tables.chatMessage)
      .values({
        id: userMessageId,
        threadId,
        participantId: null,
        role: 'user',
        content: body.firstMessage,
        createdAt: now,
      })
      .returning();

    // Auto-generate thread title from first message in background
    autoGenerateThreadTitle(threadId, body.firstMessage, c.env).catch((error) => {
      apiLogger.error('Failed to auto-generate thread title', {
        threadId,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    // Build conversation context for AI responses using UIMessage format
    const conversationMessages = buildUIMessages([
      {
        id: `msg-${ulid()}`,
        role: 'user' as const,
        content: body.firstMessage,
      },
    ]);

    // Orchestrate multi-model responses using initialized OpenRouter service
    const orchestrationResults = await openRouterService.orchestrateMultiModel(
      participants.map(p => ({
        participantId: p!.id,
        modelId: p!.modelId,
        role: p!.role,
        priority: p!.priority,
        systemPrompt: p!.settings?.systemPrompt,
        temperature: p!.settings?.temperature,
        maxTokens: p!.settings?.maxTokens,
      })),
      conversationMessages,
      thread!.mode,
    );

    // Save assistant messages
    const assistantMessages = await Promise.all(
      orchestrationResults.map(async (result) => {
        const messageId = ulid();
        const [message] = await db
          .insert(tables.chatMessage)
          .values({
            id: messageId,
            threadId,
            participantId: result.participantId,
            role: 'assistant',
            content: result.text,
            metadata: {
              model: result.modelId,
              finishReason: result.finishReason,
              usage: result.usage,
            },
            createdAt: now,
          })
          .returning();
        return message;
      }),
    );

    // Increment usage counters AFTER successful creation
    await incrementThreadUsage(user.id);
    const totalMessagesCreated = 1 + assistantMessages.length;
    await incrementMessageUsage(user.id, totalMessagesCreated);

    // Attach memories to thread via junction table if provided
    if (body.memoryIds && body.memoryIds.length > 0) {
      // Verify all memories exist and belong to user
      const memories = await db.query.chatMemory.findMany({
        where: (fields, { inArray }) => inArray(fields.id, body.memoryIds!),
      });

      // Check if all memories exist
      if (memories.length !== body.memoryIds.length) {
        const foundIds = memories.map(m => m.id);
        const missingIds = body.memoryIds.filter(id => !foundIds.includes(id));
        throw createError.notFound(
          `Memories not found: ${missingIds.join(', ')}`,
          createResourceNotFoundContext('memory', missingIds[0]),
        );
      }

      // Check if all memories belong to the user
      const unauthorizedMemory = memories.find(m => m.userId !== user.id);
      if (unauthorizedMemory) {
        throw createError.unauthorized(
          'Not authorized to use this memory',
          createAuthorizationErrorContext('memory', unauthorizedMemory.id),
        );
      }

      // Create junction table entries
      await Promise.all(
        body.memoryIds.map(memoryId =>
          db.insert(tables.chatThreadMemory).values({
            id: ulid(),
            threadId,
            memoryId,
            attachedAt: now,
          }),
        ),
      );
    }

    // Return thread with participants and messages
    return Responses.ok(c, {
      thread,
      participants,
      messages: [userMessage, ...assistantMessages],
    });
  },
);

export const getThreadHandler: RouteHandler<typeof getThreadRoute, ApiEnv> = createHandler(
  {
    auth: 'session-optional', // Allow both authenticated and unauthenticated access
    validateParams: ThreadIdParamSchema,
    operationName: 'getThread',
  },
  async (c) => {
    const user = c.var.user; // May be undefined for unauthenticated requests
    const { id } = c.validated.params;
    const db = await getDbAsync();

    const thread = await db.query.chatThread.findFirst({
      where: eq(tables.chatThread.id, id),
    });

    if (!thread) {
      throw createError.notFound('Thread not found', createResourceNotFoundContext('thread', id));
    }

    // Smart access control: Public threads are accessible to anyone, private threads require ownership
    if (!thread.isPublic) {
      // Private thread - requires authentication and ownership
      if (!user) {
        throw createError.unauthenticated(
          'Authentication required to access private thread',
          createAuthErrorContext(),
        );
      }

      if (thread.userId !== user.id) {
        throw createError.unauthorized(
          'Not authorized to access this thread',
          createAuthorizationErrorContext('thread', id),
        );
      }
    }

    // Fetch participants (ordered by priority)
    const participants = await db.query.chatParticipant.findMany({
      where: eq(tables.chatParticipant.threadId, id),
      orderBy: [tables.chatParticipant.priority],
    });

    // Fetch messages (ordered by creation time)
    const messages = await db.query.chatMessage.findMany({
      where: eq(tables.chatMessage.threadId, id),
      orderBy: [tables.chatMessage.createdAt],
    });

    // Fetch attached memories via junction table
    const threadMemories = await db.query.chatThreadMemory.findMany({
      where: eq(tables.chatThreadMemory.threadId, id),
      with: {
        memory: true, // Include the full memory object
      },
    });

    // Extract just the memory objects from the junction records
    const memories = threadMemories.map(tm => tm.memory);

    // Return everything in one response (ChatGPT pattern)
    return Responses.ok(c, {
      thread,
      participants,
      messages,
      memories,
    });
  },
);

export const updateThreadHandler: RouteHandler<typeof updateThreadRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateParams: ThreadIdParamSchema,
    validateBody: UpdateThreadRequestSchema,
    operationName: 'updateThread',
  },
  async (c) => {
    const { user } = c.auth();
    const { id } = c.validated.params;
    const body = c.validated.body;
    const db = await getDbAsync();

    // Verify thread ownership
    await verifyThreadOwnership(id, user.id, db);

    const [updatedThread] = await db
      .update(tables.chatThread)
      .set({
        ...body,
        updatedAt: new Date(),
      })
      .where(eq(tables.chatThread.id, id))
      .returning();

    return Responses.ok(c, {
      thread: updatedThread,
    });
  },
);

export const deleteThreadHandler: RouteHandler<typeof deleteThreadRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateParams: ThreadIdParamSchema,
    operationName: 'deleteThread',
  },
  async (c) => {
    const { user } = c.auth();
    const { id } = c.validated.params;
    const db = await getDbAsync();

    // Verify thread ownership
    await verifyThreadOwnership(id, user.id, db);

    // Soft delete - set status to deleted
    await db
      .update(tables.chatThread)
      .set({
        status: 'deleted',
        updatedAt: new Date(),
      })
      .where(eq(tables.chatThread.id, id));

    return Responses.ok(c, {
      deleted: true,
    });
  },
);

export const getPublicThreadHandler: RouteHandler<typeof getPublicThreadRoute, ApiEnv> = createHandler(
  {
    auth: 'public', // No authentication required for public threads
    validateParams: ThreadSlugParamSchema,
    operationName: 'getPublicThread',
  },
  async (c) => {
    const { slug } = c.validated.params;
    const db = await getDbAsync();

    const thread = await db.query.chatThread.findFirst({
      where: eq(tables.chatThread.slug, slug),
    });

    if (!thread || !thread.isPublic) {
      throw createError.notFound(
        'Public thread not found',
        createResourceNotFoundContext('public_thread', slug),
      );
    }

    return Responses.ok(c, {
      thread,
    });
  },
);

export const getThreadBySlugHandler: RouteHandler<typeof getThreadBySlugRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateParams: ThreadSlugParamSchema,
    operationName: 'getThreadBySlug',
  },
  async (c) => {
    const { user } = c.auth();
    const { slug } = c.validated.params;
    const db = await getDbAsync();

    const thread = await db.query.chatThread.findFirst({
      where: eq(tables.chatThread.slug, slug),
    });

    if (!thread) {
      throw createError.notFound('Thread not found', createResourceNotFoundContext('thread', slug));
    }

    // Ownership check - user can only access their own threads
    if (thread.userId !== user.id) {
      throw createError.unauthorized(
        'Not authorized to access this thread',
        createAuthorizationErrorContext('thread', slug),
      );
    }

    // Fetch participants (ordered by priority)
    const participants = await db.query.chatParticipant.findMany({
      where: eq(tables.chatParticipant.threadId, thread.id),
      orderBy: [tables.chatParticipant.priority],
    });

    // Fetch messages (ordered by creation time)
    const messages = await db.query.chatMessage.findMany({
      where: eq(tables.chatMessage.threadId, thread.id),
      orderBy: [tables.chatMessage.createdAt],
    });

    // Fetch attached memories via junction table
    const threadMemories = await db.query.chatThreadMemory.findMany({
      where: eq(tables.chatThreadMemory.threadId, thread.id),
      with: {
        memory: true, // Include the full memory object
      },
    });

    // Extract just the memory objects from the junction records
    const memories = threadMemories.map(tm => tm.memory);

    // Return everything in one response (same pattern as getThreadHandler)
    return Responses.ok(c, {
      thread,
      participants,
      messages,
      memories,
    });
  },
);

// ============================================================================
// Participant Handlers
// ============================================================================
// Note: listParticipantsHandler removed - use getThreadHandler instead

export const addParticipantHandler: RouteHandler<typeof addParticipantRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateParams: ThreadIdParamSchema,
    validateBody: AddParticipantRequestSchema,
    operationName: 'addParticipant',
  },
  async (c) => {
    const { user } = c.auth();
    const { id } = c.validated.params;
    const body = c.validated.body;
    const db = await getDbAsync();

    // Verify thread ownership
    await verifyThreadOwnership(id, user.id, db);

    const participantId = ulid();
    const now = new Date();

    const [participant] = await db
      .insert(tables.chatParticipant)
      .values({
        id: participantId,
        threadId: id,
        modelId: body.modelId,
        role: body.role,
        priority: body.priority || 0,
        isEnabled: true,
        settings: body.settings,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return Responses.ok(c, {
      participant,
    });
  },
);

export const updateParticipantHandler: RouteHandler<typeof updateParticipantRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateParams: ParticipantIdParamSchema,
    validateBody: UpdateParticipantRequestSchema,
    operationName: 'updateParticipant',
  },
  async (c) => {
    const { user } = c.auth();
    const { id } = c.validated.params;
    const body = c.validated.body;
    const db = await getDbAsync();

    // Get participant and verify thread ownership
    const participant = await db.query.chatParticipant.findFirst({
      where: eq(tables.chatParticipant.id, id),
      with: {
        thread: true,
      },
    });

    if (!participant) {
      throw createError.notFound('Participant not found', createResourceNotFoundContext('participant', id));
    }

    if (participant.thread.userId !== user.id) {
      throw createError.unauthorized('Not authorized to modify this participant', createAuthorizationErrorContext('participant', id));
    }

    const [updatedParticipant] = await db
      .update(tables.chatParticipant)
      .set({
        ...body,
        updatedAt: new Date(),
      })
      .where(eq(tables.chatParticipant.id, id))
      .returning();

    return Responses.ok(c, {
      participant: updatedParticipant,
    });
  },
);

export const deleteParticipantHandler: RouteHandler<typeof deleteParticipantRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateParams: ParticipantIdParamSchema,
    operationName: 'deleteParticipant',
  },
  async (c) => {
    const { user } = c.auth();
    const { id } = c.validated.params;
    const db = await getDbAsync();

    // Get participant and verify thread ownership
    const participant = await db.query.chatParticipant.findFirst({
      where: eq(tables.chatParticipant.id, id),
      with: {
        thread: true,
      },
    });

    if (!participant) {
      throw createError.notFound('Participant not found', createResourceNotFoundContext('participant', id));
    }

    if (participant.thread.userId !== user.id) {
      throw createError.unauthorized('Not authorized to delete this participant', createAuthorizationErrorContext('participant', id));
    }

    await db.delete(tables.chatParticipant).where(eq(tables.chatParticipant.id, id));

    return Responses.ok(c, {
      deleted: true,
    });
  },
);

// ============================================================================
// Message Handlers
// ============================================================================
// Note: listMessagesHandler removed - use getThreadHandler instead
// Note: getMessageHandler removed - no use case for viewing single message

export const sendMessageHandler: RouteHandler<typeof sendMessageRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateParams: ThreadIdParamSchema,
    validateBody: SendMessageRequestSchema,
    operationName: 'sendMessage',
  },
  async (c) => {
    const { user } = c.auth();
    const { id } = c.validated.params;
    const body = c.validated.body;
    const db = await getDbAsync();

    // Verify thread ownership and get thread details with participants
    const thread = await verifyThreadOwnership(id, user.id, db, { includeParticipants: true });

    if (thread.participants.length === 0) {
      throw createError.badRequest('No enabled participants in this thread');
    }

    // Enforce message creation quota BEFORE creating the message
    // This counts as 1 user message + N assistant messages from participants
    await enforceMessageQuota(user.id);

    // Create user message
    const userMessageId = ulid();
    const now = new Date();

    const [userMessage] = await db
      .insert(tables.chatMessage)
      .values({
        id: userMessageId,
        threadId: id,
        participantId: null,
        role: 'user',
        content: body.content,
        parentMessageId: body.parentMessageId,
        createdAt: now,
      })
      .returning();

    // Get previous messages for conversation context
    const previousMessages = await db.query.chatMessage.findMany({
      where: eq(tables.chatMessage.threadId, id),
      orderBy: [tables.chatMessage.createdAt],
      limit: 10, // Last 10 messages for context
    });

    // Auto-generate thread title from first user message (like ChatGPT)
    // Only generate if this is the first message and thread has default title
    const isFirstMessage = previousMessages.length === 1; // Only the message we just created
    if (isFirstMessage && thread.title === 'New Chat') {
      // Generate title in background (don't block response)
      autoGenerateThreadTitle(id, body.content, c.env).catch((error) => {
        // Log error but don't fail the request
        apiLogger.error('Failed to auto-generate thread title', {
          threadId: id,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }

    // Build conversation context using UIMessage format
    const conversationMessages = buildUIMessages([
      ...previousMessages.map(msg => ({
        id: msg.id,
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })),
      {
        id: userMessageId,
        role: 'user' as const,
        content: body.content,
      },
    ]);

    // Orchestrate multi-model responses using initialized OpenRouter service
    const orchestrationResults = await openRouterService.orchestrateMultiModel(
      thread.participants.map((p: typeof thread.participants[number]) => ({
        participantId: p.id,
        modelId: p.modelId,
        role: p.role,
        priority: p.priority,
        systemPrompt: p.settings?.systemPrompt,
        temperature: p.settings?.temperature,
        maxTokens: p.settings?.maxTokens,
      })),
      conversationMessages,
      thread.mode,
    );

    // Save assistant messages to database
    const assistantMessages = await Promise.all(
      orchestrationResults.map(async (result) => {
        const messageId = ulid();
        const [message] = await db
          .insert(tables.chatMessage)
          .values({
            id: messageId,
            threadId: id,
            participantId: result.participantId,
            role: 'assistant',
            content: result.text,
            metadata: {
              model: result.modelId,
              finishReason: result.finishReason,
              usage: result.usage,
            },
            createdAt: now,
          })
          .returning();

        return message;
      }),
    );

    // Increment message usage counter AFTER successful creation
    // Count: 1 user message + number of assistant messages
    const totalMessagesCreated = 1 + assistantMessages.length;
    await incrementMessageUsage(user.id, totalMessagesCreated);

    // Update thread lastMessageAt
    await db
      .update(tables.chatThread)
      .set({
        lastMessageAt: now,
        updatedAt: now,
      })
      .where(eq(tables.chatThread.id, id));

    return Responses.ok(c, {
      userMessage,
      assistantMessages,
    });
  },
);

/**
 * Stream chat handler using AI SDK v5
 * Streams AI responses token-by-token for real-time UX using built-in streaming
 */
export const streamChatHandler: RouteHandler<typeof streamChatRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateParams: ThreadIdParamSchema,
    validateBody: StreamChatRequestSchema,
    operationName: 'streamChat',
  },
  async (c) => {
    const { user } = c.auth();
    const { id } = c.validated.params;
    const body = c.validated.body;
    const db = await getDbAsync();

    // Verify thread ownership and get thread details with participants
    const thread = await verifyThreadOwnership(id, user.id, db, { includeParticipants: true });

    if (thread.participants.length === 0) {
      throw createError.badRequest('No enabled participants in this thread');
    }

    // Enforce message quota
    await enforceMessageQuota(user.id);

    // Get previous messages for context (last 10 messages)
    const previousMessages = await db.query.chatMessage.findMany({
      where: eq(tables.chatMessage.threadId, id),
      orderBy: [tables.chatMessage.createdAt],
      limit: 10,
    });

    // Create user message ID upfront
    const userMessageId = ulid();

    // Save user message to database immediately
    await db.insert(tables.chatMessage).values({
      id: userMessageId,
      threadId: id,
      participantId: null,
      role: 'user',
      content: body.content,
      parentMessageId: body.parentMessageId,
      createdAt: new Date(),
    });

    // Auto-generate thread title if first message
    if (previousMessages.length === 0 && thread.title === 'New Chat') {
      autoGenerateThreadTitle(id, body.content, c.env).catch((error) => {
        apiLogger.error('Failed to auto-generate thread title', {
          threadId: id,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }

    // Build UI messages from database messages + new user message
    const uiMessages = buildUIMessages([
      ...previousMessages.map(msg => ({
        id: msg.id,
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })),
      {
        id: userMessageId,
        role: 'user' as const,
        content: body.content,
      },
    ]);

    // Use first enabled participant for streaming
    const participant = thread.participants[0]!;

    // Stream the response using OpenRouter service singleton (AI SDK v5)
    return openRouterService.streamUIMessages({
      modelId: participant.modelId,
      messages: uiMessages,
      system: participant.settings?.systemPrompt,
      temperature: participant.settings?.temperature || 0.7,
      onFinish: async ({ text }) => {
        // Save assistant message to database
        const assistantMessageId = ulid();
        await db.insert(tables.chatMessage).values({
          id: assistantMessageId,
          threadId: id,
          participantId: participant.id,
          role: 'assistant',
          content: text,
          parentMessageId: null,
          createdAt: new Date(),
        });

        // Increment usage tracking (1 user message already saved + 1 assistant)
        await incrementMessageUsage(user.id, 1); // Only count assistant message (user already counted)
      },
    });
  },
);

// ============================================================================
// Memory Handlers
// ============================================================================

export const listMemoriesHandler: RouteHandler<typeof listMemoriesRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    operationName: 'listMemories',
  },
  async (c) => {
    const { user } = c.auth();

    // Parse cursor pagination query parameters
    const query = CursorPaginationQuerySchema.parse(c.req.query());
    const db = await getDbAsync();

    // Fetch memories with cursor-based pagination (limit + 1 to check hasMore)
    const memories = await db.query.chatMemory.findMany({
      where: buildCursorWhereWithFilters(
        tables.chatMemory.updatedAt,
        query.cursor,
        'desc',
        [eq(tables.chatMemory.userId, user.id)],
      ),
      orderBy: getCursorOrderBy(tables.chatMemory.updatedAt, 'desc'),
      limit: query.limit + 1,
    });

    // Apply cursor pagination and format response
    return Responses.ok(c, applyCursorPagination(
      memories,
      query.limit,
      memory => createTimestampCursor(memory.updatedAt),
    ));
  },
);

export const createMemoryHandler: RouteHandler<typeof createMemoryRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateBody: CreateMemoryRequestSchema,
    operationName: 'createMemory',
  },
  async (c) => {
    const { user } = c.auth();

    // Enforce memory quota BEFORE creating
    await enforceMemoryQuota(user.id);

    const body = c.validated.body;
    const db = await getDbAsync();

    const memoryId = ulid();
    const now = new Date();

    const [memory] = await db
      .insert(tables.chatMemory)
      .values({
        id: memoryId,
        userId: user.id,
        threadId: body.threadId,
        type: body.type || 'topic',
        title: body.title,
        description: body.description,
        content: body.content,
        isGlobal: body.isGlobal || false,
        metadata: body.metadata,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    // Increment memory usage AFTER successful creation
    await incrementMemoryUsage(user.id);

    return Responses.ok(c, {
      memory,
    });
  },
);

export const getMemoryHandler: RouteHandler<typeof getMemoryRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateParams: MemoryIdParamSchema,
    operationName: 'getMemory',
  },
  async (c) => {
    const { user } = c.auth();
    const { id } = c.validated.params;
    const db = await getDbAsync();

    // Query with userId - memories are always user-scoped
    const memory = await db.query.chatMemory.findFirst({
      where: and(
        eq(tables.chatMemory.id, id),
        eq(tables.chatMemory.userId, user.id),
      ),
    });

    if (!memory) {
      throw createError.notFound('Memory not found', createResourceNotFoundContext('memory', id));
    }

    return Responses.ok(c, {
      memory,
    });
  },
);

export const updateMemoryHandler: RouteHandler<typeof updateMemoryRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateParams: MemoryIdParamSchema,
    validateBody: UpdateMemoryRequestSchema,
    operationName: 'updateMemory',
  },
  async (c) => {
    const { user } = c.auth();
    const { id } = c.validated.params;
    const body = c.validated.body;
    const db = await getDbAsync();

    // Update with userId filter - memories are always user-scoped
    const [updatedMemory] = await db
      .update(tables.chatMemory)
      .set({
        ...body,
        updatedAt: new Date(),
      })
      .where(and(
        eq(tables.chatMemory.id, id),
        eq(tables.chatMemory.userId, user.id),
      ))
      .returning();

    if (!updatedMemory) {
      throw createError.notFound('Memory not found', createResourceNotFoundContext('memory', id));
    }

    return Responses.ok(c, {
      memory: updatedMemory,
    });
  },
);

export const deleteMemoryHandler: RouteHandler<typeof deleteMemoryRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateParams: MemoryIdParamSchema,
    operationName: 'deleteMemory',
  },
  async (c) => {
    const { user } = c.auth();
    const { id } = c.validated.params;
    const db = await getDbAsync();

    // Delete with userId filter - memories are always user-scoped
    const result = await db
      .delete(tables.chatMemory)
      .where(and(
        eq(tables.chatMemory.id, id),
        eq(tables.chatMemory.userId, user.id),
      ))
      .returning();

    if (result.length === 0) {
      throw createError.notFound('Memory not found', createResourceNotFoundContext('memory', id));
    }

    return Responses.ok(c, {
      deleted: true,
    });
  },
);

// ============================================================================
// Custom Role Handlers
// ============================================================================

export const listCustomRolesHandler: RouteHandler<typeof listCustomRolesRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    operationName: 'listCustomRoles',
  },
  async (c) => {
    const { user } = c.auth();

    // Parse cursor pagination query parameters
    const query = CursorPaginationQuerySchema.parse(c.req.query());
    const db = await getDbAsync();

    // Fetch custom roles with cursor-based pagination (limit + 1 to check hasMore)
    const customRoles = await db.query.chatCustomRole.findMany({
      where: buildCursorWhereWithFilters(
        tables.chatCustomRole.updatedAt,
        query.cursor,
        'desc',
        [eq(tables.chatCustomRole.userId, user.id)],
      ),
      orderBy: getCursorOrderBy(tables.chatCustomRole.updatedAt, 'desc'),
      limit: query.limit + 1,
    });

    // Apply cursor pagination and format response
    return Responses.ok(c, applyCursorPagination(
      customRoles,
      query.limit,
      customRole => createTimestampCursor(customRole.updatedAt),
    ));
  },
);

export const createCustomRoleHandler: RouteHandler<typeof createCustomRoleRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateBody: CreateCustomRoleRequestSchema,
    operationName: 'createCustomRole',
  },
  async (c) => {
    const { user } = c.auth();

    // Enforce custom role quota BEFORE creating
    await enforceCustomRoleQuota(user.id);

    const body = c.validated.body;
    const db = await getDbAsync();

    const customRoleId = ulid();
    const now = new Date();

    const [customRole] = await db
      .insert(tables.chatCustomRole)
      .values({
        id: customRoleId,
        userId: user.id,
        name: body.name,
        description: body.description,
        systemPrompt: body.systemPrompt,
        metadata: body.metadata,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    // Increment custom role usage AFTER successful creation
    await incrementCustomRoleUsage(user.id);

    return Responses.ok(c, {
      customRole,
    });
  },
);

export const getCustomRoleHandler: RouteHandler<typeof getCustomRoleRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateParams: CustomRoleIdParamSchema,
    operationName: 'getCustomRole',
  },
  async (c) => {
    const { user } = c.auth();
    const { id } = c.validated.params;
    const db = await getDbAsync();

    // Query with userId - custom roles are always user-scoped
    const customRole = await db.query.chatCustomRole.findFirst({
      where: and(
        eq(tables.chatCustomRole.id, id),
        eq(tables.chatCustomRole.userId, user.id),
      ),
    });

    if (!customRole) {
      throw createError.notFound('Custom role not found', createResourceNotFoundContext('custom_role', id));
    }

    return Responses.ok(c, {
      customRole,
    });
  },
);

export const updateCustomRoleHandler: RouteHandler<typeof updateCustomRoleRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateParams: CustomRoleIdParamSchema,
    validateBody: UpdateCustomRoleRequestSchema,
    operationName: 'updateCustomRole',
  },
  async (c) => {
    const { user } = c.auth();
    const { id } = c.validated.params;
    const body = c.validated.body;
    const db = await getDbAsync();

    // Update with userId filter - custom roles are always user-scoped
    const [updatedCustomRole] = await db
      .update(tables.chatCustomRole)
      .set({
        ...body,
        updatedAt: new Date(),
      })
      .where(and(
        eq(tables.chatCustomRole.id, id),
        eq(tables.chatCustomRole.userId, user.id),
      ))
      .returning();

    if (!updatedCustomRole) {
      throw createError.notFound('Custom role not found', createResourceNotFoundContext('custom_role', id));
    }

    return Responses.ok(c, {
      customRole: updatedCustomRole,
    });
  },
);

export const deleteCustomRoleHandler: RouteHandler<typeof deleteCustomRoleRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateParams: CustomRoleIdParamSchema,
    operationName: 'deleteCustomRole',
  },
  async (c) => {
    const { user } = c.auth();
    const { id } = c.validated.params;
    const db = await getDbAsync();

    // Delete with userId filter - custom roles are always user-scoped
    const result = await db
      .delete(tables.chatCustomRole)
      .where(and(
        eq(tables.chatCustomRole.id, id),
        eq(tables.chatCustomRole.userId, user.id),
      ))
      .returning();

    if (result.length === 0) {
      throw createError.notFound('Custom role not found', createResourceNotFoundContext('custom_role', id));
    }

    return Responses.ok(c, {
      deleted: true,
    });
  },
);
