import { z } from '@hono/zod-openapi';

import {
  CoreSchemas,
  createApiResponseSchema,
  createCursorPaginatedResponseSchema,
  CursorPaginationQuerySchema,
} from '@/api/core/schemas';
import { isValidModelId } from '@/lib/ai/models-config';
import { ALLOWED_CHAT_MODES } from '@/lib/config/chat-modes';

// ============================================================================
// Shared Validation Schemas - Used by Frontend and Backend
// ============================================================================

/**
 * Message content validation schema
 * Used for:
 * - User message input
 * - Message editing
 * - Thread creation (first message)
 *
 * Shared with frontend to ensure consistent validation rules
 */
export const MessageContentSchema = z.string()
  .min(1, 'Message is required')
  .max(5000, 'Message is too long (max 5000 characters)');

/**
 * Thread mode enum validation
 * Matches chatThread.mode column in database
 *
 * Shared with frontend to ensure consistent validation rules
 * Uses centralized ALLOWED_CHAT_MODES for type safety
 */
export const ThreadModeSchema = z.enum(ALLOWED_CHAT_MODES as [string, ...string[]]);

/**
 * Message edit validation schema
 *
 * Shared with frontend to ensure consistent validation rules
 */
export const EditMessageSchema = z.object({
  content: MessageContentSchema,
});

// ============================================================================
// Path Parameter Schemas
// ============================================================================

export const ThreadIdParamSchema = z.object({
  id: CoreSchemas.id().openapi({
    description: 'Chat thread ID',
    example: 'thread_abc123',
  }),
});

export const ParticipantIdParamSchema = z.object({
  id: CoreSchemas.id().openapi({
    description: 'Chat participant ID',
    example: 'participant_abc123',
  }),
});

export const MessageIdParamSchema = z.object({
  id: CoreSchemas.id().openapi({
    description: 'Chat message ID',
    example: 'msg_abc123',
  }),
});

export const MemoryIdParamSchema = z.object({
  id: CoreSchemas.id().openapi({
    description: 'Chat memory ID',
    example: 'memory_abc123',
  }),
});

// ============================================================================
// Base Entity Schemas (ordered for dependencies)
// ============================================================================

// Participant Schema (needed by ThreadDetailPayloadSchema)
const ChatParticipantSchema = z.object({
  id: z.string().openapi({
    description: 'Participant ID',
    example: 'participant_abc123',
  }),
  threadId: z.string().openapi({
    description: 'Thread ID',
    example: 'thread_abc123',
  }),
  modelId: z.string().openapi({
    description: 'Model ID (e.g., anthropic/claude-3.5-sonnet, openai/gpt-4o)',
    example: 'anthropic/claude-3.5-sonnet',
  }),
  role: z.string().openapi({
    description: 'Assigned role for this model',
    example: 'The Ideator',
  }),
  priority: z.number().int().nonnegative().openapi({
    description: 'Response priority (lower = responds first)',
    example: 0,
  }),
  isEnabled: z.boolean().openapi({
    description: 'Whether this participant is active',
    example: true,
  }),
  settings: z.object({
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().int().positive().optional(),
    systemPrompt: z.string().optional(),
  }).passthrough().nullable().openapi({
    description: 'Model-specific settings',
  }),
  createdAt: CoreSchemas.timestamp().openapi({
    description: 'Participant creation timestamp',
  }),
  updatedAt: CoreSchemas.timestamp().openapi({
    description: 'Participant last update timestamp',
  }),
}).openapi('ChatParticipant');

