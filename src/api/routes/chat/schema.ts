import { z } from '@hono/zod-openapi';

import {
  ChangelogTypeSchema,
  ChatModeSchema,
} from '@/api/core/enums';
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
import { ParticipantSettingsSchema } from '@/lib/config/participant-settings';
import { MessageMetadataSchema } from '@/lib/schemas/message-metadata';

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
 * Reusable Zod refinement to validate unique modelIds in participants array
 * Only checks enabled participants (isEnabled !== false)
 *
 * @example
 * z.array(ParticipantSchema).refine(...uniqueModelIdsRefinement)
 */
export const uniqueModelIdsRefinement = {
  check: (participants: Array<{ modelId: string; isEnabled?: boolean }>) => {
    // Filter to only enabled participants (isEnabled !== false means enabled by default)
    const enabledParticipants = participants.filter(p => p.isEnabled !== false);

    // Extract modelIds and check for duplicates
    const modelIds = enabledParticipants.map(p => p.modelId);
    const uniqueModelIds = new Set(modelIds);

    return modelIds.length === uniqueModelIds.size;
  },
  message: 'Duplicate modelIds detected. Each enabled participant must have a unique model.',
};

// ============================================================================
// Entity Schemas for OpenAPI (Reusing Database Validation Schemas)
// ============================================================================

/**
 * ✅ REUSE: Chat participant schema from database validation
 * Extended with OpenAPI metadata and shared ParticipantSettingsSchema
 * NO TRANSFORMS: Handler serializes dates, schema only validates
 */
