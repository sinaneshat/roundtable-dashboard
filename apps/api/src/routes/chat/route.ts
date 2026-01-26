import { createRoute, z } from '@hono/zod-openapi';
import * as HttpStatusCodes from 'stoker/http-status-codes';

import { ApiErrorResponseSchema, createApiResponseSchema, createMutationRouteResponses, createProtectedRouteResponses, createPublicRouteResponses, CursorPaginationQuerySchema, IdParamSchema, ThreadIdParamSchema, ThreadRoundParamSchema, ThreadSlugParamSchema } from '@/core';

import {
  AddParticipantRequestSchema,
  AnalyzePromptRequestSchema,
  ChangelogListResponseSchema,
  CreateCustomRoleRequestSchema,
  CreateThreadRequestSchema,
  CreateUserPresetRequestSchema,
  CustomRoleDetailResponseSchema,
  CustomRoleListResponseSchema,
  DeletedResponseSchema,
  DeleteThreadResponseSchema,
  ExistingModeratorMessageSchema,
  GetThreadFeedbackResponseSchema,
  MemoryEventQuerySchema,
  MemoryEventResponseSchema,
  MessagesListResponseSchema,
  ParticipantDetailResponseSchema,
  PreSearchListResponseSchema,
  PreSearchRequestSchema,
  PreSearchResponseSchema,
  PublicThreadSlugsResponseSchema,
  RoundFeedbackParamSchema,
  RoundFeedbackRequestSchema,
  RoundModeratorRequestSchema,
  RoundStatusResponseSchema,
  SetRoundFeedbackResponseSchema,
  StreamChatRequestSchema,
  StreamStatusResponseSchema,
  ThreadDetailResponseSchema,
  ThreadListQuerySchema,
  ThreadListResponseSchema,
  ThreadSidebarListResponseSchema,
  ThreadSlugStatusResponseSchema,
  ThreadStreamResumptionStateResponseSchema,
  UpdateCustomRoleRequestSchema,
  UpdateParticipantRequestSchema,
  UpdateThreadRequestSchema,
  UpdateThreadResponseSchema,
  UpdateUserPresetRequestSchema,
  UserPresetDetailResponseSchema,
  UserPresetListResponseSchema,
} from './schema';

export const listThreadsRoute = createRoute({
  description: 'Get chat threads for the authenticated user with infinite scroll support',
  method: 'get',
  path: '/chat/threads',
  request: {
    query: ThreadListQuerySchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': { schema: ThreadListResponseSchema },
      },
      description: 'Threads retrieved successfully with pagination cursor',
    },
    ...createProtectedRouteResponses(),
  },
  summary: 'List chat threads with cursor pagination',
  tags: ['chat'],
});

export const listSidebarThreadsRoute = createRoute({
  description: 'Lightweight endpoint for sidebar - only essential fields (id, title, slug, previousSlug, isFavorite, isPublic, timestamps)',
  method: 'get',
  path: '/chat/threads/sidebar',
  request: {
    query: ThreadListQuerySchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': { schema: ThreadSidebarListResponseSchema },
      },
      description: 'Sidebar threads retrieved',
    },
    ...createProtectedRouteResponses(),
  },
  summary: 'List sidebar threads (lightweight)',
  tags: ['chat'],
});

