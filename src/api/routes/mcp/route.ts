/**
 * MCP (Model Context Protocol) Route Definitions
 *
 * OpenAPI route definitions for MCP server endpoints
 * Following established patterns from chat/route.ts and models/route.ts
 *
 * MCP Protocol Reference: https://modelcontextprotocol.io/introduction
 */

import { createRoute } from '@hono/zod-openapi';
import * as HttpStatusCodes from 'stoker/http-status-codes';

import { ApiErrorResponseSchema } from '@/api/core/schemas';

import {
  AddParticipantInputSchema,
  CreateThreadInputSchema,
  GetThreadInputSchema,
  ListModelsInputSchema,
  MCPResourcesListResponseSchema,
  MCPToolCallResponseSchema,
  MCPToolsListResponseSchema,
  SendMessageInputSchema,
} from './schema';

// ============================================================================
// MCP Server Discovery Routes
// ============================================================================

/**
 * List Available MCP Tools
 * Returns all tools that can be called via MCP protocol
 *
 * @auth API Key (x-api-key header)
 * @returns List of available MCP tools with their schemas
 */
export const listToolsRoute = createRoute({
  method: 'get',
  path: '/mcp/tools',
  tags: ['mcp'],
  summary: 'List available MCP tools',
  description: 'Returns all tools available via the MCP protocol for AI model integration',
  security: [
    { ApiKeyAuth: [] }, // API key authentication via x-api-key header
  ],
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'List of available MCP tools',
      content: {
        'application/json': {
          schema: MCPToolsListResponseSchema,
        },
      },
    },
    [HttpStatusCodes.UNAUTHORIZED]: {
      description: 'Missing or invalid API key',
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
  },
});

/**
 * List Available MCP Resources
 * Returns resources that can be accessed via MCP protocol
 *
 * @auth API Key (x-api-key header)
 * @returns List of accessible resources (threads, models, etc.)
 */
export const listResourcesRoute = createRoute({
  method: 'get',
  path: '/mcp/resources',
  tags: ['mcp'],
  summary: 'List available MCP resources',
  description: 'Returns resources accessible via MCP protocol (chat threads, models, etc.)',
  security: [
    { ApiKeyAuth: [] },
  ],
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'List of available resources',
      content: {
        'application/json': {
          schema: MCPResourcesListResponseSchema,
        },
      },
    },
    [HttpStatusCodes.UNAUTHORIZED]: {
      description: 'Missing or invalid API key',
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
  },
});

// ============================================================================
// MCP Tool Execution Routes
// ============================================================================

/**
 * Execute MCP Tool: Create Chat Thread
 * Creates a new multi-model chat thread
 *
 * @auth API Key (x-api-key header)
 * @body CreateThreadInput - Thread configuration
 * @returns Created thread with participants
 */
export const createThreadToolRoute = createRoute({
  method: 'post',
  path: '/mcp/tools/create-thread',
  tags: ['mcp', 'tools'],
  summary: 'MCP Tool: Create chat thread',
  description: 'Creates a new multi-model brainstorming thread via MCP protocol',
  security: [
    { ApiKeyAuth: [] },
  ],
  request: {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: CreateThreadInputSchema,
        },
      },
    },
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Thread created successfully',
      content: {
        'application/json': {
          schema: MCPToolCallResponseSchema,
        },
      },
    },
    [HttpStatusCodes.BAD_REQUEST]: {
      description: 'Invalid input parameters',
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
    [HttpStatusCodes.UNAUTHORIZED]: {
      description: 'Missing or invalid API key',
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
  },
});

/**
 * Execute MCP Tool: Send Message
 * Sends a message to a chat thread and gets AI responses
 *
 * @auth API Key (x-api-key header)
 * @body SendMessageInput - Message content and thread ID
 * @returns Message sent confirmation with AI responses
 */
export const sendMessageToolRoute = createRoute({
  method: 'post',
  path: '/mcp/tools/send-message',
  tags: ['mcp', 'tools'],
  summary: 'MCP Tool: Send message to thread',
  description: 'Sends a message to a chat thread and receives AI participant responses',
  security: [
    { ApiKeyAuth: [] },
  ],
  request: {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: SendMessageInputSchema,
        },
      },
    },
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Message sent successfully',
      content: {
        'application/json': {
          schema: MCPToolCallResponseSchema,
        },
      },
    },
    [HttpStatusCodes.BAD_REQUEST]: {
      description: 'Invalid input parameters',
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
    [HttpStatusCodes.NOT_FOUND]: {
      description: 'Thread not found',
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
    [HttpStatusCodes.UNAUTHORIZED]: {
      description: 'Missing or invalid API key',
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
  },
});

/**
 * Execute MCP Tool: Get Thread
 * Retrieves a chat thread with its messages and participants
 *
 * @auth API Key (x-api-key header)
 * @body GetThreadInput - Thread ID and options
 * @returns Thread data with messages
 */
export const getThreadToolRoute = createRoute({
  method: 'post',
  path: '/mcp/tools/get-thread',
  tags: ['mcp', 'tools'],
  summary: 'MCP Tool: Get chat thread',
  description: 'Retrieves a chat thread with messages and participant information',
  security: [
    { ApiKeyAuth: [] },
  ],
  request: {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: GetThreadInputSchema,
        },
      },
    },
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Thread retrieved successfully',
      content: {
        'application/json': {
          schema: MCPToolCallResponseSchema,
        },
      },
    },
    [HttpStatusCodes.NOT_FOUND]: {
      description: 'Thread not found',
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
    [HttpStatusCodes.UNAUTHORIZED]: {
      description: 'Missing or invalid API key',
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
  },
});

/**
 * Execute MCP Tool: List Models
 * Lists available AI models with filtering options
 *
 * @auth API Key (x-api-key header)
 * @body ListModelsInput - Filter criteria
 * @returns List of available models
 */
export const listModelsToolRoute = createRoute({
  method: 'post',
  path: '/mcp/tools/list-models',
  tags: ['mcp', 'tools'],
  summary: 'MCP Tool: List available models',
  description: 'Lists AI models available for chat participants with optional filtering',
  security: [
    { ApiKeyAuth: [] },
  ],
  request: {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: ListModelsInputSchema,
        },
      },
    },
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Models list retrieved successfully',
      content: {
        'application/json': {
          schema: MCPToolCallResponseSchema,
        },
      },
    },
    [HttpStatusCodes.UNAUTHORIZED]: {
      description: 'Missing or invalid API key',
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
  },
});

/**
 * Execute MCP Tool: Add Participant
 * Adds a new AI participant to an existing thread
 *
 * @auth API Key (x-api-key header)
 * @body AddParticipantInput - Participant configuration
 * @returns Added participant information
 */
export const addParticipantToolRoute = createRoute({
  method: 'post',
  path: '/mcp/tools/add-participant',
  tags: ['mcp', 'tools'],
  summary: 'MCP Tool: Add participant to thread',
  description: 'Adds a new AI model participant to an existing chat thread',
  security: [
    { ApiKeyAuth: [] },
  ],
  request: {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: AddParticipantInputSchema,
        },
      },
    },
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Participant added successfully',
      content: {
        'application/json': {
          schema: MCPToolCallResponseSchema,
        },
      },
    },
    [HttpStatusCodes.BAD_REQUEST]: {
      description: 'Invalid input parameters or max participants reached',
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
    [HttpStatusCodes.NOT_FOUND]: {
      description: 'Thread not found',
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
    [HttpStatusCodes.UNAUTHORIZED]: {
      description: 'Missing or invalid API key',
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
  },
});
