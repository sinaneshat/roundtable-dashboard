import { z } from '@hono/zod-openapi';

import {
  CoreSchemas,
  createApiResponseSchema,
  createCursorPaginatedResponseSchema,
  CursorPaginationQuerySchema,
} from '@/api/core/schemas';
import { userSelectSchema } from '@/db/validation/auth';
import {
  chatCustomRoleInsertSchema,
  chatCustomRoleSelectSchema,
  chatCustomRoleUpdateSchema,
  chatMessageSelectSchema,
  chatModeratorAnalysisSelectSchema,
  chatParticipantInsertSchema,
  chatParticipantSelectSchema,
  chatParticipantUpdateSchema,
  chatRoundFeedbackSelectSchema,
  chatRoundFeedbackUpdateSchema,
  chatThreadChangelogSelectSchema,
  chatThreadInsertSchema,
  chatThreadSelectSchema,
  chatThreadUpdateSchema,
} from '@/db/validation/chat';
import { CHAT_MODES } from '@/lib/config/chat-modes';

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
 * Uses centralized CHAT_MODES for type safety
 */
export const ThreadModeSchema = z.enum(CHAT_MODES);
export type ThreadMode = z.infer<typeof ThreadModeSchema>;

// ============================================================================
// Path Parameter Schemas
// ============================================================================

export const ThreadSlugParamSchema = z.object({
  slug: z.string().openapi({
    description: 'Thread slug for public access',
    example: 'product-strategy-brainstorm-abc123',
  }),
});

export const RoundAnalysisParamSchema = z.object({
  threadId: z.string().openapi({
    description: 'Thread ID',
    example: 'thread_abc123',
  }),
  roundNumber: z.string().openapi({
    description: 'Round number (1-indexed)',
    example: '1',
  }),
});

// ============================================================================
// Entity Schemas for OpenAPI (Reusing Database Validation Schemas)
// ============================================================================

/**
 * ✅ SHARED: Participant settings schema
 * Reusable schema for AI model configuration settings
 */
export const ParticipantSettingsSchema = z.object({
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().optional(),
  systemPrompt: z.string().optional(),
}).passthrough().nullable().optional();

/**
 * ✅ REUSE: Chat participant schema from database validation
 * Extended with OpenAPI metadata
 * NO TRANSFORMS: Handler serializes dates, schema only validates
 */
const ChatParticipantSchema = chatParticipantSelectSchema
  .extend({
    settings: ParticipantSettingsSchema,
  })
  .openapi('ChatParticipant');

/**
 * ✅ SHARED: Message metadata schema
 * Extracted as a shared schema to avoid duplication
 */
export const MessageMetadataSchema = z.object({
  model: z.string().optional(),
  finishReason: z.string().optional(),
  usage: z.object({
    promptTokens: z.number().optional(),
    completionTokens: z.number().optional(),
    totalTokens: z.number().optional(),
  }).optional(),
  isEmptyResponse: z.boolean().optional(), // Flag for models that returned no content
}).passthrough().nullable();

/**
 * ✅ SHARED: Message part schema for AI SDK message parts
 * Used for rendering different types of content in messages
 */
export const MessagePartSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string() }),
  z.object({ type: z.literal('reasoning'), text: z.string() }),
]).openapi('MessagePart');

export type MessagePart = z.infer<typeof MessagePartSchema>;

/**
 * ✅ SHARED: Message status schema for UI rendering states
 * Represents the current state of a message during streaming
 */
export const MessageStatusSchema = z.enum(['thinking', 'streaming', 'completed', 'error']).openapi('MessageStatus');

export type MessageStatus = z.infer<typeof MessageStatusSchema>;

/**
 * ✅ REUSE: Chat message schema from database validation
 * Extended with OpenAPI metadata
 * NO TRANSFORMS: Handler serializes dates, schema only validates
 */
const ChatMessageSchema = chatMessageSelectSchema
  .extend({
    toolCalls: z.array(z.object({
      id: z.string(),
      type: z.string(),
      function: z.object({
        name: z.string(),
        arguments: z.string(),
      }),
    })).nullable().optional(),
    metadata: MessageMetadataSchema.optional(),
  })
  .openapi('ChatMessage');

/**
 * ✅ REUSE: Chat thread schema from database validation
 * Extended with OpenAPI metadata
 * NO TRANSFORMS: Handler serializes dates, schema only validates
 */
const ChatThreadSchema = chatThreadSelectSchema
  .extend({
    metadata: z.object({
      tags: z.array(z.string()).optional(),
      summary: z.string().optional(),
    }).passthrough().nullable().optional(),
  })
  .openapi('ChatThread');

