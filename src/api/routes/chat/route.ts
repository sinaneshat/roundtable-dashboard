import { createRoute, z } from '@hono/zod-openapi';
import * as HttpStatusCodes from 'stoker/http-status-codes';

import {
  createMutationRouteResponses,
  createProtectedRouteResponses,
  createPublicRouteResponses,
} from '@/api/core/response-schemas';
import { ApiErrorResponseSchema, createApiResponseSchema, CursorPaginationQuerySchema, IdParamSchema, ThreadRoundParamSchema, ThreadSlugParamSchema } from '@/api/core/schemas';

import {
  AddParticipantRequestSchema,
  ChangelogListResponseSchema,
  CreateCustomRoleRequestSchema,
  CreateThreadRequestSchema,
  CustomRoleDetailResponseSchema,
  CustomRoleListResponseSchema,
  DeleteThreadResponseSchema,
  GetThreadFeedbackResponseSchema,
  MessagesListResponseSchema,
  ModeratorAnalysisListResponseSchema,
  ModeratorAnalysisPayloadSchema,
  ModeratorAnalysisRequestSchema,
  ParticipantDetailResponseSchema,
  RoundFeedbackParamSchema,
  RoundFeedbackRequestSchema,
  SetRoundFeedbackResponseSchema,
  StreamChatRequestSchema,
  ThreadDetailResponseSchema,
  ThreadListQuerySchema,
  ThreadListResponseSchema,
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
    ...createProtectedRouteResponses(),
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
    ...createMutationRouteResponses(),
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
    ...createProtectedRouteResponses(),
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
    ...createMutationRouteResponses(),
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
    ...createProtectedRouteResponses(),
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
    ...createPublicRouteResponses(),
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
    ...createProtectedRouteResponses(),
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
    ...createMutationRouteResponses(),
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
    ...createMutationRouteResponses(),
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
    ...createProtectedRouteResponses(),
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
    ...createProtectedRouteResponses(),
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
    ...createProtectedRouteResponses(),
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
  description: `**Real-time AI streaming endpoint using Server-Sent Events (SSE)**

## Overview

Official AI SDK v5 streaming endpoint with multi-participant orchestration support. Streams AI responses token-by-token using the \`toUIMessageStreamResponse()\` format from Vercel AI SDK.

**Key Features:**
- Real-time token streaming (characters appear as generated)
- Multi-participant support (sequential model responses)
- Automatic message persistence to database
- Send only last message (backend loads history)
- Reasoning and text parts support
- Error recovery with structured metadata

## Request Pattern

**Send Only Last Message (Official AI SDK v5 Pattern):**
\`\`\`typescript
// ✅ Correct: Send only new message (backend loads previous from DB)
POST /chat {
  "message": { id: "msg_1", role: "user", parts: [...] },
  "id": "thread_abc123",
  "participantIndex": 0
}

// ❌ Wrong: Don't send entire history (inefficient)
POST /chat {
  "messages": [msg1, msg2, ..., msg50], // Large payload
  "id": "thread_abc123"
}
\`\`\`

## Multi-Participant Orchestration

Stream multiple AI models sequentially for "roundtable discussion" effect:

\`\`\`typescript
// Step 1: User asks question → Participant 0 responds
POST /chat { message: userMsg, id: "thread_1", participantIndex: 0 }

// Step 2: Same question → Participant 1 responds
POST /chat { message: userMsg, id: "thread_1", participantIndex: 1 }

// Step 3: Same question → Participant 2 responds
POST /chat { message: userMsg, id: "thread_1", participantIndex: 2 }
// → All 3 AI models have now provided perspectives
\`\`\`

**Important:** Stream participants **sequentially** (not concurrently) to avoid race conditions.

## SSE Stream Format

**Content-Type:** \`text/event-stream; charset=utf-8\`

**Event Protocol:** AI SDK custom streaming format with type prefixes:
- \`0:\` - Text chunks (append to message content)
- \`1:\` - Function call chunks (tool usage)
- \`2:\` - Metadata chunks (usage, finish reason)
- \`3:\` - Error chunks
- \`e:\` - End of stream marker

**Example Stream:**
\`\`\`
data: 0:"The"
data: 0:" answer"
data: 0:" is"
data: 0:"..."
data: 2:[{"finishReason":"stop","usage":{"promptTokens":150,"completionTokens":45}}]
data: e:{"finishReason":"stop"}

\`\`\`

## Message Persistence

**Automatic Backend Handling:**
1. **User message:** Saved by participant 0 only (deduplication)
2. **Assistant messages:** Saved via \`onFinish\` callback after stream completes
3. **Metadata:** Includes round number, participant context, error state, token usage

**Round Number Tracking:**
- Automatically calculated: \`Math.ceil(assistantMessageCount / participantCount)\`
- Example: 3 participants, 9 messages → Round 3

## Error Handling

**HTTP Errors (before stream starts):**
- \`400\`: Invalid message format
- \`401\`: Authentication required
- \`403\`: Insufficient subscription tier
- \`429\`: Rate limit exceeded

**Stream Errors (during streaming):**
\`\`\`
data: 3:{"error":"Model unavailable","code":"model_unavailable","isTransient":true}
\`\`\`

**Transient errors** (retry recommended):
- \`rate_limit_exceeded\`, \`model_unavailable\`, \`timeout\`

**Permanent errors** (don't retry):
- \`content_filter\`, \`invalid_request\`, \`insufficient_quota\`

## Complete Guide

For detailed implementation examples, error handling, and best practices, see:
**📖 [API Streaming Guide](/docs/api-streaming-guide.md)**

Includes:
- Python and TypeScript examples
- SSE parsing implementations
- Retry strategies
- Common pitfalls and solutions`,
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
      description: `**Server-Sent Events (SSE) stream with AI SDK v5 protocol**

Stream returns real-time tokens using AI SDK's custom protocol:

**Event Types:**
- \`data: 0:"text"\` - Text chunk (append to message)
- \`data: 2:[metadata]\` - Completion metadata (usage, finish reason)
- \`data: e:{"finishReason":"stop"}\` - End of stream
- \`data: 3:{error}\` - Error chunk

**Parsing Example:**
\`\`\`typescript
const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  const line = decoder.decode(value);
  if (line.startsWith('data: 0:')) {
    const chunk = JSON.parse(line.slice(8));
    console.log('Text:', chunk);
  }
}
\`\`\`

See [API Streaming Guide](/docs/api-streaming-guide.md) for complete implementation.`,
      content: {
        'text/event-stream; charset=utf-8': {
          schema: z.any().openapi({
            description: 'AI SDK UI Message Stream format. Includes text chunks, metadata (token usage, finish reason), and error information. Use AI SDK client libraries for automatic parsing or implement manual SSE parsing.',
            example: 'data: 0:"Hello"\ndata: 0:" World"\ndata: 2:[{"finishReason":"stop","usage":{"promptTokens":150,"completionTokens":45}}]\ndata: e:{"finishReason":"stop"}\n\n',
          }),
        },
      },
    },
    ...createMutationRouteResponses(),
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
    ...createProtectedRouteResponses(),
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
    ...createMutationRouteResponses(),
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
    ...createProtectedRouteResponses(),
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
    ...createMutationRouteResponses(),
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
    ...createProtectedRouteResponses(),
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
  summary: 'Analyze conversation round with AI moderator (streaming)',
  description: 'Generate AI-powered analysis, ratings, and insights for all participant responses in a conversation round. Streams structured analysis object in real-time using AI SDK streamObject(). Use experimental_useObject hook on frontend for progressive rendering. Returns completed analysis immediately if already exists.',
  request: {
    params: ThreadRoundParamSchema,
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
      description: 'Analysis streaming in progress OR completed analysis returned (if already exists). Content-Type: text/plain for streaming, application/json for completed.',
      content: {
        'text/plain': {
          schema: z.string().describe('Streaming object data (AI SDK format)'),
        },
        'application/json': {
          schema: createApiResponseSchema(ModeratorAnalysisPayloadSchema).describe('Completed analysis (if already exists)'),
        },
      },
    },
    [HttpStatusCodes.CONFLICT]: {
      description: 'Analysis already in progress or completed for this round',
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
    ...createMutationRouteResponses(),
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
    ...createProtectedRouteResponses(),
  },
});

