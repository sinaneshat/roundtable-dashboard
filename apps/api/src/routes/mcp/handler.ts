/**
 * MCP (Model Context Protocol) Handlers
 *
 * Consolidated handlers for MCP protocol endpoints
 * Following backend-patterns.md 3-file architecture
 *
 * @see https://modelcontextprotocol.io/specification
 */

import type { RouteHandler } from '@hono/zod-openapi';
import { WebAppEnvs } from '@roundtable/shared';
import {
  CreditActions,
  DEFAULT_CHAT_MODE,
  MCPProtocolMethods,
  MCPToolMethods,
  MessagePartTypes,
  MessageRoles,
  MessageStatuses,
  ProjectIndexStatusSchema,
  SubscriptionTiers,
  ThreadStatuses,
} from '@roundtable/shared/enums';
import { and, asc, desc, eq, like } from 'drizzle-orm';
import { ulid } from 'ulid';

import { ErrorContextBuilders } from '@/common/error-contexts';
import { createError } from '@/common/error-handling';
import { verifyThreadOwnership } from '@/common/permissions';
import { createHandler, Responses } from '@/core';
import { getDbAsync } from '@/db';
import * as tables from '@/db';
import { chunkForD1Insert } from '@/db/batch-operations';
import { DEFAULT_PARTICIPANT_INDEX } from '@/lib/schemas/participant-schemas';
import { filterNonEmptyMessages, isObject } from '@/lib/utils';
import { AI_RETRY_CONFIG, AI_TIMEOUT_CONFIG, canAccessModelByPricing, checkFreeUserHasCompletedRound, enforceCredits, finalizeCredits, getSafeMaxOutputTokens } from '@/services/billing';
import { saveStreamedMessage } from '@/services/messages';
import { getAllModels, getModelById, initializeOpenRouter, openRouterService } from '@/services/models';
import { buildParticipantSystemPrompt } from '@/services/prompts';
import { calculateRoundNumber, handleRoundRegeneration } from '@/services/threads';
import { getUserTier } from '@/services/usage';
import type { ApiEnv } from '@/types';

import { chatMessagesToUIMessages } from '../chat/handlers/helpers';
import type {
  callToolRoute,
  listResourcesRoute,
  listToolsRoute,
  mcpJsonRpcRoute,
  openAIFunctionsRoute,
} from './route';
import type {
  AddParticipantInput,
  CreateProjectInput,
  CreateThreadInput,
  DeleteKnowledgeFileInput,
  DeleteProjectInput,
  GenerateAnalysisInput,
  GenerateResponsesInput,
  GetProjectInput,
  GetRoundAnalysisInput,
  GetThreadInput,
  ListKnowledgeFilesInput,
  ListModelsInput,
  ListProjectsInput,
  ListProjectThreadsInput,
  ListRoundsInput,
  ListThreadsInput,
  MCPResource,
  RegenerateRoundInput,
  RemoveParticipantInput,
  RoundFeedbackInput,
  SendMessageInput,
  ToolArgs,
  UpdateParticipantInput,
  UpdateProjectInput,
} from './schema';
import {
  AddParticipantInputSchema,
  CreateProjectInputSchema,
  CreateThreadInputSchema,
  DeleteKnowledgeFileInputSchema,
  DeleteProjectInputSchema,
  DeleteThreadInputSchema,
  GenerateAnalysisInputSchema,
  GenerateResponsesInputSchema,
  GetProjectInputSchema,
  GetRoundAnalysisInputSchema,
  GetThreadInputSchema,
  getToolByName,
  JsonRpcErrorCodes,
  JsonRpcRequestSchema,
  ListKnowledgeFilesInputSchema,
  ListModelsInputSchema,
  ListProjectsInputSchema,
  ListProjectThreadsInputSchema,
  ListRoundsInputSchema,
  ListThreadsInputSchema,
  MCP_PROTOCOL_VERSION,
  MCP_SERVER_INFO,
  MCP_TOOLS,
  RegenerateRoundInputSchema,
  RemoveParticipantInputSchema,
  ResourceReadParamsSchema,
  RoundFeedbackInputSchema,
  SendMessageInputSchema,
  ToolCallParamsSchema,
  toOpenAIFunctions,
  UpdateParticipantInputSchema,
  UpdateProjectInputSchema,
} from './schema';

// ============================================================================
// LAZY AI SDK LOADING
// ============================================================================

// Cache the AI SDK module to avoid repeated dynamic imports
// This is critical for Cloudflare Workers which have a 400ms startup limit
let aiSdkModule: typeof import('ai') | null = null;

async function getAiSdk() {
  if (!aiSdkModule) {
    aiSdkModule = await import('ai');
  }
  return aiSdkModule;
}

// ============================================================================
// Type Adapters
// ============================================================================

/**
 * Adapter to convert getModelById to ModelForPricing type expected by billing functions
 * Strips Zod .openapi() index signatures from model types
 */
function getModelForPricing(modelId: string): import('@/common/schemas/model-pricing').ModelForPricing | undefined {
  const model = getModelById(modelId);
  if (!model) {
    return undefined;
  }

  return {
    capabilities: model.capabilities,
    context_length: model.context_length,
    created: model.created,
    id: model.id,
    name: model.name,
    pricing: model.pricing,
    pricing_display: model.pricing_display,
    provider: model.provider,
  };
}

// ============================================================================
// Helper: Build MCP Response
// ============================================================================

function mcpResult(data: unknown) {
  const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  const structuredContent = isObject(data) ? data : undefined;
  return {
    content: [{ text, type: MessagePartTypes.TEXT }],
    structuredContent,
  };
}

function mcpError(message: string) {
  return {
    content: [{ text: message, type: MessagePartTypes.TEXT }],
    isError: true,
  };
}

// ============================================================================
// JSON-RPC Handler (Main MCP Protocol Endpoint)
// ============================================================================