// Message Schema (needed by ThreadDetailPayloadSchema)
const ChatMessageSchema = z.object({
  id: z.string().openapi({
    description: 'Message ID',
    example: 'msg_abc123',
  }),
  threadId: z.string().openapi({
    description: 'Thread ID',
    example: 'thread_abc123',
  }),
  participantId: z.string().nullable().openapi({
    description: 'Participant ID (null for user messages)',
    example: 'participant_abc123',
  }),
  role: z.enum(['user', 'assistant']).openapi({
    description: 'Message role',
    example: 'assistant',
  }),
  content: z.string().openapi({
    description: 'Message content',
    example: 'Here are some innovative ideas...',
  }),
  reasoning: z.string().nullable().openapi({
    description: 'Model reasoning/thinking process (for models that support it)',
    example: null,
  }),
  toolCalls: z.array(z.object({
    id: z.string(),
    type: z.string(),
    function: z.object({
      name: z.string(),
      arguments: z.string(),
    }),
  })).nullable().openapi({
    description: 'Tool/function calls made by the model',
  }),
  metadata: z.object({
    model: z.string().optional(),
    finishReason: z.string().optional(),
    usage: z.object({
      promptTokens: z.number().optional(),
      completionTokens: z.number().optional(),
      totalTokens: z.number().optional(),
    }).optional(),
  }).passthrough().nullable().openapi({
    description: 'Message metadata (model, usage stats, etc.)',
  }),
  parentMessageId: z.string().nullable().openapi({
    description: 'Parent message ID (for threading)',
    example: null,
  }),
  createdAt: CoreSchemas.timestamp().openapi({
    description: 'Message creation timestamp',
  }),
}).openapi('ChatMessage');

// ============================================================================
// Thread Schemas
// ============================================================================

const ChatThreadSchema = z.object({
  id: z.string().openapi({
    description: 'Thread ID',
    example: 'thread_abc123',
  }),
  userId: z.string().openapi({
    description: 'User ID who owns the thread',
    example: 'user_123',
  }),
  title: z.string().openapi({
    description: 'Thread title',
    example: 'Product strategy brainstorm',
  }),
  slug: z.string().openapi({
    description: 'SEO-friendly URL slug',
    example: 'product-strategy-brainstorm-abc123',
  }),
  mode: z.enum(['analyzing', 'brainstorming', 'debating', 'solving']).openapi({
    description: 'Conversation mode that determines how models interact',
    example: 'brainstorming',
  }),
  status: z.enum(['active', 'archived', 'deleted']).openapi({
    description: 'Thread status',
    example: 'active',
  }),
  isFavorite: z.boolean().openapi({
    description: 'Whether thread is marked as favorite',
    example: false,
  }),
  isPublic: z.boolean().openapi({
    description: 'Whether thread is publicly accessible',
    example: false,
  }),
  metadata: z.object({
    tags: z.array(z.string()).optional(),
    summary: z.string().optional(),
  }).passthrough().nullable().openapi({
    description: 'Thread metadata (tags, summary, etc.)',
  }),
  createdAt: CoreSchemas.timestamp().openapi({
    description: 'Thread creation timestamp',
  }),
  updatedAt: CoreSchemas.timestamp().openapi({
    description: 'Thread last update timestamp',
  }),
  lastMessageAt: CoreSchemas.timestamp().nullable().openapi({
    description: 'Last message timestamp',
  }),
}).openapi('ChatThread');