const ChatParticipantSchema = chatParticipantSelectSchema
  .extend({
    settings: ParticipantSettingsSchema,
  })
  .openapi('ChatParticipant');

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
    mode: ChatModeSchema.optional().default('brainstorming').openapi({
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
    }))
      .min(1)
      .refine(uniqueModelIdsRefinement.check, { message: uniqueModelIdsRefinement.message })
      .openapi({
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
    )
      .refine(uniqueModelIdsRefinement.check, { message: uniqueModelIdsRefinement.message })
      .optional()
      .openapi({ description: 'Complete list of participants with their updated state' }),
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
   * ✅ AI SDK v5 OFFICIAL PATTERN: Send ONLY last message
   * Reference: https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot-message-persistence#sending-only-the-last-message
   *
   * OPTIMIZATION: Frontend sends only the last message instead of entire history.
   * Backend loads previous messages from database and appends the new message.
   *
   * Benefits:
   * - Reduced bandwidth (especially important for long conversations)
   * - Faster requests as conversation grows
   * - Less data transferred on every streaming request
   *
   * Multi-Participant Flow:
   * - User sends new message → Participant 0 streams (message saved to DB)
   * - Participant 1 triggers → Backend loads ALL previous messages from DB (including Participant 0's response)
   * - Participant 2 triggers → Backend loads ALL previous messages from DB (including 0 & 1's responses)
   * - This works because each participant's response is persisted before the next one starts
   *
   * UIMessage Format:
   * {
   *   id: string,              // Unique message ID (ulid/uuid)
   *   role: 'user' | 'assistant',
   *   parts: [                 // Array of message parts
   *     { type: 'text', text: string },       // Regular text content
   *     { type: 'reasoning', text: string }   // Model reasoning (optional)
   *   ],
   *   metadata?: {             // Optional metadata
   *     participantId?: string,
   *     participantIndex?: number,
   *     role?: string,
   *     roundNumber?: number,
   *     hasError?: boolean,
   *     errorMessage?: string
   *   },
   *   createdAt?: string | Date  // ISO timestamp
   * }
   *
   * Runtime validated with validateUIMessages() in handler.
   *
   * Why z.unknown()? UIMessage<METADATA, DATA, TOOLS> is a complex generic
   * type that Zod cannot accurately represent. Official AI SDK docs recommend
   * z.unknown() + runtime validation.
   */
  message: z.unknown().openapi({
    description: `**Last message in AI SDK UIMessage format** (backend loads previous messages from DB)

**Format:**
\`\`\`json
{
  "id": "msg_user1",
  "role": "user",
  "parts": [
    { "type": "text", "text": "What are the best practices for API design?" }
  ],
  "createdAt": "2025-01-15T10:30:00.000Z"
}
\`\`\`

**Part Types:**
- \`text\`: Regular message content
- \`reasoning\`: Model internal reasoning (e.g., Claude extended thinking)

**Important:** Send only the **new** message. Backend loads full conversation history from database automatically.`,
    example: {
      id: 'msg_user1',
      role: 'user',
      parts: [{ type: 'text', text: 'What are the best practices for API design?' }],
      createdAt: '2025-01-15T10:30:00.000Z',
    },
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
  )
    .refine(uniqueModelIdsRefinement.check, { message: uniqueModelIdsRefinement.message })
    .optional()
    .openapi({
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

  /**
   * ✅ CONVERSATION MODE: Track mode changes (OPTIONAL)
   * When provided and different from current thread mode, generates changelog entry.
   * Mode change is persisted immediately (not staged like participant changes).
   */
  mode: ChatModeSchema.optional().openapi({
    description: 'Conversation mode for this thread. If changed, generates changelog entry.',
    example: 'brainstorming',
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
 * Create changelog entry parameters
 * Uses ChangelogTypeSchema from @/api/core/enums
 */
export const CreateChangelogParamsSchema = z.object({
  threadId: CoreSchemas.id(),
  roundNumber: z.number().int().positive(),
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
 * ✅ SIMPLIFIED: Clean schema for AI SDK streamObject() with Claude 3.5 Sonnet
 */
export const SkillRatingSchema = z.object({
  skillName: z.string()
    .describe('Name of the skill being evaluated (e.g., "Creativity", "Technical Depth", "Clarity")'),

  rating: z.number().min(1).max(10).describe('Rating out of 10 for this specific skill'),
}).openapi('SkillRating');

/**
 * Complete analysis for a single participant's response
 * ✅ SIMPLIFIED: Clean schema for AI SDK streamObject() with Claude 3.5 Sonnet
 * ✅ CORE FIELDS: Only essential metrics for reliable structured output
 */
export const ParticipantAnalysisSchema = z.object({
  participantIndex: z.number().int().min(0).describe('Index of the participant in the conversation (0-based)'),

  participantRole: z.string().nullable().describe('The role assigned to this participant (e.g., "The Ideator")'),

  modelId: z.string()
    .describe('AI model ID (e.g., "anthropic/claude-sonnet-4.5")'),

  modelName: z.string()
    .describe('Human-readable model name (e.g., "Claude Sonnet 4.5")'),

  overallRating: z.number().min(1).max(10).describe('Overall rating out of 10 for this response'),

  skillsMatrix: z.array(SkillRatingSchema)
    .length(5)
    .describe('Individual skill ratings for pentagon visualization - MUST be exactly 5 skills (e.g., Creativity, Technical Depth, Clarity, Analysis, Innovation)'),

  pros: z.array(z.string()).min(1).describe('List of strengths in this response (2-4 items)'),

  cons: z.array(z.string()).min(1).describe('List of weaknesses or areas for improvement (1-3 items)'),

  summary: z.string().max(300).describe('Brief summary of this participant\'s contribution (1-2 sentences)'),
}).openapi('ParticipantAnalysis');

/**
 * Leaderboard entry for ranking participants
 * ✅ SIMPLIFIED: Clean schema for AI SDK streamObject() with Claude 3.5 Sonnet
 * ✅ CORE FIELDS: Only essential ranking information for reliable structured output
 */
export const LeaderboardEntrySchema = z.object({
  rank: z.number().int().min(1).describe('Rank position (1 = best)'),

  participantIndex: z.number().int().min(0).describe('Index of the participant'),

  participantRole: z.string().nullable().describe('The role assigned to this participant'),

  modelId: z.string()
    .describe('AI model ID (e.g., "anthropic/claude-sonnet-4.5")'),

  modelName: z.string()
    .describe('Human-readable model name'),

  overallRating: z.number().min(1).max(10).describe('Overall rating for ranking'),

  badge: z.string().nullable().describe('Optional badge/award (e.g., "Most Creative", "Best Analysis")'),
}).openapi('LeaderboardEntry');

/**
 * Complete moderator analysis output
 * ✅ SIMPLIFIED: Clean schema for AI SDK streamObject() with Claude 3.5 Sonnet
 * ✅ SINGLE SOURCE OF TRUTH: Used for both AI generation and OpenAPI docs
 */
export const ModeratorAnalysisPayloadSchema = z.object({
  roundNumber: z.number().int().min(1).describe('The conversation round number (starts at 1)'),

  mode: z.string()
    .describe('Conversation mode (analyzing, brainstorming, debating, solving)'),

  userQuestion: z.string()
    .describe('The user\'s original question/prompt'),

  participantAnalyses: z.array(ParticipantAnalysisSchema).min(1).describe('Detailed analysis for each participant. Array of ParticipantAnalysis objects with ratings, pros, cons, and summary.'),

  leaderboard: z.array(LeaderboardEntrySchema).min(1).describe('Ranked list of participants by overall performance. Array of LeaderboardEntry objects sorted by rank.'),

  overallSummary: z.string().max(800).describe('Comprehensive summary of the round, highlighting key insights and comparing approaches. Should be 2-4 paragraphs.'),

  conclusion: z.string().max(400).describe('Final conclusion and recommendation on the best path forward. Should be 1-2 paragraphs.'),
}).openapi('ModeratorAnalysisPayload');

export const ModeratorAnalysisResponseSchema = createApiResponseSchema(ModeratorAnalysisPayloadSchema).openapi('ModeratorAnalysisResponse');

/**
 * ✅ BACKGROUND PROCESSING: 202 Accepted response when analysis starts
 * Returned immediately when background processing is initiated
 */
export const AnalysisAcceptedPayloadSchema = z.object({
  analysisId: z.string().describe('ID of the analysis record being processed'),
  status: z.literal('processing').describe('Status indicating background processing has started'),
  message: z.string().optional().describe('Optional message about polling for completion'),
}).openapi('AnalysisAcceptedPayload');

export const AnalysisAcceptedResponseSchema = AnalysisAcceptedPayloadSchema.openapi('AnalysisAcceptedResponse');

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
    priority: z.number(),
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

// ✅ STREAM RESUMPTION: No response schema needed
// The resume endpoint returns either:
// - 200 OK with SSE stream (text/event-stream)
// - 204 No Content (no active stream)
// Neither requires a JSON schema

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
