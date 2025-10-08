import { createRoute, z } from '@hono/zod-openapi';
import * as HttpStatusCodes from 'stoker/http-status-codes';

import { createApiResponseSchema } from '@/api/core/schemas';

import {
  AddParticipantRequestSchema,
  CreateCustomRoleRequestSchema,
  CreateMemoryRequestSchema,
  CreateThreadRequestSchema,
  CustomRoleDetailResponseSchema,
  CustomRoleIdParamSchema,
  CustomRoleListResponseSchema,
  MemoryDetailResponseSchema,
  MemoryIdParamSchema,
  MemoryListResponseSchema,
  MessagesListResponseSchema,
  ParticipantDetailResponseSchema,
  ParticipantIdParamSchema,
  StreamChatRequestSchema,
  ThreadDetailResponseSchema,
  ThreadIdParamSchema,
  ThreadListQuerySchema,
  ThreadListResponseSchema,
  ThreadSlugParamSchema,
  UpdateCustomRoleRequestSchema,
  UpdateMemoryRequestSchema,
  UpdateParticipantRequestSchema,
  UpdateThreadRequestSchema,
} from './schema';

// ============================================================================
// Thread Routes
// ============================================================================

export const listThreadsRoute = createRoute({
  method: 'get',
  path: '/chat/threads',
  tags: ['chat'],
  summary: 'List chat threads with cursor pagination',
  description: 'Get chat threads for the authenticated user with infinite scroll support',
  request: {
    query: ThreadListQuerySchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Threads retrieved successfully with pagination cursor',
      content: {
        'application/json': { schema: ThreadListResponseSchema },
      },
    },
    [HttpStatusCodes.UNAUTHORIZED]: { description: 'Authentication required' },
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: { description: 'Internal Server Error' },
  },
});

export const createThreadRoute = createRoute({
  method: 'post',
  path: '/chat/threads',
  tags: ['chat'],
  summary: 'Create chat thread',
  description: 'Create a new chat thread with specified mode and configuration',
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateThreadRequestSchema,
        },
      },
    },
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Thread created successfully',
      content: {
        'application/json': { schema: ThreadDetailResponseSchema },
      },
    },
    [HttpStatusCodes.UNAUTHORIZED]: { description: 'Authentication required' },
    [HttpStatusCodes.BAD_REQUEST]: { description: 'Invalid request data' },
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: { description: 'Internal Server Error' },
  },
});

export const getThreadRoute = createRoute({
  method: 'get',
  path: '/chat/threads/:id',
  tags: ['chat'],
  summary: 'Get thread details',
  description: 'Get details of a specific chat thread',
  request: {
    params: ThreadIdParamSchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Thread retrieved successfully',
      content: {
        'application/json': { schema: ThreadDetailResponseSchema },
      },
    },
    [HttpStatusCodes.UNAUTHORIZED]: { description: 'Authentication required' },
    [HttpStatusCodes.NOT_FOUND]: { description: 'Thread not found' },
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: { description: 'Internal Server Error' },
  },
});

export const updateThreadRoute = createRoute({
  method: 'patch',
  path: '/chat/threads/:id',
  tags: ['chat'],
  summary: 'Update thread',
  description: 'Update thread title, mode, status, or metadata',
  request: {
    params: ThreadIdParamSchema,
    body: {
      content: {
        'application/json': {
          schema: UpdateThreadRequestSchema,
        },
      },
    },
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Thread updated successfully',
      content: {
        'application/json': { schema: ThreadDetailResponseSchema },
      },
    },
    [HttpStatusCodes.UNAUTHORIZED]: { description: 'Authentication required' },
    [HttpStatusCodes.NOT_FOUND]: { description: 'Thread not found' },
    [HttpStatusCodes.BAD_REQUEST]: { description: 'Invalid request data' },
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: { description: 'Internal Server Error' },
  },
});

export const deleteThreadRoute = createRoute({
  method: 'delete',
  path: '/chat/threads/:id',
  tags: ['chat'],
  summary: 'Delete thread',
  description: 'Delete a chat thread (soft delete - sets status to deleted)',
  request: {
    params: ThreadIdParamSchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Thread deleted successfully',
      content: {
        'application/json': {
          schema: createApiResponseSchema(z.object({
            deleted: z.boolean().openapi({ example: true }),
          })),
        },
      },
    },
    [HttpStatusCodes.UNAUTHORIZED]: { description: 'Authentication required' },
    [HttpStatusCodes.NOT_FOUND]: { description: 'Thread not found' },
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: { description: 'Internal Server Error' },
  },
});

