/**
 * MCP (Model Context Protocol) Schemas
 *
 * Following official MCP specification: https://modelcontextprotocol.io
 * JSON-RPC 2.0 compliant with OpenAI tool calling compatibility
 *
 * @see https://modelcontextprotocol.io/specification/2025-06-18/server/tools
 * @see https://platform.openai.com/docs/guides/function-calling
 */

import { z } from '@hono/zod-openapi';

import {
  ChatModeSchema,
  DEFAULT_CHAT_MODE,
  ModelCategoryFilterSchema,
  ProjectIndexStatusSchema,
  RoundFeedbackValueSchema,
} from '@/api/core/enums';
import { CoreSchemas, createApiResponseSchema } from '@/api/core/schemas';
import { RoundNumberSchema } from '@/lib/schemas/round-schemas';

// ============================================================================
// MCP Protocol Version
// ============================================================================

export const MCP_PROTOCOL_VERSION = '2024-11-05';

// ============================================================================
// JSON-RPC 2.0 Base Schemas (MCP Transport Layer)
// ============================================================================

/**
 * JSON-RPC 2.0 Request Schema
 * Base structure for all MCP requests
 */
export const JsonRpcRequestSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number()]).optional(),
  method: z.string(),
  params: z.record(z.string(), z.unknown()).optional(),
}).openapi('JsonRpcRequest');

/**
 * JSON-RPC 2.0 Error Schema
 */
export const JsonRpcErrorSchema = z.object({
  code: z.number(),
  message: z.string(),
  data: z.unknown().optional(),
}).openapi('JsonRpcError');

/**
 * JSON-RPC 2.0 Response Schema
 */
export const JsonRpcResponseSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number(), z.null()]),
  result: z.unknown().optional(),
  error: JsonRpcErrorSchema.optional(),
}).openapi('JsonRpcResponse');

// ============================================================================
// MCP Content Types (Following MCP Specification)
// ============================================================================

/**
 * Text Content - Primary content type
 */
export const TextContentSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
}).openapi('TextContent');

/**
 * Image Content - Base64 encoded images
 */
export const ImageContentSchema = z.object({
  type: z.literal('image'),
  data: z.string().describe('Base64-encoded image data'),
  mimeType: z.string(),
}).openapi('ImageContent');

/**
 * Resource Content - Embedded resource references
 */
export const ResourceContentSchema = z.object({
  type: z.literal('resource'),
  resource: z.object({
    uri: z.string(),
    mimeType: z.string().optional(),
    text: z.string().optional(),
    blob: z.string().optional(),
  }),
}).openapi('ResourceContent');

/**
 * MCP Content Union - All possible content types
 */
export const MCPContentSchema = z.discriminatedUnion('type', [
  TextContentSchema,
  ImageContentSchema,
  ResourceContentSchema,
]).openapi('MCPContent');

// ============================================================================
// MCP Tool Definition (OpenAI Compatible)
// ============================================================================

/**
 * MCP Tool Schema - Following MCP spec with OpenAI compatibility
 * inputSchema follows JSON Schema format (OpenAI function parameters)
 */
export const MCPToolSchema = z.object({
  name: z.string().openapi({
    description: 'Unique tool identifier (snake_case)',
    example: 'create_thread',
  }),
  description: z.string().openapi({
    description: 'Human-readable description for AI model context',
    example: 'Creates a new multi-model brainstorming chat thread',
  }),
  inputSchema: z.object({
    type: z.literal('object'),
    properties: z.record(z.string(), z.unknown()),
    required: z.array(z.string()).optional(),
  }).openapi({
    description: 'JSON Schema for tool parameters (OpenAI compatible)',
  }),
  outputSchema: z.object({
    type: z.literal('object'),
    properties: z.record(z.string(), z.unknown()),
    required: z.array(z.string()).optional(),
  }).optional().openapi({
    description: 'JSON Schema for structured output validation',
  }),
}).openapi('MCPTool');

// ============================================================================
// MCP Resource Definition
// ============================================================================

/**
 * MCP Resource Schema
 */