export const createThreadRoute = createRoute({
  description: 'Create a new chat thread with specified mode and configuration',
  method: 'post',
  path: '/chat/threads',
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateThreadRequestSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    [HttpStatusCodes.FORBIDDEN]: {
      content: {
        'application/json': { schema: ApiErrorResponseSchema },
      },
      description: 'Model access denied - subscription tier insufficient for selected model(s)',
    },
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': { schema: ThreadDetailResponseSchema },
      },
      description: 'Thread created successfully',
    },
    [HttpStatusCodes.TOO_MANY_REQUESTS]: {
      content: {
        'application/json': { schema: ApiErrorResponseSchema },
      },
      description: 'Thread quota exceeded - upgrade subscription or wait for quota reset',
    },
    ...createMutationRouteResponses(),
  },
  summary: 'Create chat thread',
  tags: ['chat'],
});
export const getThreadRoute = createRoute({
  description: 'Get details of a specific chat thread',
  method: 'get',
  path: '/chat/threads/{id}',
  request: {
    params: IdParamSchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': { schema: ThreadDetailResponseSchema },
      },
      description: 'Thread retrieved successfully',
    },
    ...createProtectedRouteResponses(),
  },
  summary: 'Get thread details',
  tags: ['chat'],
});
export const updateThreadRoute = createRoute({
  description: 'Update thread title, mode, status, or metadata',
  method: 'patch',
  path: '/chat/threads/{id}',
  request: {
    body: {
      content: {
        'application/json': {
          schema: UpdateThreadRequestSchema,
        },
      },
      required: true,
    },
    params: IdParamSchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': { schema: UpdateThreadResponseSchema },
      },
      description: 'Thread updated successfully',
    },
    ...createMutationRouteResponses(),
  },
  summary: 'Update thread',
  tags: ['chat'],
});
export const deleteThreadRoute = createRoute({
  description: 'Delete a chat thread (soft delete - sets status to deleted)',
  method: 'delete',
  path: '/chat/threads/{id}',
  request: {
    params: IdParamSchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': {
          schema: DeleteThreadResponseSchema,
        },
      },
      description: 'Thread deleted successfully',
    },
    ...createProtectedRouteResponses(),
  },
  summary: 'Delete thread',
  tags: ['chat'],
});
export const getPublicThreadRoute = createRoute({
  description: 'Get a publicly shared thread without authentication (read-only)',
  method: 'get',
  path: '/chat/public/{slug}',
  request: {
    params: ThreadSlugParamSchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': { schema: ThreadDetailResponseSchema },
      },
      description: 'Public thread retrieved successfully',
    },
    ...createPublicRouteResponses(),
  },
  summary: 'Get public thread by slug',
  tags: ['chat'],
});

export const listPublicThreadSlugsRoute = createRoute({
  description: 'Get all public thread slugs for SSG/ISR page generation. Returns active public threads only.',
  method: 'get',
  path: '/chat/public/slugs',
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': { schema: PublicThreadSlugsResponseSchema },
      },
      description: 'Public thread slugs retrieved successfully',
    },
    ...createPublicRouteResponses(),
  },
  summary: 'List all public thread slugs',
  tags: ['chat'],
});

export const getThreadBySlugRoute = createRoute({
  description: 'Get thread details by slug for the authenticated user (ensures ownership)',
  method: 'get',
  path: '/chat/threads/slug/{slug}',
  request: {
    params: ThreadSlugParamSchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': { schema: ThreadDetailResponseSchema },
      },
      description: 'Thread retrieved successfully',
    },
    ...createProtectedRouteResponses(),
  },
  summary: 'Get thread by slug',
  tags: ['chat'],
});
export const getThreadSlugStatusRoute = createRoute({
  description: 'Lightweight endpoint to check if thread slug has been updated (for polling during AI title generation)',
  method: 'get',
  path: '/chat/threads/{id}/slug-status',
  request: {
    params: IdParamSchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': {
          schema: ThreadSlugStatusResponseSchema,
        },
      },
      description: 'Thread slug status retrieved successfully',
    },
    ...createProtectedRouteResponses(),
  },
  summary: 'Get thread slug status',
  tags: ['chat'],
});
export const addParticipantRoute = createRoute({
  description: 'Add an AI model with a role to the thread',
  method: 'post',
  path: '/chat/threads/{id}/participants',
  request: {
    body: {
      content: {
        'application/json': {
          schema: AddParticipantRequestSchema,
        },
      },
      required: true,
    },
    params: IdParamSchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': { schema: ParticipantDetailResponseSchema },
      },
      description: 'Participant added successfully',
    },
    ...createMutationRouteResponses(),
  },
  summary: 'Add participant to thread',
  tags: ['chat'],
});
export const updateParticipantRoute = createRoute({
  description: 'Update participant role, priority, or settings',
  method: 'patch',
  path: '/chat/participants/{id}',
  request: {
    body: {
      content: {
        'application/json': {
          schema: UpdateParticipantRequestSchema,
        },
      },
      required: true,
    },
    params: IdParamSchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': { schema: ParticipantDetailResponseSchema },
      },
      description: 'Participant updated successfully',
    },
    ...createMutationRouteResponses(),
  },
  summary: 'Update participant',
  tags: ['chat'],
});
export const deleteParticipantRoute = createRoute({
  description: 'Remove a participant from the thread',
  method: 'delete',
  path: '/chat/participants/{id}',
  request: {
    params: IdParamSchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': {
          schema: createApiResponseSchema(DeletedResponseSchema),
        },
      },
      description: 'Participant removed successfully',
    },
    ...createProtectedRouteResponses(),
  },
  summary: 'Remove participant',
  tags: ['chat'],
});
export const getThreadMessagesRoute = createRoute({
  description: 'Retrieve all messages for a thread ordered by creation time',
  method: 'get',
  path: '/chat/threads/{id}/messages',
  request: {
    params: IdParamSchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': { schema: MessagesListResponseSchema },
      },
      description: 'Messages retrieved successfully',
    },
    ...createProtectedRouteResponses(),
  },
  summary: 'Get thread messages',
  tags: ['chat'],
});
export const getThreadChangelogRoute = createRoute({
  description: 'Retrieve configuration changes (mode, participants) for a thread',
  method: 'get',
  path: '/chat/threads/{id}/changelog',
  request: {
    params: IdParamSchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': { schema: ChangelogListResponseSchema },
      },
      description: 'Changelog retrieved successfully',
    },
    ...createProtectedRouteResponses(),
  },
  summary: 'Get thread configuration changelog',
  tags: ['chat'],
});