// ============================================================================
// Round Feedback Routes
// ============================================================================

/**
 * Set Round Feedback Route
 * Allows users to like/dislike a conversation round
 */
export const setRoundFeedbackRoute = createRoute({
  method: 'put',
  path: '/chat/threads/:threadId/rounds/:roundNumber/feedback',
  tags: ['chat'],
  summary: 'Set round feedback (like/dislike)',
  description: 'Set or update user feedback for a conversation round. Pass null to remove feedback.',
  request: {
    params: RoundFeedbackParamSchema,
    body: {
      required: true,
      content: {
        'application/json': {
          schema: RoundFeedbackRequestSchema,
        },
      },
    },
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Feedback set successfully',
      content: {
        'application/json': { schema: SetRoundFeedbackResponseSchema },
      },
    },
    ...createMutationRouteResponses(),
  },
});

/**
 * Get Thread Feedback Route
 * Retrieves all round feedback for a thread (for the current user)
 */
export const getThreadFeedbackRoute = createRoute({
  method: 'get',
  path: '/chat/threads/:id/feedback',
  tags: ['chat'],
  summary: 'Get all round feedback for a thread',
  description: 'Get all round feedback (likes/dislikes) for a thread for the current user.',
  request: {
    params: IdParamSchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Feedback retrieved successfully',
      content: {
        'application/json': { schema: GetThreadFeedbackResponseSchema },
      },
    },
    ...createProtectedRouteResponses(),
  },
});