export const getPublicThreadRoute = createRoute({
  method: 'get',
  path: '/chat/public/:slug',
  tags: ['chat'],
  summary: 'Get public thread by slug',
  description: 'Get a publicly shared thread without authentication (read-only)',
  request: {
    params: ThreadSlugParamSchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Public thread retrieved successfully',
      content: {
        'application/json': { schema: ThreadDetailResponseSchema },
      },
    },
    [HttpStatusCodes.NOT_FOUND]: { description: 'Public thread not found or not public' },
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: { description: 'Internal Server Error' },
  },
});

export const getThreadBySlugRoute = createRoute({
  method: 'get',
  path: '/chat/threads/slug/:slug',
  tags: ['chat'],
  summary: 'Get thread by slug',
  description: 'Get thread details by slug for the authenticated user (ensures ownership)',
  request: {
    params: ThreadSlugParamSchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Thread retrieved successfully',
      content: {
        'application/json': { schema: ThreadDetailResponseSchema },
      },
    },
    [HttpStatusCodes.UNAUTHORIZED]: { description: 'Authentication required' },
    [HttpStatusCodes.NOT_FOUND]: { description: 'Thread not found or does not belong to user' },
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: { description: 'Internal Server Error' },
  },
});

// ============================================================================
// Participant Routes
// ============================================================================
// Note: GET /chat/threads/:id/participants removed - use GET /chat/threads/:id instead

export const addParticipantRoute = createRoute({
  method: 'post',
  path: '/chat/threads/:id/participants',
  tags: ['chat'],
  summary: 'Add participant to thread',
  description: 'Add an AI model with a role to the thread',
  request: {
    params: ThreadIdParamSchema,
    body: {
      content: {
        'application/json': {
          schema: AddParticipantRequestSchema,
        },
      },
    },
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Participant added successfully',
      content: {
        'application/json': { schema: ParticipantDetailResponseSchema },
      },
    },
    [HttpStatusCodes.UNAUTHORIZED]: { description: 'Authentication required' },
    [HttpStatusCodes.NOT_FOUND]: { description: 'Thread not found' },
    [HttpStatusCodes.BAD_REQUEST]: { description: 'Invalid model ID or request data' },
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: { description: 'Internal Server Error' },
  },
});

export const updateParticipantRoute = createRoute({
  method: 'patch',
  path: '/chat/participants/:id',
  tags: ['chat'],
  summary: 'Update participant',
  description: 'Update participant role, priority, or settings',
  request: {
    params: ParticipantIdParamSchema,
    body: {
      content: {
        'application/json': {
          schema: UpdateParticipantRequestSchema,
        },
      },
    },
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Participant updated successfully',
      content: {
        'application/json': { schema: ParticipantDetailResponseSchema },
      },
    },
    [HttpStatusCodes.UNAUTHORIZED]: { description: 'Authentication required' },
    [HttpStatusCodes.NOT_FOUND]: { description: 'Participant not found' },
    [HttpStatusCodes.BAD_REQUEST]: { description: 'Invalid request data' },
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: { description: 'Internal Server Error' },
  },
});

export const deleteParticipantRoute = createRoute({
  method: 'delete',
  path: '/chat/participants/:id',
  tags: ['chat'],
  summary: 'Remove participant',
  description: 'Remove a participant from the thread',
  request: {
    params: ParticipantIdParamSchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Participant removed successfully',
      content: {
        'application/json': {
          schema: createApiResponseSchema(z.object({
            deleted: z.boolean().openapi({ example: true }),
          })),
        },
      },
    },
    [HttpStatusCodes.UNAUTHORIZED]: { description: 'Authentication required' },
    [HttpStatusCodes.NOT_FOUND]: { description: 'Participant not found' },
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: { description: 'Internal Server Error' },
  },
});

// ============================================================================
// Message Routes
// ============================================================================

/**
 * Get messages for a thread with session data
 * Returns messages with session tracking metadata for UI display
 */
export const getThreadMessagesRoute = createRoute({
  method: 'get',
  path: '/chat/threads/:id/messages',
  tags: ['chat'],
  summary: 'Get thread messages with session data',
  description: 'Retrieve all messages for a thread with session tracking metadata for roundtable display',
  request: {
    params: ThreadIdParamSchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Messages retrieved successfully with session data',
      content: {
        'application/json': { schema: MessagesListResponseSchema },
      },
    },
    [HttpStatusCodes.UNAUTHORIZED]: { description: 'Authentication required' },
    [HttpStatusCodes.NOT_FOUND]: { description: 'Thread not found' },
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: { description: 'Internal Server Error' },
  },
});

