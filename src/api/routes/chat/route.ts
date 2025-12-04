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
  PreSearchListResponseSchema,
  PreSearchRequestSchema,
  PreSearchResponseSchema,
  RoundFeedbackParamSchema,
  RoundFeedbackRequestSchema,
  SetRoundFeedbackResponseSchema,
  StreamChatRequestSchema,
  StreamStatusResponseSchema,
  ThreadDetailResponseSchema,
  ThreadListQuerySchema,
  ThreadListResponseSchema,
  ThreadSlugStatusResponseSchema,
  UpdateCustomRoleRequestSchema,
  UpdateParticipantRequestSchema,
  UpdateThreadRequestSchema,
} from './schema';

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
    [HttpStatusCodes.FORBIDDEN]: {
      description: 'Model access denied - subscription tier insufficient for selected model(s)',
      content: {
        'application/json': { schema: ApiErrorResponseSchema },
      },
    },
    [HttpStatusCodes.TOO_MANY_REQUESTS]: {
      description: 'Thread quota exceeded - upgrade subscription or wait for quota reset',
      content: {
        'application/json': { schema: ApiErrorResponseSchema },
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
export const getThreadSlugStatusRoute = createRoute({
  method: 'get',
  path: '/chat/threads/:id/slug-status',
  tags: ['chat'],
  summary: 'Get thread slug status',
  description: 'Lightweight endpoint to check if thread slug has been updated (for polling during AI title generation)',
  request: {
    params: IdParamSchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Thread slug status retrieved successfully',
      content: {
        'application/json': {
          schema: ThreadSlugStatusResponseSchema,
        },
      },
    },
    ...createProtectedRouteResponses(),
  },
});
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
 * POST Create Pre-Search Route - Create PENDING pre-search record
 * ✅ NEW: Creates PENDING record BEFORE participant streaming
 * ✅ IDEMPOTENT: Returns existing record if already exists
 * ✅ DATABASE-FIRST: Matches thread creation pattern (thread.handler.ts:269-278)
 */
export const createPreSearchRoute = createRoute({
  method: 'post',
  path: '/chat/threads/:threadId/rounds/:roundNumber/pre-search/create',
  tags: ['chat'],
  summary: 'Create PENDING pre-search record before participant streaming',
  description: 'Creates a PENDING pre-search record that must exist BEFORE participants start streaming. This ensures correct event ordering: user message → pre-search (PENDING → STREAMING → COMPLETE) → participants. Does NOT execute the search - that happens via the execute endpoint.',
  request: {
    params: ThreadRoundParamSchema,
    body: {
      required: true,
      content: {
        'application/json': {
          schema: PreSearchRequestSchema,
        },
      },
    },
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Pre-search record created or already exists (idempotent)',
      content: {
        'application/json': {
          schema: PreSearchResponseSchema,
        },
      },
    },
    ...createMutationRouteResponses(),
  },
});

/**
 * POST Pre-Search Route - Execute or return existing search
 * ✅ FOLLOWS: analyzeRoundRoute pattern exactly
 * ✅ IDEMPOTENT: Returns existing if already completed
 * ✅ DATABASE-FIRST: Creates record before streaming
 */