export const CreateThreadRequestSchema = z.object({
  title: z.string().min(1).max(200).optional().default('New Chat').openapi({
    description: 'Thread title (auto-generated from first message if "New Chat")',
    example: 'Product strategy brainstorm',
  }),
  mode: ThreadModeSchema.optional().default('brainstorming').openapi({
    description: 'Conversation mode',
    example: 'brainstorming',
  }),
  participants: z.array(z.object({
    modelId: z.string().refine(isValidModelId, {
      message: 'Invalid model ID. Must be a valid model from AI configuration.',
    }).openapi({
      description: 'Model ID (e.g., anthropic/claude-3.5-sonnet, openai/gpt-4o)',
      example: 'anthropic/claude-3.5-sonnet',
    }),
    role: z.string().optional().openapi({
      description: 'Optional assigned role for this model (immutable)',
      example: 'The Ideator',
    }),
    customRoleId: z.string().optional().openapi({
      description: 'Optional custom role ID to load system prompt from',
      example: '01HXYZ123ABC',
    }),
    systemPrompt: z.string().optional().openapi({
      description: 'Optional system prompt override (takes precedence over customRoleId)',
    }),
    temperature: z.number().min(0).max(2).optional().openapi({
      description: 'Temperature setting',
    }),
    maxTokens: z.number().int().positive().optional().openapi({
      description: 'Max tokens setting',
    }),
  })).min(1).openapi({
    description: 'Participants array (order determines priority - immutable after creation)',
  }),
  firstMessage: MessageContentSchema.openapi({
    description: 'Initial user message to start the conversation',
    example: 'What are innovative product ideas for sustainability?',
  }),
  memoryIds: z.array(z.string()).optional().openapi({
    description: 'Optional array of memory IDs to attach to this thread',
    example: ['01HXYZ123ABC', '01HXYZ456DEF'],
  }),
  metadata: z.object({
    tags: z.array(z.string()).optional(),
    summary: z.string().optional(),
  }).passthrough().optional().openapi({
    description: 'Thread metadata',
  }),
}).openapi('CreateThreadRequest');

export const UpdateThreadRequestSchema = z.object({
  title: z.string().min(1).max(200).optional().openapi({
    description: 'Thread title',
    example: 'Updated brainstorm session',
  }),
  mode: ThreadModeSchema.optional().openapi({
    description: 'Conversation mode',
    example: 'debating',
  }),
  status: z.enum(['active', 'archived', 'deleted']).optional().openapi({
    description: 'Thread status',
    example: 'archived',
  }),
  isFavorite: z.boolean().optional().openapi({
    description: 'Whether thread is marked as favorite',
    example: true,
  }),
  isPublic: z.boolean().optional().openapi({
    description: 'Whether thread is publicly accessible',
    example: false,
  }),
  metadata: z.object({
    tags: z.array(z.string()).optional(),
    summary: z.string().optional(),
  }).passthrough().optional().openapi({
    description: 'Thread metadata',
  }),
}).openapi('UpdateThreadRequest');

export const ThreadSlugParamSchema = z.object({
  slug: z.string().openapi({
    description: 'Thread slug for public access',
    example: 'product-strategy-brainstorm-abc123',
  }),
}).openapi('ThreadSlugParam');

// Query parameters for cursor-based pagination with search support
export const ThreadListQuerySchema = CursorPaginationQuerySchema.extend({
  search: z.string().optional().openapi({
    description: 'Search query to filter threads by title',
    example: 'product strategy',
  }),
}).openapi('ThreadListQuery');

// Thread detail with participants and messages
const ThreadDetailPayloadSchema = z.object({
  thread: ChatThreadSchema.openapi({
    description: 'Thread details',
  }),
  participants: z.array(ChatParticipantSchema).openapi({
    description: 'Thread participants (AI models with roles)',
  }),
  messages: z.array(ChatMessageSchema).openapi({
    description: 'Thread messages',
  }),
}).openapi('ThreadDetailPayload');

export const ThreadListResponseSchema = createCursorPaginatedResponseSchema(ChatThreadSchema).openapi('ThreadListResponse');
export const ThreadDetailResponseSchema = createApiResponseSchema(ThreadDetailPayloadSchema).openapi('ThreadDetailResponse');

// ============================================================================
// Participant Schemas
// ============================================================================

export const AddParticipantRequestSchema = z.object({
  modelId: z.string().min(1).refine(isValidModelId, {
    message: 'Invalid model ID. Must be a valid model from AI configuration.',
  }).openapi({
    description: 'Model ID to add (e.g., anthropic/claude-3.5-sonnet, openai/gpt-4o)',
    example: 'anthropic/claude-3.5-sonnet',
  }),
  role: z.string().min(1).max(100).openapi({
    description: 'Assigned role',
    example: 'The Ideator',
  }),
  priority: z.number().int().nonnegative().optional().default(0).openapi({
    description: 'Response priority',
    example: 0,
  }),
  settings: z.object({
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().int().positive().optional(),
    systemPrompt: z.string().optional(),
  }).passthrough().optional().openapi({
    description: 'Model settings override',
  }),
}).openapi('AddParticipantRequest');