export const mcpJsonRpcHandler: RouteHandler<typeof mcpJsonRpcRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    operationName: 'mcpJsonRpc',
    validateBody: JsonRpcRequestSchema,
  },
  async (c) => {
    const { user } = c.auth();
    // c.validated.body is already typed by validateBody: JsonRpcRequestSchema
    const request = c.validated.body;
    const requestId = request.id ?? null;

    // Helper to create JSON-RPC response using established response builder
    const jsonRpcResponse = (result?: unknown, error?: { code: number; message: string }) => {
      return Responses.jsonRpc(c, requestId, result, error);
    };

    try {
      switch (request.method) {
        // ====================================================================
        // Protocol Methods
        // ====================================================================
        case MCPProtocolMethods.INITIALIZE: {
          return jsonRpcResponse({
            capabilities: MCP_SERVER_INFO.capabilities,
            protocolVersion: MCP_PROTOCOL_VERSION,
            serverInfo: { name: MCP_SERVER_INFO.name, version: MCP_SERVER_INFO.version },
          });
        }

        case MCPProtocolMethods.TOOLS_LIST: {
          return jsonRpcResponse({ tools: MCP_TOOLS });
        }

        case MCPProtocolMethods.RESOURCES_LIST: {
          const db = await getDbAsync();
          const threads = await db.query.chatThread.findMany({
            limit: 50,
            orderBy: [desc(tables.chatThread.updatedAt)],
            where: eq(tables.chatThread.userId, user.id),
            with: { participants: true },
          });

          const resources: MCPResource[] = threads.map(t => ({
            description: `${t.mode} thread with ${t.participants.length} participants`,
            mimeType: 'application/json',
            name: t.title,
            uri: `roundtable://thread/${t.id}`,
          }));

          return jsonRpcResponse({ resources });
        }

        case MCPProtocolMethods.RESOURCES_READ: {
          const resourceParams = ResourceReadParamsSchema.safeParse(request.params);
          if (!resourceParams.success) {
            return jsonRpcResponse(undefined, {
              code: JsonRpcErrorCodes.INVALID_PARAMS,
              message: 'uri parameter required',
            });
          }
          const { uri } = resourceParams.data;

          // Parse roundtable://thread/{id}
          const match = uri.match(/^roundtable:\/\/thread\/(.+)$/);
          const threadId = match?.[1];
          if (!threadId) {
            return jsonRpcResponse(undefined, {
              code: JsonRpcErrorCodes.INVALID_PARAMS,
              message: 'Invalid resource URI',
            });
          }

          const db = await getDbAsync();
          const thread = await db.query.chatThread.findFirst({
            where: and(
              eq(tables.chatThread.id, threadId),
              eq(tables.chatThread.userId, user.id),
            ),
            with: { participants: true },
          });

          if (!thread) {
            return jsonRpcResponse(undefined, {
              code: JsonRpcErrorCodes.INVALID_PARAMS,
              message: 'Resource not found',
            });
          }

          return jsonRpcResponse({
            contents: [{
              mimeType: 'application/json',
              text: JSON.stringify(thread),
              uri,
            }],
          });
        }

        case MCPProtocolMethods.TOOLS_CALL: {
          const params = ToolCallParamsSchema.safeParse(request.params);
          if (!params.success) {
            return jsonRpcResponse(undefined, {
              code: JsonRpcErrorCodes.INVALID_PARAMS,
              message: params.error.message,
            });
          }

          // Use empty object fallback with explicit Record type
          const toolArgs: Record<string, unknown> = params.data.arguments ?? {};
          const result = await executeToolInternal(
            params.data.name,
            toolArgs,
            user,
            c.env,
          );

          return jsonRpcResponse(result);
        }

        default:
          return jsonRpcResponse(undefined, {
            code: JsonRpcErrorCodes.METHOD_NOT_FOUND,
            message: `Unknown method: ${request.method}`,
          });
      }
    } catch (error) {
      return jsonRpcResponse(undefined, {
        code: JsonRpcErrorCodes.INTERNAL_ERROR,
        message: error instanceof Error ? error.message : 'Internal error',
      });
    }
  },
);

// ============================================================================
// REST Convenience Handlers
// ============================================================================

export const listToolsHandler: RouteHandler<typeof listToolsRoute, ApiEnv> = createHandler(
  { auth: 'session', operationName: 'listMCPTools' },
  async (c) => {
    c.auth();
    return Responses.ok(c, { serverInfo: MCP_SERVER_INFO, tools: MCP_TOOLS });
  },
);

export const listResourcesHandler: RouteHandler<typeof listResourcesRoute, ApiEnv> = createHandler(
  { auth: 'session', operationName: 'listMCPResources' },
  async (c) => {
    const { user } = c.auth();
    const db = await getDbAsync();

    const threads = await db.query.chatThread.findMany({
      limit: 50,
      orderBy: [desc(tables.chatThread.updatedAt)],
      where: eq(tables.chatThread.userId, user.id),
      with: { participants: true },
    });

    const resources: MCPResource[] = threads.map(t => ({
      description: `${t.mode} thread with ${t.participants.length} participants`,
      mimeType: 'application/json',
      name: t.title,
      uri: `roundtable://thread/${t.id}`,
    }));

    return Responses.ok(c, { count: resources.length, resources });
  },
);

export const callToolHandler: RouteHandler<typeof callToolRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    operationName: 'callMCPTool',
    validateBody: ToolCallParamsSchema,
  },
  async (c) => {
    const { user } = c.auth();
    const { arguments: args, name } = c.validated.body;
    const startTime = Date.now();

    // Use empty object fallback with explicit Record type
    const toolArgs: Record<string, unknown> = args ?? {};
    const result = await executeToolInternal(name, toolArgs, user, c.env);

    return Responses.ok(c, {
      ...result,
      _meta: { executionTimeMs: Date.now() - startTime, toolName: name },
    });
  },
);

export const openAIFunctionsHandler: RouteHandler<typeof openAIFunctionsRoute, ApiEnv> = createHandler(
  { auth: 'session', operationName: 'getOpenAIFunctions' },
  async (c) => {
    c.auth();
    return Responses.ok(c, toOpenAIFunctions());
  },
);

// ============================================================================
// Tool Execution Engine
// ============================================================================

/**
 * Execute MCP tool with type-safe argument validation
 *
 * DESIGN PATTERN: MCP/JSON-RPC requires accepting unknown args from clients.
 * Each tool validates its own args via Zod safeParse in the switch statement.
 * The ToolArgs type documents all valid input shapes for documentation.
 *
 * @param toolName - Tool name from MCP_TOOLS registry
 * @param rawArgs - Raw arguments from JSON-RPC request (validated per-tool)
 */
