/**
 * MCP (Model Context Protocol) Route Handlers
 *
 * Implements MCP server functionality for exposing chat operations
 * and model management as tools for AI model integration
 *
 * Following patterns from chat/handler.ts and models/handler.ts
 */

import type { RouteHandler } from '@hono/zod-openapi';
import { desc, eq } from 'drizzle-orm';
import { ulid } from 'ulid';

import { ErrorContextBuilders } from '@/api/common/error-contexts';
import { createError } from '@/api/common/error-handling';
import { createHandler, createHandlerWithBatch, Responses } from '@/api/core';
import { openRouterModelsService } from '@/api/services/openrouter-models.service';
import { canAccessModelByPricing } from '@/api/services/product-logic.service';
import { getUserTier } from '@/api/services/usage-tracking.service';
import type { ApiEnv } from '@/api/types';
import { getDbAsync } from '@/db';
import * as tables from '@/db/schema';

import type {
  addParticipantToolRoute,
  createThreadToolRoute,
  getThreadToolRoute,
  listModelsToolRoute,
  listResourcesRoute,
  listToolsRoute,
  sendMessageToolRoute,
} from './route';
import type {
  AddParticipantInput,
  CreateThreadInput,
  GetThreadInput,
  ListModelsInput,
  MCPResource,
  MCPServerInfo,
  MCPTool,
  SendMessageInput,
} from './schema';
import {
  AddParticipantInputSchema,
  CreateThreadInputSchema,
  GetThreadInputSchema,
  ListModelsInputSchema,
  SendMessageInputSchema,
} from './schema';

// ============================================================================
// MCP Server Metadata
// ============================================================================

/**
 * MCP Server Information
 * Metadata about this MCP server implementation
 */
const MCP_SERVER_INFO: MCPServerInfo = {
  name: 'roundtable-mcp-server',
  version: '1.0.0',
  protocolVersion: '2024-11-05',
  capabilities: {
    tools: true,
    resources: true,
    prompts: false, // Not implemented yet
  },
};

/**
 * MCP Tool Definitions
 * Defines all tools available via MCP protocol
 */
const MCP_TOOLS: MCPTool[] = [
  {
    name: 'create_chat_thread',
    description: 'Creates a new multi-model brainstorming chat thread with AI participants',
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Thread title (1-200 characters)',
          minLength: 1,
          maxLength: 200,
        },
        mode: {
          type: 'string',
          enum: ['analyzing', 'brainstorming', 'debating', 'solving'],
          description: 'Chat mode determining participant behavior',
          default: 'brainstorming',
        },
        participants: {
          type: 'array',
          description: 'AI model participants (1-10 models)',
          minItems: 1,
          maxItems: 10,
          items: {
            type: 'object',
            properties: {
              modelId: {
                type: 'string',
                description: 'OpenRouter model ID (e.g., "anthropic/claude-sonnet-4.5")',
              },
              role: {
                type: 'string',
                description: 'Optional role name for the participant',
              },
              systemPrompt: {
                type: 'string',
                description: 'Optional custom system prompt',
              },
              priority: {
                type: 'integer',
                description: 'Response order priority (0-based)',
                minimum: 0,
              },
            },
            required: ['modelId'],
          },
        },
        isPublic: {
          type: 'boolean',
          description: 'Whether the thread is publicly accessible',
          default: false,
        },
      },
      required: ['title', 'participants'],
    },
  },
  {
    name: 'send_message',
    description: 'Sends a message to a chat thread and receives AI participant responses',
    inputSchema: {
      type: 'object',
      properties: {
        threadId: {
          type: 'string',
          description: 'Thread ID to send message to',
        },
        content: {
          type: 'string',
          description: 'Message content (1-10000 characters)',
          minLength: 1,
          maxLength: 10000,
        },
        parentMessageId: {
          type: 'string',
          description: 'Optional parent message ID for threading',
        },
      },
      required: ['threadId', 'content'],
    },
  },
  {
    name: 'get_thread',
    description: 'Retrieves a chat thread with messages and participant information',
    inputSchema: {
      type: 'object',
      properties: {
        threadId: {
          type: 'string',
          description: 'Thread ID to retrieve',
        },
        includeMessages: {
          type: 'boolean',
          description: 'Whether to include messages in response',
          default: true,
        },
        maxMessages: {
          type: 'integer',
          description: 'Maximum number of messages to return (1-100)',
          minimum: 1,
          maximum: 100,
          default: 50,
        },
      },
      required: ['threadId'],
    },
  },
  {
    name: 'list_models',
    description: 'Lists available AI models with optional filtering by category, provider, or tier',
    inputSchema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          enum: ['all', 'text', 'vision', 'code', 'function'],
          description: 'Filter models by category',
          default: 'all',
        },
        provider: {
          type: 'string',
          description: 'Filter by provider (e.g., "anthropic", "openai")',
        },
        tier: {
          type: 'string',
          enum: ['free', 'pro', 'enterprise'],
          description: 'Filter by subscription tier requirement',
        },
      },
    },
  },
  {
    name: 'add_participant',
    description: 'Adds a new AI model participant to an existing chat thread',
    inputSchema: {
      type: 'object',
      properties: {
        threadId: {
          type: 'string',
          description: 'Thread ID to add participant to',
        },
        modelId: {
          type: 'string',
          description: 'OpenRouter model ID',
        },
        role: {
          type: 'string',
          description: 'Optional role name for the participant',
        },
        systemPrompt: {
          type: 'string',
          description: 'Optional custom system prompt',
        },
        priority: {
          type: 'integer',
          description: 'Response order priority (0-based)',
          minimum: 0,
        },
      },
      required: ['threadId', 'modelId'],
    },
  },
];