/**
 * Streaming chat endpoint using Server-Sent Events (SSE)
 * Returns AI responses token-by-token for real-time streaming UX
 * This replaces the old sendMessageRoute - all chat messages should be streamed for better UX
 */
export const streamChatRoute = createRoute({
  method: 'post',
  path: '/chat/threads/:id/stream',
  tags: ['chat'],
  summary: 'Stream AI chat response',
  description: 'Send a user message and receive streaming AI responses via Server-Sent Events (SSE). Provides token-by-token streaming for real-time user experience.',
  request: {
    params: ThreadIdParamSchema,
    body: {
      content: {
        'application/json': {
          schema: StreamChatRequestSchema,
        },
      },
    },
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Streaming response (Server-Sent Events)',
      content: {
        'text/event-stream': {
          schema: z.object({
            type: z.enum(['start', 'chunk', 'complete', 'error']).openapi({
              description: 'Event type',
            }),
          }).openapi('StreamingEvent'),
        },
      },
    },
    [HttpStatusCodes.UNAUTHORIZED]: { description: 'Authentication required' },
    [HttpStatusCodes.NOT_FOUND]: { description: 'Thread not found' },
    [HttpStatusCodes.BAD_REQUEST]: { description: 'Invalid request data or no participants enabled' },
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: { description: 'Internal Server Error' },
  },
});

// ============================================================================
// Memory Routes
// ============================================================================

export const listMemoriesRoute = createRoute({
  method: 'get',
  path: '/chat/memories',
  tags: ['chat'],
  summary: 'List memories with cursor pagination',
  description: 'Get memories for the authenticated user with infinite scroll support',
  request: {
    query: z.object({
      cursor: z.string().optional().openapi({
        description: 'Cursor for pagination (ISO timestamp)',
        example: '2024-01-15T10:30:00Z',
      }),
      limit: z.coerce.number().int().min(1).max(100).default(20).openapi({
        description: 'Maximum number of items to return',
        example: 20,
      }),
    }).openapi('MemoryListQuery'),
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Memories retrieved successfully',
      content: {
        'application/json': { schema: MemoryListResponseSchema },
      },
    },
    [HttpStatusCodes.UNAUTHORIZED]: { description: 'Authentication required' },
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: { description: 'Internal Server Error' },
  },
});

export const createMemoryRoute = createRoute({
  method: 'post',
  path: '/chat/memories',
  tags: ['chat'],
  summary: 'Create memory',
  description: 'Create a new memory (user note, context, instruction) for AI models',
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateMemoryRequestSchema,
        },
      },
    },
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Memory created successfully',
      content: {
        'application/json': { schema: MemoryDetailResponseSchema },
      },
    },
    [HttpStatusCodes.UNAUTHORIZED]: { description: 'Authentication required' },
    [HttpStatusCodes.BAD_REQUEST]: { description: 'Invalid request data' },
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: { description: 'Internal Server Error' },
  },
});

export const getMemoryRoute = createRoute({
  method: 'get',
  path: '/chat/memories/:id',
  tags: ['chat'],
  summary: 'Get memory details',
  description: 'Get details of a specific memory',
  request: {
    params: MemoryIdParamSchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Memory retrieved successfully',
      content: {
        'application/json': { schema: MemoryDetailResponseSchema },
      },
    },
    [HttpStatusCodes.UNAUTHORIZED]: { description: 'Authentication required' },
    [HttpStatusCodes.NOT_FOUND]: { description: 'Memory not found' },
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: { description: 'Internal Server Error' },
  },
});

export const updateMemoryRoute = createRoute({
  method: 'patch',
  path: '/chat/memories/:id',
  tags: ['chat'],
  summary: 'Update memory',
  description: 'Update memory title, content, type, or metadata',
  request: {
    params: MemoryIdParamSchema,
    body: {
      content: {
        'application/json': {
          schema: UpdateMemoryRequestSchema,
        },
      },
    },
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Memory updated successfully',
      content: {
        'application/json': { schema: MemoryDetailResponseSchema },
      },
    },
    [HttpStatusCodes.UNAUTHORIZED]: { description: 'Authentication required' },
    [HttpStatusCodes.NOT_FOUND]: { description: 'Memory not found' },
    [HttpStatusCodes.BAD_REQUEST]: { description: 'Invalid request data' },
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: { description: 'Internal Server Error' },
  },
});