async function executeToolInternal(
  toolName: string,
  rawArgs: ToolArgs | Record<string, unknown>,
  user: { id: string },
  env: ApiEnv['Bindings'],
) {
  // Safe to use rawArgs - each tool validates via safeParse
  const args = rawArgs;
  const tool = getToolByName(toolName);
  if (!tool) {
    return mcpError(`Unknown tool: ${toolName}`);
  }

  const db = await getDbAsync();

  try {
    switch (toolName) {
      // ----------------------------------------------------------------------
      // Thread Management
      // ----------------------------------------------------------------------
      case MCPToolMethods.CREATE_THREAD: {
        const parsed = CreateThreadInputSchema.safeParse(args);
        if (!parsed.success) {
          return mcpError(`Invalid input: ${parsed.error.message}`);
        }
        return await toolCreateThread(parsed.data, user, db);
      }

      case MCPToolMethods.GET_THREAD: {
        const parsed = GetThreadInputSchema.safeParse(args);
        if (!parsed.success) {
          return mcpError(`Invalid input: ${parsed.error.message}`);
        }
        return await toolGetThread(parsed.data, user, db);
      }

      case MCPToolMethods.LIST_THREADS: {
        const parsed = ListThreadsInputSchema.safeParse(args);
        if (!parsed.success) {
          return mcpError(`Invalid input: ${parsed.error.message}`);
        }
        return await toolListThreads(parsed.data, user, db);
      }

      case MCPToolMethods.DELETE_THREAD: {
        const parsed = DeleteThreadInputSchema.safeParse(args);
        if (!parsed.success) {
          return mcpError(`Invalid input: ${parsed.error.message}`);
        }
        return await toolDeleteThread(parsed.data, user, db);
      }

      // ----------------------------------------------------------------------
      // Project Management
      // ----------------------------------------------------------------------
      case MCPToolMethods.CREATE_PROJECT: {
        const parsed = CreateProjectInputSchema.safeParse(args);
        if (!parsed.success) {
          return mcpError(`Invalid input: ${parsed.error.message}`);
        }
        return await toolCreateProject(parsed.data, user, db, env);
      }

      case MCPToolMethods.GET_PROJECT: {
        const parsed = GetProjectInputSchema.safeParse(args);
        if (!parsed.success) {
          return mcpError(`Invalid input: ${parsed.error.message}`);
        }
        return await toolGetProject(parsed.data, user, db);
      }

      case MCPToolMethods.LIST_PROJECTS: {
        const parsed = ListProjectsInputSchema.safeParse(args);
        if (!parsed.success) {
          return mcpError(`Invalid input: ${parsed.error.message}`);
        }
        return await toolListProjects(parsed.data, user, db);
      }

      case MCPToolMethods.UPDATE_PROJECT: {
        const parsed = UpdateProjectInputSchema.safeParse(args);
        if (!parsed.success) {
          return mcpError(`Invalid input: ${parsed.error.message}`);
        }
        return await toolUpdateProject(parsed.data, user, db);
      }

      case MCPToolMethods.DELETE_PROJECT: {
        const parsed = DeleteProjectInputSchema.safeParse(args);
        if (!parsed.success) {
          return mcpError(`Invalid input: ${parsed.error.message}`);
        }
        return await toolDeleteProject(parsed.data, user, db);
      }

      case MCPToolMethods.LIST_PROJECT_THREADS: {
        const parsed = ListProjectThreadsInputSchema.safeParse(args);
        if (!parsed.success) {
          return mcpError(`Invalid input: ${parsed.error.message}`);
        }
        return await toolListProjectThreads(parsed.data, user, db);
      }

      // ----------------------------------------------------------------------
      // Knowledge Files
      // ----------------------------------------------------------------------
      case MCPToolMethods.LIST_KNOWLEDGE_FILES: {
        const parsed = ListKnowledgeFilesInputSchema.safeParse(args);
        if (!parsed.success) {
          return mcpError(`Invalid input: ${parsed.error.message}`);
        }
        return await toolListKnowledgeFiles(parsed.data, user, db);
      }

      case MCPToolMethods.DELETE_KNOWLEDGE_FILE: {
        const parsed = DeleteKnowledgeFileInputSchema.safeParse(args);
        if (!parsed.success) {
          return mcpError(`Invalid input: ${parsed.error.message}`);
        }
        return await toolDeleteKnowledgeFile(parsed.data, user, db, env);
      }

      // ----------------------------------------------------------------------
      // Messages & Responses
      // ----------------------------------------------------------------------
      case MCPToolMethods.SEND_MESSAGE: {
        const parsed = SendMessageInputSchema.safeParse(args);
        if (!parsed.success) {
          return mcpError(`Invalid input: ${parsed.error.message}`);
        }
        return await toolSendMessage(parsed.data, user, db);
      }

      case MCPToolMethods.GENERATE_RESPONSES: {
        const parsed = GenerateResponsesInputSchema.safeParse(args);
        if (!parsed.success) {
          return mcpError(`Invalid input: ${parsed.error.message}`);
        }
        return await toolGenerateResponses(parsed.data, user, db, env);
      }

      // ----------------------------------------------------------------------
      // Rounds
      // ----------------------------------------------------------------------
      case MCPToolMethods.LIST_ROUNDS: {
        const parsed = ListRoundsInputSchema.safeParse(args);
        if (!parsed.success) {
          return mcpError(`Invalid input: ${parsed.error.message}`);
        }
        return await toolListRounds(parsed.data, user, db);
      }

      case MCPToolMethods.REGENERATE_ROUND: {
        const parsed = RegenerateRoundInputSchema.safeParse(args);
        if (!parsed.success) {
          return mcpError(`Invalid input: ${parsed.error.message}`);
        }
        return await toolRegenerateRound(parsed.data, user, db);
      }

      case MCPToolMethods.ROUND_FEEDBACK: {
        const parsed = RoundFeedbackInputSchema.safeParse(args);
        if (!parsed.success) {
          return mcpError(`Invalid input: ${parsed.error.message}`);
        }
        return await toolRoundFeedback(parsed.data, user, db);
      }

      // ----------------------------------------------------------------------
      // Summary
      // ----------------------------------------------------------------------
      case MCPToolMethods.GENERATE_ANALYSIS: {
        const parsed = GenerateAnalysisInputSchema.safeParse(args);
        if (!parsed.success) {
          return mcpError(`Invalid input: ${parsed.error.message}`);
        }
        return await toolGenerateSummary(parsed.data, user, db);
      }

      case MCPToolMethods.GET_ROUND_ANALYSIS: {
        const parsed = GetRoundAnalysisInputSchema.safeParse(args);
        if (!parsed.success) {
          return mcpError(`Invalid input: ${parsed.error.message}`);
        }
        return await toolGetRoundSummary(parsed.data, user, db);
      }

      // ----------------------------------------------------------------------
      // Participants
      // ----------------------------------------------------------------------
      case MCPToolMethods.ADD_PARTICIPANT: {
        const parsed = AddParticipantInputSchema.safeParse(args);
        if (!parsed.success) {
          return mcpError(`Invalid input: ${parsed.error.message}`);
        }
        return await toolAddParticipant(parsed.data, user, db);
      }

      case MCPToolMethods.UPDATE_PARTICIPANT: {
        const parsed = UpdateParticipantInputSchema.safeParse(args);
        if (!parsed.success) {
          return mcpError(`Invalid input: ${parsed.error.message}`);
        }
        return await toolUpdateParticipant(parsed.data, user, db);
      }

      case MCPToolMethods.REMOVE_PARTICIPANT: {
        const parsed = RemoveParticipantInputSchema.safeParse(args);
        if (!parsed.success) {
          return mcpError(`Invalid input: ${parsed.error.message}`);
        }
        return await toolRemoveParticipant(parsed.data, user, db);
      }

      // ----------------------------------------------------------------------
      // Models
      // ----------------------------------------------------------------------
      case MCPToolMethods.LIST_MODELS: {
        const parsed = ListModelsInputSchema.safeParse(args);
        if (!parsed.success) {
          return mcpError(`Invalid input: ${parsed.error.message}`);
        }
        return await toolListModels(parsed.data, user);
      }

      default:
        return mcpError(`Tool not implemented: ${toolName}`);
    }
  } catch (error) {
    return mcpError(error instanceof Error ? error.message : 'Tool execution failed');
  }
}