// ============================================================================
// MCP Discovery Handlers
// ============================================================================

/**
 * List Available MCP Tools
 * Returns all tools that can be called via MCP protocol
 */
export const listToolsHandler: RouteHandler<typeof listToolsRoute, ApiEnv> = createHandler(
  {
    auth: 'session', // API key authentication via Better Auth
    operationName: 'listMCPTools',
  },
  async (c) => {
    // Verify API key authentication
    c.auth();

    return Responses.ok(c, {
      tools: MCP_TOOLS,
      serverInfo: MCP_SERVER_INFO,
    });
  },
);

/**
 * List Available MCP Resources
 * Returns resources accessible via MCP (user's chat threads)
 */
export const listResourcesHandler: RouteHandler<typeof listResourcesRoute, ApiEnv> = createHandler(
  {
    auth: 'session', // API key authentication
    operationName: 'listMCPResources',
  },
  async (c) => {
    const { user } = c.auth();
    const db = await getDbAsync();

    // Fetch user's chat threads
    const threads = await db.query.chatThread.findMany({
      where: eq(tables.chatThread.userId, user.id),
      orderBy: [desc(tables.chatThread.updatedAt)],
      limit: 50, // Limit to recent 50 threads
      with: {
        participants: true,
      },
    });

    // Convert threads to MCP resources
    const resources: MCPResource[] = threads.map(thread => ({
      uri: `chat://thread/${thread.id}`,
      name: thread.title,
      description: `${thread.mode} thread with ${thread.participants.length} AI participants`,
      mimeType: 'application/json',
    }));

    return Responses.ok(c, {
      resources,
      count: resources.length,
    });
  },
);

// ============================================================================
// MCP Tool Execution Handlers
// ============================================================================

/**
 * MCP Tool: Create Chat Thread
 * Creates a new multi-model chat thread
 */