export const UpdateParticipantRequestSchema = z.object({
  role: z.string().min(1).max(100).optional().openapi({
    description: 'Updated role',
    example: 'Devil\'s Advocate',
  }),
  priority: z.number().int().nonnegative().optional().openapi({
    description: 'Updated priority',
    example: 1,
  }),
  isEnabled: z.boolean().optional().openapi({
    description: 'Enable/disable participant',
    example: true,
  }),
  settings: z.object({
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().int().positive().optional(),
    systemPrompt: z.string().optional(),
  }).passthrough().optional().openapi({
    description: 'Updated model settings',
  }),
}).openapi('UpdateParticipantRequest');

const ParticipantListPayloadSchema = z.object({
  participants: z.array(ChatParticipantSchema).openapi({
    description: 'List of thread participants',
  }),
  count: z.number().int().nonnegative().openapi({
    description: 'Total number of participants',
    example: 3,
  }),
}).openapi('ParticipantListPayload');

const ParticipantDetailPayloadSchema = z.object({
  participant: ChatParticipantSchema.openapi({
    description: 'Participant details',
  }),
}).openapi('ParticipantDetailPayload');

export const ParticipantListResponseSchema = createApiResponseSchema(ParticipantListPayloadSchema).openapi('ParticipantListResponse');
export const ParticipantDetailResponseSchema = createApiResponseSchema(ParticipantDetailPayloadSchema).openapi('ParticipantDetailResponse');

// ============================================================================
// Message Schemas
// ============================================================================
// Note: SendMessageRequestSchema removed - use StreamChatRequestSchema for all chat operations

/**
 * ✅ AI SDK v5 UIMessage Part Schema - OFFICIAL FLEXIBLE PATTERN
 * Use passthrough() to accept ALL official AI SDK part types without strict validation
 * Reference: https://sdk.vercel.ai/docs/reference/ai-sdk-core/ui-message
 *
 * Official part types include: text, reasoning, file, source-url, source-document,
 * tool-*, data-*, step-start, etc.
 */
const UIMessagePartSchema = z.object({
  type: z.string(), // Accept any type string from AI SDK
}).passthrough().openapi('UIMessagePart'); // Allow all additional fields

/**
 * AI SDK v5 Standard Streaming Request
 * Following https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot exactly
 *
 * Server receives ALL messages from client
 * Also accepts optional configuration updates for dynamic mode/participant changes
 */
export const StreamChatRequestSchema = z.object({
  // AI SDK v5 Standard: Array of all messages including the new one
  messages: z.array(z.object({
    id: z.string(),
    role: z.enum(['user', 'assistant']),
    parts: z.array(UIMessagePartSchema).min(1),
  }).passthrough()).min(1).openapi({
    description: 'All conversation messages (UIMessage[] from AI SDK v5)',
  }),
  // Dynamic configuration updates (optional)
  mode: ThreadModeSchema.optional().openapi({
    description: 'Updated conversation mode',
  }),
  participants: z.array(z.object({
    modelId: z.string(),
    role: z.string().optional(),
    customRoleId: z.string().optional(),
    order: z.number().int().nonnegative(),
  })).optional().openapi({
    description: 'Updated participant configuration',
  }),
  memoryIds: z.array(z.string()).optional().openapi({
    description: 'Updated memory IDs to attach',
  }),
  // ✅ OFFICIAL AI SDK PATTERN: One participant per HTTP request
  participantIndex: z.number().int().nonnegative().openapi({
    description: 'Which participant to stream in this request (0-based). Frontend sends separate requests for each participant.',
    example: 0,
  }),
}).openapi('StreamChatRequest');

// ============================================================================
// Memory Schemas
// ============================================================================