export const MCPResourceSchema = z.object({
  uri: z.string().openapi({
    description: 'Resource URI (protocol://path format)',
    example: 'roundtable://thread/abc123',
  }),
  name: z.string().openapi({
    description: 'Human-readable resource name',
    example: 'Product Strategy Discussion',
  }),
  description: z.string().optional(),
  mimeType: z.string().default('application/json'),
}).openapi('MCPResource');

// ============================================================================
// MCP Server Capabilities
// ============================================================================

/**
 * Server Capabilities Schema
 */
export const MCPCapabilitiesSchema = z.object({
  tools: z.object({
    listChanged: z.boolean().optional(),
  }).optional(),
  resources: z.object({
    subscribe: z.boolean().optional(),
    listChanged: z.boolean().optional(),
  }).optional(),
  prompts: z.object({
    listChanged: z.boolean().optional(),
  }).optional(),
  logging: z.object({}).optional(),
}).openapi('MCPCapabilities');

/**
 * Server Info Schema
 */
export const MCPServerInfoSchema = z.object({
  name: z.string(),
  version: z.string(),
  protocolVersion: z.string().default(MCP_PROTOCOL_VERSION),
  capabilities: MCPCapabilitiesSchema,
}).openapi('MCPServerInfo');

// ============================================================================
// MCP Method-Specific Schemas
// ============================================================================

/**
 * Initialize Request Params
 */
export const InitializeParamsSchema = z.object({
  protocolVersion: z.string(),
  capabilities: MCPCapabilitiesSchema.optional(),
  clientInfo: z.object({
    name: z.string(),
    version: z.string(),
  }).optional(),
}).openapi('InitializeParams');

/**
 * Initialize Result
 */
export const InitializeResultSchema = z.object({
  protocolVersion: z.string(),
  capabilities: MCPCapabilitiesSchema,
  serverInfo: z.object({
    name: z.string(),
    version: z.string(),
  }),
}).openapi('InitializeResult');

/**
 * Tools List Result
 */
export const ToolsListResultSchema = z.object({
  tools: z.array(MCPToolSchema),
}).openapi('ToolsListResult');

/**
 * Tool Call Params
 */
export const ToolCallParamsSchema = z.object({
  name: z.string(),
  arguments: z.record(z.string(), z.unknown()).optional(),
}).openapi('ToolCallParams');

/**
 * Tool Call Result - MCP Compliant
 */
export const ToolCallResultSchema = z.object({
  content: z.array(MCPContentSchema),
  structuredContent: z.record(z.string(), z.unknown()).optional(),
  isError: z.boolean().optional(),
}).openapi('ToolCallResult');

/**
 * Resources List Result
 */
export const ResourcesListResultSchema = z.object({
  resources: z.array(MCPResourceSchema),
}).openapi('ResourcesListResult');

/**
 * Resource Read Params
 */
export const ResourceReadParamsSchema = z.object({
  uri: z.string(),
}).openapi('ResourceReadParams');

/**
 * Resource Read Result
 */
export const ResourceReadResultSchema = z.object({
  contents: z.array(z.object({
    uri: z.string(),
    mimeType: z.string().optional(),
    text: z.string().optional(),
    blob: z.string().optional(),
  })),
}).openapi('ResourceReadResult');

// ============================================================================
// Tool Input Schemas (Domain-Specific)
// ============================================================================

// ============================================================================
// Project Input Schemas
// ============================================================================

/**
 * Create Project Input
 */
export const CreateProjectInputSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  customInstructions: z.string().max(4000).optional(),
  settings: z.object({
    autoIndexing: z.boolean().optional(),
    maxFileSize: z.number().int().positive().optional(),
    allowedFileTypes: z.array(z.string()).optional(),
  }).optional(),
}).openapi('CreateProjectInput');

/**
 * Get Project Input
 */
export const GetProjectInputSchema = z.object({
  projectId: CoreSchemas.id(),
}).openapi('GetProjectInput');

/**
 * List Projects Input
 */
export const ListProjectsInputSchema = z.object({
  search: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.number().int().positive().max(50).default(20),
}).openapi('ListProjectsInput');

/**
 * Update Project Input
 */
