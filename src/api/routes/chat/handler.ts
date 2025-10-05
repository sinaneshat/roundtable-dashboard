import type { RouteHandler } from '@hono/zod-openapi';
import { convertToModelMessages, createUIMessageStream, createUIMessageStreamResponse, streamText } from 'ai';
import { and, eq, ne } from 'drizzle-orm';
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
import { initializeOpenRouter, openRouterService } from '@/api/services/openrouter.service';
import { generateUniqueSlug } from '@/api/services/slug-generator.service';
import { generateTitleFromMessage } from '@/api/services/title-generator.service';
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
    // Exclude deleted threads from the list (show active and archived only)
    const threads = await db.query.chatThread.findMany({
      where: buildCursorWhereWithFilters(
        tables.chatThread.updatedAt,
        query.cursor,
        'desc',
        [
          eq(tables.chatThread.userId, user.id),
          ne(tables.chatThread.status, 'deleted'), // Exclude deleted threads
        ],
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

    // Use temporary title - AI title will be generated asynchronously
    // But generate slug from first message immediately for nice URLs
    const tempTitle = 'New Chat';
    const tempSlug = await generateUniqueSlug(body.firstMessage);

    const threadId = ulid();
    const now = new Date();

    // Create thread with temporary title (will be updated asynchronously)
    const [thread] = await db
      .insert(tables.chatThread)
      .values({
        id: threadId,
        userId: user.id,
        title: tempTitle,
        slug: tempSlug,
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

        // Only create settings object if at least one value is provided
        // Use undefined to omit the field entirely when no settings exist
        const hasSettings = systemPrompt || p.temperature !== undefined || p.maxTokens !== undefined;
        const settingsValue = hasSettings
          ? {
              systemPrompt,
              temperature: p.temperature,
              maxTokens: p.maxTokens,
            }
          : undefined;

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
            ...(settingsValue !== undefined && { settings: settingsValue }),
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
        // Don't include participantId - let it default to null (user messages have no participant)
        role: 'user',
        content: body.firstMessage,
        createdAt: now,
      })
      .returning();

    // Increment usage counters AFTER successful creation
    // AI responses will be generated through the streaming endpoint
    await incrementThreadUsage(user.id);
    await incrementMessageUsage(user.id, 1); // Only the user message for now

    // Generate AI title asynchronously in background
    // This won't block the response, allowing immediate navigation with temp title
    // Fire-and-forget pattern (no await) - runs in background
    (async () => {
      try {
        // Generate AI title from first message
        const aiTitle = await generateTitleFromMessage(body.firstMessage, c.env);

        // Update thread with AI-generated title ONLY
        // IMPORTANT: Don't update slug - it must remain immutable to prevent 404s
        // The slug was already generated at creation time and users may have bookmarked it
        await db
          .update(tables.chatThread)
          .set({
            title: aiTitle,
            updatedAt: new Date(),
          })
          .where(eq(tables.chatThread.id, threadId));

        apiLogger.info('Thread title updated asynchronously', {
          threadId,
          title: aiTitle,
        });
      } catch (error) {
        // Log error but don't fail the request since thread is already created
        apiLogger.error('Failed to generate async title for thread', {
          threadId,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
    })().catch(() => {
      // Suppress unhandled rejection warnings
    });

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

    // Return thread with participants and first user message
    // AI responses will be generated via the streaming endpoint
    return Responses.ok(c, {
      thread,
      participants,
      messages: [userMessage],
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
        // Don't include participantId - let it default to null (user messages have no participant)
        role: 'user',
        content: body.content,
        ...(body.parentMessageId && { parentMessageId: body.parentMessageId }),
        createdAt: now,
      })
      .returning();

    // Get previous messages for conversation context
    const previousMessages = await db.query.chatMessage.findMany({
      where: eq(tables.chatMessage.threadId, id),
      orderBy: [tables.chatMessage.createdAt],
      limit: 10, // Last 10 messages for context
    });

    // Title is already generated during thread creation
    // No need to auto-generate here

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
 * Stream chat handler using AI SDK v5 Message Persistence Pattern
 * Reference: https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot-message-persistence
 *
 * Pattern:
 * 1. Receive last message from frontend
 * 2. Load previous messages from database
 * 3. Combine and validate messages
 * 4. Stream responses from each participant sequentially
 * 5. Save messages to database in onFinish
 * 6. Generate and update title if needed
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
    const body = c.validated.body;
    const db = await getDbAsync();

    // AI SDK v5 Pattern: Thread ID comes from request body
    const threadId = body.id;
    const lastMessage = body.message;

    // Verify thread ownership and get thread details with participants
    const thread = await verifyThreadOwnership(threadId, user.id, db, { includeParticipants: true });

    if (thread.participants.length === 0) {
      throw createError.badRequest('No enabled participants in this thread');
    }

    // AI SDK v5 Pattern: Load previous messages from database
    const previousMessages = await db.query.chatMessage.findMany({
      where: eq(tables.chatMessage.threadId, threadId),
      orderBy: [tables.chatMessage.createdAt],
    });

    // Determine the scenario:
    // 1. New message: lastMessage is provided
    // 2. Regenerate: lastMessage is undefined, trigger is 'regenerate-assistant-message'
    // 3. Auto-trigger: lastMessage is undefined, no trigger (page load with only user message)
    const trigger = body.trigger;
    const isRegenerate = trigger === 'regenerate-assistant-message';
    const isAutoTrigger = !lastMessage && !isRegenerate;

    let messages: Array<{ id: string; role: 'user' | 'assistant'; content: string }>;
    let isNewMessage = false;

    if (lastMessage) {
      // Scenario 1: New message from user
      const userMessageContent = lastMessage.parts
        .filter(part => part.type === 'text')
        .map(part => part.text)
        .join('');

      if (userMessageContent.trim().length === 0) {
        throw createError.badRequest('User message content is empty');
      }

      // Enforce message quota
      await enforceMessageQuota(user.id);

      // Save user message to database
      const userMessageId = lastMessage.id;
      await db.insert(tables.chatMessage).values({
        id: userMessageId,
        threadId,
        // Don't include participantId - let it default to null (user messages have no participant)
        role: 'user',
        content: userMessageContent,
        // Don't include parentMessageId - let it default to null
        createdAt: new Date(),
      });

      // Combine previous messages with new message
      messages = [
        ...previousMessages.map(msg => ({
          id: msg.id,
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        })),
        {
          id: userMessageId,
          role: 'user' as const,
          content: userMessageContent,
        },
      ];
      isNewMessage = true;
    } else if (isRegenerate) {
      // Scenario 2: Regenerate assistant message
      const messageId = body.messageId;
      if (messageId) {
        const messageIndex = previousMessages.findIndex(m => m.id === messageId);
        if (messageIndex !== -1) {
          messages = previousMessages.slice(0, messageIndex).map(msg => ({
            id: msg.id,
            role: msg.role as 'user' | 'assistant',
            content: msg.content,
          }));
        } else {
          messages = previousMessages.map(msg => ({
            id: msg.id,
            role: msg.role as 'user' | 'assistant',
            content: msg.content,
          }));
        }
      } else {
        // Remove last assistant message
        const lastAssistantIndex = previousMessages
          .map((m, i) => ({
            m,
            i,
          }))
          .reverse()
          .find(({ m }) => m.role === 'assistant')
          ?.i;

        if (lastAssistantIndex !== undefined) {
          messages = previousMessages.slice(0, lastAssistantIndex).map(msg => ({
            id: msg.id,
            role: msg.role as 'user' | 'assistant',
            content: msg.content,
          }));
        } else {
          messages = previousMessages.map(msg => ({
            id: msg.id,
            role: msg.role as 'user' | 'assistant',
            content: msg.content,
          }));
        }
      }
    } else if (isAutoTrigger) {
      // Scenario 3: Auto-trigger (page load with only user message, no AI responses yet)
      messages = previousMessages.map(msg => ({
        id: msg.id,
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      }));

      if (messages.length === 0) {
        throw createError.badRequest('No messages to process for auto-trigger');
      }
    } else {
      throw createError.badRequest('Invalid request: no message provided and no valid trigger');
    }

    // Build UI messages for AI SDK
    const uiMessages = buildUIMessages(messages);

    // Get enabled participants sorted by priority
    const participants = thread.participants
      .filter(p => p.isEnabled)
      .sort((a, b) => a.priority - b.priority);

    apiLogger.info('Participants loaded for streaming', {
      threadId,
      totalParticipants: thread.participants.length,
      enabledParticipants: participants.length,
      participants: participants.map(p => ({
        id: p.id,
        modelId: p.modelId,
        priority: p.priority,
        isEnabled: p.isEnabled,
      })),
    });

    if (participants.length === 0) {
      throw createError.badRequest('No enabled participants');
    }

    // Single participant streaming
    if (participants.length === 1) {
      const participant = participants[0]!;

      const streamingResponse = openRouterService.streamUIMessages({
        modelId: participant.modelId,
        messages: uiMessages,
        system: participant.settings?.systemPrompt,
        temperature: participant.settings?.temperature || 0.7,
        onFinish: async ({ text, usage }) => {
          try {
            const assistantMessageId = ulid();
            await db.insert(tables.chatMessage).values({
              id: assistantMessageId,
              threadId,
              participantId: participant.id,
              role: 'assistant',
              content: text,
              metadata: {
                model: participant.modelId,
                role: participant.role,
                usage: usage ? { totalTokens: usage.totalTokens } : undefined,
              },
              // Don't include parentMessageId - let it default to null
              createdAt: new Date(),
            });

            // Update usage tracking
            const messagesToIncrement = isNewMessage ? 2 : 1; // User + Assistant or just Assistant
            await incrementMessageUsage(user.id, messagesToIncrement);

            // Update thread
            await db
              .update(tables.chatThread)
              .set({
                lastMessageAt: new Date(),
                updatedAt: new Date(),
              })
              .where(eq(tables.chatThread.id, threadId));

            // Generate title if needed
            if (thread.title === 'New Chat' && messages.length > 0) {
              const firstUserMessage = messages.find(m => m.role === 'user');
              if (firstUserMessage) {
                const generatedTitle = await generateTitleFromMessage(firstUserMessage.content, c.env);
                await db
                  .update(tables.chatThread)
                  .set({ title: generatedTitle })
                  .where(eq(tables.chatThread.id, threadId));
              }
            }
          } catch (error) {
            apiLogger.error('Failed to save streamed message', {
              threadId,
              participantId: participant.id,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        },
      });

      return streamingResponse;
    }

    // Multiple participants: Stream each model's response sequentially
    // AI SDK v5 Pattern: Use createUIMessageStream for sequential multi-participant responses
    apiLogger.info('Multi-participant streaming initiated', {
      threadId,
      participantCount: participants.length,
      participantModels: participants.map(p => p.modelId),
    });

    // Build system prompt for collaborative mode
    const modeInstructions = {
      analyzing: 'You are participating in a collaborative analysis session. Respond thoughtfully to build on previous insights.',
      brainstorming: 'You are participating in a collaborative brainstorming session. Build creatively on others\' ideas.',
      debating: 'You are participating in a structured debate. Engage critically with previous arguments.',
      solving: 'You are participating in collaborative problem-solving. Build logically on previous solutions.',
    };
    const baseSystemPrompt = modeInstructions[thread.mode as keyof typeof modeInstructions];

    // Create UI Message Stream following AI SDK v5 official patterns
    // Following the multi-step streaming pattern from AI SDK v5 docs
    // https://sdk.vercel.ai/docs/ai-sdk-core/generating-text#multi-step-streaming
    const stream = createUIMessageStream({
      originalMessages: uiMessages,
      async execute({ writer }) {
        const contextMessages = [...uiMessages];
        const completedResponses: Array<{
          participantId: string;
          modelId: string;
          role: string | null;
          text: string;
          usage?: { totalTokens: number };
        }> = [];

        // Get OpenRouter client
        initializeOpenRouter(c.env);
        const client = openRouterService.getClient();

        // Stream each participant's response sequentially using REAL streaming
        // Following AI SDK v5 official pattern: each model waits for previous to complete
        // Each model sees all previous responses in the conversation context
        for (let i = 0; i < participants.length; i++) {
          const participant = participants[i]!; // Assert non-null since we're iterating by index

          apiLogger.info('Starting participant stream', {
            participantId: participant.id,
            modelId: participant.modelId,
            priority: participant.priority,
            participantIndex: i,
            totalParticipants: participants.length,
            contextMessagesCount: contextMessages.length,
          });

          // Build system prompt with role awareness
          let systemPrompt = baseSystemPrompt;
          if (participant.role) {
            systemPrompt += `\n\nYour assigned role: ${participant.role}`;
          }
          if (participant.settings?.systemPrompt) {
            systemPrompt += `\n\n${participant.settings.systemPrompt}`;
          }

          // Add awareness of other participants
          const otherParticipants = participants
            .filter(p => p.id !== participant.id)
            .map(p => `${p.modelId}${p.role ? ` (${p.role})` : ''}`)
            .join(', ');
          if (otherParticipants) {
            systemPrompt += `\n\nOther participants in this conversation: ${otherParticipants}`;
          }

          // Add context awareness instruction
          if (i > 0) {
            systemPrompt += '\n\nIMPORTANT: Read and build upon the previous responses in this conversation. Add your unique perspective and insights.';
          }

          try {
            // Stream this participant's response in REAL-TIME using streamText
            // AI SDK v5 pattern: Each streamText call processes the full conversation history
            const result = streamText({
              model: client.chat(participant.modelId),
              messages: convertToModelMessages(contextMessages),
              system: systemPrompt,
              temperature: participant.settings?.temperature || 0.7,
            });

            // AI SDK v5 CRITICAL PATTERN: Each model creates its own complete message
            // Each toUIMessageStream() creates a new assistant message with its own ID
            // Include participant metadata so frontend knows which model sent which message
            writer.merge(result.toUIMessageStream({
              messageMetadata: () => ({
                participantId: participant.id,
                model: participant.modelId,
                role: participant.role,
              }),
            }));

            // Wait for this participant's stream to FULLY complete before next one starts
            // This is the key to sequential streaming - await each model's completion
            const text = await result.text;
            const usage = await result.usage;

            apiLogger.info('Participant stream completed', {
              participantId: participant.id,
              modelId: participant.modelId,
              textLength: text.length,
              totalTokens: usage?.totalTokens,
              remainingParticipants: participants.length - i - 1,
            });

            // Validate response is not empty - if empty, treat as error
            if (!text || text.trim().length === 0) {
              apiLogger.warn('Participant returned empty response', {
                participantId: participant.id,
                modelId: participant.modelId,
                totalTokens: usage?.totalTokens,
              });

              // Write warning message to stream
              const warningText = `[${participant.modelId}${participant.role ? ` (${participant.role})` : ''} returned an empty response]`;
              const warningId = ulid();

              writer.write({
                type: 'text-delta',
                id: warningId,
                delta: warningText,
              });

              // Add to context so subsequent models know about the empty response
              completedResponses.push({
                participantId: participant.id,
                modelId: participant.modelId,
                role: participant.role,
                text: warningText,
              });

              contextMessages.push({
                id: warningId,
                role: 'assistant',
                parts: [{ type: 'text', text: warningText }],
              });

              // Continue to next participant
              continue;
            }

            // Save to database after completion
            const assistantMessageId = ulid();
            await db.insert(tables.chatMessage).values({
              id: assistantMessageId,
              threadId,
              participantId: participant.id,
              role: 'assistant',
              content: text,
              metadata: {
                model: participant.modelId,
                role: participant.role,
                usage: usage ? { totalTokens: usage.totalTokens } : undefined,
              },
              // Don't include parentMessageId - let it default to null
              createdAt: new Date(),
            });

            // Store for context tracking
            completedResponses.push({
              participantId: participant.id,
              modelId: participant.modelId,
              role: participant.role,
              text,
              usage: usage?.totalTokens !== undefined ? { totalTokens: usage.totalTokens } : undefined,
            });

            // CRITICAL: Add this model's response to context for next model
            // AI SDK v5 pattern: Build conversation history for sequential processing
            // Next model will see this response and build upon it
            contextMessages.push({
              id: assistantMessageId,
              role: 'assistant',
              parts: [{ type: 'text', text }],
            });
          } catch (error) {
            apiLogger.error('Participant streaming failed', {
              participantId: participant.id,
              modelId: participant.modelId,
              error: error instanceof Error ? error.message : String(error),
              stack: error instanceof Error ? error.stack : undefined,
            });

            // Write error message as a separate assistant message
            // AI SDK v5 pattern: Use text-delta event for error messages
            const errorText = `[Error: ${participant.modelId} failed to respond - ${error instanceof Error ? error.message : 'Unknown error'}]`;
            const errorId = ulid();

            // Write error as text delta
            writer.write({
              type: 'text-delta',
              id: errorId,
              delta: errorText,
            });

            // Add to context so subsequent models know about the error
            completedResponses.push({
              participantId: participant.id,
              modelId: participant.modelId,
              role: participant.role,
              text: errorText,
            });

            contextMessages.push({
              id: errorId,
              role: 'assistant',
              parts: [{ type: 'text', text: errorText }],
            });
          }
        }

        // Log completion of all participants
        apiLogger.info('All participants completed', {
          totalParticipants: participants.length,
          completedCount: completedResponses.length,
          participantIds: completedResponses.map(r => r.participantId),
        });

        // Update usage and thread after all participants complete
        const totalMessages = isNewMessage ? completedResponses.length + 1 : completedResponses.length;
        await incrementMessageUsage(user.id, totalMessages);
        await db
          .update(tables.chatThread)
          .set({
            lastMessageAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(tables.chatThread.id, threadId));

        // Generate title if needed
        if (thread.title === 'New Chat' && messages.length > 0) {
          const firstUserMessage = messages.find(m => m.role === 'user');
          if (firstUserMessage) {
            const generatedTitle = await generateTitleFromMessage(firstUserMessage.content, c.env);
            await db
              .update(tables.chatThread)
              .set({ title: generatedTitle })
              .where(eq(tables.chatThread.id, threadId));
          }
        }
      },
    });

    // Use createUIMessageStreamResponse following AI SDK v5 official pattern
    return createUIMessageStreamResponse({ stream });
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