/**
 * GET Thread Round Changelog Route
 *
 * ✅ PERF OPTIMIZATION: Returns only changelog entries for a specific round
 * Used for incremental changelog updates after config changes mid-conversation
 * Much more efficient than fetching all changelogs
 */
export const getThreadRoundChangelogRoute = createRoute({
  description: 'Retrieve configuration changes for a specific round. More efficient than fetching all changelogs - used for incremental updates after config changes mid-conversation.',
  method: 'get',
  path: '/chat/threads/{threadId}/rounds/{roundNumber}/changelog',
  request: {
    params: ThreadRoundParamSchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': { schema: ChangelogListResponseSchema },
      },
      description: 'Round changelog retrieved successfully',
    },
    ...createProtectedRouteResponses(),
  },
  summary: 'Get changelog for a specific round',
  tags: ['chat'],
});

/**
 * POST Pre-Search Route - Execute or return existing search
 * ✅ FOLLOWS: councilModeratorRoundRoute pattern exactly
 * ✅ IDEMPOTENT: Returns existing if already completed
 * ✅ DATABASE-FIRST: Creates record before streaming
 */
export const executePreSearchRoute = createRoute({
  description: 'Generate and execute web search queries before participant streaming. Streams search progress in real-time using SSE. Returns completed search immediately if already exists. Follows same architectural pattern as council moderator.',
  method: 'post',
  path: '/chat/threads/{threadId}/rounds/{roundNumber}/pre-search',
  request: {
    body: {
      content: {
        'application/json': {
          schema: PreSearchRequestSchema,
        },
      },
      required: true,
    },
    params: ThreadRoundParamSchema,
  },
  responses: {
    [HttpStatusCodes.ACCEPTED]: {
      content: {
        'application/json': {
          schema: StreamStatusResponseSchema.describe('Polling status with retry delay'),
        },
      },
      description: 'Stream is active but buffer not ready - client should poll. Returns polling metadata including retryAfterMs.',
    },
    [HttpStatusCodes.CONFLICT]: {
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
      description: 'Pre-search already in progress for this round',
    },
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': {
          schema: PreSearchResponseSchema.describe('Completed search (if already exists)'),
        },
        'text/plain': {
          schema: z.string().describe('Streaming SSE data'),
        },
      },
      description: 'Pre-search streaming in progress OR completed search returned (if already exists). Content-Type: text/plain for streaming, application/json for completed.',
    },
    ...createMutationRouteResponses(),
  },
  summary: 'Execute pre-search for conversation round (streaming)',
  tags: ['chat'],
});