export const UpdateProjectInputSchema = z.object({
  projectId: CoreSchemas.id(),
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  customInstructions: z.string().max(4000).optional(),
  settings: z.object({
    autoIndexing: z.boolean().optional(),
    maxFileSize: z.number().int().positive().optional(),
    allowedFileTypes: z.array(z.string()).optional(),
  }).optional(),
}).openapi('UpdateProjectInput');

/**
 * Delete Project Input
 */
export const DeleteProjectInputSchema = z.object({
  projectId: CoreSchemas.id(),
}).openapi('DeleteProjectInput');

/**
 * List Project Threads Input
 */
export const ListProjectThreadsInputSchema = z.object({
  projectId: CoreSchemas.id(),
  cursor: z.string().optional(),
  limit: z.number().int().positive().max(50).default(20),
}).openapi('ListProjectThreadsInput');

/**
 * List Knowledge Files Input
 */
export const ListKnowledgeFilesInputSchema = z.object({
  projectId: CoreSchemas.id(),
  status: ProjectIndexStatusSchema.optional(),
  cursor: z.string().optional(),
  limit: z.number().int().positive().max(50).default(20),
}).openapi('ListKnowledgeFilesInput');

/**
 * Delete Knowledge File Input
 */
export const DeleteKnowledgeFileInputSchema = z.object({
  projectId: CoreSchemas.id(),
  fileId: CoreSchemas.id(),
}).openapi('DeleteKnowledgeFileInput');

// ============================================================================
// Thread Input Schemas
// ============================================================================

/**
 * Create Thread Input
 */
export const CreateThreadInputSchema = z.object({
  title: z.string().min(1).max(200),
  projectId: CoreSchemas.id().optional(),
  mode: ChatModeSchema.default(DEFAULT_CHAT_MODE),
  participants: z.array(z.object({
    modelId: z.string(),
    role: z.string().optional(),
    systemPrompt: z.string().optional(),
    priority: z.number().int().nonnegative().optional(),
  })).min(1).max(10),
  isPublic: z.boolean().default(false),
}).openapi('CreateThreadInput');

/**
 * Send Message Input
 */
export const SendMessageInputSchema = z.object({
  threadId: CoreSchemas.id(),
  content: z.string().min(1).max(10000),
  enableWebSearch: z.boolean().default(false),
}).openapi('SendMessageInput');

/**
 * Get Thread Input
 */
export const GetThreadInputSchema = z.object({
  threadId: CoreSchemas.id(),
  includeMessages: z.boolean().default(true),
  maxMessages: z.number().int().positive().max(100).default(50),
}).openapi('GetThreadInput');

/**
 * List Models Input
 */
export const ListModelsInputSchema = z.object({
  category: ModelCategoryFilterSchema.default('all'),
  provider: z.string().optional(),
}).openapi('ListModelsInput');

/**
 * Add Participant Input
 */
export const AddParticipantInputSchema = z.object({
  threadId: CoreSchemas.id(),
  modelId: z.string(),
  role: z.string().optional(),
  systemPrompt: z.string().optional(),
  priority: z.number().int().nonnegative().optional(),
}).openapi('AddParticipantInput');

/**
 * Generate Responses Input
 */
export const GenerateResponsesInputSchema = z.object({
  threadId: CoreSchemas.id(),
  messageContent: z.string().min(1).max(10000),
  enableWebSearch: z.boolean().default(false),
}).openapi('GenerateResponsesInput');

/**
 * Generate Analysis Input
 */
export const GenerateAnalysisInputSchema = z.object({
  threadId: CoreSchemas.id(),
  roundNumber: RoundNumberSchema,
}).openapi('GenerateAnalysisInput');

/**
 * Regenerate Round Input
 */
export const RegenerateRoundInputSchema = z.object({
  threadId: CoreSchemas.id(),
  roundNumber: RoundNumberSchema,
}).openapi('RegenerateRoundInput');

/**
 * Round Feedback Input
 */
export const RoundFeedbackInputSchema = z.object({
  threadId: CoreSchemas.id(),
  roundNumber: RoundNumberSchema,
  feedback: RoundFeedbackValueSchema,
}).openapi('RoundFeedbackInput');

/**
 * Remove Participant Input
 */
