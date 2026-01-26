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

import { StandardApiResponses } from '@/core';

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
  method: 'post',
  path: '/mcp',
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
      content: {
        'application/json': {
          schema: JsonRpcResponseSchema,
        },
      },
      description: 'JSON-RPC response',
    },
    ...StandardApiResponses.UNAUTHORIZED,
  },
  security: [{ ApiKeyAuth: [] }],
  summary: 'MCP JSON-RPC endpoint',
  tags: ['mcp'],
});

// ============================================================================
// REST Convenience Endpoints (For HTTP Integrations)
// ============================================================================

/**
 * List Tools (REST)
 * Convenience endpoint for listing tools without JSON-RPC
 */
export const listToolsRoute = createRoute({
  description: 'Returns all available tools in MCP format. OpenAI function calling compatible.',
  method: 'get',
  path: '/mcp/tools',
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': {
          schema: MCPToolsListResponseSchema,
        },
      },
      description: 'Tools list with server info',
    },
    ...StandardApiResponses.UNAUTHORIZED,
  },
  security: [{ ApiKeyAuth: [] }],
  summary: 'List MCP tools',
  tags: ['mcp'],
});

/**
 * List Resources (REST)
 * Convenience endpoint for listing resources
 */
export const listResourcesRoute = createRoute({
  description: 'Returns user resources (chat threads) accessible via MCP.',
  method: 'get',
  path: '/mcp/resources',
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': {
          schema: MCPResourcesListResponseSchema,
        },
      },
      description: 'Resources list',
    },
    ...StandardApiResponses.UNAUTHORIZED,
  },
  security: [{ ApiKeyAuth: [] }],
  summary: 'List MCP resources',
  tags: ['mcp'],
});

/**
 * Call Tool (REST)
 * Convenience endpoint for tool execution via HTTP POST
 */
export const callToolRoute = createRoute({
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
  method: 'post',
  path: '/mcp/tools/call',
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
      content: {
        'application/json': {
          schema: MCPToolCallResponseSchema,
        },
      },
      description: 'Tool execution result (MCP format)',
    },
    ...StandardApiResponses.BAD_REQUEST,
    ...StandardApiResponses.UNAUTHORIZED,
  },
  security: [{ ApiKeyAuth: [] }],
  summary: 'Execute MCP tool',
  tags: ['mcp', 'tools'],
});

/**
 * OpenAI Functions Format (REST)
 * Returns tools in OpenAI function calling format
 */
export const openAIFunctionsRoute = createRoute({
  description: 'Returns tools formatted for OpenAI function calling API. Use for n8n AI Agent nodes.',
  method: 'get',
  path: '/mcp/openai/functions',
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': {
          schema: OpenAIFunctionsResponseSchema,
        },
      },
      description: 'OpenAI functions array',
    },
    ...StandardApiResponses.UNAUTHORIZED,
  },
  security: [{ ApiKeyAuth: [] }],
  summary: 'Get tools in OpenAI format',
  tags: ['mcp'],
});

// ============================================================================
// Route Types Export
// ============================================================================

export type MCPJsonRpcRoute = typeof mcpJsonRpcRoute;
export type ListToolsRoute = typeof listToolsRoute;
export type ListResourcesRoute = typeof listResourcesRoute;
export type CallToolRoute = typeof callToolRoute;
export type OpenAIFunctionsRoute = typeof openAIFunctionsRoute;
