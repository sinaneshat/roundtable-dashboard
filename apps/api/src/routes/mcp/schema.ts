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
import { STRING_LIMITS } from '@roundtable/shared';
import {
  CHAT_MODES,
  ChatModeSchema,
  DEFAULT_CHAT_MODE,
  ModelCategoryFilterSchema,
  ProjectIndexStatusSchema,
} from '@roundtable/shared/enums';

import { APP_VERSION } from '@/constants/version';
import { CoreSchemas, createApiResponseSchema } from '@/core/schemas';
import { RoundNumberSchema } from '@/lib/schemas';

// ============================================================================
// MCP Protocol Version
// ============================================================================

export const MCP_PROTOCOL_VERSION = '2024-11-05';

// ============================================================================
// JSON-RPC 2.0 Base Schemas (MCP Transport Layer)
// ============================================================================

/**
 * JSON-RPC 2.0 Params Schema
 *
 * DESIGN NOTE: JSON-RPC 2.0 specification requires params to accept any JSON value.
 * We use z.unknown() here because:
 * 1. Protocol compliance: JSON-RPC 2.0 params can be any structured object
 * 2. Runtime validation: Each method validates params via safeParse in handler
 * 3. This is the outer transport layer - inner validation is type-safe per-method
 *
 * @see https://www.jsonrpc.org/specification#request_object
 */
export const JsonRpcParamsSchema = z.record(z.string(), z.unknown());

/**
 * JSON-RPC 2.0 Request Schema
 * Base structure for all MCP requests
 */
export const JsonRpcRequestSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  jsonrpc: z.literal('2.0'),
  method: z.string(),
  params: JsonRpcParamsSchema.optional(),
}).openapi('JsonRpcRequest');

/**
 * JSON-RPC 2.0 Error Data Schema
 *
 * DESIGN NOTE: JSON-RPC 2.0 error.data can be any primitive or structured value.
 * Using z.unknown() is required for protocol compliance.
 * Runtime consumers should use safeParse on specific error types.
 *
 * @see https://www.jsonrpc.org/specification#error_object
 */
export const JsonRpcErrorDataSchema = z.unknown();

/**
 * JSON-RPC 2.0 Error Schema
 */
export const JsonRpcErrorSchema = z.object({
  code: z.number(),
  data: JsonRpcErrorDataSchema.optional(),
  message: z.string(),
}).openapi('JsonRpcError');

/**
 * JSON-RPC 2.0 Result Schema
 *
 * DESIGN NOTE: JSON-RPC 2.0 result can be any JSON value.
 * Using z.unknown() is required for protocol compliance.
 * Each method returns typed data - runtime consumers validate via safeParse.
 *
 * @see https://www.jsonrpc.org/specification#response_object
 */
export const JsonRpcResultSchema = z.unknown();

/**
 * JSON-RPC 2.0 Response Schema
 */
export const JsonRpcResponseSchema = z.object({
  error: JsonRpcErrorSchema.optional(),
  id: z.union([z.string(), z.number(), z.null()]),
  jsonrpc: z.literal('2.0'),
  result: JsonRpcResultSchema.optional(),
}).openapi('JsonRpcResponse');

// ============================================================================
// MCP Content Types (Following MCP Specification)
// ============================================================================

/**
 * Text Content - Primary content type
 */
export const TextContentSchema = z.object({
  text: z.string(),
  type: z.literal('text'),
}).openapi('TextContent');

/**
 * Image Content - Base64 encoded images
 */
export const ImageContentSchema = z.object({
  data: z.string().describe('Base64-encoded image data'),
  mimeType: z.string(),
  type: z.literal('image'),
}).openapi('ImageContent');

/**
 * Resource Content - Embedded resource references
 */