// ============================================================================
// Tool Implementations
// ============================================================================

async function toolCreateThread(
  input: CreateThreadInput,
  user: { id: string },
  db: Awaited<ReturnType<typeof getDbAsync>>,
) {
  const userTier = await getUserTier(user.id);
  const allModels = getAllModels();
  // ✅ PERF: Build Map once for O(1) lookups instead of O(n) find() in loop
  // Key is string to accept user input; value is validated model
  const modelById = new Map<string, (typeof allModels)[number]>(allModels.map(m => [m.id, m]));

  // ✅ FREE ROUND BYPASS: Free users who haven't completed their free round
  // can use ANY models for their first experience.
  const isFreeUserWithFreeRound = userTier === SubscriptionTiers.FREE
    && !(await checkFreeUserHasCompletedRound(user.id));

  // Validate model access (skip for free round users)
  for (const p of input.participants) {
    const model = modelById.get(p.modelId);
    if (!model) {
      throw createError.badRequest(`Model not found: ${p.modelId}`, ErrorContextBuilders.resourceNotFound('model', p.modelId));
    }
    const modelForPricing = getModelForPricing(p.modelId);
    if (!modelForPricing) {
      throw createError.badRequest(`Model pricing not found: ${p.modelId}`, ErrorContextBuilders.resourceNotFound('model', p.modelId));
    }
    if (!isFreeUserWithFreeRound && !canAccessModelByPricing(userTier, modelForPricing)) {
      throw createError.unauthorized(`Model requires higher tier: ${p.modelId}`, ErrorContextBuilders.authorization('model', p.modelId, user.id));
    }
  }

  // If projectId provided, verify ownership
  if (input.projectId) {
    const project = await db.query.chatProject.findFirst({
      where: and(
        eq(tables.chatProject.id, input.projectId),
        eq(tables.chatProject.userId, user.id),
      ),
    });
    if (!project) {
      throw createError.notFound(`Project not found: ${input.projectId}`, ErrorContextBuilders.resourceNotFound('project', input.projectId, user.id));
    }
  }

  const threadId = ulid();
  const slug = `${input.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50)}-${ulid().slice(0, 8).toLowerCase()}`;

  await db.insert(tables.chatThread).values({
    createdAt: new Date(),
    id: threadId,
    isPublic: input.isPublic || false,
    mode: input.mode || DEFAULT_CHAT_MODE,
    projectId: input.projectId || null,
    slug,
    status: ThreadStatuses.ACTIVE,
    title: input.title,
    updatedAt: new Date(),
    userId: user.id,
    version: 1,
  });

  // ✅ PERF: Batch insert all participants in single query instead of sequential inserts
  const now = new Date();
  const participantValues = input.participants
    .filter((p): p is NonNullable<typeof p> => p !== null && p !== undefined)
    .map((p, i) => ({
      createdAt: now,
      id: ulid(),
      isEnabled: true,
      modelId: p.modelId,
      priority: p.priority ?? i,
      role: p.role || null,
      settings: p.systemPrompt ? { systemPrompt: p.systemPrompt } : null,
      threadId,
      updatedAt: now,
    }));

  // Chunked insert to avoid D1 100-parameter limit (10 columns = max 10 rows)
  if (participantValues.length > 0) {
    for (const chunk of chunkForD1Insert(participantValues, 10)) {
      await db.insert(tables.chatParticipant).values(chunk);
    }
  }

  const participantIds = participantValues.map(p => p.id);

  return mcpResult({
    mode: input.mode || DEFAULT_CHAT_MODE,
    participantIds,
    projectId: input.projectId || null,
    slug,
    threadId,
    title: input.title,
  });
}

async function toolGetThread(
  input: GetThreadInput,
  user: { id: string },
  db: Awaited<ReturnType<typeof getDbAsync>>,
) {
  const thread = await db.query.chatThread.findFirst({
    where: eq(tables.chatThread.id, input.threadId),
    with: { participants: true },
  });

  if (!thread) {
    throw createError.notFound('Thread not found', ErrorContextBuilders.resourceNotFound('thread', input.threadId, user.id));
  }
  if (thread.userId !== user.id && !thread.isPublic) {
    throw createError.unauthorized('Access denied', ErrorContextBuilders.authorization('thread', input.threadId, user.id));
  }

  const messages = input.includeMessages !== false
    ? await db.query.chatMessage.findMany({
        limit: input.maxMessages || 50,
        orderBy: [asc(tables.chatMessage.createdAt)],
        where: eq(tables.chatMessage.threadId, input.threadId),
      }).then(dbMessages =>
        dbMessages.map(m => ({
          content: m.parts
            .filter((p): p is { type: 'text'; text: string } => p.type === MessagePartTypes.TEXT)
            .map(p => p.text)
            .join(''),
          id: m.id,
          participantId: m.participantId,
          role: m.role,
          roundNumber: m.roundNumber,
        })),
      )
    : [];

  return mcpResult({
    messages,
    participants: thread.participants.map(p => ({
      id: p.id,
      modelId: p.modelId,
      priority: p.priority,
      role: p.role,
    })),
    thread: {
      id: thread.id,
      isPublic: thread.isPublic,
      mode: thread.mode,
      status: thread.status,
      title: thread.title,
    },
  });
}