export const createThreadToolHandler: RouteHandler<typeof createThreadToolRoute, ApiEnv> = createHandlerWithBatch(
  {
    auth: 'session', // API key authentication
    validateBody: CreateThreadInputSchema,
    operationName: 'mcpCreateThread',
  },
  async (c, batch) => {
    const startTime = Date.now();
    const { user } = c.auth();
    const input: CreateThreadInput = c.validated.body;
    const db = await getDbAsync();
    // Logging disabled per project requirements

    // Get user tier for model access validation
    const userTier = await getUserTier(user.id);

    // Validate all participant models are accessible
    const allModels = await openRouterModelsService.getTop50Models();
    for (const participant of input.participants) {
      const model = allModels.find(m => m.id === participant.modelId);
      if (!model) {
        throw createError.badRequest(
          `Model ${participant.modelId} not found`,
          ErrorContextBuilders.validation('modelId'),
        );
      }

      const hasAccess = canAccessModelByPricing(userTier, model);
      if (!hasAccess) {
        throw createError.unauthorized(
          `Model ${participant.modelId} requires higher subscription tier`,
          ErrorContextBuilders.authorization('subscription', user.id),
        );
      }
    }

    // Generate unique slug for the thread
    const slug = await generateUniqueSlug(input.title, db);

    // Create thread
    const threadId = ulid();
    const threadMode = input.mode || 'brainstorming';
    await batch.db.insert(tables.chatThread).values({
      id: threadId,
      userId: user.id,
      title: input.title,
      slug,
      mode: threadMode,
      status: 'active',
      isPublic: input.isPublic || false,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Create participants
    const participantIds: string[] = [];
    for (let i = 0; i < input.participants.length; i++) {
      const participant = input.participants[i];
      if (!participant)
        continue; // Type guard

      const participantId = ulid();
      participantIds.push(participantId);

      await batch.db.insert(tables.chatParticipant).values({
        id: participantId,
        threadId,
        modelId: participant.modelId,
        role: participant.role || null,
        priority: participant.priority ?? i,
        isEnabled: true,
        settings: participant.systemPrompt
          ? { systemPrompt: participant.systemPrompt }
          : null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    const executionTime = Date.now() - startTime;
    // Logging disabled per project requirements

    return Responses.ok(c, {
      result: {
        threadId,
        slug,
        title: input.title,
        mode: input.mode || 'brainstorming',
        participantIds,
        participantCount: input.participants.length,
      },
      metadata: {
        executionTime,
        toolName: 'create_chat_thread',
      },
    });
  },
);

/**
 * Helper function to generate unique slug
 */
async function generateUniqueSlug(
  title: string,
  db: Awaited<ReturnType<typeof getDbAsync>>,
): Promise<string> {
  const baseSlug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);

  let slug = `${baseSlug}-${ulid().toLowerCase().substring(0, 8)}`;

  // Check for uniqueness
  const existing = await db.query.chatThread.findFirst({
    where: eq(tables.chatThread.slug, slug),
  });

  if (existing) {
    // Retry with new ID
    slug = `${baseSlug}-${ulid().toLowerCase().substring(0, 8)}`;
  }

  return slug;
}

/**
 * MCP Tool: Send Message
 * Sends a message to a thread (note: actual AI responses would require streaming implementation)
 */
export const sendMessageToolHandler: RouteHandler<typeof sendMessageToolRoute, ApiEnv> = createHandlerWithBatch(
  {
    auth: 'session',
    validateBody: SendMessageInputSchema,
    operationName: 'mcpSendMessage',
  },
  async (c, batch) => {
    const startTime = Date.now();
    const { user } = c.auth();
    const input: SendMessageInput = c.validated.body;
    const db = await getDbAsync();
    // Logging disabled per project requirements

    // Verify thread ownership
    const thread = await db.query.chatThread.findFirst({
      where: eq(tables.chatThread.id, input.threadId),
    });

    if (!thread) {
      throw createError.notFound(
        'Thread not found',
        ErrorContextBuilders.resourceNotFound('thread', input.threadId),
      );
    }

    if (thread.userId !== user.id) {
      throw createError.unauthorized(
        'You do not have access to this thread',
        ErrorContextBuilders.authorization('thread', user.id),
      );
    }

    // Create user message with parts array (AI SDK v5 pattern)
    const messageId = ulid();
    await batch.db.insert(tables.chatMessage).values({
      id: messageId,
      threadId: input.threadId,
      role: 'user',
      parts: [{ type: 'text', text: input.content }],
      participantId: null,
      roundNumber: 1, // TODO: Calculate correct round number
      createdAt: new Date(),
    });

    // Update thread's lastMessageAt
    await batch.db
      .update(tables.chatThread)
      .set({
        lastMessageAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(tables.chatThread.id, input.threadId));

    const executionTime = Date.now() - startTime;
    // Logging disabled per project requirements

    return Responses.ok(c, {
      result: {
        messageId,
        threadId: input.threadId,
        content: input.content,
        createdAt: new Date().toISOString(),
        note: 'Message saved. AI responses require streaming endpoint - use /api/v1/chat/threads/:id/stream',
      },
      metadata: {
        executionTime,
        toolName: 'send_message',
      },
    });
  },
);

/**
 * MCP Tool: Get Thread
 * Retrieves thread with messages and participants
 */
export const getThreadToolHandler: RouteHandler<typeof getThreadToolRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateBody: GetThreadInputSchema,
    operationName: 'mcpGetThread',
  },
  async (c) => {
    const startTime = Date.now();
    const { user } = c.auth();
    const input: GetThreadInput = c.validated.body;
    const db = await getDbAsync();
    // Logging disabled per project requirements

    // Fetch thread with participants
    const thread = await db.query.chatThread.findFirst({
      where: eq(tables.chatThread.id, input.threadId),
      with: {
        participants: true,
      },
    });

    if (!thread) {
      throw createError.notFound(
        'Thread not found',
        ErrorContextBuilders.resourceNotFound('thread', input.threadId),
      );
    }

    if (thread.userId !== user.id && !thread.isPublic) {
      throw createError.unauthorized(
        'You do not have access to this thread',
        ErrorContextBuilders.authorization('thread', user.id),
      );
    }

    // Fetch messages if requested
    let messages: typeof tables.chatMessage.$inferSelect[] = [];
    if (input.includeMessages) {
      messages = await db.query.chatMessage.findMany({
        where: eq(tables.chatMessage.threadId, input.threadId),
        orderBy: [desc(tables.chatMessage.createdAt)],
        limit: input.maxMessages || 50,
      });
    }

    const executionTime = Date.now() - startTime;

    return Responses.ok(c, {
      result: {
        thread: {
          id: thread.id,
          title: thread.title,
          slug: thread.slug,
          mode: thread.mode,
          status: thread.status,
          isPublic: thread.isPublic,
          createdAt: thread.createdAt.toISOString(),
          updatedAt: thread.updatedAt.toISOString(),
        },
        participants: thread.participants.map(p => ({
          id: p.id,
          modelId: p.modelId,
          role: p.role,
          priority: p.priority,
          isEnabled: p.isEnabled,
          settings: p.settings,
        })),
        messages: messages.map(m => ({
          id: m.id,
          role: m.role,
          parts: m.parts,
          content: m.parts.map(p => p.type === 'text' || p.type === 'reasoning' ? p.text : '').join('\n'),
          participantId: m.participantId,
          roundNumber: m.roundNumber,
          createdAt: m.createdAt.toISOString(),
        })),
        messageCount: messages.length,
      },
      metadata: {
        executionTime,
        toolName: 'get_thread',
      },
    });
  },
);

/**
 * MCP Tool: List Models
 * Lists available AI models with filtering
 */
export const listModelsToolHandler: RouteHandler<typeof listModelsToolRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateBody: ListModelsInputSchema,
    operationName: 'mcpListModels',
  },
  async (c) => {
    const startTime = Date.now();
    const { user } = c.auth();
    const input: ListModelsInput = c.validated.body;
    // Logging disabled per project requirements

    // Get user tier for access filtering
    const userTier = await getUserTier(user.id);

    // Fetch all models
    let allModels = await openRouterModelsService.getTop50Models();

    // Apply filters
    if (input.provider) {
      const providerLower = input.provider.toLowerCase();
      allModels = allModels.filter(m => m.provider.toLowerCase() === providerLower);
    }

    // Map to response format with access information
    const models = allModels.map(model => ({
      id: model.id,
      name: model.name,
      provider: model.provider,
      category: model.category,
      isAccessible: canAccessModelByPricing(userTier, model),
      contextLength: model.context_length,
      pricing: {
        prompt: model.pricing.prompt,
        completion: model.pricing.completion,
      },
    }));

    const executionTime = Date.now() - startTime;

    return Responses.ok(c, {
      result: {
        models,
        count: models.length,
        userTier,
      },
      metadata: {
        executionTime,
        toolName: 'list_models',
      },
    });
  },
);

/**
 * MCP Tool: Add Participant
 * Adds a new AI participant to a thread
 */
export const addParticipantToolHandler: RouteHandler<typeof addParticipantToolRoute, ApiEnv> = createHandlerWithBatch(
  {
    auth: 'session',
    validateBody: AddParticipantInputSchema,
    operationName: 'mcpAddParticipant',
  },
  async (c, batch) => {
    const startTime = Date.now();
    const { user } = c.auth();
    const input: AddParticipantInput = c.validated.body;
    const db = await getDbAsync();
    // Logging disabled per project requirements

    // Verify thread ownership
    const thread = await db.query.chatThread.findFirst({
      where: eq(tables.chatThread.id, input.threadId),
      with: {
        participants: true,
      },
    });

    if (!thread) {
      throw createError.notFound(
        'Thread not found',
        ErrorContextBuilders.resourceNotFound('thread', input.threadId),
      );
    }

    if (thread.userId !== user.id) {
      throw createError.unauthorized(
        'You do not have access to this thread',
        ErrorContextBuilders.authorization('thread', user.id),
      );
    }

    // Check participant limit (max 10)
    if (thread.participants.length >= 10) {
      throw createError.badRequest(
        'Maximum participant limit (10) reached',
        ErrorContextBuilders.validation('participants'),
      );
    }

    // Validate model access
    const userTier = await getUserTier(user.id);
    const allModels = await openRouterModelsService.getTop50Models();
    const model = allModels.find(m => m.id === input.modelId);

    if (!model) {
      throw createError.badRequest(
        `Model ${input.modelId} not found`,
        ErrorContextBuilders.validation('modelId'),
      );
    }

    const hasAccess = canAccessModelByPricing(userTier, model);
    if (!hasAccess) {
      throw createError.unauthorized(
        `Model ${input.modelId} requires higher subscription tier`,
        ErrorContextBuilders.authorization('subscription', user.id),
      );
    }

    // Create participant
    const participantId = ulid();
    await batch.db.insert(tables.chatParticipant).values({
      id: participantId,
      threadId: input.threadId,
      modelId: input.modelId,
      role: input.role || null,
      priority: input.priority ?? thread.participants.length,
      isEnabled: true,
      settings: input.systemPrompt
        ? { systemPrompt: input.systemPrompt }
        : null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const executionTime = Date.now() - startTime;
    // Logging disabled per project requirements

    return Responses.ok(c, {
      result: {
        participantId,
        threadId: input.threadId,
        modelId: input.modelId,
        role: input.role,
        priority: input.priority ?? thread.participants.length,
      },
      metadata: {
        executionTime,
        toolName: 'add_participant',
      },
    });
  },
);