export const ResourceContentSchema = z.object({
  resource: z.object({
    blob: z.string().optional(),
    mimeType: z.string().optional(),
    text: z.string().optional(),
    uri: z.string(),
  }),
  type: z.literal('resource'),
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
 * JSON Schema Property Schema
 *
 * DESIGN NOTE: JSON Schema properties can be any valid JSON Schema definition.
 * Using z.unknown() is required because JSON Schema allows arbitrary nested schemas.
 * The MCP/OpenAI function calling format requires this flexibility.
 *
 * @see https://json-schema.org/specification
 * @see https://platform.openai.com/docs/guides/function-calling
 */
export const JsonSchemaPropertiesSchema = z.record(z.string(), z.unknown());

/**
 * JSON Schema Object Schema
 * Represents a JSON Schema object type with properties and required fields
 */
export const JsonSchemaObjectSchema = z.object({
  properties: JsonSchemaPropertiesSchema,
  required: z.array(z.string()).optional(),
  type: z.literal('object'),
});

/**
 * MCP Tool Schema - Following MCP spec with OpenAI compatibility
 * inputSchema follows JSON Schema format (OpenAI function parameters)
 */
export const MCPToolSchema = z.object({
  description: z.string().openapi({
    description: 'Human-readable description for AI model context',
    example: 'Creates a new multi-model brainstorming chat thread',
  }),
  inputSchema: JsonSchemaObjectSchema.openapi({
    description: 'JSON Schema for tool parameters (OpenAI compatible)',
  }),
  name: z.string().openapi({
    description: 'Unique tool identifier (snake_case)',
    example: 'create_thread',
  }),
  outputSchema: JsonSchemaObjectSchema.optional().openapi({
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
  description: z.string().optional(),
  mimeType: z.string().default('application/json'),
  name: z.string().openapi({
    description: 'Human-readable resource name',
    example: 'Product Strategy Discussion',
  }),
  uri: z.string().openapi({
    description: 'Resource URI (protocol://path format)',
    example: 'roundtable://thread/abc123',
  }),
}).openapi('MCPResource');

// ============================================================================
// MCP Server Capabilities
// ============================================================================

/**
 * Server Capabilities Schema
 */
export const MCPCapabilitiesSchema = z.object({
  logging: z.object({}).optional(),
  prompts: z.object({
    listChanged: z.boolean().optional(),
  }).optional(),
  resources: z.object({
    listChanged: z.boolean().optional(),
    subscribe: z.boolean().optional(),
  }).optional(),
  tools: z.object({
    listChanged: z.boolean().optional(),
  }).optional(),
}).openapi('MCPCapabilities');

/**
 * Server Info Schema
 */
export const MCPServerInfoSchema = z.object({
  capabilities: MCPCapabilitiesSchema,
  name: z.string(),
  protocolVersion: z.string().default(MCP_PROTOCOL_VERSION),
  version: z.string(),
}).openapi('MCPServerInfo');

// ============================================================================
// MCP Method-Specific Schemas
// ============================================================================

/**
 * Initialize Request Params
 */
export const InitializeParamsSchema = z.object({
  capabilities: MCPCapabilitiesSchema.optional(),
  clientInfo: z.object({
    name: z.string(),
    version: z.string(),
  }).optional(),
  protocolVersion: z.string(),
}).openapi('InitializeParams');

/**
 * Initialize Result
 */
export const InitializeResultSchema = z.object({
  capabilities: MCPCapabilitiesSchema,
  protocolVersion: z.string(),
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
 * Tool Call Arguments Schema
 *
 * DESIGN NOTE: Tool arguments from MCP clients can be any JSON object.
 * Using z.unknown() for values is required because:
 * 1. MCP protocol allows arbitrary argument types per tool
 * 2. Each tool validates its own args via safeParse in executeToolInternal
 * 3. This provides flexibility while maintaining type safety at the tool level
 *
 * @see https://modelcontextprotocol.io/specification/2025-06-18/server/tools
 */
export const ToolCallArgumentsSchema = z.record(z.string(), z.unknown());

/**
 * Tool Call Params
 */
export const ToolCallParamsSchema = z.object({
  arguments: ToolCallArgumentsSchema.optional(),
  name: z.string(),
}).openapi('ToolCallParams');

/**
 * Structured Content Schema
 *
 * DESIGN NOTE: MCP structuredContent can be any JSON object for tool-specific data.
 * Using z.unknown() for values is required per MCP specification.
 * Tools that return structured content define their own validation schemas.
 *
 * @see https://modelcontextprotocol.io/specification/2025-06-18/server/tools
 */
export const StructuredContentSchema = z.record(z.string(), z.unknown());

/**
 * Tool Call Result - MCP Compliant
 */
export const ToolCallResultSchema = z.object({
  content: z.array(MCPContentSchema),
  isError: z.boolean().optional(),
  structuredContent: StructuredContentSchema.optional(),
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
    blob: z.string().optional(),
    mimeType: z.string().optional(),
    text: z.string().optional(),
    uri: z.string(),
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
  customInstructions: z.string().max(STRING_LIMITS.CUSTOM_INSTRUCTIONS_MAX).optional(),
  description: z.string().max(STRING_LIMITS.PROJECT_DESCRIPTION_MAX).optional(),
  name: z.string().min(STRING_LIMITS.PROJECT_NAME_MIN).max(STRING_LIMITS.PROJECT_NAME_MAX),
  settings: z.object({
    allowedFileTypes: z.array(z.string()).optional(),
    autoIndexing: z.boolean().optional(),
    maxFileSize: z.number().int().positive().optional(),
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
  cursor: z.string().optional(),
  limit: z.number().int().positive().max(50).default(20),
  search: z.string().optional(),
}).openapi('ListProjectsInput');

/**
 * Update Project Input
 */
export const UpdateProjectInputSchema = z.object({
  customInstructions: z.string().max(STRING_LIMITS.CUSTOM_INSTRUCTIONS_MAX).optional(),
  description: z.string().max(STRING_LIMITS.PROJECT_DESCRIPTION_MAX).optional(),
  name: z.string().min(STRING_LIMITS.PROJECT_NAME_MIN).max(STRING_LIMITS.PROJECT_NAME_MAX).optional(),
  projectId: CoreSchemas.id(),
  settings: z.object({
    allowedFileTypes: z.array(z.string()).optional(),
    autoIndexing: z.boolean().optional(),
    maxFileSize: z.number().int().positive().optional(),
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
  cursor: z.string().optional(),
  limit: z.number().int().positive().max(50).default(20),
  projectId: CoreSchemas.id(),
}).openapi('ListProjectThreadsInput');

/**
 * List Knowledge Files Input
 */
export const ListKnowledgeFilesInputSchema = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().positive().max(50).default(20),
  projectId: CoreSchemas.id(),
  status: ProjectIndexStatusSchema.optional(),
}).openapi('ListKnowledgeFilesInput');

/**
 * Delete Knowledge File Input
 */
export const DeleteKnowledgeFileInputSchema = z.object({
  fileId: CoreSchemas.id(),
  projectId: CoreSchemas.id(),
}).openapi('DeleteKnowledgeFileInput');

// ============================================================================
// Thread Input Schemas
// ============================================================================

/**
 * Create Thread Input
 */
export const CreateThreadInputSchema = z.object({
  isPublic: z.boolean().default(false),
  mode: ChatModeSchema.default(DEFAULT_CHAT_MODE),
  participants: z.array(z.object({
    modelId: z.string(),
    priority: z.number().int().nonnegative().optional(),
    role: z.string().optional(),
    systemPrompt: z.string().optional(),
  })).min(1).max(10),
  projectId: CoreSchemas.id().optional(),
  title: z.string().min(1).max(200),
}).openapi('CreateThreadInput');

/**
 * Send Message Input
 */
export const SendMessageInputSchema = z.object({
  content: z.string().min(1).max(10000),
  enableWebSearch: z.boolean().default(false),
  threadId: CoreSchemas.id(),
}).openapi('SendMessageInput');

/**
 * Get Thread Input
 */
export const GetThreadInputSchema = z.object({
  includeMessages: z.boolean().default(true),
  maxMessages: z.number().int().positive().max(100).default(50),
  threadId: CoreSchemas.id(),
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
  modelId: z.string(),
  priority: z.number().int().nonnegative().optional(),
  role: z.string().optional(),
  systemPrompt: z.string().optional(),
  threadId: CoreSchemas.id(),
}).openapi('AddParticipantInput');

/**
 * Generate Responses Input
 */
export const GenerateResponsesInputSchema = z.object({
  enableWebSearch: z.boolean().default(false),
  messageContent: z.string().min(STRING_LIMITS.MESSAGE_MIN).max(STRING_LIMITS.MESSAGE_MAX),
  threadId: CoreSchemas.id(),
}).openapi('GenerateResponsesInput');

/**
 * Generate Summary Input
 */
export const GenerateAnalysisInputSchema = z.object({
  roundNumber: RoundNumberSchema,
  threadId: CoreSchemas.id(),
}).openapi('GenerateAnalysisInput');

/**
 * Regenerate Round Input
 */
export const RegenerateRoundInputSchema = z.object({
  roundNumber: RoundNumberSchema,
  threadId: CoreSchemas.id(),
}).openapi('RegenerateRoundInput');

/**
 * Remove Participant Input
 */
export const RemoveParticipantInputSchema = z.object({
  participantId: CoreSchemas.id(),
  threadId: CoreSchemas.id(),
}).openapi('RemoveParticipantInput');

/**
 * Update Participant Input
 */
export const UpdateParticipantInputSchema = z.object({
  participantId: CoreSchemas.id(),
  priority: z.number().int().nonnegative().optional(),
  role: z.string().optional(),
  systemPrompt: z.string().optional(),
  threadId: CoreSchemas.id(),
}).openapi('UpdateParticipantInput');

/**
 * Get Round Summary Input
 */
export const GetRoundAnalysisInputSchema = z.object({
  roundNumber: RoundNumberSchema,
  threadId: CoreSchemas.id(),
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
  cursor: z.string().optional(),
  limit: z.number().int().positive().max(50).default(20),
  projectId: CoreSchemas.id().optional(),
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
    serverInfo: MCPServerInfoSchema,
    tools: z.array(MCPToolSchema),
  }),
).openapi('MCPToolsListResponse');

/**
 * MCP Resources List Response (REST)
 */
export const MCPResourcesListResponseSchema = createApiResponseSchema(
  z.object({
    count: z.number().int().nonnegative(),
    resources: z.array(MCPResourceSchema),
  }),
).openapi('MCPResourcesListResponse');

/**
 * MCP Tool Call Response (REST wrapper for structured response)
 */
export const MCPToolCallResponseSchema = createApiResponseSchema(
  z.object({
    _meta: z.object({
      executionTimeMs: z.number(),
      toolName: z.string(),
    }).optional(),
    content: z.array(MCPContentSchema),
    isError: z.boolean().optional(),
    structuredContent: StructuredContentSchema.optional(),
  }),
).openapi('MCPToolCallResponse');

/**
 * OpenAI Function Schema
 */
export const OpenAIFunctionSchema = z.object({
  function: z.object({
    description: z.string(),
    name: z.string(),
    parameters: JsonSchemaObjectSchema,
  }),
  type: z.literal('function'),
}).openapi('OpenAIFunction');

/**
 * OpenAI Functions Response
 */
export const OpenAIFunctionsResponseSchema = createApiResponseSchema(
  z.array(OpenAIFunctionSchema),
).openapi('OpenAIFunctionsResponse');

// ============================================================================
// Tool Args Union Schema
// ============================================================================

/**
 * ToolArgsSchema - Union of all MCP tool input schemas
 *
 * Provides type-safe validation for tool arguments in executeToolInternal.
 * Each tool validates its own args via safeParse in the switch statement,
 * but this union provides the type signature for the args parameter.
 */
export const ToolArgsSchema = z.union([
  // Project tools
  CreateProjectInputSchema,
  GetProjectInputSchema,
  ListProjectsInputSchema,
  UpdateProjectInputSchema,
  DeleteProjectInputSchema,
  ListProjectThreadsInputSchema,
  // Knowledge file tools
  ListKnowledgeFilesInputSchema,
  DeleteKnowledgeFileInputSchema,
  // Thread tools
  CreateThreadInputSchema,
  GetThreadInputSchema,
  ListThreadsInputSchema,
  DeleteThreadInputSchema,
  // Message tools
  SendMessageInputSchema,
  GenerateResponsesInputSchema,
  // Round tools
  ListRoundsInputSchema,
  RegenerateRoundInputSchema,
  // Analysis tools
  GenerateAnalysisInputSchema,
  GetRoundAnalysisInputSchema,
  // Participant tools
  AddParticipantInputSchema,
  UpdateParticipantInputSchema,
  RemoveParticipantInputSchema,
  // Model tools
  ListModelsInputSchema,
  // Empty args (for tools with no required inputs)
  z.object({}),
]);

export type ToolArgs = z.infer<typeof ToolArgsSchema>;

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
export type RemoveParticipantInput = z.infer<typeof RemoveParticipantInputSchema>;
export type UpdateParticipantInput = z.infer<typeof UpdateParticipantInputSchema>;
export type GetRoundAnalysisInput = z.infer<typeof GetRoundAnalysisInputSchema>;
export type ListRoundsInput = z.infer<typeof ListRoundsInputSchema>;
export type ListThreadsInput = z.infer<typeof ListThreadsInputSchema>;
export type DeleteThreadInput = z.infer<typeof DeleteThreadInputSchema>;
export type OpenAIFunction = z.infer<typeof OpenAIFunctionSchema>;

// ============================================================================
// JSON-RPC Error Codes (MCP Standard)
// ============================================================================

export const JsonRpcErrorCodes = {
  INTERNAL_ERROR: -32603,
  INVALID_PARAMS: -32602,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  PARSE_ERROR: -32700,
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
    description: 'Create a new project (knowledge base) for organizing threads with shared RAG context. Projects enable AutoRAG retrieval across all linked threads.',
    inputSchema: {
      properties: {
        customInstructions: { description: 'Custom instructions for all threads in project (max 4000 chars). Prepended to AI system prompts.', type: 'string' },
        description: { description: 'Project description (max 1000 chars)', type: 'string' },
        name: { description: 'Project name (1-200 chars)', type: 'string' },
        settings: {
          description: 'Project settings',
          properties: {
            allowedFileTypes: { description: 'Allowed MIME types', items: { type: 'string' }, type: 'array' },
            autoIndexing: { description: 'Auto-index uploaded files. Default: true', type: 'boolean' },
            maxFileSize: { description: 'Max file size in bytes', type: 'integer' },
          },
          type: 'object',
        },
      },
      required: ['name'],
      type: 'object',
    },
    name: 'create_project',
  },
  {
    description: 'Get project details including file count and thread count.',
    inputSchema: {
      properties: {
        projectId: { description: 'Project ID', type: 'string' },
      },
      required: ['projectId'],
      type: 'object',
    },
    name: 'get_project',
  },
  {
    description: 'List user projects with optional search.',
    inputSchema: {
      properties: {
        cursor: { description: 'Pagination cursor', type: 'string' },
        limit: { description: 'Results per page (1-50). Default: 20', type: 'integer' },
        search: { description: 'Search by project name', type: 'string' },
      },
      type: 'object',
    },
    name: 'list_projects',
  },
  {
    description: 'Update project settings, name, description, or custom instructions.',
    inputSchema: {
      properties: {
        customInstructions: { description: 'New custom instructions', type: 'string' },
        description: { description: 'New description', type: 'string' },
        name: { description: 'New project name', type: 'string' },
        projectId: { description: 'Project ID', type: 'string' },
        settings: { description: 'Updated settings', type: 'object' },
      },
      required: ['projectId'],
      type: 'object',
    },
    name: 'update_project',
  },
  {
    description: 'Delete a project. Threads linked to project will be unlinked (not deleted). Knowledge files will be deleted.',
    inputSchema: {
      properties: {
        projectId: { description: 'Project ID to delete', type: 'string' },
      },
      required: ['projectId'],
      type: 'object',
    },
    name: 'delete_project',
  },
  {
    description: 'List all threads linked to a specific project.',
    inputSchema: {
      properties: {
        cursor: { description: 'Pagination cursor', type: 'string' },
        limit: { description: 'Results per page (1-50). Default: 20', type: 'integer' },
        projectId: { description: 'Project ID', type: 'string' },
      },
      required: ['projectId'],
      type: 'object',
    },
    name: 'list_project_threads',
  },

  // --------------------------------------------------------------------------
  // Knowledge File Management (Project RAG)
  // --------------------------------------------------------------------------
  {
    description: 'List knowledge files in a project. Files are used for RAG retrieval in linked threads.',
    inputSchema: {
      properties: {
        cursor: { description: 'Pagination cursor', type: 'string' },
        limit: { description: 'Results per page (1-50). Default: 20', type: 'integer' },
        projectId: { description: 'Project ID', type: 'string' },
        status: { description: 'Filter by status', enum: ['uploaded', 'indexing', 'indexed', 'failed'], type: 'string' },
      },
      required: ['projectId'],
      type: 'object',
    },
    name: 'list_knowledge_files',
  },
  {
    description: 'Delete a knowledge file from a project.',
    inputSchema: {
      properties: {
        fileId: { description: 'File ID to delete', type: 'string' },
        projectId: { description: 'Project ID', type: 'string' },
      },
      required: ['projectId', 'fileId'],
      type: 'object',
    },
    name: 'delete_knowledge_file',
  },

  // --------------------------------------------------------------------------
  // Thread Management
  // --------------------------------------------------------------------------
  {
    description: 'Create a new multi-model brainstorming chat thread with AI participants. Optionally link to a project for RAG-enabled knowledge retrieval.',
    inputSchema: {
      properties: {
        isPublic: { description: 'Make thread publicly accessible', type: 'boolean' },
        mode: { description: `Chat mode. Default: ${DEFAULT_CHAT_MODE}`, enum: [...CHAT_MODES], type: 'string' },
        participants: { description: 'AI model participants (1-10)', items: { properties: { modelId: { type: 'string' }, priority: { type: 'integer' }, role: { type: 'string' }, systemPrompt: { type: 'string' } }, required: ['modelId'], type: 'object' }, type: 'array' },
        projectId: { description: 'Optional project ID to link thread for RAG knowledge retrieval', type: 'string' },
        title: { description: 'Thread title (1-200 chars)', type: 'string' },
      },
      required: ['title', 'participants'],
      type: 'object',
    },
    name: 'create_thread',
  },
  {
    description: 'Retrieve a chat thread with its messages and participant information.',
    inputSchema: {
      properties: {
        includeMessages: { description: 'Include messages. Default: true', type: 'boolean' },
        maxMessages: { description: 'Max messages (1-100). Default: 50', type: 'integer' },
        threadId: { description: 'Thread ID', type: 'string' },
      },
      required: ['threadId'],
      type: 'object',
    },
    name: 'get_thread',
  },
  {
    description: 'List user chat threads with cursor pagination. Optionally filter by project.',
    inputSchema: {
      properties: {
        cursor: { description: 'Pagination cursor', type: 'string' },
        limit: { description: 'Results per page (1-50). Default: 20', type: 'integer' },
        projectId: { description: 'Filter threads by project ID', type: 'string' },
      },
      type: 'object',
    },
    name: 'list_threads',
  },
  {
    description: 'Delete a chat thread and all associated data.',
    inputSchema: {
      properties: { threadId: { description: 'Thread ID to delete', type: 'string' } },
      required: ['threadId'],
      type: 'object',
    },
    name: 'delete_thread',
  },
  // Message & Response
  {
    description: 'Send a user message to a chat thread. Note: Use generate_responses to get AI participant responses.',
    inputSchema: {
      properties: {
        content: { description: 'Message content (1-10000 chars)', type: 'string' },
        enableWebSearch: { description: 'Enable web search for context', type: 'boolean' },
        threadId: { description: 'Thread ID', type: 'string' },
      },
      required: ['threadId', 'content'],
      type: 'object',
    },
    name: 'send_message',
  },
  {
    description: 'Generate AI responses from all thread participants. Executes sequentially, each seeing prior responses.',
    inputSchema: {
      properties: {
        enableWebSearch: { description: 'Enable web search before responses', type: 'boolean' },
        messageContent: { description: 'User message to respond to', type: 'string' },
        threadId: { description: 'Thread ID', type: 'string' },
      },
      required: ['threadId', 'messageContent'],
      type: 'object',
    },
    name: 'generate_responses',
  },
  // Round Management
  {
    description: 'List all rounds in a thread with metadata (message count, summary status).',
    inputSchema: {
      properties: { threadId: { description: 'Thread ID', type: 'string' } },
      required: ['threadId'],
      type: 'object',
    },
    name: 'list_rounds',
  },
  {
    description: 'Delete and regenerate all AI responses for a specific round.',
    inputSchema: {
      properties: {
        roundNumber: { description: 'Round number (0-based)', type: 'integer' },
        threadId: { description: 'Thread ID', type: 'string' },
      },
      required: ['threadId', 'roundNumber'],
      type: 'object',
    },
    name: 'regenerate_round',
  },
  // Summary
  {
    description: 'Generate AI moderator summary comparing participant responses for a round.',
    inputSchema: {
      properties: {
        roundNumber: { description: 'Round number (0-based)', type: 'integer' },
        threadId: { description: 'Thread ID', type: 'string' },
      },
      required: ['threadId', 'roundNumber'],
      type: 'object',
    },
    name: 'generate_analysis',
  },
  {
    description: 'Retrieve existing moderator summary for a specific round.',
    inputSchema: {
      properties: {
        roundNumber: { description: 'Round number (0-based)', type: 'integer' },
        threadId: { description: 'Thread ID', type: 'string' },
      },
      required: ['threadId', 'roundNumber'],
      type: 'object',
    },
    name: 'get_round_analysis',
  },
  // Participant Management
  {
    description: 'Add a new AI model participant to an existing thread.',
    inputSchema: {
      properties: {
        modelId: { description: 'OpenRouter model ID', type: 'string' },
        priority: { description: 'Response order (0-based)', type: 'integer' },
        role: { description: 'Participant role name', type: 'string' },
        systemPrompt: { description: 'Custom system prompt', type: 'string' },
        threadId: { description: 'Thread ID', type: 'string' },
      },
      required: ['threadId', 'modelId'],
      type: 'object',
    },
    name: 'add_participant',
  },
  {
    description: 'Update participant settings (role, system prompt, priority).',
    inputSchema: {
      properties: {
        participantId: { description: 'Participant ID', type: 'string' },
        priority: { description: 'New priority', type: 'integer' },
        role: { description: 'New role name', type: 'string' },
        systemPrompt: { description: 'New system prompt', type: 'string' },
        threadId: { description: 'Thread ID', type: 'string' },
      },
      required: ['threadId', 'participantId'],
      type: 'object',
    },
    name: 'update_participant',
  },
  {
    description: 'Remove (disable) a participant from a thread.',
    inputSchema: {
      properties: {
        participantId: { description: 'Participant ID', type: 'string' },
        threadId: { description: 'Thread ID', type: 'string' },
      },
      required: ['threadId', 'participantId'],
      type: 'object',
    },
    name: 'remove_participant',
  },
  // Model Discovery
  {
    description: 'List available AI models with optional filtering by provider or category.',
    inputSchema: {
      properties: {
        category: { description: 'Filter by category. Default: all', enum: ['all', 'text', 'vision', 'code', 'function'], type: 'string' },
        provider: { description: 'Filter by provider (anthropic, openai, google, etc.)', type: 'string' },
      },
      type: 'object',
    },
    name: 'list_models',
  },
];

// ============================================================================
// MCP Server Info
// ============================================================================

export const MCP_SERVER_INFO = {
  capabilities: {
    resources: { listChanged: false, subscribe: false },
    tools: { listChanged: false },
  },
  name: 'roundtable',
  protocolVersion: MCP_PROTOCOL_VERSION,
  version: APP_VERSION,
} as const;

// ============================================================================
// Helper Functions
// ============================================================================

/** Get tool by name */
export function getToolByName(name: string): MCPTool | undefined {
  return MCP_TOOLS.find(t => t.name === name);
}

/** Convert MCP tools to OpenAI function calling format */
export function toOpenAIFunctions(): {
  type: 'function';
  function: { name: string; description: string; parameters: MCPTool['inputSchema'] };
}[] {
  return MCP_TOOLS.map(tool => ({
    function: { description: tool.description, name: tool.name, parameters: tool.inputSchema },
    type: 'function',
  }));
}
