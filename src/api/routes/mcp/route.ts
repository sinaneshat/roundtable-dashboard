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

import { StandardApiResponses } from '@/api/core/response-schemas';

import {
  AddParticipantInputSchema,
  CreateThreadInputSchema,
  GenerateAnalysisInputSchema,
  GenerateResponsesInputSchema,
  GetRoundAnalysisInputSchema,
  GetThreadInputSchema,
  ListModelsInputSchema,
  ListRoundsInputSchema,
  MCPResourcesListResponseSchema,
  MCPToolCallResponseSchema,
  MCPToolsListResponseSchema,
  RegenerateRoundInputSchema,
  RemoveParticipantInputSchema,
  RoundFeedbackInputSchema,
  SendMessageInputSchema,
  UpdateParticipantInputSchema,
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
    ...StandardApiResponses.UNAUTHORIZED,
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
    ...StandardApiResponses.UNAUTHORIZED,
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
    ...StandardApiResponses.BAD_REQUEST,
    ...StandardApiResponses.UNAUTHORIZED,
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
    ...StandardApiResponses.BAD_REQUEST,
    ...StandardApiResponses.NOT_FOUND,
    ...StandardApiResponses.UNAUTHORIZED,
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
    ...StandardApiResponses.NOT_FOUND,
    ...StandardApiResponses.UNAUTHORIZED,
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
    ...StandardApiResponses.UNAUTHORIZED,
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
    ...StandardApiResponses.BAD_REQUEST,
    ...StandardApiResponses.NOT_FOUND,
    ...StandardApiResponses.UNAUTHORIZED,
  },
});

/**
 * Execute MCP Tool: Generate Responses
 * Triggers server-side AI response generation for all participants
 *
 * @auth API Key (x-api-key header)
 * @body GenerateResponsesInput - Message content and options
 * @returns Generated AI responses
 */
export const generateResponsesToolRoute = createRoute({
  method: 'post',
  path: '/mcp/tools/generate-responses',
  tags: ['mcp', 'tools'],
  summary: 'MCP Tool: Generate AI responses',
  description: 'Triggers sequential AI response generation from all participants (non-streaming)',
  security: [
    { ApiKeyAuth: [] },
  ],
  request: {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: GenerateResponsesInputSchema,
        },
      },
    },
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Responses generated successfully',
      content: {
        'application/json': {
          schema: MCPToolCallResponseSchema,
        },
      },
    },
    ...StandardApiResponses.BAD_REQUEST,
    ...StandardApiResponses.NOT_FOUND,
    ...StandardApiResponses.UNAUTHORIZED,
  },
});

/**
 * Execute MCP Tool: Generate Analysis
 * Creates moderator analysis for a round
 *
 * @auth API Key (x-api-key header)
 * @body GenerateAnalysisInput - Thread and round info
 * @returns Generated analysis
 */
export const generateAnalysisToolRoute = createRoute({
  method: 'post',
  path: '/mcp/tools/generate-analysis',
  tags: ['mcp', 'tools'],
  summary: 'MCP Tool: Generate round analysis',
  description: 'Creates AI moderator analysis comparing participant responses',
  security: [
    { ApiKeyAuth: [] },
  ],
  request: {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: GenerateAnalysisInputSchema,
        },
      },
    },
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Analysis generated successfully',
      content: {
        'application/json': {
          schema: MCPToolCallResponseSchema,
        },
      },
    },
    ...StandardApiResponses.BAD_REQUEST,
    ...StandardApiResponses.NOT_FOUND,
    ...StandardApiResponses.UNAUTHORIZED,
  },
});

/**
 * Execute MCP Tool: Regenerate Round
 * Deletes and regenerates AI responses for a round
 *
 * @auth API Key (x-api-key header)
 * @body RegenerateRoundInput - Thread and round info
 * @returns Regenerated responses
 */
export const regenerateRoundToolRoute = createRoute({
  method: 'post',
  path: '/mcp/tools/regenerate-round',
  tags: ['mcp', 'tools'],
  summary: 'MCP Tool: Regenerate round',
  description: 'Deletes and regenerates all AI responses for a specific round',
  security: [
    { ApiKeyAuth: [] },
  ],
  request: {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: RegenerateRoundInputSchema,
        },
      },
    },
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Round regenerated successfully',
      content: {
        'application/json': {
          schema: MCPToolCallResponseSchema,
        },
      },
    },
    ...StandardApiResponses.BAD_REQUEST,
    ...StandardApiResponses.NOT_FOUND,
    ...StandardApiResponses.UNAUTHORIZED,
  },
});