async function toolListThreads(
  input: ListThreadsInput,
  user: { id: string },
  db: Awaited<ReturnType<typeof getDbAsync>>,
) {
  // Build where clause
  const filters = [eq(tables.chatThread.userId, user.id)];
  if (input.projectId) {
    filters.push(eq(tables.chatThread.projectId, input.projectId));
  }

  const threads = await db.query.chatThread.findMany({
    limit: input.limit || 20,
    orderBy: [desc(tables.chatThread.updatedAt)],
    where: and(...filters),
    with: { participants: true },
  });

  return mcpResult({
    count: threads.length,
    threads: threads.map(t => ({
      id: t.id,
      mode: t.mode,
      participantCount: t.participants.length,
      projectId: t.projectId,
      title: t.title,
      updatedAt: t.updatedAt.toISOString(),
    })),
    ...(input.projectId && { projectId: input.projectId }),
  });
}

async function toolDeleteThread(
  input: { threadId: string },
  user: { id: string },
  db: Awaited<ReturnType<typeof getDbAsync>>,
) {
  await verifyThreadOwnership(input.threadId, user.id, db);
  await db.delete(tables.chatThread).where(eq(tables.chatThread.id, input.threadId));
  return mcpResult({ deleted: true, threadId: input.threadId });
}

async function toolSendMessage(
  input: SendMessageInput,
  user: { id: string },
  db: Awaited<ReturnType<typeof getDbAsync>>,
) {
  await verifyThreadOwnership(input.threadId, user.id, db);

  const userMessages = await db.query.chatMessage.findMany({
    columns: { id: true },
    where: and(
      eq(tables.chatMessage.threadId, input.threadId),
      eq(tables.chatMessage.role, MessageRoles.USER),
    ),
  });

  const roundNumber = userMessages.length + 1;
  const messageId = ulid();

  await db.insert(tables.chatMessage).values({
    createdAt: new Date(),
    id: messageId,
    metadata: { role: MessageRoles.USER, roundNumber },
    participantId: null,
    parts: [{ text: input.content, type: MessagePartTypes.TEXT }],
    role: MessageRoles.USER,
    roundNumber,
    threadId: input.threadId,
  });

  return mcpResult({
    messageId,
    note: 'Message saved. Call generate_responses to get AI responses.',
    roundNumber,
  });
}

async function toolGenerateResponses(
  input: GenerateResponsesInput,
  user: { id: string },
  db: Awaited<ReturnType<typeof getDbAsync>>,
  env: ApiEnv['Bindings'],
) {
  // ✅ LAZY LOAD AI SDK: Load at function invocation, not module startup
  const { convertToModelMessages, streamText, validateUIMessages } = await getAiSdk();

  await verifyThreadOwnership(input.threadId, user.id, db);

  const participants = await db.query.chatParticipant.findMany({
    orderBy: [asc(tables.chatParticipant.priority)],
    where: and(
      eq(tables.chatParticipant.threadId, input.threadId),
      eq(tables.chatParticipant.isEnabled, true),
    ),
  });

  if (participants.length === 0) {
    throw createError.badRequest('No enabled participants', ErrorContextBuilders.validation('participants'));
  }

  // Omit regenerateRound instead of passing undefined to satisfy exactOptionalPropertyTypes
  const roundResult = await calculateRoundNumber({
    db,
    message: { parts: [{ text: input.messageContent, type: MessagePartTypes.TEXT }], role: MessageRoles.USER },
    participantIndex: DEFAULT_PARTICIPANT_INDEX,
    threadId: input.threadId,
  });

  // Save user message
  const userMessageId = ulid();
  await db.insert(tables.chatMessage).values({
    createdAt: new Date(),
    id: userMessageId,
    metadata: { role: MessageRoles.USER, roundNumber: roundResult.roundNumber },
    participantId: null,
    parts: [{ text: input.messageContent, type: MessagePartTypes.TEXT }],
    role: MessageRoles.USER,
    roundNumber: roundResult.roundNumber,
    threadId: input.threadId,
  });

  // Load context
  const dbMessages = await db.query.chatMessage.findMany({
    orderBy: [asc(tables.chatMessage.roundNumber), asc(tables.chatMessage.createdAt)],
    where: eq(tables.chatMessage.threadId, input.threadId),
  });
  const previousMessages = await chatMessagesToUIMessages(dbMessages);

  initializeOpenRouter(env);
  const client = await openRouterService.getClient();
  const userTier = await getUserTier(user.id);

  // ✅ BILLING: Enforce user has credits before generating responses
  // Estimate ~2 credits per participant for enforcement check
  await enforceCredits(user.id, participants.length * 2, { skipRoundCheck: true });

  const responses: { participantId: string; content: string }[] = [];

  for (let i = 0; i < participants.length; i++) {
    const participant = participants[i];
    if (!participant) {
      continue;
    }

    const allMessages = [...previousMessages, {
      id: userMessageId,
      parts: [{ text: input.messageContent, type: MessagePartTypes.TEXT }],
      role: MessageRoles.USER,
    }];

    const typedMessages = await validateUIMessages({ messages: allMessages });
    const nonEmptyMessages = filterNonEmptyMessages(typedMessages);
    const modelMessages = await convertToModelMessages(nonEmptyMessages);

    const modelInfo = getModelById(participant.modelId);
    const modelContextLength = modelInfo?.context_length || 16000;
    const estimatedInputTokens = typedMessages.length * 200 + 500;
    const maxOutputTokens = getSafeMaxOutputTokens(modelContextLength, estimatedInputTokens, userTier);

    const systemPrompt = participant.settings?.systemPrompt || buildParticipantSystemPrompt(participant.role);
    const supportsTemperature = modelInfo?.supports_temperature ?? true;

    const streamMessageId = ulid();
    const finishResult = await streamText({
      maxOutputTokens,
      messages: modelMessages,
      model: client.chat(participant.modelId),
      system: systemPrompt,
      ...(supportsTemperature && { temperature: participant.settings?.temperature ?? 0.7 }),
      // ✅ STREAMING TIMEOUT: 30 min for MCP operations
      abortSignal: AbortSignal.timeout(AI_TIMEOUT_CONFIG.totalMs),
      maxRetries: AI_RETRY_CONFIG.maxAttempts,
    });

    let fullText = '';
    for await (const chunk of finishResult.textStream) {
      fullText += chunk;
    }

    const usage = await finishResult.usage;
    const finishReason = await finishResult.finishReason;

    await saveStreamedMessage({
      db,
      finishResult: {
        finishReason,
        reasoning: await finishResult.reasoning,
        response: finishResult.response,
        text: fullText,
        usage: { inputTokens: usage?.inputTokens || 0, outputTokens: usage?.outputTokens || 0 },
      },
      messageId: streamMessageId,
      modelId: participant.modelId,
      participantId: participant.id,
      participantIndex: i,
      participantRole: participant.role,
      reasoningDeltas: [],
      roundNumber: roundResult.roundNumber,
      text: fullText,
      threadId: input.threadId,
    });

    // ✅ BILLING: Deduct credits for MCP AI call
    const rawInput = usage?.inputTokens ?? 0;
    const rawOutput = usage?.outputTokens ?? 0;
    const safeInputTokens = Number.isFinite(rawInput) ? rawInput : 0;
    const safeOutputTokens = Number.isFinite(rawOutput) ? rawOutput : 0;
    if (safeInputTokens > 0 || safeOutputTokens > 0) {
      try {
        await finalizeCredits(user.id, `mcp-response-${streamMessageId}`, {
          action: CreditActions.AI_RESPONSE,
          inputTokens: safeInputTokens,
          messageId: streamMessageId,
          modelId: participant.modelId,
          outputTokens: safeOutputTokens,
          threadId: input.threadId,
        });
      } catch (billingError) {
        console.error('[MCP] Billing failed for participant response:', billingError);
      }
    }

    responses.push({ content: fullText, participantId: participant.id });
  }

  return mcpResult({
    responses,
    roundNumber: roundResult.roundNumber,
    userMessageId,
  });
}