export const streamChatRoute = createRoute({
  description: `**Real-time AI streaming endpoint using Server-Sent Events (SSE)**
## Overview
Official AI SDK v6 streaming endpoint with multi-participant orchestration support. Streams AI responses token-by-token using the \`toUIMessageStreamResponse()\` format from Vercel AI SDK.
**Key Features:**
- Real-time token streaming (characters appear as generated)
- Multi-participant support (sequential model responses)
- Automatic message persistence to database
- Send only last message (backend loads history)
- Reasoning and text parts support
- Error recovery with structured metadata
## Request Pattern
**Send Only Last Message (Official AI SDK v6 Pattern):**
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
  method: 'post',
  path: '/chat',
  request: {
    body: {
      content: {
        'application/json': {
          schema: StreamChatRequestSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    [HttpStatusCodes.FORBIDDEN]: {
      content: {
        'application/json': { schema: ApiErrorResponseSchema },
      },
      description: 'Model access denied - subscription tier insufficient for selected model(s)',
    },
    [HttpStatusCodes.OK]: {
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
      description: `**Server-Sent Events (SSE) stream with AI SDK v6 protocol**
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
    },
    [HttpStatusCodes.TOO_MANY_REQUESTS]: {
      content: {
        'application/json': { schema: ApiErrorResponseSchema },
      },
      description: 'Message quota exceeded - upgrade subscription or wait for quota reset',
    },
    ...createMutationRouteResponses(),
  },
  summary: 'Stream AI chat responses (AI SDK v6)',
  tags: ['chat'],
});

/**
 * POST /chat/analyze - Auto Mode Prompt Analysis (Streaming)
 * Analyzes user prompt and streams optimal model/role/mode configuration
 * Used by Auto Mode feature for intelligent chat setup
 *
 * SSE Events:
 * - start: Analysis started
 * - config: Partial/incremental config update
 * - done: Final config with complete analysis
 * - failed: Error with fallback config
 */
