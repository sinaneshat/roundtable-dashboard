/**
 * MCP (Model Context Protocol) Handlers
 *
 * Consolidated handlers for MCP protocol endpoints
 * Following backend-patterns.md 3-file architecture
 *
 * @see https://modelcontextprotocol.io/specification
 */

import type { RouteHandler } from '@hono/zod-openapi';
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
import { convertToModelMessages, streamText, validateUIMessages } from 'ai';
import { and, asc, desc, eq, like } from 'drizzle-orm';
import { ulid } from 'ulid';

import { ErrorContextBuilders } from '@/common/error-contexts';
import { createError } from '@/common/error-handling';
import { verifyThreadOwnership } from '@/common/permissions';
import { createHandler, Responses } from '@/core';
import { getDbAsync } from '@/db';
import * as tables from '@/db';
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
  ToolCallResult,
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
// Type Adapters
// ============================================================================

/**
 * Adapter to convert getModelById to ModelForPricing type expected by billing functions
 * Strips Zod .openapi() index signatures from model types
 */
function getModelForPricing(modelId: string): import('@/services/billing').ModelForPricing | undefined {
  const model = getModelById(modelId);
  if (!model)
    return undefined;

  return {
    id: model.id,
    name: model.name,
    pricing: model.pricing,
    context_length: model.context_length,
    pricing_display: model.pricing_display,
    created: model.created,
    provider: model.provider,
    capabilities: model.capabilities,
  };
}

// ============================================================================
// Helper: Build MCP Response
// ============================================================================

function mcpResult(data: unknown): ToolCallResult {
  const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  const structuredContent = isObject(data) ? data : undefined;
  return {
    content: [{ type: MessagePartTypes.TEXT, text }],
    structuredContent,
  };
}

function mcpError(message: string): ToolCallResult {
  return {
    content: [{ type: MessagePartTypes.TEXT, text: message }],
    isError: true,
  };
}

// ============================================================================
// JSON-RPC Handler (Main MCP Protocol Endpoint)
// ============================================================================