export const executePreSearchRoute = createRoute({
  method: 'post',
  path: '/chat/threads/:threadId/rounds/:roundNumber/pre-search',
  tags: ['chat'],
  summary: 'Execute pre-search for conversation round (streaming)',
  description: 'Generate and execute web search queries before participant streaming. Streams search progress in real-time using SSE. Returns completed search immediately if already exists. Follows same architectural pattern as moderator analysis.',
  request: {
    params: ThreadRoundParamSchema,
    body: {
      required: true,
      content: {
        'application/json': {
          schema: PreSearchRequestSchema,
        },
      },
    },
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Pre-search streaming in progress OR completed search returned (if already exists). Content-Type: text/plain for streaming, application/json for completed.',
      content: {
        'text/plain': {
          schema: z.string().describe('Streaming SSE data'),
        },
        'application/json': {
          schema: PreSearchResponseSchema.describe('Completed search (if already exists)'),
        },
      },
    },
    [HttpStatusCodes.ACCEPTED]: {
      description: 'Stream is active but buffer not ready - client should poll. Returns polling metadata including retryAfterMs.',
      content: {
        'application/json': {
          schema: StreamStatusResponseSchema.describe('Polling status with retry delay'),
        },
      },
    },
    [HttpStatusCodes.CONFLICT]: {
      description: 'Pre-search already in progress for this round',
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
    ...createMutationRouteResponses(),
  },
});

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
POST /chat {
  "message": { id: "msg_1", role: "user", parts: [...] },
  "id": "thread_abc123",
  "participantIndex": 0
}
POST /chat {
  "messages": [msg1, msg2, ..., msg50],
  "id": "thread_abc123"
}
\`\`\`
## Multi-Participant Orchestration
Stream multiple AI models sequentially for "roundtable discussion" effect:
\`\`\`typescript
POST /chat { message: userMsg, id: "thread_1", participantIndex: 0 }
POST /chat { message: userMsg, id: "thread_1", participantIndex: 1 }
POST /chat { message: userMsg, id: "thread_1", participantIndex: 2 }
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
  }
}
\`\`\`
See [API Streaming Guide](/docs/api-streaming-guide.md) for complete implementation.`,
      content: {
        'text/event-stream; charset=utf-8': {
          // ✅ JUSTIFIED z.any(): SSE streams have dynamic format (AI SDK UIMessageStream protocol)
          // Multiple event types with different structures - cannot be represented with single static Zod schema
          // Reference: https://sdk.vercel.ai/docs/reference/ai-sdk-ui/stream-protocol
          // Event types: text chunks, metadata, finish reason, errors
          schema: z.any().openapi({
            description: 'AI SDK UIMessageStream format. Dynamic SSE protocol with multiple event types: text chunks (0:), metadata (2:), errors (e:), finish reason, token usage. Use AI SDK client libraries (useChat, streamText) for automatic parsing. Cannot be represented with static schema due to protocol dynamism.',
            example: 'data: 0:"Hello"\ndata: 0:" World"\ndata: 2:[{"finishReason":"stop","usage":{"promptTokens":150,"completionTokens":45}}]\ndata: e:{"finishReason":"stop"}\n\n',
          }),
        },
      },
    },
    [HttpStatusCodes.FORBIDDEN]: {
      description: 'Model access denied - subscription tier insufficient for selected model(s)',
      content: {
        'application/json': { schema: ApiErrorResponseSchema },
      },
    },
    [HttpStatusCodes.TOO_MANY_REQUESTS]: {
      description: 'Message quota exceeded - upgrade subscription or wait for quota reset',
      content: {
        'application/json': { schema: ApiErrorResponseSchema },
      },
    },
    ...createMutationRouteResponses(),
  },
});
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
export const analyzeRoundRoute = createRoute({
  method: 'post',
  path: '/chat/threads/:threadId/rounds/:roundNumber/analyze',
  tags: ['chat'],
  summary: 'Analyze conversation round with AI moderator (streaming)',
  description: 'Generate AI-powered analysis, ratings, and insights for all participant responses in a conversation round. Streams structured analysis object in real-time using AI SDK streamObject(). Use experimental_useObject hook on frontend for progressive rendering. Returns completed analysis immediately if already exists.',
  request: {
    params: ThreadRoundParamSchema,
    body: {
      required: false, // ✅ FIXED: Allow empty body (backend auto-queries messages from database)
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
 * GET Thread Pre-Searches Route - List all pre-searches for thread
 * ✅ FOLLOWS: getThreadAnalysesRoute pattern
 */
export const getThreadPreSearchesRoute = createRoute({
  method: 'get',
  path: '/chat/threads/:id/pre-searches',
  tags: ['chat'],
  summary: 'Get pre-search results for thread',
  description: 'Retrieve all pre-search results for a thread, showing past search results for each round',
  request: {
    params: IdParamSchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Pre-searches retrieved successfully',
      content: {
        'application/json': { schema: PreSearchListResponseSchema },
      },
    },
    ...createProtectedRouteResponses(),
  },
});

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

/**
 * GET Stream Status Route - Check participant stream status for resumption
 * ✅ RESUMABLE STREAMS: Check if participant stream is active/completed
 */
export const getStreamStatusRoute = createRoute({
  method: 'get',
  path: '/chat/threads/:threadId/streams/:streamId',
  tags: ['chat'],
  summary: 'Check participant stream status for resumption',
  description: `Check if a participant stream is active, completed, or failed. Used by frontend to detect and resume ongoing streams after page reload.

**Stream ID Format**: \`{threadId}_r{roundNumber}_p{participantIndex}\`

**Response Codes**:
- \`204 No Content\`: No stream exists or stream is still active (frontend should poll/wait)
- \`200 OK\`: Stream completed or failed (includes stream metadata)

**Usage Pattern**:
1. Frontend detects page reload during streaming
2. Calls this endpoint with stream ID
3. If 204: Stream is active, wait or poll for completion
4. If 200: Stream completed, fetch message from database

**Example**: GET \`/chat/threads/thread_123/streams/thread_123_r0_p0\``,
  request: {
    params: z.object({
      threadId: z.string().openapi({
        description: 'Thread ID',
        example: 'thread_abc123',
      }),
      streamId: z.string().openapi({
        description: 'Stream ID (format: {threadId}_r{roundNumber}_p{participantIndex})',
        example: 'thread_abc123_r0_p0',
      }),
    }),
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Stream completed or failed - includes state metadata',
      content: {
        'application/json': { schema: StreamStatusResponseSchema },
      },
    },
    [HttpStatusCodes.NO_CONTENT]: {
      description: 'No stream exists or stream is still active',
    },
    ...createProtectedRouteResponses(),
  },
});

/**
 * GET /chat/threads/:threadId/streams/:streamId/resume
 * ✅ RESUMABLE STREAMS: Resume buffered participant stream
 */
export const resumeStreamRoute = createRoute({
  method: 'get',
  path: '/chat/threads/:threadId/streams/:streamId/resume',
  tags: ['chat'],
  summary: 'Resume buffered participant stream',
  description: `Resume a participant stream from buffered SSE chunks. Returns the full stream as SSE for client consumption.

**Stream ID Format**: {threadId}_r{roundNumber}_p{participantIndex}

**Response Types**:
- text/event-stream: SSE stream with buffered chunks (if stream has data)
- 204 No Content: No stream buffer exists or stream has no chunks

**Usage Pattern**:
1. Frontend detects page reload and active stream
2. Calls this endpoint to resume from buffer
3. Backend returns buffered SSE chunks
4. Frontend processes as normal stream

**Example**: GET /chat/threads/thread_123/streams/thread_123_r0_p0/resume`,
  request: {
    params: z.object({
      threadId: z.string().openapi({
        description: 'Thread ID',
        example: 'thread_abc123',
      }),
      streamId: z.string().openapi({
        description: 'Stream ID (format: {threadId}_r{roundNumber}_p{participantIndex})',
        example: 'thread_abc123_r0_p0',
      }),
    }),
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Buffered stream chunks returned as SSE',
      content: {
        'text/event-stream': {
          // ✅ JUSTIFIED z.any(): SSE streams have dynamic format (AI SDK protocol)
          // Cannot be represented with static Zod schema - each event has different structure
          // Reference: https://sdk.vercel.ai/docs/ai-sdk-ui/stream-protocol
          schema: z.any().openapi({
            description: 'Server-Sent Events (SSE) stream following AI SDK Stream Protocol. Dynamic format - cannot be statically typed. See AI SDK documentation for event structure.',
          }),
        },
      },
    },
    [HttpStatusCodes.NO_CONTENT]: {
      description: 'No stream buffer exists or stream has no chunks',
    },
    ...createProtectedRouteResponses(),
  },
});

/**
 * GET /chat/threads/:threadId/stream
 * ✅ RESUMABLE STREAMS: Resume active stream (AI SDK documentation pattern)
 */
export const resumeThreadStreamRoute = createRoute({
  method: 'get',
  path: '/chat/threads/:threadId/stream',
  tags: ['chat'],
  summary: 'Resume active stream for thread (AI SDK pattern)',
  description: `Resume the active stream for a thread. Follows the AI SDK Chatbot Resume Streams documentation pattern.

This is the **preferred endpoint** for stream resumption. The frontend doesn't need to construct the stream ID - the backend automatically looks up which stream is active and returns it.

**Response Types**:
- text/event-stream: SSE stream with buffered chunks (if active stream exists)
- 204 No Content: No active stream for this thread

**Response Headers** (on 200 OK):
- X-Stream-Id: The stream ID (format: {threadId}_r{roundNumber}_p{participantIndex})
- X-Round-Number: The round number of the active stream
- X-Participant-Index: The participant index of the active stream

**Usage Pattern** (AI SDK):
1. useChat mounts with resume: true
2. AI SDK calls GET /chat/threads/{id}/stream
3. If 204: No active stream, proceed normally
4. If 200: Stream found, process SSE and trigger next participant on completion

**Example**: GET /chat/threads/thread_123/stream`,
  request: {
    params: z.object({
      threadId: z.string().openapi({
        description: 'Thread ID',
        example: 'thread_abc123',
      }),
    }),
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Active stream found - returning buffered SSE chunks',
      content: {
        'text/event-stream': {
          // ✅ JUSTIFIED z.any(): SSE streams have dynamic format (AI SDK protocol)
          // Cannot be represented with static Zod schema - each event has different structure
          // Reference: https://sdk.vercel.ai/docs/ai-sdk-ui/stream-protocol
          schema: z.any().openapi({
            description: 'Server-Sent Events (SSE) stream with buffered chunks. Dynamic format following AI SDK Stream Protocol.',
          }),
        },
      },
    },
    [HttpStatusCodes.NO_CONTENT]: {
      description: 'No active stream for this thread',
    },
    ...createProtectedRouteResponses(),
  },
});

