/**
 * MCP (Model Context Protocol) Routes
 *
 * Official MCP protocol implementation with JSON-RPC 2.0 transport
 * Plus REST convenience endpoints for HTTP-based integrations (n8n, etc.)
 *
 * Protocol Reference: https://modelcontextprotocol.io/specification
 * OpenAI Compatibility: https://platform.openai.com/docs/guides/function-calling
 */

import { createRoute } from '@hono/zod-openapi';
import * as HttpStatusCodes from 'stoker/http-status-codes';

import { StandardApiResponses } from '@/api/core';

import {
  JsonRpcRequestSchema,
  JsonRpcResponseSchema,
  MCPResourcesListResponseSchema,
  MCPToolCallResponseSchema,
  MCPToolsListResponseSchema,
  OpenAIFunctionsResponseSchema,
  ToolCallParamsSchema,
} from './schema';

// ============================================================================
// JSON-RPC Transport (Official MCP Protocol)
// ============================================================================

/**
 * MCP JSON-RPC Endpoint
 *
 * Main MCP protocol endpoint supporting all standard methods:
 * - initialize: Handshake and capability negotiation
 * - tools/list: List available tools
 * - tools/call: Execute a tool
 * - resources/list: List available resources
 * - resources/read: Read resource content
 *
 * @auth API Key (x-api-key header)
 */
export const mcpJsonRpcRoute = createRoute({
  method: 'post',
  path: '/mcp',
  tags: ['mcp'],
  summary: 'MCP JSON-RPC endpoint',
  description: `
Main Model Context Protocol endpoint using JSON-RPC 2.0 transport.

**Supported Methods:**
- \`initialize\` - Protocol handshake
- \`tools/list\` - List available tools
- \`tools/call\` - Execute a tool with arguments
- \`resources/list\` - List user resources (threads)
- \`resources/read\` - Read resource content

**Example Request:**
\`\`\`json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list"
}
\`\`\`
  `,
  security: [{ ApiKeyAuth: [] }],
  request: {
    body: {
      content: {
        'application/json': {
          schema: JsonRpcRequestSchema,
        },
      },
    },
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'JSON-RPC response',
      content: {
        'application/json': {
          schema: JsonRpcResponseSchema,
        },
      },
    },
    ...StandardApiResponses.UNAUTHORIZED,
  },
});

// ============================================================================
// REST Convenience Endpoints (For HTTP Integrations)
// ============================================================================

/**
 * List Tools (REST)
 * Convenience endpoint for listing tools without JSON-RPC
 */
export const listToolsRoute = createRoute({
  method: 'get',
  path: '/mcp/tools',
  tags: ['mcp'],
  summary: 'List MCP tools',
  description: 'Returns all available tools in MCP format. OpenAI function calling compatible.',
  security: [{ ApiKeyAuth: [] }],
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Tools list with server info',
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
 * List Resources (REST)
 * Convenience endpoint for listing resources
 */
export const listResourcesRoute = createRoute({
  method: 'get',
  path: '/mcp/resources',
  tags: ['mcp'],
  summary: 'List MCP resources',
  description: 'Returns user resources (chat threads) accessible via MCP.',
  security: [{ ApiKeyAuth: [] }],
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Resources list',
      content: {
        'application/json': {
          schema: MCPResourcesListResponseSchema,
        },
      },
    },
    ...StandardApiResponses.UNAUTHORIZED,
  },
});

/**
 * Call Tool (REST)
 * Convenience endpoint for tool execution via HTTP POST
 */
export const callToolRoute = createRoute({
  method: 'post',
  path: '/mcp/tools/call',
  tags: ['mcp', 'tools'],
  summary: 'Execute MCP tool',
  description: `
Execute a tool by name with arguments. Returns MCP-compliant response.

**Available Tools:**
- \`create_thread\` - Create multi-model chat thread
- \`get_thread\` - Get thread with messages
- \`list_threads\` - List user threads
- \`delete_thread\` - Delete a thread
- \`send_message\` - Send message to thread
- \`generate_responses\` - Generate AI responses
- \`list_rounds\` - List thread rounds
- \`regenerate_round\` - Regenerate round responses
- \`round_feedback\` - Submit round feedback
- \`generate_analysis\` - Generate round summary
- \`get_round_analysis\` - Get existing summary
- \`add_participant\` - Add participant to thread
- \`update_participant\` - Update participant settings
- \`remove_participant\` - Remove participant
- \`list_models\` - List available AI models

**Example:**
\`\`\`json
{
  "name": "create_thread",
  "arguments": {
    "title": "Product Strategy",
    "participants": [{"modelId": "anthropic/claude-sonnet-4"}]
  }
}
\`\`\`
  `,
  security: [{ ApiKeyAuth: [] }],
  request: {
    body: {
      content: {
        'application/json': {
          schema: ToolCallParamsSchema,
        },
      },
    },
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Tool execution result (MCP format)',
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
 * OpenAI Functions Format (REST)
 * Returns tools in OpenAI function calling format
 */
export const openAIFunctionsRoute = createRoute({
  method: 'get',
  path: '/mcp/openai/functions',
  tags: ['mcp'],
  summary: 'Get tools in OpenAI format',
  description: 'Returns tools formatted for OpenAI function calling API. Use for n8n AI Agent nodes.',
  security: [{ ApiKeyAuth: [] }],
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'OpenAI functions array',
      content: {
        'application/json': {
          schema: OpenAIFunctionsResponseSchema,
        },
      },
    },
    ...StandardApiResponses.UNAUTHORIZED,
  },
});

// ============================================================================
// Route Types Export
// ============================================================================

export type MCPJsonRpcRoute = typeof mcpJsonRpcRoute;
export type ListToolsRoute = typeof listToolsRoute;
export type ListResourcesRoute = typeof listResourcesRoute;
export type CallToolRoute = typeof callToolRoute;
export type OpenAIFunctionsRoute = typeof openAIFunctionsRoute;