export const mcpJsonRpcHandler: RouteHandler<typeof mcpJsonRpcRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateBody: JsonRpcRequestSchema,
    operationName: 'mcpJsonRpc',
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
            protocolVersion: MCP_PROTOCOL_VERSION,
            capabilities: MCP_SERVER_INFO.capabilities,
            serverInfo: { name: MCP_SERVER_INFO.name, version: MCP_SERVER_INFO.version },
          });
        }

        case MCPProtocolMethods.TOOLS_LIST: {
          return jsonRpcResponse({ tools: MCP_TOOLS });
        }

        case MCPProtocolMethods.RESOURCES_LIST: {
          const db = await getDbAsync();
          const threads = await db.query.chatThread.findMany({
            where: eq(tables.chatThread.userId, user.id),
            orderBy: [desc(tables.chatThread.updatedAt)],
            limit: 50,
            with: { participants: true },
          });

          const resources: MCPResource[] = threads.map(t => ({
            uri: `roundtable://thread/${t.id}`,
            name: t.title,
            description: `${t.mode} thread with ${t.participants.length} participants`,
            mimeType: 'application/json',
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
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(thread),
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

          const result = await executeToolInternal(
            params.data.name,
            params.data.arguments || {},
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
    return Responses.ok(c, { tools: MCP_TOOLS, serverInfo: MCP_SERVER_INFO });
  },
);

export const listResourcesHandler: RouteHandler<typeof listResourcesRoute, ApiEnv> = createHandler(
  { auth: 'session', operationName: 'listMCPResources' },
  async (c) => {
    const { user } = c.auth();
    const db = await getDbAsync();

    const threads = await db.query.chatThread.findMany({
      where: eq(tables.chatThread.userId, user.id),
      orderBy: [desc(tables.chatThread.updatedAt)],
      limit: 50,
      with: { participants: true },
    });

    const resources: MCPResource[] = threads.map(t => ({
      uri: `roundtable://thread/${t.id}`,
      name: t.title,
      description: `${t.mode} thread with ${t.participants.length} participants`,
      mimeType: 'application/json',
    }));

    return Responses.ok(c, { resources, count: resources.length });
  },
);

export const callToolHandler: RouteHandler<typeof callToolRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateBody: ToolCallParamsSchema,
    operationName: 'callMCPTool',
  },
  async (c) => {
    const { user } = c.auth();
    const { name, arguments: args } = c.validated.body;
    const startTime = Date.now();

    const result = await executeToolInternal(name, args || {}, user, c.env);

    return Responses.ok(c, {
      ...result,
      _meta: { toolName: name, executionTimeMs: Date.now() - startTime },
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

async function executeToolInternal(
  toolName: string,
  args: Record<string, unknown>,
  user: { id: string },
  env: ApiEnv['Bindings'],
): Promise<ToolCallResult> {
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
        if (!parsed.success)
          return mcpError(`Invalid input: ${parsed.error.message}`);
        return await toolCreateThread(parsed.data, user, db);
      }

      case MCPToolMethods.GET_THREAD: {
        const parsed = GetThreadInputSchema.safeParse(args);
        if (!parsed.success)
          return mcpError(`Invalid input: ${parsed.error.message}`);
        return await toolGetThread(parsed.data, user, db);
      }

      case MCPToolMethods.LIST_THREADS: {
        const parsed = ListThreadsInputSchema.safeParse(args);
        if (!parsed.success)
          return mcpError(`Invalid input: ${parsed.error.message}`);
        return await toolListThreads(parsed.data, user, db);
      }

      case MCPToolMethods.DELETE_THREAD: {
        const parsed = DeleteThreadInputSchema.safeParse(args);
        if (!parsed.success)
          return mcpError(`Invalid input: ${parsed.error.message}`);
        return await toolDeleteThread(parsed.data, user, db);
      }

      // ----------------------------------------------------------------------
      // Project Management
      // ----------------------------------------------------------------------
      case MCPToolMethods.CREATE_PROJECT: {
        const parsed = CreateProjectInputSchema.safeParse(args);
        if (!parsed.success)
          return mcpError(`Invalid input: ${parsed.error.message}`);
        return await toolCreateProject(parsed.data, user, db, env);
      }

      case MCPToolMethods.GET_PROJECT: {
        const parsed = GetProjectInputSchema.safeParse(args);
        if (!parsed.success)
          return mcpError(`Invalid input: ${parsed.error.message}`);
        return await toolGetProject(parsed.data, user, db);
      }

      case MCPToolMethods.LIST_PROJECTS: {
        const parsed = ListProjectsInputSchema.safeParse(args);
        if (!parsed.success)
          return mcpError(`Invalid input: ${parsed.error.message}`);
        return await toolListProjects(parsed.data, user, db);
      }

      case MCPToolMethods.UPDATE_PROJECT: {
        const parsed = UpdateProjectInputSchema.safeParse(args);
        if (!parsed.success)
          return mcpError(`Invalid input: ${parsed.error.message}`);
        return await toolUpdateProject(parsed.data, user, db);
      }

      case MCPToolMethods.DELETE_PROJECT: {
        const parsed = DeleteProjectInputSchema.safeParse(args);
        if (!parsed.success)
          return mcpError(`Invalid input: ${parsed.error.message}`);
        return await toolDeleteProject(parsed.data, user, db, env);
      }

      case MCPToolMethods.LIST_PROJECT_THREADS: {
        const parsed = ListProjectThreadsInputSchema.safeParse(args);
        if (!parsed.success)
          return mcpError(`Invalid input: ${parsed.error.message}`);
        return await toolListProjectThreads(parsed.data, user, db);
      }

      // ----------------------------------------------------------------------
      // Knowledge Files
      // ----------------------------------------------------------------------
      case MCPToolMethods.LIST_KNOWLEDGE_FILES: {
        const parsed = ListKnowledgeFilesInputSchema.safeParse(args);
        if (!parsed.success)
          return mcpError(`Invalid input: ${parsed.error.message}`);
        return await toolListKnowledgeFiles(parsed.data, user, db);
      }

      case MCPToolMethods.DELETE_KNOWLEDGE_FILE: {
        const parsed = DeleteKnowledgeFileInputSchema.safeParse(args);
        if (!parsed.success)
          return mcpError(`Invalid input: ${parsed.error.message}`);
        return await toolDeleteKnowledgeFile(parsed.data, user, db, env);
      }

      // ----------------------------------------------------------------------
      // Messages & Responses
      // ----------------------------------------------------------------------
      case MCPToolMethods.SEND_MESSAGE: {
        const parsed = SendMessageInputSchema.safeParse(args);
        if (!parsed.success)
          return mcpError(`Invalid input: ${parsed.error.message}`);
        return await toolSendMessage(parsed.data, user, db);
      }

      case MCPToolMethods.GENERATE_RESPONSES: {
        const parsed = GenerateResponsesInputSchema.safeParse(args);
        if (!parsed.success)
          return mcpError(`Invalid input: ${parsed.error.message}`);
        return await toolGenerateResponses(parsed.data, user, db, env);
      }

      // ----------------------------------------------------------------------
      // Rounds
      // ----------------------------------------------------------------------
      case MCPToolMethods.LIST_ROUNDS: {
        const parsed = ListRoundsInputSchema.safeParse(args);
        if (!parsed.success)
          return mcpError(`Invalid input: ${parsed.error.message}`);
        return await toolListRounds(parsed.data, user, db);
      }

      case MCPToolMethods.REGENERATE_ROUND: {
        const parsed = RegenerateRoundInputSchema.safeParse(args);
        if (!parsed.success)
          return mcpError(`Invalid input: ${parsed.error.message}`);
        return await toolRegenerateRound(parsed.data, user, db, env);
      }

      case MCPToolMethods.ROUND_FEEDBACK: {
        const parsed = RoundFeedbackInputSchema.safeParse(args);
        if (!parsed.success)
          return mcpError(`Invalid input: ${parsed.error.message}`);
        return await toolRoundFeedback(parsed.data, user, db);
      }

      // ----------------------------------------------------------------------
      // Summary
      // ----------------------------------------------------------------------
      case MCPToolMethods.GENERATE_ANALYSIS: {
        const parsed = GenerateAnalysisInputSchema.safeParse(args);
        if (!parsed.success)
          return mcpError(`Invalid input: ${parsed.error.message}`);
        return await toolGenerateSummary(parsed.data, user, db);
      }

      case MCPToolMethods.GET_ROUND_ANALYSIS: {
        const parsed = GetRoundAnalysisInputSchema.safeParse(args);
        if (!parsed.success)
          return mcpError(`Invalid input: ${parsed.error.message}`);
        return await toolGetRoundSummary(parsed.data, user, db);
      }

      // ----------------------------------------------------------------------
      // Participants
      // ----------------------------------------------------------------------
      case MCPToolMethods.ADD_PARTICIPANT: {
        const parsed = AddParticipantInputSchema.safeParse(args);
        if (!parsed.success)
          return mcpError(`Invalid input: ${parsed.error.message}`);
        return await toolAddParticipant(parsed.data, user, db);
      }

      case MCPToolMethods.UPDATE_PARTICIPANT: {
        const parsed = UpdateParticipantInputSchema.safeParse(args);
        if (!parsed.success)
          return mcpError(`Invalid input: ${parsed.error.message}`);
        return await toolUpdateParticipant(parsed.data, user, db);
      }

      case MCPToolMethods.REMOVE_PARTICIPANT: {
        const parsed = RemoveParticipantInputSchema.safeParse(args);
        if (!parsed.success)
          return mcpError(`Invalid input: ${parsed.error.message}`);
        return await toolRemoveParticipant(parsed.data, user, db);
      }

      // ----------------------------------------------------------------------
      // Models
      // ----------------------------------------------------------------------
      case MCPToolMethods.LIST_MODELS: {
        const parsed = ListModelsInputSchema.safeParse(args);
        if (!parsed.success)
          return mcpError(`Invalid input: ${parsed.error.message}`);
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
): Promise<ToolCallResult> {
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
    if (!model)
      throw createError.badRequest(`Model not found: ${p.modelId}`, ErrorContextBuilders.resourceNotFound('model', p.modelId));
    const modelForPricing = getModelForPricing(p.modelId);
    if (!modelForPricing)
      throw createError.badRequest(`Model pricing not found: ${p.modelId}`, ErrorContextBuilders.resourceNotFound('model', p.modelId));
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
    if (!project)
      throw createError.notFound(`Project not found: ${input.projectId}`, ErrorContextBuilders.resourceNotFound('project', input.projectId, user.id));
  }

  const threadId = ulid();
  const slug = `${input.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50)}-${ulid().slice(0, 8).toLowerCase()}`;

  await db.insert(tables.chatThread).values({
    id: threadId,
    userId: user.id,
    projectId: input.projectId || null,
    title: input.title,
    slug,
    mode: input.mode || DEFAULT_CHAT_MODE,
    status: ThreadStatuses.ACTIVE,
    isPublic: input.isPublic || false,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // ✅ PERF: Batch insert all participants in single query instead of sequential inserts
  const now = new Date();
  const participantValues = input.participants
    .filter((p): p is NonNullable<typeof p> => p !== null && p !== undefined)
    .map((p, i) => ({
      id: ulid(),
      threadId,
      modelId: p.modelId,
      role: p.role || null,
      priority: p.priority ?? i,
      isEnabled: true,
      settings: p.systemPrompt ? { systemPrompt: p.systemPrompt } : null,
      createdAt: now,
      updatedAt: now,
    }));

  if (participantValues.length > 0) {
    await db.insert(tables.chatParticipant).values(participantValues);
  }

  const participantIds = participantValues.map(p => p.id);

  return mcpResult({
    threadId,
    slug,
    title: input.title,
    mode: input.mode || DEFAULT_CHAT_MODE,
    projectId: input.projectId || null,
    participantIds,
  });
}

async function toolGetThread(
  input: GetThreadInput,
  user: { id: string },
  db: Awaited<ReturnType<typeof getDbAsync>>,
): Promise<ToolCallResult> {
  const thread = await db.query.chatThread.findFirst({
    where: eq(tables.chatThread.id, input.threadId),
    with: { participants: true },
  });

  if (!thread)
    throw createError.notFound('Thread not found', ErrorContextBuilders.resourceNotFound('thread', input.threadId, user.id));
  if (thread.userId !== user.id && !thread.isPublic) {
    throw createError.unauthorized('Access denied', ErrorContextBuilders.authorization('thread', input.threadId, user.id));
  }

  const messages = input.includeMessages !== false
    ? await db.query.chatMessage.findMany({
        where: eq(tables.chatMessage.threadId, input.threadId),
        orderBy: [asc(tables.chatMessage.createdAt)],
        limit: input.maxMessages || 50,
      }).then(dbMessages =>
        dbMessages.map(m => ({
          id: m.id,
          role: m.role,
          content: m.parts
            .filter((p): p is { type: 'text'; text: string } => p.type === MessagePartTypes.TEXT)
            .map(p => p.text)
            .join(''),
          roundNumber: m.roundNumber,
          participantId: m.participantId,
        })),
      )
    : [];

  return mcpResult({
    thread: {
      id: thread.id,
      title: thread.title,
      mode: thread.mode,
      status: thread.status,
      isPublic: thread.isPublic,
    },
    participants: thread.participants.map(p => ({
      id: p.id,
      modelId: p.modelId,
      role: p.role,
      priority: p.priority,
    })),
    messages,
  });
}

async function toolListThreads(
  input: ListThreadsInput,
  user: { id: string },
  db: Awaited<ReturnType<typeof getDbAsync>>,
): Promise<ToolCallResult> {
  // Build where clause
  const filters = [eq(tables.chatThread.userId, user.id)];
  if (input.projectId) {
    filters.push(eq(tables.chatThread.projectId, input.projectId));
  }

  const threads = await db.query.chatThread.findMany({
    where: and(...filters),
    orderBy: [desc(tables.chatThread.updatedAt)],
    limit: input.limit || 20,
    with: { participants: true },
  });

  return mcpResult({
    threads: threads.map(t => ({
      id: t.id,
      title: t.title,
      mode: t.mode,
      projectId: t.projectId,
      participantCount: t.participants.length,
      updatedAt: t.updatedAt.toISOString(),
    })),
    count: threads.length,
    ...(input.projectId && { projectId: input.projectId }),
  });
}

async function toolDeleteThread(
  input: { threadId: string },
  user: { id: string },
  db: Awaited<ReturnType<typeof getDbAsync>>,
): Promise<ToolCallResult> {
  await verifyThreadOwnership(input.threadId, user.id, db);
  await db.delete(tables.chatThread).where(eq(tables.chatThread.id, input.threadId));
  return mcpResult({ deleted: true, threadId: input.threadId });
}

async function toolSendMessage(
  input: SendMessageInput,
  user: { id: string },
  db: Awaited<ReturnType<typeof getDbAsync>>,
): Promise<ToolCallResult> {
  await verifyThreadOwnership(input.threadId, user.id, db);

  const userMessages = await db.query.chatMessage.findMany({
    where: and(
      eq(tables.chatMessage.threadId, input.threadId),
      eq(tables.chatMessage.role, MessageRoles.USER),
    ),
    columns: { id: true },
  });

  const roundNumber = userMessages.length + 1;
  const messageId = ulid();

  await db.insert(tables.chatMessage).values({
    id: messageId,
    threadId: input.threadId,
    role: MessageRoles.USER,
    parts: [{ type: MessagePartTypes.TEXT, text: input.content }],
    participantId: null,
    roundNumber,
    metadata: { role: MessageRoles.USER, roundNumber },
    createdAt: new Date(),
  });

  return mcpResult({
    messageId,
    roundNumber,
    note: 'Message saved. Call generate_responses to get AI responses.',
  });
}

async function toolGenerateResponses(
  input: GenerateResponsesInput,
  user: { id: string },
  db: Awaited<ReturnType<typeof getDbAsync>>,
  env: ApiEnv['Bindings'],
): Promise<ToolCallResult> {
  await verifyThreadOwnership(input.threadId, user.id, db);

  const participants = await db.query.chatParticipant.findMany({
    where: and(
      eq(tables.chatParticipant.threadId, input.threadId),
      eq(tables.chatParticipant.isEnabled, true),
    ),
    orderBy: [asc(tables.chatParticipant.priority)],
  });

  if (participants.length === 0) {
    throw createError.badRequest('No enabled participants', ErrorContextBuilders.validation('participants'));
  }

  const roundResult = await calculateRoundNumber({
    threadId: input.threadId,
    participantIndex: DEFAULT_PARTICIPANT_INDEX,
    message: { role: MessageRoles.USER, parts: [{ type: MessagePartTypes.TEXT, text: input.messageContent }] },
    regenerateRound: undefined,
    db,
  });

  // Save user message
  const userMessageId = ulid();
  await db.insert(tables.chatMessage).values({
    id: userMessageId,
    threadId: input.threadId,
    role: MessageRoles.USER,
    parts: [{ type: MessagePartTypes.TEXT, text: input.messageContent }],
    participantId: null,
    roundNumber: roundResult.roundNumber,
    metadata: { role: MessageRoles.USER, roundNumber: roundResult.roundNumber },
    createdAt: new Date(),
  });

  // Load context
  const dbMessages = await db.query.chatMessage.findMany({
    where: eq(tables.chatMessage.threadId, input.threadId),
    orderBy: [asc(tables.chatMessage.roundNumber), asc(tables.chatMessage.createdAt)],
  });
  const previousMessages = await chatMessagesToUIMessages(dbMessages);

  initializeOpenRouter(env);
  const client = openRouterService.getClient();
  const userTier = await getUserTier(user.id);

  // ✅ BILLING: Enforce user has credits before generating responses
  // Estimate ~2 credits per participant for enforcement check
  await enforceCredits(user.id, participants.length * 2, { skipRoundCheck: true });

  const responses: Array<{ participantId: string; content: string }> = [];

  for (let i = 0; i < participants.length; i++) {
    const participant = participants[i];
    if (!participant)
      continue;

    const allMessages = [...previousMessages, {
      id: userMessageId,
      role: MessageRoles.USER,
      parts: [{ type: MessagePartTypes.TEXT, text: input.messageContent }],
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
      model: client.chat(participant.modelId),
      system: systemPrompt,
      messages: modelMessages,
      maxOutputTokens,
      ...(supportsTemperature && { temperature: participant.settings?.temperature ?? 0.7 }),
      maxRetries: AI_RETRY_CONFIG.maxAttempts,
      // ✅ STREAMING TIMEOUT: 30 min for MCP operations
      abortSignal: AbortSignal.timeout(AI_TIMEOUT_CONFIG.totalMs),
    });

    let fullText = '';
    for await (const chunk of finishResult.textStream) {
      fullText += chunk;
    }

    const usage = await finishResult.usage;
    const finishReason = await finishResult.finishReason;

    await saveStreamedMessage({
      messageId: streamMessageId,
      threadId: input.threadId,
      participantId: participant.id,
      participantIndex: i,
      participantRole: participant.role,
      modelId: participant.modelId,
      roundNumber: roundResult.roundNumber,
      text: fullText,
      reasoningDeltas: [],
      finishResult: {
        text: fullText,
        usage: { inputTokens: usage?.inputTokens || 0, outputTokens: usage?.outputTokens || 0 },
        finishReason,
        response: finishResult.response,
        reasoning: await finishResult.reasoning,
      },
      db,
    });

    // ✅ BILLING: Deduct credits for MCP AI call
    const rawInput = usage?.inputTokens ?? 0;
    const rawOutput = usage?.outputTokens ?? 0;
    const safeInputTokens = Number.isFinite(rawInput) ? rawInput : 0;
    const safeOutputTokens = Number.isFinite(rawOutput) ? rawOutput : 0;
    if (safeInputTokens > 0 || safeOutputTokens > 0) {
      try {
        await finalizeCredits(user.id, `mcp-response-${streamMessageId}`, {
          inputTokens: safeInputTokens,
          outputTokens: safeOutputTokens,
          action: CreditActions.AI_RESPONSE,
          threadId: input.threadId,
          messageId: streamMessageId,
          modelId: participant.modelId,
        });
      } catch (billingError) {
        console.error('[MCP] Billing failed for participant response:', billingError);
      }
    }

    responses.push({ participantId: participant.id, content: fullText });
  }

  return mcpResult({
    roundNumber: roundResult.roundNumber,
    userMessageId,
    responses,
  });
}

async function toolListRounds(
  input: ListRoundsInput,
  user: { id: string },
  db: Awaited<ReturnType<typeof getDbAsync>>,
): Promise<ToolCallResult> {
  await verifyThreadOwnership(input.threadId, user.id, db);

  const messages = await db.query.chatMessage.findMany({
    where: eq(tables.chatMessage.threadId, input.threadId),
    orderBy: [asc(tables.chatMessage.roundNumber)],
  });

  const roundMap = new Map<number, number>();
  for (const m of messages) {
    roundMap.set(m.roundNumber, (roundMap.get(m.roundNumber) || 0) + 1);
  }

  const rounds = Array.from(roundMap.entries()).map(([roundNumber, count]) => ({
    roundNumber,
    messageCount: count,
  }));

  return mcpResult({ rounds, totalRounds: rounds.length });
}

async function toolRegenerateRound(
  input: RegenerateRoundInput,
  user: { id: string },
  db: Awaited<ReturnType<typeof getDbAsync>>,
  _env: ApiEnv['Bindings'],
): Promise<ToolCallResult> {
  await verifyThreadOwnership(input.threadId, user.id, db);

  const cleanup = await handleRoundRegeneration({
    threadId: input.threadId,
    regenerateRound: input.roundNumber,
    participantIndex: DEFAULT_PARTICIPANT_INDEX,
    db,
  });

  return mcpResult({
    roundNumber: input.roundNumber,
    deletedMessages: cleanup.deletedMessagesCount,
    note: 'Round cleaned up. Call generate_responses to regenerate.',
  });
}

async function toolRoundFeedback(
  input: RoundFeedbackInput,
  user: { id: string },
  db: Awaited<ReturnType<typeof getDbAsync>>,
): Promise<ToolCallResult> {
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

  return mcpResult({ feedback: input.feedback, saved: true });
}

async function toolGenerateSummary(
  input: GenerateAnalysisInput,
  user: { id: string },
  db: Awaited<ReturnType<typeof getDbAsync>>,
): Promise<ToolCallResult> {
  await verifyThreadOwnership(input.threadId, user.id, db);

  // Note: Full summary generation requires streaming - return guidance
  return mcpResult({
    note: 'Summary generation requires streaming. Use POST /api/v1/chat/threads/:id/rounds/:roundNumber/analyze instead.',
    threadId: input.threadId,
    roundNumber: input.roundNumber,
  });
}

async function toolGetRoundSummary(
  input: GetRoundAnalysisInput,
  user: { id: string },
  db: Awaited<ReturnType<typeof getDbAsync>>,
): Promise<ToolCallResult> {
  await verifyThreadOwnership(input.threadId, user.id, db);

  const messages = await db.query.chatMessage.findMany({
    where: and(
      eq(tables.chatMessage.threadId, input.threadId),
      eq(tables.chatMessage.roundNumber, input.roundNumber),
      eq(tables.chatMessage.role, MessageRoles.ASSISTANT),
    ),
    orderBy: [desc(tables.chatMessage.createdAt)],
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
    summaryId: moderatorMessage.id,
    roundNumber: moderatorMessage.roundNumber,
    status: MessageStatuses.COMPLETE,
    data: { summary: summaryText },
  });
}

async function toolAddParticipant(
  input: AddParticipantInput,
  user: { id: string },
  db: Awaited<ReturnType<typeof getDbAsync>>,
): Promise<ToolCallResult> {
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
  if (!model)
    throw createError.badRequest(`Model not found: ${input.modelId}`, ErrorContextBuilders.resourceNotFound('model', input.modelId));
  const modelForPricing = getModelForPricing(input.modelId);
  if (!modelForPricing)
    throw createError.badRequest(`Model pricing not found: ${input.modelId}`, ErrorContextBuilders.resourceNotFound('model', input.modelId));
  if (!isFreeUserWithFreeRound && !canAccessModelByPricing(userTier, modelForPricing)) {
    throw createError.unauthorized(`Model requires higher tier: ${input.modelId}`, ErrorContextBuilders.authorization('model', input.modelId, user.id));
  }

  const participantId = ulid();
  await db.insert(tables.chatParticipant).values({
    id: participantId,
    threadId: input.threadId,
    modelId: input.modelId,
    role: input.role || null,
    priority: input.priority ?? participants.length,
    isEnabled: true,
    settings: input.systemPrompt ? { systemPrompt: input.systemPrompt } : null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return mcpResult({ participantId, modelId: input.modelId, added: true });
}

async function toolUpdateParticipant(
  input: UpdateParticipantInput,
  user: { id: string },
  db: Awaited<ReturnType<typeof getDbAsync>>,
): Promise<ToolCallResult> {
  await verifyThreadOwnership(input.threadId, user.id, db);

  const participant = await db.query.chatParticipant.findFirst({
    where: and(
      eq(tables.chatParticipant.id, input.participantId),
      eq(tables.chatParticipant.threadId, input.threadId),
    ),
  });

  if (!participant)
    throw createError.notFound('Participant not found', ErrorContextBuilders.resourceNotFound('participant', input.participantId));

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
): Promise<ToolCallResult> {
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
): Promise<ToolCallResult> {
  const userTier = await getUserTier(user.id);
  let models = getAllModels();

  if (input.provider) {
    const providerFilter = input.provider.toLowerCase();
    models = models.filter(m => m.provider.toLowerCase() === providerFilter);
  }

  return mcpResult({
    models: models.map((m) => {
      const modelForPricing = getModelForPricing(m.id);
      return {
        id: m.id,
        name: m.name,
        provider: m.provider,
        contextLength: m.context_length,
        accessible: modelForPricing ? canAccessModelByPricing(userTier, modelForPricing) : false,
      };
    }),
    count: models.length,
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
): Promise<ToolCallResult> {
  const projectId = ulid();
  const r2FolderPrefix = `projects/${projectId}/`;

  // Determine AutoRAG instance ID based on environment
  const autoragInstanceId
    = env.WEBAPP_ENV === 'prod'
      ? 'roundtable-rag-prod'
      : env.WEBAPP_ENV === 'preview'
        ? 'roundtable-rag-preview'
        : 'roundtable-rag-local';

  const [project] = await db
    .insert(tables.chatProject)
    .values({
      id: projectId,
      userId: user.id,
      name: input.name,
      description: input.description || null,
      customInstructions: input.customInstructions || null,
      autoragInstanceId,
      r2FolderPrefix,
      settings: input.settings || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  return mcpResult({
    projectId: project?.id,
    name: project?.name,
    autoragInstanceId,
    attachmentCount: 0,
    threadCount: 0,
  });
}

async function toolGetProject(
  input: GetProjectInput,
  user: { id: string },
  db: Awaited<ReturnType<typeof getDbAsync>>,
): Promise<ToolCallResult> {
  const project = await db.query.chatProject.findFirst({
    where: and(
      eq(tables.chatProject.id, input.projectId),
      eq(tables.chatProject.userId, user.id),
    ),
  });

  if (!project)
    throw createError.notFound(`Project not found: ${input.projectId}`, ErrorContextBuilders.resourceNotFound('project', input.projectId, user.id));

  // Get counts
  const attachments = await db.query.projectAttachment.findMany({
    where: eq(tables.projectAttachment.projectId, project.id),
    columns: { id: true },
  });

  const threads = await db.query.chatThread.findMany({
    where: eq(tables.chatThread.projectId, project.id),
    columns: { id: true },
  });

  return mcpResult({
    project: {
      id: project.id,
      name: project.name,
      description: project.description,
      customInstructions: project.customInstructions,
      autoragInstanceId: project.autoragInstanceId,
      settings: project.settings,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
    },
    attachmentCount: attachments.length,
    threadCount: threads.length,
  });
}

async function toolListProjects(
  input: ListProjectsInput,
  user: { id: string },
  db: Awaited<ReturnType<typeof getDbAsync>>,
): Promise<ToolCallResult> {
  const filters = [eq(tables.chatProject.userId, user.id)];

  if (input.search) {
    filters.push(like(tables.chatProject.name, `%${input.search}%`));
  }

  // ✅ PERF: Fetch projects with relations in single query using Drizzle relational
  const projects = await db.query.chatProject.findMany({
    where: and(...filters),
    orderBy: [desc(tables.chatProject.updatedAt)],
    limit: input.limit || 20,
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
    id: project.id,
    name: project.name,
    description: project.description,
    attachmentCount: project.attachments?.length ?? 0,
    threadCount: project.threads?.length ?? 0,
    updatedAt: project.updatedAt.toISOString(),
  }));

  return mcpResult({
    projects: projectsWithCounts,
    count: projectsWithCounts.length,
  });
}

async function toolUpdateProject(
  input: UpdateProjectInput,
  user: { id: string },
  db: Awaited<ReturnType<typeof getDbAsync>>,
): Promise<ToolCallResult> {
  // Verify ownership
  const existing = await db.query.chatProject.findFirst({
    where: and(
      eq(tables.chatProject.id, input.projectId),
      eq(tables.chatProject.userId, user.id),
    ),
  });

  if (!existing)
    throw createError.notFound(`Project not found: ${input.projectId}`, ErrorContextBuilders.resourceNotFound('project', input.projectId, user.id));

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
    projectId: updated?.id,
    name: updated?.name,
    updated: true,
  });
}

async function toolDeleteProject(
  input: DeleteProjectInput,
  user: { id: string },
  db: Awaited<ReturnType<typeof getDbAsync>>,
  _env: ApiEnv['Bindings'],
): Promise<ToolCallResult> {
  // Verify ownership
  const project = await db.query.chatProject.findFirst({
    where: and(
      eq(tables.chatProject.id, input.projectId),
      eq(tables.chatProject.userId, user.id),
    ),
  });

  if (!project)
    throw createError.notFound(`Project not found: ${input.projectId}`, ErrorContextBuilders.resourceNotFound('project', input.projectId, user.id));

  const attachments = await db.query.projectAttachment.findMany({
    where: eq(tables.projectAttachment.projectId, input.projectId),
    columns: { id: true },
  });

  await db.delete(tables.chatProject).where(eq(tables.chatProject.id, input.projectId));

  return mcpResult({
    projectId: input.projectId,
    deleted: true,
    attachmentsRemoved: attachments.length,
  });
}

async function toolListProjectThreads(
  input: ListProjectThreadsInput,
  user: { id: string },
  db: Awaited<ReturnType<typeof getDbAsync>>,
): Promise<ToolCallResult> {
  // Verify project ownership
  const project = await db.query.chatProject.findFirst({
    where: and(
      eq(tables.chatProject.id, input.projectId),
      eq(tables.chatProject.userId, user.id),
    ),
  });

  if (!project)
    throw createError.notFound(`Project not found: ${input.projectId}`, ErrorContextBuilders.resourceNotFound('project', input.projectId, user.id));

  const threads = await db.query.chatThread.findMany({
    where: eq(tables.chatThread.projectId, input.projectId),
    orderBy: [desc(tables.chatThread.updatedAt)],
    limit: input.limit || 20,
    with: { participants: true },
  });

  return mcpResult({
    projectId: input.projectId,
    threads: threads.map(t => ({
      id: t.id,
      title: t.title,
      mode: t.mode,
      participantCount: t.participants.length,
      updatedAt: t.updatedAt.toISOString(),
    })),
    count: threads.length,
  });
}

// ============================================================================
// Project Attachment Tool Implementations (Reference-based, S3/R2 Best Practice)
// ============================================================================

async function toolListKnowledgeFiles(
  input: ListKnowledgeFilesInput,
  user: { id: string },
  db: Awaited<ReturnType<typeof getDbAsync>>,
): Promise<ToolCallResult> {
  // Verify project ownership
  const project = await db.query.chatProject.findFirst({
    where: and(
      eq(tables.chatProject.id, input.projectId),
      eq(tables.chatProject.userId, user.id),
    ),
  });

  if (!project)
    throw createError.notFound(`Project not found: ${input.projectId}`, ErrorContextBuilders.resourceNotFound('project', input.projectId, user.id));

  const filters = [eq(tables.projectAttachment.projectId, input.projectId)];
  if (input.status) {
    const validatedStatus = ProjectIndexStatusSchema.parse(input.status);
    filters.push(eq(tables.projectAttachment.indexStatus, validatedStatus));
  }

  const attachments = await db.query.projectAttachment.findMany({
    where: and(...filters),
    orderBy: [desc(tables.projectAttachment.createdAt)],
    limit: input.limit || 20,
    with: {
      upload: true,
    },
  });

  return mcpResult({
    projectId: input.projectId,
    attachments: attachments.map(a => ({
      id: a.id,
      filename: a.upload.filename,
      fileSize: a.upload.fileSize,
      fileType: a.upload.mimeType,
      indexStatus: a.indexStatus,
      ragMetadata: a.ragMetadata,
      createdAt: a.createdAt.toISOString(),
    })),
    count: attachments.length,
  });
}

async function toolDeleteKnowledgeFile(
  input: DeleteKnowledgeFileInput,
  user: { id: string },
  db: Awaited<ReturnType<typeof getDbAsync>>,
  _env: ApiEnv['Bindings'],
): Promise<ToolCallResult> {
  // Verify project ownership
  const project = await db.query.chatProject.findFirst({
    where: and(
      eq(tables.chatProject.id, input.projectId),
      eq(tables.chatProject.userId, user.id),
    ),
  });

  if (!project)
    throw createError.notFound(`Project not found: ${input.projectId}`, ErrorContextBuilders.resourceNotFound('project', input.projectId, user.id));

  // Get attachment reference
  const attachment = await db.query.projectAttachment.findFirst({
    where: and(
      eq(tables.projectAttachment.id, input.fileId),
      eq(tables.projectAttachment.projectId, input.projectId),
    ),
  });

  if (!attachment)
    throw createError.notFound(`Attachment not found: ${input.fileId}`, ErrorContextBuilders.resourceNotFound('attachment', input.fileId));

  await db.delete(tables.projectAttachment).where(eq(tables.projectAttachment.id, input.fileId));

  return mcpResult({
    attachmentId: input.fileId,
    projectId: input.projectId,
    removed: true,
  });
}
