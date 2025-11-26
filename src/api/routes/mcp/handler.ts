/**
 * MCP (Model Context Protocol) Route Handlers
 *
 * Implements MCP server functionality for exposing chat operations
 * and model management as tools for AI model integration
 *
 * Following patterns from chat/handler.ts and models/handler.ts
 */

import type { RouteHandler } from '@hono/zod-openapi';
import type { UIMessage } from 'ai';
import { convertToModelMessages, streamObject, streamText, validateUIMessages } from 'ai';
import { and, asc, desc, eq } from 'drizzle-orm';
import { ulid } from 'ulid';

import { ErrorContextBuilders } from '@/api/common/error-contexts';
import { createError } from '@/api/common/error-handling';
import { verifyThreadOwnership } from '@/api/common/permissions';
import { createHandler, createHandlerWithBatch, Responses } from '@/api/core';
import { AIModels } from '@/api/core/ai-models';
import { AnalysisStatuses, DEFAULT_CHAT_MODE } from '@/api/core/enums';
import { saveStreamedMessage } from '@/api/services/message-persistence.service';
import { getAllModels, getModelById } from '@/api/services/models-config.service';
import {
  buildModeratorSystemPrompt,
  buildModeratorUserPrompt,
} from '@/api/services/moderator-analysis.service';
import { initializeOpenRouter, openRouterService } from '@/api/services/openrouter.service';
import {
  AI_RETRY_CONFIG,
  AI_TIMEOUT_CONFIG,
  canAccessModelByPricing,
  getSafeMaxOutputTokens,
} from '@/api/services/product-logic.service';
import { buildParticipantSystemPrompt } from '@/api/services/prompts.service';
import { handleRoundRegeneration } from '@/api/services/regeneration.service';
import { calculateRoundNumber } from '@/api/services/round.service';
import { getUserTier } from '@/api/services/usage-tracking.service';
import type { ApiEnv } from '@/api/types';
import { getDbAsync } from '@/db';
import * as tables from '@/db/schema';
import type { ChatMessage } from '@/db/validation';
import { extractTextFromParts } from '@/lib/schemas/message-schemas';
import { DEFAULT_PARTICIPANT_INDEX } from '@/lib/schemas/participant-schemas';
import { filterNonEmptyMessages } from '@/lib/utils/message-transforms';
import { isObject } from '@/lib/utils/type-guards';