async function toolListRounds(
  input: ListRoundsInput,
  user: { id: string },
  db: Awaited<ReturnType<typeof getDbAsync>>,
) {
  await verifyThreadOwnership(input.threadId, user.id, db);

  const messages = await db.query.chatMessage.findMany({
    orderBy: [asc(tables.chatMessage.roundNumber)],
    where: eq(tables.chatMessage.threadId, input.threadId),
  });

  const roundMap = new Map<number, number>();
  for (const m of messages) {
    roundMap.set(m.roundNumber, (roundMap.get(m.roundNumber) || 0) + 1);
  }

  const rounds = Array.from(roundMap.entries()).map(([roundNumber, count]) => ({
    messageCount: count,
    roundNumber,
  }));

  return mcpResult({ rounds, totalRounds: rounds.length });
}

async function toolRegenerateRound(
  input: RegenerateRoundInput,
  user: { id: string },
  db: Awaited<ReturnType<typeof getDbAsync>>,
) {
  await verifyThreadOwnership(input.threadId, user.id, db);

  const cleanup = await handleRoundRegeneration({
    db,
    participantIndex: DEFAULT_PARTICIPANT_INDEX,
    regenerateRound: input.roundNumber,
    threadId: input.threadId,
  });

  return mcpResult({
    deletedMessages: cleanup.deletedMessagesCount,
    note: 'Round cleaned up. Call generate_responses to regenerate.',
    roundNumber: input.roundNumber,
  });
}

async function toolRoundFeedback(
  input: RoundFeedbackInput,
  user: { id: string },
  db: Awaited<ReturnType<typeof getDbAsync>>,
) {
  await verifyThreadOwnership(input.threadId, user.id, db);

  const existing = await db.query.chatRoundFeedback.findFirst({
    where: and(
      eq(tables.chatRoundFeedback.threadId, input.threadId),
      eq(tables.chatRoundFeedback.userId, user.id),
      eq(tables.chatRoundFeedback.roundNumber, input.roundNumber),
    ),
  });

  if (input.feedback === 'none' && existing) {
    await db.delete(tables.chatRoundFeedback).where(eq(tables.chatRoundFeedback.id, existing.id));
  } else if (input.feedback !== 'none') {
    if (existing) {
      await db.update(tables.chatRoundFeedback)
        .set({ feedbackType: input.feedback, updatedAt: new Date() })
        .where(eq(tables.chatRoundFeedback.id, existing.id));
    } else {
      await db.insert(tables.chatRoundFeedback).values({
        createdAt: new Date(),
        feedbackType: input.feedback,
        id: ulid(),
        roundNumber: input.roundNumber,
        threadId: input.threadId,
        updatedAt: new Date(),
        userId: user.id,
      });
    }
  }

  return mcpResult({ feedback: input.feedback, saved: true });
}

async function toolGenerateSummary(
  input: GenerateAnalysisInput,
  user: { id: string },
  db: Awaited<ReturnType<typeof getDbAsync>>,
) {
  await verifyThreadOwnership(input.threadId, user.id, db);

  // Note: Full summary generation requires streaming - return guidance
  return mcpResult({
    note: 'Summary generation requires streaming. Use POST /api/v1/chat/threads/:id/rounds/:roundNumber/analyze instead.',
    roundNumber: input.roundNumber,
    threadId: input.threadId,
  });
}

async function toolGetRoundSummary(
  input: GetRoundAnalysisInput,
  user: { id: string },
  db: Awaited<ReturnType<typeof getDbAsync>>,
) {
  await verifyThreadOwnership(input.threadId, user.id, db);

  const messages = await db.query.chatMessage.findMany({
    orderBy: [desc(tables.chatMessage.createdAt)],
    where: and(
      eq(tables.chatMessage.threadId, input.threadId),
      eq(tables.chatMessage.roundNumber, input.roundNumber),
      eq(tables.chatMessage.role, MessageRoles.ASSISTANT),
    ),
  });

  const moderatorMessage = messages.find((msg) => {
    const metadata = msg.metadata;
    return metadata && typeof metadata === 'object' && 'isModerator' in metadata && metadata.isModerator === true;
  });

  if (!moderatorMessage) {
    return mcpError(`No summary found for round ${input.roundNumber}`);
  }

  const textParts = (moderatorMessage.parts || []).filter(
    (p): p is { type: 'text'; text: string } => p && typeof p === 'object' && 'type' in p && p.type === MessagePartTypes.TEXT,
  );
  const summaryText = textParts.map(p => p.text).join('\n');

  return mcpResult({
    data: { summary: summaryText },
    roundNumber: moderatorMessage.roundNumber,
    status: MessageStatuses.COMPLETE,
    summaryId: moderatorMessage.id,
  });
}

