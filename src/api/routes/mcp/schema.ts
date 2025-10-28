/**
 * MCP (Model Context Protocol) Route Schemas
 *
 * Schemas for MCP server implementation following AI SDK patterns
 * Exposes chat operations and model management as MCP tools
 *
 * @see https://modelcontextprotocol.io/introduction
 * @see https://sdk.vercel.ai/docs/ai-sdk-core/tools-and-tool-calling
 */

import { z } from '@hono/zod-openapi';

import { ChatModeSchema, DEFAULT_CHAT_MODE } from '@/api/core/enums';
import { CoreSchemas, createApiResponseSchema } from '@/api/core/schemas';

// ============================================================================
// MCP Protocol Schemas (Following MCP Specification)
// ============================================================================

/**
 * MCP Tool Definition Schema
 * Defines the structure of an MCP tool that can be called by AI models
 */
export const MCPToolSchema = z.object({
  name: z.string().openapi({
    description: 'Unique tool identifier',
    example: 'create_chat_thread',
  }),
  description: z.string().openapi({
    description: 'Human-readable description of what the tool does',
    example: 'Creates a new multi-model brainstorming chat thread',
  }),
  inputSchema: z.record(z.string(), z.unknown()).openapi({
    description: 'JSON Schema describing the tool\'s input parameters',
    example: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Thread title' },
        mode: { type: 'string', enum: ['analyzing', 'brainstorming', 'debating', 'solving'] },
      },
      required: ['title'],
    },
  }),
}).openapi('MCPTool');

/**
 * MCP Resource Schema
 * Defines a resource that can be accessed via MCP
 */
export const MCPResourceSchema = z.object({
  uri: z.string().openapi({
    description: 'Resource URI following MCP conventions',
    example: 'chat://thread/abc123',
  }),
  name: z.string().openapi({
    description: 'Human-readable resource name',
    example: 'Product Strategy Discussion',
  }),
  description: z.string().optional().openapi({
    description: 'Optional resource description',
    example: 'Multi-model brainstorming session about product strategy',
  }),
  mimeType: z.string().optional().openapi({
    description: 'MIME type of the resource',
    example: 'application/json',
  }),
}).openapi('MCPResource');

/**
 * MCP Server Info Schema
 * Metadata about the MCP server implementation
 */
export const MCPServerInfoSchema = z.object({
  name: z.string().openapi({
    description: 'MCP server name',
    example: 'roundtable-mcp-server',
  }),
  version: z.string().openapi({
    description: 'Semantic version of the MCP implementation',
    example: '1.0.0',
  }),
  protocolVersion: z.string().openapi({
    description: 'MCP protocol version',
    example: '2024-11-05',
  }),
  capabilities: z.object({
    tools: z.boolean().openapi({ description: 'Supports tool execution' }),
    resources: z.boolean().openapi({ description: 'Supports resource access' }),
    prompts: z.boolean().openapi({ description: 'Supports prompt templates' }),
  }).openapi({
    description: 'Server capabilities',
  }),
}).openapi('MCPServerInfo');

// ============================================================================
// MCP Tool Input Schemas (Domain-Specific)
// ============================================================================

/**
 * Create Chat Thread Tool Input
 */
export const CreateThreadInputSchema = z.object({
  title: z.string().min(1).max(200).openapi({
    description: 'Thread title',
    example: 'Product Strategy Discussion',
  }),
  mode: ChatModeSchema.default(DEFAULT_CHAT_MODE).openapi({
    description: 'Chat mode determining participant behavior',
    example: 'brainstorming',
  }),
  participants: z.array(z.object({
    modelId: z.string().openapi({
      description: 'OpenRouter model ID',
      example: 'anthropic/claude-sonnet-4.5',
    }),
    role: z.string().optional().openapi({
      description: 'Optional role name for the participant',
      example: 'The Strategist',
    }),
    systemPrompt: z.string().optional().openapi({
      description: 'Optional custom system prompt',
      example: 'You are a strategic thinker focused on long-term business outcomes.',
    }),
    priority: z.number().int().nonnegative().optional().openapi({
      description: 'Response order priority (0-based)',
      example: 0,
    }),
  })).min(1).max(10).openapi({
    description: 'AI participants in the thread (1-10 models)',
  }),
  isPublic: z.boolean().default(false).openapi({
    description: 'Whether the thread is publicly accessible',
    example: false,
  }),
}).openapi('CreateThreadInput');