import { chatMessagesToUIMessages } from '../chat/handlers/helpers';
import { ModeratorAnalysisPayloadSchema } from '../chat/schema';
import type {
  addParticipantToolRoute,
  createThreadToolRoute,
  generateAnalysisToolRoute,
  generateResponsesToolRoute,
  getRoundAnalysisToolRoute,
  getThreadToolRoute,
  listModelsToolRoute,
  listResourcesRoute,
  listRoundsToolRoute,
  listToolsRoute,
  regenerateRoundToolRoute,
  removeParticipantToolRoute,
  roundFeedbackToolRoute,
  sendMessageToolRoute,
  updateParticipantToolRoute,
} from './route';
import type {
  AddParticipantInput,
  CreateThreadInput,
  GenerateAnalysisInput,
  GenerateResponsesInput,
  GetRoundAnalysisInput,
  GetThreadInput,
  ListModelsInput,
  ListRoundsInput,
  MCPResource,
  MCPServerInfo,
  MCPTool,
  ParticipantResponse,
  RegenerateRoundInput,
  RemoveParticipantInput,
  RoundFeedbackInput,
  SendMessageInput,
  UpdateParticipantInput,
} from './schema';
import {
  AddParticipantInputSchema,
  CreateThreadInputSchema,
  GenerateAnalysisInputSchema,
  GenerateResponsesInputSchema,
  GetRoundAnalysisInputSchema,
  GetThreadInputSchema,
  ListModelsInputSchema,
  ListRoundsInputSchema,
  RegenerateRoundInputSchema,
  RemoveParticipantInputSchema,
  RoundFeedbackInputSchema,
  SendMessageInputSchema,
  UpdateParticipantInputSchema,
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
          default: DEFAULT_CHAT_MODE,
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
  {
    name: 'generate_responses',
    description: 'Triggers server-side sequential AI response generation for all participants (non-streaming)',
    inputSchema: {
      type: 'object',
      properties: {
        threadId: {
          type: 'string',
          description: 'Thread ID to generate responses for',
        },
        messageContent: {
          type: 'string',
          description: 'User message content',
          minLength: 1,
          maxLength: 10000,
        },
        waitForCompletion: {
          type: 'boolean',
          description: 'Whether to wait for all AI responses before returning',
          default: true,
        },
      },
      required: ['threadId', 'messageContent'],
    },
  },
  {
    name: 'generate_analysis',
    description: 'Creates AI moderator analysis comparing participant responses for a round',
    inputSchema: {
      type: 'object',
      properties: {
        threadId: {
          type: 'string',
          description: 'Thread ID',
        },
        roundNumber: {
          type: 'integer',
          description: 'Round number to analyze',
          minimum: 1,
        },
      },
      required: ['threadId', 'roundNumber'],
    },
  },
  {
    name: 'regenerate_round',
    description: 'Deletes and regenerates all AI responses for a specific round',
    inputSchema: {
      type: 'object',
      properties: {
        threadId: {
          type: 'string',
          description: 'Thread ID',
        },
        roundNumber: {
          type: 'integer',
          description: 'Round number to regenerate',
          minimum: 1,
        },
        waitForCompletion: {
          type: 'boolean',
          description: 'Whether to wait for regeneration before returning',
          default: true,
        },
      },
      required: ['threadId', 'roundNumber'],
    },
  },
  {
    name: 'round_feedback',
    description: 'Submit like/dislike feedback for a round',
    inputSchema: {
      type: 'object',
      properties: {
        threadId: {
          type: 'string',
          description: 'Thread ID',
        },
        roundNumber: {
          type: 'integer',
          description: 'Round number',
          minimum: 1,
        },
        feedback: {
          type: 'string',
          enum: ['like', 'dislike', 'none'],
          description: 'Feedback type (none removes feedback)',
        },
      },
      required: ['threadId', 'roundNumber', 'feedback'],
    },
  },
  {
    name: 'remove_participant',
    description: 'Removes a participant from a chat thread',
    inputSchema: {
      type: 'object',
      properties: {
        threadId: {
          type: 'string',
          description: 'Thread ID',
        },
        participantId: {
          type: 'string',
          description: 'Participant ID to remove',
        },
      },
      required: ['threadId', 'participantId'],
    },
  },
  {
    name: 'update_participant',
    description: 'Updates participant role, system prompt, or priority',
    inputSchema: {
      type: 'object',
      properties: {
        threadId: {
          type: 'string',
          description: 'Thread ID',
        },
        participantId: {
          type: 'string',
          description: 'Participant ID to update',
        },
        role: {
          type: 'string',
          description: 'New role name',
        },
        systemPrompt: {
          type: 'string',
          description: 'New system prompt',
        },
        priority: {
          type: 'integer',
          description: 'New priority',
          minimum: 0,
        },
      },
      required: ['threadId', 'participantId'],
    },
  },
  {
    name: 'get_round_analysis',
    description: 'Retrieves moderator analysis for a specific round',
    inputSchema: {
      type: 'object',
      properties: {
        threadId: {
          type: 'string',
          description: 'Thread ID',
        },
        roundNumber: {
          type: 'integer',
          description: 'Round number',
          minimum: 1,
        },
      },
      required: ['threadId', 'roundNumber'],
    },
  },
  {
    name: 'list_rounds',
    description: 'Lists all rounds in a chat thread with metadata',
    inputSchema: {
      type: 'object',
      properties: {
        threadId: {
          type: 'string',
          description: 'Thread ID',
        },
      },
      required: ['threadId'],
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
    const allModels = getAllModels();
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
    const threadMode = input.mode || DEFAULT_CHAT_MODE;
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
        mode: input.mode || DEFAULT_CHAT_MODE,
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

    // Calculate round number based on existing user messages
    const existingUserMessages = await db.query.chatMessage.findMany({
      where: and(
        eq(tables.chatMessage.threadId, input.threadId),
        eq(tables.chatMessage.role, 'user'),
      ),
      columns: { id: true, roundNumber: true },
    });

    const currentRoundNumber = existingUserMessages.length + 1;

    // Create user message with parts array (AI SDK v5 pattern)
    const messageId = ulid();
    await batch.db.insert(tables.chatMessage).values({
      id: messageId,
      threadId: input.threadId,
      role: 'user',
      parts: [{ type: 'text', text: input.content }],
      participantId: null,
      roundNumber: currentRoundNumber,
      metadata: {
        role: 'user',
        roundNumber: currentRoundNumber, // ✅ CRITICAL: Must be in metadata for frontend transform
      },
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
    let messages: ChatMessage[] = [];
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
    let allModels = getAllModels();

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
    const allModels = getAllModels();
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

/**
 * MCP Tool: Generate Responses
 * Server-side sequential AI response generation for all participants
 * Following pattern from streaming.handler.ts streamText implementation
 */
export const generateResponsesToolHandler: RouteHandler<typeof generateResponsesToolRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateBody: GenerateResponsesInputSchema,
    operationName: 'mcpGenerateResponses',
  },
  async (c) => {
    const startTime = Date.now();
    const { user } = c.auth();
    const input: GenerateResponsesInput = c.validated.body;
    const db = await getDbAsync();

    // Verify thread ownership
    const thread = await verifyThreadOwnership(input.threadId, user.id, db);

    // Load enabled participants
    const participants = await db.query.chatParticipant.findMany({
      where: and(
        eq(tables.chatParticipant.threadId, input.threadId),
        eq(tables.chatParticipant.isEnabled, true),
      ),
      orderBy: [asc(tables.chatParticipant.priority)],
    });

    if (participants.length === 0) {
      throw createError.badRequest('No enabled participants in thread');
    }

    // Calculate round number
    const roundResult = await calculateRoundNumber({
      threadId: input.threadId,
      participantIndex: DEFAULT_PARTICIPANT_INDEX,
      message: { role: 'user', parts: [{ type: 'text', text: input.messageContent }] } as UIMessage,
      regenerateRound: undefined,
      db,
    });

    // Save user message (participant 0 only)
    const userMessageId = ulid();
    await db.insert(tables.chatMessage).values({
      id: userMessageId,
      threadId: input.threadId,
      role: 'user',
      parts: [{ type: 'text', text: input.messageContent }],
      participantId: null,
      roundNumber: roundResult.roundNumber,
      metadata: {
        role: 'user',
        roundNumber: roundResult.roundNumber, // ✅ CRITICAL: Must be in metadata for frontend transform
      },
      createdAt: new Date(),
    });

    // Load previous messages for context
    const previousDbMessages = await db.query.chatMessage.findMany({
      where: eq(tables.chatMessage.threadId, input.threadId),
      orderBy: [
        asc(tables.chatMessage.roundNumber),
        asc(tables.chatMessage.createdAt),
      ],
    });

    const previousMessages = await chatMessagesToUIMessages(previousDbMessages);

    // Initialize OpenRouter
    initializeOpenRouter(c.env);
    const client = openRouterService.getClient();
    const userTier = await getUserTier(user.id);

    // Generate responses sequentially for each participant
    const responses: ParticipantResponse[] = [];

    for (let i = 0; i < participants.length; i++) {
      const participant = participants[i];
      if (!participant)
        continue;

      try {
        // Prepare messages for this participant
        const allMessages = [...previousMessages, {
          id: userMessageId,
          role: 'user' as const,
          parts: [{ type: 'text' as const, text: input.messageContent }],
        }];

        const typedMessages = await validateUIMessages({ messages: allMessages });
        const nonEmptyMessages = filterNonEmptyMessages(typedMessages);
        const modelMessages = convertToModelMessages(nonEmptyMessages);

        // Get model info for token limits
        const modelInfo = getModelById(participant.modelId);
        const modelContextLength = modelInfo?.context_length || 16000;

        const systemPromptTokens = Math.ceil((participant.settings?.systemPrompt || '').length / 4);
        const messageTokens = typedMessages.length * 200;
        const estimatedInputTokens = systemPromptTokens + messageTokens + 500;

        const maxOutputTokens = getSafeMaxOutputTokens(
          modelContextLength,
          estimatedInputTokens,
          userTier,
        );

        // System prompt
        // ✅ SINGLE SOURCE: Default prompts from /src/lib/ai/prompts.ts
        const systemPrompt = participant.settings?.systemPrompt
          || buildParticipantSystemPrompt(participant.role);

        // Temperature support
        const modelSupportsTemperature = !participant.modelId.includes('o4-mini') && !participant.modelId.includes('o4-deep');
        const temperatureValue = modelSupportsTemperature ? (participant.settings?.temperature ?? 0.7) : undefined;

        // Generate response
        const reasoningDeltas: string[] = [];
        const streamMessageId = ulid();

        const finishResult = await streamText({
          model: client.chat(participant.modelId),
          system: systemPrompt,
          messages: modelMessages,
          maxOutputTokens,
          ...(modelSupportsTemperature && { temperature: temperatureValue }),
          maxRetries: AI_RETRY_CONFIG.maxAttempts,
          abortSignal: AbortSignal.timeout(AI_TIMEOUT_CONFIG.perAttemptMs),
          experimental_telemetry: {
            isEnabled: true,
            functionId: `mcp.generate-responses.thread.${input.threadId}.participant.${i}`,
          },
        });

        // Collect response text
        let fullText = '';
        for await (const chunk of finishResult.textStream) {
          fullText += chunk;
        }

        // Await finish result properties
        const fullTextResult = await finishResult.text;
        const usageResult = await finishResult.usage;
        const finishReasonResult = await finishResult.finishReason;

        // Save message using saveStreamedMessage service
        await saveStreamedMessage({
          messageId: streamMessageId,
          threadId: input.threadId,
          participantId: participant.id,
          participantIndex: i,
          participantRole: participant.role,
          modelId: participant.modelId,
          roundNumber: roundResult.roundNumber,
          text: fullText,
          reasoningDeltas,
          finishResult: {
            text: fullTextResult,
            usage: {
              inputTokens: usageResult?.inputTokens || 0,
              outputTokens: usageResult?.outputTokens || 0,
            },
            finishReason: finishReasonResult,
            response: finishResult.response,
            reasoning: await finishResult.reasoning,
          },
          userId: user.id,
          participants,
          threadMode: thread.mode,
          db,
        });

        responses.push({
          participantId: participant.id,
          messageId: streamMessageId,
          content: fullText,
        });
      } catch (error) {
        // Log error but continue with other participants
        responses.push({
          participantId: participant.id,
          messageId: '',
          content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }

    const executionTime = Date.now() - startTime;

    return Responses.ok(c, {
      result: {
        roundNumber: roundResult.roundNumber,
        userMessageId,
        responses,
        participantCount: participants.length,
      },
      metadata: {
        executionTime,
        toolName: 'generate_responses',
      },
    });
  },
);

/**
 * MCP Tool: Generate Analysis
 * Creates moderator analysis for a round
 * Following pattern from analysis.handler.ts generateModeratorAnalysis
 */
export const generateAnalysisToolHandler: RouteHandler<typeof generateAnalysisToolRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateBody: GenerateAnalysisInputSchema,
    operationName: 'mcpGenerateAnalysis',
  },
  async (c) => {
    const startTime = Date.now();
    const { user } = c.auth();
    const input: GenerateAnalysisInput = c.validated.body;
    const db = await getDbAsync();

    // Verify thread ownership
    const thread = await verifyThreadOwnership(input.threadId, user.id, db);

    // Fetch round messages
    const roundMessages = await db.query.chatMessage.findMany({
      where: and(
        eq(tables.chatMessage.threadId, input.threadId),
        eq(tables.chatMessage.role, 'assistant'),
        eq(tables.chatMessage.roundNumber, input.roundNumber),
      ),
      with: {
        participant: true,
      },
      orderBy: [
        asc(tables.chatMessage.createdAt),
      ],
    });

    if (roundMessages.length === 0) {
      throw createError.badRequest(`No messages found for round ${input.roundNumber}`);
    }

    // Get user question
    const userMessages = await db.query.chatMessage.findMany({
      where: and(
        eq(tables.chatMessage.threadId, input.threadId),
        eq(tables.chatMessage.role, 'user'),
      ),
      orderBy: [desc(tables.chatMessage.createdAt)],
      limit: 10,
    });

    const earliestParticipantTime = Math.min(...roundMessages.map(m => m.createdAt.getTime()));
    const relevantUserMessage = userMessages.find(
      m => m.createdAt.getTime() < earliestParticipantTime,
    );
    const userQuestion = relevantUserMessage ? extractTextFromParts(relevantUserMessage.parts) : 'N/A';

    // Build participant responses
    const participantResponses = roundMessages.map((msg, index) => {
      const participant = msg.participant!;
      return {
        participantIndex: index,
        participantRole: participant.role,
        modelId: participant.modelId,
        modelName: participant.modelId.split('/').pop() || participant.modelId,
        responseContent: extractTextFromParts(msg.parts),
      };
    });

    // Get changelog entries
    const changelogEntries = await db.query.chatThreadChangelog.findMany({
      where: and(
        eq(tables.chatThreadChangelog.threadId, input.threadId),
        eq(tables.chatThreadChangelog.roundNumber, input.roundNumber),
      ),
      orderBy: [desc(tables.chatThreadChangelog.createdAt)],
      limit: 20,
    });

    // Create analysis record
    const analysisId = ulid();
    await db.insert(tables.chatModeratorAnalysis).values({
      id: analysisId,
      threadId: input.threadId,
      roundNumber: input.roundNumber,
      mode: thread.mode,
      userQuestion,
      status: AnalysisStatuses.STREAMING,
      participantMessageIds: roundMessages.map(m => m.id),
      createdAt: new Date(),
    });

    // Generate analysis using AI
    initializeOpenRouter(c.env);
    const client = openRouterService.getClient();
    const analysisModelId = AIModels.ANALYSIS;

    // ✅ TYPE-SAFE: Map changelog with validated metadata
    const changelogItems = changelogEntries.map(ce => ({
      changeType: ce.changeType,
      description: ce.changeSummary,
      metadata: isObject(ce.changeData) ? ce.changeData : null,
      createdAt: ce.createdAt,
    }));

    const systemPrompt = buildModeratorSystemPrompt({
      roundNumber: input.roundNumber,
      mode: thread.mode,
      userQuestion,
      participantResponses,
      changelogEntries: changelogItems,
    });

    const userPrompt = buildModeratorUserPrompt({
      roundNumber: input.roundNumber,
      mode: thread.mode,
      userQuestion,
      participantResponses,
      changelogEntries: changelogItems,
    });

    try {
      // ✅ AI SDK v5: streamObject with mode:'auto' (Provider-adaptive)
      const result = await streamObject({
        model: client.chat(analysisModelId),
        schema: ModeratorAnalysisPayloadSchema,
        mode: 'json',
        system: systemPrompt,
        prompt: userPrompt,
        temperature: 0.3,
      });

      // Await object result
      const finalObject = await result.object;

      // ✅ AUTOMATIC COERCION: z.coerce.number() in schemas handles string→number conversion
      // No manual coercion needed - Zod already validated and coerced all numeric fields

      // Update analysis with result
      await db.update(tables.chatModeratorAnalysis)
        .set({
          status: AnalysisStatuses.COMPLETE,
          analysisData: finalObject,
          completedAt: new Date(),
        })
        .where(eq(tables.chatModeratorAnalysis.id, analysisId));

      const executionTime = Date.now() - startTime;

      return Responses.ok(c, {
        result: {
          analysisId,
          roundNumber: input.roundNumber,
          analysis: finalObject,
        },
        metadata: {
          executionTime,
          toolName: 'generate_analysis',
        },
      });
    } catch (error) {
      // Mark analysis as failed
      await db.update(tables.chatModeratorAnalysis)
        .set({
          status: AnalysisStatuses.FAILED,
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        })
        .where(eq(tables.chatModeratorAnalysis.id, analysisId));

      throw createError.internal(
        'Failed to generate analysis',
        { errorType: 'external_service' },
      );
    }
  },
);

/**
 * MCP Tool: Regenerate Round
 * Deletes and regenerates AI responses for a round
 * Following pattern from regeneration.service.ts handleRoundRegeneration
 */
export const regenerateRoundToolHandler: RouteHandler<typeof regenerateRoundToolRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateBody: RegenerateRoundInputSchema,
    operationName: 'mcpRegenerateRound',
  },
  async (c) => {
    const startTime = Date.now();
    const { user } = c.auth();
    const input: RegenerateRoundInput = c.validated.body;
    const db = await getDbAsync();

    // Verify thread ownership
    const thread = await verifyThreadOwnership(input.threadId, user.id, db);

    // Handle regeneration (cleanup)
    const cleanupResult = await handleRoundRegeneration({
      threadId: input.threadId,
      regenerateRound: input.roundNumber,
      participantIndex: DEFAULT_PARTICIPANT_INDEX,
      db,
    });

    // If waitForCompletion, regenerate responses
    const responses: ParticipantResponse[] = [];

    if (input.waitForCompletion) {
      // Load participants
      const participants = await db.query.chatParticipant.findMany({
        where: and(
          eq(tables.chatParticipant.threadId, input.threadId),
          eq(tables.chatParticipant.isEnabled, true),
        ),
        orderBy: [asc(tables.chatParticipant.priority)],
      });

      // Get the user message for this round
      const userMessage = await db.query.chatMessage.findFirst({
        where: and(
          eq(tables.chatMessage.threadId, input.threadId),
          eq(tables.chatMessage.role, 'user'),
          eq(tables.chatMessage.roundNumber, input.roundNumber),
        ),
      });

      if (!userMessage) {
        throw createError.badRequest('User message not found for regeneration');
      }

      // Load previous messages
      const previousDbMessages = await db.query.chatMessage.findMany({
        where: eq(tables.chatMessage.threadId, input.threadId),
        orderBy: [
          asc(tables.chatMessage.roundNumber),
          asc(tables.chatMessage.createdAt),
        ],
      });

      const previousMessages = await chatMessagesToUIMessages(previousDbMessages);

      // Initialize OpenRouter
      initializeOpenRouter(c.env);
      const client = openRouterService.getClient();
      const userTier = await getUserTier(user.id);

      // Regenerate each participant response
      for (let i = 0; i < participants.length; i++) {
        const participant = participants[i];
        if (!participant)
          continue;

        try {
          const allMessages = [...previousMessages, {
            id: userMessage.id,
            role: 'user' as const,
            parts: userMessage.parts,
          }];

          const typedMessages = await validateUIMessages({ messages: allMessages });
          const nonEmptyMessages = filterNonEmptyMessages(typedMessages);
          const modelMessages = convertToModelMessages(nonEmptyMessages);

          const modelInfo = getModelById(participant.modelId);
          const modelContextLength = modelInfo?.context_length || 16000;

          const systemPromptTokens = Math.ceil((participant.settings?.systemPrompt || '').length / 4);
          const messageTokens = typedMessages.length * 200;
          const estimatedInputTokens = systemPromptTokens + messageTokens + 500;

          const maxOutputTokens = getSafeMaxOutputTokens(
            modelContextLength,
            estimatedInputTokens,
            userTier,
          );

          // ✅ SINGLE SOURCE: Default prompts from /src/lib/ai/prompts.ts
          const systemPrompt = participant.settings?.systemPrompt
            || buildParticipantSystemPrompt(participant.role);

          const modelSupportsTemperature = !participant.modelId.includes('o4-mini') && !participant.modelId.includes('o4-deep');
          const temperatureValue = modelSupportsTemperature ? (participant.settings?.temperature ?? 0.7) : undefined;

          const reasoningDeltas: string[] = [];
          const streamMessageId = ulid();

          const finishResult = await streamText({
            model: client.chat(participant.modelId),
            system: systemPrompt,
            messages: modelMessages,
            maxOutputTokens,
            ...(modelSupportsTemperature && { temperature: temperatureValue }),
            maxRetries: AI_RETRY_CONFIG.maxAttempts,
            abortSignal: AbortSignal.timeout(AI_TIMEOUT_CONFIG.perAttemptMs),
          });

          let fullText = '';
          for await (const chunk of finishResult.textStream) {
            fullText += chunk;
          }

          // Await finish result properties
          const fullTextResult = await finishResult.text;
          const usageResult = await finishResult.usage;
          const finishReasonResult = await finishResult.finishReason;

          await saveStreamedMessage({
            messageId: streamMessageId,
            threadId: input.threadId,
            participantId: participant.id,
            participantIndex: i,
            participantRole: participant.role,
            modelId: participant.modelId,
            roundNumber: input.roundNumber,
            text: fullText,
            reasoningDeltas,
            finishResult: {
              text: fullTextResult,
              usage: {
                inputTokens: usageResult?.inputTokens || 0,
                outputTokens: usageResult?.outputTokens || 0,
              },
              finishReason: finishReasonResult,
              response: finishResult.response,
              reasoning: await finishResult.reasoning,
            },
            userId: user.id,
            participants,
            threadMode: thread.mode,
            db,
          });

          responses.push({
            participantId: participant.id,
            messageId: streamMessageId,
            content: fullText,
          });
        } catch (error) {
          responses.push({
            participantId: participant.id,
            messageId: '',
            content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          });
        }
      }
    }

    const executionTime = Date.now() - startTime;

    return Responses.ok(c, {
      result: {
        roundNumber: input.roundNumber,
        deletedMessagesCount: cleanupResult.deletedMessagesCount,
        cleanedEmbeddingsCount: cleanupResult.cleanedEmbeddingsCount,
        responses,
        regenerated: input.waitForCompletion,
      },
      metadata: {
        executionTime,
        toolName: 'regenerate_round',
      },
    });
  },
);

/**
 * MCP Tool: Round Feedback
 * Submit like/dislike feedback for a round
 */
export const roundFeedbackToolHandler: RouteHandler<typeof roundFeedbackToolRoute, ApiEnv> = createHandlerWithBatch(
  {
    auth: 'session',
    validateBody: RoundFeedbackInputSchema,
    operationName: 'mcpRoundFeedback',
  },
  async (c, batch) => {
    const startTime = Date.now();
    const { user } = c.auth();
    const input: RoundFeedbackInput = c.validated.body;
    const db = await getDbAsync();

    // Verify thread ownership
    await verifyThreadOwnership(input.threadId, user.id, db);

    // Check if feedback exists
    const existing = await db.query.chatRoundFeedback.findFirst({
      where: and(
        eq(tables.chatRoundFeedback.threadId, input.threadId),
        eq(tables.chatRoundFeedback.userId, user.id),
        eq(tables.chatRoundFeedback.roundNumber, input.roundNumber),
      ),
    });

    if (input.feedback === 'none') {
      // Remove feedback if exists
      if (existing) {
        await batch.db
          .delete(tables.chatRoundFeedback)
          .where(eq(tables.chatRoundFeedback.id, existing.id));
      }
    } else {
      // Insert or update feedback
      if (existing) {
        await batch.db
          .update(tables.chatRoundFeedback)
          .set({
            feedbackType: input.feedback,
            updatedAt: new Date(),
          })
          .where(eq(tables.chatRoundFeedback.id, existing.id));
      } else {
        await batch.db.insert(tables.chatRoundFeedback).values({
          id: ulid(),
          threadId: input.threadId,
          userId: user.id,
          roundNumber: input.roundNumber,
          feedbackType: input.feedback,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    }

    const executionTime = Date.now() - startTime;

    return Responses.ok(c, {
      result: {
        threadId: input.threadId,
        roundNumber: input.roundNumber,
        feedback: input.feedback,
        action: existing ? 'updated' : 'created',
      },
      metadata: {
        executionTime,
        toolName: 'round_feedback',
      },
    });
  },
);

/**
 * MCP Tool: Remove Participant
 * Removes a participant from a thread (sets isEnabled=false)
 */
export const removeParticipantToolHandler: RouteHandler<typeof removeParticipantToolRoute, ApiEnv> = createHandlerWithBatch(
  {
    auth: 'session',
    validateBody: RemoveParticipantInputSchema,
    operationName: 'mcpRemoveParticipant',
  },
  async (c, batch) => {
    const startTime = Date.now();
    const { user } = c.auth();
    const input: RemoveParticipantInput = c.validated.body;
    const db = await getDbAsync();

    // Verify thread ownership
    await verifyThreadOwnership(input.threadId, user.id, db);

    // Verify participant exists and belongs to thread
    const participant = await db.query.chatParticipant.findFirst({
      where: and(
        eq(tables.chatParticipant.id, input.participantId),
        eq(tables.chatParticipant.threadId, input.threadId),
      ),
    });

    if (!participant) {
      throw createError.notFound(
        'Participant not found',
        ErrorContextBuilders.resourceNotFound('participant', input.participantId),
      );
    }

    // Disable participant
    await batch.db
      .update(tables.chatParticipant)
      .set({
        isEnabled: false,
        updatedAt: new Date(),
      })
      .where(eq(tables.chatParticipant.id, input.participantId));

    const executionTime = Date.now() - startTime;

    return Responses.ok(c, {
      result: {
        participantId: input.participantId,
        threadId: input.threadId,
        removed: true,
      },
      metadata: {
        executionTime,
        toolName: 'remove_participant',
      },
    });
  },
);

/**
 * MCP Tool: Update Participant
 * Updates participant role, system prompt, or priority
 */
export const updateParticipantToolHandler: RouteHandler<typeof updateParticipantToolRoute, ApiEnv> = createHandlerWithBatch(
  {
    auth: 'session',
    validateBody: UpdateParticipantInputSchema,
    operationName: 'mcpUpdateParticipant',
  },
  async (c, batch) => {
    const startTime = Date.now();
    const { user } = c.auth();
    const input: UpdateParticipantInput = c.validated.body;
    const db = await getDbAsync();

    // Verify thread ownership
    await verifyThreadOwnership(input.threadId, user.id, db);

    // Verify participant exists and belongs to thread
    const participant = await db.query.chatParticipant.findFirst({
      where: and(
        eq(tables.chatParticipant.id, input.participantId),
        eq(tables.chatParticipant.threadId, input.threadId),
      ),
    });

    if (!participant) {
      throw createError.notFound(
        'Participant not found',
        ErrorContextBuilders.resourceNotFound('participant', input.participantId),
      );
    }

    // Build update object
    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (input.role !== undefined) {
      updates.role = input.role;
    }

    if (input.priority !== undefined) {
      updates.priority = input.priority;
    }

    if (input.systemPrompt !== undefined) {
      updates.settings = {
        ...participant.settings,
        systemPrompt: input.systemPrompt,
      };
    }

    // Update participant
    await batch.db
      .update(tables.chatParticipant)
      .set(updates)
      .where(eq(tables.chatParticipant.id, input.participantId));

    // Fetch updated participant
    const updated = await db.query.chatParticipant.findFirst({
      where: eq(tables.chatParticipant.id, input.participantId),
    });

    const executionTime = Date.now() - startTime;

    return Responses.ok(c, {
      result: {
        participantId: input.participantId,
        threadId: input.threadId,
        updated: {
          role: updated?.role,
          priority: updated?.priority,
          systemPrompt: updated?.settings?.systemPrompt,
        },
      },
      metadata: {
        executionTime,
        toolName: 'update_participant',
      },
    });
  },
);

/**
 * MCP Tool: Get Round Analysis
 * Retrieves moderator analysis for a specific round
 */
export const getRoundAnalysisToolHandler: RouteHandler<typeof getRoundAnalysisToolRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateBody: GetRoundAnalysisInputSchema,
    operationName: 'mcpGetRoundAnalysis',
  },
  async (c) => {
    const startTime = Date.now();
    const { user } = c.auth();
    const input: GetRoundAnalysisInput = c.validated.body;
    const db = await getDbAsync();

    // Verify thread ownership
    await verifyThreadOwnership(input.threadId, user.id, db);

    // Fetch analysis
    const analysis = await db.query.chatModeratorAnalysis.findFirst({
      where: and(
        eq(tables.chatModeratorAnalysis.threadId, input.threadId),
        eq(tables.chatModeratorAnalysis.roundNumber, input.roundNumber),
        eq(tables.chatModeratorAnalysis.status, AnalysisStatuses.COMPLETE),
      ),
      orderBy: [desc(tables.chatModeratorAnalysis.createdAt)],
    });

    if (!analysis) {
      throw createError.notFound(
        'Analysis not found',
        ErrorContextBuilders.resourceNotFound('analysis', `${input.threadId}:${input.roundNumber}`),
      );
    }

    const executionTime = Date.now() - startTime;

    return Responses.ok(c, {
      result: {
        analysisId: analysis.id,
        roundNumber: analysis.roundNumber,
        mode: analysis.mode,
        userQuestion: analysis.userQuestion,
        status: analysis.status,
        analysisData: analysis.analysisData,
        completedAt: analysis.completedAt?.toISOString(),
        createdAt: analysis.createdAt.toISOString(),
      },
      metadata: {
        executionTime,
        toolName: 'get_round_analysis',
      },
    });
  },
);

/**
 * MCP Tool: List Rounds
 * Lists all rounds in a thread with metadata
 */
export const listRoundsToolHandler: RouteHandler<typeof listRoundsToolRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateBody: ListRoundsInputSchema,
    operationName: 'mcpListRounds',
  },
  async (c) => {
    const startTime = Date.now();
    const { user } = c.auth();
    const input: ListRoundsInput = c.validated.body;
    const db = await getDbAsync();

    // Verify thread ownership
    await verifyThreadOwnership(input.threadId, user.id, db);

    // Get all messages for the thread and group by round
    const allMessages = await db.query.chatMessage.findMany({
      where: eq(tables.chatMessage.threadId, input.threadId),
      orderBy: [asc(tables.chatMessage.roundNumber), asc(tables.chatMessage.createdAt)],
    });

    // Group messages by round number
    const roundMap = new Map<number, typeof allMessages>();
    for (const message of allMessages) {
      const existing = roundMap.get(message.roundNumber) || [];
      existing.push(message);
      roundMap.set(message.roundNumber, existing);
    }

    // Build round metadata
    const rounds = await Promise.all(
      Array.from(roundMap.entries())
        .sort(([a], [b]) => a - b)
        .map(async ([roundNumber, messages]) => {
          const analysis = await db.query.chatModeratorAnalysis.findFirst({
            where: and(
              eq(tables.chatModeratorAnalysis.threadId, input.threadId),
              eq(tables.chatModeratorAnalysis.roundNumber, roundNumber),
              eq(tables.chatModeratorAnalysis.status, AnalysisStatuses.COMPLETE),
            ),
          });

          const feedback = await db.query.chatRoundFeedback.findFirst({
            where: and(
              eq(tables.chatRoundFeedback.threadId, input.threadId),
              eq(tables.chatRoundFeedback.userId, user.id),
              eq(tables.chatRoundFeedback.roundNumber, roundNumber),
            ),
          });

          const sortedMessages = messages.sort((a, b) =>
            a.createdAt.getTime() - b.createdAt.getTime(),
          );

          return {
            roundNumber,
            messageCount: messages.length,
            firstMessageAt: sortedMessages[0]?.createdAt.toISOString() || new Date().toISOString(),
            lastMessageAt: sortedMessages[sortedMessages.length - 1]?.createdAt.toISOString() || new Date().toISOString(),
            hasAnalysis: !!analysis,
            analysisId: analysis?.id,
            feedback: feedback?.feedbackType || null,
          };
        }),
    );

    const executionTime = Date.now() - startTime;

    return Responses.ok(c, {
      result: {
        threadId: input.threadId,
        rounds,
        totalRounds: rounds.length,
      },
      metadata: {
        executionTime,
        toolName: 'list_rounds',
      },
    });
  },
);
