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

export const MessageContentSchema = z.string()
  .min(1, 'Message is required')
  .max(5000, 'Message is too long (max 5000 characters)');
export const uniqueModelIdsRefinement = {
  check: (participants: Array<{ modelId: string; isEnabled?: boolean }>) => {
    const enabledParticipants = participants.filter(p => p.isEnabled !== false);
    const modelIds = enabledParticipants.map(p => p.modelId);
    const uniqueModelIds = new Set(modelIds);
    return modelIds.length === uniqueModelIds.size;
  },
  message: 'Duplicate modelIds detected. Each enabled participant must have a unique model.',
};
const ChatParticipantSchema = chatParticipantSelectSchema
  .extend({
    settings: ParticipantSettingsSchema,
  })
  .openapi('ChatParticipant');
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
const ChatThreadSchema = chatThreadSelectSchema
  .extend({
    metadata: z.object({
      tags: z.array(z.string()).optional(),
      summary: z.string().optional(),
    }).passthrough().nullable().optional(),
  })
  .openapi('ChatThread');
const ChatThreadChangelogSchema = chatThreadChangelogSelectSchema
  .openapi('ChatThreadChangelog');
const ChatCustomRoleSchema = chatCustomRoleSelectSchema
  .extend({
    metadata: z.object({
      tags: z.array(z.string()).optional(),
      category: z.string().optional(),
    }).passthrough().nullable().optional(),
  })
  .openapi('ChatCustomRole');
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
export const ThreadListQuerySchema = CursorPaginationQuerySchema.extend({
  search: z.string().optional().openapi({
    description: 'Search query to filter threads by title',
    example: 'product strategy',
  }),
}).openapi('ThreadListQuery');
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
export const DeleteThreadResponseSchema = createApiResponseSchema(z.object({
  deleted: z.boolean().openapi({ example: true }),
})).openapi('DeleteThreadResponse');
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
export const StreamChatRequestSchema = z.object({
  message: z.unknown().openapi({
    description: `**Last message in AI SDK UIMessage format** (validated at runtime via AI SDK)
**Validation Note:**
Schema validation occurs via AI SDK's \`validateUIMessages()\` at runtime, not at OpenAPI level.
This is required because \`UIMessage<METADATA, DATA, TOOLS>\` uses complex generic types that Zod cannot represent.
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
  id: z.string().min(1).openapi({
    description: 'Thread ID for persistence and participant loading (required)',
    example: 'thread_abc123',
  }),
  participantIndex: z.number().int().min(0).optional().default(0).openapi({
    description: 'Index of participant to stream (0-based). Frontend orchestrates multiple participants.',
    example: 0,
  }),
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
  regenerateRound: z.number().int().positive().optional().openapi({
    description: 'Round number to regenerate (replace). If provided, deletes old messages and analysis for that round first.',
    example: 2,
  }),
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
export const CreateCustomRoleRequestSchema = chatCustomRoleInsertSchema
  .pick({
    name: true,
    description: true,
    systemPrompt: true,
    metadata: true,
  })
  .openapi('CreateCustomRoleRequest');
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
const ChangelogListPayloadSchema = z.object({
  items: z.array(ChatThreadChangelogSchema),
  count: z.number().int().nonnegative(),
}).openapi('ChangelogListPayload');
export const ChangelogListResponseSchema = createApiResponseSchema(ChangelogListPayloadSchema).openapi('ChangelogListResponse');
export const CreateChangelogParamsSchema = z.object({
  threadId: CoreSchemas.id(),
  roundNumber: z.number().int().positive(),
  changeType: ChangelogTypeSchema,
  changeSummary: z.string().min(1).max(500),
  changeData: z.record(z.string(), z.unknown()).optional(),
}).openapi('CreateChangelogParams');
export type CreateChangelogParams = z.infer<typeof CreateChangelogParamsSchema>;
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
export const RoundtablePromptConfigSchema = z.object({
  mode: z.string(),
  currentParticipantIndex: z.number().int().nonnegative(),
  currentParticipant: ParticipantInfoSchema,
  allParticipants: z.array(ParticipantInfoSchema),
  customSystemPrompt: z.string().nullable().optional(),
}).openapi('RoundtablePromptConfig');
export type RoundtablePromptConfig = z.infer<typeof RoundtablePromptConfigSchema>;
export const ModeratorAnalysisRequestSchema = z.object({
  participantMessageIds: z.array(CoreSchemas.id()).optional().openapi({
    description: 'Array of message IDs from participants (optional - backend auto-queries from database if not provided)',
    example: ['msg_abc123', 'msg_def456', 'msg_ghi789'],
  }),
}).openapi('ModeratorAnalysisRequest');
export const SkillRatingSchema = z.object({
  skillName: z.string()
    .describe('Name of the skill being evaluated (e.g., "Creativity", "Technical Depth", "Clarity")'),
  rating: z.number().min(1).max(10).describe('Rating out of 10 for this specific skill'),
}).openapi('SkillRating');
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
export const AnalysisAcceptedPayloadSchema = z.object({
  analysisId: z.string().describe('ID of the analysis record being processed'),
  status: z.literal('processing').describe('Status indicating background processing has started'),
  message: z.string().optional().describe('Optional message about polling for completion'),
}).openapi('AnalysisAcceptedPayload');
export const AnalysisAcceptedResponseSchema = AnalysisAcceptedPayloadSchema.openapi('AnalysisAcceptedResponse');
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
// SIMPLIFIED CHANGELOG DATA SCHEMAS
// ============================================================================
// Consolidated from 5 separate schemas to 3 discriminated union types
// Each changeData includes a 'type' field for discrimination

const BaseChangeDataSchema = z.object({
  type: z.enum(['participant', 'participant_role', 'mode_change']),
});

export const ParticipantChangeDataSchema = BaseChangeDataSchema.extend({
  type: z.literal('participant'),
  modelId: z.string(),
  role: z.string().nullable().optional(),
  participantId: z.string().optional(),
});
export type ParticipantChangeData = z.infer<typeof ParticipantChangeDataSchema>;

export const ParticipantRoleChangeDataSchema = BaseChangeDataSchema.extend({
  type: z.literal('participant_role'),
  modelId: z.string(),
  oldRole: z.string().nullable().optional(),
  newRole: z.string().nullable().optional(),
  participantId: z.string().optional(),
});
export type ParticipantRoleChangeData = z.infer<typeof ParticipantRoleChangeDataSchema>;

export const ModeChangeDataSchema = BaseChangeDataSchema.extend({
  type: z.literal('mode_change'),
  oldMode: z.string(),
  newMode: z.string(),
});
export type ModeChangeData = z.infer<typeof ModeChangeDataSchema>;

// Discriminated union for all change data types
export const ChangeDataSchema = z.discriminatedUnion('type', [
  ParticipantChangeDataSchema,
  ParticipantRoleChangeDataSchema,
  ModeChangeDataSchema,
]);
export type ChangeData = z.infer<typeof ChangeDataSchema>;
export type ChatThreadChangelog = z.infer<typeof ChatThreadChangelogSchema>;
export type ParticipantAnalysis = z.infer<typeof ParticipantAnalysisSchema>;
export type LeaderboardEntry = z.infer<typeof LeaderboardEntrySchema>;
export type ModeratorAnalysisRequest = z.infer<typeof ModeratorAnalysisRequestSchema>;
export type ModeratorAnalysisPayload = z.infer<typeof ModeratorAnalysisPayloadSchema>;
export type StoredModeratorAnalysis = z.infer<typeof StoredModeratorAnalysisSchema>;
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
export const RoundFeedbackRequestSchema = chatRoundFeedbackUpdateSchema
  .pick({
    feedbackType: true,
  })
  .openapi('RoundFeedbackRequest');
export type RoundFeedbackRequest = z.infer<typeof RoundFeedbackRequestSchema>;
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
export const SetRoundFeedbackResponseSchema = createApiResponseSchema(
  ChatRoundFeedbackSchema,
).openapi('SetRoundFeedbackResponse');
export const GetThreadFeedbackResponseSchema = createApiResponseSchema(
  z.array(ChatRoundFeedbackSchema),
).openapi('GetThreadFeedbackResponse');