async function toolAddParticipant(
  input: AddParticipantInput,
  user: { id: string },
  db: Awaited<ReturnType<typeof getDbAsync>>,
) {
  await verifyThreadOwnership(input.threadId, user.id, db);
  const participants = await db.query.chatParticipant.findMany({
    where: eq(tables.chatParticipant.threadId, input.threadId),
  });

  if (participants.length >= 10) {
    throw createError.badRequest('Maximum 10 participants allowed', ErrorContextBuilders.validation('participants'));
  }

  const userTier = await getUserTier(user.id);

  // ✅ FREE ROUND BYPASS: Free users who haven't completed their free round
  // can add ANY models for their first experience.
  const isFreeUserWithFreeRound = userTier === SubscriptionTiers.FREE
    && !(await checkFreeUserHasCompletedRound(user.id));

  const model = getAllModels().find(m => m.id === input.modelId);
  if (!model) {
    throw createError.badRequest(`Model not found: ${input.modelId}`, ErrorContextBuilders.resourceNotFound('model', input.modelId));
  }
  const modelForPricing = getModelForPricing(input.modelId);
  if (!modelForPricing) {
    throw createError.badRequest(`Model pricing not found: ${input.modelId}`, ErrorContextBuilders.resourceNotFound('model', input.modelId));
  }
  if (!isFreeUserWithFreeRound && !canAccessModelByPricing(userTier, modelForPricing)) {
    throw createError.unauthorized(`Model requires higher tier: ${input.modelId}`, ErrorContextBuilders.authorization('model', input.modelId, user.id));
  }

  const participantId = ulid();
  await db.insert(tables.chatParticipant).values({
    createdAt: new Date(),
    id: participantId,
    isEnabled: true,
    modelId: input.modelId,
    priority: input.priority ?? participants.length,
    role: input.role || null,
    settings: input.systemPrompt ? { systemPrompt: input.systemPrompt } : null,
    threadId: input.threadId,
    updatedAt: new Date(),
  });

  return mcpResult({ added: true, modelId: input.modelId, participantId });
}

async function toolUpdateParticipant(
  input: UpdateParticipantInput,
  user: { id: string },
  db: Awaited<ReturnType<typeof getDbAsync>>,
) {
  await verifyThreadOwnership(input.threadId, user.id, db);

  const participant = await db.query.chatParticipant.findFirst({
    where: and(
      eq(tables.chatParticipant.id, input.participantId),
      eq(tables.chatParticipant.threadId, input.threadId),
    ),
  });

  if (!participant) {
    throw createError.notFound('Participant not found', ErrorContextBuilders.resourceNotFound('participant', input.participantId));
  }

  const updates = {
    updatedAt: new Date(),
    ...(input.role !== undefined && { role: input.role }),
    ...(input.priority !== undefined && { priority: input.priority }),
    ...(input.systemPrompt !== undefined && {
      settings: { ...participant.settings, systemPrompt: input.systemPrompt },
    }),
  };

  await db.update(tables.chatParticipant).set(updates).where(eq(tables.chatParticipant.id, input.participantId));

  return mcpResult({ participantId: input.participantId, updated: true });
}

async function toolRemoveParticipant(
  input: RemoveParticipantInput,
  user: { id: string },
  db: Awaited<ReturnType<typeof getDbAsync>>,
) {
  await verifyThreadOwnership(input.threadId, user.id, db);

  await db.update(tables.chatParticipant)
    .set({ isEnabled: false, updatedAt: new Date() })
    .where(and(
      eq(tables.chatParticipant.id, input.participantId),
      eq(tables.chatParticipant.threadId, input.threadId),
    ));

  return mcpResult({ participantId: input.participantId, removed: true });
}

async function toolListModels(
  input: ListModelsInput,
  user: { id: string },
) {
  const userTier = await getUserTier(user.id);
  let models = getAllModels();

  if (input.provider) {
    const providerFilter = input.provider.toLowerCase();
    models = models.filter(m => m.provider.toLowerCase() === providerFilter);
  }

  return mcpResult({
    count: models.length,
    models: models.map((m) => {
      const modelForPricing = getModelForPricing(m.id);
      return {
        accessible: modelForPricing ? canAccessModelByPricing(userTier, modelForPricing) : false,
        contextLength: m.context_length,
        id: m.id,
        name: m.name,
        provider: m.provider,
      };
    }),
    userTier,
  });
}

// ============================================================================
// Project Tool Implementations
// ============================================================================

async function toolCreateProject(
  input: CreateProjectInput,
  user: { id: string },
  db: Awaited<ReturnType<typeof getDbAsync>>,
  env: ApiEnv['Bindings'],
) {
  const projectId = ulid();
  const r2FolderPrefix = `projects/${projectId}/`;

  // Determine AutoRAG instance ID based on environment
  const autoragInstanceId
    = env.WEBAPP_ENV === WebAppEnvs.PROD
      ? 'roundtable-rag-prod'
      : env.WEBAPP_ENV === WebAppEnvs.PREVIEW
        ? 'roundtable-rag-preview'
        : 'roundtable-rag-local';

  const [project] = await db
    .insert(tables.chatProject)
    .values({
      autoragInstanceId,
      createdAt: new Date(),
      customInstructions: input.customInstructions || null,
      description: input.description || null,
      id: projectId,
      name: input.name,
      r2FolderPrefix,
      settings: input.settings || null,
      updatedAt: new Date(),
      userId: user.id,
    })
    .returning();

  return mcpResult({
    attachmentCount: 0,
    autoragInstanceId,
    name: project?.name,
    projectId: project?.id,
    threadCount: 0,
  });
}

async function toolGetProject(
  input: GetProjectInput,
  user: { id: string },
  db: Awaited<ReturnType<typeof getDbAsync>>,
) {
  const project = await db.query.chatProject.findFirst({
    where: and(
      eq(tables.chatProject.id, input.projectId),
      eq(tables.chatProject.userId, user.id),
    ),
  });

  if (!project) {
    throw createError.notFound(`Project not found: ${input.projectId}`, ErrorContextBuilders.resourceNotFound('project', input.projectId, user.id));
  }

  // Get counts
  const attachments = await db.query.projectAttachment.findMany({
    columns: { id: true },
    where: eq(tables.projectAttachment.projectId, project.id),
  });

  const threads = await db.query.chatThread.findMany({
    columns: { id: true },
    where: eq(tables.chatThread.projectId, project.id),
  });

  return mcpResult({
    attachmentCount: attachments.length,
    project: {
      autoragInstanceId: project.autoragInstanceId,
      createdAt: project.createdAt.toISOString(),
      customInstructions: project.customInstructions,
      description: project.description,
      id: project.id,
      name: project.name,
      settings: project.settings,
      updatedAt: project.updatedAt.toISOString(),
    },
    threadCount: threads.length,
  });
}