export const deleteMemoryRoute = createRoute({
  method: 'delete',
  path: '/chat/memories/:id',
  tags: ['chat'],
  summary: 'Delete memory',
  description: 'Delete a memory',
  request: {
    params: MemoryIdParamSchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Memory deleted successfully',
      content: {
        'application/json': {
          schema: createApiResponseSchema(z.object({
            deleted: z.boolean().openapi({ example: true }),
          })),
        },
      },
    },
    [HttpStatusCodes.UNAUTHORIZED]: { description: 'Authentication required' },
    [HttpStatusCodes.NOT_FOUND]: { description: 'Memory not found' },
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: { description: 'Internal Server Error' },
  },
});

// ============================================================================
// Custom Role Routes
// ============================================================================

export const listCustomRolesRoute = createRoute({
  method: 'get',
  path: '/chat/custom-roles',
  tags: ['chat'],
  summary: 'List custom roles with cursor pagination',
  description: 'Get custom role templates for the authenticated user with infinite scroll support',
  request: {
    query: z.object({
      cursor: z.string().optional().openapi({
        description: 'Cursor for pagination (ISO timestamp)',
        example: '2024-01-15T10:30:00Z',
      }),
      limit: z.coerce.number().int().min(1).max(100).default(20).openapi({
        description: 'Maximum number of items to return',
        example: 20,
      }),
    }).openapi('CustomRoleListQuery'),
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Custom roles retrieved successfully',
      content: {
        'application/json': { schema: CustomRoleListResponseSchema },
      },
    },
    [HttpStatusCodes.UNAUTHORIZED]: { description: 'Authentication required' },
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: { description: 'Internal Server Error' },
  },
});

export const createCustomRoleRoute = createRoute({
  method: 'post',
  path: '/chat/custom-roles',
  tags: ['chat'],
  summary: 'Create custom role',
  description: 'Create a new reusable custom role template with system prompt',
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateCustomRoleRequestSchema,
        },
      },
    },
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Custom role created successfully',
      content: {
        'application/json': { schema: CustomRoleDetailResponseSchema },
      },
    },
    [HttpStatusCodes.UNAUTHORIZED]: { description: 'Authentication required' },
    [HttpStatusCodes.BAD_REQUEST]: { description: 'Invalid request data or quota exceeded' },
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: { description: 'Internal Server Error' },
  },
});

export const getCustomRoleRoute = createRoute({
  method: 'get',
  path: '/chat/custom-roles/:id',
  tags: ['chat'],
  summary: 'Get custom role details',
  description: 'Get details of a specific custom role',
  request: {
    params: CustomRoleIdParamSchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Custom role retrieved successfully',
      content: {
        'application/json': { schema: CustomRoleDetailResponseSchema },
      },
    },
    [HttpStatusCodes.UNAUTHORIZED]: { description: 'Authentication required' },
    [HttpStatusCodes.NOT_FOUND]: { description: 'Custom role not found' },
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: { description: 'Internal Server Error' },
  },
});

export const updateCustomRoleRoute = createRoute({
  method: 'patch',
  path: '/chat/custom-roles/:id',
  tags: ['chat'],
  summary: 'Update custom role',
  description: 'Update custom role name, description, system prompt, or metadata',
  request: {
    params: CustomRoleIdParamSchema,
    body: {
      content: {
        'application/json': {
          schema: UpdateCustomRoleRequestSchema,
        },
      },
    },
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Custom role updated successfully',
      content: {
        'application/json': { schema: CustomRoleDetailResponseSchema },
      },
    },
    [HttpStatusCodes.UNAUTHORIZED]: { description: 'Authentication required' },
    [HttpStatusCodes.NOT_FOUND]: { description: 'Custom role not found' },
    [HttpStatusCodes.BAD_REQUEST]: { description: 'Invalid request data' },
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: { description: 'Internal Server Error' },
  },
});

export const deleteCustomRoleRoute = createRoute({
  method: 'delete',
  path: '/chat/custom-roles/:id',
  tags: ['chat'],
  summary: 'Delete custom role',
  description: 'Delete a custom role template',
  request: {
    params: CustomRoleIdParamSchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Custom role deleted successfully',
      content: {
        'application/json': {
          schema: createApiResponseSchema(z.object({
            deleted: z.boolean().openapi({ example: true }),
          })),
        },
      },
    },
    [HttpStatusCodes.UNAUTHORIZED]: { description: 'Authentication required' },
    [HttpStatusCodes.NOT_FOUND]: { description: 'Custom role not found' },
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: { description: 'Internal Server Error' },
  },
});