export const analyzePromptRoute = createRoute({
  description: 'Analyzes user prompt and streams optimal participants, mode, and web search settings via SSE based on prompt complexity and user tier.',
  method: 'post',
  path: '/chat/analyze',
  request: {
    body: {
      content: {
        'application/json': {
          schema: AnalyzePromptRequestSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'text/event-stream': {
          schema: z.string().openapi({
            description: 'Server-Sent Events stream with analyze events',
            example: 'event: config\ndata: {"config":{"participants":[...],"mode":"analyzing","enableWebSearch":false}}\n\n',
          }),
        },
      },
      description: 'SSE stream of config updates (events: start, config, done, failed)',
    },
    ...createMutationRouteResponses(),
  },
  summary: 'Analyze prompt for auto mode configuration (streaming)',
  tags: ['chat'],
});

export const listCustomRolesRoute = createRoute({
  description: 'Get custom role templates for the authenticated user with infinite scroll support',
  method: 'get',
  path: '/chat/custom-roles',
  request: {
    query: CursorPaginationQuerySchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': { schema: CustomRoleListResponseSchema },
      },
      description: 'Custom roles retrieved successfully',
    },
    ...createProtectedRouteResponses(),
  },
  summary: 'List custom roles with cursor pagination',
  tags: ['chat'],
});
export const createCustomRoleRoute = createRoute({
  description: 'Create a new reusable custom role template with system prompt',
  method: 'post',
  path: '/chat/custom-roles',
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateCustomRoleRequestSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': { schema: CustomRoleDetailResponseSchema },
      },
      description: 'Custom role created successfully',
    },
    ...createMutationRouteResponses(),
  },
  summary: 'Create custom role',
  tags: ['chat'],
});
export const getCustomRoleRoute = createRoute({
  description: 'Get details of a specific custom role',
  method: 'get',
  path: '/chat/custom-roles/{id}',
  request: {
    params: IdParamSchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': { schema: CustomRoleDetailResponseSchema },
      },
      description: 'Custom role retrieved successfully',
    },
    ...createProtectedRouteResponses(),
  },
  summary: 'Get custom role details',
  tags: ['chat'],
});
export const updateCustomRoleRoute = createRoute({
  description: 'Update custom role name, description, system prompt, or metadata',
  method: 'patch',
  path: '/chat/custom-roles/{id}',
  request: {
    body: {
      content: {
        'application/json': {
          schema: UpdateCustomRoleRequestSchema,
        },
      },
      required: true,
    },
    params: IdParamSchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': { schema: CustomRoleDetailResponseSchema },
      },
      description: 'Custom role updated successfully',
    },
    ...createMutationRouteResponses(),
  },
  summary: 'Update custom role',
  tags: ['chat'],
});
export const deleteCustomRoleRoute = createRoute({
  description: 'Delete a custom role template',
  method: 'delete',
  path: '/chat/custom-roles/{id}',
  request: {
    params: IdParamSchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': {
          schema: createApiResponseSchema(DeletedResponseSchema),
        },
      },
      description: 'Custom role deleted successfully',
    },
    ...createProtectedRouteResponses(),
  },
  summary: 'Delete custom role',
  tags: ['chat'],
});
export const listUserPresetsRoute = createRoute({
  description: 'Get user-created model presets from localStorage with infinite scroll support',
  method: 'get',
  path: '/chat/user-presets',
  request: {
    query: CursorPaginationQuerySchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': { schema: UserPresetListResponseSchema },
      },
      description: 'User presets retrieved successfully',
    },
    ...createProtectedRouteResponses(),
  },
  summary: 'List user presets with cursor pagination',
  tags: ['chat'],
});
export const createUserPresetRoute = createRoute({
  description: 'Create a new user preset with model-role pairs and mode',
  method: 'post',
  path: '/chat/user-presets',
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateUserPresetRequestSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': { schema: UserPresetDetailResponseSchema },
      },
      description: 'User preset created successfully',
    },
    ...createMutationRouteResponses(),
  },
  summary: 'Create user preset',
  tags: ['chat'],
});
export const getUserPresetRoute = createRoute({
  description: 'Get details of a specific user preset',
  method: 'get',
  path: '/chat/user-presets/{id}',
  request: {
    params: IdParamSchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': { schema: UserPresetDetailResponseSchema },
      },
      description: 'User preset retrieved successfully',
    },
    ...createProtectedRouteResponses(),
  },
  summary: 'Get user preset details',
  tags: ['chat'],
});
export const updateUserPresetRoute = createRoute({
  description: 'Update user preset name, model-role pairs, or mode',
  method: 'patch',
  path: '/chat/user-presets/{id}',
  request: {
    body: {
      content: {
        'application/json': {
          schema: UpdateUserPresetRequestSchema,
        },
      },
      required: true,
    },
    params: IdParamSchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': { schema: UserPresetDetailResponseSchema },
      },
      description: 'User preset updated successfully',
    },
    ...createMutationRouteResponses(),
  },
  summary: 'Update user preset',
  tags: ['chat'],
});
export const deleteUserPresetRoute = createRoute({
  description: 'Delete a user preset from localStorage',
  method: 'delete',
  path: '/chat/user-presets/{id}',
  request: {
    params: IdParamSchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': {
          schema: createApiResponseSchema(DeletedResponseSchema),
        },
      },
      description: 'User preset deleted successfully',
    },
    ...createProtectedRouteResponses(),
  },
  summary: 'Delete user preset',
  tags: ['chat'],
});
export const councilModeratorRoundRoute = createRoute({
  description: 'Generate an executive-grade council moderator summary of all participant responses in a round. Streams moderator text in real-time as a chatMessage with metadata.isModerator: true. Frontend renders via ChatMessageList component alongside participant messages. Returns immediately if moderator message already exists for this round.',
  method: 'post',
  path: '/chat/threads/{threadId}/rounds/{roundNumber}/moderator',
  request: {
    body: {
      content: {
        'application/json': {
          schema: RoundModeratorRequestSchema,
        },
      },
      required: false,
    },
    params: ThreadRoundParamSchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': {
          schema: ExistingModeratorMessageSchema,
        },
        'text/event-stream': {
          schema: z.any().openapi({
            description: 'AI SDK UIMessageStream format for council moderator summary. Dynamic SSE protocol - cannot be represented with static schema.',
          }),
        },
      },
      description: 'Council moderator summary streaming in progress OR existing moderator message returned. Streams as text/event-stream following AI SDK UIMessageStream protocol. If moderator message already exists for this round, returns the chatMessage data as JSON.',
    },
    ...createMutationRouteResponses(),
  },
  summary: 'Generate council moderator round summary (streaming)',
  tags: ['chat'],
});