export const RemoveParticipantInputSchema = z.object({
  threadId: CoreSchemas.id(),
  participantId: CoreSchemas.id(),
}).openapi('RemoveParticipantInput');

/**
 * Update Participant Input
 */
export const UpdateParticipantInputSchema = z.object({
  threadId: CoreSchemas.id(),
  participantId: CoreSchemas.id(),
  role: z.string().optional(),
  systemPrompt: z.string().optional(),
  priority: z.number().int().nonnegative().optional(),
}).openapi('UpdateParticipantInput');

/**
 * Get Round Analysis Input
 */
export const GetRoundAnalysisInputSchema = z.object({
  threadId: CoreSchemas.id(),
  roundNumber: RoundNumberSchema,
}).openapi('GetRoundAnalysisInput');

/**
 * List Rounds Input
 */
export const ListRoundsInputSchema = z.object({
  threadId: CoreSchemas.id(),
}).openapi('ListRoundsInput');

/**
 * List Threads Input
 */
export const ListThreadsInputSchema = z.object({
  projectId: CoreSchemas.id().optional(),
  cursor: z.string().optional(),
  limit: z.number().int().positive().max(50).default(20),
}).openapi('ListThreadsInput');

/**
 * Delete Thread Input
 */
export const DeleteThreadInputSchema = z.object({
  threadId: CoreSchemas.id(),
}).openapi('DeleteThreadInput');

// ============================================================================
// OpenAPI Response Schemas (REST API Layer)
// ============================================================================

/**
 * MCP JSON-RPC Response Schema (for REST wrapper)
 */
export const MCPJsonRpcResponseSchema = createApiResponseSchema(
  JsonRpcResponseSchema,
).openapi('MCPJsonRpcResponse');

/**
 * MCP Tools List Response (REST)
 */
export const MCPToolsListResponseSchema = createApiResponseSchema(
  z.object({
    tools: z.array(MCPToolSchema),
    serverInfo: MCPServerInfoSchema,
  }),
).openapi('MCPToolsListResponse');

/**
 * MCP Resources List Response (REST)
 */
export const MCPResourcesListResponseSchema = createApiResponseSchema(
  z.object({
    resources: z.array(MCPResourceSchema),
    count: z.number().int().nonnegative(),
  }),
).openapi('MCPResourcesListResponse');

/**
 * MCP Tool Call Response (REST wrapper for structured response)
 */
export const MCPToolCallResponseSchema = createApiResponseSchema(
  z.object({
    content: z.array(MCPContentSchema),
    structuredContent: z.record(z.string(), z.unknown()).optional(),
    isError: z.boolean().optional(),
    _meta: z.object({
      toolName: z.string(),
      executionTimeMs: z.number(),
    }).optional(),
  }),
).openapi('MCPToolCallResponse');

// ============================================================================
// Type Exports
// ============================================================================