/**
 * Send Message Tool Input
 */
export const SendMessageInputSchema = z.object({
  threadId: CoreSchemas.id().openapi({
    description: 'Thread ID to send message to',
    example: 'thread_abc123',
  }),
  content: z.string().min(1).max(10000).openapi({
    description: 'Message content',
    example: 'What are the key considerations for our product strategy?',
  }),
  parentMessageId: CoreSchemas.id().optional().openapi({
    description: 'Optional parent message ID for threading',
    example: 'msg_xyz789',
  }),
}).openapi('SendMessageInput');

/**
 * Get Thread Tool Input
 */
export const GetThreadInputSchema = z.object({
  threadId: CoreSchemas.id().openapi({
    description: 'Thread ID to retrieve',
    example: 'thread_abc123',
  }),
  includeMessages: z.boolean().default(true).openapi({
    description: 'Whether to include messages in response',
    example: true,
  }),
  maxMessages: z.number().int().positive().max(100).default(50).openapi({
    description: 'Maximum number of messages to return',
    example: 50,
  }),
}).openapi('GetThreadInput');

/**
 * List Models Tool Input
 */
export const ListModelsInputSchema = z.object({
  category: z.enum(['all', 'text', 'vision', 'code', 'function']).default('all').openapi({
    description: 'Filter models by category',
    example: 'all',
  }),
  provider: z.string().optional().openapi({
    description: 'Filter by provider (e.g., "anthropic", "openai")',
    example: 'anthropic',
  }),
  tier: z.enum(['free', 'pro', 'enterprise']).optional().openapi({
    description: 'Filter by subscription tier requirement',
    example: 'pro',
  }),
}).openapi('ListModelsInput');

/**
 * Add Participant Tool Input
 */
export const AddParticipantInputSchema = z.object({
  threadId: CoreSchemas.id().openapi({
    description: 'Thread ID to add participant to',
    example: 'thread_abc123',
  }),
  modelId: z.string().openapi({
    description: 'OpenRouter model ID',
    example: 'openai/gpt-4',
  }),
  role: z.string().optional().openapi({
    description: 'Optional role name',
    example: 'The Critic',
  }),
  systemPrompt: z.string().optional().openapi({
    description: 'Optional custom system prompt',
    example: 'You provide critical analysis and identify potential flaws.',
  }),
  priority: z.number().int().nonnegative().optional().openapi({
    description: 'Response order priority',
    example: 2,
  }),
}).openapi('AddParticipantInput');

// ============================================================================
// MCP Response Schemas
// ============================================================================

/**
 * MCP Tools List Response
 */
export const MCPToolsListResponseSchema = createApiResponseSchema(
  z.object({
    tools: z.array(MCPToolSchema),
    serverInfo: MCPServerInfoSchema,
  }).openapi('MCPToolsListPayload'),
).openapi('MCPToolsListResponse');

/**
 * MCP Resources List Response
 */
export const MCPResourcesListResponseSchema = createApiResponseSchema(
  z.object({
    resources: z.array(MCPResourceSchema),
    count: z.number().int().nonnegative(),
  }).openapi('MCPResourcesListPayload'),
).openapi('MCPResourcesListResponse');

/**
 * MCP Tool Call Response (Generic)
 */
export const MCPToolCallResponseSchema = createApiResponseSchema(
  z.object({
    result: z.record(z.string(), z.unknown()).openapi({
      description: 'Tool execution result',
    }),
    metadata: z.object({
      executionTime: z.number().openapi({ description: 'Execution time in ms' }),
      toolName: z.string().openapi({ description: 'Tool that was executed' }),
    }).optional(),
  }).openapi('MCPToolCallPayload'),
).openapi('MCPToolCallResponse');

// ============================================================================
// Type Exports
// ============================================================================

export type MCPTool = z.infer<typeof MCPToolSchema>;
export type MCPResource = z.infer<typeof MCPResourceSchema>;
export type MCPServerInfo = z.infer<typeof MCPServerInfoSchema>;
export type CreateThreadInput = z.infer<typeof CreateThreadInputSchema>;
export type SendMessageInput = z.infer<typeof SendMessageInputSchema>;
export type GetThreadInput = z.infer<typeof GetThreadInputSchema>;
export type ListModelsInput = z.infer<typeof ListModelsInputSchema>;
export type AddParticipantInput = z.infer<typeof AddParticipantInputSchema>;