/**
 * Execute MCP Tool: Round Feedback
 * Submit like/dislike feedback for a round
 *
 * @auth API Key (x-api-key header)
 * @body RoundFeedbackInput - Feedback data
 * @returns Feedback saved confirmation
 */
export const roundFeedbackToolRoute = createRoute({
  method: 'post',
  path: '/mcp/tools/round-feedback',
  tags: ['mcp', 'tools'],
  summary: 'MCP Tool: Submit round feedback',
  description: 'Submit like/dislike feedback for a round',
  security: [
    { ApiKeyAuth: [] },
  ],
  request: {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: RoundFeedbackInputSchema,
        },
      },
    },
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Feedback submitted successfully',
      content: {
        'application/json': {
          schema: MCPToolCallResponseSchema,
        },
      },
    },
    ...StandardApiResponses.BAD_REQUEST,
    ...StandardApiResponses.NOT_FOUND,
    ...StandardApiResponses.UNAUTHORIZED,
  },
});

/**
 * Execute MCP Tool: Remove Participant
 * Removes a participant from a thread
 *
 * @auth API Key (x-api-key header)
 * @body RemoveParticipantInput - Participant ID
 * @returns Removal confirmation
 */
export const removeParticipantToolRoute = createRoute({
  method: 'post',
  path: '/mcp/tools/remove-participant',
  tags: ['mcp', 'tools'],
  summary: 'MCP Tool: Remove participant',
  description: 'Removes a participant from a chat thread',
  security: [
    { ApiKeyAuth: [] },
  ],
  request: {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: RemoveParticipantInputSchema,
        },
      },
    },
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Participant removed successfully',
      content: {
        'application/json': {
          schema: MCPToolCallResponseSchema,
        },
      },
    },
    ...StandardApiResponses.BAD_REQUEST,
    ...StandardApiResponses.NOT_FOUND,
    ...StandardApiResponses.UNAUTHORIZED,
  },
});

/**
 * Execute MCP Tool: Update Participant
 * Updates participant settings
 *
 * @auth API Key (x-api-key header)
 * @body UpdateParticipantInput - New settings
 * @returns Update confirmation
 */
export const updateParticipantToolRoute = createRoute({
  method: 'post',
  path: '/mcp/tools/update-participant',
  tags: ['mcp', 'tools'],
  summary: 'MCP Tool: Update participant',
  description: 'Updates participant role, system prompt, or priority',
  security: [
    { ApiKeyAuth: [] },
  ],
  request: {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: UpdateParticipantInputSchema,
        },
      },
    },
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Participant updated successfully',
      content: {
        'application/json': {
          schema: MCPToolCallResponseSchema,
        },
      },
    },
    ...StandardApiResponses.BAD_REQUEST,
    ...StandardApiResponses.NOT_FOUND,
    ...StandardApiResponses.UNAUTHORIZED,
  },
});

/**
 * Execute MCP Tool: Get Round Analysis
 * Retrieves moderator analysis for a specific round
 *
 * @auth API Key (x-api-key header)
 * @body GetRoundAnalysisInput - Thread and round info
 * @returns Round analysis data
 */
export const getRoundAnalysisToolRoute = createRoute({
  method: 'post',
  path: '/mcp/tools/get-round-analysis',
  tags: ['mcp', 'tools'],
  summary: 'MCP Tool: Get round analysis',
  description: 'Retrieves moderator analysis for a specific round',
  security: [
    { ApiKeyAuth: [] },
  ],
  request: {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: GetRoundAnalysisInputSchema,
        },
      },
    },
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Analysis retrieved successfully',
      content: {
        'application/json': {
          schema: MCPToolCallResponseSchema,
        },
      },
    },
    ...StandardApiResponses.NOT_FOUND,
    ...StandardApiResponses.UNAUTHORIZED,
  },
});

/**
 * Execute MCP Tool: List Rounds
 * Lists all rounds in a thread
 *
 * @auth API Key (x-api-key header)
 * @body ListRoundsInput - Thread ID
 * @returns List of rounds with metadata
 */
export const listRoundsToolRoute = createRoute({
  method: 'post',
  path: '/mcp/tools/list-rounds',
  tags: ['mcp', 'tools'],
  summary: 'MCP Tool: List rounds',
  description: 'Lists all rounds in a chat thread with metadata',
  security: [
    { ApiKeyAuth: [] },
  ],
  request: {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: ListRoundsInputSchema,
        },
      },
    },
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Rounds listed successfully',
      content: {
        'application/json': {
          schema: MCPToolCallResponseSchema,
        },
      },
    },
    ...StandardApiResponses.NOT_FOUND,
    ...StandardApiResponses.UNAUTHORIZED,
  },
});
