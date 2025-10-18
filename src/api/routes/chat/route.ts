import { createRoute, z } from '@hono/zod-openapi';
import * as HttpStatusCodes from 'stoker/http-status-codes';
import * as HttpStatusPhrases from 'stoker/http-status-phrases';

import { ApiErrorResponseSchema, createApiResponseSchema, CursorPaginationQuerySchema, IdParamSchema } from '@/api/core/schemas';

import {
  AddParticipantRequestSchema,
  BulkUpdateParticipantsRequestSchema,
  BulkUpdateParticipantsResponseSchema,
  ChangelogListResponseSchema,
  CreateCustomRoleRequestSchema,
  CreateThreadRequestSchema,
  CustomRoleDetailResponseSchema,
  CustomRoleListResponseSchema,
  DeleteThreadResponseSchema,
  MessagesListResponseSchema,
  ModeratorAnalysisListResponseSchema,
  ModeratorAnalysisRequestSchema,
  ParticipantDetailResponseSchema,
  RoundAnalysisParamSchema,
  StreamChatRequestSchema,
  ThreadDetailResponseSchema,
  ThreadListQuerySchema,
  ThreadListResponseSchema,
  ThreadSlugParamSchema,
  UpdateCustomRoleRequestSchema,
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
    [HttpStatusCodes.UNAUTHORIZED]: {
      description: HttpStatusPhrases.UNAUTHORIZED,
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: {
      description: HttpStatusPhrases.INTERNAL_SERVER_ERROR,
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
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
      required: true,
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
    [HttpStatusCodes.UNAUTHORIZED]: {
      description: HttpStatusPhrases.UNAUTHORIZED,
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
    [HttpStatusCodes.BAD_REQUEST]: {
      description: HttpStatusPhrases.BAD_REQUEST,
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: {
      description: HttpStatusPhrases.INTERNAL_SERVER_ERROR,
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
  },
});

export const getThreadRoute = createRoute({
  method: 'get',
  path: '/chat/threads/:id',
  tags: ['chat'],
  summary: 'Get thread details',
  description: 'Get details of a specific chat thread',
  request: {
    params: IdParamSchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Thread retrieved successfully',
      content: {
        'application/json': { schema: ThreadDetailResponseSchema },
      },
    },
    [HttpStatusCodes.UNAUTHORIZED]: {
      description: HttpStatusPhrases.UNAUTHORIZED,
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
    [HttpStatusCodes.NOT_FOUND]: {
      description: HttpStatusPhrases.NOT_FOUND,
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: {
      description: HttpStatusPhrases.INTERNAL_SERVER_ERROR,
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
  },
});

export const updateThreadRoute = createRoute({
  method: 'patch',
  path: '/chat/threads/:id',
  tags: ['chat'],
  summary: 'Update thread',
  description: 'Update thread title, mode, status, or metadata',
  request: {
    params: IdParamSchema,
    body: {
      required: true,
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
    [HttpStatusCodes.UNAUTHORIZED]: {
      description: HttpStatusPhrases.UNAUTHORIZED,
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
    [HttpStatusCodes.NOT_FOUND]: {
      description: HttpStatusPhrases.NOT_FOUND,
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
    [HttpStatusCodes.BAD_REQUEST]: {
      description: HttpStatusPhrases.BAD_REQUEST,
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: {
      description: HttpStatusPhrases.INTERNAL_SERVER_ERROR,
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
  },
});

export const deleteThreadRoute = createRoute({
  method: 'delete',
  path: '/chat/threads/:id',
  tags: ['chat'],
  summary: 'Delete thread',
  description: 'Delete a chat thread (soft delete - sets status to deleted)',
  request: {
    params: IdParamSchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Thread deleted successfully',
      content: {
        'application/json': {
          schema: DeleteThreadResponseSchema,
        },
      },
    },
    [HttpStatusCodes.UNAUTHORIZED]: {
      description: HttpStatusPhrases.UNAUTHORIZED,
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
    [HttpStatusCodes.NOT_FOUND]: {
      description: HttpStatusPhrases.NOT_FOUND,
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: {
      description: HttpStatusPhrases.INTERNAL_SERVER_ERROR,
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
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
    [HttpStatusCodes.NOT_FOUND]: {
      description: HttpStatusPhrases.NOT_FOUND,
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: {
      description: HttpStatusPhrases.INTERNAL_SERVER_ERROR,
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
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
    [HttpStatusCodes.UNAUTHORIZED]: {
      description: HttpStatusPhrases.UNAUTHORIZED,
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
    [HttpStatusCodes.NOT_FOUND]: {
      description: HttpStatusPhrases.NOT_FOUND,
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: {
      description: HttpStatusPhrases.INTERNAL_SERVER_ERROR,
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
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
    params: IdParamSchema,
    body: {
      required: true,
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
    [HttpStatusCodes.UNAUTHORIZED]: {
      description: HttpStatusPhrases.UNAUTHORIZED,
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
    [HttpStatusCodes.NOT_FOUND]: {
      description: HttpStatusPhrases.NOT_FOUND,
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
    [HttpStatusCodes.BAD_REQUEST]: {
      description: HttpStatusPhrases.BAD_REQUEST,
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: {
      description: HttpStatusPhrases.INTERNAL_SERVER_ERROR,
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
  },
});

export const updateParticipantRoute = createRoute({
  method: 'patch',
  path: '/chat/participants/:id',
  tags: ['chat'],
  summary: 'Update participant',
  description: 'Update participant role, priority, or settings',
  request: {
    params: IdParamSchema,
    body: {
      required: true,
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
    [HttpStatusCodes.UNAUTHORIZED]: {
      description: HttpStatusPhrases.UNAUTHORIZED,
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
    [HttpStatusCodes.NOT_FOUND]: {
      description: HttpStatusPhrases.NOT_FOUND,
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
    [HttpStatusCodes.BAD_REQUEST]: {
      description: HttpStatusPhrases.BAD_REQUEST,
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: {
      description: HttpStatusPhrases.INTERNAL_SERVER_ERROR,
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
  },
});

export const deleteParticipantRoute = createRoute({
  method: 'delete',
  path: '/chat/participants/:id',
  tags: ['chat'],
  summary: 'Remove participant',
  description: 'Remove a participant from the thread',
  request: {
    params: IdParamSchema,
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
    [HttpStatusCodes.UNAUTHORIZED]: {
      description: HttpStatusPhrases.UNAUTHORIZED,
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
    [HttpStatusCodes.NOT_FOUND]: {
      description: HttpStatusPhrases.NOT_FOUND,
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: {
      description: HttpStatusPhrases.INTERNAL_SERVER_ERROR,
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
  },
});

export const bulkUpdateParticipantsRoute = createRoute({
  method: 'put',
  path: '/chat/threads/:id/participants/bulk',
  tags: ['chat'],
  summary: 'Bulk update thread participants',
  description: 'Update multiple participants at once (reorder, change roles, add/remove). Creates appropriate changelog entries for each change.',
  request: {
    params: IdParamSchema,
    body: {
      description: 'Complete list of participants with their updated state',
      content: {
        'application/json': {
          schema: BulkUpdateParticipantsRequestSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Participants updated successfully with changelog entries',
      content: {
        'application/json': {
          schema: BulkUpdateParticipantsResponseSchema,
        },
      },
    },
    [HttpStatusCodes.UNAUTHORIZED]: {
      description: HttpStatusPhrases.UNAUTHORIZED,
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
    [HttpStatusCodes.NOT_FOUND]: {
      description: HttpStatusPhrases.NOT_FOUND,
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
    [HttpStatusCodes.BAD_REQUEST]: {
      description: HttpStatusPhrases.BAD_REQUEST,
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: {
      description: HttpStatusPhrases.INTERNAL_SERVER_ERROR,
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
  },
});

// ============================================================================
// Message Routes
// ============================================================================

/**
 * Get messages for a thread
 * Returns all messages ordered by creation time
 */
export const getThreadMessagesRoute = createRoute({
  method: 'get',
  path: '/chat/threads/:id/messages',
  tags: ['chat'],
  summary: 'Get thread messages',
  description: 'Retrieve all messages for a thread ordered by creation time',
  request: {
    params: IdParamSchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Messages retrieved successfully',
      content: {
        'application/json': { schema: MessagesListResponseSchema },
      },
    },
    [HttpStatusCodes.UNAUTHORIZED]: {
      description: HttpStatusPhrases.UNAUTHORIZED,
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
    [HttpStatusCodes.NOT_FOUND]: {
      description: HttpStatusPhrases.NOT_FOUND,
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: {
      description: HttpStatusPhrases.INTERNAL_SERVER_ERROR,
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
  },
});

/**
 * Get changelog for a thread
 * Returns configuration change history for display between messages
 */
export const getThreadChangelogRoute = createRoute({
  method: 'get',
  path: '/chat/threads/:id/changelog',
  tags: ['chat'],
  summary: 'Get thread configuration changelog',
  description: 'Retrieve configuration changes (mode, participants) for a thread',
  request: {
    params: IdParamSchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Changelog retrieved successfully',
      content: {
        'application/json': { schema: ChangelogListResponseSchema },
      },
    },
    [HttpStatusCodes.UNAUTHORIZED]: {
      description: HttpStatusPhrases.UNAUTHORIZED,
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
    [HttpStatusCodes.NOT_FOUND]: {
      description: HttpStatusPhrases.NOT_FOUND,
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: {
      description: HttpStatusPhrases.INTERNAL_SERVER_ERROR,
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
  },
});

/**
 * ✅ AI SDK v5 Streaming Route (Official Pattern + Multi-Participant Extension)
 * Reference: https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot
 *
 * OFFICIAL AI SDK v5 PATTERN:
 * POST /api/chat
 * - Receives UIMessage[] array
 * - Streams response using toUIMessageStreamResponse()
 * - Returns text/event-stream content-type
 *
 * APPLICATION-SPECIFIC EXTENSION:
 * - Accepts `participantIndex` to route to specific AI model in roundtable
 * - Frontend calls this endpoint sequentially for each participant
 * - Handler uses participantIndex to select which model responds
 *
 * This pattern allows multiple AI models to respond to the same user question
 * in sequence, creating a "roundtable discussion" effect.
 */
export const streamChatRoute = createRoute({
  method: 'post',
  path: '/chat',
  tags: ['chat'],
  summary: 'Stream AI chat responses (AI SDK v5)',
  description: 'Official AI SDK v5 streaming endpoint with multi-participant support. Streams AI responses using toUIMessageStreamResponse() format. Supports text, reasoning, and file parts.',
  request: {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: StreamChatRequestSchema,
        },
      },
    },
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'AI SDK UI Message Stream Response - streamed as Server-Sent Events with content-type: text/event-stream; charset=utf-8',
      content: {
        'text/event-stream; charset=utf-8': {
          schema: z.any().openapi({
            description: 'AI SDK UI Message Stream format returned by toUIMessageStreamResponse(). Consumed by useChat hook on client. Includes text parts, file parts, tool calls, and message metadata.',
          }),
        },
      },
    },
    [HttpStatusCodes.UNAUTHORIZED]: {
      description: HttpStatusPhrases.UNAUTHORIZED,
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
    [HttpStatusCodes.BAD_REQUEST]: {
      description: HttpStatusPhrases.BAD_REQUEST,
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: {
      description: HttpStatusPhrases.INTERNAL_SERVER_ERROR,
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
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
    query: CursorPaginationQuerySchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Custom roles retrieved successfully',
      content: {
        'application/json': { schema: CustomRoleListResponseSchema },
      },
    },
    [HttpStatusCodes.UNAUTHORIZED]: {
      description: HttpStatusPhrases.UNAUTHORIZED,
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: {
      description: HttpStatusPhrases.INTERNAL_SERVER_ERROR,
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
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
      required: true,
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
    [HttpStatusCodes.UNAUTHORIZED]: {
      description: HttpStatusPhrases.UNAUTHORIZED,
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
    [HttpStatusCodes.BAD_REQUEST]: {
      description: HttpStatusPhrases.BAD_REQUEST,
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: {
      description: HttpStatusPhrases.INTERNAL_SERVER_ERROR,
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
  },
});

export const getCustomRoleRoute = createRoute({
  method: 'get',
  path: '/chat/custom-roles/:id',
  tags: ['chat'],
  summary: 'Get custom role details',
  description: 'Get details of a specific custom role',
  request: {
    params: IdParamSchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Custom role retrieved successfully',
      content: {
        'application/json': { schema: CustomRoleDetailResponseSchema },
      },
    },
    [HttpStatusCodes.UNAUTHORIZED]: {
      description: HttpStatusPhrases.UNAUTHORIZED,
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
    [HttpStatusCodes.NOT_FOUND]: {
      description: HttpStatusPhrases.NOT_FOUND,
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: {
      description: HttpStatusPhrases.INTERNAL_SERVER_ERROR,
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
  },
});

export const updateCustomRoleRoute = createRoute({
  method: 'patch',
  path: '/chat/custom-roles/:id',
  tags: ['chat'],
  summary: 'Update custom role',
  description: 'Update custom role name, description, system prompt, or metadata',
  request: {
    params: IdParamSchema,
    body: {
      required: true,
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
    [HttpStatusCodes.UNAUTHORIZED]: {
      description: HttpStatusPhrases.UNAUTHORIZED,
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
    [HttpStatusCodes.NOT_FOUND]: {
      description: HttpStatusPhrases.NOT_FOUND,
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
    [HttpStatusCodes.BAD_REQUEST]: {
      description: HttpStatusPhrases.BAD_REQUEST,
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: {
      description: HttpStatusPhrases.INTERNAL_SERVER_ERROR,
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
  },
});

export const deleteCustomRoleRoute = createRoute({
  method: 'delete',
  path: '/chat/custom-roles/:id',
  tags: ['chat'],
  summary: 'Delete custom role',
  description: 'Delete a custom role template',
  request: {
    params: IdParamSchema,
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
    [HttpStatusCodes.UNAUTHORIZED]: {
      description: HttpStatusPhrases.UNAUTHORIZED,
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
    [HttpStatusCodes.NOT_FOUND]: {
      description: HttpStatusPhrases.NOT_FOUND,
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: {
      description: HttpStatusPhrases.INTERNAL_SERVER_ERROR,
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
  },
});

// ============================================================================
// Moderator Analysis Routes
// ============================================================================

/**
 * Moderator Analysis Route
 *
 * ✅ AI SDK streamObject(): Generates structured analysis with ratings, pros/cons, and insights
 * ✅ Follows existing patterns: Similar to streamChatRoute but uses streamObject() instead of streamText()
 * ✅ Integrated with participant flow: Not a separate service, part of the chat system
 *
 * This endpoint analyzes all participant responses in a conversation round and provides:
 * - Individual ratings (1-10) for each participant
 * - Skills matrix data for chart visualization
 * - Pros and cons for each response
 * - Leaderboard ranking
 * - Overall summary and conclusion
 *
 * 📡 STREAMING PATTERN: AI SDK streamObject (text/plain; charset=utf-8)
 * - Uses `streamObject()` from AI SDK for structured JSON streaming with schema validation
 * - Content-Type: 'text/plain; charset=utf-8' (AI SDK default for streamObject)
 * - Client: Use AI SDK's experimental_useObject hook for type-safe partial object updates
 * - Progressive object property rendering with Zod schema validation
 * - Different from streamText - streams structured data, not just tokens
 */
export const analyzeRoundRoute = createRoute({
  method: 'post',
  path: '/chat/threads/:threadId/rounds/:roundNumber/analyze',
  tags: ['chat'],
  summary: 'Analyze conversation round with AI moderator',
  description: 'Generate AI-powered analysis, ratings, and insights for all participant responses in a conversation round. Uses structured object streaming for real-time updates.',
  request: {
    params: RoundAnalysisParamSchema,
    body: {
      required: true,
      content: {
        'application/json': {
          schema: ModeratorAnalysisRequestSchema,
        },
      },
    },
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Streaming moderator analysis (AI SDK text stream with structured JSON objects). Consumed via @ai-sdk/react useObject() hook.',
      content: {
        'text/plain; charset=utf-8': {
          schema: z.object({
            partialObject: z.any().openapi({
              description: 'Partial ModeratorAnalysisPayload being streamed via AI SDK streamObject()',
            }),
          }),
        },
      },
    },
    [HttpStatusCodes.UNAUTHORIZED]: {
      description: HttpStatusPhrases.UNAUTHORIZED,
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
    [HttpStatusCodes.NOT_FOUND]: {
      description: HttpStatusPhrases.NOT_FOUND,
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
    [HttpStatusCodes.BAD_REQUEST]: {
      description: HttpStatusPhrases.BAD_REQUEST,
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: {
      description: HttpStatusPhrases.INTERNAL_SERVER_ERROR,
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
  },
});

/**
 * Get moderator analyses for a thread
 * Returns all persisted analyses ordered by round number
 */
export const getThreadAnalysesRoute = createRoute({
  method: 'get',
  path: '/chat/threads/:id/analyses',
  tags: ['chat'],
  summary: 'Get moderator analyses for thread',
  description: 'Retrieve all moderator analyses for a thread, showing past analysis results for each round',
  request: {
    params: IdParamSchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Analyses retrieved successfully',
      content: {
        'application/json': { schema: ModeratorAnalysisListResponseSchema },
      },
    },
    [HttpStatusCodes.UNAUTHORIZED]: {
      description: HttpStatusPhrases.UNAUTHORIZED,
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
    [HttpStatusCodes.NOT_FOUND]: {
      description: HttpStatusPhrases.NOT_FOUND,
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: {
      description: HttpStatusPhrases.INTERNAL_SERVER_ERROR,
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
  },
});