const ChatMemorySchema = z.object({
  id: z.string().openapi({
    description: 'Memory ID',
    example: 'memory_abc123',
  }),
  userId: z.string().openapi({
    description: 'User ID who owns the memory',
    example: 'user_123',
  }),
  threadId: z.string().nullable().openapi({
    description: 'Thread ID (null for global memories)',
    example: 'thread_abc123',
  }),
  type: z.enum(['personal', 'topic', 'instruction', 'fact']).openapi({
    description: 'Memory type',
    example: 'topic',
  }),
  title: z.string().openapi({
    description: 'Memory title',
    example: 'Product development preferences',
  }),
  description: z.string().nullable().openapi({
    description: 'Brief description of the memory',
    example: 'Key considerations for product development',
  }),
  content: z.string().openapi({
    description: 'Memory content',
    example: 'Focus on sustainability and eco-friendly solutions',
  }),
  isGlobal: z.boolean().openapi({
    description: 'Whether memory applies to all threads',
    example: false,
  }),
  metadata: z.object({
    tags: z.array(z.string()).optional(),
    relevance: z.number().optional(),
  }).passthrough().nullable().openapi({
    description: 'Memory metadata',
  }),
  createdAt: CoreSchemas.timestamp().openapi({
    description: 'Memory creation timestamp',
  }),
  updatedAt: CoreSchemas.timestamp().openapi({
    description: 'Memory last update timestamp',
  }),
}).openapi('ChatMemory');

export const CreateMemoryRequestSchema = z.object({
  threadId: z.string().optional().openapi({
    description: 'Thread ID (omit for global memory)',
    example: 'thread_abc123',
  }),
  type: z.enum(['personal', 'topic', 'instruction', 'fact']).optional().default('topic').openapi({
    description: 'Memory type',
    example: 'topic',
  }),
  title: z.string().min(1).max(200).openapi({
    description: 'Memory title',
    example: 'Product preferences',
  }),
  description: z.string().max(500).optional().openapi({
    description: 'Brief description of the memory',
    example: 'Key considerations for product development',
  }),
  content: z.string().min(1).openapi({
    description: 'Memory content',
    example: 'Focus on sustainability',
  }),
  isGlobal: z.boolean().optional().default(false).openapi({
    description: 'Apply to all threads',
    example: false,
  }),
  metadata: z.object({
    tags: z.array(z.string()).optional(),
  }).passthrough().optional().openapi({
    description: 'Memory metadata',
  }),
}).openapi('CreateMemoryRequest');

export const UpdateMemoryRequestSchema = z.object({
  title: z.string().min(1).max(200).optional().openapi({
    description: 'Updated memory title',
  }),
  description: z.string().max(500).optional().openapi({
    description: 'Updated memory description',
  }),
  content: z.string().min(1).optional().openapi({
    description: 'Updated memory content',
  }),
  type: z.enum(['personal', 'topic', 'instruction', 'fact']).optional().openapi({
    description: 'Updated memory type',
  }),
  isGlobal: z.boolean().optional().openapi({
    description: 'Update global status',
  }),
  metadata: z.object({
    tags: z.array(z.string()).optional(),
  }).passthrough().optional().openapi({
    description: 'Updated metadata',
  }),
}).openapi('UpdateMemoryRequest');

const MemoryDetailPayloadSchema = z.object({
  memory: ChatMemorySchema.openapi({
    description: 'Memory details',
  }),
}).openapi('MemoryDetailPayload');

export const MemoryListResponseSchema = createCursorPaginatedResponseSchema(ChatMemorySchema).openapi('MemoryListResponse');
export const MemoryDetailResponseSchema = createApiResponseSchema(MemoryDetailPayloadSchema).openapi('MemoryDetailResponse');

// ============================================================================
// Custom Role Schemas
// ============================================================================

export const CustomRoleIdParamSchema = z.object({
  id: CoreSchemas.id().openapi({
    description: 'Custom role ID',
    example: 'role_abc123',
  }),
}).openapi('CustomRoleIdParam');