export type JsonRpcRequest = z.infer<typeof JsonRpcRequestSchema>;
export type JsonRpcResponse = z.infer<typeof JsonRpcResponseSchema>;
export type JsonRpcError = z.infer<typeof JsonRpcErrorSchema>;
export type MCPTool = z.infer<typeof MCPToolSchema>;
export type MCPResource = z.infer<typeof MCPResourceSchema>;
export type MCPServerInfo = z.infer<typeof MCPServerInfoSchema>;
export type MCPCapabilities = z.infer<typeof MCPCapabilitiesSchema>;
export type MCPContent = z.infer<typeof MCPContentSchema>;
export type TextContent = z.infer<typeof TextContentSchema>;
export type ToolCallResult = z.infer<typeof ToolCallResultSchema>;
// Project types
export type CreateProjectInput = z.infer<typeof CreateProjectInputSchema>;
export type GetProjectInput = z.infer<typeof GetProjectInputSchema>;
export type ListProjectsInput = z.infer<typeof ListProjectsInputSchema>;
export type UpdateProjectInput = z.infer<typeof UpdateProjectInputSchema>;
export type DeleteProjectInput = z.infer<typeof DeleteProjectInputSchema>;
export type ListProjectThreadsInput = z.infer<typeof ListProjectThreadsInputSchema>;
export type ListKnowledgeFilesInput = z.infer<typeof ListKnowledgeFilesInputSchema>;
export type DeleteKnowledgeFileInput = z.infer<typeof DeleteKnowledgeFileInputSchema>;
// Thread types
export type CreateThreadInput = z.infer<typeof CreateThreadInputSchema>;
export type SendMessageInput = z.infer<typeof SendMessageInputSchema>;
export type GetThreadInput = z.infer<typeof GetThreadInputSchema>;
export type ListModelsInput = z.infer<typeof ListModelsInputSchema>;
export type AddParticipantInput = z.infer<typeof AddParticipantInputSchema>;
export type GenerateResponsesInput = z.infer<typeof GenerateResponsesInputSchema>;
export type GenerateAnalysisInput = z.infer<typeof GenerateAnalysisInputSchema>;
export type RegenerateRoundInput = z.infer<typeof RegenerateRoundInputSchema>;
export type RoundFeedbackInput = z.infer<typeof RoundFeedbackInputSchema>;
export type RemoveParticipantInput = z.infer<typeof RemoveParticipantInputSchema>;
export type UpdateParticipantInput = z.infer<typeof UpdateParticipantInputSchema>;
export type GetRoundAnalysisInput = z.infer<typeof GetRoundAnalysisInputSchema>;
export type ListRoundsInput = z.infer<typeof ListRoundsInputSchema>;
export type ListThreadsInput = z.infer<typeof ListThreadsInputSchema>;
export type DeleteThreadInput = z.infer<typeof DeleteThreadInputSchema>;

// ============================================================================
// JSON-RPC Error Codes (MCP Standard)
// ============================================================================

export const JsonRpcErrorCodes = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const;

// ============================================================================
// MCP Tools Registry
// ============================================================================

/**
 * MCP Tools - All available tools with JSON Schema input definitions
 * OpenAI function calling compatible format
 */