/**
 * GET Round Status Route - Internal queue worker endpoint
 * ✅ FOLLOWS: computeRoundStatus pattern from round-orchestration.service
 * Used by ROUND_ORCHESTRATION_QUEUE worker to determine next action
 */
export const getRoundStatusRoute = createRoute({
  description: 'Internal endpoint for queue workers to determine next action in round orchestration. Returns current round status, participant completion, and what needs to be triggered next.',
  method: 'get',
  path: '/chat/threads/{threadId}/rounds/{roundNumber}/status',
  request: {
    params: ThreadRoundParamSchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': { schema: RoundStatusResponseSchema },
      },
      description: 'Round status retrieved successfully',
    },
    ...createProtectedRouteResponses(),
  },
  summary: 'Get round execution status (internal)',
  tags: ['chat'],
});

/**
 * GET Thread Pre-Searches Route - List all pre-searches for thread
 * ✅ FOLLOWS: getThreadSummariesRoute pattern
 */
export const getThreadPreSearchesRoute = createRoute({
  description: 'Retrieve all pre-search results for a thread, showing past search results for each round',
  method: 'get',
  path: '/chat/threads/{id}/pre-searches',
  request: {
    params: IdParamSchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': { schema: PreSearchListResponseSchema },
      },
      description: 'Pre-searches retrieved successfully',
    },
    ...createProtectedRouteResponses(),
  },
  summary: 'Get pre-search results for thread',
  tags: ['chat'],
});

export const setRoundFeedbackRoute = createRoute({
  description: 'Set or update user feedback for a conversation round. Pass null to remove feedback.',
  method: 'put',
  path: '/chat/threads/{threadId}/rounds/{roundNumber}/feedback',
  request: {
    body: {
      content: {
        'application/json': {
          schema: RoundFeedbackRequestSchema,
        },
      },
      required: true,
    },
    params: RoundFeedbackParamSchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': { schema: SetRoundFeedbackResponseSchema },
      },
      description: 'Feedback set successfully',
    },
    ...createMutationRouteResponses(),
  },
  summary: 'Set round feedback (like/dislike)',
  tags: ['chat'],
});
export const getThreadFeedbackRoute = createRoute({
  description: 'Get all round feedback (likes/dislikes) for a thread for the current user.',
  method: 'get',
  path: '/chat/threads/{id}/feedback',
  request: {
    params: IdParamSchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': { schema: GetThreadFeedbackResponseSchema },
      },
      description: 'Feedback retrieved successfully',
    },
    ...createProtectedRouteResponses(),
  },
  summary: 'Get all round feedback for a thread',
  tags: ['chat'],
});

/**
 * GET /chat/threads/:threadId/stream
 * ✅ RESUMABLE STREAMS: Resume active stream (AI SDK documentation pattern)
 */