async function toolListProjects(
  input: ListProjectsInput,
  user: { id: string },
  db: Awaited<ReturnType<typeof getDbAsync>>,
) {
  const filters = [eq(tables.chatProject.userId, user.id)];

  if (input.search) {
    filters.push(like(tables.chatProject.name, `%${input.search}%`));
  }

  // ✅ PERF: Fetch projects with relations in single query using Drizzle relational
  const projects = await db.query.chatProject.findMany({
    limit: input.limit || 20,
    orderBy: [desc(tables.chatProject.updatedAt)],
    where: and(...filters),
    with: {
      attachments: {
        columns: { id: true },
      },
      threads: {
        columns: { id: true },
      },
    },
  });

  // Transform to include counts
  const projectsWithCounts = projects.map(project => ({
    attachmentCount: project.attachments?.length ?? 0,
    description: project.description,
    id: project.id,
    name: project.name,
    threadCount: project.threads?.length ?? 0,
    updatedAt: project.updatedAt.toISOString(),
  }));

  return mcpResult({
    count: projectsWithCounts.length,
    projects: projectsWithCounts,
  });
}

async function toolUpdateProject(
  input: UpdateProjectInput,
  user: { id: string },
  db: Awaited<ReturnType<typeof getDbAsync>>,
) {
  // Verify ownership
  const existing = await db.query.chatProject.findFirst({
    where: and(
      eq(tables.chatProject.id, input.projectId),
      eq(tables.chatProject.userId, user.id),
    ),
  });

  if (!existing) {
    throw createError.notFound(`Project not found: ${input.projectId}`, ErrorContextBuilders.resourceNotFound('project', input.projectId, user.id));
  }

  const updates = {
    updatedAt: new Date(),
    ...(input.name !== undefined && { name: input.name }),
    ...(input.description !== undefined && { description: input.description }),
    ...(input.customInstructions !== undefined && { customInstructions: input.customInstructions }),
    ...(input.settings !== undefined && { settings: input.settings }),
  };

  const [updated] = await db
    .update(tables.chatProject)
    .set(updates)
    .where(eq(tables.chatProject.id, input.projectId))
    .returning();

  return mcpResult({
    name: updated?.name,
    projectId: updated?.id,
    updated: true,
  });
}

async function toolDeleteProject(
  input: DeleteProjectInput,
  user: { id: string },
  db: Awaited<ReturnType<typeof getDbAsync>>,
) {
  // Verify ownership
  const project = await db.query.chatProject.findFirst({
    where: and(
      eq(tables.chatProject.id, input.projectId),
      eq(tables.chatProject.userId, user.id),
    ),
  });

  if (!project) {
    throw createError.notFound(`Project not found: ${input.projectId}`, ErrorContextBuilders.resourceNotFound('project', input.projectId, user.id));
  }

  const attachments = await db.query.projectAttachment.findMany({
    columns: { id: true },
    where: eq(tables.projectAttachment.projectId, input.projectId),
  });

  await db.delete(tables.chatProject).where(eq(tables.chatProject.id, input.projectId));

  return mcpResult({
    attachmentsRemoved: attachments.length,
    deleted: true,
    projectId: input.projectId,
  });
}

async function toolListProjectThreads(
  input: ListProjectThreadsInput,
  user: { id: string },
  db: Awaited<ReturnType<typeof getDbAsync>>,
) {
  // Verify project ownership
  const project = await db.query.chatProject.findFirst({
    where: and(
      eq(tables.chatProject.id, input.projectId),
      eq(tables.chatProject.userId, user.id),
    ),
  });

  if (!project) {
    throw createError.notFound(`Project not found: ${input.projectId}`, ErrorContextBuilders.resourceNotFound('project', input.projectId, user.id));
  }

  const threads = await db.query.chatThread.findMany({
    limit: input.limit || 20,
    orderBy: [desc(tables.chatThread.updatedAt)],
    where: eq(tables.chatThread.projectId, input.projectId),
    with: { participants: true },
  });

  return mcpResult({
    count: threads.length,
    projectId: input.projectId,
    threads: threads.map(t => ({
      id: t.id,
      mode: t.mode,
      participantCount: t.participants.length,
      title: t.title,
      updatedAt: t.updatedAt.toISOString(),
    })),
  });
}

// ============================================================================
// Project Attachment Tool Implementations (Reference-based, S3/R2 Best Practice)
// ============================================================================

async function toolListKnowledgeFiles(
  input: ListKnowledgeFilesInput,
  user: { id: string },
  db: Awaited<ReturnType<typeof getDbAsync>>,
) {
  // Verify project ownership
  const project = await db.query.chatProject.findFirst({
    where: and(
      eq(tables.chatProject.id, input.projectId),
      eq(tables.chatProject.userId, user.id),
    ),
  });

  if (!project) {
    throw createError.notFound(`Project not found: ${input.projectId}`, ErrorContextBuilders.resourceNotFound('project', input.projectId, user.id));
  }

  const filters = [eq(tables.projectAttachment.projectId, input.projectId)];
  if (input.status) {
    const validatedStatus = ProjectIndexStatusSchema.parse(input.status);
    filters.push(eq(tables.projectAttachment.indexStatus, validatedStatus));
  }

  const attachments = await db.query.projectAttachment.findMany({
    limit: input.limit || 20,
    orderBy: [desc(tables.projectAttachment.createdAt)],
    where: and(...filters),
    with: {
      upload: true,
    },
  });

  return mcpResult({
    attachments: attachments.map(a => ({
      createdAt: a.createdAt.toISOString(),
      filename: a.upload.filename,
      fileSize: a.upload.fileSize,
      fileType: a.upload.mimeType,
      id: a.id,
      indexStatus: a.indexStatus,
      ragMetadata: a.ragMetadata,
    })),
    count: attachments.length,
    projectId: input.projectId,
  });
}

async function toolDeleteKnowledgeFile(
  input: DeleteKnowledgeFileInput,
  user: { id: string },
  db: Awaited<ReturnType<typeof getDbAsync>>,
  _env: ApiEnv['Bindings'],
) {
  // Verify project ownership
  const project = await db.query.chatProject.findFirst({
    where: and(
      eq(tables.chatProject.id, input.projectId),
      eq(tables.chatProject.userId, user.id),
    ),
  });

  if (!project) {
    throw createError.notFound(`Project not found: ${input.projectId}`, ErrorContextBuilders.resourceNotFound('project', input.projectId, user.id));
  }

  // Get attachment reference
  const attachment = await db.query.projectAttachment.findFirst({
    where: and(
      eq(tables.projectAttachment.id, input.fileId),
      eq(tables.projectAttachment.projectId, input.projectId),
    ),
  });

  if (!attachment) {
    throw createError.notFound(`Attachment not found: ${input.fileId}`, ErrorContextBuilders.resourceNotFound('attachment', input.fileId));
  }

  await db.delete(tables.projectAttachment).where(eq(tables.projectAttachment.id, input.fileId));

  return mcpResult({
    attachmentId: input.fileId,
    projectId: input.projectId,
    removed: true,
  });
}