export const MCP_TOOLS: MCPTool[] = [
  // --------------------------------------------------------------------------
  // Project Management (RAG-enabled knowledge bases)
  // --------------------------------------------------------------------------
  {
    name: 'create_project',
    description: 'Create a new project (knowledge base) for organizing threads with shared RAG context. Projects enable AutoRAG retrieval across all linked threads.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Project name (1-200 chars)' },
        description: { type: 'string', description: 'Project description (max 1000 chars)' },
        customInstructions: { type: 'string', description: 'Custom instructions for all threads in project (max 4000 chars). Prepended to AI system prompts.' },
        settings: {
          type: 'object',
          description: 'Project settings',
          properties: {
            autoIndexing: { type: 'boolean', description: 'Auto-index uploaded files. Default: true' },
            maxFileSize: { type: 'integer', description: 'Max file size in bytes' },
            allowedFileTypes: { type: 'array', items: { type: 'string' }, description: 'Allowed MIME types' },
          },
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'get_project',
    description: 'Get project details including file count and thread count.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Project ID' },
      },
      required: ['projectId'],
    },
  },
  {
    name: 'list_projects',
    description: 'List user projects with optional search.',
    inputSchema: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Search by project name' },
        cursor: { type: 'string', description: 'Pagination cursor' },
        limit: { type: 'integer', description: 'Results per page (1-50). Default: 20' },
      },
    },
  },
  {
    name: 'update_project',
    description: 'Update project settings, name, description, or custom instructions.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Project ID' },
        name: { type: 'string', description: 'New project name' },
        description: { type: 'string', description: 'New description' },
        customInstructions: { type: 'string', description: 'New custom instructions' },
        settings: { type: 'object', description: 'Updated settings' },
      },
      required: ['projectId'],
    },
  },
  {
    name: 'delete_project',
    description: 'Delete a project. Threads linked to project will be unlinked (not deleted). Knowledge files will be deleted.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Project ID to delete' },
      },
      required: ['projectId'],
    },
  },
  {
    name: 'list_project_threads',
    description: 'List all threads linked to a specific project.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Project ID' },
        cursor: { type: 'string', description: 'Pagination cursor' },
        limit: { type: 'integer', description: 'Results per page (1-50). Default: 20' },
      },
      required: ['projectId'],
    },
  },

  // --------------------------------------------------------------------------
  // Knowledge File Management (Project RAG)
  // --------------------------------------------------------------------------
  {
    name: 'list_knowledge_files',
    description: 'List knowledge files in a project. Files are used for RAG retrieval in linked threads.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Project ID' },
        status: { type: 'string', enum: ['uploaded', 'indexing', 'indexed', 'failed'], description: 'Filter by status' },
        cursor: { type: 'string', description: 'Pagination cursor' },
        limit: { type: 'integer', description: 'Results per page (1-50). Default: 20' },
      },
      required: ['projectId'],
    },
  },
  {
    name: 'delete_knowledge_file',
    description: 'Delete a knowledge file from a project.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Project ID' },
        fileId: { type: 'string', description: 'File ID to delete' },
      },
      required: ['projectId', 'fileId'],
    },
  },

  // --------------------------------------------------------------------------
  // Thread Management
  // --------------------------------------------------------------------------
  {
    name: 'create_thread',
    description: 'Create a new multi-model brainstorming chat thread with AI participants. Optionally link to a project for RAG-enabled knowledge retrieval.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Thread title (1-200 chars)' },
        projectId: { type: 'string', description: 'Optional project ID to link thread for RAG knowledge retrieval' },
        mode: { type: 'string', enum: ['analyzing', 'brainstorming', 'debating', 'solving'], description: `Chat mode. Default: ${DEFAULT_CHAT_MODE}` },
        participants: { type: 'array', description: 'AI model participants (1-10)', items: { type: 'object', properties: { modelId: { type: 'string' }, role: { type: 'string' }, systemPrompt: { type: 'string' }, priority: { type: 'integer' } }, required: ['modelId'] } },
        isPublic: { type: 'boolean', description: 'Make thread publicly accessible' },
      },
      required: ['title', 'participants'],
    },
  },
  {
    name: 'get_thread',
    description: 'Retrieve a chat thread with its messages and participant information.',
    inputSchema: {
      type: 'object',
      properties: {
        threadId: { type: 'string', description: 'Thread ID' },
        includeMessages: { type: 'boolean', description: 'Include messages. Default: true' },
        maxMessages: { type: 'integer', description: 'Max messages (1-100). Default: 50' },
      },
      required: ['threadId'],
    },
  },
  {
    name: 'list_threads',
    description: 'List user chat threads with cursor pagination. Optionally filter by project.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Filter threads by project ID' },
        cursor: { type: 'string', description: 'Pagination cursor' },
        limit: { type: 'integer', description: 'Results per page (1-50). Default: 20' },
      },
    },
  },
  {
    name: 'delete_thread',
    description: 'Delete a chat thread and all associated data.',
    inputSchema: {
      type: 'object',
      properties: { threadId: { type: 'string', description: 'Thread ID to delete' } },
      required: ['threadId'],
    },
  },
  // Message & Response
  {
    name: 'send_message',
    description: 'Send a user message to a chat thread. Note: Use generate_responses to get AI participant responses.',
    inputSchema: {
      type: 'object',
      properties: {
        threadId: { type: 'string', description: 'Thread ID' },
        content: { type: 'string', description: 'Message content (1-10000 chars)' },
        enableWebSearch: { type: 'boolean', description: 'Enable web search for context' },
      },
      required: ['threadId', 'content'],
    },
  },
  {
    name: 'generate_responses',
    description: 'Generate AI responses from all thread participants. Executes sequentially, each seeing prior responses.',
    inputSchema: {
      type: 'object',
      properties: {
        threadId: { type: 'string', description: 'Thread ID' },
        messageContent: { type: 'string', description: 'User message to respond to' },
        enableWebSearch: { type: 'boolean', description: 'Enable web search before responses' },
      },
      required: ['threadId', 'messageContent'],
    },
  },
  // Round Management
  {
    name: 'list_rounds',
    description: 'List all rounds in a thread with metadata (message count, analysis status, feedback).',
    inputSchema: {
      type: 'object',
      properties: { threadId: { type: 'string', description: 'Thread ID' } },
      required: ['threadId'],
    },
  },
  {
    name: 'regenerate_round',
    description: 'Delete and regenerate all AI responses for a specific round.',
    inputSchema: {
      type: 'object',
      properties: {
        threadId: { type: 'string', description: 'Thread ID' },
        roundNumber: { type: 'integer', description: 'Round number (0-based)' },
      },
      required: ['threadId', 'roundNumber'],
    },
  },
  {
    name: 'round_feedback',
    description: 'Submit like/dislike feedback for a round.',
    inputSchema: {
      type: 'object',
      properties: {
        threadId: { type: 'string', description: 'Thread ID' },
        roundNumber: { type: 'integer', description: 'Round number (0-based)' },
        feedback: { type: 'string', enum: ['like', 'dislike', 'none'], description: 'Feedback type' },
      },
      required: ['threadId', 'roundNumber', 'feedback'],
    },
  },
  // Analysis
  {
    name: 'generate_analysis',
    description: 'Generate AI moderator analysis comparing participant responses for a round.',
    inputSchema: {
      type: 'object',
      properties: {
        threadId: { type: 'string', description: 'Thread ID' },
        roundNumber: { type: 'integer', description: 'Round number (0-based)' },
      },
      required: ['threadId', 'roundNumber'],
    },
  },
  {
    name: 'get_round_analysis',
    description: 'Retrieve existing moderator analysis for a specific round.',
    inputSchema: {
      type: 'object',
      properties: {
        threadId: { type: 'string', description: 'Thread ID' },
        roundNumber: { type: 'integer', description: 'Round number (0-based)' },
      },
      required: ['threadId', 'roundNumber'],
    },
  },
  // Participant Management
  {
    name: 'add_participant',
    description: 'Add a new AI model participant to an existing thread.',
    inputSchema: {
      type: 'object',
      properties: {
        threadId: { type: 'string', description: 'Thread ID' },
        modelId: { type: 'string', description: 'OpenRouter model ID' },
        role: { type: 'string', description: 'Participant role name' },
        systemPrompt: { type: 'string', description: 'Custom system prompt' },
        priority: { type: 'integer', description: 'Response order (0-based)' },
      },
      required: ['threadId', 'modelId'],
    },
  },
  {
    name: 'update_participant',
    description: 'Update participant settings (role, system prompt, priority).',
    inputSchema: {
      type: 'object',
      properties: {
        threadId: { type: 'string', description: 'Thread ID' },
        participantId: { type: 'string', description: 'Participant ID' },
        role: { type: 'string', description: 'New role name' },
        systemPrompt: { type: 'string', description: 'New system prompt' },
        priority: { type: 'integer', description: 'New priority' },
      },
      required: ['threadId', 'participantId'],
    },
  },
  {
    name: 'remove_participant',
    description: 'Remove (disable) a participant from a thread.',
    inputSchema: {
      type: 'object',
      properties: {
        threadId: { type: 'string', description: 'Thread ID' },
        participantId: { type: 'string', description: 'Participant ID' },
      },
      required: ['threadId', 'participantId'],
    },
  },
  // Model Discovery
  {
    name: 'list_models',
    description: 'List available AI models with optional filtering by provider or category.',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string', enum: ['all', 'text', 'vision', 'code', 'function'], description: 'Filter by category. Default: all' },
        provider: { type: 'string', description: 'Filter by provider (anthropic, openai, google, etc.)' },
      },
    },
  },
];

// ============================================================================
// MCP Server Info
// ============================================================================

export const MCP_SERVER_INFO = {
  name: 'roundtable',
  version: '1.0.0',
  protocolVersion: MCP_PROTOCOL_VERSION,
  capabilities: {
    tools: { listChanged: false },
    resources: { subscribe: false, listChanged: false },
  },
} as const;

// ============================================================================
// Helper Functions
// ============================================================================

/** Get tool by name */
export function getToolByName(name: string): MCPTool | undefined {
  return MCP_TOOLS.find(t => t.name === name);
}

/** Convert MCP tools to OpenAI function calling format */
export function toOpenAIFunctions(): Array<{
  type: 'function';
  function: { name: string; description: string; parameters: MCPTool['inputSchema'] };
}> {
  return MCP_TOOLS.map(tool => ({
    type: 'function',
    function: { name: tool.name, description: tool.description, parameters: tool.inputSchema },
  }));
}