/**
 * ✅ REUSE: Chat thread changelog schema from database validation
 * NO TRANSFORMS: Handler serializes dates, schema only validates
 */
const ChatThreadChangelogSchema = chatThreadChangelogSelectSchema
  .openapi('ChatThreadChangelog');

/**
 * ✅ REUSE: Chat custom role schema from database validation
 * Extended with OpenAPI metadata
 * NO TRANSFORMS: Handler serializes dates, schema only validates
 */
const ChatCustomRoleSchema = chatCustomRoleSelectSchema
  .extend({
    metadata: z.object({
      tags: z.array(z.string()).optional(),
      category: z.string().optional(),
    }).passthrough().nullable().optional(),
  })
  .openapi('ChatCustomRole');

// ============================================================================
// Thread Request/Response Schemas
// ============================================================================

/**
 * ✅ REUSE: Extends chatThreadInsertSchema from database validation
 * Adds API-specific fields (participants, firstMessage)
 */
export const CreateThreadRequestSchema = chatThreadInsertSchema
  .pick({
    title: true,
    mode: true,
    metadata: true,
  })
  .extend({
    title: z.string().min(1).max(200).optional().default('New Chat').openapi({
      description: 'Thread title (auto-generated from first message if "New Chat")',
      example: 'Product strategy brainstorm',
    }),
    mode: ThreadModeSchema.optional().default('brainstorming').openapi({
      description: 'Conversation mode',
      example: 'brainstorming',
    }),
    participants: z.array(z.object({
      modelId: CoreSchemas.id().openapi({
        description: 'Model ID (e.g., anthropic/claude-3.5-sonnet, openai/gpt-4o)',
        example: 'anthropic/claude-3.5-sonnet',
      }),
      role: z.string().nullish().openapi({
        description: 'Optional assigned role for this model (immutable)',
        example: 'The Ideator',
      }),
      customRoleId: CoreSchemas.id().nullish().openapi({
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
  })
  .openapi('CreateThreadRequest');

/**
 * ✅ REUSE: Uses chatThreadUpdateSchema from database validation
 * Extended with participants array to update thread configuration
 */
export const UpdateThreadRequestSchema = chatThreadUpdateSchema
  .pick({
    title: true,
    mode: true,
    status: true,
    isFavorite: true,
    isPublic: true,
    metadata: true,
  })
  .extend({
    participants: z.array(
      z.object({
        id: z.string().optional().openapi({ description: 'Participant ID (omit for new participants)' }),
        modelId: z.string().openapi({ description: 'Model ID' }),
        role: z.string().nullable().optional().openapi({ description: 'Role name' }),
        customRoleId: z.string().nullable().optional().openapi({ description: 'Custom role ID' }),
        priority: z.number().int().min(0).openapi({ description: 'Display order (0-indexed)' }),
        isEnabled: z.boolean().optional().default(true).openapi({ description: 'Whether participant is enabled' }),
      }),
    ).optional().openapi({ description: 'Complete list of participants with their updated state' }),
  })
  .openapi('UpdateThreadRequest');

/**
 * Query parameters for cursor-based pagination with search support
 */
export const ThreadListQuerySchema = CursorPaginationQuerySchema.extend({
  search: z.string().optional().openapi({
    description: 'Search query to filter threads by title',
    example: 'product strategy',
  }),
}).openapi('ThreadListQuery');

/**
 * Thread detail with participants, messages, and changelog
 * ✅ REUSE: Uses userSelectSchema for thread owner info (safe public fields only)
 */
const ThreadDetailPayloadSchema = z.object({
  thread: ChatThreadSchema,
  participants: z.array(ChatParticipantSchema),
  messages: z.array(ChatMessageSchema),
  changelog: z.array(ChatThreadChangelogSchema),
  user: userSelectSchema.pick({
    id: true,
    name: true,
    image: true,
  }),
}).openapi('ThreadDetailPayload');

export const ThreadListResponseSchema = createCursorPaginatedResponseSchema(ChatThreadSchema).openapi('ThreadListResponse');
export const ThreadDetailResponseSchema = createApiResponseSchema(ThreadDetailPayloadSchema).openapi('ThreadDetailResponse');

/**
 * Delete thread response schema
 * Returns confirmation of thread deletion
 */
export const DeleteThreadResponseSchema = createApiResponseSchema(z.object({
  deleted: z.boolean().openapi({ example: true }),
})).openapi('DeleteThreadResponse');

// ============================================================================
// Participant Request/Response Schemas
// ============================================================================

/**
 * ✅ REUSE: Derives from chatParticipantInsertSchema
 */
export const AddParticipantRequestSchema = chatParticipantInsertSchema
  .pick({
    modelId: true,
    role: true,
    priority: true,
    settings: true,
  })
  .extend({
    role: z.string().min(1).max(100).nullish().openapi({
      description: 'Optional assigned role',
      example: 'The Ideator',
    }),
  })
  .openapi('AddParticipantRequest');

/**
 * ✅ REUSE: Derives from chatParticipantUpdateSchema
 */
export const UpdateParticipantRequestSchema = chatParticipantUpdateSchema
  .pick({
    role: true,
    priority: true,
    isEnabled: true,
    settings: true,
  })
  .openapi('UpdateParticipantRequest');

const ParticipantDetailPayloadSchema = z.object({
  participant: ChatParticipantSchema,
}).openapi('ParticipantDetailPayload');

export const ParticipantDetailResponseSchema = createApiResponseSchema(ParticipantDetailPayloadSchema).openapi('ParticipantDetailResponse');

// ============================================================================
// Message Request/Response Schemas
// ============================================================================

/**
 * ✅ AI SDK v5 Streaming Request Schema (with Multi-Participant Extension)
 * Reference: https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot
 *
 * OFFICIAL AI SDK v5 PATTERN:
 * ```typescript
 * const { messages }: { messages: UIMessage[] } = await req.json();
 * const result = streamText({
 *   model: openai('gpt-4o'),
 *   messages: convertToModelMessages(messages),
 * });
 * return result.toUIMessageStreamResponse();
 * ```
 *
 * APPLICATION-SPECIFIC EXTENSIONS:
 * - `id`: Thread ID for persistence (required for multi-turn conversations)
 * - `participantIndex`: Route to specific AI model in roundtable (our customization)
 *
 * WHY `z.array(z.unknown())` for messages?
 * AI SDK recommends runtime validation with `validateUIMessages()` because
 * UIMessage<METADATA, DATA, TOOLS> is a complex generic that Zod cannot represent.
 * We validate at runtime in the handler using the official validateUIMessages() function.
 *
 * MULTI-PARTICIPANT FLOW:
 * 1. Frontend calls with participantIndex=0 (first model responds)
 * 2. onFinish triggers, frontend calls with participantIndex=1 (second model)
 * 3. Repeat until all participants have responded
 * 4. This sequential orchestration is handled by useMultiParticipantChat hook
 */
export const StreamChatRequestSchema = z.object({
  /**
   * ✅ AI SDK v5 OFFICIAL PATTERN: Send ALL accumulated messages
   * Reference: https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot-message-persistence
   *
   * Frontend sends complete message array. Backend uses these messages directly
   * for AI context (no DB dependency), then persists new assistant response.
   *
   * Runtime validated with validateUIMessages() in handler.
   *
   * Why z.unknown()? UIMessage<METADATA, DATA, TOOLS> is a complex generic
   * type that Zod cannot accurately represent. Official AI SDK docs recommend
   * z.unknown() + runtime validation.
   */
  messages: z.array(z.unknown()).openapi({
    description: 'Complete message history in AI SDK UIMessage[] format',
    example: [
      {
        id: 'msg_user1',
        role: 'user',
        parts: [{ type: 'text', text: 'Hello!' }],
      },
      {
        id: 'msg_assistant1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'Hi there!' }],
      },
    ],
  }),

  /**
   * ✅ Thread ID for persistence (REQUIRED for streaming)
   */
  id: z.string().min(1).openapi({
    description: 'Thread ID for persistence and participant loading (required)',
    example: 'thread_abc123',
  }),

  /**
   * ✅ Participant Index for frontend orchestration (OPTIONAL)
   * Defaults to 0 (first participant) if not provided.
   * Frontend increments this to stream each participant sequentially.
   */
  participantIndex: z.number().int().min(0).optional().default(0).openapi({
    description: 'Index of participant to stream (0-based). Frontend orchestrates multiple participants.',
    example: 0,
  }),

  /**
   * ✅ RACE CONDITION FIX: Current participants configuration (OPTIONAL)
   * When provided, backend uses this configuration instead of loading from database.
   * This eliminates race condition between updateThread() and streamChat() calls.
   *
   * Frontend should send current UI state to ensure AI responses use latest config.
   */
  participants: z.array(
    z.object({
      id: z.string(),
      modelId: z.string(),
      role: z.string().nullable().optional(),
      customRoleId: z.string().nullable().optional(),
      priority: z.number().int().min(0),
      isEnabled: z.boolean().optional().default(true),
    }),
  ).optional().openapi({
    description: 'Current participant configuration (optional). If provided, used instead of loading from database.',
    example: [
      {
        id: 'participant_1',
        modelId: 'anthropic/claude-sonnet-4.5',
        role: 'The Ideator',
        customRoleId: null,
        priority: 0,
        isEnabled: true,
      },
    ],
  }),

  /**
   * ✅ REGENERATE ROUND: Replace an existing round instead of creating a new one (OPTIONAL)
   * When provided, backend will:
   * 1. Delete all messages from the specified round
   * 2. Delete analysis for that round (if exists)
   * 3. Create new messages with the same round number
   *
   * This enables true "retry/regenerate" functionality where old responses are replaced.
   */
  regenerateRound: z.number().int().positive().optional().openapi({
    description: 'Round number to regenerate (replace). If provided, deletes old messages and analysis for that round first.',
    example: 2,
  }),

}).openapi('StreamChatRequest');

const MessagesListPayloadSchema = z.object({
  messages: z.array(ChatMessageSchema),
  count: z.number().int().nonnegative(),
}).openapi('MessagesListPayload');

export const MessagesListResponseSchema = createApiResponseSchema(MessagesListPayloadSchema).openapi('MessagesListResponse');

// ============================================================================
// Custom Role Request/Response Schemas
// ============================================================================

/**
 * ✅ REUSE: Derives from chatCustomRoleInsertSchema
 */
export const CreateCustomRoleRequestSchema = chatCustomRoleInsertSchema
  .pick({
    name: true,
    description: true,
    systemPrompt: true,
    metadata: true,
  })
  .openapi('CreateCustomRoleRequest');

/**
 * ✅ REUSE: Derives from chatCustomRoleUpdateSchema
 */
export const UpdateCustomRoleRequestSchema = chatCustomRoleUpdateSchema
  .pick({
    name: true,
    description: true,
    systemPrompt: true,
    metadata: true,
  })
  .openapi('UpdateCustomRoleRequest');

const CustomRoleDetailPayloadSchema = z.object({
  customRole: ChatCustomRoleSchema,
}).openapi('CustomRoleDetailPayload');

export const CustomRoleListResponseSchema = createCursorPaginatedResponseSchema(ChatCustomRoleSchema).openapi('CustomRoleListResponse');
export const CustomRoleDetailResponseSchema = createApiResponseSchema(CustomRoleDetailPayloadSchema).openapi('CustomRoleDetailResponse');

// ============================================================================
// Changelog Response Schemas
// ============================================================================

const ChangelogListPayloadSchema = z.object({
  items: z.array(ChatThreadChangelogSchema), // ✅ Match Responses.collection() structure
  count: z.number().int().nonnegative(),
}).openapi('ChangelogListPayload');

export const ChangelogListResponseSchema = createApiResponseSchema(ChangelogListPayloadSchema).openapi('ChangelogListResponse');

// ============================================================================
// Changelog Creation Schema (for services)
// ============================================================================

/**
 * Changelog type enum
 * ✅ SINGLE SOURCE: Used across changelog operations
 */
export const ChangelogTypeSchema = z.enum([
  'mode_change',
  'participant_added',
  'participant_removed',
  'participant_updated',
  'participants_reordered',
]);

export type ChangelogType = z.infer<typeof ChangelogTypeSchema>;

/**
 * Create changelog entry parameters
 * ✅ SINGLE SOURCE: Used by thread-changelog.service.ts
 */
export const CreateChangelogParamsSchema = z.object({
  threadId: CoreSchemas.id(),
  changeType: ChangelogTypeSchema,
  changeSummary: z.string().min(1).max(500),
  changeData: z.record(z.string(), z.unknown()).optional(),
}).openapi('CreateChangelogParams');

export type CreateChangelogParams = z.infer<typeof CreateChangelogParamsSchema>;

// ============================================================================
// Roundtable Prompt Schemas (for services)
// ============================================================================

/**
 * Participant info schema for roundtable prompt building
 * ✅ REUSE: Derives from chatParticipantSelectSchema with computed modelName
 * Used by roundtable-prompt.service.ts
 */
export const ParticipantInfoSchema = chatParticipantSelectSchema
  .pick({
    id: true,
    modelId: true,
    role: true,
    priority: true,
  })
  .extend({
    modelName: z.string().optional().openapi({
      description: 'Human-readable model name (computed from model lookup)',
    }),
  })
  .openapi('ParticipantInfo');

export type ParticipantInfo = z.infer<typeof ParticipantInfoSchema>;

/**
 * Roundtable prompt configuration schema
 * ✅ SINGLE SOURCE: Internal configuration for prompt building
 */
export const RoundtablePromptConfigSchema = z.object({
  mode: z.string(),
  currentParticipantIndex: z.number().int().nonnegative(),
  currentParticipant: ParticipantInfoSchema,
  allParticipants: z.array(ParticipantInfoSchema),
  customSystemPrompt: z.string().nullable().optional(),
}).openapi('RoundtablePromptConfig');

export type RoundtablePromptConfig = z.infer<typeof RoundtablePromptConfigSchema>;

// ============================================================================
// Moderator Analysis Schemas
// ============================================================================

/**
 * Request to generate moderator analysis for a conversation round
 *
 * ✅ AI SDK V5 PATTERN: Simplified for useObject hook
 * - threadId and roundNumber come from URL params (not body)
 * - participantMessageIds is optional - backend auto-queries if not provided
 * - Compatible with official AI SDK submit() pattern
 */
export const ModeratorAnalysisRequestSchema = z.object({
  participantMessageIds: z.array(CoreSchemas.id()).optional().openapi({
    description: 'Array of message IDs from participants (optional - backend auto-queries from database if not provided)',
    example: ['msg_abc123', 'msg_def456', 'msg_ghi789'],
  }),
}).openapi('ModeratorAnalysisRequest');

/**
 * Individual skill rating for skills matrix visualization
 * ✅ SINGLE SOURCE OF TRUTH: Used by both AI SDK streamObject() and OpenAPI docs
 */
export const SkillRatingSchema = z.object({
  skillName: z.string()
    .describe('Name of the skill being evaluated (e.g., "Creativity", "Technical Depth", "Clarity")')
    .openapi({
      description: 'Name of the skill being evaluated',
      example: 'Creativity',
    }),
  rating: z.number().min(1).max(10).describe('Rating out of 10 for this specific skill').openapi({
    description: 'Rating out of 10 for this specific skill',
    example: 8,
  }),
}).openapi('SkillRating');

/**
 * Complete analysis for a single participant's response
 * ✅ SINGLE SOURCE OF TRUTH: Used by both AI SDK streamObject() and OpenAPI docs
 */
export const ParticipantAnalysisSchema = z.object({
  participantIndex: z.number().int().min(0).describe('Index of the participant in the conversation (0-based)').openapi({
    description: 'Index of the participant in the conversation (0-based)',
    example: 0,
  }),
  participantRole: z.string().nullable().describe('The role assigned to this participant (e.g., "The Ideator")').openapi({
    description: 'The role assigned to this participant',
    example: 'The Ideator',
  }),
  modelId: z.string()
    .describe('AI model ID (e.g., "anthropic/claude-sonnet-4.5")')
    .openapi({
      description: 'AI model ID',
      example: 'anthropic/claude-sonnet-4.5',
    }),
  modelName: z.string()
    .describe('Human-readable model name (e.g., "Claude Sonnet 4.5")')
    .openapi({
      description: 'Human-readable model name',
      example: 'Claude Sonnet 4.5',
    }),
  overallRating: z.number().min(1).max(10).describe('Overall rating out of 10 for this response').openapi({
    description: 'Overall rating out of 10 for this response',
    example: 8.5,
  }),
  skillsMatrix: z.array(SkillRatingSchema)
    .describe('Individual skill ratings for visualization')
    .openapi({
      description: 'Individual skill ratings for visualization',
    }),
  pros: z.array(z.string()).min(1).describe('List of strengths in this response (2-4 items)').openapi({
    description: 'List of strengths in this response',
    example: ['Creative and diverse ideas', 'Built effectively on previous suggestions'],
  }),
  cons: z.array(z.string()).min(1).describe('List of weaknesses or areas for improvement (1-3 items)').openapi({
    description: 'List of weaknesses or areas for improvement',
    example: ['Could have explored more unconventional approaches'],
  }),
  summary: z.string().min(20).max(300).describe('Brief summary of this participant\'s contribution (1-2 sentences)').openapi({
    description: 'Brief summary of this participant\'s contribution',
    example: 'Provided innovative solutions with strong creative direction.',
  }),
}).openapi('ParticipantAnalysis');

/**
 * Leaderboard entry for ranking participants
 * ✅ SINGLE SOURCE OF TRUTH: Used by both AI SDK streamObject() and OpenAPI docs
 */
export const LeaderboardEntrySchema = z.object({
  rank: z.number().int().min(1).describe('Rank position (1 = best)').openapi({
    description: 'Rank position (1 = best)',
    example: 1,
  }),
  participantIndex: z.number().int().min(0).describe('Index of the participant').openapi({
    description: 'Index of the participant',
    example: 0,
  }),
  participantRole: z.string().nullable().describe('The role assigned to this participant').openapi({
    description: 'The role assigned to this participant',
    example: 'The Ideator',
  }),
  modelId: z.string()
    .describe('AI model ID (e.g., "anthropic/claude-sonnet-4.5")')
    .openapi({
      description: 'Model ID for proper icon display',
      example: 'anthropic/claude-sonnet-4.5',
    }),
  modelName: z.string()
    .describe('Human-readable model name')
    .openapi({
      description: 'Human-readable model name',
      example: 'Claude Sonnet 4.5',
    }),
  overallRating: z.number().min(1).max(10).describe('Overall rating for ranking').openapi({
    description: 'Overall rating for ranking',
    example: 8.5,
  }),
  badge: z.string().nullable().describe('Optional badge/award (e.g., "Most Creative", "Best Analysis")').openapi({
    description: 'Optional badge/award',
    example: 'Most Creative',
  }),
}).openapi('LeaderboardEntry');

/**
 * Complete moderator analysis output
 * ✅ SINGLE SOURCE OF TRUTH: Used by AI SDK streamObject(), OpenAPI docs, and frontend
 * ✅ AI SDK V5 PATTERN: Combines .describe() for generation with .openapi() for documentation
 */
export const ModeratorAnalysisPayloadSchema = z.object({
  roundNumber: z.number().int().min(1).describe('The conversation round number (starts at 1)').openapi({
    description: 'The conversation round number',
    example: 1,
  }),
  mode: z.string()
    .describe('Conversation mode (analyzing, brainstorming, debating, solving)')
    .openapi({
      description: 'Conversation mode',
      example: 'brainstorming',
    }),
  userQuestion: z.string()
    .describe('The user\'s original question/prompt')
    .openapi({
      description: 'The user\'s original question/prompt',
      example: 'What are some innovative product ideas?',
    }),
  participantAnalyses: z.array(ParticipantAnalysisSchema).min(1).describe('Detailed analysis for each participant').openapi({
    description: 'Detailed analysis for each participant',
  }),
  leaderboard: z.array(LeaderboardEntrySchema).min(1).describe('Ranked list of participants by overall performance').openapi({
    description: 'Ranked list of participants by overall performance',
  }),
  overallSummary: z.string().min(100).max(800).describe('Comprehensive summary of the round, highlighting key insights and comparing approaches').openapi({
    description: 'Comprehensive summary of the round',
    example: 'This brainstorming round showcased diverse creative approaches...',
  }),
  conclusion: z.string().min(50).max(400).describe('Final conclusion and recommendation on the best path forward').openapi({
    description: 'Final conclusion and recommendation',
    example: 'The combination of Participant 1\'s creative ideas with Participant 2\'s practical insights provides the best path forward...',
  }),
}).openapi('ModeratorAnalysisPayload');

export const ModeratorAnalysisResponseSchema = createApiResponseSchema(ModeratorAnalysisPayloadSchema).openapi('ModeratorAnalysisResponse');

/**
 * ✅ REUSE: Stored moderator analysis from database validation
 * Extended with computed analysisData structure
 */
export const StoredModeratorAnalysisSchema = chatModeratorAnalysisSelectSchema
  .extend({
    analysisData: z.object({
      leaderboard: z.array(LeaderboardEntrySchema),
      participantAnalyses: z.array(ParticipantAnalysisSchema),
      overallSummary: z.string(),
      conclusion: z.string(),
    }).nullable().optional(),
  })
  .openapi('StoredModeratorAnalysis');

const ModeratorAnalysisListPayloadSchema = z.object({
  items: z.array(StoredModeratorAnalysisSchema),
  count: z.number().int().nonnegative(),
}).openapi('ModeratorAnalysisListPayload');

export const ModeratorAnalysisListResponseSchema = createApiResponseSchema(ModeratorAnalysisListPayloadSchema).openapi('ModeratorAnalysisListResponse');

// ============================================================================
// TYPE EXPORTS FOR FRONTEND & BACKEND
// ============================================================================

/**
 * API response types
 * Note: Date objects are automatically serialized to ISO strings by Hono/JSON.stringify
 */
export type ChatThread = z.infer<typeof ChatThreadSchema>;
export type CreateThreadRequest = z.infer<typeof CreateThreadRequestSchema>;
export type UpdateThreadRequest = z.infer<typeof UpdateThreadRequestSchema>;

export type ChatParticipant = z.infer<typeof ChatParticipantSchema>;
export type AddParticipantRequest = z.infer<typeof AddParticipantRequestSchema>;
export type UpdateParticipantRequest = z.infer<typeof UpdateParticipantRequestSchema>;

export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export type StreamChatRequest = z.infer<typeof StreamChatRequestSchema>;

export type ChatCustomRole = z.infer<typeof ChatCustomRoleSchema>;
export type CreateCustomRoleRequest = z.infer<typeof CreateCustomRoleRequestSchema>;
export type UpdateCustomRoleRequest = z.infer<typeof UpdateCustomRoleRequestSchema>;

// ============================================================================
// Changelog Change Data Schemas
// ============================================================================

/**
 * ✅ ZOD PATTERN: Type-safe schemas for ChatThreadChangelog.changeData
 * Eliminates inline type casting throughout the codebase
 *
 * The backend stores changeData as z.record(z.string(), z.unknown()) for flexibility,
 * but the frontend needs type safety for each specific change type.
 */

/**
 * Schema for participant_added changeData
 */
export const ParticipantAddedDataSchema = z.object({
  modelId: z.string(),
  role: z.string().nullable().optional(),
  priority: z.number().optional(),
});

export type ParticipantAddedData = z.infer<typeof ParticipantAddedDataSchema>;

/**
 * Schema for participant_removed changeData
 */
export const ParticipantRemovedDataSchema = z.object({
  modelId: z.string(),
  role: z.string().nullable().optional(),
});

export type ParticipantRemovedData = z.infer<typeof ParticipantRemovedDataSchema>;

/**
 * Schema for participant_updated changeData
 */
export const ParticipantUpdatedDataSchema = z.object({
  before: z.object({
    modelId: z.string().optional(),
    role: z.string().nullable().optional(),
    priority: z.number().optional(),
  }).optional(),
  after: z.object({
    modelId: z.string().optional(),
    role: z.string().nullable().optional(),
    priority: z.number().optional(),
  }).optional(),
  modelId: z.string().optional(),
  oldRole: z.string().nullable().optional(),
  newRole: z.string().nullable().optional(),
});

export type ParticipantUpdatedData = z.infer<typeof ParticipantUpdatedDataSchema>;

/**
 * Schema for participants_reordered changeData
 */
export const ParticipantsReorderedDataSchema = z.object({
  participantIds: z.array(z.string()).optional(),
  count: z.number().optional(),
  participants: z.array(z.object({
    id: z.string(),
    modelId: z.string(),
    role: z.string().nullable(),
    order: z.number(),
  })).optional(),
});

export type ParticipantsReorderedData = z.infer<typeof ParticipantsReorderedDataSchema>;

/**
 * Schema for mode_change changeData
 */
export const ModeChangeDataSchema = z.object({
  previousMode: z.string(),
  newMode: z.string(),
});

export type ModeChangeData = z.infer<typeof ModeChangeDataSchema>;

/**
 * Union schema for all possible changeData structures
 */
export const ChangeDataSchema = z.union([
  ParticipantAddedDataSchema,
  ParticipantRemovedDataSchema,
  ParticipantUpdatedDataSchema,
  ParticipantsReorderedDataSchema,
  ModeChangeDataSchema,
]);

export type ChangeData = z.infer<typeof ChangeDataSchema>;

// ============================================================================
// Changelog UI Helper Schemas
// ============================================================================

// ============================================================================
// Changelog Data Parsing Helpers
// ============================================================================

/**
 * ✅ ZOD PATTERN: Safe parsing helper for changeData
 * Returns parsed data or undefined if parsing fails
 */
function parseChangeData<T extends z.ZodTypeAny>(
  schema: T,
  data: unknown,
): z.infer<T> | undefined {
  const result = schema.safeParse(data);
  return result.success ? result.data : undefined;
}

/**
 * Parse participant added data safely
 */
export function parseParticipantAddedData(data: unknown): ParticipantAddedData | undefined {
  return parseChangeData(ParticipantAddedDataSchema, data);
}

/**
 * Parse participant removed data safely
 */
export function parseParticipantRemovedData(data: unknown): ParticipantRemovedData | undefined {
  return parseChangeData(ParticipantRemovedDataSchema, data);
}

/**
 * Parse participant updated data safely
 */
export function parseParticipantUpdatedData(data: unknown): ParticipantUpdatedData | undefined {
  return parseChangeData(ParticipantUpdatedDataSchema, data);
}

/**
 * Parse participants reordered data safely
 */
export function parseParticipantsReorderedData(data: unknown): ParticipantsReorderedData | undefined {
  return parseChangeData(ParticipantsReorderedDataSchema, data);
}

/**
 * Parse mode change data safely
 */
export function parseModeChangeData(data: unknown): ModeChangeData | undefined {
  return parseChangeData(ModeChangeDataSchema, data);
}

// ============================================================================
// TYPE EXPORTS (END OF FILE)
// ============================================================================

export type ChatThreadChangelog = z.infer<typeof ChatThreadChangelogSchema>;

export type ParticipantAnalysis = z.infer<typeof ParticipantAnalysisSchema>;
export type LeaderboardEntry = z.infer<typeof LeaderboardEntrySchema>;
export type ModeratorAnalysisRequest = z.infer<typeof ModeratorAnalysisRequestSchema>;
export type ModeratorAnalysisPayload = z.infer<typeof ModeratorAnalysisPayloadSchema>;
export type StoredModeratorAnalysis = z.infer<typeof StoredModeratorAnalysisSchema>;

/**
 * ✅ AI SDK v5 OFFICIAL PATTERN: Metadata schema for UI messages
 * Used with validateUIMessages() to handle message metadata
 * Reference: https://sdk.vercel.ai/docs/ai-sdk-core/validate-ui-messages
 *
 * Extended with UI-specific fields for frontend rendering:
 * - participantId, participantIndex, role (for rendering participant info)
 * - createdAt (for timeline sorting)
 * - hasError, error, errorType, errorMessage (for error handling)
 * - mode, aborted, partialResponse (for streaming state)
 */
export const UIMessageMetadataSchema = z.object({
  // ✅ Core metadata fields (from AI SDK)
  participantId: z.string().optional(),
  createdAt: z.string().datetime().optional(),
  model: z.string().optional(),
  finishReason: z.string().optional(),
  usage: z.object({
    promptTokens: z.number().optional(),
    completionTokens: z.number().optional(),
    totalTokens: z.number().optional(),
  }).optional(),

  // ✅ UI-specific fields for rendering
  participantIndex: z.number().optional(),
  role: z.string().nullable().optional(),
  roundNumber: z.number().optional(), // ✅ EVENT-BASED ROUND TRACKING: Group messages by round

  // ✅ Streaming state fields
  mode: z.string().optional(),
  aborted: z.boolean().optional(),
  partialResponse: z.boolean().optional(),

  // ✅ Error handling fields (AI SDK error handling pattern)
  hasError: z.boolean().optional(),
  error: z.string().optional(),
  errorType: z.string().optional(),
  errorMessage: z.string().optional(),
  isTransient: z.boolean().optional(),
  statusCode: z.number().optional(),
  responseBody: z.string().optional(),
  errorDetails: z.string().optional(),
  isEmptyResponse: z.boolean().optional(), // Flag for models that returned no content
}).passthrough().nullable().optional();

export type UIMessageMetadata = z.infer<typeof UIMessageMetadataSchema>;

// ============================================================================
// Round Feedback Schemas
// ============================================================================

/**
 * Round feedback parameter schema (threadId + roundNumber in path)
 */
export const RoundFeedbackParamSchema = z.object({
  threadId: z.string().openapi({
    description: 'Thread ID',
    example: 'thread_abc123',
  }),
  roundNumber: z.string().openapi({
    description: 'Round number (1-indexed)',
    example: '1',
  }),
});

/**
 * ✅ REUSE: Round feedback request schema from database validation
 * Uses update schema since we're modifying feedback
 */
export const RoundFeedbackRequestSchema = chatRoundFeedbackUpdateSchema
  .pick({
    feedbackType: true,
  })
  .openapi('RoundFeedbackRequest');

export type RoundFeedbackRequest = z.infer<typeof RoundFeedbackRequestSchema>;

/**
 * ✅ REUSE: Chat round feedback schema from database validation
 * Picks only fields needed for API responses
 * NO TRANSFORMS: Handler serializes dates, schema only validates
 */
const ChatRoundFeedbackSchema = chatRoundFeedbackSelectSchema
  .pick({
    id: true,
    threadId: true,
    userId: true,
    roundNumber: true,
    feedbackType: true,
    createdAt: true,
    updatedAt: true,
  })
  .openapi('ChatRoundFeedback');

export type RoundFeedback = z.infer<typeof ChatRoundFeedbackSchema>;

/**
 * Response schema for setting round feedback
 */
export const SetRoundFeedbackResponseSchema = createApiResponseSchema(
  ChatRoundFeedbackSchema,
).openapi('SetRoundFeedbackResponse');

/**
 * Response schema for getting round feedback for a thread
 */
export const GetThreadFeedbackResponseSchema = createApiResponseSchema(
  z.array(ChatRoundFeedbackSchema),
).openapi('GetThreadFeedbackResponse');
