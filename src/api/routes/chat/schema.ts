import { z } from '@hono/zod-openapi';

import {
  CoreSchemas,
  createApiResponseSchema,
  createCursorPaginatedResponseSchema,
  CursorPaginationQuerySchema,
} from '@/api/core/schemas';
import {
  chatCustomRoleInsertSchema,
  chatCustomRoleSelectSchema,
  chatCustomRoleUpdateSchema,
  chatMessageSelectSchema,
  chatModeratorAnalysisSelectSchema,
  chatParticipantInsertSchema,
  chatParticipantSelectSchema,
  chatParticipantUpdateSchema,
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

export const ThreadSlugParamSchema = z.object({
  slug: z.string().openapi({
    description: 'Thread slug for public access',
    example: 'product-strategy-brainstorm-abc123',
  }),
});

export const CustomRoleIdParamSchema = z.object({
  id: CoreSchemas.id().openapi({
    description: 'Custom role ID',
    example: 'role_abc123',
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
 * ✅ REUSE: Chat participant schema from database validation
 * Extended with OpenAPI metadata
 * NO TRANSFORMS: Handler serializes dates, schema only validates
 */
const ChatParticipantSchema = chatParticipantSelectSchema
  .extend({
    settings: z.object({
      temperature: z.number().min(0).max(2).optional(),
      maxTokens: z.number().int().positive().optional(),
      systemPrompt: z.string().optional(),
    }).passthrough().nullable().optional(),
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
      modelId: z.string().min(1, 'Model ID is required').openapi({
        description: 'Model ID (e.g., anthropic/claude-3.5-sonnet, openai/gpt-4o)',
        example: 'anthropic/claude-3.5-sonnet',
      }),
      role: z.string().nullish().openapi({
        description: 'Optional assigned role for this model (immutable)',
        example: 'The Ideator',
      }),
      customRoleId: z.string().nullish().openapi({
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
 */
const ThreadDetailPayloadSchema = z.object({
  thread: ChatThreadSchema,
  participants: z.array(ChatParticipantSchema),
  messages: z.array(ChatMessageSchema),
  changelog: z.array(ChatThreadChangelogSchema),
  user: z.object({
    name: z.string(),
    image: z.string().nullable(),
  }),
}).openapi('ThreadDetailPayload');

export const ThreadListResponseSchema = createCursorPaginatedResponseSchema(ChatThreadSchema).openapi('ThreadListResponse');
export const ThreadDetailResponseSchema = createApiResponseSchema(ThreadDetailPayloadSchema).openapi('ThreadDetailResponse');

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
 * ✅ AI SDK v5 Streaming Request - OFFICIAL PATTERN
 * Following https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot
 *
 * AI SDK uses runtime validation with validateUIMessages(), not compile-time schemas.
 * We accept messages as unknown and validate with AI SDK's validateUIMessages() in the handler.
 */
export const StreamChatRequestSchema = z.object({
  messages: z.array(z.unknown()).min(1).openapi({
    description: 'All conversation messages in AI SDK UIMessage format (validated at runtime)',
  }),
  mode: ThreadModeSchema.optional().openapi({
    description: 'Updated conversation mode',
  }),
  participants: z.array(z.object({
    modelId: z.string(),
    role: z.string().nullish(),
    customRoleId: z.string().nullish(),
    order: z.number().int().nonnegative(),
  })).optional().openapi({
    description: 'Updated participant configuration',
  }),
  participantIndex: z.number().int().nonnegative().optional().openapi({
    description: 'Which participant to stream in this request (0-based). Omit when only updating configuration without streaming.',
    example: 0,
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
  changelog: z.array(ChatThreadChangelogSchema),
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
 * ✅ SINGLE SOURCE: Used by roundtable-prompt.service.ts
 */
export const ParticipantInfoSchema = z.object({
  id: CoreSchemas.id(),
  modelId: z.string(),
  modelName: z.string().optional(),
  role: z.string().nullable(),
  priority: z.number().int().nonnegative(),
}).openapi('ParticipantInfo');

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
 */
export const ModeratorAnalysisRequestSchema = z.object({
  threadId: CoreSchemas.id().openapi({
    description: 'Thread ID to analyze',
    example: 'thread_abc123',
  }),
  roundNumber: z.number().int().min(1).openapi({
    description: 'Round number (1-indexed) of the conversation to analyze',
    example: 1,
  }),
  participantMessageIds: z.array(CoreSchemas.id()).min(1).openapi({
    description: 'Array of message IDs from all participants in this round (in order)',
    example: ['msg_abc123', 'msg_def456', 'msg_ghi789'],
  }),
}).openapi('ModeratorAnalysisRequest');

/**
 * Individual skill rating for skills matrix visualization
 */
const SkillRatingSchema = z.object({
  skillName: z.string().openapi({
    description: 'Name of the skill being evaluated',
    example: 'Creativity',
  }),
  rating: z.number().min(1).max(10).openapi({
    description: 'Rating out of 10 for this specific skill',
    example: 8,
  }),
}).openapi('SkillRating');

/**
 * Complete analysis for a single participant's response
 */
const ParticipantAnalysisSchema = z.object({
  participantIndex: z.number().int().min(0).openapi({
    description: 'Index of the participant in the conversation (0-based)',
    example: 0,
  }),
  participantRole: z.string().nullable().openapi({
    description: 'The role assigned to this participant',
    example: 'The Ideator',
  }),
  modelId: z.string().openapi({
    description: 'AI model ID',
    example: 'anthropic/claude-sonnet-4.5',
  }),
  modelName: z.string().openapi({
    description: 'Human-readable model name',
    example: 'Claude Sonnet 4.5',
  }),
  overallRating: z.number().min(1).max(10).openapi({
    description: 'Overall rating out of 10 for this response',
    example: 8.5,
  }),
  skillsMatrix: z.array(SkillRatingSchema).openapi({
    description: 'Individual skill ratings for visualization',
  }),
  pros: z.array(z.string()).min(1).openapi({
    description: 'List of strengths in this response',
    example: ['Creative and diverse ideas', 'Built effectively on previous suggestions'],
  }),
  cons: z.array(z.string()).min(1).openapi({
    description: 'List of weaknesses or areas for improvement',
    example: ['Could have explored more unconventional approaches'],
  }),
  summary: z.string().min(20).max(300).openapi({
    description: 'Brief summary of this participant\'s contribution',
    example: 'Provided innovative solutions with strong creative direction.',
  }),
}).openapi('ParticipantAnalysis');

/**
 * Leaderboard entry for ranking participants
 */
const LeaderboardEntrySchema = z.object({
  rank: z.number().int().min(1).openapi({
    description: 'Rank position (1 = best)',
    example: 1,
  }),
  participantIndex: z.number().int().min(0).openapi({
    description: 'Index of the participant',
    example: 0,
  }),
  participantRole: z.string().nullable().openapi({
    description: 'The role assigned to this participant',
    example: 'The Ideator',
  }),
  modelId: z.string().openapi({
    description: 'Model ID for proper icon display',
    example: 'anthropic/claude-sonnet-4.5',
  }),
  modelName: z.string().openapi({
    description: 'Human-readable model name',
    example: 'Claude Sonnet 4.5',
  }),
  overallRating: z.number().min(1).max(10).openapi({
    description: 'Overall rating for ranking',
    example: 8.5,
  }),
  badge: z.string().nullable().openapi({
    description: 'Optional badge/award',
    example: 'Most Creative',
  }),
}).openapi('LeaderboardEntry');

/**
 * Complete moderator analysis output
 */
export const ModeratorAnalysisPayloadSchema = z.object({
  roundNumber: z.number().int().min(1).openapi({
    description: 'The conversation round number',
    example: 1,
  }),
  mode: z.string().openapi({
    description: 'Conversation mode',
    example: 'brainstorming',
  }),
  userQuestion: z.string().openapi({
    description: 'The user\'s original question/prompt',
    example: 'What are some innovative product ideas?',
  }),
  participantAnalyses: z.array(ParticipantAnalysisSchema).min(1).openapi({
    description: 'Detailed analysis for each participant',
  }),
  leaderboard: z.array(LeaderboardEntrySchema).min(1).openapi({
    description: 'Ranked list of participants by overall performance',
  }),
  overallSummary: z.string().min(100).max(800).openapi({
    description: 'Comprehensive summary of the round',
    example: 'This brainstorming round showcased diverse creative approaches...',
  }),
  conclusion: z.string().min(50).max(400).openapi({
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