export const resumeThreadStreamRoute = createRoute({
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

**Example**: GET /chat/threads/thread_123/stream?lastChunkIndex=42`,
  method: 'get',
  path: '/chat/threads/{threadId}/stream',
  request: {
    params: ThreadIdParamSchema,
  },
  responses: {
    [HttpStatusCodes.NO_CONTENT]: {
      description: 'No active stream for this thread',
    },
    [HttpStatusCodes.OK]: {
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
      description: 'Active stream found - returning buffered SSE chunks',
    },
    ...createProtectedRouteResponses(),
  },
  summary: 'Resume active stream for thread (AI SDK pattern)',
  tags: ['chat'],
});

/**
 * GET /chat/threads/:threadId/stream-status
 * ✅ RESUMABLE STREAMS: Get stream resumption state for server-side prefetching
 * Returns metadata only (not the SSE stream itself)
 */
export const getThreadStreamResumptionStateRoute = createRoute({
  description: `Get metadata about active stream for a thread. Used for server-side prefetching to enable Zustand pre-fill before React renders.

**Key Difference from GET /stream**:
- GET /stream returns the SSE stream itself (used by AI SDK resume)
- GET /stream-status returns only metadata (used for server-side state check)

**Response Format**:
Returns \`ThreadStreamResumptionState\` with:
- hasActiveStream: Whether thread has an active stream in KV
- streamId: Active stream ID (if any)
- roundNumber: Round number of the active stream
- totalParticipants: Total participants in the round
- participantStatuses: Status of each participant
- nextParticipantToTrigger: Index of next participant needing generation
- roundComplete: Whether all participants have finished

**Usage Pattern** (Server Component):
1. Server component calls GET /stream-status
2. Passes resumption state as prop to client component
3. Client pre-fills Zustand store before effects run
4. AI SDK resume and incomplete-round-resumption coordinate properly

**Example**: GET /chat/threads/thread_123/stream-status`,
  method: 'get',
  path: '/chat/threads/{threadId}/stream-status',
  request: {
    params: ThreadIdParamSchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': { schema: ThreadStreamResumptionStateResponseSchema },
      },
      description: 'Stream resumption state retrieved successfully',
    },
    ...createProtectedRouteResponses(),
  },
  summary: 'Get thread stream resumption state',
  tags: ['chat'],
});

/**
 * GET /chat/threads/:threadId/rounds/:roundNumber/subscribe
 * ✅ ROBUST STREAMING: Subscribe to stream for pub/sub delivery pattern
 */
export const subscribeToStreamRoute = createRoute({
  description: `Subscribe to a stream for a specific thread and round. Part of the robust streaming resumption system.

**Pub/Sub Delivery Pattern**:
- Background worker produces chunks to KV buffer
- Clients subscribe via SSE and receive chunks
- Supports mid-stream join (replay existing chunks, then live)
- Returns 202 with retry-after if stream not yet started

**Response Types**:
- 200 OK with JSON: Status information (queued, active, completed)
- text/event-stream: SSE stream when active stream is available

**Usage Pattern**:
1. Client calls subscribe endpoint
2. If response.status === 'queued', wait retryAfter ms and retry
3. If response.status === 'active', switch to SSE streaming
4. If response.status === 'completed', round is done`,
  method: 'get',
  path: '/chat/threads/{threadId}/rounds/{roundNumber}/subscribe',
  request: {
    params: ThreadRoundParamSchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': {
          schema: createApiResponseSchema(z.object({
            isActive: z.boolean().optional(),
            phase: z.enum(['presearch', 'participant', 'moderator']).optional(),
            retryAfter: z.number().optional(),
            roundNumber: z.number().optional(),
            status: z.enum(['queued', 'active', 'completed']),
            streamId: z.string().optional(),
          })),
        },
        'text/event-stream': {
          schema: z.any().openapi({
            description: 'Server-Sent Events (SSE) stream with buffered chunks.',
          }),
        },
      },
      description: 'Subscription status or active SSE stream',
    },
    ...createProtectedRouteResponses(),
  },
  summary: 'Subscribe to stream (pub/sub pattern)',
  tags: ['chat'],
});

/**
 * GET /chat/threads/:threadId/memory-events
 * ✅ MEMORY EVENTS: Poll for memory creation events after round completes
 */
export const getThreadMemoryEventsRoute = createRoute({
  description: `Check if memories were created for a specific round. Frontend polls this after round completes to show toast notification.

**Response**:
- Returns memory event data if memories were created
- Returns null if no memories were created for this round
- Events are stored in KV with 5 minute TTL

**Usage**:
1. Wait for round to complete (all participants done)
2. Poll this endpoint with roundNumber query param
3. If memories exist, show toast notification
4. Invalidate project memories query cache`,
  method: 'get',
  path: '/chat/threads/{threadId}/memory-events',
  request: {
    params: ThreadIdParamSchema,
    query: MemoryEventQuerySchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': { schema: MemoryEventResponseSchema },
      },
      description: 'Memory event data (or null if none)',
    },
    ...createProtectedRouteResponses(),
  },
  summary: 'Get memory events for a round',
  tags: ['chat'],
});