const ChatCustomRoleSchema = z.object({
  id: z.string().openapi({
    description: 'Custom role ID',
    example: 'role_abc123',
  }),
  userId: z.string().openapi({
    description: 'User ID who owns the custom role',
    example: 'user_123',
  }),
  name: z.string().openapi({
    description: 'Role name',
    example: 'The Devil\'s Advocate',
  }),
  description: z.string().nullable().openapi({
    description: 'Brief description of the role',
    example: 'Challenges ideas and identifies potential flaws',
  }),
  systemPrompt: z.string().openapi({
    description: 'System prompt that defines role behavior',
    example: 'You are a critical thinker who challenges ideas and identifies potential flaws...',
  }),
  metadata: z.object({
    tags: z.array(z.string()).optional(),
    category: z.string().optional(),
  }).passthrough().nullable().openapi({
    description: 'Custom role metadata',
  }),
  createdAt: CoreSchemas.timestamp().openapi({
    description: 'Role creation timestamp',
  }),
  updatedAt: CoreSchemas.timestamp().openapi({
    description: 'Role last update timestamp',
  }),
}).openapi('ChatCustomRole');

export const CreateCustomRoleRequestSchema = z.object({
  name: z.string().min(1).max(100).openapi({
    description: 'Role name',
    example: 'The Devil\'s Advocate',
  }),
  description: z.string().max(500).optional().openapi({
    description: 'Brief description of the role',
    example: 'Challenges ideas and identifies potential flaws',
  }),
  systemPrompt: z.string().min(1).openapi({
    description: 'System prompt that defines role behavior',
    example: 'You are a critical thinker who challenges ideas...',
  }),
  metadata: z.object({
    tags: z.array(z.string()).optional(),
    category: z.string().optional(),
  }).passthrough().optional().openapi({
    description: 'Custom role metadata',
  }),
}).openapi('CreateCustomRoleRequest');

export const UpdateCustomRoleRequestSchema = z.object({
  name: z.string().min(1).max(100).optional().openapi({
    description: 'Updated role name',
  }),
  description: z.string().max(500).optional().openapi({
    description: 'Updated role description',
  }),
  systemPrompt: z.string().min(1).optional().openapi({
    description: 'Updated system prompt',
  }),
  metadata: z.object({
    tags: z.array(z.string()).optional(),
    category: z.string().optional(),
  }).passthrough().optional().openapi({
    description: 'Updated metadata',
  }),
}).openapi('UpdateCustomRoleRequest');

const CustomRoleDetailPayloadSchema = z.object({
  customRole: ChatCustomRoleSchema.openapi({
    description: 'Custom role details',
  }),
}).openapi('CustomRoleDetailPayload');

export const CustomRoleListResponseSchema = createCursorPaginatedResponseSchema(ChatCustomRoleSchema).openapi('CustomRoleListResponse');
export const CustomRoleDetailResponseSchema = createApiResponseSchema(CustomRoleDetailPayloadSchema).openapi('CustomRoleDetailResponse');

// ============================================================================
// TYPE EXPORTS FOR FRONTEND & BACKEND
// ============================================================================

export type ChatThread = z.infer<typeof ChatThreadSchema>;
export type CreateThreadRequest = z.infer<typeof CreateThreadRequestSchema>;
export type UpdateThreadRequest = z.infer<typeof UpdateThreadRequestSchema>;

export type ChatParticipant = z.infer<typeof ChatParticipantSchema>;
export type AddParticipantRequest = z.infer<typeof AddParticipantRequestSchema>;
export type UpdateParticipantRequest = z.infer<typeof UpdateParticipantRequestSchema>;

export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export type StreamChatRequest = z.infer<typeof StreamChatRequestSchema>;

export type ChatMemory = z.infer<typeof ChatMemorySchema>;
export type CreateMemoryRequest = z.infer<typeof CreateMemoryRequestSchema>;
export type UpdateMemoryRequest = z.infer<typeof UpdateMemoryRequestSchema>;
