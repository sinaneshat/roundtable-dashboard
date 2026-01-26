/**
 * MCP (Model Context Protocol) Tool Method Enums
 *
 * Enums for MCP protocol methods and tool names.
 * Following the 5-part enum pattern for type safety and consistency.
 */

import { z } from '@hono/zod-openapi';

// ============================================================================
// MCP PROTOCOL METHODS
// ============================================================================

export const MCP_PROTOCOL_METHODS = [
  'initialize',
  'tools/list',
  'resources/list',
  'resources/read',
  'tools/call',
] as const;

export const MCPProtocolMethodSchema = z.enum(MCP_PROTOCOL_METHODS).openapi({
  description: 'MCP protocol method name',
  example: 'tools/list',
});

export type MCPProtocolMethod = z.infer<typeof MCPProtocolMethodSchema>;

export const MCPProtocolMethods = {
  INITIALIZE: 'initialize' as const,
  RESOURCES_LIST: 'resources/list' as const,
  RESOURCES_READ: 'resources/read' as const,
  TOOLS_CALL: 'tools/call' as const,
  TOOLS_LIST: 'tools/list' as const,
} as const;

// ============================================================================
// MCP TOOL METHODS
// ============================================================================

export const MCP_TOOL_METHODS = [
  'create_thread',
  'get_thread',
  'list_threads',
  'delete_thread',
  'create_project',
  'get_project',
  'list_projects',
  'update_project',
  'delete_project',
  'list_project_threads',
  'list_knowledge_files',
  'delete_knowledge_file',
  'send_message',
  'generate_responses',
  'list_rounds',
  'regenerate_round',
  'round_feedback',
  'generate_analysis',
  'get_round_analysis',
  'add_participant',
  'update_participant',
  'remove_participant',
  'list_models',
] as const;

export const MCPToolMethodSchema = z.enum(MCP_TOOL_METHODS).openapi({
  description: 'MCP tool method name',
  example: 'create_thread',
});

export type MCPToolMethod = z.infer<typeof MCPToolMethodSchema>;

export const MCPToolMethods = {
  ADD_PARTICIPANT: 'add_participant' as const,
  CREATE_PROJECT: 'create_project' as const,
  CREATE_THREAD: 'create_thread' as const,
  DELETE_KNOWLEDGE_FILE: 'delete_knowledge_file' as const,
  DELETE_PROJECT: 'delete_project' as const,
  DELETE_THREAD: 'delete_thread' as const,
  GENERATE_ANALYSIS: 'generate_analysis' as const,
  GENERATE_RESPONSES: 'generate_responses' as const,
  GET_PROJECT: 'get_project' as const,
  GET_ROUND_ANALYSIS: 'get_round_analysis' as const,
  GET_THREAD: 'get_thread' as const,
  LIST_KNOWLEDGE_FILES: 'list_knowledge_files' as const,
  LIST_MODELS: 'list_models' as const,
  LIST_PROJECT_THREADS: 'list_project_threads' as const,
  LIST_PROJECTS: 'list_projects' as const,
  LIST_ROUNDS: 'list_rounds' as const,
  LIST_THREADS: 'list_threads' as const,
  REGENERATE_ROUND: 'regenerate_round' as const,
  REMOVE_PARTICIPANT: 'remove_participant' as const,
  ROUND_FEEDBACK: 'round_feedback' as const,
  SEND_MESSAGE: 'send_message' as const,
  UPDATE_PARTICIPANT: 'update_participant' as const,
  UPDATE_PROJECT: 'update_project' as const,
} as const;

// ============================================================================
// DEFAULT VALUES
// ============================================================================

export const DEFAULT_MCP_PROTOCOL_METHOD: MCPProtocolMethod = 'initialize';
export const DEFAULT_MCP_TOOL_METHOD: MCPToolMethod = 'list_threads';