/**
 * GET /chat/threads/:threadId/rounds/:roundNumber/analyze/resume
 * ✅ RESUMABLE STREAMS: Resume buffered analysis stream (object stream)
 */
export const resumeAnalysisStreamRoute = createRoute({
  method: 'get',
  path: '/chat/threads/:threadId/rounds/:roundNumber/analyze/resume',
  tags: ['chat'],
  summary: 'Resume buffered analysis stream',
  description: `Resume a moderator analysis stream from buffered chunks. Returns the full stream as text for client consumption.

This endpoint enables analysis stream resumption after page reload. Unlike chat streams which use SSE format, analysis streams use plain text (JSON being built incrementally).

**Response Types**:
- text/plain: Text stream with buffered chunks (if stream has data)
- 204 No Content: No stream buffer exists or stream has no chunks

**Usage Pattern**:
1. Frontend detects page reload during analysis streaming
2. Calls this endpoint to check for and resume active stream
3. If 200: Receives buffered chunks, continues rendering
4. If 204: No active stream, may need to retry analysis

**Example**: GET /chat/threads/thread_123/rounds/0/analyze/resume`,
  request: {
    params: ThreadRoundParamSchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Buffered stream chunks returned as text',
      content: {
        'text/plain': {
          schema: z.string().describe('Text stream with buffered JSON object chunks'),
        },
      },
    },
    [HttpStatusCodes.NO_CONTENT]: {
      description: 'No stream buffer exists or stream has no chunks',
    },
    ...createProtectedRouteResponses(),
  },
});
